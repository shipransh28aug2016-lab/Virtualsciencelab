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
  /* Long enough for the slowest bench. The clock reaction at its default
     concentration takes 251 s, and stopping at 75 reported it as a lab in
     which no reading could ever be taken. */
  for (let f = 0; f < 120 * 420; f += 1) {
    state = model.step(state, inputs, dt);
    if (state.finishedAt || state.finished) break;
  }
  return { state, reading: model.measure(state, inputs, 7, trial) };
}

/** Does this experiment plot something against TIME? */
const TIME_KEYS = new Set(['timeS', 'time', 't', 'timeMin', 'minutes', 'seconds', 'elapsed', 'elapsedS', 'timeMinutes']);

/**
 * Take a series of readings from ONE run, as the clock advances.
 *
 * A cooling curve, a damped pendulum, a dialysis run and a rate-of-reaction
 * experiment are all performed by starting the process once and reading the
 * instrument every so often. Varying a setup control between readings — which
 * is what every other experiment here needs — measures nothing in these, and
 * reports a perfectly correct model as wrong: the damped pendulum came back
 * with a NEGATIVE decay constant, meaning an amplitude that grows, purely
 * because the audit kept resetting the bob to a different starting amplitude
 * instead of letting one swing die away.
 */
function runTimeSeries(model, inputs, count, secondsBetween) {
  let state = primeProcess(model, inputs, model.init(inputs));
  const dt = 1 / 120;
  const rows = [];
  const refusals = [];
  for (let k = 0; k < count; k += 1) {
    for (let f = 0; f < secondsBetween * 120; f += 1) {
      state = model.step(state, inputs, dt);
      if (state.finishedAt || state.finished) break;
    }
    const reading = model.measure(state, inputs, 7, k + 1);
    if (reading && !('v' in reading && reading.v == null)) rows.push({ ...reading });
    else refusals.push(reading?.reason || 'refused without a reason');
  }
  return { rows, refusals };
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
  const min = Number(variable.min);
  const max = Number(variable.max);
  const at = (v) => {
    const probe = { ...inputs, [variable.id]: Number(Math.min(max, Math.max(min, v)).toFixed(6)) };
    try { return { probe, ind: model.nullIndicator(probe) }; } catch { return null; }
  };

  const here = at(Number(inputs[variable.id] ?? min));
  if (!here?.ind) return inputs;
  if (here.ind.atNull) return here.probe;

  /*
   * Search OUTWARD FROM WHERE THE CONTROL ALREADY IS, not across the whole
   * range, because the nearest null is the one a student finds.
   *
   * It also matters when there is more than one. A resonance tube has a null
   * at a quarter of a wavelength and another at three quarters, and the
   * experiment needs BOTH from the same fork. Bisecting the whole range
   * always converged on the same one, so l2 could only be reached by changing
   * the fork — which measures two different standing waves and gives exactly
   * half the speed of sound.
   */
  let v = Number(inputs[variable.id] ?? min);
  let stride = Math.max(step, (max - min) / 64);
  let dir = here.ind.direction === 'up' ? 1 : -1;
  for (let k = 0; k < 400; k += 1) {
    const next = at(v + dir * stride);
    if (!next?.ind) break;
    if (next.ind.atNull) return next.probe;
    if (next.ind.direction !== (dir > 0 ? 'up' : 'down')) {
      // stepped past it: turn round and close in
      dir = -dir;
      stride = Math.max(step, stride / 2);
    }
    v = Number(next.probe[variable.id]);
    if (v <= min && dir < 0) { dir = 1; stride = Math.max(step, stride / 2); }
    if (v >= max && dir > 0) { dir = -1; stride = Math.max(step, stride / 2); }
    if (stride <= step && k > 80) break;
  }
  const final = at(v);
  return final?.ind?.atNull ? final.probe : inputs;
}

/*
 * THE RESULT PANEL IS ASSEMBLED FROM FIELDS THE MODEL RETURNS.
 *
 * renderResult() in src/main.js interpolates `${d.something}` for each model.
 * When a template reads a field the model never produces, the student is
 * shown the literal word "undefined" — in the panel that states the answer,
 * set in the same type as everything that is correct. It has happened often
 * enough (the metre bridge's spread, the lamina's whole error budget, the
 * diode's nominal knee, the inclined plane's intercept) to be worth checking
 * for every model, against a derive that actually ran.
 */
const mainSource = await readFile(join(root, 'src/main.js'), 'utf8');
function templateFields(modelName) {
  const re = new RegExp(`m === '${modelName.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}'`, 'g');
  const blocks = [];
  let m;
  while ((m = re.exec(mainSource))) {
    const rest = mainSource.slice(m.index, m.index + 2600);
    const end = rest.indexOf('\n  } else if (m ===', 40);
    const block = end > 0 ? rest.slice(0, end) : rest;
    const fields = new Set([...block.matchAll(/\$\{d\.([A-Za-z0-9_]+)/g)].map((r) => r[1]));
    // `d.x ? … : …`, `d.x ?? …`, `d.x && …` are deliberate optionals
    for (const g of block.matchAll(/d\.([A-Za-z0-9_]+)\s*(\?|\?\?|&&|\|\|)/g)) fields.delete(g[1]);
    /* Anything inside a `${… ? … : …}` is printed only when the template
       decides to, so it is optional by construction — the diode's reverse
       current is read only when there ARE reverse readings. */
    for (const cond of block.matchAll(/\$\{[^}]*\?[^}]*\}/g)) {
      for (const ref of cond[0].matchAll(/d\.([A-Za-z0-9_]+)/g)) fields.delete(ref[1]);
    }
    blocks.push(fields);
  }
  if (!blocks.length) return [];
  /*
   * A model may have SEVERAL branches here and run only one of them: the
   * sonometer's three laws, the calorimeter's three modes, the galvanometer
   * converted or half-deflected. A field the other branch prints is not
   * missing from this one, so only what EVERY branch prints is required.
   */
  return [...blocks[0]].filter((k) => blocks.every((b) => b.has(k)));
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
  /*
   * Option controls — the solution, the tuning fork, the supply, the meter
   * function, the shunt. Several practicals are performed by working through
   * these rather than by moving a slider: comparing the pH of four solutions,
   * finding f x l with four forks, reading a galvanometer with and without
   * its shunt, separating an inductance by measuring on DC and then on AC.
   */
  const optionControls = (exp.simulation?.controls || [])
    .map((c) => ({
      id: c.var,
      // A switch is an apparatus setting with two positions: the shunt in or
      // out, the balance tared or not. Half-deflection needs a reading in
      // each position, and a driver that only knew about option lists could
      // never take one.
      options: Array.isArray(c.options) ? c.options : (c.widget === 'switch' ? [false, true] : null),
      v: vars.find((x) => x.id === c.var),
    }))
    .filter((c) => c.options && c.options.length >= 2 && c.v && c.v.type !== 'controlled');
  const optionControl = independent ? null : optionControls[0];
  const minRows = exp.observationModel?.minRows || 0;
  const want = Math.max(minRows, 4);

  const graphX = exp.observationModel?.graph?.x;
  const isTimeSeries = graphX && TIME_KEYS.has(graphX);

  /**
   * Collect readings by ONE faithful reading of the procedure.
   *
   * There is more than one, and the difference matters. The detergent
   * activity must include zero concentration, because measuring pure water
   * first is the whole comparison; the lateral-shift activity must EXCLUDE
   * zero, because a ray at normal incidence is not refracted. A single
   * sampling rule cannot be right for both, and picking one makes correct
   * labs look broken — which is worse than useless, because it sends you off
   * to "fix" a model that was right.
   *
   * So each is tried, and the lab is asked the fair question: is there a
   * faithful way to perform it that reproduces its own accepted value? If
   * none of them does, the best attempt is what gets reported.
   */
  const SAMPLINGS = [
    /*
     * Not every practical sweeps anything. Preparing a standard solution is
     * "weigh out the prescribed mass, make it up to the mark, and check it";
     * a preparation is "follow the method and weigh the product"; a weighing
     * is "repeat it three times and average". For these the procedure is the
     * declared settings, repeated — and sweeping a control instead measures
     * something the experiment never asked about. Sweeping the mass in
     * XI-CHE-E02 from 1 g to 10 g does not test whether 1.575 g of oxalic
     * acid in 250 mL is 0.1 N; it tests what 10 g would be.
     */
    { name: 'at the prescribed settings', at: null },
    { name: 'across the range', at: (k, n) => (n > 1 ? k / (n - 1) : 0) },
    { name: 'inside the range', at: (k, n) => (k + 0.5) / n },
    { name: 'the upper part of the range', at: (k, n) => 0.35 + (0.6 * k) / Math.max(1, n - 1) },
  ];
  /* And the same sweeps again, this time also working through each apparatus
     setting in turn — which for a good many practicals IS the procedure. */
  for (const oc of optionControls.slice(0, 3)) {
    SAMPLINGS.push({ name: `working through ${oc.id}`, at: null, cycle: oc });
    SAMPLINGS.push({ name: `working through ${oc.id} across the range`, at: (k, n) => (n > 1 ? k / (n - 1) : 0), cycle: oc });
  }

  function collect(sampling, count = want) {
    const rows = [];
    const refusals = [];
    for (let k = 0; k < count; k += 1) {
      let inputs = { ...base };
      if (optionControl && sampling.at) inputs[optionControl.id] = optionControl.options[k % optionControl.options.length];
      if (sampling.cycle) inputs[sampling.cycle.id] = sampling.cycle.options[k % sampling.cycle.options.length];
      if (independent && sampling.at) {
        const span = independent.max - independent.min;
        const raw = independent.min + span * sampling.at(k, count);
        const step = Number(independent.step) || 1;
        const snapped = Math.min(independent.max, Math.max(independent.min, Math.round(raw / step) * step));
        inputs[independent.id] = Number(snapped.toFixed(6));
      }
      /* Then bring the instrument to its null, if it has one. Every numeric
         control is tried, coarse first and then fine, KEEPING each
         adjustment — a beam balance is brought on scale with gram weights and
         then with fractional ones. */
      /*
       * You do not null an instrument by moving the quantity you are varying.
       * The metre bridge's independent variable is the resistance box and the
       * balance is found with the jockey; the friction bench varies the load
       * on the block and finds the limit by weighting the pan. Nulling with
       * the independent variable "succeeds" — there is usually some value of
       * it at which the present setting happens to balance — and then the
       * experiment has measured one point four times over. The friction
       * coefficient came back as 0.20 against an accepted 0.42 that way.
       *
       * So everything else is tried first, and the independent variable only
       * if nothing else nulls (a resonance tube really is adjusted by the
       * column length it plots against).
       */
      const numericVars = vars.filter((v) => v.type !== 'dependent' && Number.isFinite(v.min) && Number.isFinite(v.max));
      const others = numericVars.filter((v) => !independent || v.id !== independent.id);
      for (const v of [nullVar, ...others, independent].filter(Boolean)) {
        const sought = seekNull(model, inputs, v);
        if (sought === inputs) continue;
        let ind = null;
        try { ind = model.nullIndicator(sought); } catch { /* not a null instrument */ }
        if (!ind) continue;
        inputs = sought;
        if (ind.atNull) break;
      }
      const { reading } = runAndRead(model, inputs, k + 1);
      if (reading && !('v' in reading && reading.v == null)) rows.push({ ...reading });
      else refusals.push(reading?.reason || 'refused without a reason');
    }
    return { rows, refusals };
  }

  /** Score one attempt: did it reach a result, and how far off was it? */
  function score(rows) {
    if (rows.length < 2) return { rank: 0, rows };
    let derived;
    try { derived = model.derive(rows, base); } catch (err) { return { rank: 0, rows, thrown: err }; }
    if (!derived?.ok) return { rank: 1, rows, derived };
    const cands = [expected.key, expected.symbol, ...(exp.calculations?.resultKeys || [])];
    const key = cands.find((k) => k && Number.isFinite(derived[k]));
    if (!key) return { rank: 2, rows, derived };
    const err = Math.abs(derived[key] - expected.value);
    return { rank: 3, rows, derived, key, err };
  }

  /*
   * How many readings does the calculation ACTUALLY need?
   *
   * observationModel.minRows is what the bench advertises — "2 of 2
   * recommended readings plotted" — and several experiments need far more
   * than they advertise. The inductor activity says two and needs six: three
   * on DC to find the winding resistance and three on AC to find the
   * impedance. A student who takes the advertised number and presses
   * Calculate is refused, with no way to know whether they have done the
   * wrong thing or too little of the right thing.
   */
  const attemptsAt = (n) => {
    const list = [];
    if (isTimeSeries) {
      for (const gap of [15, 30, 60, 120, 300]) {
        const out = runTimeSeries(model, base, n, gap);
        list.push({ ...score(out.rows), refusals: out.refusals, how: `every ${gap} s` });
      }
    } else {
      for (const sampling of SAMPLINGS) {
        const out = collect(sampling, n);
        list.push({ ...score(out.rows), refusals: out.refusals, how: sampling.name });
      }
    }
    list.sort((a, b) => (b.rank - a.rank) || ((a.err ?? Infinity) - (b.err ?? Infinity)));
    return list;
  };

  /* Start at the count the bench advertises and go up only as far as needed,
     so "needs more than it says" means exactly that. */
  const ladder = [];
  for (let n = Math.max(2, minRows || 2); n <= 12; n += (n < 6 ? 1 : 2)) ladder.push(n);
  if (!ladder.includes(want)) ladder.push(want);
  ladder.sort((a, b) => a - b);

  /*
   * An experiment may STATE how it is performed.
   *
   * Most procedures can be inferred — sweep the independent variable, null the
   * instrument, repeat. A few cannot, and inferring them wrongly is worse than
   * not trying: cycling the four surfaces of the friction bench averages four
   * different coefficients into one meaningless 0.20, and reports a model that
   * gives 0.423 on one surface as broken. Where the procedure is not
   * inferable, the experiment declares it in simulation.goldenProcedure —
   * next to everything else it declares — and this follows it exactly.
   */
  const golden = exp.simulation?.goldenProcedure;
  if (golden) {
    const settings = golden.varyPairs
      || (golden.vary?.values || []).map((v) => ({ [golden.vary.id]: v }));
    const rowsG = [];
    const refusalsG = [];
    for (const [k, overrides] of settings.entries()) {
      let inputs = { ...base, ...(golden.hold || {}), ...overrides };
      const numericVars = vars.filter((v) => v.type !== 'dependent' && Number.isFinite(v.min) && Number.isFinite(v.max));
      const fixed = new Set([...Object.keys(golden.hold || {}), ...Object.keys(overrides)]);
      for (const v of numericVars.filter((v) => !fixed.has(v.id))) {
        const sought = seekNull(model, inputs, v);
        if (sought === inputs) continue;
        let ind = null;
        try { ind = model.nullIndicator(sought); } catch { /* not a null instrument */ }
        if (!ind) continue;
        inputs = sought;
        if (ind.atNull) break;
      }
      const { reading } = runAndRead(model, inputs, k + 1);
      if (reading && !('v' in reading && reading.v == null)) rowsG.push({ ...reading });
      else refusalsG.push(reading?.reason || 'refused without a reason');
    }
    const scored = { ...score(rowsG), refusals: refusalsG, how: 'the procedure the experiment declares' };
    if (scored.rank >= 3) {
      const value = scored.derived[scored.key];
      const errAbs = Math.abs(value - expected.value);
      const slack = Math.max(Number(expected.tolerance) || 0, Math.abs(expected.value) * 0.02) * 2;
      if (verbose) {
        console.log(`\n${entry.id} [${modelName}]`);
        console.log(`   ${golden.note}`);
        console.log(`   readings: ${rowsG.length}   ${scored.key} = ${value} ${expected.unit || ''} (accepted ${expected.value} ± ${expected.tolerance})`);
      }
      checked += 1;
      if (errAbs > slack) {
        failures.push({ id: entry.id, kind: 'wrong-value',
          msg: `${scored.key} = ${value} ${expected.unit || ''} against an accepted ${expected.value} ± ${expected.tolerance}, following the procedure the experiment declares` });
      }
      continue;
    }
    failures.push({ id: entry.id, kind: 'declared-procedure-fails',
      msg: `the procedure this experiment declares yields ${rowsG.length} readings and no usable result — ${scored.derived?.reason || refusalsG[0] || 'no reason given'}` });
    checked += 1;
    continue;
  }

  let attempts = [];
  let neededRows = null;      // smallest count that yields a USABLE result
  let derivableAt = null;     // smallest count the calculation accepts at all
  for (const n of ladder) {
    const tried = attemptsAt(n);
    const rank = tried[0]?.rank ?? 0;
    if (!attempts.length || rank > (attempts[0]?.rank ?? 0)) attempts = tried;
    if (rank >= 2 && derivableAt === null) derivableAt = n;
    if (rank >= 3) { neededRows = n; attempts = tried; break; }
  }
  if (neededRows === null) neededRows = derivableAt;
  const best = attempts[0];
  if (minRows && neededRows && neededRows > minRows) {
    failures.push({ id: entry.id, kind: 'minrows-understated',
      msg: `the table advertises ${minRows} readings as enough; the calculation needs ${neededRows}` });
  }
  const rows = best.rows;
  const refusals = best.refusals;

  /*
   * The graph must plot fields the readings actually carry.
   *
   * XII-CHE-A02 and XII-PHY-ACT-B3 declared their axes as `xKey`/`yKey`
   * where the app reads `x`/`y`, so `row[undefined]` came back undefined for
   * every point and both graphs plotted NOTHING — however many readings were
   * taken, however correct they were. Nothing else noticed: the models
   * stepped, the readings recorded, the results calculated, and the panel
   * beside the empty graph stated the right answer.
   */
  const graph = exp.observationModel?.graph;
  if (graph && rows.length) {
    const carried = new Set(Object.keys(rows[0]));
    // main.js attaches a little extra per-row context for two models.
    for (const k of (modelName === 'simple-pendulum' ? ['massG', 'amplitudeDeg', 'lengthM']
      : modelName === 'resistivity' ? ['lengthCm', 'diameterMm'] : [])) carried.add(k);
    const missing = ['x', 'y'].map((ax) => graph[ax]).filter((k) => k && !carried.has(k));
    const legacy = ['xKey', 'yKey'].filter((k) => k in graph);
    if (legacy.length) {
      failures.push({ id: entry.id, kind: 'graph-axes',
        msg: `the graph declares ${legacy.join(' and ')}; the app reads x and y, so it plots nothing` });
    } else if (missing.length) {
      failures.push({ id: entry.id, kind: 'graph-axes',
        msg: `the graph plots "${missing.join('", "')}", which the readings do not carry` });
    }
  }

  checked += 1;
  const label = `${entry.id} [${modelName}]`;

  if (rows.length < 2) {
    failures.push({ id: entry.id, kind: 'unperformable',
      msg: `no procedure yielded more than ${rows.length} of ${want} readings — ${refusals[0] || 'no reason given'}` });
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

  /*
   * A unit is a claim about what a number IS, and the field it comes from
   * makes the same claim by its name. When the two disagree the panel is
   * comparing the wrong quantity, however confident it looks: XI-CHE-E02
   * declared its accepted value as 0.1 N — a normality — and read it from a
   * field called `molarity`, which for oxalic acid is half that, so every
   * correct student was told they were 50% out.
   */
  const UNIT_KEY_CONFLICTS = [
    { unit: /^N$/, wrong: /molarit/i, want: 'normality' },
    { unit: /^M$/, wrong: /normalit/i, want: 'molarity' },
    { unit: /^(°C|K)$/, wrong: /yield|percent/i, want: 'a temperature' },
    { unit: /^%$/, wrong: /point|temp|volt|resist/i, want: 'a percentage' },
    { unit: /^(Ω·m)$/, wrong: /^resistance$/i, want: 'resistivity' },
    { unit: /^H$/, wrong: /resist|impedance|reactance/i, want: 'inductance' },
    { unit: /^A$/, wrong: /voltage|volt/i, want: 'a current' },
  ];
  for (const c of UNIT_KEY_CONFLICTS) {
    if (expected.key && c.unit.test(String(expected.unit || '').trim()) && c.wrong.test(expected.key)) {
      failures.push({ id: entry.id, kind: 'unit-mismatch',
        msg: `the accepted value is in ${expected.unit} but is read from "${expected.key}" — it should come from ${c.want}` });
    }
  }

  const candidates = [expected.key, expected.symbol, ...(exp.calculations?.resultKeys || [])];
  const key = candidates.find((k) => k && Number.isFinite(derived[k]));
  if (!key) {
    failures.push({ id: entry.id, kind: 'unreadable',
      msg: `the result declares "${expected.symbol}" but derive() returns none of ${candidates.filter(Boolean).join(', ')}` });
    continue;
  }

  /*
   * Does the panel have everything it prints?
   *
   * Skipped for a model whose result carries a `mode` or `method`: those
   * templates switch on it INSIDE one branch — the refractive-index panel
   * draws three different experiments, the calorimeter three modes — and a
   * field belonging to the method that did not run is not missing.
   */
  const branching = derived.mode !== undefined || derived.method !== undefined;
  const wanted = branching ? [] : templateFields(modelName);
  const blank = wanted.filter((k) => !(k in derived) || derived[k] === undefined || derived[k] === null);
  if (blank.length) {
    failures.push({ id: entry.id, kind: 'panel-fields',
      msg: `the result panel prints ${blank.map((k) => `"${k}"`).join(', ')}, which derive() does not return` });
  }

  /*
   * Does the model's OWN accepted value agree with the experiment's?
   *
   * Many models report `accepted` for the specimen actually on the bench —
   * the resistor in the gap, the range the galvanometer is being converted
   * to, the surface under the spherometer. The experiment file, by contrast,
   * carries ONE accepted value, the one belonging to the default specimen.
   * The two must coincide when the default specimen is in use, or the panel
   * is quoting two different accepted values in the same breath, as the
   * surface-tension bench did: "accepted T = 0.0667" beside "differs from the
   * accepted 0.0727". Checking it here is also what makes the per-specimen
   * value safe to compare against elsewhere: it proves the model's `accepted`
   * is the same quantity, in the same unit, as the value the panel reports.
   */
  if (Number.isFinite(derived.accepted) && !/working through/.test(best.how || '')) {
    const gap = Math.abs(derived.accepted - expected.value);
    const room = Math.max(Number(expected.tolerance) || 0, Math.abs(expected.value) * 0.02);
    if (gap > room) {
      failures.push({ id: entry.id, kind: 'two-accepteds',
        msg: `the model reports an accepted ${derived.accepted} for the apparatus in use while the experiment declares ${expected.value} ${expected.unit || ''}` });
    }
  }

  /*
   * IS A SET TAKEN ACROSS TWO SPECIMENS REFUSED?
   *
   * Half the wrong answers in the student-journey sweep had the same shape.
   * Two mirrors whose focal lengths differ by ten centimetres, three
   * galvanometers with different resistances, three diodes with different
   * knees, four surfaces with different radii: a set taken across them was
   * averaged into one number belonging to none of them, and the accepted
   * value quoted beside it was whichever specimen happened to be selected
   * when Calculate was pressed. A mean is a measurement only when every
   * reading is of the same thing, and the benches that knew this said so
   * while the rest said nothing.
   *
   * The test is the model's own: if the accepted value DIFFERS between the
   * settings of an apparatus group, then a set mixing them cannot have a
   * result, and derive() must refuse it. Where the accepted value is the
   * same for every setting — four tuning forks verifying f×l, four capillary
   * tubes verifying r×h — the set across them IS the procedure, and nothing
   * is flagged.
   */
  for (const oc of optionControls.slice(0, 3)) {
    if (oc.options.length < 2) continue;
    const acceptedPer = [];
    for (const o of oc.options) {
      const saved = base[oc.id];
      base[oc.id] = o;
      let per = null;
      try {
        const out = collect({ name: 'per-option', at: null }, want);
        per = out.rows.length >= 2 ? model.derive(out.rows, { ...base }) : null;
      } catch { per = null; }
      base[oc.id] = saved;
      if (per?.ok && Number.isFinite(per.accepted)) acceptedPer.push(per.accepted);
    }
    if (acceptedPer.length < 2) continue;
    const lo = Math.min(...acceptedPer);
    const hi = Math.max(...acceptedPer);
    const differs = hi - lo > Math.max(Number(expected.tolerance) || 0, Math.abs(hi) * 0.02);
    if (!differs) continue;

    let mixed = null;
    try {
      const out = collect({ name: 'mixed', at: null, cycle: oc }, Math.max(want, oc.options.length));
      mixed = out.rows.length >= 2 ? model.derive(out.rows, { ...base }) : null;
    } catch { mixed = null; }
    if (mixed?.ok) {
      failures.push({ id: entry.id, kind: 'mixed-set',
        msg: `a set taken across the ${oc.options.length} settings of "${oc.id}" is averaged into one result, though their accepted values run from ${lo} to ${hi}` });
    }
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
    console.log(`   best of ${attempts.length} procedures: ${best.how}`);
    console.log(`   readings: ${rows.length}   ${key} = ${value} ${expected.unit || ''} (accepted ${expected.value} ± ${expected.tolerance})`);
  }
  if (errAbs > slack) {
    failures.push({ id: entry.id, kind: 'wrong-value',
      msg: `${key} = ${value} ${expected.unit || ''} against an accepted ${expected.value} ± ${expected.tolerance} — out by ${errPct.toFixed(1)}% (best of ${attempts.length} procedures: ${best.how})` });
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
