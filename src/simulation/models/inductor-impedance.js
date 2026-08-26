/**
 * MODEL: Resistance and impedance of an inductor — XII-PHY-ACT-A1
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 1.
 * DC: R = V/I (no back-emf from a steady current). AC: Z = V/I = √(R²+X_L²).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A1',
  formula: 'R=V_dc/I_dc; Z=V_ac/I_ac; X_L=2πfL; Z=√(R²+X_L²)',
  unitSystem: 'Ohm, henry',
  assumptions: ['The coil\'s resistance is the same on AC as on DC (skin effect ignored at these frequencies)', 'The supply is a good sine wave', 'R and X_L combine in quadrature'],
  validRange: 'Frequency 50-200 Hz',
  edgeCases: ['A laminated iron core raises the inductance (and so the impedance) sharply; the DC resistance is unaffected'],
  expectedBehaviour: ['On DC, V/I gives the resistance alone', 'On AC, V/I gives a larger value (the impedance), from which the reactance and inductance follow'],
};

export const COILS = { small: { label: 'Small coil (300 turns)', R: 3.2, L0: 0.018 }, medium: { label: 'Medium coil (800 turns)', R: 8.6, L0: 0.085 }, large: { label: 'Large coil (1500 turns)', R: 15.0, L0: 0.220 } };
export const CORES = { air: { label: 'Air core', mult: 1 }, rod: { label: 'Iron rod core', mult: 4 }, laminated: { label: 'Laminated iron core', mult: 9 } };

export const defaults = { coil: 'medium', core: 'air', supply: 'dc', ammeter: 'a5', voltageV: 6, frequencyHz: 50 };

export function coilOf(inputs) { return COILS[inputs.coil] || COILS.medium; }
export function inductanceH(inputs) { return coilOf(inputs).L0 * (CORES[inputs.core] || CORES.air).mult; }
export function resistanceOhm(inputs) { return coilOf(inputs).R; }
export function reactanceOhm(inputs) { return 2 * Math.PI * inputs.frequencyHz * inductanceH(inputs); }
export function oppositionOhm(inputs) {
  return inputs.supply === 'dc' ? resistanceOhm(inputs) : Math.sqrt(resistanceOhm(inputs) ** 2 + reactanceOhm(inputs) ** 2);
}
export function ammeterRangeA(inputs) { return { a10: 10, a5: 5, a2: 2 }[inputs.ammeter] || 5; }
export function currentA(inputs) { return inputs.voltageV / oppositionOhm(inputs); }
export function overRange(inputs) { return currentA(inputs) > ammeterRangeA(inputs); }

export function validate(inputs) {
  const warnings = [];
  if (overRange(inputs)) warnings.push({ field: 'ammeter', code: 'OVER_RANGE', message: 'The current exceeds this ammeter\'s range.', why: 'A current above the meter\'s full-scale value pins the needle and can damage the movement.', fix: 'Use an ammeter of a larger range, or reduce the voltage.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, current: 0, opposition: 0, phase: 0, pinned: false }; }
/**
 * A coil on DC and on AC.
 *
 * On DC only its resistance opposes the current. On AC the inductive
 * reactance 2(pi)fL joins it in quadrature, so the same coil at the same
 * voltage passes far less current -- and inserting an iron core, which
 * multiplies L, chokes it further. That contrast is the whole activity, so
 * the meter is driven from it and eased to the reading the way a real
 * moving-iron movement responds.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = currentA(inputs);
  s.opposition = oppositionOhm(inputs);
  s.current += (target - s.current) * Math.min(1, dt * 4.5);
  s.pinned = overRange(inputs);
  // Phase of the supply, for drawing the AC waveform.
  s.phase = inputs.supply === 'dc' ? 0 : (s.phase + dt * Math.min(12, inputs.frequencyHz * 0.12)) % (Math.PI * 2);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (overRange(inputs)) return null;
  const rng = makeRng(seed + trial * 199);
  const frac = 0.3 + 0.14 * ((trial - 1) % 6);
  const I = currentA(inputs) * frac + jitter(rng, 0.005);
  const V = I * oppositionOhm(inputs);
  return { trial, supply: inputs.supply, core: inputs.core, voltageV: Number(V.toFixed(3)), currentA: Number(I.toFixed(4)), oppositionOhm: sigFig(V / I, 4) };
}

export function derive(rows, inputs = defaults) {
  const dc = rows.filter((r) => r.supply === 'dc');
  const ac = rows.filter((r) => r.supply === 'ac');
  if (dc.length < 3) return { ok: false, reason: 'Record at least three DC readings to find the winding resistance.' };
  const dcFit = fitThroughOrigin(dc.map((r) => ({ x: Number(r.currentA), y: Number(r.voltageV) })));
  const R = dcFit.slope;
  if (ac.length < 3) return { ok: true, resistance: sigFig(R, 4), impedance: null, reactance: null, inductance: null, n: dc.length, points: dc.map((r) => ({ x: Number(r.currentA), y: Number(r.voltageV) })) };
  const acFit = fitThroughOrigin(ac.map((r) => ({ x: Number(r.currentA), y: Number(r.voltageV) })));
  const Z = acFit.slope;
  const XL = Math.sqrt(Math.max(0, Z * Z - R * R));
  const f = Number(ac[0].frequencyHz) || inputs.frequencyHz;
  const L = XL / (2 * Math.PI * f);
  return { ok: true, resistance: sigFig(R, 4), impedance: sigFig(Z, 4), reactance: sigFig(XL, 4), inductance: sigFig(L, 4), n: rows.length, points: rows.map((r) => ({ x: Number(r.currentA), y: Number(r.voltageV) })) };
}

export default { meta, defaults, COILS, CORES, init, step, measure, derive, validate, coilOf, inductanceH, resistanceOhm, reactanceOhm, oppositionOhm, ammeterRangeA, currentA, overRange };
