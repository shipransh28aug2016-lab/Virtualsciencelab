/**
 * MODEL: I-V characteristics of a p-n junction diode — XII-PHY-B09
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Experiment 9.
 * Shockley diode equation: I = I0(e^(qV/ηkT) − 1).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-B09',
  formula: 'I = I0(e^(qV/ηkT) − 1); V_T ≈ 0.026 V at 300 K',
  unitSystem: 'Volt, milliampere',
  assumptions: ['Room temperature ≈ 300 K', 'The series resistance protects the diode from excess current', 'Reverse current is small and roughly constant (well below breakdown)'],
  validRange: 'Supply 0-6 V through 10-1000 Ω',
  edgeCases: ['Below the knee, current is immeasurably small', 'Reverse bias: only a small, nearly constant leakage current flows'],
  expectedBehaviour: ['The forward branch is flat, then rises steeply past the knee', 'The reverse branch stays near zero over the whole range'],
};

export const DIODES = { si: { label: 'Silicon diode', I0: 1e-12, eta: 1.8, kneeV: 0.65 }, ge: { label: 'Germanium diode', I0: 1e-6, eta: 1.5, kneeV: 0.25 }, led: { label: 'Red LED', I0: 1e-18, eta: 2.0, kneeV: 1.75 } };
export const VT = 0.02585;

export const defaults = { supplyV: 2, bias: 'forward', diode: 'si', seriesR: 100 };

export function diodeOf(inputs) { return DIODES[inputs.diode] || DIODES.si; }

/** Solve for the diode current given a supply V through series R (Newton iteration). */
export function currentMA(inputs) {
  const d = diodeOf(inputs);
  const Vs = inputs.bias === 'reverse' ? -inputs.supplyV : inputs.supplyV;
  const R = inputs.seriesR;
  if (Vs < 0) return -d.I0 * 1000 * 0.98; // reverse leakage, roughly constant
  let Vd = Math.min(Vs, d.kneeV);
  for (let k = 0; k < 40; k++) {
    const I = d.I0 * (Math.exp(Vd / (d.eta * VT)) - 1);
    const f = Vd + I * R - Vs;
    const dI = (d.I0 / (d.eta * VT)) * Math.exp(Vd / (d.eta * VT));
    const df = 1 + dI * R;
    Vd -= f / df;
    if (Vd < 0) Vd = 0;
  }
  const I = d.I0 * (Math.exp(Vd / (d.eta * VT)) - 1);
  return I * 1000; // mA
}
export function diodeVoltage(inputs) {
  const Vs = inputs.bias === 'reverse' ? -inputs.supplyV : inputs.supplyV;
  if (Vs < 0) return Vs;
  return Vs - (currentMA(inputs) / 1000) * inputs.seriesR;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 241);
  const V = diodeVoltage(inputs);
  const I = currentMA(inputs) + jitter(rng, Math.max(0.01, Math.abs(currentMA(inputs)) * 0.02));
  return { trial, bias: inputs.bias, voltage: Number(V.toFixed(3)), current: sigFig(I, 4), diode: inputs.diode };
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
  return { ok: true, kneeVoltage: sigFig(kneeVoltage, 3), dynamicResistance: dynamicResistance !== null ? sigFig(dynamicResistance, 4) : null, staticResistance: sigFig(staticResistance, 4), n: fwd.length, points: rows.map((r) => ({ x: Number(r.voltage), y: Number(r.current) })) };
}

export default { meta, defaults, DIODES, VT, init, step, measure, derive, validate, diodeOf, currentMA, diodeVoltage };
