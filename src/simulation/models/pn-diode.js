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
    /* The name of the device, not its key: this column is read by a student,
       and the calculation matches on it to tell one diode from another. */
    diode: diodeOf(inputs).label,
  };
}

export function derive(rows, inputs = defaults) {
  /*
   * One characteristic, one diode. Three are on the bench and nothing said
   * they could not be mixed, so a set taken across silicon, germanium and an
   * LED was fitted as a single curve: the straight part of the LED's branch
   * extrapolated back through the germanium's, and the knee came out at
   * 2.2 V against a nominal 0.3 V, stated to three figures.
   */
  const usedDiodes = [...new Set(rows.map((r) => r.diode).filter(Boolean))];
  if (usedDiodes.length > 1) {
    return { ok: false, reason: `These readings are of ${usedDiodes.length} different diodes (${usedDiodes.join(', ')}). A characteristic belongs to one diode — clear the table and take the forward and reverse sets on the same one.` };
  }
  const device = Object.values(DIODES).find((d) => d.label === usedDiodes[0]) || diodeOf(inputs);

  const fwd = rows.filter((r) => r.bias === 'forward' && Number(r.current) > 0.5);
  if (fwd.length < 4) return { ok: false, reason: 'Record at least four forward-bias readings with a measurable current (above the knee).' };
  const sorted = [...fwd].sort((a, b) => Number(a.voltage) - Number(b.voltage));
  const pts = sorted.map((r) => ({ x: Number(r.voltage), y: Number(r.current) }));
  /*
   * The straight part of the curve is where the diode is CONDUCTING, which
   * is not the same as the top half of the readings. A silicon junction
   * gains about 60 mV per decade of current, so past the knee the voltages
   * crowd together: taking the last half of six readings gave two points at
   * the same 0.74 V, the fit through them was undefined, and the bench fell
   * back to printing the diode's nominal knee — the textbook answer, handed
   * back as though it had been measured.
   *
   * Everything carrying at least a fifth of the largest current is on the
   * straight part and is used, which keeps the span of voltage the fit needs.
   */
  const maxI = Math.max(...pts.map((p) => p.y));
  const conducting = pts.filter((p) => p.y >= Math.max(0.5, maxI * 0.2));
  const distinctV = new Set(conducting.map((p) => p.x)).size;
  const fit = conducting.length >= 3 && distinctV >= 2 ? linearFit(conducting) : null;

  /*
   * A knee cannot be found from readings that do not cross it.
   *
   * Six readings taken at nearly one supply voltage differ only by the
   * scatter of the meters: the "straight part" through them is flat, and
   * extrapolating a flat line back to zero current puts the knee wherever
   * the noise points. The bench reported −31.3 V, to three figures, with a
   * dynamic resistance of 2500 Ω beside it. Both are what a fit through
   * six copies of one point looks like, and neither is a measurement.
   */
  const vSpan = Math.max(...conducting.map((p) => p.x)) - Math.min(...conducting.map((p) => p.x));
  const iRatio = Math.max(...conducting.map((p) => p.y)) / Math.max(1e-9, Math.min(...conducting.map((p) => p.y)));
  const maxV = Math.max(...pts.map((p) => p.x));
  const kneeRaw = fit && fit.slope > 0 ? -fit.intercept / fit.slope : null;
  const usableFit = fit && fit.slope > 0 && vSpan >= 0.02 && iRatio >= 2
    && kneeRaw !== null && kneeRaw >= 0 && kneeRaw <= maxV;
  if (!usableFit) {
    return {
      ok: false,
      reason: `These readings are all from one part of the curve (${vSpan.toFixed(2)} V of it, with the current changing by a factor of ${iRatio.toFixed(1)}). Vary the supply so the forward current climbs from about a milliampere to tens of milliamperes — the knee is found by extrapolating THAT rise back to zero current, and a straight line through readings that barely differ points anywhere at all.`,
    };
  }
  const kneeVoltage = kneeRaw;

  /*
   * Dynamic resistance is the slope of the conducting part of the curve,
   * ΔV/ΔI — so it comes from the same fit as the knee, in ohm.
   *
   * Taken from the last two points alone it inherited every accident of those
   * two readings: two points a least count apart, or in the wrong order after
   * a diode swap, gave −27 Ω. A resistance cannot be negative, and a panel
   * that prints one has stopped measuring anything.
   */
  const dynamicResistance = usableFit ? 1000 / fit.slope : null;
  const last = sorted[sorted.length - 1];
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
    kneeMethod: 'extrapolating the straight part of the curve back to zero current',
    /* The knee belongs to the diode the readings were taken on. */
    accepted: device.kneeV,
    acceptedKnee: device.kneeV,
    diode: device.label,
    reverseCount: reverse.length,
    maxReverseCurrent: maxReverseMicroA,
    dynamicResistance: dynamicResistance !== null ? sigFig(dynamicResistance, 4) : null,
    staticResistance: sigFig(staticResistance, 4),
    n: fwd.length,
    points: rows.map((r) => ({ x: Number(r.voltage), y: Number(r.current) })),
  };
}

export default { meta, defaults, DIODES, VT, init, step, measure, derive, validate, diodeOf, currentMA, diodeVoltage, operatingPoint };
