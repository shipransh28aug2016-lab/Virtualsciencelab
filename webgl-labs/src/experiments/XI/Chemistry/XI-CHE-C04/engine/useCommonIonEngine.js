/**
 * useCommonIonEngine — the store for XI-CHE-C04.
 *
 * What is on the balance, what is in the beaker (undissolved and dissolved
 * separately: the pH follows the dissolved part), the beaker's temperature
 * (dissolving takes heat from it, the room gives it back) and the electrode
 * settling. The solver runs when the beaker's contents or temperature change.
 */
import { create } from 'zustand';
import { stepElectrode, electrodePotential } from '../../../../../shared/chem/phMeter.js';
import { pKw } from '../../../../../shared/chem/constants.js';
import {
  SYSTEM_BY_ID, systemOf, saltOf, cSalt, beakerT, computeWorld, meterReading, readingFor, workings, notesFor, analyse,
  electrodeFor, THERMAL_J_PER_K, TAU_COOL, TAU_DISSOLVE, BEAKER_ML,
} from './commonion.js';

const SETUP = {
  system: 'acetic', conc: 0.1, saltId: 'common', boat: 0, method: 'meter', drops: 5, meter: 'out', meterCal: 'calibrated',
  stirrer: 'off', tempC: 25, timeScale: 4,
};
const BENCH = { solid: 0, dissolved: 0, dT: 0, E_mV: 0, Ed_mV: 0, noiseSeed: 1, pick: null, elapsed: 0, beakerNo: 1 };

const INITIAL = { ...SETUP, ...BENCH, log: [] };
INITIAL.world = computeWorld(INITIAL);
INITIAL.analysis = analyse([]);

const refresh = (s, patch) => { const next = { ...s, ...patch }; return { ...next, world: computeWorld(next) }; };
const used = (s) => s.solid + s.dissolved > 0;
const freshBeaker = (s, patch = {}) => refresh(s, {
  solid: 0, dissolved: 0, dT: 0, boat: 0, pick: null, beakerNo: s.beakerNo + 1, saltId: s.saltId, ...patch,
});

export const useCommonIonEngine = create((set, get) => ({
  ...INITIAL,

  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    let next = { ...s, elapsed: s.elapsed + dt };
    let changed = false;
    /* Salt going into solution, first order in what is left, and taking heat with it. */
    if (s.solid > 1e-7) {
      const gone = s.solid * (1 - Math.exp(-dt / TAU_DISSOLVE[s.stirrer]));
      const salt = saltOf(s);
      next = { ...next, solid: s.solid - gone < 1e-6 ? 0 : s.solid - gone, dissolved: s.dissolved + gone, dT: s.dT - ((salt.dHsol * 1000 * (gone / salt.M)) / THERMAL_J_PER_K) };
      changed = true;
    }
    /* The room warms (or cools) the beaker back. */
    if (Math.abs(next.dT) > 1e-4) { next = { ...next, dT: next.dT * Math.exp(-dt / TAU_COOL) }; changed = true; } else if (next.dT !== 0) { next = { ...next, dT: 0 }; changed = true; }
    if (changed) next = { ...next, world: computeWorld(next) };
    if (next.method === 'meter' && next.world.targetE !== null) next = { ...next, ...stepElectrode(electrodeFor(), next, next.world.targetE, dt) };
    set(next);
  },

  /* ── Setting up the beaker (locked once salt has gone in) ───────────────── */

  setSystem: (system) => set((s) => (SYSTEM_BY_ID[system] ? freshBeaker(s, { system }) : s)),
  setConc: (v) => set((s) => (used(s) ? s : refresh(s, { conc: Math.max(0.02, Math.min(0.2, Math.round(v * 100) / 100)) }))),
  setSalt: (saltId) => set((s) => (used(s) ? s : refresh(s, { saltId }))),
  setTemp: (tempC) => set((s) => refresh(s, { tempC: Math.max(15, Math.min(40, tempC)) })),
  setStirrer: (stirrer) => set({ stirrer }),
  setMethod: (method) => set((s) => refresh(s, { method, pick: null })),
  setDrops: (drops) => set((s) => refresh(s, { drops: Math.max(0, Math.min(12, Math.round(drops))), pick: null })),
  setMeterCal: (meterCal) => set((s) => refresh(s, { meterCal })),
  setMeter: (meter) => set((s) => {
    const Ed = electrodePotential(electrodeFor(), { pH: 7, tC: beakerT(s) });
    return refresh(s, meter === 'in' ? { meter, Ed_mV: Ed, E_mV: Ed } : { meter });
  }),
  setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The balance ────────────────────────────────────────────────────────── */

  setBoat: (g) => set({ boat: Math.max(0, Math.min(5, Math.round(g * 100) / 100)) }),   // a balance reads to 0.01 g
  /** Tip what is on the balance into the beaker. */
  tip: () => set((s) => (s.boat > 0 ? refresh(s, { solid: s.solid + s.boat, boat: 0, pick: null }) : s)),
  /** A clean beaker of the same acid, to start again. */
  freshBeaker: () => set((s) => freshBeaker(s)),

  setPick: (v) => set({ pick: v === '' || v === null ? null : Number(v) }),

  /* ── The notebook ───────────────────────────────────────────────────────── */

  record: () => set((s) => {
    const pH = readingFor(s);
    if (pH === null || pH === undefined) return s;
    const dp = s.method === 'meter' ? 2 : 0;
    const shown = Number(pH.toFixed(dp));
    const w = workings(s, shown);
    const sys = systemOf(s); const salt = saltOf(s); const cs = cSalt(s);
    const row = {
      id: `${s.log.length}`, trial: s.log.length + 1, beaker: s.beakerNo,
      system: sys.formula, systemId: s.system, saltId: s.saltId, C: s.conc,
      salt: salt.formula, mass: Number(s.dissolved.toFixed(2)), cs: Number(cs.toFixed(4)), csTxt: cs.toFixed(3),
      method: { universal: 'Universal indicator', meter: 'pH meter' }[s.method] ?? 'pH paper',
      pH: shown, H: Number(w.H.toPrecision(3)),
      alpha: w.alpha === null ? null : Number((w.alpha * 100).toPrecision(3)),
      pK: w.pK === null || cs <= 1e-9 ? null : Number(w.pK.toFixed(2)),
      note: notesFor(s),
    };
    const log = [...s.log, row];
    return { log, analysis: analyse(log) };
  }),
  clearLog: () => set({ log: [], analysis: analyse([]) }),

  reset: () => set((s) => {
    const next = refresh({ ...INITIAL, log: s.log, analysis: s.analysis, timeScale: s.timeScale, beakerNo: s.beakerNo + 1 }, {});
    return next;
  }),
}));

export { meterReading, pKw, BEAKER_ML };
