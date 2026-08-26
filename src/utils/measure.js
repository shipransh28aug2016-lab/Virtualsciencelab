/**
 * Measurement arithmetic shared by every physics/chemistry model: quantising
 * a true value to an instrument's least count, means, significant figures,
 * percentage error, and least-squares straight-line fits (free and forced
 * through the origin). Pure functions only — no DOM, no randomness.
 */

/**
 * Quantise `value` to the nearest multiple of the instrument's least count,
 * the way a real scale, vernier or digital display would read it.
 * @param {number} value  the true underlying value
 * @param {number} lc     the least count (resolution) of the instrument
 */
export function toLeastCount(value, lc) {
  if (!Number.isFinite(value)) return value;
  if (!lc || lc <= 0) return value;
  const q = Math.round(value / lc) * lc;
  // Round away floating-point artefacts like 0.30000000000000004.
  const decimals = Math.min(10, Math.max(0, Math.ceil(-Math.log10(lc)) + 2));
  return Number(q.toFixed(decimals));
}

/** Arithmetic mean of an array of numbers. */
export function mean(arr) {
  const a = arr.filter((v) => Number.isFinite(v));
  if (!a.length) return NaN;
  return a.reduce((s, v) => s + v, 0) / a.length;
}

/** Sample standard deviation (n-1 divisor). */
export function stdDev(arr) {
  const a = arr.filter((v) => Number.isFinite(v));
  if (a.length < 2) return 0;
  const m = mean(a);
  const ss = a.reduce((s, v) => s + (v - m) ** 2, 0);
  return Math.sqrt(ss / (a.length - 1));
}

/** Round `value` to `n` significant figures (default 4). */
export function sigFig(value, n = 4) {
  if (!Number.isFinite(value) || value === 0) return value;
  const sign = value < 0 ? -1 : 1;
  const v = Math.abs(value);
  const d = Math.floor(Math.log10(v)) + 1;
  const power = n - d;
  const magnitude = 10 ** power;
  const rounded = Math.round(v * magnitude) / magnitude;
  return sign * rounded;
}

/** Percentage error of an observed value against the accepted one. */
export function percentError(observed, accepted) {
  if (!Number.isFinite(observed) || !Number.isFinite(accepted) || accepted === 0) return NaN;
  return ((observed - accepted) / accepted) * 100;
}

/**
 * Ordinary least-squares fit y = slope·x + intercept, plus the coefficient
 * of determination r². Returns null when there are fewer than two distinct
 * x values (a line cannot be fitted).
 * @param {{x:number,y:number}[]} points
 */
export function linearFit(points) {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-15) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const yMean = sy / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  const r2 = ssTot < 1e-15 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2, n };
}

/**
 * Least-squares fit forced through the origin, y = slope·x. Used whenever
 * the physics itself guarantees zero input gives zero output (e.g. P
 * against 1/V in Boyle's law, or Δp against Q² in Bernoulli's equation).
 * @param {{x:number,y:number}[]} points
 */
export function fitThroughOrigin(points) {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 1) return null;
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  if (sxx < 1e-15) return null;
  const slope = sxy / sxx;

  const yMean = pts.reduce((s, p) => s + p.y, 0) / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - slope * p.x) ** 2, 0);
  const r2 = ssTot < 1e-15 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept: 0, r2, n };
}

/** Clamp a value between lo and hi. */
export function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

/** Linear interpolation between a and b by fraction t (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
