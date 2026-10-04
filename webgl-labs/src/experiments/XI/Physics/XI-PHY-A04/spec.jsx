/** The interface for XI-PHY-A04, as data: the spherometer, the glass it stands on, the ruler and the legs' impressions. */
import { SPHEROMETERS } from '../../../../shared/measure/instruments.js';
import { SURFACES } from '../../../../shared/measure/spherometer.js';
import { viewOfSphero } from '../../../../shared/measure/createSpherometer.js';
import { makeSpheroWindow, makeLegsPanel, makeSpheroResults } from '../../../../shared/measure/SpheroPanels.jsx';
import { CFG, useSpherometer } from './engine/spherometer.js';
import { SpheroBench } from './three/SpheroBench.jsx';

const PITCHES = [{ value: '', label: '— measure it —' }, ...[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((p) => ({ value: String(p), label: `${p} mm` }))];
const DIVISIONS = [{ value: '', label: '— count them —' }, ...[25, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} divisions` }))];
const LCS = [{ value: '', label: '— work it out —' }, ...['0.5', '0.1', '0.05', '0.02', '0.01', '0.005', '0.001'].map((v) => ({ value: v, label: `${v} mm` }))];
const inst = (s) => SPHEROMETERS[s.instrument];
const SpheroWindow = makeSpheroWindow(useSpherometer);
const LegsPanel = makeLegsPanel(useSpherometer);
const SpheroResults = makeSpheroResults(useSpherometer);
const entryStr = (s) => { const i = inst(s); const lc = Number(s.lcEntry) || i.lc; return `${s.entry.major} + ${s.entry.minor} × ${lc} = ${(s.entry.major + s.entry.minor * lc).toFixed(3)} mm`; };

export const spec = {
  code: CFG.code,
  title: CFG.title,
  subtitle: CFG.subtitle,
  store: useSpherometer,
  Scene: SpheroBench,
  camera: CFG.camera,
  fog: [12, 30],
  glow: 'rgba(148,163,184,0.08)',

  status: (s) => {
    if (s.message && s.message.at === s.acts) return { key: s.message.key, tone: s.message.tone ?? 'warn', title: s.message.title, detail: s.message.detail };
    const surf = SURFACES[s.surface];
    return s.surface === 'plane'
      ? { key: 'plane', tone: 'info', title: 'On the plane glass', detail: 'Bring the screw down until the instrument just starts to rock when you press it, read the scales: that is the reference. Always come to it the same way, from above.' }
      : { key: 'surface', tone: 'info', title: `On the ${surf.short}`, detail: 'Raise the screw clear, then lower it a division at a time, pressing gently each time, until the instrument just starts to rock. Read the scales there.' };
  },

  controls: [
    {
      id: 'instrument', type: 'segmented', label: 'Spherometer', get: (s) => s.instrument, set: 'setInstrument',
      options: Object.values(SPHEROMETERS).map((i) => ({ value: i.id, label: ({ sp100: '1 mm / 100', sp50: '0.5 mm / 50', spWide: 'wide legs' })[i.id], hint: i.label })),
      note: (s) => `${inst(s).label}. Each instrument has its own reading on plane glass, which you have to find.`,
    },
    {
      id: 'surface', type: 'segmented', label: 'It stands on', get: (s) => s.surface, set: 'setSurface',
      options: Object.values(SURFACES).map((v) => ({ value: v.id, label: ({ plane: 'Plane glass', watchConvex: 'Convex watch glass', lensConvex: 'Convex lens', watchConcave: 'Concave watch glass', flatish: 'Nearly plane' })[v.id], hint: v.label })),
    },
    { id: 'screw', type: 'slider', min: 0, max: 14, step: 0.05, get: (s) => s.y, set: 'setScrew', label: 'Turn the screw (coarse)', accent: 'bg-gradient-to-r from-slate-700 to-slate-400', note: () => 'Coarse. Down is a larger reading. Come to contact in steps of one least count.' },
    {
      id: 'fine-actions', type: 'actions', items: [
        { id: 'step-10-', label: '−10 L.C.', run: 'step', args: [-10], tone: 'ghost' },
        { id: 'step-1-', label: '−1 L.C.', run: 'step', args: [-1], tone: 'ghost' },
        { id: 'step-1+', label: '+1 L.C.', run: 'step', args: [1], tone: 'ghost' },
        { id: 'step-10+', label: '+10 L.C.', run: 'step', args: [10], tone: 'ghost' },
        { id: 'retract', label: 'Raise the screw clear', run: 'retract', tone: 'warn' },
        { id: 'press', label: 'Press on the instrument', run: 'press', tone: 'good', title: 'A gentle press: does it stand firm on its legs, or rock?' },
      ],
    },
    {
      id: 'turn-actions', type: 'actions', items: [
        { id: 'turn-10-', label: '−10 turns', run: 'turn', args: [-10], tone: 'ghost' }, { id: 'turn-1-', label: '−1 turn', run: 'turn', args: [-1], tone: 'ghost' },
        { id: 'turn-1+', label: '+1 turn', run: 'turn', args: [1], tone: 'ghost' }, { id: 'turn-10+', label: '+10 turns', run: 'turn', args: [10], tone: 'ghost' },
      ],
    },
    {
      id: 'pitch', type: 'select', label: 'The pitch you found', get: (s) => s.pitchEntry, set: 'setPitch', options: PITCHES,
      note: (s) => (s.pitchEntry ? (Math.abs(Number(s.pitchEntry) - inst(s).pitch) < 1e-9 ? 'Right: that is how far one turn moves the screw.' : 'Not what the scale shows: turn the screw ten whole turns and see how far the disc moves down the scale.') : 'Turn the screw through ten whole turns and see how far the disc moves along the vertical scale; divide by ten.'),
    },
    {
      id: 'divisions', type: 'select', label: 'Divisions on the disc', get: (s) => s.nEntry, set: 'setN', options: DIVISIONS,
      note: (s) => (s.nEntry ? (Number(s.nEntry) === inst(s).n ? 'Right. Pitch divided by this is the least count.' : 'Count them again: all the way round the disc.') : 'Count the divisions all the way round the disc.'),
    },
    { id: 'eye', type: 'segmented', label: 'Your eye is', get: (s) => s.eye, set: 'setEye', options: [{ value: 'left', label: 'to the left' }, { value: 'centre', label: 'straight on' }, { value: 'right', label: 'to the right' }], note: () => 'Look from the side and the disc seems to slip against the line: parallax.' },
    { id: 'lc', type: 'select', label: 'The least count is', get: (s) => s.lcEntry, set: 'setLc', options: LCS, note: (s) => (s.lcEntry ? (Math.abs(Number(s.lcEntry) - inst(s).lc) < 1e-9 ? 'Right: pitch divided by the divisions on the disc.' : 'That is not this instrument’s least count: work it out from the pitch and the divisions.') : 'The pitch divided by the number of divisions on the disc.') },
    { id: 'major', type: 'slider', min: 0, max: 15, step: 0.5, get: (s) => s.entry.major, set: 'setMajor', label: (s) => `Last mark uncovered on the scale — ${s.entry.major} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500' },
    { id: 'minor', type: 'slider', min: 0, max: (s) => inst(s).n - 1, step: 1, get: (s) => s.entry.minor, set: 'setMinor', label: (s) => `Disc division at the line — ${s.entry.minor}`, accent: 'bg-gradient-to-r from-slate-700 to-amber-400' },
    {
      id: 'legs', type: 'group', label: 'The legs on paper',
      children: [
        { id: 'legs-actions', type: 'actions', items: [{ id: 'impress', label: 'Press the legs on the paper', run: 'impress', tone: 'primary' }] },
        { id: 'pair', type: 'segmented', when: (s) => s.paper, label: 'Ruler against', get: (s) => s.pair, set: 'setPair', options: [{ value: 'ab', label: 'A – B' }, { value: 'bc', label: 'B – C' }, { value: 'ca', label: 'C – A' }] },
        { id: 'ruler-a', type: 'slider', when: (s) => s.paper, min: 0, max: 70, step: 0.5, get: (s) => s.rulerA, set: 'setRulerA', label: (s) => `Ruler at the first impression — ${s.rulerA.toFixed(1)} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500' },
        { id: 'ruler-b', type: 'slider', when: (s) => s.paper, min: 0, max: 70, step: 0.5, get: (s) => s.rulerB, set: 'setRulerB', label: (s) => `Ruler at the second — ${s.rulerB.toFixed(1)} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500' },
        { id: 'leg-actions', type: 'actions', when: (s) => s.paper, items: [{ id: 'record-leg', label: 'Record this distance', run: 'recordLeg', tone: 'primary' }] },
      ],
    },
    {
      id: 'record-actions', type: 'actions', items: [
        { id: 'record-ref', label: 'Record reference (plane glass)', run: 'recordReference', tone: 'primary', when: (s) => s.surface === 'plane' },
        { id: 'record', label: 'Record this reading', run: 'record', tone: 'primary', when: (s) => s.surface !== 'plane' },
        { id: 'reveal', label: 'Show the true values', run: 'reveal', tone: 'ghost', title: 'After three readings on a curved surface' },
        { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
      ],
    },
  ],

  instruments: [
    { id: 'window', type: 'custom', Component: SpheroWindow },
    {
      id: 'hands', type: 'readouts',
      items: [
        { id: 'standing-on', label: 'Standing on', value: (s) => SURFACES[s.surface].label },
        { id: 'your-reading', label: 'You read', value: (s) => entryStr(s), hint: 'Last mark uncovered + disc division × least count' },
        { id: 'derived-lc', label: 'Pitch ÷ divisions', value: (s) => (s.pitchEntry && s.nEntry ? `${s.pitchEntry} ÷ ${s.nEntry} = ${(Number(s.pitchEntry) / Number(s.nEntry)).toFixed(4)} mm` : s.pitchEntry ? `${s.pitchEntry} mm ÷ ?` : s.nEntry ? `? ÷ ${s.nEntry}` : '—'), hint: 'The least count, from what you found' },
        { id: 'viewing', label: 'Your eye', value: (s) => ({ left: 'left of the line of sight — the disc seems shifted', centre: 'straight on', right: 'right of the line of sight — the disc seems shifted' })[s.eye], hint: 'Parallax: the disc and the scale are not in one plane' },
        { id: 'reference', label: 'Reference', value: (s) => (s.analysis.ref === null ? 'not taken yet' : `${s.analysis.ref.toFixed(3)} mm on plane glass`) },
      ],
    },
    { id: 'legs-view', type: 'custom', Component: LegsPanel },
    { id: 'results', type: 'custom', Component: SpheroResults },
    { id: 'graph', type: 'plot', title: 'Sagitta h, by trial', series: (s) => s.analysis.series, xLabel: 'trial', yLabel: 'h / mm', height: 150 },
  ],

  table: {
    columns: [['trial', '#'], ['label', 'On'], ['a', 'Ruler at A / mm'], ['b', 'Ruler at B / mm'], ['length', 'l / mm'], ['major', 'Scale / mm'], ['minor', 'Disc div.'], ['lc', 'L.C. / mm'], ['observed', 'Reading / mm'], ['h', 'Sagitta h / mm'], ['note', 'Notes']],
    csv: 'XI-PHY-A04-spherometer.csv',
    empty: 'Press the legs on paper and measure their separation; take the reading on plane glass; then stand the spherometer on the curved surface and take its reading, entering what you read from the scale and the disc.',
  },
};

void viewOfSphero;
export default spec;
