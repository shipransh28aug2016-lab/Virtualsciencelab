/**
 * makeMeasureSpec — the interface of every bench that measures between the jaws of an instrument, as data.
 * SpecHUD renders it and the generic render check sweeps every control in it. The jaws' actual gap is
 * never printed: it is what the scales are for. What the interface does tell the student is what the
 * hand would feel — whether the specimen is loose, gripped, or being squeezed.
 */
import { GLASS } from '../ui/kit.jsx';
import { viewOf, majorOf, minorOf, MAJOR_NAME, MINOR_NAME, ANGLES } from './createMeasure.js';
import { makeReadingWindow, vernierLength, vernierPX } from './ReadingWindow.jsx';

const PITCH_CHOICES = [{ value: '', label: '— measure it —' }, ...[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((p) => ({ value: String(p), label: `${p} mm` }))];
const DIVISION_CHOICES = [{ value: '', label: '— count them —' }, ...[25, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} divisions` }))];

const LC_CHOICES = [
  { value: '', label: '— work it out —' },
  { value: '0.5', label: '0.5 mm' }, { value: '0.1', label: '0.1 mm (0.01 cm)' }, { value: '0.05', label: '0.05 mm (0.005 cm)' },
  { value: '0.02', label: '0.02 mm (0.002 cm)' }, { value: '0.01', label: '0.01 mm (0.001 cm)' },
  { value: '0.005', label: '0.005 mm' }, { value: '0.001', label: '0.001 mm' },
];

export function makeStatus(cfg) {
  return (s) => {
    if (s.message && s.message.at === s.acts) return { key: s.message.key, tone: s.message.tone ?? 'warn', title: s.message.title, detail: s.message.detail };
    const v = viewOf(cfg, s);
    if (!v.dim) {
      return s.opening <= 1e-6
        ? { key: 'closed', tone: 'info', title: 'Jaws closed, nothing between them', detail: s.zero.taken ? 'The zero error is taken. Choose a specimen and measure.' : 'Read the scales now: whatever they say with the jaws closed is the zero error. Enter what you read, say which side of the main zero the vernier / thimble zero lies, and record it.' }
        : { key: 'open', tone: 'info', title: 'Jaws open, nothing between them', detail: 'To find the zero error close them fully; to measure something, choose it.' };
    }
    if (v.rest.loose) return { key: 'loose', tone: 'warn', title: v.rest.inner ? 'The jaws have not reached the walls' : 'The specimen is loose in the jaws', detail: v.rest.inner ? 'Open them further until they touch.' : 'Close them until the specimen is just gripped — a loose specimen is not what the scale is measuring.' };
    if ((v.rest.squeezed ?? 0) > 0.004) return { key: 'squeezed', tone: 'bad', title: `The specimen is being squeezed (${v.rest.squeezed.toFixed(3)} mm)`, detail: cfg.kind === 'screw' ? 'You have turned the thimble on against a soft specimen. The ratchet slips at a fixed gentle pressure; it is what it is for.' : 'Too much pressure on the jaws compresses a soft body: the reading is too small.' };
    return { key: 'gripped', tone: 'ok', title: 'The specimen is just gripped', detail: `Read the scales: the ${MAJOR_NAME[cfg.kind]} and the ${MINOR_NAME[cfg.kind]}, enter them, and record. The reading depends on the place and the direction: take several.` };
  };
}

/** The numbers and what they say, after the readings: per dimension and as the result of the experiment. */
export function makeResults(cfg) {
  return function Results({ useStore }) {
    const analysis = useStore((s) => s.analysis);
    const revealed = useStore((s) => s.revealed);
    if (!analysis.n) return null;
    const n = analysis.notes;
    const flags = [
      n.misread ? `${n.misread} misread` : null, n.loose ? `${n.loose} with the specimen loose` : null, n.squeezed ? `${n.squeezed} squeezed` : null,
      n.lcWrong ? `${n.lcWrong} with the wrong least count` : null, n.noZero ? `${n.noZero} before the zero error was taken` : null,
    ].filter(Boolean);
    return (
      <div className={`${GLASS} mb-3 p-3`} data-probe="results">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">What the readings say</div>
        <ul className="mt-1 space-y-0.5 text-[12px] text-slate-200">
          {Object.values(analysis.groups).map((g) => (
            <li key={`${g.specimen}/${g.dim}`}>
              {cfg.specimens[g.specimen]?.label} · {cfg.specimens[g.specimen]?.dims[g.dim]?.label ?? g.dim}: <span className="font-mono">{g.mean.toFixed(3)} mm</span> from {g.n} reading{g.n === 1 ? '' : 's'}
              {g.n > 1 ? <span className="text-slate-400"> (spread ±{g.sd.toFixed(3)} mm)</span> : null}
              {revealed ? <span className="text-sky-300"> — actual {cfg.specimens[g.specimen]?.dims[g.dim]?.mm.toFixed(3)} mm</span> : null}
            </li>
          ))}
          {analysis.summary.map((r) => <li key={r.label}>{r.label}: <span className="font-mono">{r.value.toFixed(r.dp ?? 2)} {r.unit}</span>{r.err ? <span className="text-slate-400"> ± {r.err.toFixed(r.dp ?? 2)}</span> : null}{revealed && r.actual !== undefined ? <span className="text-sky-300"> — actual {r.actual.toFixed(r.dp ?? 2)}</span> : null}</li>)}
        </ul>
        {flags.length ? <div className="mt-2 text-[12px] text-amber-200">Of these readings: {flags.join('; ')}.</div> : null}
      </div>
    );
  };
}

export function makeMeasureSpec(cfg, useStore, Scene, extra = {}) {
  const inst = (s) => cfg.instruments[s.instrument];
  const kind = cfg.kind;
  const specimenIds = Object.keys(cfg.specimens);
  const dimControls = specimenIds.map((id) => ({
    id: `dim-${id}`, type: 'segmented', label: 'Measuring', when: (s) => s.specimen === id, get: (s) => s.dim, set: 'setDim',
    options: Object.entries(cfg.specimens[id].dims).map(([k, d]) => ({ value: k, label: d.label, hint: d.hint })),
  }));
  const ReadingWindow = makeReadingWindow(cfg, { label: cfg.windowLabel ?? (kind === 'vernier' ? 'vernier callipers' : 'screw gauge'), rim: cfg.rim ?? 'thimble' });
  const Results = makeResults(cfg);
  const entryStr = (s) => { const i = inst(s); const lc = Number(s.lcEntry) || i.lc; const m = s.entry.negative ? 0 : s.entry.major; return s.entry.negative ? `−(${i.n} − ${s.entry.minor}) × ${lc} = ${(-((i.n - s.entry.minor) % i.n) * lc).toFixed(3)} mm` : `${m} + ${s.entry.minor} × ${lc} = ${(m + s.entry.minor * lc).toFixed(3)} mm`; };

  return {
    code: cfg.code,
    title: cfg.title,
    subtitle: cfg.subtitle,
    store: useStore,
    Scene,
    camera: cfg.camera,
    fog: cfg.fog ?? [10, 26],
    glow: cfg.glow ?? 'rgba(148,163,184,0.08)',

    status: makeStatus(cfg),

    controls: [
      {
        id: 'instrument', type: 'segmented', label: cfg.instrumentLabel ?? 'Instrument', get: (s) => s.instrument, set: 'setInstrument',
        options: Object.values(cfg.instruments).map((i) => ({ value: i.id, label: cfg.instrumentShort?.[i.id] ?? i.id, hint: i.label })),
        note: (s) => `${inst(s).label}. Each instrument has its own zero error, which you have to find.`,
      },
      {
        id: 'specimen', type: 'segmented', label: 'Between the jaws', get: (s) => s.specimen, set: 'setSpecimen',
        options: [{ value: 'none', label: 'Nothing', hint: 'Jaws closed: for the zero error' }, ...specimenIds.map((id) => ({ value: id, label: cfg.specimens[id].label, hint: cfg.specimens[id].look }))],
      },
      ...dimControls,
      {
        id: 'opening', type: 'slider', min: 0, max: cfg.maxOpening ?? 80, step: cfg.openingStep ?? 0.5, get: (s) => s.opening, set: 'setOpening',
        label: kind === 'vernier' ? 'Slide the jaws (coarse)' : 'Turn the thimble (coarse)', accent: 'bg-gradient-to-r from-slate-700 to-slate-400',
        note: () => 'Coarse. For the last millimetre use the steps of one least count: the screw is the instrument.',
      },
      { id: 'fine-actions', type: 'actions', items: [
        { id: 'step-10-', label: '−10 L.C.', run: 'step', args: [-10], tone: 'ghost' },
        { id: 'step-1-', label: '−1 L.C.', run: 'step', args: [-1], tone: 'ghost' },
        { id: 'step-1+', label: '+1 L.C.', run: 'step', args: [1], tone: 'ghost' },
        { id: 'step-10+', label: '+10 L.C.', run: 'step', args: [10], tone: 'ghost' },
        { id: 'close-jaws', label: 'Close the jaws', run: 'closeJaws', tone: 'warn' },
      ] },
      ...(kind === 'screw' ? [
        { id: 'turn-actions', type: 'actions', items: [
          { id: 'turn-10-', label: '−10 turns', run: 'turn', args: [-10], tone: 'ghost' },
          { id: 'turn-1-', label: '−1 turn', run: 'turn', args: [-1], tone: 'ghost' },
          { id: 'turn-1+', label: '+1 turn', run: 'turn', args: [1], tone: 'ghost' },
          { id: 'turn-10+', label: '+10 turns', run: 'turn', args: [10], tone: 'ghost' },
        ] },
        {
          id: 'pitch', type: 'select', label: 'The pitch you found', get: (s) => s.pitchEntry, set: 'setPitch', options: PITCH_CHOICES,
          note: (s) => (s.pitchEntry ? (Math.abs(Number(s.pitchEntry) - inst(s).pitch) < 1e-9 ? 'Right: that is how far one turn advances the screw.' : 'Not what the sleeve shows: give the screw ten turns and see how far the edge of the thimble moves.') : 'Turn the thimble through ten whole turns with the jaws clear and see how far the edge moves along the sleeve; divide by ten.'),
        },
        {
          id: 'divisions', type: 'select', label: 'Circular scale', get: (s) => s.nEntry, set: 'setN', options: DIVISION_CHOICES,
          note: (s) => (s.nEntry ? (Number(s.nEntry) === inst(s).n ? 'Right. Pitch divided by this is the least count.' : 'Count them again: it is the number of divisions all the way round the thimble.') : 'Count the divisions all the way round the thimble.'),
        },
      ] : []),
      {
        id: 'ratchet', type: 'segmented', when: () => kind === 'screw', label: 'Turn the', get: (s) => (s.ratchet ? 'on' : 'off'), set: 'setRatchet',
        options: [{ value: 'on', label: 'Ratchet', hint: 'It slips at a fixed gentle pressure' }, { value: 'off', label: 'Thimble itself', hint: 'You decide the pressure — and a soft specimen will show it' }],
      },
      { id: 'place', type: 'segmented', when: (s) => s.specimen !== 'none', label: 'Along the specimen, place', get: (s) => String(s.place), set: 'setPlace', options: [0, 1, 2, 3].map((p) => ({ value: String(p), label: String(p + 1) })), note: () => 'No specimen is uniform: measure it in several places and in directions at right angles.' },
      { id: 'angle', type: 'segmented', when: (s) => s.specimen !== 'none', label: 'Turned to', get: (s) => String(s.angle), set: 'setAngle', options: ANGLES.map((a) => ({ value: String(a), label: `${a}°` })) },
      { id: 'eye', type: 'segmented', label: 'Your eye is', get: (s) => s.eye, set: 'setEye', options: [{ value: 'left', label: 'to the left' }, { value: 'centre', label: 'straight on' }, { value: 'right', label: 'to the right' }], note: () => 'Look from the side and the scales seem to slip against each other: parallax.' },
      {
        id: 'lens', type: 'slider', when: (s) => kind === 'vernier' && inst(s).n > 20, min: 0, max: (s) => Math.round(vernierLength(inst(s))), step: 0.5, get: (s) => s.lens, set: 'setLens',
        label: (s) => `Move the lens along the vernier — ${s.lens.toFixed(1)} mm`, accent: 'bg-gradient-to-r from-slate-700 to-amber-400',
        note: (s) => `A ${inst(s).n}-division vernier is read through a strong lens that shows ${(640 / vernierPX(inst(s))).toFixed(0)} mm at a time: slide it along to find the line that sits exactly on a main-scale line.`,
      },
      { id: 'lc', type: 'select', label: 'The least count is', get: (s) => s.lcEntry, set: 'setLc', options: LC_CHOICES, note: (s) => (s.lcEntry ? (Math.abs(Number(s.lcEntry) - inst(s).lc) < 1e-9 ? 'Right: it is the smallest length the instrument can read.' : 'That is not this instrument’s least count: work it out from the scales.') : 'One main-scale division divided by the number of divisions on the vernier / pitch divided by the number on the circular scale.') },
      {
        id: 'major', type: 'slider', min: 0, max: cfg.majorMax, step: cfg.majorStep, get: (s) => s.entry.major, set: 'setMajor',
        label: (s) => `${MAJOR_NAME[kind]} you read — ${s.entry.major} mm`, accent: 'bg-gradient-to-r from-slate-700 to-sky-500',
      },
      {
        id: 'minor', type: 'slider', min: 0, max: (s) => inst(s).n - 1, step: 1, get: (s) => s.entry.minor, set: 'setMinor',
        label: (s) => `${MINOR_NAME[kind]} you read — division ${s.entry.minor}`, accent: 'bg-gradient-to-r from-slate-700 to-amber-400',
      },
      {
        id: 'negative', type: 'segmented', when: (s) => s.specimen === 'none', label: kind === 'vernier' ? 'The vernier zero lies' : 'The thimble zero lies', get: (s) => (s.entry.negative ? 'neg' : 'pos'), set: 'setNegative',
        options: [{ value: 'pos', label: kind === 'vernier' ? 'right of the main zero' : 'below the datum line' }, { value: 'neg', label: kind === 'vernier' ? 'left of the main zero' : 'above the datum line' }],
        note: () => 'Positive zero error: subtract it. Negative: add it. If the zero is left over, the line that coincides is counted from the other end.',
      },
      ...(extra.controls ?? []),
      { id: 'record-actions', type: 'actions', items: [
        { id: 'record-zero', label: 'Record zero error', run: 'recordZero', tone: 'primary', when: (s) => s.specimen === 'none' },
        { id: 'record', label: 'Record this reading', run: 'record', tone: 'primary', when: (s) => s.specimen !== 'none' },
        { id: 'reveal', label: 'Show the actual values', run: 'reveal', tone: 'ghost', title: 'After three readings: what the specimen really is' },
        { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
      ] },
    ],

    instruments: [
      { id: 'window', type: 'custom', Component: ReadingWindow },
      {
        id: 'hands', type: 'readouts',
        items: [
          { id: 'jaws', label: 'In the hand', value: (s) => { const v = viewOf(cfg, s); if (!v.dim) return s.opening <= 1e-6 ? 'jaws closed' : 'jaws open, nothing in them'; if (v.rest.loose) return v.rest.inner ? 'not yet touching the walls' : 'the specimen rattles'; return (v.rest.squeezed ?? 0) > 0.004 ? 'squeezing the specimen' : 'just gripped'; } },
          { id: 'your-reading', label: 'You read', value: (s) => entryStr(s), hint: 'Main reading + vernier / circular reading × least count' },
          ...(kind === 'screw' ? [{ id: 'derived-lc', label: 'Pitch ÷ divisions', value: (s) => (s.pitchEntry && s.nEntry ? `${s.pitchEntry} ÷ ${s.nEntry} = ${(Number(s.pitchEntry) / Number(s.nEntry)).toFixed(4)} mm` : s.pitchEntry ? `${s.pitchEntry} mm ÷ ?` : s.nEntry ? `? ÷ ${s.nEntry}` : '—'), hint: 'The least count, from what you found' },
            { id: 'turning', label: 'You turn', value: (s) => (s.ratchet ? 'the ratchet: it slips at a fixed gentle pressure' : 'the thimble itself: you decide the pressure') }] : []),
          { id: 'zero-state', label: 'Zero error', value: (s) => (s.zero.taken ? `${s.zero.e >= 0 ? '+' : '−'}${Math.abs(s.zero.e).toFixed(3)} mm (as you took it)` : 'not yet taken') },
          { id: 'viewing', label: 'Your eye', value: (s) => ({ left: 'left of the line of sight — the lines seem shifted', centre: 'straight on', right: 'right of the line of sight — the lines seem shifted' })[s.eye], hint: 'Parallax: the two scales are not in one plane' },
          { id: 'where', label: 'Specimen', value: (s) => (s.specimen === 'none' ? '—' : `${cfg.specimens[s.specimen].label}, place ${s.place + 1}, turned ${s.angle}°`) },
        ],
      },
      ...(extra.instruments ?? []),
      { id: 'results', type: 'custom', Component: Results },
      { id: 'graph', type: 'plot', title: 'Corrected readings, by trial', series: (s) => s.analysis.series, xLabel: 'trial', yLabel: 'corrected reading / mm', height: 150 },
    ],

    table: {
      columns: cfg.tableColumns ?? [['trial', '#'], ['specimen', 'Specimen'], ['dim', 'Dimension'], ['major', kind === 'vernier' ? 'M.S.R. / mm' : 'P.S.R. / mm'], ['minor', kind === 'vernier' ? 'V.S.R. / div' : 'H.S.R. / div'], ['lc', 'L.C. / mm'], ['observed', 'Observed / mm'], ['zero', 'Zero error / mm'], ['corrected', 'Corrected / mm'], ['note', 'Notes']],
      csv: `${cfg.code}-${kind}.csv`,
      empty: 'Close the jaws and take the zero error first. Then measure the specimen in several places and directions, entering what you read from the scales, and record each.',
    },
  };
}

export { majorOf, minorOf };
