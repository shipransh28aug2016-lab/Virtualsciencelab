/**
 * useWeighEngine — the store for XI-CHE-E01 (and the shape of every bench that weighs).
 *
 * Three electronic balances and a mechanical one stand on the bench; each keeps its
 * own tare, calibration and drift, and runs whether or not it is the one in use.
 * One object at a time stands on the pan of the balance in use. Time is the
 * store's: warm-up, settling, creep and cooling all follow the clock, and the
 * clock speed is the student's.
 */
import { create } from 'zustand';
import {
  BALANCES, newBalance, stepBalance, readout, tare as tareBalance, zeroTare, setTilt, setShield as shieldBalance, shock, calibrate as calibrateBalance,
} from '../../../../../shared/balance/balance.js';
import { newBeam, stepBeam, setRider as setBeamRider, setZeroScrew as setBeamScrew, beamReading, riderTotal } from '../../../../../shared/balance/beam.js';
import {
  freshObjects, panItems, stepObjects, addSample, tipOut, spatulaPortion, row, analyse, massOf, sampleOf, CATALOGUE,
} from './weigh.js';

const SEED = 11;
const TILT0 = { top2: BALANCES.top2.tilt0, top3: BALANCES.top3.tilt0, ana4: BALANCES.ana4.tilt0 };

const makeBals = () => ({ top2: newBalance('top2', { seed: SEED }), top3: newBalance('top3', { seed: SEED + 1 }), ana4: newBalance('ana4', { seed: SEED + 2 }) });

const BENCH = () => ({
  balanceId: 'top2', bals: makeBals(), beam: newBeam(), objects: freshObjects(), pan: [], picked: 'salt', spatula: 0.3, adds: 0, tips: 0,
  feet: { ...TILT0 }, acts: 0, elapsed: 0, timeScale: 1, trace: [], traceSeries: [{ name: 'display', points: [], connect: true }], traceAt: 0, message: null, messageUntil: 0,
});

/** What the instrument in use is showing, derived from the rest. */
function view(s) {
  const reading = s.balanceId === 'beam' ? beamReading(s.beam) : readout(s.bals[s.balanceId]);
  /* A balance object is always there for a getter to read: the beam has none of its own, so the last electronic one stands in (nothing shown from it). */
  return { balanceId: s.balanceId, bal: s.bals[s.balanceId] ?? s.bals.top2, beam: s.beam, reading };
}
const withView = (s) => ({ ...s, display: view(s) });

const INITIAL = withView({ ...BENCH(), log: [], analysis: analyse([]) });

/* A message stays for eight seconds of the student's time, whatever the clock is doing. */
const say = (s, text, tone = 'warn') => ({ message: { text, tone }, messageUntil: s.elapsed + 8 * s.timeScale });

/** Every action the student takes counts: a message belongs to the action that raised it and goes at the next one. */
const counting = (fn) => (s) => {
  const r = fn(s);
  if (r === s) return r;
  const fresh = r.message && r.message !== s.message;
  return { ...r, acts: s.acts + 1, ...(fresh ? { message: { ...r.message, at: s.acts + 1 } } : { message: null }) };
};

export const useWeighEngine = create((set0, get) => {
  const set = (fn) => set0(typeof fn === 'function' ? counting(fn) : fn);
  return ({
  ...INITIAL,

  tick: (dtRaw) => {
    const s = get();
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const objects = stepObjects(s.objects, s.pan, dt);
    const items = panItems(objects, s.pan);
    const bals = {};
    for (const id of Object.keys(s.bals)) bals[id] = stepBalance(s.bals[id], id === s.balanceId ? items : [], dt);
    const beam = stepBeam(s.beam, s.balanceId === 'beam' ? items : [], dt);
    const elapsed = s.elapsed + dt;
    const next = { ...s, objects, bals, beam, elapsed };
    const display = view(next);
    /* The trace is what the display has been doing: a point every quarter-second of the bench's own clock. */
    let { trace, traceAt, traceSeries } = s;
    if (elapsed - traceAt >= 0.25) {
      traceAt = elapsed;
      const y = s.balanceId === 'beam' ? display.beam.theta : display.reading.value;
      trace = [...trace, [Number(elapsed.toFixed(2)), y]].slice(-160);
      traceSeries = [{ name: 'display', points: trace, connect: true }];
    }
    set({ objects, bals, beam, elapsed, display, trace, traceAt, traceSeries, ...(s.message && elapsed > s.messageUntil ? { message: null } : null) });
  },

  setBalance: (balanceId) => set((s) => (s.balanceId === balanceId ? s : withView({ ...s, balanceId, trace: [], traceSeries: [{ name: 'display', points: [], connect: true }], traceAt: s.elapsed }))),
  pick: (picked) => set((s) => (CATALOGUE[picked] ? { picked } : s)),

  /** Put the picked object on the pan — gently, or dropped (which rings). */
  place: (how = 'gentle') => set((s) => {
    const o = s.objects[s.picked];
    if (!o) return s;
    const base = { ...s, pan: [s.picked] };
    if (s.balanceId !== 'beam' && how === 'drop') {
      const m = massOf(o);
      return withView({ ...base, bals: { ...s.bals, [s.balanceId]: shock(s.bals[s.balanceId], m, 0.3) }, ...say(s, 'Dropped on the pan: it will ring for several seconds.') });
    }
    return withView(base);
  }),
  drop: () => get().place('drop'),
  remove: () => set((s) => withView({ ...s, pan: [] })),

  tare: () => set((s) => (s.balanceId === 'beam' ? s : withView({ ...s, bals: { ...s.bals, [s.balanceId]: tareBalance(s.bals[s.balanceId]) } }))),
  zero: () => set((s) => (s.balanceId === 'beam' ? s : withView({ ...s, bals: { ...s.bals, [s.balanceId]: zeroTare(s.bals[s.balanceId]) } }))),

  setShield: (state) => set((s) => (s.balanceId === 'beam' ? s : withView({ ...s, bals: { ...s.bals, [s.balanceId]: shieldBalance(s.bals[s.balanceId], state) } }))),
  setLid: (on) => set((s) => {
    const o = s.objects[s.picked];
    if (!o?.lid) return s;
    return withView({ ...s, objects: { ...s.objects, [s.picked]: { ...o, lidOn: on === 'on' || on === true } } });
  }),
  setFeet: (deg) => set((s) => {
    if (s.balanceId === 'beam') return s;
    const feet = { ...s.feet, [s.balanceId]: Math.max(-2, Math.min(2, Math.round(deg * 20) / 20)) };
    return withView({ ...s, feet, bals: { ...s.bals, [s.balanceId]: setTilt(s.bals[s.balanceId], Math.abs(feet[s.balanceId])) } });
  }),

  calibrate: () => set((s) => {
    if (s.balanceId === 'beam') return s;
    const { b, ok, why } = calibrateBalance(s.bals[s.balanceId], { weightG: 100, items: panItems(s.objects, s.pan) });
    return withView({ ...s, bals: { ...s.bals, [s.balanceId]: b }, ...say(s, ok ? 'Calibrated against the 100 g weight.' : why, ok ? 'ok' : 'warn') });
  }),

  /* The fine beam, the tens, the hundreds, and the screw that sets the zero. */
  setRider: (beamId, v) => set((s) => withView({ ...s, beam: setBeamRider(s.beam, beamId, Number(v)) })),
  setHundreds: (v) => get().setRider('h', v),
  setTens: (v) => get().setRider('t', v),
  setUnits: (v) => get().setRider('u', v),
  setZeroScrew: (g) => set((s) => withView({ ...s, beam: setBeamScrew(s.beam, Number(g)) })),

  /** Back in the oven, and out again: the picked crucible is 45 K above the room. */
  heat: () => set((s) => (s.objects[s.picked]?.id === 'crucible' ? withView({ ...s, objects: { ...s.objects, crucible: { ...s.objects.crucible, dT: 45 } } }) : s)),

  setSpatula: (g) => set({ spatula: Math.max(0.01, Math.min(1, Math.round(g * 100) / 100)) }),
  /** A spatula-full of sodium chloride into the container on the pan. */
  addSample: () => set((s) => {
    const id = s.pan[0]; const o = id && s.objects[id];
    if (!o || !o.container) return withView({ ...s, ...say(s, 'Put a container on the pan to weigh the salt into.') });
    if (o.lid && o.lidOn) return withView({ ...s, ...say(s, 'The lid is on.') });
    if (s.balanceId !== 'beam' && BALANCES[s.balanceId].shield && s.bals[s.balanceId].shield === 'closed') return withView({ ...s, ...say(s, 'The draft shield is shut: open it to add the sample.') });
    const g = spatulaPortion(s.spatula, SEED, s.adds);
    return withView({ ...s, adds: s.adds + 1, objects: { ...s.objects, [id]: addSample(o, g) } });
  }),
  /** Tip the picked bottle out into the beaker: weighing by difference. */
  transfer: () => set((s) => {
    const from = s.picked;
    if (sampleOf(s.objects[from]) <= 0 || !s.objects[from].container) return withView({ ...s, ...say(s, 'There is nothing in it to tip out.') });
    if (s.pan.includes(from)) return withView({ ...s, ...say(s, 'Take it off the pan first: you tip a bottle out over the beaker, not over the balance.') });
    if (s.objects[from].lid && s.objects[from].lidOn) return withView({ ...s, ...say(s, 'Take the lid off first.') });
    const { objects } = tipOut(s.objects, from, SEED, s.tips);
    return withView({ ...s, tips: s.tips + 1, objects });
  }),

  record: () => set((s) => {
    const id = s.pan[0];
    const r = {
      id: `${s.log.length}`, ...row({ balanceId: s.balanceId, objectId: id ?? null, objects: s.objects, pan: s.pan, reading: s.display.reading, bal: s.display.bal, beam: s.beam, trial: s.log.length + 1 }),
    };
    if (!id) r.object = 'empty pan';
    const log = [...s.log, r];
    return { log, analysis: analyse(log) };
  }),
  clearLog: () => set({ log: [], analysis: analyse([]) }),

  setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
  setTimeScale: (timeScale) => set({ timeScale }),

  /** A fresh bench: the objects as they were, the balances as found. The notebook is the student's. */
  reset: () => set((s) => withView({ ...s, ...BENCH(), timeScale: s.timeScale, log: s.log, analysis: s.analysis })),
  });
});

export { riderTotal };
