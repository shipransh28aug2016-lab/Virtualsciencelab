/**
 * beam.js — a mechanical triple-beam balance. Pure.
 *
 * Three beams carry sliding riders: hundreds of grams in notches (0–500), tens in
 * notches (0–100), and units on a fine beam (0–10 g, graduated to 0.1 g and read
 * to 0.05). The pointer at the end of the beam swings to a deflection
 *
 *     θ* = sensitivity × (load − Σ riders + zero error)
 *
 * and comes to rest there through damped oscillation — a mechanical balance
 * takes seconds to stop, and one that has not stopped is not at zero. The
 * student finds the mass by sliding riders until the pointer rests on the
 * zero mark. Buoyancy acts on it exactly as on the electronic one (the riders
 * are brass, ρ = 8.4).
 *
 * The zero error is real: an empty balance with every rider at zero is rarely
 * at zero until the adjusting screw has been turned.
 */
import { clamp } from '../numerics.js';
import { RHO_AIR } from './balance.js';

export const BEAM = {
  cap: 610, sens: 14, zeroBand: 0.2, omega0: 3.1, zeta: 0.4, estimate: 0.05,
  hundreds: [0, 100, 200, 300, 400, 500], tens: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], unitsMax: 10, rho: 8.4,
};
const buoy = (rho) => (1 - RHO_AIR / rho) / (1 - RHO_AIR / BEAM.rho);

export const newBeam = ({ zeroErr = 0.07 } = {}) => ({ theta: 0, w: 0, r: { h: 0, t: 0, u: 0 }, zeroErr, adjust: 0 });

export const riderTotal = (bm) => bm.r.h + bm.r.t + bm.r.u;
export const setRider = (bm, beam, value) => {
  const v = beam === 'h' ? BEAM.hundreds.reduce((a, n) => (Math.abs(n - value) < Math.abs(a - value) ? n : a), 0)
    : beam === 't' ? BEAM.tens.reduce((a, n) => (Math.abs(n - value) < Math.abs(a - value) ? n : a), 0)
      : clamp(Math.round(value * 100) / 100, 0, BEAM.unitsMax);
  return { ...bm, r: { ...bm.r, [beam]: v } };
};
/** The adjusting screw at the end of the beam: it cancels the zero error, when it is turned far enough. */
export const setZeroScrew = (bm, g) => ({ ...bm, adjust: clamp(g, -0.3, 0.3) });

/** Where the pointer is being pulled to, in degrees, for a pan load in grams (true mass, apparent through the air). */
export function target(bm, items) {
  const load = items.reduce((a, it) => a + it.m * buoy(it.rho), 0);
  return clamp(BEAM.sens * (load - riderTotal(bm) + bm.zeroErr + bm.adjust), -9, 9);
}

export function stepBeam(b0, items, dt) {
  let { theta, w } = b0;
  const th = target(b0, items);
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, 0.02); left -= h;
    w += (-(BEAM.omega0 ** 2) * (theta - th) - 2 * BEAM.zeta * BEAM.omega0 * w) * h;
    theta += w * h;
  }
  return { ...b0, theta, w };
}

/** The pointer is on the zero mark and has stopped. */
export const atRest = (bm) => Math.abs(bm.theta) < BEAM.zeroBand && Math.abs(bm.w) < 0.35;

/** What the student reads off the beams: the riders, to the half-division they can estimate. */
export function beamReading(bm) {
  const R = riderTotal(bm);
  return { value: Math.round(R / BEAM.estimate) * BEAM.estimate, riders: R, atRest: atRest(bm) };
}
