/**
 * The interface for XI-CHE-C04, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import { useCommonIonEngine } from './engine/useCommonIonEngine.js';
import {
  SYSTEMS, NEUTRAL, CHART, systemOf, saltOf, cSalt, beakerT, statusOf, meterReading, BEAKER_ML,
} from './engine/commonion.js';
import { CommonIonBench } from './three/CommonIonBench.jsx';

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const isMeter = (s) => s.method === 'meter';
const isUniversal = (s) => s.method === 'universal';
const used = (s) => s.solid + s.dissolved > 0;
const chartOptions = CHART.map((p) => ({ value: String(p.pH), label: String(p.pH), swatch: p.hex, swatchText: lum(p.srgb) > 0.6 ? '#0b1220' : '#ffffff' }));
const sciC = (c) => (c === 0 ? '0' : c >= 0.01 ? c.toFixed(3) : c.toExponential(2));
const where = (s) => (s.meter === 'in' ? 'in the beaker' : 'out of the beaker');
const fit = (s, key) => s.analysis.fits[`${s.system}|${s.saltId}`]?.[key] ?? null;

export const spec = {
  code: 'XI-CHE-C04',
  title: 'Common-ion effect on weak acids and weak bases',
  subtitle: 'CBSE Class XI · Equilibrium · salt weighed, dissolved and measured; the pH solved in activities, nothing looked up',
  store: useCommonIonEngine,
  Scene: CommonIonBench,
  camera: { position: [0.1, 0.85, 3.5], fov: 36, target: [-0.1, 0.4, 0], min: 1.4, max: 7 },
  fog: [6, 16],
  glow: 'rgba(251,191,36,0.07)',

  status: statusOf,

  controls: [
    {
      id: 'system', type: 'segmented', label: 'In the beaker', get: (s) => s.system, set: 'setSystem',
      options: SYSTEMS.map((x) => ({ value: x.id, label: `${x.label} (${x.formula})`.replace(' solution', ''), hint: x.kind === 'strong' ? 'A strong acid: nothing left to shift' : x.kind === 'acid' ? 'A weak acid' : 'A weak base' })),
    },
    {
      id: 'conc', type: 'slider', min: 0.02, max: 0.2, step: 0.01, disabled: used,
      label: (s) => `${systemOf(s).formula} — ${s.conc.toFixed(2)} mol/L, ${BEAKER_ML} mL`, get: (s) => s.conc, set: 'setConc',
      note: (s) => (used(s) ? 'Fixed once salt has gone in: press “Fresh beaker” to change it.' : 'Concentration of the acid or base in the beaker.'),
      accent: 'bg-gradient-to-r from-slate-700 to-amber-500',
    },
    {
      id: 'salt', type: 'segmented', label: 'Salt on the shelf', disabled: used, get: (s) => s.saltId, set: 'setSalt',
      options: [
        { value: 'common', label: 'Shares an ion', hint: 'The salt of the weak acid’s anion, the weak base’s cation, or (for HCl) chloride' },
        { value: 'neutral', label: 'Shares none (NaNO₃)', hint: 'A salt with no ion in common with the acid or the base' },
      ],
    },
    {
      id: 'boat', type: 'slider', min: 0, max: 5, step: 0.01,
      label: (s) => `On the balance — ${s.boat.toFixed(2)} g of ${saltOf(s).formula}`, get: (s) => s.boat, set: 'setBoat',
      note: (s) => `${saltOf(s).label}, M = ${saltOf(s).M} g/mol (the label says so — mind the water of crystallisation). ${s.boat > 0 ? `That would be ${sciC(s.boat / saltOf(s).M / (BEAKER_ML / 1000))} mol/L in the beaker.` : ''}`,
      accent: 'bg-gradient-to-r from-slate-700 to-emerald-500',
    },
    { id: 'tip-actions', type: 'actions', items: [
      { id: 'tip', label: 'Tip into the beaker', run: 'tip', tone: 'primary', disabled: (s) => s.boat <= 0 },
      { id: 'fresh-beaker', label: 'Fresh beaker', run: 'freshBeaker', tone: 'ghost', title: 'A clean beaker of the same acid or base, to start again' },
    ] },
    {
      id: 'stirrer', type: 'segmented', label: 'Stirrer', get: (s) => s.stirrer, set: 'setStirrer',
      options: [{ value: 'off', label: 'Off', hint: 'Crystals in still water take minutes' }, { value: 'on', label: 'On', hint: 'The salt dissolves in seconds' }],
    },
    {
      id: 'temperature', type: 'slider', min: 15, max: 40, step: 1,
      label: (s) => `Room — ${s.tempC} °C`, get: (s) => s.tempC, set: 'setTemp',
      accent: 'bg-gradient-to-r from-sky-700 to-rose-600',
    },
    {
      id: 'method', type: 'segmented', label: 'Method', get: (s) => s.method, set: 'setMethod',
      options: [
        { value: 'meter', label: 'pH meter', hint: 'A glass electrode with a response time' },
        { value: 'universal', label: 'Universal', hint: 'Drops of universal indicator in the beaker' },
      ],
    },
    {
      id: 'meter', type: 'segmented', when: isMeter, label: 'Electrode', get: (s) => s.meter, set: 'setMeter',
      options: [{ value: 'out', label: 'Out of the beaker' }, { value: 'in', label: 'In the beaker' }],
    },
    {
      id: 'meterCal', type: 'segmented', when: isMeter, label: 'Meter', get: (s) => s.meterCal, set: 'setMeterCal',
      options: [
        { value: 'calibrated', label: 'Calibrated', hint: 'Two-point calibration on pH 4.01 and 9.18, done this morning' },
        { value: 'none', label: 'Not calibrated', hint: 'Factory slope, no offset' },
      ],
    },
    {
      id: 'drops', type: 'slider', when: isUniversal, min: 0, max: 12, step: 1,
      label: (s) => `Indicator — ${s.drops} drop${s.drops === 1 ? '' : 's'}`, get: (s) => s.drops, set: 'setDrops',
      note: () => 'The dye is itself a weak acid; in a weakly buffered beaker it moves the pH it reports.',
    },
    {
      id: 'chart', type: 'segmented', when: isUniversal, label: 'Match the colour to the chart', get: (s) => String(s.pick ?? ''), set: 'setPick', options: chartOptions,
      note: () => 'Colour is judged by eye: neighbouring patches can look alike.',
    },
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
    {
      id: 'beaker', type: 'readouts',
      items: [
        { id: 'in-beaker', label: 'In the beaker', value: (s) => `${systemOf(s).formula}, ${s.conc.toFixed(2)} M` },
        { id: 'salt-label', label: 'Salt', value: (s) => `${saltOf(s).formula}` },
        { id: 'balance', label: 'On the balance', value: (s) => `${s.boat.toFixed(2)} g` },
        { id: 'dissolved', label: 'Dissolved', value: (s) => `${s.dissolved.toFixed(2)} g  ·  ${sciC(cSalt(s))} M` },
        { id: 'undissolved', label: 'Not yet dissolved', value: (s) => `${s.solid.toFixed(2)} g` },
        { id: 'stirring', label: 'Stirrer', value: (s) => (s.stirrer === 'on' ? 'on' : 'off') },
        { id: 'calibration', label: 'Meter', value: (s) => (s.method !== 'meter' ? 'not in use' : s.meterCal === 'calibrated' ? '2-point calibrated' : 'not calibrated') },
        { id: 'beaker-temp', label: 'Beaker temperature', value: (s) => `${beakerT(s).toFixed(2)} °C`, hint: 'Dissolving these salts takes heat from the solution' },
      ],
    },
    {
      id: 'meter-ph', type: 'hero', when: isMeter, label: 'pH meter',
      value: (s) => { const r = meterReading(s); return r.sensing && r.pH !== null ? r.pH.toFixed(2) : '—'; },
      sub: (s) => { const r = meterReading(s); return r.sensing ? `${r.mV.toFixed(1)} mV · ${r.stable ? 'STABLE' : 'settling…'}` : `electrode ${where(s)}`; },
    },
    {
      id: 'tube-colour', type: 'swatch', when: isUniversal, label: 'The beaker',
      hex: (s) => (s.world.universal ? s.world.universal.colour.hex : '#e9eef5'), sub: (s) => (s.drops ? `${s.drops} drops of universal indicator` : 'no indicator'),
    },
    { id: 'graph', type: 'plot', title: 'pH against the salt added', series: (s) => s.analysis.vsSalt, xLabel: 'c(salt) / mol L⁻¹', yLabel: 'pH' },
    { id: 'graph-ratio', type: 'plot', title: 'pH against log [salt]/[acid or base]', series: (s) => s.analysis.vsRatio, xLabel: 'log₁₀ (c salt / c weak electrolyte)', yLabel: 'pH', height: 150 },
    {
      id: 'result', type: 'readouts',
      items: [
        { id: 'shift', label: 'Biggest pH shift so far', value: (s) => { const v = fit(s, 'shift'); return v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`; } },
        { id: 'slope', label: 'Slope of the second graph', value: (s) => { const v = fit(s, 'slope'); return v === null ? '—' : v.toFixed(2); }, hint: 'Henderson–Hasselbalch: +1 for an acid and its salt, −1 for a base and its salt' },
        { id: 'pk', label: 'pK from your readings', value: (s) => { const v = fit(s, 'pK'); return v === null ? '—' : v.toFixed(2); }, hint: 'pKa of the acid, or pKb of the base, by the worksheet’s arithmetic' },
      ],
    },
  ],

  table: {
    columns: [
      ['beaker', 'Beaker'], ['system', 'In beaker'], ['C', 'C / mol L⁻¹'], ['salt', 'Salt'], ['mass', 'Dissolved / g'], ['csTxt', 'c(salt) / mol L⁻¹'],
      ['method', 'Method'], ['pH', 'pH'], ['H', '[H⁺] = 10⁻ᵖᴴ'], ['alpha', 'α (%)'], ['pK', 'pK'], ['note', 'Notes'],
    ],
    csv: 'XI-CHE-C04-common-ion.csv',
    empty: 'Read the pH of the acid alone, then weigh a salt, tip it in, wait for it to dissolve and read again. The graphs and the pK are worked out from your own rows.',
  },
};

export { NEUTRAL };
export default spec;
