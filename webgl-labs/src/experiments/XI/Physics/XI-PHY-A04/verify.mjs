/**
 * verify.mjs — XI-PHY-A04, the spherometer.
 *
 * The physics first (contact reading = Z0 ∓ h, and R = l²/6h + h/2 is exact), then a student robot: the pitch and the least
 * count, the legs on paper and a ruler, the reading on plane glass, the readings on the surface — each found by lowering the screw
 * a division at a time and pressing until the instrument rocks — and R; then each mistake the sheet lists.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useSpherometer as S, CFG } from './engine/spherometer.js';
import { SURFACES, BODIES, contactReading, legMean, legSides, sagitta, radiusFrom, rulerPositions } from '../../../../shared/measure/spherometer.js';
import { SPHEROMETERS } from '../../../../shared/measure/instruments.js';

const ok = [];
const get = () => S.getState();
const peek = () => get().peek();
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const fresh = (instrument = 'sp100') => { get().reset(); get().clearLog(); get().setInstrument(instrument); };
const readIn = (lc = true) => { const v = peek(); get().setMajor(v.disp.turns * v.sp.pitch); get().setMinor(v.disp.disc); if (lc) get().setLc(String(v.sp.lc)); };
/** Raise the screw clear, then lower it ten divisions at a time until the instrument rocks, back off ten, and come on a division at a time until it rocks. */
const toContact = () => {
  get().retract();
  for (let i = 0; i < 2000 && peek().state !== 'rocks'; i += 1) get().step(+10);
  get().step(-10);
  for (let i = 0; i < 2000 && peek().state !== 'rocks'; i += 1) get().step(+1);
};
const reference = () => { get().setSurface('plane'); toContact(); readIn(); get().recordReference(); return get().log.at(-1); };
const reading = (surface) => { get().setSurface(surface); toContact(); readIn(); get().record(); return get().log.at(-1); };
const measureLegs = (pairs = ['ab', 'bc', 'ca']) => {
  get().impress();
  for (const p of pairs) { const t = rulerPositions(get().instrument, p); get().setPair(p); get().setRulerA(Math.round(t.a * 2) / 2); get().setRulerB(Math.round(t.b * 2) / 2); get().recordLeg(); }
};

/* ── 1 · The physics ──────────────────────────────────────────────────────────────────────── */
{
  const rows = [];
  for (const id of ['sp100', 'sp50', 'spWide']) {
    const l = legMean(id); const r = l / Math.sqrt(3);
    for (const sid of ['watchConvex', 'watchConcave', 'lensConvex', 'flatish']) {
      const surf = SURFACES[sid]; const h = sagitta(surf, r);
      near(contactReading(id, surf), BODIES[id].Z0 - surf.sign * h, 1e-12, `${id} on ${sid}: contact is at Z0 ∓ h`);
      const { R } = radiusFrom(l, h);
      /* l²/6h + h/2 is the exact radius of the sphere through three legs on a circle of radius l/√3, apart from the surface's own trace of non-sphericity. */
      near(R, surf.R, surf.R * (surf.aspheric * Math.abs(r / (40 / Math.sqrt(3)) - 1) + 1e-9) + 1e-9, `${id} on ${sid}: R = l²/6h + h/2 returns the radius`);
    }
  }
  const h40 = sagitta(SURFACES.watchConvex, 40 / Math.sqrt(3));
  near(h40, 1.19, 0.01, 'the convex watch glass, legs 40 mm apart: sagitta about 1.19 mm (the sheet)');
  near(radiusFrom(40, h40).R, 225, 0.01, 'and the radius 22.5 cm');
  near(radiusFrom(40, h40).correction / radiusFrom(40, h40).R, 0.0026, 0.0003, 'the h/2 term is a quarter of one per cent');
  for (const id of Object.keys(BODIES)) near(legSides(id).reduce((a, b) => a + b, 0) / 3, legMean(id), 1e-12, 'the mean of the three sides is the l the physics uses');
  rows.push(`R = l²/6h + h/2 returns each surface's radius from its sagitta (exactly, apart from a trace of non-sphericity); the convex watch glass with legs 40 mm apart has h = ${h40.toFixed(3)} mm and R = 22.5 cm, the h/2 term 0.26 %`);
  ok.push(rows[0]);
}

/* ── 2 · Pitch, least count, the picture of the scale ─────────────────────────────────────── */
{
  const out = [];
  for (const id of ['sp100', 'sp50', 'spWide']) {
    fresh(id); get().retract();
    const before = peek().disp.reading; get().turn(10); const after = peek().disp.reading;
    near((after - before) / 10, SPHEROMETERS[id].pitch, 0.011, `${id}: ten turns move the disc ten pitches`);
    near(SPHEROMETERS[id].pitch / SPHEROMETERS[id].n, SPHEROMETERS[id].lc, 1e-12, `${id}: pitch ÷ divisions is the least count`);
    out.push(`${id} ${(after - before).toFixed(1)} mm in ten turns`);
  }
  ok.push(`the pitch is found by ten whole turns of the screw — ${out.join(', ')}; the least count is pitch ÷ divisions`);
}

/* ── 3 · Contact, and the rocking ─────────────────────────────────────────────────────────── */
{
  fresh('sp100'); get().setSurface('watchConvex');
  const c = peek().c;
  get().setScrew(c - 0.5); get().press(); assert.equal(get().message.key, 'firm'); assert.equal(peek().state, 'firm');
  get().setScrew(c - 0.01); assert.equal(peek().state, 'firm', 'a hundredth short of contact it still stands on its legs');
  get().setScrew(c + 0.01); get().press(); assert.equal(get().message.key, 'rocks'); assert.equal(peek().state, 'rocks', 'a hundredth beyond contact it rocks');
  get().setScrew(c + 0.3); get().press(); near(peek().lift, 0.3, 1e-9, 'pushed on, the tip holds the legs up by what has been turned'); assert.match(get().message.detail, /turn back/);
  /* The screw cannot be turned a hundredth at a time into contact and out of it with a neat, unique answer: the first reading that rocks is within a division. */
  get().retract(); let n = 0; while (peek().state !== 'rocks') { get().step(+1); n += 1; }
  const past = get().y - c;
  assert.ok(past < 0.01 + 1e-9 && past > 0, `lowering a division at a time, the first reading that rocks is ${(past * 1000).toFixed(1)} µm past contact: within one division`);
  ok.push(`a press says "firm" until the tip touches and "rocks" after; lowering a division at a time the first position that rocks is within one least count of contact (here ${(past * 1000).toFixed(1)} µm past it); pushed on, the tip holds the legs up by exactly what was turned`);
}

/* ── 4 · The experiment, with each instrument ─────────────────────────────────────────────── */
{
  const out = [];
  for (const id of ['sp100', 'sp50', 'spWide']) {
    fresh(id); measureLegs();
    for (let i = 0; i < 3; i += 1) reference();
    for (let i = 0; i < 4; i += 1) reading('watchConvex');
    const sum = get().analysis.summary;
    const h = sum.find((r) => r.label.startsWith('Sagitta')); const R = sum.find((r) => r.label.startsWith('Radius')); const L = sum.find((r) => r.label.startsWith('Distance'));
    near(L.value, legMean(id), 0.5, `${id}: l from the ruler`);
    near(h.value, h.actual, 0.012, `${id}: the sagitta, from reading contact on plane glass and on the surface`);
    near(R.value, 22.5, 1.5, `${id}: R of the convex watch glass (the sheet: 22.5 ± 1.5 cm)`);
    assert.ok(R.err > 0 && Math.abs(R.value - R.actual) < R.err * 1.5, `${id}: the error quoted (${R.err.toFixed(2)} cm) allows the true radius (${R.actual.toFixed(2)})`);
    assert.match(R.label, /convex/);
    out.push(`${id}: l = ${L.value.toFixed(1)}, h = ${h.value.toFixed(3)} mm, R = ${R.value.toFixed(1)} ± ${R.err.toFixed(1)} cm`);
  }
  /* A concave surface sends the screw the other way. */
  fresh('sp100'); measureLegs(); reference(); reference(); reading('watchConcave'); reading('watchConcave'); reading('watchConcave');
  const rc = get().analysis.summary.find((r) => r.label.startsWith('Radius'));
  assert.match(rc.label, /concave/); near(rc.value, 28.0, 1.5, 'R of the concave watch glass (28 cm)');
  assert.ok(get().log.filter((r) => r.kind === 'contact').every((r) => r.observed > get().analysis.ref), 'on the concave glass the screw had to go further down than on plane glass');
  /* Wider legs, larger sagitta, as l². */
  const hs = ['sp100', 'spWide'].map((id) => sagitta(SURFACES.watchConvex, legMean(id) / Math.sqrt(3)));
  near(hs[1] / hs[0], (legMean('spWide') / legMean('sp100')) ** 2, 0.02, 'wider legs give a larger sagitta, as l²');
  ok.push(`measured through the interface of each spherometer — ${out.join('; ')} (the sheet: 22.5 ± 1.5 cm); the concave watch glass sends the screw the other way: R = ${rc.value.toFixed(1)} cm; the sagitta grows as l² with wider legs`);
}

/* ── 5 · The mistakes ───────────────────────────────────────────────────────────────────── */
{
  /* Backlash: both readings from above cancel it; the reference from above and the surface from below do not. */
  fresh('sp50'); measureLegs();
  reference(); reference();
  get().setSurface('watchConvex'); get().setScrew(peek().c + 1.0); get().step(-1000); /* from below: the screw coming up */
  for (let i = 0; i < 2000 && peek().state === 'rocks'; i += 1) get().step(-1);
  get().step(+1);                                        // the last position that rocked, reached from below
  assert.equal(get().side, 1);
  const fromAbove = (() => { toContact(); return peek().disp.reading; })();
  get().retract(); get().setScrew(peek().c + 0.5);
  for (let i = 0; i < 2000 && peek().state === 'rocks'; i += 1) get().step(-1);
  get().step(+1); const sameWay = peek().disp.reading;
  near(sameWay, fromAbove, 1e-9, 'approaching contact the same way gives the same reading');
  get().retract(); get().setScrew(peek().c + 0.5); for (let i = 0; i < 2000 && peek().state === 'rocks'; i += 1) get().step(-1);
  const fromBelow = peek().disp.reading;                                 // the screw has just been turned up: the other side of its backlash
  near(Math.abs(fromAbove - fromBelow), 0.01 + SPHEROMETERS.sp50.backlash, 0.0101, 'reversing the screw costs the backlash (and the division the contact is judged to)');
  /* The tip not touching, and pushed past contact. */
  fresh('sp100'); measureLegs(); reference(); reference();
  get().setSurface('watchConvex'); get().retract(); get().setScrew(peek().c - 0.1); readIn(); get().record(); let r = get().log.at(-1);
  assert.ok(r.clear > 0.03 && /clear of the surface/.test(r.note), 'a reading taken with the tip in the air is flagged');
  const hClear = Math.abs(r.observed - get().analysis.ref);
  get().setScrew(peek().c + 0.1); readIn(); get().record(); r = get().log.at(-1);
  assert.ok(r.lift > 0.03 && /pushed past contact/.test(r.note), 'a reading taken with the screw pushed past contact is flagged');
  const hPushed = Math.abs(r.observed - get().analysis.ref);
  const hTrue = Math.abs(contactReading('sp100', SURFACES.watchConvex) - BODIES.sp100.Z0);
  near(hClear - hTrue, 0.1, 0.012, 'the tip in the air by 0.1 mm makes h too big by 0.1 mm'); near(hTrue - hPushed, 0.1, 0.012, 'pushed past by 0.1 mm makes h too small by 0.1 mm');
  /* Wrong least count, misread. */
  get().setLc('0.1'); toContact(); readIn(false); get().setLc('0.1'); get().record(); assert.ok(get().log.at(-1).lcWrong);
  get().setLc(''); toContact(); readIn(); get().setMinor((peek().disp.disc + 1) % 100); get().record(); assert.ok(get().log.at(-1).misread && get().message.key === 'misread');
  /* The leg separation: R depends on l², so a millimetre out in l is two and a half per cent × 2. */
  const h = hTrue; const R0 = radiusFrom(legMean('sp100'), h).R; const R1 = radiusFrom(legMean('sp100') + 1, h).R;
  near((R1 - R0) / R0, 2 / legMean('sp100'), 0.005, 'a millimetre out in l is five per cent out in R: l is squared');
  /* The ruler misread. */
  get().impress(); get().setPair('ab'); const t = rulerPositions('sp100', 'ab'); get().setRulerA(t.a + 2); get().setRulerB(t.b); get().recordLeg();
  assert.ok(get().log.at(-1).misread && get().message.key === 'leg-misread');
  /* A nearly plane surface: h of a few least counts, R poorly known. */
  const hf = sagitta(SURFACES.flatish, legMean('sp100') / Math.sqrt(3));
  const spread = (0.01 / hf) * 100;
  assert.ok(hf < 0.1 && spread > 10, `the nearly plane glass has h = ${hf.toFixed(3)} mm: a division in contact is ${spread.toFixed(0)} % of it, and R is that uncertain`);
  /* Not on plane glass: no reference. */
  fresh('sp100'); get().setSurface('watchConvex'); get().recordReference(); assert.equal(get().message.key, 'not-plane'); get().setSurface('plane'); get().record(); assert.equal(get().message.key, 'is-plane');
  ok.push(`the mistakes cost what they should: approaching contact the same way twice gives the same reading, from the other side it costs the backlash; a tip in the air by 0.1 mm makes h 0.1 mm too big, pushed past by 0.1 mm too small (and both are flagged); a wrong least count and a misread are flagged; a millimetre out in l is five per cent out in R; on nearly plane glass (h = ${hf.toFixed(3)} mm) one division is ${spread.toFixed(0)} % of h`);
}

/* ── 6 · Reveal, determinism ─────────────────────────────────────────────────────────────── */
{
  fresh('sp100'); get().reveal(); assert.equal(get().revealed, false, 'not before three readings');
  measureLegs(); reference(); for (let i = 0; i < 3; i += 1) reading('lensConvex'); get().reveal(); assert.equal(get().revealed, true);
  const run = () => { fresh('spWide'); measureLegs(['ab', 'ca']); reference(); reading('watchConcave'); return JSON.stringify(get().log.map(({ id, ...r }) => r)); };
  assert.equal(run(), run(), 'the same actions give the same notebook');
  ok.push('the true values are shown only after three readings on a curved surface; the same actions give the same notebook, to the last digit');
}

void CFG;
console.log('\nXI-PHY-A04 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
