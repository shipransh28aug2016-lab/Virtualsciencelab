/**
 * MODEL: Rolling friction of a roller — XI-PHY-ACT-A4
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 4.
 * F = μr·R, with μr one to two orders of magnitude smaller than sliding friction.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';
import { nullPoint, nullRefusal } from '../null-point.js';

export const meta = {
  id: 'XI-PHY-ACT-A4',
  formula: 'F = μr·R',
  unitSystem: 'Newton',
  assumptions: ['The roller rolls without slipping', 'The surface is rigid and does not deform under the roller'],
  validRange: 'Normal reaction up to about 4 N',
  edgeCases: ['Rolling friction is far smaller than sliding friction for the same pair of surfaces'],
  expectedBehaviour: ['F is proportional to R, a line through the origin', 'μr is smaller on glass than on wood or rubber'],
};

export const G = 9.792;
export const SURFACES = { glass: { label: 'Glass', mu: 0.0021 }, wood: { label: 'Wood', mu: 0.0048 }, rubber: { label: 'Rubber mat', mu: 0.0095 } };
export const ROLLERS = { r2: { label: 'Roller (small)', massG: 80 }, r3: { label: 'Roller (medium)', massG: 140 }, r5: { label: 'Roller (large)', massG: 220 } };

export const defaults = { panG: 0, loadG: 0, surface: 'wood', roller: 'r3', weights: 'fine' };

export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.wood; }
export function rollerOf(inputs) { return ROLLERS[inputs.roller] || ROLLERS.r3; }
export function normalReactionN(inputs) { return ((rollerOf(inputs).massG + inputs.loadG) / 1000) * G; }
export function rollingFrictionN(inputs) { return surfaceOf(inputs).mu * normalReactionN(inputs); }
export function panForceN(inputs) { return (inputs.panG / 1000) * G; }
export function rolling(inputs) { return panForceN(inputs) >= rollingFrictionN(inputs) * 0.9 && panForceN(inputs) <= rollingFrictionN(inputs) * 1.4; }

/**
 * Whether the roller is moving steadily. Rolling friction is small, so the
 * window between "will not start" and "accelerating away" is narrow — which
 * is the observation the activity is designed to produce.
 */
export function nullIndicator(inputs) {
  const need = rollingFrictionN(inputs);
  return nullPoint({
    label: 'Roller',
    current: panForceN(inputs),
    target: need * 1.15,          // the middle of the steady-rolling window
    tolerance: need * 0.25,
    increase: 'The roller stays put — add fine weights to the pan.',
    decrease: 'The roller accelerates away instead of rolling steadily — take weights off.',
    atNullText: 'rolling steadily',
    awayFrom: 'not rolling steadily',
  });
}

export function validate(inputs) {
  const warnings = [];
  if (!rolling(inputs)) warnings.push({ field: 'panG', code: 'NOT_ROLLING', message: 'The pan load is not close to the rolling-friction value.', why: 'Rolling friction is tiny; add fine weights slowly until the roller just begins to move steadily.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, s: 0, v: 0, rolling: false }; }

/** Total mass the pan has to accelerate: roller + its load + the pan itself. */
export function movingMassKg(inputs) {
  return (rollerOf(inputs).massG + inputs.loadG + inputs.panG) / 1000;
}

/**
 * The roller under the pull of the pan, opposed by rolling friction.
 *
 *   a = (F_pan − μ_r·R) / (m_roller + m_load + m_pan)
 *
 * Two faults were fixed here, both of which made the activity impossible to
 * perform:
 *
 * 1. The roller never moved. init() starts it at v = 0 and the old step()
 *    only ever DECELERATED, so pressing "Start rolling" set the flag, the
 *    first frame found v still 0, and the flag was cleared again. Nothing on
 *    the bench ever shifted and no reading could be taken. The pan is what
 *    drives this apparatus, so the net force now accelerates the roller from
 *    rest, exactly as it does on a real bench.
 *
 * 2. The surface was ignored. The deceleration read `rollingCoefficient`,
 *    an identifier that does not exist in this module, so `typeof` quietly
 *    returned 'undefined' and it fell through to `inputs.mu ?? 0.02` —
 *    `inputs.mu` does not exist either, leaving a hardcoded 0.02 for every
 *    case. Glass, wood and rubber decelerated identically, defeating the one
 *    comparison the activity exists to make, while the module's own SURFACES
 *    table (μ = 0.0021 / 0.0048 / 0.0095) went unread. It is read now.
 *
 * This is what makes the pan load meaningful: below the rolling-friction
 * value nothing moves at all; just above it the roller creeps steadily —
 * the threshold the student is looking for; well above it the roller visibly
 * accelerates away.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.rolling) return s;
  const net = panForceN(inputs) - rollingFrictionN(inputs);
  const a = net / movingMassKg(inputs);
  s.v = Math.max(0, s.v + a * dt);
  s.s += s.v * dt;
  // At rest with nothing left to drive it, the roller has stopped for good.
  if (s.v <= 1e-6 && net <= 0) s.rolling = false;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!rolling(inputs)) return { v: null, reason: nullRefusal(nullIndicator(inputs)) };
  const rng = makeRng(seed + trial * 113);
  const R = normalReactionN(inputs);
  const F = Number((rollingFrictionN(inputs) + jitter(rng, rollingFrictionN(inputs) * 0.05)).toFixed(4));
  return { trial, loadG: inputs.loadG, totalMassG: rollerOf(inputs).massG + inputs.loadG, normalReaction: sigFig(R, 4), panG: inputs.panG, rollingFriction: F, ratio: sigFig(F / R, 5) };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.normalReaction), y: Number(r.rollingFriction) }));
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  return { ok: true, muRolling: sigFig(fit.slope, 4), rollingResistanceCm: sigFig(fit.slope * 3, 4), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, SURFACES, ROLLERS, G, init, step, measure, derive, validate, surfaceOf, rollerOf, normalReactionN, rollingFrictionN, panForceN, rolling, movingMassKg, nullIndicator};
