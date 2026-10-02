/**
 * makeStandardSpec — the interface of every "make up a standard solution" bench, as data.
 * SpecHUD renders it and the generic render check sweeps every control in it.
 *
 * Every getter is total: SpecHUD reads a control's value and label even while the
 * control is hidden, so none of them may assume what `when` would have ruled out.
 */
import { BALANCES } from '../balance/balance.js';
import { sampleOf } from '../balance/objects.js';
import { FLASKS, mixedFraction } from './standard.js';
import { WATER_STEPS } from './createStandardStore.js';

const sci = (v) => (v === 0 ? '0' : v >= 0.01 ? v.toFixed(4) : v.toExponential(3));
const signed = (v, dp = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(dp)}`;

export function makeStandardSpec(cfg, useStore, Scene) {
  const forms = cfg.forms;
  const formOf = (s) => forms.find((f) => f.id === s.formId) ?? forms[0];
  const shielded = (s) => BALANCES[s.balanceId].shield;
  const used = (s) => sampleOf(s.objects.bottle) > 0 || s.batch.solid + s.batch.dissolved > 0 || s.batch.water > 0;
  const required = (s) => s.targetN * (s.flaskMl / 1000) * (formOf(s).M / formOf(s).n);

  /** What the bench says — in the order a student meets it. */
  const statusOf = (s) => {
    const b = s.batch; const r = s.display.reading; const seen = s.display.seen; const mixed = s.display.mixed;
    const f = formOf(s); const nSolute = b.solid + b.dissolved;
    if (b.spilledMl > 0 || b.spilledMol > 1e-6) return { key: 'spilled', tone: 'bad', title: 'Some of it went over or beside the flask', detail: `${b.spilledMl.toFixed(1)} mL ran over the rim and ${(b.spilledMol * 1000).toFixed(2)} mmol of solute was lost. The solution cannot be saved: take a fresh bench.` };
    if (seen > 0.9 && b.water > b.V20 * 0.9) return { key: 'overshoot', tone: 'bad', title: 'Past the mark', detail: `The meniscus is about ${seen.toFixed(1)} mm (${(seen / (1000 / (Math.PI * (FLASKS[b.flaskMl].neckMm / 2) ** 2))).toFixed(2)} mL) above the line. The solution is now more dilute than the arithmetic says. Taking liquid out afterwards does not help once it has been mixed.` };
    if (b.solid > 0 && b.water > 5) return { key: 'dissolving', tone: 'info', title: 'Still dissolving', detail: `Crystals lie on the bottom of the flask (${(b.solid * 1000).toFixed(1)} mmol). Swirl: the flask must be clear before it is made up.` };
    if (b.solid > 0 && b.water <= 5) return { key: 'dry', tone: 'info', title: 'Solid in a dry flask', detail: 'Rinse the funnel and the bottle with a little water, then dissolve before making up.' };
    if (nSolute > 0 && b.water > 5 && Math.abs(b.T - s.room) > 0.5 && b.water > b.V20 * 0.8) return { key: 'warm', tone: 'warn', title: `The flask is ${b.T.toFixed(1)} °C, the room ${s.room} °C`, detail: 'A volumetric flask holds its volume at 20 °C. Dissolving takes or gives heat: let the flask come to the room before the last millilitres go in.' };
    if (nSolute > 0 && Math.abs(seen) <= 0.8 && b.water > b.V20 * 0.9) {
      if (mixed >= 0.97 && b.stoppered) return { key: 'ready', tone: 'ok', title: 'Made up to the mark and mixed', detail: 'Work out the molarity and normality from the mass you weighed. When you are ready, check the flask by the reference titration to see what you really made.' };
      if (b.stoppered) return { key: 'mix', tone: 'info', title: 'At the mark: now mix', detail: 'Turn the stoppered flask over and back, ten times. Until you do, the top is water and the bottom is solution.' };
      return { key: 'at-mark', tone: 'ok', title: 'At the mark', detail: 'The bottom of the meniscus is on the line, seen from the level of the line. Put the stopper in and invert the flask to mix it.' };
    }
    if (s.pan.includes('bottle') && !r.stable) return { key: 'unsteady', tone: 'info', title: 'Not steady yet', detail: s.objects.bottle.parts.some((p) => p.hygro) && !s.objects.bottle.lidOn ? 'The solid takes water from the air: the reading creeps up. Put the lid on between additions.' : 'Wait for the asterisk before you record.' };
    if (b.water > 0 && nSolute > 0) return { key: 'filling', tone: 'info', title: `${b.water.toFixed(1)} mL in the flask`, detail: `Add water until the meniscus is within a few millimetres of the line, then use the dropper. The flask holds ${FLASKS[b.flaskMl].mL} mL at the line.` };
    if (sampleOf(s.objects.bottle) > 0) return { key: 'weighed', tone: 'info', title: 'Solid in the bottle', detail: 'Weigh the bottle and its contents (or tare and weigh the solid in), tip it through the funnel, weigh the bottle again, then rinse the bottle and the funnel into the flask.' };
    return { key: 'start', tone: 'info', title: `Make ${FLASKS[s.flaskMl].mL} mL of ${s.targetN} N ${cfg.name}`, detail: `Work out the mass first and check it. Then weigh it out in the bottle, transfer it with nothing left behind, dissolve, make up to the mark and mix.` };
  };

  return {
    code: cfg.code,
    title: cfg.title,
    subtitle: cfg.subtitle,
    store: useStore,
    Scene,
    camera: { position: [0.1, 1.55, 7.0], fov: 36, target: [0.1, 0.5, 0], min: 2, max: 11, polar: [0.35, Math.PI / 2.05] },
    fog: [9, 22],
    glow: 'rgba(125,211,252,0.07)',

    status: (s) => (s.message && s.message.at === s.acts ? { key: `msg-${s.message.text.slice(0, 12)}`, tone: s.message.tone, title: s.message.text, detail: '' } : statusOf(s)),

    controls: [
      {
        id: 'form', type: 'segmented', label: 'The jar on the shelf', get: (s) => s.formId, set: 'setForm', disabled: used,
        options: forms.map((f) => ({ value: f.id, label: f.short, hint: `${f.label} — M = ${f.M} g/mol` })),
        note: (s) => `${formOf(s).label}, ${formOf(s).formula}`,
      },
      {
        id: 'flask', type: 'segmented', label: 'Volumetric flask', get: (s) => String(s.flaskMl), set: 'setFlask', disabled: used,
        options: Object.keys(FLASKS).map((m) => ({ value: m, label: `${m} mL` })),
      },
      {
        id: 'planned', type: 'slider', min: 0.1, max: 10, step: 0.001, get: (s) => s.planned, set: 'setPlanned',
        label: (s) => `Your calculation: ${s.planned.toFixed(3)} g for ${s.flaskMl} mL of ${s.targetN} N`,
        accent: 'bg-gradient-to-r from-slate-700 to-violet-500',
        note: () => 'Set the mass you worked out on paper, then ask for it to be checked.',
      },
      { id: 'plan-actions', type: 'actions', items: [{ id: 'check-plan', label: 'Check my calculation', run: 'checkPlan', tone: 'ghost' }] },
      {
        id: 'balance', type: 'segmented', label: 'Balance', get: (s) => s.balanceId, set: 'setBalance',
        options: [{ value: 'top2', label: '0.01 g' }, { value: 'top3', label: '0.001 g' }, { value: 'ana4', label: '0.0001 g' }],
      },
      { id: 'place-actions', type: 'actions', items: [
        { id: 'place', label: 'Bottle on the pan', run: 'place', tone: 'primary' },
        { id: 'drop', label: 'Drop it on', run: 'drop', tone: 'warn', title: 'What not to do' },
        { id: 'remove', label: 'Take it off', run: 'remove', tone: 'ghost' },
        { id: 'tare', label: 'Tare', run: 'tare', tone: 'good' },
      ] },
      {
        id: 'shield', type: 'segmented', when: shielded, label: 'Draft shield', get: (s) => s.bals[s.balanceId].shield, set: 'setShield',
        options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }],
      },
      {
        id: 'lid', type: 'segmented', label: 'Lid of the bottle', get: (s) => (s.objects.bottle.lidOn ? 'on' : 'off'), set: 'setLid',
        options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }],
      },
      {
        id: 'spatula', type: 'slider', min: 0.01, max: 1, step: 0.01, get: (s) => s.spatula, set: 'setSpatula',
        label: (s) => `Spatula — about ${s.spatula.toFixed(2)} g a time`, accent: 'bg-gradient-to-r from-slate-700 to-emerald-500',
      },
      { id: 'solid-actions', type: 'actions', items: [
        { id: 'add-solid', label: 'Add solid from the jar', run: 'addSolid', tone: 'primary' },
        { id: 'tip', label: 'Tip into the funnel', run: 'tip', tone: 'primary' },
      ] },
      {
        id: 'funnel', type: 'segmented', label: 'Funnel', get: (s) => (s.batch.funnelIn ? 'in' : 'out'), set: 'setFunnel',
        options: [{ value: 'in', label: 'In the flask' }, { value: 'out', label: 'Not used' }],
        note: () => 'Tipping without the funnel spills some of the solid on the bench.',
      },
      { id: 'rinse-actions', type: 'actions', items: [
        { id: 'rinse-funnel', label: 'Rinse the funnel', run: 'rinse', tone: 'ghost', title: 'A squirt from the wash bottle over the funnel: 10 mL into the flask' },
        { id: 'rinse-bottle', label: 'Rinse the bottle', run: 'rinseBottle', tone: 'ghost', title: 'A squirt into the weighing bottle, then through the funnel' },
      ] },
      {
        id: 'water-step', type: 'segmented', label: 'Water to add (mL)', get: (s) => String(s.waterStep), set: 'setWaterStep',
        options: WATER_STEPS.map((w) => ({ value: String(w), label: w < 1 ? 'a drop' : String(w) })),
        note: () => 'A drop is 0.05 mL. The wash bottle gives about 10.',
      },
      { id: 'water-actions', type: 'actions', items: [
        { id: 'add-water', label: 'Add water', run: 'addWater', tone: 'primary' },
        { id: 'pipette', label: 'Pipette 1 mL out', run: 'pipette', tone: 'ghost', title: 'Take 1 mL from the neck' },
        { id: 'swirl', label: 'Swirl', run: 'swirl', tone: 'good' },
      ] },
      {
        id: 'eye', type: 'slider', min: -30, max: 30, step: 1, get: (s) => s.eye, set: 'setEye',
        label: (s) => `Your eye — ${s.eye === 0 ? 'level with the mark' : `${Math.abs(s.eye)} mm ${s.eye > 0 ? 'above' : 'below'} the mark`}`,
        accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
        note: () => 'The ring round the neck looks like one straight line only when your eye is level with it.',
      },
      {
        id: 'stopper', type: 'segmented', label: 'Stopper', get: (s) => (s.batch.stoppered ? 'in' : 'out'), set: 'stopper',
        options: [{ value: 'out', label: 'Out' }, { value: 'in', label: 'In' }],
      },
      { id: 'invert-actions', type: 'actions', items: [
        { id: 'invert', label: 'Turn it over', run: 'invert', tone: 'good' },
        { id: 'invert-many', label: 'Turn it over ×5', run: 'invertMany', tone: 'good' },
      ] },
      {
        id: 'room', type: 'slider', min: 15, max: 35, step: 1, get: (s) => s.room, set: 'setRoom',
        label: (s) => `Room — ${s.room} °C`, accent: 'bg-gradient-to-r from-sky-700 to-rose-600',
        note: () => 'The flask is calibrated at 20 °C; the water and the room are at this temperature.',
      },
      {
        id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
        options: [{ value: '1', label: '×1' }, { value: '4', label: '×4' }, { value: '10', label: '×10' }, { value: '30', label: '×30' }],
      },
      { id: 'record-actions', type: 'actions', items: [
        { id: 'record', label: 'Record reading', run: 'recordWeight', tone: 'good' },
        { id: 'reveal', label: 'Check by titration', run: 'reveal', tone: 'primary', title: 'The reference lab titrates a sample of what you made' },
        { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
      ] },
    ],

    instruments: [
      {
        id: 'display', type: 'hero', label: 'Balance',
        value: (s) => s.display.reading.text, unit: 'g',
        sub: (s) => `${s.display.reading.stable ? '●  steady' : '○  not steady'} · ${BALANCES[s.balanceId].label}`,
      },
      { id: 'plan-feedback', type: 'callout', when: (s) => Boolean(s.plan), tone: (s) => (s.plan?.ok ? 'ok' : 'warn'), text: (s) => s.plan?.text ?? '' },
      {
        id: 'data', type: 'readouts',
        items: [
          { id: 'target', label: 'To make', value: (s) => `${FLASKS[s.flaskMl].mL} mL of ${s.targetN} N` },
          { id: 'molar-mass', label: 'Molar mass', value: (s) => `${formOf(s).M} g/mol`, hint: 'From the label on the jar' },
          { id: 'n-factor', label: 'Equivalents per mole', value: (s) => formOf(s).n, hint: `${cfg.nFactorNote}` },
          { id: 'purity', label: 'Purity on the label', value: (s) => `${(100 * formOf(s).purity).toFixed(1)} %` },
          { id: 'plan-mass', label: 'Your planned mass', value: (s) => `${s.planned.toFixed(3)} g` },
          { id: 'shield-state', label: 'Draft shield', value: (s) => (shielded(s) ? s.bals[s.balanceId].shield : 'none') },
          { id: 'bench-state', label: 'Bottle, spatula', value: (s) => `lid ${s.objects.bottle.lidOn ? 'on' : 'off'}, about ${s.spatula.toFixed(2)} g a time` },
        ],
      },
      {
        id: 'flask-readouts', type: 'readouts',
        items: [
          { id: 'water', label: 'Liquid in the flask', value: (s) => `${s.batch.water.toFixed(2)} mL`, hint: 'What has been poured in' },
          { id: 'meniscus', label: 'Meniscus, as you see it', value: (s) => (s.display.seen < -40 ? 'in the bulb, well below the mark' : `${signed(s.display.seen, 1)} mm`), hint: 'Against the mark, read from where your eye is: positive is above the line' },
          { id: 'ring', label: 'The ring looks like', value: (s) => (Math.abs(s.eye) <= 3 ? 'one straight line' : `an ellipse (eye ${s.eye > 0 ? 'above' : 'below'})`) },
          { id: 'flask-temp', label: 'Flask temperature', value: (s) => `${s.batch.T.toFixed(1)} °C` },
          { id: 'solid-state', label: 'In the flask', value: (s) => (s.batch.solid > 1e-7 ? 'crystals on the bottom' : s.batch.dissolved > 0 ? 'a clear solution' : 'nothing yet') },
          { id: 'inversions', label: 'Turned over', value: (s) => `${s.batch.inversions} times` },
          { id: 'next-water', label: 'Next addition', value: (s) => (s.waterStep < 1 ? 'a drop, 0.05 mL' : `${s.waterStep} mL`) },
          { id: 'fittings', label: 'Funnel, stopper', value: (s) => `${s.batch.funnelIn ? 'funnel in' : 'no funnel'}, stopper ${s.batch.stoppered ? 'in' : 'out'}` },
          { id: 'room-now', label: 'Room', value: (s) => `${s.room} °C` },
        ],
      },
      {
        id: 'notebook-calc', type: 'readouts',
        items: [
          { id: 'mass-used', label: 'Mass of solid, from your readings', value: (s) => (s.analysis.reported ? `${s.analysis.reported.g.toFixed(Math.max(2, -Math.floor(Math.log10(BALANCES[s.balanceId].d))))} g` : '—'), hint: 'By difference, or a tared net reading' },
          { id: 'claimed-m', label: 'Molarity you calculate', value: (s) => (s.analysis.claimed ? sci(s.analysis.claimed.M) : '—'), hint: 'm / (M × V in litres)' },
          { id: 'claimed-n', label: 'Normality you calculate', value: (s) => (s.analysis.claimed ? sci(s.analysis.claimed.N) : '—'), hint: 'N = M × equivalents per mole' },
        ],
      },
      {
        id: 'verdict', type: 'readouts', when: (s) => Boolean(s.revealed),
        items: [
          { id: 'true-n', label: 'Reference titration: normality', value: (s) => (s.revealed ? sci(s.revealed.N) : '—') },
          { id: 'vs-target', label: 'Against the target', value: (s) => (s.revealed ? `${signed(s.revealed.vsTargetPct, 2)} %` : '—'), hint: 'The normality that was asked for' },
          { id: 'error', label: 'Against your figure', value: (s) => (s.revealed ? `${signed(s.revealed.totalPct, 2)} %` : '—'), hint: 'What the flask really holds, against what your mass and the flask’s label say' },
          ...cfg.budgetIds.map(({ id, label }) => ({ id: `budget-${id}`, label, value: (s) => { const x = s.revealed?.factors.find((q) => q.id === id); return x ? `${signed(x.pct, 3)} %` : '—'; } })),
        ],
      },
    ],

    table: {
      columns: [['trial', 'Trial'], ['balance', 'Balance'], ['what', 'On the pan'], ['tare', 'Tare held / g'], ['text', 'Display / g'], ['steady', 'Steady'], ['note', 'Notes']],
      csv: `${cfg.code}-standard-solution.csv`,
      empty: 'Weigh the bottle with the solid, tip it out, weigh the bottle again: the mass used, the molarity and the normality are worked out from your own readings.',
    },
  };
}

export { sci, mixedFraction };
