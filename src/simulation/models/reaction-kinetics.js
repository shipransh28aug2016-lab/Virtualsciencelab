/**
 * MODEL: Sodium thiosulphate clock reaction with hydrochloric acid.
 * Na₂S₂O₃(aq) + 2HCl(aq) → 2NaCl(aq) + SO₂(g) + S(s) + H₂O(l)
 * HCl is in excess; the educational rate model is pseudo-first-order in
 * thiosulphate. The endpoint is a fixed optical turbidity threshold.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-B01',
  formula: 'Na₂S₂O₃ + 2HCl → 2NaCl + SO₂ + S↓ + H₂O; rate = k[S₂O₃²⁻]',
  unitSystem: 'mol/L, seconds, kelvin, kJ/mol',
  assumptions: ['HCl remains in large excess', 'The same turbidity endpoint is used for every trial', 'Solutions are well mixed and volumes are additive'],
  validRange: 'Thiosulphate 0.1–1.0 of stock; 15–65 °C',
  edgeCases: ['Zero thiosulphate is invalid', 'Changing total volume changes concentration'],
  expectedBehaviour: ['Higher concentration shortens the endpoint time', 'Higher temperature shortens the endpoint time', '1/t is proportional to thiosulphate concentration'],
};

export const STOCK_THIO_M = 0.15;
export const R_GAS = 8.314;
export const EA_JMOL = 48000;
/**
 * Arrhenius pre-exponential factor, in M⁻¹s⁻¹.
 *
 * With Ea = 48 kJ/mol this fixes how long the cross takes to disappear, and
 * it was six times too small: the standard preparation — 50 mL of 0.15 M
 * sodium thiosulphate with 5 mL of acid at 25 °C — came out at 252 s, and
 * the most dilute setting the bench allows at 2512 s. Forty-two minutes for
 * one reading, on an experiment that needs five of them.
 *
 * A school clock reaction at these concentrations takes about forty seconds,
 * and that is what this now gives. The dilute end takes ten times longer
 * because the concentration is ten times smaller, which is the proportionality
 * the experiment exists to measure; the simulation clock covers the wait.
 */
export const A_FACTOR = 4.5e7;
export const TURBIDITY_ENDPOINT = 0.78;
export const defaults = { thioVolume: 50, waterVolume: 0, hclVolume: 5, tempC: 25 };

export function thioConc(inputs = defaults) {
  const total = Number(inputs.thioVolume || 0) + Number(inputs.waterVolume || 0) + Number(inputs.hclVolume || 0);
  return total > 0 ? STOCK_THIO_M * Number(inputs.thioVolume || 0) / total : 0;
}
export function rateConstant(inputs = defaults) {
  return A_FACTOR * Math.exp(-EA_JMOL / (R_GAS * (Number(inputs.tempC) + 273.15)));
}
export function reactionTimeS(inputs = defaults) {
  const rate = rateConstant(inputs) * thioConc(inputs);
  return rate > 0 ? 1 / rate : Infinity;
}
export function validate(inputs = defaults) {
  const errors = [];
  const warnings = [];
  if (Number(inputs.thioVolume || 0) <= 0) errors.push({ field: 'thioVolume', code: 'NO_REACTANT', message: 'Use a non-zero thiosulphate volume.', why: 'Sulfur cannot form without the limiting reactant.', fix: 'Increase thiosulphate volume.' });
  if (Number(inputs.hclVolume || 0) <= 0) errors.push({ field: 'hclVolume', code: 'NO_ACID', message: 'Add hydrochloric acid.', why: 'The clock reaction requires acid.', fix: 'Use a positive HCl volume.' });
  if (Number(inputs.thioVolume || 0) + Number(inputs.waterVolume || 0) !== 50) warnings.push({ field: 'waterVolume', code: 'VOLUME_NOT_CONSTANT', message: 'Keep thiosulphate plus water at 50 mL.', why: 'Changing total volume changes concentration and rate.', fix: 'Adjust water when changing thiosulphate.' });
  return { ok: errors.length === 0, errors, warnings };
}
export function init() { return { t: 0, running: false, elapsed: 0, turbidity: 0, crossVisible: true, finishedAt: null }; }
export function step(state, inputs, dt = 0.016) {
  const s = { ...state };
  s.t += dt;
  if (!s.running || s.finishedAt) return s;
  s.elapsed += dt;
  const tau = reactionTimeS(inputs);
  s.turbidity = Number.isFinite(tau) ? 1 - Math.exp(-2.4 * s.elapsed / tau) : 0;
  s.crossVisible = s.turbidity < TURBIDITY_ENDPOINT;
  if (!s.crossVisible) s.finishedAt = s.elapsed;
  return s;
}
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state?.finishedAt) return { v: null, reason: 'The cross is still visible. Add the acid and let the sulphur cloud build up until the cross has completely disappeared, then record the time.' };
  const rng = makeRng(seed + trial * 281);
  const time = Number((reactionTimeS(inputs) * (1 + jitter(rng, 0.03))).toFixed(1));
  /* The total volume goes in the row because the method depends on it: every
     run must be made up to the same volume, or the concentration is not the
     only thing that changed. */
  const totalMl = Number(inputs.thioVolume || 0) + Number(inputs.waterVolume || 0) + Number(inputs.hclVolume || 0);
  return { trial, thioVolume: inputs.thioVolume, waterVolume: inputs.waterVolume, totalMl, thioConc: sigFig(thioConc(inputs), 4), tempC: inputs.tempC, time, rate: sigFig(1 / time, 6) };
}
export function derive(rows) {
  const temps = new Set(rows.map((r) => Number(r.tempC)));
  if (temps.size >= 3) {
    const pts = rows.map((r) => ({ x: 1 / (Number(r.tempC) + 273.15), y: Math.log(Number(r.rate)) }));
    const fit = linearFit(pts);
    if (!fit) return { ok: false, reason: 'Vary the temperature between readings.' };
    return { ok: true, mode: 'arrhenius', order: 1, activationEnergy: sigFig(-fit.slope * R_GAS / 1000, 4), acceptedEa: sigFig(EA_JMOL / 1000, 4), slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: rows.length, points: rows.map((r) => ({ x: Number(r.thioConc), y: Number(r.rate) })) };
  }
  const points = rows.map((r) => ({ x: Number(r.thioConc), y: Number(r.rate) }));
  if (points.length < 4) return { ok: false, reason: 'Record at least four different thiosulphate concentrations or vary temperature for an Arrhenius plot.' };

  /*
   * Every run must be made up to the SAME total volume.
   *
   * That is the whole reason water is added: thiosulphate and water together
   * always make 50 mL, so the only thing that changes between runs is the
   * concentration. Left to vary, the acid is diluted along with everything
   * else and the rate stops being proportional to [S₂O₃²⁻]. The bench
   * carried this as a gentle warning and then fitted the points anyway,
   * reporting "Order = null" — the word null, on the line that is supposed
   * to carry the answer.
   */
  const totals = [...new Set(rows.map((r) => Number(r.totalMl)).filter(Number.isFinite))];
  if (totals.length > 1) {
    return {
      ok: false,
      reason: `These runs were made up to ${totals.length} different total volumes (${totals.map((t) => `${t} mL`).join(', ')}). Thiosulphate and water together must always come to the same volume, so that concentration is the only thing that changes — add water to make up whatever thiosulphate you leave out.`,
    };
  }

  const fit = fitThroughOrigin(points);
  if (!fit || !(fit.r2 > 0.9)) {
    return {
      ok: false,
      reason: `The rate does not fall on a straight line through the origin (r² = ${fit ? fit.r2.toFixed(3) : '—'}). For a first-order reaction it should. Check that each run was timed to the same degree of cloudiness, that the temperature held steady, and that the total volume was the same every time.`,
    };
  }
  return { ok: true, mode: 'concentration', order: 1, orderRounded: 1, activationEnergy: sigFig(EA_JMOL / 1000, 4), slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: points.length, points };
}
export default { meta, defaults, STOCK_THIO_M, R_GAS, EA_JMOL, A_FACTOR, TURBIDITY_ENDPOINT, init, step, measure, derive, validate, thioConc, rateConstant, reactionTimeS };
