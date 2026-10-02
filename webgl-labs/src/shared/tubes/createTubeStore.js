/**
 * createTubeStore — the bench every "add this to that and see what happens"
 * practical stands on: a rack of test tubes, a shelf of dropper bottles, a few
 * baths to put a tube in, and a notebook.
 *
 * The store knows how a bench works and nothing about chemistry. The chemistry
 * is four pure functions the lab supplies:
 *
 *   initial(tubeDef)                      → content       what is in a tube to begin with
 *   add(content, reagent, mL, ctx)        → content'      what a dose of a reagent does
 *   observe(content, tempC, previousObs)  → obs           what can be SEEN and MEASURED (the previous
 *                                                         observation is a warm start for the solver)
 *   instant(before, after, reagent, mL)   → info?         the state in the instant of mixing
 *   row({ tube, obs, ctx }) / analyse(log, ctx)           the notebook and what it says
 *
 * `obs` is what the scene draws and the instruments read:
 *   { colour: {linear, srgb, hex}, scatter?, scatterColour?, precip?, bed?, settleTau?, gas?, …numbers }
 * `precip` is the suspension just after a dose and `bed` the layer it settles into,
 * over `settleTau` seconds of the store's clock (default 45; a heavy crystal is a few).
 *
 * A reagent is usually a dropper (0.05 mL a drop); `unit: 'pinch'` with `mlPer: 0` is a
 * solid, and `cfg.add` is told how many units were taken as `ctx.units`.
 *
 *   settle(content, tempC, dt, obs, drift) → content   what time does to an open tube (a gas leaving it); must
 *                                                         return the SAME object when nothing is worth re-solving, and
 *                                                         may keep its running totals in `drift`, which is its own
 *   initial(tubeDef, ctx)                                 `ctx` is the lab's free-form context (`setCtx`), e.g. which bottle
 *
 * Instrument settings that are not part of a tube — a wavelength, a cell — are `cfg.options`:
 * `{ cell: { default: '1', values: ['1', '0.1'] } }` makes `s.opts.cell` and `setCell(v)`.
 *
 * Time is the store's: a tube in a bath relaxes towards the bath's temperature
 * with its own time constant, and the observation follows the temperature —
 * so a hot bath does not change a colour, it starts to.
 */
import { create } from 'zustand';

export const DROP_ML = 0.05;

export function createTubeStore(cfg) {
  const roomC = cfg.roomC ?? 25;
  const baths = cfg.baths ?? { air: { T: 'room', tau: 120 } };

  const makeTube = (def, ctx = cfg.ctx ?? {}) => {
    const content = cfg.initial(def, ctx);
    return { id: def.id, label: def.label, content, tempC: roomC, bath: 'air', doses: {}, last: null, doseAt: -1e6, gasAt: -1e6, drift: { CO2: 0, NH3: 0 }, obs: cfg.observe(content, roomC), obsT: roomC };
  };
  const INITIAL = (ctx = cfg.ctx ?? {}) => ({
    ctx, tubes: cfg.tubes.map((d) => makeTube(d, ctx)), active: cfg.tubes[0].id, reagent: cfg.reagents[0].id, drops: 1, timeScale: 1, elapsed: 0, doseSeq: 0, lastDose: null, log: [],
    opts: Object.fromEntries(Object.entries(cfg.options ?? {}).map(([k, o]) => [k, o.default])),
    analysis: cfg.analyse([], {}),
  });
  const bathT = (tube) => { const b = baths[tube.bath] ?? baths.air; return b.T === 'room' ? roomC : b.T; };
  const maxUnits = (id) => cfg.reagents.find((r) => r.id === id)?.maxUnits ?? 20;
  const setTube = (s, id, fn) => s.tubes.map((t) => (t.id === id ? fn(t) : t));

  return create((set, get) => ({
    ...INITIAL(),

    tick: (dtRaw) => {
      const s = get();
      const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
      let moved = false;
      const tubes = s.tubes.map((t0) => {
        let t = t0;
        const target = bathT(t); const b = baths[t.bath] ?? baths.air;
        if (t.tempC !== target || t.obsT !== target) {
          moved = true;
          const settling = Math.abs(target - t.tempC) < 0.02;
          const tempC = settling ? target : t.tempC + (target - t.tempC) * (1 - Math.exp(-dt / b.tau));
          /* The observation is only re-worked when the temperature has moved enough to matter — and once more, exactly, when it arrives. */
          t = Math.abs(tempC - t.obsT) > 0.15 || (settling && tempC !== t.obsT) ? { ...t, tempC, obs: cfg.observe(t.content, tempC, t.obs), obsT: tempC } : { ...t, tempC };
        }
        if (cfg.settle) {
          const content = cfg.settle(t.content, t.tempC, dt, t.obs, t.drift);
          if (content !== t.content) {
            moved = true;
            t = { ...t, content, obs: cfg.observe(content, t.tempC, t.obs), obsT: t.tempC, gasAt: s.elapsed };
          }
        }
        return t;
      });
      set(moved ? { tubes, elapsed: s.elapsed + dt } : { elapsed: s.elapsed + dt });
    },

    select: (id) => set((s) => (s.tubes.some((t) => t.id === id) ? { active: id } : s)),

    setReagent: (reagent) => set((s) => (cfg.reagents.some((r) => r.id === reagent) ? { reagent, drops: Math.min(s.drops, maxUnits(reagent)) } : s)),
    setDrops: (drops) => set((s) => ({ drops: Math.min(maxUnits(s.reagent), Math.max(1, Math.round(drops))) })),
    /** The reagent and the number of drops picked on the panel, into the active tube. */
    addPicked: () => get().dose(get().reagent, get().drops),

    /** `drops` units (drops, or pinches for a solid) of a reagent into the active tube. */
    dose: (reagentId, drops = 1) => set((s) => {
      const reagent = cfg.reagents.find((r) => r.id === reagentId);
      if (!reagent || drops <= 0) return s;
      const mL = drops * (reagent.mlPer ?? DROP_ML);
      const tubes = setTube(s, s.active, (t) => {
        const content = cfg.add(t.content, reagent, mL, { tempC: t.tempC, obs: t.obs, units: drops, lab: s.ctx });
        const info = cfg.instant ? cfg.instant({ content: t.content, obs: t.obs }, content, reagent, mL, t.tempC, drops) : null;
        return {
          ...t, content, obs: cfg.observe(content, t.tempC, t.obs), obsT: t.tempC, doseAt: s.elapsed, gasAt: s.elapsed, drift: { CO2: 0, NH3: 0 },
          doses: { ...t.doses, [reagentId]: (t.doses[reagentId] ?? 0) + drops }, last: { reagent: reagentId, mL, units: drops, info },
        };
      });
      return { tubes, doseSeq: s.doseSeq + 1, lastDose: { id: reagentId, tube: s.active, drops } };
    }),

    setBath: (bath) => set((s) => (baths[bath] ? { tubes: setTube(s, s.active, (t) => (t.bath === bath ? t : { ...t, bath, last: null })) } : s)),

    /** A clean tube made up as it was at the start. */
    fresh: (id) => set((s) => {
      const def = cfg.tubes.find((t) => t.id === (id ?? s.active));
      return def ? { tubes: s.tubes.map((t) => (t.id === def.id ? makeTube(def, s.ctx) : t)) } : s;
    }),

    /** Change what the lab's tubes start from (which unknown is on the bench): every tube is made up afresh. */
    setCtx: (patch) => set((s) => {
      const ctx = { ...s.ctx, ...patch };
      return { ctx, tubes: cfg.tubes.map((d) => makeTube(d, ctx)), doseSeq: s.doseSeq + 1, lastDose: null };
    }),

    setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
    setTimeScale: (timeScale) => set({ timeScale }),

    record: () => set((s) => {
      const tube = s.tubes.find((t) => t.id === s.active);
      const row = { id: `${s.log.length}`, trial: s.log.length + 1, ...cfg.row({ tube, obs: tube.obs, ctx: { log: s.log, tubes: s.tubes, opts: s.opts, lab: s.ctx } }) };
      const log = [...s.log, row];
      return { log, analysis: cfg.analyse(log, { tubes: s.tubes, opts: s.opts }) };
    }),
    clearLog: () => set((s) => ({ log: [], analysis: cfg.analyse([], { tubes: s.tubes }) })),
    reset: () => set((s) => ({ ...INITIAL(s.ctx), log: s.log, analysis: s.analysis, timeScale: s.timeScale, opts: s.opts })),
    ...Object.fromEntries(Object.entries(cfg.options ?? {}).map(([key, o]) => [
      `set${key[0].toUpperCase()}${key.slice(1)}`, (v) => set((s) => (o.values.includes(String(v)) ? { opts: { ...s.opts, [key]: String(v) } } : s)),
    ])),
  }));
}
