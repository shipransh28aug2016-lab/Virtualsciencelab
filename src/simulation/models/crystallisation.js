/**
 * MODEL: Crystallisation of an impure sample — XI-CHE-B03
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section B, Experiment 3.
 * Dissolve in the minimum volume of hot solvent, filter hot to remove
 * insoluble impurity, cool (slowly for large pure crystals), filter the
 * crystals, dry, weigh, and check purity by melting point.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-B03',
  formula: 'Yield = mass dissolved − solubility(cold) × volume; recovery % = crystal mass / crude mass × 100',
  unitSystem: 'gram, millilitre, °C',
  assumptions: ['The solute\'s solubility falls steeply between the hot and cold temperature', 'Soluble impurity stays behind in the mother liquor', 'The minimum volume of hot solvent just dissolves the crude sample'],
  validRange: 'Crude mass 3-15 g, solvent 10-150 mL',
  edgeCases: ['Too much solvent lowers recovery, since more solute stays dissolved in the larger volume of mother liquor', 'Crash-cooling in ice raises yield but gives small, less pure crystals', 'Skipping the hot filtration leaves insoluble impurity in the product'],
  expectedBehaviour: ['Recovery falls as excess solvent is used', 'Slow cooling gives the purest product, closest to the accepted melting point'],
};

export const COMPOUNDS = { alum: { label: 'Potash alum', solubilityHot: 35, solubilityCold: 6, mp: 92 }, copperSulphate: { label: 'Copper sulphate', solubilityHot: 32, solubilityCold: 14, mp: 110 }, benzoic: { label: 'Benzoic acid', solubilityHot: 27, solubilityCold: 2, mp: 122.4 } };
export const CRUDE = { light: { label: 'Lightly impure', impurityPct: 4 }, moderate: { label: 'Moderately impure', impurityPct: 10 }, heavy: { label: 'Heavily impure', impurityPct: 20 } };
export const COOLING = { slow: { label: 'Slow, undisturbed cooling', purityBonus: 1.0, sizeFactor: 1.0 }, bench: { label: 'Left to cool on the bench', purityBonus: 0.7, sizeFactor: 0.7 }, ice: { label: 'Crash-cooled in ice', purityBonus: 0.3, sizeFactor: 0.3 } };

export const defaults = { compound: 'copperSulphate', crude: 'moderate', cooling: 'slow', filtration: 'hot', massG: 8, solventMl: 14, crystallisationTempC: 20 };

export function compoundOf(inputs) { return COMPOUNDS[inputs.compound] || COMPOUNDS.copperSulphate; }

export function crystalMassG(inputs) {
  const c = compoundOf(inputs);
  const purePart = inputs.massG * (1 - (CRUDE[inputs.crude] || CRUDE.moderate).impurityPct / 100);
  const leftInLiquor = (c.solubilityCold * inputs.solventMl) / 100;
  const yield_ = Math.max(0, purePart - leftInLiquor);
  return yield_;
}
export function recoveryPct(inputs) { return (crystalMassG(inputs) / inputs.massG) * 100; }
export function purityMeltingPoint(inputs) {
  const c = compoundOf(inputs);
  const cooling = COOLING[inputs.cooling] || COOLING.slow;
  const filtrationPenalty = inputs.filtration === 'none' ? 3 : 0;
  const impurityLeft = (CRUDE[inputs.crude] || CRUDE.moderate).impurityPct * (1 - cooling.purityBonus) * 0.4 + filtrationPenalty;
  return c.mp - impurityLeft;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const c = compoundOf(inputs);
  const minSolvent = (inputs.massG / c.solubilityHot) * 100;
  if (inputs.solventMl < minSolvent * 0.9) errors.push({ field: 'solventMl', code: 'WONT_DISSOLVE', message: 'This is not enough hot solvent to dissolve the crude sample.', why: `At the boiling point, this solvent dissolves about ${c.solubilityHot} g per 100 mL, so at least ${minSolvent.toFixed(0)} mL is needed for ${inputs.massG} g.`, fix: 'Add more hot solvent, a little at a time, until the sample just dissolves.' });
  if (inputs.solventMl > minSolvent * 1.5) warnings.push({ field: 'solventMl', code: 'EXCESS_SOLVENT', message: 'More solvent than the minimum needed has been used.', why: 'The extra solvent keeps more solute dissolved in the mother liquor at the cold stage, so less crystallises out and the recovery is lower.', fix: 'Use only the minimum volume of hot solvent that just dissolves the sample.' });
  if (inputs.filtration === 'none') warnings.push({ field: 'filtration', code: 'NO_HOT_FILTRATION', message: 'Skipping the hot filtration leaves insoluble impurity in the product.', why: 'Any insoluble matter in the crude sample is only removed by filtering the HOT solution before it is allowed to cool.' });
  if (inputs.cooling === 'ice') warnings.push({ field: 'cooling', code: 'CRASH_COOLED', message: 'Crash-cooling gives a higher yield but a less pure, finer product.', why: 'Rapid cooling nucleates many small crystals quickly, which trap mother liquor (and its dissolved impurity) between them.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, settled: true }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 173);
  const crystalMass = Math.max(0, crystalMassG(inputs) + jitter(rng, 0.15));
  const mp = purityMeltingPoint(inputs) + jitter(rng, 0.3);
  return { trial, compound: compoundOf(inputs).label, crudeMassG: inputs.massG, solventMl: inputs.solventMl, crystalMassG: sigFig(crystalMass, 4), recoveryPct: sigFig((crystalMass / inputs.massG) * 100, 4), meltingPointC: sigFig(mp, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Complete at least one crystallisation run.' };
  const recovery = mean(rows.map((r) => Number(r.recoveryPct)));
  const crystalMass = mean(rows.map((r) => Number(r.crystalMassG)));
  const meltingPoint = mean(rows.map((r) => Number(r.meltingPointC)));
  return { ok: true, recovery: sigFig(recovery, 4), crystalMass: sigFig(crystalMass, 4), meltingPoint: sigFig(meltingPoint, 4), accepted: compoundOf(inputs).mp, n: rows.length, points: rows.map((r) => ({ x: Number(r.solventMl), y: Number(r.recoveryPct) })) };
}

export default { meta, defaults, COMPOUNDS, CRUDE, COOLING, init, step, measure, derive, validate, compoundOf, crystalMassG, recoveryPct, purityMeltingPoint };
