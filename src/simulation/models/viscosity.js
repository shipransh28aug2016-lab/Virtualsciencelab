/**
 * MODEL: Coefficient of viscosity by terminal velocity — XI-PHY-B05
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 5.
 * Stokes' law at terminal velocity: η = 2r²(ρ−σ)g / 9v, valid for Re ≪ 1.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B05',
  formula: 'η = 2r²(ρ−σ)g/9v; Re = 2rvσ/η',
  unitSystem: 'SI: Pa·s, also reported in poise',
  assumptions: ['The sphere has reached terminal velocity before entering the marked column', 'Flow around the sphere is streamline (Re ≪ 1)', 'The liquid extends effectively to infinity (wall correction applied for a narrow tube)'],
  validRange: 'Sphere radius 1-3 mm; Reynolds number should stay below about 1',
  edgeCases: ['A large, dense sphere in a thin liquid gives turbulent flow and Stokes\' law fails', 'A sphere less dense than the liquid floats and never reaches terminal velocity'],
  expectedBehaviour: ['v is proportional to r² — a straight line through the origin', 'η is the same for every sphere size once corrected for the tube wall'],
};

export const G = 9.792;
export const LIQUIDS = { castorOil: { label: 'Castor oil', rho: 961, eta20: 0.985, detaDC: -0.028 }, glycerine: { label: 'Glycerine', rho: 1260, eta20: 1.410, detaDC: -0.06 }, engineOil: { label: 'Engine oil (thin)', rho: 880, eta20: 0.29, detaDC: -0.01 } };
export const BALLS = {
  steel2: { label: 'Steel sphere 1.0 mm', radiusMm: 1.0, rho: 7800 },
  steel3: { label: 'Steel sphere 1.5 mm', radiusMm: 1.5, rho: 7800 },
  steel4: { label: 'Steel sphere 2.0 mm', radiusMm: 2.0, rho: 7800 },
  steel6: { label: 'Steel sphere 3.0 mm', radiusMm: 3.0, rho: 7800 },
  glass4: { label: 'Glass sphere 2.0 mm', radiusMm: 2.0, rho: 2500 },
  nylon3: { label: 'Nylon sphere 1.5 mm', radiusMm: 1.5, rho: 1150 },
};
export const TUBES = { wide: { label: 'Wide jar', radiusCm: 4 }, narrow: { label: 'Narrow jar', radiusCm: 1.5 } };

export const defaults = { liquid: 'castorOil', ball: 'steel3', tube: 'wide', upperMarkCm: 15, fallDistanceCm: 40, tempC: 20 };

export function liquidOf(inputs) { return LIQUIDS[inputs.liquid] || LIQUIDS.castorOil; }
export function ballOf(inputs) { return BALLS[inputs.ball] || BALLS.steel3; }
export function etaAt(inputs) { const l = liquidOf(inputs); return Math.max(0.02, l.eta20 + l.detaDC * (inputs.tempC - 20)); }
export function floats(inputs) { return ballOf(inputs).rho <= liquidOf(inputs).rho; }

/** Ladenburg's wall-correction factor: v_free = v_observed x wallFactor. */
export function wallFactor(inputs) {
  const r = ballOf(inputs).radiusMm / 1000;
  const R = (TUBES[inputs.tube] || TUBES.wide).radiusCm / 100;
  return 1 + 2.4 * (r / R);
}
/** Terminal velocity by Stokes' law, m/s, with the Ladenburg wall correction inverted. */
export function terminalVelocity(inputs) {
  if (floats(inputs)) return 0;
  const r = ballOf(inputs).radiusMm / 1000;
  const l = liquidOf(inputs);
  const eta = etaAt(inputs);
  const v0 = (2 * r * r * (ballOf(inputs).rho - l.rho) * G) / (9 * eta);
  return v0 / wallFactor(inputs); // observed velocity is slowed by the wall
}
export function reynolds(inputs) {
  const r = ballOf(inputs).radiusMm / 1000;
  return (2 * r * terminalVelocity(inputs) * liquidOf(inputs).rho) / etaAt(inputs);
}
export function turbulent(inputs) { return reynolds(inputs) > 1; }

export function validate(inputs) {
  const errors = [], warnings = [];
  if (floats(inputs)) errors.push({ field: 'ball', code: 'FLOATS', message: `${ballOf(inputs).label} is less dense than ${liquidOf(inputs).label} and floats.`, why: 'A sphere that floats never falls, so it never reaches a terminal velocity and Stokes\' law does not apply.', fix: 'Choose a denser sphere.' });
  else if (turbulent(inputs)) warnings.push({ field: 'ball', code: 'TURBULENT', message: `Reynolds number is about ${reynolds(inputs).toFixed(1)}, so the flow is not streamline.`, why: 'Stokes\' law assumes viscous (streamline) flow around the sphere, valid only for Re well below 1. A larger, denser sphere in a thin liquid falls too fast for this assumption to hold.', fix: 'Use a smaller sphere or a more viscous liquid.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, released: false, y: 0, v: 0, elapsed: 0, atTerminal: false, landed: false }; }
/**
 * The ball falls through the liquid.
 *
 * It does not start at its terminal speed: it accelerates until viscous
 * drag balances the net weight, which is why the upper mark must be far
 * enough below the surface for Stokes' law to apply by the time timing
 * starts. Integrating it — rather than jumping straight to v_t — is what
 * lets a student see that.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.released || s.landed) return s;
  const vT = terminalVelocity(inputs);
  // First-order approach to terminal velocity; the time constant is short
  // for a small sphere in a viscous liquid.
  s.v += (vT - s.v) * Math.min(1, dt * 9);
  s.y += s.v * dt;
  s.elapsed += dt;
  s.atTerminal = Math.abs(s.v - vT) < vT * 0.02;
  if (s.y >= inputs.fallDistanceCm / 100) { s.y = inputs.fallDistanceCm / 100; s.landed = true; }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (floats(inputs)) return null;
  const rng = makeRng(seed + trial * 89);
  const v = terminalVelocity(inputs);
  const d = inputs.fallDistanceCm / 100;
  const trueTime = d / v;
  const timeS = Number((trueTime + jitter(rng, trueTime * 0.02)).toFixed(2));
  const vObs = d / timeS;
  const r = ballOf(inputs).radiusMm;
  /*
   * The sphere's fall was slowed by the container wall (that is exactly
   * why terminalVelocity() divided by wallFactor() to get the observed
   * speed in the first place), so recovering eta from the OBSERVED speed
   * without correcting back for that same factor systematically
   * overstates eta -- by ~10% for the default 1.5 mm ball in the wide jar,
   * and worse for a relatively wider sphere or narrower jar. The real
   * procedure applies exactly the correction the model's own assumptions
   * claim it does ("wall correction applied for a narrow tube").
   */
  const vFree = vObs * wallFactor(inputs);
  return {
    trial, ball: ballOf(inputs).label, ballRho: ballOf(inputs).rho, radiusMm: r, radiusSq: Number((r * r).toFixed(3)),
    distanceCm: inputs.fallDistanceCm, timeS, velocity: Number((vObs * 100).toFixed(3)),
    etaPas: sigFig((2 * (r / 1000) ** 2 * (ballOf(inputs).rho - liquidOf(inputs).rho) * G) / (9 * vFree), 4),
    _turbulent: turbulent(inputs),
  };
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => !r._turbulent);
  if (usable.length < 4) return { ok: false, reason: 'Record the terminal velocity for at least four spheres, all in streamline flow.' };
  const l = liquidOf(inputs);
  const etaFromMean = usable.reduce((a, r) => a + Number(r.etaPas), 0) / usable.length;

  /*
   * The v-against-r² graphical method only gives a straight line through
   * the origin if every sphere plotted is the SAME material -- (ρ−σ) is
   * the constant slope only then -- so grouping has to be by density, NOT
   * by the ball's label (each radius of even the same material gets its
   * own label, e.g. "Steel sphere 1.0 mm" vs "Steel sphere 1.5 mm", so
   * grouping by label would never see them as the same material at all).
   * The fit is restricted to whichever material makes up the most of the
   * usable readings.
   */
  const byMaterial = new Map();
  for (const r of usable) {
    const rho = Number(r.ballRho);
    if (!byMaterial.has(rho)) byMaterial.set(rho, []);
    byMaterial.get(rho).push(r);
  }
  const [dominantRho, dominantRows] = [...byMaterial.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const distinctRadii = new Set(dominantRows.map((r) => Number(r.radiusMm))).size;
  const variedRadius = distinctRadii >= 3;

  // Each sphere's own radius sets its own wall correction (a bigger sphere
  // in the same jar is slowed proportionally more), so the fit needs each
  // point corrected individually, not by one factor for the whole graph.
  const R = (TUBES[inputs.tube] || TUBES.wide).radiusCm / 100;
  const freeVelocityCmS = (r) => Number(r.velocity) * (1 + 2.4 * (Number(r.radiusMm) / 1000 / R));

  let etaFromGraph = null, r2 = null, points = usable.map((r) => ({ x: Number(r.radiusSq), y: Number(r.velocity) }));
  if (variedRadius) {
    const pts = dominantRows.map((r) => ({ x: Number(r.radiusSq), y: freeVelocityCmS(r) }));
    const fit = fitThroughOrigin(pts);
    if (fit) {
      // slope (cm/s per mm²) -> SI: v(m/s) = slope_SI * r²(m²).
      const slopeSI = (fit.slope * 0.01) / 1e-6;
      // η = 2r²(ρ−σ)g/9v ⟹ slope = 2(ρ−σ)g/(9η) ⟹ η = 2(ρ−σ)g/(9·slope).
      etaFromGraph = sigFig((2 * (dominantRho - l.rho) * G) / (9 * slopeSI), 4);
      r2 = Number(fit.r2.toFixed(4));
      points = pts;
    }
  }

  /*
   * step()'s approach to terminal velocity is dv/dt = 9(v_T − v) (a time
   * constant of 1/9 s), so the sphere reaches 98% of v_T only after
   * covering about 0.326·v_T metres -- kept in sync with the 9 s⁻¹ rate
   * used there. The upper mark must clear that before timing starts, or
   * the "terminal" velocity being timed is not actually terminal yet.
   */
  const vT = terminalVelocity(inputs);
  const reachedTerminal = (inputs.upperMarkCm ?? defaults.upperMarkCm) / 100 >= 0.326 * vT;

  return {
    ok: true, eta: sigFig(etaFromMean, 4), etaPoise: sigFig(etaFromMean * 10, 4),
    etaFromGraph, r2, reynolds: sigFig(reynolds(inputs), 3), streamline: !turbulent(inputs),
    liquid: l.label, tempC: inputs.tempC, accepted: sigFig(etaAt(inputs), 4),
    variedRadius, distinctRadii, wallFactor: sigFig(wallFactor(inputs), 4), reachedTerminal,
    n: usable.length, points,
  };
}

export default { meta, defaults, LIQUIDS, BALLS, TUBES, G, init, step, measure, derive, validate, liquidOf, ballOf, etaAt, floats, wallFactor, terminalVelocity, reynolds, turbulent };
