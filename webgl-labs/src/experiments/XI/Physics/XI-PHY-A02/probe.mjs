/**
 * Scenario probe for XI-PHY-A02: a student at the screw gauge, through the real interface in a real GL context.
 * The scales are read from the PICTURE (the last sleeve division the thimble has uncovered, the circular division
 * at the datum line), never from the store, then entered, recorded and compared with what the faces really were.
 */
import { seeScrew } from '../../../../shared/measure/eyes.mjs';
import { SCREWS } from '../../../../shared/measure/instruments.js';

const truth = (kit) => kit.eval((s) => { const v = s.peek(); return { psr: v.disp.psr, csr: v.disp.csr, negative: v.disp.negative, observed: v.disp.observed, gap: v.rest.gap, w: v.w, squeezed: v.rest.squeezed ?? 0 }; });
const last = (kit) => kit.eval((s) => s.log.at(-1));
const hasControl = (kit, id) => kit.page.evaluate((i) => Boolean(document.querySelector(`[data-control="${i}"]`)), id);
const use = async (kit, id) => { await kit.option('instrument', id); await kit.frames(3); return SCREWS[id]; };

async function enter(kit, seen, lc) {
  await kit.slider('major', seen.psr); await kit.slider('minor', seen.csr);
  if (await hasControl(kit, 'negative')) await kit.option('negative', seen.negative ? 'neg' : 'pos');
  await kit.select('lc', String(lc));
}

/** Turn the thimble on a hundredth at a time until the reading stops falling: the faces are on the specimen. */
async function grip(kit, inst, { push = 0 } = {}) {
  for (let i = 0; i < 200 && (await kit.status()) === 'loose'; i += 1) await kit.action('step-10-');
  let prev = (await seeScrew(kit, inst)).observed;
  for (let i = 0; i < 60; i += 1) {
    await kit.action('step-1-');
    const now = (await seeScrew(kit, inst)).observed;
    if (now > prev - 1e-9) break;
    prev = now;
  }
  for (let i = 0; i < push; i += 1) await kit.action('step-1-');
}

export default async function scenario(kit) {
  /* ── The picture is the instrument ──────────────────────────────────────────────────────── */
  await kit.option('specimen', 'none');
  let agree = 0; let total = 0; const bad = [];
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    const inst = await use(kit, id);
    const gaps = id === 'sg100' ? [0.37, 1.23, 3.17, 5.04, 11.51, 24.9] : [0, 0.37, 1.23, 3.17, 5.04, 11.51, 24.9];
    for (const g of gaps) {
      if (g === 3.17 && id === 'sg50') await kit.slider('opening', 3.15); else await kit.eval((s, a) => s.setOpening(a[0]), g);
      const seen = await seeScrew(kit, inst);
      const t = await truth(kit);
      total += 1;
      if (Math.abs(seen.psr - t.psr) < 1e-6 && seen.csr === t.csr && seen.negative === t.negative) agree += 1; else bad.push(`${id} @${g}: saw ${seen.psr}+${seen.csr}${seen.negative ? ' (neg)' : ''}, instrument ${t.psr}+${t.csr}${t.negative ? ' (neg)' : ''}`);
    }
  }
  kit.check(agree === total, `reading the sleeve and the thimble on the screen gives the instrument's own reading in ${agree} of ${total} positions across the three gauges${bad.length ? ` — ${bad.slice(0, 3).join('; ')}` : ''}`);

  /* ── The pitch, from ten turns, watched on the picture ───────────────────────────────────── */
  for (const id of ['sg50', 'sg100']) {
    const inst = await use(kit, id);
    await kit.action('reset'); await kit.option('instrument', id); await kit.frames(2);
    await kit.action('close-jaws');
    const a = await seeScrew(kit, inst);
    await kit.action('turn-10+');
    const b = await seeScrew(kit, inst);
    const pitch = Math.round(((b.observed - a.observed) / 10) * 100) / 100;
    kit.check(Math.abs(pitch - inst.pitch) < 1e-9, `${id}: ten turns move the thimble edge from ${a.observed.toFixed(2)} to ${b.observed.toFixed(2)} mm on the sleeve: pitch ${pitch} mm`);
    await kit.select('pitch', String(pitch)); await kit.select('divisions', String(inst.n));
    kit.check((await kit.text('derived-lc')).includes('0.0100'), `${id}: pitch ${pitch} ÷ ${inst.n} divisions = 0.0100 mm, shown on the bench`);
    await kit.select('divisions', String(inst.n === 50 ? 100 : 50));
    kit.check(!(await kit.text('derived-lc')).includes('0.0100'), `${id}: miscounted divisions give another least count`);
    await kit.action('turn-10-');
  }

  /* ── The zero error from the picture ─────────────────────────────────────────────────────── */
  await kit.action('reset'); await use(kit, 'sg50');
  const inst = SCREWS.sg50;
  await kit.action('close-jaws');
  const z = await seeScrew(kit, inst);
  kit.check(z.negative && z.csr === 46, `closed, the circular scale zero stands above the datum line: no sleeve division showing, division ${z.csr} at the datum — a negative zero error`);
  await enter(kit, z, 0.01); await kit.action('record-zero');
  kit.check((await kit.text('zero-state')).includes('−0.040'), `read as −(50 − ${z.csr}) × 0.01 = −0.040 mm`);
  kit.check((await kit.tableRows()) === 1, 'and it is the first line of the notebook');

  /* ── The wire, in four places and four directions, with the ratchet ───────────────────────── */
  await kit.option('specimen', 'wire');
  let worst = 0; let flagged = 0;
  for (const [p, a] of [[0, 0], [1, 45], [2, 90], [3, 135]]) {
    await kit.option('place', String(p)); await kit.option('angle', String(a));
    await kit.slider('opening', 0.8);
    kit.check((await kit.status()) === 'loose', `place ${p + 1}, ${a}°: the faces wide apart, the wire is loose and the bench says so`);
    await grip(kit, inst);
    kit.check((await kit.status()) === 'gripped', `place ${p + 1}, ${a}°: closed with the ratchet, the wire is just gripped`);
    const t = await truth(kit);
    const seen = await seeScrew(kit, inst);
    await enter(kit, seen, inst.lc); await kit.action('record');
    const row = await last(kit);
    worst = Math.max(worst, Math.abs(row.corrected - t.w));
    if (row.misread || row.loose || row.lcWrong) flagged += 1;
  }
  kit.check(worst <= inst.lc / 2 + inst.backlash / 2 + 1e-6, `four readings, each within half a division and half the backlash of the wire's width there (worst ${worst.toFixed(4)} mm)`);
  kit.check(flagged === 0, 'none of them flagged as a misread, a loose specimen or a wrong least count');
  const res = await kit.text('results');
  const area = /Area of cross-section of the copper wire[^:]*:\s*([\d.]+)/.exec(res ?? '');
  kit.check(area && Math.abs(Number(area[1]) - 0.1333) < 0.01 && /±/.test(res), `the results panel gives the area of cross-section: ${area ? area[1] : 'nothing'} mm² with an error (the sheet: 0.133)`);
  kit.check(!/actual/.test(res), 'and keeps the actual values to itself until asked');
  await kit.action('reveal');
  kit.check(/actual 0\.13/.test((await kit.text('results')) ?? ''), 'asked, it shows the actual area beside the result');

  /* ── Paper: the ratchet and the thimble ───────────────────────────────────────────────────── */
  await kit.option('specimen', 'paper'); await kit.option('place', '0'); await kit.option('angle', '0');
  await kit.slider('opening', 0.3);
  await grip(kit, inst, { push: 12 });
  kit.check((await kit.status()) === 'gripped', 'paper gripped by the ratchet: pushed on regardless, the ratchet slips and nothing is squeezed');
  let seen = await seeScrew(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record');
  const ratcheted = await last(kit);
  await kit.option('ratchet', 'off');
  await kit.slider('opening', 0.3);
  await grip(kit, inst, { push: 12 });
  kit.check((await kit.status()) === 'squeezed' && /squeezed/.test((await kit.text('status')) ?? ''), 'the thimble turned on against the paper squeezes it, and the bench says so');
  seen = await seeScrew(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record');
  const bare = await last(kit);
  kit.check(bare.squeezed > 0.012 && bare.corrected < ratcheted.corrected - 0.008 && /squeezed/.test(bare.note), `the paper reads ${bare.corrected} mm turned by the thimble against ${ratcheted.corrected} mm with the ratchet: too low, and flagged`);
  await kit.option('ratchet', 'on');

  /* ── The mistakes: least count, misread, loose ───────────────────────────────────────────── */
  await kit.option('specimen', 'sheet'); await kit.slider('opening', 0.6); await grip(kit, inst);
  seen = await seeScrew(kit, inst);
  await enter(kit, seen, 0.005); await kit.action('record');
  let row = await last(kit);
  kit.check(row.lcWrong && Math.abs(row.corrected - 0.253) > 0.05, `the wrong least count (0.005 mm) gives ${row.corrected} mm for the sheet and is flagged`);
  await enter(kit, seen, inst.lc); await kit.slider('minor', (seen.csr + 1) % 50); await kit.action('record');
  row = await last(kit);
  kit.check(row.misread && (await kit.status()) === 'misread', 'one circular division out is recorded, flagged, and the bench says what the scales really show');
  await kit.slider('opening', 0.9);
  await enter(kit, await seeScrew(kit, inst), inst.lc); await kit.action('record');
  row = await last(kit);
  kit.check(row.loose && /loose/.test(row.note), 'a reading with the sheet loose between the faces is flagged as such');

  /* ── Backlash: the old gauge ─────────────────────────────────────────────────────────────── */
  const old = await use(kit, 'sg50f');
  await kit.option('specimen', 'none');
  await kit.eval((s) => s.setOpening(5));
  const from_below = await seeScrew(kit, old);
  await kit.action('step-1+'); await kit.action('step-1-');
  const from_above = await seeScrew(kit, old);
  kit.check(Math.abs(from_below.observed - from_above.observed - 0.05) < 1e-6, `the old gauge, brought to the same place from below and from above, reads ${from_below.observed.toFixed(2)} and ${from_above.observed.toFixed(2)} mm: five divisions of backlash`);

  /* ── The notebook is what was done ───────────────────────────────────────────────────────── */
  const notes = await kit.eval((s) => s.analysis.notes);
  kit.check(notes.lcWrong === 1 && notes.misread === 1 && notes.loose === 1 && notes.squeezed === 1, `the results panel counts the mistakes: ${JSON.stringify(notes)}`);
  kit.check((await kit.tableRows()) >= 10, `the notebook has ${await kit.tableRows()} lines`);
}
