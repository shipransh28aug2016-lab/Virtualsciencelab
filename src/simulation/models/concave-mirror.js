/**
 * MODEL: Focal length of a concave mirror — XII-PHY-B01
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 1:
 * "To find the value of v for different values of u in case of a concave
 *  mirror and to find the focal length."
 *
 * Unit VI, Chapter 9: Ray Optics — reflection at spherical mirrors, mirror
 * formula, magnification.
 *
 * Companion to XII-PHY-B03 (convex lens by the u-v method): same graphical
 * treatment, but the sign convention and the geometry differ.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B01',
  formula: '1/v + 1/u = 1/f  (real-is-positive convention using magnitudes);  m = −v/u;  R = 2f',
  unitSystem: 'All distances in cm, measured along the optical bench from the pole of the mirror',
  assumptions: [
    'The mirror has a small aperture, so spherical aberration is negligible',
    'Distances are measured from the pole of the mirror',
    'The object and screen are at the same height as the principal axis',
    'The image is judged sharp by removing parallax between the image and the screen',
  ],
  validRange: 'Object distance from just beyond f up to about 60 cm; focal length 10 to 25 cm',
  edgeCases: [
    'With the object inside the focus the image is virtual and cannot be caught on a screen',
    'With the object exactly at the focus the reflected rays are parallel and no image forms',
    'At the centre of curvature the image is the same size as the object, at the same place',
    'A plot of 1/u against 1/v is a straight line with intercepts 1/f on both axes',
  ],
  expectedBehaviour: [
    'A concave mirror forms a real, inverted image when the object is beyond the focus',
    'As the object moves towards the focus, the image moves further away and grows',
    'u = v = 2f = R gives an image the same size as the object',
    'The radius of curvature is twice the focal length',
  ],
};

/** Mirrors available on the bench. */
export const MIRRORS = {
  m15: { label: 'Concave mirror f = 15 cm', focal: 15 },
  m10: { label: 'Concave mirror f = 10 cm', focal: 10 },
  m20: { label: 'Concave mirror f = 20 cm', focal: 20 },
};

export const defaults = {
  mirror: 'm15',
  objectDistanceCm: 30,   // u, measured as a positive magnitude
  objectHeightCm: 2.0,
  benchLC: 0.1,           // optical bench least count (cm)
};

/**
 * Image distance from the mirror formula.
 * Working in magnitudes with the real-is-positive convention:
 *   1/v + 1/u = 1/f   →   v = uf/(u − f)
 * Returns null when no real image is formed.
 */
export function imageDistance(inputs) {
  const f = (MIRRORS[inputs.mirror] || MIRRORS.m15).focal;
  const u = inputs.objectDistanceCm;
  if (u <= f) return null;            // at or inside the focus: no real image
  return (u * f) / (u - f);
}

/** Magnification m = −v/u; negative means inverted. */
export function magnification(inputs) {
  const v = imageDistance(inputs);
  if (v === null) return null;
  return -v / inputs.objectDistanceCm;
}

/** Height of the image, negative meaning inverted. */
export function imageHeight(inputs) {
  const m = magnification(inputs);
  return m === null ? null : m * inputs.objectHeightCm;
}

/** Radius of curvature. */
export function radiusOfCurvature(inputs) {
  return 2 * (MIRRORS[inputs.mirror] || MIRRORS.m15).focal;
}

/** How sharply the image is focused for a screen at the given position. */
export function sharpness(inputs, screenCm) {
  const v = imageDistance(inputs);
  if (v === null) return 0;
  const err = Math.abs(screenCm - v);
  return Math.exp(-(err * err) / (2 * 1.8 ** 2));
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const f = (MIRRORS[inputs.mirror] || MIRRORS.m15).focal;
  const u = inputs.objectDistanceCm;

  if (u <= 0) {
    errors.push({ field: 'objectDistanceCm', message: 'The object must be in front of the mirror.' });
    return { ok: false, errors, warnings };
  }
  if (Math.abs(u - f) < 0.5) {
    warnings.push({
      field: 'objectDistanceCm',
      code: 'AT_FOCUS',
      message: 'The object is at the principal focus.',
      why: 'Rays from a point at the focus are reflected parallel to the axis, so they never meet. The image is formed at infinity and cannot be caught on a screen at all.',
      fix: `Move the object well beyond ${f} cm, to about ${(1.6 * f).toFixed(0)} cm or more.`,
    });
  } else if (u < f) {
    warnings.push({
      field: 'objectDistanceCm',
      code: 'INSIDE_FOCUS',
      message: 'The object is inside the focus, so the image is virtual.',
      why: 'When the object lies between the pole and the focus, the reflected rays diverge. The image formed is virtual, erect and magnified, located behind the mirror. A virtual image cannot be received on a screen, so this position gives no reading for the u–v method.',
      fix: `Keep the object beyond the focal length of ${f} cm.`,
    });
  } else if (u < f * 1.25) {
    warnings.push({
      field: 'objectDistanceCm', code: 'NEAR_FOCUS',
      message: 'The image is formed a very long way from the mirror.',
      why: 'Just beyond the focus a small change in u produces a huge change in v, so the image is far down the bench, faint and hard to focus. Work between about 1.5f and 4f.',
    });
  }
  if (u > 4 * f) {
    warnings.push({
      field: 'objectDistanceCm', code: 'FAR_OBJECT',
      message: 'The image is now very close to the focus and very small.',
      why: 'For a distant object the image forms almost exactly at the focus and is much reduced, so the percentage error in locating it grows. Keep u below about four times the focal length.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  const v = imageDistance(inputs);
  return {
    t: 0, running: true,
    u: inputs.objectDistanceCm,
    v: v ?? 0,
    screen: v ?? 40,
    sharp: v === null ? 0 : 1,
    hasImage: v !== null,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.u += (inputs.objectDistanceCm - s.u) * Math.min(1, dt * 7);
  const v = imageDistance({ ...inputs, objectDistanceCm: s.u });
  s.hasImage = v !== null;
  if (v !== null) {
    s.v += (v - s.v) * Math.min(1, dt * 6);
    // the student slides the screen to the image; the sim tracks it
    s.screen += (v - s.screen) * Math.min(1, dt * 4);
    s.sharp = sharpness({ ...inputs, objectDistanceCm: s.u }, s.screen);
    s.magnification = -v / s.u;
  } else {
    s.sharp = 0;
    s.magnification = null;
  }
  s.t += dt;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 31 + Math.round(inputs.objectDistanceCm));
  const vTrue = imageDistance(inputs);
  if (vTrue === null) return null;

  const u = toLeastCount(inputs.objectDistanceCm, inputs.benchLC);
  const v = toLeastCount(vTrue + jitter(rng, inputs.benchLC * 2.2), inputs.benchLC);
  const f = (u * v) / (u + v);   // mirror formula rearranged for each row

  return {
    trial,
    u: Number(u.toFixed(1)),
    v: Number(v.toFixed(1)),
    invU: Number((1 / u).toFixed(5)),
    invV: Number((1 / v).toFixed(5)),
    focalLength: Number(f.toFixed(2)),
    magnification: Number((-v / u).toFixed(3)),
    mirror: (MIRRORS[inputs.mirror] || MIRRORS.m15).label,
  };
}

/**
 * Two routes, both required:
 *  (a) f = uv/(u + v) for each row, then the mean
 *  (b) the 1/u against 1/v graph, a straight line of slope −1 whose
 *      intercepts on both axes are 1/f
 */
export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => Number(r.u) > 0 && Number(r.v) > 0);
  if (usable.length < 4) return { ok: false, reason: 'Record at least four object distances.' };

  const each = usable.map((r) => Number(r.focalLength));
  const fMean = mean(each);

  const pts = usable.map((r) => ({ x: Number(r.invU), y: Number(r.invV) }));
  const fit = linearFit(pts);
  // 1/u + 1/v = 1/f  →  1/v = 1/f − 1/u : slope −1, intercept 1/f
  const fFromGraph = fit && fit.intercept > 0 ? 1 / fit.intercept : null;

  const accepted = (MIRRORS[inputs.mirror] || MIRRORS.m15).focal;

  return {
    ok: true,
    fMean: sigFig(fMean, 4),
    fFromGraph: fFromGraph ? sigFig(fFromGraph, 4) : null,
    slope: fit ? sigFig(fit.slope, 3) : null,
    r2: fit ? Number(fit.r2.toFixed(4)) : null,
    radiusOfCurvature: sigFig(2 * fMean, 4),
    accepted,
    acceptedR: 2 * accepted,
    spread: Number((Math.max(...each) - Math.min(...each)).toFixed(2)),
    n: usable.length,
    points: pts,
  };
}

export default {
  meta, defaults, MIRRORS,
  init, step, measure, derive, validate,
  imageDistance, magnification, imageHeight, radiusOfCurvature, sharpness,
};
