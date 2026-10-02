/**
 * useChemistryEngine — the React-facing store.
 *
 * Thin on purpose. All the chemistry is in physics.js, which knows nothing about
 * React, three or zustand; this file only holds what the student has chosen,
 * advances the integrated state one frame at a time, and republishes the derived
 * state for the beaker and the HUD to read. Keeping the two apart is what lets
 * the physics be unit tested against Freundlich's measured coagulation
 * concentrations without a browser in the room (see verify-physics.mjs).
 *
 * There are exactly two kinds of state here:
 *
 *   CHOSEN     solId, electrolyteId, concentration_mM, temperatureK, shearRate_s
 *              — the student's hands on the bench.
 *   INTEGRATED clusterCount, settled, elapsedTime
 *              — the beaker's memory. Only integrate() writes these, and it
 *              writes them from the previous value, so the simulation has real
 *              history: you cannot reach a coagulated beaker by moving a slider,
 *              only by adding the electrolyte and waiting.
 *
 * Everything else the UI shows is derived, every frame, from those two. Nothing
 * is scripted; there is no table of outcomes anywhere in this project.
 */
import { create } from 'zustand';
import { derive, integrate } from './physics.js';

export * from './physics.js';

const INITIAL = {
  solId: 'ferricHydroxide',
  electrolyteId: 'NaCl',
  concentration_mM: 0,
  temperatureK: 298.15,
  shearRate_s: 0,        // stirring, s⁻¹. 0 = left standing.
  clusterCount: 1,       // n/N₀: 1 = fully dispersed, → 0 = one lump
  settled: 0,            // fraction of the column that has fallen out
  elapsedTime: 0,
  running: false,
  timeScale: 1,
  log: [],
};

/** A fresh flask: chosen state kept, memory wiped. Anything that changes what is
 *  in the beaker must go through this, or the reading would describe a mixture
 *  the student never made. */
const fresh = (s, patch) => {
  const next = { ...s, ...patch, clusterCount: 1, settled: 0, elapsedTime: 0, running: false };
  return { ...next, derived: derive(next) };
};

export const useChemistryEngine = create((set, get) => ({
  ...INITIAL,
  derived: derive(INITIAL),

  /**
   * One frame. Called from the render loop, so it allocates one object and does
   * no branching on anything but state.
   *
   * dt is clamped before it is scaled: a dropped frame or a backgrounded tab
   * hands you a half-second dt, and the aggregation ODE is quadratic in n — one
   * huge step would flocculate the beaker in a single frame and the student would
   * see an answer they did not earn. integrate() sub-steps internally too.
   */
  tick: (dtRaw) => {
    const s = get();
    if (!s.running) return;
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const { clusterCount, settled } = integrate(s, dt);
    const elapsedTime = s.elapsedTime + dt;
    const next = { ...s, clusterCount, settled, elapsedTime };
    set({ clusterCount, settled, elapsedTime, derived: derive(next) });
  },

  setSol: (solId) => set((s) => fresh(s, { solId, concentration_mM: 0 })),
  setElectrolyte: (electrolyteId) => set((s) => fresh(s, { electrolyteId, concentration_mM: 0 })),

  /** The slider. Moving it does not start the clock — adding the electrolyte
   *  does, which is the order of operations at a real bench. Redosing a beaker
   *  that has already begun to coagulate is not a thing you can undo, so the
   *  flask is replaced. */
  setConcentration: (concentration_mM) =>
    set((s) => fresh(s, { concentration_mM: Math.max(0, concentration_mM) })),

  /** Commit the dose and start timing. */
  addElectrolyte: () => set((s) => {
    const next = { ...s, clusterCount: 1, settled: 0, elapsedTime: 0, running: true };
    return { ...next, derived: derive(next) };
  }),

  /** Stirring. Changes the collision kernel from Brownian to shear-driven and
   *  sets the floc size shear can sustain, so it may be changed mid-run — that
   *  is exactly what a glass rod does. */
  setShear: (shearRate_s) => set((s) => {
    const next = { ...s, shearRate_s: Math.max(0, shearRate_s) };
    return { ...next, derived: derive(next) };
  }),

  setTemperature: (temperatureK) => set((s) => fresh(s, { temperatureK })),

  setTimeScale: (timeScale) => set({ timeScale }),
  pause: () => set({ running: false }),
  resume: () => set({ running: true }),

  /** Write the current state into the observation table — the student's own
   *  record, taken at a moment they chose, exactly as in a real practical. The
   *  row records what was done and what was seen; it does not record a verdict. */
  record: () => set((s) => {
    const d = s.derived;
    return {
      log: [...s.log, {
        id: `${Date.now()}-${s.log.length}`,
        sol: d.sol.formula,
        solCharge: d.sol.charge > 0 ? 'positive' : 'negative',
        electrolyte: d.electrolyte.formula,
        counterIon: d.ion ? d.ion.symbol : '—',
        valency: d.ion ? Math.abs(d.ion.z) : 0,
        added_mM: Number(s.concentration_mM.toFixed(3)),
        counterIon_mM: Number(d.ionConcentration_mM.toPrecision(3)),
        ccc_mM: Number.isFinite(d.ccc_mM) ? Number(d.ccc_mM.toPrecision(3)) : null,
        stirring_s: Number(s.shearRate_s.toFixed(0)),
        time_s: Number(s.elapsedTime.toFixed(1)),
        coagulated_pct: Number(d.coagulationPercentage.toFixed(1)),
        clusterRadius_nm: Number((d.clusterRadius * 1e9).toPrecision(3)),
        tyndallGain: Number(d.tyndallGain.toPrecision(3)),
        observation: d.status.title,
      }],
    };
  }),

  clearLog: () => set({ log: [] }),

  /** Wash the beaker. The sol stays on the bench, the notebook stays written. */
  reset: () => set((s) => {
    const next = { ...INITIAL, solId: s.solId, temperatureK: s.temperatureK, log: s.log };
    return { ...next, derived: derive(next) };
  }),
}));

/* Selectors, so components subscribe to the narrowest slice they need and a
   slider drag does not re-render the observation table. The 3D scene subscribes
   to none of them: it reads getState() inside useFrame, so sixty derivations a
   second cost React nothing. */
export const selectDerived = (s) => s.derived;
export const selectCoagulation = (s) => s.derived.coagulationPercentage;
export const selectStatus = (s) => s.derived.status;
export const selectLog = (s) => s.log;
export const selectRunning = (s) => s.running;
