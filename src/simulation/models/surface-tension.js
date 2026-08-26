/**
 * MODEL: Surface tension of water by capillary rise — XI-PHY-B04
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 4.
 * T = rhρg/2 (θ ≈ 0 for water on clean glass); Jurin's law h ∝ 1/r.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B04',
  formula: 'T = rhρg/(2cosθ) ≈ rhρg/2',
  unitSystem: 'SI: metre and N·m⁻¹, reported also in cm for the bench readings',
  assumptions: ['The tube is clean, so the contact angle is nearly zero', 'The liquid wets the glass', 'The tube is vertical and of uniform, circular bore'],
  validRange: 'Bore radius 0.02-0.06 cm',
  edgeCases: ['A greasy tube gives a non-zero contact angle and a low apparent T', 'Soapy water has a much lower surface tension'],
  expectedBehaviour: ['h is inversely proportional to r — Jurin\'s law', 'The product r×h is the same for every capillary tube used'],
};

export const G = 9.792;
export const TUBES = { t1: { label: 'Capillary 1', radiusCm: 0.020 }, t2: { label: 'Capillary 2', radiusCm: 0.030 }, t3: { label: 'Capillary 3', radiusCm: 0.045 }, t4: { label: 'Capillary 4', radiusCm: 0.060 } };
export const LIQUIDS = { water: { label: 'Water', T20: 0.0727, rho: 998, dTdC: -0.00015 }, soapy: { label: 'Soapy water', T20: 0.030, rho: 1000, dTdC: -0.0001 }, mercury: { label: 'Mercury (does not wet)', T20: 0.487, rho: 13546, dTdC: -0.0002, nonWetting: true } };

export const defaults = { tube: 't2', liquid: 'water', tempC: 20, cleanTube: true };

export function liquidOf(inputs) { return LIQUIDS[inputs.liquid] || LIQUIDS.water; }
export function tubeOf(inputs) { return TUBES[inputs.tube] || TUBES.t2; }
export function surfaceTensionAt(inputs) {
  const l = liquidOf(inputs);
  return Math.max(0.001, l.T20 + l.dTdC * (inputs.tempC - 20));
}
export function riseCm(inputs) {
  const l = liquidOf(inputs);
  if (l.nonWetting) return 0; // mercury depresses rather than rises; excluded from this bench
  const contactFactor = inputs.cleanTube ? 1 : 0.6; // grease raises the contact angle
  const T = surfaceTensionAt(inputs) * contactFactor;
  const r = tubeOf(inputs).radiusCm / 100; // m
  const h = (2 * T) / (r * l.rho * G); // m
  return h * 100;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (liquidOf(inputs).nonWetting) errors.push({ field: 'liquid', code: 'NON_WETTING', message: 'Mercury does not wet glass, so it is depressed rather than raised.', why: 'The capillary-rise method as set up here needs a wetting liquid with a contact angle near zero.', fix: 'Choose water or soapy water.' });
  if (!inputs.cleanTube) warnings.push({ field: 'cleanTube', code: 'GREASY_TUBE', message: 'A greasy tube gives a low, unreliable rise.', why: 'Grease increases the contact angle, so cosθ falls below 1 and the apparent surface tension reads low.', fix: 'Clean the capillary with chromic acid or a detergent, then rinse well.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  if (liquidOf(inputs).nonWetting) return null;
  const rng = makeRng(seed + trial * 83);
  const r = tubeOf(inputs).radiusCm;
  const h = riseCm(inputs) + jitter(rng, 0.015);
  return { trial, tube: tubeOf(inputs).label, radiusCm: r, invRadius: sigFig(1 / r, 4), riseCm: Number(h.toFixed(3)), product: sigFig(r * h, 4), tempC: inputs.tempC };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.invRadius), y: Number(r.riseCm) }));
  if (pts.length < 3) return { ok: false, reason: 'Record the rise in at least three different tubes.' };
  const fit = fitThroughOrigin(pts);
  const l = liquidOf(inputs);
  // slope = 2T/(ρg), with r,h in cm -> convert to SI: slope(cm²) * 1e-4 m² / cm²... slope units cm since y=h(cm), x=1/r(1/cm) => slope has units cm².
  const slopeM2 = fit.slope * 1e-4;
  const T = (slopeM2 * l.rho * G) / 2;
  const products = rows.map((r) => Number(r.product));
  const meanProduct = products.reduce((a, b) => a + b, 0) / products.length;
  return {
    ok: true, surfaceTension: sigFig(T, 4), tFromGraph: sigFig(T, 4), productConstant: sigFig(meanProduct, 4),
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { meta, defaults, TUBES, LIQUIDS, G, init, step, measure, derive, validate, liquidOf, tubeOf, surfaceTensionAt, riseCm };
