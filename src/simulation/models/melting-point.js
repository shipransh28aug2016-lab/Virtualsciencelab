/**
 * MODEL: Melting point of an organic compound — XI-CHE-B01
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section B, Experiment 1.
 * A pure compound melts sharply (range < ~1 °C); a dissolved impurity
 * depresses the melting point and widens the melting range, in proportion
 * to the amount present — the cryoscopic effect.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-B01',
  formula: 'Melting range = T(last crystal) − T(first drop); depression ∝ moles of impurity',
  unitSystem: '°C',
  assumptions: ['The capillary is thin-walled and the sample is finely powdered and well packed', 'The bath is stirred, so the thermometer and sample are at the same temperature', 'Heating near the melting point is slow (1-2 °C/min)'],
  validRange: 'Melting point 60-130 °C',
  edgeCases: ['Heating too fast makes the thermometer lag and the reading come out high', 'A badly impure sample melts over several degrees, well below the pure value'],
  expectedBehaviour: ['A recrystallised (pure) sample melts within about half a degree', 'The melting point falls and the range widens as the sample gets less pure'],
};

export const COMPOUNDS = { naphthalene: { label: 'Naphthalene', mp: 80.5 }, benzoic: { label: 'Benzoic acid', mp: 122.4 }, urea: { label: 'Urea', mp: 132.7 }, acetanilide: { label: 'Acetanilide', mp: 114.3 } };
export const PURITY = { pure: { label: 'Recrystallised', depression: 0, range: 0.4 }, slight: { label: 'Slightly impure', depression: 2.5, range: 1.8 }, impure: { label: 'Crude sample', depression: 6.5, range: 3.2 } };
export const BATHS = { oil: { maxC: 220 }, water: { maxC: 98 } };
export const THERMOMETERS = { t1: 1.0, t05: 0.5, t02: 0.2 };

export const defaults = { compound: 'naphthalene', purity: 'pure', bath: 'oil', thermometer: 't05', heatingRate: 2 };

export function compoundOf(inputs) { return COMPOUNDS[inputs.compound] || COMPOUNDS.naphthalene; }
export function trueMeltingPoint(inputs) { return compoundOf(inputs).mp - (PURITY[inputs.purity] || PURITY.pure).depression; }
export function trueRange(inputs) {
  const rateFactor = 1 + Math.max(0, inputs.heatingRate - 2) * 0.15; // fast heating widens the apparent range
  return (PURITY[inputs.purity] || PURITY.pure).range * rateFactor;
}
export function bathAdequate(inputs) { return (BATHS[inputs.bath] || BATHS.oil).maxC > trueMeltingPoint(inputs) + 5; }

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!bathAdequate(inputs)) errors.push({ field: 'bath', code: 'BATH_TOO_COOL', message: 'This bath cannot reach the melting point.', why: `A water bath tops out near 98 °C; ${compoundOf(inputs).label} melts higher than that.`, fix: 'Use a liquid paraffin bath.' });
  if (inputs.heatingRate > 4) warnings.push({ field: 'heatingRate', code: 'TOO_FAST', message: 'Heating this fast makes the thermometer lag behind the bath.', why: 'A rapid rise means the sample is briefly hotter than the recorded reading, so the observed melting point comes out too high and the apparent range widens.', fix: 'Heat no faster than about 1-2 °C per minute near the melting point.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!bathAdequate(inputs)) return null;
  const rng = makeRng(seed + trial * 167);
  const lc = THERMOMETERS[inputs.thermometer] || 0.5;
  const mp = trueMeltingPoint(inputs);
  const range = trueRange(inputs);
  const firstDrop = toLeastCount(mp - range / 2 + jitter(rng, lc * 0.5), lc);
  const lastCrystal = toLeastCount(firstDrop + range + jitter(rng, lc * 0.3), lc);
  return { trial, compound: compoundOf(inputs).label, purity: (PURITY[inputs.purity] || PURITY.pure).label, firstDropC: Number(firstDrop.toFixed(1)), lastCrystalC: Number(lastCrystal.toFixed(1)), rangeC: Number((lastCrystal - firstDrop).toFixed(1)) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 2) return { ok: false, reason: 'Determine the melting point at least twice.' };
  const mps = rows.map((r) => Number(r.lastCrystalC));
  const meltingPoint = sigFig(mps.reduce((a, b) => a + b, 0) / mps.length, 4);
  const ranges = rows.map((r) => Number(r.rangeC));
  const rangeC = sigFig(ranges.reduce((a, b) => a + b, 0) / ranges.length, 3);
  return { ok: true, meltingPoint, rangeC, sharp: rangeC < 1.0, accepted: compoundOf(inputs).mp, n: rows.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.lastCrystalC) })) };
}

export default { meta, defaults, COMPOUNDS, PURITY, BATHS, THERMOMETERS, init, step, measure, derive, validate, compoundOf, trueMeltingPoint, trueRange, bathAdequate };
