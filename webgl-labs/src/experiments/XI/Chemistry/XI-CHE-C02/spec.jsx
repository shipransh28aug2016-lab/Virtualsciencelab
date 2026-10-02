/**
 * The interface for XI-CHE-C02, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import { useAcidEngine } from './engine/useAcidEngine.js';
import {
  ACIDS, CHART, concentration, equalConcentration, meterReading, statusOf, stripDevelopment, sci,
} from './engine/acids.js';
import { AcidBench } from './three/AcidBench.jsx';

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hex2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
const isMeter = (s) => s.method === 'meter';
const isPaper = (s) => s.method === 'paper';
const isUniversal = (s) => s.method === 'universal';
const notMeter = (s) => s.method !== 'meter';

const stripHex = (k) => (s) => {
  const strip = k === 'A' ? s.stripA : s.stripB;
  const dev = stripDevelopment(strip);
  const dry = [0.95, 0.93, 0.86];
  const wet = s.world[k].paper ? s.world[k].paper.srgb : dry;
  return `#${[0, 1, 2].map((i) => hex2(dry[i] + (wet[i] - dry[i]) * dev)).join('')}`;
};
const tubeHex = (k) => (s) => (s.world[k].universal ? s.world[k].universal.colour.hex : '#e9eef5');

const acidOptions = ACIDS.map((a) => ({ value: a.id, label: `${a.label} (${a.formula})` }));
const chartOptions = CHART.map((p) => ({ value: String(p.pH), label: String(p.pH), swatch: p.hex, swatchText: lum(p.srgb) > 0.6 ? '#0b1220' : '#ffffff' }));
const where = (s) => (s.where === 'A' || s.where === 'B' ? `in tube ${s.where}` : s.where === 'rinse' ? 'being rinsed' : 'out of solution');
const slopeOf = (s, tube) => { const f = s.analysis.fits[s[tube].acid]; return f && f.slope !== null ? `${(-f.slope).toFixed(2)} pH per tenfold dilution` : '—'; };

export const spec = {
  code: 'XI-CHE-C02',
  title: 'Comparing the pH of strong and weak acids of the same concentration',
  subtitle: 'CBSE Class XI · Equilibrium · [H⁺], α and Ka from your own readings, in activities, nothing looked up',
  store: useAcidEngine,
  Scene: AcidBench,
  camera: { position: [0.5, 0.85, 3.3], fov: 36, target: [0.5, 0.3, 0], min: 1.4, max: 7 },
  fog: [6, 16],
  glow: 'rgba(251,113,133,0.08)',

  status: statusOf,

  controls: [
    { id: 'acidA', type: 'select', label: 'Tube A — acid', get: (s) => s.A.acid, set: 'setAcidA', options: acidOptions },
    {
      id: 'dilutionA', type: 'slider', min: 0, max: 3, step: 0.05,
      label: (s) => `Tube A — ×${s.A.dilution}  ·  ${sci(concentration(s.A))} mol/L`, get: (s) => Math.log10(s.A.dilution), set: 'setDilutionLogA',
      accent: 'bg-gradient-to-r from-slate-700 to-sky-600',
    },
    { id: 'acidB', type: 'select', label: 'Tube B — acid', get: (s) => s.B.acid, set: 'setAcidB', options: acidOptions },
    {
      id: 'dilutionB', type: 'slider', min: 0, max: 3, step: 0.05,
      label: (s) => `Tube B — ×${s.B.dilution}  ·  ${sci(concentration(s.B))} mol/L`, get: (s) => Math.log10(s.B.dilution), set: 'setDilutionLogB',
      accent: 'bg-gradient-to-r from-slate-700 to-amber-500',
    },
    {
      id: 'link', type: 'segmented', label: 'Diluting', get: (s) => s.link, set: 'setLink',
      options: [
        { value: 'on', label: 'Both together', hint: 'One dilution for both tubes: the comparison stays fair' },
        { value: 'off', label: 'Separately', hint: 'Set the tubes apart — and see what an unfair comparison does' },
      ],
    },
    {
      id: 'temperature', type: 'slider', min: 15, max: 40, step: 1,
      label: (s) => `Temperature — ${s.tempC} °C`, get: (s) => s.tempC, set: 'setTemp',
      accent: 'bg-gradient-to-r from-sky-700 to-rose-600',
    },
    {
      id: 'method', type: 'segmented', label: 'Method', get: (s) => s.method, set: 'setMethod',
      options: [
        { value: 'paper', label: 'pH paper', hint: 'A strip in each tube, matched to a colour chart' },
        { value: 'universal', label: 'Universal', hint: 'Drops of universal indicator in both tubes' },
        { value: 'meter', label: 'pH meter', hint: 'A glass electrode: calibrate, rinse between tubes, wait for STABLE' },
      ],
    },

    /* pH paper */
    { id: 'paper-actions', type: 'actions', when: isPaper, items: [
      { id: 'dip-strip-a', label: (s) => (s.stripA.dipped ? 'New strip in A' : 'Dip strip in A'), run: 'dipStripA', tone: 'primary' },
      { id: 'dip-strip-b', label: (s) => (s.stripB.dipped ? 'New strip in B' : 'Dip strip in B'), run: 'dipStripB', tone: 'primary' },
    ] },

    /* universal indicator */
    {
      id: 'drops', type: 'slider', when: isUniversal, min: 0, max: 12, step: 1,
      label: (s) => `Indicator — ${s.drops} drop${s.drops === 1 ? '' : 's'} in each tube`, get: (s) => s.drops, set: 'setDrops',
      note: () => '5 drops in 10 mL is the usual. More is a stronger colour — and more dye, which is an acid.',
    },

    /* the chart, for the two colour methods */
    {
      id: 'chartA', type: 'segmented', when: notMeter, label: 'Tube A matches patch', get: (s) => String(s.pick.A ?? ''), set: 'setPickA', options: chartOptions,
    },
    {
      id: 'chartB', type: 'segmented', when: notMeter, label: 'Tube B matches patch', get: (s) => String(s.pick.B ?? ''), set: 'setPickB', options: chartOptions,
      note: () => 'Colour is judged by eye: neighbouring patches can look alike. That is the resolution of the method.',
    },

    /* the meter */
    {
      id: 'meterCal', type: 'segmented', when: isMeter, label: 'Meter', get: (s) => s.meterCal, set: 'setMeterCal',
      options: [
        { value: 'calibrated', label: 'Calibrated', hint: 'Two-point calibration on pH 4.01 and 9.18, done this morning' },
        { value: 'none', label: 'Not calibrated', hint: 'Factory slope, no offset: what a meter reads if nobody calibrated it' },
      ],
    },
    { id: 'meter-dips', type: 'actions', when: isMeter, items: [
      { id: 'rinse', label: 'Rinse electrode', run: 'rinse', tone: 'warn', title: 'Wash it in distilled water: a film of the last acid is carried on the glass' },
      { id: 'dip-a', label: 'Dip in tube A', run: 'dip', args: ['A'], tone: 'primary' },
      { id: 'dip-b', label: 'Dip in tube B', run: 'dip', args: ['B'], tone: 'primary' },
      { id: 'lift', label: 'Lift out', run: 'lift', tone: 'ghost' },
      { id: 'fresh-tubes', label: 'Make up fresh tubes', run: 'freshTubes', tone: 'ghost', title: 'Only a fresh tube removes what an unrinsed electrode left in it' },
    ] },

    {
      id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
      options: [{ value: '1', label: '×1' }, { value: '4', label: '×4' }, { value: '10', label: '×10' }],
    },
    { id: 'record-actions', type: 'actions', items: [
      { id: 'record-a', label: 'Record tube A', run: 'record', args: ['A'], tone: 'good' },
      { id: 'record-b', label: 'Record tube B', run: 'record', args: ['B'], tone: 'good' },
      { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
    ] },
  ],

  instruments: [
    {
      id: 'fair', type: 'callout',
      text: (s) => (equalConcentration(s)
        ? 'Both tubes are at the same concentration: any difference between them is a difference in strength.'
        : `Different concentrations — A ${sci(concentration(s.A))}, B ${sci(concentration(s.B))} mol/L. Concentration and strength are now tangled together: this is not a fair comparison.`),
      tone: (s) => (equalConcentration(s) ? 'ok' : 'warn'),
    },
    {
      id: 'tubes', type: 'readouts',
      items: [
        { id: 'tube-a', label: 'Tube A', value: (s) => `${ACIDS.find((a) => a.id === s.A.acid).formula} · ${sci(concentration(s.A))}`, unit: 'mol/L' },
        { id: 'tube-b', label: 'Tube B', value: (s) => `${ACIDS.find((a) => a.id === s.B.acid).formula} · ${sci(concentration(s.B))}`, unit: 'mol/L' },
        { id: 'temp', label: 'Temperature', value: (s) => `${s.tempC} °C` },
        { id: 'diluting', label: 'Diluting', value: (s) => (s.link === 'on' ? 'both together' : 'separately') },
      ],
    },
    {
      id: 'meter-ph', type: 'hero', when: isMeter, label: 'pH meter',
      value: (s) => { const r = meterReading(s); return r.sensing && r.pH !== null ? r.pH.toFixed(2) : '—'; },
      sub: (s) => { const r = meterReading(s); return r.sensing ? `${r.mV.toFixed(1)} mV · ${r.stable ? 'STABLE' : 'settling…'} · ${where(s)}` : `electrode ${where(s)}`; },
    },
    { id: 'strip-a', type: 'swatch', when: isPaper, label: 'Strip A', hex: stripHex('A'), sub: (s) => (s.stripA.dipped ? 'developing / developed' : 'not dipped') },
    { id: 'strip-b', type: 'swatch', when: isPaper, label: 'Strip B', hex: stripHex('B'), sub: (s) => (s.stripB.dipped ? 'developing / developed' : 'not dipped') },
    { id: 'tube-colour-a', type: 'swatch', when: isUniversal, label: 'Tube A', hex: tubeHex('A'), sub: (s) => (s.drops ? `${s.drops} drops` : 'no indicator') },
    { id: 'tube-colour-b', type: 'swatch', when: isUniversal, label: 'Tube B', hex: tubeHex('B'), sub: (s) => (s.drops ? `${s.drops} drops` : 'no indicator') },
    {
      id: 'meter-readouts', type: 'readouts', when: isMeter,
      items: [
        { id: 'calibration', label: 'Calibration', value: (s) => (s.meterCal === 'calibrated' ? '2-point' : 'none') },
        { id: 'slope', label: 'Slope', value: (s) => { const r = meterReading(s); return r.slope === null ? '—' : `${r.slope.toFixed(1)} %`; } },
        { id: 'film', label: 'On the glass', value: (s) => (s.film && s.film.volume > 0 ? `${(s.film.volume * 1000).toFixed(0)} µL` : 'clean') },
      ],
    },
    {
      id: 'graph', type: 'plot', title: 'pH against log₁₀ C', series: (s) => s.analysis.series, xLabel: 'log₁₀ (C / mol L⁻¹)', yLabel: 'pH',
    },
    {
      id: 'analysis', type: 'readouts',
      items: [
        { id: 'slope-a', label: 'Tube A acid, from your readings', value: (s) => slopeOf(s, 'A') },
        { id: 'slope-b', label: 'Tube B acid, from your readings', value: (s) => slopeOf(s, 'B') },
        { id: 'mean-ka', label: 'Mean Ka, tube B acid', value: (s) => { const f = s.analysis.fits[s.B.acid]; return f && f.Ka !== null ? sci(f.Ka) : '—'; } },
      ],
    },
  ],

  table: {
    columns: [
      ['trial', 'Trial'], ['tube', 'Tube'], ['acid', 'Acid'], ['Ctxt', 'C / mol L⁻¹'], ['method', 'Method'], ['tempC', 'T / °C'],
      ['pH', 'pH'], ['Htxt', '[H⁺] = 10⁻ᵖᴴ'], ['alpha', 'α = [H⁺]/C (%)'], ['Katxt', 'Ka = Cα²/(1−α)'], ['error', 'Error vs true'], ['note', 'Notes'],
    ],
    csv: 'XI-CHE-C02-strong-weak-acids.csv',
    empty: 'Measure each tube and press Record. Then dilute both and do it again: the table does the arithmetic on your own readings, and the graph shows what dilution does to each acid.',
  },
};

export default spec;
