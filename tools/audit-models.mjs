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
  // (a) does it evolve in time, with the flags a button would set?
  let s = { ...model.init(inputs), running: true, flowing: true, flowRate: 1, heating: true, started: true };
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
    let alt;
    if (Array.isArray(v.options) && v.options.length > 1) {
      alt = v.options.find(o => o !== inputs[v.id]);
    } else if (Number.isFinite(v.min) && Number.isFinite(v.max)) {
      alt = inputs[v.id] === v.max ? v.min : v.max;
    } else if (typeof inputs[v.id] === 'boolean') {
      alt = !inputs[v.id];
    }
    if (alt === undefined || alt === inputs[v.id]) continue;
    const i2 = { ...inputs, [v.id]: alt };
    let a = model.init(inputs), b = model.init(i2);
    const flags = { running: true, flowing: true, flowRate: 1, heating: true, started: true };
    a = { ...a, ...flags }; b = { ...b, ...flags };
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
