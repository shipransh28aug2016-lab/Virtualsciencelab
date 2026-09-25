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
import { mixedSetRefusal, specimenOfRows } from '../one-specimen.js';

export const meta = {
  id: 'XII-CHE-F01',
  formula: 'Double/complex salt formed in fixed mole ratio; % yield = (mass obtained / theoretical mass) × 100',
  unitSystem: 'gram, %',
  assumptions: ['Reagents are combined in the stoichiometric mole ratio the product requires', 'The solution is acidified where needed to prevent the metal ion hydrolysing/oxidising before crystallisation', 'Evaporation stops at the first sign of a crystallising film, not to dryness'],
  validRange: 'Scale: 5-10 g of the limiting reagent',
  edgeCases: ['Potassium ferric oxalate is light-sensitive and photoreduces (Fe³⁺→Fe²⁺) if left in bright light', 'Evaporating to dryness (rather than to a crystallising film) fuses the product into an impure cake'],
  expectedBehaviour: ['Correct stoichiometry and acidification give large, well-formed, characteristically coloured crystals', 'Slow, undisturbed cooling gives the best yield of good crystals, as in ordinary crystallisation'],
};

/**
 * `theoreticalG` is the mass stoichiometry allows from 7 g of the limiting
 * reagent. `recovery` is the fraction of it a careful worker actually gets
 * into the filter paper.
 *
 * The model had no recovery at all: the ideal procedure — acidified, kept
 * out of the light, cooled slowly — returned the full theoretical mass and
 * a yield of 100%, which no preparation in any laboratory has ever given.
 * The accepted values these experiments declare (62% for Mohr's salt, 55%
 * for potassium ferric oxalate) are the real figures, so the bench could
 * only reach them by doing the preparation BADLY: a student who followed the
 * method perfectly was told they were 45% out, and one who left the complex
 * in the light was told they were right.
 *
 * What is lost is not a mistake. Some product stays dissolved in the mother
 * liquor at the crystallising temperature, and some is left on the glass.
 */
export const PRODUCTS = {
  mohr: { label: "Mohr's salt, FeSO₄·(NH₄)₂SO₄·6H₂O", molarMass: 392.14, colour: 'pale green', needsAcid: true, theoreticalG: 9.8, recovery: 0.62 },
  alum: { label: 'Potash alum, K₂SO₄·Al₂(SO₄)₃·24H₂O', molarMass: 948.0, colour: 'colourless, octahedral', needsAcid: false, theoreticalG: 9.5, recovery: 0.66 },
  ferricOxalate: { label: 'Potassium ferric oxalate, K₃[Fe(C₂O₄)₃]·3H₂O', molarMass: 491.24, colour: 'emerald green, light-sensitive', needsAcid: false, theoreticalG: 8.5, recovery: 0.55 },
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
  return p.theoreticalG * (p.recovery ?? 0.62) * scaleFactor * acidPenalty * lightPenalty * coolFactor;
}
export function percentYield(inputs) { return (yieldG(inputs) / (productOf(inputs).theoreticalG * (inputs.limitingReagentG / 7))) * 100; }

export function validate(inputs) {
  const warnings = [];
  const p = productOf(inputs);
  if (p.needsAcid && !inputs.acidified) warnings.push({ field: 'acidified', code: 'NOT_ACIDIFIED', message: `${p.label} needs a little dilute acid in the mother liquor.`, why: 'Without acid, Fe²⁺ hydrolyses (and slowly oxidises to Fe³⁺, which precipitates as a basic salt) before it can crystallise cleanly, badly lowering the yield.', fix: 'Add a few drops of dilute sulphuric acid to the solution before evaporating.' });
  if (inputs.product === 'ferricOxalate' && !inputs.litProtected) warnings.push({ field: 'litProtected', code: 'LIGHT_EXPOSURE', message: 'Potassium ferric oxalate is light-sensitive.', why: 'Light photoreduces Fe³⁺ to Fe²⁺ in this complex, decomposing the product and lowering the yield of the pure emerald-green salt.', fix: 'Keep the solution and crystals away from bright light, e.g. wrapped in dark paper.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, elapsed: 0, evaporated: 0, crystals: 0, phase: 'heating' }; }
/**
 * Preparing a double or complex salt. The solution is evaporated to the
 * crystallisation point, then set aside: crystals grow only on cooling,
 * and slow cooling grows the large well-formed ones the exercise asks for.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt; s.elapsed += dt;
  if (s.evaporated < 1) {
    s.evaporated = Math.min(1, s.evaporated + dt * 0.14);
    s.phase = 'evaporating';
    return s;
  }
  s.phase = 'crystallising';
  const rate = inputs.cooling === 'slow' ? 0.09 : 0.3;   // fast cooling -> small crystals
  s.crystals = Math.min(1, s.crystals + dt * rate);
  if (s.crystals >= 1) s.phase = 'complete';
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 317);
  const y = Math.max(0, yieldG(inputs) + jitter(rng, 0.15));
  /* How the preparation was actually done, so the result can say why the
     yield came out where it did rather than leaving the student to guess. */
  return { trial, product: productOf(inputs).label,
    acidified: inputs.acidified ? 'acidified' : 'not acidified',
    cooling: (COOLING[inputs.cooling] || COOLING.slow).label,
    litProtected: inputs.litProtected ? 'kept dark' : 'left in the light', limitingReagentG: inputs.limitingReagentG, crystalMassG: sigFig(y, 4), percentYield: sigFig((y / (productOf(inputs).theoreticalG * (inputs.limitingReagentG / 7))) * 100, 4), colour: productOf(inputs).colour };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Complete at least one preparation.' };
  const mixed = mixedSetRefusal(rows, 'product', 'salts');
  if (mixed) return mixed;

  const p = specimenOfRows(PRODUCTS, rows, 'product', productOf(inputs));
  const yields = rows.map((r) => Number(r.percentYield));

  /*
   * Name what the yield was lost to.
   *
   * A preparation that comes out at 39% instead of 62% has not failed
   * mysteriously: something in the method took it there, and the bench knows
   * which. Leaving the student with "your value differs by 36%" turns a
   * teaching moment into a mark.
   */
  const last = rows[rows.length - 1];
  const lost = [];
  if (last.acidified === 'not acidified' && p.needsAcid) {
    lost.push('the solution was not acidified, so some of the iron(II) hydrolysed before it could crystallise');
  }
  if (/rapid/i.test(String(last.cooling))) {
    lost.push('rapid cooling gives many small crystals that trap mother liquor, and less product on the filter');
  }
  if (last.litProtected === 'left in the light' && p.label.includes('oxalate')) {
    lost.push('the complex was left in the light, and light reduces Fe(III) in it to Fe(II)');
  }
  return {
    ok: true,
    crystalMass: sigFig(mean(rows.map((r) => Number(r.crystalMassG))), 4),
    percentYield: sigFig(mean(yields), 4),
    /* What a careful preparation of THIS salt gives — the rest stays in the
       mother liquor and on the glass. */
    accepted: sigFig((p.recovery ?? 0.62) * 100, 3),
    product: p.label, colour: p.colour,
    lostTo: lost.length ? lost.join('; ') : null,
    method: `${last.cooling}, ${last.acidified}${p.label.includes('oxalate') ? `, ${last.litProtected}` : ''}`,
    n: rows.length, points: [],
  };
}

export default { meta, defaults, PRODUCTS, COOLING, init, step, measure, derive, validate, productOf, yieldG, percentYield };
