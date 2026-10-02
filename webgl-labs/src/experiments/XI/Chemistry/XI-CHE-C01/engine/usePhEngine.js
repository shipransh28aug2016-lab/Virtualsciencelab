/**
 * usePhEngine — the store for XI-CHE-C01.
 *
 * Holds what the student has set up and what they have done at the bench, and
 * advances the one thing that moves on its own: the electrode settling and the
 * strip developing. Everything that needs the aqueous solver is computed when
 * the setup changes (`world`), never per frame.
 *
 * The actions are the things a person does with their hands: pick a sample, dip
 * a strip, rinse the electrode, put it in a buffer, press calibrate. Each has
 * the consequence it has at a real bench — an unrinsed electrode carries a film
 * of the last solution into the next one; a calibration pressed before the
 * reading has settled records a wrong point.
 */
import { create } from 'zustand';
import { stepElectrode } from '../../../../../shared/chem/phMeter.js';
import { pKw } from '../../../../../shared/chem/constants.js';
import {
  SHELF_BY_ID, FILM_ML, computeWorld, beakerSystem, bufferSystem, addSpoil, electrodeFor, addCalibrationPoint, meterReading,
  readingToRecord, natureOf, concentrationLabel, notesFor, BUF_OF,
} from './ph.js';

const SETUP = {
  sampleId: 'hcl', dilution: 1, tempC: 25, method: 'meter', drops: 5, electrode: 'good', timeScale: 4,
};

const BENCH = {
  location: 'air', film: null, spoil: null, E_mV: 0, Ed_mV: 0, cal: null, calError: null, noiseSeed: 1,
  strip: { dipped: false, t: 0 }, pick: null, elapsed: 0,
};

const INITIAL = { ...SETUP, ...BENCH, log: [] };
INITIAL.world = computeWorld(INITIAL);

/** Apply a patch and recompute everything that needs the solver. */
const refresh = (s, patch) => {
  const next = { ...s, ...patch };
  return { ...next, world: computeWorld(next) };
};

/** The solution the electrode is leaving, as the film it takes with it. */
function filmFrom(s) {
  if (s.location === 'sample') return { system: beakerSystem(s), volume: FILM_ML };
  /* A buffer's film is a buffer: harmless in the next buffer, not in water. */
  if (BUF_OF[s.location]) return { system: bufferSystem(BUF_OF[s.location], s.tempC), volume: FILM_ML };
  return s.film;
}

export const usePhEngine = create((set, get) => ({
  ...INITIAL,

  /** One frame: the electrode settles and the strip develops. */
  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const patch = { elapsed: s.elapsed + dt };
    if (s.method === 'meter' && s.world.targetE !== null) {
      /* The glass settles exactly (analytic in dt, so the clock speed and the
         frame rate change nothing); the display jitter rides on top of it. */
      Object.assign(patch, stepElectrode(electrodeFor(s), s, s.world.targetE, dt));
    }
    if (s.method === 'paper' && s.strip.dipped) patch.strip = { dipped: true, t: s.strip.t + dt };
    set(patch);
  },

  /* ── Setting up ────────────────────────────────────────────────────────── */

  setSample: (sampleId) => set((s) => {
    /* Changing beaker lifts the electrode out, and it goes on carrying the old
       solution. A new sample is a new tube and a new strip. */
    const film = s.location === 'sample' ? filmFrom(s) : s.film;
    return refresh(s, {
      sampleId, film, spoil: null, location: s.location === 'sample' ? 'air' : s.location,
      dilution: SHELF_BY_ID[sampleId].fixed ? 1 : s.dilution, strip: { dipped: false, t: 0 }, pick: null,
    });
  }),
  setDilutionLog: (v) => set((s) => (SHELF_BY_ID[s.sampleId].fixed ? s : refresh(s, {
    dilution: Math.max(1, Math.round(10 ** v)), spoil: null, pick: null, strip: { dipped: false, t: 0 },
  }))),
  setTemp: (tempC) => set((s) => refresh(s, { tempC: Math.max(15, Math.min(40, tempC)) })),
  setMethod: (method) => set((s) => refresh(s, { method, pick: null, strip: { dipped: false, t: 0 } })),
  setDrops: (drops) => set((s) => refresh(s, { drops: Math.max(0, Math.min(12, Math.round(drops))), pick: null })),
  /** A different electrode is a different instrument: it must be calibrated afresh. */
  setElectrode: (electrode) => set((s) => refresh(s, { electrode, cal: null, calError: null, E_mV: 0, Ed_mV: 0 })),
  setTimeScale: (timeScale) => set({ timeScale }),
  /* The segmented control hands back strings. */
  setTimeScaleStr: (v) => set({ timeScale: Number(v) }),

  /* ── The meter ─────────────────────────────────────────────────────────── */

  dip: (where) => set((s) => {
    if (s.location === where) return s;
    const carried = filmFrom(s);
    /* Into the sample, the film is washed off the glass and into the beaker. */
    if (where === 'sample' && carried && carried.volume > 0) {
      return refresh(s, { film: null, spoil: addSpoil(s.spoil, carried), calError: null, location: where });
    }
    return refresh(s, { film: carried, calError: null, location: where });
  }),
  /** Pour a fresh sample: same solution, clean beaker. */
  freshSample: () => set((s) => refresh(s, { spoil: null, strip: { dipped: false, t: 0 }, pick: null })),
  rinse: () => set((s) => refresh(s, { film: null, calError: null, location: 'rinse' })),
  lift: () => set((s) => refresh(s, { film: filmFrom(s), location: 'air' })),
  calibrate: () => set((s) => {
    const r = addCalibrationPoint(s);
    if (!r) return s;
    return r.rejected ? { calError: r.slope } : { cal: r.cal, calError: null };
  }),
  clearCalibration: () => set({ cal: null, calError: null }),

  /* ── The strip and the chart ───────────────────────────────────────────── */

  dipStrip: () => set({ strip: { dipped: true, t: 0 }, pick: null }),
  setPick: (v) => set({ pick: v === '' || v === null ? null : Number(v) }),

  /* ── The notebook ──────────────────────────────────────────────────────── */

  record: () => set((s) => {
    const reading = readingToRecord(s);
    if (reading === null) return s;
    const truePH = s.world.sample.pH;
    const dp = s.method === 'meter' ? 2 : 0;
    const e = SHELF_BY_ID[s.sampleId];
    return {
      log: [...s.log, {
        id: `${Date.now()}-${s.log.length}`,
        trial: s.log.length + 1,
        sample: e.label,
        concentration: concentrationLabel(s),
        method: { paper: 'pH paper', universal: 'Universal indicator', meter: 'pH meter' }[s.method],
        tempC: s.tempC,
        pH: Number(reading.toFixed(dp)),
        pOH: Number((pKw(s.tempC) - reading).toFixed(s.method === 'meter' ? 2 : 1)),
        nature: natureOf(reading, s.tempC, s.method),
        error: Number((reading - truePH).toFixed(2)),
        note: notesFor(s),
      }],
    };
  }),
  clearLog: () => set({ log: [] }),

  /** A fresh bench. The notebook stays: it is the student's own record. */
  reset: () => set((s) => ({ ...refresh({ ...INITIAL, log: s.log, timeScale: s.timeScale }, {}) })),
}));

/* Selectors return primitives, never a fresh object. */
export const selectLog = (s) => s.log;
export { meterReading };
