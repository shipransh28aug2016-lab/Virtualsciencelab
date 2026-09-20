/**
 * MODEL: Using a multimeter — XII-PHY-ACT-A2
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 2.
 * Selecting the right function AND range AND connection is the whole point:
 * a voltmeter goes in parallel, an ammeter in series, an ohmmeter needs a
 * dead circuit, and AC/DC functions must match the supply.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A2',
  formula: 'V: parallel, high Rin. A: series, low Rin. Ω: dead circuit, own cell. Continuity: near 0 Ω = intact',
  unitSystem: 'Volt, ampere, ohm',
  assumptions: ['The meter is ideal enough not to disturb the circuit when used correctly', 'The ohmmeter\'s own cell requires the circuit under test to be unpowered'],
  validRange: 'Eight targets across five functions',
  edgeCases: ['Measuring resistance on a live circuit gives a meaningless reading and can damage the meter', 'A DC function on an AC supply reads close to zero'],
  expectedBehaviour: ['The correct function, range and connection give a sensible, in-range reading', 'A wrong connection (e.g. an ammeter in parallel) reads nonsense or trips the fuse'],
};

export const TARGETS = {
  resistor: { label: '470 Ω resistor', kind: 'R', value: 470, live: false },
  resistorHigh: { label: '100 kΩ resistor', kind: 'R', value: 100000, live: false },
  battery: { label: 'Dry cell', kind: 'Vdc', value: 1.53, live: true },
  supplyDc: { label: '6 V DC supply', kind: 'Vdc', value: 6.0, live: true },
  supplyAc: { label: '12 V AC supply', kind: 'Vac', value: 12.0, live: true },
  lampCircuit: { label: 'Lamp circuit (series)', kind: 'Aac', value: 0.25, live: true },
  brokenWire: { label: 'Suspect lead', kind: 'cont', value: Infinity, live: false },
  goodWire: { label: 'Sound lead', kind: 'cont', value: 0.4, live: false },
};
export const RANGES = { voltageV: { r2: 2, r20: 20, r250: 250 }, currentA: { r02: 0.2, r10: 10 }, resistanceOhm: { r2k: 2000, r200k: 200000 } };

/** How each range position is engraved on the dial. */
export const RANGE_LABELS = {
  r2: '2', r20: '20', r250: '250', r02: '0.2', r10: '10', r2k: '2k', r200k: '200k',
};

/**
 * Which range switch belongs to which function, and what the meter can read on
 * it. `cont` has no range at all: the continuity position is a buzzer, not a
 * scale.
 *
 * The range mattered on paper and nowhere else. The observation table had a
 * Range column, the procedure's last step asked the student "whether the range
 * chosen made best use of the display", and the model read 12 V on the 2 V
 * range without complaint — which is not what a meter does, and is the one
 * thing this activity is for. A 3.5-digit meter has 2000 counts, so the range
 * fixes BOTH the largest reading it can show and the resolution it shows it
 * with: 1 mV on the 2 V range, 100 mV on the 250 V range.
 */
export const RANGE_OF_FUNC = {
  vdc: { control: 'voltageRange', scale: 'voltageV', unit: 'V' },
  vac: { control: 'voltageRange', scale: 'voltageV', unit: 'V' },
  aac: { control: 'currentRange', scale: 'currentA', unit: 'A' },
  ohm: { control: 'resistanceRange', scale: 'resistanceOhm', unit: '\u03a9' },
  cont: null,
};
export const COUNTS = 2000;

/** The range switch now in use, with its full-scale value. */
export function rangeOf(inputs) {
  const spec = RANGE_OF_FUNC[inputs.func];
  if (!spec) return null;
  const key = inputs[spec.control];
  const full = RANGES[spec.scale][key];
  return Number.isFinite(full) ? { key, full, unit: spec.unit, label: RANGE_LABELS[key] || key } : null;
}

/**
 * Smallest step the display can show on this range.
 *
 * A 2000-count movement divided into a range gives an awkward number — 250 V
 * over 2000 counts is 0.125 V — and no meter has a 0.125 V step. Real ones
 * fall back to the 1-2-5 sequence below it, which is what the engraving and
 * the digits on the display actually do: 0.1 V on the 250 V range, 5 mA on
 * the 10 A range, 1 mV on the 2 V range.
 */
export function resolutionOf(full) {
  const raw = full / COUNTS;
  const decade = 10 ** Math.floor(Math.log10(raw));
  for (const m of [5, 2, 1]) if (m * decade <= raw) return Number((m * decade).toPrecision(1));
  return Number(decade.toPrecision(1));
}

/** Is the quantity bigger than the selected range can display? */
export function overRange(inputs) {
  const r = rangeOf(inputs);
  const t = targetOf(inputs);
  if (!r || !Number.isFinite(t.value)) return false;
  return Math.abs(t.value) > r.full;
}

export const defaults = { target: 'resistor', func: 'ohm', connection: 'parallel', voltageRange: 'r20', currentRange: 'r02', resistanceRange: 'r2k' };

export function targetOf(inputs) { return TARGETS[inputs.target] || TARGETS.resistor; }

export function correctFunc(inputs) {
  const t = targetOf(inputs);
  if (t.kind === 'R' || t.kind === 'cont') return inputs.func === 'ohm' || inputs.func === 'cont';
  if (t.kind === 'Vdc') return inputs.func === 'vdc';
  if (t.kind === 'Vac') return inputs.func === 'vac';
  return inputs.func === 'aac';
}
export function correctConnection(inputs) {
  const t = targetOf(inputs);
  if (t.kind === 'Aac') return inputs.connection === 'series';
  return inputs.connection === 'parallel' || t.kind === 'R' || t.kind === 'cont';
}

export function validate(inputs) {
  const warnings = [];
  const t = targetOf(inputs);
  if ((inputs.func === 'ohm' || inputs.func === 'cont') && t.live) {
    warnings.push({ field: 'func', code: 'OHM_ON_LIVE', message: 'This target is a live circuit — resistance cannot be measured on it.', why: 'An ohmmeter passes current from its own internal cell. On a circuit that is already powered, the reading is meaningless and can damage the meter.', fix: 'Switch the target off first, or select a voltage/current function.' });
  }
  if (!correctFunc(inputs)) warnings.push({ field: 'func', code: 'WRONG_FUNCTION', message: 'This function does not match the target.', why: 'AC and DC are measured on different functions, and resistance can only be measured on a dead circuit.' });
  if (correctFunc(inputs) && overRange(inputs)) {
    const r = rangeOf(inputs);
    warnings.push({
      field: RANGE_OF_FUNC[inputs.func].control,
      code: 'RANGE_TOO_LOW',
      message: `The ${r.label} ${r.unit} range cannot display this — the meter shows OL.`,
      why: 'A range is the largest quantity the display can show. Anything beyond it drives every digit off the end, so the meter shows an over-range marker instead of a number.',
      fix: 'Turn the switch to the next range up, then work down until the display uses as many digits as it can.',
    });
  }
  if (correctFunc(inputs) && !correctConnection(inputs)) warnings.push({ field: 'connection', code: 'WRONG_CONNECTION', message: 'An ammeter must be in series; a voltmeter in parallel.', why: 'Connecting an ammeter in parallel effectively short-circuits the source through the meter\'s low resistance.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, reading: 0, settling: 0, correct: false }; }
/**
 * A digital multimeter. It does not answer instantly: the display settles
 * over a moment, and if the function switch or the leads are wrong it
 * settles on the wrong thing rather than refusing — which is exactly the
 * mistake this exercise is meant to teach a student to catch.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const ok = correctFunc(inputs) && correctConnection(inputs) && !overRange(inputs);
  s.correct = ok;
  s.overRange = correctFunc(inputs) && correctConnection(inputs) && overRange(inputs);
  const target = ok ? (targetOf(inputs)?.value ?? 0) : 0;
  s.reading += (target - s.reading) * Math.min(1, dt * 5);
  s.settling = Math.abs(target - s.reading) > Math.max(1e-6, Math.abs(target) * 0.002) ? 1 : 0;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const t = targetOf(inputs);
  const rng = makeRng(seed + trial * 211);
  const wired = correctFunc(inputs) && correctConnection(inputs) && !((inputs.func === 'ohm' || inputs.func === 'cont') && t.live);
  const tooSmallARange = wired && overRange(inputs);
  const correct = wired && !tooSmallARange;
  const r = rangeOf(inputs);
  let reading;
  if (tooSmallARange) reading = `OL (beyond the ${r.label} ${r.unit} range)`;
  else if (!correct) reading = t.live && (inputs.func === 'ohm' || inputs.func === 'cont') ? 'unstable / OL' : 'incorrect';
  else if (inputs.func === 'cont' || t.kind === 'cont') {
    /* The continuity position has no range switch: the meter reads the
       resistance on its own low scale and beeps below about fifty ohm. Put on
       a 470 Ω resistor it therefore reads 470 Ω and stays silent, which is
       the answer to "is this lead broken?" for something that is not a lead.
       Falling through to the ranged branch instead asked a switch that does
       not exist on this position for its full scale, and threw. */
    if (!Number.isFinite(t.value)) reading = 'OL (open circuit)';
    else {
      const r0 = sigFig(t.value + jitter(rng, 0.05), 2);
      reading = `${r0} Ω ${r0 < 50 ? '(continuity — beeps)' : '(no beep)'}`;
    }
  }
  else {
    // A digital meter shows whole counts, and the range decides how big a count is.
    const res = resolutionOf(r.full);
    const raw = t.value + jitter(rng, t.value * 0.01);
    reading = Number((Math.round(raw / res) * res).toFixed(Math.max(0, -Math.floor(Math.log10(res)))));
  }
  return { trial, target: t.label, func: inputs.func, range: r ? `${r.label} ${r.unit}` : '—', connection: inputs.connection, reading, _correct: correct };
}

const FUNC_LABELS = { ohm: 'resistance (Ω)', cont: 'continuity', vdc: 'DC voltage', vac: 'AC voltage', aac: 'AC current' };

export function derive(rows) {
  if (rows.length < 3) return { ok: false, reason: 'Test at least three different targets.' };
  const correctRows = rows.filter((r) => r._correct);
  const usedFuncs = [...new Set(correctRows.map((r) => r.func))];
  const functionsUsed = usedFuncs.length;
  const foundBreak = correctRows.some((r) => typeof r.reading === 'string' && r.reading.includes('OL'));
  const foundGood = correctRows.some((r) => typeof r.reading === 'string' && r.reading.includes('continuity') && !r.reading.includes('OL'));
  return {
    ok: true, functionsUsed, correctReadings: correctRows.length, foundBreak, foundGood,
    targetsTested: new Set(rows.map((r) => r.target)).size,
    functionList: `Functions used: ${usedFuncs.map((f) => FUNC_LABELS[f] || f).join(', ') || 'none valid yet'}`,
    allValid: correctRows.length === rows.length, continuityDone: rows.some((r) => r.func === 'cont' && r._correct),
    resistanceRows: correctRows.filter((r) => r.func === 'ohm').length,
    voltageRows: correctRows.filter((r) => r.func === 'vdc' || r.func === 'vac').length,
    currentRows: correctRows.filter((r) => r.func === 'aac').length,
    n: rows.length, points: [],
  };
}

export default { meta, defaults, TARGETS, RANGES, RANGE_LABELS, RANGE_OF_FUNC, init, step, measure, derive, validate, targetOf, correctFunc, correctConnection, rangeOf, resolutionOf, overRange };
