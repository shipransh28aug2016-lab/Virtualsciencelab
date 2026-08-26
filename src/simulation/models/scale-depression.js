/**
 * MODEL: Depression of a loaded metre scale — XI-PHY-ACT-B6
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 6.
 * Cantilever (loaded at the end): δ = WL³/(3YI). Supported at both ends,
 * loaded centrally: δ = WL³/(48YI). The ratio of the two is exactly 16.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B6',
  formula: 'Cantilever: δ = WL³/3YI; supported centre: δ = WL³/48YI; I = bd³/12',
  unitSystem: 'SI: metre, newton, pascal',
  assumptions: ['The scale behaves as a uniform elastic beam', 'Deflections stay small (linear elasticity)', 'The span is measured between the supports or the clamp and the load'],
  validRange: 'Span 30-90 cm, load 0-500 g',
  edgeCases: ['The two arrangements give depressions in the ratio exactly 16 for the same span and load'],
  expectedBehaviour: ['Depression is proportional to the load', 'A centrally-supported beam sags far less than the same beam as a cantilever'],
};

export const G = 9.792;
export const SCALES = { wood: { label: 'Wooden metre scale', Y: 11e9, bMm: 30, dMm: 6 }, steel: { label: 'Steel scale', Y: 200e9, bMm: 25, dMm: 3 }, plastic: { label: 'Plastic scale', Y: 3e9, bMm: 30, dMm: 4 } };

export const defaults = { arrangement: 'cantileverEnd', loadG: 50, spanCm: 40, scale: 'wood', orientation: 'flat', gauge: 'mm05' };

export function scaleOf(inputs) { return SCALES[inputs.scale] || SCALES.wood; }
export function secondMomentM4(inputs) {
  const s = scaleOf(inputs);
  const bMm = inputs.orientation === 'edge' ? s.dMm : s.bMm;
  const dMm = inputs.orientation === 'edge' ? s.bMm : s.dMm;
  return ((bMm / 1000) * (dMm / 1000) ** 3) / 12;
}
export function depressionMm(inputs) {
  const s = scaleOf(inputs);
  const W = (inputs.loadG / 1000) * G;
  const L = inputs.spanCm / 100;
  const I = secondMomentM4(inputs);
  const d = inputs.arrangement === 'supportedCentre' ? (W * L ** 3) / (48 * s.Y * I) : (W * L ** 3) / (3 * s.Y * I);
  return d * 1000;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 163);
  const d = depressionMm(inputs) + jitter(rng, 0.1);
  const W = (inputs.loadG / 1000) * G;
  return { trial, loadG: inputs.loadG, loadN: sigFig(W, 4), spanCm: inputs.spanCm, depressionMm: Number(d.toFixed(3)), perNewton: sigFig(d / W, 4), arrangement: inputs.arrangement };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.loadN), y: Number(r.depressionMm) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the depression for at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  const L = inputs.spanCm / 100;
  const I = secondMomentM4(inputs);
  const slopeSI = fit.slope / 1000; // m per N
  const Y = inputs.arrangement === 'supportedCentre' ? L ** 3 / (48 * I * slopeSI) : L ** 3 / (3 * I * slopeSI);
  const other = inputs.arrangement === 'supportedCentre' ? depressionMm({ ...inputs, arrangement: 'cantileverEnd' }) : depressionMm({ ...inputs, arrangement: 'supportedCentre' });
  const thisD = depressionMm(inputs);
  const ratio = inputs.arrangement === 'supportedCentre' ? other / thisD : thisD / other;
  return { ok: true, youngsModulus: sigFig(Y, 4), slope: sigFig(fit.slope, 4), ratio: sigFig(ratio, 4), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, SCALES, G, init, step, measure, derive, validate, scaleOf, secondMomentM4, depressionMm };
