/**
 * MODEL: Melting point of an organic compound — XI-CHE-B01
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section B, Experiment 1.
 * A pure compound melts sharply (range < ~1 °C); a dissolved impurity
 * depresses the melting point and widens the melting range, in proportion
 * to the amount present — the cryoscopic effect.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig, mean, percentError } from '../../utils/measure.js';

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

export function init(inputs = defaults) {
  return { t: 0, running: true, bathTemp: 28, meltingPoint: trueMeltingPoint(inputs), heating: true, finishedAt: null };
}
/**
 * The bath actually heats. This was `step(state) { return state; }` -- state
 * never carried a temperature at all, so the renderer's `state?.bathTemp`
 * permanently fell back to its hardcoded 30, the capillary sample never
 * visually melted no matter how long the burner burned, and every
 * screenshot of this experiment showed the identical "Bath 30.0 °C" whether
 * the flame had been lit for one second or one minute.
 *
 * Real time compression: at the CBSE-recommended 1-2 °C/min this experiment
 * takes many real minutes to reach a melting point of 80-130 °C, which is
 * why the rate is compressed 20x here for the simulation, not because the
 * underlying rate itself is wrong -- `trueRange`/`trueMeltingPoint` (used
 * by measure()) are untouched and still reason in real °C per minute.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (s.finishedAt) return s;
  const COMPRESSION = 20;
  const minutes = (dt * COMPRESSION) / 60;
  const ceiling = (BATHS[inputs.bath] || BATHS.oil).maxC;
  const rate = inputs.heatingRate ?? 2;
  s.bathTemp = Math.min(ceiling, s.bathTemp + rate * minutes);
  s.meltingPoint = trueMeltingPoint(inputs);
  s.heating = true;
  const range = trueRange(inputs);
  if (s.bathTemp >= s.meltingPoint + range / 2 + 2) s.finishedAt = s.t;
  return s;
}

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
  const meltingPoint = sigFig(mean(mps), 4);
  const ranges = rows.map((r) => Number(r.rangeC));
  const rangeC = sigFig(mean(ranges), 3);
  const sharp = rangeC < 1.0;
  const accepted = compoundOf(inputs).mp;
  const depressionC = Math.max(0, sigFig(accepted - meltingPoint, 3));
  const pure = depressionC < 1.0;
  /*
   * CBSE's melting-point practical asks the student to judge purity from
   * the SHARPNESS and DEPTH of the depression, not to compute a mole
   * fraction (that calculation belongs to freezing-point-depression
   * colligative-properties work, with a cryoscopic constant this practical
   * does not supply). This is an illustrative proportional estimate,
   * calibrated so the "crude sample" preset (a 6.5 degree depression)
   * reads as a clearly-impure ~10 mole per cent, not a claimed rigorous
   * molar analysis.
   */
  const impurityPct = sigFig((depressionC / 6.5) * 10, 3);

  const heatedTooFast = (inputs.heatingRate ?? 2) > 3;
  const thermometerLagC = heatedTooFast ? sigFig(Math.max(0, (inputs.heatingRate - 2)) * 0.6, 2) : 0;

  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.purity)) groups.set(r.purity, []);
    groups.get(r.purity).push(r);
  }
  const purityCheck = groups.size >= 2
    ? [...groups.entries()].map(([name, rs]) => ({
      name,
      meltingPoint: sigFig(mean(rs.map((r) => Number(r.lastCrystalC))), 4),
      range: sigFig(mean(rs.map((r) => Number(r.rangeC))), 3),
    }))
    : null;

  return {
    ok: true, meltingPoint, rangeC, sharp, accepted, n: rows.length,
    compound: compoundOf(inputs).label, meltingRangeText: `${mps[0] !== undefined ? sigFig(meltingPoint - rangeC, 4) : meltingPoint}–${meltingPoint} °C`,
    percentError: sigFig(percentError(meltingPoint, accepted), 3),
    pure, impurityPct: pure ? 0 : impurityPct, depressionC, heatedTooFast, thermometerLagC, purityCheck,
    points: rows.map((r, i) => ({ x: i + 1, y: Number(r.lastCrystalC) })),
  };
}

export default { meta, defaults, COMPOUNDS, PURITY, BATHS, THERMOMETERS, init, step, measure, derive, validate, compoundOf, trueMeltingPoint, trueRange, bathAdequate };
