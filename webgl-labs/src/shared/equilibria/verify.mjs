/**
 * verify.mjs — the general speciation solver.
 *
 * Held against the dedicated acid–base solver (a different code path to the same
 * physics), against closed forms (a 1:1 complex with a known constant, buffer
 * and ionic-strength algebra), against its own bookkeeping (mass and charge
 * close) and against van 't Hoff — and put through the stiff case: a complex
 * that is 10²⁰ times more stable than its parts.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { solveAqueous, systemFrom, activityCoefficient } from '../chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../chem/species.js';
import { R } from '../chem/constants.js';
import { speciate, kAt } from './speciate.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const rel = (got, want, tol, label) => assert.ok(Math.abs(got / want - 1) <= tol, `${label}: got ${got}, wanted ${want} (${tol * 100} %)`);

const OH = { id: 'OH', z: -1, nu: { H: -1 }, logK: -13.995 };
const H = { id: 'H', z: 1 };

/* ── 1 · Acids and bases: the same answer by a different route ───────────────── */
const viaAqueous = (id, c) => solveAqueous(systemFrom([{ recipe: SUBSTANCES[id], scale: c }], { T: 25, WEAK, SOLIDS })).pH;
const acetic = (c) => speciate({ components: [H, { id: 'Ac', z: -1 }], species: [{ id: 'HAc', z: 0, nu: { H: 1, Ac: 1 }, logK: WEAK.acetic.pKas[0] }, OH], totals: { Ac: c }, charge: 'H' });
const ammonia = (c) => speciate({ components: [H, { id: 'NH3', z: 0 }], species: [{ id: 'NH4', z: 1, nu: { H: 1, NH3: 1 }, logK: WEAK.ammonia.pKas[0] }, OH], totals: { NH3: c }, charge: 'H' });
const devs = [[acetic(0.1).pH, viaAqueous('acetic', 0.1)], [acetic(0.001).pH, viaAqueous('acetic', 0.001)], [ammonia(0.1).pH, viaAqueous('ammonia', 0.1)]].map(([a, b]) => Math.abs(a - b));
assert.ok(Math.max(...devs) < 0.005, `general vs dedicated solver: ${devs}`);
/* A buffer: the salt's counter-ion is a spectator. */
const buffer = speciate({ components: [H, { id: 'Ac', z: -1 }], species: [{ id: 'HAc', z: 0, nu: { H: 1, Ac: 1 }, logK: WEAK.acetic.pKas[0] }, OH], totals: { Ac: 0.2 }, spectators: [{ z: 1, c: 0.1 }], charge: 'H' });
near(buffer.pH, 4.65, 0.02, '0.1 M acetic acid + 0.1 M acetate');
ok.push(`acids and bases by a different route: 0.1 and 0.001 M acetic acid and 0.1 M ammonia agree with the dedicated solver to ${Math.max(...devs).toFixed(4)} pH; an acetate buffer is ${buffer.pH.toFixed(2)}`);

/* ── 2 · A 1:1 complex against its closed form ──────────────────────────────────── */
const logK0 = 2.95;
const complex = (extra = {}) => speciate({
  components: [{ id: 'M', z: 3 }, { id: 'L', z: -1 }, { id: 'H', z: 1, fixed: 10 ** -0.3 }],
  species: [{ id: 'ML', z: 2, nu: { M: 1, L: 1 }, logK: logK0, dH: -20 }],
  totals: { M: 1e-3, L: 1e-3 }, spectators: [{ z: -1, c: 0.5 + 3e-3 }, { z: 1, c: 1e-3 }], T: 25, ...extra,   // 0.5 M HNO₃ as the medium
});
const c25 = complex();
const g = (z) => activityCoefficient(z, c25.ionicStrength, 25);
const Kconc = c25.species.ML / (c25.free.M * c25.free.L);
rel(Kconc, 10 ** logK0 * (g(3) * g(-1)) / g(2), 1e-6, 'K in concentrations = K° γγ/γ');
near(Kconc, 138, 8, 'K at I ≈ 0.5 is the measured 138');
assert.ok(c25.converged && c25.residual < 1e-9);
ok.push(`a 1:1 complex (K° = 10^${logK0}) at I = ${c25.ionicStrength.toFixed(2)}: the concentration quotient is ${Kconc.toFixed(0)}, exactly K° γ(M) γ(L)/γ(ML) as the activities say it must be (and the 138 that is measured for Fe³⁺ + SCN⁻ at this ionic strength)`);

/* ── 3 · The books balance ───────────────────────────────────────────────────────── */
const mb = c25.free.M + c25.species.ML; const lb = c25.free.L + c25.species.ML;
rel(mb, 1e-3, 1e-9, 'metal balance'); rel(lb, 1e-3, 1e-9, 'ligand balance');
ok.push('mass balance closes to 10⁻⁹ on both components');

/* ── 4 · Temperature, by van 't Hoff ─────────────────────────────────────────────── */
const K40 = complex({ T: 40 }); const q40 = K40.species.ML / (K40.free.M * K40.free.L);
const expect = Math.exp((-(-20) * 1000 / R) * (1 / 313.15 - 1 / 298.15));
rel(kAt(logK0, -20, 40) / kAt(logK0, -20, 25), expect, 1e-9, 'van t Hoff');
assert.ok(q40 < Kconc, 'an exothermic complex weakens as it warms');
const cold = complex({ T: 5 }); assert.ok(cold.species.ML / (cold.free.M * cold.free.L) > Kconc, '…and strengthens as it cools');
ok.push(`van 't Hoff: K(40 °C)/K(25 °C) = ${expect.toFixed(3)} for ΔH = −20 kJ/mol; the solved quotient falls from ${Kconc.toFixed(0)} to ${q40.toFixed(0)} on warming and rises on cooling`);

/* ── 5 · A competing ligand, and the stiff case ──────────────────────────────────── */
const sys = (Ltot) => speciate({
  components: [{ id: 'M', z: 3 }, { id: 'L', z: -1 }, { id: 'X', z: -2 }, { id: 'H', z: 1, fixed: 1e-3 }],
  species: [
    { id: 'ML', z: 2, nu: { M: 1, L: 1 }, logK: 2.95 },
    { id: 'MX', z: 1, nu: { M: 1, X: 1 }, logK: 9.4 }, { id: 'MX2', z: -1, nu: { M: 1, X: 2 }, logK: 16.2 }, { id: 'MX3', z: -3, nu: { M: 1, X: 3 }, logK: 20.2 },
  ],
  totals: { M: 1e-3, L: 1e-3, X: Ltot }, spectators: [{ z: 1, c: 0.01 + 2 * Ltot }, { z: -1, c: 0.01 }],
});
const noX = sys(1e-9); const withX = sys(5e-3);
assert.ok(noX.converged && withX.converged, `stiff case converged (residuals ${noX.residual}, ${withX.residual})`);
assert.ok(withX.species.ML < 0.05 * noX.species.ML, 'a ligand 10²⁰ times better at holding the metal takes it away from the thiocyanate');
ok.push(`the stiff case: with a competing ligand of cumulative constant 10^20.2 the thiocyanate complex falls from ${noX.species.ML.toExponential(2)} to ${withX.species.ML.toExponential(2)} mol/L, converged to ${withX.residual.toExponential(0)}`);

/* ── 6 · Solids: present only when the solution would be supersaturated ───────────── */
const KSP_AGCL = 10 ** -9.75; const KSP_NACL = 37.7; const B2 = 10 ** 5.04;
const salts = (T = {}, extra = {}) => speciate({
  components: [{ id: 'Ag', z: 1 }, { id: 'Cl', z: -1 }, { id: 'Na', z: 1 }],
  species: [{ id: 'AgCl2', z: -1, nu: { Ag: 1, Cl: 2 }, logK: Math.log10(B2) }],
  solids: [{ id: 'AgCl', nu: { Ag: 1, Cl: 1 }, logKsp: -9.75 }, { id: 'NaCl', nu: { Na: 1, Cl: 1 }, logKsp: Math.log10(KSP_NACL) }],
  totals: { Ag: 1e-9, Cl: 1e-9, Na: 1e-9, ...T }, activity: false, ...extra,
});
/* Silver chloride: (Ag − p)(Cl − p) = Ksp, ignoring the complex at these chlorides. */
const agcl = salts({ Ag: 1e-3, Cl: 3e-3, Na: 3e-3 - 1e-3 });
const clLeft = 3e-3 - 1e-3 + (agcl.free.Ag + 2 * agcl.species.AgCl2);
rel(agcl.free.Ag * agcl.free.Cl, KSP_AGCL, 1e-9, 'IAP = Ksp when AgCl is present');
rel(agcl.free.Cl, 2e-3, 1e-4, 'the chloride left is the excess');
rel(agcl.solids.AgCl, 1e-3 - agcl.free.Ag - agcl.species.AgCl2, 1e-9, 'the solid is what the solution does not hold'); assert.ok(agcl.solids.AgCl > 0.999e-3, 'nearly all the silver is solid');
assert.ok(agcl.converged && agcl.solids.NaCl === 0 && Math.abs(clLeft / agcl.free.Cl - 1) < 1e-3);
/* Below saturation: no solid at all, and the ions are what was weighed out. */
const under = salts({ Ag: 1e-9, Cl: 1e-3, Na: 1e-3 });
assert.equal(under.solids.AgCl, 0, 'no AgCl below the solubility product'); rel(under.free.Ag + under.species.AgCl2, 1e-9, 1e-9, 'all of it is in solution, free or as the chloro-complex');
/* The kink: dissolved silver follows what is added until the product reaches Ksp, then stays put —
   and what stays put is Ksp/[Cl⁻] free plus the chloro-complex that goes with it. */
const sat = (KSP_AGCL / 1e-2) * (1 + B2 * 1e-4);
const below = salts({ Ag: 0.9 * sat, Cl: 1e-2, Na: 1e-2 }); const above = salts({ Ag: 5 * sat, Cl: 1e-2, Na: 1e-2 });
assert.equal(below.solids.AgCl, 0); assert.ok(above.solids.AgCl > 0, 'past the kink there is a solid');
rel(above.free.Ag + above.species.AgCl2, sat, 2e-3, 'above the kink what is dissolved is the solubility, Ksp/[Cl⁻] (1 + β₂[Cl⁻]²)');
/* Sodium chloride: saturated at √37.7 = 6.14 mol/L, the rest is crystals. */
const brine = salts({ Na: 8, Cl: 8, Ag: 1e-9 });
near(brine.free.Cl, Math.sqrt(KSP_NACL), 1e-6, 'a saturated brine is 6.14 M'); near(brine.solids.NaCl, 8 - Math.sqrt(KSP_NACL), 1e-6, 'and the rest of the 8 mol is solid');
assert.equal(salts({ Na: 3, Cl: 3, Ag: 1e-9 }).solids.NaCl, 0, 'a 3 M brine has no crystals');
/* In concentrated chloride silver chloride dissolves as AgCl₂⁻: S = Ksp/[Cl] + Ksp β₂ [Cl]. */
const conc = salts({ Ag: 1e-2, Cl: 4, Na: 4 });
const expected = KSP_AGCL / conc.free.Cl + KSP_AGCL * B2 * conc.free.Cl;
rel(conc.free.Ag + conc.species.AgCl2, expected, 1e-6, 'solubility in 4 M chloride, with the complex');
assert.ok(conc.species.AgCl2 > 1e3 * conc.free.Ag, 'almost all of what is dissolved is AgCl₂⁻');
ok.push(`solids: AgCl precipitates until [Ag⁺][Cl⁻] = Ksp (and not before — the kink is at ${sat.toExponential(2)} M); brine saturates at ${brine.free.Cl.toFixed(2)} M and the rest of 8 mol is crystals; in 4 M chloride AgCl dissolves as AgCl₂⁻ to ${(conc.free.Ag + conc.species.AgCl2).toExponential(2)} M, as Ksp(1/[Cl⁻] + β₂[Cl⁻]) says`);

console.log('\nshared/equilibria VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
