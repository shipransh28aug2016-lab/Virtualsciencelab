/**
 * verify.mjs — XI-PHY-A01, vernier callipers.
 *
 * A student robot does what the procedure says — least count, zero error, grip, read, correct, repeat in other places
 * and directions — and the numbers it gets are compared with the specimens' true dimensions; then the robot is made to
 * make each of the mistakes the sheet lists, and each has to cost what it should.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useVernier as S, CFG } from './engine/vernier.js';
import { viewOf, widthOf } from '../../../../shared/measure/createMeasure.js';

const ok = [];
const get = () => S.getState();
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);

const fresh = (instrument = 'vc10') => { get().reset(); get().clearLog(); get().setInstrument(instrument); };
const peek = () => get().peek();
/** Read the scales as a careful person would, and enter what was read. */
const readIn = (lc = true) => { const d = peek().disp; get().setMajor(d.msr); get().setMinor(d.vsr); get().setNegative(d.negative); if (lc) get().setLc(String(CFG.instruments[get().instrument].lc)); };
/** The zero error, as a student takes it. */
const takeZero = () => { get().setSpecimen('none'); get().closeJaws(); readIn(); get().recordZero(); };
/** Grip a specimen: open the jaws wide, then close them a least count at a time until the reading stops falling. */
const grip = (specimen, dim, place = 0, angle = 0) => {
  get().setSpecimen(specimen); get().setDim(dim); get().setPlace(place); get().setAngle(angle);
  const inner = CFG.specimens[specimen].dims[dim].type === 'inner';
  if (inner) {
    /* Inside a hole the jaws go in closed and are opened until they stop against the walls: first quickly, then a least count at a time until the gap stops growing. */
    get().setOpening(0); for (let i = 0; i < 4000 && peek().rest.loose; i += 1) get().step(+5);
    let up = -Infinity;
    for (let i = 0; i < 4000; i += 1) { const g = peek().rest.gap; if (g <= up + 1e-12) break; up = g; get().step(+1); }
    return;
  }
  get().setOpening(Math.min(80, widthOf(CFG.specimens[specimen].dims[dim], place, angle) + 4));
  let last = Infinity;
  for (let i = 0; i < 4000; i += 1) { const g = peek().rest.gap; if (g >= last - 1e-12 && i > 0) break; last = g; get().step(-1); }
};
const measure = (specimen, dim, place, angle) => { grip(specimen, dim, place, angle); readIn(); get().record(); return get().log.at(-1); };

/* ── 1 · Three callipers, three zero errors ──────────────────────────────────────────────── */
{
  const rows = [];
  for (const id of ['vc10', 'vc20', 'vc50']) {
    fresh(id); takeZero();
    const inst = CFG.instruments[id]; const z = get().zero;
    /* What the scales say with the jaws closed — closed, so the slide is on its closing side and the backlash is in the number. */
    near(z.e, Math.round((inst.zeroDiv * inst.lc - inst.backlash / 2) / inst.lc) * inst.lc, 1e-9, `${id}: the zero error as read`);
    near(z.e, inst.zeroDiv * inst.lc, inst.lc + 1e-9, `${id}: and it is within a division of the instrument's own zero error`);
    assert.ok(!get().log.at(-1).misread);
    rows.push(`${id}: ${z.e >= 0 ? '+' : '−'}${Math.abs(z.e).toFixed(3)} mm`);
  }
  ok.push(`each calliper's zero error is found with the jaws closed and read off the scales — ${rows.join(', ')} (one of them negative, read from the other end of the vernier)`);
}

/* ── 2 · A careful measurement of each specimen ─────────────────────────────────────────── */
{
  const stats = {};
  for (const id of ['vc10', 'vc20', 'vc50']) {
    fresh(id); takeZero();
    const lc = CFG.instruments[id].lc;
    for (const [specimen, dim] of [['sphere', 'diameter'], ['cylinder', 'diameter'], ['cylinder', 'length'], ['beaker', 'internal'], ['beaker', 'depth']]) {
      const vals = [];
      for (const [p, a] of [[0, 0], [1, 45], [2, 90], [3, 135]]) vals.push(measure(specimen, dim, p, a).corrected);
      const truths = [[0, 0], [1, 45], [2, 90], [3, 135]].map(([p, a]) => widthOf(CFG.specimens[specimen].dims[dim], p, a));
      /* Each reading is within half a least count (rounding to a line) and half the backlash (which side the slide came from) of the width at that place and angle: that is all a vernier can promise. */
      /* Inside a hole the slide is opened, not closed: it is on the other side of its backlash from where the zero error was taken, and the whole backlash is in the number. */
      const tol = lc / 2 + CFG.instruments[id].backlash / (CFG.specimens[specimen].dims[dim].type === 'inner' ? 1 : 2) + 1e-9;
      vals.forEach((v, i) => near(v, truths[i], tol, `${id} ${specimen} ${dim} #${i + 1}`));
      stats[`${id}/${specimen}/${dim}`] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    assert.equal(get().analysis.notes.misread, 0); assert.equal(get().analysis.notes.loose, 0); assert.equal(get().analysis.notes.noZero, 0);
  }
  near(stats['vc10/sphere/diameter'], 21.4, 0.1, 'mean diameter of the sphere with the 10-division callipers (the sheet: about 2.14 cm)');
  fresh('vc10'); takeZero(); for (const [p, a] of [[0, 0], [1, 45], [2, 90], [3, 135]]) measure('sphere', 'diameter', p, a);
  const V = get().analysis.summary.find((r) => r.label.includes('sphere'));
  near(V.value, 5.13, 0.1, 'volume of the sphere (the sheet: about 5.13 cm³)'); assert.ok(V.err > 0 && Math.abs(V.value - V.actual) < 3 * V.err + 0.03, 'and its error allows the actual volume');
  ok.push(`measured in four places and four directions with each of the three callipers, every reading is within half a least count plus half the backlash of the width at that place and angle, and the 10-division mean for the sphere is ${stats['vc10/sphere/diameter'].toFixed(3)} mm (V = ${V.value.toFixed(2)} ± ${V.err.toFixed(2)} cm³; the actual ${V.actual.toFixed(2)})`);
}

/* ── 3 · The specimens are not perfect ───────────────────────────────────────────────────────── */
{
  const sph = CFG.specimens.sphere.dims.diameter;
  const ws = [[0, 0], [1, 45], [2, 90], [3, 135], [0, 90], [2, 0]].map(([p, a]) => widthOf(sph, p, a));
  assert.ok(Math.max(...ws) - Math.min(...ws) > 0.03 && Math.max(...ws) - Math.min(...ws) < 0.12, `the sphere differs by ${(Math.max(...ws) - Math.min(...ws)).toFixed(3)} mm from place to place and direction to direction`);
  ok.push(`the sphere's diameter varies by ${(Math.max(...ws) - Math.min(...ws)).toFixed(3)} mm over the places and directions: a single reading is not "the diameter"`);
}

/* ── 4 · The mistakes ────────────────────────────────────────────────────────────────────── */
{
  /* The zero error not taken (or taken, and not subtracted). */
  fresh('vc10'); grip('sphere', 'diameter'); readIn(); get().record();
  const r = get().log.at(-1); near(r.corrected - widthOf(CFG.specimens.sphere.dims.diameter, 0, 0), CFG.instruments.vc10.zeroDiv * 0.1, 0.06, 'no zero correction: every reading is off by the zero error'); assert.match(r.note, /zero error not taken/);
  /* Loose. */
  fresh('vc10'); takeZero(); get().setSpecimen('sphere'); get().setOpening(21.4 + 3); readIn(); get().record();
  assert.ok(get().log.at(-1).loose && get().log.at(-1).corrected > 24, 'a loose specimen: the reading is the jaws\', not the sphere\'s'); assert.equal(get().analysis.notes.loose, 1);
  /* A wrong least count. */
  fresh('vc10'); takeZero(); grip('sphere', 'diameter'); get().setLc('0.05'); readIn(false); get().setLc('0.05'); get().record();
  assert.ok(get().log.at(-1).lcWrong && Math.abs(get().log.at(-1).corrected - 21.4) > 0.25, 'the wrong least count: the number is wrong, and flagged');
  /* A misread: one division out. */
  fresh('vc10'); takeZero(); grip('sphere', 'diameter'); readIn(); get().setMinor((peek().disp.vsr + 1) % 10); get().record();
  assert.ok(get().log.at(-1).misread && get().message.key === 'misread', 'one division out is flagged as a misread');
  /* Parallax: the eye off to one side changes which line seems to coincide, by at most one division. */
  fresh('vc10'); let diff = 0; let max = 0;
  for (let g = 10; g < 12; g += 0.013) { get().setSpecimen('none'); get().setOpening(g); get().setEye('centre'); const a = peek().disp; get().setEye('left'); const b = peek().disp; const d = Math.abs(a.observed - b.observed); if (d > 1e-9) diff += 1; max = Math.max(max, d); }
  assert.ok(diff > 20 && max <= 0.1 + 1e-9, `with the eye to one side the reading changes in ${diff} of 154 positions, by at most one division (${max.toFixed(2)} mm)`);
  /* Backlash: the same opening, reached from below and from above, reads differently by the backlash; the same side gives the same reading. */
  fresh('vc10'); get().setSpecimen('none'); get().setOpening(15); const up1 = peek().disp.pos;
  get().step(+1); get().step(-1); const down = peek().disp.pos;
  get().step(-1); get().step(+1); const up2 = peek().disp.pos;
  near(up2, up1, 1e-9, 'approaching from the same side gives the same scale position'); near(up1 - down, CFG.instruments.vc10.backlash, 1e-9, 'reversing costs the backlash');
  ok.push('the mistakes cost what they should: no zero correction shifts every reading by the zero error (and is noted); a loose specimen reads the jaws; a wrong least count is wrong and flagged; one division misread is flagged; the eye off to one side moves the reading by up to a division; reversing the slide costs the backlash');
}

/* ── 5 · The tools: reveal, results, determinism ───────────────────────────────────────────── */
{
  fresh('vc10'); takeZero(); get().reveal(); assert.equal(get().revealed, false, 'not before three readings');
  for (const [p, a] of [[0, 0], [1, 45], [2, 90]]) measure('beaker', 'internal', p, a); get().reveal(); assert.equal(get().revealed, true);
  const run = () => { fresh('vc50'); takeZero(); for (const [p, a] of [[0, 0], [2, 90]]) measure('cylinder', 'length', p, a); return JSON.stringify(get().log.map(({ id, ...r }) => r)); };
  assert.equal(run(), run(), 'the same actions give the same notebook');
  ok.push('the actual values are shown only after three readings; the same actions give the same notebook, to the last digit');
}

void viewOf;
console.log('\nXI-PHY-A01 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
