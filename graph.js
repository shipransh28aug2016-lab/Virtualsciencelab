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

function niceStep(range, target = 5) {
  if (!(range > 0)) return 1;
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
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
  if (xMax === xMin) { xMax += 1; xMin -= 1; }
  if (yMax === yMin) { yMax += 1; yMin -= 1; }
  const xStep = niceStep(xMax - xMin), yStep = niceStep(yMax - yMin);
  xMin = Math.floor(xMin / xStep) * xStep; xMax = Math.ceil(xMax / xStep) * xStep;
  yMin = Math.floor(yMin / yStep) * yStep; yMax = Math.ceil(yMax / yStep) * yStep;

  const sx = (x) => P.l + ((x - xMin) / (xMax - xMin)) * (W - P.l - P.r);
  const sy = (y) => H - P.b - ((y - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  const g = el('g');
  // grid
  for (let x = xMin; x <= xMax + 1e-9; x += xStep) {
    g.appendChild(el('line', { x1: sx(x), y1: P.t, x2: sx(x), y2: H - P.b, class: 'g-grid' }));
    const t = el('text', { x: sx(x), y: H - P.b + 16, 'text-anchor': 'middle', class: 'g-tick' });
    t.textContent = fmt(x, xStep);
    g.appendChild(t);
  }
  for (let y = yMin; y <= yMax + 1e-9; y += yStep) {
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
  if (fit && valid.length >= 2) {
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
