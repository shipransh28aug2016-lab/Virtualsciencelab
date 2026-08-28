/**
 * MODEL: Diffraction of light at a thin slit — XII-PHY-ACT-B5
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 5.
 * Minima: a sinθ = nλ. Central maximum width w = 2λD/a.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B5',
  formula: 'a sinθ = nλ; w = 2λD/a',
  unitSystem: 'nm for wavelength; mm for slit width and pattern; m for screen distance',
  assumptions: ['The slit is illuminated by an effectively parallel (or distant, point-source) beam', 'The screen distance is large compared with the slit width, so the small-angle approximation holds'],
  validRange: 'Slit width 0.05-0.40 mm; screen distance 0.5-3 m',
  edgeCases: ['A wider slit gives a narrower pattern — the inverse of ordinary intuition about apertures'],
  expectedBehaviour: ['The central maximum is exactly twice the width of each secondary maximum', 'w is proportional to 1/a — a straight line through the origin'],
};

export const SOURCES = { red: { label: 'Red laser', nm: 650 }, green: { label: 'Green laser', nm: 532 }, blue: { label: 'Blue laser', nm: 450 }, sodium: { label: 'Sodium lamp (filtered)', nm: 589 } };
export const SLITS = { a005: 0.05, a010: 0.10, a020: 0.20, a040: 0.40 };
export const SCALES = { s1: 1, s05: 0.5, s02: 0.2 };

export const defaults = { source: 'red', slit: 'a010', scale: 's05', screenDistanceM: 1.5 };

export function sourceOf(inputs) { return SOURCES[inputs.source] || SOURCES.red; }
export function slitMm(inputs) { return SLITS[inputs.slit] || 0.10; }
export function centralWidthMm(inputs) {
  const lambdaM = sourceOf(inputs).nm * 1e-9;
  const aM = slitMm(inputs) / 1000;
  return (2 * lambdaM * inputs.screenDistanceM) / aM * 1000;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, width: 0, intensity: 1, settled: false }; }
/**
 * Single-slit diffraction. The central maximum widens as the slit is
 * narrowed -- the inverse relation the experiment demonstrates -- and the
 * pattern is eased to its new width so the change is watched rather than
 * jumped to.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = centralWidthMm(inputs);
  s.width += (target - s.width) * Math.min(1, dt * 2.8);
  s.settled = Math.abs(target - s.width) < 0.05;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 257);
  const lc = SCALES[inputs.scale] || 0.5;
  const w = centralWidthMm(inputs) + jitter(rng, lc * 0.6);
  return { trial, slitMm: slitMm(inputs), screenDistanceM: inputs.screenDistanceM, centralWidthMm: Number(w.toFixed(2)), inverseSlit: sigFig(1 / slitMm(inputs), 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.inverseSlit), y: Number(r.centralWidthMm) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the central maximum width for at least four different slit widths.' };
  const fit = fitThroughOrigin(pts);
  const D = inputs.screenDistanceM;
  /*
   * w(mm) = 2*lambda(m)*D(m)/a(m) * 1000, and a(m) = slitMm/1000, so
   * w(mm) = 2*lambda(m)*D(m)*1e6 * (1/slitMm) = 2*lambda(m)*D(m)*1e6 * x.
   * The fit's slope is therefore 2*lambda(m)*D(m)*1e6, so
   * lambda(m) = slope/(2*D*1e6), and lambda(nm) = lambda(m)*1e9 =
   * slope*1e3/(2*D). The previous formula divided fit.slope by 1000
   * first (as if x were already in 1/m rather than 1/mm) and so reported
   * a wavelength exactly 1000x too large -- 650,700 nm instead of 650 nm
   * for the default red laser, verified directly against
   * sourceOf(inputs).nm.
   */
  const lambdaNm = (fit.slope * 1000) / (2 * D);
  const accepted = sourceOf(inputs).nm;
  const r2 = Number(fit.r2.toFixed(4));

  const narrowestRow = rows.reduce((a, b) => (Number(a.slitMm) <= Number(b.slitMm) ? a : b));
  const widestRow = rows.reduce((a, b) => (Number(a.slitMm) >= Number(b.slitMm) ? a : b));
  return {
    ok: true, wavelength: sigFig(lambdaNm, 4), accepted, percentError: sigFig((Math.abs(lambdaNm - accepted) / accepted) * 100, 3),
    inverseConfirmed: fit.r2 > 0.9, r2, fitR2: r2,
    narrowerIsWider: Number(narrowestRow.centralWidthMm) > Number(widestRow.centralWidthMm),
    narrowestSlit: Number(narrowestRow.slitMm), narrowestWidth: Number(narrowestRow.centralWidthMm),
    widestSlit: Number(widestRow.slitMm), widestWidth: Number(widestRow.centralWidthMm),
    source: sourceOf(inputs).label, slitsUsed: new Set(rows.map((r) => r.slitMm)).size,
    distancesUsed: new Set(rows.map((r) => r.screenDistanceM)).size,
    n: pts.length, points: pts,
  };
}

export default { meta, defaults, SOURCES, SLITS, SCALES, init, step, measure, derive, validate, sourceOf, slitMm, centralWidthMm };
