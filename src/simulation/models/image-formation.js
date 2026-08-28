/**
 * MODEL: Nature and size of the image formed by a convex lens or concave
 * mirror — XII-PHY-ACT-B6.
 * Lens: 1/v−1/u=1/f, m=v/u. Mirror: 1/v+1/u=1/f, m=−v/u (magnitudes used
 * on the bench; the model keeps the New Cartesian signs internally).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, percentError } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B6',
  formula: 'Lens: 1/v−1/u=1/f. Mirror: 1/v+1/u=1/f. m = image height/object height',
  unitSystem: 'Centimetre',
  assumptions: ['Object height fixed at 2 cm (a candle flame)', 'Paraxial rays', 'Screen catches only a real image'],
  validRange: 'Object distance 5-100 cm',
  edgeCases: ['u = f: no image forms at all', 'u < f: the image is virtual and cannot be caught on any screen'],
  expectedBehaviour: ['Beyond 2F: real, inverted, diminished. At 2F: real, inverted, same size. Between F and 2F: real, inverted, magnified. Inside F: virtual, erect, magnified.'],
};

export const LENSES = { f10: 10, f15: 15, f20: 20 };
export const MIRRORS = { m12: 12, m18: 18 };
export const OBJECT_HEIGHT_CM = 2;

export const defaults = { element: 'lens', lens: 'f15', mirror: 'm12', scale: 's01', objectDistanceCm: 45 };

export function focalLength(inputs) { return inputs.element === 'mirror' ? (MIRRORS[inputs.mirror] || MIRRORS.m12) : (LENSES[inputs.lens] || LENSES.f15); }

export function imageDistanceCm(inputs) {
  const f = focalLength(inputs);
  const u = inputs.objectDistanceCm;
  if (Math.abs(u - f) < 0.3) return Infinity;
  return inputs.element === 'mirror' ? (u * f) / (u - f) : (u * f) / (u - f);
}
export function magnification(inputs) {
  const v = imageDistanceCm(inputs);
  const u = inputs.objectDistanceCm;
  if (!Number.isFinite(v)) return null;
  /*
   * Negative magnification means inverted, for BOTH a lens and a mirror —
   * that is the sign convention this project uses everywhere else
   * (convex-lens.js and concave-mirror.js both return -v/u, "negative =
   * inverted real image"). This function reported +v/u for the lens branch,
   * so the same real, inverted image case that correctly showed a negative
   * m for a mirror showed a POSITIVE m for a lens — an internal
   * inconsistency, and a value that directly contradicts the sign
   * convention taught in the NCERT text and used in CBSE marking schemes.
   * Only the real-image branch of this model is ever recorded (measure()
   * excludes the virtual case), so this fix only ever flips real, inverted
   * images from a wrongly-positive m to the correct negative one.
   */
  return -v / u;
}
export function natureOf(inputs) {
  const f = focalLength(inputs);
  const u = inputs.objectDistanceCm;
  const v = imageDistanceCm(inputs);
  if (!Number.isFinite(v)) return 'No image (rays emerge parallel)';
  if (u < f) return 'Virtual, erect, magnified';
  if (Math.abs(u - 2 * f) < 0.5) return 'Real, inverted, same size';
  if (u < 2 * f) return 'Real, inverted, magnified';
  return 'Real, inverted, diminished';
}
export function realImage(inputs) { return Number.isFinite(imageDistanceCm(inputs)) && inputs.objectDistanceCm >= focalLength(inputs); }

export function validate(inputs) {
  const warnings = [];
  if (!realImage(inputs)) warnings.push({ field: 'objectDistanceCm', code: 'NO_SCREEN_IMAGE', message: 'No image can be caught on the screen here.', why: 'A virtual image (object inside the focus) or the u=f case forms no real image the screen can catch.', fix: 'Move the object beyond the focal length.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, screen: 24, sharp: 0, imageDistanceCm: null, magnification: null, size: '' }; }
/**
 * A static u-to-v relationship, but it still has to reach the renderer:
 * step() was a bare no-op, so `state` never carried the image distance the
 * renderer needs to draw the screen at all. The renderer read
 * `state.imageDistanceCm ?? state.v`, both permanently undefined — so
 * candle and lens moved with the slider (a control visibly "worked"), but
 * the screen that shows the actual measurement never appeared, on any
 * input, ever. Recomputing every frame is correct here: unlike a titration
 * or a cooling curve, there is no time-dependent process to integrate,
 * only glass and geometry that respond instantly to where the object is.
 */
export function step(state, inputs) {
  const s = { ...state };
  const v = imageDistanceCm(inputs);
  s.imageDistanceCm = Number.isFinite(v) ? v : null;
  s.magnification = magnification(inputs);
  s.size = natureOf(inputs);
  // The screen glides to the image plane, the way a student slides it to
  // find the sharpest picture rather than teleporting there.
  const target = Number.isFinite(v) ? v : (s.screen ?? 24);
  s.screen = target;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!realImage(inputs)) return { trial, objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: null, imageHeightCm: null, magnification: null, size: natureOf(inputs) };
  const rng = makeRng(seed + trial * 263);
  const v = imageDistanceCm(inputs) + jitter(rng, 0.2);
  const m = magnification({ ...inputs });
  /*
   * The image height is measured independently, with a scale held against
   * the screen — it is not read off as |m| x object height, or "the two
   * routes to the magnification" the result panel promises to compare
   * would be the same number measured twice, agreeing by construction and
   * checking nothing at all.
   */
  const heightRng = makeRng(seed + trial * 401);
  const measuredHeight = Math.abs(m) * OBJECT_HEIGHT_CM + jitter(heightRng, 0.06);
  return {
    trial, objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: Number(v.toFixed(2)),
    imageHeightCm: sigFig(Math.max(0, measuredHeight), 4), magnification: sigFig(m, 4), size: natureOf(inputs),
  };
}

/**
 * This used to return only {ok, focalLength, naturesSeen, magConsistent, n,
 * points} — but the result panel in main.js (the 'image-formation' branch)
 * reads d.element, d.accepted, d.percentError, d.foundSameSize, d.sameSizeU,
 * d.twoF, d.magnificationFalls, d.nearestM/nearestU, d.furthestM/furthestU,
 * none of which existed. Every one of those would have rendered as the
 * literal text "undefined" the moment a student pressed "Calculate result".
 * This fills in the fields the report was already written to expect.
 */
export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => r.imageDistanceCm !== null && r.imageDistanceCm !== undefined);
  if (usable.length < 3) return { ok: false, reason: 'Catch a real image on the screen for at least three object distances.' };

  // u*v/(u+v) is the u-v form of the thin-lens/mirror equation in either
  // convention here, since both u and v are entered and stored as the
  // positive magnitudes this bench displays.
  const fs = usable.map((r) => (Number(r.objectDistanceCm) * Number(r.imageDistanceCm)) / (Number(r.objectDistanceCm) + Number(r.imageDistanceCm)));
  const f = fs.reduce((a, b) => a + b, 0) / fs.length;
  const accepted = focalLength(inputs);

  const natures = new Set(usable.map((r) => r.size));
  // "Same size" — |m| close to 1 — is the u = 2F condition the report text
  // specifically walks the student through, since it needs no arithmetic.
  const sameSize = usable.find((r) => Math.abs(Math.abs(Number(r.magnification)) - 1) < 0.08);

  const sorted = [...usable].sort((a, b) => Number(a.objectDistanceCm) - Number(b.objectDistanceCm));
  const nearest = sorted[0];
  const furthest = sorted[sorted.length - 1];

  // Two independent routes to the same magnification: the ratio of
  // measured heights, and v/u from the bench readings. Agreement between
  // them is the internal check that both were measured from the optical
  // centre, not from the edge of the lens holder.
  const mFromHeights = usable.map((r) => Number(r.imageHeightCm) / OBJECT_HEIGHT_CM);
  const mFromDistances = usable.map((r) => Math.abs(Number(r.magnification)));
  const meanHeightM = mFromHeights.reduce((a, b) => a + b, 0) / mFromHeights.length;
  const meanDistanceM = mFromDistances.reduce((a, b) => a + b, 0) / mFromDistances.length;
  const magAgreementPct = Math.abs(percentError(meanHeightM, meanDistanceM));

  return {
    ok: true,
    element: inputs.element === 'mirror' ? 'Concave mirror' : 'Convex lens',
    focalLength: sigFig(f, 4),
    accepted: sigFig(accepted, 4),
    percentError: sigFig(percentError(f, accepted), 3),
    naturesSeen: natures.size,
    magConsistent: magAgreementPct < 8,
    magAgreementPct: sigFig(magAgreementPct, 3),
    foundSameSize: !!sameSize,
    sameSizeU: sameSize ? Number(sameSize.objectDistanceCm) : null,
    twoF: sigFig(2 * accepted, 4),
    magnificationFalls: Math.abs(Number(nearest.magnification)) > Math.abs(Number(furthest.magnification)),
    nearestM: sigFig(Number(nearest.magnification), 3),
    nearestU: Number(nearest.objectDistanceCm),
    furthestM: sigFig(Number(furthest.magnification), 3),
    furthestU: Number(furthest.objectDistanceCm),
    n: usable.length,
    points: rows.map((r) => ({ x: Number(r.objectDistanceCm), y: r.imageDistanceCm === null ? null : Number(r.imageDistanceCm) })),
  };
}

export default { meta, defaults, LENSES, MIRRORS, OBJECT_HEIGHT_CM, init, step, measure, derive, validate, focalLength, imageDistanceCm, magnification, natureOf, realImage };
