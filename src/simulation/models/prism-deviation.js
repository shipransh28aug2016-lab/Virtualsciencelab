/**
 * MODEL: Angle of minimum deviation for a prism — XII-PHY-B05
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 5.
 * r1+r2=A; δ=i+e−A; at minimum deviation i=e, r1=r2=A/2;
 * μ = sin((A+δm)/2) / sin(A/2).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';
import { mixedSetRefusal, specimenOfRows } from '../one-specimen.js';

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
  const tr = trace({ ...inputs, incidenceDeg: s.incidence });
  s.deviation = tr?.delta ?? s.deviation;
  // trace() returns null exactly when the ray totally internally reflects
  // at the second face — that IS the TIR condition, not a field on its
  // result (trace()'s object never had `totalInternalReflection`, so this
  // was permanently false and the "no ray emerges" case never registered
  // in state at all).
  s.tir = !tr;
  // At minimum deviation the ray passes symmetrically through the prism.
  s.atMinimum = !!tr && Math.abs((tr.r1 ?? 0) - (tr.r2 ?? 0)) < 0.4;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const tr = trace(inputs);
  if (!tr) return null;
  const rng = makeRng(seed + trial * 233);
  const noise = () => jitter(rng, 0.3);
  return { trial, prism: prismOf(inputs).label, source: (SOURCES[inputs.source] || {}).label, incidence: inputs.incidenceDeg, emergence: Number((tr.e + noise()).toFixed(1)), r1: Number(tr.r1.toFixed(1)), r2: Number(tr.r2.toFixed(1)), deviation: Number((tr.delta + noise()).toFixed(1)) };
}

export function derive(rows, inputs = defaults) {
  const mixed = mixedSetRefusal(rows, 'prism', 'prisms')
    || mixedSetRefusal(rows, 'source', 'sources');
  if (mixed) return mixed;

  if (rows.length < 5) return { ok: false, reason: 'Record the deviation for at least five different angles of incidence, spanning the minimum.' };

  /*
   * The minimum of the δ–i curve, found where the practical says to find it:
   * at the VERTEX of the plotted curve, not at the smallest number in the
   * table.
   *
   * Those are the same thing only when the readings straddle the minimum. A
   * set taken entirely on one side of it has its smallest deviation at an
   * end, and reporting that as δm gave 26° against an accepted 38.9° — with
   * the panel describing it as "the vertex of the fitted curve", which is
   * what it was supposed to be and was not. The curve is flat near its
   * minimum, so the three readings around the lowest one fix the vertex far
   * better than the lowest one alone.
   */
  const bySlot = [...rows].sort((a, b) => Number(a.incidence) - Number(b.incidence));
  let at = 0;
  for (let k = 1; k < bySlot.length; k += 1) {
    if (Number(bySlot[k].deviation) < Number(bySlot[at].deviation)) at = k;
  }
  if (at === 0 || at === bySlot.length - 1) {
    const side = at === 0 ? 'smaller' : 'larger';
    return {
      ok: false,
      reason: `The smallest deviation in this set is at the very ${at === 0 ? 'first' : 'last'} angle of incidence (${bySlot[at].incidence}°), so the readings do not straddle the minimum — the curve is still falling when they stop. Take more readings at ${side} angles until the deviation is seen to rise again on both sides.`,
    };
  }
  const p0 = bySlot[at - 1], p1 = bySlot[at], p2 = bySlot[at + 1];
  const [x0, y0] = [Number(p0.incidence), Number(p0.deviation)];
  const [x1, y1] = [Number(p1.incidence), Number(p1.deviation)];
  const [x2, y2] = [Number(p2.incidence), Number(p2.deviation)];
  /* Vertex of the parabola through three points, which is the graphical
     construction done exactly rather than by eye. */
  const denom = (x0 - x1) * (x0 - x2) * (x1 - x2);
  let iMin = Number(p1.incidence);
  let dm = Number(p1.deviation);
  if (Math.abs(denom) > 1e-9) {
    const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom;
    const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / denom;
    const c = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / denom;
    if (a > 0) { iMin = -b / (2 * a); dm = c - (b * b) / (4 * a); }
  }

  const prism = specimenOfRows(PRISMS, rows, 'prism', prismOf(inputs));
  const A = prism.A;
  const mu = Math.sin(((A + dm) * Math.PI) / 360) / Math.sin((A * Math.PI) / 360);
  const acceptedMu = prism.mu ?? muOf(inputs);
  // Invert mu = sin((A+dm)/2)/sin(A/2) for the theoretical minimum deviation
  // at this prism's accepted refractive index, to compare against.
  const acceptedDeltaM = (2 * Math.asin(acceptedMu * Math.sin((A * Math.PI) / 360)) * 180) / Math.PI - A;
  return {
    ok: true, minimumDeviation: sigFig(dm, 4), refractiveIndex: sigFig(mu, 4), incidenceAtMinimum: sigFig(iMin, 4),
    /* `accepted` is read by the result checker as the accepted value of the
       quantity this experiment reports, which is the minimum deviation — not
       the refractive index it is worked out from. Both are printed, under
       names that say which is which. */
    accepted: sigFig(acceptedDeltaM, 4), acceptedMu: sigFig(acceptedMu, 4), acceptedDeltaM: sigFig(acceptedDeltaM, 4), angleA: A,
    n: rows.length, points: rows.map((r) => ({ x: Number(r.incidence), y: Number(r.deviation) })),
  };
}

export default { meta, defaults, PRISMS, SOURCES, init, step, measure, derive, validate, prismOf, muOf, trace };
