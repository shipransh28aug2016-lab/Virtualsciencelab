/**
 * MODEL: Screw gauge — XI-PHY-A02
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 2.
 * L.C. = pitch/N; reading = P.S.R. + H.S.R.×L.C. − zero error; A = πd²/4.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A02',
  formula: 'L.C. = pitch/N; reading = P.S.R. + H.S.R.×L.C. − zero error; A = πd²/4',
  unitSystem: 'Millimetre; area in mm²',
  assumptions: ['Screw threads uniform, so the pitch is constant', 'The ratchet is used, so pressure is consistent', 'The specimen is not compressed'],
  validRange: '0 to 25 mm opening; pitch 0.5 or 1 mm; 50 or 100 circular divisions',
  edgeCases: ['Turning the thimble instead of the ratchet compresses a soft sheet', 'A finer gauge resolves an extra digit'],
  expectedBehaviour: ['P.S.R. + H.S.R.×L.C. reconstructs the observed reading exactly', 'Area scales with the square of the diameter'],
};

export const GAUGES = {
  sg50: { label: 'Pitch 0.5 mm, 50 div.', pitch: 0.5, n: 50 },
  sg100: { label: 'Pitch 1 mm, 100 div.', pitch: 1.0, n: 100 },
  sg50f: { label: 'Pitch 0.5 mm, 100 div.', pitch: 0.5, n: 100 },
};

export const SPECIMENS = {
  wire: { label: 'Copper wire', trueMm: 0.412, soft: false },
  thickWire: { label: 'SWG wire', trueMm: 1.220, soft: false },
  sheet: { label: 'Metal sheet', trueMm: 0.250, soft: false },
  paper: { label: 'Sheet of paper (soft)', trueMm: 0.095, soft: true },
};

export const defaults = { gauge: 'sg50', specimen: 'wire', thimble: 0.412, zeroErrorDiv: 0, useRatchet: true };

export function leastCount(inputs) {
  const g = GAUGES[inputs.gauge] || GAUGES.sg50;
  return g.pitch / g.n;
}
export function zeroErrorMm(inputs) { return inputs.zeroErrorDiv * leastCount(inputs); }
export function specimenOf(inputs) { return SPECIMENS[inputs.specimen] || SPECIMENS.wire; }

/** Compression from squeezing a soft specimen without the ratchet, mm. */
export function compressionMm(inputs) {
  return specimenOf(inputs).soft && !inputs.useRatchet ? 0.02 : 0;
}

export function gripped(inputs) {
  const lc = leastCount(inputs);
  return Math.abs(inputs.thimble - specimenOf(inputs).trueMm) <= Math.max(0.02, lc * 3);
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!gripped(inputs)) {
    warnings.push({
      field: 'thimble', code: 'NOT_GRIPPED',
      message: 'The spindle has not been brought onto the specimen.',
      why: 'Turn the thimble slider until the faces just meet the wire or sheet.',
    });
  }
  if (!inputs.useRatchet && specimenOf(inputs).soft) {
    warnings.push({
      field: 'useRatchet', code: 'COMPRESSED',
      message: 'Turning the thimble directly squeezes this soft specimen.',
      why: 'Without the ratchet’s constant, gentle pressure, a soft sheet is compressed and reads thinner than it truly is.',
      fix: 'Use the ratchet for the final turns.',
    });
  }
  if (inputs.zeroErrorDiv) {
    warnings.push({ field: 'zeroErrorDiv', code: 'ZERO_ERROR', message: `A zero error of ${inputs.zeroErrorDiv} division(s) is present.`, why: 'It shifts every observed reading and must be subtracted with its own sign.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!gripped(inputs)) return null;
  const lc = leastCount(inputs);
  const rng = makeRng(seed + trial * 37);
  const trueMm = specimenOf(inputs).trueMm - compressionMm(inputs);
  const observedTrue = trueMm + zeroErrorMm(inputs);
  const observed = toLeastCount(observedTrue + jitter(rng, lc * 0.6), lc);
  const g = GAUGES[inputs.gauge] || GAUGES.sg50;
  const hsr = Math.round((observed % g.pitch < 0 ? observed % g.pitch + g.pitch : observed % g.pitch) / lc);
  const psr = Number((observed - hsr * lc).toFixed(3));
  const corrected = toLeastCount(observed - zeroErrorMm(inputs), lc);
  return { trial, pitchScaleReading: psr, circularDivision: hsr, leastCount: lc, observed, zeroError: Number(zeroErrorMm(inputs).toFixed(3)), corrected };
}

export function derive(rows) {
  const vals = rows.map((r) => Number(r.corrected)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Record at least three readings at different places on the specimen.' };
  const m = vals.reduce((a, b) => a + b, 0) / vals.length;
  const area = Math.PI * (m / 2) ** 2;
  return {
    ok: true, meanValue: sigFig(m, 4), radius: sigFig(m / 2, 4), area: sigFig(area, 4),
    n: vals.length, spread: Number((Math.max(...vals) - Math.min(...vals)).toFixed(3)),
    points: rows.map((r, i) => ({ x: i + 1, y: Number(r.corrected) })),
  };
}

export default { meta, defaults, GAUGES, SPECIMENS, init, step, measure, derive, validate, leastCount, zeroErrorMm, specimenOf, gripped, compressionMm };
