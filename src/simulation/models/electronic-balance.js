/**
 * MODEL: Using a mechanical/electronic balance — XI-CHE-E01
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section E, Experiment 1.
 *
 * Unlike the physics beam balance (a null instrument), a modern top-pan
 * electronic balance DISPLAYS a mass directly. The skill being examined is
 * different: taring correctly, reading to the balance's own readability,
 * not slamming the pan, and recognising drift/instability.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-E01',
  formula: 'Net mass = gross reading − tare (container) mass',
  unitSystem: 'Gram',
  assumptions: ['The balance is on a stable, vibration-free bench and levelled', 'It has been zeroed/tared before the sample is added', 'The sample is at room temperature (a hot sample creates air convection that drifts the reading)'],
  validRange: 'Mass 0.1-200 g',
  edgeCases: ['Weighing directly on the pan without a container contaminates the balance and the chemical', 'A hygroscopic solid gains mass steadily if left open on the pan, and never settles'],
  expectedBehaviour: ['The reading settles to a stable value within a couple of seconds for an ordinary solid', 'Taring subtracts the container exactly, so net mass is independent of which container is used'],
};

export const OBJECTS = { salt5: { label: 'Weighing bottle + salt sample', trueG: 5.126 }, coin: { label: 'Coin', trueG: 6.032 }, watch: { label: 'Watch glass + solid', trueG: 12.480 }, bottle: { label: 'Empty weighing bottle (tare)', trueG: 8.240 } };
export const BALANCES = { digital2: { label: 'Digital balance, readability 0.01 g', lc: 0.01 }, digital3: { label: 'Digital balance, readability 0.001 g', lc: 0.001 }, mechanical: { label: 'Mechanical (beam) top-pan balance', lc: 0.1 } };

export const defaults = { object: 'salt5', balance: 'digital2', tared: true, containerMassG: 8.240 };

export function objectOf(inputs) { return OBJECTS[inputs.object] || OBJECTS.salt5; }
export function balanceOf(inputs) { return BALANCES[inputs.balance] || BALANCES.digital2; }
export function grossMassG(inputs) { return objectOf(inputs).trueG; }
export function netMassG(inputs) { return inputs.tared ? grossMassG(inputs) - inputs.containerMassG : grossMassG(inputs); }

export function validate(inputs) {
  const warnings = [];
  if (!inputs.tared && inputs.object !== 'bottle') warnings.push({ field: 'tared', code: 'NOT_TARED', message: 'The balance has not been tared (zeroed) with the empty container on the pan.', why: 'Without taring, the displayed mass includes the container, not just the sample.', fix: 'Place the empty container, press tare/zero, then add the sample.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, settled: false }; }
export function step(state, inputs, dt) { const s = { ...state }; s.t += dt; s.settled = s.t > 0.6; return s; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state || !state.settled) return null;
  const rng = makeRng(seed + trial * 307);
  const lc = balanceOf(inputs).lc;
  const reading = toLeastCount(netMassG(inputs) + jitter(rng, lc * 0.6), lc);
  return { trial, object: objectOf(inputs).label, balance: balanceOf(inputs).label, tared: inputs.tared, reading: Number(reading.toFixed(4)) };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.reading)).filter(Number.isFinite);
  if (vals.length < 2) return { ok: false, reason: 'Weigh the sample at least twice to check repeatability.' };
  const m = mean(vals);
  return { ok: true, meanMass: sigFig(m, 5), accepted: sigFig(netMassG(inputs), 5), spread: Number((Math.max(...vals) - Math.min(...vals)).toFixed(4)), n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.reading) })) };
}

export default { meta, defaults, OBJECTS, BALANCES, init, step, measure, derive, validate, objectOf, balanceOf, grossMassG, netMassG };
