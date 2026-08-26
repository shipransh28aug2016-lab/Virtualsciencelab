/**
 * MODEL: Qualitative analysis of an inorganic salt — XI-CHE-F01 and
 * XII-CHE-K01 (the Class XII list adds oxalate to the anions covered).
 * CBSE Chemistry (043) 2026-27.
 *
 * A tray of salts, each hiding one cation and one anion. Preliminary tests
 * (physical appearance, dry heating, flame test) narrow the possibilities;
 * confirmatory wet tests on solution settle the identity. As with the other
 * identification models in this project, the ANSWER is never shown — only
 * the evidence each test would actually produce.
 */
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-F01',
  formula: 'Systematic qualitative analysis: preliminary tests narrow the field, confirmatory tests settle the identity',
  unitSystem: 'Descriptive (colour, precipitate, gas evolved)',
  assumptions: ['One cation and one anion are present, from the syllabus list, in a soluble salt', 'Reagents are added in the standard order so earlier tests do not mask later ones', 'A confirmatory test is only valid once a preliminary test has narrowed the group'],
  validRange: 'Eight salts covering common cations and anions',
  edgeCases: ['Carbonate and sulphite both effervesce with acid; only carbonate\'s gas turns lime water milky AND leaves it milky on continued passage', 'A coloured salt (e.g. blue, green) is itself evidence for a transition-metal cation before any reagent is added'],
  expectedBehaviour: ['Each confirmatory test gives a distinct, reproducible observation for its target ion', 'Combining anion + cation evidence, not either alone, identifies the salt'],
};

export const SALTS = {
  s1: { label: 'Salt 1', cation: 'cu2', anion: 'so4', appearance: 'Blue crystalline solid' },
  s2: { label: 'Salt 2', cation: 'fe3', anion: 'cl', appearance: 'Yellowish-brown solid, deliquescent' },
  s3: { label: 'Salt 3', cation: 'zn2', anion: 'co3', appearance: 'White solid, insoluble in water' },
  s4: { label: 'Salt 4', cation: 'ca2', anion: 'no3', appearance: 'White crystalline solid, deliquescent' },
  s5: { label: 'Salt 5', cation: 'pb2', anion: 'no3', appearance: 'White crystalline solid' },
  s6: { label: 'Salt 6', cation: 'nh4', anion: 'cl', appearance: 'White crystalline solid' },
  s7: { label: 'Salt 7', cation: 'ba2', anion: 'so4', appearance: 'White solid, insoluble in water and dilute acids' },
  s8: { label: 'Salt 8', cation: 'al3', anion: 'cl', appearance: 'White solid, deliquescent, fumes in moist air' },
};

export const CATIONS = {
  cu2: { label: 'Cu²⁺', flameColour: 'blue-green', naohTest: 'Pale blue gelatinous ppt., insoluble in excess', nh4ohTest: 'Pale blue ppt., dissolves in excess giving a deep blue solution' },
  fe3: { label: 'Fe³⁺', flameColour: 'no characteristic colour', naohTest: 'Reddish-brown gelatinous ppt., insoluble in excess', nh4ohTest: 'Reddish-brown ppt., insoluble in excess' },
  zn2: { label: 'Zn²⁺', flameColour: 'no characteristic colour', naohTest: 'White gelatinous ppt., soluble in excess (amphoteric)', nh4ohTest: 'White ppt., soluble in excess' },
  ca2: { label: 'Ca²⁺', flameColour: 'brick red', naohTest: 'White ppt. only in concentrated solution', nh4ohTest: 'No precipitate' },
  pb2: { label: 'Pb²⁺', flameColour: 'no characteristic colour (greyish-white)', naohTest: 'White ppt., soluble in excess (amphoteric)', nh4ohTest: 'White ppt., insoluble in excess' },
  nh4: { label: 'NH₄⁺', flameColour: 'no characteristic colour', naohTest: 'Pungent gas on warming, turns moist red litmus blue', nh4ohTest: 'No precipitate (already the same ion)' },
  ba2: { label: 'Ba²⁺', flameColour: 'apple green', naohTest: 'No precipitate', nh4ohTest: 'No precipitate' },
  al3: { label: 'Al³⁺', flameColour: 'no characteristic colour', naohTest: 'White gelatinous ppt., soluble in excess (amphoteric)', nh4ohTest: 'White gelatinous ppt., insoluble in excess' },
};
export const ANIONS = {
  so4: { label: 'SO₄²⁻', dilAcidTest: 'No visible reaction', baclTest: 'White ppt., insoluble in dil. HCl' },
  cl: { label: 'Cl⁻', dilAcidTest: 'No visible reaction', agno3Test: 'White ppt., soluble in NH₄OH, insoluble in dil. HNO₃' },
  co3: { label: 'CO₃²⁻', dilAcidTest: 'Brisk effervescence, colourless gas', limeWaterTest: 'Gas turns lime water milky; excess gas re-clears it' },
  no3: { label: 'NO₃⁻', dilAcidTest: 'No visible reaction', brownRingTest: 'Brown ring at the junction of the two liquids (FeSO₄ + conc. H₂SO₄)' },
  ox: { label: 'C₂O₄²⁻ (oxalate)', dilAcidTest: 'No visible reaction', kmno4Test: 'Decolourises acidified KMnO₄ on warming (KMnO₄ self-indicates the endpoint)' },
};

export const defaults = { salt: 's1', test: 'appearance', cationGuess: 'cu2', anionGuess: 'so4' };

export function saltOf(inputs) { return SALTS[inputs.salt] || SALTS.s1; }
export function cationOf(salt) { return CATIONS[salt.cation]; }
export function anionOf(salt) { return ANIONS[salt.anion]; }

export function observation(inputs) {
  const salt = saltOf(inputs);
  const cat = cationOf(salt); const an = anionOf(salt);
  switch (inputs.test) {
    case 'appearance': return salt.appearance;
    case 'dilAcid': return an.dilAcidTest;
    case 'flame': return `Flame colour: ${cat.flameColour}`;
    case 'naoh': return cat.naohTest;
    case 'nh4oh': return cat.nh4ohTest;
    case 'confirmAnion': return an.baclTest || an.agno3Test || an.limeWaterTest || an.brownRingTest || an.kmno4Test || 'No specific confirmatory test selected';
    default: return '—';
  }
}

export function correctGuess(inputs) { const s = saltOf(inputs); return inputs.cationGuess === s.cation && inputs.anionGuess === s.anion; }

export function validate(inputs) {
  const warnings = [];
  if (inputs.test === 'confirmAnion' && inputs.cationGuess === defaults.cationGuess && inputs.anionGuess === defaults.anionGuess) {
    warnings.push({ field: 'test', code: 'CONFIRM_BEFORE_PRELIMINARY', message: 'Running the confirmatory test without any preliminary evidence first.', why: 'Systematic analysis narrows the possibilities with preliminary tests (appearance, dilute acid, flame) before spending a confirmatory reagent on a guess.' });
  }
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const salt = saltOf(inputs);
  return { trial, salt: salt.label, test: inputs.test, observation: observation(inputs), cationGuess: (CATIONS[inputs.cationGuess] || {}).label, anionGuess: (ANIONS[inputs.anionGuess] || {}).label, correct: correctGuess(inputs), _salt: inputs.salt };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Analyse at least four salts before drawing conclusions.' };
  const salts = new Set(rows.map((r) => r._salt));
  if (salts.size < 4) return { ok: false, reason: 'Work through at least four different salts.' };
  const correctRows = rows.filter((r) => r.correct);
  const correctSalts = new Set(correctRows.map((r) => r._salt));
  return { ok: true, saltsAnalysed: salts.size, correctlyIdentified: correctSalts.size, accuracyPct: sigFig((correctSalts.size / salts.size) * 100, 3), n: rows.length, points: [] };
}

export default { meta, defaults, SALTS, CATIONS, ANIONS, init, step, measure, derive, validate, saltOf, observation, correctGuess };
