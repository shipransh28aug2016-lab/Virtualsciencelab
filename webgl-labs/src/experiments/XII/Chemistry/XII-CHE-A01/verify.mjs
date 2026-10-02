/**
 * Holds the engine to the data book. Run with `node verify-physics.mjs` — no
 * browser, no bundler, no React, because a simulation whose numbers can only be
 * checked by looking at it is not checked at all.
 *
 * Every assertion here is a statement a Class XII examiner would recognise.
 */
import assert from 'node:assert/strict';
import { SOLS, ELECTROLYTES } from './engine/chemistry-data.js';
import {
  activeCounterIon, criticalCoagulationConcentration_mM, coagulatingPower, isCoagulable,
  stabilityRatio, coagulationHalfTime_s, perikineticRate, orthokineticRate,
  scatteringCoefficientRGB, stokesVelocity_mps, diffusionCoefficient,
  maxStableFlocRadius, derive, integrate,
} from './engine/physics.js';

const As = SOLS.arsenousSulphide, Fe = SOLS.ferricHydroxide;
const { NaCl, BaCl2, AlCl3, K2SO4, K3FeCN6 } = ELECTROLYTES;
const ok = [];

/** Run the engine the way the render loop does. The only honest way to test an
 *  integrated model is to integrate it. */
function run({ solId, electrolyteId, concentration_mM, seconds,
  shearRate_s = 0, temperatureK = 298.15, dt = 1 / 60 }) {
  let st = { solId, electrolyteId, concentration_mM, temperatureK, shearRate_s,
    clusterCount: 1, settled: 0 };
  for (let t = 0; t < seconds; t += dt) st = { ...st, ...integrate(st, dt) };
  return derive({ ...st, elapsedTime: seconds });
}

/** Seconds for half the primary particles to be bound into aggregates. */
function timeTo50({ solId, electrolyteId, concentration_mM, limit = 600 }) {
  let st = { solId, electrolyteId, concentration_mM, temperatureK: 298.15,
    shearRate_s: 0, clusterCount: 1, settled: 0 };
  const dt = 0.005;
  for (let t = 0; t < limit; t += dt) {
    st = { ...st, ...integrate(st, dt) };
    if (st.clusterCount <= 0.5) return t;
  }
  return Infinity;
}

/* ── 1 · HARDY–SCHULZE picks the ion by SIGN, not by the size of the formula ── */
assert.equal(activeCounterIon(As, AlCl3).symbol, 'Al³⁺', 'a negative sol needs the cation');
assert.equal(activeCounterIon(Fe, AlCl3).symbol, 'Cl⁻', 'a positive sol needs the anion');
assert.equal(activeCounterIon(As, K3FeCN6).symbol, 'K⁺', 'ferricyanide acts on As₂S₃ only through K⁺');
assert.equal(activeCounterIon(Fe, K3FeCN6).symbol, '[Fe(CN)₆]³⁻', '…and on Fe(OH)₃ through its anion');
ok.push('the counter-ion is chosen by charge sign, so K₃[Fe(CN)₆] is feeble on As₂S₃ and the most powerful salt in the set on Fe(OH)₃');

/* ── 2 · The classical As₂S₃ series, and the z⁻⁶ law behind it ──────────────── */
const cAs = [NaCl, BaCl2, AlCl3].map((e) => criticalCoagulationConcentration_mM(As, e));
assert.deepEqual(cAs.map((v) => +v.toFixed(3)), [51, 0.69, 0.093]);
const span = cAs[0] / cAs[2];
assert.ok(span > 400 && span < 700, `Na⁺:Al³⁺ span ${span.toFixed(0)}× should sit near z⁻⁶ = 729`);
ok.push(`As₂S₃ CCC: 51 / 0.69 / 0.093 mM for Na⁺ / Ba²⁺ / Al³⁺ — a ${span.toFixed(0)}× span where z⁻⁶ predicts 729×`);

/* ── 3 · The proof that it is the COUNTER-ION that counts ───────────────────
 *       On a positive sol, NaCl and BaCl₂ are nearly equal, because to Fe(OH)₃
 *       both are simply sources of chloride. */
const feNa = criticalCoagulationConcentration_mM(Fe, NaCl);
const feBa = criticalCoagulationConcentration_mM(Fe, BaCl2);
const feFc = criticalCoagulationConcentration_mM(Fe, K3FeCN6);
assert.ok(Math.abs(feNa - feBa) / feNa < 0.1, 'NaCl and BaCl₂ must be alike on Fe(OH)₃');
assert.ok(feFc < feNa / 50, 'K₃[Fe(CN)₆] must be far more powerful on Fe(OH)₃');
ok.push(`Fe(OH)₃ CCC: NaCl ${feNa} vs BaCl₂ ${feBa} mM — alike, both acting through Cl⁻; K₃[Fe(CN)₆] ${feFc} mM is ${(feNa / feFc).toFixed(0)}× stronger`);

/* ── 4 · Coagulating power ordering — the examinable answer ─────────────────── */
const order = Object.values(ELECTROLYTES)
  .map((e) => [e.formula, coagulatingPower(As, e)])
  .sort((a, b) => b[1] - a[1]).map(([f]) => f);
assert.equal(order[0], 'AlCl₃');
assert.ok(order.indexOf('BaCl₂') < order.indexOf('NaCl'), 'Ba²⁺ must beat Na⁺');
ok.push(`coagulating power on As₂S₃, strongest first: ${order.join(' > ')}`);

/* ── 5 · LYOPHILIC vs LYOPHOBIC ───────────────────────────────────────────── */
const starchCCC = criticalCoagulationConcentration_mM(SOLS.starch, NaCl);
assert.ok(starchCCC > cAs[0] * 30, 'a lyophilic sol must need far more electrolyte');
assert.ok(isCoagulable(SOLS.starch, NaCl), 'molar NaCl is reachable, so salting out is possible');
const resisting = run({ solId: 'starch', electrolyteId: 'NaCl', concentration_mM: 400, seconds: 30 }).status;
const saltedOut = run({ solId: 'starch', electrolyteId: 'NaCl', concentration_mM: 3500, seconds: 30, shearRate_s: 25 }).status;
const lyophobicSameDose = run({ solId: 'arsenousSulphide', electrolyteId: 'NaCl', concentration_mM: 400, seconds: 30 });
assert.equal(resisting.key, 'lyophilic-resisting');
assert.equal(saltedOut.key, 'salting-out');
assert.ok(lyophobicSameDose.coagulationPercentage > 99, 'the same dose must annihilate a lyophobic sol');
ok.push(`at one 400 mM NaCl dose: As₂S₃ ${lyophobicSameDose.coagulationPercentage.toFixed(0)}% coagulated, starch "${resisting.title}" — it needs ${(starchCCC / 1000).toFixed(1)} mol/L, and then it is salting out, not coagulation`);

/* ── 6 · FUCHS: W = 1 at the CCC, and rises steeply below it ────────────────── */
assert.equal(stabilityRatio(51, 51), 1);
assert.ok(stabilityRatio(5.1, 51) > 1000, 'a tenth of the CCC should all but stall coagulation');
ok.push(`stability ratio W: exactly 1 at the CCC, ${stabilityRatio(5.1, 51).toExponential(1)} at a tenth of it`);

/* ── 7 · SMOLUCHOWSKI, both kernels ────────────────────────────────────────── */
const tHalf = coagulationHalfTime_s(As, 298.15, 1);
assert.ok(tHalf > 0.01 && tHalf < 0.5, `elementary half-time ${(tHalf * 1e3).toFixed(0)} ms should be tens of ms`);
assert.ok(orthokineticRate(3e-6, 20) > perikineticRate(298.15, 1), 'at 3 µm a gentle swirl must beat Brownian motion');
assert.ok(orthokineticRate(3e-8, 20) < perikineticRate(298.15, 1) / 100, 'at 30 nm shear must be negligible');
ok.push(`two kernels: Brownian ${perikineticRate(298.15, 1).toExponential(1)} m³/s at every size; shear at G = 20 s⁻¹ is ${(orthokineticRate(3e-8, 20) / perikineticRate(298.15, 1)).toExponential(1)}× that at 30 nm but ${(orthokineticRate(3e-6, 20) / perikineticRate(298.15, 1)).toFixed(0)}× at 3 µm`);
ok.push(`Smoluchowski half-time ${(tHalf * 1e3).toFixed(0)} ms for a 0.1% sol — rapid coagulation clouds the liquid at once`);

/* ── 8 · The integrated population ─────────────────────────────────────────── */
const atHalf = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: tHalf, dt: tHalf / 400 });
const atFive = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 5 });
assert.ok(atHalf.coagulationPercentage > 45 && atHalf.coagulationPercentage < 55,
  `one half-time must be about 50% coagulated, got ${atHalf.coagulationPercentage.toFixed(1)}%`);
assert.ok(atFive.coagulationPercentage > 99 && atFive.coagulationPercentage <= 100);
ok.push(`integrating dN/dt = −½kN²: ${atHalf.coagulationPercentage.toFixed(0)}% at one half-time, ${atFive.coagulationPercentage.toFixed(2)}% at 5 s — asymptotic, never over 100`);

/* ── 9 · Above the CCC the rate is ION-BLIND ────────────────────────────────
 *       This is the half of the rule students most often over-read: once the
 *       barrier is gone, 8kT/3η has no ion in it, so every electrolyte past its
 *       own CCC coagulates at the same diffusion-limited rate. The rule governs
 *       the concentration NEEDED, not the speed beyond it. */
const rapidAl = timeTo50({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 5 });
const rapidBa = timeTo50({ solId: 'arsenousSulphide', electrolyteId: 'BaCl2', concentration_mM: 5 });
assert.ok(Math.abs(rapidAl - rapidBa) < 0.02, 'past the CCC every electrolyte must coagulate at one rate');
ok.push(`above the CCC the rate is ion-blind: AlCl₃ ${rapidAl.toFixed(3)} s and BaCl₂ ${rapidBa.toFixed(3)} s at 5 mM are identical, because 8kT/3η contains no ion`);

/* ── 10 · …so the rule shows as a rate only at a dose that separates valencies.
 *        0.3 mM is past Al³⁺'s 0.093, short of Ba²⁺'s 0.69, nowhere near Na⁺'s 51. */
const dose = 0.3;
/* "Rapid" has a definition, so use it rather than a stopwatch: the dose has
   reached the electrolyte's own critical concentration, W has fallen to 1, and
   the barrier is gone. Anything short of that is slow coagulation, however brisk
   it may look — BaCl₂ at 0.3 mM half-coagulates As₂S₃ in about half a second and
   is still, strictly, below its CCC. */
const rapidOn = (solId) => Object.values(ELECTROLYTES)
  .filter((e) => derive({
    solId, electrolyteId: e.id, concentration_mM: dose,
    elapsedTime: 0, temperatureK: 298.15,
  }).W <= 1)
  .map((e) => e.formula);
const rapidNeg = rapidOn('arsenousSulphide');
const rapidPos = rapidOn('ferricHydroxide');
assert.deepEqual(rapidNeg, ['AlCl₃'], `on As₂S₃ only AlCl₃ should be rapid at ${dose} mM, got ${rapidNeg}`);
assert.deepEqual([...rapidPos].sort(), ['K₂SO₄', 'K₃[Fe(CN)₆]'], `on Fe(OH)₃ the multivalent anions should be rapid, got ${rapidPos}`);
assert.ok(!rapidPos.includes('AlCl₃'), 'AlCl₃ must be useless against a positive sol');
ok.push(`the SAME five salts at ${dose} mM — rapid on As₂S₃ (negative): ${rapidNeg.join(', ')}; rapid on Fe(OH)₃ (positive): ${rapidPos.join(', ')}. The field inverts, which is the whole content of the rule`);

/* ── 11 · TYNDALL: brightens, whitens, fades ────────────────────────────────── */
const fine = scatteringCoefficientRGB(30e-9, 4e18);
const clumped = scatteringCoefficientRGB(120e-9, 4e18 / 64);      // mass conserved
const floc = scatteringCoefficientRGB(4e-6, 4e18 / 2.4e6);        // mass conserved
assert.ok(fine[2] / fine[0] > 3, `Rayleigh must scatter blue several times more than red (got ${(fine[2] / fine[0]).toFixed(2)})`);
assert.ok(clumped[1] > fine[1] * 4, 'clumping inside the Rayleigh regime must brighten the cone');
assert.ok(floc[1] < clumped[1], 'past the wavelength the cone must fade again');
assert.ok(floc[2] / floc[0] < 1.2, 'large flocs must scatter white, not blue');
ok.push(`Tyndall: blue/red = ${(fine[2] / fine[0]).toFixed(1)} for a 30 nm sol; ×${(clumped[1] / fine[1]).toFixed(0)} brighter on clumping to 120 nm; white (blue/red ${(floc[2] / floc[0]).toFixed(2)}) and fading by 4 µm`);

/* ── 12 · STOKES on a FRACTAL floc ─────────────────────────────────────────── */
const vSol = stokesVelocity_mps(30e-9, 30e-9, 2.2);
const vFloc = stokesVelocity_mps(300e-6, 30e-9, 2.2);
assert.ok(vSol * 86400 < 1e-3, `30 nm must fall under a mm a day (got ${(vSol * 86400 * 1e3).toFixed(4)} mm)`);
assert.ok(vFloc > 1e-4, `a 300 µm floc must fall at least 0.1 mm/s (got ${(vFloc * 1e3).toFixed(3)} mm/s)`);
ok.push(`Stokes on fractal flocs, v ∝ r^(d_f−1): 30 nm falls ${(vSol * 86400 * 1e6).toFixed(1)} µm/day — it never settles; 300 µm falls ${(vFloc * 1e3).toFixed(2)} mm/s`);

/* ── 13 · Brownian jitter slows as clumps grow ──────────────────────────────── */
const dSmall = diffusionCoefficient(30e-9, 298.15), dBig = diffusionCoefficient(3e-6, 298.15);
assert.ok(dSmall / dBig > 90, 'diffusion must fall as 1/r');
ok.push(`Stokes–Einstein: D falls ${(dSmall / dBig).toFixed(0)}× from 30 nm to 3 µm, so the visible jitter slows as the clumps form`);

/* ── 14 · STIRRING IS NOT DECORATION ───────────────────────────────────────── */
const still = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 60, shearRate_s: 0 });
const swirl = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 60, shearRate_s: 25 });
const swirlLong = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 180, shearRate_s: 25 });
assert.ok(swirl.clusterRadius > still.clusterRadius * 20, 'shear must build far bigger flocs');
assert.ok(still.sedimentFraction < 0.02, 'an unstirred sol must not settle in a minute');
assert.ok(swirl.sedimentFraction > 0.1 && swirlLong.sedimentFraction > 0.5, 'a swirled one must, and must largely clear in three');
assert.equal(still.status.key, 'needs-stirring');
ok.push(`60 s at 0.5 mM AlCl₃: unstirred gives ${(still.clusterRadius * 1e6).toPrecision(2)} µm clusters and ${(still.sedimentFraction * 100).toFixed(0)}% settled — "${still.status.title}". Swirled at G = 25 s⁻¹: ${(swirl.clusterRadius * 1e6).toPrecision(3)} µm flocs, ${(swirl.sedimentFraction * 100).toFixed(0)}% settled at a minute and ${(swirlLong.sedimentFraction * 100).toFixed(0)}% at three`);

/* ── 15 · Stirring harder gives SMALLER flocs — shear breaks them ──────────── */
const gentle = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 120, shearRate_s: 10 });
const violent = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 120, shearRate_s: 100 });
assert.ok(gentle.clusterRadius > violent.clusterRadius * 2, 'gentle stirring must build the bigger floc');
assert.ok(Math.abs(gentle.clusterRadius - maxStableFlocRadius(10)) / gentle.clusterRadius < 0.1,
  'and the floc must sit at the size that shear allows');
ok.push(`R_max = C/√G: gentle G = 10 s⁻¹ builds ${(gentle.clusterRadius * 1e6).toFixed(0)} µm flakes, violent G = 100 s⁻¹ only ${(violent.clusterRadius * 1e6).toFixed(0)} µm — stirring harder is not stirring better`);

/* ── 16 · The Tyndall cone flares and then dies ─────────────────────────────── */
const beam = [0.5, 3, 30, 150].map((sec) => run({
  solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: sec, shearRate_s: 25,
}).tyndallGain);
assert.ok(beam[1] > beam[0], 'the cone must brighten as the clusters grow');
assert.ok(beam[3] < beam[1], 'and fade once they are large and settling');
ok.push(`Tyndall gain through a swirled run: ×${beam.map((b) => b.toPrecision(3)).join(' → ×')} at 0.5 / 3 / 30 / 150 s — it flares, then dies as the flocs drop out of the beam`);

/* ── 17 · END TO END, and three ways to fail ────────────────────────────────── */
const stalled = run({ solId: 'arsenousSulphide', electrolyteId: 'NaCl', concentration_mM: 0.5, seconds: 3 });
assert.equal(stalled.status.key, 'stable');
assert.ok(stalled.coagulationPercentage < 1, `0.5 mM NaCl should do nothing to As₂S₃ (got ${stalled.coagulationPercentage.toFixed(3)}%)`);
ok.push(`0.5 mM for 3 s: AlCl₃ → ${atFive.coagulationPercentage.toFixed(1)}% coagulated; NaCl → ${stalled.coagulationPercentage.toFixed(2)}% and "${stalled.status.title}"`);

const reversed = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 80, seconds: 20, shearRate_s: 25 });
assert.equal(reversed.status.key, 'restabilised', 'a large excess of Al³⁺ must reverse the charge');
assert.ok(reversed.coagulationPercentage < 30, 'and the sol must redisperse, not stay precipitated');
ok.push(`80 mM AlCl₃ → "${reversed.status.title}", back down to ${reversed.coagulationPercentage.toFixed(0)}% — adding more undoes it, and the beaker runs backwards`);

const wrongIon = run({ solId: 'ferricHydroxide', electrolyteId: 'AlCl3', concentration_mM: 0.3, seconds: 20 });
assert.ok(wrongIon.coagulationPercentage < 20, 'AlCl₃ must barely touch a positive sol at this dose');
ok.push(`0.3 mM AlCl₃ on Fe(OH)₃ → ${wrongIon.coagulationPercentage.toFixed(1)}% — trivalent, and useless, because the sol is positive too`);

/* ── 18 · Temperature is live, through kT in the Brownian kernel ────────────── */
const cold = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 0.03, temperatureK: 278, dt: 1 / 2000 });
const warm = run({ solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 0.03, temperatureK: 328, dt: 1 / 2000 });
assert.ok(warm.coagulationPercentage > cold.coagulationPercentage, 'warming must speed coagulation');
ok.push(`temperature is live: at 30 ms, ${cold.coagulationPercentage.toFixed(1)}% at 5 °C against ${warm.coagulationPercentage.toFixed(1)}% at 55 °C`);

/* ── 22 · The answer must not depend on the frame rate ──────────────────────
   The store clamps dt at 1/20 s and then multiplies by the clock scale, so a
   ×100 run hands the integrator 5 second steps. An explicit Euler step could not
   survive that: it overshot n through zero in one step, pinned it to its floor,
   and reported a 7 mm floc that was nothing but the floor. The analytic
   Smoluchowski step must give the same beaker whether it is stepped sixty times
   a second or once every five seconds. */
const stirredRun = { solId: 'arsenousSulphide', electrolyteId: 'AlCl3', concentration_mM: 0.5, seconds: 120, shearRate_s: 42 };
const smooth = run({ ...stirredRun, dt: 1 / 60 });
const coarse = run({ ...stirredRun, dt: 5 });
const rel = Math.abs(smooth.clusterRadius - coarse.clusterRadius) / smooth.clusterRadius;
assert.ok(rel < 0.05, 'a 300× coarser time step must not change the floc size');
assert.ok(smooth.clusterRadius < maxStableFlocRadius(42) * 1.05,
  'and shear breakup, not an integrator floor, must be what sets the final size');
ok.push(`frame-rate independent: 120 s at G = 42 s⁻¹ gives ${(smooth.clusterRadius * 1e6).toFixed(0)} µm at dt = 1/60 s and ${(coarse.clusterRadius * 1e6).toFixed(0)} µm at dt = 5 s — against a shear-breakup ceiling of ${(maxStableFlocRadius(42) * 1e6).toFixed(0)} µm`);

console.log('\nPHYSICS VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
