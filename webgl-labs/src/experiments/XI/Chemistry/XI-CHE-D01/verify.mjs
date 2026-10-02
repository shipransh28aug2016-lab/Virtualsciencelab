/**
 * verify.mjs — XI-CHE-D01, the Fe³⁺/SCN⁻ equilibrium.
 *
 * The bench's chemistry is the shared speciation solver, so what is checked
 * here is what the bench does WITH it: that the equilibrium it reports obeys
 * its own constant at every temperature, that the reaction quotient and the
 * displacement it predicts agree for every dose in every starting state (the
 * thing Le Chatelier's argument rests on), that the colour is built from the
 * species and nothing else, and that the droppers, the tube, the baths and
 * the notebook do what a bench does.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { R } from '../../../../shared/chem/constants.js';
import { epsilonAt } from '../../../../shared/chem/spectra.js';
import {
  BANDS, REAGENTS, TUBE_MAX_ML, EPS_FESCN, REF_A, CFG, observe, add, instant, kThermo, fescnFromA, statusOf, activeOf,
  useFeScn,
} from './engine/fescn.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const rel = (got, want, tol, label) => assert.ok(Math.abs(got / want - 1) <= tol, `${label}: got ${got}, wanted ${want} (${tol * 100} %)`);
const reagent = (id) => REAGENTS.find((r) => r.id === id);
const reference = () => CFG.initial();
const dose = (c, id, drops) => add(c, reagent(id), drops * 0.05);
const S = useFeScn;
const get = () => S.getState();
const fresh = () => { get().reset(); get().clearLog(); get().setTimeScale(1); };
const aOf = (c, T = 25) => observe(c, T).A447;

/* ── 1 · The reference mixture ────────────────────────────────────────────────── */
const ref = observe(reference(), 25);
assert.ok(ref.converged, 'the reference tube solves');
near(ref.A447, REF_A, 1e-12, 'REF_A');
assert.ok(ref.A447 > 0.2 && ref.A447 < 0.7, `the reference is pale, not blank and not dark: A = ${ref.A447}`);
assert.ok(ref.pH > 2.8 && ref.pH < 3.5, `an unacidified 1 mM FeCl₃ is pH 3: ${ref.pH}`);
assert.ok(ref.species.FeOH / (ref.free.Fe + ref.species.FeOH + ref.species.FeSCN) > 0.7, 'most of the iron in plain FeCl₃ is the hydrolysed FeOH²⁺');
ok.push(`the reference tube (0.001 M each): A₄₄₇ = ${ref.A447.toFixed(3)}, pH ${ref.pH.toFixed(2)} (the iron is mostly FeOH²⁺ before any thiocyanate is added), ${ref.name}`);

/* ── 2 · The books balance, in every state a student can reach ─────────────────── */
const states = [];
for (const [id, n] of [['fecl3', 4], ['kscn', 12], ['oxalate', 1], ['oxalate', 6], ['hno3', 20], ['water', 40]]) states.push([`${n} × ${id}`, dose(reference(), id, n)]);
states.push(['acid then oxalate', dose(dose(reference(), 'hno3', 20), 'oxalate', 3)]);
let worst = 0;
for (const [label, c] of states) for (const T of [0, 25, 60]) {
  const o = observe(c, T); const V = c.volumeMl; const sp = o.species;
  assert.ok(o.converged, `${label} @ ${T} °C solves`);
  const Fe = o.free.Fe + (sp.FeSCN ?? 0) + (sp.FeOH ?? 0) + (sp.Feox ?? 0) + (sp.Feox2 ?? 0) + (sp.Feox3 ?? 0);
  const SCN = o.free.SCN + (sp.FeSCN ?? 0);
  rel(Fe, c.mmol.Fe / V, 1e-8, `${label} iron balance`); rel(SCN, c.mmol.SCN / V, 1e-8, `${label} thiocyanate balance`);
  if (c.mmol.ox > 0) rel((o.free.ox ?? 0) + (sp.HOx ?? 0) + (sp.H2Ox ?? 0) + (sp.Feox ?? 0) + 2 * (sp.Feox2 ?? 0) + 3 * (sp.Feox3 ?? 0), c.mmol.ox / V, 1e-8, `${label} oxalate balance`);
  worst = Math.max(worst, Math.abs(Fe / (c.mmol.Fe / V) - 1));
}
ok.push(`mass balance closes for iron, thiocyanate and oxalate in ${states.length * 3} states (each dose at 0, 25 and 60 °C) — worst ${worst.toExponential(0)}`);

/* ── 3 · At rest the quotient IS the constant, at every temperature ────────────── */
for (const T of [0, 10, 25, 40, 60]) {
  const o = observe(reference(), T); const g = o.gamma;
  const Q = (g(2) * o.species.FeSCN) / (g(3) * o.free.Fe * g(-1) * o.free.SCN);
  rel(Q, kThermo(T), 1e-6, `Q = K° at ${T} °C`);
}
const expectK = Math.exp((-(-20) * 1000 / R) * (1 / 333.15 - 1 / 298.15));
rel(kThermo(60) / kThermo(25), expectK, 1e-9, 'van t Hoff for ΔH = −20 kJ/mol');
ok.push(`at rest Q equals K° to 10⁻⁶ at 0, 10, 25, 40 and 60 °C; K°(60 °C)/K°(25 °C) = ${expectK.toFixed(3)} from ΔH = −20 kJ/mol, derived here by hand`);

/* ── 4 · Warm a tube and the colour fades; cool it and it deepens ───────────────── */
const temps = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const As = temps.map((T) => aOf(reference(), T));
for (let i = 1; i < As.length; i += 1) assert.ok(As[i] < As[i - 1], `A falls with temperature: ${temps[i - 1]} → ${temps[i]} °C (${As[i - 1]} → ${As[i]})`);
ok.push(`A₄₄₇ falls at every 5 °C step from ${As[0].toFixed(2)} at 0 °C to ${As[As.length - 1].toFixed(2)} at 60 °C: heat is a product of the forward reaction`);

/* ── 5 · What each reagent does to the colour ───────────────────────────────────── */
const eff = (id, n) => { const c = dose(reference(), id, n); return { A: aOf(c), x: observe(c, 25).FeSCN, c }; };
const series = (id) => [1, 2, 4, 8, 12, 16, 20].map((n) => eff(id, n));
for (const id of ['fecl3', 'kscn']) {
  const s = series(id);
  assert.ok(s[0].A > REF_A, `${id}: even one drop deepens the colour`);
  for (let i = 1; i < s.length; i += 1) assert.ok(s[i].x > s[i - 1].x, `${id}: more drops, more complex`);
}
let prev = ref.FeSCN;
for (const n of [1, 2, 4, 8, 12, 16, 20]) { const x = eff('oxalate', n).x; assert.ok(x < prev, `oxalate: [FeSCN²⁺] falls with every drop (${n})`); prev = x; }
assert.ok(eff('oxalate', 1).x < 0.5 * ref.FeSCN, 'one drop of oxalate (half the iron) already takes more than half the complex');
assert.ok(eff('oxalate', 6).x < 1e-6 * ref.FeSCN, 'six drops of oxalate leave no complex');
prev = ref.FeSCN;
for (const n of [4, 12, 24, 40, 80]) { const x = eff('water', n).x; assert.ok(x < prev, `water: [FeSCN²⁺] falls (${n} drops)`); prev = x; }
assert.ok(eff('hno3', 10).A > REF_A, 'acid deepens the colour of unacidified iron(III) thiocyanate — it pulls the iron out of FeOH²⁺');
ok.push(`FeCl₃ and KSCN deepen the colour with every drop; oxalate empties it (6 drops: ${(eff('oxalate', 6).x / ref.FeSCN).toExponential(0)} of the complex left); water fades it; HNO₃ deepens it through the iron's hydrolysis, not through H⁺ in the equation`);

/* ── 6 · Q/K against the actual displacement — for every dose in every starting state ─ */
const starts = [
  ['reference', reference()],
  ['+12 drops KSCN', dose(reference(), 'kscn', 12)],
  ['+20 drops HNO₃', dose(reference(), 'hno3', 20)],
  ['+1 drop oxalate', dose(reference(), 'oxalate', 1)],
  ['+6 drops FeCl₃', dose(reference(), 'fecl3', 6)],
];
let judged = 0; let nearMiss = 0;
for (const [label, c0] of starts) for (const T of [5, 25, 55]) for (const r of REAGENTS) for (const n of [1, 3, 8, 20]) {
  const before = { content: c0, obs: observe(c0, T) };
  const mL = n * 0.05;
  const c1 = add(c0, r, mL);
  if (c1.spilledMl) continue;
  const info = instant(before, c1, r, mL, T);
  const after = observe(c1, T);
  const frozen = before.obs.species.FeSCN * c0.volumeMl / c1.volumeMl;
  const delta = after.FeSCN - frozen;
  if (Math.abs(delta) < 1e-10 * frozen) { nearMiss += 1; continue; }
  assert.equal(info.direction, delta > 0 ? 'right' : 'left', `${label}, ${n} drops ${r.id} @ ${T} °C: Q/K = ${info.ratio.toPrecision(3)} but the complex moved ${delta > 0 ? 'up' : 'down'} (${frozen.toExponential(3)} → ${after.FeSCN.toExponential(3)})`);
  judged += 1;
}
assert.ok(judged > 250, `enough doses judged (${judged})`);
ok.push(`Q/K < 1 ⇔ the complex rises, Q/K > 1 ⇔ it falls — for ${judged} doses (5 starting tubes × 3 temperatures × 5 reagents × 4 sizes), solved independently both ways (the quotient with the complex held, and the equilibrium reached)`);

/* ── 7 · The colour is built from what is there ─────────────────────────────────── */
for (const [label, c] of states) {
  const o = observe(c, 25);
  const sum = Object.keys(BANDS).reduce((a, id) => a + epsilonAt(BANDS[id], 447) * (o.species[id] ?? 0), 0);
  near(o.A447, sum, 1e-12, `${label}: A₄₄₇ = Σ ε c ℓ`);
}
near(EPS_FESCN, 4700, 1, 'ε of FeSCN²⁺ at 447 nm is the 4700 the worksheet gives');
near(fescnFromA(ref.A447) * EPS_FESCN, ref.A447, 1e-12, 'x = A/εℓ inverts Beer–Lambert');
const lum = (c) => 0.2126 * c.srgb[0] + 0.7152 * c.srgb[1] + 0.0722 * c.srgb[2];
const deep = observe(dose(reference(), 'fecl3', 10), 25); const gone = observe(dose(reference(), 'oxalate', 6), 25);
assert.ok(lum(deep.colour) < lum(ref.colour) - 0.05, 'excess iron is darker than the reference');
assert.ok(lum(gone.colour) > lum(ref.colour) + 0.03, 'oxalate leaves it paler than the reference');
const [r, g, b] = deep.colour.srgb;
assert.ok(r > g && g > b, `the complex is a warm colour — red above green above blue (${deep.colour.hex})`);
ok.push(`A₄₄₇ is Σ εᵢcᵢℓ over the species for ${states.length} different tubes; ε(FeSCN²⁺, 447 nm) = ${EPS_FESCN.toFixed(0)}; the deepened tube is ${deep.name} (${deep.colour.hex}), the reference ${ref.name}, the oxalate tube ${gone.name}`);

/* ── 8 · The competition for oxalate: protons take it ────────────────────────────── */
const oxState = (c) => {
  const o = observe(c, 25); const sp = o.species;
  const bound = (sp.Feox ?? 0) + (sp.Feox2 ?? 0) + (sp.Feox3 ?? 0);
  const free = o.free.ox ?? 0;
  return { nbar: ((sp.Feox ?? 0) + 2 * (sp.Feox2 ?? 0) + 3 * (sp.Feox3 ?? 0)) / bound, alpha: free / (free + (sp.HOx ?? 0) + (sp.H2Ox ?? 0)), pH: o.pH };
};
const neutral = oxState(dose(reference(), 'oxalate', 3));
const acidic = oxState(dose(dose(reference(), 'hno3', 20), 'oxalate', 3));
const veryAcidic = oxState(dose(dose(reference(), 'hno3', 60), 'oxalate', 3));
assert.ok(neutral.alpha > 20 * acidic.alpha && acidic.alpha > veryAcidic.alpha, `less of the oxalate is the dianion as the acid goes up (${neutral.alpha.toExponential(1)}, ${acidic.alpha.toExponential(1)}, ${veryAcidic.alpha.toExponential(1)})`);
assert.ok(neutral.nbar > acidic.nbar && acidic.nbar > veryAcidic.nbar, `…so the iron holds fewer oxalates each (${neutral.nbar.toFixed(2)}, ${acidic.nbar.toFixed(2)}, ${veryAcidic.nbar.toFixed(2)})`);
ok.push(`the same 3 drops of oxalate: pH ${neutral.pH.toFixed(1)} → ${acidic.pH.toFixed(1)} → ${veryAcidic.pH.toFixed(1)} as acid goes in; the share of oxalate that is C₂O₄²⁻ falls from ${(100 * neutral.alpha).toFixed(0)} % to ${(100 * acidic.alpha).toFixed(1)} % to ${(100 * veryAcidic.alpha).toFixed(1)} % and the oxalates per bound iron from ${neutral.nbar.toFixed(2)} to ${acidic.nbar.toFixed(2)} to ${veryAcidic.nbar.toFixed(2)}`);

/* ── 9 · The droppers, the tube and the spill ───────────────────────────────────── */
fresh();
get().select('A'); get().dose('fecl3', 20);
let t = activeOf(get());
near(t.content.volumeMl, 11.0, 1e-12, '20 drops = 1.00 mL');
near(t.content.mmol.Fe, 0.01 + 0.1, 1e-12, '20 drops of 0.10 M FeCl₃ = 0.10 mmol Fe');
near(t.content.mmol.Cl, 0.03 + 0.3, 1e-12, '…and 0.30 mmol Cl⁻');
const over = add(reference(), reagent('fecl3'), 8);        // 8 mL on top of 10: 3 mL too many
near(over.volumeMl, TUBE_MAX_ML, 1e-12, 'a tube holds 15 mL');
near(over.spilledMl, 3, 1e-12, '3 mL ran over the rim');
rel(over.mmol.Fe / over.volumeMl, (0.01 + 0.8) / 18, 1e-12, 'what is left has the concentration of what was mixed');
fresh(); get().select('B'); get().setReagent('water'); get().setDrops(20);
for (let i = 0; i < 7; i += 1) get().addPicked();
t = activeOf(get());
assert.ok(t.content.spilledMl > 0 && t.content.volumeMl === TUBE_MAX_ML, 'overfilling through the panel spills');
assert.equal(statusOf(get()).key, 'spilled', 'and the bench says so');
get().fresh('B'); t = activeOf(get());
near(t.content.volumeMl, 10, 1e-12, 'a fresh tube is the reference again'); near(t.obs.A447, REF_A, 1e-12, '…and reads it');
ok.push('20 drops are 1.00 mL and 0.10 mmol of iron; 8 mL on top of 10 fills the tube to 15 mL and 3 mL runs over — at the concentration of what was mixed; the bench says so; a fresh tube is the reference again');

/* ── 10 · The baths: a tube comes to temperature, the colour follows ─────────────── */
fresh(); get().select('C'); get().setBath('hot');
for (let i = 0; i < 800; i += 1) get().tick(0.05);             // 40 s = one time constant
let C = get().tubes[2];
near(C.tempC, 25 + 35 * (1 - Math.exp(-1)), 0.2, 'after τ = 40 s a tube is 63 % of the way to 60 °C');
assert.equal(statusOf(get()).key, 'changing', 'and the bench says it is still changing');
const Amid = C.obs.A447;
for (let i = 0; i < 7200; i += 1) get().tick(0.05);          // ten time constants in all
C = get().tubes[2];
near(C.tempC, 60, 1e-9, 'it arrives'); near(C.obs.A447, aOf(reference(), 60), 1e-9, '…and the observation is exactly that of 60 °C');
assert.ok(C.obs.A447 < Amid && Amid < REF_A, 'the colour faded on the way (reference → midway → hot)');
get().select('B'); get().setBath('ice');
for (let i = 0; i < 6000; i += 1) get().tick(0.05);
near(get().tubes[1].tempC, 0, 1e-9, 'the ice bath brings a tube to 0 °C');
const Acold = get().tubes[1].obs.A447; assert.ok(Acold > REF_A * 2, 'and the colour deepens');
get().setBath('air');
for (let i = 0; i < 30000; i += 1) get().tick(0.05);          // 25 min in the air: τ = 150 s
near(get().tubes[1].tempC, 25, 1e-6, 'taken out, it returns to the room');
near(get().tubes[1].obs.A447, REF_A, 1e-6, '…and to the colour it had');
ok.push(`a tube follows its bath with τ = 40 s (${(25 + 35 * (1 - Math.exp(-1))).toFixed(1)} °C after one τ); at 60 °C it reads ${C.obs.A447.toFixed(3)}, in ice ${Acold.toFixed(3)}; back in the rack it returns to ${REF_A.toFixed(3)}`);

/* ── 11 · The notebook ───────────────────────────────────────────────────────────── */
fresh();
const take = (tube, id, n, bath) => {
  get().select(tube); if (id) get().dose(id, n);
  if (bath) { get().setBath(bath); for (let i = 0; i < 8000; i += 1) get().tick(0.05); }
  get().record(); return get().log[get().log.length - 1];
};
const rows = {
  ref: take('A'),
  fe: take('B', 'fecl3', 6), scn: take('C', 'kscn', 6), ox: take('D', 'oxalate', 2),
};
fresh();
const acid = take('A', 'hno3', 10); const water = take('B', 'water', 40); const hot = take('C', null, 0, 'hot'); const cold = take('D', null, 0, 'ice');
for (const [k, r] of Object.entries({ fe: rows.fe, scn: rows.scn, acid, cold })) { assert.equal(r.predicted, 'right', `${k}: predicted right`); assert.equal(r.observed, 'deeper', `${k}: observed deeper`); }
for (const [k, r] of Object.entries({ ox: rows.ox, water, hot })) { assert.equal(r.predicted, 'left', `${k}: predicted left`); assert.equal(r.observed, 'paler', `${k}: observed paler`); }
assert.equal(rows.ref.predicted, '—', 'an untouched tube predicts nothing'); assert.equal(rows.ref.observed, 'no change');
assert.ok(rows.fe.QK < 1 && rows.ox.QK > 1 && water.QK > 1 && acid.QK < 1, 'Q/K is below 1 for the reagents that deepen, above 1 for those that fade');
assert.ok(hot.KT < 1 && cold.KT > 1 && hot.QK === null, 'a bath is judged by K(T)/K(25 °C), not by a quotient');
assert.ok(rows.fe.nDrops === 6 && rows.fe.stress === 'fecl3', 'the row knows what was done');
const a = get().analysis;
assert.equal(a.judged, a.agree, 'the notebook agrees with itself: every prediction matched the colour');
assert.ok(a.series.length >= 2 && a.series.every((s) => s.points.length >= 1), 'the graph has a series per reagent');
get().select('A'); get().dose('hno3', 5); get().dose('water', 5); get().record();
assert.equal(get().log[get().log.length - 1].stress, 'mixed'); assert.match(get().log[get().log.length - 1].note, /more than one stress/);
ok.push('the notebook: Q/K and the colour agree for FeCl₃, KSCN, acid and cold (right, deeper) and for oxalate, water and heat (left, paler); an untouched tube predicts nothing; baths are judged by K(T)/K(25 °C); a tube given two stresses is flagged');

/* ── 12 · The worksheet's Kc ─────────────────────────────────────────────────────── */
fresh();
const Kref = take('A').Kc; const Kacid = take('B', 'hno3', 20).Kc; const Kox = take('C', 'oxalate', 3).Kc;
assert.ok(Kref > 50 && Kref < 400, `the worksheet constant for the plain tube is of order 10²: ${Kref}`);
assert.ok(Kacid > Kref, 'acidifying (which stops the iron hydrolysing) raises the apparent Kc towards the true one');
assert.equal(Kox, null, 'and a tube with oxalate has no Kc to quote');
ok.push(`the worksheet's Kc = x/((Fe₀−x)(SCN₀−x)) is ${Kref.toFixed(0)} in the plain tube and ${Kacid.toFixed(0)} after 20 drops of acid: the hydrolysis it ignores is what makes it vary; none is quoted for a tube holding oxalate`);

/* ── 13 · The solver is fast enough to stand behind a hand ────────────────────────── */
const t0 = performance.now();
for (let i = 0; i < 120; i += 1) observe(dose(reference(), REAGENTS[i % 5].id, 1 + (i % 20)), 5 + (i % 50));
const per = (performance.now() - t0) / 120;
assert.ok(per < 40, `a speciation takes ${per.toFixed(1)} ms; a bench that waits on it is not a bench`);
ok.push(`speciation takes ${per.toFixed(1)} ms per tube (a dose or a step of a bath re-solves one)`);

/* ── 14 · Determinism ─────────────────────────────────────────────────────────────── */
const run = () => { fresh(); take('A', 'fecl3', 5); take('B', 'kscn', 5); take('C', 'oxalate', 2); return JSON.stringify(get().log); };
assert.equal(run(), run(), 'the same actions give the same notebook');
ok.push('the same sequence of actions gives the same notebook, to the last digit');

console.log('\nXI-CHE-D01 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
