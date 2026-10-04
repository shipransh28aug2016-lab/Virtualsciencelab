/**
 * createMeasure — the store of a bench where something is measured between the jaws of an instrument:
 * vernier callipers or a screw gauge. The state is physical (where the jaws are, which way the specimen
 * is turned, which way the eye looks, whether the ratchet is on); what the scales then say is worked out
 * from it (instruments.js), and what the student does with it is theirs: read the two scales, work out the
 * least count, find the zero error with the jaws closed, record a reading, correct it, take the mean.
 * The specimen is never exactly round or exactly uniform: it differs from place to place and from angle
 * to angle by amounts of the order of the least count, from a seeded function of the two.
 *
 * cfg: { code, kind: 'vernier' | 'screw', instruments, defaultInstrument, specimens, defaultSpecimen,
 *        result(groups) → [{ label, value, unit, dp, error? }], extend?(set, get) → { state, actions } }
 * specimen: { label, look, dims: { dimId: { label, mm, type: 'outer' | 'inner', ovality, drift: [4], compliance, theta0 } } }
 */
import { create } from 'zustand';
import { vernierDisplay, screwDisplay, vernierObserved, screwObserved, restGap } from './instruments.js';

const EYE = { left: -0.5, centre: 0, right: 0.5 };
export const PLACES = [1, 2, 3, 4];
export const ANGLES = [0, 45, 90, 135];

/** The width of a specimen dimension at a place and a turn: the nominal, a drift along it, and an ovality round it. */
export function widthOf(dim, place, angle) {
  const drift = dim.drift?.[place] ?? 0;
  const ov = (dim.ovality ?? 0) * Math.cos((2 * (angle - (dim.theta0 ?? 0)) * Math.PI) / 180);
  return dim.mm + drift + ov;
}

/** What the jaws are doing, from the physical state. Pure; the spec, the scene and the tests all read this. */
export function viewOf(cfg, s) {
  const inst = cfg.instruments[s.instrument];
  const spec = s.specimen === 'none' ? null : cfg.specimens[s.specimen];
  const dim = spec ? spec.dims[s.dim] ?? null : null;
  const e = inst.zeroDiv * inst.lc;
  const w = dim ? widthOf(dim, s.place, s.angle) : 0;
  const compliance = dim ? (dim.compliance ?? 0) * (cfg.kind === 'screw' && s.ratchet ? 0.03 : 1) : 0;
  let rest;
  if (!dim) rest = { gap: Math.max(0, s.opening), gripped: s.opening <= 1e-6, loose: s.opening > 1e-6, closed: true };
  else if (dim.type === 'inner') rest = { gap: Math.min(s.opening, w), gripped: s.opening >= w - 0.02 * Math.max(0.5, w), loose: s.opening < w - 0.02 * Math.max(0.5, w), inner: true };
  else rest = restGap(s.opening, w, compliance);
  /* The screw was last turned one way: a display that reads half the backlash on that side. */
  const shift = (s.side * inst.backlash) / 2;
  const opts = { parallax: EYE[s.eye] ?? 0 };
  const disp = cfg.kind === 'vernier' ? vernierDisplay(inst, rest.gap, e + shift, opts) : screwDisplay(inst, rest.gap, e + shift, opts);
  return { inst, spec, dim, w, rest, e, disp, shift };
}

export const majorOf = (cfg, d) => (cfg.kind === 'vernier' ? d.msr : d.psr);
export const minorOf = (cfg, d) => (cfg.kind === 'vernier' ? d.vsr : d.csr);
export const MAJOR_NAME = { vernier: 'M.S.R.', screw: 'P.S.R.' };
export const MINOR_NAME = { vernier: 'V.S.R.', screw: 'H.S.R.' };

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)));

export function createMeasure(cfg) {
  const kind = cfg.kind;
  const observedOf = (inst, major, minor, negative, lc) => (negative ? -((inst.n - minor) % inst.n) * lc : major + minor * lc);
  const INITIAL = () => ({
    instrument: cfg.defaultInstrument, specimen: 'none', dim: 'diameter', opening: 0, place: 0, angle: 0, eye: 'centre', ratchet: true, side: -1,
    lens: 0, lcEntry: '', pitchEntry: '', nEntry: '', entry: { major: 0, minor: 0, negative: false }, zero: { e: null, taken: false, row: null },
    log: [], analysis: { groups: {}, summary: [], notes: {}, n: 0, series: [] }, message: null, acts: 0, revealed: false,
  });

  const analyse = (log) => {
    const groups = {};
    for (const r of log) { if (r.kind !== 'reading') continue; const k = `${r.specimen}/${r.dim}`; (groups[k] ??= { specimen: r.specimen, dim: r.dim, rows: [] }).rows.push(r); }
    for (const g of Object.values(groups)) {
      const v = g.rows.map((r) => r.corrected);
      g.n = v.length; g.mean = mean(v); g.sd = sd(v); g.sem = g.n > 1 ? g.sd / Math.sqrt(g.n) : null;
      /* The limit of error of the mean: the instrument's least count (readings that all agree do not make the instrument finer) with the scatter of the readings added in quadrature. */
      g.lc = Math.max(...g.rows.map((r) => r.instLc)); g.err = Math.hypot(g.lc, g.sem ?? 0);
    }
    const readings = log.filter((r) => r.kind === 'reading');
    const notes = {
      misread: readings.filter((r) => r.misread).length, loose: readings.filter((r) => r.loose).length, squeezed: readings.filter((r) => r.squeezed > 0.004).length,
      lcWrong: readings.filter((r) => r.lcWrong).length, noZero: readings.filter((r) => !r.zeroTaken).length,
    };
    const series = Object.values(groups).map((g) => ({ name: `${g.specimen} ${g.dim}`, points: g.rows.map((r, i) => [i + 1, Number(r.corrected.toFixed(3))]), connect: true }));
    return { groups, summary: cfg.result ? cfg.result(groups) : [], notes, n: readings.length, series };
  };
  INITIAL.analyse = analyse;

  return create((set, get) => {
    const act = (patch, m = null) => set((s) => ({ ...patch, acts: s.acts + 1, message: m ? { ...m, at: s.acts + 1 } : null }));
    /** Put the screw or slide somewhere. Which way it was last moved matters: a worn screw loses a little motion on reversal. */
    const move = (to) => set((s) => {
      const opening = Math.max(0, Math.min(cfg.maxOpening ?? 80, to));
      const dir = Math.sign(opening - s.opening);
      return { opening, side: dir === 0 ? s.side : dir, acts: s.acts + 1, message: null };
    });
    const base = {
      ...INITIAL(),
      ...(cfg.extend ? cfg.extend(set, get).state : {}),

      setInstrument: (id) => act({ instrument: id, zero: { e: null, taken: false, row: null }, lcEntry: '', pitchEntry: '', nEntry: '', side: -1 }),
      setSpecimen: (id) => act({ specimen: id, dim: id === 'none' ? get().dim : Object.keys(cfg.specimens[id].dims)[0], opening: id === 'none' ? 0 : get().opening, side: id === 'none' ? -1 : get().side, entry: { major: 0, minor: 0, negative: false } }),
      setDim: (id) => act({ dim: id }),
      setOpening: (v) => move(Number(v)),
      /** Move by a number of least counts (negative to close). */
      step: (n) => { const s = get(); const inst = cfg.instruments[s.instrument]; move(s.opening + n * inst.lc); },
      /** Closing the jaws always leaves the screw or slide on its closing side, whether or not it had to move. */
      closeJaws: () => set((s) => ({ opening: 0, side: -1, acts: s.acts + 1, message: null })),
      setPlace: (p) => act({ place: Number(p) }),
      setAngle: (a) => act({ angle: Number(a) }),
      setEye: (e) => act({ eye: e }),
      setLens: (v) => act({ lens: Number(v) }),
      setPitch: (v) => act({ pitchEntry: v }),
      setN: (v) => act({ nEntry: v }),
      /** Whole turns of the screw: each advances it by the pitch. */
      turn: (n) => { const s = get(); const inst = cfg.instruments[s.instrument]; move(s.opening + n * inst.pitch); },
      setRatchet: (v) => act({ ratchet: v === true || v === 'on' }),
      setLc: (v) => act({ lcEntry: v }),
      setMajor: (v) => set((s) => ({ entry: { ...s.entry, major: Number(v) } })),
      setMinor: (v) => set((s) => ({ entry: { ...s.entry, minor: Number(v) } })),
      setNegative: (v) => set((s) => ({ entry: { ...s.entry, negative: v === 'neg' || v === true } })),

      /** With the jaws closed: the zero error, from what the student read. */
      recordZero: () => set((s) => {
        const v = viewOf(cfg, s); const inst = v.inst;
        if (!v.rest.closed || s.opening > 1e-6) return { ...s, acts: s.acts + 1, message: { at: s.acts + 1, key: 'zero-open', tone: 'warn', title: 'The jaws are not closed', detail: 'Take nothing between them and close them gently: the zero error is what the scales say then.' } };
        const lc = Number(s.lcEntry) || inst.lc;
        const obs = observedOf(inst, s.entry.major, s.entry.minor, s.entry.negative, lc);
        const truth = observedOf(inst, majorOf(cfg, v.disp), minorOf(cfg, v.disp), v.disp.negative, inst.lc);
        const row = { id: `${s.log.length}`, trial: s.log.length + 1, kind: 'zero', specimen: '—', dim: 'zero error', major: s.entry.major, minor: s.entry.minor, lc: Number(lc.toFixed(4)), observed: Number(obs.toFixed(4)), zero: '—', corrected: '—', note: obs === 0 ? 'no zero error' : `zero error ${obs > 0 ? '+' : '−'}${Math.abs(obs).toFixed(3)} mm (${s.entry.negative ? 'negative' : 'positive'})`, misread: Math.abs(obs - truth) > 1e-6 };
        const log = [...s.log, row];
        return { zero: { e: obs, taken: true, row }, log, analysis: analyse(log), acts: s.acts + 1, message: { at: s.acts + 1, key: row.misread ? 'zero-misread' : 'zero', tone: row.misread ? 'warn' : 'ok', title: `Zero error taken as ${obs >= 0 ? '+' : '−'}${Math.abs(obs).toFixed(3)} mm`, detail: row.misread ? 'That is not what the scale says: look again at which line coincides, and whether the vernier / thimble zero is left or right of the main zero.' : 'Subtract it from every reading — with its sign.' } };
      }),

      record: () => set((s) => {
        const v = viewOf(cfg, s); const inst = v.inst;
        if (!v.dim) return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'nothing', tone: 'warn', title: 'Nothing is between the jaws', detail: 'Choose a specimen and a dimension to measure; for the zero error use “Record zero error”.' } };
        const lc = Number(s.lcEntry) || inst.lc; const lcWrong = Math.abs(lc - inst.lc) > 1e-9;
        const obs = observedOf(inst, s.entry.major, s.entry.minor, s.entry.negative, lc);
        const misread = s.entry.major !== majorOf(cfg, v.disp) || s.entry.minor !== minorOf(cfg, v.disp);
        const zero = s.zero.taken ? s.zero.e : 0;
        const squeezed = v.rest.squeezed ?? 0;
        const row = {
          id: `${s.log.length}`, trial: s.log.length + 1, kind: 'reading', specimen: s.specimen, dim: s.dim, place: s.place + 1, angle: s.angle, major: s.entry.major, minor: s.entry.minor,
          lc: Number(lc.toFixed(4)), instLc: inst.lc, observed: Number(obs.toFixed(4)), zero: Number(zero.toFixed(4)), zeroTaken: s.zero.taken, corrected: Number((obs - zero).toFixed(4)), misread, loose: Boolean(v.rest.loose && !v.rest.inner), squeezed, lcWrong,
          note: [!s.zero.taken ? 'zero error not taken' : null, v.rest.loose ? 'specimen loose' : null, squeezed > 0.004 ? `specimen squeezed ${squeezed.toFixed(3)} mm` : null, misread ? 'misread' : null, lcWrong ? 'wrong L.C.' : null].filter(Boolean).join('; '),
        };
        const log = [...s.log, row];
        return {
          log, analysis: analyse(log), acts: s.acts + 1,
          message: misread ? { at: s.acts + 1, key: 'misread', tone: 'warn', title: 'Recorded — but that is not what the scales show', detail: `The scale reads ${MAJOR_NAME[kind]} ${majorOf(cfg, v.disp)}, ${MINOR_NAME[kind]} ${minorOf(cfg, v.disp)}; you entered ${s.entry.major}, ${s.entry.minor}.` } : null,
        };
      }),
      /** What the scales and the jaws are doing now, for the probe and the verifier (the interface never prints it). */
      peek: () => viewOf(cfg, get()),
      clearLog: () => set({ log: [], analysis: analyse([]) }),
      reveal: () => set((s) => (s.analysis.n >= 3 ? { revealed: true, acts: s.acts + 1 } : { acts: s.acts + 1, message: { at: s.acts + 1, key: 'reveal-early', tone: 'warn', title: 'Take at least three readings first', detail: 'The actual dimensions are shown once there is something to compare.' } })),
      reset: () => set((s) => ({ ...INITIAL(), ...(cfg.extend ? cfg.extend(set, get).state : {}), log: s.log, analysis: s.analysis })),
      ...(cfg.extend ? cfg.extend(set, get).actions : {}),
    };
    return base;
  });
}

export { mean, sd, vernierObserved, screwObserved };
