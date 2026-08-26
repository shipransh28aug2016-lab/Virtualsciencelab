/**
 * MODEL: Making a paper scale of a given least count — XI-PHY-ACT-A1
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 1.
 * L.C. = scale length / divisions; max error = ±L.C./2.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A1',
  formula: 'L.C. = length / divisions; max error = ±L.C./2',
  unitSystem: 'Centimetre',
  assumptions: ['Divisions are marked accurately and evenly', 'The object is aligned with the zero of the scale'],
  validRange: 'Least count 0.1-1.0 cm',
  edgeCases: ['A coarse scale gives a large error relative to a small object'],
  expectedBehaviour: ['A finer least count gives a smaller maximum error', 'The percentage error is larger for a shorter object at the same least count'],
};

export const SCALES = { lc10: { label: '1 cm divisions', lc: 1.0 }, lc05: { label: '0.5 cm divisions', lc: 0.5 }, lc02: { label: '0.2 cm divisions', lc: 0.2 }, lc01: { label: '0.1 cm divisions', lc: 0.1 } };
export const OBJECTS = { pencil: { label: 'Pencil', trueCm: 11.34 }, eraser: { label: 'Eraser', trueCm: 4.62 }, card: { label: 'Index card', trueCm: 12.70 }, clip: { label: 'Paper clip', trueCm: 3.28 }, spoon: { label: 'Spoon', trueCm: 14.80 } };

export const defaults = { scale: 'lc02', object: 'pencil' };

export function scaleOf(inputs) { return SCALES[inputs.scale] || SCALES.lc02; }
export function objectOf(inputs) { return OBJECTS[inputs.object] || OBJECTS.pencil; }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 107);
  const lc = scaleOf(inputs).lc;
  const trueLen = objectOf(inputs).trueCm;
  const reading = toLeastCount(trueLen + jitter(rng, lc * 0.35), lc);
  const maxError = lc / 2;
  return { trial, object: objectOf(inputs).label, leastCount: lc, divisions: Math.round(reading / lc), reading, maxError, percentError: sigFig((maxError / reading) * 100, 3) };
}

export function derive(rows) {
  if (rows.length < 3) return { ok: false, reason: 'Take at least three readings.' };
  const vals = rows.map((r) => Number(r.reading));
  return { ok: true, meanReading: sigFig(mean(vals), 4), leastCount: Number(rows[0].leastCount), maxError: Number(rows[0].maxError), n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.reading) })) };
}

export default { meta, defaults, SCALES, OBJECTS, init, step, measure, derive, validate, scaleOf, objectOf };
