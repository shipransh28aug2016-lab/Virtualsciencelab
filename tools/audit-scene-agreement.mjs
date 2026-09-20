#!/usr/bin/env node
/**
 * DOES THE BENCH SHOW WHAT THE TABLE SAYS?
 *
 * The complaint this audit exists to answer, in the words it was made in:
 * "the student started one thing and the simulator ran another, the reading
 * was something else again, and the lab scene was a different scene entirely".
 *
 * Every other audit here watches one layer at a time. The renderer audit asks
 * whether the bench draws without throwing. The golden audit asks whether the
 * numbers come out right. Neither asks whether the picture and the numbers are
 * about the SAME apparatus — and they need not be, because a renderer is handed
 * `state` and `inputs` and may read the wrong field, or none at all, without
 * anything failing. A bench that draws a brass wire while the table records a
 * steel one is exactly as wrong as a bench that draws nothing, and far more
 * convincing.
 *
 * So this sets each option group to each of its settings in turn and asks two
 * questions of the drawing that comes back:
 *
 *   1. DOES THE PICTURE MOVE AT ALL?  If every setting of a group produces a
 *      byte-identical stream of drawing calls, the bench is not showing the
 *      choice. Changing the specimen changed the table and left the apparatus
 *      alone.
 *
 *   2. DOES THE PICTURE CONTRADICT THE TABLE?  The row that `measure()` returns
 *      names things in words — "Brass wire (thick)", "22 Ω resistor", "Convex
 *      lens f = 15 cm". Collect those names across the whole group and they
 *      become a vocabulary. If the bench prints one of them, it must be the one
 *      now selected. Printing another member of the same set is the defect in
 *      its purest form: the scene naming a different experiment than the one
 *      being recorded.
 *
 * Both questions are asked against the model's own output, so neither depends
 * on a list of expectations kept somewhere else and left to rot.
 *
 *   node tools/audit-scene-agreement.mjs              # every published lab
 *   node tools/audit-scene-agreement.mjs XI-PHY-A07   # one lab, verbose
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = process.env.VLAB_ROOT || process.cwd();
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/*
 * A canvas context that remembers what it was asked to draw. The renderer
 * audit's mock throws everything away; this one keeps a transcript, because
 * the transcript IS the observation.
 */
function recordingCtx(log) {
  const TEXT = new Set(['fillText', 'strokeText']);
  const base = {};
  const noop = ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'rect', 'roundRect', 'quadraticCurveTo', 'bezierCurveTo', 'fillRect',
    'strokeRect', 'clearRect', 'setLineDash', 'translate', 'rotate', 'scale', 'setTransform',
    'clip', 'arcTo', 'drawImage', 'putImageData'];
  for (const k of noop) {
    base[k] = (...a) => { log.calls.push(`${k}(${a.map(num).join(',')})`); };
  }
  for (const k of TEXT) {
    base[k] = (t, ...a) => {
      log.calls.push(`${k}(${String(t)}@${a.map(num).join(',')})`);
      if (typeof t === 'string' && t.trim()) log.text.push(t.trim());
    };
  }
  base.measureText = (t) => ({ width: String(t ?? '').length * 6 });
  base.createLinearGradient = () => ({ addColorStop() {} });
  base.createRadialGradient = () => ({ addColorStop() {} });
  base.createPattern = () => null;
  base.getImageData = () => ({ data: new Uint8ClampedArray(4) });
  return new Proxy(base, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    /* Styles are part of the picture: a colour that never changes with the
       solution is the same defect as a shape that never changes. */
    set: (t, p, v) => { log.calls.push(`${String(p)}=${num(v)}`); t[p] = v; return true; },
  });
}
/** Round coordinates, so sub-pixel jitter does not read as a different scene. */
const num = (v) => (typeof v === 'number' ? (Math.round(v * 4) / 4).toString() : String(v));

const canvas = {
  width: 900, height: 560, style: {}, clientWidth: 900, dataset: {},
  parentElement: { clientWidth: 900 },
  addEventListener() {}, removeEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 560 }),
};
globalThis.window = { devicePixelRatio: 1 };

const A = await import(`${root}/src/simulation/renderers/apparatus.js`);
const { RENDERERS } = await import(`${root}/src/simulation/renderers/index.js`);
const { resetFluids } = await import(`${root}/src/simulation/fluids.js`);
const index = JSON.parse(await readFile(`${root}/data/experiments/index.json`, 'utf8'));
const published = index.experiments.filter((e) => e.contentStatus === 'published');
const targets = only.length ? published.filter((e) => only.includes(e.id)) : published;

/** Draw one configuration and hand back the transcript. */
function drawOnce(exp, fn, model, inputs, frames = 14) {
  const log = { calls: [], text: [] };
  canvas.getContext = () => recordingCtx(log);
  resetFluids();
  A.setCanvasTheme('classroom');
  let state = {
    ...model.init(inputs),
    running: true, flowing: true, flowRate: 1, heating: true,
    released: true, rolling: true, started: true,
  };
  for (let f = 0; f < frames; f += 1) state = model.step(state, inputs, 1 / 60);
  A.resetScene();
  A.renderScene(canvas, 16 / 10, exp.simulation.renderer, fn, state, inputs);
  return { state, hash: createHash('sha1').update(log.calls.join('\n')).digest('hex'), text: log.text };
}

/**
 * Words the scene may print that belong to some OTHER setting of this group.
 * Short or numeric strings are left out: "1", "cm" and "Water" occur all over a
 * bench for innocent reasons, and a vocabulary that flags them flags nothing.
 */
const usable = (s) => typeof s === 'string' && s.trim().length >= 5 && /[A-Za-z]{3}/.test(s);

/**
 * Did the bench actually record this, or refuse it?
 *
 * A refusal is not always `null`. The null-point models hand back
 * `{ v: null, reason: 'Retrace: not retracing…' }`, which is an object with
 * strings in it, so reading it as a recorded row put the refusal's own wording
 * into the vocabulary and left the apparatus label belonging to whichever
 * setting happened to be measurable. A row is a reading when it carries the
 * trial number every observation table is keyed by.
 */
const recorded = (row) => !!row && typeof row === 'object'
  && Number.isFinite(row.trial) && row.reason == null;

const problems = [];
let checkedGroups = 0;
let checkedLabs = 0;

for (const meta of targets) {
  const exp = JSON.parse(await readFile(`${root}/${meta.file}`, 'utf8'));
  const fn = RENDERERS[exp.simulation.renderer];
  if (!fn) { problems.push({ id: meta.id, kind: 'renderer', msg: 'no renderer registered' }); continue; }
  const model = await import(`${root}/src/simulation/models/${exp.simulation.model}.js`);

  const base = { ...model.defaults };
  for (const v of exp.variables || []) {
    if (v.default == null || v.type === 'dependent') continue;
    base[v.id] = v.default;
  }

  /* Only groups the student can actually reach from the bench. */
  const wired = new Set((exp.simulation.controls || []).map((c) => c.var));
  const groups = (exp.variables || []).filter((v) =>
    wired.has(v.id) && Array.isArray(v.options) && v.options.length > 1 && v.type !== 'dependent');
  if (!groups.length) continue;
  checkedLabs += 1;

  for (const g of groups) {
    checkedGroups += 1;
    const trials = [];
    let broke = null;
    for (const o of g.options) {
      const inputs = { ...base, [g.id]: o };
      try {
        const drawn = drawOnce(exp, fn, model, inputs);
        const row = model.measure ? model.measure(drawn.state, inputs, 1, 1) : null;
        trials.push({ o, ...drawn, row });
      } catch (e) { broke = `${o}: ${e.message}`; break; }
    }
    if (broke) { problems.push({ id: meta.id, kind: 'draw', msg: `${g.label || g.id} — ${broke}` }); continue; }

    /* 1 · the picture never moves */
    const hashes = new Set(trials.map((t) => t.hash));
    if (hashes.size === 1) {
      problems.push({
        id: meta.id, kind: 'static',
        msg: `the bench draws an identical picture for all ${g.options.length} settings of "${g.label || g.id}" (${g.options.join(', ')})`,
      });
    }

    /* 2 · the picture names a different setting than the table records */
    /*
     * Only settings the bench agreed to measure can be compared. Where a
     * setting is refused — the auxiliary lens not yet at the null, the ammeter
     * wired across the load — `measure()` returns nothing, so that option has
     * no vocabulary of its own. Reading its silence as "this word belongs to
     * some OTHER setting" accused six benches of naming the wrong apparatus
     * when all they were doing was labelling the apparatus that was there.
     */
    const measured = trials.filter((t) => recorded(t.row));
    const vocab = new Map();          // word → the option it belongs to
    const spoken = new Map();         // option → the words its own row uses
    for (const t of measured) {
      const words = new Set();
      for (const val of Object.values(t.row)) if (usable(val)) words.add(val.trim());
      spoken.set(t.o, words);
      /* A word two settings share belongs to neither, and must STAY belonging
         to neither: written as a one-line conditional it was handed back to
         the third setting that used it, which is how a label printed by every
         setting came to be reported as one setting's private property. */
      for (const w of words) {
        if (!vocab.has(w)) vocab.set(w, t.o);
        else if (vocab.get(w) !== t.o) vocab.set(w, null);
      }
    }
    for (const t of measured) {
      const mine = spoken.get(t.o) || new Set();
      const printed = t.text.join(' ␟ ');
      const wrong = [...vocab.entries()]
        .filter(([w, owner]) => owner && owner !== t.o && !mine.has(w) && printed.includes(w));
      if (wrong.length) {
        problems.push({
          id: meta.id, kind: 'contradiction',
          msg: `with "${g.label || g.id}" set to ${t.o}, the bench prints ${wrong.map(([w, o]) => `"${w}" (which belongs to ${o})`).join(' and ')}`,
        });
      }
    }

    if (only.length) {
      console.log(`  ${meta.id} · ${g.label || g.id}: ${hashes.size}/${g.options.length} distinct pictures`);
      for (const t of trials) console.log(`      ${t.o.padEnd(16)} ${t.text.slice(0, 6).join(' | ')}`);
    }
  }
}

const bar = '═'.repeat(78);
console.log(`\n${bar}`);
console.log(`SCENE AGREEMENT: ${checkedGroups} option group(s) across ${checkedLabs} lab(s)`);
console.log(bar);
if (!problems.length) {
  console.log('Every bench redraws for every choice, and none names a setting other than the one being recorded.');
  process.exit(0);
}
for (const kind of ['renderer', 'draw', 'contradiction', 'static']) {
  const of = problems.filter((p) => p.kind === kind);
  if (!of.length) continue;
  const title = { renderer: 'NO RENDERER', draw: 'THREW WHILE DRAWING', contradiction: 'SCENE CONTRADICTS THE TABLE', static: 'SCENE IGNORES THE CHOICE' }[kind];
  console.log(`\n── ${title} · ${of.length} ──`);
  for (const p of of) console.log(`   ${p.id.padEnd(22)} ${p.msg}`);
}
process.exit(1);
