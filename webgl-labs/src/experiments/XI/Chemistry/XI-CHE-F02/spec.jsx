/**
 * The interface for XI-CHE-F02, as data. SpecHUD renders it and the generic render check sweeps
 * every control in it. Getters are total and return primitives.
 */
import { useMemo } from 'react';
import { describeSolids, describeSolution, describe } from '../../../../shared/qualitative/chemistry.js';
import { GLASS } from '../../../../shared/ui/kit.jsx';
import { useLassaigne } from './engine/useLassaigne.js';
import {
  CFG, SHELF, REAGENT, SAMPLES, TUBE_IDS, NA_MOLAR, statusOf, activeOf, compoundOfSample, sodiumState, modelEvidence, elementsOf,
} from './engine/lassaigne.js';
import { LassaigneBench } from './three/LassaigneBench.jsx';

const reagentOf = (s) => REAGENT[s.reagent] ?? SHELF[0];
const obsOf = (s) => activeOf(s).obs;
const STATE_WORD = { solid: 'solid, still cold', molten: 'molten, a silvery globule', vapour: 'fuming: sodium vapour', spent: 'spent', gone: 'all gone' };
const gasWord = (s) => {
  const t = activeOf(s); const o = t.obs;
  const live = o.gas * Math.exp(-Math.max(0, s.elapsed - Math.max(0, t.gasAt)) / (o.gasTau || 1));
  if (t.gasAt < -1e5 || live < 0.04) return 'none seen';
  return o.gasKind === 'HCN' ? 'a gas: hydrogen cyanide (poison — fume cupboard)' : o.gasKind === 'H2S' ? 'a gas: hydrogen sulfide (rotten eggs, poison)' : 'a gas is coming off';
};
const YESNO = [{ value: '', label: '—' }, { value: 'present', label: 'present' }, { value: 'absent', label: 'absent' }];

function ModelTests({ useStore }) {
  const sample = useStore((s) => s.ctx.sample);
  const revealed = useStore((s) => s.revealed);
  const compound = compoundOfSample(sample);
  const ev = useMemo(() => (revealed ? modelEvidence(compound) : null), [revealed, compound]);
  if (!ev) return null;
  const el = elementsOf(compound);
  const block = (title, groups) => (
    <div className="mt-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</div>
      {groups.map((g, i) => (
        <ul key={i} className="mt-1 space-y-0.5 border-l border-white/15 pl-2 text-[12px] leading-snug text-slate-200">
          {g.map((st, j) => <li key={j}>{st.text}</li>)}
        </ul>
      ))}
    </div>
  );
  return (
    <div className={`${GLASS} p-3`} data-probe="model-tests">
      <div className="text-sm font-semibold text-slate-50">Sample {sample}: {compound.name}, {compound.formula}</div>
      <div className="text-[12px] text-slate-300">Contains {[el.N && 'nitrogen', el.S && 'sulphur', el.Cl && 'chlorine'].filter(Boolean).join(', ') || 'none of the three'}. The standard tests on an extract made with a good excess of sodium (120 mg), from the solver:</div>
      {ev.N ? block('Nitrogen: FeSO₄, boil, acid, FeCl₃', ev.N) : null}
      {ev.S ? block('Sulphur: nitroprusside; lead acetate', ev.S) : null}
      {block('Halogen: HNO₃, boil, AgNO₃', ev.X)}
      {ev.X0 ? block('The same without boiling with nitric acid (the mistake)', ev.X0) : null}
    </div>
  );
}

export const spec = {
  code: 'XI-CHE-F02',
  title: "Lassaigne's test for nitrogen, sulphur and chlorine",
  subtitle: 'CBSE Class XI · Qualitative analysis · a fusion tube, sodium and a burner; the extract is made from the compound and the tests are solved from what is in it',
  store: useLassaigne,
  Scene: LassaigneBench,
  camera: { position: [0.3, 1.5, 6.2], fov: 38, target: [0, 0.85, 0], min: 2, max: 10, polar: [0.35, Math.PI / 2.05] },
  fog: [9, 22],
  glow: 'rgba(244,114,182,0.07)',

  status: statusOf,

  controls: [
    {
      id: 'sample', type: 'segmented', label: 'Unknown organic compound, sample', get: (s) => String(s.ctx.sample), set: 'setSample',
      options: Array.from({ length: SAMPLES }, (_, i) => ({ value: String(i + 1), label: String(i + 1), hint: `Sample ${i + 1}: the label does not say what it is` })),
      note: () => 'Six samples. Changing sample starts a new fusion tube and empties the tubes; the notebook is kept.',
    },
    {
      id: 'source', type: 'segmented', label: 'What goes in the tubes', get: (s) => s.ctx.source, set: 'setSource',
      options: [{ value: 'extract', label: 'The extract', hint: 'The Lassaigne extract, once you have made it' }, { value: 'water', label: 'Compound in water, not fused', hint: 'Test the compound directly: no ions, no result' }],
    },
    {
      id: 'sodium', type: 'slider', min: 10, max: 150, step: 5, get: (s) => s.fz.naMg, set: 'setSodium', disabled: (s) => s.fz.started,
      label: (s) => `Sodium — ${s.fz.naMg} mg (${(s.fz.naMg / NA_MOLAR).toFixed(1)} mmol)`, accent: 'bg-gradient-to-r from-slate-700 to-amber-400',
      note: (s) => (s.fz.started ? 'Fixed once the burner has been lit.' : 'A pea-sized piece is 50–100 mg. Too little and the nitrogen and sulphur are not both converted; too much is dangerous at the water.'),
    },
    {
      id: 'sample-mg', type: 'slider', min: 20, max: 100, step: 5, get: (s) => s.fz.sampleMg, set: 'setSampleMg', disabled: (s) => s.fz.added,
      label: (s) => `Compound — ${s.fz.sampleMg} mg`, accent: 'bg-gradient-to-r from-slate-700 to-rose-400',
    },
    { id: 'fusion-actions', type: 'actions', items: [
      { id: 'flame', label: (s) => (s.fz.flame ? 'Take the burner away' : 'Light the burner under the tube'), run: 'toggleFlame', tone: 'primary', disabled: (s) => s.fz.plunged },
      { id: 'add-compound', label: 'Drop the compound on the sodium', run: 'addCompound', tone: 'warn', disabled: (s) => s.fz.added || s.fz.plunged },
      { id: 'plunge', label: 'Plunge the hot tube into water', run: 'plunge', tone: 'warn', disabled: (s) => s.fz.plunged },
      { id: 'filter', label: 'Crush, boil and filter', run: 'filter', tone: 'good', disabled: (s) => !s.fz.plunged || s.fz.filtered },
      { id: 'new-fusion', label: 'A new fusion tube', run: 'newFusion', tone: 'ghost' },
    ] },
    {
      id: 'tube', type: 'segmented', label: 'Tube', get: (s) => s.active, set: 'select',
      options: TUBE_IDS.map((id) => ({ value: id, label: id, hint: `Tube ${id}` })),
    },
    {
      id: 'reagent', type: 'select', label: 'Reagent', get: (s) => s.reagent, set: 'setReagent',
      options: SHELF.map((r) => ({ value: r.id, label: `${r.short} — ${r.formula}` })),
    },
    {
      id: 'drops', type: 'slider', min: 1, max: (s) => reagentOf(s).maxUnits ?? 40, step: 1, get: (s) => s.drops, set: 'setDrops',
      label: (s) => `${s.drops} drop${s.drops === 1 ? '' : 's'} — ${(s.drops * 0.05).toFixed(2)} mL`, accent: 'bg-gradient-to-r from-slate-700 to-emerald-500',
      note: () => 'A drop is 0.05 mL. The extract is strongly alkaline, so what an acid or an iron salt does to it depends on how much of it you add.',
    },
    { id: 'dose-actions', type: 'actions', items: [
      { id: 'add', label: (s) => `Add to tube ${s.active}`, run: 'addPicked', tone: 'primary' },
      { id: 'fresh', label: (s) => `Fresh portion in tube ${s.active}`, run: 'freshTube', tone: 'ghost', title: '2 mL more of the extract, while there is any' },
    ] },
    {
      id: 'bath', type: 'segmented', label: (s) => `Tube ${s.active} stands`, get: (s) => activeOf(s).bath, set: 'setBath',
      options: [
        { value: 'air', label: 'In the rack', hint: 'Room temperature' },
        { value: 'ice', label: 'Ice bath', hint: '2 °C' },
        { value: 'hot', label: 'Boiling water', hint: 'A bath at 100 °C: boiling drives off HCN and H₂S from an acid extract' },
      ],
      note: () => 'Boiling takes a minute to get going and some minutes to finish; the clock speeds it up.',
    },
    {
      id: 'nitrogen', type: 'select', label: 'Nitrogen is', get: (s) => s.nitrogen, set: 'setNitrogen', options: YESNO,
    },
    {
      id: 'sulphur', type: 'select', label: 'Sulphur is', get: (s) => s.sulphur, set: 'setSulphur', options: YESNO,
    },
    {
      id: 'halogen', type: 'select', label: 'Chlorine (a halogen) is', get: (s) => s.halogen, set: 'setHalogen', options: YESNO,
    },
    { id: 'answer-actions', type: 'actions', items: [
      { id: 'check', label: 'Check my answer', run: 'check', tone: 'good' },
      { id: 'reveal', label: 'Show the standard tests', run: 'reveal', tone: 'ghost', disabled: (s) => s.tries === 0 },
    ] },
    {
      id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
      options: [{ value: '1', label: '×1' }, { value: '4', label: '×4' }, { value: '10', label: '×10' }, { value: '30', label: '×30' }],
    },
    { id: 'record-actions', type: 'actions', items: [
      { id: 'record', label: (s) => `Record tube ${s.active}`, run: 'record', tone: 'good' },
      { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
    ] },
  ],

  instruments: [
    {
      id: 'fusion-T', type: 'hero', label: 'Fusion tube', value: (s) => s.fz.T.toFixed(0), unit: '°C',
      sub: (s) => (s.fz.plunged ? 'plunged into water' : `sodium ${STATE_WORD[sodiumState(s.fz)]}${s.fz.flame ? ' · burner on' : ''}`),
    },
    {
      id: 'fusion', type: 'readouts',
      items: [
        { id: 'sample-look', label: 'Sample on the bench', value: (s) => `${s.ctx.sample}: ${compoundOfSample(s.ctx.sample).form}` },
        { id: 'na-left', label: 'Sodium in the tube', value: (s) => `${(s.fz.na * NA_MOLAR).toFixed(0)} mg`, hint: 'It is lost as vapour from a tube kept hot' },
        { id: 'compound-state', label: 'Compound', value: (s) => (s.fz.added ? `${s.fz.sampleMg} mg on the sodium${s.fz.addedCold ? ' (put on cold)' : ''}` : `${s.fz.sampleMg} mg weighed out, not yet added`) },
        { id: 'progress', label: 'Fused', value: (s) => (s.fz.added ? `${(100 * s.fz.progress).toFixed(0)} %` : '—') },
        { id: 'extract-left', label: 'Extract left', value: (s) => (s.fz.filtered ? `${s.fz.extractLeft.toFixed(0)} mL` : s.fz.plunged ? 'not yet filtered' : '—') },
      ],
    },
    {
      id: 'dropper', type: 'readouts',
      items: [
        { id: 'dropper-bottle', label: 'Reagent', value: (s) => reagentOf(s).formula },
        { id: 'next-dose', label: 'Next dose', value: (s) => `${s.drops} drop${s.drops === 1 ? '' : 's'} · ${(s.drops * 0.05).toFixed(2)} mL` },
        { id: 'done-so-far', label: 'Done to this tube', value: (s) => Object.entries(activeOf(s).doses).filter(([, n]) => n > 0).map(([id, n]) => `${n}× ${REAGENT[id].short}`).join(', ') || 'nothing yet' },
      ],
    },
    {
      id: 'tube-colour', type: 'swatch', label: 'Tube contents', hex: (s) => (obsOf(s).volumeMl > 0.01 ? obsOf(s).colour.hex : '#f4f6fa'),
      sub: (s) => `Tube ${s.active}: ${describe(obsOf(s))}`,
    },
    {
      id: 'tube-view', type: 'readouts',
      items: [
        { id: 'view-solution', label: 'Solution', value: (s) => (obsOf(s).volumeMl > 0.01 ? describeSolution(obsOf(s)) : 'no liquid') },
        { id: 'view-precipitate', label: 'Precipitate', value: (s) => describeSolids(obsOf(s)) },
        { id: 'view-gas', label: 'Gas', value: gasWord },
        { id: 'view-ph', label: 'pH (universal paper)', value: (s) => (obsOf(s).volumeMl > 0.01 ? String(Math.round(obsOf(s).pH)) : '—') },
        { id: 'view-tube', label: 'Tube', value: (s) => `${s.active}, ${{ air: 'in the rack', ice: 'in the ice bath', hot: 'in the boiling-water bath' }[activeOf(s).bath]}` },
        { id: 'view-temp', label: 'Temperature', value: (s) => `${activeOf(s).tempC.toFixed(0)} °C` },
        { id: 'view-volume', label: 'Liquid in the tube', value: (s) => `${activeOf(s).content.volumeMl.toFixed(2)} mL` },
      ],
    },
    {
      id: 'answer', type: 'readouts',
      items: [
        { id: 'tests-run', label: 'Different tests recorded', value: (s) => s.analysis.tests },
        { id: 'your-answer', label: 'Your conclusion', value: (s) => `N ${s.nitrogen || '?'}, S ${s.sulphur || '?'}, halogen ${s.halogen || '?'}` },
        { id: 'verdict', label: 'Verdict', value: (s) => (s.result ? (s.result.both ? 'all three right' : `${3 - s.result.wrong.length} of 3 right`) : 'not yet checked') },
      ],
    },
    { id: 'model', type: 'custom', Component: ModelTests, when: (s) => s.revealed },
  ],

  table: {
    columns: [['sample', 'Sample'], ['tube', 'Tube'], ['test', 'Test'], ['observation', 'Observation']],
    csv: 'XI-CHE-F02-lassaigne.csv',
    empty: 'Fuse the sample, plunge and filter; then test portions of the extract and record what you see. The fusion writes its own line.',
  },
};

void CFG;
export default spec;
