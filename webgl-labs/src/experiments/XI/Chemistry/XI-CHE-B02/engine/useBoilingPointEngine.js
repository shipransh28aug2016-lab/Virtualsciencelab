/**
 * useBoilingPointEngine — the React-facing store for XI-CHE-B02.
 *
 * Thin. All the thermodynamics is in vapour.js, which knows nothing about
 * React; this holds the bench setup, advances it one frame at a time, and
 * remembers the two temperatures the student is supposed to be watching for.
 *
 * The flame is NOT taken away automatically. Knowing when to stop heating is
 * the skill this experiment teaches, and a bench that stopped for you would be
 * teaching nothing.
 */
import { create } from 'zustand';
import {
  derive, integrate, makeCharge, totalVapourPressure, capillaryHeadMmHg,
  LIQUIDS, SOLUTES, BATHS, THERMOMETERS, UNKNOWNS, NATIVE_SOLUTE,
  STANDARD_PRESSURE, AMBIENT_C, STREAM_CONFIRM_SECONDS,
} from './vapour.js';

export {
  LIQUIDS, SOLUTES, BATHS, THERMOMETERS, UNKNOWNS, NATIVE_SOLUTE, STANDARD_PRESSURE,
} from './vapour.js';

const SETUP = {
  liquidId: 'ethanol',
  purity: 'pure',
  bath: 'oil',
  thermometer: 't05',
  heatingRate: 3,
  pressureMmHg: 760,
  chips: 'with',
  secondLiquidId: 'none',
  secondMolePercent: 0,
  airOpen: true,
};

const benchFor = (setup) => ({
  moles: makeCharge(setup).moles,
  burnerOn: false,
  bathC: AMBIENT_C,
  liquidC: AMBIENT_C,
  readingC: AMBIENT_C,
  boiledAway: 0,
  superheatC: 0,
  bumped: false,
  dTdt: 0,
  streamedFor: 0,
  onsetC: null,
  observedC: null,
  elapsed: 0,
});

const INITIAL = { ...SETUP, ...benchFor(SETUP), timeScale: 30, log: [] };
INITIAL.derived = derive(INITIAL);

/** A fresh charge in a clean fusion tube. Setup kept, bench forgotten: the
 *  marks belong to the liquid that was in the tube, and carrying them over
 *  would report a determination this sample never made. */
const recharge = (s, patch = {}, keepBath = true) => {
  const setup = { ...s, ...patch };
  const bench = benchFor(setup);
  const next = {
    ...setup,
    ...bench,
    bathC: keepBath ? s.bathC : AMBIENT_C,
    readingC: keepBath ? s.readingC : AMBIENT_C,
    liquidC: keepBath ? Math.min(s.bathC, AMBIENT_C + 5) : AMBIENT_C,
    burnerOn: keepBath ? s.burnerOn : false,
  };
  return { ...next, derived: derive(next) };
};

export const useBoilingPointEngine = create((set, get) => ({
  ...INITIAL,

  /** One frame. The only writer of the bench's memory. */
  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const stepped = integrate(s, dt);
    const next = { ...s, ...stepped, elapsed: s.elapsed + dt };

    const outside = next.pressureMmHg + capillaryHeadMmHg({ moles: next.moles });
    const streaming = next.chips === 'with'
      && totalVapourPressure({ moles: next.moles }, next.liquidC) >= outside;

    const wasStreaming = s.streamedFor >= STREAM_CONFIRM_SECONDS;
    next.streamedFor = streaming ? s.streamedFor + dt : 0;

    const lc = THERMOMETERS[s.thermometer].leastCount;
    const reading = Math.round(next.readingC / lc) * lc;

    /* "Rapid and continuous" is an observation, and an observer takes a few
       seconds to be sure. The bath climbs in those seconds, which is exactly
       why this reading runs high and why the manual does not use it. */
    if (next.onsetC === null && next.streamedFor >= STREAM_CONFIRM_SECONDS) next.onsetC = reading;

    /* The reading. Taken on the way down, at the instant the stream ceases and
       the liquid starts back up the capillary: vapour pressure has just fallen
       through atmospheric, which is the definition of the boiling point. */
    if (next.observedC === null && wasStreaming && !streaming) next.observedC = reading;

    set({
      ...stepped,
      elapsed: next.elapsed,
      streamedFor: next.streamedFor,
      onsetC: next.onsetC,
      observedC: next.observedC,
      derived: derive(next),
    });
  },

  /* ── Setting up ────────────────────────────────────────────────────────── */
  setLiquid: (liquidId) => set((s) => recharge(s, {
    liquidId, secondLiquidId: 'none', secondMolePercent: 0,
  }, false)),
  setPurity: (purity) => set((s) => recharge(s, { purity })),
  setChips: (chips) => set((s) => recharge(s, { chips })),
  setSecondLiquid: (secondLiquidId) => set((s) => recharge(s, { secondLiquidId })),
  setSecondPercent: (secondMolePercent) => set((s) => recharge(s, {
    secondMolePercent: Math.max(0, Math.min(80, secondMolePercent)),
  })),

  /** A different bath means emptying the tube and refilling it, so the bench
   *  goes cold. Finding that out after twenty minutes of heating is part of the
   *  lesson about choosing the bath first. */
  setBath: (bath) => set((s) => recharge(s, { bath }, false)),
  setThermometer: (thermometer) => set((s) => recharge(s, { thermometer })),

  /** The pressure in the room. Not a fudge factor: it is the other half of the
   *  measurement, and the bench will happily report a perfectly correct boiling
   *  point that disagrees with the book because the day disagrees with it. */
  setPressure: (pressureMmHg) => set((s) => {
    const next = { ...s, pressureMmHg: Math.max(600, Math.min(800, pressureMmHg)) };
    return { ...next, derived: derive(next) };
  }),

  setHeatingRate: (heatingRate) => set((s) => {
    const next = { ...s, heatingRate: Math.max(1, Math.min(12, heatingRate)) };
    return { ...next, derived: derive(next) };
  }),

  setAir: (airOpen) => set((s) => {
    const next = { ...s, airOpen };
    return { ...next, derived: derive(next) };
  }),

  /** Lighting and — the decision that matters — taking the flame away. */
  toggleBurner: () => set((s) => {
    const next = { ...s, burnerOn: !s.burnerOn };
    return { ...next, derived: derive(next) };
  }),

  freshCharge: () => set((s) => recharge(s)),
  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The notebook ──────────────────────────────────────────────────────── */

  /** Commit the trial, in the columns the published experiment defines. A
   *  boiling point is recorded with its pressure or it is not recorded. */
  record: () => set((s) => {
    const d = s.derived;
    return {
      log: [...s.log, {
        id: `${Date.now()}-${s.log.length}`,
        trial: s.log.length + 1,
        liquid: d.liquid.label,
        purity: s.purity,
        mixedWith: s.secondLiquidId !== 'none' && s.secondMolePercent > 0
          ? `${LIQUIDS[s.secondLiquidId].label} ${s.secondMolePercent}%` : '—',
        chips: s.chips === 'with' ? 'capillary' : 'none',
        pressureMmHg: s.pressureMmHg,
        onsetC: s.onsetC,
        observedC: s.observedC,
        correctedC: d.correctedC === null ? null : Number(d.correctedC.toFixed(1)),
        literatureC: Number(d.standardPointC.toFixed(1)),
        verdict: s.bumped ? 'bumped — discard'
          : s.observedC === null ? 'not observed'
            : Math.abs(d.correctedC - d.standardPointC) <= 1.5 ? 'agrees with the book'
              : 'differs — impure or misread',
      }],
    };
  }),

  clearLog: () => set({ log: [] }),

  reset: () => set((s) => {
    const next = { ...INITIAL, log: s.log, timeScale: s.timeScale };
    return { ...next, derived: derive(next) };
  }),
}));

/* Selectors return primitives or stable references, never a fresh object:
   zustand reads through useSyncExternalStore, which compares the snapshot by
   identity, and a selector that builds `{ a, b }` re-renders until React gives
   up with "maximum update depth exceeded". */
export const selectDerived = (s) => s.derived;
export const selectStatus = (s) => s.derived.status;
export const selectLog = (s) => s.log;
export const selectOnset = (s) => s.onsetC;
export const selectObserved = (s) => s.observedC;
export const selectBurner = (s) => s.burnerOn;
