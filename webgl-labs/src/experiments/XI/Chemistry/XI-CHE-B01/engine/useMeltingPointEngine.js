/**
 * useMeltingPointEngine — the React-facing store for XI-CHE-B01.
 *
 * Thin. All the thermochemistry is in thermochemistry.js, which knows nothing
 * about React; this holds what the student has set up, advances the bench one
 * frame at a time, and remembers the two temperatures they are supposed to be
 * watching for.
 *
 * The two marks — first drop and last crystal — are captured by the simulation
 * as they happen, not computed at the end. That is deliberate: they are
 * observations, and if a student looks away, changes the bath, or lets the
 * capillary sublime away, the observation simply does not get made.
 */
import { create } from 'zustand';
import {
  derive, integrate, COMPOUNDS, BATHS, THERMOMETERS, UNKNOWNS,
  NATIVE_IMPURITY, LIQUID_VISIBLE_FRACTION, SINTER_FRACTION, AMBIENT_C,
} from './thermochemistry.js';

export {
  COMPOUNDS, BATHS, THERMOMETERS, UNKNOWNS, NATIVE_IMPURITY,
  LIQUID_VISIBLE_FRACTION, SINTER_FRACTION,
} from './thermochemistry.js';

const SETUP = {
  compoundId: 'naphthalene',
  impurityId: 'none',
  purity: 'pure',
  bath: 'oil',
  thermometer: 't05',
  heatingRate: 2,
  mixMolePercent: 0,
  airOpen: true,
};

const BENCH = {
  capillaryRuns: 0,
  burnerOn: false,
  bathC: AMBIENT_C,
  sampleC: AMBIENT_C,
  readingC: AMBIENT_C,
  meltedFraction: 0,
  columnLoss: 0,
  elapsed: 0,
  sinterC: null,
  firstDropC: null,
  lastCrystalC: null,
};

const INITIAL = { ...SETUP, ...BENCH, timeScale: 60, log: [] };

/** A new capillary. Setup is kept, the bench forgets everything — because a
 *  fresh capillary is a fresh sample and carrying the old marks over would
 *  report a melt that this sample never did. The bath stays hot, as it would. */
const repack = (s, patch = {}, keepBath = true) => {
  const next = {
    ...s, ...patch, ...BENCH,
    bathC: keepBath ? s.bathC : AMBIENT_C,
    readingC: keepBath ? s.readingC : AMBIENT_C,
    sampleC: keepBath ? s.bathC : AMBIENT_C,
    burnerOn: keepBath ? s.burnerOn : false,
    capillaryRuns: 0,
  };
  return { ...next, derived: derive(next) };
};

export const useMeltingPointEngine = create((set, get) => ({
  ...INITIAL,
  derived: derive(INITIAL),

  /** One frame. Allocation-light, and the only writer of the bench's memory. */
  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const stepped = integrate(s, dt);
    const next = { ...s, ...stepped, elapsed: s.elapsed + dt };

    /* The observations. Recorded at the instant the column reaches each
       appearance, with the mercury rounded to what this thermometer can
       actually resolve — so a coarse instrument loses the sharpness rather than
       the simulation hiding it. */
    const lc = THERMOMETERS[s.thermometer].leastCount;
    const reading = Math.round(next.readingC / lc) * lc;
    if (next.sinterC === null && stepped.meltedFraction >= SINTER_FRACTION) next.sinterC = reading;
    if (next.firstDropC === null && stepped.meltedFraction >= LIQUID_VISIBLE_FRACTION) next.firstDropC = reading;
    if (next.lastCrystalC === null && stepped.meltedFraction >= 0.999) next.lastCrystalC = reading;

    set({ ...stepped, elapsed: next.elapsed, sinterC: next.sinterC,
      firstDropC: next.firstDropC, lastCrystalC: next.lastCrystalC,
      derived: derive(next) });
  },

  /* ── Setting up ────────────────────────────────────────────────────────── */
  setCompound: (compoundId) => set((s) => repack(s, { compoundId, impurityId: 'none', mixMolePercent: 0 }, false)),
  setPurity: (purity) => set((s) => repack(s, { purity })),
  setImpurity: (impurityId) => set((s) => repack(s, { impurityId })),
  setMix: (mixMolePercent) => set((s) => repack(s, { mixMolePercent: Math.max(0, Math.min(60, mixMolePercent)) })),

  /** Changing the bath means emptying the tube and refilling it, so the bench
   *  goes cold. Discovering that after twenty minutes of heating is part of the
   *  lesson about choosing the bath first. */
  setBath: (bath) => set((s) => repack(s, { bath }, false)),

  /** The thermometer can be swapped without disturbing the bath, but the marks
   *  already taken were read on the old one and are not comparable. */
  setThermometer: (thermometer) => set((s) => repack(s, { thermometer })),

  setHeatingRate: (heatingRate) => set((s) => {
    const next = { ...s, heatingRate: Math.max(1, Math.min(12, heatingRate)) };
    return { ...next, derived: derive(next) };
  }),

  setAir: (airOpen) => set((s) => {
    const next = { ...s, airOpen };
    return { ...next, derived: derive(next) };
  }),

  toggleBurner: () => set((s) => {
    const next = { ...s, burnerOn: !s.burnerOn };
    return { ...next, derived: derive(next) };
  }),

  /** Re-use the same capillary for a second run. Offered, rather than
   *  prevented, because for urea it is a mistake with a visible consequence and
   *  for naphthalene it is merely wasteful. */
  reuseCapillary: () => set((s) => {
    const next = { ...s, ...BENCH, bathC: s.bathC, readingC: s.readingC,
      sampleC: s.bathC, burnerOn: s.burnerOn, capillaryRuns: s.capillaryRuns + 1 };
    return { ...next, derived: derive(next) };
  }),

  freshCapillary: () => set((s) => repack(s)),

  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The notebook ──────────────────────────────────────────────────────── */

  /** Commit the trial. The columns are the ones the published experiment
   *  defines — trial, compound, sample, first drop, last crystal, range — with
   *  the conditions alongside, because a melting point without its heating rate
   *  is not a measurement. */
  record: () => set((s) => {
    const d = s.derived;
    const first = s.firstDropC;
    const last = s.lastCrystalC;
    return {
      log: [...s.log, {
        id: `${Date.now()}-${s.log.length}`,
        trial: s.log.length + 1,
        compound: d.host.label,
        purity: s.purity,
        mixedWith: s.impurityId !== 'none' && s.mixMolePercent > 0
          ? `${COMPOUNDS[s.impurityId].label} ${s.mixMolePercent}%` : '—',
        bath: BATHS[s.bath].label,
        rate: s.heatingRate,
        leastCount: THERMOMETERS[s.thermometer].leastCount,
        sinterC: s.sinterC,
        firstDropC: first,
        lastCrystalC: last,
        rangeC: first !== null && last !== null ? Number((last - first).toFixed(2)) : null,
        literatureC: d.literatureC,
        verdict: last === null
          ? 'not melted'
          : (last - first) <= 1.0 ? 'sharp — pure' : 'wide — impure',
      }],
    };
  }),

  clearLog: () => set({ log: [] }),

  reset: () => set((s) => {
    const next = { ...INITIAL, log: s.log, timeScale: s.timeScale };
    return { ...next, derived: derive(next) };
  }),
}));

/* Selectors, so a slider drag re-renders three numbers and not the notebook. */
export const selectDerived = (s) => s.derived;
export const selectStatus = (s) => s.derived.status;
export const selectLog = (s) => s.log;
/* One primitive per selector, never a fresh object. zustand reads through
   useSyncExternalStore, which compares the snapshot by identity on every
   render: a selector that builds `{ a, b }` returns a new reference each time,
   React concludes the store changed during rendering, and it re-renders until
   it gives up with "maximum update depth exceeded". */
export const selectSinter = (s) => s.sinterC;
export const selectFirstDrop = (s) => s.firstDropC;
export const selectLastCrystal = (s) => s.lastCrystalC;
