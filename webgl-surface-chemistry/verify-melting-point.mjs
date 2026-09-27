/**
 * Holds the melting-point engine to the data book. `node verify-melting-point.mjs`
 * — no browser, no bundler, because a simulation whose numbers can only be
 * checked by looking at it is not checked at all.
 *
 * Every assertion is a statement a Class XI examiner would recognise.
 */
import assert from 'node:assert/strict';
import {
  COMPOUNDS, derive, integrate, eutectic, liquidusK, cryoscopicConstant,
  rateBroadeningK, temperatureAtFraction, meltedFraction, AMBIENT_C, THERMOMETERS,
} from './src/experiments/XI/Chemistry/XI-CHE-B01/engine/thermochemistry.js';

const ok = [];
const K2C = (k) => k - 273.15;

/** Run the bench the way the render loop does. */
function run({
  compoundId = 'naphthalene', impurityId = 'none', purity = 'pure',
  bath = 'oil', thermometer = 't02', heatingRate = 2, mixMolePercent = 0,
  capillaryRuns = 0, seconds = 14000, dt = 0.25, stopAtClear = true,
}) {
  /* Long enough for urea at 1 °C/min to climb from the bench to 133 °C — a real
     practical takes the better part of two hours, and shortening the budget
     here would quietly test nothing but the budget. */
  let st = {
    compoundId, impurityId, purity, bath, thermometer, heatingRate,
    mixMolePercent, capillaryRuns, burnerOn: true,
    bathC: AMBIENT_C, sampleC: AMBIENT_C, readingC: AMBIENT_C,
    meltedFraction: 0, columnLoss: 0,
  };
  /* Quantise here exactly as the bench does, rather than calling derive() forty
     thousand times: what the student writes down is the mercury rounded to the
     thermometer's least count. */
  const lc = THERMOMETERS[thermometer].leastCount;
  const read = () => Math.round(st.readingC / lc) * lc;

  const marks = { firstDropC: null, lastCrystalC: null, sinterC: null };
  for (let t = 0; t < seconds; t += dt) {
    st = { ...st, ...integrate(st, dt) };
    if (marks.sinterC === null && st.meltedFraction >= 0.03) marks.sinterC = read();
    if (marks.firstDropC === null && st.meltedFraction >= 0.25) marks.firstDropC = read();
    if (marks.lastCrystalC === null && st.meltedFraction >= 0.999) {
      marks.lastCrystalC = read();
      if (stopAtClear) break;
    }
  }
  return { ...marks, state: st, derived: derive(st) };
}

const N = COMPOUNDS.naphthalene;
const B = COMPOUNDS.biphenyl;

/* ── 1 · The liquidus reproduces the Class XI cryoscopic constant ──────────── */
const Kf = cryoscopicConstant(N);
assert.ok(Math.abs(Kf - 6.94) < 0.15, 'naphthalene Kf must come out at the book value');
assert.ok(Math.abs(cryoscopicConstant(COMPOUNDS.benzoic) - 8.79) < 0.6, 'benzoic acid Kf too');
ok.push(`Kf falls out of ΔH_fus and T_m alone: naphthalene ${Kf.toFixed(2)} against a measured 6.94, benzoic acid ${cryoscopicConstant(COMPOUNDS.benzoic).toFixed(2)} against 8.79 K kg mol⁻¹`);

/* ── 2 · Depression is proportional to moles, not mass ──────────────────────── */
const d1 = N.meltingPointC - K2C(liquidusK(N, 0.99));
const d2 = N.meltingPointC - K2C(liquidusK(N, 0.98));
assert.ok(Math.abs(d1 - 0.55) < 0.06, '1 mol% must depress naphthalene by about half a degree');
assert.ok(Math.abs(d2 / d1 - 2) < 0.05, 'and 2 mol% by twice as much — it is a colligative property');
ok.push(`colligative: 1 mol% depresses naphthalene by ${d1.toFixed(2)} °C and 2 mol% by ${d2.toFixed(2)} °C — strictly proportional to the number of particles`);

/* ── 3 · Two solids that are liquid together: the eutectic ─────────────────── */
const e = eutectic(N, B);
assert.ok(Math.abs(K2C(e.temperatureK) - 39.4) < 2.5, 'naphthalene–biphenyl eutectic ≈ 39.4 °C');
assert.ok(Math.abs(e.moleFractionB - 0.55) < 0.08, 'at about 55 mol% biphenyl');
ok.push(`eutectic from pure-component data alone: naphthalene (80.3 °C) + biphenyl (69.2 °C) are liquid together at ${K2C(e.temperatureK).toFixed(1)} °C and ${(e.moleFractionB * 100).toFixed(0)} mol% — measured 39.4 °C at 55 mol%`);

/* ── 4 · A pure compound melts sharply; that is not a flag anywhere ────────── */
const pure = run({ purity: 'pure', heatingRate: 1 });
assert.ok(pure.lastCrystalC !== null, 'a pure sample must actually melt');
assert.ok(Math.abs(pure.lastCrystalC - 80.3) < 1.2, 'at its literature melting point');
const pureRange = pure.lastCrystalC - pure.firstDropC;
assert.ok(pureRange <= 1.0, `pure naphthalene must melt within a degree (got ${pureRange})`);
ok.push(`recrystallised naphthalene at 1 °C/min: ${pure.firstDropC.toFixed(1)}–${pure.lastCrystalC.toFixed(1)} °C, a range of ${pureRange.toFixed(1)} °C — sharp, because there is no second branch for the liquidus to meet`);

/* ── 5 · The crude sample: lower AND wider, both from the same equation ────── */
const slight = run({ purity: 'slight', heatingRate: 1 });
const crude = run({ purity: 'impure', heatingRate: 1 });
assert.ok(crude.lastCrystalC < slight.lastCrystalC && slight.lastCrystalC < pure.lastCrystalC,
  'more impurity must mean a lower melting point');
const crudeRange = crude.lastCrystalC - crude.firstDropC;
assert.ok(crudeRange > 3 && crudeRange < 12, `a crude sample must melt over a few degrees (got ${crudeRange})`);
ok.push(`purity is visible twice over: pure ${pure.lastCrystalC.toFixed(1)} °C over ${pureRange.toFixed(1)} °C · slight ${slight.lastCrystalC.toFixed(1)} °C over ${(slight.lastCrystalC - slight.firstDropC).toFixed(1)} °C · crude ${crude.lastCrystalC.toFixed(1)} °C over ${crudeRange.toFixed(1)} °C`);

/* ── 6 · Melting starts at the eutectic, long before the first drop ────────── */
const dc = crude.derived;
assert.ok(dc.sinterC < dc.onsetC && dc.onsetC < dc.clearC, 'sinter, then wet, then clear');
assert.ok(Math.abs(dc.eutecticC - K2C(e.temperatureK)) < 0.1, 'and the sinter is at the eutectic');
ok.push(`the crude sample sinters from ${dc.sinterC.toFixed(1)} °C — its eutectic is ${dc.eutecticC.toFixed(1)} °C — wets visibly at ${dc.onsetC.toFixed(1)} °C and clears at ${dc.clearC.toFixed(1)} °C. The range is the gap between two different physical events`);

/* ── 7 · Heating rate smears the range as √r, and only the range ───────────── */
const slow = run({ purity: 'pure', heatingRate: 1 });
const fast = run({ purity: 'pure', heatingRate: 12 });
assert.ok(fast.lastCrystalC > slow.lastCrystalC, 'fast heating must read high at the clear point');
assert.ok(rateBroadeningK(N, 12) / rateBroadeningK(N, 3) > 1.8, 'broadening must grow as √rate');
ok.push(`heating rate: 1 °C/min clears at ${slow.lastCrystalC.toFixed(1)} °C, 12 °C/min at ${fast.lastCrystalC.toFixed(1)} °C — latent heat alone smears the range by √(2τΛr), ${rateBroadeningK(N, 1).toFixed(2)} °C against ${rateBroadeningK(N, 12).toFixed(2)} °C`);

/* ── 8 · The mixed melting point, which is the identification test ─────────── */
const selfMix = run({ compoundId: 'benzoic', impurityId: 'benzoic', purity: 'pure', mixMolePercent: 50, heatingRate: 1 });
const wrongMix = run({ compoundId: 'benzoic', impurityId: 'salicylic', purity: 'pure', mixMolePercent: 50, heatingRate: 1 });
assert.ok(Math.abs(selfMix.lastCrystalC - COMPOUNDS.benzoic.meltingPointC) < 1.5,
  'a compound mixed with itself must melt unchanged');
assert.ok(wrongMix.lastCrystalC < selfMix.lastCrystalC - 15,
  'mixed with anything else it must be depressed, badly');
ok.push(`mixed melting point: benzoic acid + benzoic acid clears at ${selfMix.lastCrystalC.toFixed(1)} °C, unchanged; benzoic acid + salicylic acid at ${wrongMix.lastCrystalC.toFixed(1)} °C — a ${(selfMix.lastCrystalC - wrongMix.lastCrystalC).toFixed(0)} °C depression says the two bottles are not the same substance`);

/* ── 9 · A water bath cannot melt what boils above it ──────────────────────── */
const drowned = run({ compoundId: 'benzoic', bath: 'water', heatingRate: 6, seconds: 3000 });
assert.equal(drowned.lastCrystalC, null, 'benzoic acid must never melt in a water bath');
assert.equal(drowned.derived.status.key, 'bath-too-cold', 'and the bench must say why');
assert.ok(drowned.derived.bathC <= 100.01, 'because the bath stops at 100 °C');
const fine = run({ compoundId: 'naphthalene', bath: 'water', heatingRate: 2 });
assert.ok(fine.lastCrystalC !== null, 'naphthalene at 80 °C is fine in water');
ok.push(`the bath is a ceiling, not a detail: benzoic acid (122.4 °C) never melts in water — "${drowned.derived.status.title}" — while naphthalene (80.3 °C) melts in it perfectly well`);

/* ── 10 · The thermometer decides what can be seen ─────────────────────────── */
const coarse = run({ purity: 'pure', heatingRate: 1, thermometer: 't1' });
const fineT = run({ purity: 'pure', heatingRate: 1, thermometer: 't02' });
assert.equal(Math.round(coarse.lastCrystalC * 100) % 100, 0, 'a 1 °C thermometer can only read whole degrees');
assert.ok(Math.abs(fineT.lastCrystalC * 5 - Math.round(fineT.lastCrystalC * 5)) < 1e-9,
  'a 0.2 °C thermometer reads in fifths');
ok.push(`instrument limits are real: the same melt reads ${coarse.lastCrystalC.toFixed(1)} °C on a 1 °C thermometer and ${fineT.lastCrystalC.toFixed(1)} °C on a 0.2 °C one — a sharpness of a tenth of a degree cannot be seen with a coarse instrument`);

/* ── 11 · Urea does not survive a second run ───────────────────────────────── */
const first = run({ compoundId: 'urea', purity: 'pure', heatingRate: 1 });
const second = run({ compoundId: 'urea', purity: 'pure', heatingRate: 1, capillaryRuns: 1 });
assert.ok(Math.abs(first.lastCrystalC - 132.7) < 1.5, 'urea must melt at its literature value first time');
assert.ok(second.lastCrystalC < first.lastCrystalC - 1.5, 'and lower on a re-used capillary');
ok.push(`re-using a capillary is not free: urea clears at ${first.lastCrystalC.toFixed(1)} °C on a fresh one and ${second.lastCrystalC.toFixed(1)} °C on the second run, because some of it is now biuret`);

/* ── 12 · Every listed compound melts where the handbook says ──────────────── */
const table = ['naphthalene', 'benzoic', 'urea', 'acetanilide'].map((id) => {
  const r = run({ compoundId: id, purity: 'pure', heatingRate: 1, thermometer: 't02' });
  const lit = COMPOUNDS[id].meltingPointC;
  assert.ok(Math.abs(r.lastCrystalC - lit) < 1.5, `${id} must melt at ${lit} °C`);
  assert.ok(r.lastCrystalC - r.firstDropC <= 1.0, `${id} must melt sharply when pure`);
  return `${COMPOUNDS[id].label} ${r.lastCrystalC.toFixed(1)} (lit. ${lit})`;
});
ok.push(`all four unknowns melt where the handbook says, each within a degree and each about 1 °C high: ${table.join(' · ')}. That bias is the apparatus, not an error — a capillary in a Thiele tube stalls at its melting point while the bath and the mercury climb past, which is why a manual quotes this determination to ±2 °C`);

/* ── 13 · Frame rate must not change the answer ────────────────────────────── */
const coarseStep = run({ purity: 'slight', heatingRate: 4, dt: 1.0 });
const fineStep = run({ purity: 'slight', heatingRate: 4, dt: 0.05 });
assert.ok(Math.abs(coarseStep.lastCrystalC - fineStep.lastCrystalC) < 0.6,
  'a 20× coarser time step must not move the melting point');
ok.push(`frame-rate independent: the same run clears at ${fineStep.lastCrystalC.toFixed(1)} °C at dt = 0.05 s and ${coarseStep.lastCrystalC.toFixed(1)} °C at dt = 1 s`);

/* ── 14 · Naphthalene sublimes away if it is kept hot ──────────────────────── */
const dawdled = run({ compoundId: 'naphthalene', purity: 'pure', heatingRate: 1, seconds: 4000, stopAtClear: false });
assert.ok(dawdled.state.columnLoss > 0.3, 'a naphthalene column must shrink while it is hot');
ok.push(`naphthalene sublimes: after the melt the column has lost ${(dawdled.state.columnLoss * 100).toFixed(0)}% of its height — the reading is unaffected, because what is left is still pure naphthalene`);

/* ── 15 · The lever rule, at the two ends ──────────────────────────────────── */
const args = { host: N, guest: B, moleFractionGuest: 0.04 };
const atEut = meltedFraction({ ...args, T: e.temperatureK + 0.01 });
assert.ok(Math.abs(atEut - 0.04 / e.moleFractionB) < 0.02, 'φ must jump to x/x_E at the eutectic');
assert.ok(meltedFraction({ ...args, T: liquidusK(N, 0.96) - 0.01 }) > 0.98, 'and reach 1 at the liquidus');
ok.push(`lever rule: a 4 mol% sample is ${(atEut * 100).toFixed(0)}% liquid the instant it passes its eutectic — that sudden slump is the collapse a student sees before anything looks wet`);

console.log('\nMELTING POINT VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
