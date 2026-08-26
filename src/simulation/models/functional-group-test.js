/**
 * MODEL: Functional group tests — XII-CHE-H01
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section H, Experiment 1:
 * tests for unsaturation, and alcoholic, phenolic, aldehydic, ketonic,
 * carboxylic and (primary) amino groups.
 */
export const meta = {
  id: 'XII-CHE-H01',
  formula: 'Each functional group has a characteristic, selective reagent test',
  unitSystem: 'Descriptive (colour change / precipitate / gas)',
  assumptions: ['One compound is tested at a time, with the reagent appropriate to the group suspected', 'A positive test is read against a known-negative control mentally, not literally run here'],
  validRange: 'Eight compounds spanning the seven functional groups plus a saturated hydrocarbon control',
  edgeCases: ['Aldehydes give a positive Tollens\' AND Fehling\'s test; ketones give neither', 'Phenols give a violet/blue colour with neutral FeCl₃; carboxylic acids do not, but DO release CO₂ from NaHCO₃'],
  expectedBehaviour: ['Each compound gives a positive result only with the reagent matched to its actual functional group'],
};

export const COMPOUNDS = {
  hexene: { label: '1-Hexene', group: 'unsaturation' },
  ethanol: { label: 'Ethanol', group: 'alcohol' },
  phenol: { label: 'Phenol', group: 'phenol' },
  acetaldehyde: { label: 'Acetaldehyde', group: 'aldehyde' },
  acetone: { label: 'Acetone', group: 'ketone' },
  aceticAcid: { label: 'Acetic acid', group: 'carboxylic' },
  aniline: { label: 'Aniline', group: 'amine' },
  hexane: { label: 'Hexane (saturated, control)', group: 'none' },
};
export const TESTS = {
  bromineWater: { label: 'Bromine water', target: 'unsaturation', positive: 'Decolourises the orange bromine water instantly (addition across the C=C)' },
  baeyer: { label: "Baeyer's test (cold dil. KMnO₄)", target: 'unsaturation', positive: 'Purple colour discharged, brown MnO₂ precipitate forms' },
  ceric: { label: 'Ceric ammonium nitrate', target: 'alcohol', positive: 'Red colour forms (a cerium-alkoxide complex)' },
  lucas: { label: "Lucas' reagent", target: 'alcohol', positive: 'Turbidity/oily layer (rate distinguishes 1°/2°/3°, but this is a general alcohol test)' },
  fecl3: { label: 'Neutral FeCl₃', target: 'phenol', positive: 'Violet / blue-black colouration' },
  tollens: { label: "Tollens' reagent", target: 'aldehyde', positive: 'Bright silver mirror forms on the tube wall' },
  fehling: { label: "Fehling's solution", target: 'aldehyde', positive: 'Blue solution gives a brick-red precipitate of Cu₂O on warming' },
  dnp: { label: '2,4-DNP reagent', target: 'carbonyl', positive: 'Yellow/orange precipitate forms (positive for BOTH aldehyde and ketone)' },
  iodoform: { label: 'Iodoform test', target: 'methylKetone', positive: 'Yellow precipitate of iodoform (CHI₃) with a characteristic smell' },
  nahco3: { label: 'Sodium bicarbonate', target: 'carboxylic', positive: 'Brisk effervescence of CO₂' },
  diazotisation: { label: 'Diazotisation + β-naphthol', target: 'amine', positive: 'Orange-red azo dye forms' },
};

export const defaults = { compound: 'ethanol', test: 'ceric' };

export function compoundOf(inputs) { return COMPOUNDS[inputs.compound] || COMPOUNDS.ethanol; }
export function testOf(inputs) { return TESTS[inputs.test] || TESTS.ceric; }

/** Whether this reagent gives a positive result for this compound's actual group. */
export function isPositive(inputs) {
  const c = compoundOf(inputs); const t = testOf(inputs);
  if (t.target === 'carbonyl') return c.group === 'aldehyde' || c.group === 'ketone';
  if (t.target === 'methylKetone') return inputs.compound === 'acetone';
  return t.target === c.group;
}
export function observation(inputs) {
  return isPositive(inputs) ? testOf(inputs).positive : 'No characteristic colour/precipitate — negative';
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  return { trial, compound: compoundOf(inputs).label, test: testOf(inputs).label, observation: observation(inputs), positive: isPositive(inputs), _group: compoundOf(inputs).group };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Test at least four compounds against their appropriate reagents.' };
  const groupsIdentified = new Set(rows.filter((r) => r.positive).map((r) => r._group));
  return { ok: true, testsRun: rows.length, groupsIdentified: groupsIdentified.size, positiveCount: rows.filter((r) => r.positive).length, n: rows.length, points: [] };
}

export default { meta, defaults, COMPOUNDS, TESTS, init, step, measure, derive, validate, compoundOf, testOf, isPositive, observation };
