/**
 * MODEL: Range of a projectile against angle of projection — XI-PHY-ACT-A5
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 5.
 * R = u² sin(2θ)/g; time of flight = 2u sinθ/g; range maximises at 45°.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A5',
  formula: 'R = u²sin(2θ)/g; T = 2u sinθ/g; H = u²sin²θ/2g',
  unitSystem: 'SI: metre, second, degree',
  assumptions: ['Air resistance is negligible for the light ball used', 'The launcher gives the same launch speed each time', 'Launch and landing are at the same height'],
  validRange: 'Angle 5°-85°',
  edgeCases: ['A launch angle of 0° or 90° gives zero range', 'Complementary angles (θ and 90°−θ) give equal ranges'],
  expectedBehaviour: ['Range is maximum at 45°', 'The launch speed recovered from any shot is the same, since the spring setting is unchanged'],
};

export const G = 9.792;
export const LAUNCHERS = { soft: { label: 'Soft spring', speed: 4.0 }, medium: { label: 'Medium spring', speed: 6.0 }, strong: { label: 'Strong spring', speed: 8.2 } };
export const TABLE_HEIGHT_M = 0.9;

export const defaults = { angleDeg: 45, launcher: 'medium', mount: 'ground' };

export function launcherOf(inputs) { return LAUNCHERS[inputs.launcher] || LAUNCHERS.medium; }
/**
 * Height of the launch point above the floor it lands on. The `mount`
 * control ("ground" / "table") existed in every experiment JSON and on
 * screen, but nothing downstream ever read it: every formula used
 * R = u²sin(2θ)/g regardless, so mounting the launcher on the table changed
 * nothing at all -- a control with a visible effect on the apparatus and
 * none whatsoever on the physics.
 */
export function launchHeightM(inputs) { return inputs.mount === 'table' ? TABLE_HEIGHT_M : 0; }

/**
 * Time of flight landing at y = -h (the floor) from an initial height h:
 *   -h = u sinθ·t - ½gt²  →  t = [u sinθ + √((u sinθ)² + 2gh)] / g
 * Reduces to the familiar t = 2u sinθ/g exactly when h = 0.
 */
export function timeOfFlight(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  const h = launchHeightM(inputs);
  const uy = u * Math.sin(th);
  return (uy + Math.sqrt(uy * uy + 2 * G * h)) / G;
}
export function rangeM(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  return u * Math.cos(th) * timeOfFlight(inputs);
}
/** Height reached above the FLOOR (launch height plus the rise above it). */
export function maxHeightM(inputs) {
  const u = launcherOf(inputs).speed;
  const th = (inputs.angleDeg * Math.PI) / 180;
  return launchHeightM(inputs) + (u * u * Math.sin(th) ** 2) / (2 * G);
}
/**
 * The angle that maximises range from height h. Maximising
 * R(θ) = (u cosθ/g)[u sinθ + √(u²sin²θ + 2gh)] over θ gives
 * tanθ_opt = u/√(u² + 2gh), equivalently cos(2θ_opt) = gh/(u² + gh).
 * At h = 0 this gives cos(2θ) = 0, θ = 45°, as expected; launching from any
 * height above the landing point always makes a FLATTER shot the best one
 * (θ_opt < 45°), because the extra fall time is "free" range that does not
 * need a steep launch to buy it -- confirmed by a numerical sweep of R(θ)
 * for u = 6 m/s, h = 0.9 m, which peaks at θ ≈ 39.3°, exactly what this
 * closed form gives.
 */
export function optimumAngleDeg(inputs) {
  const u = launcherOf(inputs).speed;
  const h = launchHeightM(inputs);
  if (h <= 0) return 45;
  const cos2th = (G * h) / (u * u + G * h);
  return (Math.acos(Math.max(-1, Math.min(1, cos2th))) * 180) / Math.PI / 2;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
/**
 * `y` is kept as height ABOVE THE FLOOR throughout, not above the launch
 * point — so a table-mounted shot starts at y = launchHeightM(inputs) and
 * lands, as any shot does, at y = 0. Without this, a table-mounted launch
 * would fly exactly like a ground-level one (init always started it at
 * y = 0, i.e. already "on the floor"), silently throwing away the entire
 * point of the `mount` control.
 */
export function init(inputs = defaults) { return { t: 0, flying: false, x: 0, y: launchHeightM(inputs), vx: 0, vy: 0, landed: false, range: 0 }; }
/**
 * The projectile actually flies.
 *
 * Horizontal and vertical motion are integrated independently -- constant
 * velocity across, uniform acceleration down -- which is the whole content
 * of the experiment, and it is far better seen as a trajectory than read
 * off a formula.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.flying || s.landed) return s;
  s.vy -= G * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.y <= 0) { s.y = 0; s.landed = true; s.flying = false; s.range = s.x; }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 127);
  const trueR = rangeM(inputs);
  const R = Number((trueR + jitter(rng, 0.06)).toFixed(3));
  const th = (inputs.angleDeg * Math.PI) / 180;
  return { trial, angleDeg: inputs.angleDeg, sin2Theta: sigFig(Math.sin(2 * th), 4), rangeM: R, timeOfFlight: sigFig(timeOfFlight(inputs), 4), maxHeightM: sigFig(maxHeightM(inputs), 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 4) return { ok: false, reason: 'Record the range for at least four angles.' };
  const best = rows.reduce((a, b) => (Number(a.rangeM) >= Number(b.rangeM) ? a : b));
  const groundLevel = (inputs.mount ?? 'ground') !== 'table';
  const heightM = launchHeightM(inputs);

  /*
   * Recovering the launch speed by inverting R = u²sin(2θ)/g only works
   * from ground level: from a height, u enters the range through the
   * flight-time term as well, so a single shot no longer inverts to a
   * unique speed algebraically. Rather than report a wrong number, a
   * table-mounted run reports the speed the apparatus itself would let a
   * student read straight off the spring setting.
   */
  let launchSpeed = null;
  if (groundLevel) {
    const speeds = rows
      .map((r) => Math.sqrt((Number(r.rangeM) * G) / Math.sin((2 * Number(r.angleDeg) * Math.PI) / 180)))
      .filter(Number.isFinite);
    if (speeds.length) launchSpeed = sigFig(speeds.reduce((a, b) => a + b, 0) / speeds.length, 4);
  } else {
    launchSpeed = sigFig(launcherOf(inputs).speed, 4);
  }

  const distinctAngles = [...new Set(rows.map((r) => Number(r.angleDeg)))];

  /*
   * Complementary angles (θ, 90°−θ) give equal ground-level range because
   * sin(2θ) = sin(180°−2θ). Launching from a height breaks that symmetry
   * (the flatter of the pair keeps more of its horizontal speed for the
   * extra time the height buys it), so pairing is only meaningful, and
   * only checked, for ground-level runs.
   */
  const byAngle = new Map();
  for (const r of rows) {
    const a = Number(r.angleDeg);
    if (!byAngle.has(a)) byAngle.set(a, []);
    byAngle.get(a).push(Number(r.rangeM));
  }
  const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const complementaryPairs = [];
  if (groundLevel) {
    for (const a of byAngle.keys()) {
      const comp = 90 - a;
      if (a < comp && byAngle.has(comp)) {
        complementaryPairs.push({
          a, comp,
          rangeA: sigFig(meanOf(byAngle.get(a)), 4),
          rangeComp: sigFig(meanOf(byAngle.get(comp)), 4),
        });
      }
    }
  }
  const pairsAgree = complementaryPairs.length > 0 && complementaryPairs.every((p) => {
    const tol = Math.max(0.15, 0.08 * Math.max(p.rangeA, p.rangeComp));
    return Math.abs(p.rangeA - p.rangeComp) <= tol;
  });

  return {
    ok: true, bestAngle: Number(best.angleDeg), bestRange: sigFig(Number(best.rangeM), 4),
    launchSpeed, optimumAngle: sigFig(optimumAngleDeg(inputs), 3),
    anglesTested: distinctAngles.length, groundLevel, launchHeightM: sigFig(heightM, 3),
    complementaryPairs, pairsAgree,
    n: rows.length, points: rows.map((r) => ({ x: Number(r.angleDeg), y: Number(r.rangeM) })),
  };
}

export default { meta, defaults, LAUNCHERS, G, TABLE_HEIGHT_M, init, step, measure, derive, validate, launcherOf, launchHeightM, rangeM, timeOfFlight, maxHeightM, optimumAngleDeg };
