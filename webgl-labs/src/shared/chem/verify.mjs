/**
 * Holds the aqueous solver to measured pH values. `node verify.mjs` — no
 * browser, no bundler. Every figure asserted here is one a Class XI examiner
 * would recognise, and most are ones a pH meter in a school laboratory gives.
 */
import assert from 'node:assert/strict';
import { solveAqueous, dilute, bufferCapacity, systemFrom, withIon, mix, withAdditive } from './aqueous.js';
import { INDICATORS, indicatorColour, universalColour, buildChart, readChart, indicatorAdditive } from './indicators.js';
import { hueOf } from './spectra.js';
import { makeElectrode, factoryMeter, calibrate, displayPH, electrodePotential, settle, K_NA } from './phMeter.js';
import { nernstSlope_mV } from './constants.js';
import { mulberry32 } from '../numerics.js';
import { WEAK, SOLIDS, SUBSTANCES, FOODS, BUFFERS } from './species.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(3)}, wanted ${want} ± ${tol}`);
const sys = (id, c, T = 25) => systemFrom([{ recipe: SUBSTANCES[id], scale: c }], { T, WEAK, SOLIDS });
const pH = (id, c, T) => solveAqueous(sys(id, c, T)).pH;
const food = (id) => solveAqueous(systemFrom([{ recipe: FOODS[id], scale: 1 }], { WEAK, SOLIDS })).pH;

/* ── 1 · Water ─────────────────────────────────────────────────────────────── */
const w0 = solveAqueous({ T: 0 }).pH; const w25 = solveAqueous({ T: 25 }).pH; const w100 = solveAqueous({ T: 100 }).pH;
near(w25, 7.00, 0.01, 'water 25 °C'); near(w0, 7.47, 0.02, 'water 0 °C'); near(w100, 6.13, 0.02, 'water 100 °C');
ok.push(`water is neutral at the temperature's own pH: ${w0.toFixed(2)} at 0 °C, ${w25.toFixed(2)} at 25 °C, ${w100.toFixed(2)} at 100 °C — "neutral is pH 7" is a statement about 25 °C, not about neutrality`);

/* ── 2 · The textbook trap ─────────────────────────────────────────────────── */
const trap = pH('hcl', 1e-8);
near(trap, 6.98, 0.01, '1e-8 M HCl');
ok.push(`10⁻⁸ M HCl is pH ${trap.toFixed(2)}, not 8: water's own ionisation is solved with the acid, not ignored — an acid cannot make a solution basic`);

/* ── 3 · Strong acids and bases, with activities ───────────────────────────── */
const hcl = [0.1, 0.01, 0.001].map((c) => pH('hcl', c));
/* Expected values come from the measured mean activity coefficients of HCl —
   γ± = 0.796, 0.904, 0.965 at 0.1, 0.01, 0.001 m (Robinson & Stokes) — not from
   the solver: pH = −log(c γ±) = 1.099, 2.044, 3.016. */
near(hcl[0], 1.099, 0.03, '0.1 M HCl'); near(hcl[1], 2.044, 0.015, '0.01 M HCl'); near(hcl[2], 3.016, 0.01, '0.001 M HCl');
const naoh = [0.1, 0.01].map((c) => pH('naoh', c));
near(naoh[0], 12.90, 0.04, '0.1 M NaOH'); near(naoh[1], 11.95, 0.03, '0.01 M NaOH');
ok.push(`a pH meter reads activity, not concentration: 0.1 M HCl is ${hcl[0].toFixed(2)} not 1.00, 0.01 M is ${hcl[1].toFixed(2)}, 0.001 M is ${hcl[2].toFixed(2)}; 0.1 M NaOH is ${naoh[0].toFixed(2)} not 13.00`);

/* ── 4 · Weak acids and bases ──────────────────────────────────────────────── */
const hac = [1, 0.1, 0.01].map((c) => pH('acetic', c));
near(hac[0], 2.37, 0.03, '1 M acetic'); near(hac[1], 2.88, 0.03, '0.1 M acetic'); near(hac[2], 3.39, 0.03, '0.01 M acetic');
const nh3 = [1, 0.1].map((c) => pH('ammonia', c));
near(nh3[0], 11.62, 0.04, '1 M NH3'); near(nh3[1], 11.13, 0.04, '0.1 M NH3');
ok.push(`weak acids and bases: acetic acid ${hac.map((x) => x.toFixed(2)).join(' / ')} at 1 / 0.1 / 0.01 M — a tenfold dilution moves it by half a unit, not one; ammonia ${nh3.map((x) => x.toFixed(2)).join(' / ')} at 1 / 0.1 M`);

/* ── 5 · Salts are not neutral ─────────────────────────────────────────────── */
/* Each salt is checked against an INDEPENDENT closed-form derivation, with the
   activity coefficient from Davies at the solution's own ionic strength — not
   against a remembered number, and not against the solver's own output. The
   ideal-solution formula (pH = ½(pKa − log c)) leaves out exactly the activity
   effect the solver exists to include, so it is off by about 0.1 and that gap
   is the physics, not an error. */
const A25 = 0.511;
const logG = (z, I) => -A25 * z * z * (Math.sqrt(I) / (1 + Math.sqrt(I)) - 0.3 * I);
const c0 = 0.1;
const pKw25 = 13.995;
const nh4 = 0.5 * (WEAK.ammonia.pKas[0] - Math.log10(c0)) - logG(1, c0);               // NH4+ is a weak acid
const acet = 0.5 * (pKw25 + WEAK.acetic.pKas[0] + Math.log10(c0)) + logG(1, c0);        // acetate is a weak base
near(pH('nacl', c0), 7.00, 0.03, '0.1 M NaCl');
near(pH('nh4cl', c0), nh4, 0.03, '0.1 M NH4Cl'); near(pH('nh4cl', c0), 5.2, 0.15, 'NH4Cl vs literature');
near(pH('naac', c0), acet, 0.03, '0.1 M NaOAc'); near(pH('naac', c0), 8.85, 0.15, 'NaOAc vs literature');
/* An ampholyte: pH = ½(pKa₁+pKa₂) + ½ log γ(CO₃²⁻), the second term being the
   activity of the doubly charged ion — 0.2 of a pH unit at I = 0.1, which is why
   the textbook 8.34 and a meter's 8.1–8.3 differ. */
const bicarb = 0.5 * (WEAK.carbonic.pKas[0] + WEAK.carbonic.pKas[1]) + 0.5 * logG(-2, c0);
near(pH('nahco3', c0), bicarb, 0.04, '0.1 M NaHCO3'); near(pH('nahco3', c0), 8.3, 0.25, 'NaHCO3 vs literature');
/* Sodium carbonate at 0.1 M has I = 0.3, beyond where Davies is validated, so
   it is checked against the independent closed form (hydrolysis of CO₃²⁻ with
   activity coefficients at I = 0.3) — and against the ideal-solution 11.65 only
   loosely, because the activity of OH⁻ and the stabilised dianion both pull the
   answer down by a couple of tenths. The solver says so in its `accuracy`. */
{
  const Kb1 = 10 ** -(pKw25 - WEAK.carbonic.pKas[1]);
  const g1 = 10 ** logG(1, 0.3); const g2 = 10 ** logG(2, 0.3);
  const a = (g1 * g1) / g2;
  const x = (-Kb1 + Math.sqrt(Kb1 * Kb1 + 4 * a * Kb1 * c0)) / (2 * a);
  const closed = pKw25 + Math.log10(g1 * x);
  near(pH('na2co3', c0), closed, 0.04, '0.1 M Na2CO3 closed form');
  near(pH('na2co3', c0), 11.65, 0.35, 'Na2CO3 vs ideal');
  assert.equal(solveAqueous(sys('na2co3', c0)).accuracy, 'approximate', 'and it must admit it');
}
ok.push(`salts are not neutral, and the solver agrees with an independent derivation: 0.1 M ${['nacl', 'nh4cl', 'naac', 'nahco3', 'na2co3'].map((id) => `${SUBSTANCES[id].formula} ${pH(id, c0).toFixed(2)}`).join(' · ')} — NH₄Cl is ${nh4.toFixed(2)} by closed form and acetate ${acet.toFixed(2)}, the activity of H⁺ moving each about 0.1 from the ideal-solution formula`);

/* ── 5b · The primary standards a pH meter is calibrated against ───────────── */
/* The strongest independent test the solver has. Each NIST/IUPAC standard has an
   exactly known composition and a certified pH, so the solver is asked to
   reproduce the certified number from composition, pKa and activity alone — with
   nothing tuned to it. */
const nist = Object.values(BUFFERS).map((b) => {
  const got = solveAqueous(systemFrom([{ recipe: b, scale: 1 }], { WEAK, SOLIDS })).pH;
  near(got, b.nist, 0.02, b.label);
  return `${b.nist.toFixed(3)} → ${got.toFixed(3)}`;
});
const caSat = solveAqueous(systemFrom([{ recipe: SUBSTANCES.limewater, scale: 1 }], { WEAK, SOLIDS })).pH;
near(caSat, 12.454, 0.06, 'saturated Ca(OH)2');
ok.push(`the four NIST primary standards, from composition and pKa alone, certified → solved: ${nist.join(' · ')} — within 0.01 pH of the certified values; saturated Ca(OH)₂ ${caSat.toFixed(2)} against 12.45`);

/* ── 5c · …and over temperature ──────────────────────────────────────────────── */
/* The NIST tables give each standard's certified pH from 0 to 40 °C. Nothing in
   the solver was fitted to them: the only temperature input is the van 't Hoff
   shift of each pKa from its enthalpy of ionisation, and pKw. */
const NIST_T = { // °C → [phthalate, phosphate, borax, carbonate]
  15: [3.999, 6.900, 9.276, 10.118], 20: [4.002, 6.881, 9.225, 10.062], 30: [4.015, 6.853, 9.139, 9.966], 40: [4.035, 6.838, 9.068, 9.889],
};
const tRows = [];
for (const [T, vals] of Object.entries(NIST_T)) {
  const got = Object.values(BUFFERS).map((b) => solveAqueous({ ...systemFrom([{ recipe: b, scale: 1 }], { WEAK, SOLIDS }), T: Number(T) }).pH);
  got.forEach((g, i) => near(g, vals[i], 0.05, `${Object.keys(BUFFERS)[i]} at ${T} °C`));
  tRows.push(`${T} °C ${got.map((g, i) => (g - vals[i] >= 0 ? '+' : '') + (g - vals[i]).toFixed(2)).join('/')}`);
}
ok.push(`the buffers move with temperature as NIST says they do, from nothing but ΔH of ionisation — deviation of solved from certified (phthalate/phosphate/borax/carbonate): ${tRows.join(' · ')}`);

/* The effect a student can see: ammonia's pH falls with temperature, acetic acid's barely moves. */
const nh3T = [15, 40].map((T) => solveAqueous({ ...sys('ammonia', 0.1), T }).pH);
const hacT = [15, 40].map((T) => solveAqueous({ ...sys('acetic', 0.1), T }).pH);
assert.ok(nh3T[0] - nh3T[1] > 0.35, 'ammonia must fall by about 0.4 from 15 to 40 °C');
assert.ok(Math.abs(hacT[0] - hacT[1]) < 0.06, 'while acetic acid, with ΔH ≈ 0, barely moves');
ok.push(`and a student can see it: 0.1 M ammonia is ${nh3T[0].toFixed(2)} at 15 °C and ${nh3T[1].toFixed(2)} at 40 °C (ΔH = +52 kJ/mol), 0.1 M acetic acid ${hacT[0].toFixed(2)} and ${hacT[1].toFixed(2)} (ΔH ≈ 0)`);

/* ── 6 · Polyprotic and metal-ion acids ────────────────────────────────────── */
near(pH('phosphoric', 0.1), 1.62, 0.08, 'H3PO4'); near(pH('h2so4', 0.1), 0.98, 0.1, 'H2SO4');
/* Metal-ion salts at 0.1 M are the hardest case for any activity model: I = 0.3
   to 0.6 with 3+ and 2+ ions, well past where Davies is validated. The bands are
   the spread of measured values, and the solver is required to say it is only
   approximate there — a bench that implied three-figure precision for 0.1 M
   AlCl₃ would be lying. */
near(pH('fecl3', 0.1), 1.90, 0.3, 'FeCl3'); near(pH('alcl3', 0.1), 3.15, 0.45, 'AlCl3');
for (const id of ['fecl3', 'alcl3']) assert.notEqual(solveAqueous(sys(id, 0.1)).accuracy, 'good', `${id} must not claim to be accurate`);
ok.push(`polyprotic and metal-ion acids: 0.1 M H₃PO₄ ${pH('phosphoric', 0.1).toFixed(2)}, H₂SO₄ ${pH('h2so4', 0.1).toFixed(2)}; FeCl₃ ${pH('fecl3', 0.1).toFixed(2)}, AlCl₃ ${pH('alcl3', 0.1).toFixed(2)} — hydrolysis of the aqua cation, which is why a salt of a strong acid can be acidic`);

/* ── 7 · The buffer, and why it is one ─────────────────────────────────────── */
const buf = (a, b) => ({ T: 25, strong: [{ z: +1, c: b }], weak: [{ id: 'acetic', C: a + b, z0: 0, pKas: WEAK.acetic.pKas }] });
const b11 = buf(0.1, 0.1);
/* Henderson–Hasselbalch is the ideal-solution limit. With activities,
   pH = pKa + log([A⁻]/[HA]) + log γ(A⁻), and log γ = −0.108 at I = 0.1 — which is
   why a real 0.1 M acetate buffer reads about 4.65, not 4.76. */
const hh = WEAK.acetic.pKas[0] + logG(1, 0.1);
near(solveAqueous(b11).pH, hh, 0.03, '1:1 acetate buffer');
near(solveAqueous(b11).pH, 4.756, 0.15, 'and within a tenth of Henderson-Hasselbalch');
const dil = solveAqueous(dilute(b11, 0.1)).pH - solveAqueous(b11).pH;
assert.ok(Math.abs(dil) < 0.08, 'a buffer must barely move on 10× dilution');
const strongDil = solveAqueous(dilute(sys('hcl', 0.01), 0.1)).pH - solveAqueous(sys('hcl', 0.01)).pH;
assert.ok(strongDil > 0.9, 'while a strong acid must move by about a unit');
ok.push(`a buffer resists: diluting the 1:1 acetate buffer tenfold moves its pH ${dil.toFixed(3)}, diluting 0.01 M HCl the same way moves it ${strongDil.toFixed(2)}`);
const beta = bufferCapacity(b11);
/* Ideal β_max = 2.303 C/4 = 0.576 C. Measured by ADDING base, the ionic strength
   rises with it and γ shifts, which adds a few per cent: d(log γ)/dI = −0.31 at
   I = 0.1 against a main ΔpH of 8.7e-6 per 1e-6 M gives +3.6% — and 0.598 is
   what the solver finds. */
near(beta / 0.2, 0.576, 0.03, 'beta_max / C');
const betaOff = bufferCapacity(buf(0.02, 0.18));
assert.ok(betaOff < beta * 0.5, 'capacity must fall away from the 1:1 point');
ok.push(`buffer capacity peaks where acid and base are equal: β = ${(beta / 0.2).toFixed(3)} C at 1:1 (theory 0.576), and ${(betaOff / beta * 100).toFixed(0)}% of that at 1:9`);

/* ── 8 · Sparingly soluble hydroxides ──────────────────────────────────────── */
const mg = pH('mgoh2', 1); const ca = pH('limewater', 1);
near(mg, 10.35, 0.25, 'Mg(OH)2'); near(ca, 12.35, 0.12, 'Ca(OH)2');
ok.push(`a solubility product sets the pH: saturated Mg(OH)₂ ${mg.toFixed(2)} (milk of magnesia), Ca(OH)₂ ${ca.toFixed(2)} (lime water)`);

/* ── 9 · Foods and household liquids land in the ranges the literature gives ── */
const RANGES = { lemon: [2.0, 2.6], orange: [3.3, 4.2], apple: [3.2, 4.0], tomato: [4.0, 4.9], vinegar: [2.4, 2.9], cola: [2.3, 2.8], rain: [5.5, 5.7], water: [6.95, 7.05] };
const rows = Object.entries(RANGES).map(([id, [lo, hi]]) => {
  const p = food(id);
  assert.ok(p >= lo && p <= hi, `${id} pH ${p.toFixed(2)} outside the literature range ${lo}–${hi}`);
  return `${FOODS[id].label} ${p.toFixed(2)}`;
});
ok.push(`computed from composition, not looked up — every one inside its published range: ${rows.join(' · ')}`);

/* ── 10 · Electroneutrality holds to machine precision, everywhere ─────────── */
let worst = 0;
for (const id of Object.keys(SUBSTANCES)) {
  for (const c of [1e-4, 1e-2, 0.1, 1]) {
    const r = solveAqueous(sys(id, c));
    assert.ok(r.converged, `${id} ${c} M did not converge`);
    worst = Math.max(worst, Math.abs(r.imbalance) / Math.max(1e-12, r.ionicStrength + 1e-9));
  }
}
assert.ok(worst < 1e-6, `charge balance residual ${worst}`);
ok.push(`${Object.keys(SUBSTANCES).length} substances × 4 concentrations all converge, with the charge balance closed to ${worst.toExponential(0)} of the ionic strength`);

/* ── 11 · pH is monotonic in everything it ought to be ─────────────────────── */
const sweep = (id, cs) => cs.map((c) => pH(id, c));
const rising = (a) => a.every((v, i) => i === 0 || v > a[i - 1] - 1e-9);
const falling = (a) => a.every((v, i) => i === 0 || v < a[i - 1] + 1e-9);
const cs = [1e-4, 1e-3, 1e-2, 0.1, 1];
assert.ok(falling(sweep('hcl', cs)), 'a more concentrated acid must have a lower pH');
assert.ok(falling(sweep('acetic', cs)), 'including a weak one');
assert.ok(rising(sweep('naoh', cs)) && rising(sweep('ammonia', cs)), 'and a more concentrated base a higher one');
assert.ok(rising(sweep('naac', cs)) && falling(sweep('nh4cl', cs)), 'and salts go the way their ions say');
const acetic = (Ka) => pH('acetic', 0.1); void acetic;
ok.push('monotonic where it must be: acids fall and bases rise with concentration, and salts go the way their ions say');

/* ── 12 · Ka comes back out of the pH ──────────────────────────────────────── */
const r = solveAqueous(sys('acetic', 0.1));
const A = r.species[0].species;
const Kapp = (r.aH * A[1].conc) / A[0].conc;
near(Math.log10(Kapp) * -1, 4.756, 0.02, 'pKa recovered');
ok.push(`the constant comes back out: from the computed pH and the speciation, pKa(acetic) = ${(-Math.log10(Kapp)).toFixed(3)} against 4.756 put in`);

/* ══ Instruments ═══════════════════════════════════════════════════════════════
   What a student measures a pH WITH, each held to what it should do. */

/* ── 13 · Colour is computed from absorption, and it comes out right ───────── */
const hueAt = (pH) => hueOf(universalColour(pH).srgb);
const hues = [2, 4, 6, 7, 9, 12].map(hueAt);
assert.ok(hues[0] < 30, 'strongly acid universal indicator must be red-orange');
assert.ok(hues[2] > 50 && hues[2] < 70, 'pH 6 must be yellow');
assert.ok(hues[3] > 100 && hues[3] < 150, 'neutral must be green');
assert.ok(hues[5] > 195 && hues[5] < 235, 'strongly basic must be blue');
for (let i = 1; i < hues.length; i += 1) assert.ok(hues[i] >= hues[i - 1] - 1, `the colour must walk monotonically through the spectrum (${hues.map(Math.round)})`);
ok.push(`universal indicator, from the absorption of its four dyes, not painted: hue ${hues.map((h) => Math.round(h) + '°').join(' → ')} at pH 2, 4, 6, 7, 9, 12 — orange-red, orange, yellow, green, teal, blue`);

/* ── 14 · An indicator's colour is a MIX, centred on its pKa ───────────────── */
const mo = (pH) => indicatorColour({ methylOrange: 2e-5 }, pH);
/* Hue is an angle: methyl orange's acid form is a pinkish red at 337°, which is
   "before" 0° on the wheel, so unwrap before comparing. */
const unwrap = (h) => (h > 300 ? h - 360 : h);
const moHue = [2.5, INDICATORS.methylOrange.pKas[0], 5].map((p) => unwrap(hueOf(mo(p).srgb)));
assert.ok(moHue[1] > moHue[0] && moHue[1] < moHue[2], 'at its pKa methyl orange is between its two colours');
const half = indicatorColour({ methylOrange: 2e-5 }, 3.46).linear;
ok.push(`methyl orange at pH 2.5 / 3.46 / 5 has hue ${moHue.map((h) => Math.round(h) + '°').join(' / ')} (unwrapped): at its pKa it is the intermediate orange, neither red nor yellow — an indicator is a mixture of two forms, not a switch`);
const phph = (pH) => indicatorColour({ phenolphthalein: 2e-5 }, pH);
const sat = (c) => { const m = Math.max(...c.srgb); return m ? (m - Math.min(...c.srgb)) / m : 0; };
assert.ok(sat(phph(7)) < 0.03, 'phenolphthalein is colourless in neutral solution');
assert.ok(sat(phph(11)) > 0.2 && hueOf(phph(11).srgb) > 260, 'and a pink-magenta in base');
ok.push(`phenolphthalein is colourless at pH 7 (saturation ${sat(phph(7)).toFixed(2)}) and magenta at pH 11 (${sat(phph(11)).toFixed(2)}, hue ${Math.round(hueOf(phph(11).srgb))}°)`);
void half;

/* ── 15 · Reading a colour chart: a resolution, not an exact answer ────────── */
const chart = buildChart();
{
  const rng = mulberry32(11);
  const errs = []; const perfect = [];
  for (let rep = 0; rep < 6; rep += 1) for (let p = 3; p <= 12; p += 0.25) {
    const seen = universalColour(p).srgb;
    errs.push(Math.abs(readChart(seen, chart, { rng, noise: 6 }).pH - p));
    perfect.push(Math.abs(readChart(seen, chart).pH - p));
  }
  const within = (a, lim) => a.filter((e) => e <= lim).length / a.length;
  assert.ok(within(perfect, 0.5) > 0.99, 'with no judgement noise the chart is read exactly, to the nearest unit');
  /* The patches from pH 11 up are one colour to the eye (the base end saturates),
     so even a careful reader is more than a unit out there: about five in six
     readings land within a unit, not all of them. */
  assert.ok(within(errs, 1.0) >= 0.80 && within(errs, 1.0) < 0.999, 'with a human\u2019s noise it is about a unit');
  assert.ok(within(errs, 0.5) < within(perfect, 0.5), 'and noise must make it worse');
  ok.push(`reading the chart by colour: a perfect eye is within ±0.5 pH ${(within(perfect, 0.5) * 100).toFixed(0)}% of the time; with a realistic 6 ΔE of lighting and judgement it is ±0.5 ${(within(errs, 0.5) * 100).toFixed(0)}% and ±1 ${(within(errs, 1) * 100).toFixed(0)}% — the real resolution of universal indicator, and why a meter exists`);
}

/* ── 16 · The glass-electrode meter ─────────────────────────────────────────── */
const buffers = Object.values(BUFFERS);
const Ein = (el, p, T = 25, aNa = 0) => electrodePotential(el, { pH: p, aNa, tC: T });
const el = makeElectrode({ seed: 7 });
const cal2 = calibrate([{ E_mV: Ein(el, 4.005), pH: 4.005 }, { E_mV: Ein(el, 9.180), pH: 9.180 }]);
const worst2 = Math.max(...[4.5, 5.5, 6.865, 8, 9.5].map((p) => Math.abs(displayPH(cal2, Ein(el, p)) - p)));
assert.ok(worst2 < 0.01, `a two-point calibration must read true across the range (worst ${worst2})`);
/* A one-point calibration fixes the offset and ASSUMES the ideal slope, so the
   meter then reads 6.865 + η (pH − 6.865): right at the buffer and wrong
   everywhere else by (η − 1)(pH − 6.865). Checked as that formula, on an aged
   electrode where it is large enough to see. */
const old = makeElectrode({ seed: 7, aged: true });
const cal1 = calibrate([{ E_mV: Ein(old, 6.865), pH: 6.865 }]);
const err1 = [3, 10].map((p) => displayPH(cal1, Ein(old, p)) - p);
[3, 10].forEach((p, i) => near(err1[i], (old.efficiency - 1) * (p - 6.865), 1e-9, `one-point error at pH ${p}`));
assert.ok(Math.abs(err1[0]) > 0.2 && Math.abs(err1[1]) > 0.2, 'for a worn electrode that is a quarter of a pH unit');
const raw = [4, 10].map((p) => displayPH(factoryMeter(), Ein(old, p)) - p);
assert.ok(Math.abs(raw[0]) > 0.1, 'an uncalibrated meter must read wrong by the electrode\u2019s asymmetry and slope');
ok.push(`calibration is the whole job: two points read true to ${worst2.toFixed(3)} pH everywhere; with a worn electrode (slope ${(old.efficiency * 100).toFixed(0)}%) one point at 6.86 is off by ${err1[0].toFixed(2)} at pH 3 and ${err1[1].toFixed(2)} at pH 10, exactly (η − 1)(pH − 6.865); uncalibrated it is off by ${raw[0].toFixed(2)} at pH 4 and ${raw[1].toFixed(2)} at pH 10`);
assert.ok(Math.abs(cal2.slopeFraction - el.efficiency) < 0.002, 'and the slope the meter finds is the electrode\u2019s efficiency');
ok.push(`the meter reports the electrode's health: it finds a slope of ${(cal2.slopeFraction * 100).toFixed(1)}% against a true ${(el.efficiency * 100).toFixed(1)}%; an aged electrode would show ${(makeElectrode({ seed: 7, aged: true }).efficiency * 100).toFixed(0)}% and need replacing`);

/* The slope is temperature dependent, which is why there is a temperature probe. */
const sT = [15, 25, 40].map(nernstSlope_mV);
assert.ok(Math.abs(sT[1] - 59.16) < 0.02 && sT[2] > sT[1] && sT[1] > sT[0], 'Nernst slope: 59.16 mV/pH at 25 °C and rising with T');
ok.push(`the Nernstian slope is ${sT.map((s) => s.toFixed(2)).join(' / ')} mV per pH at 15 / 25 / 40 °C`);

/* ── 17 · The alkaline error ────────────────────────────────────────────────── */
const trueNaOH = pH('naoh', 0.1);
const eNa = Ein(el, trueNaOH, 25, 0.08);
const readNaOH = displayPH(cal2, eNa);
assert.ok(trueNaOH - readNaOH > 0.15 && trueNaOH - readNaOH < 0.45, 'in 0.1 M NaOH the glass reads about a quarter of a unit low');
const readKOHish = displayPH(cal2, Ein(el, pH('hcl', 0.1)));
assert.ok(Math.abs(readKOHish - pH('hcl', 0.1)) < 0.02, 'while in acid there is no such error');
ok.push(`the glass responds to Na⁺ as well as H⁺: 0.1 M NaOH is truly ${trueNaOH.toFixed(2)} and the meter reads ${readNaOH.toFixed(2)} — ${(trueNaOH - readNaOH).toFixed(2)} LOW, the alkaline error (K_Na = ${K_NA.toExponential(0)}); in acid it is exact`);

/* ── 18 · Settling ────────────────────────────────────────────────────────────── */
{
  let E = Ein(el, 4.005); const target = Ein(el, 9.180); const rng = mulberry32(3);
  const tEnd = 8 * el.tau_s;                    // eight time constants: e⁻⁸ = 0.03% of the step remains
  const at = { 2: null, 15: null, end: null };
  for (let t = 0; t <= tEnd + 1e-9; t += 0.1) {
    E = settle(el, E, target, 0.1, rng);
    if (Math.abs(t - 2) < 0.05) at[2] = displayPH(cal2, E);
    if (Math.abs(t - 15) < 0.05) at[15] = displayPH(cal2, E);
  }
  at.end = displayPH(cal2, E);
  assert.ok(Math.abs(at[2] - 9.18) > 0.5, 'two seconds after moving it the meter must still be nowhere near');
  assert.ok(Math.abs(at.end - 9.18) < 0.02, `and after eight time constants it must have settled (read ${at.end})`);
  ok.push(`a meter takes time: moved from the pH 4 buffer to pH 9.18 it reads ${at[2].toFixed(2)} after 2 s, ${at[15].toFixed(2)} after 15 s and ${at.end.toFixed(2)} after ${tEnd.toFixed(0)} s (τ = ${el.tau_s.toFixed(1)} s) — a reading taken early is simply wrong`);
}

/* ── 19 · Carry-over: why you rinse the electrode ───────────────────────────── */
{
  const water = { T: 25, strong: [], weak: [] };
  const film = 0.02;                                                    // mL of liquid clinging to the glass
  const dirtyWater = (acid) => solveAqueous(mix([{ system: water, volume: 25 }, { system: sys(acid, 0.1), volume: film }])).pH;
  const fromAcid = dirtyWater('hcl');
  const fromBase = dirtyWater('naoh');
  const bufferHit = solveAqueous(mix([{ system: systemFrom([{ recipe: BUFFERS.pH7, scale: 1 }], { WEAK, SOLIDS }), volume: 25 }, { system: sys('hcl', 0.1), volume: film }])).pH;
  assert.ok(7 - fromAcid > 2.5 && fromBase - 7 > 2.5, 'a film of 0.1 M acid or base must wreck a reading in pure water');
  assert.ok(Math.abs(bufferHit - 6.875) < 0.02, 'while a buffer shrugs it off');
  ok.push(`an unrinsed electrode carries ${film * 1000} µL into the next sample: pure water reads ${fromAcid.toFixed(2)} after 0.1 M HCl and ${fromBase.toFixed(2)} after 0.1 M NaOH, instead of 7.00 — while the pH 6.86 buffer moves ${Math.abs(bufferHit - 6.875).toFixed(3)}`);
}

/* ── 20 · An indicator is an acid: it perturbs what it measures ──────────────── */
{
  const dyeIn = (sys0, id = 'bromothymolBlue', C = 3e-5) => withAdditive(sys0, indicatorAdditive({ [id]: C }));
  const rainSys = systemFrom([{ recipe: FOODS.rain, scale: 1 }], { WEAK, SOLIDS });
  const before = solveAqueous(rainSys).pH; const after = solveAqueous(dyeIn(rainSys)).pH;
  assert.ok(after - before > 0.5, 'a few drops of indicator must visibly move a nearly unbuffered sample');
  const juice = systemFrom([{ recipe: FOODS.lemon, scale: 1 }], { WEAK, SOLIDS });
  assert.ok(Math.abs(solveAqueous(dyeIn(juice)).pH - solveAqueous(juice).pH) < 0.002, 'and leave a buffered one alone');
  ok.push(`the indicator is a weak acid too: 30 µM bromothymol blue moves rain water (1.4×10⁻⁵ M of acid) from pH ${before.toFixed(2)} to ${after.toFixed(2)}, and lemon juice by under 0.002 — which is why indicators mislead in pure or dilute samples`);
}

console.log('\nAQUEOUS EQUILIBRIA VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
