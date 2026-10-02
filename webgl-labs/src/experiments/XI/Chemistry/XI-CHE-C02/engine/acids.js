/**
 * XI-CHE-C02 — strong and weak acids at one concentration. Pure: no React, no
 * three, no store.
 *
 * Two test tubes, A and B, each holding an acid made up from the 0.100 M
 * standard by dilution. What is true of a tube (its pH, how much of the acid is
 * ionised) comes from the shared aqueous solver; what a student sees of it
 * depends on the instrument — a strip, a few drops of universal indicator, or a
 * glass electrode that has to be calibrated, rinsed between the tubes and given
 * time to settle. The experiment's own arithmetic is done on what they read:
 *
 *     [H⁺] = 10^−pH     α = [H⁺]/C     Ka = Cα²/(1 − α)
 *
 * and it is done honestly. A meter measures the ACTIVITY of H⁺, so for 0.1 M
 * HCl it reads 1.1, not 1: [H⁺] comes out 0.078 M, "78 % ionised", which is not
 * incomplete ionisation but the activity coefficient — and the dilution series
 * shows it, because at 0.001 M the same arithmetic gives 96 %. For the weak acid
 * the same activity coefficient cancels out of Ka, so the answer lands on the
 * published constant.
 */
import { solveAqueous, systemFrom, dilute, withAdditive, mix, activityCoefficient } from '../../../../../shared/chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../../../../../shared/chem/species.js';
import {
  universalColour, universalConcentrations, indicatorAdditive, buildChart, UNIVERSAL_STRENGTH,
} from '../../../../../shared/chem/indicators.js';
import {
  makeElectrode, electrodePotential, factoryMeter, calibratedMeter, displayPH, slopePercent, electrodeSettled,
} from '../../../../../shared/chem/phMeter.js';
import { linearFit } from '../../../../../shared/numerics.js';

export const STOCK = 0.1;          // mol/L — the standardised acid on the shelf
export const TUBE_ML = 10;         // a test tube of acid
export const FILM_ML = 0.02;       // what clings to an unrinsed electrode
export const DROP_ML = 0.05;
export const CHART = buildChart({ strength: UNIVERSAL_STRENGTH });

/* ── The shelf ────────────────────────────────────────────────────────────── */

const STRONG = new Set(['hcl', 'hno3', 'h2so4']);
export const ACIDS = ['hcl', 'hno3', 'h2so4', 'formic', 'acetic', 'citric', 'oxalic', 'phosphoric'].map((id) => {
  const rec = SUBSTANCES[id];
  const weakId = rec.weak?.[0]?.id ?? null;
  const pKa1 = weakId && !STRONG.has(id) ? WEAK[weakId].pKas[0] : null;
  return {
    id, label: rec.label, formula: rec.formula, recipe: rec, strong: STRONG.has(id),
    /* The textbook constant, from the same pKa the solver uses — a reference for
       the student's own Ka, not an input to anything they read. */
    Ka: pKa1 === null ? null : 10 ** -pKa1,
  };
});
export const ACID_BY_ID = Object.fromEntries(ACIDS.map((a) => [a.id, a]));

/* ── Tubes ────────────────────────────────────────────────────────────────── */

export const concentration = (t) => STOCK / t.dilution;

export function tubeSystem(t, tempC) {
  return systemFrom([{ recipe: ACID_BY_ID[t.acid].recipe, scale: concentration(t) }], { T: tempC, WEAK, SOLIDS });
}

/** The tube as it is now: the preparation plus whatever an unrinsed electrode left in it. */
export function tubeContents(s, tube) {
  const clean = tubeSystem(s[tube], s.tempC);
  const sp = s.spoil[tube];
  return sp && sp.volume > 0 ? mix([{ system: clean, volume: TUBE_ML }, { system: sp.system, volume: sp.volume }]) : clean;
}

export const addSpoil = (spoil, film) => (spoil && spoil.volume > 0
  ? { system: mix([{ system: spoil.system, volume: spoil.volume }, { system: film.system, volume: film.volume }]), volume: spoil.volume + film.volume }
  : { system: film.system, volume: film.volume });

/** Everything the solver says about one tube, including what an indicator would show. */
export function analyseTube(t, s) {
  const acid = ACID_BY_ID[t.acid];
  const sys = tubeSystem(t, s.tempC);
  const sol = solveAqueous(sys);
  const gz = (I) => (z) => activityCoefficient(z, I, s.tempC);
  const C = concentration(t);
  const wk = sol.species[0];
  /* The fraction of the acid that has given up its first proton. For a strong
     acid that is all of it by definition. */
  const alpha = acid.strong || !wk ? 1 : 1 - wk.species[0].fraction;
  const out = { acid, C, sys, sol, pH: sol.pH, alpha, universal: null, paper: null };
  if (s.method === 'universal' && s.drops > 0) {
    const strength = (UNIVERSAL_STRENGTH * s.drops) / 5;
    const dosed = solveAqueous(withAdditive(dilute(sys, TUBE_ML / (TUBE_ML + DROP_ML * s.drops)), indicatorAdditive(universalConcentrations(strength))));
    out.universal = { pH: dosed.pH, colour: universalColour(dosed.pH, { strength, gz: gz(dosed.ionicStrength) }) };
  }
  if (s.method === 'paper') {
    out.paper = universalColour(sol.pH, { strength: UNIVERSAL_STRENGTH * 0.7, gz: gz(sol.ionicStrength) });
  }
  return out;
}

/* ── The electrode ────────────────────────────────────────────────────────── */

export const electrodeFor = () => makeElectrode({ seed: 11 });

/** Either the meter as it was calibrated this morning, or the factory
 *  settings — which is what a meter that nobody calibrated is. */
export const meterFor = (s) => (s.meterCal === 'calibrated' ? calibratedMeter(electrodeFor(), s.tempC) : factoryMeter());

function solutionAt(s) {
  if (s.where !== 'A' && s.where !== 'B') return null;
  const base = tubeContents(s, s.where);
  return s.film && s.film.volume > 0
    ? mix([{ system: base, volume: TUBE_ML }, { system: s.film.system, volume: s.film.volume }])
    : base;
}

/** Everything that needs the solver, computed once per change of setup. */
export function computeWorld(s) {
  const world = { A: analyseTube(s.A, s), B: analyseTube(s.B, s), atElectrode: null, targetE: null };
  if (s.method === 'meter') {
    const sol = solutionAt(s);
    if (sol) {
      const r = solveAqueous(sol);
      world.atElectrode = { pH: r.pH, ionicStrength: r.ionicStrength };
      world.targetE = electrodePotential(electrodeFor(), { pH: r.pH, tC: s.tempC });
    }
  }
  return world;
}

export function meterReading(s) {
  const meter = meterFor(s);
  const slope = meter.calibrated ? slopePercent(meter) : null;
  if (s.method !== 'meter' || s.world.atElectrode === null) return { sensing: false, pH: null, mV: s.E_mV, stable: false, slope };
  return {
    sensing: true,
    pH: displayPH(meter, s.E_mV, s.tempC),
    mV: s.E_mV,
    stable: electrodeSettled(electrodeFor(), s.Ed_mV, s.world.targetE),
    slope,
  };
}

/* ── The comparison, and whether it is a fair one ─────────────────────────── */

/** Concentrations within 5 % are "the same": that is what a volumetric flask can promise. */
export const equalConcentration = (s) => Math.abs(Math.log(concentration(s.A) / concentration(s.B))) < 0.05;

/* ── What the student writes down, and what they work out from it ─────────── */

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
/** A number as it is written in a notebook: 0.0776, or 1.84×10⁻⁵ once it is small. */
export function sci(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  if (x === 0) return '0';
  if (Math.abs(x) >= 0.01 && Math.abs(x) < 1000) return String(Number(x.toPrecision(3)));
  const [m, e] = x.toExponential(2).split('e');
  return `${m}×10${String(Number(e)).split('').map((c) => SUP[c]).join('')}`;
}

export const stripDevelopment = (strip) => (strip.dipped ? 1 - Math.exp(-strip.t / 6) : 0);

export function readingFor(s, tube) {
  if (s.method === 'meter') {
    const r = meterReading(s);
    return r.sensing && s.where === tube ? r.pH : null;
  }
  return s.pick[tube];
}

/** The experiment's arithmetic on one reading: [H⁺], α and Ka, exactly as the
 *  worksheet has it. Ka is only meaningful where the acid is mostly un-ionised. */
export function workings(pH, C) {
  const H = 10 ** -pH;
  const alpha = H / C;
  const Ka = alpha < 0.5 && C > H ? (H * H) / (C - H) : null;
  return { H, alpha, Ka };
}

export function notesFor(s, tube) {
  const notes = [];
  if (!equalConcentration(s)) notes.push('tubes at different concentrations');
  if (s.method === 'meter') {
    const r = meterReading(s);
    if (s.meterCal !== 'calibrated') notes.push('uncalibrated');
    if (r.sensing && !r.stable) notes.push('not settled');
    if (s.spoil[tube] && s.spoil[tube].volume > 0) notes.push('unrinsed electrode');
  }
  if (s.method === 'paper' && stripDevelopment(s[tube === 'A' ? 'stripA' : 'stripB']) < 0.9) notes.push('read before the colour developed');
  if (s.method === 'universal' && s.drops > 8) notes.push('too much indicator');
  return notes.join('; ');
}

/** What the student's readings say, tube by tube: the graph and the slopes. */
export function analyse(log) {
  const byAcid = new Map();
  for (const r of log) {
    if (r.pH === null || r.pH === undefined) continue;
    if (!byAcid.has(r.acidId)) byAcid.set(r.acidId, []);
    byAcid.get(r.acidId).push(r);
  }
  const series = []; const fits = {};
  for (const [id, rows] of byAcid) {
    const points = rows.map((r) => [Math.log10(r.C), r.pH]);
    const distinct = new Set(points.map((p) => p[0].toFixed(3))).size;
    const fit = distinct >= 2 ? linearFit(points) : null;
    const kas = rows.map((r) => r.Ka).filter((k) => k !== null);
    fits[id] = {
      n: rows.length, slope: fit ? fit.slope : null,
      Ka: kas.length ? kas.reduce((a, b) => a + b, 0) / kas.length : null,
    };
    const xs = points.map((p) => p[0]);
    series.push({
      name: ACID_BY_ID[id].formula, points,
      line: fit ? [[Math.min(...xs), fit.intercept + fit.slope * Math.min(...xs)], [Math.max(...xs), fit.intercept + fit.slope * Math.max(...xs)]] : undefined,
    });
  }
  return { series, fits };
}

/* ── Status ───────────────────────────────────────────────────────────────── */

export function statusOf(s) {
  if (s.method === 'paper') {
    const dev = Math.min(stripDevelopment(s.stripA), stripDevelopment(s.stripB));
    if (!s.stripA.dipped && !s.stripB.dipped) return { key: 'paper-ready', tone: 'info', title: 'Ready to test', detail: 'Dip a strip in each tube, wait for the colours to develop, and match each to the chart.' };
    if (!s.stripA.dipped || !s.stripB.dipped) return { key: 'paper-one', tone: 'info', title: 'One strip so far', detail: 'A comparison needs both tubes, tested the same way. Dip a strip in the other.' };
    if (dev < 0.9) return { key: 'paper-developing', tone: 'info', title: 'The colours are developing', detail: 'Give them a few seconds — reading a strip too early is the commonest error with pH paper.' };
    return { key: 'paper-match', tone: 'ok', title: 'Match each strip to the chart', detail: 'Pick the patch nearest each strip, then record each tube. Paper resolves about one pH unit.' };
  }
  if (s.method === 'universal') {
    if (s.drops === 0) return { key: 'uni-empty', tone: 'info', title: 'Add indicator', detail: 'Put a few drops of universal indicator in each tube. With none there is nothing to compare.' };
    return {
      key: 'uni-match', tone: s.drops > 8 ? 'warn' : 'ok', title: 'Compare the two tubes',
      detail: `The colours differ before you read a number: that is the experiment.${s.drops > 8 ? ' That is a lot of dye — it is itself an acid, and in a dilute tube it changes the pH it is measuring.' : ''}`,
    };
  }
  const r = meterReading(s);
  if (!r.sensing) {
    return s.meterCal === 'calibrated'
      ? { key: 'meter-dry', tone: 'info', title: 'The electrode is out of solution', detail: 'Dip it in tube A or B. Rinse it with distilled water between the tubes.' }
      : { key: 'meter-uncal', tone: 'warn', title: 'The meter was not calibrated', detail: 'It is on its factory slope with no offset, so every reading carries the electrode’s own asymmetry. The comparison between the tubes survives; the numbers do not.' };
  }
  if (s.film && s.film.volume > 0 && !r.stable) return { key: 'meter-film', tone: 'warn', title: 'The electrode is carrying the last solution', detail: 'Rinse it before it goes into the next tube.' };
  if (!r.stable) return { key: 'meter-settling', tone: 'info', title: 'Settling…', detail: 'The glass takes several seconds to respond. A reading taken now is not the pH — wait for STABLE.' };
  const sp = s.spoil[s.where];
  if (sp && sp.volume > 0 && s.world.atElectrode && Math.abs(s.world.atElectrode.pH - s.world[s.where].pH) > 0.02) {
    return { key: 'meter-spoiled', tone: 'warn', title: `Tube ${s.where} is contaminated`, detail: `The unrinsed electrode left ${(sp.volume * 1000).toFixed(0)} µL of the other acid in this tube, and the reading is steady — but steady is not right. Rinsing now will not undo it: prepare the tube again.` };
  }
  if (s.meterCal !== 'calibrated') return { key: 'meter-uncal', tone: 'warn', title: `Stable, but uncalibrated: pH ${r.pH.toFixed(2)}`, detail: 'The meter is on its factory settings, so this number carries the electrode’s own asymmetry.' };
  return { key: 'meter-stable', tone: 'ok', title: `Tube ${s.where}: pH ${r.pH.toFixed(2)}`, detail: `Stable. Slope ${r.slope.toFixed(1)}% of ideal. Record it, rinse the electrode, then the other tube.` };
}
