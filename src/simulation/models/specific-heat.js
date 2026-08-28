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

export function init(inputs = defaults) {
  return { t: 0, elapsed: 0, heating: true, dropped: false, settled: false, solidTempNow: inputs.waterTempC, waterTempNow: inputs.waterTempC };
}
/**
 * Two real phases: the solid heats in its own boiling tube (burner lit,
 * thermometer in the calorimeter reading room temperature, nothing mixed
 * yet), then it is dropped in and the calorimeter's own thermometer climbs
 * from the water's starting temperature towards the mixture's final
 * temperature while the solid cools the same way -- both towards the same
 * finalTempC(inputs), which is the whole content of the heat-balance
 * equation this activity tests. Was a bare no-op: the thermometer sat at a
 * hardcoded reading and the burner stayed lit forever, whatever the
 * chosen masses or starting temperatures actually implied.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  s.elapsed += dt * 8; // a few minutes of heating, compressed for the screen
  if (s.heating) {
    s.solidTempNow += (inputs.solidTempC - s.solidTempNow) * Math.min(1, dt * 8 * 0.35);
    if (Math.abs(inputs.solidTempC - s.solidTempNow) < 0.5) { s.heating = false; s.dropped = true; }
    return s;
  }
  if (s.dropped) {
    const target = finalTempC(inputs);
    // A quick transfer and mixing takes seconds, not minutes.
    const rate = inputs.transfer === 'slow' ? 1.1 : 2.6;
    s.solidTempNow += (target - s.solidTempNow) * Math.min(1, dt * rate);
    s.waterTempNow += (target - s.waterTempNow) * Math.min(1, dt * rate);
    s.settled = Math.abs(target - s.waterTempNow) < 0.05;
  }
  return s;
}

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
  const s = solidOf(inputs);
  const specificHeatMean = mean(vals);
  const distinctMasses = new Set(rows.map((r) => r.solidMassG)).size;
  return {
    ok: true, specificHeat: sigFig(specificHeatMean, 4), specificHeatCal: sigFig(specificHeatMean / 4186, 4),
    accepted: s.c, percentError: sigFig((Math.abs(specificHeatMean - s.c) / s.c) * 100, 4),
    waterEquivalentG: sigFig((c.massG * c.c) / C_WATER, 4), meanRise: sigFig(mean(rows.map((r) => Number(r.riseC))), 4),
    meanFinalTemp: sigFig(mean(rows.map((r) => Number(r.finalTempC))), 4),
    solid: s.label, calorimeter: c.label, includedWaterEquivalent: !!inputs.includeWaterEquivalent,
    slowTransfer: inputs.transfer === 'slow', variedMass: distinctMasses > 1, distinctMasses,
    n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.specificHeat) })),
  };
}

export default { meta, defaults, SOLIDS, CALORIMETERS, C_WATER, init, step, measure, derive, validate, solidOf, calOf, finalTempC };
