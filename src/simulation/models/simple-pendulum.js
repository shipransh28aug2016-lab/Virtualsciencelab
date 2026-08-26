/**
 * MODEL: Simple pendulum — XI-PHY-A07 (L-T² graph) and XI-PHY-A08 (mass independence)
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiments 7 & 8.
 *
 * T = 2π√(L/g). The restoring force −mg sinθ ≈ −mgθ for small θ, and mass
 * cancels out of Newton's second law, so T does not depend on the mass of
 * the bob — that independence IS experiment A08, reusing this same model.
 *
 * The stopwatch only runs while the bob is actually swinging; the student
 * "starts timing" implicitly by letting the sim run, and each full
 * oscillation (a return to the same phase) increments the count. Once the
 * requested number of oscillations is reached the clock is frozen
 * (`finishedAt` set) and a reading can be taken.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A07',
  formula: 'T = 2π√(L/g);  T² = (4π²/g)·L',
  unitSystem: 'Length in cm (converted to m for g); time in seconds',
  assumptions: ['The amplitude is small, so sinθ ≈ θ', 'The string is light and inextensible', 'The bob is a point mass', 'Air resistance is negligible'],
  validRange: 'L 20-150 cm, amplitude up to about 15° for the small-angle approximation to hold well',
  edgeCases: ['A large amplitude makes the period noticeably longer than 2π√(L/g)', 'A very light bob is disturbed more by air resistance'],
  expectedBehaviour: ['T² is proportional to L, so the L-T² graph is a line through the origin', 'The period does not depend on the mass of the bob'],
};

export const G_TRUE = 9.792;

export const defaults = { lengthCm: 60, massG: 60, amplitudeDeg: 8, oscillations: 20 };

export function periodTrue(inputs) {
  const L = inputs.lengthCm / 100;
  const T0 = 2 * Math.PI * Math.sqrt(L / G_TRUE);
  // Large-angle correction (first term): T ≈ T0(1 + θ0²/16) in radians.
  const th = (inputs.amplitudeDeg * Math.PI) / 180;
  return T0 * (1 + (th * th) / 16);
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (inputs.amplitudeDeg > 15) {
    warnings.push({
      field: 'amplitudeDeg', code: 'LARGE_AMPLITUDE',
      message: `An amplitude of ${inputs.amplitudeDeg}° is rather large.`,
      why: 'The formula T = 2π√(L/g) assumes sinθ ≈ θ, valid only for small swings. Beyond about 15° the true period is measurably longer, and the extra time is not experimental error.',
      fix: 'Keep the amplitude under about 10°.',
    });
  }
  if (inputs.oscillations < 10) {
    warnings.push({ field: 'oscillations', code: 'FEW_OSCILLATIONS', message: 'Timing too few oscillations magnifies reaction-time error.', why: 'A fixed error in starting and stopping the stopwatch is divided by the number of oscillations timed; more oscillations dilute it.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  const T = periodTrue(inputs);
  return { t: 0, running: true, angleDeg: inputs.amplitudeDeg, stopwatch: 0, completedOscillations: 0, period: T, finishedAt: null };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  if (s.finishedAt) return s;
  const T = periodTrue(inputs);
  s.period = T;
  const omega = (2 * Math.PI) / T;
  s.t += dt;
  s.angleDeg = inputs.amplitudeDeg * Math.cos(omega * s.t);
  s.stopwatch = s.t;
  s.completedOscillations = Math.floor(s.t / T);
  if (s.completedOscillations >= inputs.oscillations) {
    s.completedOscillations = inputs.oscillations;
    s.stopwatch = inputs.oscillations * T;
    s.finishedAt = s.t;
  }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state || !state.finishedAt) return null;
  const rng = makeRng(seed + trial * 61);
  const lc = 0.2; // stopwatch least count, s (reaction-time limited)
  const trueTotal = inputs.oscillations * periodTrue(inputs);
  const totalTime = toLeastCount(trueTotal + jitter(rng, lc * 1.2), lc);
  const period = totalTime / inputs.oscillations;
  return {
    trial, lengthCm: inputs.lengthCm, massG: inputs.massG,
    oscillations: inputs.oscillations, totalTime: Number(totalTime.toFixed(1)),
    period: Number(period.toFixed(3)), periodSq: Number((period * period).toFixed(4)),
    lengthM: Number((inputs.lengthCm / 100).toFixed(3)),
  };
}

/** A07: g from the L-T² slope. A08: g from a single-mass fit, plus the spread of T across masses. */
export function derive(rows) {
  if (rows.length < 3) return { ok: false, reason: 'Record the period for at least three settings.' };

  const lengths = new Set(rows.map((r) => r.lengthCm));
  if (lengths.size >= 3) {
    const pts = rows.map((r) => ({ x: Number(r.lengthM), y: Number(r.periodSq) }));
    const fit = fitThroughOrigin(pts);
    const g = fit ? (4 * Math.PI * Math.PI) / fit.slope : null;
    return {
      ok: true, slope: fit ? sigFig(fit.slope, 4) : null, g: g ? sigFig(g, 4) : null,
      secondsPendulumCm: g ? sigFig((g / (Math.PI * Math.PI)) * 100, 4) : null,
      r2: fit ? Number(fit.r2.toFixed(4)) : null, n: rows.length, points: pts,
    };
  }

  // A08: length held fixed, mass varied — T should not depend on mass.
  const periods = rows.map((r) => Number(r.period));
  const meanT = periods.reduce((a, b) => a + b, 0) / periods.length;
  const spread = Math.max(...periods) - Math.min(...periods);
  const L = Number(rows[0].lengthM);
  const g = (4 * Math.PI * Math.PI * L) / (meanT * meanT);
  return {
    ok: true, g: sigFig(g, 4), slope: 0, spreadOfT: Number(spread.toFixed(4)),
    massIndependent: spread < 0.05, meanPeriod: sigFig(meanT, 4),
    secondsPendulumCm: sigFig((g / (Math.PI * Math.PI)) * 100, 4),
    n: rows.length, points: rows.map((r) => ({ x: Number(r.massG), y: Number(r.period) })),
  };
}

export default { meta, defaults, G_TRUE, init, step, measure, derive, validate, periodTrue };
