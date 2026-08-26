/**
 * MODEL: Downward force along an inclined plane — XI-PHY-A10
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 10.
 * At equilibrium F = W sinθ (roller); for a sliding block, F = W(sinθ + μcosθ).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A10',
  formula: 'F = W sinθ (rolling); F = W(sinθ + μ cosθ) (sliding)',
  unitSystem: 'Angle in degree, force in gram-weight and newton',
  assumptions: ['The roller rolls without slipping, so rolling friction is negligible', 'The string runs parallel to the inclined surface', 'The pulley at the top is frictionless'],
  validRange: 'Angle 5°-60°',
  edgeCases: ['At θ = 0 no force is needed to hold the roller', 'A sliding block needs an extra μW cosθ term, which shows as a positive intercept'],
  expectedBehaviour: ['F is proportional to sinθ for a rolling body, a line through the origin', 'A sliding block gives a line offset above the origin'],
};

export const G = 9.792;
export const ROLLERS = { r250: { label: 'Roller (250 gwt)', weightGwt: 250, mu: 0 }, r400: { label: 'Roller (400 gwt)', weightGwt: 400, mu: 0 }, r150: { label: 'Roller (150 gwt)', weightGwt: 150, mu: 0 } };
export const BLOCK = { label: 'Sliding block', weightGwt: 250, mu: 0.3 };

export const defaults = { angleDeg: 30, panGwt: 0, roller: 'r250', body: 'roller' };

export function bodyOf(inputs) { return inputs.body === 'block' ? BLOCK : (ROLLERS[inputs.roller] || ROLLERS.r250); }
export function sinTheta(inputs) { return Math.sin((inputs.angleDeg * Math.PI) / 180); }
export function cosTheta(inputs) { return Math.cos((inputs.angleDeg * Math.PI) / 180); }

export function requiredForceGwt(inputs) {
  const b = bodyOf(inputs);
  return inputs.body === 'block'
    ? b.weightGwt * (sinTheta(inputs) + b.mu * cosTheta(inputs))
    : b.weightGwt * sinTheta(inputs);
}

export function balanced(inputs) {
  const need = requiredForceGwt(inputs);
  return Math.abs(inputs.panGwt - need) <= Math.max(2, need * 0.03);
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!balanced(inputs)) warnings.push({ field: 'panGwt', code: 'NOT_BALANCED', message: 'The body is not yet in equilibrium on the plane.', why: 'Adjust the pan load until the roller (or block) is on the point of moving either way.' });
  if (inputs.body === 'block') warnings.push({ field: 'body', code: 'SLIDING_FRICTION', message: 'A sliding block needs an extra force to overcome friction.', why: 'F = W(sinθ + μcosθ), so the F-sinθ graph no longer passes through the origin — the intercept is μW.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!balanced(inputs)) return null;
  const rng = makeRng(seed + trial * 71);
  const trueF = requiredForceGwt(inputs);
  const F = Number((trueF + jitter(rng, Math.max(1, trueF * 0.02))).toFixed(1));
  return { trial, angleDeg: inputs.angleDeg, sinTheta: Number(sinTheta(inputs).toFixed(4)), panGwt: F, forceN: sigFig((F / 1000) * G, 4), body: inputs.body };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.sinTheta), y: Number(r.panGwt) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the balancing force for at least four different angles.' };
  const through = fitThroughOrigin(pts);
  const isBlock = rows[0].body === 'block';
  return {
    ok: true, weightGwt: sigFig(through.slope, 4), weightN: sigFig((through.slope / 1000) * G, 4),
    r2: Number(through.r2.toFixed(4)), body: rows[0].body, sliding: isBlock, n: pts.length, points: pts,
  };
}

export default { meta, defaults, ROLLERS, BLOCK, G, init, step, measure, derive, validate, bodyOf, sinTheta, requiredForceGwt, balanced };
