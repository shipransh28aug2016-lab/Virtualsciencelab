/**
 * MODEL: Testing a diode and LED with a multimeter — XII-PHY-ACT-B2
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 2.
 * Forward bias conducts, reverse bias blocks: unidirectional flow. A fault
 * is either open both ways or shorted (conducting) both ways.
 */
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B2',
  formula: 'Healthy junction: conducts forward (~0.7 V diode, ~1.8-2.0 V LED), blocks reverse',
  unitSystem: 'Volt (forward drop); open/short for faults',
  assumptions: ['The meter\'s diode-test function supplies enough voltage to forward-bias silicon', 'Each component is tested in both directions before a verdict is given'],
  validRange: 'Three diodes/LEDs healthy, three carrying a planted fault',
  edgeCases: ['A single-direction reading can never establish a fault — both readings are needed'],
  expectedBehaviour: ['A healthy component is unidirectional', 'An open fault reads nothing either way; a short reads near zero both ways'],
};

export const COMPONENTS = {
  d1: { label: 'Diode 1', type: 'diode', fault: null, forwardV: 0.68 },
  d2: { label: 'Diode 2', type: 'diode', fault: 'open', forwardV: null },
  d3: { label: 'Diode 3', type: 'diode', fault: 'short', forwardV: 0.02 },
  l1: { label: 'LED 1', type: 'led', fault: null, forwardV: 1.9 },
  l2: { label: 'LED 2', type: 'led', fault: 'open', forwardV: null },
  l3: { label: 'LED 3', type: 'led', fault: 'short', forwardV: 0.01 },
};

export const defaults = { component: 'd1', func: 'diode', polarity: 'forward', verdict: 'good' };

export function componentOf(inputs) { return COMPONENTS[inputs.component] || COMPONENTS.d1; }

/** What the meter shows: a forward voltage, 'OL' (open), or a near-zero short reading. */
export function reading(inputs) {
  const c = componentOf(inputs);
  if (c.fault === 'open') return 'OL';
  if (c.fault === 'short') return c.forwardV;
  return inputs.polarity === 'forward' ? c.forwardV : 'OL';
}
export function trueVerdict(inputs) { const c = componentOf(inputs); return c.fault || 'good'; }

export function validate(inputs) {
  const warnings = [];
  if (inputs.func !== 'diode') warnings.push({ field: 'func', code: 'WRONG_FUNCTION', message: 'The diode-test function is needed, not the ohms range.', why: 'The diode-test range supplies enough voltage to show the forward drop directly; the ordinary ohms range on many meters cannot forward-bias a junction at all.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, current: 0, conducting: false, reading: 0 }; }
/**
 * Testing a diode. Forward biased it conducts once past its knee (about
 * 0.7 V for silicon, 0.3 V for germanium) and the current then climbs
 * steeply; reverse biased essentially nothing flows. The meter is eased
 * towards the value so the student sees it swing, as a real one does.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const V = inputs.appliedV ?? 0;
  const forward = (inputs.bias ?? 'forward') === 'forward';
  const knee = (inputs.diode === 'Ge' || inputs.material === 'germanium') ? 0.3 : 0.7;
  // Shockley-like: exponential above the knee, leakage below.
  const target = forward
    ? (V > knee ? 0.001 * (Math.exp((V - knee) / 0.05) - 1) : 1e-6 * V)
    : -2e-6;
  s.current += (Math.max(-0.01, Math.min(0.08, target)) - s.current) * Math.min(1, dt * 8);
  s.conducting = forward && V > knee;
  s.reading = s.current;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const fwd = reading({ ...inputs, polarity: 'forward' });
  const rev = reading({ ...inputs, polarity: 'reverse' });
  const uni = fwd !== 'OL' && rev === 'OL';
  const correct = inputs.verdict === trueVerdict(inputs);
  return { trial, component: componentOf(inputs).label, forward: fwd === 'OL' ? 'OL' : `${sigFig(fwd, 3)} V`, reverse: rev === 'OL' ? 'OL' : `${sigFig(rev, 3)} V`, unidirectional: uni ? 'yes' : 'no', verdict: inputs.verdict, correct, _type: componentOf(inputs).type };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Test at least four components, both directions.' };
  const components = new Set(rows.map((r) => r.component));
  if (components.size < 4) return { ok: false, reason: 'Test at least four different components.' };
  const correct = rows.filter((r) => r.correct);
  const faultsFound = new Set(correct.filter((r) => r.verdict !== 'good').map((r) => r.component)).size;
  return { ok: true, accuracyPct: sigFig((correct.length / rows.length) * 100, 3), faultsFound, n: rows.length, points: [] };
}

export default { meta, defaults, COMPONENTS, init, step, measure, derive, validate, componentOf, reading, trueVerdict };
