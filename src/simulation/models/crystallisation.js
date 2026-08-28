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

export function init() { return { t: 0, elapsed: 0, heating: true, temperature: 20, yieldFraction: 0, phase: 'dissolving' }; }
/**
 * Dissolve hot, then cool. The renderer reads `state.heating`,
 * `state.temperature` and `state.yieldFraction` to decide whether to show
 * a hot solution or crystals forming -- step() was a bare no-op, so
 * `state.heating` was permanently undefined, the renderer's own
 * `state?.heating ?? true` fallback made it permanently true, and its
 * `heating ? 0 : ...` branch meant yieldFraction was permanently 0: this
 * scene showed "Hot saturated solution" with not one crystal in it,
 * whether the burner had been lit for a second or for a minute.
 *
 * Crash-cooling in ice really is FASTER than slow, undisturbed cooling —
 * that speed is exactly why it gives small crystals that trap mother
 * liquor, so the cooling method sets the rate here, not just the outcome.
 */
const COOL_RATE = { slow: 0.05, bench: 0.16, ice: 0.5 };
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt; s.elapsed += dt;
  if (s.heating) {
    s.temperature = Math.min(82, s.temperature + dt * 25);
    if (s.temperature >= 80) { s.heating = false; s.phase = 'cooling'; }
    return s;
  }
  const rate = COOL_RATE[inputs.cooling] || COOL_RATE.slow;
  s.temperature = Math.max(20, s.temperature - dt * rate * 70);
  s.yieldFraction = Math.min(1, s.yieldFraction + dt * rate * 0.7);
  if (s.yieldFraction >= 1) s.phase = 'complete';
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 173);
  const crystalMass = Math.max(0, crystalMassG(inputs) + jitter(rng, 0.15));
  const mp = purityMeltingPoint(inputs) + jitter(rng, 0.3);
  return { trial, compound: compoundOf(inputs).label, crudeMassG: inputs.massG, solventMl: inputs.solventMl, cooling: inputs.cooling, crystalMassG: sigFig(crystalMass, 4), recoveryPct: sigFig((crystalMass / inputs.massG) * 100, 4), meltingPointC: sigFig(mp, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Complete at least one crystallisation run.' };
  const recovery = mean(rows.map((r) => Number(r.recoveryPct)));
  const crystalMass = mean(rows.map((r) => Number(r.crystalMassG)));
  const meltingPoint = mean(rows.map((r) => Number(r.meltingPointC)));
  const accepted = compoundOf(inputs).mp;
  const c = compoundOf(inputs);
  const cooling = COOLING[inputs.cooling] || COOLING.slow;
  const crude = CRUDE[inputs.crude] || CRUDE.moderate;

  const meltingPointDeficit = Math.max(0, sigFig(accepted - meltingPoint, 3));
  const purified = meltingPointDeficit < 1.5;
  // What fraction of the CRUDE sample's own impurity is still present, judged
  // by how much of the melting-point depression survives recrystallisation
  // (purityMeltingPoint's own impurityLeft term against the crude's starting
  // depression, evaluated at the settings actually used).
  const startingDepression = c.mp - (c.mp - crude.impurityPct * 0.4); // the crude sample before any purification
  const impurityLeftFrac = startingDepression > 0 ? Math.min(1, meltingPointDeficit / startingDepression) : 0;
  const impurityRemovedPct = sigFig((1 - impurityLeftFrac) * 100, 3);
  const productImpurityPct = sigFig(impurityLeftFrac * crude.impurityPct, 3);

  const minimumSolventMl = sigFig((inputs.massG / c.solubilityHot) * 100, 3);
  const usedSolventMl = inputs.solventMl;
  const lostToMotherLiquorG = sigFig((c.solubilityCold * inputs.solventMl) / 100, 3);

  const crystalSize = cooling.sizeFactor >= 0.85 ? 'large, well-formed' : cooling.sizeFactor >= 0.5 ? 'medium' : 'small, fine';
  const crystalHabit = c.label.toLowerCase().includes('alum') ? 'octahedral' : c.label.toLowerCase().includes('sulphate') ? 'triclinic (blue)' : 'needle-like';

  const byCooling = new Map();
  const bySolvent = new Map();
  for (const r of rows) {
    const coolKey = r.cooling ?? inputs.cooling ?? 'slow';
    if (!byCooling.has(coolKey)) byCooling.set(coolKey, []);
    byCooling.get(coolKey).push(r);
    const solKey = Number(r.solventMl);
    if (!bySolvent.has(solKey)) bySolvent.set(solKey, []);
    bySolvent.get(solKey).push(r);
  }
  const coolingCheck = byCooling.size >= 2
    ? [...byCooling.entries()].map(([name, rs]) => ({
      name: (COOLING[name] || cooling).label ?? String(name),
      mass: sigFig(mean(rs.map((r) => Number(r.crystalMassG))), 3),
      meltingPoint: sigFig(mean(rs.map((r) => Number(r.meltingPointC))), 4),
    }))
    : null;
  const solventCheck = bySolvent.size >= 2
    ? [...bySolvent.entries()].sort((a, b) => a[0] - b[0]).map(([solventMl, rs]) => ({
      solventMl, recovery: sigFig(mean(rs.map((r) => Number(r.recoveryPct))), 3),
    }))
    : null;

  return {
    ok: true, recovery: sigFig(recovery, 4), crystalMass: sigFig(crystalMass, 4), meltingPoint: sigFig(meltingPoint, 4),
    accepted, acceptedMeltingPoint: accepted, n: rows.length, points: rows.map((r) => ({ x: Number(r.solventMl), y: Number(r.recoveryPct) })),
    compound: c.label, crystalSize, crystalHabit, purified, meltingPointDeficit,
    impurityRemovedPct, productImpurityPct, lostToMotherLiquorG, minimumSolventMl, usedSolventMl,
    coolingCheck, solventCheck,
  };
}

export default { meta, defaults, COMPOUNDS, CRUDE, COOLING, init, step, measure, derive, validate, compoundOf, crystalMassG, recoveryPct, purityMeltingPoint };
