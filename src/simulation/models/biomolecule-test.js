/**
 * MODEL: Characteristic tests of carbohydrates, fats and proteins — XII-CHE-I01
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section I, Experiment 1.
 */
export const meta = {
  id: 'XII-CHE-I01',
  formula: 'Each class of biomolecule has selective colour/precipitate reactions',
  unitSystem: 'Descriptive (colour change / precipitate)',
  assumptions: ['Pure samples are tested first, then unknown foodstuffs, so the reagent\'s behaviour is calibrated on a known case first', 'Reagents are freshly prepared (Fehling\'s A and B mixed just before use, for instance)'],
  validRange: 'Six pure samples and two foodstuff extracts',
  edgeCases: ['Sucrose does NOT reduce Fehling\'s solution directly (it must first be hydrolysed) — a common source of a mistaken "negative" verdict', 'A protein containing no tyrosine/tryptophan gives a weak or negative xanthoproteic test despite being a protein'],
  expectedBehaviour: ['Molisch\'s test is positive for every carbohydrate tested, including sucrose', 'Only reducing sugars are positive with Fehling\'s/Benedict\'s'],
};

export const SAMPLES = {
  glucose: { label: 'Glucose solution', kind: 'carb', reducing: true },
  sucrose: { label: 'Sucrose solution', kind: 'carb', reducing: false },
  starch: { label: 'Starch suspension', kind: 'carb', reducing: false, isStarch: true },
  oil: { label: 'Vegetable oil', kind: 'fat' },
  eggAlbumin: { label: 'Egg albumin solution', kind: 'protein' },
  gelatin: { label: 'Gelatin solution', kind: 'protein', weakXanthoproteic: true },
  milk: { label: 'Milk (foodstuff)', kind: 'mixed', hasProtein: true, hasCarb: true, reducingCarb: false, hasFat: true },
  potatoExtract: { label: 'Potato extract (foodstuff)', kind: 'mixed', hasProtein: false, hasCarb: true, reducingCarb: false, isStarch: true, hasFat: false },
};
export const TESTS = {
  molisch: { label: "Molisch's test", family: 'carb', positive: 'Violet ring at the liquid-acid junction — general test for ALL carbohydrates' },
  fehling: { label: "Fehling's test", family: 'reducingCarb', positive: 'Brick-red Cu₂O precipitate on warming' },
  iodine: { label: 'Iodine test', family: 'starch', positive: 'Deep blue-black colouration (reversible on heating)' },
  grease: { label: 'Grease-spot test', family: 'fat', positive: 'Translucent (greasy) spot on paper that does not disappear on warming' },
  acrolein: { label: 'Acrolein test', family: 'fat', positive: 'Pungent, irritating odour of acrolein on heating with KHSO₄' },
  biuret: { label: 'Biuret test', family: 'protein', positive: 'Violet/pink colouration (peptide bonds + Cu²⁺ in alkali)' },
  xanthoproteic: { label: 'Xanthoproteic test', family: 'protein', positive: 'Yellow colour, turning orange on adding alkali (aromatic amino acid residues)' },
};

export const defaults = { sample: 'glucose', test: 'molisch' };

export function sampleOf(inputs) { return SAMPLES[inputs.sample] || SAMPLES.glucose; }
export function testOf(inputs) { return TESTS[inputs.test] || TESTS.molisch; }

export function isPositive(inputs) {
  const s = sampleOf(inputs); const t = testOf(inputs);
  const hasCarb = s.kind === 'carb' || s.hasCarb;
  const hasFat = s.kind === 'fat' || s.hasFat;
  const hasProtein = s.kind === 'protein' || s.hasProtein;
  const reducing = s.reducing || s.reducingCarb;
  const starch = s.isStarch;
  if (t.family === 'carb') return hasCarb;
  if (t.family === 'reducingCarb') return hasCarb && reducing;
  if (t.family === 'starch') return hasCarb && starch;
  if (t.family === 'fat') return hasFat;
  if (t.family === 'protein') return hasProtein && !(s.weakXanthoproteic && t === TESTS.xanthoproteic);
  return false;
}
export function observation(inputs) {
  if (isPositive(inputs)) return testOf(inputs).positive;
  const s = sampleOf(inputs); const t = testOf(inputs);
  if (t.family === 'protein' && (s.kind === 'protein' || s.hasProtein) && s.weakXanthoproteic && inputs.test === 'xanthoproteic') {
    return 'Only a faint yellow — this protein is low in aromatic (tyrosine/tryptophan) residues';
  }
  return 'No characteristic colour/precipitate — negative';
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, elapsed: 0, development: 0, complete: false }; }

/**
 * A wet test is not instantaneous. Warm the tube and the colour or the
 * precipitate appears over some seconds and then stops changing; a
 * negative test stays stubbornly as it was, however long it is watched.
 * `development` is how far the observation has come, so the tube on screen
 * and the observation recorded are the same event.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt; s.elapsed += dt;
  const positive = isPositive(inputs);
  const target = positive ? 1 : 0;
  s.development += (target - s.development) * Math.min(1, dt * 0.55);
  s.complete = positive ? s.development > 0.96 : s.elapsed > 6;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  return { trial, sample: sampleOf(inputs).label, test: testOf(inputs).label, observation: observation(inputs), positive: isPositive(inputs), _kind: sampleOf(inputs).kind };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Test at least four sample/reagent combinations.' };
  const positives = rows.filter((r) => r.positive);
  const foodstuffsCovered = new Set(rows.filter((r) => r.sample.includes('foodstuff') || r.sample === 'Milk (foodstuff)' || r.sample === 'Potato extract (foodstuff)').map((r) => r.sample));
  return { ok: true, testsRun: rows.length, positiveCount: positives.length, foodstuffsCovered: foodstuffsCovered.size, n: rows.length, points: [] };
}

export default { meta, defaults, SAMPLES, TESTS, init, step, measure, derive, validate, sampleOf, testOf, isPositive, observation };
