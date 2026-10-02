/**
 * verify.mjs — XI-CHE-E01, using a balance.
 *
 * The balance kit is verified on its own (shared/balance); what is checked here is
 * what the bench does with it, driven through the real store — the weigh-in a
 * student does with a spatula, the by-difference transfer, the hygroscopic
 * sample, the warm crucible, the dropped bottle, the calibration, the beam —
 * against numbers worked out here from Archimedes and from the instrument's
 * own specification, never read back from the display.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { BALANCES, buoyancy, CONVECTION } from '../../../../shared/balance/balance.js';
import { useWeighEngine } from './engine/useWeighEngine.js';
import { CATALOGUE, massOf, sampleOf, OBJECT_ORDER, statusOf } from './engine/weigh.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const S = useWeighEngine;
const get = () => S.getState();
const fresh = () => { get().reset(); get().clearLog(); get().setTimeScale(1); };
const run = (seconds, ts = get().timeScale) => { get().setTimeScale(ts); const n = Math.round(seconds / (0.05 * ts)); for (let i = 0; i < n; i += 1) get().tick(0.05); };
const reading = () => get().display.reading;
/** Warm up, level, and (for the shielded ones) close the shield — the preparation a careful student does. */
const prepare = (id, { calibrate = false } = {}) => {
  get().setBalance(id); get().setFeet(0); if (BALANCES[id]?.shield) get().setShield('closed'); run(3600, 30);
  if (calibrate) { get().remove(); get().pick('calweight'); get().place(); run(30, 10); get().remove(); get().zero(); get().pick('calweight'); get().place(); run(20, 10); get().calibrate(); get().remove(); run(10, 10); }
};
const trueApparent = (obj) => CATALOGUE[obj].parts.reduce((a, p) => a + p.m * buoyancy(p.rho), 0);

/* ── 1 · The bench as it is found ───────────────────────────────────────────────── */
fresh(); run(20, 10);
const b0 = get().bals;
assert.ok(Object.keys(b0).length === 3 && get().balanceId === 'top2', 'three electronic balances, the top-pan one in use');
assert.ok(get().bals.ana4.calErr !== 0 && get().bals.ana4.tilt > 0.5, 'none of them calibrated, none quite level');
const z0 = reading().value; assert.ok(z0 > 0.01 && z0 < 0.06, `an empty, cold top-pan balance does not read zero (${z0})`);
assert.equal(OBJECT_ORDER.length, 10, 'ten things to weigh');
ok.push(`as found: three balances, uncalibrated and a little out of level; the cold top-pan one reads ${z0.toFixed(2)} g with nothing on it`);

/* ── 2 · The weigh-in a student does: container, tare, spatula, until it says 2.00 ──── */
fresh(); prepare('top3');
get().pick('bottle'); get().setLid('off'); get().place(); run(10);
get().tare(); run(6);
assert.equal(reading().value, 0, 'tared: 0.000');
get().setSpatula(0.3);
let target = 0; let adds = 0;
while (reading().value < 2.0 && adds < 40) { get().setShield('open'); get().addSample(); adds += 1; get().setShield('closed'); run(8); target = sampleOf(get().objects.bottle); }
const shown = reading().value;
near(shown, target * buoyancy(2.16), 0.0012, 'what is added is what the display says, buoyancy aside');
assert.ok(shown >= 2.0 && shown < 2.0 + 0.45, `stopped just past 2.000 (${shown} after ${adds} spatulas)`);
get().record();
assert.equal(get().log[0].tare > 8.2 && get().log[0].tare < 8.3, true, 'the notebook records the tare held');
ok.push(`weigh-in on the precision balance: bottle tared, ${adds} spatula-fulls (about 0.3 g each, never the same twice), display ${shown.toFixed(3)} g for ${target.toFixed(4)} g of salt in the bottle`);

/* ── 3 · Archimedes through the bench: salt reads low on the analytical balance ───── */
fresh(); prepare('ana4', { calibrate: true });
get().pick('salt'); get().place(); run(30, 10);
const expectSalt = trueApparent('salt');
near(reading().value, expectSalt, 0.0003, 'bottle + salt on the calibrated, level, shielded analytical balance');
assert.ok(reading().value < massOf(CATALOGUE.salt) - 0.004, 'about 5 mg below the true mass');
get().pick('coin'); get().place(); run(30, 10);
near(reading().value, trueApparent('coin'), 0.0003, 'and the coin, denser than steel, reads a hair high');
assert.ok(reading().stable, 'steady with the shield closed');
ok.push(`calibrated, level, shielded: the salt bottle reads ${trueApparent('salt').toFixed(4)} g for a true ${massOf(CATALOGUE.salt).toFixed(4)} (buoyancy), the coin ${trueApparent('coin').toFixed(4)} for ${massOf(CATALOGUE.coin).toFixed(4)}`);

/* ── 4 · Weighing by difference ──────────────────────────────────────────────────────── */
get().pick('salt'); get().place(); run(20, 10); get().record();
get().remove(); get().setLid('off'); get().transfer(); run(20, 10);
const left = sampleOf(get().objects.salt); const moved = 5.126 - left;
assert.ok(left > 0.005 && left < 0.03, `a film stays in the bottle (${left} g)`);
get().pick('salt'); get().place(); run(30, 10); get().record();
const diff = get().analysis.byDifference;
assert.ok(diff, 'the notebook has the pair');
near(diff.transferred, moved * buoyancy(2.16), 0.0004, 'mass transferred by difference');
assert.ok(Math.abs(diff.transferred - 5.126) > 0.004, 'which is NOT the 5.126 g that was weighed out: the film left behind is caught');
ok.push(`by difference: ${diff.full.toFixed(4)} g before, ${diff.after.toFixed(4)} g after: ${diff.transferred.toFixed(4)} g went into the beaker; ${left.toFixed(4)} g stayed on the glass — which a single weighing of the sample would never have shown`);

/* ── 5 · A hygroscopic sample never settles — until the lid is on ─────────────────────── */
fresh(); prepare('ana4', { calibrate: true });
get().pick('naoh'); get().place(); get().setLid('off'); run(15, 10);
const r1 = reading().value; run(60, 4); const r2 = reading().value;
assert.ok(r2 - r1 > 0.005, `it creeps up: ${r1} → ${r2}`); assert.ok(!reading().stable || r2 - r1 > 0.005, 'and the display does not settle');
assert.ok(get().objects.naoh.parts[1].gain > 0.01, 'because the pellets are taking up water');
assert.equal(statusOf(get()).key, 'unsteady', 'and the bench says the reading is not steady'); assert.match(statusOf(get()).detail, /water/, '…and why');
get().setLid('on'); run(30, 4); const r3 = reading().value; run(60, 4); near(reading().value, r3, 0.0006, 'with the lid on it stops');
ok.push(`NaOH pellets with the lid off: ${r1.toFixed(4)} → ${r2.toFixed(4)} g in a minute (the display never settles); lid on, the creep stops`);

/* ── 6 · A warm crucible reads low, and comes up as it cools ───────────────────────────── */
get().remove(); get().setLid('on'); fresh(); prepare('ana4', { calibrate: true });
get().pick('crucible'); get().heat(); get().place(); run(40, 10);
const hotRead = reading().value; const trueM = trueApparent('crucible');
near(trueM - hotRead, CONVECTION * Math.sqrt(0.1875) * get().objects.crucible.dT, 0.0006, 'the crucible reads low by κ√(m/100)ΔT');
assert.ok(trueM - hotRead > 0.002, `…by ${(1000 * (trueM - hotRead)).toFixed(1)} mg`);
run(3600, 30); near(reading().value, trueM, 0.0004, 'and after an hour it reads its mass');
ok.push(`a crucible 45 K above the room reads ${(1000 * (trueM - hotRead)).toFixed(1)} mg low on the analytical balance; an hour later it reads its mass, ${trueM.toFixed(4)} g`);

/* ── 7 · A dropped bottle rings; the same bottle placed gently does not ───────────────── */
fresh(); prepare('top3'); get().pick('salt'); get().drop(); run(0.7, 1);
const rung = reading().value;
fresh(); prepare('top3'); get().pick('salt'); get().place(); run(0.7, 1);
const calm = reading().value;
assert.ok(Math.abs(rung - calm) > 0.3, `0.7 s after, the dropped bottle reads ${Math.abs(rung - calm).toFixed(2)} g away from the one placed gently`);
fresh(); prepare('top3'); get().pick('salt'); get().drop(); run(2, 1); get().record();
assert.match(get().log[0].note, /dropped on the pan/, 'and the notebook says it was dropped'); assert.equal(get().log[0].steady, 'no');
run(40, 1); assert.ok(reading().stable, 'forty seconds later it has settled');
ok.push(`a bottle dropped on the pan reads ${Math.abs(rung - calm).toFixed(1)} g away from one placed gently 0.7 s later; the notebook flags it as dropped and not steady; it settles within the minute`);

/* ── 8 · Level, shield, tare: the notes ─────────────────────────────────────────────────── */
fresh(); get().setBalance('ana4'); get().pick('salt'); get().place(); run(15, 10); get().record();
const n0 = get().log[0].note;
assert.match(n0, /out of level/); assert.match(n0, /draft shield open/); assert.match(n0, /zero still drifting/);
const fracStable = (shield) => { get().setShield(shield); let k = 0; for (let i = 0; i < 120; i += 1) { run(0.5, 1); if (reading().stable) k += 1; } return k / 120; };
const fOpen = fracStable('open'); const fClosed = fracStable('closed');
assert.ok(fOpen < 0.75 && fClosed > 0.85, `the asterisk is on ${(100 * fOpen).toFixed(0)} % of the time with the shield open, ${(100 * fClosed).toFixed(0)} % closed`);
get().setFeet(0); get().setShield('closed'); run(3600, 30); get().record();
assert.equal(get().log[1].note, '', 'level, shielded, warm: nothing to note'); assert.equal(get().log[1].steady, 'yes');
get().tare(); run(10, 10); get().record(); assert.match(get().log[2].note, /tare held/);
ok.push('the notebook notes what was wrong at the time: out of level, shield open, zero still drifting; nothing once those are put right; and the tare in memory');

/* ── 9 · Calibration ────────────────────────────────────────────────────────────────────── */
fresh(); get().setBalance('ana4'); get().pick('calweight'); get().place(); run(30, 10);
get().calibrate(); assert.match(get().message.text, /Level/, 'refused: unlevel'); assert.equal(get().display.bal.calibrations, 0);
get().setFeet(0); get().calibrate(); assert.match(get().message.text, /shield/i, 'refused: shield open');
get().setShield('closed'); get().calibrate(); assert.match(get().message.text, /warm/i, 'refused: cold');
run(1200, 30); get().tare(); get().calibrate(); assert.match(get().message.text, /Zero/i, 'refused: tared');
get().zero(); get().calibrate(); assert.equal(get().display.bal.calibrations, 1, 'and done');
const was = 100 * BALANCES.ana4.calErr0; run(30, 10);
const r100 = reading().value;
near(r100, 100, 0.0006, 'the 100 g weight reads 100.0000 to a few counts'); assert.ok(Math.abs(was) > 0.01);
get().remove(); run(10, 10); get().tare(); run(10, 10); get().pick('check'); get().place(); run(30, 10);
near(reading().value, 10, 0.0004, 'and so, tared on the empty pan first, does the 10 g check weight');
ok.push(`calibration is refused (unlevel, shield open, cold, tared) until it is done properly; then the 100 g weight reads ${r100.toFixed(4)} where its span error was ${was.toFixed(3)} g, and the 10 g check weight reads 10.0000 ± 0.0004`);

/* ── 10 · Overload ─────────────────────────────────────────────────────────────────────────── */
fresh(); get().setBalance('ana4'); get().pick('block'); get().place(); run(20, 10);
assert.equal(reading().text, '-OL-'); assert.equal(get().status ? 0 : 0, 0);
get().setBalance('top3'); run(20, 10); assert.equal(reading().text, '-OL-', '250 g overloads the 220 g balance too');
get().setBalance('top2'); run(20, 10); assert.ok(reading().value > 249, 'but not the 600 g top-pan one');
ok.push('250 g of steel overloads the analytical (120 g) and the precision (220 g) balances — -OL- — and not the 600 g top-pan one');

/* ── 11 · The mechanical balance ────────────────────────────────────────────────────────────── */
fresh(); get().setBalance('beam'); get().pick('check'); get().place(); run(20, 4);
assert.equal(get().display.reading.atRest, false, 'a load against no riders');
get().setZeroScrew(-0.07); get().remove(); run(20, 4); assert.equal(get().display.reading.atRest, true, 'turn the zero screw and the empty pan is at zero');
get().place(); get().setUnits(9.99); run(20, 4);
assert.equal(get().display.reading.atRest, true, 'the 10 g check weight is found with the fine rider at 9.99 g');
get().record(); const rb = get().log[0];
near(rb.reading, 10, 0.051, 'recorded to the half-division'); assert.equal(rb.steady, 'yes'); assert.equal(rb.tare, '—');
get().pick('coin'); get().place(); get().setUnits(5.0); run(15, 4);
assert.ok(!get().display.reading.atRest, 'the wrong rider is not at rest'); get().setUnits(6.03); run(25, 4);
assert.ok(get().display.reading.atRest && Math.abs(get().display.reading.value - 6.05) <= 0.051, 'the coin: 6.03 g on the fine beam');
ok.push('mechanical: with the zero screw turned the empty pan is at rest; the 10 g check weight is found at 9.99 g and the 6 g coin at 6.03; the wrong rider leaves the pointer off the mark');

/* ── 12 · Repeatability, the notebook's statistics ──────────────────────────────────────────── */
fresh(); prepare('top3', { calibrate: true }); get().pick('check'); get().place(); run(10, 10);
for (let i = 0; i < 6; i += 1) { run(7, 1); get().record(); }
const st = get().analysis.last;
assert.equal(st.n, 6); near(st.mean, 10, 0.003, 'mean of six readings of the check weight');
assert.ok(st.sd / st.d < 1.5, `the scatter is about a count (${(st.sd / st.d).toFixed(2)} counts)`);
assert.ok(st.range / st.d <= 4, `the range of six is a few counts (${Math.round(st.range / st.d)})`);
ok.push(`six readings of the 10 g check weight on the precision balance: mean ${st.mean.toFixed(4)}, scatter ${(st.sd / st.d).toFixed(2)} counts, range ${Math.round(st.range / st.d)} counts`);

/* ── 13 · Determinism ────────────────────────────────────────────────────────────────────────── */
const session = () => { fresh(); prepare('top3'); get().pick('bottle'); get().setLid('off'); get().place(); run(8); get().tare(); run(5); get().addSample(); run(8); get().record(); get().addSample(); run(8); get().record(); return JSON.stringify(get().log); };
assert.equal(session(), session(), 'the same actions give the same notebook');
ok.push('the same sequence of actions gives the same notebook, to the last digit');

console.log('\nXI-CHE-E01 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
