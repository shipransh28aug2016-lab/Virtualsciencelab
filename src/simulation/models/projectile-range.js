/**
 * MODEL: Range of a projectile against angle of projection — XI-PHY-ACT-A5
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 5.
 * R = u² sin(2θ)/g; time of flight = 2u sinθ/g; range maximises at 45°.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A5',
  formula: 'R = u²sin(2θ)/g; T = 2u sinθ/g; H = u²sin²θ/2g',
  unitSystem: 'SI: metre, second, degree',
  assumptions: ['Air resistance is negligible for the light ball used', 'The launcher gives the same launch speed each time', 'Launch and landing are at the same height'],
  validRange: 'Angle 5°-85°',
  edgeCases: ['A launch angle of 0° or 90° gives zero range', 'Complementary angles (θ and 90°−θ) give equal ranges'],
  expectedBehaviour: ['Range is maximum at 45°', 'The launch speed recovered from any shot is the same, since the spring setting is unchanged'],
};

export const G = 9.792;
export const LAUNCHERS = { soft: { label: 'Soft spring', speed: 4.0 }, medium: { label: 'Medium spring', speed: 6.0 }, strong: { label: 'Strong spring', speed: 8.2 } };

export const defaults = { angleDeg: 45, launcher: 'medium', mount: 'ground' };

export function launcherOf(inputs) { return LAUNCHERS[inputs.launcher] || LAUNCHERS.medium; }
export function rangeM(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  return (u * u * Math.sin(2 * th)) / G;
}
export function timeOfFlight(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  return (2 * u * Math.sin(th)) / G;
}
export function maxHeightM(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  return (u * u * Math.sin(th) ** 2) / (2 * G);
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 127);
  const trueR = rangeM(inputs);
  const R = Number((trueR + jitter(rng, 0.06)).toFixed(3));
  const th = (inputs.angleDeg * Math.PI) / 180;
  return { trial, angleDeg: inputs.angleDeg, sin2Theta: sigFig(Math.sin(2 * th), 4), rangeM: R, timeOfFlight: sigFig(timeOfFlight(inputs), 4), maxHeightM: sigFig(maxHeightM(inputs), 4) };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Record the range for at least four angles.' };
  const best = rows.reduce((a, b) => (Number(a.rangeM) >= Number(b.rangeM) ? a : b));
  // Recover launch speed from each shot, using R = u² sin(2θ)/g.
  const speeds = rows.map((r) => Math.sqrt((Number(r.rangeM) * G) / Math.sin((2 * Number(r.angleDeg) * Math.PI) / 180))).filter(Number.isFinite);
  const meanSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return { ok: true, bestAngle: Number(best.angleDeg), launchSpeed: sigFig(meanSpeed, 4), optimumAngle: 45, n: rows.length, points: rows.map((r) => ({ x: Number(r.angleDeg), y: Number(r.rangeM) })) };
}

export default { meta, defaults, LAUNCHERS, G, init, step, measure, derive, validate, launcherOf, rangeM, timeOfFlight, maxHeightM };
