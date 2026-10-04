/**
 * XI-PHY-A03 — the volume of an irregular lamina: its thickness with a screw gauge (the shared measure kit's, with all
 * its zero error, backlash and ratchet) and its area by counting squares on graph paper (the shared lamina geometry), then
 * V = A × t with the errors added as percentages.
 *
 * Each lamina has an outline of its own and an exact area; the pencil that traces it makes the line a little outside it
 * (a blunt pencil by its width, a slanted one by the lamina's thickness times the lean); the squares the line cuts are
 * the student's to judge. What the count comes to, and how far it is from the true area, follows from the geometry.
 */
import { createMeasure } from '../../../../../shared/measure/createMeasure.js';
import { SCREWS } from '../../../../../shared/measure/instruments.js';
import { outline, polygonArea, perimeter, paperFor, tally, countingError, penDelta } from '../../../../../shared/measure/lamina.js';

const lam = (label, look, mm, drift, compliance, color) => ({
  label, look, shape: 'sheet', color,
  dims: { thickness: { label: 'Thickness', mm, type: 'outer', ovality: 0, drift, theta0: 0, compliance, hint: 'Through the lamina near its edge, between the faces' } },
});

const SPECIMENS = {
  brass: lam('Brass lamina', 'an irregular brass plate, a little over 1.6 mm thick', 1.62, [0.0, 0.012, -0.010, 0.008], 0, '#c9a24a'),
  aluminium: lam('Aluminium lamina', 'an irregular aluminium plate, about 1.2 mm', 1.21, [0.0, 0.010, -0.008, 0.006], 0.003, '#b9c2cf'),
  steel: lam('Steel lamina', 'an irregular steel plate, just under a millimetre', 0.94, [0.0, 0.008, -0.006, 0.010], 0, '#8b95a3'),
  card: lam('Card lamina', 'an irregular piece of stiff card: thin and soft', 0.62, [0.0, 0.020, -0.015, 0.010], 0.2, '#e8dcc4'),
};

const OUTLINES = {
  brass: { harmonics: [[2, 0.10, 0.4], [3, 0.07, 1.9], [5, 0.035, 0.6]], aspect: 1.12, area: 2840 },
  aluminium: { harmonics: [[2, 0.14, 1.2], [3, 0.05, 0.3], [4, 0.04, 2.4]], aspect: 0.94, area: 2510 },
  steel: { harmonics: [[2, 0.08, 2.6], [3, 0.10, 0.8], [6, 0.03, 1.1]], aspect: 1.2, area: 3120 },
  card: { harmonics: [[2, 0.12, 0.9], [4, 0.06, 0.2], [5, 0.04, 2.0]], aspect: 1.05, area: 2290 },
};

/** id → { id, poly, colour, label, areaMm2, perimeterMm } */
export const SHAPES = Object.fromEntries(Object.entries(OUTLINES).map(([id, o]) => {
  const poly = outline(o);
  return [id, { id, poly, colour: SPECIMENS[id].color, label: SPECIMENS[id].label, areaMm2: polygonArea(poly), perimeterMm: perimeter(poly) }];
}));

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => (a.length < 2 ? 0 : Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)));
const r4 = (x) => Number(x.toFixed(4));

const tableColumns = [
  ['trial', '#'], ['specimen', 'Lamina'], ['dim', 'Quantity'], ['major', 'P.S.R. / mm'], ['minor', 'C.S.R. / div'], ['lc', 'L.C. / mm'], ['observed', 'Observed / mm'], ['zero', 'Zero error / mm'], ['corrected', 'Thickness t / mm'],
  ['grid', 'Square'], ['complete', 'Complete sq.'], ['boundary', 'Boundary sq. (whole)'], ['area', 'Area A / cm²'], ['note', 'Notes'],
];

export const CFG = {
  code: 'XI-PHY-A03',
  title: 'Volume of an irregular lamina: screw gauge and graph paper',
  subtitle: 'CBSE Class XI · Measurement · the thickness to a hundredth of a millimetre, the area by counting squares, the volume from both — and which of the two limits it',
  kind: 'screw',
  instruments: SCREWS, defaultInstrument: 'sg50', instrumentShort: { sg50: '0.5 mm / 50', sg100: '1 mm / 100', sg50f: 'old 0.5 / 50' }, instrumentLabel: 'Screw gauge',
  specimens: SPECIMENS,
  maxOpening: 25, openingStep: 0.05, majorMax: 25, majorStep: 0.5,
  camera: { position: [1.5, 2.0, 7.0], fov: 34, target: [0.75, 1.1, 0], min: 1.5, max: 11, polar: [0.5, Math.PI / 2.05] },
  windowLabel: 'screw gauge', rim: 'thimble',
  tableColumns,
  /** Whichever lamina has a thickness and an area gets its volume, with the percentage errors added. */
  result: (groups, log) => {
    const out = [];
    for (const id of Object.keys(SPECIMENS)) {
      const t = groups[`${id}/thickness`];
      const rows = log.filter((r) => r.kind === 'area' && r.specimen === id);
      const name = SPECIMENS[id].label.replace(' lamina', '').toLowerCase();
      const trueA = SHAPES[id].areaMm2 / 100; const trueT = SPECIMENS[id].dims.thickness.mm;
      let A = null; let eA = 0;
      if (rows.length) {
        const areas = rows.map((r) => r.area);
        A = mean(areas); eA = Math.hypot(sd(areas) / Math.sqrt(areas.length), mean(rows.map((r) => r.err)) / Math.sqrt(areas.length));
        out.push({ label: `Area of the ${name} lamina, from the squares`, value: A, unit: 'cm²', dp: 2, err: eA, actual: trueA });
      }
      if (t) out.push({ label: `Thickness of the ${name} lamina, mean`, value: t.mean, unit: 'mm', dp: 3, err: t.err, actual: trueT });
      if (A !== null && t) out.push({ label: `Volume of the ${name} lamina, V = A × t`, value: (A * t.mean) / 10, unit: 'cm³', dp: 2, err: ((A * t.mean) / 10) * (eA / A + t.err / t.mean), actual: (trueA * trueT) / 10 });
    }
    return out;
  },
  /** The graph-paper half of the bench: the lamina laid down, the pencil, the trace, the squares judged. */
  extend: (set, get, { analyse }) => ({
    state: { grid: 'g2', layX: 0, layY: 0, layRot: 0, pencil: 'sharp', hold: 'upright', traced: null, marks: {}, brush: 'whole', paperOpen: false },
    actions: {
      setGrid: (g) => set((s) => ({ grid: g, acts: s.acts + 1, message: null })),
      setLayX: (v) => set((s) => ({ layX: Number(v), acts: s.acts + 1, message: null })),
      setLayY: (v) => set((s) => ({ layY: Number(v), acts: s.acts + 1, message: null })),
      setLayRot: (v) => set((s) => ({ layRot: Number(v), acts: s.acts + 1, message: null })),
      setPencil: (v) => set((s) => ({ pencil: v, acts: s.acts + 1, message: null })),
      setHold: (v) => set((s) => ({ hold: v, acts: s.acts + 1, message: null })),
      setBrush: (v) => set({ brush: v }),
      openPaper: () => set((s) => ({ paperOpen: true, acts: s.acts + 1, message: null })),
      closePaper: () => set({ paperOpen: false }),
      /** Draw round the lamina where it lies, with this pencil held this way, on this paper: the old line and every judgement go. */
      trace: () => set((s) => {
        const id = s.lastSpecimen; const delta = penDelta(s.pencil, s.hold, SPECIMENS[id].dims.thickness.mm);
        return {
          traced: { id, grid: s.grid, x: s.layX, y: s.layY, rot: s.layRot, delta, pencil: s.pencil, hold: s.hold }, marks: {}, acts: s.acts + 1,
          message: { at: s.acts + 1, key: 'traced', tone: 'ok', title: 'The outline is traced', detail: 'Open the graph paper: the squares wholly inside are counted for you; the squares the line cuts are for you to judge.' },
        };
      }),
      paint: (keys) => set((s) => {
        if (!s.traced) return {};
        const marks = { ...s.marks };
        for (const k of keys) { if (s.brush === 'erase') delete marks[k]; else marks[k] = s.brush; }
        return { marks, acts: s.acts + 1 };
      }),
      clearMarks: () => set((s) => ({ marks: {}, acts: s.acts + 1, message: null })),
      /** What the marks come to, as a line of the notebook. */
      recordArea: () => set((s) => {
        if (!s.traced) return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'no-trace', tone: 'warn', title: 'Nothing is traced', detail: 'Lay the lamina on the paper and trace round it first; then count the squares.' } };
        const id = s.traced.id; const { cls } = paperFor(SHAPES[id], s.traced);
        const t = tally(cls, s.marks);
        const g = cls.g;
        const err = countingError(t.boundary, g);
        const note = [
          t.unjudged ? `${t.unjudged} boundary squares not judged` : null, t.stray ? `${t.stray} marked squares the line does not cut` : null,
          s.traced.pencil === 'blunt' ? 'blunt pencil' : null, s.traced.hold === 'slanted' ? 'pencil held slanted' : null,
        ].filter(Boolean).join('; ');
        const row = { id: `${s.log.length}`, trial: s.log.length + 1, kind: 'area', specimen: id, dim: 'area', grid: `${g} mm`, complete: t.complete, boundary: t.whole, ignored: t.ignored, unjudged: t.unjudged, stray: t.stray, wrong: t.wrong, area: r4(t.areaMm2 / 100), err: r4(err / 100), pencil: s.traced.pencil, hold: s.traced.hold, note };
        const log = [...s.log, row];
        return { log, analysis: analyse(log), acts: s.acts + 1, message: { at: s.acts + 1, key: 'area', tone: t.unjudged || t.stray ? 'warn' : 'ok', title: `Area recorded: (${t.complete} + ${t.whole}) × ${g * g} mm² = ${(t.areaMm2 / 100).toFixed(2)} cm²`, detail: t.unjudged ? `${t.unjudged} boundary squares were not judged and are left out of the count.` : 'Add a thickness and the volume follows.' } };
      }),
    },
  }),
  onSpecimen: (id, set, get) => { if (id !== 'none' && get().traced && get().traced.id !== id) set({ traced: null, marks: {} }); },
};

export const useLamina = createMeasure(CFG);
