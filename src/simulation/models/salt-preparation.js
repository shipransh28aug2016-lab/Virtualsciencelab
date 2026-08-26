/**
 * MODEL: Preparation of a double salt / complex salt — XII-CHE-F01
 * (ferrous ammonium sulphate or potash alum) and XII-CHE-F02 (potassium
 * ferric oxalate). CBSE Class XII Chemistry (043) 2026-27, Section F.
 *
 * A stoichiometric mixture of the component salts is dissolved, acidified
 * (to prevent hydrolysis for the iron salts), evaporated to the point of
 * crystallisation, and cooled. Yield is limited by solubility at the
 * crystallising temperature, exactly as in XI-CHE-B03's crystallisation.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-F01',
  formula: 'Double/complex salt formed in fixed mole ratio; % yield = (mass obtained / theoretical mass) × 100',
  unitSystem: 'gram, %',
  assumptions: ['Reagents are combined in the stoichiometric mole ratio the product requires', 'The solution is acidified where needed to prevent the metal ion hydrolysing/oxidising before crystallisation', 'Evaporation stops at the first sign of a crystallising film, not to dryness'],
  validRange: 'Scale: 5-10 g of the limiting reagent',
  edgeCases: ['Potassium ferric oxalate is light-sensitive and photoreduces (Fe³⁺→Fe²⁺) if left in bright light', 'Evaporating to dryness (rather than to a crystallising film) fuses the product into an impure cake'],
  expectedBehaviour: ['Correct stoichiometry and acidification give large, well-formed, characteristically coloured crystals', 'Slow, undisturbed cooling gives the best yield of good crystals, as in ordinary crystallisation'],
};

export const PRODUCTS = {
  mohr: { label: "Mohr's salt, FeSO₄·(NH₄)₂SO₄·6H₂O", molarMass: 392.14, colour: 'pale green', needsAcid: true, theoreticalG: 9.8 },
  alum: { label: 'Potash alum, K₂SO₄·Al₂(SO₄)₃·24H₂O', molarMass: 948.0, colour: 'colourless, octahedral', needsAcid: false, theoreticalG: 9.5 },
  ferricOxalate: { label: 'Potassium ferric oxalate, K₃[Fe(C₂O₄)₃]·3H₂O', molarMass: 491.24, colour: 'emerald green, light-sensitive', needsAcid: false, theoreticalG: 8.5 },
};
export const COOLING = { slow: { label: 'Slow, undisturbed cooling', factor: 1.0 }, fast: { label: 'Rapid cooling', factor: 0.85 } };

export const defaults = { product: 'mohr', limitingReagentG: 7, acidified: true, cooling: 'slow', litProtected: true };

export function productOf(inputs) { return PRODUCTS[inputs.product] || PRODUCTS.mohr; }
export function yieldG(inputs) {
  const p = productOf(inputs);
  const scaleFactor = inputs.limitingReagentG / 7;
  const acidPenalty = p.needsAcid && !inputs.acidified ? 0.55 : 1;
  const lightPenalty = inputs.product === 'ferricOxalate' && !inputs.litProtected ? 0.7 : 1;
  const coolFactor = (COOLING[inputs.cooling] || COOLING.slow).factor;
  return p.theoreticalG * scaleFactor * acidPenalty * lightPenalty * coolFactor;
}
export function percentYield(inputs) { return (yieldG(inputs) / (productOf(inputs).theoreticalG * (inputs.limitingReagentG / 7))) * 100; }

export function validate(inputs) {
  const warnings = [];
  const p = productOf(inputs);
  if (p.needsAcid && !inputs.acidified) warnings.push({ field: 'acidified', code: 'NOT_ACIDIFIED', message: `${p.label} needs a little dilute acid in the mother liquor.`, why: 'Without acid, Fe²⁺ hydrolyses (and slowly oxidises to Fe³⁺, which precipitates as a basic salt) before it can crystallise cleanly, badly lowering the yield.', fix: 'Add a few drops of dilute sulphuric acid to the solution before evaporating.' });
  if (inputs.product === 'ferricOxalate' && !inputs.litProtected) warnings.push({ field: 'litProtected', code: 'LIGHT_EXPOSURE', message: 'Potassium ferric oxalate is light-sensitive.', why: 'Light photoreduces Fe³⁺ to Fe²⁺ in this complex, decomposing the product and lowering the yield of the pure emerald-green salt.', fix: 'Keep the solution and crystals away from bright light, e.g. wrapped in dark paper.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, settled: true }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 317);
  const y = Math.max(0, yieldG(inputs) + jitter(rng, 0.15));
  return { trial, product: productOf(inputs).label, limitingReagentG: inputs.limitingReagentG, crystalMassG: sigFig(y, 4), percentYield: sigFig((y / (productOf(inputs).theoreticalG * (inputs.limitingReagentG / 7))) * 100, 4), colour: productOf(inputs).colour };
}

export function derive(rows) {
  if (rows.length < 1) return { ok: false, reason: 'Complete at least one preparation.' };
  const yields = rows.map((r) => Number(r.percentYield));
  return { ok: true, crystalMass: sigFig(mean(rows.map((r) => Number(r.crystalMassG))), 4), percentYield: sigFig(mean(yields), 4), n: rows.length, points: [] };
}

export default { meta, defaults, PRODUCTS, COOLING, init, step, measure, derive, validate, productOf, yieldG, percentYield };
