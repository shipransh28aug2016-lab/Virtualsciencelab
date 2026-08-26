/**
 * MODEL: Spherometer — XI-PHY-A04
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 4.
 * R = l²/(6h) + h/2, with h the sagitta above/below the plane of the three legs.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A04',
  formula: 'R = l²/(6h) + h/2, r = l/√3',
  unitSystem: 'Screw readings and leg separation in mm; radius reported in cm',
  assumptions: ['The three legs form an equilateral triangle', 'The surface is a true sphere over the area the legs cover', 'The screw is turned in one direction only'],
  validRange: 'Leg separation 30-50 mm; sagitta 0.05-3 mm; radius 15-200 cm',
  edgeCases: ['A nearly-plane surface gives a sagitta of only a few least counts and an unreliable R', 'A concave surface reverses the sense of screw travel but gives the same |R|'],
  expectedBehaviour: ['R recovers the accepted value for both convex and concave surfaces', 'Wider legs give a larger sagitta on the same surface, as l²'],
};

export const SURFACES = {
  watchConvex: { label: 'Watch glass (convex)', radiusCm: 22.5, sign: 1 },
  lensConvex: { label: 'Lens surface (convex)', radiusCm: 15.0, sign: 1 },
  watchConcave: { label: 'Watch glass (concave)', radiusCm: 22.5, sign: -1 },
  flatish: { label: 'Nearly-plane plate', radiusCm: 400, sign: 1 },
};
export const SPHEROMETERS = { sp100: { label: 'Pitch 1 mm, 100 div.', pitch: 1.0, n: 100 }, sp50: { label: 'Pitch 0.5 mm, 50 div.', pitch: 0.5, n: 50 }, spWide: { label: 'Pitch 1 mm, wide legs', pitch: 1.0, n: 100 } };

export const defaults = { surface: 'watchConvex', spherometer: 'sp100', screwTurns: 0, legMm: 40 };

export function leastCount(inputs) { const s = SPHEROMETERS[inputs.spherometer] || SPHEROMETERS.sp100; return s.pitch / s.n; }
export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.watchConvex; }

/** True sagitta for the current surface and leg separation, mm. */
export function trueSagittaMm(inputs) {
  const s = surfaceOf(inputs);
  const rMm = s.radiusCm * 10;
  const rLeg = inputs.legMm / Math.sqrt(3);
  const h = rMm - Math.sqrt(Math.max(0, rMm * rMm - rLeg * rLeg));
  return s.sign * h;
}

export function atContact(inputs) {
  const lc = leastCount(inputs);
  return Math.abs(inputs.screwTurns - Math.abs(trueSagittaMm(inputs))) <= Math.max(0.03, lc * 3);
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!atContact(inputs)) warnings.push({ field: 'screwTurns', code: 'NOT_CONTACT', message: 'The screw has not been brought to the surface.', why: 'Turn the screw slider until the tip just touches — the instrument begins to pivot at contact.' });
  if (Math.abs(trueSagittaMm(inputs)) < leastCount(inputs) * 4) {
    warnings.push({ field: 'surface', code: 'NEARLY_PLANE', message: 'The sagitta on this surface is only a few least counts.', why: 'R depends on 1/h, so a tiny sagitta carries a very large percentage error straight into R.', fix: 'Use a more strongly curved surface, or set the legs further apart.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!atContact(inputs)) return null;
  const rng = makeRng(seed + trial * 53);
  const lc = leastCount(inputs);
  const trueH = trueSagittaMm(inputs);
  const h = toLeastCount(trueH + jitter(rng, lc * 0.7), lc);
  const pitch = (SPHEROMETERS[inputs.spherometer] || SPHEROMETERS.sp100).pitch;
  const turns = Math.trunc(Math.abs(h) / pitch);
  const disc = Math.round((Math.abs(h) - turns * pitch) / lc);
  const l = inputs.legMm;
  const R = (l * l) / (6 * Math.abs(h)) + Math.abs(h) / 2; // mm
  return { trial, legMm: l, verticalScale: turns * pitch, discDivision: disc, sagitta: Number(h.toFixed(3)), radiusCm: sigFig(R / 10, 4) };
}

export function derive(rows) {
  const vals = rows.map((r) => Number(r.radiusCm)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Record contact at least three times.' };
  const hs = rows.map((r) => Math.abs(Number(r.sagitta)));
  const l = Number(rows[0].legMm);
  const meanH = mean(hs);
  const mainTerm = (l * l) / (6 * meanH) / 10;
  const correctionTerm = meanH / 2 / 10;
  return {
    ok: true, radius: sigFig(mean(vals), 4), meanSagitta: sigFig(meanH, 4), correctionTerm: sigFig(correctionTerm, 3),
    mainTerm: sigFig(mainTerm, 4), correctionPercent: sigFig((correctionTerm / (mainTerm + correctionTerm)) * 100, 3),
    n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.radiusCm) })),
  };
}

export default { meta, defaults, SURFACES, SPHEROMETERS, init, step, measure, derive, validate, leastCount, surfaceOf, trueSagittaMm, atContact };
