/**
 * MODEL: Nature and size of the image formed by a convex lens or concave
 * mirror — XII-PHY-ACT-B6.
 * Lens: 1/v−1/u=1/f, m=v/u. Mirror: 1/v+1/u=1/f, m=−v/u (magnitudes used
 * on the bench; the model keeps the New Cartesian signs internally).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

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
  return inputs.element === 'mirror' ? -v / u : v / u;
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
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!realImage(inputs)) return { trial, objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: null, imageHeightCm: null, magnification: null, size: natureOf(inputs) };
  const rng = makeRng(seed + trial * 263);
  const v = imageDistanceCm(inputs) + jitter(rng, 0.2);
  const m = magnification({ ...inputs });
  return { trial, objectDistanceCm: inputs.objectDistanceCm, imageDistanceCm: Number(v.toFixed(2)), imageHeightCm: sigFig(Math.abs(m) * OBJECT_HEIGHT_CM, 4), magnification: sigFig(m, 4), size: natureOf(inputs) };
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => r.imageDistanceCm !== null);
  if (usable.length < 3) return { ok: false, reason: 'Catch a real image on the screen for at least three object distances.' };
  const fs = usable.map((r) => {
    const u = Number(r.objectDistanceCm);
    const v = Number(r.imageDistanceCm);
    return inputs.element === 'mirror' ? (u * v) / (u + v) : (u * v) / (u + v);
  });
  const f = fs.reduce((a, b) => a + b, 0) / fs.length;
  const natures = new Set(rows.map((r) => r.size));
  const twoF = usable.find((r) => Math.abs(Number(r.magnification)) - 1 < 0.15 && Math.abs(Number(r.magnification)) - 1 > -0.15);
  return { ok: true, focalLength: sigFig(f, 4), naturesSeen: natures.size, magConsistent: !!twoF, n: usable.length, points: rows.map((r) => ({ x: Number(r.objectDistanceCm), y: r.imageDistanceCm === null ? null : Number(r.imageDistanceCm) })) };
}

export default { meta, defaults, LENSES, MIRRORS, OBJECT_HEIGHT_CM, init, step, measure, derive, validate, focalLength, imageDistanceCm, magnification, natureOf, realImage };
