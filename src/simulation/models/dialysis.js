/**
 * MODEL: Dialysis of a sol — XII-CHE-A02
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section A, Experiment 2.
 * First-order removal of the small electrolyte ions through the membrane:
 * C(t) = C0 e^(−t/τ).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig, percentError } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-A02',
  formula: 'C(t) = C0·e^(−t/τ); ln C linear in t, slope −1/τ',
  unitSystem: 'Millimole per litre; minutes',
  assumptions: ['The membrane passes small ions freely but retains the colloidal particles', 'The outer water is well stirred (or changed), keeping its concentration low'],
  validRange: 'Time 0-180 min',
  edgeCases: ['A torn membrane lets the colloid itself through, ruining the sol', 'If the outer water is never changed the concentration difference collapses and dialysis stalls, never reaching zero'],
  expectedBehaviour: ['The inside concentration falls exponentially with a fixed time constant', 'Stirring and frequently changing the outer water speed the process; standing water without changes causes it to plateau'],
};

export const MEMBRANES = { parchment: { label: 'Parchment paper', tau: 30 }, cellophane: { label: 'Cellophane', tau: 45 }, torn: { label: 'Torn membrane (faulty)', tau: 8, leaksColloid: true } };
export const WATER_REGIMES = { flowing: { label: 'Running water', factor: 0.7 }, changed: { label: 'Changed periodically', factor: 1.0 }, standing: { label: 'Standing, never changed', factor: null } };
export const SCALES = { c01: 0.1, c005: 0.05, c002: 0.02 };

export const defaults = { timeMin: 20, membrane: 'parchment', water: 'changed', bag: 'medium', stirred: true, temperatureC: 25, scale: 'c005' };

export const C0 = 20; // mM, initial electrolyte concentration inside the bag

export function membraneOf(inputs) { return MEMBRANES[inputs.membrane] || MEMBRANES.parchment; }
export function effectiveTau(inputs) {
  const m = membraneOf(inputs);
  const stirFactor = inputs.stirred ? 0.85 : 1.15;
  const tempFactor = 1 - (inputs.temperatureC - 25) * 0.01;
  const bagFactor = { small: 0.8, medium: 1.0, large: 1.3 }[inputs.bag] || 1.0;
  return m.tau * stirFactor * tempFactor * bagFactor;
}
export function plateauMm(inputs) {
  const regime = WATER_REGIMES[inputs.water] || WATER_REGIMES.changed;
  return regime.factor === null ? C0 * 0.35 : 0; // standing water: dialysis stalls at a residual plateau
}
export function concentrationAt(inputs, t) {
  const tau = effectiveTau(inputs);
  const plateau = plateauMm(inputs);
  return plateau + (C0 - plateau) * Math.exp(-t / tau);
}

export function validate(inputs) {
  const warnings = [];
  const m = membraneOf(inputs);
  if (m.leaksColloid) warnings.push({ field: 'membrane', code: 'TORN_MEMBRANE', message: 'A torn membrane lets the colloid itself pass through.', why: 'Dialysis relies on the membrane retaining the (large) colloidal particles while letting the (small) ions pass. A tear defeats the whole purpose — the sol is lost, not purified.', fix: 'Use an intact membrane.' });
  if (inputs.water === 'standing') warnings.push({ field: 'water', code: 'STANDING_WATER', message: 'The outer water is never changed.', why: 'As the outer water becomes more concentrated, the concentration difference driving diffusion shrinks, and removal stalls at a plateau well above zero, however long dialysis continues.', fix: 'Use running water, or change it periodically.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 271);
  const lc = SCALES[inputs.scale] || 0.05;
  const t = (trial - 1) * (inputs.timeMin || 20);
  const c = Math.max(0.01, concentrationAt(inputs, t) + jitter(rng, lc * 3));
  return { trial, timeMin: t, insideMm: sigFig(c, 4), lnC: Number(Math.log(c).toFixed(4)), removedPct: sigFig((1 - c / C0) * 100, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 4) return { ok: false, reason: 'Record the inside concentration at at least four different times.' };
  const pts = rows.map((r) => ({ x: Number(r.timeMin), y: Number(r.lnC) }));
  const fit = linearFit(pts);
  if (!fit || fit.slope >= 0) return { ok: false, reason: 'Space the readings out over a longer time so the concentration visibly falls.' };
  const tau = -1 / fit.slope;
  const accepted = effectiveTau(inputs);
  return { ok: true, tau: sigFig(tau, 4), accepted: sigFig(accepted, 4), percentError: sigFig(percentError(tau, accepted), 3), r2: Number(fit.r2.toFixed(4)), n: rows.length, points: rows.map((r) => ({ x: Number(r.timeMin), y: Number(r.insideMm) })) };
}

export default { meta, defaults, MEMBRANES, WATER_REGIMES, SCALES, C0, init, step, measure, derive, validate, membraneOf, effectiveTau, plateauMm, concentrationAt };
