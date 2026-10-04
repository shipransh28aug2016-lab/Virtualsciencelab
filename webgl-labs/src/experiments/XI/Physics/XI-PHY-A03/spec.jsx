/** The interface for XI-PHY-A03, as data — the shared measuring interface, with the graph-paper half of the bench added. */
import { makeMeasureSpec } from '../../../../shared/measure/makeMeasureSpec.jsx';
import { makePaperPanel } from '../../../../shared/measure/GraphPaper.jsx';
import { paperFor, tally } from '../../../../shared/measure/lamina.js';
import { CFG, SHAPES, useLamina } from './engine/lamina.js';
import { LaminaBench } from './three/LaminaBench.jsx';

const PaperPanel = makePaperPanel(SHAPES);
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const BRUSH = { whole: 'count it whole', ignore: 'leave it out', erase: 'erase' };
const count = (s) => (s.traced ? tally(paperFor(SHAPES[s.traced.id], s.traced).cls, s.marks) : null);

const extra = {
  controls: [{
    id: 'paper', type: 'group', label: 'On the graph paper',
    children: [
      {
        id: 'grid', type: 'segmented', label: 'Graph paper ruled in', get: (s) => s.grid, set: 'setGrid',
        options: [{ value: 'g1', label: '1 mm', hint: 'Fine: many squares, a few of them in doubt' }, { value: 'g2', label: '2 mm', hint: 'Between' }, { value: 'g5', label: '5 mm', hint: 'Coarse: few squares, each boundary one a big guess' }],
        note: () => 'Changing the paper means tracing again: the lamina is laid on a fresh sheet.',
      },
      { id: 'lay-x', type: 'slider', min: -8, max: 8, step: 0.5, get: (s) => s.layX, set: 'setLayX', label: (s) => `Lamina moved across — ${signed(s.layX)} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500' },
      { id: 'lay-y', type: 'slider', min: -8, max: 8, step: 0.5, get: (s) => s.layY, set: 'setLayY', label: (s) => `Lamina moved up — ${signed(s.layY)} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500' },
      { id: 'lay-rot', type: 'slider', min: 0, max: 90, step: 5, get: (s) => s.layRot, set: 'setLayRot', label: (s) => `Lamina turned — ${s.layRot}°`, accent: 'bg-gradient-to-r from-slate-700 to-amber-400', note: () => 'Where the lamina lies on the squares changes which boundary squares it cuts, not its area.' },
      {
        id: 'pencil', type: 'segmented', label: 'The pencil', get: (s) => s.pencil, set: 'setPencil',
        options: [{ value: 'sharp', label: 'Sharp', hint: 'A line a tenth of a millimetre wide' }, { value: 'blunt', label: 'Blunt', hint: 'A line nearly a millimetre wide' }],
      },
      {
        id: 'hold', type: 'segmented', label: 'Held', get: (s) => s.hold, set: 'setHold',
        options: [{ value: 'upright', label: 'Upright', hint: 'Straight down, against the edge' }, { value: 'slanted', label: 'Leaning out', hint: 'Slanted away from the lamina' }],
        note: () => 'A slanted pencil draws its line out from under the lamina, by about its thickness times the lean.',
      },
      {
        id: 'paper-actions', type: 'actions', items: [
          { id: 'trace', label: 'Trace the outline', run: 'trace', tone: 'primary' },
          { id: 'open-paper', label: 'Open the graph paper', run: 'openPaper', tone: 'good' },
          { id: 'clear-marks', label: 'Clear my marks', run: 'clearMarks', tone: 'ghost' },
          { id: 'record-area', label: 'Record this area', run: 'recordArea', tone: 'primary' },
        ],
      },
      {
        id: 'brush', type: 'segmented', label: 'Brush on the paper', get: (s) => s.brush, set: 'setBrush',
        options: [{ value: 'whole', label: 'Whole' }, { value: 'ignore', label: 'Leave out' }, { value: 'erase', label: 'Erase' }],
      },
    ],
  }],
  instruments: [
    { id: 'paper-view', type: 'custom', Component: PaperPanel },
    {
      id: 'paper-readouts', type: 'readouts',
      items: [
        { id: 'paper-set', label: 'Paper and lamina', value: (s) => `${s.grid.slice(1)} mm squares · lamina ${signed(s.layX)}, ${signed(s.layY)} mm, turned ${s.layRot}°` },
        { id: 'pencil-set', label: 'Pencil and brush', value: (s) => `${s.pencil}, held ${s.hold} · brush: ${BRUSH[s.brush]}` },
        {
          id: 'squares', label: 'Squares', hint: 'complete + counted whole = squares; × the area of one square',
          value: (s) => { const t = count(s); return t ? `${t.complete} + ${t.whole} = ${t.complete - t.dropped + t.whole} → ${(t.areaMm2 / 100).toFixed(2)} cm²` : 'not traced yet'; },
        },
        { id: 'to-judge', label: 'Boundary squares', value: (s) => { const t = count(s); return t ? `${t.boundary} cut by the line, ${t.unjudged} still to judge` : '—'; } },
      ],
    },
  ],
};

export const spec = makeMeasureSpec(CFG, useLamina, LaminaBench, extra);
export default spec;
