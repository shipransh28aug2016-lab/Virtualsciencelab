/**
 * The interface for XI-CHE-C01, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import { usePhEngine } from './engine/usePhEngine.js';
import {
  SHELF, SHELF_BY_ID, CHART, statusOf, meterReading, concentrationLabel, BUF_OF,
} from './engine/ph.js';
import { certifiedPH } from '../../../../shared/chem/species.js';
import { PhBench } from './three/PhBench.jsx';

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hex2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
const isMeter = (s) => s.method === 'meter';
const isPaper = (s) => s.method === 'paper';
const isUniversal = (s) => s.method === 'universal';

/** The strip's colour as it develops: dry cream, then the sample's. */
const stripHex = (s) => {
  const dev = s.strip.dipped ? 1 - Math.exp(-s.strip.t / 6) : 0;
  const dry = [0.95, 0.93, 0.86];
  const wet = s.world.paper ? s.world.paper.srgb : dry;
  return `#${[0, 1, 2].map((i) => hex2(dry[i] + (wet[i] - dry[i]) * dev)).join('')}`;
};

const here = (s) => (s.location === 'sample' ? 'in the sample' : BUF_OF[s.location] ? `in the ${certifiedPH(BUF_OF[s.location], s.tempC).toFixed(2)} buffer` : s.location === 'rinse' ? 'being rinsed' : 'out of solution');

export const spec = {
  code: 'XI-CHE-C01',
  title: 'Determination of pH of acids, bases, salts and fruit juices',
  subtitle: 'CBSE Class XI · Equilibrium · pH from an electroneutrality solver in activities, nothing looked up',
  store: usePhEngine,
  Scene: PhBench,
  camera: { position: [0.1, 0.75, 3.7], fov: 36, target: [0.1, 0.28, 0], min: 1.2, max: 7 },
  fog: [6, 16],
  glow: 'rgba(52,211,153,0.08)',

  status: statusOf,

  controls: [
    {
      id: 'sample', type: 'select', label: 'Solution', get: (s) => s.sampleId, set: 'setSample',
      options: SHELF.map((e) => ({ value: e.id, label: e.formula ? `${e.label} (${e.formula})` : e.label, group: e.group })),
    },
    {
      id: 'dilution', type: 'slider', min: 0, max: 3, step: 0.05,
      label: (s) => `Dilution — ×${s.dilution}`,
      get: (s) => Math.log10(s.dilution), set: 'setDilutionLog',
      disabled: (s) => SHELF_BY_ID[s.sampleId].fixed,
      note: (s) => (SHELF_BY_ID[s.sampleId].fixed ? 'A saturated solution: there is always solid in the bottle, so dilution does not apply.' : `Concentration: ${concentrationLabel(s)}`),
      accent: 'bg-gradient-to-r from-slate-700 to-sky-700',
    },
    {
      id: 'temperature', type: 'slider', min: 15, max: 40, step: 1,
      label: (s) => `Temperature — ${s.tempC} °C`, get: (s) => s.tempC, set: 'setTemp',
      accent: 'bg-gradient-to-r from-sky-700 to-rose-600',
    },
    {
      id: 'method', type: 'segmented', label: 'Method', get: (s) => s.method, set: 'setMethod',
      options: [
        { value: 'paper', label: 'pH paper', hint: 'A strip of indicator paper, matched to a colour chart' },
        { value: 'universal', label: 'Universal', hint: 'Drops of universal indicator in a tube' },
        { value: 'meter', label: 'pH meter', hint: 'A glass electrode and a calibrated meter' },
      ],
    },

    /* pH paper */
    { id: 'paper-actions', type: 'actions', when: isPaper, items: [
      { id: 'dip-strip', label: (s) => (s.strip.dipped ? 'Use a new strip' : 'Dip a strip'), run: 'dipStrip', tone: 'primary' },
    ] },

    /* universal indicator */
    {
      id: 'drops', type: 'slider', when: isUniversal, min: 0, max: 12, step: 1,
      label: (s) => `Indicator — ${s.drops} drop${s.drops === 1 ? '' : 's'}`, get: (s) => s.drops, set: 'setDrops',
      note: () => '5 drops in 10 mL is the usual. More is a stronger colour — and more dye, which is an acid.',
    },

    /* the chart, for the two colour methods */
    {
      id: 'chart', type: 'segmented', when: (s) => !isMeter(s), label: 'Match the colour to the chart',
      get: (s) => String(s.pick ?? ''), set: 'setPick',
      options: CHART.map((p) => ({ value: String(p.pH), label: String(p.pH), swatch: p.hex, swatchText: lum(p.srgb) > 0.6 ? '#0b1220' : '#ffffff' })),
      note: () => 'Colour is judged by eye: neighbouring patches can look alike. That is the resolution of the method.',
    },

    /* the meter */
    {
      id: 'electrode', type: 'segmented', when: isMeter, label: 'Electrode', observable: false, get: (s) => s.electrode, set: 'setElectrode',
      options: [
        { value: 'good', label: 'New', hint: 'Slope close to the ideal 59.16 mV/pH' },
        { value: 'worn', label: 'Worn', hint: 'Low slope efficiency: the meter will tell you, if you calibrate it' },
      ],
    },
    { id: 'meter-dips', type: 'actions', when: isMeter, items: [
      { id: 'rinse', label: 'Rinse electrode', run: 'rinse', tone: 'warn', title: 'Wash it in distilled water: a film of the last solution is carried on the glass' },
      { id: 'dip-sample', label: 'Dip in sample', run: 'dip', args: ['sample'], tone: 'primary' },
      { id: 'dip-4', label: 'pH 4.01 buffer', run: 'dip', args: ['buf4'], tone: 'ghost' },
      { id: 'dip-7', label: 'pH 6.86 buffer', run: 'dip', args: ['buf7'], tone: 'ghost' },
      { id: 'dip-9', label: 'pH 9.18 buffer', run: 'dip', args: ['buf9'], tone: 'ghost' },
      { id: 'lift', label: 'Lift out', run: 'lift', tone: 'ghost' },
      { id: 'fresh-sample', label: 'Pour fresh sample', run: 'freshSample', tone: 'ghost', disabled: (s) => !(s.spoil && s.spoil.volume > 0), title: 'Only a fresh pour removes what an unrinsed electrode left in the beaker' },
    ] },
    { id: 'meter-cal', type: 'actions', when: isMeter, items: [
      { id: 'calibrate', label: 'Calibrate here', run: 'calibrate', tone: 'good', disabled: (s) => !BUF_OF[s.location], title: 'Sets this point from the reading as it is NOW — even if it has not settled' },
      { id: 'clear-cal', label: 'Clear calibration', run: 'clearCalibration', tone: 'ghost' },
    ] },

    {
      id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
      options: [{ value: '1', label: '×1' }, { value: '4', label: '×4' }, { value: '10', label: '×10' }],
    },
    { id: 'record-actions', type: 'actions', items: [
      { id: 'record', label: 'Record reading', run: 'record', tone: 'good' },
      { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
    ] },
  ],

  instruments: [
    /* What is in the beaker — the label on the bottle. Without it, dragging the
       dilution slider changes nothing a student can see until they take a
       reading, which is true of a real beaker and a poor way to run a bench. */
    {
      id: 'beaker', type: 'readouts',
      items: [
        { id: 'beaker-solution', label: 'In the beaker', value: (s) => SHELF_BY_ID[s.sampleId].label },
        { id: 'beaker-conc', label: 'Concentration', value: (s) => String(concentrationLabel(s)), unit: (s) => (typeof concentrationLabel(s) === 'number' ? 'mol/L' : '') },
      ],
    },
    {
      id: 'meter-ph', type: 'hero', when: isMeter, label: 'pH meter',
      value: (s) => { const r = meterReading(s); return r.sensing && r.pH !== null ? r.pH.toFixed(2) : '—'; },
      sub: (s) => { const r = meterReading(s); return r.sensing ? `${r.mV.toFixed(1)} mV · ${r.stable ? 'STABLE' : 'settling…'}` : `electrode ${here(s)}`; },
    },
    { id: 'strip-colour', type: 'swatch', when: isPaper, label: 'The strip', hex: stripHex, sub: (s) => (s.strip.dipped ? 'Wait for the colour to develop, then match it' : 'Dip a strip to begin') },
    {
      id: 'tube-colour', type: 'swatch', when: isUniversal, label: 'The tube',
      hex: (s) => (s.world.universal ? s.world.universal.colour.hex : '#e9eef5'),
      sub: (s) => (s.drops ? `${s.drops} drops of universal indicator` : 'No indicator yet'),
    },
    {
      id: 'meter-readouts', type: 'readouts', when: isMeter,
      items: [
        { id: 'calibration', label: 'Calibration', value: (s) => (!s.cal ? 'none' : (s.cal.points ?? []).length === 1 ? '1-point' : `${(s.cal.points ?? []).length}-point`) },
        { id: 'slope', label: 'Slope', value: (s) => (s.cal && meterReading(s).slope !== null ? `${meterReading(s).slope.toFixed(1)} %` : '—'), hint: 'Electrode efficiency as a % of the ideal. Below about 92% it needs replacing' },
        { id: 'temp', label: 'Temperature', value: (s) => `${s.tempC} °C` },
        { id: 'film', label: 'On the glass', value: (s) => (s.film && s.film.volume > 0 ? `${(s.film.volume * 1000).toFixed(0)} µL` : 'clean') },
      ],
    },
  ],

  table: {
    columns: [
      ['trial', 'Trial'], ['sample', 'Solution'], ['concentration', 'Conc. / mol L⁻¹'], ['method', 'Method'], ['tempC', 'T / °C'],
      ['pH', 'pH'], ['pOH', 'pOH'], ['nature', 'Nature'], ['error', 'Error vs true'], ['note', 'Notes'],
    ],
    csv: 'XI-CHE-C01-pH.csv',
    empty: 'Choose a solution and a method, take a reading, and press Record. Then try the same solution a different way: the table keeps the error of each, which is the point of the exercise.',
  },
};

export default spec;
