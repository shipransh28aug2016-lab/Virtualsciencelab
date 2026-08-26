/**
 * MODEL: The iodine clock reaction — XII-CHE-B02
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section B, Experiment 2:
 * "reaction rates of iodide ion with hydrogen peroxide" (the classic
 * Landolt/iodine-clock variant used here).
 *
 *   H2O2 + 2I⁻ + 2H⁺ → I2 + 2H2O                 (slow, rate-determining)
 *   I2 + 2S2O3²⁻ → 2I⁻ + S4O6²⁻                   (fast, instantaneous)
 *
 * A fixed small amount of thiosulphate (and starch indicator) is included
 * with the iodide. Iodine is produced steadily but is mopped up instantly
 * by the thiosulphate — UNTIL the thiosulphate is used up, at which point
 * free iodine appears all at once and the starch turns blue-black. The
 * "clock time" is inversely proportional to the initial rate, so 1/t is
 * used as the rate exactly as in the thiosulphate-HCl kinetics model.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-B02',
  formula: 'Rate = k[I⁻]^m[H2O2]^n; clock time t ∝ 1/rate (fixed thiosulphate "clock")',
  unitSystem: 'mol/L, seconds',
  assumptions: ['The thiosulphate present is small enough to be consumed well before the main reaction is complete', 'Temperature is held constant during a comparison of concentrations', 'The colour change (colourless → blue-black) is sudden and easily timed'],
  validRange: 'KI 0.005-0.05 M; H2O2 0.1-0.5 M (as mixed)',
  edgeCases: ['Doubling [I⁻] halves the clock time if the reaction is first order in I⁻', 'A 10 °C rise in temperature roughly halves the clock time, typical of Ea around 40-50 kJ/mol'],
  expectedBehaviour: ['1/t is proportional to [I⁻] at fixed [H2O2] (order 1 in iodide)', 'The colour appears abruptly, not gradually — the signature of a clock reaction'],
};

export const STOCK_KI_M = 0.1;
export const STOCK_H2O2_M = 1.0;
export const THIO_MM = 2.0; // fixed millimolar thiosulphate "clock" amount
export const R_GAS = 8.314;
export const EA_JMOL = 42000;
export const A_FACTOR = 4.2e5;

export const defaults = { kiVolume: 10, waterVolume: 10, h2o2Volume: 10, tempC: 25 };

export function iodideConc(inputs) { const total = inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume; return (STOCK_KI_M * inputs.kiVolume) / total; }
export function peroxideConc(inputs) { const total = inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume; return (STOCK_H2O2_M * inputs.h2o2Volume) / total; }
export function rateConstant(inputs) { return A_FACTOR * Math.exp(-EA_JMOL / (R_GAS * (inputs.tempC + 273.15))); }
export function clockTimeS(inputs) {
  const k = rateConstant(inputs);
  const rate = k * iodideConc(inputs) * peroxideConc(inputs); // rate of I2 production, mol/L/s
  const thioMolL = THIO_MM / 1000;
  // Time for enough I2 to form to exhaust the thiosulphate (1 mol I2 per 2 mol thiosulphate).
  return thioMolL / 2 / rate;
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume !== 30) {
    warnings.push({ field: 'waterVolume', code: 'VOLUME_NOT_CONSTANT', message: 'Keep KI + water + H₂O₂ at a constant total volume (usually 30 mL).', why: 'A fixed total volume means only the concentration you are testing changes between runs.' });
  }
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 313);
  const trueTime = clockTimeS(inputs);
  const time = Number((trueTime * (1 + jitter(rng, 0.03))).toFixed(1));
  return { trial, iodideConc: sigFig(iodideConc(inputs), 4), peroxideConc: sigFig(peroxideConc(inputs), 4), tempC: inputs.tempC, time, rate: sigFig(1 / time, 6) };
}

export function derive(rows) {
  const temps = new Set(rows.map((r) => r.tempC));
  if (temps.size >= 3) {
    const pts = rows.map((r) => ({ x: 1 / (Number(r.tempC) + 273.15), y: Math.log(Number(r.rate)) }));
    const fit = linearFit(pts);
    if (!fit) return { ok: false, reason: 'Vary the temperature between readings.' };
    const Ea = -fit.slope * R_GAS / 1000;
    return { ok: true, order: 1, activationEnergy: sigFig(Ea, 4), slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: rows.length, points: rows.map((r) => ({ x: Number(r.iodideConc), y: Number(r.rate) })) };
  }
  const pts = rows.map((r) => ({ x: Number(r.iodideConc), y: Number(r.rate) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the clock time for at least four different iodide concentrations (or vary temperature).' };
  const fit = linearFit(pts);
  return { ok: true, order: fit && fit.r2 > 0.85 ? 1 : null, activationEnergy: sigFig(EA_JMOL / 1000, 4), slope: fit ? sigFig(fit.slope, 4) : null, r2: fit ? Number(fit.r2.toFixed(4)) : null, n: pts.length, points: pts };
}

export default { meta, defaults, STOCK_KI_M, STOCK_H2O2_M, THIO_MM, R_GAS, EA_JMOL, init, step, measure, derive, validate, iodideConc, peroxideConc, rateConstant, clockTimeS };
