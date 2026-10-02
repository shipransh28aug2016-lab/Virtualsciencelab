/**
 * verify.mjs — the shared titration physics.
 *
 * The strong/strong curve is checked against an independent derivation: the
 * stoichiometry gives the excess ion, Davies gives its activity, and the
 * answer is a number the solver never saw. The mixing and burette behaviour
 * are checked against what they must do at a bench.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { solveAqueous, systemFrom, activityCoefficient } from '../chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../chem/species.js';
import { pKw } from '../chem/constants.js';
import {
  flaskBulk, flaskPlume, relaxUnmixed, DROP_ML, slopes, steepest, equivalenceMl, analyteFromTitre, readBurette, MIX_TAU,
} from './titration.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(4)}, wanted ${want} ± ${tol}`);
const sys = (id, c, T = 25) => systemFrom([{ recipe: SUBSTANCES[id], scale: c }], { T, WEAK, SOLIDS });
const bulkPH = (analyte, Va, titrant, V) => solveAqueous(flaskBulk({ analyte, analyteMl: Va, titrant, mixedMl: V })).pH;

/* ── 1 · Strong base against strong acid, against stoichiometry + Davies ────────── */
const Ca = 0.1; const Ct = 0.1; const Va = 20;
const NaOH = sys('naoh', Ca); const HCl = sys('hcl', Ct);
/** The independent route: excess ion from the mole balance, γ from Davies at the
 *  ionic strength of the spectator ions, pH from the activity. */
function analytic(V) {
  const Vt = Va + V;
  const na = (Ca * Va) / Vt; const cl = (Ct * V) / Vt;
  const excess = na - cl;                                      // > 0: OH⁻ left; < 0: H⁺ left
  const I = 0.5 * (na + cl + Math.abs(excess));
  const g = activityCoefficient(1, I, 25);
  return excess > 0 ? pKw(25) + Math.log10(g * excess) : -Math.log10(g * -excess);
}
const probe = [0, 5, 10, 15, 19, 19.9, 19.99, 20.01, 20.1, 21, 25, 30, 40];
const worst = Math.max(...probe.map((V) => Math.abs(bulkPH(NaOH, Va, HCl, V) - analytic(V))));
assert.ok(worst < 0.01, `solver vs stoichiometry + Davies: worst ${worst}`);
near(bulkPH(NaOH, Va, HCl, 20), pKw(25) / 2, 0.001, 'equivalence is pKw/2');
const jump = bulkPH(NaOH, Va, HCl, 19.9) - bulkPH(NaOH, Va, HCl, 20.1);
assert.ok(jump > 6 && jump < 7.2, `±0.1 mL about equivalence must swing the pH by ~7 units (got ${jump})`);
ok.push(`strong base against strong acid matches an independent derivation (stoichiometry + Davies) to ${worst.toFixed(4)} pH over 13 volumes from 0 to 40 mL; equivalence is exactly pKw/2 = ${(pKw(25) / 2).toFixed(3)}, and ±0.1 mL either side swings the pH by ${jump.toFixed(1)} units (${bulkPH(NaOH, Va, HCl, 19.9).toFixed(2)} → ${bulkPH(NaOH, Va, HCl, 20.1).toFixed(2)}) — which is why the endpoint is a drop, not a mL`);

/* ── 2 · Concentration changes the plateau and the jump, not the equivalence pH ──── */
const dil = (c) => [bulkPH(sys('naoh', c), Va, sys('hcl', c), 0), bulkPH(sys('naoh', c), Va, sys('hcl', c), 20 - 0.1), bulkPH(sys('naoh', c), Va, sys('hcl', c), 20)];
const [s1, s2, s3] = [dil(0.1), dil(0.01), dil(0.001)];
assert.ok(s1[0] > s2[0] && s2[0] > s3[0], 'the starting pH falls with concentration');
assert.ok(s1[1] - s1[2] > s2[1] - s2[2] && s2[1] - s2[2] > s3[1] - s3[2], 'a more dilute titration has a smaller jump');
near(s1[2], s3[2], 0.002, 'equivalence pH is the same at every strength');
ok.push(`strength of the solutions: starting pH ${s1[0].toFixed(2)} / ${s2[0].toFixed(2)} / ${s3[0].toFixed(2)} at 0.1 / 0.01 / 0.001 M; pH just before equivalence ${s1[1].toFixed(1)} / ${s2[1].toFixed(1)} / ${s3[1].toFixed(1)} — the jump shrinks as the solutions are diluted — but the equivalence point is ${s1[2].toFixed(2)} / ${s2[2].toFixed(2)} / ${s3[2].toFixed(2)}, the same`);

/* ── 3 · A weak acid against a strong base, for the benches that need it ───────────── */
const AcOH = sys('acetic', 0.1); const base = sys('naoh', 0.1);
const half = bulkPH(AcOH, 25, base, 12.5); const eq = bulkPH(AcOH, 25, base, 25);
near(half, 4.756, 0.12, 'half-neutralised acetic acid sits at its pKa');
near(eq, 8.73, 0.1, 'equivalence of acetic acid / NaOH');
ok.push(`weak acid against strong base: half-neutralised acetic acid is pH ${half.toFixed(2)} (pKa 4.76, Henderson–Hasselbalch) and the equivalence point is ${eq.toFixed(2)}, not 7 — the salt is a base`);

/* ── 4 · The student's curve: where is the steepest part? ────────────────────────── */
const eqV = equivalenceMl({ analyteMl: Va, analyteC: Ca, titrantC: Ct });
assert.equal(eqV, 20);
const sparse = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19, 20, 21, 22, 24].map((V) => [V, bulkPH(NaOH, Va, HCl, V)]);
const st = steepest(sparse);
assert.ok(eqV >= st.lo && eqV <= st.hi, `the steepest interval ${st.lo}–${st.hi} must contain the true equivalence ${eqV}`);
const shuffled = [...sparse].reverse(); assert.equal(steepest(shuffled).V, st.V);
const fine = [19, 19.5, 19.8, 19.9, 19.95, 20, 20.05, 20.1, 20.2, 20.5, 21].map((V) => [V, bulkPH(NaOH, Va, HCl, V)]);
const stf = steepest(fine);
assert.ok(stf.width <= 0.06 && Math.abs(stf.V - eqV) < 0.04, `dropwise near the end pins it down (${stf.lo}–${stf.hi})`);
ok.push(`reading the student's curve: 1 mL steps place the steepest interval at ${st.lo}–${st.hi} mL (it contains the true ${eqV}); dropwise near the end narrows it to ${stf.lo}–${stf.hi} mL, V_eq ≈ ${stf.V.toFixed(2)}; the order the points were taken in does not matter`);
assert.equal(steepest([[1, 2]]), null);
near(analyteFromTitre({ titreMl: 19.6, analyteMl: 20, titrantC: 0.1 }), 0.098, 1e-9, 'N1V1 = N2V2');
near(equivalenceMl({ analyteMl: 25, analyteC: 0.05, titrantC: 0.1, ratio: 2 }), 25, 1e-9, 'ratio 2');

/* ── 5 · A drop is not the flask ────────────────────────────────────────────────────── */
const u = DROP_ML;
const bulk19 = flaskBulk({ analyte: NaOH, analyteMl: Va, titrant: HCl, mixedMl: 19.9 });
const plumeAtDrop = solveAqueous(flaskPlume({ bulk: bulk19, titrant: HCl, unmixedMl: u })).pH;
const bulkAt = solveAqueous(bulk19).pH;
assert.ok(bulkAt > 10 && plumeAtDrop < 4, `a drop landing near the end is a local flood of acid (bulk ${bulkAt}, plume ${plumeAtDrop})`);
const t3 = [relaxUnmixed(1, 3, 'swirl'), relaxUnmixed(1, 3, 'stir'), relaxUnmixed(1, 3, 'none')];
assert.ok(t3[1] < t3[0] && t3[0] < 0.2 && t3[2] > 0.9, 'swirling blends in seconds, standing still barely at all');
assert.ok(relaxUnmixed(1, 10 * MIX_TAU.swirl, 'swirl') < 1e-4);
ok.push(`a drop is not the flask: one drop (${DROP_ML} mL) landing at 19.9 mL turns its plume to pH ${plumeAtDrop.toFixed(1)} while the flask is still ${bulkAt.toFixed(1)} — the flash at the end point that fades on swirling; 3 s of swirling leaves ${(t3[0] * 100).toFixed(0)} % unmixed, a stirrer ${(t3[1] * 100).toFixed(1)} %, standing still ${(t3[2] * 100).toFixed(0)} %`);

/* ── 6 · Burette ──────────────────────────────────────────────────────────────────────── */
near(readBurette(12.337), 12.35, 1e-9, 'read to 0.05'); near(readBurette(12.324), 12.30, 1e-9, 'read to 0.05');
assert.equal(slopes([[0, 1], [0, 2], [1, 3]]).length, 1, 'duplicate volumes are not a slope');
ok.push('the burette is read to 0.05 mL (a quarter of a drop is not a thing a student can read), and duplicate volumes in a notebook are not a slope');

console.log('\nshared/titration VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
