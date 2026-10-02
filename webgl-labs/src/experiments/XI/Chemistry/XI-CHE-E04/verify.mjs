/**
 * verify.mjs — XI-CHE-E04, a standard solution of sodium carbonate.
 *
 * The kit's physics is held in XI-CHE-E02's verifier; what is checked here is what is
 * particular to this solute — a hygroscopic primary standard that heats the flask as
 * it dissolves, an open jar that carries water, and a decahydrate on the same shelf
 * that is 2.7 times the mass for the same normality — against arithmetic written here.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { planFeedback, waterDensity, newBatch, tipIn, addWater, swirl, stepBatch, CP_WATER } from '../../../../shared/standard/standard.js';
import { FORMS, useCarbonate } from './engine/carbonate.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const S = useCarbonate; const get = () => S.getState();
const AN = FORMS[0]; const UD = FORMS[1]; const DE = FORMS[2];
const run = (sec, ts = get().timeScale) => { get().setTimeScale(ts); const n = Math.round(sec / (0.05 * ts)); for (let i = 0; i < n; i += 1) get().tick(0.05); };
const fresh = () => { get().reset(); get().clearLog(); get().setTimeScale(1); };
const required = (form, N = 0.1, mL = 250) => N * (mL / 1000) * (form.M / form.n);

/* ── 1 · The mass, and the wrong jar ─────────────────────────────────────────────── */
near(required(AN), 1.3249, 1e-4, '0.1 N, 250 mL of anhydrous Na₂CO₃'); near(required(DE), 3.5768, 1e-4, '…and of the decahydrate');
const fb = (planned, form = AN) => planFeedback({ planned, required: required(form), form, forms: FORMS });
assert.equal(fb(1.325).key, 'ok'); assert.equal(fb(2.65).key, 'molar'); assert.equal(fb(0.6625).key, 'inverse');
assert.equal(fb(3.5768).key, 'form', 'the decahydrate’s mass is recognised as the wrong jar');
near(required(DE) / required(AN), 286.14 / 105.99, 1e-3, 'washing soda needs 2.70 times the mass');
ok.push(`1.325 g of anhydrous Na₂CO₃ makes 250 mL of 0.1 N; the decahydrate (M = 286.14) needs ${required(DE).toFixed(3)} g — ${(required(DE) / required(AN)).toFixed(2)} times as much — and the plan check says so`);

/* ── 2 · Hygroscopic: the jar, the bottle, the lid ─────────────────────────────────────── */
fresh(); get().setBalance('ana4'); get().setShield('closed'); get().setLid('off'); get().place(); run(30, 10); get().tare(); run(10, 10);
get().setShield('open'); get().setSpatula(0.5); get().addSolid(); get().setShield('closed'); run(20, 10);
const w0 = get().display.reading.value; run(60, 4); run(60, 4);
const gain = get().display.reading.value - w0;
assert.ok(gain > 0.0008 && gain < 0.004, `a minute on the open pan: +${(1000 * gain).toFixed(1)} mg`);
get().setLid('on'); run(20, 10); const w1 = get().display.reading.value; run(120, 4);
near(get().display.reading.value, w1, 0.0004, 'lid on: nothing more');
ok.push(`an open bottle of anhydrous Na₂CO₃ on the analytical balance gains ${(1000 * gain).toFixed(1)} mg in two minutes (the display drifts up and will not settle); with the lid on it stays put`);

/* ── 3 · Dissolving WARMS the flask ──────────────────────────────────────────────────────── */
const mol = required(AN) / AN.M;
let b = addWater(tipIn(newBatch({ flaskMl: 250, form: AN, seed: 9, roomC: 25 }), mol), 100, 25);
let maxT = b.T; for (let t = 0; t < 1500; t += 1) { if (t % 10 === 0) b = swirl(b); b = stepBatch(b, 1); maxT = Math.max(maxT, b.T); }
const dT = (-AN.dHsol * 1000 * mol) / (CP_WATER * 100);
assert.ok(dT > 0.7 && dT < 0.9, `the adiabatic rise would be ${dT.toFixed(2)} K`);
assert.ok(maxT - 25 > 0.45 * dT && maxT - 25 < 1.01 * dT, `the flask warms by ${(maxT - 25).toFixed(2)} K`);
near(b.T, 25, 0.1, 'and cools back to the room');
const dec = addWater(tipIn(newBatch({ flaskMl: 250, form: DE, seed: 9, roomC: 25 }), required(DE) / DE.M), 100, 25);
let minT = 25; let x = dec; for (let t = 0; t < 1500; t += 1) { if (t % 10 === 0) x = swirl(x); x = stepBatch(x, 1); minT = Math.min(minT, x.T); }
assert.ok(25 - minT > 1.5, `the decahydrate COOLS the flask by ${(25 - minT).toFixed(1)} K (ΔH = +67 kJ/mol)`);
ok.push(`dissolving 1.325 g of anhydrous Na₂CO₃ in 100 mL warms the flask by ${(maxT - 25).toFixed(2)} K (ΔH = −26.7 kJ/mol: at most ${dT.toFixed(2)} K); the decahydrate (+67 kJ/mol) cools it by ${(25 - minT).toFixed(1)} K`);

/* ── 4 · The full preparation: right jar, dried, lid on, flask back at the room ───────────────── */
const prepare = (formId, grams) => {
  fresh(); get().setForm(formId); get().setBalance('ana4'); get().setShield('closed'); get().setLid('off'); get().place(); run(30, 10); get().recordWeight(); get().tare(); run(10, 10);
  const add = (step) => { get().setSpatula(step); get().setShield('open'); get().addSolid(); get().setShield('closed'); get().setLid('on'); run(12, 10); get().setLid('off'); };
  while (get().display.reading.value < grams - 0.25) add(0.2);
  while (get().display.reading.value < grams - 0.002) add(0.01);
  get().setLid('on'); run(15, 10); get().remove(); run(5, 10); get().tare(); run(5, 10); get().zero(); get().place(); run(25, 10); get().recordWeight();
  get().remove(); get().setLid('off'); get().tip(); get().setLid('on'); get().place(); run(25, 10); get().recordWeight(); get().remove();
  get().setLid('off'); get().rinse('bottle'); get().rinse('funnel'); get().rinse('funnel'); get().rinse('funnel');
  get().setWaterStep(50); get().addWater(); get().addWater();
  for (let i = 0; i < 14; i += 1) { get().swirl(); run(20, 10); }
  get().setWaterStep(10); while (get().display.level < -45) get().addWater();
  get().setWaterStep(1); get().setEye(0); while (get().display.seen < -3) get().addWater();
  run(1500, 30);
  get().setWaterStep(0.05); let n = 0; while (get().display.seen < -0.15 && n < 400) { get().addWater(); n += 1; }
  get().stopper(true); get().invertMany(); get().invertMany();
  get().reveal();
  return get();
};
const good = prepare('anhydrous', 1.325);
assert.ok(good.revealed, `the check ran: ${good.message?.text ?? ''}`);
assert.ok(Math.abs(good.revealed.totalPct) < 0.5, `within ${good.revealed.totalPct.toFixed(3)} % of the notebook's figure`);
assert.ok(Math.abs(good.revealed.vsTargetPct) < 1.2, `and ${good.revealed.vsTargetPct.toFixed(3)} % from 0.1 N`);
ok.push(`anhydrous Na₂CO₃, lid on between additions, flask back at the room, dropper at eye level, turned over ten times: ${good.revealed.N.toFixed(5)} N — ${good.revealed.totalPct >= 0 ? '+' : ''}${good.revealed.totalPct.toFixed(3)} % from the notebook, ${good.revealed.vsTargetPct >= 0 ? '+' : ''}${good.revealed.vsTargetPct.toFixed(2)} % from 0.1 N`);

/* ── 5 · The jar left open, and the wrong jar ─────────────────────────────────────────────────── */
const ud = prepare('undried', 1.325);
const pur = ud.revealed.factors.find((f) => f.id === 'purity');
near(pur.pct, -0.6, 1e-9, 'a jar left open: the solid is 99.4 % Na₂CO₃'); assert.ok(ud.revealed.totalPct < good.revealed.totalPct - 0.3, 'and the flask is weaker than the notebook says');
const de = prepare('decahydrate', 1.325);                                  // the mass of the anhydrous salt, of the WRONG jar
assert.ok(de.revealed.vsTargetPct < -55, `1.325 g of washing soda makes ${de.revealed.N.toFixed(4)} N, ${de.revealed.vsTargetPct.toFixed(0)} % from the 0.1 N asked for`);
assert.ok(Math.abs(de.revealed.totalPct) < 1.0, 'while the notebook, which knows the jar, is consistent with it');
ok.push(`a jar left open: purity ${pur.pct.toFixed(1)} % and the flask is ${(good.revealed.totalPct - ud.revealed.totalPct).toFixed(2)} % weaker; 1.325 g of washing soda in the flask makes ${de.revealed.N.toFixed(4)} N — ${de.revealed.vsTargetPct.toFixed(0)} % from the target — though the arithmetic on the notebook is consistent with the jar chosen`);

/* ── 6 · Determinism ───────────────────────────────────────────────────────────────────────────── */
const sessionLog = () => { prepare('anhydrous', 1.325); return JSON.stringify(get().log) + JSON.stringify(get().revealed.factors); };
assert.equal(sessionLog(), sessionLog(), 'the same actions give the same notebook and the same error budget');
ok.push('the same sequence of actions gives the same notebook and the same error budget, to the last digit');

console.log('\nXI-CHE-E04 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
