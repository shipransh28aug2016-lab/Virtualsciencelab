/**
 * MODEL: Speed of sound by resonance tube — XI-PHY-B10
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 10.
 * l1+e = λ/4; l2+e = 3λ/4; v = 2f(l2−l1); e = (l2−3l1)/2.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

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

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!atResonance(inputs)) warnings.push({ field: 'airColumnCm', code: 'NOT_RESONANT', message: 'The air column is not at a resonant length.', why: 'Lower or raise the water level slowly until the sound is loudest.', fix: 'Move the slider until the tube resonates.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!atResonance(inputs)) return null;
  const rng = makeRng(seed + trial * 103);
  const { n, target } = nearestResonance(inputs);
  const reading = Number((target + jitter(rng, 0.12)).toFixed(2));
  return { trial, resonanceNumber: n, airColumnCm: reading, frequency: frequencyHz(inputs), tempC: inputs.tempC };
}

export function derive(rows, inputs = defaults) {
  const first = rows.find((r) => r.resonanceNumber === 1);
  const second = rows.find((r) => r.resonanceNumber === 2);
  if (!first || !second) return { ok: false, reason: 'Record both the first and second resonance positions.' };
  const l1 = Number(first.airColumnCm);
  const l2 = Number(second.airColumnCm);
  const f = Number(first.frequency);
  const speed = 2 * f * (l2 - l1) / 100;
  const e = (l2 - 3 * l1) / 2;
  const accepted = speedOfSoundAt(inputs.tempC);
  return {
    ok: true, speed: sigFig(speed, 4), endCorrection: sigFig(e, 3), wavelengthCm: sigFig(2 * (l2 - l1), 4),
    accepted: sigFig(accepted, 4), percentError: sigFig(((speed - accepted) / accepted) * 100, 3),
    n: rows.length, points: rows.map((r) => ({ x: Number(r.resonanceNumber), y: Number(r.airColumnCm) })),
  };
}

export default { meta, defaults, FORKS, TUBE_RADIUS_CM, END_CORRECTION_CM, init, step, measure, derive, validate, speedOfSoundAt, frequencyHz, wavelengthCm, firstResonanceCm, secondResonanceCm, atResonance };
