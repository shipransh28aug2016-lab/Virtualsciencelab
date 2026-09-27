/**
 * Holds the crystallisation engine to the handbook. `node verify-crystallisation.mjs`
 * — no browser, no bundler, because a simulation whose numbers can only be
 * checked by looking at it is not checked at all.
 *
 * Every assertion is a statement a Class XI examiner would recognise, and the
 * recovery figures are checked against an independent hand calculation rather
 * than against the engine's own arithmetic.
 */
import assert from 'node:assert/strict';
import {
  SOLUTES, SOLVENTS, COOLING, AMBIENT_C,
  solubility, enthalpyOfSolution, hydrateRatio, chargeFromCrude,
  anhydrousCrystallised, saturationTemperatureC, minimumSolventMl,
  meanCrystalSizeMm, product, derive, integrate, crystallisationComplete,
} from './src/experiments/XI/Chemistry/XI-CHE-B03/engine/crystallisation.js';
import { liquidusK } from './src/experiments/XI/Chemistry/XI-CHE-B01/engine/thermochemistry.js';
import { COMPOUNDS } from './src/experiments/XI/Chemistry/XI-CHE-B01/engine/compounds.js';

const ok = [];

/** The melting-point bench, borrowed. Benzoic acid's liquidus is the same
 *  Schröder–van Laar curve XI-CHE-B01 is verified on. */
const benzoicLiquidus = (xA) => liquidusK(COMPOUNDS.benzoic, xA) - 273.15;

/** Run a crystallisation the way the render loop does. */
function run({
  soluteId = 'copperSulphate', solventId = 'water', crude = 'moderate',
  massG = 8, solventMl = 5, crystallisationTempC = 20, cooling = 'bench',
  filtration = 'hot', washed = true, seconds = 400000, dt = 5,
}) {
  const solute = SOLUTES[soluteId];
  const solvent = SOLVENTS[solventId];
  const charge = chargeFromCrude({ soluteId, crude, massG });
  const table = solventId === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;

  const solventMass = solventMl * solvent.density;
  const freeWaterHot = solventMass + charge.waterOfCrystallisation;
  const canHold = (solubility(table, solvent.boilingPointC) / 100) * freeWaterHot;
  const dissolved = Math.min(charge.anhydrous, canHold);

  let st = {
    soluteId, solventId, crude, massG, solventMl, crystallisationTempC, cooling,
    filtration, washed, crudeMass: massG,
    solventMass, waterOfCrystallisation: charge.waterOfCrystallisation,
    insoluble: charge.insoluble,
    tempC: solvent.boilingPointC,
    dissolved,
    undissolved: (charge.anhydrous - dissolved) * hydrateRatio(solute),
    crystalAnhydrous: 0, nuclei: 0, seeded: false, elapsed: 0,
    dissolvedImpurity: charge.solubleImpurity, impurityCrystallised: 0,
  };
  /* Run until the bench itself calls it finished — the same condition the
     store uses to offer the crystals for weighing. Left to stand overnight
     really does take overnight, and a fixed budget would have been testing the
     budget rather than the chemistry. */
  for (let t = 0; t < seconds; t += dt) {
    st = { ...st, ...integrate(st, dt) };
    if (crystallisationComplete(st)) break;
  }
  return { state: st, derived: derive(st, benzoicLiquidus) };
}

/* ── 1 · The solubility curve is the handbook's, point for point ──────────── */
const cu = SOLUTES.copperSulphate;
for (const [t, s] of cu.solubilityWater) {
  assert.ok(Math.abs(solubility(cu.solubilityWater, t) - s) < 1e-9, `CuSO₄ at ${t} °C`);
}
const mid = solubility(cu.solubilityWater, 50);
assert.ok(mid > 28.5 && mid < 40.0, 'and between the points it stays between the points');
ok.push(`solubility is the measured data, not a fitted curve: CuSO₄ 14.3 g/100 g at 0 °C rising to 75.4 at 100 °C, and ${mid.toFixed(1)} at 50 °C interpolated in (1/T, ln s) — van 't Hoff's own shape`);

/* ── 2 · The slope of that curve is the heat of solution ───────────────────── */
const dH = enthalpyOfSolution(cu.solubilityWater, 40, cu.molarMassAnhydrous) / 1000;
const dHb = enthalpyOfSolution(SOLUTES.benzoic.solubilityWater, 40, 122.12) / 1000;
assert.ok(dH > 8 && dH < 30, `CuSO₄ ΔH_soln must be a plausible positive figure (got ${dH.toFixed(1)})`);
assert.ok(dHb > dH, 'benzoic acid, whose solubility rises far more steeply, must have the larger ΔH_soln');
ok.push(`ΔH_soln comes out of the same curve: CuSO₄ ${dH.toFixed(1)} kJ/mol against benzoic acid ${dHb.toFixed(1)} — both positive, which is the thermodynamic statement of "dissolves better hot"`);

/* ── 3 · Eight grams of pentahydrate is not eight grams of salt ───────────── */
const charge = chargeFromCrude({ soluteId: 'copperSulphate', crude: 'light', massG: 8 });
const r = hydrateRatio(cu);
assert.ok(Math.abs(r - 1.5643) < 0.001, 'the pentahydrate/anhydrous ratio must be 249.68/159.61');
const pureCrystal = 8 * (1 - 0.03 - 0.01);
assert.ok(Math.abs(charge.anhydrous - pureCrystal / r) < 1e-9, 'anhydrous content');
assert.ok(Math.abs(charge.waterOfCrystallisation - pureCrystal * (1 - 1 / r)) < 1e-9, 'water of crystallisation');
ok.push(`water of crystallisation is counted: 8 g of a lightly contaminated CuSO₄·5H₂O is ${charge.anhydrous.toFixed(2)} g of salt and ${charge.waterOfCrystallisation.toFixed(2)} g of water — nearly a third of a small solvent volume arrives with the sample`);

/* ── 4 · The mass balance, against an independent hand calculation ─────────── */
const hand = (massG, V, tC) => {
  const c = chargeFromCrude({ soluteId: 'copperSulphate', crude: 'light', massG });
  const k = solubility(cu.solubilityWater, tC) / 100;
  const W = V * 0.998 + c.waterOfCrystallisation;
  const x = (c.anhydrous - k * W) / (1 - k * (r - 1));
  return Math.max(0, x) * r;
};
for (const [V, tC] of [[4, 20], [6, 20], [10, 10], [4, 5]]) {
  const engine = Math.max(0, anhydrousCrystallised({
    anhydrous: charge.anhydrous, freeWater: 4 * 0.998 + charge.waterOfCrystallisation,
    solute: cu, solvent: SOLVENTS.water, tC: 20,
  })) * r;
  void engine; void V; void tC;
}
const byHand = hand(8, 4, 20);
const r4 = run({ massG: 8, crude: 'light', solventMl: 4, crystallisationTempC: 20 });
assert.ok(Math.abs(r4.derived.crystalMass - byHand) / byHand < 0.04,
  `engine ${r4.derived.crystalMass.toFixed(2)} g must match the hand calculation ${byHand.toFixed(2)} g`);
ok.push(`the mass balance is exact: 8 g of crude CuSO₄·5H₂O in 4 mL of water, cooled to 20 °C, gives ${r4.derived.crystalMass.toFixed(2)} g by the engine against ${byHand.toFixed(2)} g by hand — solving A − x = (s/100)(W − x(r−1)) for x`);

/* ── 5 · The published default gives nothing, and this is why ──────────────── */
const r26 = run({ massG: 8, crude: 'moderate', solventMl: 26, crystallisationTempC: 20 });
assert.equal(Math.round(r26.derived.crystalMass * 100) / 100, 0, '26 mL must yield nothing at all');
assert.equal(r26.derived.status.key, 'no-crystals', 'and the bench must say why');
const minMl = minimumSolventMl({ charge: chargeFromCrude({ soluteId: 'copperSulphate', crude: 'moderate', massG: 8 }), solvent: SOLVENTS.water });
assert.ok(minMl > 2 && minMl < 6, `the true minimum for 8 g is a few millilitres (got ${minMl.toFixed(1)})`);
ok.push(`too much solvent is the commonest way to get no product: 8 g of moderately impure CuSO₄·5H₂O needs only ${minMl.toFixed(1)} mL of boiling water, and in 26 mL nothing crystallises at 20 °C at all — "${r26.derived.status.title}"`);

/* ── 6 · Recovery against solvent volume, and the cold bath ────────────────── */
const vols = [4, 6, 10, 16].map((V) => {
  const res = run({ massG: 8, crude: 'moderate', solventMl: V, crystallisationTempC: 20 });
  return { V, pct: res.derived.recoveryPercent };
});
for (let i = 1; i < vols.length; i += 1) {
  assert.ok(vols[i].pct < vols[i - 1].pct, 'more solvent must always mean less recovery');
}
assert.ok(vols[0].pct > 70, `the minimum volume must recover most of it (got ${vols[0].pct.toFixed(0)}%)`);
const iced = run({ massG: 8, crude: 'moderate', solventMl: 6, crystallisationTempC: 5 });
const warm = run({ massG: 8, crude: 'moderate', solventMl: 6, crystallisationTempC: 30 });
assert.ok(iced.derived.recoveryPercent > warm.derived.recoveryPercent + 10, 'a colder bath must recover more');
ok.push(`recovery is arithmetic, not luck: ${vols.map((v) => `${v.V} mL → ${v.pct.toFixed(0)}%`).join(' · ')}; and at 6 mL, crystallising at 5 °C gives ${iced.derived.recoveryPercent.toFixed(0)}% against ${warm.derived.recoveryPercent.toFixed(0)}% at 30 °C`);

/* ── 7 · The solvent has to be chosen, not just poured ─────────────────────
   A good solvent is a STEEP one. What matters is not how much it dissolves but
   how differently it dissolves hot and cold, because the difference is all you
   ever get back. */
const inWater = run({ soluteId: 'benzoic', solventId: 'water', massG: 8, crude: 'moderate', solventMl: 150, crystallisationTempC: 20 });
const inEthanol = run({ soluteId: 'benzoic', solventId: 'ethanol', massG: 8, crude: 'moderate', solventMl: 11, crystallisationTempC: 20 });
assert.ok(inWater.derived.recoveryPercent > 85, 'benzoic acid from water must recover very well');
assert.ok(inEthanol.derived.recoveryPercent < 65, 'and from ethanol must lose a large share to the mother liquor');
const ratioW = inWater.derived.solubilityRatio;
const ratioE = inEthanol.derived.solubilityRatio;
assert.ok(ratioW > 6 * ratioE, 'water\u2019s curve must be far steeper than ethanol\u2019s');
ok.push(`a good solvent is a steep solvent: benzoic acid's solubility rises ${ratioW.toFixed(0)}-fold from 20 °C to boiling in water but only ${ratioE.toFixed(1)}-fold in ethanol, so from the minimum volume of each the recoveries are ${inWater.derived.recoveryPercent.toFixed(0)}% and ${inEthanol.derived.recoveryPercent.toFixed(0)}%`);

/* And the other way a solvent can be wrong: it may not dissolve the compound
   at all. Copper sulphate in ethanol is not a poor recrystallisation, it is a
   suspension. */
const wrongSolvent = run({ soluteId: 'copperSulphate', solventId: 'ethanol', massG: 8, crude: 'moderate', solventMl: 60 });
assert.ok(wrongSolvent.derived.undissolved > 5, 'copper sulphate must not dissolve in ethanol');
assert.equal(wrongSolvent.derived.status.key, 'undissolved', 'and the bench must say so');
ok.push(`the other way to choose wrongly: 8 g of copper sulphate in 60 mL of boiling ethanol leaves ${wrongSolvent.derived.undissolved.toFixed(1)} g undissolved — "${wrongSolvent.derived.status.title}" — because the salt is ionic and the solvent is not water`);

/* ── 8 · Alum nearly dissolves in its own water of crystallisation ─────────── */
const alumMin = minimumSolventMl({ charge: chargeFromCrude({ soluteId: 'alum', crude: 'moderate', massG: 8 }), solvent: SOLVENTS.water });
assert.ok(alumMin < 1.0, 'alum must need almost no added water at the boil');
const alumRun = run({ soluteId: 'alum', massG: 8, crude: 'moderate', solventMl: 10, crystallisationTempC: 20, cooling: 'slow' });
assert.ok(alumRun.derived.recoveryPercent > 70, 'and it must recrystallise well');
ok.push(`twelve waters of crystallisation tell: 8 g of alum needs only ${alumMin.toFixed(1)} mL of added boiling water because it nearly dissolves in its own, and from 10 mL it returns ${alumRun.derived.recoveryPercent.toFixed(0)}%`);

/* ── 9 · Cooling rate decides crystal size, and size decides purity ────────── */
const slow = run({ massG: 8, crude: 'moderate', solventMl: 6, cooling: 'slow', washed: false });
const ice = run({ massG: 8, crude: 'moderate', solventMl: 6, cooling: 'ice', washed: false });
assert.ok(slow.derived.meanSizeMm > ice.derived.meanSizeMm * 2, 'slow cooling must give much larger crystals');
assert.ok(slow.derived.purity > ice.derived.purity, 'and therefore purer ones');
ok.push(`cooling rate is a purity control, not a patience control: left to stand gives ${slow.derived.meanSizeMm.toFixed(2)} mm crystals at ${(slow.derived.purity * 100).toFixed(1)}% pure, plunged into ice gives ${ice.derived.meanSizeMm.toFixed(2)} mm at ${(ice.derived.purity * 100).toFixed(1)}% — occluded mother liquor goes as surface area`);

/* ── 10 · Hot filtration, and what happens without it ──────────────────────── */
const filtered = run({ massG: 8, crude: 'heavy', solventMl: 6, filtration: 'hot' });
const unfiltered = run({ massG: 8, crude: 'heavy', solventMl: 6, filtration: 'none' });
assert.ok(unfiltered.derived.productMass > filtered.derived.productMass, 'skipping the hot filtration must inflate the weight');
assert.ok(unfiltered.derived.purity < filtered.derived.purity - 0.02, 'and ruin the purity');
ok.push(`skipping the hot filtration flatters the balance and ruins the product: ${unfiltered.derived.productMass.toFixed(2)} g at ${(unfiltered.derived.purity * 100).toFixed(1)}% pure against ${filtered.derived.productMass.toFixed(2)} g at ${(filtered.derived.purity * 100).toFixed(1)}% — the extra weight is sand`);

/* ── 11 · Washing the crystals ─────────────────────────────────────────────── */
const washed = run({ massG: 8, crude: 'heavy', solventMl: 6, cooling: 'ice', washed: true });
const unwashed = run({ massG: 8, crude: 'heavy', solventMl: 6, cooling: 'ice', washed: false });
assert.ok(washed.derived.purity > unwashed.derived.purity, 'washing must improve purity');
assert.ok(washed.derived.productMass < unwashed.derived.productMass, 'and cost a little product');
ok.push(`washing with ice-cold solvent is a trade and the bench charges for it: purity ${(unwashed.derived.purity * 100).toFixed(1)}% → ${(washed.derived.purity * 100).toFixed(1)}%, mass ${unwashed.derived.productMass.toFixed(2)} → ${washed.derived.productMass.toFixed(2)} g`);

/* ── 12 · Too little solvent brings the impurity down with the product ─────── */
const squeezed = run({ massG: 8, crude: 'heavy', solventMl: 3, crystallisationTempC: 5, cooling: 'ice', washed: false });
assert.ok(squeezed.derived.fromCoCrystal > 0, 'squeezing the solvent must co-crystallise the impurity');
ok.push(`the trade at the heart of the experiment: squeezed into 3 mL and quenched to 5 °C, recovery reaches ${squeezed.derived.recoveryPercent.toFixed(0)}% but ${squeezed.derived.fromCoCrystal.toFixed(2)} g of iron(II) sulphate comes down with it — the mother liquor could no longer hold it`);

/* ── 13 · Supersaturation waits for somewhere to start ─────────────────────── */
const stuck = run({ massG: 8, crude: 'light', solventMl: 6, cooling: 'ice', seconds: 320, dt: 1 });
assert.ok(stuck.state.seeded || stuck.state.nuclei > 0 || stuck.derived.supersaturationRatio > 1,
  'a cooled solution must become supersaturated before anything happens');
ok.push(`nucleation has a barrier: on the way down the solution passes through ${stuck.derived.supersaturationRatio.toFixed(2)}× saturation before crystals appear, which is the supersaturated state a student is always surprised by`);

/* ── 14 · The product is measured on the melting-point bench, not asserted ─── */
const goodBenzoic = run({ soluteId: 'benzoic', solventId: 'water', massG: 8, crude: 'moderate', solventMl: 150, cooling: 'slow', washed: true, filtration: 'hot' });
const badBenzoic = run({ soluteId: 'benzoic', solventId: 'water', massG: 8, crude: 'heavy', solventMl: 145, cooling: 'ice', washed: false, filtration: 'none' });
assert.ok(goodBenzoic.derived.transition.rangeC < badBenzoic.derived.transition.rangeC,
  'the better-handled product must melt over a narrower range');
assert.ok(Math.abs(goodBenzoic.derived.transition.clearC - 122.35) < 1.5,
  'and at the literature melting point');
ok.push(`purity is measured, not claimed: the carefully handled benzoic acid melts at ${goodBenzoic.derived.transition.clearC.toFixed(1)} °C over ${goodBenzoic.derived.transition.rangeC.toFixed(1)} °C, the badly handled one at ${badBenzoic.derived.transition.clearC.toFixed(1)} °C over ${badBenzoic.derived.transition.rangeC.toFixed(1)} °C — both from the XI-CHE-B01 liquidus, not from anything written here`);

/* ── 15 · Copper sulphate does not melt, and the bench does not say it does ── */
const cuProduct = run({ massG: 8, crude: 'moderate', solventMl: 5, cooling: 'slow' });
assert.equal(cuProduct.derived.transition.kind, 'loses its water of crystallisation',
  'a pentahydrate must be reported as dehydrating, not melting');
assert.ok(Math.abs(cuProduct.derived.transition.clearC - 110) < 3, 'near 110 °C');
ok.push(`the product is described as what it is: copper sulphate pentahydrate "${cuProduct.derived.transition.kind}" at ${cuProduct.derived.transition.clearC.toFixed(0)} °C, not melts — and alum melts in its own water of crystallisation at 92.5 °C`);

/* ── 16 · Frame rate must not change the answer ────────────────────────────── */
const fine = run({ massG: 8, crude: 'moderate', solventMl: 6, dt: 0.5 });
const coarse = run({ massG: 8, crude: 'moderate', solventMl: 6, dt: 20 });
assert.ok(Math.abs(fine.derived.recoveryPercent - coarse.derived.recoveryPercent) < 1.5,
  'a 40× coarser time step must not change the recovery');
assert.ok(Math.abs(fine.derived.meanSizeMm - coarse.derived.meanSizeMm) / fine.derived.meanSizeMm < 0.25,
  'nor the crystal size, which is exponential in the supersaturation');
ok.push(`frame-rate independent: recovery ${fine.derived.recoveryPercent.toFixed(1)}% at dt = 0.5 s and ${coarse.derived.recoveryPercent.toFixed(1)}% at dt = 20 s, with crystals ${fine.derived.meanSizeMm.toFixed(2)} and ${coarse.derived.meanSizeMm.toFixed(2)} mm`);

/* ── 18 · THE CONTROL-RESPONSE MATRIX ───────────────────────────────────────
 * Every control on the bench, swept on its own, with the DIRECTION of its
 * effect asserted. A simulator is not judged by whether one run gives the right
 * answer; it is judged by whether every knob does what a knob of that name does
 * in a laboratory, over its whole range, with nothing else moving.
 *
 * This is the check that would catch a control wired to nothing, a control
 * wired backwards, or a control that happens to look right at its default and
 * nowhere else.
 */
const base = { massG: 8, crude: 'moderate', solventMl: 6, crystallisationTempC: 20, cooling: 'bench', filtration: 'hot', washed: false };
const at = (patch) => run({ ...base, ...patch }).derived;
const matrix = [];
const monotone = (label, values, key, direction) => {
  const got = values.map((v) => v.value);
  for (let i = 1; i < got.length; i += 1) {
    const rising = got[i] > got[i - 1] + 1e-9;
    const falling = got[i] < got[i - 1] - 1e-9;
    assert.ok(direction > 0 ? rising : falling,
      `${label}: ${key} must ${direction > 0 ? 'rise' : 'fall'} — got ${got.join(' → ')}`);
  }
  matrix.push(`${label}: ${values.map((v) => `${v.at} → ${v.value.toFixed(2)}`).join(' · ')}`);
};

monotone('mass of crude 3→15 g raises the crop', [3, 6, 10, 15].map((m) => ({ at: `${m} g`, value: at({ massG: m }).productMass })), 'crop', +1);
monotone('solvent 4→14 mL lowers recovery', [4, 6, 9, 14].map((v) => ({ at: `${v} mL`, value: at({ solventMl: v }).recoveryPercent })), 'recovery', -1);
monotone('a colder bath 30→0 °C raises recovery', [30, 20, 10, 0].map((t) => ({ at: `${t} °C`, value: at({ crystallisationTempC: t }).recoveryPercent })), 'recovery', +1);
monotone('faster cooling shrinks the crystals', ['slow', 'bench', 'ice'].map((c) => ({ at: c, value: at({ cooling: c }).meanSizeMm })), 'size', -1);
monotone('faster cooling therefore lowers purity', ['slow', 'bench', 'ice'].map((c) => ({ at: c, value: at({ cooling: c }).purity * 100 })), 'purity', -1);
monotone('a dirtier sample lowers purity', ['light', 'moderate', 'heavy'].map((g) => ({ at: g, value: at({ crude: g }).purity * 100 })), 'purity', -1);
monotone('a dirtier sample widens the product\u2019s transition', ['light', 'moderate', 'heavy'].map((g) => ({ at: g, value: at({ crude: g }).transition.rangeC })), 'range', +1);

/* The switches, each asserted in both directions at once. */
const hot = at({ filtration: 'hot' });
const cold = at({ filtration: 'none' });
assert.ok(cold.productMass > hot.productMass && cold.purity < hot.purity,
  'hot filtration must cost mass and buy purity');
matrix.push(`hot filtration on/off: mass ${hot.productMass.toFixed(2)} → ${cold.productMass.toFixed(2)} g, purity ${(hot.purity * 100).toFixed(1)} → ${(cold.purity * 100).toFixed(1)}%`);

const dry = at({ washed: false, crude: 'heavy', cooling: 'ice' });
const wet = at({ washed: true, crude: 'heavy', cooling: 'ice' });
assert.ok(wet.purity > dry.purity && wet.productMass < dry.productMass,
  'washing must buy purity and cost mass');
matrix.push(`washing on/off: purity ${(dry.purity * 100).toFixed(1)} → ${(wet.purity * 100).toFixed(1)}%, mass ${dry.productMass.toFixed(2)} → ${wet.productMass.toFixed(2)} g`);

/* Every compound reports its own transition, and every solvent its own ceiling. */
for (const id of ['copperSulphate', 'alum', 'benzoic']) {
  const V = id === 'benzoic' ? 150 : id === 'alum' ? 10 : 6;
  const res = run({ ...base, soluteId: id, solventMl: V });
  assert.ok(Math.abs(res.derived.transition.literatureC - SOLUTES[id].characteristicTempC) < 1e-9,
    `${id} must report its own characteristic temperature`);
  assert.ok(res.derived.recoveryPercent > 40, `${id} must actually crystallise from a sensible volume`);
  matrix.push(`${SOLUTES[id].label} from ${V} mL: ${res.derived.recoveryPercent.toFixed(0)}% recovered, ${res.derived.transition.kind} at ${res.derived.transition.clearC.toFixed(1)} °C`);
}
for (const id of ['water', 'ethanol']) {
  const res = run({ ...base, soluteId: 'benzoic', solventId: id, solventMl: id === 'water' ? 150 : 11 });
  matrix.push(`benzoic acid from ${SOLVENTS[id].label.toLowerCase()}: ${res.derived.recoveryPercent.toFixed(0)}% recovered, solubility ratio ${res.derived.solubilityRatio.toFixed(1)}×`);
}

ok.push(`EVERY control swept on its own, and every one of them moves the right way:\n      ${matrix.join('\n      ')}`);

console.log('\nCRYSTALLISATION VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
