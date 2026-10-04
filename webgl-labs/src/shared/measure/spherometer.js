/**
 * The physics of a spherometer: three legs at the corners of a (nearly) equilateral triangle, a central screw, and the
 * surface it stands on. Pure: no React, no three. Lengths are millimetres.
 *
 * Reading y (what the vertical scale and the disc say) grows as the screw tip goes DOWN. On the instrument the tip is level
 * with the plane of the legs at the reading Z0 — a property of that instrument, which is why the reading on plane glass has
 * to be taken and is not zero. On a convex surface the middle of the surface stands h above the plane of the legs, so the tip
 * meets it after less turning: y = Z0 − h. On a concave surface the middle is h below: y = Z0 + h. A sphere of radius R seen
 * over a circle of radius r through the three legs has h = R − √(R² − r²), and back again R = r²/(2h) + h/2 exactly; with
 * r = l/√3 for legs l apart, R = l²/(6h) + h/2.
 */

export const SURFACES = {
  plane: { id: 'plane', label: 'Plane glass plate', short: 'plane glass', R: Infinity, sign: 0, aspheric: 0 },
  watchConvex: { id: 'watchConvex', label: 'Watch glass, convex side up', short: 'convex watch glass', R: 225, sign: 1, aspheric: 0.004 },
  lensConvex: { id: 'lensConvex', label: 'Convex lens surface', short: 'convex lens', R: 320, sign: 1, aspheric: 0.012 },
  watchConcave: { id: 'watchConcave', label: 'Watch glass, concave side up', short: 'concave watch glass', R: 280, sign: -1, aspheric: 0.004 },
  flatish: { id: 'flatish', label: 'Nearly plane glass', short: 'nearly plane glass', R: 4000, sign: 1, aspheric: 0 },
};

/**
 * What each instrument is, below what the sheet tells the student: where its tip is level with the legs (Z0, in the reading's own
 * numbers), and by how much its three leg-to-leg distances differ from one another (so that the mean has to be taken).
 */
export const BODIES = {
  sp100: { Z0: 3.37, legMm: 40, sides: [1.004, 0.993, 1.003] },
  sp50: { Z0: 2.835, legMm: 40, sides: [0.996, 1.005, 1.002] },
  spWide: { Z0: 4.12, legMm: 50, sides: [1.003, 0.997, 1.006] },
};

/** The three leg-to-leg distances, and their mean: the l a perfect measurement finds, and the one the physics uses. */
export const legSides = (id) => BODIES[id].sides.map((f) => BODIES[id].legMm * f);
export const legMean = (id) => legSides(id).reduce((a, b) => a + b, 0) / 3;

/** The sagitta of a surface over the circle through the legs of radius r (a spherical cap, with a trace of non-sphericity). */
export function sagitta(surface, r, r0 = 40 / Math.sqrt(3)) {
  if (!surface.sign) return 0;
  const R = surface.R;
  const h = R - Math.sqrt(R * R - r * r);
  return h * (1 + surface.aspheric * (r / r0 - 1));
}

/** The reading at which the tip just touches this surface under this instrument. */
export function contactReading(id, surface) {
  const r = legMean(id) / Math.sqrt(3);
  return BODIES[id].Z0 - surface.sign * sagitta(surface, r);
}

/** R from the sagitta and the legs, as the sheet says: l²/(6h) + h/2 (and its two terms). */
export const radiusFrom = (l, h) => ({ main: (l * l) / (6 * h), correction: h / 2, R: (l * l) / (6 * h) + h / 2 });

/**
 * The three impressions the legs leave on paper (mm), and where a ruler laid along each side has its zero. The sides are the
 * instrument's own three distances; the first impression is at (30, 25) and the first side lies 8° above the paper's edge.
 */
export function impressions(id) {
  const [ab, bc, ca] = legSides(id);
  const A = [30, 25]; const th = (8 * Math.PI) / 180;
  const B = [A[0] + ab * Math.cos(th), A[1] + ab * Math.sin(th)];
  /* C: the point ca from A and bc from B, on the upper side. */
  const d = ab; const x = (ca * ca - bc * bc + d * d) / (2 * d); const y = Math.sqrt(Math.max(0, ca * ca - x * x));
  const ux = (B[0] - A[0]) / d; const uy = (B[1] - A[1]) / d;
  const C = [A[0] + ux * x - uy * y, A[1] + uy * x + ux * y];
  return { A, B, C, sides: { ab, bc, ca } };
}

/** Where along a ruler laid against a side the two impressions fall: the ruler's zero is a little before the first (a fixed, odd amount per side). */
export const RULER_ZERO = { ab: 6.3, bc: 9.7, ca: 7.4 };
export const rulerPositions = (id, pair) => { const s = legSides(id)[{ ab: 0, bc: 1, ca: 2 }[pair]]; return { a: RULER_ZERO[pair], b: RULER_ZERO[pair] + s, length: s }; };
