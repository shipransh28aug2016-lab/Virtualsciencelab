/**
 * Holds the boiling-point engine to the handbook. `node verify-boiling-point.mjs`
 * — no browser, no bundler, because a simulation whose numbers can only be
 * checked by looking at it is not checked at all.
 *
 * Every assertion is a statement a Class XI examiner would recognise.
 */
import assert from 'node:assert/strict';
import {
  LIQUIDS, THERMOMETERS, AMBIENT_C, STANDARD_PRESSURE,
  vapourPressure, boilingPointC, enthalpyVaporisation, troutonConstant,
  isAssociated, ebullioscopicConstant, bubblePointC, totalVapourPressure,
  vapourComposition, makeCharge, correctToStandard, capillaryHeadMmHg,
  derive, integrate, STREAM_CONFIRM_SECONDS,
} from './src/experiments/XI/Chemistry/XI-CHE-B02/engine/vapour.js';

const ok = [];

/**
 * Run the bench through Siwoloboff's procedure exactly as the manual gives it:
 * heat until a rapid continuous stream of bubbles leaves the capillary, take
 * the flame away, and read the temperature at which the stream ceases and the
 * liquid runs back up. The reading is taken on the way DOWN.
 */
function run({
  liquidId = 'ethanol', purity = 'pure', bath = 'oil', thermometer = 't02',
  heatingRate = 3, pressureMmHg = 760, chips = 'with',
  secondLiquidId = 'none', secondMolePercent = 0,
  seconds = 20000, dt = 0.25,
}) {
  const charge = makeCharge({ liquidId, purity, secondLiquidId, secondMolePercent });
  let st = {
    liquidId, purity, bath, thermometer, heatingRate, pressureMmHg, chips,
    moles: charge.moles, burnerOn: true,
    bathC: AMBIENT_C, liquidC: AMBIENT_C, readingC: AMBIENT_C,
    boiledAway: 0, superheatC: 0, bumped: false, dTdt: 0,
    onsetC: null, observedC: null,
  };
  const lc = THERMOMETERS[thermometer].leastCount;
  const read = () => Math.round(st.readingC / lc) * lc;

  let wasRapid = false;
  let streamedFor = 0;
  for (let t = 0; t < seconds; t += dt) {
    st = { ...st, ...integrate(st, dt) };
    /* The stream is an OBSERVATION. With nothing to nucleate on there is none,
       however far past its boiling point the liquid has been carried — which is
       exactly the trap this experiment sets. */
    const outside = st.pressureMmHg + capillaryHeadMmHg({ moles: st.moles });
    const rapid = chips === 'with'
      && totalVapourPressure({ moles: st.moles }, st.liquidC) >= outside;

    streamedFor = rapid ? streamedFor + dt : 0;
    /* Nobody records the first vapour bubble; they wait until the stream is
       plainly continuous. The flame comes away at the same moment, which is
       what the manual says to do. */
    if (streamedFor >= STREAM_CONFIRM_SECONDS) {
      if (st.onsetC === null) st.onsetC = read();
      if (st.burnerOn) st = { ...st, burnerOn: false };
    }
    if (wasRapid && !rapid && st.observedC === null) { st.observedC = read(); break; }
    wasRapid = rapid;
    if (st.bumped) break;
  }
  return { onset: st.onsetC, observed: st.observedC, state: st, derived: derive(st) };
}

/* ── 1 · Antoine reproduces the handbook, for every liquid on the shelf ────── */
const BOOK = { acetone: 56.05, ethanol: 78.37, water: 100.0, toluene: 110.6, aniline: 184.1, benzene: 80.1 };
const rows = Object.entries(BOOK).map(([id, lit]) => {
  const t = boilingPointC(LIQUIDS[id], STANDARD_PRESSURE);
  assert.ok(Math.abs(t - lit) < 0.6, `${id} must boil at ${lit} °C (got ${t.toFixed(2)})`);
  return `${LIQUIDS[id].label} ${t.toFixed(1)}`;
});
ok.push(`Antoine alone puts every liquid where the handbook does: ${rows.join(' · ')} °C`);

/* ── 2 · A boiling point is a property of the liquid AND the day ───────────── */
const eth760 = boilingPointC(LIQUIDS.ethanol, 760);
const eth700 = boilingPointC(LIQUIDS.ethanol, 700);
const eth600 = boilingPointC(LIQUIDS.ethanol, 600);
assert.ok(Math.abs((eth760 - eth700) - 2.4) < 1.2, 'ethanol must fall about 2.4 °C at 700 mm Hg');
ok.push(`pressure is half the measurement: ethanol boils at ${eth760.toFixed(1)} °C at 760 mm Hg, ${eth700.toFixed(1)} at 700 and ${eth600.toFixed(1)} at 600 — a hill station is not a different liquid`);

/* ── 3 · The latent heat is in the same curve ──────────────────────────────── */
const LATENT = { water: 40.65, benzene: 30.8, ethanol: 38.6, toluene: 33.2 };
const lat = Object.entries(LATENT).map(([id, lit]) => {
  const h = enthalpyVaporisation(LIQUIDS[id], boilingPointC(LIQUIDS[id], 760)) / 1000;
  assert.ok(Math.abs(h - lit) / lit < 0.08, `${id} ΔH_vap must be near ${lit} kJ/mol (got ${h.toFixed(1)})`);
  return `${LIQUIDS[id].label} ${h.toFixed(1)} (lit. ${lit})`;
});
ok.push(`ΔH_vap falls out of the slope of the same Antoine curve — no second data set: ${lat.join(' · ')} kJ/mol`);

/* ── 4 · Trouton's rule, and what it detects ──────────────────────────────── */
const tB = troutonConstant(LIQUIDS.benzene);
const tW = troutonConstant(LIQUIDS.water);
const tE = troutonConstant(LIQUIDS.ethanol);
assert.ok(Math.abs(tB - 88) < 6, 'benzene must obey Trouton');
assert.ok(tW > 100 && tE > 100, 'water and ethanol must break it');
assert.equal(isAssociated(LIQUIDS.benzene), false, 'benzene is not associated');
assert.equal(isAssociated(LIQUIDS.water), true, 'water is');
assert.equal(isAssociated(LIQUIDS.ethanol), true, 'so is ethanol');
ok.push(`Trouton's constant, computed not looked up: benzene ${tB.toFixed(0)} obeys the rule at 88; water ${tW.toFixed(0)} and ethanol ${tE.toFixed(0)} break it, and hydrogen bonding is why`);

/* ── 5 · K_b comes back out, though the engine never uses it ───────────────── */
const KB = { water: 0.512, benzene: 2.53, ethanol: 1.22, toluene: 3.40 };
const kbs = Object.entries(KB).map(([id, lit]) => {
  const k = ebullioscopicConstant(LIQUIDS[id]);
  assert.ok(Math.abs(k - lit) / lit < 0.12, `${id} K_b must be near ${lit} (got ${k.toFixed(3)})`);
  return `${LIQUIDS[id].label} ${k.toFixed(2)} (lit. ${lit})`;
});
ok.push(`the ebullioscopic constant is reproduced, not stored: ${kbs.join(' · ')} K kg mol⁻¹`);

/* ── 6 · Raoult's law IS the elevation formula ─────────────────────────────── */
const pureCharge = makeCharge({ liquidId: 'water', purity: 'pure' });
const saltCharge = makeCharge({ liquidId: 'water', purity: 'slight' });
const dTb = bubblePointC(saltCharge, 760) - bubblePointC(pureCharge, 760);
const nSolute = saltCharge.moles.filter((c) => !c.volatile).reduce((a, c) => a + c.n, 0);
const kgSolvent = saltCharge.moles.filter((c) => c.volatile).reduce((a, c) => a + c.n * LIQUIDS[c.id].molarMass, 0) / 1000;
const predicted = ebullioscopicConstant(LIQUIDS.water) * (nSolute / kgSolvent);
assert.ok(Math.abs(dTb - predicted) / predicted < 0.06,
  `Raoult must agree with K_b·m (${dTb.toFixed(3)} against ${predicted.toFixed(3)})`);
ok.push(`lowering x_A is the whole mechanism: Raoult's law gives an elevation of ${dTb.toFixed(2)} °C where ΔT = K_b·m predicts ${predicted.toFixed(2)} °C — the same statement twice`);

/* ── 7 · An impurity RAISES a boiling point. It lowers a melting point ─────── */
const clean = run({ liquidId: 'ethanol', purity: 'pure' });
const dirty = run({ liquidId: 'ethanol', purity: 'impure' });
assert.ok(dirty.observed > clean.observed + 0.5,
  'a non-volatile impurity must raise the boiling point');
ok.push(`direction matters: pure ethanol boils at ${clean.observed.toFixed(1)} °C and the crude sample at ${dirty.observed.toFixed(1)} °C — an involatile impurity RAISES a boiling point, where it would have lowered a melting point`);

/* ── 8 · The one mixture Raoult really describes ───────────────────────────── */
const mix = makeCharge({ liquidId: 'toluene', purity: 'pure', secondLiquidId: 'benzene', secondMolePercent: 50 });
const bpMix = bubblePointC(mix, 760);
assert.ok(bpMix > boilingPointC(LIQUIDS.benzene, 760) && bpMix < boilingPointC(LIQUIDS.toluene, 760),
  'an ideal mixture must boil between its components');
const y = vapourComposition(mix, bpMix);
const iBenzene = mix.moles.findIndex((c) => c.id === 'benzene');
assert.ok(y[iBenzene] > 0.65, 'and its vapour must be much richer in the volatile one');
ok.push(`benzene–toluene, the ideal pair: an equimolar mixture boils at ${bpMix.toFixed(1)} °C, between 80.1 and 110.6, and the vapour coming off is ${(y[iBenzene] * 100).toFixed(0)} mol% benzene — which is the whole of fractional distillation`);

/* ── 9 · A mixture boils over a range; a pure liquid does not ──────────────── */
/* Drift is measured over a DEFINED boil-off, not a fixed time: how far the
   boiling point has climbed by the time a third of the charge has left. Run to
   dryness and even a pure liquid's trace of involatile residue would eventually
   raise it, which is true, and not what this experiment is about. */
const drift = (charge) => {
  const initial = charge.moles.reduce((a, c) => a + (c.volatile ? c.n : 0), 0);
  let st = {
    liquidId: 'toluene', purity: 'pure', bath: 'oil', thermometer: 't02',
    heatingRate: 6, pressureMmHg: 760, chips: 'with', moles: charge.moles, burnerOn: true,
    bathC: AMBIENT_C, liquidC: AMBIENT_C, readingC: AMBIENT_C,
    boiledAway: 0, superheatC: 0, bumped: false, dTdt: 0,
  };
  let first = null;
  for (let t = 0; t < 12000; t += 0.25) {
    st = { ...st, ...integrate(st, 0.25) };
    const bp = bubblePointC({ moles: st.moles }, 760);
    if (first === null && st.liquidC >= bp - 0.2) first = bp;
    if (first !== null && st.boiledAway >= 0.33 * initial) return { first, last: bp };
  }
  return { first, last: bubblePointC({ moles: st.moles }, 760) };
};
const mixDrift = drift(mix);
const pureDrift = drift(makeCharge({ liquidId: 'toluene', purity: 'pure' }));
assert.ok(mixDrift.last - mixDrift.first > 2, 'a mixture must climb as the volatile component leaves');
assert.ok(Math.abs(pureDrift.last - pureDrift.first) < 0.05, 'a pure liquid must not move');
ok.push(`boiling RANGE, from the same equation: the mixture climbs from ${mixDrift.first.toFixed(1)} to ${mixDrift.last.toFixed(1)} °C as the benzene leaves, while pure toluene sits at ${pureDrift.first.toFixed(1)} °C and does not move`);

/* ── 10 · The bath is a ceiling ────────────────────────────────────────────── */
const drowned = run({ liquidId: 'aniline', bath: 'water', heatingRate: 8, seconds: 8000 });
assert.equal(drowned.observed, null, 'aniline must never boil in a water bath');
assert.equal(drowned.derived.status.key, 'bath-too-cold', 'and the bench must say why');
const fineBath = run({ liquidId: 'acetone', bath: 'water', heatingRate: 3 });
assert.ok(fineBath.observed !== null, 'acetone at 56 °C is fine in water');
ok.push(`the bath is a ceiling, not a detail: aniline (184 °C) never boils in water — "${drowned.derived.status.title}" — while acetone (56 °C) boils in it perfectly well`);

/* ── 11 · Nothing to boil on: superheating, then bumping ───────────────────── */
const bumped = run({ liquidId: 'water', chips: 'without', heatingRate: 8, seconds: 9000 });
assert.ok(bumped.state.bumped, 'a liquid with no nucleation site must superheat and bump');
ok.push(`superheating is real: with no capillary and no chip the water is carried past its boiling point without a bubble, and then goes off all at once — "${bumped.derived.status.title}"`);

/* ── 12 · The pressure correction, and how good it is ──────────────────────── */
const low = run({ liquidId: 'ethanol', pressureMmHg: 640 });
const corrected = correctToStandard(low.observed, 640, isAssociated(LIQUIDS.ethanol));
const exact = boilingPointC(LIQUIDS.ethanol, 760);
assert.ok(low.observed < eth760 - 3, 'at 640 mm Hg ethanol must boil several degrees lower');
assert.ok(Math.abs(corrected - exact) < 1.5, 'and Sidgwick must bring it back to within a degree or so');
ok.push(`Sidgwick's correction, with the constant chosen by Trouton rather than by hand: ethanol read ${low.observed.toFixed(1)} °C at 640 mm Hg, corrects to ${corrected.toFixed(1)} °C against a true ${exact.toFixed(1)} °C`);

/* ── 13 · The reading is taken on the way DOWN ─────────────────────────────── */
const fast = run({ liquidId: 'ethanol', heatingRate: 12 });
const slow = run({ liquidId: 'ethanol', heatingRate: 2 });
assert.ok(fast.onset > fast.observed, 'the rapid stream is always seen above the true boiling point');
assert.ok(Math.abs(slow.observed - eth760) < 1.5, 'and the reading on cooling is the right one');
ok.push(`why the manual reads it on cooling: at 12 °C/min the rapid stream appears at ${fast.onset.toFixed(1)} °C but the stream ceases at ${fast.observed.toFixed(1)} °C; at 2 °C/min the same cooling reading is ${slow.observed.toFixed(1)} °C against a true ${eth760.toFixed(1)} °C`);

/* ── 14 · The thermometer decides what can be seen ─────────────────────────── */
const coarse = run({ liquidId: 'ethanol', thermometer: 't1', heatingRate: 2 });
assert.equal(Math.round(coarse.observed * 100) % 100, 0, 'a 1 °C thermometer reads whole degrees only');
ok.push(`instrument limits are real: the same boiling point reads ${coarse.observed.toFixed(1)} °C on a 1 °C thermometer and ${slow.observed.toFixed(1)} °C on a 0.2 °C one`);

/* ── 15 · Frame rate must not change the answer ────────────────────────────── */
const fine = run({ liquidId: 'toluene', heatingRate: 6, dt: 0.05 });
const chunky = run({ liquidId: 'toluene', heatingRate: 6, dt: 2.0 });
assert.ok(Math.abs(fine.observed - chunky.observed) < 0.6,
  'a 40× coarser time step must not move the boiling point');
ok.push(`frame-rate independent: toluene reads ${fine.observed.toFixed(1)} °C at dt = 0.05 s and ${chunky.observed.toFixed(1)} °C at dt = 2 s`);

/* ── 16 · Every unknown, start to finish, at the pressure of the day ───────── */
const table = ['acetone', 'ethanol', 'water', 'toluene', 'aniline'].map((id) => {
  const r = run({ liquidId: id, purity: 'pure', heatingRate: 3, thermometer: 't02' });
  const lit = BOOK[id];
  assert.ok(Math.abs(r.observed - lit) < 1.5, `${id} must be determined as ${lit} °C (got ${r.observed})`);
  return `${LIQUIDS[id].label} ${r.observed.toFixed(1)} (lit. ${lit})`;
});
ok.push(`run end to end through Siwoloboff's procedure, every unknown comes out within a degree and a half: ${table.join(' · ')}`);

console.log('\nBOILING POINT VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
