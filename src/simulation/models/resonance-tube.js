/**
 * MODEL: Speed of sound by resonance tube — XI-PHY-B10
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 10.
 * l1+e = λ/4; l2+e = 3λ/4; v = 2f(l2−l1); e = (l2−3l1)/2.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';
import { nullPoint, nullRefusal } from '../null-point.js';

export const meta = {
  id: 'XI-PHY-B10',
  formula: 'v = 2f(l₂−l₁);  e = (l₂−3l₁)/2;  v(t) = 331.3 + 0.606t',
  unitSystem: 'SI: m/s; column lengths in cm',
  assumptions: ['The tube is of uniform, reasonably wide bore', 'The tuning fork is struck gently and held over the mouth without touching it', 'The water level falls slowly and smoothly'],
  validRange: 'Air column 2-98 cm; fork 256-512 Hz',
  edgeCases: ['A closed pipe resonates only at odd multiples of the fundamental', 'The end correction is a genuine physical effect, not a mistake to eliminate'],
  expectedBehaviour: ['The second resonance length is close to three times the first, plus twice the end correction', 'v tracks the accepted v(t) = 331.3 + 0.606t'],
};

export function speedOfSoundAt(tempC) { return 331.3 + 0.606 * tempC; }

export const FORKS = { f256: 256, f288: 288, f320: 320, f384: 384, f512: 512 };
export const TUBE_RADIUS_CM = 2.0;
export const END_CORRECTION_CM = 0.3 * TUBE_RADIUS_CM * 2; // e ≈ 0.3d for an unflanged tube, roughly

export const defaults = { airColumnCm: 16, fork: 'f512', tempC: 27 };

export function frequencyHz(inputs) { return FORKS[inputs.fork] || FORKS.f512; }
export function wavelengthCm(inputs) { return (speedOfSoundAt(inputs.tempC) * 100) / frequencyHz(inputs); }
export function firstResonanceCm(inputs) { return wavelengthCm(inputs) / 4 - END_CORRECTION_CM; }
export function secondResonanceCm(inputs) { return (3 * wavelengthCm(inputs)) / 4 - END_CORRECTION_CM; }

export function nearestResonance(inputs) {
  const l1 = firstResonanceCm(inputs);
  const l2 = secondResonanceCm(inputs);
  return Math.abs(inputs.airColumnCm - l1) <= Math.abs(inputs.airColumnCm - l2) ? { n: 1, target: l1 } : { n: 2, target: l2 };
}
export function atResonance(inputs) {
  const { target } = nearestResonance(inputs);
  return Math.abs(inputs.airColumnCm - target) <= 0.5;
}

/**
 * How loud the note is. A resonance tube is found by ear: the note swells as
 * the column approaches a resonant length and dies away past it.
 */
export function nullIndicator(inputs) {
  const { n, target } = nearestResonance(inputs);
  return nullPoint({
    label: `Note (resonance ${n})`,
    current: inputs.airColumnCm,
    target,
    tolerance: 0.5,
    increase: 'The note is weak — lower the water level to lengthen the air column.',
    decrease: 'The note is weak — raise the water level to shorten the air column.',
    atNullText: 'loudest — the column is resonating',
    awayFrom: 'faint',
  });
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!atResonance(inputs)) warnings.push({ field: 'airColumnCm', code: 'NOT_RESONANT', message: 'The air column is not at a resonant length.', why: 'Lower or raise the water level slowly until the sound is loudest.', fix: 'Move the slider until the tube resonates.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, levelCm: 5, phase: 0, loudness: 0, resonant: false }; }
/**
 * The resonance tube. The air column is tuned by raising the water level;
 * loudness peaks sharply when the column length matches an odd quarter
 * wavelength, and the standing wave in the tube runs at the fork's
 * frequency. Both are computed, so the loud point on screen is the loud
 * point in the arithmetic.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = inputs.waterLevelCm ?? state.levelCm ?? 5;
  s.levelCm += (target - s.levelCm) * Math.min(1, dt * 2.2);
  const near = nearestResonance(inputs, s.levelCm);
  const miss = Math.abs(near?.missCm ?? 99);
  // A sharp resonance: a centimetre off and it is markedly quieter.
  // A floor: the column always responds a little, resonance makes it loud.
  s.loudness = 0.1 + 0.9 / (1 + (miss / 1.1) ** 2);
  s.resonant = s.loudness > 0.75;
  s.phase = (s.phase + dt * 9) % (Math.PI * 2);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!atResonance(inputs)) return { v: null, reason: nullRefusal(nullIndicator(inputs)) };
  const rng = makeRng(seed + trial * 103);
  const { n, target } = nearestResonance(inputs);
  const reading = Number((target + jitter(rng, 0.12)).toFixed(2));
  return { trial, resonanceNumber: n, airColumnCm: reading, frequency: frequencyHz(inputs), tempC: inputs.tempC };
}

export function derive(rows, inputs = defaults) {
  const first = rows.find((r) => r.resonanceNumber === 1);
  const second = rows.find((r) => r.resonanceNumber === 2);
  if (!first || !second) {
    /*
     * Say which one is missing and where to look for it.
     *
     * "Record both the first and second resonance positions" is true and
     * unusable: a student standing at the first one has no way of knowing
     * that the next is near three times that length, and a student with
     * neither does not know the tube resonates twice. The three-to-one
     * relation between l₁ and l₂ is the thing this practical is teaching, so
     * naming it is teaching rather than answering — the length itself still
     * has to be found by ear.
     */
    if (first) {
      return {
        ok: false,
        reason: `The first resonance is recorded at ${Number(first.airColumnCm).toFixed(1)} cm. Now lower the water level further, past the quiet stretch, until the note is loud again — the second resonance is near three times the first.`,
      };
    }
    if (second) {
      return {
        ok: false,
        reason: `The second resonance is recorded at ${Number(second.airColumnCm).toFixed(1)} cm. Raise the water level back up until the note is loud again — the first resonance is near a third of the second.`,
      };
    }
    return { ok: false, reason: 'Move the water level until the note from the fork is loudest, and record that air column. The tube resonates twice over its length: record the first and the second.' };
  }
  /*
   * Both resonances must belong to the SAME fork.
   *
   * v = 2f(l2 - l1) assumes l1 and l2 are the quarter- and three-quarter-
   * wave positions of one standing wave. A student who changes the fork
   * between the two readings is measuring two different wavelengths, and the
   * arithmetic below quietly produces a number anyway — with a 256 Hz first
   * resonance and a 512 Hz second it comes out at exactly half the speed of
   * sound, 174 m/s instead of 348, looking every bit as plausible as a
   * correct result.
   */
  if (Number(first.frequency) !== Number(second.frequency)) {
    return {
      ok: false,
      reason: `The first resonance was found with the ${first.frequency} Hz fork and the second with the ${second.frequency} Hz fork. Both positions belong to one standing wave, so they must be found with the same fork — find l₁ and l₂ for one fork before changing it.`,
    };
  }
  /* And at the same room temperature, for the same reason: the speed of
     sound rises by about 0.6 m/s per degree, so two positions found in
     different rooms are two different wavelengths. */
  if (Number(first.tempC) !== Number(second.tempC)) {
    return {
      ok: false,
      reason: `The first resonance was found at ${first.tempC} °C and the second at ${second.tempC} °C. The speed of sound changes by about 0.6 m·s⁻¹ for every degree, so both positions must be found in the same room — read the thermometer once, at the start, and leave it.`,
    };
  }
  const l1 = Number(first.airColumnCm);
  const l2 = Number(second.airColumnCm);
  const f = Number(first.frequency);
  const speed = 2 * f * (l2 - l1) / 100;
  const e = (l2 - 3 * l1) / 2;
  /* Against the speed of sound in the room the READINGS were taken in. */
  const accepted = speedOfSoundAt(Number(first.tempC));
  /*
   * The panel shows the working: l₁ and l₂ themselves, the fork, the
   * temperature, and what the end correction should come to for a tube of
   * this bore. All five were missing, so it opened with "l₁ = undefined cm,
   * l₂ = undefined cm" above a correct speed of sound.
   */
  return {
    ok: true,
    l1: sigFig(l1, 4), l2: sigFig(l2, 4),
    frequency: f, tempC: inputs.tempC,
    speed: sigFig(speed, 4), endCorrection: sigFig(e, 3), wavelengthCm: sigFig(2 * (l2 - l1), 4),
    // e ≈ 0.6 r for a cylindrical tube open at one end.
    acceptedEndCorrection: sigFig(0.6 * TUBE_RADIUS_CM, 3),
    accepted: sigFig(accepted, 4), percentError: sigFig(((speed - accepted) / accepted) * 100, 3),
    n: rows.length, points: rows.map((r) => ({ x: Number(r.resonanceNumber), y: Number(r.airColumnCm) })),
  };
}

export default { meta, defaults, FORKS, TUBE_RADIUS_CM, END_CORRECTION_CM, init, step, measure, derive, validate, speedOfSoundAt, frequencyHz, wavelengthCm, firstResonanceCm, secondResonanceCm, atResonance, nullIndicator};
