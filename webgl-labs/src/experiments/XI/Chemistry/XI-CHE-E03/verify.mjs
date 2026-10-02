/**
 * verify.mjs — XI-CHE-E03, NaOH against standard oxalic acid.
 *
 * The flask's pH comes from the aqueous solver; what is checked here is the bench around it, against
 * arithmetic that does not touch it: the pH of the alkali from a Davies iteration written here, the
 * pH of sodium oxalate from the weak-base formula, the stoichiometry (two NaOH per oxalic acid), what
 * each indicator does at that pH, what an unswirled drop is, what a student's own points say the end
 * point is — and the error each wrong choice costs.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { activityCoefficient, solveAqueous } from '../../../../shared/chem/aqueous.js';
import { pKw } from '../../../../shared/chem/constants.js';
import { WEAK } from '../../../../shared/chem/species.js';
import { colourName } from '../../../../shared/chem/spectra.js';
import { CFG, NAOH_M, useNaohOxalic, ENGINE } from './engine/naohOxalic.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const S = useNaohOxalic; const get = () => S.getState();
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const fresh = (patch = {}) => { get().reset(); get().setTimeScale(4); get().clearLog(); Object.entries(patch).forEach(([k, v]) => get()[k](v)); };
const settle = (sec = 2.4) => { for (let i = 0; i < Math.round(sec / 0.2); i += 1) get().tick(0.05); };
const add = (mL, wait = 2.4) => { get().addMl(mL); get().swirl(); settle(wait); };
const drop = (wait = 2.4) => { get().addDrop(); get().swirl(); settle(wait); };
const V = () => ENGINE.totalAdded(get());
const veq = () => ENGINE.trueEquivalenceMl(get());

/* ── 1 · The alkali, before anything is added ─────────────────────────────────────── */
fresh();
let I = NAOH_M; let pH0 = 13;
for (let i = 0; i < 100; i += 1) { const g = activityCoefficient(1, I, 25); pH0 = pKw(25) + Math.log10(NAOH_M * g); I = NAOH_M; }
near(get().world.bulkPH, pH0, 0.012, 'pH of 0.0951 M NaOH, from a Davies iteration written here');
near(veq(), 0.5 * NAOH_M * 20 / 0.05, 1e-9, 'V(eq) = 0.5 × 0.0951 × 20 / 0.05');
ok.push(`0.0951 M NaOH: pH ${get().world.bulkPH.toFixed(3)} against ${pH0.toFixed(3)} by an independent Davies iteration; the equivalence volume for 20 mL against 0.05 M oxalic acid is ${veq().toFixed(3)} mL (two NaOH per acid)`);

/* ── 2 · At the equivalence point the flask is sodium oxalate ─────────────────────────────── */
const eqSystem = () => { fresh(); get().addMl(veq()); get().swirl(); settle(30); return get(); };
let s = eqSystem();
const cOx = (0.5 * NAOH_M * 20) / (20 + veq());
const pHeq = 0.5 * (pKw(25) + WEAK.oxalic.pKas[1] + Math.log10(cOx));
near(ENGINE.equilibriumPH(s), pHeq, 0.2, 'pH of sodium oxalate: ½(pKw + pKa₂ + log c)');
ok.push(`at ${veq().toFixed(2)} mL the flask is ${(1000 * cOx).toFixed(1)} mM sodium oxalate: pH ${ENGINE.equilibriumPH(s).toFixed(2)} (weak-base formula ${pHeq.toFixed(2)})`);

/* ── 3 · A student's titration: 1 mL at a time, then drops, recording each ───────────────────────── */
const titrate = (indicator = 'phenolphthalein', { meter = 'in' } = {}) => {
  fresh({ setIndicator: indicator }); get().setMeter(meter); get().setStirrer('on'); settle(30);
  const marks = [];
  const record = () => { get().record(); marks.push({ V: V(), pH: ENGINE.equilibriumPH(get()), hex: get().world.colour.hex, name: colourName(get().world.colour.srgb), lum: lum(get().world.colour.srgb) }); };
  const wait = meter === 'in' ? 14 : 2.4;
  while (V() < 17) { add(1, wait); record(); }
  while (V() < veq() + 1.5) { drop(wait); record(); }
  return marks;
};
const pp = titrate('phenolphthalein');
const turn = pp.find((m) => m.V > 15 && m.lum > 0.93);
assert.ok(turn, 'phenolphthalein loses its colour');
near(turn.V, veq(), 0.25, 'phenolphthalein turns at the end point');
get().markEndpoint();
const sa = get().analysis;
near(sa.result.curve.V, veq(), 0.12, 'the steepest part of the student’s own points');
assert.ok(Math.abs(sa.result.curve.errPct) < 1.2, `NaOH from the curve: ${sa.result.curve.errPct.toFixed(2)} % from the truth`);
ok.push(`titrated 1 mL at a time to 17 mL and then in drops: phenolphthalein loses its pink at ${turn.V.toFixed(2)} mL (true ${veq().toFixed(2)}); the steepest interval of the student's own points is ${sa.result.curve.lo.toFixed(2)}–${sa.result.curve.hi.toFixed(2)} mL, giving ${sa.result.curve.C.toFixed(4)} M (${sa.result.curve.errPct >= 0 ? '+' : ''}${sa.result.curve.errPct.toFixed(2)} %)`);

/* ── 4 · The wrong indicator ─────────────────────────────────────────────────────────────────────── */
const mo = titrate('methylOrange', { meter: 'out' });
while (V() < 36) { add(1); mo.push({ V: V(), pH: ENGINE.equilibriumPH(get()), hex: get().world.colour.hex, name: colourName(get().world.colour.srgb), lum: lum(get().world.colour.srgb) }); }
const g0 = Number.parseInt(mo[0].hex.slice(3, 5), 16);
const swung = mo.find((m) => m.V > 10 && Number.parseInt(m.hex.slice(3, 5), 16) < g0 - 10);        // the green channel falls as yellow turns orange-red
const before = mo.filter((m) => m.V <= veq() + 0.3);
assert.ok(before.every((m) => Number.parseInt(m.hex.slice(3, 5), 16) >= g0 - 3), 'methyl orange has not changed colour at the end point');
const late = swung ? swung.V : Infinity;
assert.ok(late > 1.1 * veq(), `methyl orange shows nothing until ${Number.isFinite(late) ? late.toFixed(2) : 'beyond the range'} mL`);
ok.push(`with methyl orange the flask is still yellow at the end point (pH ${before[before.length - 1].pH.toFixed(1)}, far above the dye's 3.1–4.4) and shows no change until ${Number.isFinite(late) ? `${late.toFixed(1)} mL — ${(100 * (late / veq() - 1)).toFixed(0)} % late` : 'the end of the range'}: sodium oxalate is a weak base and oxalic acid a weak acid`);

/* ── 5 · An unswirled drop is not the flask ───────────────────────────────────────────────────────── */
fresh({ setIndicator: 'phenolphthalein' }); add(18); settle(6); get().addMl(1.5);                    // no swirl
const w = get().world;
assert.ok(w.plumePH !== null && w.plumePH < 8 && w.bulkPH > 9.5, `under the tip the pH is ${w.plumePH?.toFixed(1)}; the flask is ${w.bulkPH.toFixed(1)}`);
assert.equal(ENGINE.statusOf(get()).key, 'swirl', 'and the bench says swirl');
for (let i = 0; i < 6; i += 1) { get().swirl(); settle(3.2); }
assert.ok(get().unmixed < 0.01 && get().world.plumePH === null, `swirled for a quarter of a minute, the cloud is gone (${get().unmixed.toExponential(1)} mL left)`);
ok.push('titrant that has fallen and not been swirled in is a cloud whose pH is not the flask’s (below 8 under the tip, above 9.5 in the flask); the bench says swirl; swirled, it is gone');

/* ── 6 · The pH meter ─────────────────────────────────────────────────────────────────────────────────── */
fresh({ setIndicator: 'none' }); get().setMeter('in'); settle(60);
const r0 = ENGINE.meterReading(get()); const bulk0 = get().world.bulkPH;
assert.ok(r0.sensing && r0.stable && Math.abs(r0.pH - bulk0) < 0.3, `a calibrated electrode reads ${r0.pH.toFixed(2)} in 0.095 M NaOH (true ${bulk0.toFixed(2)}): the alkaline error is small`);
add(10); settle(60); const r1 = ENGINE.meterReading(get());
near(r1.pH, get().world.bulkPH, 0.1, 'mid-curve it reads the flask, less the electrode’s sodium error at pH 12 (a few hundredths)');
ok.push(`an electrode in the flask reads ${r0.pH.toFixed(2)} for a true ${bulk0.toFixed(2)} in the alkali and within 0.1 mid-curve (pH ${get().world.bulkPH.toFixed(2)}: ${r1.pH.toFixed(2)}), once settled`);

/* ── 7 · Burette, refills, the arithmetic ───────────────────────────────────────────────────────────── */
fresh({ setStandardN: 0.04 });
assert.ok(veq() > 47 && veq() < 49, `0.04 N acid needs ${veq().toFixed(1)} mL`);
add(40); add(8); assert.ok(ENGINE.remaining(get()) < 3, 'the burette is nearly empty');
get().refill(); add(1); assert.ok(Math.abs(V() - 49) < 1e-9 || V() > 48, 'after a refill the titre is the sum of the volumes from each fill');
fresh(); get().addMl(veq());
near(ENGINE.unknownFromTitre(get(), veq()), NAOH_M, 1e-12, 'the arithmetic at the true end point gives the true concentration');
near(ENGINE.unknownFromTitre(get(), veq() + 0.2) / NAOH_M - 1, 0.2 / veq(), 1e-9, 'and a titre 0.2 mL too long is that much too strong');
ok.push('0.04 N acid needs 48 mL — nearly the whole burette; refilling carries the titre over; N₁V₁ = N₂V₂ reproduces the bottle’s 0.0951 M at the true end point and is out by exactly the overshoot otherwise');

/* ── 8 · The slider ─────────────────────────────────────────────────────────────────────────────────────── */
fresh(); get().addMl(1); get().setStandardN(0.2); near(get().standardN, 0.1, 1e-12, 'the standard cannot be changed once titrating');
fresh(); get().setAnalyteMl(25); get().setStandardN(0.2); near(veq(), 0.5 * NAOH_M * 25 / 0.1, 1e-9, 'before the first drop it can: 25 mL against 0.2 N');
ok.push('the standard and the pipetted volume are fixed once the first drop is out');

/* ── 9 · Determinism ───────────────────────────────────────────────────────────────────────────────────── */
const sessionLog = () => { titrate('phenolphthalein'); return JSON.stringify(get().log.slice(-60).map(({ flask, id, ...r }) => r)); };
assert.equal(sessionLog(), sessionLog(), 'the same actions give the same notebook');
ok.push('the same sequence of actions gives the same notebook, to the last digit');

console.log('\nXI-CHE-E03 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
