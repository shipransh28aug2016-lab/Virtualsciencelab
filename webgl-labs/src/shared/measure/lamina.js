/**
 * The geometry of finding an area by counting squares: a lamina with an outline of its own, the line a pencil
 * draws round it (which is never exactly the outline), the sheet of graph paper under it, and the squares the line
 * runs through. Pure: no React, no three. Lengths are millimetres; the paper is PAPER mm square with its origin
 * at the bottom left; cell (i, j) spans [i·g, (i+1)·g] × [j·g, (j+1)·g].
 *
 * The outlines are smooth closed curves r(θ) = 1 + Σ aₖ cos(kθ + φₖ) scaled to a stated area, so that the true area of a
 * lamina is exact (the shoelace formula) and every count can be compared with it.
 */

export const PAPER = 100;

export function polygonArea(p) {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i += 1) { const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % n]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}

export function perimeter(p) {
  let L = 0;
  for (let i = 0, n = p.length; i < n; i += 1) { const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % n]; L += Math.hypot(x2 - x1, y2 - y1); }
  return L;
}

function centroid(p) {
  let cx = 0; let cy = 0; let a = 0;
  for (let i = 0, n = p.length; i < n; i += 1) { const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % n]; const c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
  return [cx / (3 * a), cy / (3 * a)];
}

/** The outline of a lamina, counter-clockwise, centred on its centroid, with exactly `area` mm². */
export function outline({ harmonics, aspect = 1, area, N = 720 }) {
  const raw = [];
  for (let i = 0; i < N; i += 1) {
    const th = (2 * Math.PI * i) / N;
    let r = 1; for (const [k, a, ph] of harmonics) r += a * Math.cos(k * th + ph);
    raw.push([r * Math.cos(th) * aspect, r * Math.sin(th)]);
  }
  const s = Math.sqrt(area / polygonArea(raw));
  const [cx, cy] = centroid(raw);
  return raw.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

/** The line a pencil makes round a lamina: the outline moved outward along its normals by `delta`. */
export function offsetOutward(p, delta) {
  const n = p.length;
  return p.map(([x, y], i) => {
    const [xa, ya] = p[(i + n - 1) % n]; const [xb, yb] = p[(i + 1) % n];
    const tx = xb - xa; const ty = yb - ya; const len = Math.hypot(tx, ty) || 1;
    return [x + (delta * ty) / len, y - (delta * tx) / len];
  });
}

/** Turn by `rot` degrees about the centre, then put the centre at (x, y). */
export function place(p, { x = 0, y = 0, rot = 0 }) {
  const c = Math.cos((rot * Math.PI) / 180); const s = Math.sin((rot * Math.PI) / 180);
  return p.map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
}

/** Sutherland–Hodgman against one half-plane. */
function clip(poly, inside, cut) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i += 1) {
    const a = poly[i]; const b = poly[(i + 1) % n];
    const ia = inside(a); const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) out.push(cut(a, b));
  }
  return out;
}

/** The area of a polygon inside the square [x0, x1] × [y0, y1]. */
function areaInSquare(poly, x0, y0, x1, y1) {
  let q = clip(poly, (p) => p[0] >= x0, (a, b) => { const t = (x0 - a[0]) / (b[0] - a[0]); return [x0, a[1] + t * (b[1] - a[1])]; });
  if (q.length) q = clip(q, (p) => p[0] <= x1, (a, b) => { const t = (x1 - a[0]) / (b[0] - a[0]); return [x1, a[1] + t * (b[1] - a[1])]; });
  if (q.length) q = clip(q, (p) => p[1] >= y0, (a, b) => { const t = (y0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y0]; });
  if (q.length) q = clip(q, (p) => p[1] <= y1, (a, b) => { const t = (y1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), y1]; });
  return q.length ? Math.abs(polygonArea(q)) : 0;
}

/** A square the line only grazes — a hundredth of it, a pencil line's width — is not a square the line cuts: it is inside, or outside, to the eye. */
export const SLIVER = 0.02;

/**
 * How much of each g × g square of the paper the polygon covers. The squares the outline runs through are clipped exactly;
 * every other square is wholly in or wholly out, by whether its centre is inside (a scanline per row).
 * Returns { g, n, frac (index j·n + i), complete, boundary: Map('i,j' → fraction), runs: [[j, i0, i1]…] of complete squares }.
 */
export function cellFractions(poly, g) {
  const n = Math.round(PAPER / g);
  const frac = new Float32Array(n * n);
  const near = new Set();
  const m = poly.length;
  for (let k = 0; k < m; k += 1) {
    const a = poly[k]; const b = poly[(k + 1) % m];
    const i0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) / g)); const i1 = Math.min(n - 1, Math.floor(Math.max(a[0], b[0]) / g));
    const j0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) / g)); const j1 = Math.min(n - 1, Math.floor(Math.max(a[1], b[1]) / g));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) near.add(j * n + i);
  }
  /* Scanline for the rest. */
  for (let j = 0; j < n; j += 1) {
    const yc = (j + 0.5) * g;
    const xs = [];
    for (let k = 0; k < m; k += 1) {
      const a = poly[k]; const b = poly[(k + 1) % m];
      if ((a[1] <= yc) !== (b[1] <= yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    let c = 0;
    for (let i = 0; i < n; i += 1) {
      const xc = (i + 0.5) * g;
      while (c < xs.length && xs[c] < xc) c += 1;
      frac[j * n + i] = c % 2 === 1 ? 1 : 0;
    }
  }
  const boundary = new Map();
  for (const idx of near) {
    const i = idx % n; const j = (idx - i) / n;
    const f = areaInSquare(poly, i * g, j * g, (i + 1) * g, (j + 1) * g) / (g * g);
    frac[idx] = f;
    if (f > SLIVER && f < 1 - SLIVER) boundary.set(`${i},${j}`, f);
  }
  const runs = []; let complete = 0;
  for (let j = 0; j < n; j += 1) {
    let start = -1;
    for (let i = 0; i <= n; i += 1) {
      const full = i < n && frac[j * n + i] >= 1 - SLIVER;
      if (full) complete += 1;
      if (full && start < 0) start = i;
      if (!full && start >= 0) { runs.push([j, start, i - 1]); start = -1; }
    }
  }
  return { g, n, frac, complete, boundary, runs };
}

/**
 * What the student's marks come to: "whole" = counted as a whole square, "ignore" = left out. Any square may be marked, rightly or not:
 * a whole mark on a square the outline does not cut adds a square that is not there (or counts a complete one twice), an ignore mark on a
 * complete square takes one away. Boundary squares nobody has judged are left out of the count.
 */
export function tally(cls, marks) {
  let whole = 0; let ignored = 0; let stray = 0; let right = 0; let wrong = 0; let dropped = 0;
  const judged = new Set();
  for (const [key, v] of Object.entries(marks)) {
    const f = cls.boundary.get(key);
    const isBoundary = f !== undefined;
    if (v === 'whole') {
      whole += 1;
      if (isBoundary) { if (f > 0.5) right += 1; else wrong += 1; } else stray += 1;
    } else {
      ignored += 1;
      if (isBoundary) { if (f < 0.5) right += 1; else wrong += 1; } else {
        const [i, j] = key.split(',').map(Number);
        if (cls.frac[j * cls.n + i] >= 1 - SLIVER) { dropped += 1; stray += 1; }
      }
    }
    if (isBoundary) judged.add(key);
  }
  const squares = cls.complete - dropped + whole;
  return { complete: cls.complete, boundary: cls.boundary.size, whole, ignored, unjudged: cls.boundary.size - judged.size, stray, dropped, right, wrong, squares, areaMm2: squares * cls.g * cls.g };
}

/** The error a count of boundary squares by eye is limited to: each square rounded to 0 or 1 is out by ±½ at most, 1/12 of a square² on average. */
export const countingError = (nBoundary, g) => g * g * Math.sqrt(nBoundary / 12);

/** Where the pencil goes: its own half-width, and — held slanted — the lamina's thickness times the tangent of the lean. */
export const PENCILS = { sharp: 0.12, blunt: 0.45 };
export const LEAN_TAN = 0.7;
export const penDelta = (pencil, hold, thicknessMm) => (PENCILS[pencil] ?? PENCILS.sharp) + (hold === 'slanted' ? LEAN_TAN * thicknessMm : 0);

let memo = new Map();
/** The traced line and its squares for one lamina laid on one grid; remembered, since every render asks. */
export function paperFor(shape, t) {
  const key = `${shape.id}|${t.grid}|${t.x}|${t.y}|${t.rot}|${t.delta}`;
  if (memo.has(key)) return memo.get(key);
  const base = place(shape.poly, { x: PAPER / 2 + t.x, y: PAPER / 2 + t.y, rot: t.rot });
  const traced = t.delta ? offsetOutward(base, t.delta) : base;
  const cls = cellFractions(traced, Number(String(t.grid).replace(/^g/, '')));
  const out = { base, traced, cls };
  if (memo.size > 6) memo = new Map();
  memo.set(key, out);
  return out;
}
