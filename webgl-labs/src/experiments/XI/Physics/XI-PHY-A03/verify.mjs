/**
 * verify.mjs — XI-PHY-A03, the volume of an irregular lamina.
 *
 * Geometry first (the squares the line cuts are clipped exactly: the covered fractions must add up to the polygon's area), then a
 * student robot: zero error, the thickness in four places with the ratchet, the outline traced, every boundary square judged
 * by eye (here: exactly), the area recorded, V = A × t — and the experiment's own claims put to it: the finer paper is the
 * better one, a blunt or leaning pencil makes the area too big by the width of its line, boundary squares left unjudged cost half
 * a square each.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useLamina as S, CFG, SHAPES } from './engine/lamina.js';
import { widthOf } from '../../../../shared/measure/createMeasure.js';
import { paperFor, tally, polygonArea, countingError, penDelta, PAPER, SLIVER } from '../../../../shared/measure/lamina.js';

const ok = [];
const get = () => S.getState();
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const peek = () => get().peek();
const fresh = (instrument = 'sg50') => { get().reset(); get().clearLog(); get().setInstrument(instrument); };
const readIn = () => { const d = peek().disp; get().setMajor(d.psr); get().setMinor(d.csr); get().setNegative(d.negative); get().setLc(String(CFG.instruments[get().instrument].lc)); };
const takeZero = () => { get().setSpecimen('none'); get().closeJaws(); readIn(); get().recordZero(); };
const W = (id, place = 0) => widthOf(CFG.specimens[id].dims.thickness, place, 0);
const grip = (id, place = 0) => {
  get().setSpecimen(id); get().setDim('thickness'); get().setPlace(place);
  get().setOpening(W(id, place) + 0.3);
  let last = Infinity;
  for (let i = 0; i < 4000; i += 1) { const g = peek().rest.gap; if (g >= last - 1e-12 && i > 0) break; last = g; get().step(-1); }
};
const measure = (id, place) => { grip(id, place); readIn(); get().record(); return get().log.at(-1); };
const PLACES = [0, 1, 2, 3];
/** Lay the lamina, pick the pencil, trace, and return the paper. */
const trace = (id, { grid = 'g2', x = 0, y = 0, rot = 0, pencil = 'sharp', hold = 'upright' } = {}) => {
  get().setSpecimen(id); get().setGrid(grid); get().setLayX(x); get().setLayY(y); get().setLayRot(rot); get().setPencil(pencil); get().setHold(hold); get().trace();
  return paperFor(SHAPES[id], get().traced);
};
/** Judge every boundary square as an exact eye would: more than half inside, count it whole. */
const judgeExactly = (paper) => { get().setBrush('whole'); get().paint([...paper.cls.boundary].filter(([, f]) => f > 0.5).map(([k]) => k)); get().setBrush('ignore'); get().paint([...paper.cls.boundary].filter(([, f]) => f <= 0.5).map(([k]) => k)); };

/* ── 1 · The geometry ────────────────────────────────────────────────────────────────────── */
{
  const rows = [];
  for (const id of Object.keys(SHAPES)) {
    const sh = SHAPES[id];
    near(sh.areaMm2, { brass: 2840, aluminium: 2510, steel: 3120, card: 2290 }[id], 1e-6, `${id}: the outline has exactly its stated area`);
    for (const grid of ['g1', 'g2', 'g5']) {
      for (const [x, y, rot] of [[0, 0, 0], [3.5, -2, 30], [-7, 6.5, 75]]) {
        const { traced, cls } = trace(id, { grid, x, y, rot, pencil: 'blunt', hold: 'slanted' });
        const covered = cls.frac.reduce((a, b) => a + b, 0) * cls.g * cls.g;                     // the raw fractions, slivers and all
        near(covered, polygonArea(paperFor(SHAPES[id], get().traced).traced), 1e-3, `${id} ${grid}: the covered fractions of the squares add up to the area of the line`);
        const xs = traced.map((p) => p[0]); const ys = traced.map((p) => p[1]);
        assert.ok(Math.min(...xs, ...ys) > 0 && Math.max(...xs, ...ys) < PAPER, `${id}: the line stays on the sheet`);
      }
    }
    rows.push(`${id} ${(sh.areaMm2 / 100).toFixed(2)} cm², perimeter ${(sh.perimeterMm / 10).toFixed(1)} cm`);
  }
  /* The line a pencil draws is outside the lamina by its width and by the lean: ΔA ≈ P·δ + πδ². */
  const id = 'brass'; const sh = SHAPES[id];
  for (const [pencil, hold] of [['sharp', 'upright'], ['blunt', 'upright'], ['sharp', 'slanted'], ['blunt', 'slanted']]) {
    const { base, traced } = trace(id, { pencil, hold });
    const d = penDelta(pencil, hold, CFG.specimens[id].dims.thickness.mm);
    near(polygonArea(traced) - polygonArea(base), sh.perimeterMm * d + Math.PI * d * d, 0.01 * sh.perimeterMm * d, `${pencil}/${hold}: the line encloses the lamina's area plus its own width all round`);
  }
  ok.push(`each lamina has exactly its stated area (${rows.join('; ')}); the squares the line cuts are clipped exactly, so their covered fractions add up to the polygon's area on every grid and in every position; a pencil's line encloses the lamina plus P·δ + πδ²`);
}

/* ── 2 · The thickness, with the gauge ─────────────────────────────────────────────────────── */
{
  const out = [];
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    fresh(id); takeZero();
    const inst = CFG.instruments[id];
    const vals = PLACES.map((p) => measure('brass', p).corrected);
    vals.forEach((v, i) => near(v, W('brass', i), inst.lc / 2 + inst.backlash / 2 + 1e-9, `${id}: brass thickness at place ${i + 1}`));
    const m = vals.reduce((a, b) => a + b, 0) / 4;
    near(m, 1.62, 0.02, `mean thickness of the brass lamina with ${id} (the sheet: about 1.62 mm)`);
    out.push(`${id} ${m.toFixed(3)} mm`);
  }
  /* The card is soft: the thimble turned on squeezes it, the ratchet does not. */
  fresh('sg50'); takeZero();
  get().setRatchet('on'); grip('card'); for (let i = 0; i < 12; i += 1) get().step(-1); const soft = peek().rest.squeezed;
  get().setRatchet('off'); grip('card'); for (let i = 0; i < 12; i += 1) get().step(-1); const hard = peek().rest.squeezed;
  assert.ok(soft < 0.005 && hard > 0.05, `the soft card is squeezed ${soft.toFixed(4)} mm by the ratchet and ${hard.toFixed(3)} mm by the thimble`);
  ok.push(`the thickness of the brass lamina in four places with each gauge — ${out.join(', ')} (the sheet: about 1.62 mm); the soft card is squeezed ${hard.toFixed(2)} mm by the thimble and ${soft.toFixed(4)} mm by the ratchet`);
}

/* ── 3 · Counting squares: the finer paper is the better paper ─────────────────────────────── */
{
  const spread = {};
  const sigma = {};
  for (const grid of ['g1', 'g2', 'g5']) {
    const errs = []; let nb = 0;
    for (let k = 0; k < 24; k += 1) {
      const x = -6 + 12 * ((k * 0.381966) % 1); const y = -6 + 12 * ((k * 0.618034) % 1); const rot = (k * 37) % 90;
      get().reset(); const paper = trace('brass', { grid, x, y, rot }); judgeExactly(paper);
      const t = tally(paper.cls, get().marks);
      errs.push(t.areaMm2 - polygonArea(paper.traced)); nb += t.boundary;
      assert.equal(t.unjudged, 0); assert.equal(t.stray, 0);
    }
    const rms = Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length);
    const bias = errs.reduce((a, b) => a + b, 0) / errs.length;
    spread[grid] = rms; sigma[grid] = countingError(nb / 24, Number(grid.slice(1)));
    assert.ok(Math.abs(bias) < 3 * rms / Math.sqrt(errs.length) + 1e-9, `${grid}: counting with the more-than-half rule is unbiased (mean error ${bias.toFixed(2)} mm², rms ${rms.toFixed(2)})`);
    assert.ok(rms < 2 * sigma[grid] && rms > 0.4 * sigma[grid], `${grid}: the rms counting error ${rms.toFixed(2)} mm² is of the size ${sigma[grid].toFixed(2)} that the number of boundary squares predicts`);
  }
  assert.ok(spread.g5 > 2 * spread.g2 && spread.g2 > 1.5 * spread.g1, `the 5 mm paper is worse than the 2 mm, and the 2 mm than the 1 mm (${spread.g5.toFixed(1)}, ${spread.g2.toFixed(1)}, ${spread.g1.toFixed(1)} mm² rms)`);
  ok.push(`judging every boundary square exactly by the more-than-half rule, in 24 positions of the lamina on each paper, the area is unbiased and its rms error is ${spread.g1.toFixed(1)} mm² on 1 mm paper, ${spread.g2.toFixed(1)} on 2 mm and ${spread.g5.toFixed(1)} on 5 mm paper (predicted a²√(N/12): ${sigma.g1.toFixed(1)}, ${sigma.g2.toFixed(1)}, ${sigma.g5.toFixed(1)}) — the finer paper is the better`);
}

/* ── 4 · The pencil ──────────────────────────────────────────────────────────────────────── */
{
  const trueA = SHAPES.brass.areaMm2;
  const out = {};
  for (const [pencil, hold] of [['sharp', 'upright'], ['blunt', 'upright'], ['sharp', 'slanted'], ['blunt', 'slanted']]) {
    get().reset(); const paper = trace('brass', { grid: 'g1', x: 2, y: -1, rot: 20, pencil, hold }); judgeExactly(paper);
    const t = tally(paper.cls, get().marks);
    const d = penDelta(pencil, hold, 1.62);
    near(t.areaMm2 - trueA, SHAPES.brass.perimeterMm * d, 10, `${pencil}/${hold}: the counted area is too big by the width of the line all round`);
    out[`${pencil}/${hold}`] = ((t.areaMm2 - trueA) / trueA) * 100;
  }
  assert.ok(out['blunt/slanted'] > 8 && out['sharp/upright'] < 1.5, 'a blunt pencil held leaning out makes the area ten per cent too big; a sharp one upright, under one');
  ok.push(`the pencil: the counted area is too big by ${out['sharp/upright'].toFixed(1)} % with a sharp pencil upright, ${out['blunt/upright'].toFixed(1)} % blunt, ${out['sharp/slanted'].toFixed(1)} % leaning out, ${out['blunt/slanted'].toFixed(1)} % blunt and leaning — by P·δ in each case`);
}

/* ── 5 · The volume ─────────────────────────────────────────────────────────────────────── */
{
  fresh('sg50'); takeZero(); PLACES.forEach((p) => measure('brass', p));
  const paper = trace('brass', { grid: 'g2', x: 1.5, y: 2, rot: 15 }); judgeExactly(paper); get().recordArea();
  const a = get().log.at(-1);
  assert.equal(a.kind, 'area'); assert.equal(a.unjudged, 0);
  near(a.area, 28.4, 0.8, 'the area of the brass lamina (the sheet: about 28.4 cm²)');
  const V = get().analysis.summary.find((r) => r.label.startsWith('Volume'));
  near(V.value, 4.6, 0.3, 'the volume of the brass lamina (the sheet: 4.6 ± 0.3 cm³)');
  assert.ok(V.err > 0 && Math.abs(V.value - V.actual) < V.err + 0.1, `the error on V (${V.err.toFixed(3)} cm³) allows the true volume (${V.actual.toFixed(3)} cm³) to within the pencil's line`);
  const A = get().analysis.summary.find((r) => r.label.startsWith('Area')); const T = get().analysis.summary.find((r) => r.label.startsWith('Thickness'));
  near(V.err / V.value, A.err / A.value + T.err / T.value, 1e-9, 'the percentage error of V is that of A plus that of t');
  ok.push(`V = A × t: A = ${A.value.toFixed(2)} ± ${A.err.toFixed(2)} cm², t = ${T.value.toFixed(3)} ± ${T.err.toFixed(3)} mm, V = ${V.value.toFixed(2)} ± ${V.err.toFixed(2)} cm³ (the sheet: 4.6 ± 0.3; the true volume ${V.actual.toFixed(2)}); the percentage errors add`);
}

/* ── 6 · The mistakes ────────────────────────────────────────────────────────────────────── */
{
  /* Boundary squares left unjudged are left out: half a square each, on average. */
  get().reset(); get().clearLog(); let paper = trace('brass', { grid: 'g2' });
  get().recordArea(); let r = get().log.at(-1);
  near(polygonArea(paper.traced) - r.area * 100, [...paper.cls.boundary.values()].reduce((a, b) => a + b, 0) * 4, 4, 'unjudged boundary squares are left out of the count (to within the grazed squares, which are inside or outside to the eye)');
  assert.equal(r.unjudged, paper.cls.boundary.size); assert.match(r.note, /not judged/);
  /* All boundary squares counted whole overshoots by Σ(1 − f). */
  get().setBrush('whole'); get().paint([...paper.cls.boundary.keys()]); get().recordArea(); r = get().log.at(-1);
  const over = [...paper.cls.boundary.values()].reduce((a, f) => a + (1 - f), 0) * 4;
  near(r.area * 100 - polygonArea(paper.traced), over, 4, 'every boundary square counted whole overshoots by the part of each that is outside');
  /* Marks on squares the line does not cut: flagged, and they change the count. */
  get().clearMarks(); judgeExactly(paper);
  const outside = (() => { for (let j = 0; j < paper.cls.n; j += 1) if (paper.cls.frac[j * paper.cls.n] === 0) return `0,${j}`; return null; })();
  get().setBrush('whole'); get().paint([outside]); get().recordArea(); r = get().log.at(-1);
  assert.equal(r.stray, 1); assert.match(r.note, /does not cut/);
  /* An identity: the count's error is Σ (counted − covered) over every square of the sheet, cell by cell. */
  get().clearMarks(); get().setBrush('whole'); get().paint([...paper.cls.boundary.keys()].filter((_, i) => i % 3 === 0)); get().setBrush('ignore'); get().paint([...paper.cls.boundary.keys()].filter((_, i) => i % 3 === 1));
  const t = tally(paper.cls, get().marks);
  let sum = 0;
  for (let j = 0; j < paper.cls.n; j += 1) for (let i = 0; i < paper.cls.n; i += 1) {
    const f = paper.cls.frac[j * paper.cls.n + i];
    const counted = f >= 1 - SLIVER ? 1 : (get().marks[`${i},${j}`] === 'whole' ? 1 : 0);
    sum += counted - f;
  }
  near(t.areaMm2 - polygonArea(paper.traced), sum * 4, 1e-6, 'the error of a count is the sum over the squares of (counted − covered)');
  /* A lamina chosen again: the old trace is dropped; with nothing traced, no area can be recorded. */
  get().setSpecimen('steel'); assert.equal(get().traced, null); get().recordArea(); assert.equal(get().message.key, 'no-trace');
  /* Blunt and leaning: flagged in the notebook. */
  get().reset(); get().clearLog(); paper = trace('brass', { pencil: 'blunt', hold: 'slanted' }); judgeExactly(paper); get().recordArea(); r = get().log.at(-1);
  assert.match(r.note, /blunt pencil/); assert.match(r.note, /slanted/);
  ok.push('the mistakes cost what they should: unjudged boundary squares are left out (and flagged); all of them counted whole overshoots by the part of each outside the line; marks on squares the line does not cut change the count and are flagged; a count’s error is exactly Σ(counted − covered); a lamina chosen again drops the old trace; a blunt, leaning pencil is noted');
}

/* ── 7 · Reveal and determinism ───────────────────────────────────────────────────────────── */
{
  fresh('sg50'); takeZero(); get().reveal(); assert.equal(get().revealed, false, 'not before three readings');
  PLACES.slice(0, 3).forEach((p) => measure('aluminium', p)); get().reveal(); assert.equal(get().revealed, true);
  const run = () => { fresh('sg100'); takeZero(); measure('steel', 0); measure('steel', 2); get().reset(); const p = trace('steel', { grid: 'g5', x: 1, y: 1, rot: 45 }); judgeExactly(p); get().recordArea(); return JSON.stringify(get().log.map(({ id, ...r }) => r)); };
  assert.equal(run(), run(), 'the same actions give the same notebook');
  ok.push('the actual values are shown only after three readings; the same actions give the same notebook, to the last digit');
}

console.log('\nXI-PHY-A03 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
