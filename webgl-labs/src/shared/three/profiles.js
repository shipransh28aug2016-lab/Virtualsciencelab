/**
 * Glassware profiles — pure geometry and arithmetic, no three.
 *
 * A vessel is described by the INNER profile of its glass: a list of [r, y]
 * points from the axis at the bottom, up the wall, to the rim. Scene units are
 * 10 cm, so one cubic unit is a litre. Because the profile is data, the volume
 * of liquid in a vessel and the height it reaches are CALCULATED from the same
 * numbers the glass is drawn from — a conical flask holds 250 mL because its
 * profile integrates to 250 mL, not because someone scaled a mesh until it
 * looked about right. That is what makes "pour in 25 mL" land at the right
 * line on the glass, whatever the shape.
 */

export const UNIT_CM = 10;
const ML_PER_UNIT3 = (UNIT_CM ** 3);               // 1000 cm³ per cubic unit

/** A circular arc as profile points, from angle a0 to a1 about (cr, cy). */
function arc(cr, cy, radius, a0, a1, n) {
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cr + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return out;
}

/** A straight-sided beaker or measuring cylinder. */
export const cylinderProfile = ({ r = 0.24, h = 0.62 } = {}) => [[0, 0], [r, 0], [r, h]];

/** A test tube: straight wall, hemispherical bottom. y = 0 is the bottom of the
 *  glass, so the wall starts one radius up. */
export function testTubeProfile({ r = 0.08, h = 1.0 } = {}) {
  const bottom = arc(0, r, r, -Math.PI / 2, 0, 10).map(([x, y]) => [x, y]);
  return [...bottom, [r, h]];
}

/** A conical (Erlenmeyer) flask: a short cylindrical foot, a conical shoulder,
 *  and a cylindrical neck. */
export function conicalFlaskProfile({ rBase = 0.36, rNeck = 0.095, hFoot = 0.06, hCone = 0.62, hNeck = 0.30 } = {}) {
  return [[0, 0], [rBase * 0.96, 0], [rBase, 0.03], [rBase, hFoot],
    [rNeck, hFoot + hCone], [rNeck, hFoot + hCone + hNeck]];
}

/** A volumetric flask: a round bulb on a long narrow neck. The neck is what
 *  makes the graduation mark a precise place — a 2 mm error in level is a
 *  fraction of a millilitre — and the bulb is what makes the whole thing hold
 *  250 mL. */
export function volumetricFlaskProfile({ rBulb = 0.36, rNeck = 0.060, hNeck = 0.75 } = {}) {
  const lower = arc(0, rBulb, rBulb, -Math.PI / 2, Math.PI / 2 - 0.55, 22);
  const shoulderTop = lower[lower.length - 1];
  const neckBase = shoulderTop[1] + (shoulderTop[0] - rNeck) * 0.35;
  return [...lower, [rNeck, neckBase], [rNeck, neckBase + hNeck]];
}

/** A burette: a long narrow graduated tube. */
export const buretteProfile = ({ r = 0.058, h = 5.0 } = {}) => [[0, 0], [r, 0], [r, h]];

/* ── Volume ↔ height, from the profile itself ─────────────────────────────── */

/** Volume (mL) of liquid up to height y, integrating πr² over the profile. */
export function volumeAtHeight(profile, y) {
  let v = 0;
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    if (y1 <= y0) continue;                         // flat or reversed: no height, no volume
    const top = Math.min(y, y1);
    if (top <= y0) break;
    const f = (top - y0) / (y1 - y0);
    const rt = r0 + (r1 - r0) * f;
    const h = top - y0;
    /* Frustum: V = πh/3 (r0² + r0·rt + rt²). Exact for a straight-sided
       segment, and the arcs are made of enough of them that it is exact enough. */
    v += (Math.PI * h * (r0 * r0 + r0 * rt + rt * rt)) / 3;
    if (top < y1) break;
  }
  return v * ML_PER_UNIT3;
}

/** The height the liquid reaches for a given volume. Bisection, because the
 *  volume is monotonic in height and nothing cleverer is warranted. */
export function heightAtVolume(profile, volumeMl) {
  const top = profile[profile.length - 1][1];
  if (volumeMl <= 0) return 0;
  if (volumeMl >= volumeAtHeight(profile, top)) return top;
  let lo = 0; let hi = top;
  for (let i = 0; i < 48; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (volumeAtHeight(profile, mid) < volumeMl) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export const capacityMl = (profile) => volumeAtHeight(profile, profile[profile.length - 1][1]);

/** The outer surface of the glass: the inner profile pushed out by the wall
 *  thickness, with the bottom thickened. */
export function outerProfile(profile, wall) {
  return [[0, -wall], [profile[1][0] + wall, -wall], ...profile.slice(1).map(([r, y]) => [r + wall, y])];
}
