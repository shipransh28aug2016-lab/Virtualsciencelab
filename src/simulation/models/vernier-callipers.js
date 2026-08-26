/**
 * MODEL: Vernier callipers — XI-PHY-A01
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 1.
 *
 * L.C. = 1 M.S.D. / N. The observed reading is M.S.R. + V.S.R.×L.C.; a zero
 * error (with its own sign) is then subtracted. The three bodies (sphere,
 * cylinder, beaker) each hide a true dimension that the student must find by
 * closing the jaws onto it — the slider does not simply report itself.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A01',
  formula: 'L.C. = 1 M.S.D./N; reading = M.S.R. + V.S.R.×L.C. − zero error',
  unitSystem: 'Centimetre',
  assumptions: ['The main scale is uniformly graduated', 'The jaws are undamaged and true', 'Zero error is constant over the range used'],
  validRange: 'Jaw opening 0-6 cm; least count 0.01, 0.005 or 0.002 cm',
  edgeCases: ['A jaw opening far from the specimen cannot grip it', 'Zero error larger than the reading gives a negative corrected value'],
  expectedBehaviour: ['M.S.R. + V.S.R.×L.C. reconstructs the observed reading exactly', 'Positive zero error lowers the corrected reading, negative raises it'],
};

export const CALLIPERS = {
  vc10: { label: '10 vernier divisions', n: 10, msd: 0.1 },
  vc20: { label: '20 vernier divisions', n: 20, msd: 0.1 },
  vc50: { label: '50 vernier divisions', n: 50, msd: 0.1 },
};

/** Hidden true dimensions of the specimens, by what is being measured. */
export const SPECIMENS = {
  sphere: { label: 'Steel sphere', diameter: 2.14 },
  cylinder: { label: 'Brass cylinder', diameter: 1.86, height: 3.42 },
  beaker: { label: 'Glass beaker', internal: 3.98, depth: 4.55 },
};

export const defaults = {
  calliper: 'vc10', specimen: 'sphere', measuring: 'diameter',
  jawOpening: 2.14, zeroErrorDiv: 0,
};

export function leastCount(inputs) {
  const c = CALLIPERS[inputs.calliper] || CALLIPERS.vc10;
  return c.msd / c.n;
}

/** The true dimension currently being gripped, by specimen and which dimension. */
export function trueDimension(inputs) {
  const s = SPECIMENS[inputs.specimen] || SPECIMENS.sphere;
  if (inputs.specimen === 'beaker') return inputs.measuring === 'depth' ? s.depth : s.internal;
  if (inputs.specimen === 'cylinder' && inputs.measuring === 'internal') return s.height;
  return s.diameter;
}

export function zeroErrorCm(inputs) {
  return inputs.zeroErrorDiv * leastCount(inputs);
}

/** Are the jaws closed on the specimen (within about one least count)? */
export function gripped(inputs) {
  return Math.abs(inputs.jawOpening - trueDimension(inputs)) <= Math.max(0.02, leastCount(inputs) * 3);
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!gripped(inputs)) {
    warnings.push({
      field: 'jawOpening', code: 'NOT_GRIPPED',
      message: inputs.jawOpening < trueDimension(inputs) ? 'The jaws have not reached the body yet.' : 'The jaws have been opened past the body.',
      why: 'A calliper only gives a meaningful reading when its jaws are closed gently onto the specimen.',
      fix: 'Move the jaw-opening slider until the jaws just grip the body.',
    });
  }
  if (Math.abs(inputs.zeroErrorDiv) > 0) {
    warnings.push({
      field: 'zeroErrorDiv', code: 'ZERO_ERROR',
      message: `This instrument carries a zero error of ${inputs.zeroErrorDiv} division(s).`,
      why: 'A zero error shifts every observed reading by the same amount and must be subtracted (with its own sign) from each one, not just the final mean.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, jaw: 0, gripped: false }; }
/**
 * The jaws closing onto the object. Nothing here runs on its own -- a
 * calliper is read, not watched -- but the jaws must actually travel to
 * the object's size when it is changed, or the instrument is a picture.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // trueDimension is in cm; the jaws open to it.
  const target = (trueDimension(inputs) ?? 0) / 100;
  s.jaw += (target - s.jaw) * Math.min(1, dt * 1.9);
  s.gripped = Math.abs(target - s.jaw) < 1e-5;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!gripped(inputs)) return null;
  const lc = leastCount(inputs);
  const rng = makeRng(seed + trial * 31);
  const trueVal = trueDimension(inputs);
  const observedTrue = trueVal + zeroErrorCm(inputs);
  const observed = toLeastCount(observedTrue + jitter(rng, lc * 0.6), lc);
  const vsr = Math.round((observed % (CALLIPERS[inputs.calliper] || CALLIPERS.vc10).msd) / lc);
  const msr = Number((observed - vsr * lc).toFixed(3));
  const corrected = toLeastCount(observed - zeroErrorCm(inputs), lc);
  return {
    trial,
    mainScaleReading: msr,
    vernierDivision: vsr,
    leastCount: lc,
    observed,
    zeroError: Number(zeroErrorCm(inputs).toFixed(3)),
    corrected,
  };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.corrected)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Record at least three readings of the same dimension.' };
  const m = mean(vals);
  const s = SPECIMENS[inputs.specimen] || SPECIMENS.sphere;
  let volume = null;
  if (inputs.specimen === 'sphere') volume = (4 / 3) * Math.PI * (m / 2) ** 3;
  else if (inputs.specimen === 'cylinder') volume = Math.PI * (m / 2) ** 2 * s.height;
  else if (inputs.specimen === 'beaker') volume = Math.PI * (s.internal / 2) ** 2 * s.depth;
  return {
    ok: true,
    meanValue: sigFig(m, 4),
    radius: sigFig(m / 2, 4),
    volume: volume !== null ? sigFig(volume, 4) : null,
    n: vals.length,
    spread: Number((Math.max(...vals) - Math.min(...vals)).toFixed(3)),
    points: rows.map((r, i) => ({ x: i + 1, y: Number(r.corrected) })),
  };
}

export default { meta, defaults, CALLIPERS, SPECIMENS, init, step, measure, derive, validate, leastCount, trueDimension, zeroErrorCm, gripped };
