/**
 * Shared canvas apparatus library.
 *
 * Every experiment renderer draws its bench from these primitives, so that
 * a beaker, a lens, a galvanometer dial, an optical bench upright... look
 * the same wherever they appear, and so that every piece of glassware or
 * instrument is drawn WITH a small printed label next to it — the way a
 * labelled diagram in a lab manual is drawn. No apparatus is ever drawn
 * unlabelled.
 *
 * This module is the only place that knows about <canvas> at all outside
 * the individual renderers; nothing here touches the rest of the DOM, and
 * nothing in the simulation/models/* layer imports it.
 */

/* ------------------------------------------------------------------ *
 *  Canvas sizing + theme
 * ------------------------------------------------------------------ */

const THEMES = {
  classroom: {
    bg: '#f3f6fb', bg2: '#e8eef8', ink: '#12213a', muted: '#42597c', dim: '#7488a6',
    stroke: '#2a3c5c', glass: 'rgba(160,190,230,0.28)', glassStroke: 'rgba(30,50,90,0.55)',
    liquid: '#6fa8dc', liquidAlt: '#e07b39', metal: '#8b93a3', wood: '#a9754a',
    accent: '#1d5fd4', accent2: '#0d8f74', good: '#0d7a52', warn: '#8a5a00', bad: '#c02626',
    paper: '#fbf7ec', flame: '#ff8a3d', shadow: 'rgba(20,40,80,0.14)',
  },
  dark: {
    bg: '#0f1a2e', bg2: '#152238', ink: '#eef3fb', muted: '#b9c7de', dim: '#8497b8',
    stroke: '#c9d6ee', glass: 'rgba(120,160,220,0.16)', glassStroke: 'rgba(220,232,255,0.5)',
    liquid: '#4f8fe0', liquidAlt: '#e08a4f', metal: '#aab4c6', wood: '#c08a5a',
    accent: '#5b9bff', accent2: '#5fe0bd', good: '#3fd39b', warn: '#ffc266', bad: '#ff8080',
    paper: '#22314c', flame: '#ffb066', shadow: 'rgba(0,0,0,0.45)',
  },
};

let THEME = THEMES.classroom;

/** Switch the palette every renderer draws with. name: 'dark' | 'classroom'. */
export function setCanvasTheme(name) {
  THEME = THEMES[name] === THEMES.dark ? THEMES.dark : THEMES.classroom;
}

/** Current palette, for renderers that need a colour not covered by a helper. */
export function theme() {
  return THEME;
}

/**
 * Size a canvas to its CSS box at the device's pixel ratio and return a
 * context whose coordinate space is in CSS pixels (so renderers never think
 * about devicePixelRatio). Returns the logical {w, h} to draw within.
 */
export function fitCanvas(canvas, aspect = 16 / 10) {
  const cssWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 900;
  const w = Math.max(280, Math.round(cssWidth));
  const h = Math.max(180, Math.round(w / aspect));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // Background wash so every renderer starts from a consistent bench colour.
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, THEME.bg);
  g.addColorStop(1, THEME.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return { w, h, ctx };
}

/* ------------------------------------------------------------------ *
 *  Labelling — the part that matters for "every apparatus is labelled"
 * ------------------------------------------------------------------ */

/**
 * Print a small label near a piece of apparatus. `anchor` controls how the
 * text sits relative to (x, y): 'below' (default), 'above', 'left', 'right'.
 */
export function label(ctx, x, y, text, opts = {}) {
  const { anchor = 'below', size = 12.5, bold = false, color, bg = true } = opts;
  ctx.save();
  ctx.font = `${bold ? '700' : '600'} ${size}px var(--ff, system-ui, sans-serif)`;
  ctx.textAlign = anchor === 'left' ? 'right' : anchor === 'right' ? 'left' : 'center';
  ctx.textBaseline = anchor === 'above' ? 'bottom' : anchor === 'below' ? 'top' : 'middle';
  let tx = x;
  let ty = y;
  if (anchor === 'below') ty = y + 5;
  else if (anchor === 'above') ty = y - 5;
  else if (anchor === 'left') tx = x - 6;
  else if (anchor === 'right') tx = x + 6;
  if (bg) {
    const metrics = ctx.measureText(text);
    const pad = 3;
    const tw = metrics.width;
    let bx = tx - (ctx.textAlign === 'center' ? tw / 2 : ctx.textAlign === 'right' ? tw : 0);
    const by = anchor === 'above' ? ty - size : anchor === 'below' ? ty - 1 : ty - size / 2 - 1;
    ctx.fillStyle = THEME.bg === THEMES.dark.bg ? 'rgba(10,16,28,0.72)' : 'rgba(255,255,255,0.78)';
    ctx.fillRect(bx - pad, by - pad, tw + pad * 2, size + pad * 2);
  }
  ctx.fillStyle = color || THEME.ink;
  ctx.fillText(text, tx, ty);
  ctx.restore();
}

/** A small circular/square leader pointing from a label to a precise spot. */
export function tick(ctx, x, y, r = 2.4) {
  ctx.save();
  ctx.fillStyle = THEME.accent;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Generic strokes / fills
 * ------------------------------------------------------------------ */

export function bench(ctx, w, h, y) {
  ctx.save();
  ctx.strokeStyle = THEME.stroke;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(w - 20, y);
  ctx.stroke();
  ctx.restore();
}

export function dashedLine(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.strokeStyle = color || THEME.dim;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function arrow(ctx, x1, y1, x2, y2, color, width = 1.6) {
  ctx.save();
  ctx.strokeStyle = color || THEME.ink;
  ctx.fillStyle = color || THEME.ink;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const s = 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - s * Math.cos(ang - 0.4), y2 - s * Math.sin(ang - 0.4));
  ctx.lineTo(x2 - s * Math.cos(ang + 0.4), y2 - s * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Glassware
 * ------------------------------------------------------------------ */

/** A beaker: rim at (cx,topY), given width/height, filled to `fillFrac` (0-1). */
export function drawBeaker(ctx, cx, topY, wid, hgt, fillFrac = 0, liquidColor, opts = {}) {
  const x0 = cx - wid / 2;
  const x1 = cx + wid / 2;
  const bot = topY + hgt;
  ctx.save();
  if (fillFrac > 0) {
    const ly = bot - hgt * Math.max(0, Math.min(1, fillFrac));
    ctx.fillStyle = liquidColor || THEME.liquid;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, ly);
    ctx.lineTo(x1 - 2, ly);
    ctx.lineTo(x1 - 3, bot - 3);
    ctx.quadraticCurveTo(x1 - 3, bot, x1 - 8, bot);
    ctx.lineTo(x0 + 8, bot);
    ctx.quadraticCurveTo(x0 + 3, bot, x0 + 3, bot - 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = THEME.glassStroke;
  ctx.lineWidth = 1.8;
  ctx.fillStyle = THEME.glass;
  ctx.beginPath();
  ctx.moveTo(x0, topY);
  ctx.lineTo(x0, bot - 8);
  ctx.quadraticCurveTo(x0, bot, x0 + 8, bot);
  ctx.lineTo(x1 - 8, bot);
  ctx.quadraticCurveTo(x1, bot, x1, bot - 8);
  ctx.lineTo(x1, topY);
  ctx.fill();
  ctx.stroke();
  // rim + lip
  ctx.beginPath();
  ctx.moveTo(x0 - 3, topY);
  ctx.lineTo(x0 + 5, topY - 4);
  ctx.moveTo(x1 + 3, topY);
  ctx.lineTo(x1 - 5, topY - 4);
  ctx.stroke();
  if (opts.graduations) {
    ctx.globalAlpha = 0.6;
    for (let i = 1; i <= 4; i++) {
      const gy = topY + (hgt * i) / 5;
      ctx.beginPath();
      ctx.moveTo(x1 - 7, gy);
      ctx.lineTo(x1 - 1, gy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (opts.label !== false) {
    label(ctx, cx, bot, opts.label || 'Beaker', { anchor: 'below' });
  }
  return { x0, x1, topY, bot };
}

/** A conical (Erlenmeyer) flask, as used under a burette. */
export function drawConicalFlask(ctx, cx, topY, neckW, baseW, hgt, fillFrac = 0, liquidColor, opts = {}) {
  const neckH = hgt * 0.28;
  const bodyTop = topY + neckH;
  const bot = topY + hgt;
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - neckW / 2, topY);
  ctx.lineTo(cx - neckW / 2, bodyTop);
  ctx.lineTo(cx - baseW / 2, bot - 6);
  ctx.quadraticCurveTo(cx - baseW / 2, bot, cx - baseW / 2 + 8, bot);
  ctx.lineTo(cx + baseW / 2 - 8, bot);
  ctx.quadraticCurveTo(cx + baseW / 2, bot, cx + baseW / 2, bot - 6);
  ctx.lineTo(cx + neckW / 2, bodyTop);
  ctx.lineTo(cx + neckW / 2, topY);
  ctx.stroke();
  ctx.fill();
  if (fillFrac > 0) {
    const ly = bot - (bot - bodyTop) * Math.min(1, fillFrac);
    const frac = (bot - ly) / (bot - bodyTop);
    const halfW = (baseW / 2) * Math.min(1, 0.4 + frac * 0.6);
    ctx.fillStyle = liquidColor || THEME.liquid;
    ctx.beginPath();
    ctx.moveTo(cx - halfW, ly);
    ctx.lineTo(cx + halfW, ly);
    ctx.lineTo(cx + baseW / 2 - 2, bot - 6);
    ctx.lineTo(cx - baseW / 2 + 2, bot - 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx - neckW / 2 - 2, topY);
  ctx.lineTo(cx + neckW / 2 + 2, topY);
  ctx.stroke();
  ctx.restore();
  if (opts.label !== false) label(ctx, cx, bot, opts.label || 'Conical flask', { anchor: 'below' });
  return { cx, topY, bot };
}

/** A burette clamped vertically, with a stopcock at the bottom and a scale. */
export function drawBurette(ctx, x, topY, hgt, fillFrac = 1, opts = {}) {
  const w = 14;
  const bot = topY + hgt;
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(x - w / 2, topY, w, hgt - 14);
  ctx.stroke();
  ctx.fill();
  // liquid
  if (fillFrac > 0) {
    const ly = topY + (hgt - 14) * (1 - Math.min(1, fillFrac));
    ctx.fillStyle = opts.liquidColor || THEME.liquid;
    ctx.fillRect(x - w / 2 + 1.4, ly, w - 2.8, topY + hgt - 14 - ly);
  }
  // graduation marks
  ctx.strokeStyle = THEME.dim;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const gy = topY + ((hgt - 14) * i) / 10;
    const long = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, gy);
    ctx.lineTo(x + w / 2 + (long ? 7 : 4), gy);
    ctx.stroke();
  }
  // stopcock
  ctx.fillStyle = THEME.metal;
  ctx.fillRect(x - 5, topY + hgt - 14, 10, 8);
  ctx.beginPath();
  ctx.moveTo(x, topY + hgt - 6);
  ctx.lineTo(x, topY + hgt);
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 2;
  ctx.stroke();
  // drop
  if (opts.dropping) {
    ctx.fillStyle = opts.liquidColor || THEME.liquid;
    ctx.beginPath();
    ctx.arc(x, topY + hgt + 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  label(ctx, x, topY, opts.label || 'Burette', { anchor: 'above' });
  return { x, topY, bot };
}

export function drawTestTube(ctx, cx, topY, hgt, wid = 16, fillFrac = 0, liquidColor, opts = {}) {
  const bot = topY + hgt;
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - wid / 2, topY);
  ctx.lineTo(cx - wid / 2, bot - wid / 2);
  ctx.arc(cx, bot - wid / 2, wid / 2, Math.PI, 0);
  ctx.lineTo(cx + wid / 2, topY);
  ctx.stroke();
  ctx.fill();
  if (fillFrac > 0) {
    const ly = bot - hgt * fillFrac;
    ctx.fillStyle = liquidColor || THEME.liquid;
    ctx.beginPath();
    ctx.moveTo(cx - wid / 2 + 1.5, Math.max(ly, topY + 2));
    ctx.lineTo(cx + wid / 2 - 1.5, Math.max(ly, topY + 2));
    ctx.lineTo(cx + wid / 2 - 1.5, bot - wid / 2);
    ctx.arc(cx, bot - wid / 2, wid / 2 - 1.5, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  if (opts.label !== false) label(ctx, cx, bot + 4, opts.label || 'Test tube', { anchor: 'below' });
  return { cx, topY, bot };
}

export function drawThermometer(ctx, x, topY, hgt, fracHot = 0.5, opts = {}) {
  const bulbR = 6;
  const bot = topY + hgt;
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x - 3, topY, 6, hgt - bulbR, 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, bot - bulbR, bulbR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // mercury/dye column
  const colTop = topY + (hgt - bulbR) * (1 - Math.max(0, Math.min(1, fracHot)));
  ctx.fillStyle = THEME.bad;
  ctx.fillRect(x - 1.4, colTop, 2.8, bot - bulbR - colTop);
  ctx.beginPath();
  ctx.arc(x, bot - bulbR, bulbR - 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, x, topY, opts.label || 'Thermometer', { anchor: 'above' });
}

/* ------------------------------------------------------------------ *
 *  Stands, clamps, flame
 * ------------------------------------------------------------------ */

export function drawRetortStand(ctx, x, baseY, hgt, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.metal;
  ctx.fillStyle = THEME.metal;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, baseY - hgt);
  ctx.stroke();
  ctx.fillRect(x - 34, baseY - 4, 68, 8);
  ctx.restore();
  if (opts.label !== false) label(ctx, x, baseY + 4, opts.label || 'Retort stand', { anchor: 'below' });
}

export function drawBurner(ctx, cx, baseY, lit = true, opts = {}) {
  ctx.save();
  ctx.fillStyle = THEME.metal;
  ctx.beginPath();
  ctx.moveTo(cx - 16, baseY);
  ctx.lineTo(cx + 16, baseY);
  ctx.lineTo(cx + 9, baseY - 22);
  ctx.lineTo(cx - 9, baseY - 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 4, baseY - 30, 8, 8);
  if (lit) {
    const grad = ctx.createLinearGradient(0, baseY - 30, 0, baseY - 52);
    grad.addColorStop(0, THEME.flame);
    grad.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, baseY - 52);
    ctx.quadraticCurveTo(cx + 9, baseY - 34, cx + 4, baseY - 24);
    ctx.quadraticCurveTo(cx, baseY - 30, cx - 4, baseY - 24);
    ctx.quadraticCurveTo(cx - 9, baseY - 34, cx, baseY - 52);
    ctx.fill();
  }
  ctx.restore();
  label(ctx, cx, baseY + 4, opts.label || 'Burner', { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Meters
 * ------------------------------------------------------------------ */

/** A circular analogue meter dial (galvanometer / ammeter / voltmeter). */
export function drawDial(ctx, cx, cy, r, valueFrac, opts = {}) {
  const { label: lab = 'Meter', unit = '', min = -1, max = 1, zeroCentre = false } = opts;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f6f4ea';
  ctx.fill();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 4;
  ctx.stroke();
  // arc scale, 240 degrees
  const startA = Math.PI + Math.PI / 6; // ~210deg
  const endA = -Math.PI / 6; // 330deg total span
  const N = 10;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.2;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = startA + (endA - startA) * t;
    const r1 = r - 6;
    const r2 = r - (i % 5 === 0 ? 14 : 10);
    ctx.beginPath();
    ctx.moveTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a));
    ctx.lineTo(cx + r2 * Math.cos(a), cy + r2 * Math.sin(a));
    ctx.stroke();
  }
  // needle
  const frac = zeroCentre
    ? 0.5 + 0.5 * Math.max(-1, Math.min(1, valueFrac))
    : Math.max(0, Math.min(1, valueFrac));
  const a = startA + (endA - startA) * frac;
  ctx.strokeStyle = THEME.bad;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + (r - 12) * Math.cos(a), cy + (r - 12) * Math.sin(a));
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, cx, cy + r, `${lab}${unit ? ` (${unit})` : ''}`, { anchor: 'below' });
}

/** A rectangular digital display panel with a big readout, e.g. a multimeter or electronic balance. */
export function drawDigitalReadout(ctx, x, y, w, h, text, opts = {}) {
  ctx.save();
  ctx.fillStyle = '#0e1a12';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = opts.color || '#7CFC9A';
  ctx.font = `700 ${opts.size || 20}px var(--mono, monospace)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
  if (opts.label) label(ctx, x + w / 2, y + h, opts.label, { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Optics
 * ------------------------------------------------------------------ */

export function drawUpright(ctx, x, baseY, hgt, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.lineTo(x, baseY - hgt);
  ctx.stroke();
  ctx.fillStyle = THEME.metal;
  ctx.beginPath();
  ctx.ellipse(x, baseY, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (opts.label) label(ctx, x, baseY + 5, opts.label, { anchor: 'below' });
}

export function drawOpticalBench(ctx, x0, x1, y, opts = {}) {
  ctx.save();
  ctx.fillStyle = THEME.wood;
  ctx.fillRect(x0, y, x1 - x0, 10);
  ctx.strokeStyle = THEME.stroke;
  ctx.strokeRect(x0, y, x1 - x0, 10);
  // scale ticks
  ctx.strokeStyle = THEME.dim;
  ctx.lineWidth = 1;
  const n = Math.round((x1 - x0) / 14);
  for (let i = 0; i <= n; i++) {
    const tx = x0 + ((x1 - x0) * i) / n;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y - (i % 5 === 0 ? 6 : 3));
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, (x0 + x1) / 2, y + 10, opts.label || 'Optical bench', { anchor: 'below' });
}

/** A thin convex lens symbol, vertical, centred at (cx, cy) with half-height r. */
export function drawConvexLens(ctx, cx, cy, r, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + 10, cy, cx, cy + r);
  ctx.quadraticCurveTo(cx - 10, cy, cx, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (opts.label !== false) label(ctx, cx, cy + r, opts.label || 'Convex lens', { anchor: 'below' });
  if (opts.axis) {
    dashedLine(ctx, cx - (opts.axisLen || 200), cy, cx + (opts.axisLen || 200), cy, THEME.dim);
  }
}

export function drawConcaveLens(ctx, cx, cy, r, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - r);
  ctx.lineTo(cx + 6, cy - r);
  ctx.quadraticCurveTo(cx - 2, cy, cx + 6, cy + r);
  ctx.lineTo(cx - 6, cy + r);
  ctx.quadraticCurveTo(cx + 2, cy, cx - 6, cy - r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (opts.label !== false) label(ctx, cx, cy + r, opts.label || 'Concave lens', { anchor: 'below' });
}

/** A concave (converging) spherical mirror, opening to the right by default. */
export function drawConcaveMirror(ctx, cx, cy, r, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx + 60, cy, 62, Math.PI * 0.72, Math.PI * 1.28);
  ctx.stroke();
  // silvered back hatching
  ctx.lineWidth = 1;
  ctx.strokeStyle = THEME.dim;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(cx + 60 + i * 3, cy, 62, Math.PI * 0.74, Math.PI * 1.26);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, cx, cy + r, opts.label || 'Concave mirror', { anchor: 'below' });
}

export function drawConvexMirror(ctx, cx, cy, r, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx - 60, cy, 62, -Math.PI * 0.28, Math.PI * 0.28);
  ctx.stroke();
  ctx.restore();
  label(ctx, cx, cy + r, opts.label || 'Convex mirror', { anchor: 'below' });
}

export function drawScreen(ctx, x, baseY, hgt, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.color || '#f4f2e8';
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 1.4;
  ctx.fillRect(x - 2, baseY - hgt, 4, hgt);
  ctx.strokeRect(x - 2, baseY - hgt, 4, hgt);
  ctx.fillStyle = THEME.metal;
  ctx.beginPath();
  ctx.ellipse(x, baseY, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, x, baseY + 5, opts.label || 'Screen', { anchor: 'below' });
}

export function drawCandle(ctx, x, baseY, hgt, opts = {}) {
  ctx.save();
  ctx.fillStyle = '#f2e6c2';
  ctx.fillRect(x - 4, baseY - hgt, 8, hgt);
  const grad = ctx.createLinearGradient(0, baseY - hgt - 18, 0, baseY - hgt);
  grad.addColorStop(0, THEME.flame);
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, baseY - hgt - 8, 4, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, x, baseY + 5, opts.label || 'Illuminated object', { anchor: 'below' });
}

/** A triangular glass prism. */
export function drawPrism(ctx, cx, cy, size, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.87, cy + size * 0.5);
  ctx.lineTo(cx - size * 0.87, cy + size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(ctx, cx, cy + size * 0.5, opts.label || 'Glass prism', { anchor: 'below' });
}

/** A rectangular glass slab. */
export function drawSlab(ctx, x, y, w, h, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.glassStroke;
  ctx.fillStyle = THEME.glass;
  ctx.lineWidth = 1.8;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
  label(ctx, x + w / 2, y + h, opts.label || 'Glass slab', { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Mechanics
 * ------------------------------------------------------------------ */

export function drawPendulumBob(ctx, pivotX, pivotY, len, angleRad, opts = {}) {
  const bx = pivotX + len * Math.sin(angleRad);
  const by = pivotY + len * Math.cos(angleRad);
  ctx.save();
  ctx.strokeStyle = THEME.dim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(pivotX, pivotY);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.fillStyle = THEME.metal;
  ctx.beginPath();
  ctx.arc(pivotX, pivotY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx, by, opts.r || 9, 0, Math.PI * 2);
  ctx.fillStyle = opts.color || '#5a4632';
  ctx.fill();
  ctx.strokeStyle = THEME.stroke;
  ctx.stroke();
  ctx.restore();
  if (opts.label !== false) label(ctx, bx, by + (opts.r || 9), opts.label || 'Bob', { anchor: 'below' });
  return { bx, by };
}

export function drawSpring(ctx, x, topY, len, coils = 10, wid = 16, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.metal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  const seg = len / (coils * 2);
  let y = topY;
  for (let i = 0; i < coils * 2; i++) {
    y += seg;
    ctx.lineTo(x + (i % 2 === 0 ? wid / 2 : -wid / 2), y);
  }
  ctx.lineTo(x, topY + len);
  ctx.stroke();
  ctx.restore();
  label(ctx, x, topY, opts.label || 'Helical spring', { anchor: 'above' });
  return { x, bottomY: topY + len };
}

export function drawWeight(ctx, x, y, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.color || '#6b7280';
  ctx.strokeStyle = THEME.stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 12, y, 24, 16, 3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (opts.label) label(ctx, x, y + 16, opts.label, { anchor: 'below' });
}

export function drawRuler(ctx, x0, y, len, opts = {}) {
  ctx.save();
  ctx.fillStyle = '#e8d9ab';
  ctx.strokeStyle = THEME.stroke;
  ctx.fillRect(x0, y, len, 14);
  ctx.strokeRect(x0, y, len, 14);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  const n = opts.divisions || 20;
  for (let i = 0; i <= n; i++) {
    const tx = x0 + (len * i) / n;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y + (i % 5 === 0 ? 9 : 5));
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, x0 + len / 2, y + 14, opts.label || 'Metre scale', { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Electricity
 * ------------------------------------------------------------------ */

export function drawResistor(ctx, x, y, w = 40, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.8;
  const h = 10;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 14, y);
  ctx.lineTo(x - w / 2, y);
  const zig = 6;
  let cx = x - w / 2;
  let up = true;
  while (cx < x + w / 2) {
    const nx = Math.min(cx + zig, x + w / 2);
    ctx.lineTo(nx, y + (up ? -h : h));
    up = !up;
    cx = nx;
  }
  ctx.lineTo(x + w / 2 + 14, y);
  ctx.stroke();
  ctx.restore();
  label(ctx, x, y + h + 2, opts.label || 'Resistor', { anchor: 'below' });
}

export function drawCell(ctx, x, y, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x - 2, y - 12);
  ctx.lineTo(x - 2, y + 12);
  ctx.moveTo(x + 2, y - 7);
  ctx.lineTo(x + 2, y + 7);
  ctx.stroke();
  ctx.restore();
  if (opts.label !== false) label(ctx, x, y + 14, opts.label || 'Cell', { anchor: 'below' });
}

export function drawKey(ctx, x, y, closed = true, opts = {}) {
  ctx.save();
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 4, y);
  ctx.stroke();
  ctx.beginPath();
  if (closed) {
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 14, y);
  } else {
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 10, y - 10);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - 4, y, 2, 0, Math.PI * 2);
  ctx.arc(x + 14, y, 2, 0, Math.PI * 2);
  ctx.fillStyle = THEME.ink;
  ctx.fill();
  ctx.restore();
  label(ctx, x, y + 6, opts.label || 'Plug key', { anchor: 'below' });
}

export function drawWireRect(ctx, x0, y0, x1, y1, opts = {}) {
  ctx.save();
  ctx.strokeStyle = opts.color || THEME.ink;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Misc
 * ------------------------------------------------------------------ */

/** A simple colour swatch with a label, e.g. an indicator colour or a flame test colour. */
export function drawSwatch(ctx, x, y, size, color, text) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = THEME.stroke;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 4);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (text) label(ctx, x + size / 2, y + size, text, { anchor: 'below' });
}

/** Centred title text at the top of the canvas, used sparingly. */
export function title(ctx, w, text) {
  ctx.save();
  ctx.fillStyle = theme().muted;
  ctx.font = '600 11px var(--ff, system-ui, sans-serif)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, 10, 8);
  ctx.restore();
}
