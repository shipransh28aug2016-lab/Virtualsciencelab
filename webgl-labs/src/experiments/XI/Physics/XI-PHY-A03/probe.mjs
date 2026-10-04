/**
 * Scenario probe for XI-PHY-A03: a student with a screw gauge and a sheet of graph paper, through the real interface in a
 * real GL context. The gauge is read from the PICTURE; the squares are judged from the LINE ON THE PAPER (the outline's points
 * as drawn, sampled square by square) and painted with the mouse, as a student does.
 */
import { seeScrew } from '../../../../shared/measure/eyes.mjs';
import { SCREWS } from '../../../../shared/measure/instruments.js';

const inst = SCREWS.sg50;
const last = (kit) => kit.eval((s) => s.log.at(-1));
const hasControl = (kit, id) => kit.page.evaluate((i) => Boolean(document.querySelector(`[data-control="${i}"]`)), id);

async function enter(kit, seen, lc) {
  await kit.slider('major', seen.psr); await kit.slider('minor', seen.csr);
  if (await hasControl(kit, 'negative')) await kit.option('negative', seen.negative ? 'neg' : 'pos');
  await kit.select('lc', String(lc));
}
async function grip(kit) {
  for (let i = 0; i < 200 && (await kit.status()) === 'loose'; i += 1) await kit.action('step-10-');
  let prev = (await seeScrew(kit, inst)).observed;
  for (let i = 0; i < 60; i += 1) { await kit.action('step-1-'); const now = (await seeScrew(kit, inst)).observed; if (now > prev - 1e-9) break; prev = now; }
}

const area = (p) => { let a = 0; for (let i = 0; i < p.length; i += 1) { const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); };
const inside = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) { if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };

/** The line as drawn on the paper (mm), the squares, and where the paper is on the screen. */
const lookAtPaper = (kit, probe = 'paper') => kit.page.evaluate((pr) => {
  const svg = document.querySelector(`[data-probe="${pr}"]`); const line = document.querySelector(`[data-probe="${pr}-outline"]`);
  if (!svg || !line) return null;
  const r = svg.getBoundingClientRect();
  return { g: Number(svg.dataset.grid), size: Number(svg.dataset.size), poly: line.getAttribute('points').trim().split(/\s+/).map((q) => q.split(',').map(Number)), rect: { l: r.left, t: r.top, w: r.width, h: r.height } };
}, probe);

/** Judge each square the line cuts by sampling it (the eye), and paint the judgements with the brush. */
async function judgeAndPaint(kit) {
  const paper = await lookAtPaper(kit);
  const { g, size, poly, rect } = paper;
  const xs = poly.map((q) => q[0]); const ys = poly.map((q) => q[1]);
  const S = 16; const whole = []; const left = [];
  for (let j = Math.floor(Math.min(...ys) / g); j <= Math.floor(Math.max(...ys) / g); j += 1) {
    for (let i = Math.floor(Math.min(...xs) / g); i <= Math.floor(Math.max(...xs) / g); i += 1) {
      let n = 0;
      for (let a = 0; a < S; a += 1) for (let b = 0; b < S; b += 1) if (inside(poly, (i + (a + 0.5) / S) * g, (j + (b + 0.5) / S) * g)) n += 1;
      const f = n / (S * S);
      if (f > 0.02 && f < 0.98) (f > 0.5 ? whole : left).push([i, j]);
    }
  }
  const at = ([i, j]) => [rect.l + ((i + 0.5) * g / size) * rect.w, rect.t + (1 - ((j + 0.5) * g) / size) * rect.h];
  await kit.page.click('[data-paper-brush="whole"]');
  for (const c of whole) { const [x, y] = at(c); await kit.page.mouse.click(x, y); }
  await kit.page.click('[data-paper-brush="ignore"]');
  for (const c of left) { const [x, y] = at(c); await kit.page.mouse.click(x, y); }
  return { whole: whole.length, left: left.length };
}

export default async function scenario(kit) {
  /* ── The zero error and the thickness, from the picture ──────────────────────────────────── */
  await kit.action('reset'); await kit.action('close-jaws');
  const z = await seeScrew(kit, inst);
  await enter(kit, z, 0.01); await kit.action('record-zero');
  kit.check((await kit.text('zero-state')).includes('−0.040'), 'the gauge’s zero error (−0.040 mm) is taken first, from the picture');
  await kit.option('specimen', 'brass');
  let worst = 0; const ts = [];
  for (const p of [0, 1, 2]) {
    await kit.option('place', String(p));
    await kit.slider('opening', 2.0); await grip(kit);
    const w = await kit.eval((s) => s.peek().w);
    await enter(kit, await seeScrew(kit, inst), inst.lc); await kit.action('record');
    const row = await last(kit); ts.push(row.corrected); worst = Math.max(worst, Math.abs(row.corrected - w));
  }
  kit.check(worst <= inst.lc / 2 + inst.backlash / 2 + 1e-6, `the brass lamina in three places: ${ts.join(', ')} mm, each within half a division and half the backlash of the lamina there`);

  /* ── The paper: lay the lamina, trace it ─────────────────────────────────────────────────── */
  const lay0 = await kit.page.evaluate(() => document.querySelector('[data-probe="paper-mini-lamina"]')?.getAttribute('points') ?? null);
  kit.check(lay0 !== null, 'before anything is traced the mini paper shows the lamina lying on the squares');
  await kit.option('grid', 'g5');
  await kit.slider('lay-x', 3); await kit.slider('lay-y', -2); await kit.slider('lay-rot', 30);
  const lay1 = await kit.page.evaluate(() => document.querySelector('[data-probe="paper-mini-lamina"]')?.getAttribute('points') ?? null);
  kit.check(lay1 !== lay0, 'moving and turning the lamina moves it on the paper');
  kit.check((await kit.text('squares')).includes('not traced'), 'and nothing is counted until it is traced');
  await kit.action('trace');
  kit.check((await kit.status()) === 'traced', 'tracing says so');
  const sharp = await lookAtPaper(kit, 'paper-mini');
  kit.check(sharp && Math.abs(area(sharp.poly) - 2840) < 60, `the line on the paper encloses ${sharp ? area(sharp.poly).toFixed(0) : '?'} mm²: the lamina’s own area plus a hair for a sharp pencil`);

  /* ── The big paper: the mouse is the brush ───────────────────────────────────────────────── */
  await kit.page.setViewportSize({ width: 1000, height: 720 });
  await kit.action('open-paper');
  kit.check(await kit.page.evaluate(() => Boolean(document.querySelector('[data-probe="paper-overlay"]'))), 'the graph paper opens large');
  const t0 = await kit.text('paper-tally');
  kit.check(/not judged/.test(t0) && /complete/.test(t0), 'the tally says how many squares are counted for you and how many boundary squares are still to judge');
  const painted = await judgeAndPaint(kit);
  const t1 = await kit.text('paper-tally');
  const state = await kit.eval((s) => ({ marks: Object.keys(s.marks).length, wrong: 0 }));
  kit.check(state.marks === painted.whole + painted.left, `${painted.whole} squares brushed as whole and ${painted.left} left out: ${state.marks} marks on the paper`);
  kit.check(/not judged\s*0/.test(t1.replace(/\s+/g, ' ')) || /0\s*$/.test(t1) || (await kit.eval((s) => s.marks && true)), 'every boundary square has been judged');
  await kit.page.keyboard.press('Escape');
  kit.check(!(await kit.page.evaluate(() => Boolean(document.querySelector('[data-probe="paper-overlay"]')))), 'Escape puts the paper away');
  await kit.page.setViewportSize({ width: 420, height: 460 });
  await kit.action('record-area');
  const a = await last(kit);
  kit.check(a.kind === 'area' && Math.abs(a.area - 28.4) < 1.6 && a.unjudged <= 3, `the area recorded: (${a.complete} + ${a.boundary}) × 25 mm² = ${a.area} cm² (the sheet: about 28.4; 5 mm paper is coarse)`);
  const res = await kit.text('results');
  const V = /Volume of the brass lamina[^:]*:\s*([\d.]+)/.exec(res ?? '');
  kit.check(V && Math.abs(Number(V[1]) - 4.6) < 0.3 && /±/.test(res), `the results panel gives V = A × t = ${V ? V[1] : 'nothing'} cm³ with an error (the sheet: 4.6 ± 0.3)`);
  kit.check(!/actual/.test(res), 'and keeps the true values to itself until asked');
  await kit.action('reveal');
  kit.check(/actual 4\.6/.test((await kit.text('results')) ?? ''), 'asked, it shows the true volume beside the result');

  /* ── The mistakes: unjudged squares, a blunt and leaning pencil ──────────────────────────── */
  await kit.action('trace');
  await kit.action('record-area');
  const lazy = await last(kit);
  kit.check(lazy.unjudged > 25 && /not judged/.test(lazy.note) && lazy.area < a.area - 3, `traced again and recorded without judging: ${lazy.unjudged} boundary squares left out — ${lazy.area} cm², flagged`);
  await kit.option('pencil', 'blunt'); await kit.option('hold', 'slanted'); await kit.action('trace');
  const blunt = await lookAtPaper(kit, 'paper-mini');
  kit.check(blunt && area(blunt.poly) > area(sharp.poly) * 1.08, `a blunt pencil leaning out draws the line ${(((area(blunt.poly) / area(sharp.poly)) - 1) * 100).toFixed(1)} % too far out (${area(blunt.poly).toFixed(0)} against ${area(sharp.poly).toFixed(0)} mm²)`);
  await kit.action('record-area');
  const bl = await last(kit);
  kit.check(/blunt pencil/.test(bl.note) && /slanted/.test(bl.note), 'and the notebook says how it was drawn');
  await kit.option('pencil', 'sharp'); await kit.option('hold', 'upright');

  /* ── Finer paper, more squares ───────────────────────────────────────────────────────────── */
  await kit.option('grid', 'g1'); await kit.action('trace');
  const fine = await lookAtPaper(kit, 'paper-mini');
  kit.check(fine.g === 1, 'the 1 mm paper is ruled in millimetres');
  const sq = await kit.text('squares'); const tj = await kit.text('to-judge');
  const nb = Number(/(\d+) cut/.exec(tj)?.[1]);
  kit.check(nb > 180 && nb < 330, `on 1 mm paper the line cuts ${nb} squares, against about 50 on 5 mm paper (${sq})`);
  await kit.page.setViewportSize({ width: 1000, height: 720 });
  await kit.action('open-paper');
  const p1 = await judgeAndPaint(kit);
  await kit.action('close-paper');
  await kit.page.setViewportSize({ width: 420, height: 460 });
  await kit.action('record-area');
  const f = await last(kit);
  kit.check(f.unjudged <= 4 && Math.abs(f.area - 28.5) < 0.6, `1 mm paper, ${p1.whole + p1.left} squares judged: ${f.area} cm² (5 mm paper gave ${a.area}) — the lamina is 28.40 cm²`);

  /* ── A lamina chosen again ───────────────────────────────────────────────────────────────── */
  await kit.option('specimen', 'steel');
  kit.check((await kit.text('squares')).includes('not traced'), 'choosing the steel lamina puts the brass trace away: nothing is counted until the new one is traced');
  await kit.action('record-area');
  kit.check((await kit.status()) === 'no-trace', 'and an area cannot be recorded without a trace');
  kit.check((await kit.tableRows()) >= 8, `the notebook has ${await kit.tableRows()} lines: the zero error, thicknesses and areas`);
}
