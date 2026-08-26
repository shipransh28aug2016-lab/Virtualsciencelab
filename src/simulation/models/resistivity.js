/**
 * MODEL: Resistivity of a wire from a V-I graph — XII-PHY-A01
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Experiment 1.
 * V = IR (Ohm's law); ρ = RA/L = RπD²/(4L).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-A01',
  formula: 'V = IR; ρ = RπD²/(4L)',
  unitSystem: 'SI: ohm, ohm-metre',
  assumptions: ['The wire stays at a constant temperature over the range used', 'Ammeter and voltmeter are ideal enough not to disturb the circuit appreciably', 'The wire is of uniform cross-section'],
  validRange: 'Current 0.05-1.5 A',
  edgeCases: ['Too high a current heats the wire and curves the V-I line', 'Swapping ammeter series/parallel or voltmeter parallel/series wiring gives a wrong resistance'],
  expectedBehaviour: ['V is proportional to I — Ohm\'s law', 'ρ is a property of the material, independent of the wire\'s length or diameter'],
};

export const WIRES = { constantan: { label: 'Constantan wire', rho: 4.9e-7 }, nichrome: { label: 'Nichrome wire', rho: 1.1e-6 }, copper: { label: 'Copper wire', rho: 1.68e-8 } };

export const defaults = { wire: 'constantan', rheostatFrac: 0.5, lengthCm: 100, diameterMm: 0.4, emf: 3, ammeterMode: 'series', voltmeterMode: 'parallel' };

export function wireOf(inputs) { return WIRES[inputs.wire] || WIRES.constantan; }
export function areaM2(inputs) { const d = inputs.diameterMm / 1000; return (Math.PI * d * d) / 4; }
export function resistanceOhm(inputs) { return (wireOf(inputs).rho * (inputs.lengthCm / 100)) / areaM2(inputs); }
export function wiredCorrectly(inputs) { return inputs.ammeterMode === 'series' && inputs.voltmeterMode === 'parallel'; }

export function circuitCurrent(inputs) {
  const R = resistanceOhm(inputs);
  const rheostat = 2 + inputs.rheostatFrac * 8; // ohm, in series
  return inputs.emf / (R + rheostat + 0.5);
}

export function validate(inputs) {
  const warnings = [];
  if (!wiredCorrectly(inputs)) warnings.push({ field: 'ammeterMode', code: 'WRONG_WIRING', message: 'The meters are not wired the standard way.', why: 'An ammeter must carry the full circuit current (series) and a voltmeter must sample the wire\'s own voltage (parallel). Any other arrangement measures the wrong thing.', fix: 'Connect the ammeter in series and the voltmeter in parallel with the wire.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!wiredCorrectly(inputs)) return null;
  const rng = makeRng(seed + trial * 191);
  const I = circuitCurrent(inputs) * (0.4 + 0.15 * ((trial - 1) % 6));
  const V = I * resistanceOhm(inputs) + jitter(rng, 0.01);
  const Iread = Number((I + jitter(rng, I * 0.01)).toFixed(3));
  return { trial, current: Iread, voltage: Number(V.toFixed(3)), ratio: sigFig(V / Iread, 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.current), y: Number(r.voltage) }));
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different current settings.' };
  const fit = fitThroughOrigin(pts);
  const rho = (fit.slope * areaM2(inputs)) / (inputs.lengthCm / 100);
  return { ok: true, resistance: sigFig(fit.slope, 4), rho: sigFig(rho, 3), accepted: wireOf(inputs).rho, r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, WIRES, init, step, measure, derive, validate, wireOf, areaM2, resistanceOhm, wiredCorrectly, circuitCurrent };
