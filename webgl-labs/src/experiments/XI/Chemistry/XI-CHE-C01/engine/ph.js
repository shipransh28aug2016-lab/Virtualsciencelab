/**
 * XI-CHE-C01 — the pH engine. Pure: no React, no three, no store.
 *
 * What is true of the sample (its pH) is computed by the shared aqueous solver
 * from its composition. What a student SEES of it depends on the instrument:
 *
 *   PAPER      a strip holds a universal-indicator mixture; it takes the colour
 *              of the sample's pH, and the student matches it to a chart. About
 *              a unit, because that is what two colour patches can resolve.
 *   UNIVERSAL  drops of the same indicator in a tube of the sample. The dye is
 *              itself a weak acid, so in a dilute unbuffered sample it moves the
 *              pH it is trying to measure.
 *   METER      a glass electrode. Good to a hundredth — IF it has been calibrated
 *              on buffers, has been given time to settle, was rinsed, and the
 *              sample is not strongly alkaline.
 *
 * The expensive part (the solver) runs when the setup changes; the part that
 * runs every frame (the electrode settling) is arithmetic on its result.
 */
import { solveAqueous, systemFrom, mix, dilute, withAdditive, activityCoefficient } from '../../../../../shared/chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES, FOODS, BUFFERS, certifiedPH } from '../../../../../shared/chem/species.js';
import {
  universalColour, universalConcentrations, indicatorAdditive, buildChart, UNIVERSAL_STRENGTH,
} from '../../../../../shared/chem/indicators.js';
import { multiplyColour } from '../../../../../shared/chem/spectra.js';
import { makeElectrode, electrodePotential, factoryMeter, calibrate, displayPH, slopePercent } from '../../../../../shared/chem/phMeter.js';
import { pKw } from '../../../../../shared/chem/constants.js';

export const SAMPLE_ML = 25;        // what is in the beaker
export const FILM_ML = 0.02;        // what clings to an unrinsed electrode
export const TUBE_ML = 10;          // a test tube of sample for the indicator
export const DROP_ML = 0.05;

/* ── The shelf ────────────────────────────────────────────────────────────── */

const chem = (key, extra = {}) => ({
  id: key, label: SUBSTANCES[key].label, formula: SUBSTANCES[key].formula, group: SUBSTANCES[key].group,
  kind: 'chemical', recipe: SUBSTANCES[key], stock: 0.1, ...extra,
});
const food = (key, tint) => ({ id: key, label: FOODS[key].label, group: FOODS[key].group, kind: 'food', recipe: FOODS[key], stock: 1, tint });

/** Linear transmittance of 1 cm of the undiluted liquid, for the coloured ones. */
const CLEAR = [1, 1, 1];

export const SHELF = [
  ...['hcl', 'hno3', 'h2so4', 'citric', 'acetic', 'formic', 'oxalic', 'phosphoric'].map((k) => chem(k, { group: 'Acids' })),
  ...['naoh', 'koh', 'ammonia'].map((k) => chem(k, { group: 'Bases' })),
  chem('mgoh2', { group: 'Bases', fixed: true, stock: null, formula: 'Mg(OH)₂' }),
  chem('limewater', { group: 'Bases', fixed: true, stock: null }),
  ...['nacl', 'nh4cl', 'naac', 'na2co3', 'nahco3', 'fecl3', 'alcl3'].map((k) => chem(k, { group: 'Salts' })),
  food('lemon', [0.97, 0.95, 0.78]), food('orange', [0.98, 0.72, 0.35]), food('apple', [0.97, 0.90, 0.62]),
  food('tomato', [0.95, 0.45, 0.28]), food('vinegar', CLEAR), food('cola', [0.55, 0.32, 0.18]),
  { ...food('rain', CLEAR), group: 'Environment' },
  { id: 'water', label: 'Pure water', group: 'Environment', kind: 'water', stock: null, fixed: true, tint: CLEAR },
];
export const SHELF_BY_ID = Object.fromEntries(SHELF.map((e) => [e.id, e]));

/* ── Solutions ────────────────────────────────────────────────────────────── */

export function sampleSystem(s) {
  const e = SHELF_BY_ID[s.sampleId];
  if (e.kind === 'water') return { T: s.tempC, strong: [], weak: [], solids: [] };
  const scale = e.fixed ? 1 : e.stock / s.dilution;
  return systemFrom([{ recipe: e.recipe, scale }], { T: s.tempC, WEAK, SOLIDS });
}

/** What is written in the "concentration" column: mol/L for a chemical, a
 *  fraction of the bottle for a food, nothing for a saturated solution. */
export function concentrationLabel(s) {
  const e = SHELF_BY_ID[s.sampleId];
  if (e.kind === 'chemical' && !e.fixed) return Number((e.stock / s.dilution).toPrecision(3));
  if (e.kind === 'food') return s.dilution === 1 ? 'as bottled' : `1 in ${s.dilution}`;
  return 'saturated / pure';
}

export const BUF_OF = { buf4: 'pH4', buf7: 'pH7', buf9: 'pH9' };
export const bufferSystem = (id, tC) => systemFrom([{ recipe: BUFFERS[id], scale: 1 }], { T: tC, WEAK, SOLIDS });

/** The sample's own colour, diluted as the sample is. */
export function tintOf(s) {
  const e = SHELF_BY_ID[s.sampleId];
  const t = e.tint ?? CLEAR;
  return e.kind === 'food' ? t.map((v) => v ** (1 / s.dilution)) : t;
}

/**
 * The sample as it is in the beaker now: the pour, plus whatever an unrinsed
 * electrode has left in it. That contamination stays — rinsing the electrode
 * afterwards cannot take it back out. Only a fresh pour does.
 */
export function beakerSystem(s) {
  const clean = sampleSystem(s);
  return s.spoil && s.spoil.volume > 0
    ? mix([{ system: clean, volume: SAMPLE_ML }, { system: s.spoil.system, volume: s.spoil.volume }])
    : clean;
}

/** Add one film's worth of solution to what the beaker already holds. */
export const addSpoil = (spoil, film) => (spoil && spoil.volume > 0
  ? { system: mix([{ system: spoil.system, volume: spoil.volume }, { system: film.system, volume: film.volume }]), volume: spoil.volume + film.volume }
  : { system: film.system, volume: film.volume });

/** What the electrode is actually standing in, including whatever it carried. */
function solutionAt(s) {
  let base;
  if (s.location === 'sample') base = beakerSystem(s);
  else if (BUF_OF[s.location]) base = bufferSystem(BUF_OF[s.location], s.tempC);
  else return null;
  return s.film && s.film.volume > 0
    ? mix([{ system: base, volume: SAMPLE_ML }, { system: s.film.system, volume: s.film.volume }])
    : base;
}

const sodiumActivity = (sys, I, tC) => activityCoefficient(1, I, tC)
  * (sys.strong ?? []).filter((x) => x.z === +1).reduce((a, x) => a + x.c, 0);

export const electrodeFor = (s) => makeElectrode({ seed: 7, aged: s.electrode === 'worn' });

/**
 * Everything that needs the solver, computed once per change of setup.
 */
export function computeWorld(s) {
  const sys = sampleSystem(s);
  const sample = solveAqueous(sys);
  const tint = tintOf(s);
  const gz = (I) => (z) => activityCoefficient(z, I, s.tempC);
  const world = { sys, sample, tint, universal: null, paper: null, atElectrode: null, targetE: null };

  if (s.method === 'universal' && s.drops > 0) {
    const strength = (UNIVERSAL_STRENGTH * s.drops) / 5;
    const dosed = solveAqueous(withAdditive(dilute(sys, TUBE_ML / (TUBE_ML + DROP_ML * s.drops)), indicatorAdditive(universalConcentrations(strength))));
    const col = universalColour(dosed.pH, { strength, gz: gz(dosed.ionicStrength) });
    world.universal = { pH: dosed.pH, colour: multiplyColour(col, tint) };
  }
  if (s.method === 'paper') {
    /* Paper is the same mixture, a little paler: the dye is dried on cellulose
       rather than dissolved, and a paper that matched the chart exactly would be
       a chart. */
    world.paper = multiplyColour(universalColour(sample.pH, { strength: UNIVERSAL_STRENGTH * 0.7, gz: gz(sample.ionicStrength) }), tint);
  }
  if (s.method === 'meter') {
    const sol = solutionAt(s);
    if (sol) {
      const r = solveAqueous(sol);
      let pH = r.pH;
      if (BUF_OF[s.location]) {
        /* A certified buffer IS its certified pH — that is what makes it a
           standard. The solver supplies its composition and what carried-over
           solution does to it; the pH itself is the measured value. */
        const clean = s.film && s.film.volume > 0 ? solveAqueous(bufferSystem(BUF_OF[s.location], s.tempC)) : r;
        pH = certifiedPH(BUF_OF[s.location], s.tempC) + (r.pH - clean.pH);
      }
      world.atElectrode = { pH, aNa: sodiumActivity(sol, r.ionicStrength, s.tempC), ionicStrength: r.ionicStrength };
      world.targetE = electrodePotential(electrodeFor(s), { pH, aNa: world.atElectrode.aNa, tC: s.tempC });
    }
  }
  return world;
}

/* ── The meter, as the student sees it ────────────────────────────────────── */

export function meterReading(s) {
  if (s.method !== 'meter' || s.world.atElectrode === null) return { sensing: false, pH: null, mV: s.E_mV, stable: false, slope: s.cal ? slopePercent(s.cal) : null };
  const meter = s.cal ?? factoryMeter();
  return {
    sensing: true,
    pH: displayPH(meter, s.E_mV, s.tempC),
    mV: s.E_mV,
    /* Stable the way a meter decides it: the electrode has all but stopped
       drifting. Judged on the settling itself, not on the jitter riding on it. */
    stable: Math.abs(s.world.targetE - s.Ed_mV) / electrodeFor(s).tau_s < 0.05,
    slope: meter.calibrated ? slopePercent(meter) : null,
  };
}

/** Add a calibration point from the electrode as it is RIGHT NOW. A real meter
 *  insists on a stable reading; this one lets you press early, and the point is
 *  then simply wrong — the commonest way to ruin a calibration. */
export const SLOPE_RANGE = [70, 110];

export function addCalibrationPoint(s) {
  const id = BUF_OF[s.location];
  if (!id) return null;
  const point = { buffer: id, E_mV: s.E_mV, pH: certifiedPH(id, s.tempC) };
  const points = [...(s.cal?.points ?? []).filter((p) => p.buffer !== id), point];
  const cal = { ...calibrate(points, s.tempC), points };
  /* A real meter refuses a calibration whose slope is nonsense, and says so. It
     cannot tell a 90 %-settled point from a settled one — only an absurd one. */
  if (points.length >= 2) {
    const slope = slopePercent(cal);
    if (!(slope >= SLOPE_RANGE[0] && slope <= SLOPE_RANGE[1])) return { rejected: true, slope };
  }
  return { cal };
}

/* ── What the student records, and what is actually so ────────────────────── */

export function readingToRecord(s) {
  if (s.method === 'meter') {
    const r = meterReading(s);
    return r.sensing && s.location === 'sample' ? r.pH : null;
  }
  return s.pick;                                              // paper and universal: the chart patch they chose
}

/** Acidic, basic or neutral — judged from the reading, against the neutrality
 *  of water at THIS temperature, with a margin that matches the method. */
export function natureOf(pH, tC, method) {
  const mid = pKw(tC) / 2;
  const margin = method === 'meter' ? 0.3 : 0.75;
  return Math.abs(pH - mid) <= margin ? 'neutral' : pH < mid ? 'acidic' : 'basic';
}

export const CHART = buildChart({ strength: UNIVERSAL_STRENGTH });

/**
 * The bench's status, in the student's terms. One function so the card, the
 * notebook and the checks agree about what state the bench is in.
 */
export function statusOf(s) {
  const e = SHELF_BY_ID[s.sampleId];
  if (s.method === 'paper') {
    if (!s.strip.dipped) return { key: 'paper-ready', tone: 'info', title: 'Ready to test', detail: `Dip a strip in the ${e.label.toLowerCase()}, wait for the colour to develop, then match it to the chart.` };
    const dev = 1 - Math.exp(-s.strip.t / 6);
    if (dev < 0.9) return { key: 'paper-developing', tone: 'info', title: 'The colour is developing', detail: 'Give it a few seconds — reading a strip too early is the commonest error with pH paper.' };
    return { key: 'paper-match', tone: 'ok', title: s.pick ? `You matched pH ${s.pick}` : 'Match the colour to the chart', detail: 'Pick the patch nearest the strip in colour, then record it. Paper resolves about one pH unit.' };
  }
  if (s.method === 'universal') {
    if (s.drops === 0) return { key: 'uni-empty', tone: 'info', title: 'Add indicator', detail: 'Put a few drops of universal indicator in the tube. With none there is nothing to see.' };
    const note = s.drops > 8 ? ' That is a lot of dye: it is itself an acid, and in a weak or dilute sample it changes the pH it is measuring.' : '';
    return { key: 'uni-match', tone: s.drops > 8 ? 'warn' : 'ok', title: s.pick ? `You matched pH ${s.pick}` : 'Match the colour to the chart', detail: `Pick the patch nearest the tube in colour, then record it.${note}` };
  }
  /* meter */
  const r = meterReading(s);
  if (s.calError !== null && s.calError !== undefined) {
    return { key: 'meter-cal-rejected', tone: 'bad', title: `Calibration rejected: slope ${Number.isFinite(s.calError) ? s.calError.toFixed(0) : '—'}%`, detail: `A glass electrode gives ${SLOPE_RANGE[0]}–${SLOPE_RANGE[1]}% of the ideal slope; this point was taken before the reading had settled. Rinse, dip, wait for STABLE, then calibrate again.` };
  }
  if (!r.sensing) {
    if (!s.cal) {
      return { key: 'meter-uncal', tone: 'warn', title: 'The meter is not calibrated', detail: 'It is using the factory slope and no offset, so every reading is off by the electrode’s own asymmetry. Rinse it and calibrate on pH 4.01 and 9.18 buffers.' };
    }
    return { key: 'meter-dry', tone: 'info', title: 'The electrode is out of solution', detail: 'Dip it in the sample or in a buffer. A glass electrode must be wet to read, and must be rinsed between solutions.' };
  }
  if (s.film && s.film.volume > 0 && !r.stable) {
    return { key: 'meter-film', tone: 'warn', title: 'The electrode is carrying the last solution', detail: 'A film of the previous liquid is on the glass. In a buffer it hardly matters; in pure or weakly buffered water it ruins the reading. Rinse first.' };
  }
  if (!r.stable) {
    return { key: 'meter-settling', tone: 'info', title: 'Settling…', detail: 'The glass takes several seconds to respond. A reading taken now is not the pH — wait for STABLE.' };
  }
  if (BUF_OF[s.location]) {
    return { key: 'meter-in-buffer', tone: 'ok', title: `Stable in the ${certifiedPH(BUF_OF[s.location], s.tempC).toFixed(2)} buffer`, detail: `Reads ${r.pH.toFixed(2)}${s.cal ? '' : ' on the factory settings'}. Press Calibrate to set this point, or check it against the certified value.` };
  }
  if (!s.cal) {
    return { key: 'meter-uncal', tone: 'warn', title: `Stable, but uncalibrated: pH ${r.pH.toFixed(2)}`, detail: 'The meter is on its factory slope with no offset, so this number carries the electrode’s own asymmetry. Calibrate on pH 4.01 and 9.18 before you trust it.' };
  }
  const shift = s.spoil && s.spoil.volume > 0 && s.world.atElectrode ? s.world.atElectrode.pH - s.world.sample.pH : 0;
  if (Math.abs(shift) > 0.02) {
    return { key: 'meter-spoiled', tone: 'warn', title: 'The sample is contaminated', detail: `The unrinsed electrode left ${(s.spoil.volume * 1000).toFixed(0)} µL of the last solution in this beaker, and the reading is steady — but steady is not right. Rinsing now will not undo it: pour a fresh sample and rinse before you dip.` };
  }
  const warn = r.pH > 12 ? ' Above pH 12 a glass electrode reads low in sodium solutions (the alkaline error).' : '';
  return { key: 'meter-stable', tone: 'ok', title: `Stable: pH ${r.pH.toFixed(2)}`, detail: `Slope ${r.slope.toFixed(1)}% of ideal.${warn} Record it when you are ready.` };
}

/** The ways a recording can be wrong, as the notebook flags them. */
export function notesFor(s) {
  const notes = [];
  if (s.method === 'meter') {
    const r = meterReading(s);
    if (!s.cal) notes.push('uncalibrated');
    else if ((s.cal.points ?? []).length === 1) notes.push('one-point calibration');
    if (!r.stable) notes.push('not settled');
    if ((s.film && s.film.volume > 0) || (s.spoil && s.spoil.volume > 0)) notes.push('unrinsed electrode');
    if (s.cal && slopePercent(s.cal) < 92) notes.push(`worn electrode (${slopePercent(s.cal).toFixed(0)}%)`);
  }
  if (s.method === 'universal' && s.drops > 8) notes.push('too much indicator');
  return notes.join('; ');
}

export { SHELF as default };
