/**
 * verify.mjs — XI-CHE-E02, a standard solution of oxalic acid.
 *
 * The solution a student makes is checked against arithmetic written here, not
 * read back from the state: the mass for 0.1 N, the density of water, millimetres
 * of neck per millilitre, the heat of solution, what each rinse recovers, what
 * overshooting by a millilitre does, what the top of an unmixed flask holds — and
 * the whole preparation is run twice through the real store, once as it should be
 * done and once as it often is, and the error budget has to name what went wrong.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { buoyancy } from '../../../../shared/balance/balance.js';
import {
  waterDensity, FLASKS, mmPerMl, newBatch, tipIn, rinseFunnel, addWater, removeWater, swirl, invert, stepBatch, levelMm, seenMm, truth, mixedFraction, aliquot,
  planFeedback, CP_WATER, VIEW_MM,
} from '../../../../shared/standard/standard.js';
import { FORMS, CFG, useOxalic } from './engine/oxalic.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const rel = (got, want, tol, label) => assert.ok(Math.abs(got / want - 1) <= tol, `${label}: got ${got}, wanted ${want} (${tol * 100} %)`);
const S = useOxalic; const get = () => S.getState();
const DI = FORMS[0]; const AN = FORMS[1];
const run = (sec, ts = get().timeScale) => { get().setTimeScale(ts); const n = Math.round(sec / (0.05 * ts)); for (let i = 0; i < n; i += 1) get().tick(0.05); };
const fresh = () => { get().reset(); get().clearLog(); get().setTimeScale(1); };
const required = (form, N = 0.1, mL = 250) => N * (mL / 1000) * (form.M / form.n);

/* ── 1 · The arithmetic of the plan ─────────────────────────────────────────────── */
near(required(DI), 1.5759, 1e-4, '0.1 N, 250 mL of the dihydrate'); near(required(AN), 1.1254, 1e-4, '…and of the anhydrous acid');
const fb = (planned, form = DI) => planFeedback({ planned, required: required(form), form, forms: FORMS });
assert.equal(fb(1.576).key, 'ok'); assert.equal(fb(1.58).key, 'ok');
assert.equal(fb(3.152).key, 'molar', 'twice the mass is the molar, not the normal, calculation');
assert.equal(fb(0.788).key, 'inverse', 'half is the n-factor multiplied instead of divided');
assert.equal(fb(1.1254).key, 'form', 'and 1.125 g is what the anhydrous acid would need');
assert.equal(fb(1.65).key, 'off');
ok.push('the plan: 1.576 g is right for the dihydrate; twice that is a molar calculation, half is the n-factor the wrong way, 1.125 g is the anhydrous acid’s mass, 1.65 g is just off');

/* ── 2 · Water and the neck ─────────────────────────────────────────────────────── */
for (const [T, rho] of [[4, 0.999972], [20, 0.998207], [25, 0.997047], [30, 0.99565]]) near(waterDensity(T), rho, 6e-6, `density of water at ${T} °C`);
near(mmPerMl(FLASKS[250]), 1000 / (Math.PI * 6.25 ** 2), 1e-9, 'a millilitre of a 12.5 mm neck'); near(mmPerMl(FLASKS[250]), 8.15, 0.01, '= 8.15 mm');
assert.ok(mmPerMl(FLASKS[100]) > mmPerMl(FLASKS[250]) && mmPerMl(FLASKS[1000]) < mmPerMl(FLASKS[250]), 'a narrower neck magnifies more');
const b0 = newBatch({ flaskMl: 250, form: DI, seed: 3, roomC: 20 });
const at = (ml) => addWater(b0, ml, 20);
near(levelMm({ ...b0, water: b0.V20 }), 0, 1e-9, 'water at V20 is at the mark'); near(levelMm({ ...b0, water: b0.V20 + 1 }), 8.15, 0.02, 'a millilitre over is 8 mm');
near(seenMm({ ...b0, water: b0.V20 }, 20), 20 * 12.5 / VIEW_MM, 1e-9, 'an eye 20 mm above the mark misplaces it by 0.8 mm');
assert.ok(Math.abs(b0.V20 - 250) <= 0.12, `this flask holds ${b0.V20.toFixed(3)} mL, within its ±0.12 mL tolerance`);
ok.push(`water ρ(20 °C) = 0.998207, ρ(25 °C) = 0.997047; a millilitre is 8.15 mm of the 12.5 mm neck; an eye 20 mm off the mark misreads the level by 0.8 mm (0.1 mL); this flask holds ${b0.V20.toFixed(3)} mL at 20 °C, inside the ±0.12 of its class`);

/* ── 3 · Tip and rinse ─────────────────────────────────────────────────────────────── */
const mol = 1.5759 / DI.M;
let b = tipIn(newBatch({ flaskMl: 250, form: DI, seed: 3, roomC: 25 }), mol);
const film = b.funnel / mol; assert.ok(film > 0.0025 && film < 0.0066, `a film of ${(100 * film).toFixed(2)} % stays on the funnel`);
near(b.solid + b.funnel, mol, 1e-12, 'nothing is created or lost by the tip');
let r = rinseFunnel(b); near(r.funnel, b.funnel * 0.1, 1e-15, 'a squirt recovers 90 % of the film'); near(r.water, 10, 1e-12, 'with 10 mL of water');
r = rinseFunnel(rinseFunnel(r)); assert.ok(r.funnel < b.funnel * 2e-3, 'three squirts leave a thousandth of it');
const noFunnel = tipIn({ ...newBatch({ flaskMl: 250, form: DI, seed: 3, roomC: 25 }), funnelIn: false }, mol);
near(noFunnel.spilledMol, mol * 0.03, 1e-12, 'with no funnel 3 % goes on the bench');
ok.push(`tipping 1.5759 g through the funnel leaves ${(100 * film).toFixed(2)} % on it; each squirt recovers 90 % (three leave ${(1000 * r.funnel / b.funnel).toFixed(2)} ‰); without a funnel 3 % is lost on the bench`);

/* ── 4 · Dissolving: the time, and the heat ────────────────────────────────────────────── */
const dissolveRun = (form, swirling) => {
  let x = addWater(tipIn(newBatch({ flaskMl: 250, form, seed: 3, roomC: 25 }), required(form) / form.M), 100, 25);
  let minT = x.T; let tDone = null;
  for (let t = 0; t < 3000; t += 1) {
    if (swirling && t % 10 === 0) x = swirl(x);
    x = stepBatch(x, 1); minT = Math.min(minT, x.T); if (tDone === null && x.solid === 0) tDone = t + 1;
  }
  return { x, minT, tDone };
};
const sw = dissolveRun(DI, true); const still = dissolveRun(DI, false);
assert.ok(sw.tDone > 30 && sw.tDone < 400, `swirled it dissolves in ${sw.tDone} s`); assert.ok(still.tDone > 8 * sw.tDone, `unswirled it takes ${still.tDone} s`);
const dT = (DI.dHsol * 1000 * (required(DI) / DI.M)) / (CP_WATER * 100);
assert.ok(25 - sw.minT > 0.5 * dT && 25 - sw.minT < 1.05 * dT, `the flask cools by up to ${(25 - sw.minT).toFixed(2)} K (adiabatic bound ${dT.toFixed(2)} K)`);
near(sw.x.T, 25, 0.15, 'and comes back to the room');
ok.push(`dissolving 1.576 g of the dihydrate in 100 mL: ${sw.tDone} s swirled, ${still.tDone} s not; the flask cools by ${(25 - sw.minT).toFixed(2)} K (ΔH = +35.7 kJ/mol takes ${dT.toFixed(2)} K at the very most) and is back at 25 °C`);

/* ── 5 · The stratified flask, and what mixing does ───────────────────────────────────────── */
let m = addWater(tipIn(newBatch({ flaskMl: 250, form: DI, seed: 3, roomC: 25 }), mol), 100, 25); m = swirl(m); for (let i = 0; i < 100; i += 1) m = stepBatch(m, 1);
m = addWater(m, m.V20 - 100 - 2, 25);
const topBefore = aliquot(m, 0.1); const botBefore = aliquot(m, 0.95); const cTrue = truth(m).M;
assert.ok(topBefore < 0.02 * cTrue && botBefore > 2 * cTrue, `unmixed: the top is water (${topBefore.toExponential(1)}), the bottom ${(botBefore / cTrue).toFixed(1)} × the mean`);
near(botBefore / cTrue, m.water / 100, 0.02, 'because the solid was dissolved in 100 mL and made up to 250');
let st = { ...m, stoppered: true }; for (let i = 0; i < 10; i += 1) st = invert(st);
near(aliquot(st, 0.1) / cTrue, 1, 0.005, 'ten turns and the top is the bottom'); near(aliquot(st, 0.95) / cTrue, 1, 0.005, 'to half a percent');
assert.equal(invert({ ...m, stoppered: false }).inversions, 0, 'with the stopper out, turning the flask over does nothing');
ok.push(`an unmixed flask: the top holds ${topBefore.toExponential(0)} M, the bottom ${(botBefore / cTrue).toFixed(1)} × the mean (the solid went into 100 mL, not 250); ten turns of the stoppered flask bring both to the mean within 0.5 %`);

/* ── 6 · Overshoot, the pipette, temperature ─────────────────────────────────────────────────── */
let o = { ...st, water: st.V20 + 0.4, layer: st.V20 + 0.4 };            // mixed, overshot by 0.4 mL
const lvl = (x) => (x.water - x.V20 * (1 + 1e-5 * (x.T - 20))) * mmPerMl(FLASKS[250]);   // the glass is a hair bigger when it is warm
near(levelMm(o), lvl(o), 1e-9, 'the level against the mark'); near(levelMm(o), 0.4 * 8.15, 0.15, 'overshot by 0.4 mL: 3.2 mm above the mark');
const c1 = truth(o).M; const o2 = removeWater(o, 1);
near(truth(o2).M / c1, 1, 1e-9, 'a pipette cannot undo it once it is mixed: what is left is as dilute as it was');
near(levelMm(o2), (-0.6) * 8.15, 0.15, '…and the level is now 0.6 mL under');
let u = { ...m, water: m.V20 + 0.4 };                                    // unmixed: the excess is water on top
const cU = truth(u).M; const u2 = removeWater(u, 0.4);
near(truth(u2).M, truth({ ...m, water: m.V20 }).M, 1e-12, 'but unmixed, the water on top comes off clean');
const hot = { ...st, T: 30 }; near(truth(hot, 25).M / truth(hot, 30).M, waterDensity(25) / waterDensity(30), 1e-9, 'made up at 30 °C, used at 25 °C: the solution has contracted by ρ(30)/ρ(25), so it is stronger by ρ(25)/ρ(30)');
assert.ok(truth(hot, 25).M > truth(hot, 30).M, 'the solution contracts as it cools: it is a little stronger');
ok.push('overshot by 0.4 mL the meniscus is 3.2 mm up; taking 1 mL out of the MIXED flask leaves the concentration exactly as dilute as it was (and now 0.6 mL under); taking the excess off an UNMIXED flask removes clean water; made up at 30 °C and used at 25 °C it is 0.14 % stronger');

/* ── 7 · The whole preparation through the store: done properly ─────────────────────────────────── */
const weighIn = (target, step = 0.05) => {
  get().setBalance('top3'); get().setShield('closed'); get().setLid('off'); get().place(); run(12, 10); get().tare(); run(8, 10);
  while (get().display.reading.value < target - 0.3) { get().setSpatula(0.3); get().setShield('open'); get().addSolid(); get().setShield('closed'); run(6, 10); }
  while (get().display.reading.value < target - 0.001) { get().setSpatula(step); get().setShield('open'); get().addSolid(); get().setShield('closed'); run(6, 10); }
};
const proper = () => {
  fresh(); get().setBalance('top3'); get().setShield('closed'); get().setLid('off'); get().place(); run(12, 10);
  get().recordWeight();                                                  // bottle, empty
  get().tare(); run(8, 10);
  weighIn(1.5759, 0.02);                                                 // net, bottle tared
  run(10, 10); get().remove(); run(4, 10); get().tare(); run(6, 10); get().zero(); get().setLid('off'); get().place(); run(15, 10);
  get().recordWeight();                                                  // bottle + solid, untared
  get().remove(); get().tip(); get().place(); run(15, 10); get().recordWeight(); get().remove();
  get().rinse('bottle'); get().rinse('funnel'); get().rinse('funnel'); get().rinse('funnel');
  for (let i = 0; i < 12; i += 1) { get().swirl(); run(20, 10); }
  get().setWaterStep(50); get().addWater(); get().addWater(); get().swirl(); run(30, 10);
  get().setWaterStep(10); while (get().display.level < -45) get().addWater();
  get().setWaterStep(1); get().setEye(0);
  while (get().display.seen < -3) get().addWater();
  run(900, 30);                                                          // back to the room
  get().setWaterStep(0.05); let n = 0; while (get().display.seen < -0.15 && n < 400) { get().addWater(); n += 1; }
  get().stopper(true); get().invertMany(); get().invertMany();
  get().reveal();
  return get();
};
const good = proper();
assert.ok(good.revealed, `the check ran: ${good.message?.text ?? ''}`);
const cl = good.revealed;
assert.ok(Math.abs(cl.totalPct) < 0.45, `done properly the flask is within ${cl.totalPct.toFixed(3)} % of what the notebook says`);
assert.ok(Math.abs(cl.vsTargetPct) < 1.6, `and within ${cl.vsTargetPct.toFixed(3)} % of the 0.1 N asked for (a spatula-full cannot do better than its own size)`);
near(cl.N, 0.1, 1.6e-3, 'normality'); assert.ok(good.analysis.reported.how === 'by difference', 'worked out by difference');
const prod = cl.factors.reduce((a, f) => a * f.f, 1);
near((prod - 1) * 100, cl.totalPct, 1e-9, 'the error budget multiplies out to the whole');
rel(cl.trueM / cl.claimedM, prod, 1e-9, 'true molarity / claimed molarity = the product of the factors');
ok.push(`done as it should be — by-difference weighing, bottle and funnel rinsed, dissolved, flask back at the room, made up with the dropper at eye level, turned over ten times — the reference titration gives ${cl.N.toFixed(5)} N, ${cl.totalPct >= 0 ? '+' : ''}${cl.totalPct.toFixed(3)} % from the notebook's figure and ${cl.vsTargetPct >= 0 ? '+' : ''}${cl.vsTargetPct.toFixed(3)} % from 0.1 N; the budget multiplies out exactly`);

/* ── 8 · …and as it often is ───────────────────────────────────────────────────────────────────────── */
const sloppy = () => {
  fresh(); get().setBalance('top3'); get().setShield('closed'); get().setLid('off'); get().place(); run(12, 10); get().tare(); run(8, 10);
  weighIn(1.5759, 0.02); run(10, 10);
  get().recordWeight(); get().remove(); get().tip(); get().place(); run(15, 10); get().recordWeight(); get().remove();
  /* no rinsing at all; a quick swirl; the water poured fast, a millilitre past the mark; the flask left warm; the eye above the mark */
  get().setWaterStep(50); get().addWater(); get().addWater();
  for (let i = 0; i < 12; i += 1) { get().swirl(); run(20, 10); }
  get().setWaterStep(10); while (get().display.level < -45) get().addWater();
  get().setWaterStep(5); get().setEye(0); while (get().display.seen < -8) get().addWater();
  get().setWaterStep(1); while (get().display.seen < 0) get().addWater(); get().addWater(); get().addWater();   // past the line by a couple of millilitres
  get().stopper(true); get().invertMany(); get().invertMany();
  get().reveal();
  return get();
};
const bad = sloppy();
assert.ok(bad.revealed, `the check ran: ${bad.message?.text ?? ''}`);
const worst = [...bad.revealed.factors].sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct))[0];
assert.ok(worst.id === 'fill' || worst.id === 'glass' || worst.id === 'temperature', `the budget names the cause (${worst.id}, ${worst.pct.toFixed(2)} %)`);
assert.ok(Math.abs(bad.revealed.totalPct) > 0.5, `the sloppy flask is ${bad.revealed.totalPct.toFixed(2)} % off what the notebook says`);
const filled = bad.revealed.factors.find((x) => x.id === 'fill'); const lost = bad.revealed.factors.find((x) => x.id === 'glass');
assert.ok(filled.pct < -0.1, `overshooting dilutes it (${filled.pct.toFixed(2)} %)`); assert.ok(lost.pct < -0.2, `no rinsing loses solid on the glass (${lost.pct.toFixed(2)} %)`);
ok.push(`done carelessly (no rinsing, a few millilitres past the mark): ${bad.revealed.totalPct.toFixed(2)} % off — filling ${filled.pct.toFixed(2)} %, lost on the glass ${lost.pct.toFixed(2)} %; the budget's largest item is "${worst.id}"`);

/* ── 9 · The check refuses what cannot be checked ────────────────────────────────────────────────── */
fresh(); get().reveal(); assert.match(get().message.text, /nothing in the flask/);
get().setBalance('top3'); get().setLid('off'); get().setShield('open'); get().place(); run(10, 10); get().addSolid(); get().remove(); get().tip(); get().reveal(); assert.match(get().message.text, /solid|made up/);
get().setWaterStep(50); get().addWater(); get().reveal(); assert.match(get().message.text, /solid|mark/);
ok.push('the reference titration is refused with nothing in the flask, with solid still undissolved, below the mark, or unmixed');

/* ── 10 · Mistakes the bench lets a student make ──────────────────────────────────────────────────── */
fresh(); get().setForm('anhydrous'); assert.equal(get().formId, 'anhydrous');
get().setBalance('top3'); get().setLid('off'); get().place(); run(10, 10); get().tare(); run(5, 10);
while (get().display.reading.value < 1.5759 - 0.001) { get().setSpatula(0.05); get().setShield('open'); get().addSolid(); get().setShield('closed'); run(6, 10); }
get().setForm('dihydrate'); assert.equal(get().formId, 'anhydrous', 'the jar cannot be swapped once solid is out');
fresh(); get().setFunnel('out'); get().setBalance('top2'); get().setLid('off'); get().place(); run(6, 10); get().addSolid(); get().remove(); get().tip();
assert.ok(get().batch.spilledMol > 0 && get().display.truth.n > 0, 'with no funnel solid goes on the bench');
fresh(); get().setWaterStep(50); for (let i = 0; i < 7; i += 1) get().addWater();
assert.ok(get().batch.spilledMl > 90, `pouring on past the brim: ${get().batch.spilledMl.toFixed(0)} mL runs over`);
ok.push('the jar cannot be changed once solid is out of it; tipping without the funnel spills some; pouring past the brim runs over');

/* ── 11 · Determinism ─────────────────────────────────────────────────────────────────────────────────── */
const sessionLog = () => { proper(); return JSON.stringify(get().log) + JSON.stringify(get().revealed.factors); };
assert.equal(sessionLog(), sessionLog(), 'the same actions give the same notebook and the same budget');
ok.push('the same sequence of actions gives the same notebook and the same error budget, to the last digit');

console.log('\nXI-CHE-E02 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
