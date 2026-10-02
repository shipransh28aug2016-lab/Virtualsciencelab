/**
 * Small numerical tools every engine needs. Pure, dependency-free, and
 * deterministic: an engine that reads the clock or Math.random cannot be held
 * to measured data from plain Node (tools/lint.mjs rejects both), so randomness
 * is a seeded stream passed in, never a global.
 */

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Root of a function that changes sign on [lo, hi]. Bisection, on purpose:
 * every function this is used for (charge balance against pH, a liquidus
 * against temperature, a vapour pressure against temperature) is monotonic, and
 * a method that cannot fail to converge is worth more than one that is quick.
 */
export function bisect(f, lo, hi, { tol = 1e-12, maxIter = 200 } = {}) {
  let a = lo; let b = hi;
  let fa = f(a);
  const fb = f(b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return Number.NaN;               // no sign change: no root in the bracket
  for (let i = 0; i < maxIter && Math.abs(b - a) > tol; i += 1) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (fm === 0) return m;
    if (fa * fm < 0) b = m; else { a = m; fa = fm; }
  }
  return 0.5 * (a + b);
}

/** n values from lo to hi, evenly spaced. */
export const linspace = (lo, hi, n) => Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / Math.max(1, n - 1));

/** n values from lo to hi, evenly spaced in the logarithm. */
export const logspace = (lo, hi, n) => linspace(Math.log10(lo), Math.log10(hi), n).map((e) => 10 ** e);

/**
 * Least-squares straight line through [x, y] points, with the standard errors a
 * student is asked to quote. Returns slope, intercept, r², and the standard
 * error of each. Needs three points for the errors to exist.
 */
export function linearFit(points) {
  const n = points.length;
  if (n < 2) return { n, slope: NaN, intercept: NaN, r2: NaN, seSlope: NaN, seIntercept: NaN };
  const sx = points.reduce((a, p) => a + p[0], 0);
  const sy = points.reduce((a, p) => a + p[1], 0);
  const sxx = points.reduce((a, p) => a + p[0] * p[0], 0);
  const sxy = points.reduce((a, p) => a + p[0] * p[1], 0);
  const syy = points.reduce((a, p) => a + p[1] * p[1], 0);
  const d = n * sxx - sx * sx;
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  const ssRes = points.reduce((a, p) => a + (p[1] - (slope * p[0] + intercept)) ** 2, 0);
  const ssTot = syy - (sy * sy) / n;
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const s2 = n > 2 ? ssRes / (n - 2) : NaN;
  return {
    n, slope, intercept, r2,
    seSlope: Math.sqrt((s2 * n) / d),
    seIntercept: Math.sqrt((s2 * sxx) / d),
  };
}

/* ── Seeded randomness ────────────────────────────────────────────────────────
   Instruments are noisy and a simulation should be too — but a verification
   suite must give the same answer every run. mulberry32 is a 32-bit generator
   with a tiny state; the state is carried in the store, so a recorded session
   replays exactly. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal from a uniform stream (Box–Muller). */
export function gaussian(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
