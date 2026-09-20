#!/usr/bin/env node
/**
 * GOLDEN REFERENCE RESULTS
 *
 * One question, asked of every published experiment:
 *
 *     If a student follows THIS experiment's own prescribed procedure —
 *     its declared settings, its declared independent variable, swept across
 *     its declared range — does the result agree with the accepted value
 *     THIS experiment declares?
 *
 * Nothing else in the repository asks it. The model audit checks that nothing
 * throws; the journey audit checks that a student can reach a result at all.
 * Neither notices a lab that computes a confident, precisely formatted, wrong
 * number — which is more damaging than one that refuses to compute, because
 * the student has no way to tell.
 *
 * This runs headless, in a second, so it can sit in front of every commit.
 *
 *   node tools/audit-golden-results.mjs            # every published experiment
 *   node tools/audit-golden-results.mjs XI-PHY-A07 # one, with its readings
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VLAB_ROOT || process.cwd();
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const verbose = only.length > 0 || process.argv.includes('--verbose');

const index = JSON.parse(await readFile(join(root, 'data/experiments/index.json'), 'utf8'));
const published = index.experiments.filter((e) => e.contentStatus === 'published');
const targets = only.length ? published.filter((e) => only.includes(e.id)) : published;

/** The run flags a model may expose, and what the Start button does to them. */
const PROCESS_FLAGS = ['flying', 'released', 'rolling', 'heating', 'running', 'flowing', 'started'];

function primeProcess(model, inputs, state) {
  const flag = PROCESS_FLAGS.find((k) => k in state);
  if (!flag) return state;
  const primed = { ...state, [flag]: true };
  if (flag === 'flying') {
    const launcher = model.launcherOf ? model.launcherOf(inputs) : null;
    const u = launcher ? launcher.speed : (inputs.speedMs ?? 6);
    const a = ((inputs.angleDeg ?? 45) * Math.PI) / 180;
    primed.vx = u * Math.cos(a);
    primed.vy = u * Math.sin(a);
  }
  if (flag === 'flowing' && !(primed.flowRate > 0)) primed.flowRate = 1;
  return primed;
}

/** Run the bench forward until it settles or finishes, then read it. */
function runAndRead(model, inputs, trial) {
  let state = primeProcess(model, inputs, model.init(inputs));
  const dt = 1 / 120;
  for (let f = 0; f < 9000; f += 1) {
    state = model.step(state, inputs, dt);
    if (state.finishedAt || state.finished) break;
  }
  return { state, reading: model.measure(state, inputs, 7, trial) };
}

/**
 * Put a control where the instrument nulls.
 *
 * Half the Section A practicals are null hunts, and a reading is only
 * available at the null. A student finds it by following the indicator; this
 * bisects on the same indicator, so the procedure being tested is the
 * procedure the bench actually teaches.
 */
function seekNull(model, inputs, variable) {
  if (typeof model.nullIndicator !== 'function') return inputs;
  const step = Number(variable.step) || 0.1;
  let lo = Number(variable.min);
  let hi = Number(variable.max);
  let best = { ...inputs };
  for (let k = 0; k < 40; k += 1) {
    const mid = Math.round(((lo + hi) / 2 - lo) / step) * step + lo;
    const probe = { ...inputs, [variable.id]: Number(mid.toFixed(6)) };
    let ind;
    try { ind = model.nullIndicator(probe); } catch { return inputs; }
    if (!ind) return inputs;
    best = probe;
    if (ind.atNull) return probe;
    if (hi - lo <= step * 1.01) break;
    if (ind.direction === 'up') lo = mid; else hi = mid;
  }
  return best;
}

const failures = [];
const skipped = [];
let checked = 0;

for (const entry of targets) {
  const exp = JSON.parse(await readFile(join(root, entry.file), 'utf8'));
  const expected = exp.expectedResult;
  // A qualitative practical — salt analysis, a functional-group test, a
  // colour-shift demonstration — declares no numeric target on purpose.
  if (!expected || !Number.isFinite(expected.value)) { skipped.push(`${entry.id} (no numeric target)`); continue; }

  const modelName = exp.simulation?.model;
  const model = await import(pathToFileURL(join(root, 'src/simulation/models', `${modelName}.js`)));

  const base = { ...(model.defaults || {}) };
  for (const v of exp.variables || []) {
    if (v.type !== 'dependent' && v.default != null) base[v.id] = v.default;
  }

  // The procedure varies the INDEPENDENT variable and holds the rest.
  const vars = exp.variables || [];
  const independent = vars.find((v) => v.type === 'independent' && Number.isFinite(v.min) && Number.isFinite(v.max));
  const nullVar = vars.find((v) => v.type === 'control' && Number.isFinite(v.min) && Number.isFinite(v.max));
  /*
   * Not every experiment varies a number. A pH comparison changes the
   * SOLUTION, the law of length changes the TUNING FORK, a friction lab
   * changes the SURFACE. Those are option controls, and an audit that only
   * knows how to move sliders would report every one of them as unperformable
   * for a reason that says more about the audit than the lab.
   */
  const optionControl = independent ? null : (exp.simulation?.controls || [])
    .filter((c) => Array.isArray(c.options) && c.options.length >= 3)
    .map((c) => ({ id: c.var, options: c.options }))
    .find((c) => {
      const v = vars.find((x) => x.id === c.var);
      return v && v.type !== 'controlled';   // a CONTROLLED variable is held fixed by the procedure
    });
  const minRows = exp.observationModel?.minRows || 0;
  const want = Math.max(minRows, 4);

  const rows = [];
  const refusals = [];
  for (let k = 0; k < want; k += 1) {
    let inputs = { ...base };
    if (optionControl) inputs[optionControl.id] = optionControl.options[k % optionControl.options.length];
    if (independent) {
      const span = independent.max - independent.min;
      const raw = independent.min + (span * (k + 0.5)) / want;
      const step = Number(independent.step) || 1;
      inputs[independent.id] = Number((Math.round(raw / step) * step).toFixed(6));
    }
    /* Then bring the instrument to its null, if it has one. Every numeric
       control is tried, because the control that nulls the instrument is not
       always the one the experiment calls its independent variable: on the
       metre bridge the independent variable is the resistance box and the
       null is found with the jockey. */
    const numericVars = vars.filter((v) => v.type !== 'dependent' && Number.isFinite(v.min) && Number.isFinite(v.max));
    /* Coarse first, then fine, KEEPING each adjustment — a beam balance is
       brought on scale with gram weights and then with fractional ones, and
       starting the fine adjustment over from the coarse default would undo
       the work. */
    for (const v of [independent, nullVar, ...numericVars].filter(Boolean)) {
      const sought = seekNull(model, inputs, v);
      if (sought === inputs) continue;
      let ind = null;
      try { ind = model.nullIndicator(sought); } catch { /* not a null instrument */ }
      if (!ind) continue;
      inputs = sought;              // keep the improvement even if not yet nulled
      if (ind.atNull) break;
    }
    const { reading } = runAndRead(model, inputs, k + 1);
    if (reading && !('v' in reading && reading.v == null)) rows.push({ ...reading });
    else refusals.push(reading?.reason || 'refused without a reason');
  }

  checked += 1;
  const label = `${entry.id} [${modelName}]`;

  if (rows.length < 2) {
    failures.push({ id: entry.id, kind: 'unperformable',
      msg: `only ${rows.length} of ${want} readings could be taken following the prescribed procedure — ${refusals[0] || 'no reason given'}` });
    continue;
  }

  const derived = model.derive(rows, base);
  if (!derived?.ok) {
    const needsMore = /at least (\w+)/i.test(derived?.reason || '');
    failures.push({
      id: entry.id,
      kind: needsMore && minRows && rows.length >= minRows ? 'minrows-understated' : 'no-result',
      msg: needsMore && minRows && rows.length >= minRows
        ? `the table advertises ${minRows} readings as enough, but the calculation refuses with: ${derived.reason}`
        : `${rows.length} readings still give no result — ${derived?.reason || 'derive() refused without a reason'}`,
    });
    continue;
  }

  const candidates = [expected.key, expected.symbol, ...(exp.calculations?.resultKeys || [])];
  const key = candidates.find((k) => k && Number.isFinite(derived[k]));
  if (!key) {
    failures.push({ id: entry.id, kind: 'unreadable',
      msg: `the result declares "${expected.symbol}" but derive() returns none of ${candidates.filter(Boolean).join(', ')}` });
    continue;
  }

  const value = derived[key];
  const errAbs = Math.abs(value - expected.value);
  const errPct = expected.value === 0 ? errAbs * 100 : (errAbs / Math.abs(expected.value)) * 100;
  // The experiment's own tolerance is the contract; allow it twice over before
  // calling it a failure, since this sweep takes readings across the whole
  // range rather than the best part of it.
  const slack = Math.max(Number(expected.tolerance) || 0, Math.abs(expected.value) * 0.02) * 2;

  if (verbose) {
    console.log(`\n${label}`);
    console.log(`   readings: ${rows.length}   ${key} = ${value} ${expected.unit || ''} (accepted ${expected.value} ± ${expected.tolerance})`);
  }
  if (errAbs > slack) {
    failures.push({ id: entry.id, kind: 'wrong-value',
      msg: `${key} = ${value} ${expected.unit || ''} against an accepted ${expected.value} ± ${expected.tolerance} — out by ${errPct.toFixed(1)}%` });
  }
}

console.log(`\ngolden results checked: ${checked}   (${skipped.length} qualitative experiments have no numeric target)`);
if (!failures.length) {
  console.log('Every experiment reproduces its own accepted value from its own procedure.');
} else {
  const byKind = new Map();
  for (const f of failures) {
    if (!byKind.has(f.kind)) byKind.set(f.kind, []);
    byKind.get(f.kind).push(f);
  }
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── ${kind.toUpperCase()} · ${list.length} ──`);
    for (const f of list) console.log(`   ${f.id.padEnd(20)} ${f.msg}`);
  }
  console.log(`\n${failures.length} of ${checked} experiments do not reproduce their own accepted value.`);
}
process.exitCode = failures.length ? 1 : 0;
