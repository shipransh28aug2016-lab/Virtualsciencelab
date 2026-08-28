/**
 * MODEL: Refractive index of a glass slab or a liquid — XII-PHY-B06 (slab,
 * travelling microscope), B07 (liquid via a plano-convex lens), and B08
 * (liquid via a concave mirror). One apparent-depth-family model serves
 * all three, selected by `method`.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean, percentError } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B06',
  formula: 'Slab: μ = real/apparent depth. Liquid lens: 1/f2=1/F−1/f1, μ=1+R/|f2|. Concave mirror: μ=R/R\'',
  unitSystem: 'Dimensionless; lengths in cm',
  assumptions: ['Viewing is close to normal incidence, so the thin-pencil approximation holds', 'The liquid layer is thin and of uniform thickness', 'Self-coincidence (no-parallax) is judged carefully'],
  validRange: 'Slab thickness 0.8-1.2 cm; liquid layer thin on a 15-20 cm mirror or lens',
  edgeCases: ['A thick liquid layer invalidates the thin-lens/thin-layer approximation used here'],
  expectedBehaviour: ['μ recovered by both the liquid-lens and concave-mirror methods agree closely', 'A denser liquid gives a larger μ and a smaller apparent radius'],
};

export const SLABS = { s6: { label: 'Crown glass slab (t=1.0 cm)', mu: 1.50, thicknessCm: 1.0 }, s10: { label: 'Flint glass slab (t=1.0 cm)', mu: 1.62, thicknessCm: 1.0 }, s8f: { label: 'Crown glass slab (t=1.5 cm)', mu: 1.50, thicknessCm: 1.5 } };
export const LIQUIDS = { water: { label: 'Water', mu: 1.333 }, glycerine: { label: 'Glycerine', mu: 1.473 }, kerosene: { label: 'Kerosene', mu: 1.448 }, turpentine: { label: 'Turpentine', mu: 1.472 } };
export const LENSES = { L20: { f: 20 }, L15: { f: 15 } };
export const MIRRORS = { m15: { R: 30 }, m10: { R: 20 } };

export const defaults = { slab: 's6', liquid: 'water', method: 'slab', microscopeLC: 0.001, lens: 'L20', mirror: 'm15', layerThin: true, benchLC: 0.1 };

export function slabOf(inputs) { return SLABS[inputs.slab] || SLABS.s6; }
export function liquidOf(inputs) { return LIQUIDS[inputs.liquid] || LIQUIDS.water; }

export function apparentThicknessCm(inputs) { const s = slabOf(inputs); return s.thicknessCm / s.mu; }

/** Liquid-lens method (B07): 1/F = 1/f1 + 1/f2; f2 = plano-concave from μ. */
export function liquidLensF2(inputs) {
  const R = 15; // cm, radius of curvature of the plano-convex lens's flat-facing liquid layer
  const mu = liquidOf(inputs).mu;
  return -R / (mu - 1);
}
export function combinationF(inputs) {
  const f1 = (LENSES[inputs.lens] || LENSES.L20).f;
  const f2 = liquidLensF2(inputs);
  return 1 / (1 / f1 + 1 / f2);
}

/** Concave-mirror method (B08): apparent radius R' = R/mu. */
export function apparentRadiusCm(inputs) {
  const R = (MIRRORS[inputs.mirror] || MIRRORS.m15).R;
  return R / liquidOf(inputs).mu;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, focus: 0, apparent: 0 }; }
/**
 * Focusing the travelling microscope. The apparent position of the mark
 * rises by t(1 - 1/n) when the slab is placed over it; the focus setting
 * eases towards it so the student sees the shift happen rather than being
 * told about it.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = apparentThicknessCm(inputs);
  s.apparent += (target - s.apparent) * Math.min(1, dt * 3);
  s.focus = Math.abs(target - s.apparent) < 0.002 ? 1 : 0;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 239);
  if (inputs.method === 'liquidLens') {
    const f1 = (LENSES[inputs.lens] || LENSES.L20).f;
    const F = combinationF(inputs) + jitter(rng, 0.3);
    const f2 = 1 / (1 / F - 1 / f1);
    const R = 15;
    const mu = 1 + R / Math.abs(f2);
    return { trial, lensFocalCm: f1, combinationFocalCm: Number(F.toFixed(2)), liquidLensFocalCm: Number(f2.toFixed(2)), radiusCm: R, mu: sigFig(mu, 4) };
  }
  if (inputs.method === 'concaveMirror') {
    const R = (MIRRORS[inputs.mirror] || MIRRORS.m15).R;
    const Rprime = apparentRadiusCm(inputs) + jitter(rng, 0.15);
    return { trial, radiusCm: R, apparentRadiusCm: Number(Rprime.toFixed(2)), mu: sigFig(R / Rprime, 4) };
  }
  // slab (travelling microscope, apparent-depth shift)
  const lc = inputs.microscopeLC;
  const s = slabOf(inputs);
  const markAlone = 2.000;
  const shift = s.thicknessCm * (1 - 1 / s.mu);
  const markThroughSlab = markAlone - shift + jitter(rng, lc * 3);
  const slabTop = markAlone + s.thicknessCm;
  const realT = s.thicknessCm;
  const apparentT = realT - (markAlone - markThroughSlab);
  return { trial, markAlone: Number(markAlone.toFixed(4)), markThroughSlab: Number(markThroughSlab.toFixed(4)), slabTop: Number(slabTop.toFixed(3)), realThicknessCm: realT, apparentThicknessCm: Number(apparentT.toFixed(4)), mu: sigFig(realT / apparentT, 4) };
}

const METHOD_LABELS = { slab: 'Travelling microscope (glass slab)', liquidLens: 'Liquid-lens method', concaveMirror: 'Concave-mirror method' };

export function derive(rows, inputs = defaults) {
  const mus = rows.map((r) => Number(r.mu)).filter(Number.isFinite);
  if (mus.length < 2) return { ok: false, reason: 'Take at least two readings.' };
  const m = mean(mus);
  const accepted = inputs.method === 'slab' ? slabOf(inputs).mu : liquidOf(inputs).mu;
  const last = rows[rows.length - 1];
  const extra = inputs.method === 'liquidLens'
    ? { lensFocalCm: Number(last.lensFocalCm), combinationFocalCm: Number(last.combinationFocalCm), liquidLensFocalCm: Number(last.liquidLensFocalCm) }
    : inputs.method === 'concaveMirror'
      ? { radiusCm: Number(last.radiusCm), apparentRadiusCm: Number(last.apparentRadiusCm) }
      : { realThicknessCm: Number(last.realThicknessCm), apparentThicknessCm: Number(last.apparentThicknessCm) };
  return {
    ok: true, refractiveIndex: sigFig(m, 4), accepted: sigFig(accepted, 4), percentError: sigFig(percentError(m, accepted), 3),
    mode: inputs.method, methodLabel: METHOD_LABELS[inputs.method] || METHOD_LABELS.slab,
    sample: inputs.method === 'slab' ? slabOf(inputs).label : liquidOf(inputs).label,
    spread: sigFig(Math.max(...mus) - Math.min(...mus), 4), plausible: m >= 1,
    ...extra, n: mus.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.mu) })),
  };
}

export default { meta, defaults, SLABS, LIQUIDS, LENSES, MIRRORS, init, step, measure, derive, validate, slabOf, liquidOf, apparentThicknessCm, liquidLensF2, combinationF, apparentRadiusCm };
