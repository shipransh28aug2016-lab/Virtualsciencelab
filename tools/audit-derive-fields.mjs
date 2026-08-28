/**
 * Cross-checks main.js's result-panel HTML against every model's derive().
 *
 * The panel for each model is written assuming derive() returns a specific
 * set of fields (main.js's own `d.<field>` references, extracted below).
 * If a model's derive() is missing one, the panel does not error -- it
 * just prints the literal text "undefined" into a result a student is
 * about to write into their practical file. That is exactly the class of
 * bug found by hand in image-formation.js; this finds the rest of them
 * mechanically, by actually running measure()/derive() the way the app
 * does (real experiment defaults, swept across their declared ranges) and
 * checking every referenced field is truly present.
 */
import { readFile } from 'node:fs/promises';
const root = process.env.VLAB_ROOT || process.cwd();

// ── 1. extract every "m === 'model'" branch's referenced d.<field> names ──
const mainSrc = await readFile(`${root}/src/main.js`, 'utf8');
const startIdx = mainSrc.indexOf('function renderResult(d) {');
const endIdx = mainSrc.indexOf('\nfunction retryHint(');
const body = mainSrc.slice(startIdx, endIdx);

const branchRe = /(?:if|else if)\s*\(m === '([^']+)'/g;
const matches = [...body.matchAll(branchRe)];
const fieldRe = /\bd\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const fieldsByModel = new Map();
for (let i = 0; i < matches.length; i++) {
  const model = matches[i][1];
  const start = matches[i].index + matches[i][0].length;
  const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
  const chunk = body.slice(start, end);
  const fields = new Set([...chunk.matchAll(fieldRe)].map((m) => m[1]));
  if (!fieldsByModel.has(model)) fieldsByModel.set(model, new Set());
  for (const f of fields) fieldsByModel.get(model).add(f);
}

// ── 2. for each published experiment, build real inputs + swept rows ──
const idx = JSON.parse(await readFile(`${root}/data/experiments/index.json`, 'utf8'));
const experiments = idx.experiments.filter((e) => e.contentStatus === 'published');

const OPTION_WIDGETS = new Set(['segmented', 'wiring']);

function initialInputs(model, exp) {
  const inputs = { ...model.defaults };
  for (const v of exp.variables || []) {
    if (v.default === undefined || v.default === null || v.type === 'dependent') continue;
    inputs[v.id] = v.default;
  }
  return inputs;
}

/** Sweep every numeric control across its range and every option control
 * across its choices, together, across N trials -- maximum variety with
 * no per-model special-casing, matching how a thorough student's table
 * would actually look. */
function sweepInputs(base, exp, n, i) {
  const inputs = { ...base };
  const controls = exp.simulation?.controls || [];
  const byId = Object.fromEntries((exp.variables || []).map((v) => [v.id, v]));
  const f = n > 1 ? i / (n - 1) : 0;
  for (const c of controls) {
    const v = byId[c.var];
    if (!v) continue;
    if (OPTION_WIDGETS.has(c.widget) && Array.isArray(c.options) && c.options.length) {
      inputs[v.id] = c.options[i % c.options.length];
    } else if (c.widget === 'switch') {
      inputs[v.id] = i % 2 === 0;
    } else if (Number.isFinite(v.min) && Number.isFinite(v.max)) {
      const step = Number(v.step) > 0 ? Number(v.step) : (v.max - v.min) / 20;
      let val = v.min + f * (v.max - v.min);
      val = Math.round(val / step) * step;
      inputs[v.id] = Number(val.toFixed(6));
    }
  }
  return inputs;
}

const N = 8;
const results = [];
const seenModels = new Set();

for (const meta of experiments) {
  const exp = JSON.parse(await readFile(`${root}/${meta.file}`, 'utf8'));
  const modelName = exp.simulation.model;
  const key = `${modelName}::${meta.id}`;
  if (!fieldsByModel.has(modelName)) continue; // no result-panel branch to check
  const model = await import(`${root}/src/simulation/models/${modelName}.js`);
  if (typeof model.measure !== 'function' || typeof model.derive !== 'function') continue;

  const base = initialInputs(model, exp);
  const rows = [];
  let lastInputs = base;
  for (let i = 0; i < N; i++) {
    const inputs = sweepInputs(base, exp, N, i);
    lastInputs = inputs;
    let state = model.init ? model.init(inputs) : {};
    if (model.step) for (let k = 0; k < 30; k++) state = model.step(state, inputs, 1 / 30);
    let reading;
    try { reading = model.measure(state, inputs, 7, i + 1); } catch (e) { reading = null; }
    if (reading == null) continue;
    if ('v' in reading && reading.v == null) continue;
    rows.push(reading);
  }

  let derived;
  try { derived = model.derive(rows, lastInputs); } catch (e) { derived = { ok: false, reason: `threw: ${e.message}` }; }
  if (!derived || derived.ok === false) {
    results.push({ model: modelName, exp: meta.id, rows: rows.length, ok: false, missing: null, reason: derived?.reason });
    continue;
  }
  const wanted = [...fieldsByModel.get(modelName)];
  const missing = wanted.filter((f) => !(f in derived) || derived[f] === undefined);
  results.push({ model: modelName, exp: meta.id, rows: rows.length, ok: true, missing });
}

// ── 3. report ──
const withMissing = results.filter((r) => r.ok && r.missing.length);
const neverOk = results.filter((r) => !r.ok);
const clean = results.filter((r) => r.ok && !r.missing.length);

console.log(`experiments checked        : ${results.length}`);
console.log(`derive() returned ok:true, all fields present : ${clean.length}`);
console.log(`derive() returned ok:true, MISSING fields      : ${withMissing.length}`);
console.log(`derive() never reached ok:true (rows too sparse/refused every time) : ${neverOk.length}`);

if (withMissing.length) {
  console.log('\n=== MISSING FIELDS (real bug: literal "undefined" in the result panel) ===');
  for (const r of withMissing) console.log(`  ${r.exp} (${r.model}): missing [${r.missing.join(', ')}]`);
}
if (neverOk.length) {
  console.log('\n=== NEVER REACHED ok:true (investigate — may just need a richer sweep) ===');
  for (const r of neverOk) console.log(`  ${r.exp} (${r.model}): rows=${r.rows} reason="${r.reason}"`);
}
process.exit(withMissing.length ? 1 : 0);
