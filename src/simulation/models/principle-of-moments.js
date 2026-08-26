/**
 * MODEL: Mass by the principle of moments — XI-PHY-ACT-A2
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 2.
 * At balance: m·g·d1 = M·g·d2, so m = M·d2/d1.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A2',
  formula: 'm·d1 = M·d2  →  m = M·d2/d1',
  unitSystem: 'Gram and centimetre',
  assumptions: ['The metre scale balances at its own centre of gravity when unloaded', 'The knife edge is frictionless', 'Both masses hang vertically from the scale'],
  validRange: 'd1 2-48 cm from the pivot, d2 2-48 cm',
  edgeCases: ['Moving the known mass without finding balance gives no reading'],
  expectedBehaviour: ['The same mass m is recovered whatever known mass and distances are used'],
};

export const BODIES = { b1: { label: 'Body P', trueG: 74.5 }, b2: { label: 'Body Q', trueG: 42.0 }, b3: { label: 'Body R', trueG: 110.0 } };
export const KNOWNS = { m20: 20, m50: 50, m100: 100 };

export const defaults = { body: 'b1', known: 'm50', unknownPosCm: 20, knownPosCm: 80, knifeEdgeCm: 50 };

export function bodyOf(inputs) { return BODIES[inputs.body] || BODIES.b1; }
export function knownG(inputs) { return KNOWNS[inputs.known] || KNOWNS.m50; }
export function d1(inputs) { return Math.abs(inputs.knifeEdgeCm - inputs.unknownPosCm); }
export function d2(inputs) { return Math.abs(inputs.knownPosCm - inputs.knifeEdgeCm); }

/** The known-mass position at which the scale would actually balance. */
export function balancedKnownPosCm(inputs) {
  const need = (bodyOf(inputs).trueG * d1(inputs)) / knownG(inputs);
  return inputs.unknownPosCm < inputs.knifeEdgeCm ? inputs.knifeEdgeCm + need : inputs.knifeEdgeCm - need;
}
export function balanced(inputs) { return Math.abs(inputs.knownPosCm - balancedKnownPosCm(inputs)) <= 1.0; }

export function validate(inputs) {
  const warnings = [];
  if (!balanced(inputs)) warnings.push({ field: 'knownPosCm', code: 'NOT_BALANCED', message: 'The scale is not yet balanced.', why: 'Slide the known mass until the metre scale is horizontal on the knife edge.', fix: 'Adjust the known mass position.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!balanced(inputs)) return null;
  const rng = makeRng(seed + trial * 109);
  const D1 = d1(inputs) + jitter(rng, 0.1);
  const D2 = d2(inputs) + jitter(rng, 0.1);
  const K = knownG(inputs);
  return { trial, knownMassG: K, d1: Number(D1.toFixed(2)), d2: Number(D2.toFixed(2)), momentUnknown: sigFig(D1, 4), momentKnown: sigFig(K * D2, 4), mass: sigFig((K * D2) / D1, 4) };
}

export function derive(rows) {
  const vals = rows.map((r) => Number(r.mass)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Balance the scale for at least three different settings.' };
  return { ok: true, mass: sigFig(mean(vals), 4), meanD1: sigFig(mean(rows.map((r) => Number(r.d1))), 4), meanD2: sigFig(mean(rows.map((r) => Number(r.d2))), 4), n: vals.length, points: rows.map((r) => ({ x: Number(r.d1), y: Number(r.d2) })) };
}

export default { meta, defaults, BODIES, KNOWNS, init, step, measure, derive, validate, bodyOf, knownG, d1, d2, balanced };
