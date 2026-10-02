/**
 * The glass-electrode pH meter — a measuring instrument, with the faults a real
 * one has.
 *
 * A glass electrode produces a potential that is, ideally, linear in pH:
 *
 *      E = E_asym + S (7 − pH)         S = η · 2.303 R T / F  =  η × 59.16 mV (25 °C)
 *
 * and a meter's job is to convert that back to pH using constants it learned by
 * measuring buffers of known pH — CALIBRATION. That is the whole of what is
 * going on, and every way a student gets a wrong pH from a perfectly good
 * instrument is a way of getting one of those wrong:
 *
 *   · uncalibrated, the meter uses the factory defaults and an electrode with an
 *     asymmetry potential reads wrong by a tenth or two everywhere;
 *   · calibrated at one point it is right at that point and wrong elsewhere by
 *     however much the slope efficiency η differs from the ideal;
 *   · two points fix both, and the slope it finds (as a % of Nernstian) is the
 *     electrode's health — below about 92% it needs replacing;
 *   · the glass responds to Na⁺ as well as H⁺, so in strong base it reads LOW
 *     (the alkaline error), and the more sodium the worse;
 *   · it takes seconds to settle, and a reading taken before it does is wrong;
 *   · an electrode that is not rinsed carries a film of the last solution into
 *     the next — negligible in a buffer, ruinous in pure water.
 */
import { nernstSlope_mV } from './constants.js';
import { mulberry32, gaussian, clamp } from '../numerics.js';

/** The potentiometric selectivity of the glass for Na⁺ over H⁺. 10⁻¹² is a
 *  good general-purpose electrode: at pH 13 in 0.1 M NaOH it reads about 0.25 low. */
export const K_NA = 1e-12;

/** One physical electrode. Seeded, so a given electrode has its own faults and
 *  keeps them: asymmetry potential, slope efficiency, and speed. */
export function makeElectrode({ seed = 1, aged = false } = {}) {
  const rng = mulberry32(seed);
  return {
    asymmetry_mV: gaussian(rng) * 8,                       // typically a few mV, rarely tens
    efficiency: aged ? 0.90 + 0.02 * rng() : 0.975 + 0.02 * rng(),
    tau_s: 3.0 + 3.0 * rng(),                              // response time constant
    noise_mV: 0.15,
  };
}

/** Pure physics: the potential this electrode produces in a solution of pH
 *  `pH` containing sodium at activity aNa, at temperature tC. */
export function electrodePotential(el, { pH, aNa = 0, tC = 25 }) {
  const aH = 10 ** -pH;
  const apparent = pH - Math.log10(1 + (K_NA * aNa) / aH);          // the alkaline error
  return el.asymmetry_mV + el.efficiency * nernstSlope_mV(tC) * (7 - apparent);
}

/** A meter in its factory state: ideal Nernst slope, no offset. */
export const factoryMeter = () => ({ offset_mV: 0, slopeFraction: 1, points: [], calibrated: false });

/**
 * Calibrate against buffers. `points` are { E_mV, pH } pairs measured in
 * standards of known pH at the temperature of the day. One point fixes the
 * offset and assumes the ideal slope; two or more fit both by least squares.
 * Returns the meter plus the electrode health a real meter reports.
 */
export function calibrate(points, tC = 25) {
  const S = nernstSlope_mV(tC);
  if (points.length === 1) {
    const p = points[0];
    return { offset_mV: p.E_mV - S * (7 - p.pH), slopeFraction: 1, points, calibrated: true };
  }
  const n = points.length;
  const xs = points.map((p) => 7 - p.pH);
  const sx = xs.reduce((a, b) => a + b, 0); const sy = points.reduce((a, p) => a + p.E_mV, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0); const sxy = xs.reduce((a, x, i) => a + x * points[i].E_mV, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  return { offset_mV: intercept, slopeFraction: slope / S, points, calibrated: true };
}

/** What the meter displays for a given electrode potential. */
export function displayPH(meter, E_mV, tC = 25) {
  const S = nernstSlope_mV(tC) * meter.slopeFraction;
  return 7 - (E_mV - meter.offset_mV) / S;
}

/**
 * One tick of the electrode settling towards the potential its solution
 * demands. First order, with the electrode's own time constant, plus the noise
 * of a real input stage. Returns the new potential.
 */
export function settle(el, E_now, E_target, dt, rng) {
  const k = 1 - Math.exp(-dt / el.tau_s);
  return E_now + (E_target - E_now) * k + (rng ? gaussian(rng) * el.noise_mV * Math.sqrt(dt) : 0);
}

/** "Stable" the way a meter decides: the potential has stopped moving. */
export const isStable = (dE_mV_per_s) => Math.abs(dE_mV_per_s) < 0.05;

/** Electrode health as a real meter reports it: slope as a percentage of ideal. */
export const slopePercent = (meter) => clamp(meter.slopeFraction * 100, 0, 110);
