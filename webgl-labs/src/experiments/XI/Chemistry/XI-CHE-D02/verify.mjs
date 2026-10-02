/**
 * verify.mjs — XI-CHE-D02, the cobalt(II) chloro-complex equilibrium.
 *
 * The shared solver does the chemistry; what is checked here is what the bench
 * does with it — against derivations written here that never touch the solver:
 * the cobalt balance solved by bisection, the van 't Hoff factor by hand, the
 * silver chloride and salt solubility from their products, Beer–Lambert for two
 * absorbers — and that the quotient and the displacement agree for every dose in
 * every starting state, which is the whole of Le Chatelier's argument.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { R } from '../../../../shared/chem/constants.js';
import {
  REAGENTS, TUBE_MAX_ML, OFF_SCALE, CFG, REF, observe, add, instant, kThermo, epsPink, epsBlue, spectrometer, fractionFromA, statusOf,
  activeOf, useCoCl, LOGK_COCL4, DH_COCL4,
} from './engine/cocl.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const rel = (got, want, tol, label) => assert.ok(Math.abs(got / want - 1) <= tol, `${label}: got ${got}, wanted ${want} (${tol * 100} %)`);
const reagent = (id) => REAGENTS.find((r) => r.id === id);
const reference = () => CFG.initial();
const dose = (c, id, n) => add(c, reagent(id), n * (reagent(id).mlPer ?? 0.05), { units: n });
const S = useCoCl;
const get = () => S.getState();
const fresh = () => { get().reset(); get().clearLog(); get().setTimeScale(1); get().setWavelength('510'); get().setCell('1'); };
const K25 = 4.5e-3;

/* ── 1 · The reference tube ──────────────────────────────────────────────────── */
const ref = observe(reference(), 25);
assert.ok(ref.converged && ref.x < 0.001, `0.10 M CoCl₂ is the pink hexaaqua ion and nothing else (x = ${ref.x})`);
near(ref.A(510, 1), 0.1 * epsPink(510), 5e-3, 'A(510) = ε c ℓ for the pink ion');
assert.ok(ref.A(510, 1) > 0.3 && ref.A(510, 1) < 0.6, 'a 0.1 M pink solution reads about 0.4–0.5 in a 1 cm cell');
const [rr, gg, bb] = ref.colour.srgb; assert.ok(rr > gg && bb > gg, `pink: red and blue above green (${ref.colour.hex})`);
ok.push(`the reference tube: 0.10 M Co(II), ${(100 * ref.x).toFixed(2)} % blue, A₅₁₀ = ${ref.A(510, 1).toFixed(3)} (ε = ${epsPink(510).toFixed(1)}), ${ref.name} ${ref.colour.hex}`);

/* ── 2 · The cobalt balance, solved independently ────────────────────────────── */
/* x = fraction of cobalt as CoCl₄²⁻; chloride free = Cl_total − 4 x Co; R = x/(1−x) = K [Cl]⁴. Bisection on x. */
const independentX = (Co, Cl, K) => {
  let lo = 0; let hi = Math.min(1, Cl / (4 * Co));
  for (let i = 0; i < 200; i += 1) { const x = (lo + hi) / 2; const ClF = Cl - 4 * x * Co; const f = x / (1 - x) - K * ClF ** 4; if (f > 0) hi = x; else lo = x; }
  return (lo + hi) / 2;
};
let worstX = 0;
for (const T of [0, 25, 60, 80]) for (const n of [4, 9, 15, 25, 40, 60]) {
  const c = dose(reference(), 'hcl', n); const o = observe(c, T);
  const want = independentX(c.mmol.Co / c.volumeMl, c.mmol.Cl / c.volumeMl, kThermo(T));
  worstX = Math.max(worstX, Math.abs(o.x - want));
}
assert.ok(worstX < 1e-8, `the fraction blue agrees with the independent bisection (worst ${worstX})`);
ok.push(`the fraction of cobalt that is CoCl₄²⁻ agrees with an independent bisection on R = K[Cl⁻]⁴ for 24 tubes (6 doses of HCl × 0, 25, 60, 80 °C) to ${worstX.toExponential(0)}`);

/* ── 3 · Half blue where K says ──────────────────────────────────────────────── */
let lo = 1; let hi = 12;                                          // chloride per cobalt-tube, mmol: bisect on total chloride for x = ½
for (let i = 0; i < 100; i += 1) { const mid = (lo + hi) / 2; const o = observe({ volumeMl: 1, mmol: { Co: 0.05, Cl: mid, Ag: 0, Na: 0 }, spilledMl: 0 }, 25); if (o.x < 0.5) lo = mid; else hi = mid; }
const half = observe({ volumeMl: 1, mmol: { Co: 0.05, Cl: (lo + hi) / 2, Ag: 0, Na: 0 }, spilledMl: 0 }, 25);
near(half.x, 0.5, 1e-6, 'half blue'); rel(half.free.Cl, K25 ** -0.25, 1e-6, 'half blue at [Cl⁻] = K^(−1/4)');
ok.push(`half the cobalt is blue at [Cl⁻] = ${half.free.Cl.toFixed(3)} M = K^(−¼) with K = 4.5 × 10⁻³ M⁻⁴ — the 3.9 M that is seen in the lab`);

/* ── 4 · The fourth power: the slope the student will draw is 4 ──────────────── */
const pts = [];
for (const n of [8, 11, 14, 18, 24, 32, 40]) { const c = dose(reference(), 'hcl', n); const o = observe(c, 25); pts.push([Math.log10(o.free.Cl), Math.log10(o.x / (1 - o.x))]); }
const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length; const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
near(slope, 4, 1e-6, 'log R against log [Cl⁻]');
const intercept = my - slope * mx; near(intercept, LOGK_COCL4, 1e-6, 'and the intercept is log K');
ok.push(`log₁₀(blue/pink) against log₁₀[Cl⁻] over seven HCl doses: slope ${slope.toFixed(6)} (four chlorides), intercept ${intercept.toFixed(4)} = log₁₀ K`);

/* ── 5 · Temperature: forward is endothermic ──────────────────────────────────── */
const vh = Math.exp((DH_COCL4 * 1000 / R) * (1 / 298.15 - 1 / 353.15));
rel(kThermo(80) / kThermo(25), vh, 1e-9, 'van t Hoff for ΔH = +50 kJ/mol');
const base = dose(reference(), 'hcl', 24);
const xs = [0, 10, 20, 25, 30, 40, 50, 60, 70, 80].map((T) => observe(base, T).x);
for (let i = 1; i < xs.length; i += 1) assert.ok(xs[i] > xs[i - 1], `bluer at every step up in temperature (${i})`);
assert.ok(xs[0] < 0.15 && xs[xs.length - 1] > 0.9, 'a mixture that is nearly pink at 0 °C is nearly all blue at 80 °C');
ok.push(`K(80 °C)/K(25 °C) = ${vh.toFixed(1)} from ΔH = +50 kJ/mol, derived here by hand; a tube of 24 drops of HCl goes from ${(100 * xs[0]).toFixed(0)} % blue at 0 °C through ${(100 * xs[3]).toFixed(0)} % at 25 °C to ${(100 * xs[xs.length - 1]).toFixed(0)} % at 80 °C, rising at every step`);

/* ── 6 · What each reagent does ───────────────────────────────────────────────── */
let prev = ref.x;
for (const n of [3, 6, 10, 15, 20, 30, 40]) { const x = observe(dose(reference(), 'hcl', n), 25).x; assert.ok(x > prev, `HCl: bluer with every dose (${n})`); prev = x; }
const half2 = dose(reference(), 'hcl', 30);
prev = observe(half2, 25).x;
for (const n of [5, 10, 20, 40]) { const x = observe(dose(half2, 'water', n), 25).x; assert.ok(x < prev, `water: pinker (${n} drops)`); prev = x; }
prev = observe(half2, 25).x;
for (const n of [2, 4, 8]) { const x = observe(dose(half2, 'nacl', n), 25).x; assert.ok(x > prev, `NaCl: bluer (${n} pinches)`); prev = x; }
prev = observe(half2, 25).x;
for (const n of [5, 10, 20, 30]) { const x = observe(dose(half2, 'agno3', n), 25).x; assert.ok(x < prev, `AgNO₃: pinker (${n} drops)`); prev = x; }
ok.push('HCl and salt turn it bluer with every dose; water and silver nitrate turn a blue tube pinker with every dose');

/* ── 7 · Silver chloride and salt: the solids ─────────────────────────────────── */
const KSP_AG = 10 ** -9.75;
const ag = dose(reference(), 'agno3', 8);                          // 0.4 mmol Ag⁺ into 0.6 mmol Cl⁻
const oa = observe(ag, 25); const Va = ag.volumeMl;
rel(oa.free.Ag * oa.free.Cl, KSP_AG, 1e-6, '[Ag⁺][Cl⁻] = Ksp where AgCl is present');
near(oa.solids.AgCl * Va, 0.4, 1e-4, 'nearly all the 0.4 mmol of silver is solid');
near(oa.free.Cl * Va, 0.2, 1e-3, 'and the chloride left is the excess: 0.2 mmol');
const brine = dose(reference(), 'nacl', 14);
const ob = observe(brine, 25);
rel(ob.free.Na * ob.free.Cl, 37.7, 1e-6, 'a saturated brine: [Na⁺][Cl⁻] = 37.7');
assert.ok(ob.solids.NaCl > 0.5, 'the salt that does not dissolve is a solid');
assert.equal(observe(dose(reference(), 'nacl', 8), 25).solids.NaCl, 0, '8 pinches (0.5 g in 3 mL) all dissolve');
let worst = 0;
for (const [c, T] of [[ag, 25], [brine, 25], [dose(dose(reference(), 'hcl', 30), 'agno3', 25), 40], [dose(dose(reference(), 'nacl', 12), 'hcl', 20), 5]]) {
  const o = observe(c, T); const V = c.volumeMl; const sp = o.species;
  assert.ok(o.converged, 'solves');
  const co = o.free.Co + sp.CoCl4; const cl = o.free.Cl + 4 * sp.CoCl4 + 2 * (sp.AgCl2 ?? 0) + (o.solids.AgCl ?? 0) + (o.solids.NaCl ?? 0);
  const agT = o.free.Ag + (sp.AgCl2 ?? 0) + (o.solids.AgCl ?? 0); const na = o.free.Na + (o.solids.NaCl ?? 0);
  worst = Math.max(worst, Math.abs(co / (c.mmol.Co / V) - 1), Math.abs(cl / (c.mmol.Cl / V) - 1));
  if (c.mmol.Ag > 0) worst = Math.max(worst, Math.abs(agT / (c.mmol.Ag / V) - 1));
  if (c.mmol.Na > 0) worst = Math.max(worst, Math.abs(na / (c.mmol.Na / V) - 1));
}
assert.ok(worst < 1e-8, `mass balances close (${worst})`);
ok.push(`silver chloride: [Ag⁺][Cl⁻] = Ksp and 0.4 mmol Ag⁺ takes 0.4 mmol Cl⁻ out; brine saturates at [Na⁺][Cl⁻] = 37.7 with the rest as crystals (8 pinches all dissolve, 14 do not); cobalt, chloride, silver and sodium balance to ${worst.toExponential(0)} in four mixed tubes`);

/* ── 8 · Q/K against the actual displacement — every dose in every starting state ── */
const starts = [
  ['reference', reference()], ['+10 drops HCl', dose(reference(), 'hcl', 10)], ['+30 drops HCl', dose(reference(), 'hcl', 30)],
  ['+40 drops HCl +20 AgNO₃', dose(dose(reference(), 'hcl', 40), 'agno3', 20)], ['+8 pinches NaCl', dose(reference(), 'nacl', 8)],
];
let judged = 0;
for (const [label, c0] of starts) for (const T of [5, 25, 70]) for (const r of REAGENTS) for (const n of [1, 3, 8, Math.min(20, r.maxUnits)]) {
  const before = { content: c0, obs: observe(c0, T) };
  const mL = n * (r.mlPer ?? 0.05);
  const c1 = add(c0, r, mL, { units: n });
  if (c1.spilledMl) continue;
  const info = instant(before, c1, r, mL, T);
  const after = observe(c1, T);
  const frozen = (before.obs.species.CoCl4 ?? 0) * c0.volumeMl / c1.volumeMl;
  const delta = after.species.CoCl4 - frozen;
  if (Math.abs(delta) < 1e-9 * Math.max(frozen, 1e-12)) continue;
  assert.equal(info.direction, delta > 0 ? 'right' : 'left', `${label}, ${n} ${r.id} @ ${T} °C: Q/K = ${info.ratio.toPrecision(3)} but CoCl₄²⁻ went ${delta > 0 ? 'up' : 'down'}`);
  judged += 1;
}
assert.ok(judged > 150, `enough doses judged (${judged})`);
ok.push(`Q/K < 1 ⇔ CoCl₄²⁻ rises, Q/K > 1 ⇔ it falls — for ${judged} doses (5 starting tubes × 3 temperatures × 4 reagents × 4 sizes), solved independently both ways`);

/* ── 9 · The spectrometer ─────────────────────────────────────────────────────── */
const blue = observe(dose(reference(), 'hcl', 40), 25);
near(blue.A(692, 1), epsBlue(692) * blue.blue + epsPink(692) * blue.pink, 1e-9, 'A = ε_pink c_pink ℓ + ε_blue c_blue ℓ');
assert.equal(spectrometer(blue, 692, 1), null, 'a strong blue at 692 nm in a 1 cm cell is off the scale');
assert.ok(spectrometer(blue, 600, 0.1) !== null && spectrometer(blue, 600, 0.1) > 0.3, 'a weaker band and a thin cell bring it on scale');
let dev = 0;
for (const n of [10, 14, 20, 30, 40, 60]) {
  const c = dose(reference(), 'hcl', n); const o = observe(c, 25); const A = spectrometer(o, 600, 0.1, n);
  const x = fractionFromA(A, 600, 0.1, c.mmol.Co / c.volumeMl);
  dev = Math.max(dev, Math.abs(x - o.x));
}
assert.ok(dev < 0.02, `the worksheet's fraction recovers the true one to ${dev.toFixed(4)}`);
assert.ok(epsBlue(692) > 100 * epsPink(692) && epsBlue(692) > 500, 'the blue band is a hundred times the pink one');
ok.push(`A = εcℓ for two absorbers; at 692 nm in 1 cm a blue tube is off the scale (A > ${OFF_SCALE}), at 600 nm in 1 mm it reads; the worksheet's Beer–Lambert fraction recovers the true blue fraction to ${dev.toFixed(3)}`);

/* ── 10 · The droppers, the tube, the spill ───────────────────────────────────── */
fresh();
get().select('A'); get().dose('hcl', 20);
let t = activeOf(get());
near(t.content.volumeMl, 4.0, 1e-12, '20 drops = 1.00 mL'); near(t.content.mmol.Cl, 0.6 + 12, 1e-12, '20 drops of 12 M HCl = 12 mmol Cl⁻');
get().select('B'); get().dose('nacl', 2); t = activeOf(get());
near(t.content.mmol.Na, 2 * 0.1 / 58.44 * 1000, 1e-3, 'a pinch is 0.10 g of NaCl'); near(t.content.volumeMl, 3, 1e-12, 'and adds no volume');
get().select('C'); get().dose('agno3', 20); t = activeOf(get()); near(t.content.mmol.Ag, 1.0, 1e-12, '20 drops of 1.0 M AgNO₃ = 1.00 mmol Ag⁺');
const over = add(reference(), reagent('water'), 20);
near(over.volumeMl, TUBE_MAX_ML, 1e-12, 'a tube holds 15 mL'); near(over.spilledMl, 8, 1e-12, '8 mL ran over the rim');
rel(over.mmol.Co / over.volumeMl, 0.3 / 23, 1e-12, 'at the concentration of what was mixed');
fresh(); get().select('D'); get().setReagent('water'); get().setDrops(50);
for (let i = 0; i < 5; i += 1) get().addPicked();
assert.equal(statusOf(get()).key, 'spilled', 'overfilling spills, and the bench says so');
get().setReagent('nacl'); assert.equal(get().drops, 10, 'switching to the salt clamps the dose to the most a pinch-count allows (10)');
get().fresh('D'); near(activeOf(get()).content.volumeMl, 3, 1e-12, 'a fresh tube is the reference again');
ok.push('20 drops of 12 M HCl are 1.00 mL and 12 mmol Cl⁻; a pinch is 0.10 g (1.711 mmol) of NaCl and no volume; 20 drops of 1.0 M AgNO₃ are 1.00 mmol; 20 mL on 3 fills the tube to 15 and 8 mL runs over at the concentration of what was mixed; the bench says so');

/* ── 11 · The baths ───────────────────────────────────────────────────────────── */
fresh(); get().select('C'); get().dose('hcl', 24); const x25 = get().tubes[2].obs.x; get().setBath('hot');
for (let i = 0; i < 800; i += 1) get().tick(0.05);              // one τ
near(get().tubes[2].tempC, 25 + 55 * (1 - Math.exp(-1)), 0.2, 'after τ = 40 s a tube is 63 % of the way to 80 °C');
assert.equal(statusOf(get()).key, 'changing');
const xMid = get().tubes[2].obs.x;
for (let i = 0; i < 7200; i += 1) get().tick(0.05);
near(get().tubes[2].tempC, 80, 1e-9, 'it arrives'); const xHot = get().tubes[2].obs.x;
near(xHot, observe(get().tubes[2].content, 80).x, 1e-9, '…and the observation is exactly that of 80 °C');
assert.ok(x25 < xMid && xMid < xHot, 'bluer on the way up');
get().setBath('ice'); for (let i = 0; i < 12000; i += 1) get().tick(0.05);
assert.ok(get().tubes[2].obs.x < x25 && get().tubes[2].tempC < 0.01, 'in ice it is pinker than at room temperature');
ok.push(`a tube of 24 drops of HCl: ${(100 * x25).toFixed(0)} % blue at 25 °C → ${(100 * xMid).toFixed(0)} % one τ into the hot bath → ${(100 * xHot).toFixed(0)} % at 80 °C → ${(100 * get().tubes[2].obs.x).toFixed(0)} % in ice`);

/* ── 12 · The notebook ───────────────────────────────────────────────────────── */
fresh();
const take = (tube, id, n, bath) => {
  get().select(tube); if (id) get().dose(id, n);
  if (bath) { get().setBath(bath); for (let i = 0; i < 12000; i += 1) get().tick(0.05); }
  get().record(); return get().log[get().log.length - 1];
};
get().setWavelength('600'); get().setCell('0.1');
take('A', 'hcl', 24);                                   // a blue-ish base
take('B', 'hcl', 24); take('C', 'hcl', 24); take('D', 'hcl', 24);
const hcl = take('A', 'hcl', 10); const nacl = take('B', 'nacl', 3);
const water = take('C', 'water', 30); const silver = take('D', 'agno3', 25);
fresh(); get().setWavelength('600'); get().setCell('0.1');
for (const tb of ['A', 'B']) { get().select(tb); get().dose('hcl', 24); }
const hot = take('A', null, 0, 'hot'); const cold = take('B', null, 0, 'ice');
for (const [k, r] of Object.entries({ hcl, nacl, hot })) { assert.equal(r.predicted, 'right', `${k}: predicted right`); assert.equal(r.observed, 'bluer', `${k}: observed bluer`); }
for (const [k, r] of Object.entries({ water, silver, cold })) { assert.equal(r.predicted, 'left', `${k}: predicted left`); assert.equal(r.observed, 'pinker', `${k}: observed pinker`); }
assert.ok(hcl.QK < 1 && nacl.QK < 1 && water.QK > 1 && silver.QK > 1, 'Q/K: below 1 for chloride in, above 1 for chloride out');
assert.ok(hot.KT > 1 && cold.KT < 1 && hot.QK === null, 'a bath is judged by K(T)/K(25 °C)');
assert.match(silver.note, /AgCl precipitate/, 'the notebook notes the precipitate');
assert.ok(silver.Kc === null, 'and quotes no Kc for a tube with silver in it');
ok.push('the notebook: Q/K and the colour agree for HCl, salt and heat (right, bluer) and for water, silver and ice (left, pinker); the precipitate is noted and no Kc is quoted for it');

/* ── 13 · The analysis the notebook draws ─────────────────────────────────────── */
fresh(); get().setWavelength('600'); get().setCell('0.1');
for (const [tb, n] of [['A', 14], ['B', 18], ['C', 24], ['D', 32]]) take(tb, 'hcl', n);
const a = get().analysis;
near(a.slope, 4, 0.25, 'the slope the notebook finds'); assert.ok(a.points === 4);
rel(a.Kc, K25, 0.2, 'Kc from the worksheet');
ok.push(`from four tubes read at 600 nm in the 1 mm cell the notebook finds slope ${a.slope.toFixed(2)} and Kc = ${a.Kc.toExponential(2)} (K = 4.5 × 10⁻³): the fourth power, found from the student's own absorbances`);
fresh(); get().setWavelength('692'); get().setCell('1'); get().select('A'); get().dose('hcl', 40); get().record();
assert.equal(get().log[0].A, 'off scale', 'a reading off the scale is recorded as such'); assert.match(get().log[0].note, /off the scale/); assert.equal(get().log[0].blue, null);

/* ── 14 · Speed, determinism ──────────────────────────────────────────────────── */
const t0 = performance.now();
for (let i = 0; i < 200; i += 1) observe(dose(reference(), REAGENTS[i % 4].id, 1 + (i % 10)), 5 + (i % 70));
const per = (performance.now() - t0) / 200;
assert.ok(per < 20, `a speciation takes ${per.toFixed(2)} ms`);
const run = () => { fresh(); take('A', 'hcl', 20); take('B', 'nacl', 5); take('C', 'agno3', 10); return JSON.stringify(get().log); };
assert.equal(run(), run(), 'the same actions give the same notebook');
ok.push(`speciation takes ${per.toFixed(2)} ms per tube; the same sequence of actions gives the same notebook, to the last digit`);

console.log('\nXI-CHE-D02 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
