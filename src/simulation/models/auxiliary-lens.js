/**
 * MODEL: Auxiliary convex lens methods — XII-PHY-B02 and XII-PHY-B04.
 *
 * TWO official CBSE practicals:
 *   XII-PHY-B02  focal length of a CONVEX MIRROR using a convex lens
 *   XII-PHY-B04  focal length of a CONCAVE LENS using a convex lens
 *
 * CBSE Physics (042) 2026-27, Class XII, Unit VI, Chapter 9: Ray Optics.
 *
 * WHY AN AUXILIARY LENS IS NEEDED AT ALL.
 * A convex mirror and a concave lens are both DIVERGING. On their own they can
 * only ever form a virtual image, which cannot be caught on a screen and so
 * cannot be located by removing parallax against a screen. The trick in both
 * experiments is to use a converging lens to first produce a real image I1,
 * and then to insert the diverging element so that I1 becomes a VIRTUAL OBJECT
 * for it. A virtual object lets a diverging element form a real image, which
 * can then be located directly.
 *
 * CONVEX MIRROR (B02).
 * The convex lens forms a real image I1. The convex mirror is then placed
 * between lens and I1. When the mirror is at exactly the right place, the
 * converging beam strikes it normally — every ray is heading straight for the
 * mirror's centre of curvature — so it retraces its own path and the final
 * image forms back at the object. At that setting the distance from the mirror
 * to I1 IS the radius of curvature:
 *
 *      R = (distance of I1 from lens) − (distance of mirror from lens)
 *      f = R / 2
 *
 * CONCAVE LENS (B04).
 * The convex lens forms a real image I1. The concave lens is placed between
 * the convex lens and I1, so I1 acts as a virtual object at distance u, and
 * the final real image is at v. Applying the lens formula to the concave lens
 * alone, with the real-is-positive convention and u measured as a positive
 * distance to the virtual object:
 *
 *      1/v − 1/u = 1/f   →   f = uv/(u − v)
 *
 * and f comes out NEGATIVE, as it must for a diverging lens. A real final
 * image only exists while u < |f|; beyond that the concave lens is too strong
 * and the image goes virtual again, which is exactly the constraint a student
 * discovers by sliding the lens too far.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'auxiliary-lens',
  formula: 'Convex mirror: R = v₁ − d, f = R/2.  Concave lens: 1/v − 1/u = 1/f, f = uv/(u − v) < 0',
  unitSystem: 'All distances in cm along the optical bench',
  assumptions: [
    'Thin lenses and a small-aperture mirror, so paraxial theory applies',
    'The auxiliary convex lens has a known focal length shorter than the object distance',
    'All components share one principal axis at the same height',
    'Index corrections for the uprights have been applied',
  ],
  validRange: 'Object 25 to 60 cm from the convex lens; auxiliary lens f = 15 to 25 cm',
  edgeCases: [
    'A diverging element alone cannot form a real image — the auxiliary lens is essential',
    'For the concave lens the virtual object must be nearer than |f|, else no real image forms',
    'With the convex mirror at the null position the light retraces its path exactly',
    'If the object is inside the focus of the convex lens there is no I1 to work with',
  ],
  expectedBehaviour: [
    'The recovered focal length of the concave lens is negative',
    'The recovered focal length of the convex mirror is positive with R = 2f',
    'Every valid row of the table gives the same focal length',
    'Removing the diverging element restores the image to I1',
  ],
};

/** The auxiliary converging lenses available. */
export const LENSES = {
  L20: { label: 'Convex lens f = 20 cm', focal: 20 },
  L15: { label: 'Convex lens f = 15 cm', focal: 15 },
  L25: { label: 'Convex lens f = 25 cm', focal: 25 },
};

/** The diverging elements under test. */
export const ELEMENTS = {
  cm25: { label: 'Convex mirror A', kind: 'mirror', focal: 25, kindLabel: 'convex mirror' },
  cm15: { label: 'Convex mirror B', kind: 'mirror', focal: 15, kindLabel: 'convex mirror' },
  cl15: { label: 'Concave lens A', kind: 'lens', focal: -15, kindLabel: 'concave lens' },
  cl20: { label: 'Concave lens B', kind: 'lens', focal: -20, kindLabel: 'concave lens' },
};

export const defaults = {
  lens: 'L20',
  element: 'cm25',
  objectDistanceCm: 30,      // object to the convex lens
  elementPositionCm: 10,     // diverging element measured from the convex lens
  benchLC: 0.1,
};

/** Distance of the auxiliary lens's own real image I1 from that lens. */
export function firstImageCm(inputs = defaults) {
  const f = (LENSES[inputs.lens] || LENSES.L20).focal;
  const u = Number(inputs.objectDistanceCm);
  if (!(u > f)) return null;                 // object inside the focus: no real I1
  return 1 / (1 / f - 1 / u);
}

/**
 * Convex mirror: the null position is where the mirror's centre of curvature
 * coincides with I1, so the converging beam strikes it normally.
 */
export function nullPositionCm(inputs = defaults) {
  const el = ELEMENTS[inputs.element] || ELEMENTS.cm25;
  const v1 = firstImageCm(inputs);
  if (v1 === null || el.kind !== 'mirror') return null;
  const R = 2 * el.focal;
  const pos = v1 - R;
  return pos > 0 ? pos : null;               // mirror would have to be behind the lens
}

/** How close the mirror is to retracing the path, 0 to 1. */
export function retraceQuality(inputs = defaults) {
  const target = nullPositionCm(inputs);
  if (target === null) return 0;
  const d = Number(inputs.elementPositionCm) - target;
  return 1 / (1 + (d / 1.6) ** 2);
}

/**
 * Concave lens: I1 is a virtual object at distance u beyond the concave lens.
 * Returns null when no real final image exists.
 */
export function finalImageCm(inputs = defaults) {
  const el = ELEMENTS[inputs.element] || ELEMENTS.cl15;
  const v1 = firstImageCm(inputs);
  if (v1 === null || el.kind !== 'lens') return null;
  const u = v1 - Number(inputs.elementPositionCm);   // virtual object distance
  if (!(u > 0)) return null;                          // element past I1
  const inv = 1 / el.focal + 1 / u;
  if (!(inv > 0)) return null;                        // u ≥ |f| → still virtual
  return 1 / inv;
}

/** Virtual object distance for the concave lens. */
export function virtualObjectCm(inputs = defaults) {
  const v1 = firstImageCm(inputs);
  if (v1 === null) return null;
  const u = v1 - Number(inputs.elementPositionCm);
  return u > 0 ? u : null;
}

/** Focal length recovered from one pair of readings. f = uv/(u − v). */
export function focalFromReadings(u, v) {
  if (!(u > 0) || !(v > 0) || Math.abs(u - v) < 1e-9) return null;
  return (u * v) / (u - v);
}

export function validate(inputs = defaults) {
  const errors = [];
  const warnings = [];
  const el = ELEMENTS[inputs.element] || ELEMENTS.cm25;
  const lens = LENSES[inputs.lens] || LENSES.L20;
  const u = Number(inputs.objectDistanceCm);

  if (!Number.isFinite(u) || u <= 0) {
    errors.push({ field: 'objectDistanceCm', message: 'The object distance must be positive.' });
  } else if (u <= lens.focal) {
    errors.push({
      field: 'objectDistanceCm',
      code: 'NO_FIRST_IMAGE',
      message: 'The convex lens forms no real image.',
      why: `The object is inside the focus of the ${lens.label}, so the lens produces a virtual image. The whole method depends on first having a real image I₁ to work with.`,
      fix: `Move the object beyond ${lens.focal} cm; about 1.5 times the focal length works well.`,
    });
  }

  const v1 = firstImageCm(inputs);
  if (el.kind === 'mirror') {
    const nullPos = nullPositionCm(inputs);
    if (v1 !== null && nullPos === null) {
      warnings.push({
        field: 'element',
        code: 'MIRROR_CANNOT_REACH',
        message: 'The radius of curvature is larger than the distance to I₁.',
        why: `The mirror must stand between the lens and I₁ at a distance R from I₁, but R = ${2 * el.focal} cm is more than the ${v1.toFixed(1)} cm to I₁, so there is no room.`,
        fix: 'Move the object closer to the lens so I₁ forms further away, or use a mirror of smaller radius.',
      });
    }
  } else if (v1 !== null) {
    const uv = virtualObjectCm(inputs);
    if (uv === null) {
      warnings.push({
        field: 'elementPositionCm',
        code: 'PAST_FIRST_IMAGE',
        message: 'The concave lens is beyond I₁.',
        why: 'The method needs I₁ to lie behind the concave lens so that it acts as a virtual object. With the lens past I₁ the light has already converged and diverged again.',
        fix: `Keep the concave lens closer to the convex lens than ${v1.toFixed(1)} cm.`,
      });
    } else if (uv >= Math.abs(el.focal)) {
      warnings.push({
        field: 'elementPositionCm',
        code: 'NO_REAL_IMAGE',
        message: 'No real image is formed — the virtual object is too far away.',
        why: `A diverging lens forms a real image from a virtual object only while that object is nearer than its focal length. Here the virtual object is ${uv.toFixed(1)} cm away but |f| is only ${Math.abs(el.focal)} cm, so the emerging beam still diverges.`,
        fix: `Slide the concave lens further from the convex lens, so the virtual object distance falls below ${Math.abs(el.focal)} cm.`,
      });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Everything the renderer needs to draw the actual two-stage construction
 * (object -> real convex-lens image I1 -> diverging element -> final
 * image), resolved here because renderers never import models in this
 * codebase. Without this the scene had no way to know whether the
 * mounted element is a mirror or a lens, where I1 falls, or how close to
 * the null/real-image condition the current setting is — which is why it
 * previously fell back to drawing neither correctly.
 */
function sceneFields(inputs) {
  const lens = LENSES[inputs.lens] || LENSES.L20;
  const el = ELEMENTS[inputs.element] || ELEMENTS.cm25;
  return {
    lensFocalCm: lens.focal,
    lensLabel: lens.label,
    elementKind: el.kind,
    elementLabel: el.label,
    elementFocalCm: el.focal,
    elementKindLabel: el.kindLabel,
    firstImageCm: firstImageCm(inputs),
    nullPositionCm: el.kind === 'mirror' ? nullPositionCm(inputs) : null,
    finalImageCm: el.kind === 'lens' ? finalImageCm(inputs) : null,
    virtualObjectCm: el.kind === 'lens' ? virtualObjectCm(inputs) : null,
  };
}

export function init(inputs = defaults) {
  return { t: 0, running: true, quality: retraceQuality(inputs), ...sceneFields(inputs) };
}

export function step(state, inputs = defaults, dt = 1 / 60) {
  return { ...state, t: state.t + dt, quality: retraceQuality(inputs), ...sceneFields(inputs) };
}

/**
 * Record a reading. Refused when the arrangement produces nothing to measure:
 * no real image for the lens case, or the mirror away from the null position.
 */
export function measure(state, inputs = defaults, seed = 1, trial = 1) {
  const el = ELEMENTS[inputs.element] || ELEMENTS.cm25;
  const v1 = firstImageCm(inputs);
  if (v1 === null) return null;

  const rng = makeRng(seed + trial * 23 + Math.round(Number(inputs.objectDistanceCm)));
  const lc = inputs.benchLC ?? 0.1;

  if (el.kind === 'mirror') {
    if (retraceQuality(inputs) < 0.5) return null;      // not at the null position
    const pos = toLeastCount(Number(inputs.elementPositionCm) + jitter(rng, lc * 0.9), lc);
    const i1 = toLeastCount(v1 + jitter(rng, lc * 0.9), lc);
    const R = i1 - pos;
    return {
      trial,
      objectDistanceCm: Number(inputs.objectDistanceCm),
      firstImageCm: i1,
      elementPositionCm: pos,
      radiusCm: Number(R.toFixed(2)),
      focalCm: Number((R / 2).toFixed(2)),
      element: el.label,
    };
  }

  const uv = virtualObjectCm(inputs);
  const fv = finalImageCm(inputs);
  if (uv === null || fv === null) return null;
  const uObs = toLeastCount(uv + jitter(rng, lc * 0.9), lc);
  const vObs = toLeastCount(fv + jitter(rng, lc * 0.9), lc);
  const f = focalFromReadings(uObs, vObs);
  return {
    trial,
    objectDistanceCm: Number(inputs.objectDistanceCm),
    firstImageCm: Number(v1.toFixed(1)),
    elementPositionCm: Number(inputs.elementPositionCm),
    virtualObjectCm: uObs,
    finalImageCm: vObs,
    focalCm: f === null ? null : Number(f.toFixed(2)),
    element: el.label,
  };
}

export function derive(rows, inputs = defaults) {
  const el = ELEMENTS[inputs.element] || ELEMENTS.cm25;
  const usable = rows.filter((r) => Number.isFinite(Number(r.focalCm)));
  if (usable.length < 2) return { ok: false, reason: 'Record at least two settings.' };

  const fs = usable.map((r) => Number(r.focalCm));
  const fMean = mean(fs);
  const spread = Math.max(...fs) - Math.min(...fs);

  if (el.kind === 'mirror') {
    const Rs = usable.map((r) => Number(r.radiusCm));
    return {
      ok: true,
      mode: 'convex-mirror',
      focalLength: sigFig(fMean, 4),
      radiusOfCurvature: sigFig(mean(Rs), 4),
      accepted: el.focal,
      acceptedR: 2 * el.focal,
      spread: Number(spread.toFixed(2)),
      element: el.label,
      n: usable.length,
      points: usable.map((r) => ({ x: Number(r.elementPositionCm), y: Number(r.radiusCm) })),
    };
  }

  return {
    ok: true,
    mode: 'concave-lens',
    focalLength: sigFig(fMean, 4),
    power: sigFig(100 / fMean, 3),
    accepted: el.focal,
    diverging: fMean < 0,
    spread: Number(spread.toFixed(2)),
    element: el.label,
    n: usable.length,
    points: usable.map((r) => ({ x: Number(r.virtualObjectCm), y: Number(r.finalImageCm) })),
  };
}

export default {
  meta, defaults, LENSES, ELEMENTS,
  init, step, measure, derive, validate,
  firstImageCm, nullPositionCm, retraceQuality, finalImageCm, virtualObjectCm, focalFromReadings,
};
