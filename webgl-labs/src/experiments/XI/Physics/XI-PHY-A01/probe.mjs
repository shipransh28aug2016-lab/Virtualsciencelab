/**
 * Scenario probe for XI-PHY-A01: a student at the vernier callipers, through the real interface in a real GL context.
 * The scales are read from the PICTURE (the lines on the screen: which vernier line sits on a main-scale line, which
 * main-scale division the vernier zero has passed), never from the store, then entered, recorded and compared with
 * what the jaws really were.
 */
import { seeVernier, seeZero } from '../../../../shared/measure/eyes.mjs';
import { VERNIERS } from '../../../../shared/measure/instruments.js';

const truth = (kit) => kit.eval((s) => { const v = s.peek(); return { msr: v.disp.msr, vsr: v.disp.vsr, negative: v.disp.negative, observed: v.disp.observed, gap: v.rest.gap, w: v.w, loose: v.rest.loose, e: v.e }; });
const last = (kit) => kit.eval((s) => s.log.at(-1));
const hasControl = (kit, id) => kit.page.evaluate((i) => Boolean(document.querySelector(`[data-control="${i}"]`)), id);
const use = async (kit, id) => { await kit.option('instrument', id); await kit.frames(3); return VERNIERS[id]; };

/** Enter what was seen. */
async function enter(kit, seen, lc) {
  await kit.slider('major', seen.msr); await kit.slider('minor', seen.vsr);
  if (await hasControl(kit, 'negative')) await kit.option('negative', seen.negative ? 'neg' : 'pos');
  await kit.select('lc', String(lc));
}

/** Close (or, in a hole, open) the jaws a least count at a time until the slide stops moving. */
async function grip(kit, { inner = false } = {}) {
  const dir = inner ? '+' : '-';
  const inst = await kit.eval((s) => s.peek().inst);
  const coarse = inst.n > 20 ? 10 : 1;
  for (let i = 0; i < 400 && (await kit.status()) === 'loose'; i += 1) await kit.action(`step-${coarse}${dir}`);
  let prev = await seeZero(kit);
  for (let i = 0; i < 60; i += 1) {
    await kit.action(`step-1${dir}`);
    const now = await seeZero(kit);
    if (inner ? now < prev + 1e-6 : now > prev - 1e-6) return;
    prev = now;
  }
  throw new Error('the slide never stopped');
}

export default async function scenario(kit) {
  /* ── The picture is the instrument: the line that coincides on the screen is the line the instrument says ───────── */
  await kit.option('specimen', 'none');
  let agree = 0; let total = 0; const bad = [];
  for (const id of ['vc10', 'vc20', 'vc50']) {
    const inst = await use(kit, id);
    const gaps = id === 'vc50' ? [0, 7.33, 33.37] : [0, 3.37, 10.2, 21.4, 33.33, 47.9, 62.06, 79.5];
    for (const g of gaps) {
      if (g === 3.37 && id === 'vc10') await kit.slider('opening', 3.5); else await kit.eval((s, a) => s.setOpening(a[0]), g);
      const seen = await seeVernier(kit, inst);
      const t = await truth(kit);
      total += 1;
      if (seen.msr === t.msr && seen.vsr === t.vsr && seen.negative === t.negative) agree += 1; else bad.push(`${id} @${g}: saw ${seen.msr}+${seen.vsr}${seen.negative ? ' (neg)' : ''}, instrument ${t.msr}+${t.vsr}${t.negative ? ' (neg)' : ''}`);
    }
  }
  kit.check(agree === total, `reading the lines on the screen gives the instrument's own reading in ${agree} of ${total} positions across the three callipers${bad.length ? ` — ${bad.slice(0, 3).join('; ')}` : ''}`);

  /* The lens: a 50-division vernier is read by moving the lens along it. */
  await use(kit, 'vc50');
  await kit.slider('lens', 0);
  const w0 = await kit.page.evaluate(() => document.querySelector('[data-probe="reading-window"]').innerHTML);
  await kit.slider('lens', 20);
  const w1 = await kit.page.evaluate(() => document.querySelector('[data-probe="reading-window"]').innerHTML);
  kit.check(w0 !== w1, 'moving the lens along the 50-division vernier moves what is in the window');
  await use(kit, 'vc10');
  kit.check(!(await hasControl(kit, 'lens')), 'and the 10-division callipers, which fit in the window, have no lens slider');

  /* ── The zero error, from the picture ─────────────────────────────────────────────────────────── */
  await kit.action('reset'); await kit.action('close-jaws');
  const z = await seeVernier(kit, VERNIERS.vc10);
  await enter(kit, z, 0.1);
  await kit.action('record-zero');
  kit.check((await kit.text('zero-state')).includes('+0.200'), `the 10-division callipers' zero error, read from the picture (${z.msr} + ${z.vsr} × 0.1), is +0.200 mm`);
  kit.check((await kit.tableRows()) === 1, 'and it is the first line of the notebook');

  /* ── The steel sphere in four places and four directions ───────────────────────────────────── */
  await kit.option('specimen', 'sphere');
  const inst = VERNIERS.vc10;
  let worst = 0; let flagged = 0;
  for (const [p, a] of [[0, 0], [1, 45], [2, 90], [3, 135]]) {
    await kit.option('place', String(p)); await kit.option('angle', String(a));
    await kit.slider('opening', 23);
    kit.check((await kit.status()) === 'loose', `place ${p + 1}, ${a}°: opened wide, the sphere is loose and the bench says so`);
    await grip(kit);
    kit.check((await kit.status()) === 'gripped', `place ${p + 1}, ${a}°: closed on it, it is just gripped`);
    const t = await truth(kit);
    const seen = await seeVernier(kit, inst);
    await enter(kit, seen, inst.lc);
    await kit.action('record');
    const row = await last(kit);
    worst = Math.max(worst, Math.abs(row.corrected - t.w));
    if (row.misread || row.loose || row.lcWrong) flagged += 1;
  }
  kit.check(worst <= inst.lc / 2 + inst.backlash / 2 + 1e-6, `four readings, each within half a least count and half the backlash of the sphere's width there (worst ${worst.toFixed(3)} mm)`);
  kit.check(flagged === 0, 'none of them flagged as a misread, a loose specimen or a wrong least count');
  const res = await kit.text('results');
  const vol = /Volume of the sphere[^:]*:\s*([\d.]+)/.exec(res ?? '');
  kit.check(vol && Math.abs(Number(vol[1]) - 5.13) < 0.12 && /±/.test(res), `the results panel gives the volume of the sphere: ${vol ? vol[1] : 'nothing'} cm³ with an error (the sheet: about 5.13)`);
  kit.check(!/actual/.test(res), 'and keeps the actual values to itself until asked');
  await kit.action('reveal');
  kit.check(/actual 5\.1/.test((await kit.text('results')) ?? ''), 'asked, it shows the actual volume beside the result');
  kit.check((await kit.tableRows()) === 5, 'five lines in the notebook: the zero error and four readings');

  /* ── The mistakes ─────────────────────────────────────────────────────────────────────────────── */
  await kit.option('place', '0'); await kit.option('angle', '0'); await kit.slider('opening', 23); await grip(kit);
  let seen = await seeVernier(kit, inst);
  await enter(kit, seen, 0.05); await kit.action('record');
  let row = await last(kit);
  kit.check(row.lcWrong && Math.abs(row.corrected - 21.4) > 0.2, `the wrong least count (0.05 mm for these callipers) gives ${row.corrected} mm and is flagged`);
  await enter(kit, seen, inst.lc); await kit.slider('minor', (seen.vsr + 1) % 10); await kit.action('record');
  row = await last(kit);
  kit.check(row.misread && (await kit.status()) === 'misread', 'one vernier division out is recorded, flagged, and the bench says what the scales really show');
  await kit.slider('opening', 25);
  await enter(kit, await seeVernier(kit, inst), inst.lc); await kit.action('record');
  row = await last(kit);
  kit.check(row.loose && /loose/.test(row.note), 'a reading with the sphere loose is flagged as such');
  /* Parallax: with nothing in the jaws, at an opening where the line that coincides is near the middle between two. */
  await kit.option('specimen', 'none'); await kit.eval((s) => s.setOpening(3.37));
  const straight = await seeVernier(kit, inst);
  await kit.option('eye', 'left');
  const aside = await seeVernier(kit, inst); const ta = await truth(kit);
  kit.check(/left/.test((await kit.text('viewing')) ?? ''), 'the bench says where the eye is');
  await kit.option('eye', 'centre');
  kit.check(aside.msr === ta.msr && aside.vsr === ta.vsr, 'with the eye to one side the picture shows what the instrument says it shows');
  kit.check(aside.vsr !== straight.vsr && Math.abs(aside.observed - straight.observed) <= inst.lc + 1e-9, `and a look from the side moves the reading by a division (${aside.observed.toFixed(2)} against ${straight.observed.toFixed(2)})`);

  /* ── Inside a beaker: the upper jaws, and the depth strip ─────────────────────────────────── */
  await kit.option('specimen', 'beaker');
  await kit.slider('opening', 36);
  kit.check((await kit.status()) === 'loose' && /not reached/.test((await kit.text('status')) ?? ''), 'jaws too narrow for the beaker: they have not reached the walls');
  await grip(kit, { inner: true });
  let t = await truth(kit);
  seen = await seeVernier(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record');
  row = await last(kit);
  kit.check(Math.abs(row.corrected - t.w) <= inst.lc / 2 + inst.backlash + 1e-6 && !row.loose, `the internal diameter of the beaker, opened against the glass, reads ${row.corrected} mm (it is ${t.w.toFixed(3)} mm here)`);
  await kit.option('dim-beaker', 'depth');
  await kit.slider('opening', 56);
  await grip(kit, { inner: true });
  t = await truth(kit); seen = await seeVernier(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record');
  row = await last(kit);
  kit.check(Math.abs(row.corrected - t.w) <= inst.lc / 2 + inst.backlash + 1e-6 && row.corrected > 61, `the depth, with the strip on the bottom, reads ${row.corrected} mm (it is ${t.w.toFixed(3)} mm here)`);

  /* ── The 50-division callipers ───────────────────────────────────────────────────────────────── */
  const fine = await use(kit, 'vc50');
  await kit.option('specimen', 'none'); await kit.action('close-jaws');
  const zf = await seeVernier(kit, fine); await enter(kit, zf, 0.02); await kit.action('record-zero');
  kit.check((await kit.text('zero-state')).includes('+0.060'), `the 50-division callipers, read through the lens (${zf.msr} + ${zf.vsr} × 0.02), have a zero error of +0.060 mm (+0.080 less half the backlash, to the nearest division)`);
  await kit.option('specimen', 'cylinder'); await kit.option('dim-cylinder', 'length');
  await kit.slider('opening', 38.5);
  await grip(kit);
  t = await truth(kit); seen = await seeVernier(kit, fine); await enter(kit, seen, fine.lc); await kit.action('record');
  row = await last(kit);
  kit.check(Math.abs(row.corrected - t.w) <= fine.lc / 2 + fine.backlash / 2 + 1e-6, `the cylinder's length with a 0.02 mm least count reads ${row.corrected.toFixed(2)} mm (${t.w.toFixed(3)} here)`);

  /* ── The notebook is what was done ───────────────────────────────────────────────────────────── */
  const notes = await kit.eval((s) => s.analysis.notes);
  kit.check(notes.lcWrong === 1 && notes.misread === 1 && notes.loose === 1, `the results panel counts the mistakes: ${JSON.stringify(notes)}`);
  kit.check((await kit.tableRows()) >= 12, `the notebook has ${await kit.tableRows()} lines`);
}
