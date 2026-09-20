/**
 * GraphPanel — plots the observation table as an SVG (crisp, printable,
 * zero bytes on the wire). Draws axes, grid, points and the best-fit line.
 */
import { linearFit, fitThroughOrigin } from '../utils/measure.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (n, attrs = {}) => {
  const e = document.createElementNS(NS, n);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/**
 * A round step for the axis — 1, 2, 5 or 10 times a power of ten.
 *
 * It must ALWAYS return a finite, strictly positive number, because the grid
 * is drawn by `for (x = min; x <= max; x += step)`. A step of zero is not a
 * cosmetic problem: the loop never advances, the tab locks up, and every
 * coordinate derived from it comes out NaN — which is what the browser was
 * reporting as `<line> attribute x1: Expected length, "NaN"` on the diode
 * characteristic.
 *
 * Zero is reachable. For a very small range, `10 ** Math.floor(log10(raw))`
 * underflows to 0, `raw / 0` is Infinity, no band matches, and `10 * 0` is 0.
 * Readings that happen to agree to many decimal places are enough to get
 * there, and a lab is not wrong to produce them.
 */
function niceStep(range, target = 5) {
  const safe = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);
  if (!(range > 0) || !Number.isFinite(range)) return 1;
  const raw = range / target;
  const mag = safe(10 ** Math.floor(Math.log10(raw)), raw);
  const norm = safe(raw / mag, 1);
  const band = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return safe(band * mag, safe(raw, 1));
}

/** Never let an axis loop run away, however the data came out. */
const MAX_GRID_LINES = 14;
function gridValues(min, max, step) {
  const out = [];
  const span = max - min;
  if (!Number.isFinite(span) || !(step > 0)) return [min];
  const n = Math.min(MAX_GRID_LINES, Math.floor(span / step + 1e-9) + 1);
  for (let i = 0; i < n; i += 1) out.push(min + i * step);
  return out;
}

/**
 * @param {Array<{x:number,y:number}>} points
 * @param {{xLabel:string,yLabel:string,throughOrigin?:boolean,title?:string}} cfg
 */
export function renderGraph(container, points, cfg = {}) {
  container.innerHTML = '';
  const W = 460, H = 320, P = { l: 62, r: 18, t: 22, b: 50 };

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'graph-svg',
    role: 'img', 'aria-label': `Graph of ${cfg.yLabel || 'y'} against ${cfg.xLabel || 'x'} with ${points.length} plotted points`,
  });

  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length === 0) {
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: 'transparent' }));
    const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'g-empty' });
    t.textContent = 'Record readings to plot the graph';
    svg.appendChild(t);
    container.appendChild(svg);
    return null;
  }

  const inc0 = cfg.throughOrigin !== false;
  let xs = valid.map((p) => p.x), ys = valid.map((p) => p.y);
  if (inc0) { xs = xs.concat(0); ys = ys.concat(0); }
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  /* A span too small to divide is treated as no span at all: readings that
     agree to fifteen decimal places are a perfectly good experimental result
     and must not take the graph down with them. */
  const degenerate = (lo, hi) => !(hi - lo > Math.max(Math.abs(hi), Math.abs(lo), 1) * 1e-9);
  if (degenerate(xMin, xMax)) { xMax += 1; xMin -= 1; }
  if (degenerate(yMin, yMax)) { yMax += 1; yMin -= 1; }
  const xStep = niceStep(xMax - xMin), yStep = niceStep(yMax - yMin);
  const snapDown = (v, step) => (Number.isFinite(v / step) ? Math.floor(v / step) * step : v);
  const snapUp = (v, step) => (Number.isFinite(v / step) ? Math.ceil(v / step) * step : v);
  xMin = snapDown(xMin, xStep); xMax = snapUp(xMax, xStep);
  yMin = snapDown(yMin, yStep); yMax = snapUp(yMax, yStep);
  if (degenerate(xMin, xMax)) xMax = xMin + (xStep || 1);
  if (degenerate(yMin, yMax)) yMax = yMin + (yStep || 1);

  /* A coordinate that is not a number is not drawable, and an SVG asked for
     one logs an error on every frame. Anything unrepresentable is pinned to
     the plot area instead. */
  const clampX = (v) => (Number.isFinite(v) ? Math.max(P.l, Math.min(W - P.r, v)) : P.l);
  const clampY = (v) => (Number.isFinite(v) ? Math.max(P.t, Math.min(H - P.b, v)) : H - P.b);
  const sx = (x) => clampX(P.l + ((x - xMin) / (xMax - xMin)) * (W - P.l - P.r));
  const sy = (y) => clampY(H - P.b - ((y - yMin) / (yMax - yMin)) * (H - P.t - P.b));

  const g = el('g');
  // grid
  for (const x of gridValues(xMin, xMax, xStep)) {
    g.appendChild(el('line', { x1: sx(x), y1: P.t, x2: sx(x), y2: H - P.b, class: 'g-grid' }));
    const t = el('text', { x: sx(x), y: H - P.b + 16, 'text-anchor': 'middle', class: 'g-tick' });
    t.textContent = fmt(x, xStep);
    g.appendChild(t);
  }
  for (const y of gridValues(yMin, yMax, yStep)) {
    g.appendChild(el('line', { x1: P.l, y1: sy(y), x2: W - P.r, y2: sy(y), class: 'g-grid' }));
    const t = el('text', { x: P.l - 8, y: sy(y) + 3.5, 'text-anchor': 'end', class: 'g-tick' });
    t.textContent = fmt(y, yStep);
    g.appendChild(t);
  }
  // axes
  g.appendChild(el('line', { x1: P.l, y1: P.t, x2: P.l, y2: H - P.b, class: 'g-axis' }));
  g.appendChild(el('line', { x1: P.l, y1: H - P.b, x2: W - P.r, y2: H - P.b, class: 'g-axis' }));

  // best-fit line
  const fit = cfg.throughOrigin ? fitThroughOrigin(valid) : linearFit(valid);
  if (fit && valid.length >= 2 && Number.isFinite(fit.slope) && Number.isFinite(fit.intercept)) {
    const y1 = fit.slope * xMin + fit.intercept, y2 = fit.slope * xMax + fit.intercept;
    g.appendChild(el('line', { x1: sx(xMin), y1: sy(y1), x2: sx(xMax), y2: sy(y2), class: 'g-fit' }));
  }

  // points
  for (const p of valid) {
    g.appendChild(el('circle', { cx: sx(p.x), cy: sy(p.y), r: 4.2, class: 'g-pt' }));
    g.appendChild(el('circle', { cx: sx(p.x), cy: sy(p.y), r: 1.6, class: 'g-pt-core' }));
  }

  // axis labels
  const xl = el('text', { x: P.l + (W - P.l - P.r) / 2, y: H - 10, 'text-anchor': 'middle', class: 'g-label' });
  xl.textContent = cfg.xLabel || 'x';
  g.appendChild(xl);
  const yl = el('text', { x: 14, y: P.t + (H - P.t - P.b) / 2, 'text-anchor': 'middle', class: 'g-label',
    transform: `rotate(-90 14 ${P.t + (H - P.t - P.b) / 2})` });
  yl.textContent = cfg.yLabel || 'y';
  g.appendChild(yl);

  svg.appendChild(g);
  container.appendChild(svg);
  return fit;
}

function fmt(v, step) {
  const dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  const s = v.toFixed(dec);
  return s === '-0' ? '0' : s;
}
