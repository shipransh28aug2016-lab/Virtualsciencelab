/**
 * MODEL: Limiting friction and normal reaction — XI-PHY-A09
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 9.
 * F_limiting = μs·R, R = (M+m)g. A pan is loaded until the block just slips;
 * that pan load, converted to a force, is the limiting friction for the
 * normal reaction set by the block's own weight plus any load on it.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A09',
  formula: 'F = μs·R, R = (M+m)g',
  unitSystem: 'Mass in gram, force in newton',
  assumptions: ['The table surface is uniform', 'The string over the pulley is light and the pulley frictionless', 'The block is on the point of sliding, not already sliding'],
  validRange: 'Normal reaction 1-7 N',
  edgeCases: ['Too little pan load never overcomes static friction', 'A lubricated surface gives a much smaller μ'],
  expectedBehaviour: ['F is directly proportional to R — a straight line through the origin', 'μ is unchanged when the block rests on its narrow face'],
};

export const G = 9.792;
export const SURFACES = { woodWood: { label: 'Wood on wood', mu: 0.42 }, woodGlass: { label: 'Wood on glass', mu: 0.28 }, woodMetal: { label: 'Wood on metal', mu: 0.35 }, lubricated: { label: 'Lubricated wood', mu: 0.12 } };

export const defaults = { loadG: 0, panG: 0, surface: 'woodWood', face: 'broad', blockMassG: 200 };

export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.woodWood; }
export function normalReactionN(inputs) { return ((inputs.blockMassG + inputs.loadG) / 1000) * G; }
export function limitingFrictionN(inputs) { return surfaceOf(inputs).mu * normalReactionN(inputs); }
export function panForceN(inputs) { return (inputs.panG / 1000) * G; }
export function slipping(inputs) { return panForceN(inputs) >= limitingFrictionN(inputs); }

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!slipping(inputs)) {
    warnings.push({ field: 'panG', code: 'NOT_SLIPPING', message: 'The block has not yet started to slip.', why: 'Static friction balances any pan load up to the limiting value; add weights to the pan until the block just begins to slide.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!slipping(inputs)) return null;
  const rng = makeRng(seed + trial * 67);
  const R = normalReactionN(inputs);
  const trueF = limitingFrictionN(inputs);
  const F = Number((trueF + jitter(rng, trueF * 0.03)).toFixed(3));
  return { trial, loadG: inputs.loadG, totalMassG: inputs.blockMassG + inputs.loadG, normalReaction: sigFig(R, 4), panG: inputs.panG, limitingFriction: F, ratio: sigFig(F / R, 3), face: inputs.face };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.normalReaction), y: Number(r.limitingFriction) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the limiting friction for at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  if (!fit) return { ok: false, reason: 'Vary the load between readings.' };
  const faces = new Set(rows.map((r) => r.face));
  return {
    ok: true, mu: sigFig(fit.slope, 3), angleOfFriction: sigFig((Math.atan(fit.slope) * 180) / Math.PI, 4),
    r2: Number(fit.r2.toFixed(4)), facesCompared: faces.size, n: pts.length, points: pts,
  };
}

export default { meta, defaults, SURFACES, G, init, step, measure, derive, validate, surfaceOf, normalReactionN, limitingFrictionN, panForceN, slipping };
