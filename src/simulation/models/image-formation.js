
/**
 * MODEL: Nature and size of the image formed by a convex lens or concave
 * mirror — XII-PHY-ACT-B6.
 * Lens: 1/v−1/u=1/f, m=v/u. Mirror: 1/v+1/u=1/f, m=−v/u (magnitudes used
 * on the bench; the model keeps the New Cartesian signs internally).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, percentError } from '../../utils/measure.js';
import { mixedSetRefusal, specimenOfRows } from '../one-specimen.js';

export const meta = {
  id: 'XII-PHY-ACT-B6',
  formula: 'Lens: 1/v−1/u=1/f. Mirror: 1/v+1/u=1/f. m = image height/object height',
  unitSystem: 'Centimetre',
  assumptions: ['Object height fixed at 2 cm (a candle flame)', 'Paraxial rays', 'Screen catches only a real image'],
  validRange: 'Object distance 5-100 cm',
  edgeCases: ['u = f: no image forms at all', 'u < f: the image is virtual and cannot be caught on the screen'],
  expectedBehaviour: ['Beyond 2F: real, inverted, diminished. At 2F: real, inverted, same size. Between F and 2F: real, inverted, magnified. Inside F: virtual, erect, magnified.'],
};

export const LENSES = { f10: 10, f15: 15, f20: 20 };
export const MIRRORS = { m12: 12, m18: 18 };
export const OBJECT_HEIGHT_CM = 2;
export const defaults = { element: 'lens', lens: 'f15', mirror: 'm12', scale: 's01', objectDistanceCm: 45 };

/**
 * Which optical element is on the bench, named with its focal length.
 *
 * Two mirrors and three lenses sit here and their focal lengths run from
 * 10 cm to 20 cm, so a set taken across two of them averaged to a focal
 * length belonging to neither. The row has to say which one it was.
 */
export function elementLabel(inputs) {
  return inputs.element === 'mirror'
    ? `Concave mirror f = ${MIRRORS[inputs.mirror] ?? MIRRORS.m12} cm`
    : `Convex lens f = ${LENSES[inputs.lens] ?? LENSES.f15} cm`;
}
export function focalLength(inputs) { return inputs.element === 'mirror' ? (MIRRORS[inputs.mirror] || MIRRORS.m12) : (LENSES[inputs.lens] || LENSES.f15); }
export function imageDistanceCm(inputs) {
  const f = focalLength(inputs);
  const u = Number(inputs.objectDistanceCm);
  if (!Number.isFinite(u) || u <= f + 1e-9) return Infinity;
  return (u * f) / (u - f);
}
export function magnification(inputs) {
  const v = imageDistanceCm(inputs);
  const u = Number(inputs.objectDistanceCm);
  return Number.isFinite(v) && Number.isFinite(u) && u > 0 ? -v / u : null;
}
export function natureOf(inputs) {
  const f = focalLength(inputs), u = Number(inputs.objectDistanceCm), v = imageDistanceCm(inputs);
  if (!Number.isFinite(u) || u <= 0) return 'Invalid object distance';
  if (!Number.isFinite(v)) return u <= f ? 'Virtual, erect, magnified' : 'No image (rays emerge parallel)';
  if (Math.abs(u - 2 * f) < 0.5) return 'Real, inverted, same size';
  if (u < 2 * f) return 'Real, inverted, magnified';
  return 'Real, inverted, diminished';
}
export function realImage(inputs) { return Number.isFinite(imageDistanceCm(inputs)); }
export function validate(inputs) {
  const errors = [], warnings = [], u = Number(inputs.objectDistanceCm), f = focalLength(inputs);
  if (!Number.isFinite(u) || u <= 0) errors.push({ field: 'objectDistanceCm', message: 'Object distance must be positive.' });
  else if (u <= f) warnings.push({ field: 'objectDistanceCm', code: 'NO_SCREEN_IMAGE', message: 'No image can be caught on the screen here.', why: 'The object is at or inside the focus, so the rays do not form a real image on the screen.', fix: `Move the object beyond the focal length of ${f} cm.` });
  return { ok: errors.length === 0, errors, warnings };
}
export function init() { return { t: 0, screen: 24, sharp: 0, imageDistanceCm: null, magnification: null, size: '' }; }

/**
 * The optical bench is static, but the screen is not.  A student moves it
 * toward the calculated image plane; it must therefore converge over time
 * rather than teleporting there.  This also makes sharpness observable while
 * the screen passes through focus.
 */
export function step(state, inputs, dt = 1 / 60) {
  const s = { ...state };
  const v = imageDistanceCm(inputs);
  const target = Number.isFinite(v) ? v : (Number.isFinite(s.screen) ? s.screen : 24);
  const h = Math.max(0, Number(dt) || 0);
  s.screen += (target - s.screen) * Math.min(1, h * 7);
  s.imageDistanceCm = Number.isFinite(v) ? v : null;
  s.magnification = magnification(inputs);
  s.size = natureOf(inputs);
  s.sharp = Number.isFinite(v) ? Math.exp(-((s.screen - v) ** 2) / (2 * 1.8 ** 2)) : 0;
  s.t += h;
  return s;
}
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!realImage(inputs)) return { trial, element: elementLabel(inputs), objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: null, imageHeightCm: null, magnification: null, size: natureOf(inputs) };
  const rng = makeRng(seed + trial * 263), v = imageDistanceCm(inputs) + jitter(rng, 0.2), m = magnification(inputs);
  const heightRng = makeRng(seed + trial * 401);
  const measuredHeight = Math.abs(m) * OBJECT_HEIGHT_CM + jitter(heightRng, 0.06);
  return { trial, element: elementLabel(inputs), objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: Number(v.toFixed(2)), imageHeightCm: sigFig(Math.max(0, measuredHeight), 4), magnification: sigFig(m, 4), size: natureOf(inputs) };
}
export function derive(rows, inputs = defaults) {
  const mixed = mixedSetRefusal(rows, 'element', 'optical elements');
  if (mixed) return mixed;

  const usable = rows.filter((r) => r.imageDistanceCm !== null && r.imageDistanceCm !== undefined);
  if (usable.length < 3) return { ok: false, reason: 'Catch a real image on the screen for at least three object distances.' };
  const fs = usable.map((r) => (Number(r.objectDistanceCm) * Number(r.imageDistanceCm)) / (Number(r.objectDistanceCm) + Number(r.imageDistanceCm)));
  const f = fs.reduce((a, b) => a + b, 0) / fs.length, accepted = focalLength(inputs);
  const natures = new Set(usable.map((r) => r.size));
  const sameSize = usable.find((r) => Math.abs(Math.abs(Number(r.magnification)) - 1) < 0.08);
  const sorted = [...usable].sort((a, b) => Number(a.objectDistanceCm) - Number(b.objectDistanceCm));
  const nearest = sorted[0], furthest = sorted[sorted.length - 1];
  const meanHeightM = usable.reduce((a, r) => a + Number(r.imageHeightCm) / OBJECT_HEIGHT_CM, 0) / usable.length;
  const meanDistanceM = usable.reduce((a, r) => a + Math.abs(Number(r.magnification)), 0) / usable.length;
  const magAgreementPct = Math.abs(percentError(meanHeightM, meanDistanceM));
  return { ok: true, element: inputs.element === 'mirror' ? 'Concave mirror' : 'Convex lens', focalLength: sigFig(f, 4), accepted: sigFig(accepted, 4), percentError: sigFig(percentError(f, accepted), 3), naturesSeen: natures.size, magConsistent: magAgreementPct < 8, magAgreementPct: sigFig(magAgreementPct, 3), foundSameSize: !!sameSize, sameSizeU: sameSize ? Number(sameSize.objectDistanceCm) : null, twoF: sigFig(2 * accepted, 4), magnificationFalls: Math.abs(Number(nearest.magnification)) > Math.abs(Number(furthest.magnification)), nearestM: sigFig(Number(nearest.magnification), 3), nearestU: Number(nearest.objectDistanceCm), furthestM: sigFig(Number(furthest.magnification), 3), furthestU: Number(furthest.objectDistanceCm), n: usable.length, points: rows.map((r) => ({ x: Number(r.objectDistanceCm), y: r.imageDistanceCm === null ? null : Number(r.imageDistanceCm) })) };
}
export default { meta, defaults, LENSES, MIRRORS, OBJECT_HEIGHT_CM, init, step, measure, derive, validate, focalLength, imageDistanceCm, magnification, natureOf, realImage };
