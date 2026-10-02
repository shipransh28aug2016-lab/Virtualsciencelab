/**
 * The interface for XI-CHE-D02, as data. SpecHUD renders it and the generic
 * render check sweeps every control in it.
 */
import {
  useCoCl, CFG, REAGENTS, TUBE_MAX_ML, OFF_SCALE, WAVELENGTHS, statusOf, activeOf, kThermo, totalOf, epsPink, epsBlue,
  unitOf, perUnitMmol, fractionFromA,
} from './engine/cocl.js';
import { CoClBench } from './three/CoClBench.jsx';

const sci = (v) => (v === 0 ? '0' : v >= 0.01 ? v.toFixed(3) : v.toExponential(2));
const info = (s) => activeOf(s).last?.info ?? null;
const reagentOf = (s) => REAGENTS.find((r) => r.id === s.reagent);
const BATH_NAME = { air: 'in the rack', ice: 'in the ice bath', hot: 'in the hot bath' };
const reading = (s) => activeOf(s).obs.A(Number(s.opts.wavelength), Number(s.opts.cell));
const units = (n, r) => `${n} ${unitOf(r)}${n === 1 ? '' : 's'}`;

/* Why the stress does what it does — the mechanism, in words. What it comes to in numbers is the solver's. */
const WHY = {
  hcl: 'Cl⁻ is a reactant, and it enters Q to the FOURTH power: a modest rise in chloride is a huge fall in Q. (The H⁺ that comes with it takes no part.)',
  nacl: 'The same chloride from another salt: Cl⁻ goes up, Q falls, the colour turns blue. But a brine holds only 6.1 M — past that the salt just lies on the bottom.',
  water: 'Dilution thins the chloride, and Q is a fourth-power function of it, so Q rises far above K: the cobalt goes back to the hexaaqua ion, pink.',
  agno3: 'Ag⁺ takes chloride out of solution as white AgCl (a little stays as AgCl₂⁻ in strong chloride). Less Cl⁻ means Q above K, and pink.',
};

export const spec = {
  code: 'XI-CHE-D02',
  title: 'Shift in the [Co(H₂O)₆]²⁺ / Cl⁻ equilibrium',
  subtitle: 'CBSE Class XI · Equilibrium · pink to blue and back: chloride, water, silver and heat; a spectrometer to count it',
  store: useCoCl,
  Scene: CoClBench,
  camera: { position: [0, 1.3, 5.3], fov: 36, target: [0, 0.72, -0.35], min: 1.6, max: 9, polar: [0.35, Math.PI / 2.05] },
  fog: [8, 20],
  glow: 'rgba(96,165,250,0.07)',

  status: statusOf,

  controls: [
    {
      id: 'tube', type: 'segmented', label: 'Tube', get: (s) => s.active, set: 'select',
      options: CFG.tubes.map((t) => ({ value: t.id, label: t.label, hint: `Tube ${t.id}` })),
      note: () => 'Four tubes of 3 mL of the same pink cobalt(II) chloride. Leave one as it is — it is what the others are compared with.',
    },
    {
      id: 'reagent', type: 'segmented', label: 'Dropper', get: (s) => s.reagent, set: 'setReagent',
      options: REAGENTS.map((r) => ({ value: r.id, label: r.short, hint: `${r.formula} — ${r.label}` })),
      note: (s) => `${reagentOf(s).formula}${reagentOf(s).unit === 'pinch' ? '' : ': each drop is 0.05 mL'}.`,
    },
    {
      id: 'drops', type: 'slider', min: 1, max: (s) => reagentOf(s).maxUnits, step: 1, get: (s) => s.drops, set: 'setDrops',
      label: (s) => (reagentOf(s).unit === 'pinch' ? `${units(s.drops, reagentOf(s))} — ${(s.drops * 0.1).toFixed(1)} g` : `${units(s.drops, reagentOf(s))} — ${(s.drops * 0.05).toFixed(2)} mL`),
      accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
      note: () => `The tube holds ${TUBE_MAX_ML} mL: what does not fit runs over the rim.`,
    },
    { id: 'dose-actions', type: 'actions', items: [
      { id: 'add', label: (s) => `Add to tube ${s.active}`, run: 'addPicked', tone: 'primary' },
      { id: 'fresh', label: (s) => `Fresh tube ${s.active}`, run: 'fresh', tone: 'ghost', title: 'Pour it away and fill a clean tube with 3 mL of the cobalt solution' },
    ] },
    {
      id: 'bath', type: 'segmented', label: (s) => `Tube ${s.active} stands`, get: (s) => activeOf(s).bath, set: 'setBath',
      options: [
        { value: 'air', label: 'In the rack', hint: 'Room temperature, 25 °C' },
        { value: 'ice', label: 'Ice bath', hint: 'Ice and water, 0 °C' },
        { value: 'hot', label: 'Hot bath', hint: 'Water kept at 80 °C' },
      ],
      note: () => 'A tube takes a minute or so to come to a bath; the colour follows the temperature.',
    },
    {
      id: 'wavelength', type: 'segmented', label: 'Spectrometer wavelength', get: (s) => s.opts.wavelength, set: 'setWavelength',
      options: WAVELENGTHS.map((w) => ({ value: String(w), label: `${w} nm`, hint: w === 510 ? 'The band of the pink hexaaqua ion' : w === 692 ? 'The strongest band of the blue tetrachloro ion' : 'On the shoulder of the blue band — about four times weaker than the peak' })),
    },
    {
      id: 'cell', type: 'segmented', label: 'Cell', get: (s) => s.opts.cell, set: 'setCell',
      options: [{ value: '1', label: '1 cm', hint: 'The ordinary cuvette' }, { value: '0.1', label: '1 mm', hint: 'A demountable thin cell, for strong colours' }],
      note: () => `The instrument cannot read above A = ${OFF_SCALE}.`,
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
        { id: 'dropper-bottle', label: 'Dropper', value: (s) => reagentOf(s).formula },
        { id: 'next-dose', label: 'Next dose', value: (s) => (reagentOf(s).unit === 'pinch' ? `${units(s.drops, reagentOf(s))} · ${(s.drops * 0.1).toFixed(1)} g` : `${units(s.drops, reagentOf(s))} · ${(s.drops * 0.05).toFixed(2)} mL`) },
        { id: 'next-brings', label: 'Brings in', value: (s) => { const r = reagentOf(s); return r.key ? `${(perUnitMmol(r, r.key) * s.drops).toFixed(2)} mmol ${r.ion}` : 'water only'; } },
      ],
    },
    {
      id: 'spectrometer', type: 'hero', label: 'Spectrometer',
      value: (s) => { const A = reading(s); return A > OFF_SCALE ? 'OVER' : A.toFixed(3); }, unit: 'A',
      sub: (s) => `tube ${s.active} · ${s.opts.wavelength} nm · ${s.opts.cell === '1' ? '1 cm' : '1 mm'} cell · ${activeOf(s).tempC.toFixed(1)} °C`,
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
        { id: 'co-total', label: 'Co(II) in all, mol/L', value: (s) => sci(totalOf(activeOf(s), 'Co')) },
        { id: 'cl-total', label: 'Cl⁻ in all, mol/L', value: (s) => sci(totalOf(activeOf(s), 'Cl')), hint: 'Everything chloride put in — before any of it leaves as AgCl or as salt crystals' },
        { id: 'solid', label: 'Solid in the tube', value: (s) => { const o = activeOf(s).obs; return (o.solids.AgCl ?? 0) > 0 ? 'AgCl, white' : (o.solids.NaCl ?? 0) > 0 ? 'NaCl crystals' : 'none'; } },
        {
          id: 'blue-from-a', label: 'Co as CoCl₄²⁻, from A',
          value: (s) => { const A = reading(s); const x = A > OFF_SCALE ? null : fractionFromA(A, Number(s.opts.wavelength), Number(s.opts.cell), totalOf(activeOf(s), 'Co')); return x === null ? 'off scale' : `${(100 * Math.min(1, Math.max(0, x))).toFixed(0)} %`; },
          hint: 'x = (A/(cℓ) − ε_pink) / (ε_blue − ε_pink), the way the worksheet does it',
        },
        { id: 'eps-pink', label: 'Absorptivity, pink ion', value: (s) => epsPink(Number(s.opts.wavelength)).toFixed(2), hint: 'ε of [Co(H₂O)₆]²⁺ at the chosen wavelength, L mol⁻¹ cm⁻¹ (data sheet)' },
        { id: 'eps-blue', label: 'Absorptivity, blue ion', value: (s) => epsBlue(Number(s.opts.wavelength)).toFixed(1), hint: 'ε of [CoCl₄]²⁻ at the chosen wavelength, L mol⁻¹ cm⁻¹ (data sheet)' },
      ],
    },
    {
      id: 'quotient', type: 'readouts',
      items: [
        { id: 'q', label: 'Q just after the dose', value: (s) => { const i = info(s); return i ? i.Q.toExponential(2) : '—'; }, hint: '[CoCl₄²⁻] / ([Co(H₂O)₆²⁺][Cl⁻]⁴), with the cobalt equilibrium not yet moved' },
        { id: 'k', label: 'K at this temperature', value: (s) => kThermo(activeOf(s).tempC).toExponential(2), hint: 'Effective K of the overall step, van ’t Hoff from 25 °C' },
        { id: 'qk', label: 'Q / K', value: (s) => { const i = info(s); return i ? i.ratio.toPrecision(2) : '—'; } },
        { id: 'move', label: 'The system moves', value: (s) => { const i = info(s); return i ? (i.direction === 'right' ? '→ right (bluer)' : '← left (pinker)') : '—'; } },
      ],
    },
    {
      id: 'why', type: 'callout', when: (s) => Boolean(info(s)), tone: () => 'info',
      text: (s) => WHY[info(s).reagent] ?? '',
    },
    { id: 'graph', type: 'plot', title: 'Blue-to-pink ratio against chloride', series: (s) => s.analysis.series, xLabel: 'log₁₀ [Cl⁻]', yLabel: 'log₁₀ ([CoCl₄²⁻]/[Co(H₂O)₆²⁺])', height: 170 },
    {
      id: 'result', type: 'readouts',
      items: [
        { id: 'slope', label: 'Slope of the graph', value: (s) => (s.analysis.slope === null ? '—' : s.analysis.slope.toFixed(2)), hint: 'The power of [Cl⁻] in K: how many chlorides each cobalt takes in' },
        { id: 'kc', label: 'Kc from your readings', value: (s) => (s.analysis.Kc === null ? '—' : s.analysis.Kc.toExponential(2)), hint: 'R/[Cl⁻]⁴ at room temperature' },
        { id: 'judged', label: 'Shifts you have judged', value: (s) => s.analysis.judged },
        { id: 'agree', label: 'Q/K agreed with the colour', value: (s) => (s.analysis.judged ? `${s.analysis.agree} of ${s.analysis.judged}` : '—') },
      ],
    },
  ],

  table: {
    columns: [
      ['tube', 'Tube'], ['added', 'Added'], ['T', 'T / °C'], ['nm', 'λ / nm'], ['cm', 'Cell / cm'], ['A', 'A'], ['blue', 'Blue fraction'], ['colour', 'Colour'],
      ['Cl', 'Cl⁻ in all / M'], ['QK', 'Q / K'], ['KT', 'K(T) / K(25 °C)'], ['predicted', 'Predicted'], ['observed', 'Observed'], ['Kc', 'Kc'], ['note', 'Notes'],
    ],
    csv: 'XI-CHE-D02-cobalt-chloride.csv',
    empty: 'Record the pink tube, then give another chloride, water, silver or a bath and record it. The graph of blue to pink against chloride is drawn from your own readings.',
  },
};

export default spec;
