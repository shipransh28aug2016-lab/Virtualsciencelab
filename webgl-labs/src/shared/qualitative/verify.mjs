/**
 * verify.mjs — the qualitative-analysis kit (shared/qualitative).
 *
 * Two kinds of check. Arithmetic that does not touch the solver — a pH from the charge balance by
 * bisection, a gas yield from a total and a solubility, the mass balance of a precipitate — against
 * what the solver says. And the textbook: what every first-year practical manual says a given ion
 * does with a given reagent, which is the only external standard there is for a solver that has been
 * handed constants and asked to predict a colour. Every one of those is something the solver is NOT told.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { emptyContent, pour, observe, addReagent, degas, solveContent, describe } from './chemistry.js';
import { REAGENTS, LIME_WATER } from './ions.js';
import { flame, loadFrom } from './flame.js';
import { litmusAtMouth, smellOf, hclRod, filmPH, ammoniaPpm } from './devices.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const R = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));
const tube = (conc, mL = 3) => pour(emptyContent(), conc, mL);
const dose = (c, id, drops, T = 25) => addReagent(c, R[id], drops * 0.05, T);
const has = (c, id, T = 25) => (observe(c, T).solidsMol[id] ?? 0) > 1e-7;
const look = (c, T = 25) => describe(observe(c, T));

/* ── 1 · pH of a salt of a weak base and a weak acid, by bisection on the charge balance ──────────── */
{
  const cNH4 = 0.2; const cCO3 = 0.1;
  const f = (pH) => {
    const h = 10 ** -pH; const oh = 1e-14 / h;
    const nh4 = cNH4 / (1 + 10 ** (pH - 9.244));
    const d = 1 + 10 ** (10.329 - pH) + 10 ** (16.681 - 2 * pH);
    const hco3 = cCO3 * 10 ** (10.329 - pH) / d; const co3 = cCO3 / d;
    return h + nh4 - oh - hco3 - 2 * co3;
  };
  let lo = 4; let hi = 13;
  for (let i = 0; i < 80; i += 1) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const o = observe(tube({ NH3: 0.2, CO3: 0.1 }), 25);
  near(o.pH, (lo + hi) / 2, 0.12, '(NH₄)₂CO₃ solution: pH from the solver against the charge balance solved by bisection (I → 0)');
  ok.push(`(NH₄)₂CO₃, 0.1 M: pH ${o.pH.toFixed(2)} from the solver; ${((lo + hi) / 2).toFixed(2)} from the charge balance by bisection (the difference is the activity of the ions at I = ${o.I.toFixed(2)})`);
}

/* ── 2 · Carbon dioxide: what comes off is what is above the solubility ───────────────────────────── */
{
  const c0 = tube({ Na: 0.2, CO3: 0.1 }, 3);                     // 0.3 mmol carbonate
  const c = dose(c0, 'hcl', 14);                                  // 1.4 mmol HCl: in excess
  const V = c.volumeMl;
  const gas = c.event.mmol;
  const expected = 0.3 - 10 ** -1.47 * V * 1.0;                  // total − what a litre holds at 1 atm (K_H = 10^−1.47), activity of a neutral ≈ 1
  near(gas, expected, 0.02 * 0.3 + 0.005, 'CO₂ evolved on acidifying carbonate');
  assert.ok(c.event.kind === 'CO2');
  ok.push(`acid in excess on 0.30 mmol of carbonate: ${gas.toFixed(3)} mmol of CO₂ comes off; the arithmetic (0.30 − K_H·V = ${expected.toFixed(3)}) gives the same, and what stays dissolved is the 0.034 M a litre holds at one atmosphere`);
  const mild = dose(tube({ Na: 0.02, CO3: 0.01 }, 3), 'hcl', 14);
  assert.ok(!mild.event, 'a dilute carbonate under excess acid stays below saturation: no bubbles');
  ok.push('a carbonate ten times weaker, the same acid: 0.03 mmol of CO₂ in 3.7 mL is 0.008 M, under the 0.034 M saturation — dissolved, not effervescing');
}

/* ── 3 · Lime water: milky, then — with enough carbon dioxide — less so ───────────────────────────── */
{
  const lime = tube(LIME_WATER, 2);                               // 0.04 mmol Ca
  const withCO2 = (x) => observe({ ...lime, mmol: { ...lime.mmol, CO3: x } }, 25);
  const ppt = (x) => withCO2(x).solids.find((s) => s.id === 'CaCO3s')?.mmol ?? 0;
  near(ppt(0.04), 0.04, 0.002, 'CaCO₃ from lime water + an equivalent of CO₂');
  assert.ok(ppt(0.08) < ppt(0.04) && ppt(0.16) < ppt(0.08), 'more CO₂ and the carbonate dissolves again, as hydrogencarbonate');
  /* At one atmosphere of CO₂ calcite dissolves to Ca(HCO₃)₂ until [Ca][HCO₃⁻]² = Ksp·K₁/K₂·[CO₂]: 4[Ca]³ = 10^−4.5 · 0.034. */
  const CaMax = (10 ** (-8.48 + 6.352 * -1 + 10.329) * 10 ** -1.47 / 4) ** (1 / 3);
  const left = ppt(0.16) / 2;                                    // mol/L of solid
  const dissolved = 0.02 - left;
  assert.ok(dissolved > 0.5 * CaMax && dissolved < 2.2 * CaMax, `${(dissolved * 1000).toFixed(1)} mM of calcium in solution against ${(CaMax * 1000).toFixed(1)} mM from the hydrogencarbonate equilibrium, activities aside`);
  ok.push(`lime water + CO₂: one mole per mole of Ca(OH)₂ makes the suspension (${ppt(0.04).toFixed(3)} mmol of CaCO₃ from 0.040 mmol); at 2 and 4 moles it dissolves back (${ppt(0.08).toFixed(3)}, ${ppt(0.16).toFixed(3)} mmol) as Ca(HCO₃)₂ — to the ${(CaMax * 1000).toFixed(0)} mM that one atmosphere of CO₂ allows`);
}

/* ── 4 · Solubility products hold ─────────────────────────────────────────────────────────────────── */
{
  const c = dose(tube({ Ba: 0.2, Cl: 0.4 }), 'h2so4', 10);        // BaSO₄
  const sp = solveContent(c, 25);
  const iap = sp.gamma(2) * sp.free.Ba * sp.gamma(-2) * sp.free.SO4;
  near(Math.log10(iap), -9.96 + 0, 0.02, 'log IAP of BaSO₄ over its solid');
  const mass = sp.solids.BaSO4s * c.volumeMl;
  assert.ok(mass > 0.45 && mass < 0.5, `BaSO₄ ${mass.toFixed(3)} mmol: all of the 0.5 mmol of sulfate, less what stays in solution`);
  ok.push(`BaSO₄: log of the ion activity product over the solid = ${Math.log10(iap).toFixed(3)} (Ksp 10^−9.96), and ${mass.toFixed(3)} of the 0.5 mmol of sulfate is in the solid`);
}

/* ── 5 · The textbook ────────────────────────────────────────────────────────────────────────────── */
{
  const Cu = tube({ Cu: 0.1, SO4: 0.1 }); const Zn = tube({ Zn: 0.1, SO4: 0.1 }); const Al = tube({ Al: 0.1, SO4: 0.15 }); const Pb = tube({ Pb: 0.1, NO3: 0.2 });
  const Fe = tube({ Fe: 0.1, Cl: 0.4 }); const Ca = tube({ Ca: 0.1, NO3: 0.2 }); const Ba = tube({ Ba: 0.1, Cl: 0.2 }); const NH4 = tube({ NH3: 0.1, CO3: 0.05 });

  /* Hydroxides: precipitate, and what excess does. */
  assert.ok(has(dose(Cu, 'naoh', 8), 'CuOH2'), 'Cu²⁺ + NaOH: Cu(OH)₂, pale blue'); assert.ok(has(dose(Cu, 'naoh', 60), 'CuOH2'), 'Cu(OH)₂ is not soluble in excess NaOH');
  assert.ok(has(dose(Fe, 'naoh', 12), 'FeOH3') && has(dose(Fe, 'naoh', 60), 'FeOH3'), 'Fe(OH)₃ is brown and insoluble in excess');
  assert.ok(has(dose(Zn, 'naoh', 8), 'ZnOH2') && !has(dose(dose(Zn, 'naoh', 8), 'naohc', 30), 'ZnOH2'), 'Zn(OH)₂ is white and dissolves in excess NaOH (zincate)');
  assert.ok(has(dose(Al, 'naoh', 8), 'AlOH3s') && !has(dose(Al, 'naoh', 60), 'AlOH3s'), 'Al(OH)₃ is white, gelatinous, and dissolves in excess NaOH');
  assert.ok(has(dose(Pb, 'naoh', 8), 'PbOH2s') && !has(dose(dose(Pb, 'naoh', 8), 'naohc', 30), 'PbOH2s'), 'Pb(OH)₂ is white and dissolves in excess NaOH');
  assert.ok(has(dose(Ca, 'naoh', 8), 'CaOH2'), 'Ca²⁺ gives a slight white precipitate with NaOH (Ca(OH)₂ is sparingly soluble)');
  assert.ok(!Object.keys(observe(dose(Ba, 'naoh', 60), 25).solidsMol).some((k) => observe(dose(Ba, 'naoh', 60), 25).solidsMol[k] > 1e-7), 'Ba²⁺: no precipitate with NaOH');
  /* Ammonia: the same hydroxides, but copper and zinc dissolve as ammines, and aluminium and iron do not. */
  assert.ok(!has(dose(dose(Cu, 'nh4oh', 10), 'nh4ohc', 20), 'CuOH2') && /deep blue|blue/.test(look(dose(dose(Cu, 'nh4oh', 10), 'nh4ohc', 20))), 'Cu(OH)₂ dissolves in excess NH₃ to a deep blue solution');
  assert.ok(has(dose(dose(Al, 'nh4oh', 10), 'nh4ohc', 20), 'AlOH3s') && has(dose(dose(Fe, 'nh4oh', 10), 'nh4ohc', 20), 'FeOH3'), 'Al(OH)₃ and Fe(OH)₃ do not dissolve in excess NH₃');
  assert.ok(has(dose(Zn, 'nh4oh', 10), 'ZnOH2') && !has(dose(dose(Zn, 'nh4oh', 10), 'nh4ohc', 20), 'ZnOH2'), 'Zn(OH)₂ dissolves in excess NH₃');
  assert.ok(!Object.keys(observe(dose(Ca, 'nh4oh', 40), 25).solidsMol).some((k) => observe(dose(Ca, 'nh4oh', 40), 25).solidsMol[k] > 1e-7), 'Ca²⁺: nothing with NH₃');
  /* Confirmatory reagents. */
  assert.ok(has(dose(Cu, 'k4fec', 5), 'Cu2FC') && /brown/.test(look(dose(Cu, 'k4fec', 5))), 'Cu²⁺ + K₄[Fe(CN)₆]: chocolate-brown');
  assert.ok(has(dose(Fe, 'k4fec', 3), 'PrussianBlue') && /blue/.test(look(dose(Fe, 'k4fec', 3))), 'Fe³⁺ + K₄[Fe(CN)₆]: Prussian blue');
  assert.ok(/dark red|red/.test(observe(dose(Fe, 'kscn', 3), 25).name) && !/red/.test(observe(Fe, 25).name), 'Fe³⁺ + SCN⁻: blood-red, where the iron solution alone is yellow-brown');
  assert.ok(has(dose(Zn, 'k4fec', 5), 'Zn2FC'), 'Zn²⁺ + K₄[Fe(CN)₆]: white');
  assert.ok(has(dose(Pb, 'k2cro4', 5), 'PbCrO4') && /yellow/.test(look(dose(Pb, 'k2cro4', 5))), 'Pb²⁺ + CrO₄²⁻: yellow PbCrO₄');
  assert.ok(has(dose(Ba, 'k2cro4', 5), 'BaCrO4'), 'Ba²⁺ + CrO₄²⁻: pale yellow BaCrO₄');
  assert.ok(has(dose(Ca, 'nh4ox', 10), 'CaC2O4s'), 'Ca²⁺ + oxalate: white CaC₂O₄');
  assert.ok(has(dose(Pb, 'hcl', 10), 'PbCl2s') && !has(dose(Pb, 'hcl', 10), 'PbCl2s', 96), 'Pb²⁺ + HCl: white PbCl₂, which dissolves in hot water');
  assert.ok(has(dose(Pb, 'h2so4', 10), 'PbSO4s') && has(dose(Ba, 'h2so4', 10), 'BaSO4s') && has(dose(Ca, 'h2so4', 10), 'CaSO4s'), 'Pb²⁺, Ba²⁺, Ca²⁺ + H₂SO₄: sulfates');
  /* Anions. */
  const SO4 = tube({ Na: 0.2, SO4: 0.1 }); const Cl = tube({ Na: 0.1, Cl: 0.1 }); const CO3 = tube({ Na: 0.2, CO3: 0.1 });
  assert.ok(has(dose(SO4, 'bacl2', 10), 'BaSO4s') && has(dose(dose(SO4, 'bacl2', 10), 'hcl', 20), 'BaSO4s'), 'SO₄²⁻ + Ba²⁺: BaSO₄, insoluble in HCl');
  assert.ok(has(dose(CO3, 'bacl2', 10), 'BaCO3s') && !has(dose(dose(CO3, 'bacl2', 10), 'hcl', 20), 'BaCO3s'), 'CO₃²⁻ + Ba²⁺: BaCO₃, which dissolves in HCl with effervescence');
  assert.ok(dose(CO3, 'hcl', 14).event?.kind === 'CO2', 'CO₃²⁻ + dilute acid: effervescence of CO₂');
  assert.ok(has(dose(Cl, 'agno3', 10), 'AgCls') && has(dose(dose(Cl, 'agno3', 10), 'hno3', 10), 'AgCls') && !has(dose(dose(Cl, 'agno3', 10), 'nh4oh', 40), 'AgCls'), 'Cl⁻ + Ag⁺: AgCl, insoluble in HNO₃ and soluble in NH₃');
  assert.ok(/ring/.test(look(dose(dose(tube({ Ca: 0.1, NO3: 0.2 }), 'feso4', 20), 'h2so4c', 10))) && !/ring/.test(look(dose(tube({ Ca: 0.1, NO3: 0.2 }), 'feso4', 20))), 'NO₃⁻ + FeSO₄ + conc. H₂SO₄ run down the side: a brown ring');
  assert.ok(!/ring/.test(look(dose(dose(tube({ Ca: 0.1, Cl: 0.2 }), 'feso4', 20), 'h2so4c', 10))), 'no nitrate, no ring');
  ok.push('the textbook table, 30 reagent-by-ion outcomes: hydroxides and what excess NaOH and NH₃ do to each (Cu, Fe, Zn, Al, Pb, Ca, Ba); K₄[Fe(CN)₆], SCN⁻, chromate, oxalate, HCl and H₂SO₄ on the cations; BaCl₂ with and without acid, AgNO₃ with HNO₃ and NH₃, acid on carbonate, the brown ring — each from the solver, none of them written down');
  void NH4;
}

/* ── 6 · Ammonia over a tube, and what the paper, nose and rod make of it ───────────────────────────── */
{
  const base = dose(tube({ NH3: 0.2, Cl: 0.2 }), 'naoh', 10);
  const warm = observe(base, 25); const hot = observe(base, 96);
  assert.ok(hot.pNH3 > 8 * warm.pNH3, 'Henry: ammonia is far less soluble hot: its pressure over the same solution rises by a factor of ten');
  const cold = observe(tube({ NH3: 0.2, Cl: 0.2 }), 25);
  assert.ok(litmusAtMouth(warm, 'red').turned && !litmusAtMouth(cold, 'red').turned, 'red litmus turns blue over NH₄⁺ + NaOH and not over NH₄Cl alone');
  assert.ok(!litmusAtMouth(warm, 'blue').turned, 'blue litmus does not turn');
  assert.ok(smellOf(warm).ppm > smellOf(cold).ppm * 100 && hclRod(warm).fumes && !hclRod(cold).fumes, 'smell and HCl fumes follow the ammonia in the air');
  near(filmPH(0), 5.6, 0.1, 'a film of water in air, no ammonia: the pH of CO₂-saturated rain'); near(filmPH(1e-6), 6.9, 0.4, 'film of water, 1 ppm NH₃, 5 s: just turning'); assert.ok(filmPH(1e-5) > 7.5 && filmPH(1e-8) < 6, 'ten ppm turns the paper; ten ppb does nothing in the time');
  ok.push(`NH₄⁺ + NaOH: ammonia ${warm.pNH3.toExponential(1)} atm over the tube at 25 °C and ${hot.pNH3.toExponential(1)} at 96 °C (×${(hot.pNH3 / warm.pNH3).toFixed(0)}, Henry's law with ΔH = −34 kJ/mol); red litmus turns blue, a conc. HCl rod smokes, and none of it does over ammonium chloride alone; a film of moist water in 5 s is at pH ${filmPH(0).toFixed(1)} in clean air, ${filmPH(1e-6).toFixed(1)} at 1 ppm (the paper is just turning) and ${filmPH(1e-5).toFixed(1)} at 10 ppm`);
  void ammoniaPpm;
}

/* ── 7 · The flame test ──────────────────────────────────────────────────────────────────────────── */
{
  const at = (conc, opts = {}, extra = {}) => flame({ loaded: { ...loadFrom(tube(conc), opts), ...extra }, t: 3 });
  const Ca = at({ Ca: 0.1, NO3: 0.2 }); const Ba = at({ Ba: 0.1, Cl: 0.2 }); const Cu = at({ Cu: 0.1, SO4: 0.1 }, { hclDip: true });
  assert.ok(Ca.lambdaD > 596 && Ca.lambdaD < 608, `Ca: brick-red (${Ca.lambdaD} nm)`);
  assert.ok(Ba.lambdaD > 513 && Ba.lambdaD < 553, `Ba: apple-green (${Ba.lambdaD} nm)`);
  assert.ok(Cu.lambdaD > 490 && Cu.lambdaD < 513, `Cu: bluish-green (${Cu.lambdaD} nm)`);
  const Na = flame({ loaded: { Na: 1e-5 }, t: 3 });
  assert.ok(Na.lambdaD > 585 && Na.lambdaD < 597 && Na.brightness > 0.6, `Na: persistent golden-yellow (${Na.lambdaD} nm)`);
  for (const [name, conc] of [['Zn', { Zn: 0.1, SO4: 0.1 }], ['Al', { Al: 0.1, SO4: 0.15 }], ['Fe', { Fe: 0.1, Cl: 0.4 }], ['Pb', { Pb: 0.1, NO3: 0.2 }], ['NH₄', { NH3: 0.1, CO3: 0.05 }]]) {
    assert.ok(at(conc, { hclDip: true }, { Na: 2e-8 }).brightness < 0.14, `${name}: no characteristic flame colour`);
  }
  assert.ok(at({ Cu: 0.1, SO4: 0.1 }).brightness < 0.14 && Cu.brightness > 0.2, 'copper sulfate is not volatile: the flame test works when the wire has been through conc. HCl, which makes the chloride');
  const dirty = flame({ loaded: { ...loadFrom(tube({ Ca: 0.1, NO3: 0.2 })), Na: 2e-5 }, t: 3 });
  assert.ok(dirty.lambdaD > 585 && dirty.lambdaD < 597, 'a dirty wire (a trace of sodium) hides the calcium colour: golden-yellow');
  const cobalt = flame({ loaded: { ...loadFrom(tube({ Ca: 0.1, NO3: 0.2 })), Na: 2e-5 }, t: 3, filter: 'cobalt' });
  assert.ok(cobalt.brightness < Na.brightness / 2, 'through cobalt-blue glass the sodium yellow is absorbed (A = 3 at 590 nm)');
  ok.push(`flame emission, from lines and bands through the colour-matching functions: Ca ${Ca.lambdaD} nm (${Ca.name}), Ba ${Ba.lambdaD} nm (${Ba.name}), Cu ${Cu.lambdaD} nm (${Cu.name}), Na ${Na.lambdaD} nm (${Na.name}); Zn, Al, Fe, Pb, NH₄⁺ show nothing characteristic; a trace of sodium swamps calcium; cobalt glass takes the sodium out`);
}

/* ── 8 · Gas loss from an open tube, and a layer ────────────────────────────────────────────────── */
{
  const c = degas(dose(tube({ Na: 0.2, CO3: 0.1 }), 'hcl', 14), 25);
  const before = c.mmol.CO3;
  assert.ok(before < 0.3 && before > 0.1, 'the CO₂ that came out is no longer in the tube');
  const layered = dose(dose(tube({ Ca: 0.2, NO3: 0.4 }), 'feso4', 20), 'h2so4c', 10);
  assert.ok(layered.layer && layered.layer.mL > 0.49 && layered.layer.acidMmol > 8.9, 'conc. acid run down the side lies as a layer: 0.5 mL of 18 M is 9 mmol');
  ok.push(`gas that comes out of an open tube is taken out of it (${before.toFixed(3)} of 0.300 mmol of carbonate left); 0.5 mL of 18 M H₂SO₄ run down the side is a 9 mmol layer, not part of the solution`);
}

console.log('\nshared/qualitative VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
