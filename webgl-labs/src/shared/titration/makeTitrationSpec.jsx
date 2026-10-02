/**
 * makeTitrationSpec — the interface of every titration bench, as data. SpecHUD renders it and
 * the generic render check sweeps every control in it. Getters are total: SpecHUD reads a
 * control's value and label even while the control is hidden.
 */
import { CHART, INDICATOR_LABELS } from './createTitration.js';

const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const mL = (v) => `${v.toFixed(2)} mL`;

export function makeTitrationSpec(cfg, useStore, eng, Scene) {
  const { totalAdded, remaining, started, shownReading, flaskVolume, agitationOf, meterReading, statusOf } = eng;
  const isMeter = (s) => s.meter === 'in';
  const isUniversalColour = (s) => s.meter !== 'in' && s.indicator === 'universal' && s.drops > 0;
  const locked = (s) => started(s);
  const chartOptions = CHART.map((p) => ({ value: String(p.pH), label: String(p.pH), swatch: p.hex, swatchText: lum(p.srgb) > 0.6 ? '#0b1220' : '#ffffff' }));
  const res = (s, k) => s.analysis.result[k];
  const unitName = eng.unknownIsFlask ? cfg.flask.short : cfg.burette.short;
  const resLine = (r) => `${r.C.toFixed(4)} M (${r.errPct >= 0 ? '+' : ''}${r.errPct.toFixed(1)} %)`;
  const standardSide = eng.unknownIsFlask ? cfg.burette : cfg.flask;

  return {
    code: cfg.code,
    title: cfg.title,
    subtitle: cfg.subtitle,
    store: useStore,
    Scene,
    camera: { position: [1.7, 2.0, 6.4], fov: 36, target: [0, 1.85, 0], min: 1.6, max: 10 },
    fog: [9, 24],
    glow: 'rgba(167,139,250,0.08)',

    status: statusOf,

    controls: [
      {
        id: 'standard', type: 'slider', min: cfg.standard.min, max: cfg.standard.max, step: 0.01, disabled: locked,
        label: (s) => `Standard ${standardSide.short} in the ${eng.unknownIsFlask ? 'burette' : 'flask'} — ${s.standardN.toFixed(2)} N`, get: (s) => s.standardN, set: 'setStandardN',
        note: (s) => (locked(s) ? 'Fixed once titrating: press “Fresh flask” to change it.' : cfg.standard.note),
        accent: 'bg-gradient-to-r from-slate-700 to-rose-500',
      },
      {
        id: 'analyte', type: 'slider', min: cfg.analyteMl.min, max: cfg.analyteMl.max, step: 1, disabled: locked,
        label: (s) => `${cfg.flask.short} pipetted into the flask — ${s.analyteMl} mL`, get: (s) => s.analyteMl, set: 'setAnalyteMl',
        note: () => cfg.analyteMl.note,
        accent: 'bg-gradient-to-r from-slate-700 to-sky-600',
      },
      {
        id: 'indicator', type: 'select', label: 'Indicator', get: (s) => s.indicator, set: 'setIndicator',
        options: cfg.indicators.map((id) => ({ value: id, label: INDICATOR_LABELS[id] })),
      },
      {
        id: 'drops', type: 'slider', min: 0, max: 10, step: 1,
        label: (s) => `Indicator — ${s.drops} drop${s.drops === 1 ? '' : 's'}`, get: (s) => s.drops, set: 'setDrops',
        note: () => 'A few drops in the flask. More dye is a deeper colour, and nothing else worth having.',
      },
      {
        id: 'meter', type: 'segmented', label: 'pH meter', get: (s) => s.meter, set: 'setMeter',
        options: [{ value: 'out', label: 'Out of the flask' }, { value: 'in', label: 'In the flask', hint: 'A calibrated glass electrode, with its own response time' }],
      },
      {
        id: 'stirrer', type: 'segmented', label: 'Stirrer', get: (s) => s.stirrer, set: 'setStirrer',
        options: [{ value: 'off', label: 'Off — swirl by hand' }, { value: 'on', label: 'On', hint: 'Fresh titrant is blended in within a second or so' }],
      },
      {
        id: 'temperature', type: 'slider', min: 15, max: 40, step: 1,
        label: (s) => `Temperature — ${s.tempC} °C`, get: (s) => s.tempC, set: 'setTemp',
        accent: 'bg-gradient-to-r from-sky-700 to-rose-600',
      },
      {
        id: 'flow', type: 'slider', min: 0.05, max: 1.5, step: 0.05,
        label: (s) => `Stopcock flow — ${s.flow.toFixed(2)} mL/s`, get: (s) => s.flow, set: 'setFlow',
        note: () => '0.05 mL/s is a drop a second. A stream cannot be stopped in the middle of a drop.',
        observable: false,
      },
      { id: 'additions', type: 'actions', items: [
        { id: 'add-drop', label: '+ 1 drop', run: 'addDrop', tone: 'primary', title: '0.05 mL: twenty to the mL', disabled: (s) => remaining(s) <= 0 },
        { id: 'add-half', label: '+ 0.5 mL', run: 'addMl', args: [0.5], tone: 'primary', disabled: (s) => remaining(s) <= 0 },
        { id: 'add-1', label: '+ 1 mL', run: 'addMl', args: [1], tone: 'primary', disabled: (s) => remaining(s) <= 0 },
        { id: 'add-5', label: '+ 5 mL', run: 'addMl', args: [5], tone: 'ghost', disabled: (s) => remaining(s) <= 0 },
      ] },
      { id: 'hands', type: 'actions', items: [
        { id: 'stopcock', label: (s) => (s.stopcock === 'open' ? 'Close stopcock' : 'Open stopcock'), run: 'toggleStopcock', tone: 'warn' },
        { id: 'swirl', label: 'Swirl the flask', run: 'swirl', tone: 'good', title: 'Three seconds of swirling blends the fresh titrant into the whole flask' },
        { id: 'refill', label: 'Refill burette', run: 'refill', tone: 'ghost' },
        { id: 'fresh-flask', label: 'Fresh flask', run: 'freshFlask', tone: 'ghost', title: 'A new pipetted portion in a clean flask, the burette exactly as it was' },
      ] },
      ...(cfg.degas ? [{ id: 'boil-actions', type: 'actions', items: [
        { id: 'boil', label: 'Boil off the CO₂', run: 'boil', tone: 'warn', title: 'Heat the flask gently, then cool it: the dissolved carbon dioxide goes' },
      ] }] : []),
      {
        id: 'chart', type: 'segmented', when: isUniversalColour, label: 'Match the flask colour to the chart',
        get: (s) => String(s.pick ?? ''), set: 'setPick', options: chartOptions,
        note: () => 'Colour is judged by eye: neighbouring patches can look alike. That is the resolution of the method.',
      },
      {
        id: 'clock', type: 'segmented', label: 'Clock', observable: false, get: (s) => String(s.timeScale), set: 'setTimeScaleStr',
        options: [{ value: '1', label: '×1' }, { value: '2', label: '×2' }, { value: '4', label: '×4' }],
      },
      { id: 'record-actions', type: 'actions', items: [
        { id: 'record', label: 'Record reading', run: 'record', tone: 'good' },
        { id: 'endpoint', label: 'Mark end point', run: 'markEndpoint', tone: 'warn', title: 'The colour has changed: note the titre' },
        { id: 'reset', label: 'Fresh bench', run: 'reset', tone: 'ghost' },
      ] },
    ],

    instruments: [
      {
        id: 'burette', type: 'hero', label: 'Burette reading', unit: 'mL',
        value: (s) => shownReading(s).toFixed(2),
        sub: (s) => (remaining(s) <= 0 ? 'empty' : `${mL(totalAdded(s))} added to this flask · ${remaining(s).toFixed(1)} mL left`),
      },
      {
        id: 'flask-colour', type: 'swatch', when: (s) => s.indicator !== 'none' && s.drops > 0, label: 'The flask', hex: (s) => s.world.colour.hex,
        sub: (s) => (s.world.plumeColour ? 'a cloud of fresh titrant under the tip — swirl' : 'uniform'),
      },
      {
        id: 'meter-ph', type: 'hero', when: isMeter, label: 'pH meter',
        value: (s) => { const r = meterReading(s); return r.sensing && r.pH !== null ? r.pH.toFixed(2) : '—'; },
        sub: (s) => { const r = meterReading(s); return r.sensing ? `${r.mV.toFixed(1)} mV · ${r.stable ? 'STABLE' : 'settling…'}` : 'electrode out of the flask'; },
      },
      {
        id: 'setup', type: 'readouts',
        items: [
          { id: 'in-burette', label: 'In the burette', value: (s) => `${cfg.burette.short}, ${eng.unknownIsFlask ? `${s.standardN.toFixed(2)} N (standard)` : 'to be found'}` },
          { id: 'in-flask-setup', label: 'Pipetted into the flask', value: (s) => `${s.analyteMl} mL ${cfg.flask.short}${eng.unknownIsFlask ? '' : `, ${s.standardN.toFixed(2)} N (standard)`}` },
          { id: 'indicator-used', label: 'Indicator', value: (s) => (s.indicator === 'none' || s.drops === 0 ? 'none' : `${s.drops} drop${s.drops === 1 ? '' : 's'}, ${INDICATOR_LABELS[s.indicator].toLowerCase()}`) },
        ],
      },
      {
        id: 'flask', type: 'readouts',
        items: [
          { id: 'flask-volume', label: 'In the flask', value: (s) => mL(flaskVolume(s)) },
          { id: 'unmixed', label: 'Not yet swirled in', value: (s) => `${s.unmixed.toFixed(3)} mL`, hint: 'Titrant that has fallen but not yet been blended into the flask' },
          { id: 'agitation', label: 'Mixing', value: (s) => ({ none: 'standing', swirl: 'swirling', stir: 'stirrer on' }[agitationOf(s)]) },
          { id: 'temp', label: 'Temperature', value: (s) => `${s.tempC} °C` },
          ...(cfg.degas ? [{ id: 'co2', label: 'Dissolved CO₂ in the flask', value: (s) => `${(s.world.co2 * 1000).toFixed(2)} mmol/L`, hint: 'Air-equilibrated water holds 0.013 mmol/L' }] : []),
        ],
      },
      { id: 'graph', type: 'plot', title: `pH against volume of ${cfg.burette.short} added`, series: (s) => s.analysis.series, xLabel: `V of ${cfg.burette.short} / mL`, yLabel: 'pH', yDomain: [0, 14] },
      { id: 'graph-slope', type: 'plot', title: 'ΔpH/ΔV — the steepest part is the end point', series: (s) => s.analysis.slope, xLabel: `V of ${cfg.burette.short} / mL`, yLabel: 'ΔpH/ΔV', height: 140 },
      {
        id: 'result', type: 'readouts',
        items: [
          { id: 'steepest', label: 'Steepest part of your curve', value: (s) => (res(s, 'curve') ? `${res(s, 'curve').lo.toFixed(2)} – ${res(s, 'curve').hi.toFixed(2)} mL` : '—') },
          { id: 'unknown-curve', label: `${unitName} from the curve`, value: (s) => (res(s, 'curve') ? resLine(res(s, 'curve')) : '—'), hint: cfg.resultHint },
          { id: 'titre', label: 'End point you marked', value: (s) => (res(s, 'endpoint') ? mL(res(s, 'endpoint').V) : '—') },
          { id: 'unknown-end', label: `${unitName} from the end point`, value: (s) => (res(s, 'endpoint') ? resLine(res(s, 'endpoint')) : '—') },
        ],
      },
    ],

    table: {
      columns: [['flask', 'Flask'], ['trial', 'Trial'], ['reading', 'Burette / mL'], ['added', `${cfg.burette.short} added / mL`], ['colour', 'Colour'], ['pH', 'pH'], ['note', 'Notes']],
      csv: `${cfg.code}-titration.csv`,
      empty: cfg.tableEmpty,
    },
  };
}
