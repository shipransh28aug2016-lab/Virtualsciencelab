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
/**
 * ROLLING RESISTANCE IS A LENGTH, NOT A RATIO.
 *
 * The quantity that belongs to a pair of surfaces is `a`, the coefficient of
 * rolling resistance, measured in centimetres; the dimensionless coefficient
 * a student calculates is mu_r = a/r, so it depends on the roller as well as
 * the surface. That is the whole conclusion of this activity — "the
 * resistance falls as the radius rises, so a larger roller rolls more easily",
 * which the result panel has always stated.
 *
 * It could not be demonstrated. The rollers carried a mass and a size in
 * their names and no radius at all; mu was a property of the surface alone,
 * so changing "small" for "large" changed nothing, and the panel's
 * comparison across radii printed undefined. The `a` values below are the
 * previous mu figures taken at the medium 3 cm roller, so the accepted
 * coefficient for the default pair is unchanged at 0.0048.
 */
export const SURFACES = {
  glass: { label: 'Glass', aCm: 0.0063, slidingMu: 0.22 },
  wood: { label: 'Wood', aCm: 0.0144, slidingMu: 0.42 },
  rubber: { label: 'Rubber mat', aCm: 0.0285, slidingMu: 0.65 },
};
export const ROLLERS = {
  r2: { label: 'Roller (small)', massG: 80, radiusCm: 1.5 },
  r3: { label: 'Roller (medium)', massG: 140, radiusCm: 3 },
  r5: { label: 'Roller (large)', massG: 220, radiusCm: 5 },
};

/** mu_r = a/r — the dimensionless coefficient for THIS roller on THIS surface. */
export function muRollingFor(inputs) {
  return surfaceOf(inputs).aCm / rollerOf(inputs).radiusCm;
}

export const defaults = { panG: 0, loadG: 0, surface: 'wood', roller: 'r3', weights: 'fine' };

export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.wood; }
export function rollerOf(inputs) { return ROLLERS[inputs.roller] || ROLLERS.r3; }
export function normalReactionN(inputs) { return ((rollerOf(inputs).massG + inputs.loadG) / 1000) * G; }
export function rollingFrictionN(inputs) { return muRollingFor(inputs) * normalReactionN(inputs); }
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
  const roller = rollerOf(inputs);
  return { trial, loadG: inputs.loadG, totalMassG: roller.massG + inputs.loadG, normalReaction: sigFig(R, 4), panG: inputs.panG, rollingFriction: F, ratio: sigFig(F / R, 5), roller: inputs.roller, radiusCm: roller.radiusCm, surface: inputs.surface };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.normalReaction), y: Number(r.rollingFriction) }));
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different loads.' };
  const fit = fitThroughOrigin(pts);

  const surface = surfaceOf(inputs);
  const radii = [...new Set(rows.map((r) => Number(r.radiusCm)).filter(Number.isFinite))].sort((a, b) => a - b);
  /* Group the readings by roller, so the panel can show mu_r falling as the
     radius rises — which is what this activity concludes and could not
     previously show, because the rollers had no radius. */
  const radiusCheck = radii.length > 1 ? radii.map((radiusCm) => {
    const sub = rows.filter((r) => Number(r.radiusCm) === radiusCm)
      .map((r) => ({ x: Number(r.normalReaction), y: Number(r.rollingFriction) }));
    const f = sub.length >= 2 ? fitThroughOrigin(sub) : null;
    return { radiusCm, mu: f ? sigFig(f.slope, 3) : '—' };
  }) : null;

  const muR = fit.slope;
  const slidingMu = surface.slidingMu;
  return {
    ok: true,
    muRolling: sigFig(muR, 4),
    rollingResistanceCm: sigFig(muR * (rollerOf(inputs).radiusCm), 4),
    accepted: sigFig(muRollingFor(inputs), 3),
    surface: surface.label,
    radiusCm: rollerOf(inputs).radiusCm,
    slidingComparison: sigFig(slidingMu, 3),
    timesSmaller: muR > 0 ? Math.round(slidingMu / muR) : '—',
    radiusCheck,
    radiiCompared: radii.length,
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { meta, defaults, SURFACES, ROLLERS, G, muRollingFor, init, step, measure, derive, validate, surfaceOf, rollerOf, normalReactionN, rollingFrictionN, panForceN, rolling, movingMassKg, nullIndicator};
