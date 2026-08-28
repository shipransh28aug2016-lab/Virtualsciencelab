/**
 * MODEL: Depression of a loaded metre scale — XI-PHY-ACT-B6
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 6.
 * Cantilever (loaded at the end): δ = WL³/(3YI). Supported at both ends,
 * loaded centrally: δ = WL³/(48YI). The ratio of the two is exactly 16.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig, sciText } from '../../utils/measure.js';

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

export const ARRANGEMENTS = { cantileverEnd: 'Cantilever, loaded at the free end', supportedCentre: 'Supported at both ends, loaded centrally' };

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
export function init() { return { t: 0, depression: 0, v: 0, settled: false }; }
/**
 * A loaded beam sags -- and it does not sag smoothly. A metre scale
 * supported at its ends and loaded at the centre oscillates about its new
 * position and is damped to rest, which is why a reading is taken only
 * after the pointer has stopped swinging.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = depressionMm(inputs);
  // Damped spring approach: stiffness and damping give a couple of visible
  // swings before it settles.
  const k = 46, c = 7.5;
  const a = k * (target - s.depression) - c * s.v;
  s.v += a * dt;
  s.depression += s.v * dt;
  s.settled = Math.abs(target - s.depression) < 0.01 && Math.abs(s.v) < 0.05;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 163);
  const d = depressionMm(inputs) + jitter(rng, 0.1);
  const W = (inputs.loadG / 1000) * G;
  return { trial, loadG: inputs.loadG, loadN: sigFig(W, 4), spanCm: inputs.spanCm, depressionMm: Number(d.toFixed(3)), perNewton: sigFig(d / W, 4), arrangement: inputs.arrangement };
}

export function derive(rows, inputs = defaults) {
  /*
   * Rows can mix BOTH arrangements (that comparison is the actual point of
   * this activity), so a fit for THIS arrangement's Young's modulus must
   * use only this arrangement's own points -- averaging cantilever and
   * centrally-supported readings together into one straight line, as the
   * previous version did over every recorded row regardless of
   * arrangement, mixes two lines whose slopes differ by a factor of 16 and
   * produces a fit, and a Y, that describes neither arrangement.
   */
  const byArr = new Map();
  for (const r of rows) {
    const a = r.arrangement || inputs.arrangement;
    if (!byArr.has(a)) byArr.set(a, []);
    byArr.get(a).push(r);
  }
  const ownRows = byArr.get(inputs.arrangement) || [];
  const pts = ownRows.map((r) => ({ x: Number(r.loadN), y: Number(r.depressionMm) }));
  if (pts.length < 4) return { ok: false, reason: `Record the depression for at least four different loads in the "${ARRANGEMENTS[inputs.arrangement] || inputs.arrangement}" arrangement.` };
  const fit = fitThroughOrigin(pts);
  const L = inputs.spanCm / 100;
  const I = secondMomentM4(inputs);
  const slopeSI = fit.slope / 1000; // m per N
  const Y = inputs.arrangement === 'supportedCentre' ? L ** 3 / (48 * I * slopeSI) : L ** 3 / (3 * I * slopeSI);
  const acceptedY = scaleOf(inputs).Y;
  const percentError = sigFig((Math.abs(Y - acceptedY) / acceptedY) * 100, 4);

  /*
   * The 16x stiffness ratio compared here is measured from the two
   * arrangements' own fitted slopes (mm of depression per newton, for the
   * same span and scale), not recomputed from the theoretical formula --
   * that would "confirm" 16 unconditionally even if only one arrangement
   * had ever actually been tried.
   */
  let arrangementCheck = null, ratio = null;
  const arrKeys = [...byArr.keys()].filter((k) => (byArr.get(k) || []).length >= 3);
  if (arrKeys.length >= 2) {
    arrangementCheck = arrKeys.map((key) => {
      const arrPts = byArr.get(key).map((r) => ({ x: Number(r.loadN), y: Number(r.depressionMm) }));
      const arrFit = fitThroughOrigin(arrPts);
      return { arrangement: ARRANGEMENTS[key] || key, slope: sigFig(arrFit ? arrFit.slope : NaN, 4) };
    }).filter((a) => Number.isFinite(a.slope));
    if (arrangementCheck.length >= 2) {
      const cantilever = arrangementCheck.find((a) => a.arrangement === ARRANGEMENTS.cantileverEnd);
      const centre = arrangementCheck.find((a) => a.arrangement === ARRANGEMENTS.supportedCentre);
      if (cantilever && centre && centre.slope > 0) ratio = sigFig(cantilever.slope / centre.slope, 4);
    }
  }
  const expectedRatio = 16;
  const ratioAgrees = ratio !== null && Math.abs(ratio - expectedRatio) <= 0.25 * expectedRatio;

  // Depression should scale as span cubed (L³): compare per-newton depression across whatever spans were actually recorded.
  const bySpan = new Map();
  for (const r of ownRows) {
    const key = Number(r.spanCm);
    if (!bySpan.has(key)) bySpan.set(key, []);
    bySpan.get(key).push(Number(r.perNewton));
  }
  const spanCheck = bySpan.size >= 2
    ? [...bySpan.entries()].sort((a, b) => a[0] - b[0]).map(([spanCm, vals]) => ({ spanCm, perNewton: sigFig(vals.reduce((a, b) => a + b, 0) / vals.length, 4) }))
    : null;

  return {
    ok: true, youngsModulus: sigFig(Y, 4), youngsText: sciText(Y, 'Pa', 3), acceptedYoungsText: sciText(acceptedY, 'Pa', 3),
    percentError, slope: sigFig(fit.slope, 4), ratio, expectedRatio, ratioAgrees, arrangementCheck, spanCheck,
    scale: scaleOf(inputs).label, arrangement: ARRANGEMENTS[inputs.arrangement] || inputs.arrangement,
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { meta, defaults, SCALES, ARRANGEMENTS, G, init, step, measure, derive, validate, scaleOf, secondMomentM4, depressionMm };
