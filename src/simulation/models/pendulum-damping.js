/**
 * MODEL: Dissipation of energy of a simple pendulum — XI-PHY-ACT-A7
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 7.
 * Amplitude decays exponentially, θ(t) = θ0·e^(−bt); energy ∝ amplitude²,
 * so amplitude² decays with decay constant 2b and ln(amplitude²) is linear
 * in time with slope −2b.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A7',
  formula: 'θ(t) = θ0 e^(−bt); ln(amplitude²) linear in t, slope −2b',
  unitSystem: 'Centimetre for amplitude, second for time',
  assumptions: ['Damping is light, so the period is essentially unaffected', 'Air resistance (or drag) is the dominant loss', 'The pendulum swings in one vertical plane only'],
  validRange: 'Initial amplitude 4-20 cm',
  edgeCases: ['A draught increases the damping constant markedly', 'A pith bob (light, large area) damps much faster than a dense brass bob'],
  expectedBehaviour: ['Amplitude squared decays exponentially with time', 'A denser bob of the same size damps more slowly'],
};

export const G_TRUE = 9.792;
export const BOBS = { brass: { label: 'Brass bob', b: 0.0062 }, steel: { label: 'Steel bob', b: 0.0048 }, wood: { label: 'Wood bob', b: 0.0180 }, pith: { label: 'Pith ball (light)', b: 0.0410 } };
export const MEDIA = { air: { label: 'Still air', mult: 1 }, draught: { label: 'In a draught', mult: 2.4 } };

export const defaults = { initialAmplitudeCm: 12, lengthCm: 100, bob: 'brass', medium: 'air' };

export function bobOf(inputs) { return BOBS[inputs.bob] || BOBS.brass; }
export function decayConstant(inputs) { return bobOf(inputs).b * (MEDIA[inputs.medium] || MEDIA.air).mult; }
export function amplitudeAt(inputs, t) { return inputs.initialAmplitudeCm * Math.exp(-decayConstant(inputs) * t); }
export function periodOf(inputs) { return 2 * Math.PI * Math.sqrt(inputs.lengthCm / 100 / G_TRUE); }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, running: true, angle: 0, amplitude: 0, envelope: 1 }; }
/**
 * A damped pendulum. The envelope decays exponentially with the decay
 * constant of the bob-and-medium combination, and the swing inside it runs
 * at the pendulum's own period -- so the graph of amplitude against time
 * on screen is the graph the student is asked to plot.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.running) return s;
  const T = periodOf(inputs);
  /*
   * `a0` used to read `inputs.startAmplitudeDeg`, a field that does not
   * exist anywhere in this experiment (the real control is
   * `initialAmplitudeCm`, and this activity measures a linear displacement
   * on a scale beneath the bob, not an angle in degrees) -- so a0 was
   * always the hardcoded fallback of 15, and the whole on-screen swing and
   * its decay ignored the amplitude the student actually set.
   */
  const a0 = inputs.initialAmplitudeCm ?? defaults.initialAmplitudeCm;
  s.envelope = amplitudeAt(inputs, s.t) / Math.max(1e-6, a0);
  s.amplitude = a0 * s.envelope; // cm of horizontal displacement, not degrees
  s.angle = s.amplitude * Math.cos((2 * Math.PI * s.t) / Math.max(0.2, T)); // cm
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 137);
  const t = (trial - 1) * periodOf(inputs) * 4; // sample every four periods
  const amp = amplitudeAt(inputs, t) + jitter(rng, 0.06);
  const ampSq = Math.max(0.0001, amp * amp);
  return { trial, timeS: Number(t.toFixed(1)), amplitude: Number(amp.toFixed(2)), amplitudeSq: Number(ampSq.toFixed(3)), lnAmpSq: Number(Math.log(ampSq).toFixed(4)), energyMJ: sigFig(ampSq * 0.05, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 4) return { ok: false, reason: 'Record the amplitude at at least four different times.' };
  const pts = rows.map((r) => ({ x: Number(r.timeS), y: Number(r.lnAmpSq) }));
  const fit = linearFit(pts);
  if (!fit) return { ok: false, reason: 'Vary the elapsed time between readings.' };
  const b = -fit.slope / 2;
  const halfLife = Math.log(2) / (2 * b);
  const first = Number(rows[0].amplitudeSq);
  const last = Number(rows[rows.length - 1].amplitudeSq);
  const times = rows.map((r) => Number(r.timeS));
  return {
    ok: true, dampingConstant: sigFig(b, 4), halfLifeS: sigFig(halfLife, 4), halfLifeMin: sigFig(halfLife / 60, 4),
    accepted: sigFig(decayConstant(inputs), 4), energyLostPercent: sigFig(((first - last) / first) * 100, 4),
    r2: Number(fit.r2.toFixed(4)), n: rows.length,
    elapsedS: sigFig(Math.max(...times) - Math.min(...times), 4),
    bob: bobOf(inputs).label, medium: (MEDIA[inputs.medium] || MEDIA.air).label,
    initialAmplitude: Number(rows[0].amplitude), finalAmplitude: Number(rows[rows.length - 1].amplitude),
    period: sigFig(periodOf(inputs), 4),
    points: rows.map((r) => ({ x: Number(r.timeS), y: Number(r.amplitudeSq) })),
  };
}

export default { meta, defaults, BOBS, MEDIA, G_TRUE, init, step, measure, derive, validate, bobOf, decayConstant, amplitudeAt, periodOf };
