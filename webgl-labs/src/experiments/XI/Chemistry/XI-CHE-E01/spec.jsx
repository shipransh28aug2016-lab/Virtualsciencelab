/**
 * The interface for XI-CHE-E01, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import { BALANCES } from '../../../../shared/balance/balance.js';
import { useWeighEngine } from './engine/useWeighEngine.js';
import { CATALOGUE, OBJECT_ORDER, BALANCE_CHOICES, statusOf, labelOfBalance, massOf, sampleOf } from './engine/weigh.js';
import { WeighBench } from './three/WeighBench.jsx';

const electronic = (s) => s.balanceId !== 'beam';
const isBeam = (s) => s.balanceId === 'beam';
const hasShield = (s) => electronic(s) && BALANCES[s.balanceId].shield;
const pickedHasLid = (s) => Boolean(s.objects[s.picked]?.lid);
const dec = (s) => (isBeam(s) ? 2 : BALANCES[s.balanceId].decimals);
const onPan = (s) => (s.pan.length ? s.objects[s.pan[0]].label : 'nothing');
const driftCounts = (s) => { const sp = BALANCES[s.balanceId]; return sp.drift0 * Math.exp(-s.display.bal.t / sp.warmTau); };

export const spec = {
  code: 'XI-CHE-E01',
  title: 'Using a balance',
  subtitle: 'CBSE Class XI · Practical skills · three electronic balances and a beam: tare, readability, repeatability, weighing by difference',
  store: useWeighEngine,
  Scene: WeighBench,
  camera: { position: [0.1, 1.7, 7.2], fov: 36, target: [0.1, 0.4, 0], min: 2, max: 11, polar: [0.35, Math.PI / 2.05] },
  fog: [9, 22],
  glow: 'rgba(148,163,184,0.07)',

  status: (s) => (s.message && s.message.at === s.acts ? { key: `msg-${s.message.text.slice(0, 12)}`, tone: s.message.tone, title: s.message.text, detail: '' } : statusOf(s)),

  controls: [
    {
      id: 'balance', type: 'segmented', label: 'Balance', get: (s) => s.balanceId, set: 'setBalance',
      options: BALANCE_CHOICES.map((b) => ({ value: b.id, label: b.label.split(',')[0], hint: b.label })),
      note: (s) => labelOfBalance(s.balanceId),
    },
    {
      id: 'object', type: 'select', label: 'Object', get: (s) => s.picked, set: 'pick',
      options: OBJECT_ORDER.map((id) => ({ value: id, label: CATALOGUE[id].label })),
    },
    { id: 'place-actions', type: 'actions', items: [
      { id: 'place', label: 'Place on the pan', run: 'place', tone: 'primary', title: 'Lower it gently' },
      { id: 'drop', label: 'Drop it on', run: 'drop', tone: 'warn', title: 'What not to do: the pan rings' },
      { id: 'remove', label: 'Take it off', run: 'remove', tone: 'ghost' },
    ] },
    { id: 'heat-actions', type: 'actions', when: (s) => s.picked === 'crucible', items: [
      { id: 'heat', label: 'Back in the oven, out again', run: 'heat', tone: 'ghost', title: 'The crucible is 45 K above the room again' },
    ] },
    { id: 'zero-actions', type: 'actions', when: electronic, items: [
      { id: 'tare', label: 'Tare', run: 'tare', tone: 'good', title: 'Zero the display at what is on the pan now' },
      { id: 'zero', label: 'Clear tare', run: 'zero', tone: 'ghost', title: 'Forget the tare: the display shows the whole load again' },
    ] },
    {
      id: 'shield', type: 'segmented', when: hasShield, label: 'Draft shield', get: (s) => (s.bals[s.balanceId] ?? s.bals.top2).shield, set: 'setShield',
      options: [{ value: 'open', label: 'Open', hint: 'To put things on the pan and add sample' }, { value: 'closed', label: 'Closed', hint: 'To weigh' }],
    },
    {
      id: 'lid', type: 'segmented', when: pickedHasLid, label: 'Lid of the bottle', get: (s) => (s.objects[s.picked].lidOn ? 'on' : 'off'), set: 'setLid',
      options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
    },
    {
      id: 'feet', type: 'slider', when: electronic, min: -2, max: 2, step: 0.05, get: (s) => s.feet[s.balanceId] ?? 0, set: 'setFeet',
      label: (s) => `Levelling feet — bubble ${s.display.bal.tilt > 0.2 ? 'off the ring' : 'on the ring'} (${s.display.bal.tilt.toFixed(2)}°)`,
      accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
      note: () => 'Turn the feet until the bubble sits in the ring: a tilted balance reads low by m (1 − cos θ).',
    },
    { id: 'cal-actions', type: 'actions', when: electronic, items: [
      { id: 'calibrate', label: 'Calibrate (100 g)', run: 'calibrate', tone: 'ghost', title: 'Level, warm, shield shut, zeroed — and only the 100 g weight on the pan' },
    ] },
    {
      id: 'spatula', type: 'slider', min: 0.05, max: 1, step: 0.05, get: (s) => s.spatula, set: 'setSpatula',
      label: (s) => `Spatula — about ${s.spatula.toFixed(2)} g a time`,
      accent: 'bg-gradient-to-r from-slate-700 to-emerald-500',
      note: () => 'A hand never gives the same amount twice.',
    },
    { id: 'sample-actions', type: 'actions', items: [
      { id: 'add', label: 'Add sodium chloride', run: 'addSample', tone: 'primary', title: 'A spatula-full into the container on the pan' },
      { id: 'transfer', label: 'Tip the bottle out', run: 'transfer', tone: 'ghost', title: 'Pour the chosen bottle into the beaker: weighing by difference' },
    ] },
    {
      id: 'hundreds', type: 'slider', when: isBeam, min: 0, max: 500, step: 100, get: (s) => s.beam.r.h, set: 'setHundreds',
      label: (s) => `Hundreds rider — ${s.beam.r.h} g`, accent: 'bg-gradient-to-r from-slate-700 to-amber-500',
    },
    {
      id: 'tens', type: 'slider', when: isBeam, min: 0, max: 100, step: 10, get: (s) => s.beam.r.t, set: 'setTens',
      label: (s) => `Tens rider — ${s.beam.r.t} g`, accent: 'bg-gradient-to-r from-slate-700 to-amber-500',
    },
    {
      id: 'units', type: 'slider', when: isBeam, min: 0, max: 10, step: 0.01, get: (s) => s.beam.r.u, set: 'setUnits',
      label: (s) => `Fine beam — ${s.beam.r.u.toFixed(2)} g`, accent: 'bg-gradient-to-r from-slate-700 to-amber-500',
      note: () => 'Graduated to 0.1 g; you can estimate to half a division.',
    },
    {
      id: 'zero-screw', type: 'slider', when: isBeam, min: -0.3, max: 0.3, step: 0.005, get: (s) => s.beam.adjust, set: 'setZeroScrew',
      label: (s) => `Zero adjusting screw — ${s.beam.adjust >= 0 ? '+' : ''}${s.beam.adjust.toFixed(3)} g`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
      note: () => 'With the pan empty and every rider at zero, the pointer should rest on the mark.',
    },
    {
      id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
      options: [{ value: '1', label: '×1' }, { value: '4', label: '×4' }, { value: '10', label: '×10' }, { value: '30', label: '×30' }],
    },
    { id: 'record-actions', type: 'actions', items: [
      { id: 'record', label: 'Record reading', run: 'record', tone: 'good' },
      { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
    ] },
  ],

  instruments: [
    {
      id: 'display', type: 'hero', label: 'Display',
      value: (s) => s.display.reading.text ?? s.display.reading.value.toFixed(2), unit: 'g',
      sub: (s) => (isBeam(s) ? `riders ${s.display.reading.riders.toFixed(2)} g · pointer ${s.beam.theta.toFixed(1)}° ${s.display.reading.atRest ? '· AT REST' : '· moving'}` : `${s.display.reading.stable ? '●  steady' : '○  not steady'} · ${BALANCES[s.balanceId].label}`),
    },
    { id: 'trace', type: 'plot', title: 'The display, over time', series: (s) => s.traceSeries, xLabel: 'time / s', yLabel: 'display / g', height: 120 },
    {
      id: 'bench', type: 'readouts',
      items: [
        { id: 'on-pan', label: 'On the pan', value: (s) => onPan(s) },
        { id: 'picked', label: 'Chosen', value: (s) => s.objects[s.picked].label },
        { id: 'lid-state', label: 'Lid', value: (s) => (s.objects[s.picked].lid ? (s.objects[s.picked].lidOn ? 'on' : 'off') : 'none') },
        { id: 'spatula-g', label: 'Spatula', value: (s) => `about ${s.spatula.toFixed(2)} g a time` },
        { id: 'readability', label: 'Readability', value: (s) => (isBeam(s) ? '0.1 g (estimate 0.05)' : `${BALANCES[s.balanceId].d} g`) },
        { id: 'tare-held', label: 'Tare held', value: (s) => (isBeam(s) ? '—' : `${s.display.bal.tareG.toFixed(dec(s))} g`), hint: 'What the display was zeroed to, read from the balance’s own scale' },
        { id: 'drift', label: 'Zero drift', value: (s) => (isBeam(s) ? '—' : `${driftCounts(s).toFixed(1)} counts`), hint: 'The cold electronics: the zero wanders for the first half hour or so' },
        { id: 'level', label: 'Out of level', value: (s) => (isBeam(s) ? '—' : `${s.display.bal.tilt.toFixed(2)}°`) },
        { id: 'shield-state', label: 'Draft shield', value: (s) => (hasShield(s) ? s.bals[s.balanceId].shield : 'none') },
        { id: 'calibration', label: 'Calibrated', value: (s) => (isBeam(s) ? 'no electronics' : s.display.bal.calibrations > 0 ? `yes, ${Math.round(s.display.bal.clock - s.display.bal.lastCal)} s ago` : 'not since it was unpacked') },
        { id: 'room', label: 'Room', value: () => '25 °C, 55 % RH' },
      ],
    },
    {
      id: 'result', type: 'readouts',
      items: [
        { id: 'n', label: 'Readings of the last object', value: (s) => (s.analysis.last ? s.analysis.last.n : '—') },
        { id: 'mean', label: 'Mean', value: (s) => (s.analysis.last ? `${s.analysis.last.mean.toFixed(Math.max(2, -Math.floor(Math.log10(s.analysis.last.d))))} g` : '—') },
        { id: 'sd', label: 'Standard deviation', value: (s) => (s.analysis.last && s.analysis.last.sd !== null ? `${(s.analysis.last.sd / s.analysis.last.d).toFixed(2)} counts` : '—'), hint: 'In least counts: a repeatable balance scatters by about one' },
        { id: 'range', label: 'Range', value: (s) => (s.analysis.last ? `${Math.round(s.analysis.last.range / s.analysis.last.d)} counts` : '—') },
        { id: 'by-difference', label: 'Mass tipped out, by difference', value: (s) => (s.analysis.byDifference ? `${s.analysis.byDifference.transferred.toFixed(4)} g` : '—'), hint: 'Bottle and salt, minus the bottle after tipping: it catches what was left behind' },
      ],
    },
    { id: 'graph', type: 'plot', title: 'Your repeat readings', series: (s) => s.analysis.series, xLabel: 'trial', yLabel: 'reading / g', height: 130 },
  ],

  table: {
    columns: [['trial', 'Trial'], ['balance', 'Balance'], ['object', 'On the pan'], ['tare', 'Tare held / g'], ['text', 'Display / g'], ['steady', 'Steady'], ['note', 'Notes']],
    csv: 'XI-CHE-E01-weighing.csv',
    empty: 'Weigh something, record it, and weigh it again: the table sets what the display said against what the instrument was doing at the time.',
  },
};

export { massOf, sampleOf };
export default spec;
