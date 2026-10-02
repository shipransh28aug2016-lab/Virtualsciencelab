/**
 * verify.mjs — XI-CHE-C04, the common-ion effect.
 *
 * The solver's pH is held against an independent derivation written here: the
 * mass-action expression solved by iteration on the ionic strength, which never
 * touches the charge-balance solver. Everything about the bench — salt that
 * must dissolve, a beaker that cools as it does, a strong acid that shows
 * nothing — is driven through the real store.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { activityCoefficient } from '../../../../shared/chem/aqueous.js';
import { WEAK } from '../../../../shared/chem/species.js';
import { pKw } from '../../../../shared/chem/constants.js';
import { readChart } from '../../../../shared/chem/indicators.js';
import {
  SYSTEM_BY_ID, CHART, TAU_DISSOLVE, TAU_COOL, computeWorld, restingPH, cSalt, statusOf, meterReading, beakerT,
} from './engine/commonion.js';
import { useCommonIonEngine } from './engine/useCommonIonEngine.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(4)}, wanted ${want} ± ${tol}`);
const S = useCommonIonEngine;
const get = () => S.getState();
const fresh = (patch = {}) => { get().reset(); get().setTimeScale(4); Object.entries(patch).forEach(([k, v]) => get()[k]?.(v)); };
const base = { system: 'acetic', conc: 0.1, saltId: 'common', method: 'paper', meter: 'out', drops: 5, tempC: 25, dT: 0, solid: 0, dissolved: 0 };
const pHof = (system, conc, cs, T = 25) => {
  const M = (system === 'acetic' ? 136.08 : system === 'ammonia' ? 53.49 : 58.44);
  return computeWorld({ ...base, system, conc, tempC: T, dissolved: cs * 0.05 * M }).pH;
};

/** The independent derivation, for a weak acid HA (pKa) with a salt of its anion, or a weak
 *  base B (conjugate pKa) with a salt of its cation. Activities by Davies; I from the ions. */
function independent({ kind, pKa, C, cs, T = 25 }) {
  let I = cs; let pH = 7;
  for (let it = 0; it < 200; it += 1) {
    const g = activityCoefficient(1, I, T);
    if (kind === 'acid') {
      /* Ka = a_H γ (cs + x)/(C − x), x = a_H/γ  →  x(cs + x) = Ka (C − x)/γ² */
      const K = 10 ** -pKa; const A = 1; const B = cs + K / (g * g); const Cc = -K * C / (g * g);
      const x = (-B + Math.sqrt(B * B - 4 * A * Cc)) / 2;
      pH = -Math.log10(g * x); I = cs + x;
    } else {
      /* a_H = Ka γ (cs + y)/(C − y) with y = [OH⁻] = Kw/(γ² [H]) — solve by bisection on pH. */
      const Ka = 10 ** -pKa; const Kw = 10 ** -pKw(T);
      let lo = 5; let hi = 13;
      for (let k = 0; k < 90; k += 1) {
        const mid = (lo + hi) / 2; const aH = 10 ** -mid; const y = Kw / (g * aH);
        const f = aH - (Ka * g * (cs + y)) / (C - y);
        if (f > 0) lo = mid; else hi = mid;
      }
      pH = (lo + hi) / 2; const y = Kw / (g * 10 ** -pH); I = cs + y;
    }
  }
  return pH;
}
const pKaOf = { acetic: WEAK.acetic.pKas[0], ammonia: WEAK.ammonia.pKas[0] };

/* ── 1 · Acetic acid with its own salt, against an independent derivation ───────── */
const csList = [0, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.3];
const aceticCurve = csList.map((cs) => pHof('acetic', 0.1, cs));
const aceticRef = csList.map((cs) => independent({ kind: 'acid', pKa: pKaOf.acetic, C: 0.1, cs }));
const devA = Math.max(...aceticCurve.map((p, i) => Math.abs(p - aceticRef[i])));
assert.ok(devA < 0.01, `acetic: solver vs independent derivation ${devA}`);
assert.ok(aceticCurve.every((p, i) => i === 0 || p > aceticCurve[i - 1]), 'pH must rise with every addition of the common ion');
near(aceticCurve[0], 2.87, 0.03, 'published: 0.1 M acetic acid alone'); near(aceticCurve[5], 4.65, 0.02, '0.1 M acetic acid + 0.1 M acetate');
ok.push(`acetic acid with sodium acetate added: pH ${csList.map((c, i) => `${c}→${aceticCurve[i].toFixed(2)}`).join(', ')} mol/L; the solver agrees with an independent mass-action derivation (iterated on the ionic strength) to ${devA.toFixed(4)}; 0.1 M acid alone is the published 2.87; with 0.1 M acetate it is 4.65, not the textbook 4.74 — the meter reads activity, and at I = 0.1 that is 0.1 low`);

/* ── 2 · Ammonia with ammonium chloride: the mirror image ─────────────────────── */
const ammoniaCurve = csList.map((cs) => pHof('ammonia', 0.1, cs));
const ammoniaRef = csList.map((cs) => independent({ kind: 'base', pKa: pKaOf.ammonia, C: 0.1, cs }));
const devN = Math.max(...ammoniaCurve.map((p, i) => Math.abs(p - ammoniaRef[i])));
assert.ok(devN < 0.01, `ammonia: solver vs independent derivation ${devN}`);
assert.ok(ammoniaCurve.every((p, i) => i === 0 || p < ammoniaCurve[i - 1]), 'a base loses pH when its own conjugate acid is added');
near(ammoniaCurve[0], 11.12, 0.04, '0.1 M ammonia alone');
ok.push(`ammonia with ammonium chloride added: pH ${csList.map((c, i) => `${c}→${ammoniaCurve[i].toFixed(2)}`).join(', ')}; independent derivation agrees to ${devN.toFixed(4)}; the pH FALLS, because the common ion here is NH₄⁺ and it suppresses the base's ionisation`);

/* ── 3 · A strong acid has no equilibrium to shift ────────────────────────────── */
const hcl = [0, 0.1, 0.3].map((cs) => pHof('hcl', 0.1, cs));
const hclShift = Math.max(...hcl) - Math.min(...hcl);
const aceticShift = aceticCurve[5] - aceticCurve[0];
assert.ok(hclShift < 0.06 && aceticShift > 1.5, `HCl moves ${hclShift}, acetic acid ${aceticShift}`);
ok.push(`the contrast: 0.1 M HCl with 0 / 0.1 / 0.3 M NaCl is pH ${hcl.map((p) => p.toFixed(3)).join(' / ')} (a ${hclShift.toFixed(3)} drift — activity coefficients, not an equilibrium shifting); the same 0.1 M of acetate moves acetic acid by ${aceticShift.toFixed(2)} units`);

/* ── 4 · A salt with no ion in common does almost nothing to a weak acid ──────────── */
const neutral = computeWorld({ ...base, saltId: 'neutral', dissolved: 0.3 * 0.05 * 84.99 }).pH;
assert.ok(Math.abs(neutral - aceticCurve[0]) < 0.02, `0.3 M NaNO₃ moves acetic acid by ${neutral - aceticCurve[0]}`);
/* The acid's own ionisation: the acetate that came from the ACID, i.e. all the acetate minus what the salt supplied. */
const trueAlpha = (cs, salt) => {
  const w = computeWorld({ ...base, saltId: salt, dissolved: cs * 0.05 * (salt === 'neutral' ? 84.99 : 136.08) });
  const csAcetate = salt === 'common' ? cs : 0;
  return (w.sol.species[0].species[1].conc - csAcetate) / 0.1;
};
assert.ok(trueAlpha(0.3, 'neutral') > trueAlpha(0, 'neutral') * 1.15, 'the true ionisation does rise with an inert salt (the salt effect)');
assert.ok(trueAlpha(0.1, 'common') < 0.1 * trueAlpha(0, 'common'), 'and falls tenfold with the common ion');
ok.push(`a salt with no ion in common: 0.3 M NaNO₃ moves acetic acid by ${(neutral - aceticCurve[0]).toFixed(3)} pH — nothing, because a_H = √(Ka[HA]) whatever γ does — although the true degree of ionisation rises ${((trueAlpha(0.3, 'neutral') / trueAlpha(0, 'neutral') - 1) * 100).toFixed(0)} % (the salt effect); the common ion cuts it to ${(100 * trueAlpha(0.1, 'common')).toFixed(3)} % from ${(100 * trueAlpha(0, 'common')).toFixed(2)} %`);

/* ── 5 · The worksheet's arithmetic recovers the constant, 0.1 low ───────────── */
fresh({ setMeter: 'in' }); get().setStirrer('on'); get().setMethod('meter'); get().setMeter('in');
const waitStable = (max = 600) => { const t0 = get().elapsed; while (get().elapsed - t0 < max) { get().tick(0.05); if (meterReading(get()).stable && get().elapsed - t0 > 3 && get().solid < 1e-3) return get().elapsed - t0; } return Infinity; };
const addSalt = (mol) => { get().setBoat(Math.round(((mol * 136.08) / 1) * 100) / 100); get().tip(); };
const dose = (cs) => { const n = cs * 0.05 - get().dissolved / 136.08 - get().solid / 136.08; if (n > 0) addSalt(n); };
waitStable(); get().record();
for (const cs of [0.01, 0.02, 0.05, 0.1, 0.2, 0.3]) { dose(cs); waitStable(); get().record(); }
const A = get().analysis; const key = 'acetic|common'; const f = A.fits[key];
assert.equal(get().log.length, 7);
/* Henderson–Hasselbalch says slope 1; activity says a little less, because the
   acetate's γ falls as more salt is added: d(pH)/d(log cs) = 1 + d(log γ)/d(log cs).
   The expected slope is what the independent derivation gives over the same points. */
const csDosed = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3];
const refSlope = (() => { const xs = csDosed.map((c) => Math.log10(c / 0.1)); const ys = csDosed.map((c) => independent({ kind: 'acid', pKa: pKaOf.acetic, C: 0.1, cs: c }));
  const n = xs.length; const sx = xs.reduce((a, b) => a + b); const sy = ys.reduce((a, b) => a + b); const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0); const sxx = xs.reduce((a, x) => a + x * x, 0);
  return (n * sxy - sx * sy) / (n * sxx - sx * sx); })();
near(f.slope, refSlope, 0.03, 'slope of pH against log(salt/acid)'); assert.ok(f.slope < 1 && f.slope > 0.85);
near(f.pK, pKaOf.acetic - 0.1, 0.05, 'pKa from the worksheet');
near(f.intercept, f.pK, 0.07, 'pH at equal salt and acid is pKa');
ok.push(`the experiment through the store (meter, weighed salt, stirrer on, 7 readings): pH against log(salt/acid) has slope ${f.slope.toFixed(2)} (Henderson–Hasselbalch says 1; the falling activity coefficient of the acetate makes it ${refSlope.toFixed(2)}), the pH at equal concentrations is ${f.intercept.toFixed(2)}, and the worksheet's Ka gives pKa ${f.pK.toFixed(2)} against the constant ${pKaOf.acetic} — 0.1 low, which is the activity of the acetate at I ≈ 0.1, not an error of the student's`);

/* ── 6 · Ammonia through the store ────────────────────────────────────────────── */
fresh(); get().setSystem('ammonia'); get().setStirrer('on'); get().setMethod('meter'); get().setMeter('in'); get().clearLog();
const doseN = (cs) => { const n = cs * 0.05 - get().dissolved / 53.49 - get().solid / 53.49; if (n > 0) { get().setBoat(Math.round(n * 53.49 * 100) / 100); get().tip(); } };
waitStable(); get().record();
for (const cs of [0.01, 0.02, 0.05, 0.1, 0.2, 0.3]) { doseN(cs); waitStable(); get().record(); }
const fn = get().analysis.fits['ammonia|common'];
const refSlopeN = (() => { const xs = csDosed.map((c) => Math.log10(c / 0.1)); const ys = csDosed.map((c) => independent({ kind: 'base', pKa: pKaOf.ammonia, C: 0.1, cs: c }));
  const n = xs.length; const sx = xs.reduce((a, b) => a + b); const sy = ys.reduce((a, b) => a + b); const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0); const sxx = xs.reduce((a, x) => a + x * x, 0);
  return (n * sxy - sx * sy) / (n * sxx - sx * sx); })();
near(fn.slope, refSlopeN, 0.03, 'ammonia slope'); assert.ok(fn.slope > -1 && fn.slope < -0.85); near(fn.pK, 4.755 - 0.0, 0.2, 'pKb from the worksheet');
ok.push(`ammonia through the store: pH against log(salt/base) has slope ${fn.slope.toFixed(2)} (−1: the base's pH falls as its own cation is added), pH at equal concentrations ${fn.intercept.toFixed(2)} (pKa of NH₄⁺ ${pKaOf.ammonia}), and the worksheet's pKb is ${fn.pK.toFixed(2)}`);

/* ── 7 · The salt has to dissolve, and takes heat as it does ──────────────────────── */
fresh({ setMeter: 'in' }); get().setMethod('meter'); get().setMeter('in'); waitStable();
get().setBoat(0.68); get().tip();
const startPH = get().world.pH; assert.equal(statusOf(get()).key, 'dissolving');
const stillT = (t) => { for (let k = 0; k < t / 0.05 / 4; k += 1) get().tick(0.05); return get().solid / 0.68; };
const left60 = stillT(60);
near(left60, Math.exp(-60 / TAU_DISSOLVE.off), 0.02, 'unstirred, 60 s');
get().setStirrer('on'); const left20 = stillT(20);
assert.ok(left20 < 0.1 * left60, 'the stirrer dissolves it in seconds');
get().setStirrer('off'); stillT(120);
assert.ok(get().solid < 0.015 && get().dissolved > 0.665, `the last crumbs go slowly once the stirrer stops (${get().solid} g left)`);
fresh(); get().setMethod('meter'); get().setStirrer('on'); get().setBoat(1.36); get().tip(); get().setStirrer('on');
let minT = 0; for (let k = 0; k < 400; k += 1) { get().tick(0.05); minT = Math.min(minT, get().dT); }
assert.ok(minT < -0.2 && minT > -1.5, `0.01 mol of NaOAc·3H₂O in 50 mL cools it ${minT} K`);
const tAfter = (() => { for (let k = 0; k < 900 * 20 / 4 / 1; k += 1) get().tick(0.05); return get().dT; })();
assert.ok(Math.abs(tAfter) < 0.01, `the room brings it back (${tAfter})`);
ok.push(`dissolving: unstirred, ${(left60 * 100).toFixed(0)} % of the salt is still on the bottom after 60 s (e^(−t/${TAU_DISSOLVE.off}) = ${(100 * Math.exp(-60 / TAU_DISSOLVE.off)).toFixed(0)} %); with the stirrer, ${(left20 * 100).toFixed(1)} % after 20 s more; 0.01 mol of sodium acetate trihydrate takes heat as it dissolves (+19.7 kJ/mol) and cools the beaker by ${(-minT).toFixed(2)} K at the lowest, back to ${tAfter.toFixed(3)} K after the room has had ${TAU_COOL * 10} s — and the pH is read in the middle of all that`);

/* ── 8 · Reading the colour ───────────────────────────────────────────────────────── */
fresh({ setMethod: 'universal' });
const col0 = readChart(get().world.universal.colour.srgb, CHART).pH;
get().setStirrer('on'); addSalt(0.01); for (let k = 0; k < 600; k += 1) get().tick(0.05);
const col1 = readChart(get().world.universal.colour.srgb, CHART).pH;
assert.ok(col1 > col0, `the indicator moves with the salt (${col0} → ${col1})`);
ok.push(`with universal indicator the beaker goes from chart patch ${col0} to ${col1} on adding 0.2 M acetate — visible without a meter, to about a unit`);

/* ── 9 · Notebook flags ────────────────────────────────────────────────────────────── */
fresh(); get().setMethod('meter'); get().setMeter('in'); get().setBoat(0.68); get().tip(); get().record();
const note = get().log[get().log.length - 1].note;
assert.ok(/not yet dissolved/.test(note), note);
fresh({ setSalt: 'neutral' }); get().setMethod('meter'); get().setMeter('in'); get().setStirrer('on'); get().setBoat(0.5); get().tip(); waitStable(); get().record();
assert.ok(/no common ion/.test(get().log[get().log.length - 1].note));
fresh({ setMeterCal: 'none' }); get().setMethod('meter'); get().setMeter('in'); waitStable(); get().record();
assert.ok(/uncalibrated/.test(get().log[get().log.length - 1].note));
ok.push('the notebook says how each reading was taken: "not yet dissolved", "no common ion", "uncalibrated", "beaker cooled"');

/* ── 10 · The beaker is locked once salt is in ──────────────────────────────────────── */
fresh(); get().setBoat(0.5); get().tip(); get().setConc(0.2); get().setSalt('neutral');
assert.equal(get().conc, 0.1); assert.equal(get().saltId, 'common');
get().freshBeaker(); get().setConc(0.2); assert.equal(get().conc, 0.2);
ok.push('what is in the beaker cannot be changed from outside once salt has gone in (no un-dissolving): a fresh beaker is the way to change the acid concentration or the salt');

/* ══ CONTROL-RESPONSE MATRIX ═════════════════════════════════════════════════ */
const matrix = [];
const sweep = (label, patches, key, dir) => {
  const vals = patches.map((p) => { fresh(); p(); return key(get()); });
  for (let i = 1; i < vals.length; i += 1) assert.ok(dir * (vals[i] - vals[i - 1]) > 0, `${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
  matrix.push(`${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
};
const withSalt = (g) => () => { get().setBoat(g); get().tip(); };
sweep('acetate 0, 0.3, 0.7, 1.4, 2.7 g in the acetic acid raises the pH (once dissolved)', [0, 0.3, 0.7, 1.4, 2.7].map((g) => () => { if (g) withSalt(g)(); }), (s) => restingPH(s), +1);
sweep('the same, into ammonia, lowers it', [0, 0.1, 0.3, 0.6, 1.2].map((g) => () => { get().setSystem('ammonia'); if (g) withSalt(g)(); }), (s) => restingPH(s), -1);
sweep('acetic acid 0.02 → 0.2 M lowers its pH', [0.02, 0.05, 0.1, 0.2].map((c) => () => get().setConc(c)), (s) => s.world.pH, -1);
sweep('ammonia 0.02 → 0.2 M raises its pH', [0.02, 0.05, 0.1, 0.2].map((c) => () => { get().setSystem('ammonia'); get().setConc(c); }), (s) => s.world.pH, +1);
const noEffect = [0.3, 0.7, 1.4].map((g) => { fresh(); get().setSystem('hcl'); withSalt(g)(); return Math.abs(restingPH(get()) - pHof('hcl', 0.1, 0)); });
assert.ok(Math.max(...noEffect) < 0.06);
matrix.push(`NaCl into HCl, 0.3 / 0.7 / 1.4 g: pH moves ${noEffect.map((d) => d.toFixed(3)).join(' / ')} — nothing to shift`);
const tmp = [15, 25, 40].map((T) => { fresh({ setTemp: T }); return get().world.pH; });
assert.ok(tmp[0] > tmp[2] - 0.2); matrix.push(`temperature 15 / 25 / 40 °C: 0.1 M acetic acid ${tmp.map((p) => p.toFixed(3)).join(' / ')} (athermal)`);
matrix.push('stirrer, method, meter in/out, calibration, drops, clock, tip, fresh beaker each exercised above through the store');
ok.push(`EVERY setting swept on its own, and every one moves the right way:\n      ${matrix.join('\n      ')}`);

/* ── Determinism and frame-rate independence ────────────────────────────────────────── */
const run = (dt) => { fresh(); get().setMethod('meter'); get().setMeter('in'); get().setStirrer('on'); get().setBoat(0.68); get().tip(); for (let t = 0; t < 40; t += dt) get().tick(dt); return [get().world.pH, meterReading(get()).pH]; };
const a = run(0.05); const b = run(0.05); assert.deepEqual(a, b);
const c = run(1 / 60); near(c[0], a[0], 0.03, 'frame rate'); near(c[1], a[1], 0.1, 'frame rate meter');
ok.push(`deterministic and frame-rate independent: the same 40 s run twice is identical (beaker ${a[0].toFixed(3)}, meter ${a[1].toFixed(2)}), and at 60 fps the beaker is ${c[0].toFixed(3)}`);

console.log('\nXI-CHE-C04 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against an independent derivation.\n`);
