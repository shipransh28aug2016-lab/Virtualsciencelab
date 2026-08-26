/**
 * MODEL: Organic preparations — XII-CHE-G01 (acetanilide), G02
 * (dibenzalacetone), G03 (p-nitroacetanilide) and G04 (aniline yellow /
 * 2-naphthol aniline dye). CBSE Class XII Chemistry (043) 2026-27, Section G.
 *
 * All four share the same experimental shape: react known masses of
 * starting materials under the specified conditions, isolate the crude
 * solid, recrystallise it, and report % yield plus a melting-point purity
 * check (tying back to the melting-point technique of XI-CHE-B01).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-G01',
  formula: '% yield = (moles of product obtained / moles of limiting reagent) × 100',
  unitSystem: 'gram, %, °C (melting point)',
  assumptions: ['The reaction goes to a realistic (not 100%) completion under school conditions', 'Recrystallisation removes most, but never quite all, impurity in one pass', 'Melting point sharpness is the purity check, exactly as in XI-CHE-B01'],
  validRange: 'Scale: 2-5 g of the limiting reagent',
  edgeCases: ['Insufficient cooling during the exothermic acetylation of aniline lets acetanilide oxidise/discolour', 'A diazonium salt (aniline yellow) decomposes above about 5 °C and must be kept ice-cold until coupling'],
  expectedBehaviour: ['A second recrystallisation raises the melting point closer to the literature value at some cost in yield', 'Crude yield is always higher than purified yield — the gap IS the impurity removed'],
};

export const PREPARATIONS = {
  acetanilide: { label: 'Acetanilide (from aniline + acetic anhydride)', mp: 114.3, crudeYieldPct: 78, recrystallisedYieldPct: 62 },
  dibenzalacetone: { label: 'Dibenzalacetone (from benzaldehyde + acetone, aldol condensation)', mp: 112.0, crudeYieldPct: 70, recrystallisedYieldPct: 55 },
  pNitroacetanilide: { label: 'p-Nitroacetanilide (nitration of acetanilide)', mp: 214.0, crudeYieldPct: 65, recrystallisedYieldPct: 48 },
  anilineYellow: { label: 'Aniline yellow (diazotisation + coupling with N,N-dimethylaniline)', mp: 128.0, crudeYieldPct: 60, recrystallisedYieldPct: 42 },
};

export const defaults = { preparation: 'acetanilide', startingMassG: 3.0, iceCold: true, secondRecrystallisation: false, coolingAdequate: true };

export function prepOf(inputs) { return PREPARATIONS[inputs.preparation] || PREPARATIONS.acetanilide; }

export function crudeYieldPct(inputs) {
  const p = prepOf(inputs);
  const coolingPenalty = !inputs.coolingAdequate ? 0.75 : 1;
  const icePenalty = inputs.preparation === 'anilineYellow' && !inputs.iceCold ? 0.4 : 1;
  return p.crudeYieldPct * coolingPenalty * icePenalty;
}
export function purifiedYieldPct(inputs) {
  const p = prepOf(inputs);
  const base = (p.recrystallisedYieldPct / p.crudeYieldPct) * crudeYieldPct(inputs);
  return inputs.secondRecrystallisation ? base * 0.87 : base; // a 2nd recrystallisation trades yield for purity
}
export function meltingPointObtained(inputs) {
  const p = prepOf(inputs);
  return inputs.secondRecrystallisation ? p.mp - 0.3 : p.mp - 1.5; // a second recrystallisation sharpens/raises the mp closer to true
}

export function validate(inputs) {
  const warnings = [];
  if (!inputs.coolingAdequate) warnings.push({ field: 'coolingAdequate', code: 'POOR_COOLING', message: 'This reaction is exothermic and needs adequate cooling.', why: 'Without cooling, side reactions (oxidation, over-reaction, tar formation) compete and lower both the yield and the purity of the crude product.' });
  if (inputs.preparation === 'anilineYellow' && !inputs.iceCold) warnings.push({ field: 'iceCold', code: 'DIAZONIUM_WARM', message: 'The diazonium salt was not kept ice-cold.', why: 'A diazonium salt decomposes rapidly above about 5 °C, releasing nitrogen gas and destroying the intermediate needed for the coupling step.', fix: 'Keep the diazotisation and coupling steps in an ice bath throughout.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, elapsed: 0, reflux: 0, bubbles: 0, product: 0, phase: 'heating' }; }
/**
 * An organic preparation under reflux. The mixture is brought to the boil,
 * held there while the reaction proceeds, and the product then separates
 * on pouring into ice-cold water.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt; s.elapsed += dt;
  s.reflux = Math.min(1, s.reflux + dt * 0.3);
  s.bubbles = s.reflux > 0.75 ? (s.reflux - 0.75) / 0.25 : 0;
  if (s.reflux >= 1) {
    s.phase = 'reacting';
    s.product = Math.min(1, s.product + dt * 0.12);
    if (s.product >= 1) s.phase = 'complete';
  }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 331);
  const crude = crudeYieldPct(inputs) * (1 + jitter(rng, 0.03));
  const pure = purifiedYieldPct(inputs) * (1 + jitter(rng, 0.03));
  const mp = meltingPointObtained(inputs) + jitter(rng, 0.3);
  return { trial, preparation: prepOf(inputs).label, startingMassG: inputs.startingMassG, crudeYieldPct: sigFig(crude, 4), purifiedYieldPct: sigFig(pure, 4), meltingPointC: sigFig(mp, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Complete at least one preparation.' };
  const p = prepOf(inputs);
  return {
    ok: true, crudeYield: sigFig(mean(rows.map((r) => Number(r.crudeYieldPct))), 4),
    purifiedYield: sigFig(mean(rows.map((r) => Number(r.purifiedYieldPct))), 4),
    meltingPoint: sigFig(mean(rows.map((r) => Number(r.meltingPointC))), 4), accepted: p.mp, n: rows.length, points: [],
  };
}

export default { meta, defaults, PREPARATIONS, init, step, measure, derive, validate, prepOf, crudeYieldPct, purifiedYieldPct, meltingPointObtained };
