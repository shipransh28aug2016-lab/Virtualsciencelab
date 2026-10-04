/**
 * verify.mjs — XI-PHY-A02, the screw gauge.
 *
 * A student robot does what the procedure says — ten turns for the pitch, the divisions, the least count, the zero error with
 * the faces together, the specimen gripped by the ratchet, read, corrected, repeated in other places and directions —
 * and what it gets is compared with the specimens' true dimensions; then it is made to make each of the mistakes the sheet
 * lists, and each has to cost what it should.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useScrew as S, CFG } from './engine/screw.js';
import { widthOf } from '../../../../shared/measure/createMeasure.js';

const ok = [];
const get = () => S.getState();
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const fresh = (instrument = 'sg50') => { get().reset(); get().clearLog(); get().setInstrument(instrument); };
const peek = () => get().peek();
const readIn = (lc = true) => { const d = peek().disp; get().setMajor(d.psr); get().setMinor(d.csr); get().setNegative(d.negative); if (lc) get().setLc(String(CFG.instruments[get().instrument].lc)); };
const takeZero = () => { get().setSpecimen('none'); get().closeJaws(); readIn(); get().recordZero(); };
const W = (specimen, dim, place = 0, angle = 0) => widthOf(CFG.specimens[specimen].dims[dim], place, angle);
/** Open a little wide of the specimen, then close a least count at a time until the reading stops falling. */
const grip = (specimen, dim, place = 0, angle = 0, { push = 0 } = {}) => {
  get().setSpecimen(specimen); get().setDim(dim); get().setPlace(place); get().setAngle(angle);
  get().setOpening(W(specimen, dim, place, angle) + 0.3);
  let last = Infinity;
  for (let i = 0; i < 4000; i += 1) { const g = peek().rest.gap; if (g >= last - 1e-12 && i > 0) break; last = g; get().step(-1); }
  for (let i = 0; i < push; i += 1) get().step(-1);                        // turning on regardless
};
const measure = (specimen, dim, place, angle, o) => { grip(specimen, dim, place, angle, o); readIn(); get().record(); return get().log.at(-1); };
const PLACES = [[0, 0], [1, 45], [2, 90], [3, 135]];

/* ── 1 · The pitch, from ten turns ──────────────────────────────────────────────────────────── */
{
  const rows = [];
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    fresh(id); get().setSpecimen('none'); get().closeJaws();
    const before = peek().disp.observed; get().turn(10); const after = peek().disp.observed;      // whole turns: the same division is at the datum, so the sleeve has moved ten pitches
    const inst = CFG.instruments[id];
    near((after - before) / 10, inst.pitch, 0.01, `${id}: ten turns advance the screw ten pitches`);
    get().setPitch(String(inst.pitch)); get().setN(String(inst.n));
    near(Number(get().pitchEntry) / Number(get().nEntry), inst.lc, 1e-12, `${id}: pitch ÷ divisions is the least count`);
    get().turn(-10); near(peek().rest.gap, 0, 1e-9, 'ten turns back close it again');
    rows.push(`${id}: ${(after - before).toFixed(1)} mm in ten turns → pitch ${inst.pitch} mm, ${inst.n} divisions → L.C. ${inst.lc} mm`);
  }
  ok.push(`the pitch is found by turning the thimble through ten whole turns and watching the sleeve — ${rows.join('; ')}`);
}

/* ── 2 · Three gauges, three zero errors ─────────────────────────────────────────────────────── */
{
  const rows = [];
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    fresh(id); takeZero();
    const inst = CFG.instruments[id]; const z = get().zero;
    /* What the scales say with the faces together — turned shut, so the screw is on its closing side and the backlash is in the number. */
    near(z.e, Math.round((inst.zeroDiv * inst.lc - inst.backlash / 2) / inst.lc) * inst.lc, 1e-9, `${id}: the zero error as read`);
    near(z.e, inst.zeroDiv * inst.lc, inst.lc + inst.backlash / 2 + 1e-9, `${id}: and it is within a division and half the backlash of the instrument's own zero error`);
    assert.ok(!get().log.at(-1).misread);
    rows.push(`${id}: ${z.e >= 0 ? '+' : '−'}${Math.abs(z.e).toFixed(3)} mm`);
  }
  ok.push(`each gauge's zero error is read with the faces together — ${rows.join(', ')} (one negative: the thimble zero above the datum, read as −(N − H.S.R.) divisions)`);
}

/* ── 3 · A careful measurement of each specimen, with each gauge ────────────────────────────── */
{
  const stats = {};
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    fresh(id); takeZero();
    const inst = CFG.instruments[id];
    for (const [specimen, dim] of [['wire', 'diameter'], ['thickWire', 'diameter'], ['sheet', 'thickness'], ['paper', 'thickness']]) {
      const vals = PLACES.map(([p, a]) => measure(specimen, dim, p, a).corrected);
      /* Each reading is within half a least count (rounding to a division) and half the backlash of the width at that place and angle; a soft specimen is squeezed a hair by the ratchet. */
      const soft = CFG.specimens[specimen].dims[dim].compliance * 0.03 * W(specimen, dim) + 1e-9;
      vals.forEach((v, i) => near(v, W(specimen, dim, ...PLACES[i]), inst.lc / 2 + inst.backlash / 2 + soft, `${id} ${specimen} ${dim} #${i + 1}`));
      stats[`${id}/${specimen}`] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    assert.equal(get().analysis.notes.misread, 0); assert.equal(get().analysis.notes.loose, 0); assert.equal(get().analysis.notes.noZero, 0);
  }
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    near(stats[`${id}/wire`], 0.412, 0.015, `mean diameter of the wire with ${id} (the sheet: about 0.412 mm)`);
    near(Math.PI * stats[`${id}/wire`] ** 2 / 4, 0.1333, 0.01, `area of cross-section with ${id} (the sheet: about 0.133 mm²)`);
  }
  fresh('sg50'); takeZero(); PLACES.forEach(([p, a]) => measure('wire', 'diameter', p, a));
  const A = get().analysis.summary.find((r) => r.label.includes('copper'));
  assert.ok(A.err > 0 && Math.abs(A.value - A.actual) < 3 * A.err, 'and the error quoted allows the actual area');
  ok.push(`wire, iron wire, sheet and paper in four places and four directions with each gauge: every reading within half a least count plus half the backlash of the width there; the 0.5 mm / 50 gauge gives d = ${stats['sg50/wire'].toFixed(3)} mm and A = ${A.value.toFixed(4)} ± ${A.err.toFixed(4)} mm² (the sheet: 0.412 mm, 0.133 mm²)`);
}

/* ── 4 · The mistakes ────────────────────────────────────────────────────────────────────── */
{
  /* The zero error not taken. */
  fresh('sg50'); grip('wire', 'diameter'); readIn(); get().record();
  let r = get().log.at(-1); near(r.corrected - W('wire', 'diameter'), CFG.instruments.sg50.zeroDiv * 0.01, 0.011, 'no zero correction: every reading is off by the zero error'); assert.match(r.note, /zero error not taken/);
  /* A wrong least count. */
  fresh('sg50'); takeZero(); grip('wire', 'diameter'); get().setLc('0.005'); readIn(false); get().setLc('0.005'); get().record();
  assert.ok(get().log.at(-1).lcWrong && Math.abs(get().log.at(-1).corrected - 0.412) > 0.1, 'the wrong least count: the number is wrong, and flagged');
  /* A misread: one division out. */
  fresh('sg50'); takeZero(); grip('wire', 'diameter'); readIn(); get().setMinor((peek().disp.csr + 1) % 50); get().record();
  assert.ok(get().log.at(-1).misread && get().message.key === 'misread', 'one division out is flagged as a misread');
  /* Turning the thimble, not the ratchet, on soft paper. */
  fresh('sg50'); takeZero();
  get().setRatchet('on'); const withRatchet = measure('paper', 'thickness', 0, 0, { push: 12 });
  get().setRatchet('off'); const bare = measure('paper', 'thickness', 0, 0, { push: 12 });
  assert.ok(withRatchet.squeezed < 0.002, `with the ratchet the paper is squeezed by ${withRatchet.squeezed} mm: nothing`);
  assert.ok(bare.squeezed > 0.012 && bare.corrected < withRatchet.corrected - 0.009, `with the thimble turned on the paper is squeezed by ${bare.squeezed.toFixed(3)} mm: the reading is ${bare.corrected} against ${withRatchet.corrected}`);
  assert.match(bare.note, /squeezed/); assert.equal(get().analysis.notes.squeezed, 1);
  const msg = (() => { get().setSpecimen('paper'); get().setOpening(0.0); get().step(0); return null; })(); void msg;
  /* A hard wire is not squeezed whichever way it is turned. */
  fresh('sg50'); takeZero(); get().setRatchet('off');
  const wire = measure('wire', 'diameter', 0, 0, { push: 12 });
  near(wire.corrected, W('wire', 'diameter'), 0.0105, 'a hard wire reads the same whichever way it is turned on'); assert.equal(wire.squeezed, 0);
  /* Parallax: the eye off to one side changes which circular division is at the datum, by at most one. */
  fresh('sg50'); let diff = 0; let max = 0;
  for (let g = 1; g < 2; g += 0.0137) { get().setSpecimen('none'); get().setOpening(g); get().setEye('centre'); const a = peek().disp; get().setEye('left'); const b = peek().disp; const d = Math.abs(a.observed - b.observed); if (d > 1e-9) diff += 1; max = Math.max(max, d); }
  assert.ok(diff > 20 && max <= 0.01 + 1e-9, `with the eye to one side the reading changes in ${diff} of 73 positions, by at most one division (${max.toFixed(3)} mm)`);
  /* Backlash: the same opening reached from below and from above differs by the backlash; the old gauge has a lot. */
  const lashes = [];
  for (const id of ['sg50', 'sg100', 'sg50f']) {
    fresh(id); get().setSpecimen('none'); get().setOpening(5); const up = peek().disp.pos; get().step(+1); get().step(-1); const down = peek().disp.pos;
    near(up - down, CFG.instruments[id].backlash, 1e-9, `${id}: reversing costs the backlash`); lashes.push(`${id} ${(up - down).toFixed(3)} mm`);
  }
  ok.push(`the mistakes cost what they should: no zero correction shifts every reading by the zero error; a wrong least count is wrong and flagged; one division misread is flagged; on paper the ratchet squeezes ${withRatchet.squeezed.toFixed(4)} mm and the thimble turned on ${bare.squeezed.toFixed(3)} mm (reading ${bare.corrected} against ${withRatchet.corrected} mm); a hard wire is unaffected; the eye off to one side moves the reading by up to a division; reversing the screw costs the backlash (${lashes.join(', ')})`);
}

/* ── 5 · The tools: reveal, results, determinism ───────────────────────────────────────────── */
{
  fresh('sg50'); takeZero(); get().reveal(); assert.equal(get().revealed, false, 'not before three readings');
  for (const [p, a] of PLACES.slice(0, 3)) measure('sheet', 'thickness', p, a); get().reveal(); assert.equal(get().revealed, true);
  const run = () => { fresh('sg100'); takeZero(); for (const [p, a] of [[0, 0], [2, 90]]) measure('thickWire', 'diameter', p, a); return JSON.stringify(get().log.map(({ id, ...r }) => r)); };
  assert.equal(run(), run(), 'the same actions give the same notebook');
  ok.push('the actual values are shown only after three readings; the same actions give the same notebook, to the last digit');
}

console.log('\nXI-PHY-A02 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
