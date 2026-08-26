/**
 * MODEL: Angle of minimum deviation for a prism — XII-PHY-B05
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 5.
 * r1+r2=A; δ=i+e−A; at minimum deviation i=e, r1=r2=A/2;
 * μ = sin((A+δm)/2) / sin(A/2).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B05',
  formula: 'δ = i+e−A; at minimum, i=e; μ = sin((A+δm)/2)/sin(A/2)',
  unitSystem: 'Degree',
  assumptions: ['The prism is thin enough that both faces are flat and well polished', 'Rays are traced in one plane, normal to the refracting edge', 'The light is effectively monochromatic for a sharp minimum'],
  validRange: 'Angle of incidence 25°-80°',
  edgeCases: ['At grazing incidence the deviation rises steeply', 'The deviation curve has one minimum, where i=e'],
  expectedBehaviour: ['The deviation falls, reaches a minimum, then rises again as i increases', 'At the minimum the ray passes symmetrically through the prism'],
};

export const PRISMS = { crown60: { label: 'Crown glass, A=60°', A: 60, mu: 1.52 }, crown45: { label: 'Crown glass, A=45°', A: 45, mu: 1.52 }, flint60: { label: 'Flint glass, A=60°', A: 60, mu: 1.62 }, perspex60: { label: 'Perspex, A=60°', A: 60, mu: 1.49 } };
export const SOURCES = { sodium: { label: 'Sodium lamp', muShift: 0 }, red: { label: 'Red filter', muShift: -0.006 }, violet: { label: 'Violet filter', muShift: 0.012 }, white: { label: 'White light', muShift: 0 } };

export const defaults = { incidenceDeg: 50, prism: 'crown60', source: 'sodium' };

export function prismOf(inputs) { return PRISMS[inputs.prism] || PRISMS.crown60; }
export function muOf(inputs) { return prismOf(inputs).mu + (SOURCES[inputs.source] || SOURCES.sodium).muShift; }

/** Trace the ray through the prism; returns null if it totally internally reflects. */
export function trace(inputs) {
  const A = (prismOf(inputs).A * Math.PI) / 180;
  const mu = muOf(inputs);
  const i = (inputs.incidenceDeg * Math.PI) / 180;
  const r1 = Math.asin(Math.sin(i) / mu);
  const r2 = A - r1;
  if (Math.abs(Math.sin(r2) * mu) > 1) return null; // TIR at the second face
  const e = Math.asin(mu * Math.sin(r2));
  const delta = i + e - A;
  return { r1: (r1 * 180) / Math.PI, r2: (r2 * 180) / Math.PI, e: (e * 180) / Math.PI, delta: (delta * 180) / Math.PI };
}

export function validate(inputs) {
  const errors = [];
  if (!trace(inputs)) errors.push({ field: 'incidenceDeg', code: 'TOTAL_INTERNAL_REFLECTION', message: 'No ray emerges at this angle of incidence.', why: 'The refracted ray inside the prism strikes the second face beyond the critical angle and undergoes total internal reflection instead of emerging.', fix: 'Increase the angle of incidence.' });
  return { ok: errors.length === 0, errors, warnings: [] };
}
export function init() { return { t: 0, incidence: 30, deviation: 0, atMinimum: false }; }
/**
 * The prism being rotated to find minimum deviation. As the angle of
 * incidence is changed the deviation falls to a minimum and rises again --
 * the turning point the student watches the image reverse at.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = inputs.incidenceDeg ?? state.incidence ?? 30;
  s.incidence += (target - s.incidence) * Math.min(1, dt * 3);
  const tr = trace(inputs, s.incidence);
  s.deviation = tr?.deviationDeg ?? s.deviation;
  s.tir = !!tr?.totalInternalReflection;
  // At minimum deviation the ray passes symmetrically through the prism.
  s.atMinimum = !!tr && Math.abs((tr.r1 ?? 0) - (tr.r2 ?? 0)) < 0.4;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const tr = trace(inputs);
  if (!tr) return null;
  const rng = makeRng(seed + trial * 233);
  const noise = () => jitter(rng, 0.3);
  return { trial, incidence: inputs.incidenceDeg, emergence: Number((tr.e + noise()).toFixed(1)), r1: Number(tr.r1.toFixed(1)), r2: Number(tr.r2.toFixed(1)), deviation: Number((tr.delta + noise()).toFixed(1)) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 5) return { ok: false, reason: 'Record the deviation for at least five different angles of incidence, spanning the minimum.' };
  const minRow = rows.reduce((a, b) => (Number(a.deviation) <= Number(b.deviation) ? a : b));
  const A = prismOf(inputs).A;
  const dm = Number(minRow.deviation);
  const mu = Math.sin(((A + dm) * Math.PI) / 360) / Math.sin((A * Math.PI) / 360);
  return { ok: true, minimumDeviation: sigFig(dm, 4), refractiveIndex: sigFig(mu, 4), incidenceAtMinimum: Number(minRow.incidence), accepted: muOf(inputs), n: rows.length, points: rows.map((r) => ({ x: Number(r.incidence), y: Number(r.deviation) })) };
}

export default { meta, defaults, PRISMS, SOURCES, init, step, measure, derive, validate, prismOf, muOf, trace };
