/**
 * useTitrationEngine — the store for XI-CHE-C03.
 *
 * What the student has set up (the acid in the burette, the pipetted base, how
 * they will watch it), what they do with their hands (open the stopcock, add a
 * drop, swirl, record), and what moves on its own: titrant flowing, blending
 * into the flask, and the electrode settling.
 *
 * Titrant that has fallen is `unmixed` until the flask is swirled, so the bulk
 * — which is what the electrode and the eye see — lags the burette. The solver
 * runs when the volumes change (`world`), not on every frame of nothing.
 */
import { create } from 'zustand';
import { stepElectrode, electrodePotential } from '../../../../../shared/chem/phMeter.js';
import { relaxUnmixed } from '../../../../../shared/titration/titration.js';
import {
  computeWorld, initialReading, totalAdded, remaining, shownReading, started, agitationOf, meterReading, pHToRecord,
  notesFor, analyse, colourName, electrodeFor, DROP_ML,
} from './titrate.js';

const SETUP = {
  titrantN: 0.1, analyteMl: 20, indicator: 'universal', drops: 5, meter: 'out', stirrer: 'off', tempC: 25, flow: 0.2, timeScale: 1,
};

const BENCH = {
  r0: initialReading(0), fills: 0, delivered: 0, deliveredBefore: 0, stopcock: 'closed', unmixed: 0, swirlUntil: 0, elapsed: 0,
  E_mV: 0, Ed_mV: 0, noiseSeed: 1, pick: null, flaskNo: 1,
};

const INITIAL = { ...SETUP, ...BENCH, log: [] };
INITIAL.world = computeWorld(INITIAL);
INITIAL.analysis = analyse([], INITIAL);

const refresh = (s, patch) => {
  const next = { ...s, ...patch };
  return { ...next, world: computeWorld(next) };
};

/** Let `dv` mL out of the burette. The first thing that happens to it is that it
 *  is unmixed; a burette cannot give what it does not have. */
function deliver(s, dv) {
  const got = Math.min(dv, remaining(s));
  if (got <= 0) return s.stopcock === 'open' ? refresh(s, { stopcock: 'closed' }) : s;
  const empty = got >= remaining(s) - 1e-12;
  return refresh(s, {
    delivered: s.delivered + got, unmixed: s.unmixed + got, pick: null, stopcock: empty ? 'closed' : s.stopcock,
  });
}

const freshAnalysis = (log, s) => analyse(log.filter((r) => r.flask === s.flaskNo), s);

export const useTitrationEngine = create((set, get) => ({
  ...INITIAL,

  tick: (dtRaw) => {
    const s0 = get();
    const raw = Math.min(dtRaw, 1 / 20);
    const dt = raw * s0.timeScale;
    /* The stopcock is a hand on a tap: it runs on the clock the student lives in. */
    const s = s0.stopcock === 'open' ? deliver(s0, s0.flow * raw) : s0;
    const relaxed = relaxUnmixed(s.unmixed, dt, agitationOf(s));
    const unmixed = relaxed < 1e-6 ? 0 : relaxed;
    const moved = Math.abs(unmixed - s.unmixed) > 2e-4 || (s.unmixed > 0 && unmixed === 0);
    let next = { ...s, elapsed: s.elapsed + dt, unmixed };
    if (moved) next = { ...next, world: computeWorld(next) };
    if (next.meter === 'in' && next.world.targetE !== null) next = { ...next, ...stepElectrode(electrodeFor(), next, next.world.targetE, dt) };
    set(next);
  },

  /* ── Setting up (before the first drop) ─────────────────────────────────── */

  setTitrantN: (v) => set((s) => (started(s) ? s : refresh(s, { titrantN: Math.max(0.05, Math.min(0.2, Math.round(v * 100) / 100)) }))),
  setAnalyteMl: (v) => set((s) => (started(s) ? s : refresh(s, { analyteMl: Math.max(10, Math.min(25, Math.round(v))) }))),
  setIndicator: (indicator) => set((s) => refresh(s, { indicator, pick: null })),
  setDrops: (drops) => set((s) => refresh(s, { drops: Math.max(0, Math.min(10, Math.round(drops))), pick: null })),
  setTemp: (tempC) => set((s) => refresh(s, { tempC: Math.max(15, Math.min(40, tempC)) })),
  setMeter: (meter) => set((s) => {
    const Ed = electrodePotential(electrodeFor(), { pH: 7, tC: s.tempC });      // out of storage, at rest
    return refresh(s, meter === 'in' ? { meter, Ed_mV: Ed, E_mV: Ed } : { meter });
  }),
  setStirrer: (stirrer) => set({ stirrer }),
  setFlow: (flow) => set({ flow: Math.max(0.05, Math.min(1.5, flow)) }),
  setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The burette ────────────────────────────────────────────────────────── */

  toggleStopcock: () => set((s) => (s.stopcock === 'open' ? { stopcock: 'closed' } : remaining(s) > 0 ? { stopcock: 'open' } : s)),
  addDrop: () => set((s) => deliver(s, DROP_ML)),
  addMl: (v) => set((s) => deliver(s, v)),
  swirl: () => set((s) => ({ swirlUntil: s.elapsed + 3 })),
  /** Fill again: the new meniscus is wherever it lands, and the flask keeps what it has. */
  refill: () => set((s) => refresh(s, {
    deliveredBefore: s.deliveredBefore + s.delivered, delivered: 0, fills: s.fills + 1, r0: initialReading(s.fills + 1), stopcock: 'closed',
  })),
  /** A clean flask, a fresh pipetted portion — and the burette exactly as it was. */
  freshFlask: () => set((s) => {
    const next = refresh(s, {
      r0: s.r0 + s.delivered, delivered: 0, deliveredBefore: 0, unmixed: 0, swirlUntil: 0, stopcock: 'closed', pick: null,
      flaskNo: s.flaskNo + 1,
    });
    return { ...next, analysis: freshAnalysis(s.log, next) };
  }),

  /* ── The chart ──────────────────────────────────────────────────────────── */

  setPick: (v) => set({ pick: v === '' || v === null ? null : Number(v) }),

  /* ── The notebook ───────────────────────────────────────────────────────── */

  record: () => set((s) => {
    const pH = pHToRecord(s);
    const row = {
      id: `${s.log.length}-r`, kind: 'reading', flask: s.flaskNo, trial: s.log.filter((r) => r.kind === 'reading').length + 1,
      reading: Number(shownReading(s).toFixed(2)), added: Number((Math.round(totalAdded(s) / 0.05) * 0.05).toFixed(2)),
      colour: s.indicator === 'none' || s.drops === 0 ? '—' : colourName(s.world.colour.srgb),
      pH: pH === null || pH === undefined ? null : Number(pH.toFixed(s.meter === 'in' ? 2 : 0)),
      note: notesFor(s),
    };
    const log = [...s.log, row];
    return { log, analysis: freshAnalysis(log, s) };
  }),
  /** "The colour has changed": the titre, as the student judged it. */
  markEndpoint: () => set((s) => {
    const row = {
      id: `${s.log.length}-e`, kind: 'endpoint', flask: s.flaskNo, trial: '★',
      reading: Number(shownReading(s).toFixed(2)), added: Number((Math.round(totalAdded(s) / 0.05) * 0.05).toFixed(2)),
      colour: s.indicator === 'none' || s.drops === 0 ? '—' : colourName(s.world.colour.srgb), pH: null, note: `end point${notesFor(s) ? `; ${notesFor(s)}` : ''}`,
    };
    const log = [...s.log, row];
    return { log, analysis: freshAnalysis(log, s) };
  }),
  clearLog: () => set((s) => ({ log: [], analysis: analyse([], s) })),

  /** A fresh bench; the notebook stays, because it is the student's own. */
  reset: () => set((s) => {
    const base = { ...INITIAL, log: s.log, timeScale: s.timeScale, flaskNo: s.flaskNo + 1 };
    const next = refresh(base, {});
    return { ...next, analysis: freshAnalysis(s.log, next) };
  }),
}));

export { meterReading };
