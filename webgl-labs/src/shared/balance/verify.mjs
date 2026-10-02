/**
 * verify.mjs — the shared balance kit.
 *
 * Held against what a balance is physically: Archimedes (a salt weighed against
 * steel reads 0.04 % low), the readability it rounds to, the noise it is
 * specified to have, the critically damped response that makes it take seconds,
 * the drift of a cold instrument, convection from a warm object, tilt, a
 * hygroscopic sample that never settles, a dropped object that rings, and the
 * calibration that is refused until it can be done properly — and the
 * mechanical balance that has to be brought to zero by hand.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import {
  BALANCES, buoyancy, newBalance, stepBalance, stepItems, readout, tare, setTilt, setShield, shock, calibrate, rawSignal, CONVECTION, RHO_AIR, TAU_COOL,
} from './balance.js';
import { BEAM, newBeam, setRider, setZeroScrew, stepBeam, atRest, beamReading, target } from './beam.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const run = (b, items, seconds) => { let x = b; for (let i = 0; i < Math.round(seconds / 0.5); i += 1) x = stepBalance(x, items, 0.5); return x; };
/** A balance with nothing wrong with it but the digits: calibrated, level, warm, shielded. */
const ideal = (kind) => ({ ...newBalance(kind, { onFor: 1e5 }), calErr: 0, tilt: 0, shield: BALANCES[kind].shield ? 'closed' : 'none' });

/* ── 1 · Archimedes ─────────────────────────────────────────────────────────── */
const salt = [{ id: 's', m: 5.0, rho: 2.16 }]; const coin = [{ id: 'c', m: 6.0, rho: 8.9 }];
const b1 = run(ideal('ana4'), salt, 30);
const expectSalt = 5.0 * (1 - RHO_AIR / 2.16) / (1 - RHO_AIR / 8);
near(b1.y, expectSalt, 3e-4, 'a salt weighed against steel');
near(buoyancy(2.16), 0.999594, 1e-6, 'the buoyancy factor of salt');
assert.ok(readout(b1).value < 5.0 && readout(b1).value > 4.9965, 'on an analytical balance the salt reads about 2 mg low');
const bc = run(ideal('ana4'), coin, 30);
assert.ok(bc.y > 6.0, 'a coin (denser than steel) reads a hair high');
ok.push(`Archimedes: 5.0000 g of salt (ρ 2.16) reads ${readout(b1).text} on a perfectly calibrated analytical balance (${((1 - buoyancy(2.16)) * 100).toFixed(3)} % low), a 6 g coin (ρ 8.9) ${readout(bc).text}`);

/* ── 2 · The display is a multiple of the readability ──────────────────────────── */
let worst = 0;
for (const kind of ['top2', 'top3', 'ana4']) for (const m of [0.3, 7.123, 55.5555, 101.1]) {
  const b = run(newBalance(kind), [{ id: 'x', m, rho: 2.5 }], 15); const r = readout(b);
  worst = Math.max(worst, Math.abs(r.value / BALANCES[kind].d - Math.round(r.value / BALANCES[kind].d)));
  assert.equal(r.text.split('.')[1].length, BALANCES[kind].decimals, 'and it is shown to the readability and no further');
}
assert.ok(worst < 1e-6, `rounded to the least count (${worst})`);
ok.push('the display is a whole number of least counts, shown to exactly the readability’s decimals, for three balances and four loads');

/* ── 3 · Noise: the repeatability the instrument is specified to have ─────────── */
for (const kind of ['top2', 'top3', 'ana4']) {
  const sp = BALANCES[kind]; const b = ideal(kind); b.clock = 0;
  const xs = []; for (let k = 0; k < 4000; k += 1) { b.clock = k * 0.1; xs.push(rawSignal(b, [{ id: 'x', m: 20, rho: 8 }]) - 20); }
  const m = xs.reduce((a, v) => a + v, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, v) => a + (v - m) ** 2, 0) / xs.length);
  near(sd / sp.d, sp.sd, sp.sd * 0.15 + 0.06, `${kind}: SD of the raw signal in counts (closed shield, air residue included)`);
}
ok.push('the raw signal’s scatter is the specified repeatability in counts (0.35, 0.5, 0.6) for the three balances, closed shield');

/* ── 4 · The response: critically damped, seconds to settle, no overshoot ───────── */
for (const [kind, lo, hi] of [['top2', 0.8, 3.2], ['top3', 1.5, 4.5], ['ana4', 2.5, 7]]) {
  const sp = BALANCES[kind]; let b = ideal(kind); const final = 50 * buoyancy(2.5);
  let tSettle = null; let peak = 0;
  for (let k = 1; k <= 400; k += 1) {
    b = stepBalance(b, [{ id: 'x', m: 50, rho: 2.5 }], 0.05);
    peak = Math.max(peak, b.y - final);
    if (tSettle === null && Math.abs(b.y - final) < 1.0 * sp.d && Math.abs(b.v) < 0.3 * sp.d) tSettle = k * 0.05;
  }
  assert.ok(tSettle >= lo && tSettle <= hi, `${kind}: settles in ${tSettle} s (${lo}–${hi})`);
  assert.ok(peak < 3 * sp.d, `${kind}: critically damped, no overshoot beyond the noise (${peak})`);
}
let bs = ideal('top3'); const flags = [];
for (let k = 0; k < 120; k += 1) { bs = stepBalance(bs, [{ id: 'x', m: 50, rho: 2.5 }], 0.1); flags.push(isStableOf(bs)); }
function isStableOf(b) { return readout(b).stable; }
assert.ok(!flags[2] && flags[119], 'the stability mark is off just after loading and on once it has settled');
ok.push('the response takes a second or two (top-pan), three (precision), five (analytical) to come within a count, without overshoot; the stability mark follows it');

/* ── 5 · Warm-up drift ─────────────────────────────────────────────────────────── */
const cold = newBalance('ana4', { onFor: 0 }); const c0 = { ...cold, shield: 'closed', tilt: 0 };
const z = (t) => { const b = { ...c0, t, clock: 0 }; b.y = rawSignal(b, []); return b.y; };
near(z(0), 30e-4, 5e-5, 'a cold analytical balance’s zero is 30 counts off'); near(z(900), 30e-4 * Math.exp(-1), 5e-5, 'after one time constant');
assert.ok(z(3600) < 1e-4, 'after an hour it has settled'); assert.ok(z(0) > z(300) && z(300) > z(900), 'monotonic');
ok.push(`zero drift of a cold analytical balance: ${(z(0) * 1e4).toFixed(0)} counts at switch-on, ${(z(900) * 1e4).toFixed(0)} after 15 min, ${(z(3600) * 1e4).toFixed(1)} after an hour`);

/* ── 6 · Taring ─────────────────────────────────────────────────────────────────── */
let t = run(ideal('top3'), [{ id: 'bottle', m: 8.24, rho: 2.23 }], 15);
t = tare(t); near(readout(t).value, 0, 1e-9, 'tared: 0.000');
t = run(t, [{ id: 'bottle', m: 8.24, rho: 2.23 }, { id: 's', m: 2.0, rho: 2.16 }], 15);
near(readout(t).value, 2.0 * buoyancy(2.16), 0.0011, 'bottle tared, salt added: the salt');
/* Tared before it had settled: the error is taken with the zero. */
let r = ideal('top3'); r = stepBalance(r, [{ id: 'bottle', m: 8.24, rho: 2.23 }], 0.6); r = tare(r);
r = run(r, [{ id: 'bottle', m: 8.24, rho: 2.23 }], 20);
assert.ok(readout(r).value > 0.5, `tared in mid-flight, it reads +${readout(r).value} with nothing added`);
ok.push(`tare: bottle tared and salt added reads the salt to a count; tared 0.6 s after loading (before it settled) it then reads ${readout(r).text} g with nothing added`);

/* ── 7 · Level ────────────────────────────────────────────────────────────────────── */
const lv = (deg) => run({ ...ideal('ana4'), tilt: deg }, [{ id: 'w', m: 100, rho: 8 }], 30).y;
near(lv(0), 100, 3e-4, 'level'); near(lv(2) - lv(0), 100 * (Math.cos(2 * Math.PI / 180) - 1), 3e-4, '2° out of level reads low by m(1 − cos θ)');
ok.push(`tilt: a 100 g weight reads ${(100 - lv(0.7)).toFixed(4)} g low at 0.7°, ${(100 - lv(2)).toFixed(3)} g at 2° — m(1 − cos θ)`);

/* ── 8 · Convection ───────────────────────────────────────────────────────────────── */
const warm = [{ id: 'x', m: 50, rho: 8, dT: 40 }];
const wb = run(ideal('ana4'), warm, 30); const lift = 50 - wb.y;
near(lift, CONVECTION * Math.sqrt(0.5) * 40, 4e-4, 'a warm 50 g object reads low by κ√(m/100)ΔT');
let items = warm; for (let i = 0; i < TAU_COOL / 10; i += 1) items = stepItems(items, 10);
near(items[0].dT, 40 * Math.exp(-1), 1e-6, 'and cools with τ = 10 min');
ok.push(`a 50 g object 40 K above the room reads ${(lift * 1000).toFixed(2)} mg low; it has cooled to ${items[0].dT.toFixed(1)} K after ${TAU_COOL} s`);

/* ── 9 · Hygroscopic samples ──────────────────────────────────────────────────────── */
let h = [{ id: 'naoh', m: 2.0, rho: 2.13, hygro: { rate: 2e-4, cap: 0.05 } }];
h = stepItems(h, 10); near(h[0].m - 2.0, 2e-3, 1e-5, 'the first seconds gain at the rate');
for (let i = 0; i < 20000; i += 1) h = stepItems(h, 1);
near(h[0].m - 2.0, 0.05, 1e-4, 'and saturate at the cap');
let lidded = [{ id: 'naoh', m: 2.0, rho: 2.13, hygro: { rate: 2e-4, cap: 0.05 }, exposed: false }]; lidded = stepItems(lidded, 1000);
assert.equal(lidded[0].m, 2.0, 'with the lid on, nothing is gained');
ok.push('an exposed hygroscopic sample gains at its rate and saturates at its cap; with the lid on it gains nothing');

/* ── 10 · A dropped object rings ──────────────────────────────────────────────────── */
const mass20 = [{ id: 'x', m: 20, rho: 8 }];
let gentle = ideal('top3'); let dropped = shock(ideal('top3'), 20, 0.3);
let worstDiff = 0;
for (let k = 0; k < 40; k += 1) { gentle = stepBalance(gentle, mass20, 0.05); dropped = stepBalance(dropped, mass20, 0.05); worstDiff = Math.max(worstDiff, Math.abs(dropped.y - gentle.y)); }
assert.ok(worstDiff > 1, `a dropped 20 g mass throws the reading ${worstDiff.toFixed(1)} g beyond a gently placed one`);
gentle = run(gentle, mass20, 12); dropped = run(dropped, mass20, 12);
near(dropped.y, gentle.y, 0.002, 'and twelve seconds later the two agree');
ok.push(`dropped, a 20 g mass throws the reading up to ${worstDiff.toFixed(1)} g away from where a gently placed one is; twelve seconds later they agree to ${Math.abs(dropped.y - gentle.y).toExponential(0)} g`);

/* ── 11 · Air currents and the draft shield ───────────────────────────────────────── */
const range = (shield) => { let b = { ...ideal('ana4'), shield }; const xs = []; for (let k = 0; k < 120; k += 1) { b = stepBalance(b, [{ id: 'x', m: 20, rho: 8 }], 0.5); if (k > 20) xs.push(readout(b).value); } return (Math.max(...xs) - Math.min(...xs)) / 1e-4; };
const open = range('open'); const closed = range('closed');
assert.ok(open > 2.5 && closed < 1.5, `open ${open.toFixed(1)} counts of wander, closed ${closed.toFixed(1)}`);
ok.push(`air currents: an analytical balance with the shield open wanders ${open.toFixed(0)} counts over a minute, closed ${closed.toFixed(0)}`);

/* ── 12 · Calibration, and when it is refused ─────────────────────────────────────── */
const cw = [{ id: 'calweight', m: 100, rho: 8 }];
const raw = newBalance('ana4', { onFor: 1e4 });
const refusals = [
  calibrate({ ...raw, shield: 'closed' }, { weightG: 100, items: cw }),                              // tilt
  calibrate({ ...raw, tilt: 0 }, { weightG: 100, items: cw }),                                        // shield open
  calibrate({ ...raw, tilt: 0, shield: 'closed', t: 60 }, { weightG: 100, items: cw }),               // cold
  calibrate({ ...raw, tilt: 0, shield: 'closed', tareG: 0.0123 }, { weightG: 100, items: cw }),       // tared
  calibrate({ ...raw, tilt: 0, shield: 'closed' }, { weightG: 100, items: [] }),                      // no weight
];
assert.ok(refusals.every((x) => !x.ok), 'refused unless level, shielded, warm, zeroed and with the weight alone on the pan');
const before = run({ ...raw, tilt: 0, shield: 'closed' }, cw, 30).y;
const done = calibrate({ ...raw, tilt: 0, shield: 'closed' }, { weightG: 100, items: cw });
assert.ok(done.ok);
const after = run(done.b, cw, 30);
near(before, 100 + 100 * 1.3e-4 + 30e-4 * Math.exp(-1e4 / 900), 3e-4, 'before calibration the 100 g weight reads its span error');
near(after.y, 100, 2.5e-4, 'after it, 100.0000 to within a couple of counts');
assert.ok(Math.abs(after.y - 100) < Math.abs(before - 100) / 5, 'and the error is a fifth of what it was or less');
ok.push(`calibration is refused unless level, shielded, warm, zeroed and with only the certified weight on the pan; done properly the 100 g reads ${after.y.toFixed(4)} where it read ${before.toFixed(4)}`);

/* ── 13 · Overload ────────────────────────────────────────────────────────────────── */
const ol = run(ideal('ana4'), [{ id: 'x', m: 500, rho: 8 }], 30);
assert.equal(readout(ol).text, '-OL-', 'over capacity the display says so');
ok.push('over its capacity the display reads -OL-');

/* ── 14 · The mechanical balance ──────────────────────────────────────────────────── */
const beamRun = (bm, items, s) => { let x = bm; for (let i = 0; i < Math.round(s / 0.1); i += 1) x = stepBeam(x, items, 0.1); return x; };
const load = [{ id: 'x', m: 123.45, rho: 2.5 }];
let bm = newBeam({ zeroErr: 0.07 });
bm = beamRun(bm, [], 20);
assert.ok(!atRest(bm), 'an empty balance with a zero error is not at zero');
bm = beamRun(setZeroScrew(bm, -0.07), [], 20); assert.ok(atRest(bm), 'turn the screw and it is');
bm = beamRun(bm, load, 20); assert.ok(bm.theta > 5, 'a load against no riders pins the pointer');
bm = setRider(setRider(setRider(bm, 'h', 100), 't', 20), 'u', 3.41);          // the apparent mass, to 0.01 g
let swing = 0; let b2 = bm; for (let i = 0; i < 200; i += 1) { b2 = stepBeam(b2, load, 0.05); swing = Math.max(swing, Math.abs(b2.theta)); }
bm = beamRun(bm, load, 30);
const truth = 123.45 * buoyBeam(2.5);
function buoyBeam(rho) { return (1 - RHO_AIR / rho) / (1 - RHO_AIR / BEAM.rho); }
assert.ok(Math.abs(bm.r.h + bm.r.t + bm.r.u - truth) < 0.02 && atRest(bm), `riders at ${bm.r.h + bm.r.t + bm.r.u}, the apparent mass is ${truth.toFixed(4)}`);
near(beamReading(bm).value, 123.4, 1e-9, 'read to the half division: 123.40');
assert.ok(swing > 1, 'the pointer swings before it rests');
const off = beamRun(setRider(bm, 'u', 3.9), load, 30); assert.ok(!atRest(off), 'half a gram off and the pointer is off the mark');
assert.equal(setRider(bm, 'h', 130).r.h, 100, 'the hundreds rider sits in a notch'); assert.equal(setRider(bm, 't', 34).r.t, 30, 'so does the tens');
ok.push(`mechanical: a zero error of 0.07 g is turned out with the screw; a 123.45 g load (ρ 2.5, apparent mass ${truth.toFixed(2)}) is found with riders 100 + 20 + 3.41 and the pointer swings (${swing.toFixed(1)}°) before it rests; half a gram off and it is off the mark; riders sit in their notches`);

console.log('\nshared/balance VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
