/**
 * MODEL: Rolling friction of a roller — XI-PHY-ACT-A4
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 4.
 * F = μr·R, with μr one to two orders of magnitude smaller than sliding friction.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A4',
  formula: 'F = μr·R',
  unitSystem: 'Newton',
  assumptions: ['The roller rolls without slipping', 'The surface is rigid and does not deform under the roller'],
  validRange: 'Normal reaction up to about 4 N',
  edgeCases: ['Rolling friction is far smaller than sliding friction for the same pair of surfaces'],
  expectedBehaviour: ['F is proportional to R, a line through the origin', 'μr is smaller on glass than on wood or rubber'],
};

export const G = 9.792;
export const SURFACES = { glass: { label: 'Glass', mu: 0.0021 }, wood: { label: 'Wood', mu: 0.0048 }, rubber: { label: 'Rubber mat', mu: 0.0095 } };
export const ROLLERS = { r2: { label: 'Roller (small)', massG: 80 }, r3: { label: 'Roller (medium)', massG: 140 }, r5: { label: 'Roller (large)', massG: 220 } };

export const defaults = { panG: 0, loadG: 0, surface: 'wood', roller: 'r3', weights: 'fine' };

export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.wood; }
export function rollerOf(inputs) { return ROLLERS[inputs.roller] || ROLLERS.r3; }
export function normalReactionN(inputs) { return ((rollerOf(inputs).massG + inputs.loadG) / 1000) * G; }
export function rollingFrictionN(inputs) { return surfaceOf(inputs).mu * normalReactionN(inputs); }
export function panForceN(inputs) { return (inputs.panG / 1000) * G; }
export function rolling(inputs) { return panForceN(inputs) >= rollingFrictionN(inputs) * 0.9 && panForceN(inputs) <= rollingFrictionN(inputs) * 1.4; }

export function validate(inputs) {
  const warnings = [];
  if (!rolling(inputs)) warnings.push({ field: 'panG', code: 'NOT_ROLLING', message: 'The pan load is not close to the rolling-friction value.', why: 'Rolling friction is tiny; add fine weights slowly until the roller just begins to move steadily.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!rolling(inputs)) return null;
  const rng = makeRng(seed + trial * 113);
  const R = normalReactionN(inputs);
  const F = Number((rollingFrictionN(inputs) + jitter(rng, rollingFrictionN(inputs) * 0.05)).toFixed(4));
  return { trial, loadG: inputs.loadG, totalMassG: rollerOf(inputs).massG + inputs.loadG, normalReaction: sigFig(R, 4), panG: inputs.panG, rollingFriction: F, ratio: sigFig(F / R, 5) };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.normalReaction), y: Number(r.rollingFriction) }));
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  return { ok: true, muRolling: sigFig(fit.slope, 4), rollingResistanceCm: sigFig(fit.slope * 3, 4), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, SURFACES, ROLLERS, G, init, step, measure, derive, validate, surfaceOf, rollerOf, normalReactionN, rollingFrictionN, panForceN, rolling };
