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

  // (b) does it respond to the student changing a control?
  const ind = (exp.variables||[]).find(v => v.type === 'independent' && Number.isFinite(v.min));
  let responds = false;
  if (ind) {
    const i2 = { ...inputs, [ind.id]: ind.max };
    let a = model.init(inputs), b = model.init(i2);
    for (let i = 0; i < 60; i++) { a = model.step(a, inputs, 1/60); b = model.step(b, i2, 1/60); }
    responds = sig(a) !== sig(b);
    if (!responds && model.measure) {
      try { responds = JSON.stringify(model.measure(a, inputs, 1)) !== JSON.stringify(model.measure(b, i2, 1)); } catch {}
    }
  }
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
