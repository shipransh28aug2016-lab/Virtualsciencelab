/**
 * MODEL: I-V characteristics of a p-n junction diode — XII-PHY-B09
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 9.
 * Shockley diode equation: I = I0(e^(qV/ηkT) − 1).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig, toLeastCount} from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B09',
  formula: 'I = I0(e^(qV/ηkT) − 1); V_T ≈ 0.026 V at 300 K',
  unitSystem: 'Volt, milliampere',
  assumptions: ['Room temperature ≈ 300 K', 'The series resistance protects the diode from excess current', 'Reverse current is small and roughly constant (well below breakdown)'],
  validRange: 'Supply 0-6 V through 10-1000 Ω',
  edgeCases: ['Below the knee, current is immeasurably small', 'Reverse bias: only a small, nearly constant leakage current flows'],
  expectedBehaviour: ['The forward branch is flat, then rises steeply past the knee', 'The reverse branch stays near zero over the whole range'],
};

/**
 * Saturation current and ideality factor, chosen so that the curve they
 * generate has the knee the device is known for.
 *
 * These are not free parameters: with η they FIX the junction voltage,
 * because V = η·V_T·ln(I/I₀ + 1). Silicon carried I₀ = 1 pA with η = 1.8,
 * which puts 1.15 V across a silicon junction at 50 mA — a diode reading half
 * a volt high the whole way up its characteristic, extrapolating to a knee of
 * 1.09 V for a part every textbook calls 0.7 V.
 *
 * These are ordinary small-signal devices, and each reproduces its own
 * nominal knee when the straight part of its curve is extrapolated back to
 * zero current, which is how the experiment measures it:
 *
 *   silicon     2.5 nA, η 1.8  →  0.78 V at 50 mA
 *   germanium   20 µA,  η 1.5  →  0.30 V at 50 mA, and a reverse leakage four
 *                                 orders of magnitude larger than silicon's,
 *                                 which is why it is on the bench
 *   red LED     1 aA,   η 2.0  →  1.94 V at 20 mA
 */
export const DIODES = {
  si: { label: 'Silicon diode', I0: 2.5e-9, eta: 1.8, kneeV: 0.7 },
  ge: { label: 'Germanium diode', I0: 2e-5, eta: 1.5, kneeV: 0.3 },
  led: { label: 'Red LED', I0: 1e-18, eta: 2.0, kneeV: 1.8 },
};
export const VT = 0.02585;

export const defaults = { supplyV: 2, bias: 'forward', diode: 'si', seriesR: 100 };

export function diodeOf(inputs) { return DIODES[inputs.diode] || DIODES.si; }

/** Solve for the diode current given a supply V through series R (Newton iteration). */
/** Shockley current through the diode at a given junction voltage, in amps. */
function shockleyA(d, Vd) {
  // exp() of a large argument overflows to Infinity and poisons everything
  // downstream; no junction in this experiment is anywhere near that voltage.
  const x = Math.min(Vd / (d.eta * VT), 80);
  return d.I0 * (Math.exp(x) - 1);
}

/**
 * Solve the diode's operating point.
 *
 * The circuit is a supply, a series resistor and the diode, so the junction
 * voltage satisfies  Vd + R·I(Vd) = Vs  with I given by Shockley's equation.
 * There is no elementary closed form, and it was being solved by undamped
 * Newton from a fixed starting guess.
 *
 * Newton on an exponential is unstable in exactly this way: one overshoot
 * puts Vd somewhere exp() overflows, the derivative overflows with it, and
 * the correction is meaningless from then on. At a 3.4 V supply the solver
 * returned a junction voltage of −99 457 V and a current of 1002 A; by 6 V it
 * reported 8.7 × 10²⁹ mA. The bench drew it, the table recorded it and the
 * graph plotted it, all to four significant figures.
 *
 * f(Vd) = Vd + R·I(Vd) − Vs is strictly increasing, f(0) = −Vs ≤ 0 and
 * f(Vs) ≥ 0, so the root is bracketed by [0, Vs] and bisection finds it every
 * time. Sixty halvings take the bracket below a nanovolt, and nothing can
 * diverge because nothing ever leaves the bracket.
 */
export function operatingPoint(inputs) {
  const d = diodeOf(inputs);
  const R = Math.max(1e-6, inputs.seriesR);
  const Vs = inputs.bias === 'reverse' ? -Math.abs(inputs.supplyV) : Math.abs(inputs.supplyV);

  if (Vs <= 0) {
    // Reverse bias: only the saturation current flows, so essentially the
    // whole supply appears across the junction.
    const I = -d.I0 * 0.98;
    return { Vd: Vs - I * R, I };
  }

  let lo = 0;
  let hi = Vs;
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    if (mid + shockleyA(d, mid) * R - Vs > 0) hi = mid; else lo = mid;
  }
  const Vd = (lo + hi) / 2;
  return { Vd, I: shockleyA(d, Vd) };
}

export function currentMA(inputs) {
  return operatingPoint(inputs).I * 1000;
}

export function diodeVoltage(inputs) {
  return operatingPoint(inputs).Vd;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init(inputs = defaults) { return { t: 0, currentMA: 0, diodeVoltageV: 0, conducting: false }; }
/**
 * The milliammeter and voltmeter needles were permanently pinned at zero
 * on the live canvas -- step() was a bare pass-through, so state never
 * carried a current or a diode voltage at all, only measure()'s one-shot
 * snapshot when a reading was recorded. Settles towards the model's own
 * currentMA()/diodeVoltage() so both meters actually respond as the
 * supply voltage, series resistance or diode choice change.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const targetI = currentMA(inputs);
  const targetV = diodeVoltage(inputs);
  s.currentMA += (targetI - s.currentMA) * Math.min(1, dt * 6);
  s.diodeVoltageV += (targetV - s.diodeVoltageV) * Math.min(1, dt * 6);
  s.conducting = s.currentMA > 0.5;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 241);
  const { Vd, I } = operatingPoint(inputs);
  const reverse = inputs.bias === 'reverse';

  /*
   * Read to the instrument's least count, not to four figures of noise.
   *
   * The current was reported as sigFig(I, 4) on top of a 0.01 mA scatter, so
   * a reverse reading came back as "0.003686 mA" — six digits of a number
   * whose own uncertainty is three times larger than itself. Reverse leakage
   * is measured on a microammeter for exactly this reason, and that is the
   * scale used here; forward current is a milliammeter reading 0.01 mA, and
   * the voltmeter 0.01 V.
   */
  const lcI = reverse ? 0.0001 : 0.01;          // mA: microammeter vs milliammeter
  const noisyMA = I * 1000 + jitter(rng, lcI * 0.6);
  return {
    trial,
    bias: inputs.bias,
    voltage: toLeastCount(Vd + jitter(rng, 0.006), 0.01),
    current: toLeastCount(noisyMA, lcI),
    diode: inputs.diode,
  };
}

export function derive(rows, inputs = defaults) {
  const fwd = rows.filter((r) => r.bias === 'forward' && Number(r.current) > 0.5);
  if (fwd.length < 4) return { ok: false, reason: 'Record at least four forward-bias readings with a measurable current (above the knee).' };
  const sorted = [...fwd].sort((a, b) => Number(a.voltage) - Number(b.voltage));
  const pts = sorted.map((r) => ({ x: Number(r.voltage), y: Number(r.current) }));
  const fit = linearFit(pts.slice(-Math.max(2, Math.floor(pts.length / 2))));
  const kneeVoltage = fit && fit.slope !== 0 ? -fit.intercept / fit.slope : diodeOf(inputs).kneeV;
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const dynamicResistance = prev ? (Number(last.voltage) - Number(prev.voltage)) / ((Number(last.current) - Number(prev.current)) / 1000) : null;
  const staticResistance = Number(last.voltage) / (Number(last.current) / 1000);
  /*
   * The result panel prints how the knee was found, the nominal value for the
   * diode in use, and what the reverse readings showed. None of those were
   * returned here, so the panel read "Found by extrapolation · nominal
   * undefined V" — the word undefined, in the panel that states the answer.
   */
  const reverse = rows.filter((r) => r.bias === 'reverse');
  // Nothing measured on the reverse branch is nought microamps, not a null:
  // the panel prints this figure and "null µA" is not a reading.
  const maxReverseMicroA = reverse.length
    ? sigFig(Math.max(...reverse.map((r) => Math.abs(Number(r.current)) * 1000)), 3)
    : 0;
  return {
    ok: true,
    kneeVoltage: sigFig(kneeVoltage, 3),
    kneeMethod: fit && fit.slope !== 0
      ? 'extrapolating the straight part of the curve back to zero current'
      : `the nominal value for a ${diodeOf(inputs).label.toLowerCase()}`,
    acceptedKnee: diodeOf(inputs).kneeV,
    diode: diodeOf(inputs).label,
    reverseCount: reverse.length,
    maxReverseCurrent: maxReverseMicroA,
    dynamicResistance: dynamicResistance !== null ? sigFig(dynamicResistance, 4) : null,
    staticResistance: sigFig(staticResistance, 4),
    n: fwd.length,
    points: rows.map((r) => ({ x: Number(r.voltage), y: Number(r.current) })),
  };
}

export default { meta, defaults, DIODES, VT, init, step, measure, derive, validate, diodeOf, currentMA, diodeVoltage, operatingPoint };
