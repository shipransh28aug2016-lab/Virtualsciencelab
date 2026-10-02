/**
 * The interface for XI-CHE-F01, as data. SpecHUD renders it and the generic render check sweeps
 * every control in it. Getters are total (SpecHUD reads a control's value even while it is hidden)
 * and return primitives.
 */
import { useMemo } from 'react';
import { REAGENTS } from '../../../../shared/qualitative/ions.js';
import { describeSolids, describeSolution, describe, solveContent } from '../../../../shared/qualitative/chemistry.js';
import { GLASS } from '../../../../shared/ui/kit.jsx';
import { useSalt } from './engine/useSalt.js';
import { CFG, SAMPLE, REAGENT, statusOf, activeOf, tubeOf, flameNow, saltOfBottle, CATIONS, ANIONS, modelEvidence, identity, limeWaterTest, TUBE_IDS, BOTTLES } from './engine/salt.js';
import { SaltBench } from './three/SaltBench.jsx';

const ALL = [SAMPLE, ...REAGENTS];
const reagentOf = (s) => REAGENT[s.reagent] ?? SAMPLE;
const unitOf = (r) => (r.kind === 'sample' ? 'pinch' : 'drop');
const obsOf = (s) => activeOf(s).obs;
const gasWord = (s) => {
  const t = activeOf(s); const o = t.obs;
  const live = o.gas * Math.exp(-Math.max(0, s.elapsed - Math.max(0, t.gasAt)) / (o.gasTau || 1));
  if (t.gasAt < -1e5 || live < 0.04) return 'none seen';
  return o.gasKind === 'CO2' ? 'colourless, odourless bubbles' : 'a gas is coming off';
};
const ringWord = (o) => (o.ring ? 'a brown ring at the junction of the two liquids' : o.layer ? 'a layer of conc. acid below' : '');
const lastRows = (s, kind) => s.log.filter((r) => r.kind === kind).at(-1)?.observation ?? 'not tried';

/** The model tests, from the solver, after an attempt: what each standard test would have shown for the salt that is on the bench. */
function ModelTests({ useStore }) {
  const bottle = useStore((s) => s.ctx.bottle);
  const revealed = useStore((s) => s.revealed);
  const ev = useMemo(() => (revealed ? modelEvidence(saltOfBottle(bottle)) : null), [bottle, revealed]);
  const salt = saltOfBottle(bottle);
  const lime = useMemo(() => {
    if (!revealed || salt.anion !== 'co3') return null;
    const g = ev.anion[0].at(-1);
    return g?.event ? limeWaterTest(g.event.mmol) : null;
  }, [revealed, salt, ev]);
  if (!ev) return null;
  const id = identity(salt);
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
      <div className="text-sm font-semibold text-slate-50">Bottle {bottle}: {id.name}, {id.formula}</div>
      <div className="text-[12px] text-slate-300">cation {id.cation}, anion {id.anion}. The standard tests on a fresh portion each, as the solver gives them:</div>
      {block(`Evidence for ${id.cation}`, ev.cation)}
      {block(`Evidence for ${id.anion}`, ev.anion)}
      {lime ? <div className="mt-2 text-[12px] text-slate-200">Lime water, the gas from the acid test led through it: {lime.text}.</div> : null}
    </div>
  );
}

export const spec = {
  code: 'XI-CHE-F01',
  title: 'Salt analysis: one cation and one anion',
  subtitle: 'CBSE Class XI · Qualitative analysis · every precipitate, colour and gas is solved from the ions in the tube; the flame is an emission spectrum',
  store: useSalt,
  Scene: SaltBench,
  camera: { position: [0, 1.55, 6.6], fov: 38, target: [0, 0.78, 0], min: 2, max: 10, polar: [0.35, Math.PI / 2.05] },
  fog: [9, 22],
  glow: 'rgba(52,211,153,0.07)',

  status: statusOf,

  controls: [
    {
      id: 'bottle', type: 'segmented', label: 'Unknown salt, bottle', get: (s) => String(s.ctx.bottle), set: 'setBottle',
      options: Array.from({ length: BOTTLES }, (_, i) => ({ value: String(i + 1), label: String(i + 1), hint: `Bottle ${i + 1}: the label does not say what is in it` })),
      note: () => 'Each bottle holds a different salt, one cation and one anion. Changing bottle makes up every tube afresh from it.',
    },
    { id: 'look', type: 'actions', items: [{ id: 'look-salt', label: 'Look at the salt', run: 'look', tone: 'ghost', title: 'Colour and form of the solid: the first clue' }] },
    {
      id: 'tube', type: 'segmented', label: 'Tube', get: (s) => s.active, set: 'select',
      options: TUBE_IDS.map((id) => ({ value: id, label: id, hint: `Tube ${id}: 3 mL of the original solution to begin with` })),
      note: () => 'Six tubes of the original solution (0.1 M in the cation). Tube L, on the right, is lime water.',
    },
    {
      id: 'reagent', type: 'select', label: 'Reagent', get: (s) => s.reagent, set: 'setReagent',
      options: ALL.map((r) => ({ value: r.id, label: r.kind === 'sample' ? 'A pinch of the salt (solid)' : `${r.short} — ${r.formula}` })),
    },
    {
      id: 'drops', type: 'slider', min: 1, max: (s) => reagentOf(s).maxUnits ?? 20, step: 1, get: (s) => s.drops, set: 'setDrops',
      label: (s) => { const r = reagentOf(s); return r.kind === 'sample' ? `${s.drops} pinch${s.drops === 1 ? '' : 'es'} — ${s.drops * 0.1} g` : `${s.drops} drop${s.drops === 1 ? '' : 's'} — ${(s.drops * 0.05).toFixed(2)} mL`; },
      accent: 'bg-gradient-to-r from-slate-700 to-emerald-500',
      note: () => 'A drop is 0.05 mL. “Excess” is a few mL: add in steps and look after each. A tube holds 15 mL; more runs over the rim.',
    },
    { id: 'dose-actions', type: 'actions', items: [
      { id: 'add', label: (s) => `Add to tube ${s.active}`, run: 'addPicked', tone: 'primary' },
      { id: 'fresh', label: (s) => `Fresh tube ${s.active}`, run: 'fresh', tone: 'ghost', title: 'Pour it away and fill a clean tube with 3 mL of the original solution' },
      { id: 'tip', label: (s) => `Empty tube ${s.active}`, run: 'tip', tone: 'ghost', title: 'A dry tube, for trying the solid with an acid' },
    ] },
    {
      id: 'bath', type: 'segmented', label: (s) => `Tube ${s.active} stands`, get: (s) => activeOf(s).bath, set: 'setBath',
      options: [
        { value: 'air', label: 'In the rack', hint: 'Room temperature' },
        { value: 'ice', label: 'Ice bath', hint: '2 °C' },
        { value: 'hot', label: 'Boiling water', hint: 'A water bath at 96 °C: some tests need the heat' },
      ],
      note: () => 'A tube takes about a minute to come to a bath. Ammonia leaves a hot alkaline solution quickly; some precipitates dissolve when hot.',
    },
    { id: 'gas-actions', type: 'actions', items: [
      { id: 'litmus-red', label: 'Red litmus', run: 'holdLitmus', args: ['red'], tone: 'ghost', title: 'Moist red litmus held at the mouth of the tube' },
      { id: 'litmus-blue', label: 'Blue litmus', run: 'holdLitmus', args: ['blue'], tone: 'ghost', title: 'Moist blue litmus held at the mouth of the tube' },
      { id: 'smell', label: 'Smell (waft)', run: 'smell', tone: 'ghost', title: 'Waft the air towards the nose with a hand — never sniff directly' },
      { id: 'rod', label: 'HCl rod', run: 'hclRod', tone: 'ghost', title: 'A glass rod wet with conc. HCl at the mouth of the tube' },
      { id: 'delivery', label: (s) => (s.delivery ? `Disconnect lime water (from ${s.delivery})` : 'Connect lime water'), run: 'toggleDelivery', tone: 'warn', title: 'Stopper the active tube and lead its gas through lime water (tube L)' },
      { id: 'shake', label: (s) => `Shake tube ${s.active}`, run: 'shake', tone: 'warn', title: 'Mixes in a layer of conc. acid — and ruins a brown ring' },
    ] },
    {
      id: 'flame-hcl', type: 'segmented', label: 'Wire dipped in conc. HCl first?', get: (s) => s.loop.hcl, set: 'setLoopHcl',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes', hint: 'Makes the chloride, which is volatile in the flame' }],
    },
    {
      id: 'flame-filter', type: 'segmented', label: 'Look at the flame', get: (s) => s.loop.filter, set: 'setFilter',
      options: [{ value: 'none', label: 'Directly' }, { value: 'cobalt', label: 'Through cobalt glass', hint: 'Absorbs the sodium yellow' }],
    },
    { id: 'flame-actions', type: 'actions', items: [
      { id: 'flame', label: (s) => `Flame test on tube ${s.active}`, run: 'flameTest', tone: 'primary', title: 'Dip the wire in the tube and hold it in the flame' },
      { id: 'clean', label: 'Clean the wire', run: 'cleanWire', tone: 'ghost', title: 'Conc. HCl, then the flame: the last sample goes' },
    ] },
    {
      id: 'cation', type: 'select', label: 'The cation is', get: (s) => s.cation, set: 'setCation',
      options: [{ value: '', label: '— choose —' }, ...Object.entries(CATIONS).map(([k, v]) => ({ value: k, label: v }))],
    },
    {
      id: 'anion', type: 'select', label: 'The anion is', get: (s) => s.anion, set: 'setAnion',
      options: [{ value: '', label: '— choose —' }, ...Object.entries(ANIONS).map(([k, v]) => ({ value: k, label: v }))],
    },
    { id: 'answer-actions', type: 'actions', items: [
      { id: 'check', label: 'Check my answer', run: 'check', tone: 'good' },
      { id: 'reveal', label: 'Show the standard tests', run: 'reveal', tone: 'ghost', title: 'After an attempt: what each standard test shows for this salt', disabled: (s) => s.tries === 0 },
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
      id: 'dropper', type: 'readouts',
      items: [
        { id: 'dropper-bottle', label: 'Reagent', value: (s) => reagentOf(s).formula },
        { id: 'next-dose', label: 'Next dose', value: (s) => { const r = reagentOf(s); return r.kind === 'sample' ? `${s.drops} pinch${s.drops === 1 ? '' : 'es'} · ${s.drops * 100} mg` : `${s.drops} drop${s.drops === 1 ? '' : 's'} · ${(s.drops * 0.05).toFixed(2)} mL`; } },
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
        { id: 'view-precipitate', label: 'Precipitate', value: (s) => [describeSolids(obsOf(s)), ringWord(obsOf(s))].filter(Boolean).join('; ') },
        { id: 'view-gas', label: 'Gas', value: gasWord },
        { id: 'view-ph', label: 'pH (universal paper)', value: (s) => (obsOf(s).volumeMl > 0.01 ? String(Math.round(obsOf(s).pH)) : '—'), hint: 'A strip of universal indicator paper reads to about a whole unit' },
        { id: 'view-temp', label: 'Temperature', value: (s) => `${activeOf(s).tempC.toFixed(0)} °C` },
        { id: 'view-volume', label: 'Liquid in the tube', value: (s) => `${activeOf(s).content.volumeMl.toFixed(2)} mL${activeOf(s).content.layer ? ` + ${activeOf(s).content.layer.mL.toFixed(2)} mL acid below` : ''}` },
      ],
    },
    {
      id: 'flame-colour', type: 'swatch', label: 'The flame', hex: (s) => flameNow(s).hex,
      sub: (s) => { const f = flameNow(s); return f.inFlame ? `wire in the flame: ${f.name}` : 'the flame alone: pale blue'; },
    },
    {
      id: 'wire', type: 'readouts',
      items: [
        { id: 'wire-state', label: 'The wire', value: (s) => `${s.loop.dirty ? 'carries a trace of the last sample' : 'clean (a trace of sodium, always)'}; ${s.loop.hcl === 'yes' ? 'will be dipped in conc. HCl first' : 'dipped straight into the tube'}` },
        { id: 'litmus-last', label: 'Litmus', value: (s) => lastRows(s, 'litmus') },
        { id: 'smell-last', label: 'Smell', value: (s) => lastRows(s, 'smell') },
        { id: 'rod-last', label: 'HCl rod', value: (s) => lastRows(s, 'rod') },
      ],
    },
    {
      id: 'lime', type: 'readouts',
      items: [
        { id: 'lime-water', label: 'Lime water (tube L)', value: (s) => describe(tubeOf(s, 'L').obs).replace('solution', 'lime water') },
        { id: 'delivery-state', label: 'Delivery tube', value: (s) => (s.delivery ? `from tube ${s.delivery} to the lime water` : 'not connected') },
      ],
    },
    {
      id: 'answer', type: 'readouts',
      items: [
        { id: 'tests-run', label: 'Different tests recorded', value: (s) => s.analysis.tests, hint: 'A conclusion rests on more than one line of evidence: at least four different tests' },
        { id: 'your-answer', label: 'Your conclusion', value: (s) => `${CATIONS[s.cation] ?? '?'} and ${ANIONS[s.anion] ?? '?'}` },
        { id: 'verdict', label: 'Verdict', value: (s) => (s.result ? (s.result.both ? 'both correct' : s.result.okC ? 'cation right, anion wrong' : s.result.okA ? 'anion right, cation wrong' : 'neither right') : 'not yet checked') },
      ],
    },
    { id: 'model', type: 'custom', Component: ModelTests, when: (s) => s.revealed },
  ],

  table: {
    columns: [['bottle', 'Bottle'], ['tube', 'Tube'], ['test', 'Test'], ['observation', 'Observation']],
    csv: 'XI-CHE-F01-salt-analysis.csv',
    empty: 'Look at the salt, then try tests on the tubes and record what you see: colour, precipitate and what it does in excess, gas. The flame, litmus, smell and HCl rod write their own lines.',
  },
};

void solveContent;
export default spec;
