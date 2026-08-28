/**
 * MODEL: Limiting friction and normal reaction — XI-PHY-A09
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 9.
 * F_limiting = μs·R, R = (M+m)g. A pan is loaded until the block just slips;
 * that pan load, converted to a force, is the limiting friction for the
 * normal reaction set by the block's own weight plus any load on it.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A09',
  formula: 'F = μs·R, R = (M+m)g',
  unitSystem: 'Mass in gram, force in newton',
  assumptions: ['The table surface is uniform', 'The string over the pulley is light and the pulley frictionless', 'The block is on the point of sliding, not already sliding'],
  validRange: 'Normal reaction 1-7 N',
  edgeCases: ['Too little pan load never overcomes static friction', 'A lubricated surface gives a much smaller μ'],
  expectedBehaviour: ['F is directly proportional to R — a straight line through the origin', 'μ is unchanged when the block rests on its narrow face'],
};

export const G = 9.792;
export const SURFACES = { woodWood: { label: 'Wood on wood', mu: 0.42 }, woodGlass: { label: 'Wood on glass', mu: 0.28 }, woodMetal: { label: 'Wood on metal', mu: 0.35 }, lubricated: { label: 'Lubricated wood', mu: 0.12 } };

export const defaults = { loadG: 0, panG: 0, surface: 'woodWood', face: 'broad', blockMassG: 200 };

export function surfaceOf(inputs) { return SURFACES[inputs.surface] || SURFACES.woodWood; }
export function normalReactionN(inputs) { return ((inputs.blockMassG + inputs.loadG) / 1000) * G; }
export function limitingFrictionN(inputs) { return surfaceOf(inputs).mu * normalReactionN(inputs); }
export function panForceN(inputs) { return (inputs.panG / 1000) * G; }
export function slipping(inputs) { return panForceN(inputs) >= limitingFrictionN(inputs); }

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!slipping(inputs)) {
    warnings.push({ field: 'panG', code: 'NOT_SLIPPING', message: 'The block has not yet started to slip.', why: 'Static friction balances any pan load up to the limiting value; add weights to the pan until the block just begins to slide.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, x: 0, v: 0, slipping: false, applied: 0 }; }
/**
 * The block on the bench as load is added to the pan.
 *
 * Below the limiting value static friction simply matches the pull and
 * nothing moves — the observation students most often miss. Once the pull
 * exceeds it the block accelerates under the net force, so the moment of
 * slipping is visible, not merely reported.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const pull = panForceN(inputs);
  const limit = limitingFrictionN(inputs);
  s.applied = pull;
  if (pull <= limit) {
    // Static friction rises to meet the pull; the block stays put.
    s.slipping = false;
    s.v = 0;
    return s;
  }
  s.slipping = true;
  const mass = Math.max(0.02, normalReactionN(inputs) / 9.792);
  const a = (pull - limit * 0.85) / mass;      // kinetic friction is the lower one
  s.v += a * dt;
  s.x += s.v * dt;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!slipping(inputs)) return null;
  const rng = makeRng(seed + trial * 67);
  const R = normalReactionN(inputs);
  const trueF = limitingFrictionN(inputs);
  const F = Number((trueF + jitter(rng, trueF * 0.03)).toFixed(3));
  return { trial, loadG: inputs.loadG, totalMassG: inputs.blockMassG + inputs.loadG, normalReaction: sigFig(R, 4), panG: inputs.panG, limitingFriction: F, ratio: sigFig(F / R, 3), face: inputs.face };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.normalReaction), y: Number(r.limitingFriction) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the limiting friction for at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  if (!fit) return { ok: false, reason: 'Vary the load between readings.' };
  const faces = new Set(rows.map((r) => r.face));

  // Resting the same block on a different face changes the normal reaction
  // and the friction together, so mu should come out the same either way —
  // that invariance IS the check "does friction depend on contact area".
  let areaCheck = null;
  if (faces.size >= 2) {
    const perFace = [...faces].map((face) => {
      const facePts = rows.filter((r) => r.face === face).map((r) => ({ x: Number(r.normalReaction), y: Number(r.limitingFriction) }));
      const faceFit = facePts.length >= 2 ? fitThroughOrigin(facePts) : null;
      return faceFit ? { face, mu: sigFig(faceFit.slope, 3) } : null;
    }).filter(Boolean);
    if (perFace.length >= 2) {
      const spread = (Math.max(...perFace.map((f) => f.mu)) - Math.min(...perFace.map((f) => f.mu))) / fit.slope;
      areaCheck = {
        faces: perFace,
        verdict: spread < 0.12
          ? 'μ is essentially the same on both faces — friction does not depend on the area of contact, as the laws of friction predict.'
          : 'μ differs more than expected between faces — check that the block was genuinely on the point of slipping (not already sliding, and not still static) in both sets of readings.',
      };
    }
  }

  return {
    ok: true, mu: sigFig(fit.slope, 3), angleOfFriction: sigFig((Math.atan(fit.slope) * 180) / Math.PI, 4),
    surface: surfaceOf(inputs).label, accepted: surfaceOf(inputs).mu,
    r2: Number(fit.r2.toFixed(4)), facesCompared: faces.size, areaCheck, n: pts.length, points: pts,
  };
}

export default { meta, defaults, SURFACES, G, init, step, measure, derive, validate, surfaceOf, normalReactionN, limitingFrictionN, panForceN, slipping };
