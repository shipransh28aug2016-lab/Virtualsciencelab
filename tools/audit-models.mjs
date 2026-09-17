import { readFile } from 'node:fs/promises';
const root = process.env.VLAB_ROOT || process.cwd();
const idx = JSON.parse(await readFile(`${root}/data/experiments/index.json`, 'utf8'));
const sig = (s) => JSON.stringify(Object.entries(s||{}).filter(([k])=>k!=='t').sort());

const byModel = new Map();
for (const meta of idx.experiments.filter(e => e.contentStatus === 'published')) {
  const exp = JSON.parse(await readFile(`${root}/${meta.file}`, 'utf8'));
  const mn = exp.simulation.model;
  if (byModel.has(mn)) continue;
  const model = await import(`${root}/src/simulation/models/${mn}.js`);
  const inputs = { ...model.defaults };
  for (const v of exp.variables || []) {
    if (v.default === undefined || v.default === null || v.type === 'dependent') continue;
    inputs[v.id] = v.default;
  }
  /* (a) does it evolve in time, with the flags a button would set?

     The flag list must be the one the APPLICATION sets, or the audit tests a
     bench the student can never reach. main.js `processFlag()` recognises
     flying / released / rolling / heating / running and `startProcess()` sets
     whichever the model declares; this list omitted flying, released and
     rolling, so every launcher, every released ball and the roller were
     stepped with their run flag still false. `rolling-friction` was reported
     dead on that basis alone -- its step() returns immediately unless
     `rolling` is set, which the audit never did. */
  const RUN_FLAGS = { flying: true, released: true, rolling: true, heating: true, running: true, flowing: true, flowRate: 1, started: true };
  let s = { ...model.init(inputs), ...RUN_FLAGS };
  const t0 = sig(s);
  for (let i = 0; i < 180; i++) s = model.step(s, inputs, 1/60);
  const evolves = sig(s) !== t0;

  /* (b) does it respond to the student changing a control?

     This used to vary ONE variable: the first independent one carrying a
     numeric min. That produced false death sentences. `friction` correctly
     returns an unchanged state while the pan load sits below limiting
     friction -- static friction balancing the pull IS the observation -- and
     `viscosity` waits on a release flag, so varying their first numeric
     variable alone proved nothing. Every non-dependent variable the
     experiment declares is now tried, numeric and categorical alike, and the
     first that changes the state or the measurement ends the search. */
  const cands = (exp.variables || []).filter(v => v.type !== 'dependent');
  let responds = false, respondedTo = null;
  for (const v of cands) {
    /* Several alternatives per variable, not one. Some models respond over a
       BAND rather than a threshold -- rolling friction is measured where the
       pan load just matches it, a window a few tenths of a gram wide -- so
       jumping straight to the maximum sails past the only region that
       responds and looks like no response at all. */
    const alts = [];
    if (Array.isArray(v.options) && v.options.length > 1) {
      alts.push(...v.options.filter(o => o !== inputs[v.id]));
    } else if (Number.isFinite(v.min) && Number.isFinite(v.max)) {
      alts.push(v.max, v.min, (v.min + v.max) / 2, v.min + (v.max - v.min) * 0.05);
    } else if (typeof inputs[v.id] === 'boolean') {
      alts.push(!inputs[v.id]);
    }
    for (const alt of alts) {
    if (alt === undefined || alt === inputs[v.id]) continue;
    const i2 = { ...inputs, [v.id]: alt };
    let a = model.init(inputs), b = model.init(i2);
    a = { ...a, ...RUN_FLAGS }; b = { ...b, ...RUN_FLAGS };
    for (let i = 0; i < 60; i++) { a = model.step(a, inputs, 1/60); b = model.step(b, i2, 1/60); }
    if (sig(a) !== sig(b)) { responds = true; respondedTo = v.id; break; }
    if (model.measure) {
      try {
        if (JSON.stringify(model.measure(a, inputs, 1)) !== JSON.stringify(model.measure(b, i2, 1))) {
          responds = true; respondedTo = v.id; break;
        }
      } catch { /* a model may reject the alternative; that is not a response */ }
    }
    }
    if (responds) break;
  }
  const ind = { id: respondedTo };
  byModel.set(mn, { evolves, responds, ind: ind?.id });
}

const deadBoth = [], staticButResponds = [], ok = [];
for (const [m, r] of byModel) {
  if (r.evolves) ok.push(m);
  else if (r.responds) staticButResponds.push(m);
  else deadBoth.push(m);
}
console.log(`models that evolve in time           : ${ok.length}`);
console.log(`static, but respond to controls      : ${staticButResponds.length}`);
console.log(`respond to NOTHING (truly dead)      : ${deadBoth.length}`);
console.log('\n-- TRULY DEAD --'); deadBoth.forEach(m=>console.log('  '+m));
console.log('\n-- static-but-responsive --'); console.log('  ' + staticButResponds.join(', '));
