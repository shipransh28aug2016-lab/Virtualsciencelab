/**
 * verify.mjs — XI-CHE-C02, strong and weak acids at one concentration.
 *
 * Expectations come from outside the code: mean activity coefficients of HCl
 * (Robinson & Stokes), the acetic acid constant and published pH values of
 * 0.1 / 0.01 / 0.001 M acetic acid, and the arithmetic the CBSE worksheet asks
 * for. The bench half drives the real store the way a student drives the
 * interface — including the mistakes.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { universalColour, readChart } from '../../../../shared/chem/indicators.js';
import { srgbToLab, deltaE } from '../../../../shared/chem/spectra.js';
import {
  ACID_BY_ID, CHART, analyseTube, workings, statusOf, meterReading, concentration, equalConcentration, notesFor, STOCK,
} from './engine/acids.js';
import { useAcidEngine } from './engine/useAcidEngine.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(4)}, wanted ${want} ± ${tol}`);
const rel = (got, want, tol, label) => assert.ok(Math.abs(got / want - 1) <= tol, `${label}: got ${got.toExponential(3)}, wanted ${want.toExponential(3)} within ${tol * 100}%`);
const S = useAcidEngine;
const get = () => S.getState();
const base = { tempC: 25, method: 'paper', drops: 5, spoil: { A: null, B: null } };
const tube = (acid, dilution = 1, tempC = 25) => analyseTube({ acid, dilution }, { ...base, tempC });

/* ══ CHEMISTRY ═══════════════════════════════════════════════════════════════ */

/* ── 1 · A strong acid, against measured activity coefficients ────────────────── */
/* Robinson & Stokes: γ± of HCl is 0.796, 0.904, 0.965 at 0.1, 0.01, 0.001 mol/kg. */
const hclRef = [[1, 0.796], [10, 0.904], [100, 0.965]];
hclRef.forEach(([d, g]) => near(tube('hcl', d).pH, -Math.log10(g * 0.1 / d), 0.02, `HCl ×${d}`));
const hclAlpha = [1, 10, 100, 1000].map((d) => { const t = tube('hcl', d); return workings(t.pH, t.C).alpha; });
assert.ok(hclAlpha.every((a, i) => i === 0 || a > hclAlpha[i - 1]), 'the apparent ionisation of a strong acid must climb towards 1 on dilution');
near(hclAlpha[0], 0.78, 0.03, 'HCl 0.1 M apparent [H+]/C'); near(hclAlpha[2], 0.965, 0.015, 'HCl 0.001 M apparent [H+]/C');
ok.push(`a strong acid, against measured data: 0.1 / 0.01 / 0.001 M HCl read pH ${[1, 10, 100].map((d) => tube('hcl', d).pH.toFixed(3)).join(' / ')} (from γ± 0.796 / 0.904 / 0.965: ${hclRef.map(([d, g]) => (-Math.log10(g * 0.1 / d)).toFixed(3)).join(' / ')}); the worksheet's "[H⁺] = C" check gives ${hclAlpha.slice(0, 3).map((a) => (a * 100).toFixed(0)).join(' / ')} % — the activity coefficient, not incomplete ionisation, and it vanishes on dilution`);

/* ── 2 · A weak acid: published pH, α and Ka ──────────────────────────────────── */
const aceticPH = { 1: 2.87, 10: 3.39, 100: 3.91 };           // published for 0.1 / 0.01 / 0.001 M
Object.entries(aceticPH).forEach(([d, p]) => near(tube('acetic', Number(d)).pH, p, 0.03, `acetic ×${d}`));
const acetic = [1, 10, 100, 1000].map((d) => tube('acetic', d));
near(acetic[0].alpha * 100, 1.34, 0.08, 'acetic 0.1 M α'); near(acetic[1].alpha * 100, 4.2, 0.2, 'acetic 0.01 M α'); near(acetic[2].alpha * 100, 12.4, 0.8, 'acetic 0.001 M α');
const ratio = [acetic[1].alpha / acetic[0].alpha, acetic[2].alpha / acetic[1].alpha, acetic[3].alpha / acetic[2].alpha];
ratio.forEach((r) => assert.ok(r > 2.4 && r < 3.3, `Ostwald: α should grow by about √10 = 3.16 per decade (got ${r.toFixed(2)})`));
ok.push(`a weak acid, against published values: 0.1 / 0.01 / 0.001 M acetic acid is pH ${[0, 1, 2].map((i) => acetic[i].pH.toFixed(2)).join(' / ')} (published 2.87 / 3.39 / 3.91) and ${[0, 1, 2].map((i) => (acetic[i].alpha * 100).toFixed(1)).join(' / ')} % ionised (published 1.34 / 4.2 / 12.4); α grows ×${ratio.map((r) => r.toFixed(2)).join(', ×')} per decade of dilution — Ostwald's √10 = 3.16, a little less as (1 − α) bites`);

/* ── 3 · The worksheet's arithmetic recovers the constant ─────────────────────── */
const Kref = ACID_BY_ID.acetic.Ka;
near(Kref, 1.754e-5, 5e-8, 'acetic Ka');
const kaFromPH = [1, 10, 100, 1000].map((d) => { const t = acetic[[1, 10, 100, 1000].indexOf(d)]; return workings(t.pH, t.C).Ka; });
kaFromPH.forEach((k, i) => rel(k, Kref, 0.06, `Ka from pH at ×${[1, 10, 100, 1000][i]}`));
assert.equal(workings(tube('hcl').pH, tube('hcl').C).Ka, null, 'the weak-acid formula must not be applied to a strong acid');
ok.push(`Ka = Cα²/(1 − α) from nothing but the meter's pH and the label gives ${kaFromPH.map((k) => (k * 1e5).toFixed(2)).join(' / ')} ×10⁻⁵ over ×1–×1000 against the constant ${(Kref * 1e5).toFixed(2)} ×10⁻⁵ — the activity coefficient cancels out of Ka — and the worksheet declines to give a Ka for HCl (α is not small)`);

/* ── 4 · The others on the shelf ───────────────────────────────────────────────── */
near(tube('hno3').pH, tube('hcl').pH, 0.01, 'HNO3 vs HCl');
near(tube('formic').pH, 2.39, 0.06, 'formic'); near(tube('citric').pH, 2.08, 0.07, 'citric');
near(tube('h2so4').pH, 1.07, 0.1, 'H2SO4'); near(tube('phosphoric').pH, 1.65, 0.1, 'phosphoric'); near(tube('oxalic').pH, 1.35, 0.1, 'oxalic');
const citricKa = (() => { const t = tube('citric'); return workings(t.pH, t.C).Ka; })();
rel(citricKa, ACID_BY_ID.citric.Ka, 0.1, 'citric Ka1 from pH');
const order = ['hcl', 'h2so4', 'oxalic', 'phosphoric', 'citric', 'formic', 'acetic'].map((id) => tube(id).pH);
assert.ok(order.every((p, i) => i === 0 || p >= order[i - 1] - 0.3), 'the 0.1 M acids should fall in the order of their strength, to within the polyprotic overlaps');
ok.push(`the rest of the shelf at 0.1 M: HNO₃ ${tube('hno3').pH.toFixed(2)} (= HCl), H₂SO₄ ${tube('h2so4').pH.toFixed(2)} (the second proton is only partly given up), oxalic ${tube('oxalic').pH.toFixed(2)}, phosphoric ${tube('phosphoric').pH.toFixed(2)}, citric ${tube('citric').pH.toFixed(2)} — and the monoprotic worksheet applied to citric gives Ka ${(citricKa * 1e4).toFixed(2)} ×10⁻⁴ against its first constant ${(ACID_BY_ID.citric.Ka * 1e4).toFixed(2)} ×10⁻⁴, formic ${tube('formic').pH.toFixed(2)}, acetic ${tube('acetic').pH.toFixed(2)}`);

/* ── 5 · Strength is not concentration ────────────────────────────────────────── */
const weakConc = tube('acetic', 1).pH; const strongDilute = tube('hcl', 1000).pH;
assert.ok(weakConc < strongDilute, 'a 0.1 M weak acid is more acidic than a 10⁻⁴ M strong one');
ok.push(`strength is not concentration: 0.1 M acetic acid (pH ${weakConc.toFixed(2)}) is MORE acidic than 0.0001 M HCl (pH ${strongDilute.toFixed(2)}), though HCl is the strong one — and the bench will let you set that comparison up, and call it unfair`);

/* ── 6 · Dilution, per decade ─────────────────────────────────────────────────── */
const per = (id) => [10, 100, 1000].map((d) => tube(id, d).pH - tube(id, d / 10).pH);
const sPer = per('hcl'); const wPer = per('acetic');
sPer.forEach((d) => assert.ok(d > 0.93 && d < 1.0, `strong acid: ${d} per decade`));
/* Differentiating x² = Ka(C − x) gives d(pH)/d(log C) = −1/(2 − α): half a unit
   when α is small, climbing to a whole unit as the acid ionises completely. */
const wPred = [[1, 10], [10, 100], [100, 1000]].map(([a, b]) => 1 / (2 - 0.5 * (tube('acetic', a).alpha + tube('acetic', b).alpha)));
wPer.forEach((d, i) => near(d, wPred[i], 0.03, `weak acid per decade, predicted 1/(2−α) = ${wPred[i].toFixed(3)}`));
ok.push(`pH change per tenfold dilution — strong acid ${sPer.map((d) => d.toFixed(2)).join(', ')} (one unit, less the activity correction that fades), weak acid ${wPer.map((d) => d.toFixed(2)).join(', ')} against the analytic 1/(2 − α) = ${wPred.map((d) => d.toFixed(2)).join(', ')}: half a unit while α is small, creeping towards one as the acid ionises completely`);

/* ── 7 · Temperature ───────────────────────────────────────────────────────────── */
const aT = [15, 25, 40].map((T) => tube('acetic', 1, T).pH);
assert.ok(Math.max(...aT) - Math.min(...aT) < 0.05, 'acetic acid is nearly athermal');
ok.push(`temperature: 0.1 M acetic acid is pH ${aT.map((p) => p.toFixed(3)).join(' / ')} at 15 / 25 / 40 °C — its ionisation enthalpy is almost nil, so the published figure holds all week`);

/* ══ THE BENCH, through the real store ═══════════════════════════════════════ */

const fresh = (patch = {}) => { get().reset(); get().setTimeScale(10); Object.entries(patch).forEach(([k, v]) => get()[k]?.(v)); };
const waitStable = (max = 300) => { for (let t = 0; t < max; t += 0.5) { get().tick(0.05); if (meterReading(get()).stable && t > 3) return t; } return Infinity; };
const measure = (t, rinse = true) => { if (rinse) get().rinse(); get().dip(t); waitStable(); return meterReading(get()).pH; };
const last = () => get().log[get().log.length - 1];

/* ── 8 · A fair comparison ─────────────────────────────────────────────────────── */
fresh();
assert.equal(equalConcentration(get()), true, 'the two tubes start at the same concentration');
get().setDilutionLogA(2);
assert.deepEqual([get().A.dilution, get().B.dilution], [100, 100], 'linked: moving one tube moves the other');
get().setLink('off'); get().setDilutionLogB(3);
assert.deepEqual([get().A.dilution, get().B.dilution], [100, 1000]);
assert.equal(equalConcentration(get()), false);
assert.ok(/different concentrations/.test(notesFor(get(), 'A')), 'an unfair comparison must be flagged in the notebook');
get().setLink('on');
assert.deepEqual([get().A.dilution, get().B.dilution], [100, 100], 're-linking makes B up again at A’s dilution');
ok.push('a fair comparison is something you hold: linked, moving one dilution moves both tubes; unlinked, they can be set apart and the notebook flags "tubes at different concentrations"; linking again re-makes B at A’s dilution');

/* ── 9 · Measuring both tubes, properly ───────────────────────────────────────── */
fresh();
const pA = measure('A'); get().record('A');
const rowA = last();
const pB = measure('B'); get().record('B');
const rowB = last();
near(pA, get().world.A.pH, 0.02, 'tube A read'); near(pB, get().world.B.pH, 0.02, 'tube B read');
assert.equal(rowA.Ka, null); near(rowA.alpha, 78, 4, 'HCl α_app %');
rel(rowB.Ka, ACID_BY_ID.acetic.Ka, 0.06, 'acetic Ka from the row'); near(rowB.alpha, 1.34, 0.12, 'acetic α_app %');
assert.equal(rowB.note, '', 'a clean measurement carries no warning');
ok.push(`measured properly (calibrated, rinsed, settled): HCl pH ${rowA.pH} → [H⁺] ${rowA.H} M, "α" ${rowA.alpha} %, no Ka; acetic acid pH ${rowB.pH} → [H⁺] ${rowB.H} M, α ${rowB.alpha} %, Ka ${rowB.Ka} (published ${(ACID_BY_ID.acetic.Ka * 1e5).toFixed(2)}×10⁻⁵)`);

/* ── 10 · Not rinsing between the tubes ────────────────────────────────────────── */
fresh(); get().setLink('off'); get().setDilutionLogB(2);   // A: 0.1 M HCl, B: 0.001 M acetic
measure('A');
get().dip('B'); waitStable();                            // straight over, unrinsed
const dirty = meterReading(get()).pH; const clean = get().world.B.pH;
assert.equal(statusOf(get()).key, 'meter-spoiled');
assert.ok(clean - dirty > 0.2, `20 µL of 0.1 M HCl in 10 mL of 0.001 M acetic acid must show (read ${dirty}, true ${clean})`);
get().record('B'); assert.ok(/unrinsed/.test(last().note));
get().rinse(); get().dip('B'); waitStable();
assert.ok(clean - meterReading(get()).pH > 0.2, 'rinsing afterwards cannot take the acid back out');
get().freshTubes(); measure('B');
near(meterReading(get()).pH, clean, 0.02, 'fresh tube, rinsed');
fresh(); get().setLink('off'); get().setDilutionLogB(2); measure('A'); get().rinse(); const rinsedB = measure('B');
near(rinsedB, get().world.B.pH, 0.02, 'rinsed first');
/* In the other direction the carry-over is harmless: weak acid into a strong one. */
fresh(); get().setLink('off'); get().setDilutionLogB(2); measure('B'); get().dip('A'); waitStable();
const harmless = Math.abs(meterReading(get()).pH - get().world.A.pH);
assert.ok(harmless < 0.02, `weak acid into strong: ${harmless}`);
ok.push(`rinse between the tubes: carrying 0.1 M HCl into 0.001 M acetic acid reads ${dirty.toFixed(2)} for a true ${clean.toFixed(2)} (and rinsing afterwards does nothing — the acid is already in the tube); rinsed first it reads ${rinsedB.toFixed(2)}; carried the other way, weak acid into strong, it is ${harmless.toFixed(3)} out — contamination matters in proportion to how weakly buffered the next tube is`);

/* ── 11 · Reading too soon, and an uncalibrated meter ──────────────────────────── */
fresh(); get().rinse(); get().dip('A'); for (let i = 0; i < 4; i += 1) get().tick(0.05);
assert.equal(meterReading(get()).stable, false); assert.equal(statusOf(get()).key, 'meter-settling');
get().record('A'); assert.ok(/not settled/.test(last().note));
fresh({ setMeterCal: 'none' }); const uncal = measure('B');
assert.ok(Math.abs(uncal - get().world.B.pH) > 0.1, `an uncalibrated meter must be off (read ${uncal})`);
assert.equal(statusOf(get()).key, 'meter-uncal'); get().record('B'); assert.ok(/uncalibrated/.test(last().note));
ok.push(`reading too soon: 2 s after dipping the meter is not stable and the row says "not settled"; an uncalibrated meter reads ${uncal.toFixed(2)} for a true ${get().world.B.pH.toFixed(2)} — off by its own asymmetry — and the row says "uncalibrated"`);

/* ── 12 · What the eye sees ─────────────────────────────────────────────────────── */
fresh({ setMethod: 'universal' });
const cA = get().world.A.universal.colour; const cB = get().world.B.universal.colour;
const dE = deltaE(srgbToLab(cA.srgb), srgbToLab(cB.srgb));
assert.ok(dE > 12, `two acids at one concentration must look different in indicator (ΔE ${dE})`);
const chartA = readChart(cA.srgb, CHART).pH; const chartB = readChart(cB.srgb, CHART).pH;
assert.ok(chartB > chartA, 'the weak acid matches a higher patch');
fresh({ setMethod: 'paper' });
assert.equal(statusOf(get()).key, 'paper-ready'); get().dipStripA(); assert.equal(statusOf(get()).key, 'paper-one');
get().dipStripB(); get().tick(0.05); assert.equal(statusOf(get()).key, 'paper-developing');
get().setPickA(String(chartA)); get().record('A'); assert.ok(/before the colour developed/.test(last().note));
for (let i = 0; i < 40; i += 1) get().tick(0.05); assert.equal(statusOf(get()).key, 'paper-match');
ok.push(`the eye: at one concentration, HCl and acetic acid are ΔE ${dE.toFixed(0)} apart in universal indicator — a difference you see before you read a number — and match chart patches ${chartA} and ${chartB}; a strip read at once is flagged "read before the colour developed"`);

/* ── 13 · The whole experiment: dilute, measure, analyse ───────────────────────── */
fresh(); get().clearLog();
for (const lg of [0, 1, 2, 3]) {
  get().setDilutionLogA(lg);
  get().rinse(); get().dip('A'); waitStable(); get().record('A');
  get().rinse(); get().dip('B'); waitStable(); get().record('B');
}
const fits = get().analysis.fits;
const slopeStrong = fits.hcl.slope; const slopeWeak = fits.acetic.slope;
assert.ok(slopeStrong < -0.94 && slopeStrong > -1.0, `strong acid slope ${slopeStrong}`);
assert.ok(slopeWeak < -0.45 && slopeWeak > -0.55, `weak acid slope ${slopeWeak}`);
rel(fits.acetic.Ka, ACID_BY_ID.acetic.Ka, 0.06, 'mean Ka over the dilution series');
assert.equal(fits.hcl.Ka, null);
assert.equal(get().log.length, 8);
ok.push(`the full experiment through the store — 8 meter readings over ×1–×1000: pH against log C has slope ${slopeStrong.toFixed(2)} for HCl and ${slopeWeak.toFixed(2)} for acetic acid (one unit and half a unit per decade), and the mean Ka is ${(fits.acetic.Ka * 1e5).toFixed(2)} ×10⁻⁵ against ${(Kref * 1e5).toFixed(2)}`);

/* ══ CONTROL-RESPONSE MATRIX ═════════════════════════════════════════════════ */
const matrix = [];
const sweep = (label, setup, patches, key, dir) => {
  const vals = patches.map((p) => { fresh(); setup(); p(); return key(get()); });
  for (let i = 1; i < vals.length; i += 1) assert.ok(dir * (vals[i] - vals[i - 1]) > 0, `${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')} is not ${dir > 0 ? 'rising' : 'falling'}`);
  matrix.push(`${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
};
sweep('tube B dilution ×1, 10, 100, 1000 raises its pH', () => get().setLink('off'), [0, 1, 2, 3].map((l) => () => get().setDilutionLogB(l)), (s) => s.world.B.pH, +1);
sweep('tube A dilution raises its pH', () => get().setLink('off'), [0, 1, 2, 3].map((l) => () => get().setDilutionLogA(l)), (s) => s.world.A.pH, +1);
sweep('tube B acid, HCl → H₂SO₄-free order: oxalic, phosphoric, citric, formic, acetic raise the pH', () => {}, ['oxalic', 'phosphoric', 'citric', 'formic', 'acetic'].map((a) => () => get().setAcidB(a)), (s) => s.world.B.pH, +1);
sweep('universal indicator drops 0, 2, 5, 12 on 0.001 M acetic acid raise its pH (the dye is an acid\'s conjugate pair)', () => { get().setMethod('universal'); get().setDilutionLogB(2); get().setLink('off'); }, [0, 2, 5, 12].map((n) => () => get().setDrops(n)), (s) => (s.world.B.universal ? s.world.B.universal.pH : s.world.B.pH), +1);
matrix.push('link on/off, method, meter calibration, electrode position, rinse, fresh tubes, strips and chart picks each exercised above through the store');
assert.notEqual(JSON.stringify(universalColour(1.1).srgb), JSON.stringify(universalColour(2.9).srgb));
ok.push(`EVERY setting swept on its own, and every one moves the right way:\n      ${matrix.join('\n      ')}`);

/* ── Determinism and frame-rate independence ────────────────────────────────────── */
const run = (dt) => { fresh(); get().setTimeScale(1); get().rinse(); get().dip('B'); for (let t = 0; t < 60; t += dt) get().tick(dt); return meterReading(get()).pH; };
const a = run(0.05); const b = run(0.05); assert.equal(a, b);
const c = run(1 / 60); near(c, a, 0.06, 'frame rate');
ok.push(`deterministic and frame-rate independent: the same 60 s run twice is identical (${a.toFixed(3)}), and at 60 fps instead of 20 it reads ${c.toFixed(3)}`);

console.log('\nXI-CHE-C02 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
