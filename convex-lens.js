/**
 * MODEL: Focal length of a convex lens — XII-PHY-B03
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 3:
 * "To find the focal length of a convex lens by plotting graphs between u and v
 *  or between 1/u and 1/v."
 *
 * Sign convention: New Cartesian. Distances measured from the optical centre,
 * against the incident light are negative. For a real object u is NEGATIVE and
 * for a real image v is POSITIVE. The lab records magnitudes; the model keeps
 * the signs honest and converts at the boundary.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B03',
  formula: '1/v − 1/u = 1/f  (New Cartesian).  1/u–1/v graph: intercepts give 1/f;  m = v/u',
  unitSystem: 'SI (cm on the optical bench, converted to m only for reporting)',
  assumptions: [
    'Thin lens, so both surfaces act at one optical centre',
    'Paraxial rays: the object is small and close to the principal axis',
    'Monochromatic-enough light, chromatic aberration ignored',
    'Object, lens and screen centres lie on one horizontal line',
  ],
  validRange: 'f = 10–30 cm, object distance u from just beyond f to 100 cm',
  edgeCases: [
    'u = f: rays emerge parallel, no real image forms on the screen',
    'u < f: the image is virtual, erect and magnified — it cannot be caught on a screen',
    'u = 2f: image is real, inverted and the same size (v = 2f), m = −1',
    'u → ∞: v → f, the image forms at the focus',
  ],
  expectedBehaviour: [
    'As u decreases towards f, v increases rapidly',
    'A 1/u vs 1/v plot is a straight line whose intercepts are both 1/f',
    'The u–v curve is a rectangular hyperbola with asymptotes at u = f and v = f',
  ],
};

export const LENSES = {
  L15: { label: 'Convex lens f ≈ 15 cm', f: 15.0 },
  L20: { label: 'Convex lens f ≈ 20 cm', f: 20.0 },
  L10: { label: 'Convex lens f ≈ 10 cm', f: 10.0 },
};

export const defaults = {
  lens: 'L15',
  objectDistanceCm: 40, // magnitude of u
  objectHeightCm: 2,
  benchLC: 0.1,         // optical bench scale least count (cm)
  autoFocus: true,      // screen snaps to the sharp position
  screenPosCm: 24,      // manual screen position (magnitude of v)
};

/** Thin lens equation solved for image distance v (magnitude, cm). */
export function imageDistance(uMag, f) {
  if (uMag <= f + 1e-9) return Infinity; // at or inside the focus: no real image
  return (uMag * f) / (uMag - f);
}

export function magnification(uMag, f) {
  const v = imageDistance(uMag, f);
  if (!Number.isFinite(v)) return -Infinity;
  return -v / uMag; // negative = inverted real image
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const lens = LENSES[inputs.lens] || LENSES.L15;
  const u = Number(inputs.objectDistanceCm);
  if (!Number.isFinite(u) || u <= 0) {
    errors.push({ field: 'objectDistanceCm', message: 'Object distance must be positive.' });
    return { ok: false, errors, warnings };
  }
  if (Math.abs(u - lens.f) < 0.6) warnings.push({
    field: 'objectDistanceCm', code: 'AT_FOCUS',
    message: `The object is at the focus (u ≈ f ≈ ${lens.f} cm).`,
    why: 'Rays leave the lens parallel, so they never meet. The image is at infinity and nothing can be focused on the screen. Move the object further away.',
  });
  else if (u < lens.f) warnings.push({
    field: 'objectDistanceCm', code: 'INSIDE_FOCUS',
    message: `u = ${u} cm is inside the focal length (${lens.f} cm).`,
    why: 'The lens now acts as a magnifying glass: the image is virtual, erect and enlarged. A virtual image cannot be caught on a screen, so this reading cannot go in the table.',
  });
  else if (u < 1.2 * lens.f) warnings.push({
    field: 'objectDistanceCm', code: 'NEAR_FOCUS',
    message: 'The object is very close to the focus.',
    why: 'v becomes very large and hard to measure on the bench; a small error in u causes a big error in f. Use u between about 1.5f and 4f.',
  });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, running: true, screen: 24, sharp: 0 }; }

export function step(state, inputs, dt) {
  const lens = LENSES[inputs.lens] || LENSES.L15;
  const v = imageDistance(inputs.objectDistanceCm, lens.f);
  const s = { ...state };
  const target = inputs.autoFocus ? (Number.isFinite(v) ? v : 200) : inputs.screenPosCm;
  s.screen += (target - s.screen) * Math.min(1, dt * 7); // smooth glide
  // sharpness: 1 when the screen sits exactly at the image plane
  const err = Number.isFinite(v) ? Math.abs(s.screen - v) : 999;
  s.sharp = Math.exp(-(err * err) / 8);
  s.v = v;
  s.t += dt;
  return s;
}

export function measure(state, inputs, seed = 1) {
  const lens = LENSES[inputs.lens] || LENSES.L15;
  const rng = makeRng(seed + Math.round(inputs.objectDistanceCm * 3));
  const vTrue = imageDistance(inputs.objectDistanceCm, lens.f);
  const finite = Number.isFinite(vTrue);
  const vRead = finite ? toLeastCount(vTrue + jitter(rng, 0.25), inputs.benchLC) : null;
  const uRead = toLeastCount(inputs.objectDistanceCm + jitter(rng, 0.15), inputs.benchLC);
  const m = finite ? -vRead / uRead : null;
  return {
    u: Number(uRead.toFixed(1)),
    v: finite ? Number(vRead.toFixed(1)) : null,
    invU: Number((1 / uRead).toFixed(5)),
    invV: finite ? Number((1 / vRead).toFixed(5)) : null,
    fSingle: finite ? Number(((uRead * vRead) / (uRead + vRead)).toFixed(2)) : null,
    magnification: m ? Number(m.toFixed(2)) : null,
    imageType: !finite ? 'No real image' : uRead > 2 * lens.f ? 'Real, inverted, diminished'
      : Math.abs(uRead - 2 * lens.f) < 1 ? 'Real, inverted, same size' : 'Real, inverted, magnified',
  };
}

/**
 * Two independent routes to f, both required by the CBSE write-up:
 *  (a) mean of f = uv/(u+v) for each row
 *  (b) the 1/u–1/v straight line: intercepts are 1/f
 */
export function derive(rows) {
  const usable = rows.filter((r) => Number.isFinite(Number(r.v)) && Number(r.v) > 0 && Number(r.u) > 0);
  if (usable.length < 2) return { ok: false, reason: 'Record at least two rows that produced a real image.' };

  const fEach = usable.map((r) => (Number(r.u) * Number(r.v)) / (Number(r.u) + Number(r.v)));
  const fMean = mean(fEach);

  // Plot y = 1/v against x = 1/u. Since 1/v + 1/u_mag = 1/f, the line is
  // y = -x + 1/f: slope -1, and BOTH intercepts equal 1/f.
  const pts = usable.map((r) => ({ x: 1 / Number(r.u), y: 1 / Number(r.v) }));
  const fit = linearFit(pts);
  const fFromGraph = fit && fit.intercept > 0 ? 1 / fit.intercept : null;

  return {
    ok: true,
    fMean: sigFig(fMean, 4),
    fFromGraph: fFromGraph ? sigFig(fFromGraph, 4) : null,
    slope: fit ? sigFig(fit.slope, 3) : null,
    r2: fit ? Number(fit.r2.toFixed(4)) : null,
    power: fMean ? sigFig(100 / fMean, 3) : null, // dioptres, P = 1/f(m)
    n: usable.length,
    points: pts,
    each: fEach.map((f) => sigFig(f, 4)),
  };
}

export default { meta, defaults, LENSES, init, step, measure, derive, validate, imageDistance, magnification };
