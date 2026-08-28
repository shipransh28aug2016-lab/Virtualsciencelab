/**
 * MODEL: Potential drop along a wire for a steady current — XII-PHY-ACT-A5
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 5.
 * V = kl, with potential gradient k = Iρ/A — the working principle of a
 * potentiometer.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A5',
  formula: 'k = V/l = Iρ/A',
  unitSystem: 'Volt per metre',
  assumptions: ['The wire is uniform, so resistance per unit length is constant', 'The driving current is held steady by the rheostat while readings are taken'],
  validRange: 'Tapped length 0-100 cm',
  edgeCases: ['A larger rheostat resistance reduces the current and so the gradient'],
  expectedBehaviour: ['V is proportional to the length tapped — a line through the origin', 'A thicker wire of the same material gives a smaller gradient for the same current'],
};

export const WIRES = { constantan: { label: 'Constantan (thin)', rho: 4.9e-7, areaMm2: 0.20 }, constantanThick: { label: 'Constantan (thick)', rho: 4.9e-7, areaMm2: 0.50 }, nichrome: { label: 'Nichrome', rho: 1.1e-6, areaMm2: 0.20 } };
export const DRIVERS = { cell15: { label: '1.5 V cell', emf: 1.5 }, cell30: { label: '3 V battery', emf: 3.0 }, cell60: { label: '6 V battery', emf: 6.0 } };
export const VOLTMETERS = { v01: 0.1, v005: 0.05, v002: 0.02 };
export const WIRE_LENGTH_M = 1.0;

export const defaults = { wire: 'constantan', driver: 'cell30', voltmeter: 'v005', rheostatOhm: 4, tapLengthCm: 40 };

export function wireOf(inputs) { return WIRES[inputs.wire] || WIRES.constantan; }
export function wireResistanceOhm(inputs) { const w = wireOf(inputs); return (w.rho * WIRE_LENGTH_M) / (w.areaMm2 * 1e-6); }
export function circuitCurrent(inputs) { return (DRIVERS[inputs.driver] || DRIVERS.cell30).emf / (inputs.rheostatOhm + wireResistanceOhm(inputs) + 0.5); }
export function gradientVPerM(inputs) { return (circuitCurrent(inputs) * wireOf(inputs).rho) / (wireOf(inputs).areaMm2 * 1e-6); }
export function voltageAt(inputs, lengthCm) { return gradientVPerM(inputs) * (lengthCm / 100); }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, jockeyM: 0.5, voltage: 0, settled: false }; }
/**
 * The potential divider. Voltage tapped off the wire is proportional to
 * the length from the end, so sliding the jockey sweeps it linearly --
 * and the voltmeter, like a real one, takes a moment to follow.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  /*
   * This read inputs.tapPositionM, a field the experiment does not have
   * (the real control is tapLengthCm, in centimetres) -- so `at` always
   * fell through to state.jockeyM itself, meaning the jockey chased its
   * own previous position forever and never actually moved to wherever
   * the tapLengthCm slider was set.
   */
  const at = (inputs.tapLengthCm ?? defaults.tapLengthCm) / 100;
  s.jockeyM += (at - s.jockeyM) * Math.min(1, dt * 4);
  const target = voltageAt(inputs, s.jockeyM);
  s.voltage += (target - s.voltage) * Math.min(1, dt * 6);
  s.settled = Math.abs(target - s.voltage) < 1e-4;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 227);
  const lc = VOLTMETERS[inputs.voltmeter] || 0.05;
  const v = voltageAt(inputs, inputs.tapLengthCm) + jitter(rng, lc * 0.6);
  return { trial, lengthCm: inputs.tapLengthCm, voltageV: Number(v.toFixed(3)), ratioVPerM: sigFig(v / (inputs.tapLengthCm / 100), 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.lengthCm), y: Number(r.voltageV) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the potential drop for at least four different lengths.' };
  const fit = fitThroughOrigin(pts);
  const gradient = sigFig(fit.slope * 100, 4); // V/cm -> V/m
  const accepted = sigFig(gradientVPerM(inputs), 4);
  /*
   * fitThroughOrigin always reports an intercept of exactly 0 by
   * construction, so it could never actually detect a genuine non-zero
   * intercept (e.g. a contact resistance at the terminal) -- the free fit
   * below is the only one that can fail the "should be zero" check the
   * result text claims to make.
   */
  const freeFit = linearFit(pts);
  const intercept = freeFit ? sigFig(freeFit.intercept, 4) : 0;
  const typicalV = rows.reduce((a, r) => a + Math.abs(Number(r.voltageV)), 0) / rows.length;
  return {
    ok: true, gradient, gradientVPerCm: sigFig(gradient / 100, 4), accepted,
    percentError: sigFig((Math.abs(gradient - accepted) / accepted) * 100, 3),
    intercept, interceptPct: sigFig((Math.abs(intercept) / Math.max(1e-9, typicalV)) * 100, 3),
    throughOrigin: Math.abs(intercept) < 0.03 * typicalV,
    linear: fit.r2 > 0.98, r2: Number(fit.r2.toFixed(4)),
    wire: wireOf(inputs).label, driver: (DRIVERS[inputs.driver] || DRIVERS.cell30).label,
    currentA: sigFig(circuitCurrent(inputs), 4), fullWireV: sigFig(gradient * WIRE_LENGTH_M, 4),
    n: pts.length, points: pts,
  };
}

export default { meta, defaults, WIRES, DRIVERS, VOLTMETERS, WIRE_LENGTH_M, init, step, measure, derive, validate, wireOf, wireResistanceOhm, circuitCurrent, gradientVPerM, voltageAt };
