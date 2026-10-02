/**
 * verify.mjs — XI-CHE-F02, Lassaigne's test.
 *
 * What is checked: the fusion tube behaves as a hot tube with sodium in it (a heating curve, sodium
 * that melts at 98 °C and is lost as vapour if it is kept hot for long, a conversion that needs heat);
 * the sodium is shared out as the chemistry shares it (arithmetic done by hand below, not by the
 * function under test); the textbook procedure finds the right elements in all six compounds and the
 * usual mistakes cost what they should — an unfused sample, a halogen test that is not boiled, too little
 * sodium for a compound with both nitrogen and sulphur, a tube that is not hot.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useLassaigne as S } from './engine/useLassaigne.js';
import {
  COMPOUNDS, ORDER, SAMPLES, compoundOfSample, fuse, stepFusion, initialFusion, sodiumState, kFusion, NA_MOLAR, NA_PER_MOLECULE, activeOf, elementsOf, modelEvidence,
} from './engine/lassaigne.js';
import { describe } from '../../../../shared/qualitative/chemistry.js';

const ok = [];
const get = () => S.getState();
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const sampleOf = (id) => ORDER.map((o) => COMPOUNDS[o].id).indexOf(id) + 1;
const settle = (sec) => { for (let i = 0; i < Math.round(sec / 0.5); i += 1) get().tick(0.05); };
const text = (id) => describe(get().tubes.find((t) => t.id === id).obs);

/* ── 1 · Six compounds ───────────────────────────────────────────────────────────────────── */
{
  assert.equal(new Set(ORDER).size, SAMPLES);
  const names = Array.from({ length: SAMPLES }, (_, i) => compoundOfSample(i + 1).id);
  assert.notEqual(names.join(), COMPOUNDS.map((c) => c.id).join(), 'not in catalogue order');
  const elems = COMPOUNDS.map((c) => elementsOf(c));
  assert.ok(elems.some((e) => e.N && e.S) && elems.some((e) => e.N && e.Cl) && elems.some((e) => !e.N && !e.S && !e.Cl), 'N+S, N+Cl and a compound with none of them are all on the bench');
  ok.push(`six compounds in six unlabelled samples (${COMPOUNDS.map((c) => c.name).join(', ')}): one with N and S, one with N and Cl, one with none of the three`);
}

/* ── 2 · The fusion tube ──────────────────────────────────────────────────────────────── */
{
  let fz = { ...initialFusion(), flame: true, started: true };
  const at = (secs) => { let f = fz; for (let t = 0; t < secs; t += 0.5) f = stepFusion(f, 0.5); return f; };
  const T60 = at(60).T; const T120 = at(120).T;
  near(T60, 25 + (900 - 25) * (1 - Math.exp(-60 / 35)), 8, 'heating, Newton: 25 + (900 − 25)(1 − e^{−t/35 s})');
  assert.ok(T120 > 850 && T60 > 700 && T60 < 800, `${T60.toFixed(0)} °C after a minute, ${T120.toFixed(0)} after two`);
  assert.equal(sodiumState({ ...fz, T: 60 }), 'solid'); assert.equal(sodiumState({ ...fz, T: 200 }), 'molten'); assert.equal(sodiumState({ ...fz, T: 600 }), 'vapour');
  /* Kept hot and not used, the sodium goes as vapour. */
  const long = at(600);
  assert.ok(long.na < 0.6 * fz.na, `sodium kept at ${long.T.toFixed(0)} °C for ten minutes: ${(100 * long.na / fz.na).toFixed(0)} % of it is left`);
  /* Conversion needs heat. */
  assert.equal(kFusion(250), 0); near(kFusion(700), 0.05, 1e-9, 'k at 700 °C'); assert.ok(kFusion(800) / kFusion(700) > 2.2 && kFusion(500) / kFusion(700) < 0.25, 'steeply temperature dependent');
  const tau = 1 / kFusion(700);
  ok.push(`the tube heats as T = 25 + 875(1 − e^(−t/35)): ${T60.toFixed(0)} °C after 60 s, ${T120.toFixed(0)} after 120; sodium is solid below 98 °C, molten, then fuming above 450 °C, and a tube kept hot for ten minutes has lost ${(100 - 100 * long.na / fz.na).toFixed(0)} % of it; the conversion rate is zero below 300 °C and 0.05 s⁻¹ at 700 °C (a time constant of ${tau.toFixed(0)} s)`);
}

/* ── 3 · How the sodium is shared out: by hand ─────────────────────────────────────────── */
{
  const thio = COMPOUNDS.find((c) => c.id === 'thiourea');
  const mol = 50 / thio.M;                                                 // mmol of thiourea in 50 mg
  const handCalc = (naMg) => {
    const na = naMg / NA_MOLAR;
    const na1 = Math.max(0, na - NA_PER_MOLECULE * mol);                    // the matrix
    const CN0 = Math.min(2 * mol, 1 * mol, na1);                            // cyanide needs N and C (one C per thiourea) and one Na
    const na3 = na1 - CN0;
    const S2 = Math.min(mol, na3 / 2);
    const SCN = Math.min(mol - S2, CN0);
    return { CN: CN0 - SCN, S2, SCN };
  };
  for (const mg of [40, 120]) {
    const f = fuse(thio, { sampleMg: 50, na: mg / NA_MOLAR, progress: 1, efficiency: 1 });
    const h = handCalc(mg);
    near(f.CN, h.CN, 1e-9, `CN at ${mg} mg Na`); near(f.S2, h.S2, 1e-9, `S²⁻ at ${mg} mg Na`); near(f.SCN, h.SCN, 1e-9, `SCN⁻ at ${mg} mg Na`);
  }
  const lo = fuse(thio, { sampleMg: 50, na: 40 / NA_MOLAR, progress: 1, efficiency: 1 }); const hi = fuse(thio, { sampleMg: 50, na: 120 / NA_MOLAR, progress: 1, efficiency: 1 });
  assert.ok(lo.SCN > 0 && lo.S2 === 0 && lo.CN === 0, `thiourea with 40 mg of sodium: the sulfur is left without sodium to reduce it and takes the cyanide as thiocyanate (${lo.SCN.toFixed(2)} mmol SCN⁻)`);
  assert.ok(hi.SCN === 0 && hi.CN > 0.5 && hi.S2 > 0.5, `with 120 mg: cyanide ${hi.CN.toFixed(2)} and sulfide ${hi.S2.toFixed(2)} mmol, separately`);
  const urea = fuse(COMPOUNDS.find((c) => c.id === 'urea'), { sampleMg: 50, na: 120 / NA_MOLAR, progress: 1, efficiency: 1 });
  near(urea.CN, 50 / 60.06, 1e-9, 'urea has one carbon per two nitrogens: one cyanide per molecule, not two');
  ok.push(`sodium shared out as the chemistry does it (matrix, then halide, cyanide, sulfide at two each; a sulfur left over takes the cyanide as SCN⁻), checked against a by-hand calculation: 50 mg of thiourea with 40 mg of sodium gives ${lo.SCN.toFixed(2)} mmol of thiocyanate and no cyanide or sulfide; with 120 mg it gives ${hi.CN.toFixed(2)} mmol CN⁻ and ${hi.S2.toFixed(2)} mmol S²⁻; urea gives one CN⁻ per molecule (one carbon)`);
}

/* ── 4 · The procedure of the manual, on each compound ─────────────────────────────────────── */
const fuseIt = (id, { naMg = 120, sampleMg = 50, heatFirst = 60, after = 150 } = {}) => {
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf(id)); get().setSodium(naMg); get().setSampleMg(sampleMg);
  get().toggleFlame(); settle(heatFirst);
  get().addCompound(); settle(after);
  get().plunge(); get().filter();
};
/** The N test: FeSO₄, boil, acid, FeCl₃. The S tests. The halogen test: HNO₃, boil, cool, AgNO₃. Returns what the four tubes show. */
const testsOn = ({ boilHalogen = true } = {}) => {
  const dose = (tube, reagent, n) => { get().select(tube); get().setReagent(reagent); get().setDrops(n); get().addPicked(); };
  const hot = (tube, secs) => { get().select(tube); get().setBath('hot'); settle(secs); get().setBath('air'); settle(200); };
  dose('A', 'feso4', 5); hot('A', 150); dose('A', 'hcl', 10); dose('A', 'fecl3', 5);
  dose('B', 'nitroprusside', 3);
  dose('C', 'acoh', 10); dose('C', 'pbac2', 5);
  dose('D', 'hno3', 40); if (boilHalogen) hot('D', 400); dose('D', 'agno3', 10);
  return { N: text('A'), Sn: text('B'), Spb: text('C'), X: text('D') };
};
{
  const verdict = (r) => ({
    N: /blue/.test(r.N) || /blood red|dark red|red solution/.test(r.N), S: /violet|purple/.test(r.Sn) || /black/.test(r.Spb), X: /white curdy|white fine|precipitate/.test(r.X) && !/black/.test(r.X),
  });
  const table = [];
  for (const c of COMPOUNDS) {
    fuseIt(c.id);
    const r = testsOn(); const v = verdict(r);
    table.push(`${c.name} (N${v.N ? "+" : "−"} S${v.S ? "+" : "−"} X${v.X ? "+" : "−"})`);
    assert.equal(v.N, c.N > 0, `${c.name}: nitrogen test ${v.N} (A: ${r.N})`);
    assert.equal(v.S, c.S > 0, `${c.name}: sulfur test ${v.S} (B: ${r.Sn}; C: ${r.Spb})`);
    assert.equal(v.X, c.X > 0, `${c.name}: halogen test ${v.X} (D: ${r.X})`);
  }
  ok.push(`the manual's procedure — fuse (120 mg Na, 50 mg compound), plunge, filter; FeSO₄, boil, acid, FeCl₃ for N; nitroprusside and lead acetate for S; HNO₃, boil, AgNO₃ for the halogen — finds the right elements in all six: ${table.join('; ')}`);
}

/* ── 5 · The mistakes ───────────────────────────────────────────────────────────────────── */
{
  /* A halogen test that is not boiled: urea has no chlorine, and gives a white precipitate. */
  fuseIt('urea'); const unboiled = testsOn({ boilHalogen: false });
  assert.match(unboiled.X, /white curdy precipitate/, 'urea, halogen test not boiled: a white precipitate (silver cyanide) — a false positive'); fuseIt('urea'); assert.doesNotMatch(testsOn().X, /precipitate/, 'and boiled, nothing');
  /* Thiourea, sulphur: unboiled gives black silver sulfide. */
  fuseIt('thiourea'); assert.match(testsOn({ boilHalogen: false }).X, /black/, 'thiourea, not boiled: black silver sulfide');
  /* Too little sodium for N + S: thiocyanate, which is blood-red with iron(III) and not blue, and nothing with nitroprusside. */
  fuseIt('thiourea', { naMg: 70 });
  const t = testsOn(); const thioEx = get().fz.extract.mmol;
  assert.ok(thioEx.SCN > 2 * thioEx.CN, `thiourea with 70 mg of sodium (some of it burned off): thiocyanate ${thioEx.SCN.toFixed(2)} mmol against ${thioEx.CN.toFixed(2)} of cyanide`);
  assert.match(t.N, /red/, `the "nitrogen" test is blood-red, not Prussian blue (${t.N})`);
  fuseIt('thiourea', { naMg: 55 }); const poor = get().fz.extract.mmol; assert.ok(poor.S === 0 && poor.CN < 0.1 && poor.SCN > 0, `with less again there is no free sulfide and next to no cyanide (${poor.S}, ${poor.CN.toFixed(3)}, SCN ${poor.SCN.toFixed(2)}): ${text('A') && ''}no sulfur test either`);
  /* An unfused sample tested directly. */
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf('thiourea')); get().setSource('water');
  const direct = testsOn(); assert.ok(!/blue|violet|black|precipitate/.test(`${direct.N} ${direct.Sn} ${direct.Spb} ${direct.X}`), `an unfused sample shows nothing: ${direct.N} / ${direct.Sn}`);
  /* A cold start gives less. */
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf('urea')); get().setSodium(120); get().toggleFlame(); get().addCompound(); settle(180); get().plunge(); get().filter();
  const cold = get().fz.extract.mmol.CN; fuseIt('urea'); const good = get().fz.extract.mmol.CN;
  assert.ok(cold < 0.85 * good, `the compound put on cold sodium gives ${cold.toFixed(2)} mmol of CN⁻ against ${good.toFixed(2)}`);
  /* Plunged before the tube is hot: it does not crack. */
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf('urea')); get().toggleFlame(); settle(8); get().addCompound(); get().plunge(); assert.equal(get().message.key, 'cold-plunge');
  /* Too much sodium: a violent plunge. */
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf('urea')); get().setSodium(150); get().toggleFlame(); settle(60); get().addCompound(); settle(30); get().plunge();
  assert.equal(get().message.key, 'violent', `150 mg of sodium: ${get().fz.naLeftMg.toFixed(0)} mg of it left to meet the water`); assert.ok(get().fz.extract.mmol.CN < good, 'and some of the extract is lost');
  /* Over-heating wastes the sodium before the compound is on. */
  get().reset(); get().setTimeScale(10); get().setSample(sampleOf('urea')); get().setSodium(60); get().toggleFlame(); settle(500); const naLeft = get().fz.na * NA_MOLAR;
  assert.ok(naLeft < 45, `sodium kept red-hot for eight minutes before the compound: ${naLeft.toFixed(0)} mg of 60 is left`);
  ok.push('the mistakes cost what they should: an unboiled halogen test gives silver cyanide (white, on urea which has no halogen) and silver sulfide (black, on thiourea); a modest 70 mg of sodium on thiourea gives mostly thiocyanate — blood-red, not blue — and less again gives no sulfide at all; an unfused sample shows nothing at all; compound on cold sodium gives less; plunging a cold tube does not crack it; 150 mg of sodium plunges violently and loses extract; eight red-hot minutes burn off the sodium');
}

/* ── 6 · The tubes: acid before boiling loses the cyanide ─────────────────────────────────────── */
{
  fuseIt('urea');
  const dose = (tube, reagent, n) => { get().select(tube); get().setReagent(reagent); get().setDrops(n); get().addPicked(); };
  dose('A', 'hcl', 15); dose('A', 'feso4', 5); get().setBath('hot'); settle(200); dose('A', 'fecl3', 5);
  assert.doesNotMatch(text('A'), /blue/, `acidified first: the cyanide went as HCN (${text('A')})`);
  dose('B', 'feso4', 25); get().select('B'); get().setBath('hot'); settle(200); dose('B', 'hcl', 10); dose('B', 'fecl3', 5);
  assert.doesNotMatch(text('B'), /blue/, `too much FeSO₄ used up the alkali and the cyanide escaped as HCN (${text('B')})`);
  ok.push('acid before the iron, or so much iron(II) that the alkali is used up, lets the cyanide go as HCN: no blue');
}

/* ── 7 · The conclusion ────────────────────────────────────────────────────────────────── */
{
  fuseIt('thiourea');
  get().check(); assert.equal(get().result, null); assert.equal(get().message.key, 'answer-incomplete');
  get().setNitrogen('present'); get().setSulphur('absent'); get().setHalogen('absent'); get().check();
  assert.deepEqual(get().result.wrong, ['S']); assert.ok(!JSON.stringify(get().message).includes('sulphur is present'), 'a wrong answer is marked, not corrected');
  get().reveal(); assert.equal(get().revealed, true);
  get().setSulphur('present'); get().check(); assert.equal(get().result.both, true);
  const ev = modelEvidence(compoundOfSample(sampleOf('thiourea')));
  assert.ok(ev.N && ev.S && ev.X && ev.X0, 'the model evidence covers N, S, the halogen test and what an unboiled one does');
  get().reset(); get().reveal(); assert.equal(get().revealed, false, 'no peeking');
  ok.push('the conclusion: all three must be answered; a wrong one is marked, not corrected; the model tests are shown only after an attempt');
}

/* ── 8 · Determinism ───────────────────────────────────────────────────────────────────── */
{
  const run = () => { fuseIt('chloroaniline'); get().clearLog(); get().select('A'); get().setReagent('agno3'); get().setDrops(5); get().addPicked(); get().record(); return JSON.stringify([get().fz.extract.mmol, get().log.map(({ id, ...r }) => r)]); };
  assert.equal(run(), run());
  ok.push('the same actions give the same extract and the same notebook, to the last digit');
}

void describe; void activeOf;
console.log('\nXI-CHE-F02 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
