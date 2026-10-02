/**
 * verify.mjs — XI-CHE-C03, titration of a strong base with a strong acid.
 *
 * The curve is held against an independent derivation (stoichiometry for the
 * excess ion, Davies for its activity); the end point against the formula the
 * worksheet uses; the indicators against the pH at which each dye turns. The
 * bench half drives the real store the way a student drives the interface,
 * including swirling or not, running the tap, and reading too early.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { activityCoefficient } from '../../../../shared/chem/aqueous.js';
import { pKw } from '../../../../shared/chem/constants.js';
import { readChart } from '../../../../shared/chem/indicators.js';
import { MIX_TAU } from '../../../../shared/titration/titration.js';
import {
  NAOH_M, CHART, DROP_ML, computeWorld, equilibriumPH, flaskColour, totalAdded, remaining, shownReading, trueEquivalenceMl,
  meterReading, statusOf, initialReading, buretteReading, colourName, analyse, RECOMMENDED_DROPS,
} from './engine/titrate.js';
import { useTitrationEngine } from './engine/useTitrationEngine.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(4)}, wanted ${want} ± ${tol}`);
const S = useTitrationEngine;
const get = () => S.getState();
const fresh = (patch = {}) => { get().reset(); Object.entries(patch).forEach(([k, v]) => get()[k]?.(v)); };
/** Stirrer on until the last of the fresh titrant has gone into the flask. */
const blend = () => { get().setStirrer('on'); for (let t = 0; t < 9; t += 0.05) get().tick(0.05); get().setStirrer('off'); };
/** Wait, with the stirrer on, for the meter to say STABLE; simulated seconds taken. */
const waitStable = (max = 300) => {
  const ts = get().timeScale; get().setTimeScale(4); get().setStirrer('on');
  const t0 = get().elapsed; let took = Infinity;
  while (get().elapsed - t0 < max) { get().tick(0.05); if (meterReading(get()).stable && get().elapsed - t0 > 3) { took = get().elapsed - t0; break; } }
  get().setStirrer('off'); get().setTimeScale(ts); return took;
};
const addTo = (V) => { const dv = V - totalAdded(get()); if (dv > 0) get().addMl(dv); blend(); };
/** The independent route to the pH of the flask: moles, then Davies. */
function analyticPH(V, { Va = 20, N = 0.1, T = 25 } = {}) {
  const Vt = Va + V; const na = (NAOH_M * Va) / Vt; const cl = (N * V) / Vt;
  const ex = na - cl; const I = 0.5 * (na + cl + Math.abs(ex)); const g = activityCoefficient(1, I, T);
  return ex > 0 ? pKw(T) + Math.log10(g * ex) : -Math.log10(g * -ex);
}

/* ── 1 · The curve, against stoichiometry + Davies ───────────────────────────── */
fresh();
const volumes = [0, 5, 10, 15, 19, 19.5, 19.6, 20, 21, 25, 30]; const dev = [];
for (const V of volumes) { addTo(V); dev.push(Math.abs(get().world.bulkPH - analyticPH(totalAdded(get())))); }
assert.ok(Math.max(...dev) < 0.02, `worst deviation ${Math.max(...dev)}`);
ok.push(`through the store, the flask's pH matches an independent derivation (moles, then Davies) to ${Math.max(...dev).toFixed(3)} at every one of ${volumes.length} volumes from 0 to 30 mL; it starts at ${analyticPH(0).toFixed(2)} (0.0978 M NaOH) and ends at ${analyticPH(30).toFixed(2)}`);

/* ── 2 · The end point is where N₁V₁ = N₂V₂ says ──────────────────────────────── */
const crossing = (patch) => {
  fresh(patch);
  const Veq = trueEquivalenceMl(get());
  addTo(Math.floor(Veq - 0.5));
  while (get().world.bulkPH > pKw(get().tempC) / 2) { get().addDrop(); blend(); if (totalAdded(get()) > 60) break; }
  return { V: totalAdded(get()), Veq };
};
const cases = [{}, { setTitrantN: 0.05 }, { setTitrantN: 0.2 }, { setAnalyteMl: 10 }, { setAnalyteMl: 25 }].map(crossing);
cases.forEach((c, i) => near(c.V, c.Veq, DROP_ML + 1e-9, `case ${i}: crossing at ${c.V} vs ${c.Veq}`));
ok.push(`the pH crosses neutral at ${cases.map((c) => c.V.toFixed(2)).join(' / ')} mL for (0.1 N, 20 mL) / (0.05 N, 20 mL) / (0.2 N, 20 mL) / (0.1 N, 10 mL) / (0.1 N, 25 mL) — each within one drop of N₂V₂/N₁ = ${cases.map((c) => c.Veq.toFixed(2)).join(' / ')}`);

/* ── 3 · The burette ───────────────────────────────────────────────────────────── */
fresh();
const r0 = get().r0;
assert.ok(r0 > 0 && r0 <= 0.8 && Math.abs(r0 / 0.05 - Math.round(r0 / 0.05)) < 1e-9, `a fill never starts at zero (r0 ${r0})`);
assert.notEqual(initialReading(1), initialReading(0), 'each fill has its own initial reading');
get().addDrop(); near(shownReading(get()), Math.round((r0 + 0.05) / 0.05) * 0.05, 1e-9, 'one drop moves the reading by one graduation');
get().addMl(30); get().addMl(30);
assert.equal(remaining(get()), 0); assert.equal(statusOf(get()).key, 'empty'); near(buretteReading(get()), 50, 1e-9, 'empty at the 50 mark');
const gone = totalAdded(get()); get().addMl(1); assert.equal(totalAdded(get()), gone, 'a burette cannot give what it does not have');
get().refill(); assert.ok(remaining(get()) > 49 && get().r0 > 0);
get().addMl(2); near(totalAdded(get()), gone + 2, 1e-9, 'the flask keeps what it had; the titre is the sum of the fills');
ok.push(`the burette: a new fill starts at ${r0.toFixed(2)} mL, never 0.00; a drop moves the reading by one 0.05 graduation; it stops dead at 50.00 (${gone.toFixed(2)} mL given) and says it is empty; after a refill the flask's total carries on (${totalAdded(get()).toFixed(2)} mL)`);

/* ── 4 · A drop is not the flask ───────────────────────────────────────────────── */
fresh(); get().addMl(10); blend(); const pBefore = get().world.bulkPH;
get().addMl(5);
const lagging = get().world.bulkPH; const eqPH = equilibriumPH(get());
assert.ok(Math.abs(lagging - pBefore) < 0.05 && Math.abs(eqPH - pBefore) > 0.15, `unmixed: bulk ${lagging}, equilibrium ${eqPH}`);
assert.equal(statusOf(get()).key, 'swirl');
get().swirl(); for (let t = 0; t < 3; t += 0.05) get().tick(0.05);
assert.ok(get().unmixed < 0.2 * 5 && get().unmixed > 0.3, 'three seconds of swirling blends in most of it, not all of it');
blend(); near(get().world.bulkPH, eqPH, 0.01, 'blended');
fresh(); get().addMl(19.4); blend(); const quiet = get().world.bulkPH;
get().addDrop();
const flash = get().world.plumePH; const barely = get().world.bulkPH;
assert.ok(flash < 4 && Math.abs(barely - quiet) < 0.03, `one drop near the end: plume pH ${flash}, flask ${barely}`);
const tauStir = (() => { fresh(); get().addMl(5); get().setStirrer('on'); for (let t = 0; t < 3; t += 0.05) get().tick(0.05); return get().unmixed / 5; })();
near(tauStir, Math.exp(-3 / MIX_TAU.stir), 0.002, 'stirrer');
ok.push(`mixing: 5 mL poured in and not swirled leaves the bulk at pH ${lagging.toFixed(2)} while the flask will be ${eqPH.toFixed(2)}; 3 s of swirling leaves ${(100 * (() => { fresh(); get().addMl(5); get().swirl(); for (let t = 0; t < 3; t += 0.05) get().tick(0.05); return get().unmixed / 5; })()).toFixed(0)} % unmixed; one drop at 19.4 mL turns the cloud under the tip to pH ${flash.toFixed(1)} (the flash) while the flask is still ${barely.toFixed(2)}; a stirrer blends it to ${(tauStir * 100).toFixed(1)} % in 3 s`);

/* ── 5 · Running the tap overshoots, in proportion to how fast ──────────────────── */
const overshoot = (flow) => {
  fresh({ setFlow: flow }); get().setStirrer('on'); addTo(15); get().setStirrer('on');
  get().toggleStopcock();
  let seen = null;
  for (let i = 0; i < 20000; i += 1) {
    get().tick(0.01);
    if (seen === null && get().world.bulkPH < 8.5) { seen = totalAdded(get()); break; }
  }
  get().toggleStopcock();
  /* The true volume at which the flask reaches 8.5 once everything is mixed. */
  let lo = 15; let hi = 19.56;
  for (let k = 0; k < 40; k += 1) { const mid = (lo + hi) / 2; const x = { ...get(), deliveredBefore: 0, delivered: mid, unmixed: 0 }; if (computeWorld(x).bulkPH < 8.5) hi = mid; else lo = mid; }
  return { seen, true: hi, over: seen - hi };
};
const o = [0.1, 0.5, 1.0].map(overshoot);
assert.ok(o[0].over < o[1].over && o[1].over < o[2].over, `overshoot must grow with the flow: ${o.map((x) => x.over.toFixed(3))}`);
o.forEach((x, i) => near(x.over, [0.1, 0.5, 1.0][i] * MIX_TAU.stir, 0.1 * [0.1, 0.5, 1.0][i] + 0.012, `overshoot ${i}`));
ok.push(`the tap: the colour change is seen ${o.map((x) => x.over.toFixed(2)).join(' / ')} mL late at 0.1 / 0.5 / 1.0 mL/s — the flow times the mixing time of the stirrer (${MIX_TAU.stir} s) — so a stream past the end point has already gone past it, and a drop a second has not`);

/* ── 6 · The indicators turn where their pKa says ──────────────────────────────── */
const flaskAt = (indicator, V, drops = RECOMMENDED_DROPS[indicator]) => {
  const s = { ...get(), indicator, drops, titrantN: 0.1, analyteMl: 20, tempC: 25, deliveredBefore: 0, delivered: V, unmixed: 0, meter: 'out', r0: 0.3 };
  const w = computeWorld(s); return { w, s };
};
const sweepFor = (indicator, test) => { for (let V = 19.2; V < 19.95; V += 0.005) { const { w } = flaskAt(indicator, V); if (test(w.colour.srgb)) return V; } return null; };
fresh(); const Veq = trueEquivalenceMl(get());
const pink = (c) => c[0] - c[1] > 0.25;
const ppGone = sweepFor('phenolphthalein', (c) => !pink(c));
const moRed = sweepFor('methylOrange', (c) => c[1] < 0.7);                  // yellow turning orange
const btbBlue = sweepFor('bromothymolBlue', (c) => c[2] < c[0]);             // no longer blue-green: yellow
assert.ok(pink(flaskAt('phenolphthalein', 0).w.colour.srgb), 'phenolphthalein is pink in the base');
near(ppGone, Veq, 0.07, 'phenolphthalein goes colourless'); assert.ok(ppGone < Veq + 0.02);
assert.ok(btbBlue >= Veq - 0.011 && btbBlue <= Veq + 0.05, `bromothymol blue turns yellow at ${btbBlue}, the equivalence is ${Veq}`);
assert.ok(moRed - Veq > -0.01 && moRed - Veq < 0.2, `methyl orange turns after the equivalence, by under 1 % of the titre (${moRed - Veq})`);
const uni = [0, Veq, 25].map((V) => readChart(flaskAt('universal', V).w.colour.srgb, CHART).pH);
assert.ok(uni[0] >= 11 && uni[1] >= 6 && uni[1] <= 8 && uni[2] <= 3, `universal walks through the chart: ${uni}`);
ok.push(`indicators: phenolphthalein is pink in the base and loses its colour ${(Veq - ppGone).toFixed(2)} mL before the equivalence (${ppGone.toFixed(2)} against ${Veq.toFixed(2)}); bromothymol blue turns at ${btbBlue.toFixed(2)}; methyl orange ${(moRed - Veq).toFixed(2)} mL after it — every one within ${(0.2 / Veq * 100).toFixed(1)} % of the titre, because the jump is six units tall; universal indicator reads patch ${uni.join(' → ')} from start to equivalence to excess`);

/* ── 7 · The meter ─────────────────────────────────────────────────────────────── */
fresh(); get().setMeter('in');
assert.equal(meterReading(get()).stable, false, 'just out of storage the electrode has not settled');
const tS = waitStable(); const startRead = meterReading(get()).pH; const startTrue = analyticPH(0);
assert.ok(startTrue - startRead > 0.12 && startTrue - startRead < 0.4, `alkaline error in 0.1 M NaOH: read ${startRead}, true ${startTrue}`);
addTo(19.56 - 0.0); waitStable();
near(meterReading(get()).pH, 7.0, 0.05, 'the meter at equivalence');
ok.push(`the meter: out of storage it takes ${tS.toFixed(0)} s to settle in 0.1 M NaOH; there it reads ${startRead.toFixed(2)} for a true ${startTrue.toFixed(2)} — the alkaline error — and at the equivalence point it reads ${meterReading(get()).pH.toFixed(2)}`);

/* ── 8 · The experiment, as the worksheet runs it ──────────────────────────────── */
const runExperiment = () => {
  fresh(); get().setMeter('in'); get().setIndicator('none'); get().clearLog();
  waitStable(); get().record();
  /* A student's strategy: a mL at a time while the pH hardly moves, tenths as it
     starts to fall, single drops through the steep part, then a few mL to see it level off. */
  while (get().world.bulkPH > 11.4) { get().addMl(1); blend(); waitStable(); get().record(); }
  while (get().world.bulkPH > 9.5) { get().addMl(0.1); blend(); waitStable(); get().record(); }
  while (get().world.bulkPH > 4.0) { get().addDrop(); blend(); waitStable(); get().record(); }
  for (let k = 0; k < 3; k += 1) { get().addMl(1); blend(); waitStable(); get().record(); }
  return get().analysis.result.curve;
};
const coarse = runExperiment(); const nCoarse = get().log.filter((r) => r.flask === get().flaskNo).length;
assert.ok(trueEquivalenceMl(get()) >= coarse.lo - 1e-9 && trueEquivalenceMl(get()) <= coarse.hi + 1e-9, `steepest ${coarse.lo}–${coarse.hi} must contain ${trueEquivalenceMl(get())}`);
assert.ok(coarse.hi - coarse.lo <= 0.101, `dropwise must narrow it (${coarse.lo}–${coarse.hi})`);
assert.ok(Math.abs(coarse.errPct) < 0.5, `NaOH concentration from the dropwise curve: ${coarse.errPct} %`);
ok.push(`the experiment through the store (meter; 1 mL, then 0.1 mL, then single drops, then 3 mL to level off; ${nCoarse} readings): the steepest part of the student's own curve is ${coarse.lo.toFixed(2)}–${coarse.hi.toFixed(2)} mL and contains the true ${trueEquivalenceMl(get()).toFixed(2)}; N₁V₁ = N₂V₂ gives NaOH ${coarse.C.toFixed(4)} M against ${NAOH_M} — ${coarse.errPct >= 0 ? '+' : ''}${coarse.errPct.toFixed(2)} %`);
fresh(); get().setMeter('in'); get().setIndicator('none'); get().clearLog(); waitStable(); get().record();
for (let k = 0; k < 25; k += 1) { get().addMl(1); blend(); waitStable(); get().record(); }
const only1 = get().analysis.result.curve;
assert.ok(only1.hi - only1.lo <= 1.001 && Math.abs(only1.errPct) < 100 * (0.5 / trueEquivalenceMl(get())) + 0.5, `1 mL steps only: ${only1.errPct}`);
ok.push(`with nothing finer than 1 mL steps the end point is only known to the step: steepest ${only1.lo.toFixed(2)}–${only1.hi.toFixed(2)} mL, NaOH ${only1.C.toFixed(4)} M (${only1.errPct >= 0 ? '+' : ''}${only1.errPct.toFixed(1)} %) — the dropwise stage is not optional`);

/* ── 9 · Universal indicator and the chart ─────────────────────────────────────── */
fresh(); get().clearLog();
for (let V = 0; V <= 28; V += 1) {
  addTo(V); const pick = readChart(get().world.colour.srgb, CHART).pH;
  get().setPick(String(pick)); get().record();
}
const viaChart = get().analysis.result.curve;
assert.ok(Math.abs(viaChart.V - trueEquivalenceMl(get())) < 1.01, `via the chart: ${viaChart.V}`);
ok.push(`with universal indicator and the colour chart, 1 mL steps: the steepest part of the picked pH values is ${viaChart.lo.toFixed(0)}–${viaChart.hi.toFixed(0)} mL (true ${trueEquivalenceMl(get()).toFixed(2)}), NaOH ${viaChart.C.toFixed(4)} M (${viaChart.errPct >= 0 ? '+' : ''}${viaChart.errPct.toFixed(1)} %)`);

/* ── 10 · The notebook knows how it was taken ──────────────────────────────────── */
fresh(); get().clearLog(); get().addMl(5); get().record();
assert.ok(/not swirled in/.test(get().log[0].note), 'a reading before swirling is flagged');
fresh(); get().setMeter('in'); get().addMl(2); blend(); get().record(); assert.ok(/meter not settled/.test(get().log[get().log.length - 1].note));
fresh(); get().markEndpoint(); assert.equal(get().log[get().log.length - 1].kind, 'endpoint');
ok.push('the notebook records how each reading was taken: "not swirled in", "meter not settled", and an end point marked by eye is a separate kind of row');

/* ── 11 · Neutral is not always 7 ──────────────────────────────────────────────── */
const eqAt = (T) => { fresh({ setTemp: T }); addTo(trueEquivalenceMl(get())); return get().world.bulkPH; };
const eqs = [15, 25, 40].map(eqAt);
eqs.forEach((p, i) => near(p, pKw([15, 25, 40][i]) / 2, 0.02, `equivalence at ${[15, 25, 40][i]}`));
ok.push(`temperature: the equivalence point is pH ${eqs.map((p) => p.toFixed(2)).join(' / ')} at 15 / 25 / 40 °C — exactly pKw/2, because the salt neither hydrolyses nor buffers; neutral is H⁺ = OH⁻, and 7 only at 25 °C`);

/* ══ CONTROL-RESPONSE MATRIX ═════════════════════════════════════════════════ */
const matrix = [];
const sweep = (label, patches, key, dir) => {
  const vals = patches.map((p) => { fresh(); p(); return key(get()); });
  for (let i = 1; i < vals.length; i += 1) assert.ok(dir * (vals[i] - vals[i - 1]) > 0, `${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
  matrix.push(`${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
};
sweep('standard acid 0.05 → 0.20 N shortens the titre', [0.05, 0.1, 0.15, 0.2].map((n) => () => get().setTitrantN(n)), (s) => trueEquivalenceMl(s), -1);
sweep('NaOH pipetted 10 → 25 mL lengthens it', [10, 15, 20, 25].map((v) => () => get().setAnalyteMl(v)), (s) => trueEquivalenceMl(s), +1);
sweep('1, 5, 10, 15 mL of acid lowers the flask pH', [1, 5, 10, 15].map((v) => () => { addTo(v); }), (s) => s.world.bulkPH, -1);
sweep('universal indicator drops 1, 3, 6, 10 deepen the colour (darker flask)', [1, 3, 6, 10].map((n) => () => { get().setIndicator('universal'); get().setDrops(n); }), (s) => -(s.world.colour.srgb[0] + s.world.colour.srgb[1] + s.world.colour.srgb[2]), +1);
matrix.push('indicator, meter in/out, stirrer, flow, clock, swirl, refill, fresh flask, chart pick, record and end point each exercised above through the store');
ok.push(`EVERY setting swept on its own, and every one moves the right way:\n      ${matrix.join('\n      ')}`);

/* ── Determinism and frame-rate independence ───────────────────────────────────── */
const run = (dt) => { fresh(); get().setMeter('in'); get().addMl(5); get().swirl(); for (let t = 0; t < 12; t += dt) get().tick(dt); return [get().world.bulkPH, meterReading(get()).pH]; };
const a = run(0.05); const b = run(0.05); assert.deepEqual(a, b);
const c = run(1 / 60); near(c[0], a[0], 0.03, 'frame rate'); near(c[1], a[1], 0.08, 'frame rate meter');
ok.push(`deterministic and frame-rate independent: the same 12 s run twice is identical (flask ${a[0].toFixed(3)}, meter ${a[1].toFixed(2)}), and at 60 fps instead of 20 the flask is ${c[0].toFixed(3)}, the meter ${c[1].toFixed(2)}`);

console.log('\nXI-CHE-C03 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against first principles.\n`);
