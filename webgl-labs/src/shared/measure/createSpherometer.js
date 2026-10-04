/**
 * createSpherometer — the store of a spherometer bench. The state is physical: which instrument, what it stands on, where the
 * screw is, which way it was last turned, where the eye looks, what the legs have printed on the paper. What the scales then
 * say, whether the tip touches, and whether the instrument rocks all follow from it (spherometer.js, instruments.js). The student
 * does the rest: the pitch and the least count, the leg-to-leg distances from the ruler, the reading on plane glass, the reading
 * on the surface, the sagitta, the radius.
 */
import { create } from 'zustand';
import { SPHEROMETERS, spheroDisplay } from './instruments.js';
import { SURFACES, BODIES, contactReading, legMean, legSides, rulerPositions, radiusFrom, sagitta } from './spherometer.js';

const EYE = { left: -0.5, centre: 0, right: 0.5 };
export const MAX_TRAVEL = 14;
const PAIRS = ['ab', 'bc', 'ca'];

export function viewOfSphero(s) {
  const sp = SPHEROMETERS[s.instrument]; const surf = SURFACES[s.surface];
  const c = contactReading(s.instrument, surf);
  const lift = Math.max(0, s.y - c);
  const shift = (s.side * sp.backlash) / 2;
  const disp = spheroDisplay(sp, s.y + shift, { parallax: EYE[s.eye] ?? 0 });
  return { sp, surf, c, lift, shift, disp, state: lift > 0.0015 ? 'rocks' : 'firm', clear: Math.max(0, c - s.y) };
}

export const majorOf = (v) => v.disp.turns * v.sp.pitch;
export const minorOf = (v) => v.disp.disc;

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)));
const r4 = (x) => Number(x.toFixed(4));

/** What the notebook comes to: the mean reading on plane glass, the mean leg separation, and for each surface its sagitta and radius. */
export function analyse(log) {
  const refs = log.filter((r) => r.kind === 'ref'); const legs = log.filter((r) => r.kind === 'leg'); const reads = log.filter((r) => r.kind === 'contact');
  const ref = refs.length ? mean(refs.map((r) => r.observed)) : null;
  const l = legs.length ? mean(legs.map((r) => r.length)) : null;
  const summary = [];
  const eL = l === null ? 0 : Math.hypot(0.7 / Math.sqrt(legs.length), sd(legs.map((r) => r.length)) / Math.sqrt(legs.length));
  if (ref !== null) summary.push({ label: 'Reading on plane glass, mean of the references', value: ref, unit: 'mm', dp: 3, err: Math.hypot(Math.max(...refs.map((r) => r.instLc)), sd(refs.map((r) => r.observed)) / Math.sqrt(refs.length)), actual: BODIES[refs[0].instrument].Z0 });
  if (l !== null) summary.push({ label: 'Distance between the legs, l (mean of the sides measured)', value: l, unit: 'mm', dp: 2, err: eL, actual: legMean(legs[0].instrument) });
  const bySurface = {};
  for (const r of reads) (bySurface[r.surface] ??= []).push(r);
  for (const [id, rows] of Object.entries(bySurface)) {
    if (ref === null) continue;
    const hs = rows.map((r) => Math.abs(r.observed - ref));
    const h = mean(hs); const lc = Math.max(...rows.map((r) => r.instLc)); const eH = Math.hypot(lc, sd(hs) / Math.sqrt(hs.length));
    const convex = mean(rows.map((r) => r.observed)) < ref;
    const surf = SURFACES[id];
    summary.push({ label: `Sagitta h of the ${surf.short}`, value: h, unit: 'mm', dp: 3, err: eH, actual: Math.abs(contactReading(rows[0].instrument, surf) - BODIES[rows[0].instrument].Z0) });
    if (l !== null && h > 0) {
      const { main, correction, R } = radiusFrom(l, h);
      const eR = R * (2 * (eL / l) + eH / h);
      summary.push({ label: 'Main term, l²/6h', value: main / 10, unit: 'cm', dp: 2 });
      summary.push({ label: 'Correction term, h/2', value: correction / 10, unit: 'cm', dp: 3 });
      summary.push({ label: `Radius of curvature R of the ${surf.short} (${convex ? 'convex, the screw came up' : 'concave, the screw went down'})`, value: R / 10, unit: 'cm', dp: 2, err: eR / 10, actual: surf.R / 10 });
    }
  }
  const notes = {
    misread: log.filter((r) => r.misread).length, lcWrong: log.filter((r) => r.lcWrong).length,
    clear: reads.concat(refs).filter((r) => r.clear > 0.03).length, pushed: reads.concat(refs).filter((r) => r.lift > 0.03).length,
  };
  const series = [];
  if (reads.length && ref !== null) series.push({ name: 'sagitta h / mm', points: reads.map((r, i) => [i + 1, Number(Math.abs(r.observed - ref).toFixed(3))]), connect: true });
  return { summary, notes, n: reads.length, ref, l, series };
}

const INITIAL = () => ({
  instrument: 'sp100', surface: 'plane', y: 0, side: -1, eye: 'centre',
  lcEntry: '', pitchEntry: '', nEntry: '', entry: { major: 0, minor: 0 },
  paper: false, pair: 'ab', rulerA: 0, rulerB: 0, pressSeq: 0,
  log: [], analysis: { summary: [], notes: {}, n: 0, ref: null, l: null, series: [] }, message: null, acts: 0, revealed: false,
});

export function createSpherometer() {
  return create((set, get) => {
    const act = (patch, m = null) => set((s) => ({ ...patch, acts: s.acts + 1, message: m ? { ...m, at: s.acts + 1 } : null }));
    const move = (to) => set((s) => {
      const y = Math.max(0, Math.min(MAX_TRAVEL, to)); const dir = Math.sign(y - s.y);
      return { y, side: dir === 0 ? s.side : dir, acts: s.acts + 1, message: null };
    });
    const readingRow = (s, kind) => {
      const v = viewOfSphero(s); const sp = v.sp;
      const lc = Number(s.lcEntry) || sp.lc; const lcWrong = Math.abs(lc - sp.lc) > 1e-9;
      const observed = s.entry.major + s.entry.minor * lc;
      const misread = s.entry.major !== majorOf(v) || s.entry.minor !== minorOf(v);
      const refs = s.log.filter((r) => r.kind === 'ref');
      const h = kind === 'contact' && refs.length ? Math.abs(observed - mean(refs.map((r) => r.observed))) : null;
      const row = {
        id: `${s.log.length}`, trial: s.log.length + 1, kind, surface: s.surface, instrument: s.instrument, label: kind === 'ref' ? 'plane glass (reference)' : SURFACES[s.surface].short,
        major: s.entry.major, minor: s.entry.minor, lc: Number(lc.toFixed(4)), instLc: sp.lc, observed: r4(observed), h: h === null ? null : r4(h),
        misread, lcWrong, state: v.state, lift: r4(v.lift), clear: r4(v.clear),
      };
      row.note = [misread ? 'misread' : null, lcWrong ? 'wrong L.C.' : null, v.clear > 0.03 ? 'tip clear of the surface' : null, v.lift > 0.03 ? 'pushed past contact' : null].filter(Boolean).join('; ');
      return { row, v };
    };
    return {
      ...INITIAL(),
      setInstrument: (id) => act({ instrument: id, y: 0, side: -1, lcEntry: '', pitchEntry: '', nEntry: '', entry: { major: 0, minor: 0 }, paper: false, pair: 'ab', rulerA: 0, rulerB: 0 }),
      setSurface: (id) => act({ surface: id }),
      setScrew: (v) => move(Number(v)),
      step: (n) => { const s = get(); move(s.y + n * SPHEROMETERS[s.instrument].lc); },
      turn: (n) => { const s = get(); move(s.y + n * SPHEROMETERS[s.instrument].pitch); },
      retract: () => set((s) => ({ y: 0, side: -1, acts: s.acts + 1, message: null })),
      /** A gentle press on the instrument, as the sheet says: does it stand firm on its legs, or rock? */
      press: () => set((s) => {
        const v = viewOfSphero(s);
        const m = v.state === 'rocks'
          ? { key: 'rocks', tone: 'warn', title: 'It rocks', detail: v.lift > 0.05 ? 'The tip is well down on the surface and is holding the legs up: turn back until it stands firm, then come to it again from above, one division at a time.' : 'The tip has just touched and the legs are no longer all down: this is contact. The reading now (or one division back) is the one to take.' }
          : { key: 'firm', tone: 'info', title: 'It stands firm on its three legs', detail: 'The tip is not touching: the screw can go lower.' };
        return { pressSeq: s.pressSeq + 1, acts: s.acts + 1, message: { ...m, at: s.acts + 1 } };
      }),
      setEye: (e) => act({ eye: e }),
      setLc: (v) => act({ lcEntry: v }),
      setPitch: (v) => act({ pitchEntry: v }),
      setN: (v) => act({ nEntry: v }),
      setMajor: (v) => set((s) => ({ entry: { ...s.entry, major: Number(v) } })),
      setMinor: (v) => set((s) => ({ entry: { ...s.entry, minor: Number(v) } })),

      /** The reading at which the tip just touches plane glass. */
      recordReference: () => set((s) => {
        if (s.surface !== 'plane') return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'not-plane', tone: 'warn', title: 'That is not the plane glass', detail: 'The reference reading is the one on the plane glass plate: put the spherometer on it first.' } };
        const { row } = readingRow(s, 'ref');
        const log = [...s.log, row];
        return { log, analysis: analyse(log), acts: s.acts + 1, message: { at: s.acts + 1, key: row.misread ? 'misread' : 'ref', tone: row.misread ? 'warn' : 'ok', title: row.misread ? 'Recorded — but that is not what the scales show' : `Reference reading ${row.observed.toFixed(3)} mm`, detail: row.misread ? 'Look again at the last mark the disc has uncovered and the division at the line.' : 'Take the reading on the surface now, bringing the tip down on it the same way.' } };
      }),
      /** The reading at which the tip just touches the surface under the instrument. */
      record: () => set((s) => {
        if (s.surface === 'plane') return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'is-plane', tone: 'warn', title: 'That is the plane glass', detail: 'A reading on plane glass is the reference: use “Record reference”. For the curved surface, stand the spherometer on it.' } };
        const { row } = readingRow(s, 'contact');
        const log = [...s.log, row];
        return { log, analysis: analyse(log), acts: s.acts + 1, message: row.misread ? { at: s.acts + 1, key: 'misread', tone: 'warn', title: 'Recorded — but that is not what the scales show', detail: 'Look again at the last mark the disc has uncovered and the division at the line.' } : null };
      }),

      /** The three legs pressed on a sheet of paper: three impressions, and a ruler against each side. */
      impress: () => act({ paper: true }, { key: 'impressed', tone: 'ok', title: 'The legs have left three impressions', detail: 'Lay the ruler against each pair in turn and read where the two impressions fall on it.' }),
      setPair: (p) => act({ pair: p, rulerA: 0, rulerB: 0 }),
      setRulerA: (v) => set((s) => ({ rulerA: Number(v) })),
      setRulerB: (v) => set((s) => ({ rulerB: Number(v) })),
      recordLeg: () => set((s) => {
        if (!s.paper) return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'no-paper', tone: 'warn', title: 'There are no impressions yet', detail: 'Press the three legs on the paper first.' } };
        const t = rulerPositions(s.instrument, s.pair);
        const length = s.rulerB - s.rulerA;
        const misread = Math.abs(s.rulerA - t.a) > 0.75 || Math.abs(s.rulerB - t.b) > 0.75;
        const row = { id: `${s.log.length}`, trial: s.log.length + 1, kind: 'leg', instrument: s.instrument, surface: `legs ${s.pair.toUpperCase()}`, label: `legs ${s.pair.toUpperCase()}`, a: s.rulerA, b: s.rulerB, length: r4(length), misread, note: misread ? 'misread: not where the impression is on the ruler' : '' };
        const log = [...s.log, row];
        return { log, analysis: analyse(log), acts: s.acts + 1, message: misread ? { at: s.acts + 1, key: 'leg-misread', tone: 'warn', title: 'Recorded — but the ruler does not read that', detail: `The impressions are at ${t.a.toFixed(1)} and ${t.b.toFixed(1)} mm on the ruler, to a half millimetre.` } : null };
      }),

      peek: () => viewOfSphero(get()),
      clearLog: () => set({ log: [], analysis: analyse([]) }),
      reveal: () => set((s) => (s.analysis.n >= 3 ? { revealed: true, acts: s.acts + 1 } : { acts: s.acts + 1, message: { at: s.acts + 1, key: 'reveal-early', tone: 'warn', title: 'Take at least three readings first', detail: 'The true values are shown once there is something to compare.' } })),
      reset: () => set((s) => ({ ...INITIAL(), log: s.log, analysis: s.analysis })),
    };
  });
}

export { PAIRS, SURFACES, BODIES, legSides, sagitta };
