/**
 * MODEL: Potential drop along a wire for a steady current — XII-PHY-ACT-A5
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 5.
 * V = kl, with potential gradient k = Iρ/A — the working principle of a
 * potentiometer.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

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
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 227);
  const lc = VOLTMETERS[inputs.voltmeter] || 0.05;
  const v = voltageAt(inputs, inputs.tapLengthCm) + jitter(rng, lc * 0.6);
  return { trial, lengthCm: inputs.tapLengthCm, voltageV: Number(v.toFixed(3)), ratioVPerM: sigFig(v / (inputs.tapLengthCm / 100), 4) };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.lengthCm), y: Number(r.voltageV) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the potential drop for at least four different lengths.' };
  const fit = fitThroughOrigin(pts);
  const free = fit;
  return { ok: true, gradient: sigFig(fit.slope * 100, 4), intercept: 0, r2: Number(free.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, WIRES, DRIVERS, VOLTMETERS, WIRE_LENGTH_M, init, step, measure, derive, validate, wireOf, wireResistanceOhm, circuitCurrent, gradientVPerM, voltageAt };
