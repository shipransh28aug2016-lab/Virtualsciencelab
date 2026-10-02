/**
 * useAcidEngine — the store for XI-CHE-C02.
 *
 * What the student has set up (two tubes, a method), what they have done with
 * their hands (dip, rinse, record), and the one thing that moves on its own:
 * the electrode settling and the strips developing. The solver runs when the
 * setup changes (`world`), never per frame.
 *
 * The actions carry the consequences they have at a bench. An unrinsed
 * electrode leaves a film of the last acid in the next tube, and rinsing
 * afterwards cannot take it out again; diluting one tube and not the other
 * makes the comparison unfair, and the notebook says so.
 */
import { create } from 'zustand';
import { stepElectrode } from '../../../../../shared/chem/phMeter.js';
import { pKw } from '../../../../../shared/chem/constants.js';
import {
  ACID_BY_ID, FILM_ML, computeWorld, tubeContents, addSpoil, meterReading, readingFor, workings,
  notesFor, analyse, concentration, electrodeFor, sci,
} from './acids.js';

const SETUP = {
  A: { acid: 'hcl', dilution: 1 }, B: { acid: 'acetic', dilution: 1 },
  link: 'on', tempC: 25, method: 'meter', drops: 5, meterCal: 'calibrated', timeScale: 4,
};

const BENCH = {
  where: 'air', film: null, spoil: { A: null, B: null }, E_mV: 0, Ed_mV: 0, noiseSeed: 1,
  stripA: { dipped: false, t: 0 }, stripB: { dipped: false, t: 0 }, pick: { A: null, B: null }, elapsed: 0,
};

const INITIAL = { ...SETUP, ...BENCH, log: [], analysis: analyse([]) };
INITIAL.world = computeWorld(INITIAL);

const refresh = (s, patch) => {
  const next = { ...s, ...patch };
  return { ...next, world: computeWorld(next) };
};

/** The solution the electrode is leaving, as the film it takes with it. */
function filmFrom(s) {
  if (s.where === 'A' || s.where === 'B') return { system: tubeContents(s, s.where), volume: FILM_ML };
  return s.film;
}

const FRESH_STRIP = { dipped: false, t: 0 };
const stripKey = (tube) => (tube === 'A' ? 'stripA' : 'stripB');

/** Make one tube up again: new acid or new dilution means a clean tube, a new
 *  strip and nothing yet matched. If the electrode was in it, it comes out
 *  carrying the old solution. */
function remake(s, tubes, patch) {
  const spoil = { ...s.spoil }; const pick = { ...s.pick }; const extra = {};
  for (const t of tubes) { spoil[t] = null; pick[t] = null; extra[stripKey(t)] = FRESH_STRIP; }
  const lifted = tubes.includes(s.where) ? { film: filmFrom(s), where: 'air' } : {};
  return refresh(s, { ...patch, spoil, pick, ...extra, ...lifted });
}

export const useAcidEngine = create((set, get) => ({
  ...INITIAL,

  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const patch = { elapsed: s.elapsed + dt };
    if (s.method === 'meter' && s.world.targetE !== null) Object.assign(patch, stepElectrode(electrodeFor(), s, s.world.targetE, dt));
    if (s.method === 'paper') {
      if (s.stripA.dipped) patch.stripA = { dipped: true, t: s.stripA.t + dt };
      if (s.stripB.dipped) patch.stripB = { dipped: true, t: s.stripB.t + dt };
    }
    set(patch);
  },

  /* ── Setting up the tubes ───────────────────────────────────────────────── */

  setAcidA: (acid) => set((s) => remake(s, ['A'], { A: { ...s.A, acid } })),
  setAcidB: (acid) => set((s) => remake(s, ['B'], { B: { ...s.B, acid } })),
  /* Dilution is made with a slider in log₁₀; linked, it moves both tubes, which
     is what holding the concentration constant across the two means. */
  setDilutionLogA: (v) => set((s) => {
    const dilution = Math.max(1, Math.round(10 ** v));
    return s.link === 'on'
      ? remake(s, ['A', 'B'], { A: { ...s.A, dilution }, B: { ...s.B, dilution } })
      : remake(s, ['A'], { A: { ...s.A, dilution } });
  }),
  setDilutionLogB: (v) => set((s) => {
    const dilution = Math.max(1, Math.round(10 ** v));
    return s.link === 'on'
      ? remake(s, ['A', 'B'], { A: { ...s.A, dilution }, B: { ...s.B, dilution } })
      : remake(s, ['B'], { B: { ...s.B, dilution } });
  }),
  /* Linking again makes B up afresh at A's dilution. */
  setLink: (link) => set((s) => (link === 'on' && s.B.dilution !== s.A.dilution
    ? remake(s, ['B'], { link, B: { ...s.B, dilution: s.A.dilution } })
    : refresh(s, { link }))),
  setTemp: (tempC) => set((s) => refresh(s, { tempC: Math.max(15, Math.min(40, tempC)) })),
  setMethod: (method) => set((s) => refresh(s, { method, pick: { A: null, B: null }, stripA: FRESH_STRIP, stripB: FRESH_STRIP })),
  setDrops: (drops) => set((s) => refresh(s, { drops: Math.max(0, Math.min(12, Math.round(drops))), pick: { A: null, B: null } })),
  setMeterCal: (meterCal) => set((s) => refresh(s, { meterCal })),
  setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The electrode ──────────────────────────────────────────────────────── */

  dip: (where) => set((s) => {
    if (s.where === where) return s;
    const carried = filmFrom(s);
    /* Into a tube, the film is washed off the glass and into the tube. */
    if ((where === 'A' || where === 'B') && carried && carried.volume > 0) {
      return refresh(s, { film: null, spoil: { ...s.spoil, [where]: addSpoil(s.spoil[where], carried) }, where });
    }
    return refresh(s, { film: carried, where });
  }),
  rinse: () => set((s) => refresh(s, { film: null, where: 'rinse' })),
  lift: () => set((s) => refresh(s, { film: filmFrom(s), where: 'air' })),
  /** Prepare both tubes again, clean, at the same settings. */
  freshTubes: () => set((s) => remake(s, ['A', 'B'], {})),

  /* ── Strips and the chart ───────────────────────────────────────────────── */

  dipStripA: () => set((s) => refresh(s, { stripA: { dipped: true, t: 0 }, pick: { ...s.pick, A: null } })),
  dipStripB: () => set((s) => refresh(s, { stripB: { dipped: true, t: 0 }, pick: { ...s.pick, B: null } })),
  setPickA: (v) => set((s) => ({ pick: { ...s.pick, A: v === '' || v === null ? null : Number(v) } })),
  setPickB: (v) => set((s) => ({ pick: { ...s.pick, B: v === '' || v === null ? null : Number(v) } })),

  /* ── The notebook ───────────────────────────────────────────────────────── */

  record: (tube) => set((s) => {
    const reading = readingFor(s, tube);
    if (reading === null || reading === undefined) return s;
    const t = s[tube]; const C = concentration(t);
    const dp = s.method === 'meter' ? 2 : 0;
    const pH = Number(reading.toFixed(dp));
    const w = workings(pH, C);
    const row = {
      id: `${s.log.length}-${tube}`,
      trial: s.log.length + 1,
      tube,
      acid: ACID_BY_ID[t.acid].formula,
      acidId: t.acid,
      C: Number(C.toPrecision(3)),
      Ctxt: sci(C),
      method: { paper: 'pH paper', universal: 'Universal indicator', meter: 'pH meter' }[s.method],
      tempC: s.tempC,
      pH,
      H: Number(w.H.toPrecision(3)),
      alpha: Number((w.alpha * 100).toPrecision(3)),
      Ka: w.Ka === null ? null : Number(w.Ka.toPrecision(3)),
      Htxt: sci(w.H),
      Katxt: w.Ka === null ? 'n/a' : sci(w.Ka),
      pOH: Number((pKw(s.tempC) - pH).toFixed(dp ? 2 : 1)),
      error: Number((pH - s.world[tube].pH).toFixed(2)),
      note: notesFor(s, tube),
    };
    const log = [...s.log, row];
    return { log, analysis: analyse(log) };
  }),
  clearLog: () => set({ log: [], analysis: analyse([]) }),

  /** A fresh bench. The notebook stays: it is the student's own record. */
  reset: () => set((s) => refresh({ ...INITIAL, log: s.log, analysis: s.analysis, timeScale: s.timeScale }, {})),
}));

export { meterReading };
