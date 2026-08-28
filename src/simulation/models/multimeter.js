/**
 * MODEL: Using a multimeter — XII-PHY-ACT-A2
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 2.
 * Selecting the right function AND range AND connection is the whole point:
 * a voltmeter goes in parallel, an ammeter in series, an ohmmeter needs a
 * dead circuit, and AC/DC functions must match the supply.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A2',
  formula: 'V: parallel, high Rin. A: series, low Rin. Ω: dead circuit, own cell. Continuity: near 0 Ω = intact',
  unitSystem: 'Volt, ampere, ohm',
  assumptions: ['The meter is ideal enough not to disturb the circuit when used correctly', 'The ohmmeter\'s own cell requires the circuit under test to be unpowered'],
  validRange: 'Eight targets across five functions',
  edgeCases: ['Measuring resistance on a live circuit gives a meaningless reading and can damage the meter', 'A DC function on an AC supply reads close to zero'],
  expectedBehaviour: ['The correct function, range and connection give a sensible, in-range reading', 'A wrong connection (e.g. an ammeter in parallel) reads nonsense or trips the fuse'],
};

export const TARGETS = {
  resistor: { label: '470 Ω resistor', kind: 'R', value: 470, live: false },
  resistorHigh: { label: '100 kΩ resistor', kind: 'R', value: 100000, live: false },
  battery: { label: 'Dry cell', kind: 'Vdc', value: 1.53, live: true },
  supplyDc: { label: '6 V DC supply', kind: 'Vdc', value: 6.0, live: true },
  supplyAc: { label: '12 V AC supply', kind: 'Vac', value: 12.0, live: true },
  lampCircuit: { label: 'Lamp circuit (series)', kind: 'Aac', value: 0.25, live: true },
  brokenWire: { label: 'Suspect lead', kind: 'cont', value: Infinity, live: false },
  goodWire: { label: 'Sound lead', kind: 'cont', value: 0.4, live: false },
};
export const RANGES = { voltageV: { r2: 2, r20: 20, r250: 250 }, currentA: { r02: 0.2, r10: 10 }, resistanceOhm: { r2k: 2000, r200k: 200000 } };

export const defaults = { target: 'resistor', func: 'ohm', connection: 'parallel', voltageRange: 'r20', currentRange: 'r02', resistanceRange: 'r2k' };

export function targetOf(inputs) { return TARGETS[inputs.target] || TARGETS.resistor; }

export function correctFunc(inputs) {
  const t = targetOf(inputs);
  if (t.kind === 'R' || t.kind === 'cont') return inputs.func === 'ohm' || inputs.func === 'cont';
  if (t.kind === 'Vdc') return inputs.func === 'vdc';
  if (t.kind === 'Vac') return inputs.func === 'vac';
  return inputs.func === 'aac';
}
export function correctConnection(inputs) {
  const t = targetOf(inputs);
  if (t.kind === 'Aac') return inputs.connection === 'series';
  return inputs.connection === 'parallel' || t.kind === 'R' || t.kind === 'cont';
}

export function validate(inputs) {
  const warnings = [];
  const t = targetOf(inputs);
  if ((inputs.func === 'ohm' || inputs.func === 'cont') && t.live) {
    warnings.push({ field: 'func', code: 'OHM_ON_LIVE', message: 'This target is a live circuit — resistance cannot be measured on it.', why: 'An ohmmeter passes current from its own internal cell. On a circuit that is already powered, the reading is meaningless and can damage the meter.', fix: 'Switch the target off first, or select a voltage/current function.' });
  }
  if (!correctFunc(inputs)) warnings.push({ field: 'func', code: 'WRONG_FUNCTION', message: 'This function does not match the target.', why: 'AC and DC are measured on different functions, and resistance can only be measured on a dead circuit.' });
  if (correctFunc(inputs) && !correctConnection(inputs)) warnings.push({ field: 'connection', code: 'WRONG_CONNECTION', message: 'An ammeter must be in series; a voltmeter in parallel.', why: 'Connecting an ammeter in parallel effectively short-circuits the source through the meter\'s low resistance.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, reading: 0, settling: 0, correct: false }; }
/**
 * A digital multimeter. It does not answer instantly: the display settles
 * over a moment, and if the function switch or the leads are wrong it
 * settles on the wrong thing rather than refusing — which is exactly the
 * mistake this exercise is meant to teach a student to catch.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const ok = correctFunc(inputs) && correctConnection(inputs);
  s.correct = ok;
  const target = ok ? (targetOf(inputs)?.value ?? 0) : 0;
  s.reading += (target - s.reading) * Math.min(1, dt * 5);
  s.settling = Math.abs(target - s.reading) > Math.max(1e-6, Math.abs(target) * 0.002) ? 1 : 0;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const t = targetOf(inputs);
  const rng = makeRng(seed + trial * 211);
  const correct = correctFunc(inputs) && correctConnection(inputs) && !((inputs.func === 'ohm' || inputs.func === 'cont') && t.live);
  let reading;
  if (!correct) reading = t.live && (inputs.func === 'ohm' || inputs.func === 'cont') ? 'unstable / OL' : 'incorrect';
  else if (t.kind === 'cont') reading = t.value === Infinity ? 'OL (open circuit)' : `${sigFig(t.value + jitter(rng, 0.05), 2)} Ω (continuity)`;
  else reading = sigFig(t.value + jitter(rng, t.value * 0.01), 4);
  return { trial, target: t.label, func: inputs.func, range: inputs.func === 'ohm' ? inputs.resistanceRange : inputs.func.startsWith('v') ? inputs.voltageRange : inputs.currentRange, connection: inputs.connection, reading, _correct: correct };
}

const FUNC_LABELS = { ohm: 'resistance (Ω)', cont: 'continuity', vdc: 'DC voltage', vac: 'AC voltage', aac: 'AC current' };

export function derive(rows) {
  if (rows.length < 3) return { ok: false, reason: 'Test at least three different targets.' };
  const correctRows = rows.filter((r) => r._correct);
  const usedFuncs = [...new Set(correctRows.map((r) => r.func))];
  const functionsUsed = usedFuncs.length;
  const foundBreak = correctRows.some((r) => typeof r.reading === 'string' && r.reading.includes('OL'));
  const foundGood = correctRows.some((r) => typeof r.reading === 'string' && r.reading.includes('continuity') && !r.reading.includes('OL'));
  return {
    ok: true, functionsUsed, correctReadings: correctRows.length, foundBreak, foundGood,
    targetsTested: new Set(rows.map((r) => r.target)).size,
    functionList: `Functions used: ${usedFuncs.map((f) => FUNC_LABELS[f] || f).join(', ') || 'none valid yet'}`,
    allValid: correctRows.length === rows.length, continuityDone: rows.some((r) => r.func === 'cont' && r._correct),
    resistanceRows: correctRows.filter((r) => r.func === 'ohm').length,
    voltageRows: correctRows.filter((r) => r.func === 'vdc' || r.func === 'vac').length,
    currentRows: correctRows.filter((r) => r.func === 'aac').length,
    n: rows.length, points: [],
  };
}

export default { meta, defaults, TARGETS, RANGES, init, step, measure, derive, validate, targetOf, correctFunc, correctConnection };
