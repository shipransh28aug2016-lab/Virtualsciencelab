/**
 * balance.js — a laboratory balance, and everything that makes its display
 * something other than the mass on the pan. Pure: no React, no three, no store,
 * no clock — time is the `dt` it is stepped with, and noise is a function of
 * the seed and the time, so a session replays exactly.
 *
 * ELECTRONIC. A load cell reads a FORCE, so what the display shows is
 *
 *   span · cosθ · Σ m·(1 − ρ_air/ρ)/(1 − ρ_air/ρ_cal)      the load, with buoyancy
 *   − convection        a warm object sets up an air current that lifts it
 *   + drift             the zero wanders for the first hour, as the electronics warm
 *   + air currents      slow wander, unless a draft shield is closed
 *   + noise             the last digit, as the repeatability says
 *   + shock             what a dropped object does for a second or so
 *
 * through a critically damped response (that is why it takes seconds to settle),
 * rounded to the readability and with the tare taken off. The span is the
 * instrument's own error until it is calibrated against a certified weight; θ is
 * the tilt of the bench; ρ_cal = 8 g/cm³ is the density of the steel weights the
 * span was set with — so a salt (2.16) reads 0.05 % low and a coin (8.9)
 * a hair high, and on an analytical balance both are visible.
 *
 * Hygroscopic samples gain mass while they are exposed to the air; hot ones lose
 * their heat to the room with τ ≈ 10 min.
 */
import { mulberry32, gaussian } from '../numerics.js';

export const RHO_AIR = 1.2e-3;            // g/cm³, 20–25 °C and sea level
export const RHO_CAL = 8.0;               // g/cm³, the calibration weights
export const TAU_COOL = 600;              // s, a 100 g glass object coming to the room
/** The factor by which a balance calibrated with steel reads a mass of density ρ. */
export const buoyancy = (rho) => (1 - RHO_AIR / rho) / (1 - RHO_AIR / RHO_CAL);

/** Convection error per kelvin of warmth, for a 100 g object (g/K); scales as √m. */
export const CONVECTION = 1.5e-4;

export const BALANCES = {
  top2: { id: 'top2', kind: 'electronic', label: 'Top-pan balance, 0.01 g', d: 0.01, decimals: 2, cap: 600, sd: 0.35, air: 0.35, shield: false, omega: 7, warmTau: 420, drift0: 4, calErr0: 3.5e-4, tilt0: 0.6 },
  top3: { id: 'top3', kind: 'electronic', label: 'Precision balance, 0.001 g', d: 0.001, decimals: 3, cap: 220, sd: 0.5, air: 0.9, shield: true, omega: 4.5, warmTau: 600, drift0: 12, calErr0: -2.2e-4, tilt0: 0.8 },
  ana4: { id: 'ana4', kind: 'electronic', label: 'Analytical balance, 0.0001 g', d: 1e-4, decimals: 4, cap: 120, sd: 0.6, air: 2.5, shield: true, omega: 3.5, warmTau: 900, drift0: 30, calErr0: 1.3e-4, tilt0: 0.7 },
};

const noiseAt = (seed, k) => gaussian(mulberry32((seed * 100003 + k) >>> 0));

/** A balance as it is found: switched on `onFor` seconds ago, uncalibrated, not quite level. */
export function newBalance(kind, { seed = 7, onFor = 180 } = {}) {
  const sp = BALANCES[kind];
  const b = {
    kind, seed, t: onFor, clock: 0, acc: 0, y: 0, v: 0, tareG: 0, calErr: sp.calErr0, tilt: sp.tilt0, shield: sp.shield ? 'open' : 'none',
    shockAt: -1e9, shockG: 0, hist: [], calibrations: 0, lastCal: null,
  };
  b.y = rawSignal(b, []);
  return b;
}

/** The slow wander of the air in the room, as three sinusoids with seeded phases. */
const airAt = (b, sp) => {
  const f = sp.shield ? (b.shield === 'closed' ? 0.06 : 1) : 1;
  const p = (j) => (((b.seed * 2654435761 + j * 40503) >>> 0) / 4294967296) * 2 * Math.PI;
  const t = b.clock;
  return sp.air * sp.d * f * (0.5 * Math.sin(2 * Math.PI * 0.23 * t + p(1)) + 0.35 * Math.sin(2 * Math.PI * 0.071 * t + p(2)) + 0.25 * Math.sin(2 * Math.PI * 0.51 * t + p(3)));
};

/** What the load cell is being told, in grams, before the response and the rounding. */
export function rawSignal(b, items) {
  const sp = BALANCES[b.kind];
  let load = 0; let lift = 0;
  for (const it of items) {
    load += it.m * buoyancy(it.rho);
    lift += (it.dT ?? 0) * CONVECTION * Math.sqrt(Math.max(it.m, 0) / 100);
  }
  const cos = Math.cos((b.tilt * Math.PI) / 180);
  const drift = sp.drift0 * sp.d * Math.exp(-b.t / sp.warmTau);
  const elec = sp.sd * sp.d * noiseAt(b.seed, Math.floor(b.clock * 10));
  const dtShock = b.clock - b.shockAt;
  const shock = dtShock >= 0 && dtShock < 20 ? b.shockG * Math.exp(-dtShock / 1.2) * Math.cos(2 * Math.PI * 0.9 * dtShock) : 0;
  return (1 + b.calErr) * cos * load - lift + drift + airAt(b, sp) + elec + shock;
}

/** Advance the balance by `dt` seconds with `items` on the pan. */
export function stepBalance(b0, items, dt) {
  const sp = BALANCES[b0.kind];
  const b = { ...b0, hist: b0.hist.slice() };
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, 0.02); left -= h;
    b.t += h; b.clock += h;
    const raw = rawSignal(b, items);
    const w = sp.omega;
    b.v += (w * w * (raw - b.y) - 2 * w * b.v) * h;
    b.y += b.v * h;
    b.acc += h;
    if (b.acc >= 0.1) { b.acc -= 0.1; b.hist.push(b.y); if (b.hist.length > 12) b.hist.shift(); }
  }
  return b;
}

/** Let what is on the pan change: hygroscopic samples take up water, warm ones cool. */
export function stepItems(items, dt) {
  return items.map((it) => {
    let { m, gain = 0, dT = 0 } = it;
    if (it.hygro && it.exposed !== false) {
      const dm = it.hygro.rate * dt * Math.max(0, 1 - gain / it.hygro.cap);
      m += dm; gain += dm;
    }
    if (dT) dT *= Math.exp(-dt / TAU_COOL);
    return m === it.m && dT === (it.dT ?? 0) ? it : { ...it, m, gain, dT };
  });
}

/** Is the display steady enough to be read? The way a balance decides to light its asterisk. */
export function isStable(b) {
  const sp = BALANCES[b.kind];
  if (b.hist.length < 10) return false;
  const last = b.hist.slice(-10);
  return Math.max(...last) - Math.min(...last) < 1.0 * sp.d;
}

/** The display: the reading rounded to the readability, with the tare off. */
export function readout(b) {
  const sp = BALANCES[b.kind];
  const over = b.y > sp.cap + 0.5 * sp.d;
  const net = b.y - b.tareG;
  const counts = Math.round(net / sp.d);
  const value = counts === 0 ? 0 : Number((counts * sp.d).toFixed(sp.decimals));
  return {
    value, counts, over, stable: isStable(b), text: over ? '-OL-' : value.toFixed(sp.decimals), unit: 'g', decimals: sp.decimals, d: sp.d,
    gross: b.y,
  };
}

/** TARE: the display is zeroed at whatever the balance is reading NOW, steady or not. */
export const tare = (b) => ({ ...b, tareG: b.y });
export const zeroTare = (b) => ({ ...b, tareG: 0 });
export const setTilt = (b, deg) => ({ ...b, tilt: deg });
export const setShield = (b, state) => (BALANCES[b.kind].shield ? { ...b, shield: state } : b);

/** A dropped object: a transient that rings for a second or so. `severity` is the fraction of its weight. */
export const shock = (b, massG, severity) => ({ ...b, shockAt: b.clock, shockG: massG * severity });

/**
 * External calibration with a certified weight on the pan. The span is set so
 * that the weight reads what it is — to what the instrument's own resolution
 * and the noise allow. Refused if the balance is not ready to be calibrated.
 */
export function calibrate(b, { weightG, items }) {
  const sp = BALANCES[b.kind];
  if (items.length !== 1 || items[0].id !== 'calweight') return { b, ok: false, why: 'The certified weight must be the only thing on the pan.' };
  if (b.tilt > 0.15) return { b, ok: false, why: 'Level the balance first: it is out of level by more than 0.15°.' };
  if (b.shield === 'open') return { b, ok: false, why: 'Close the draft shield.' };
  if (b.t < 300) return { b, ok: false, why: 'Let the balance warm up for five minutes first.' };
  if (b.tareG !== 0) return { b, ok: false, why: 'Zero the balance first with nothing on the pan (calibration is of the span, from zero).' };
  /* The span is set so that the weight reads what it is — steel, so buoyancy cancels — to what the noise allows. */
  const residual = (noiseAt(b.seed + 91, b.calibrations) * sp.sd * sp.d) / Math.max(weightG, 1);
  return { b: { ...b, calErr: residual, calibrations: b.calibrations + 1, lastCal: b.clock }, ok: true, why: '' };
}
