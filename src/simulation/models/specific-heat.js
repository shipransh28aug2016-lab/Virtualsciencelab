/**
 * MODEL: Specific heat capacity by the method of mixtures — XI-PHY-B07
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 7.
 * Heat lost by the hot solid = heat gained by the water and calorimeter.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B07',
  formula: 'm_s c_s (T_s−T_f) = (m_w c_w + m_c c_c)(T_f−T_w)',
  unitSystem: 'J/kg/K, also cal/g/°C',
  assumptions: ['No heat is lost to the surroundings during the transfer', 'The mixture reaches a common final temperature', 'The calorimeter\'s own heat capacity is accounted for by its water equivalent'],
  validRange: 'Solid mass 50-200 g, water 80-200 g',
  edgeCases: ['A slow transfer loses heat to the air, giving a final temperature that is too low', 'Omitting the water equivalent gives too small a specific heat'],
  expectedBehaviour: ['c is unchanged when the mass of the solid is varied', 'A slow transfer systematically lowers the apparent c'],
};

export const C_WATER = 4186;
export const SOLIDS = { copper: { label: 'Copper', c: 385 }, aluminium: { label: 'Aluminium', c: 897 }, brass: { label: 'Brass', c: 380 }, lead: { label: 'Lead', c: 128 } };
export const CALORIMETERS = { copper: { label: 'Copper calorimeter', c: 385, massG: 50 }, aluminium: { label: 'Aluminium calorimeter', c: 897, massG: 40 } };

export const defaults = { solid: 'copper', calorimeter: 'copper', solidMassG: 100, waterMassG: 150, solidTempC: 95, waterTempC: 25, transfer: 'quick', includeWaterEquivalent: true };

export function solidOf(inputs) { return SOLIDS[inputs.solid] || SOLIDS.copper; }
export function calOf(inputs) { return CALORIMETERS[inputs.calorimeter] || CALORIMETERS.copper; }

export function finalTempC(inputs) {
  const s = solidOf(inputs);
  const c = calOf(inputs);
  const heatLossFactor = inputs.transfer === 'slow' ? 0.85 : 1; // some heat lost to air on a slow transfer
  const num = inputs.solidMassG * s.c * inputs.solidTempC * heatLossFactor + (inputs.waterMassG * C_WATER + c.massG * c.c) * inputs.waterTempC;
  const den = inputs.solidMassG * s.c * heatLossFactor + inputs.waterMassG * C_WATER + c.massG * c.c;
  return num / den;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (inputs.solidTempC <= inputs.waterTempC + 20) warnings.push({ field: 'solidTempC', code: 'SMALL_RISE', message: 'The solid is not much hotter than the water.', why: 'A small temperature difference gives a small, imprecisely-measurable rise in the water temperature.' });
  if (inputs.transfer === 'slow') warnings.push({ field: 'transfer', code: 'SLOW_TRANSFER', message: 'Transferring the solid slowly loses heat to the air on the way.', why: 'Heat lost in transit is not accounted for by the heat-balance equation, so the calculated specific heat comes out too LOW.', fix: 'Transfer the solid quickly, with tongs, straight from the heater to the calorimeter.' });
  if (!inputs.includeWaterEquivalent) warnings.push({ field: 'includeWaterEquivalent', code: 'NO_WATER_EQUIVALENT', message: 'The calorimeter\'s own heat capacity is being ignored.', why: 'The calorimeter and stirrer absorb heat too. Leaving this out means too little mass in the heat-balance equation, so c comes out too LOW.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, settled: true }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 97);
  const trueFinal = finalTempC(inputs);
  const finalC = Number((trueFinal + jitter(rng, 0.15)).toFixed(1));
  const c = calOf(inputs);
  const massForC = inputs.waterMassG + (inputs.includeWaterEquivalent ? (c.massG * c.c) / C_WATER : 0);
  const cSolid = (massForC * C_WATER * (finalC - inputs.waterTempC)) / (inputs.solidMassG * (inputs.solidTempC - finalC));
  return {
    trial, solidMassG: inputs.solidMassG, waterMassG: inputs.waterMassG, solidTempC: inputs.solidTempC,
    waterTempC: inputs.waterTempC, finalTempC: finalC, riseC: Number((finalC - inputs.waterTempC).toFixed(1)),
    specificHeat: sigFig(cSolid, 4),
  };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.specificHeat)).filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 3) return { ok: false, reason: 'Record at least three trials.' };
  const c = calOf(inputs);
  return {
    ok: true, specificHeat: sigFig(mean(vals), 4), specificHeatCal: sigFig(mean(vals) / 4186, 4),
    waterEquivalentG: sigFig((c.massG * c.c) / C_WATER, 4), meanRise: sigFig(mean(rows.map((r) => Number(r.riseC))), 4),
    massVaried: new Set(rows.map((r) => r.solidMassG)).size > 1,
    n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.specificHeat) })),
  };
}

export default { meta, defaults, SOLIDS, CALORIMETERS, C_WATER, init, step, measure, derive, validate, solidOf, calOf, finalTempC };
