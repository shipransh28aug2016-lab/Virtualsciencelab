/**
 * The interface for XI-CHE-D01, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import {
  useFeScn, CFG, REAGENTS, TUBE_MAX_ML, EPS_FESCN, statusOf, activeOf, kThermo, fescnFromA, totalOf,
} from './engine/fescn.js';
import { FeScnBench } from './three/FeScnBench.jsx';

const sci = (v) => (v === 0 ? '0' : v >= 0.01 ? v.toFixed(3) : v.toExponential(2));
const info = (s) => activeOf(s).last?.info ?? null;
const BATH_NAME = { air: 'in the rack', ice: 'in the ice bath', hot: 'in the hot bath' };

/* Why the stress does what it does — the mechanism, in words. What it comes to in numbers is the solver's. */
const WHY = {
  fecl3: 'Fe³⁺ is a reactant: more of it in the denominator of Q, so Q falls below K.',
  kscn: 'SCN⁻ is a reactant: more of it in the denominator of Q, so Q falls below K.',
  oxalate: 'Oxalate holds Fe³⁺ about 10²⁰ times more tightly than thiocyanate does (log β₃ = 20.2). It empties the denominator of Q, which jumps above K.',
  hno3: 'H⁺ is not in the equation, but Fe³⁺ is hydrolysed: FeOH²⁺ + H⁺ ⇌ Fe³⁺. Acid pulls iron back out of FeOH²⁺, so there is more free Fe³⁺ — and Q falls below K.',
  water: 'Dilution thins everything, but Q has two particles beneath and one above, so it rises above K — and the iron hydrolyses a little more.',
};

export const spec = {
  code: 'XI-CHE-D01',
  title: 'Shift in the Fe³⁺ / SCN⁻ equilibrium',
  subtitle: 'CBSE Class XI · Equilibrium · droppers, tubes and two baths; every colour computed from what is in the tube',
  store: useFeScn,
  Scene: FeScnBench,
  camera: { position: [0, 1.3, 5.3], fov: 36, target: [0, 0.72, -0.35], min: 1.6, max: 9, polar: [0.35, Math.PI / 2.05] },
  fog: [8, 20],
  glow: 'rgba(248,113,113,0.07)',

  status: statusOf,

  controls: [
    {
      id: 'tube', type: 'segmented', label: 'Tube', get: (s) => s.active, set: 'select',
      options: CFG.tubes.map((t) => ({ value: t.id, label: t.label, hint: `Tube ${t.id}` })),
      note: () => 'Four tubes of the same reference mixture. Leave one as it is — it is what the others are compared with.',
    },
    {
      id: 'reagent', type: 'segmented', label: 'Dropper', get: (s) => s.reagent, set: 'setReagent',
      options: REAGENTS.map((r) => ({ value: r.id, label: r.short, hint: `${r.formula} — ${r.label}` })),
      note: (s) => `${REAGENTS.find((r) => r.id === s.reagent)?.formula}: each drop is 0.05 mL.`,
    },
    {
      id: 'drops', type: 'slider', min: 1, max: 20, step: 1, get: (s) => s.drops, set: 'setDrops',
      label: (s) => `${s.drops} drop${s.drops === 1 ? '' : 's'} — ${(s.drops * 0.05).toFixed(2)} mL`,
      accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
      note: () => `The tube holds ${TUBE_MAX_ML} mL: what does not fit runs over the rim.`,
    },
    { id: 'dose-actions', type: 'actions', items: [
      { id: 'add', label: (s) => `Add to tube ${s.active}`, run: 'addPicked', tone: 'primary' },
      { id: 'fresh', label: (s) => `Fresh tube ${s.active}`, run: 'fresh', tone: 'ghost', title: 'Pour it away and fill a clean tube with the reference mixture' },
    ] },
    {
      id: 'bath', type: 'segmented', label: (s) => `Tube ${s.active} stands`, get: (s) => activeOf(s).bath, set: 'setBath',
      options: [
        { value: 'air', label: 'In the rack', hint: 'Room temperature, 25 °C' },
        { value: 'ice', label: 'Ice bath', hint: 'Ice and water, 0 °C' },
        { value: 'hot', label: 'Hot bath', hint: 'Water kept at 60 °C' },
      ],
      note: () => 'A tube takes a minute or so to come to a bath; the colour follows the temperature.',
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
      id: 'dropper', type: 'readouts',
      items: [
        { id: 'dropper-bottle', label: 'Dropper', value: (s) => REAGENTS.find((r) => r.id === s.reagent).formula },
        { id: 'next-dose', label: 'Next dose', value: (s) => `${s.drops} drop${s.drops === 1 ? '' : 's'} · ${(s.drops * 0.05).toFixed(2)} mL` },
        {
          id: 'next-brings', label: 'Brings in',
          value: (s) => { const r = REAGENTS.find((q) => q.id === s.reagent); return r.key ? `${(r.conc[r.key] * s.drops * 0.05).toFixed(3)} mmol ${r.ion}` : 'water only'; },
        },
      ],
    },
    {
      id: 'colorimeter', type: 'hero', label: 'Colorimeter',
      value: (s) => activeOf(s).obs.A447.toFixed(3), unit: 'A',
      sub: (s) => `tube ${s.active} · 447 nm · 1 cm cell · ${activeOf(s).tempC.toFixed(1)} °C`,
    },
    {
      id: 'tube-colour', type: 'swatch', label: 'Tube colour',
      hex: (s) => activeOf(s).obs.colour.hex, sub: (s) => `Tube ${s.active}: ${activeOf(s).obs.name}, ${BATH_NAME[activeOf(s).bath]}`,
    },
    {
      id: 'tube', type: 'readouts',
      items: [
        { id: 'volume', label: 'Volume', value: (s) => `${activeOf(s).content.volumeMl.toFixed(2)} mL` },
        { id: 'temperature', label: 'Temperature', value: (s) => `${activeOf(s).tempC.toFixed(1)} °C` },
        { id: 'fe-total', label: 'Fe(III) in all, mol/L', value: (s) => sci(totalOf(activeOf(s), 'Fe')), hint: 'Everything iron in the tube, as Fe³⁺, FeOH²⁺, the complex …' },
        { id: 'scn-total', label: 'SCN⁻ in all, mol/L', value: (s) => sci(totalOf(activeOf(s), 'SCN')) },
        { id: 'ox-total', label: 'Oxalate in all, mol/L', value: (s) => sci(totalOf(activeOf(s), 'ox')) },
        { id: 'nitrate', label: 'HNO₃ added, mol/L', value: (s) => sci(totalOf(activeOf(s), 'NO3')) },
        { id: 'fescn', label: 'FeSCN²⁺ from A', value: (s) => sci(fescnFromA(activeOf(s).obs.A447)), hint: `Beer–Lambert, [FeSCN²⁺] = A / (ε ℓ), with ε = ${Math.round(EPS_FESCN)} L mol⁻¹ cm⁻¹ at 447 nm and ℓ = 1 cm` },
        { id: 'complexed', label: 'SCN⁻ as FeSCN²⁺', value: (s) => `${Math.min(100, (100 * fescnFromA(activeOf(s).obs.A447)) / Math.max(1e-12, totalOf(activeOf(s), 'SCN'))).toFixed(0)} %`, hint: 'From the absorbance: it includes any other colour at 447 nm' },
      ],
    },
    {
      id: 'quotient', type: 'readouts',
      items: [
        { id: 'q', label: 'Q just after the dose', value: (s) => { const i = info(s); return i ? i.Q.toPrecision(3) : '—'; }, hint: '[FeSCN²⁺] / ([Fe³⁺][SCN⁻]) in activities, with the complex not yet moved' },
        { id: 'k', label: 'K at this temperature', value: (s) => kThermo(activeOf(s).tempC).toFixed(0), hint: 'K° of Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺ — van ’t Hoff from 25 °C' },
        { id: 'qk', label: 'Q / K', value: (s) => { const i = info(s); return i ? i.ratio.toPrecision(2) : '—'; } },
        { id: 'move', label: 'The system moves', value: (s) => { const i = info(s); return i ? (i.direction === 'right' ? '→ right (deeper)' : '← left (paler)') : '—'; } },
      ],
    },
    {
      id: 'why', type: 'callout', when: (s) => Boolean(info(s)), tone: () => 'info',
      text: (s) => WHY[info(s).reagent] ?? '',
    },
    { id: 'graph', type: 'plot', title: 'Colour against drops added', series: (s) => s.analysis.series, xLabel: 'drops added', yLabel: '(A − A₀) / A₀', height: 160 },
    {
      id: 'result', type: 'readouts',
      items: [
        { id: 'judged', label: 'Shifts you have judged', value: (s) => s.analysis.judged },
        { id: 'agree', label: 'Q/K agreed with the colour', value: (s) => (s.analysis.judged ? `${s.analysis.agree} of ${s.analysis.judged}` : '—') },
        { id: 'kc', label: 'Kc from your readings', value: (s) => (s.analysis.Kc === null ? '—' : s.analysis.Kc.toFixed(0)), hint: 'x / ((Fe₀ − x)(SCN₀ − x)) at room temperature, as the worksheet does it — which ignores the iron’s hydrolysis' },
      ],
    },
  ],

  table: {
    columns: [
      ['tube', 'Tube'], ['added', 'Added'], ['T', 'T / °C'], ['A', 'A (447 nm)'], ['colour', 'Colour'], ['QK', 'Q / K'], ['KT', 'K(T) / K(25 °C)'],
      ['predicted', 'Predicted'], ['observed', 'Observed'], ['Kc', 'Kc'], ['note', 'Notes'],
    ],
    csv: 'XI-CHE-D01-iron-thiocyanate.csv',
    empty: 'Record the reference tube, then give another a reagent or a bath and record it: the table sets what the quotient predicted against what the colour did.',
  },
};

export default spec;
