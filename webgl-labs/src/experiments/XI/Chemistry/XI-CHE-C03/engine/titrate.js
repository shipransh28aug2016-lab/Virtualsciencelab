/**
 * XI-CHE-C03 — the pH curve of NaOH titrated with HCl. Pure: no React, no
 * three, no store.
 *
 * The flask holds a pipetted volume of sodium hydroxide whose concentration the
 * bottle only gives as "about 0.1 M" — the real figure is something the
 * student is there to find out. The burette holds standard HCl. What the
 * student sees depends on what they chose to watch with:
 *
 *   UNIVERSAL     a few drops of a four-dye indicator; the colour walks through
 *                 the spectrum and is matched to a chart, to about a unit;
 *   SINGLE DYE    phenolphthalein, methyl orange or bromothymolBlue: a sharp change
 *                 somewhere, and the student calls the end point by eye;
 *   PH METER      a glass electrode in the flask, with its own response time —
 *                 and its own alkaline error at the start, where 0.1 M sodium
 *                 hydroxide reads 0.2 low.
 *
 * The flask is not uniform. Titrant that has fallen but not been swirled in is
 * a plume under the tip (shared/titration), and both the indicator and the
 * electrode in the bulk see the bulk. That is where the overshoot lives.
 */
import { solveAqueous, systemFrom, activityCoefficient } from '../../../../../shared/chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../../../../../shared/chem/species.js';
import { vesselColour, buildChart, UNIVERSAL_STRENGTH } from '../../../../../shared/chem/indicators.js';
import { colourName } from '../../../../../shared/chem/spectra.js';
import { makeElectrode, electrodePotential, calibratedMeter, displayPH, electrodeSettled, slopePercent } from '../../../../../shared/chem/phMeter.js';
import { mulberry32 } from '../../../../../shared/numerics.js';
import {
  flaskBulk, flaskPlume, DROP_ML, BURETTE_ML, readBurette, steepest, slopes, analyteFromTitre,
} from '../../../../../shared/titration/titration.js';

export { DROP_ML, BURETTE_ML };
export const CHART = buildChart({ strength: UNIVERSAL_STRENGTH });

/** What is really in the bottle marked "about 0.1 M NaOH": a little under,
 *  because sodium hydroxide takes up carbon dioxide and water from the air. */
export const NAOH_M = 0.0978;
export const FLASK_PATH_CM = 3;          // the depth of liquid a colour is judged through

const sys = (id, c, T) => systemFrom([{ recipe: SUBSTANCES[id], scale: c }], { T, WEAK, SOLIDS });
export const analyteSystem = (s) => sys('naoh', NAOH_M, s.tempC);
export const titrantSystem = (s) => sys('hcl', s.titrantN, s.tempC);

/* ── Indicators ───────────────────────────────────────────────────────────── */

export const INDICATOR_LIST = [
  { id: 'universal', label: 'Universal indicator' },
  { id: 'phenolphthalein', label: 'Phenolphthalein' },
  { id: 'methylOrange', label: 'Methyl orange' },
  { id: 'bromothymolBlue', label: 'Bromothymol blue' },
  { id: 'none', label: 'No indicator' },
];
export const INDICATOR_BY_ID = Object.fromEntries(INDICATOR_LIST.map((i) => [i.id, i]));
/** How many drops a lab manual would say, for each. */
export const RECOMMENDED_DROPS = { universal: 5, phenolphthalein: 2, methylOrange: 2, bromothymolBlue: 3, none: 0 };

/** The colour a flask of pH `pH`, ionic strength `I` and total volume `V` shows. */
export const flaskColour = (s, pH, V, I) => vesselColour({
  indicator: s.indicator, drops: s.drops, pH, I, tC: s.tempC, volumeMl: V, pathCm: FLASK_PATH_CM, dropMl: DROP_ML,
});

export { colourName };

/* ── The burette ──────────────────────────────────────────────────────────── */

export const totalAdded = (s) => s.deliveredBefore + s.delivered;
export const remaining = (s) => Math.max(0, BURETTE_ML - s.r0 - s.delivered);
export const buretteReading = (s) => s.r0 + s.delivered;
export const started = (s) => totalAdded(s) > 0;
/** The reading on the scale: the student reads to 0.05 mL. */
export const shownReading = (s) => readBurette(buretteReading(s));

/** A new fill never starts at exactly zero: the meniscus is set wherever it lands. */
export const initialReading = (fills) => 0.05 * (1 + Math.floor(mulberry32(fills + 17)() * 16));

/* ── The flask ────────────────────────────────────────────────────────────── */

export const agitationOf = (s) => (s.stirrer === 'on' ? 'stir' : s.elapsed < s.swirlUntil ? 'swirl' : 'none');
export const flaskVolume = (s) => s.analyteMl + totalAdded(s);

export const electrodeFor = () => makeElectrode({ seed: 21 });
const sodiumActivity = (sys0, I, tC) => activityCoefficient(1, I, tC) * (sys0.strong ?? []).filter((x) => x.z === +1).reduce((a, x) => a + x.c, 0);

/** Everything that needs the solver. Run when the volumes change, not every frame. */
export function computeWorld(s) {
  const analyte = analyteSystem(s); const titrant = titrantSystem(s);
  const V = totalAdded(s);
  const mixed = Math.max(0, V - s.unmixed);
  const bulk = flaskBulk({ analyte, analyteMl: s.analyteMl, titrant, mixedMl: mixed });
  const bulkSol = solveAqueous(bulk);
  const Vtot = s.analyteMl + V;
  const world = {
    bulk, bulkPH: bulkSol.pH, plumePH: null,
    colour: flaskColour(s, bulkSol.pH, Vtot, bulkSol.ionicStrength), plumeColour: null,
    targetE: null, mixedMl: mixed,
  };
  if (s.unmixed > 1e-4) {
    const plume = solveAqueous(flaskPlume({ bulk, titrant, unmixedMl: s.unmixed }));
    world.plumePH = plume.pH;
    world.plumeColour = flaskColour(s, plume.pH, Vtot, plume.ionicStrength);
  }
  if (s.meter === 'in') {
    world.targetE = electrodePotential(electrodeFor(), { pH: bulkSol.pH, aNa: sodiumActivity(bulk, bulkSol.ionicStrength, s.tempC), tC: s.tempC });
  }
  return world;
}

/** The pH the bulk would have if it were NOT being fooled by the unmixed part:
 *  the true state of the reaction after everything has been swirled in. */
export function equilibriumPH(s) {
  return solveAqueous(flaskBulk({ analyte: analyteSystem(s), analyteMl: s.analyteMl, titrant: titrantSystem(s), mixedMl: totalAdded(s) })).pH;
}

/** Where the equivalence point truly is for what is in the flask. */
export const trueEquivalenceMl = (s) => (NAOH_M * s.analyteMl) / s.titrantN;

/* ── The meter ────────────────────────────────────────────────────────────── */

export function meterReading(s) {
  if (s.meter !== 'in' || s.world.targetE === null) return { sensing: false, pH: null, mV: s.E_mV, stable: false, slope: null };
  const m = calibratedMeter(electrodeFor(), s.tempC);
  return {
    sensing: true, pH: displayPH(m, s.E_mV, s.tempC), mV: s.E_mV,
    stable: electrodeSettled(electrodeFor(), s.Ed_mV, s.world.targetE), slope: slopePercent(m),
  };
}

/* ── The notebook ─────────────────────────────────────────────────────────── */

/** The pH a student can write down right now, by the means they are using. */
export function pHToRecord(s) {
  if (s.meter === 'in') { const r = meterReading(s); return r.sensing ? r.pH : null; }
  return s.indicator === 'universal' ? s.pick : null;
}

export function notesFor(s) {
  const n = [];
  if (s.unmixed > 0.02) n.push('not swirled in');
  if (s.meter === 'in' && !meterReading(s).stable) n.push('meter not settled');
  if (s.stopcock === 'open') n.push('stopcock open');
  if (s.meter !== 'in' && s.indicator === 'universal' && s.drops > 6) n.push('too much indicator');
  return n.join('; ');
}

/** What the student's points say. */
export function analyse(log, s) {
  const pts = log.filter((r) => r.kind === 'reading' && r.pH !== null).map((r) => [r.added, r.pH]);
  const endpoints = log.filter((r) => r.kind === 'endpoint');
  const st = steepest(pts);
  const sl = slopes(pts).map((d) => [d.V, d.slope]);
  const result = {};
  const mk = (V, how) => {
    const C = analyteFromTitre({ titreMl: V, analyteMl: s.analyteMl, titrantC: s.titrantN });
    return { V, how, C, errPct: 100 * (C / NAOH_M - 1) };
  };
  if (endpoints.length) result.endpoint = mk(endpoints[endpoints.length - 1].added, 'end point called by eye');
  if (st) result.curve = { ...mk(st.V, 'steepest part of your curve'), lo: st.lo, hi: st.hi };
  return {
    series: [{ name: 'pH', points: pts.slice().sort((a, b) => a[0] - b[0]), connect: true }],
    slope: [{ name: 'ΔpH/ΔV', points: sl, connect: true }],
    result,
  };
}

/* ── Status ───────────────────────────────────────────────────────────────── */

export function statusOf(s) {
  const V = totalAdded(s);
  if (s.stopcock === 'open') {
    return { key: 'flowing', tone: 'warn', title: 'Titrant is running', detail: `${s.flow.toFixed(2)} mL/s from the open stopcock. Close it before the colour changes — a stream cannot be stopped in the middle of a drop.` };
  }
  if (remaining(s) <= 0) {
    return { key: 'empty', tone: 'bad', title: 'The burette is empty', detail: 'It is at the 50 mL mark. Refill it and read the new initial reading: the titre is the sum of the volumes delivered from each fill.' };
  }
  const pH = s.world.bulkPH;
  if (s.unmixed > 0.02 && agitationOf(s) === 'none') {
    return { key: 'swirl', tone: 'info', title: 'Swirl the flask', detail: 'The titrant that has fallen has not mixed in: near the tip the flask is a different solution from the one the rest of it is. Whatever the indicator shows now is the drop, not the flask.' };
  }
  if (V === 0) return { key: 'ready', tone: 'info', title: 'Ready to titrate', detail: 'Note the initial burette reading, then add acid: 1 mL at a time at first, noting the colour or pH after each.' };
  if (pH < 3) return { key: 'past', tone: 'note', title: 'Past the end point', detail: 'The flask is acidic now. Carry on a few mL to see the curve level off, then plot pH against volume and find the steepest part.' };
  if (pH > 4 && pH < 10) return { key: 'steep', tone: 'warn', title: 'The pH is changing fast', detail: 'This is the steep part. Add single drops now: a whole mL here can jump the entire jump.' };
  return { key: 'titrating', tone: 'ok', title: `Titrating: ${V.toFixed(2)} mL added`, detail: 'Swirl after each addition, note the colour or pH, and record.' };
}
