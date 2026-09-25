#!/usr/bin/env node
/** Scientific integrity smoke checks for the offline models and curriculum data. */
import assert from 'node:assert/strict';
import { isBalancedEquation } from '../src/utils/chemistry.js';
import * as kinetics from '../src/simulation/models/reaction-kinetics.js';
import * as titration from '../src/simulation/models/titration.js';

assert.equal(isBalancedEquation('H₂C₂O₄ + 2NaOH → Na₂C₂O₄ + 2H₂O'), true);
assert.equal(isBalancedEquation('Na₂S₂O₃ + 2HCl → 2NaCl + SO₂ + S + H₂O'), true);

const acidInputs = { system: 'naoh_hcl', titrantConc: 0.1, analyteVolume: 20 };
assert.ok(titration.pHAt(acidInputs, 0) > titration.pHAt(acidInputs, 50), 'acid added to base must lower pH');
assert.equal(titration.validate({ analyte: 'hcl', titrant: 'oxalic' }).ok, false);
assert.ok(kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 25 }) > 0);
assert.ok(kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 35 }) < kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 25 }), 'higher temperature must accelerate the reaction');

/* ──────────────────────────────────────────────────────────────────────────
 * TITRATION: every published titration must be PERFORMABLE and SELF-CONSISTENT
 *
 * Both KMnO4 practicals once demanded 100 mL of titrant from a 50 mL burette,
 * because trueUnknownN held the solution's molarity (0.02) where every formula
 * downstream reads a normality (0.1 N, n = 5). Nothing caught it: the model
 * stepped without throwing, the bench drew, the audits passed — and the
 * experiment simply could not be completed. These checks exist so that class
 * of error announces itself here instead of in front of a class.
 * ────────────────────────────────────────────────────────────────────────── */
const { readFile } = await import('node:fs/promises');
const { join } = await import('node:path');
const troot = process.env.VLAB_ROOT || process.cwd();
const tindex = JSON.parse(await readFile(join(troot, 'data/experiments/index.json'), 'utf8'));

for (const entry of tindex.experiments.filter((e) => e.contentStatus === 'published')) {
  const exp = JSON.parse(await readFile(join(troot, entry.file), 'utf8'));
  if (exp.simulation?.model !== 'titration') continue;

  const inputs = { ...titration.defaults };
  for (const v of exp.variables || []) {
    if (v.type !== 'dependent' && v.default != null) inputs[v.id] = v.default;
  }
  const burette = (exp.variables || []).find((v) => v.id === 'buretteVolume');
  const capacity = burette ? Number(burette.max) : 50;

  const vEq = titration.equivalenceVolume(inputs);
  assert.ok(Number.isFinite(vEq) && vEq > 0, `${entry.id}: equivalence volume is not a positive number`);
  assert.ok(vEq <= capacity,
    `${entry.id}: needs ${vEq.toFixed(1)} mL of titrant from a ${capacity} mL burette — the titration cannot be completed`);
  assert.ok(vEq >= capacity * 0.15,
    `${entry.id}: reaches its end point after only ${vEq.toFixed(1)} mL of a ${capacity} mL burette — too small a titre to read accurately`);

  const vEnd = titration.endPointVolume(inputs);
  assert.ok(vEnd != null && vEnd > 0 && vEnd <= capacity,
    `${entry.id}: the chosen indicator never turns within the burette's ${capacity} mL`);

  /* There must be no volume that is neither short of the end point, at it,
     nor past it: a student who stops in such a gap is refused a reading with
     nothing to act on. */
  let state = titration.init(inputs);
  for (let v = 0; v <= capacity; v += 0.25) {
    const probe = { ...inputs, buretteVolume: v };
    state = titration.init(inputs);
    state.delivered = v;
    state = titration.step(state, probe, 1 / 120);
    const classified = state.delivered < vEnd - titration.DROP_ML || state.atEndPoint || state.overshot;
    assert.ok(classified, `${entry.id}: ${v.toFixed(2)} mL is neither before, at, nor past the end point`);
  }

  /* strength = normality x equivalent mass must reproduce the true solution,
     and for a redox system the molarity must be the normality over n. */
  const rows = [];
  for (let trial = 1; trial <= 3; trial += 1) {
    let s = titration.init(inputs);
    const at = { ...inputs, buretteVolume: Number(vEnd.toFixed(1)) };
    for (let f = 0; f < 900; f += 1) s = titration.step(s, at, 1 / 120);
    const r = titration.measure(s, at, 7, trial);
    assert.ok(r && r.v !== null, `${entry.id}: no reading can be taken at its own end point`);
    rows.push(r);
  }
  const d = titration.derive(rows, inputs);
  assert.ok(d.ok, `${entry.id}: three readings at the end point still give no result — ${d.reason}`);
  const sys = titration.systemOf(inputs);
  const trueN = sys.unknownSide === 'titrant'
    ? sys.trueUnknownN
    : (inputs.titrantConc * vEq) / inputs.analyteVolume;
  const err = Math.abs(d.normality - trueN) / trueN;
  assert.ok(err < 0.03,
    `${entry.id}: recovered normality ${d.normality} N against a true ${trueN} N (${(err * 100).toFixed(1)}% out)`);
  if (sys.nFactor) {
    // Both are reported to three significant figures, so they are compared to
    // that precision rather than exactly.
    assert.ok(Math.abs(d.molarity * sys.nFactor - d.normality) <= Math.abs(d.normality) * 0.005,
      `${entry.id}: molarity ${d.molarity} M x n ${sys.nFactor} is not the reported normality ${d.normality} N`);
    assert.ok(Math.abs(sys.eqMassUnknown * sys.nFactor - sys.molarMass) < 0.5,
      `${entry.id}: equivalent mass ${sys.eqMassUnknown} x n ${sys.nFactor} is not the molar mass ${sys.molarMass}`);
  }
}

/* The indicator must decide the end point, or choosing the wrong one teaches
   nothing: a warning that the numbers then contradict is worse than silence. */
const phEnd = titration.endPointVolume({ ...titration.defaults, indicator: 'phenolphthalein' });
const moEnd = titration.endPointVolume({ ...titration.defaults, indicator: 'methylOrange' });
assert.ok(Math.abs(phEnd - moEnd) > 0.5,
  'the same titre is obtained with the right and the wrong indicator — the end point is not coming from the chemistry');


/* ──────────────────────────────────────────────────────────────────────────
 * NULL INDICATORS: "take the reading now" must mean a reading can be taken
 *
 * Roughly a dozen models guide the student to a null and only then allow a
 * reading. If the window the indicator calls the null reaches outside the
 * region where measure() will actually record, the bench tells the student to
 * record and then refuses them — which is worse than saying nothing, because
 * they have no way to tell whether they misread the instrument or the
 * instrument is lying. The friction bench did exactly that for pan loads
 * between 0.96 and 1.00 of the limiting value.
 * ────────────────────────────────────────────────────────────────────────── */
const { pathToFileURL } = await import('node:url');

/*
 * And the WORDS beside the arrow have to point the same way as the arrow.
 *
 * nullPoint shows its `increase` sentence when the control is BELOW the null,
 * next to a ▸. Three instruments had the two sentences the wrong way round —
 * a vernier whose jaws were narrower than the object said "the jaws are still
 * clear of the object, close them further", which is the opposite of both the
 * arrow and the physics — so a student reading the sentence walked away from
 * the null while the arrow told them to walk towards it, and the instrument
 * could not be brought to grip at all.
 *
 * The check reads the hint on each side of the null and asks which of a pair
 * of opposite apparatus actions it names. The families are tried in order,
 * because one sentence can hold words from two of them ("close them further"
 * is a closing, not a going-further), and the first family that tells the two
 * sentences apart decides.
 */
const DIRECTION_FAMILIES = [
  ['lengthen|lower the water', 'shorten|raise the water'],
  ['\\bopen\\b', '\\bclose\\b|closing'],
  ['\\badd\\b', '\\btake\\b[^.]*\\boff\\b|remove'],
  ['\\bdown\\b', '\\bup\\b'],
  ['further|farther|\\bfar\\b|away from', '\\bback\\b|in towards|closer|nearer|near \\('],
];

function directionOfHints(upHint, downHint) {
  for (const [plus, minus] of DIRECTION_FAMILIES) {
    const rePlus = new RegExp(plus, 'i');
    const reMinus = new RegExp(minus, 'i');
    const upIsPlus = rePlus.test(upHint) && !reMinus.test(upHint);
    const upIsMinus = reMinus.test(upHint) && !rePlus.test(upHint);
    const downIsPlus = rePlus.test(downHint) && !reMinus.test(downHint);
    const downIsMinus = reMinus.test(downHint) && !rePlus.test(downHint);
    if (upIsPlus && downIsMinus) return 'agree';
    if (upIsMinus && downIsPlus) return 'inverted';
  }
  return 'unreadable';
}

let indicatorsChecked = 0;
const indicatorModels = new Set();

for (const entry of tindex.experiments.filter((e) => e.contentStatus === 'published')) {
  const exp = JSON.parse(await readFile(join(troot, entry.file), 'utf8'));
  const modelName = exp.simulation?.model;
  const model = await import(pathToFileURL(join(troot, 'src/simulation/models', `${modelName}.js`)));
  if (typeof model.nullIndicator !== 'function') continue;

  const base = { ...(model.defaults || {}) };
  for (const v of exp.variables || []) {
    if (v.type !== 'dependent' && v.default != null) base[v.id] = v.default;
  }

  /* Walk each control across the range the EXPERIMENT declares — not a range
     invented from the defaults, which produces settings the bench never
     offers (a block of zero mass) and reports them as defects. */
  const controls = (exp.variables || []).filter((v) =>
    v.type !== 'dependent' && Number.isFinite(v.min) && Number.isFinite(v.max) && v.max > v.min);

  const offenders = [];
  let upHint = '';
  let downHint = '';
  let everNulled = false;
  let everOffered = false;    // did the indicator apply to this experiment at all?
  for (const v of controls) {
    const step = Number(v.step) || (v.max - v.min) / 200;
    for (let x = v.min; x <= v.max + 1e-9; x += step) {
      const probe = { ...base, [v.id]: Number(x.toFixed(6)) };
      let ind;
      try { ind = model.nullIndicator(probe); } catch { break; }
      if (ind) everOffered = true;
      if (ind && !ind.atNull && ind.hint) {
        if (ind.direction === 'up' && !upHint) upHint = String(ind.hint);
        if (ind.direction === 'down' && !downHint) downHint = String(ind.hint);
      }
      if (!ind?.atNull) continue;
      everNulled = true;
      let state = model.init(probe);
      for (const flag of ['running', 'heating', 'released', 'rolling', 'flowing', 'started', 'settled', 'gripped']) {
        if (flag in state) state[flag] = true;
      }
      for (let f = 0; f < 600; f += 1) state = model.step(state, probe, 1 / 120);
      const reading = model.measure(state, probe, 7, 1);
      if (reading == null || ('v' in reading && reading.v == null)) {
        offenders.push(`${v.id}=${probe[v.id]}`);
      }
      if (offenders.length > 3) break;
    }
    if (offenders.length > 3) break;
  }
  indicatorsChecked += 1;
  indicatorModels.add(modelName);
  assert.equal(offenders.length, 0,
    `${entry.id} [${modelName}]: the null indicator says "take the reading now" at ${offenders.slice(0, 3).join(', ')}, where measure() refuses to record`);
  /*
   * And it has to be REACHABLE. An indicator that never nulls anywhere in the
   * declared ranges passes the check above without meaning anything, and
   * leads a student round in circles: the vernier's read `inputs.jawCm` where
   * the control is `jawOpening`, so its current value was undefined, every
   * comparison was NaN, and it said "the jaws are pressing into the object —
   * open them a little" at every setting including fully open.
   */
  /* A model shared by several experiments may have no null in one of them —
     the auxiliary-lens model guides a retrace for the convex mirror and a
     screen position for the concave lens, and returns nothing where neither
     applies. That is an answer, not a broken indicator. What is broken is an
     indicator that is OFFERED and can never be satisfied. */
  assert.ok(!everOffered || everNulled,
    `${entry.id} [${modelName}]: the null indicator never reports a null anywhere in the ranges this experiment declares — check that it is reading a control that exists`);

  if (upHint && downHint) {
    const sense = directionOfHints(upHint, downHint);
    assert.notEqual(sense, 'inverted',
      `${entry.id} [${modelName}]: the null indicator's words contradict its arrow. Below the null it shows \u25b8 beside "${upHint}" and above it \u25c2 beside "${downHint}" — the two sentences are the wrong way round, so a student who reads them moves away from the null`);
    assert.notEqual(sense, 'unreadable',
      `${entry.id} [${modelName}]: the null indicator's two sentences name no opposite pair of actions ("${upHint}" / "${downHint}"), so nothing can check that they point the way the arrow does. Phrase them as one of: open/close, add/take off, further/back, lengthen/shorten, down/up`);
  }
}
assert.ok(indicatorModels.size >= 8,
  `only ${indicatorModels.size} models carry a null indicator — expected the whole family`);

/*
 * A BENCH THAT WILL NOT TAKE A READING HAS TO SAY WHY.
 *
 * Refusing is teaching: the balance is still settling, the bob has not
 * finished its swings, the solvent front has not reached the top. Refusing in
 * silence is not. Twelve benches returned a bare null at the moment a student
 * first presses Record, and the app could only fall back to "Nothing to
 * measure here — no reading recorded" — true of a mirror forming no image,
 * useless on a bench where the apparatus is simply not ready yet.
 *
 * So every refusal must carry words: its own `reason`, or a warning from
 * validate() that the app can show in its place.
 */
let silent = [];
for (const entry of tindex.experiments.filter((e) => e.contentStatus === 'published')) {
  const exp = JSON.parse(await readFile(join(troot, entry.file), 'utf8'));
  const modelName = exp.simulation.model;
  const model = await import(pathToFileURL(join(troot, 'src/simulation/models', `${modelName}.js`)));
  const inputs = { ...model.defaults };
  for (const v of exp.variables || []) {
    if (v.default == null || v.type === 'dependent') continue;
    inputs[v.id] = v.default;
  }
  let row;
  try { row = model.measure(model.init(inputs), inputs, 1, 1); } catch { continue; }
  const refused = row == null || (row && typeof row === 'object' && 'v' in row && row.v == null);
  if (!refused || row?.reason) continue;
  const v = model.validate ? model.validate(inputs) : { warnings: [], errors: [] };
  if ((v.errors || [])[0] || (v.warnings || [])[0]) continue;
  silent.push(`${entry.id} [${modelName}]`);
}
assert.equal(silent.length, 0,
  `these benches refuse a reading without saying why, so the student is told only "Nothing to measure here": ${silent.join(', ')}`);

console.log(`Scientific integrity checks passed (${indicatorModels.size} null-indicator models verified across ${indicatorsChecked} experiments; no bench refuses a reading in silence).`);
