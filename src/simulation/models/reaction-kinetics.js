/**
 * MODEL: Rate of reaction between sodium thiosulphate and HCl — XII-CHE-B01
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section B, Experiment 1.
 * Na2S2O3 + 2HCl → 2NaCl + SO2 + S↓ + H2O. The precipitated sulphur turns
 * the solution turbid; the reciprocal of the time for a fixed cross-mark to
 * vanish is taken as the rate. Rate = k[S2O3²⁻]^m; Arrhenius: k=A·e^(−Ea/RT).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-B01',
  formula: 'Rate ∝ 1/t; Rate = k[S2O3²⁻]^m; ln k = ln A − Ea/RT',
  unitSystem: 'mol/L, seconds, kelvin, kJ/mol',
  assumptions: ['HCl is in large excess, so only the thiosulphate concentration limits the rate', 'The same amount of sulphur (same turbidity) must form each time for the times to be comparable', 'The bath temperature is uniform throughout the run'],
  validRange: 'Thiosulphate 0.1-1.0 of stock (diluted with water); 15-65 °C',
  edgeCases: ['Diluting the thiosulphate without changing HCl still leaves HCl in excess, so its own concentration does not enter the rate law', 'A 10 °C rise roughly doubles the rate, typical of the rule of thumb for Ea around 50 kJ/mol'],
  expectedBehaviour: ['1/t is proportional to thiosulphate concentration — first order', 'ln(rate) against 1/T is a straight line whose slope gives the activation energy'],
};

export const STOCK_THIO_M = 0.15;
export const R_GAS = 8.314;
export const EA_JMOL = 48000;
export const A_FACTOR = 7.5e6; // pre-exponential, chosen so k(298K) matches the observed rate scale

export const defaults = { thioVolume: 50, waterVolume: 0, hclVolume: 5, tempC: 25 };

export function thioConc(inputs) { return (STOCK_THIO_M * inputs.thioVolume) / (inputs.thioVolume + inputs.waterVolume + inputs.hclVolume); }
export function rateConstant(inputs) { return A_FACTOR * Math.exp(-EA_JMOL / (R_GAS * (inputs.tempC + 273.15))); }
export function reactionTimeS(inputs) {
  const k = rateConstant(inputs);
  const rate = k * thioConc(inputs); // first order
  return 1 / rate;
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.thioVolume + inputs.waterVolume !== 50) {
    warnings.push({ field: 'waterVolume', code: 'VOLUME_NOT_CONSTANT', message: 'The total volume of thiosulphate plus water should stay fixed.', why: 'Keeping thiosulphate + water at a constant total (usually 50 mL) means only the thiosulphate concentration changes between runs, isolating its effect on the rate.', fix: 'Set water volume so that thiosulphate + water = 50 mL.' });
  }
  return { ok: true, errors: [], warnings };
}
export function init() {
  return { t: 0, running: false, elapsed: 0, turbidity: 0, crossVisible: true, finishedAt: null };
}

/**
 * The reaction runs on the clock.
 *
 * Na2S2O3 + 2HCl -> 2NaCl + SO2 + S + H2O: the sulphur comes out as a
 * colloid, and the flask clouds until the ink cross beneath it disappears.
 * Turbidity therefore grows with the sulphur produced, which for this
 * pseudo-first-order rate is 1 - exp(-t/tau); the cross is called gone
 * when it crosses the opacity a person stops being able to see through,
 * and that instant IS the measurement, so it must be the same instant the
 * model reports.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.running || s.finishedAt) return s;
  s.elapsed += dt;
  const tEnd = reactionTimeS(inputs);
  s.turbidity = 1 - Math.exp(-2.4 * (s.elapsed / tEnd));
  s.crossVisible = s.turbidity < 0.78;
  if (!s.crossVisible) s.finishedAt = s.elapsed;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 281);
  const trueTime = reactionTimeS(inputs);
  const time = Number((trueTime * (1 + jitter(rng, 0.03))).toFixed(1));
  return { thioVolume: inputs.thioVolume, waterVolume: inputs.waterVolume, thioConc: sigFig(thioConc(inputs), 4), tempC: inputs.tempC, time, rate: sigFig(1 / time, 6) };
}

export function derive(rows, inputs = defaults) {
  const temps = new Set(rows.map((r) => r.tempC));
  if (temps.size >= 3) {
    // Arrhenius run: temperature varied at fixed concentration.
    const pts = rows.map((r) => ({ x: 1 / (Number(r.tempC) + 273.15), y: Math.log(Number(r.rate)) }));
    const fit = linearFit(pts);
    if (!fit) return { ok: false, reason: 'Vary the temperature between readings.' };
    const Ea = -fit.slope * R_GAS / 1000;
    return { ok: true, order: 1, activationEnergy: sigFig(Ea, 4), slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: rows.length, points: rows.map((r) => ({ x: Number(r.thioConc), y: Number(r.rate) })) };
  }
  const pts = rows.map((r) => ({ x: Number(r.thioConc), y: Number(r.rate) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the rate for at least four different thiosulphate concentrations (or vary temperature for the Arrhenius plot).' };
  const fit = fitThroughOrigin(pts);
  return { ok: true, order: fit && fit.r2 > 0.9 ? 1 : null, activationEnergy: sigFig(EA_JMOL / 1000, 4), slope: fit ? sigFig(fit.slope, 4) : null, r2: fit ? Number(fit.r2.toFixed(4)) : null, n: pts.length, points: pts };
}

export default { meta, defaults, STOCK_THIO_M, R_GAS, EA_JMOL, A_FACTOR, init, step, measure, derive, validate, thioConc, rateConstant, reactionTimeS };
