/**
 * Shared apparatus library — the bench every experiment is drawn on.
 *
 * Each primitive here does three jobs at once:
 *
 *   1. **Renders the real object.** Glassware is painted by the physical
 *      material engine in realism.js — Fresnel-bright edges, a specular
 *      reflection of the lab window, a 3-D rim, Beer–Lambert depth in the
 *      liquid, a contact shadow and a refracted caustic on the bench — so a
 *      beaker reads as a beaker rather than as a rectangle with a blue box
 *      inside it.
 *   2. **Moves like the real object.** Free surfaces, drops, bubbles,
 *      precipitates and fumes are integrated by fluids.js from their
 *      governing equations, and the state persists frame to frame, so
 *      ripples spread, reflect off the walls and damp out on their own.
 *   3. **Names and offers itself.** Every item registers its correct
 *      scientific name for the pointer, and anything that is physically
 *      meaningful to move registers a drag handle bound to the model
 *      variable it represents — never to a pixel position.
 *
 * Signatures are unchanged from the schematic version this replaces, so
 * every one of the experiment renderers keeps working untouched; the new
 * behaviour arrives through optional `opts`.
 */

import {
  setCanvasTheme as _setCanvasTheme, theme, tickClock, clock, dt,
  clamp, lerp, noise1, fbm, rgba, shade, mixColor, absorbed,
  backdrop, vignette, contactShadow, caustic, bloom, flame as drawFlame, incandescence,
  glassBody, rimEllipse, liquidColumn, liquidSurface,
  brushedMetal, chrome, plastic, cork, dialFace, lcdPanel,
} from './realism.js';
import { vessel, levelChanged, prune } from '../fluids.js';
import * as Iraw from './interact.js';

/* Registering a piece of apparatus also declares where the scene extends
   to, so framing and pointer-picking can never fall out of step. */
const I = {
  ...Iraw,
  apparatus(name, x, y, w, h, opts) { noteBounds(x, y, w, h); return Iraw.apparatus(name, x, y, w, h, opts); },
  handle(name, box, bind) { noteBounds(box.x, box.y, box.w, box.h); return Iraw.handle(name, box, bind); },
};

export { setCanvasTheme, theme } from './realism.js';
export { flame, bloom, incandescence, brushedMetal, chrome, plastic, contactShadow, caustic } from './realism.js';

const T = () => theme();

/* ------------------------------------------------------------------ *
 *  Scene framing
 * ------------------------------------------------------------------ *
 * Every renderer was written against a nominal bench a few hundred
 * pixels across. On a real screen that left the apparatus stranded in a
 * sea of empty grey — the single thing that made these scenes look dead.
 * So the frame is measured, not assumed: each primitive reports the box
 * it actually occupies, and the whole scene is then scaled and centred
 * to fill the canvas. A renderer never has to know the canvas size.
 */

let bounds = null;
let heatSources = [];
let placedLabels = [];

/** A primitive reports the box it drew into. */
export function noteBounds(x, y, w, h) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const x1 = x + (w || 0), y1 = y + (h || 0);
  if (!bounds) bounds = { x0: x, y0: y, x1, y1 };
  else {
    if (x < bounds.x0) bounds.x0 = x;
    if (y < bounds.y0) bounds.y0 = y;
    if (x1 > bounds.x1) bounds.x1 = x1;
    if (y1 > bounds.y1) bounds.y1 = y1;
  }
}

export function sceneBounds() { return bounds; }

/**
 * A lit burner announces where its flame is and how hot it is running, so
 * anything standing over it can respond — a vessel base that glows, the
 * convection that starts in the liquid, the bubbles that follow. Without
 * this the flame was just a decal painted near a beaker that never
 * noticed it.
 */
export function addHeatSource(x, y, power, radius) {
  heatSources.push({ x, y, power, radius });
}

/**
 * How strongly a vessel spanning x0..x1 with its base at `baseY` is being
 * heated, 0..1. Falls off with horizontal offset and with the gap between
 * flame tip and vessel base, the way real radiant and convective heating
 * from a burner does.
 */
export function heatAt(x0, x1, baseY) {
  let total = 0;
  const cx = (x0 + x1) / 2;
  for (const s of heatSources) {
    const dx = Math.abs(s.x - cx) / Math.max(1, (x1 - x0) * 0.5 + s.radius);
    const dy = Math.max(0, baseY - s.y) / Math.max(1, s.radius * 2.2);
    total += s.power * Math.max(0, 1 - dx * dx) * Math.max(0, 1 - dy);
  }
  return clamp(total, 0, 1);
}

/** Stable identity for a piece of apparatus, from where it stands. */
const keyOf = (kind, a, b) => `${kind}@${Math.round(a)},${Math.round(b)}`;

/* ------------------------------------------------------------------ *
 *  Canvas sizing + scene
 * ------------------------------------------------------------------ */

/**
 * Size the canvas to its CSS box at device resolution, advance the shared
 * animation clock, clear last frame's interaction regions, and lay in the
 * room the apparatus stands in. Returns the logical {w, h} to draw within.
 */
export function fitCanvas(canvas, aspect = 16 / 10) {
  const cssWidth = canvas.parentElement ? canvas.parentElement.clientWidth : canvas.clientWidth || 900;
  const w = Math.max(280, Math.round(cssWidth));
  const h = Math.max(180, Math.round(w / aspect));
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  tickClock();
  I.beginFrame();
  prune();
  bounds = null;
  heatSources = [];
  placedLabels = [];
  backdrop(ctx, w, h, Math.round(h * 0.84));
  return { w, h, ctx };
}

/**
 * Render one frame of a scene, scaled to fill the canvas.
 *
 * The first frame for a given scene and canvas size is drawn twice: once
 * to find out how big the apparatus actually is, then for real with the
 * transform that centres it. The transform is cached, so steady state is
 * a single pass; it is recomputed only when the canvas is resized or a
 * different experiment is opened.
 */
const fitCache = new Map();

export function renderScene(canvas, aspect, key, fn, state, inputs) {
  let g = fitCanvas(canvas, aspect);
  const { w, h } = g;
  const cacheKey = `${key}:${w}x${h}`;
  let fit = fitCache.get(cacheKey);

  if (!fit) {
    // Measuring pass — draw it once to learn the extent of the bench.
    try { fn(g.ctx, w, h, state, inputs); } catch { /* reported by the real pass */ }
    const b = bounds;
    fit = { k: 1, dx: 0, dy: 0 };
    if (b && b.x1 > b.x0 && b.y1 > b.y0) {
      const pad = 16;
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      // Never blow a scene up past legibility, never crop one that overflows.
      const k = clamp(Math.min((w - pad * 2) / bw, (h - pad * 2) / bh), 0.45, 2.6);
      fit = { k, dx: (w - bw * k) / 2 - b.x0 * k, dy: (h - bh * k) / 2 - b.y0 * k };
    }
    fitCache.set(cacheKey, fit);
    g = fitCanvas(canvas, aspect);          // clear the measuring pass away
  }

  I.setTransform(fit);
  const { ctx } = g;
  ctx.save();
  ctx.translate(fit.dx, fit.dy);
  ctx.scale(fit.k, fit.k);
  fn(ctx, w, h, state, inputs);
  ctx.restore();
  return g;
}

/** Forget cached framing — call when the experiment changes. */
export function resetScene() { fitCache.clear(); }

/** Finish the frame: edge falloff, then the pointer overlay on top. */
export function finishFrame(ctx, w, h) {
  vignette(ctx, w, h);
  I.drawOverlay(ctx, w, h);
}

/* ------------------------------------------------------------------ *
 *  Labelling
 * ------------------------------------------------------------------ */

/**
 * Print an apparatus label. Set on a soft plate so it stays legible over
 * any bench colour, with an optional leader to the exact point it names.
 */
export function label(ctx, x, y, text, opts = {}) {
  const { anchor = 'below', size = 12.5, bold = false, color, bg = true, leader = false } = opts;
  const th = T();
  ctx.save();
  ctx.font = `${bold ? '700' : '600'} ${size}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = anchor === 'left' ? 'right' : anchor === 'right' ? 'left' : 'center';
  ctx.textBaseline = anchor === 'above' ? 'bottom' : anchor === 'below' ? 'top' : 'middle';
  let tx = x;
  let ty = y;
  if (anchor === 'below') ty = y + 7;
  else if (anchor === 'above') ty = y - 7;
  else if (anchor === 'left') tx = x - 8;
  else if (anchor === 'right') tx = x + 8;

  /* Labels are placed, not just printed. A scene with a dozen named parts
     will otherwise stack captions on top of each other — which is exactly
     what made these benches unreadable. Each new plate is pushed along the
     anchor's own direction until it clears the ones already down, and a
     leader is drawn if it had to travel. */
  const tw = ctx.measureText(text).width;
  const pad = 4.5;
  const bw = tw + pad * 2;
  const bh = size + pad * 2 - 2;
  const bx0 = tx - (ctx.textAlign === 'center' ? tw / 2 : ctx.textAlign === 'right' ? tw : 0) - pad;
  let by0 = (anchor === 'above' ? ty - size : anchor === 'below' ? ty - 1.5 : ty - size / 2 - 1.5) - pad + 1;

  const overlaps = (y) => placedLabels.some((r) =>
    bx0 < r.x + r.w + 2 && bx0 + bw + 2 > r.x && y < r.y + r.h + 2 && y + bh + 2 > r.y);

  const dir = anchor === 'above' ? -1 : 1;
  const startY = by0;
  for (let n = 0; n < 14 && overlaps(by0); n++) by0 = startY + dir * (n + 1) * (bh + 3);
  const moved = Math.abs(by0 - startY) > 1;
  placedLabels.push({ x: bx0, y: by0, w: bw, h: bh });
  const dy = by0 - startY;

  if (leader || moved) {
    ctx.strokeStyle = rgba(th.accent, moved ? 0.42 : 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty + dy - (anchor === 'above' ? 0 : 1)); ctx.stroke();
  }
  if (bg) {
    ctx.fillStyle = th.isDark ? 'rgba(9,16,29,0.86)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx0, by0, bw, bh, 5); else ctx.rect(bx0, by0, bw, bh);
    ctx.fill();
    ctx.strokeStyle = th.isDark ? 'rgba(150,180,230,0.18)' : 'rgba(24,42,74,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = color || th.ink;
  ctx.fillText(text, tx, ty + dy);
  ctx.restore();
  noteBounds(bx0 - 2, by0 - 2, bw + 4, bh + 4);
}

/** A small marker pinpointing exactly what a label refers to. */
export function tick(ctx, x, y, r = 2.4) {
  ctx.save();
  ctx.fillStyle = T().accent;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Generic strokes
 * ------------------------------------------------------------------ */

/** The bench surface at a renderer-chosen height. */
export function bench(ctx, w, h, y) {
  const th = T();
  ctx.save();
  // Repaint the wall above, then the bench, so the surface sits where the
  // renderer wants it rather than at the default height.
  const wall = ctx.createLinearGradient(0, 0, w * 0.9, y);
  wall.addColorStop(0, th.wallTop);
  wall.addColorStop(1, th.wall);
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, y);
  const top = ctx.createLinearGradient(0, y, 0, h);
  top.addColorStop(0, shade(th.benchTop, 0.16));
  top.addColorStop(0.16, th.benchTop);
  top.addColorStop(1, th.benchFront);
  ctx.fillStyle = top;
  ctx.fillRect(0, y, w, h - y);
  ctx.strokeStyle = rgba(th.keyLight, th.isDark ? 0.14 : 0.6);
  ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(0, y + 0.7); ctx.lineTo(w, y + 0.7); ctx.stroke();
  ctx.strokeStyle = rgba('#000', th.isDark ? 0.34 : 0.1);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y + 2.3); ctx.lineTo(w, y + 2.3); ctx.stroke();
  ctx.restore();
}

export function dashedLine(ctx, x1, y1, x2, y2, color) {
  ctx.save();
  ctx.strokeStyle = color || T().dim;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.restore();
}

export function arrow(ctx, x1, y1, x2, y2, color, width = 1.6) {
  ctx.save();
  ctx.strokeStyle = color || T().accent;
  ctx.fillStyle = color || T().accent;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  const s = 6 + width;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
  ctx.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Glassware
 * ------------------------------------------------------------------ */

/**
 * Draw the contents of a vessel: the moving free surface, whatever is
 * rising through it and whatever is settling out of it. Shared by every
 * vessel shape so a beaker, a flask and a test tube all behave alike.
 */
function contents(ctx, box, fillFrac, liquidColor, opts, key) {
  const { x0, x1, top, bot } = box;
  const frac = clamp(fillFrac, 0, 1);
  const level = bot - (bot - top) * frac;
  const v = vessel(key);
  const col = liquidColor || T().liquid;

  if (frac <= 0.001) { v.wave.step(); return { level, v, ry: 0 }; }

  /* Heat arriving from a burner underneath. The renderer does not have to
     pass anything: the burner registered its flame, and this vessel simply
     asks how much of it is reaching its base. Everything that follows —
     convection, the first bubbles, a rolling boil, steam — is that one
     number. */
  const heat = opts.heat ?? heatAt(x0, x1, bot);

  // Agitation from whatever is happening chemically or mechanically.
  const stir = opts.stirring || 0;
  const boil = clamp((opts.boiling || 0) + Math.max(0, (heat - 0.45) / 0.55), 0, 1);
  if (stir > 0) v.wave.agitate(stir * 0.5);
  if (boil > 0) v.wave.agitate(boil * 0.7);
  levelChanged(v, level);
  v.wave.step();

  const surfaceAt = (f) => level + v.wave.at(f);
  liquidColumn(ctx, { x0: x0 + 1.6, x1: x1 - 1.6, bot: bot - 1.4 }, col, {
    level, surface: surfaceAt, alpha: opts.alpha ?? 0.88, eps: opts.eps ?? 1.05,
    radiusBottom: opts.radiusBottom ?? 5,
  });

  /* Convection. Liquid heated at the base becomes less dense and rises up
     the middle, spilling outward and sinking at the cooler walls — the
     cell every student is asked to draw. Shown as warm rising filaments
     whose speed follows the heating. */
  if (heat > 0.06) {
    ctx.save();
    const t = clock();
    const cw = x1 - x0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const phase = (t * (0.24 + heat * 0.5) + i * 0.2) % 1;
      const yy = bot - 4 - phase * (bot - level - 6);
      if (yy < level) continue;
      const spread = (1 - phase) * 0.16 + phase * 0.46;
      const xx = (x0 + x1) / 2 + Math.sin(i * 2.1 + t * 0.9) * cw * spread * 0.5;
      ctx.strokeStyle = rgba('#ffd9a0', 0.16 * heat * Math.sin(phase * Math.PI));
      ctx.beginPath();
      ctx.moveTo(xx, yy + 8);
      ctx.quadraticCurveTo(xx + Math.sin(t * 2 + i) * 4, yy + 3, xx, yy);
      ctx.stroke();
    }
    // The base of the liquid, hottest and least dense, reads brighter.
    const g = ctx.createLinearGradient(0, bot, 0, bot - (bot - level) * 0.55);
    g.addColorStop(0, rgba('#ffb765', 0.3 * heat));
    g.addColorStop(1, rgba('#ffb765', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x0, bot - (bot - level) * 0.55, x1 - x0, (bot - level) * 0.55);
    ctx.restore();
  }

  // Bubbles from boiling or from gas evolved by a reaction.
  const bubbleRate = (opts.bubbling || 0) + boil * 26 + (heat > 0.25 ? (heat - 0.25) * 14 : 0);
  if (bubbleRate > 0 || v.bubbles.bubbles.length) {
    v.bubbles.update(bubbleRate, x0 + 2, x1 - 2, bot - 2, level, (f, r) => v.wave.disturb(f, -r * 0.22, 2));
    ctx.save();
    for (const b of v.bubbles.bubbles) {
      if (b.y < level) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.62)';
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.34, b.r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Precipitate settling out under gravity.
  if (opts.precipitate > 0 || v.precip.parts.length) {
    v.precip.update(opts.precipitate || 0, x0 + 2, x1 - 2, level + 3, bot - 3, { coarse: opts.coarsePrecipitate, max: 90 });
    ctx.save();
    ctx.fillStyle = opts.precipitateColor || '#f2f4f8';
    for (const p of v.precip.parts) {
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // The free surface, seen in perspective.
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2 - 1.6;
  const ry = liquidSurface(ctx, cx, surfaceAt(0.5), rx, col, {
    squash: opts.squash ?? 0.16,
    wave: v.wave.at(0.5),
    sheen: 1 - clamp(boil * 0.6 + stir * 0.4, 0, 0.8),
  });

  // Steam off a hot liquid — automatic once it is near boiling.
  const steam = Math.max(opts.steam || 0, Math.max(0, (heat - 0.5) / 0.5));
  if (steam > 0.02) {
    v.plume.update(steam * 16, cx, level - 2, { spread: rx * 0.6, fade: 0.7 });
    ctx.save();
    for (const p of v.plume.puffs) {
      ctx.fillStyle = rgba('#ffffff', 0.16 * p.life * steam);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  return { level, v, ry };
}

/**
 * A graduated beaker. `fillFrac` is the fraction of its height occupied by
 * liquid; every extra behaviour (bubbling, boiling, stirring, precipitate,
 * steam) is optional and driven by the model, never by the renderer.
 */
export function drawBeaker(ctx, cx, topY, wid, hgt, fillFrac = 0, liquidColor, opts = {}) {
  const x0 = cx - wid / 2;
  const x1 = cx + wid / 2;
  const bot = topY + hgt;
  const th = T();
  const key = opts.fluidKey || keyOf('beaker', cx, topY);
  const R = 8;

  const path = (c) => {
    c.moveTo(x0, topY);
    c.lineTo(x0, bot - R);
    c.quadraticCurveTo(x0, bot, x0 + R, bot);
    c.lineTo(x1 - R, bot);
    c.quadraticCurveTo(x1, bot, x1, bot - R);
    c.lineTo(x1, topY);
  };

  contactShadow(ctx, cx, bot + 1, wid);
  if (fillFrac > 0.02) caustic(ctx, cx, bot + 3, wid, liquidColor || th.liquid, { strength: clamp(fillFrac * 1.3, 0, 1) });

  // Contents sit inside the walls; the glass is then painted over them,
  // which is physically what happens — you look at the liquid THROUGH the
  // near wall, so the wall's reflections belong in front.
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.closePath(); ctx.clip();
  contents(ctx, { x0, x1, top: topY, bot }, fillFrac, liquidColor, opts, key);
  ctx.restore();

  glassBody(ctx, (c) => { path(c); c.closePath(); }, { x0, x1, top: topY, bot }, { wall: 2.4 });

  // Pouring lip and mouth.
  rimEllipse(ctx, cx, topY, wid / 2, { squash: opts.squash ?? 0.16 });
  ctx.save();
  ctx.strokeStyle = th.glassStroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x0 - 3.5, topY - 1.5);
  ctx.quadraticCurveTo(x0 - 1, topY - 5, x0 + 6, topY - 4);
  ctx.stroke();
  ctx.restore();

  if (opts.graduations !== false) {
    ctx.save();
    ctx.strokeStyle = rgba(th.isDark ? '#dce8ff' : '#20365a', 0.5);
    ctx.lineWidth = 1;
    ctx.font = '600 8px system-ui, sans-serif';
    ctx.fillStyle = rgba(th.isDark ? '#dce8ff' : '#20365a', 0.55);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 4; i++) {
      const gy = topY + (hgt * i) / 5;
      const long = i % 2 === 0;
      ctx.beginPath();
      ctx.moveTo(x1 - (long ? 11 : 7), gy);
      ctx.lineTo(x1 - 2, gy);
      ctx.stroke();
      if (long) ctx.fillText(String(100 - i * 20), x1 - 13, gy);
    }
    ctx.restore();
  }

  const name = opts.label === false ? 'Beaker' : (opts.label || 'Beaker');
  I.apparatus(name, x0, topY - 4, wid, hgt + 8, { note: opts.note });
  if (opts.label !== false) label(ctx, cx, bot + 3, name, { anchor: 'below' });
  return { x0, x1, topY, bot };
}

/** A conical (Erlenmeyer) flask — the receiving vessel under a burette. */
export function drawConicalFlask(ctx, cx, topY, neckW, baseW, hgt, fillFrac = 0, liquidColor, opts = {}) {
  const neckH = hgt * 0.28;
  const bodyTop = topY + neckH;
  const bot = topY + hgt;
  const th = T();
  const key = opts.fluidKey || keyOf('flask', cx, topY);

  const path = (c) => {
    c.moveTo(cx - neckW / 2, topY);
    c.lineTo(cx - neckW / 2, bodyTop);
    c.lineTo(cx - baseW / 2, bot - 6);
    c.quadraticCurveTo(cx - baseW / 2, bot, cx - baseW / 2 + 8, bot);
    c.lineTo(cx + baseW / 2 - 8, bot);
    c.quadraticCurveTo(cx + baseW / 2, bot, cx + baseW / 2, bot - 6);
    c.lineTo(cx + neckW / 2, bodyTop);
    c.lineTo(cx + neckW / 2, topY);
    c.closePath();
  };

  contactShadow(ctx, cx, bot + 1, baseW);
  if (fillFrac > 0.02) caustic(ctx, cx, bot + 3, baseW, liquidColor || th.liquid, { strength: clamp(fillFrac * 1.3, 0, 1) });

  // The liquid surface widens as it rises up the cone — a given volume is a
  // much taller column near the neck than in the base.
  const frac = clamp(fillFrac, 0, 1);
  const level = bot - (bot - bodyTop) * frac;
  const halfW = lerp(baseW / 2, neckW / 2, clamp((bot - level) / (bot - bodyTop), 0, 1)) * 0.97;

  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  contents(ctx, { x0: cx - halfW, x1: cx + halfW, top: bodyTop, bot: bot - 1 }, frac, liquidColor, opts, key);
  ctx.restore();

  glassBody(ctx, path, { x0: cx - baseW / 2, x1: cx + baseW / 2, top: topY, bot }, { wall: 2.4 });
  rimEllipse(ctx, cx, topY, neckW / 2, { squash: 0.26 });

  const name = opts.label === false ? 'Conical flask' : (opts.label || 'Conical flask');
  I.apparatus(name, cx - baseW / 2, topY - 4, baseW, hgt + 8, { note: opts.note });
  if (opts.label !== false) label(ctx, cx, bot + 3, name, { anchor: 'below' });
  return { cx, topY, bot, level, halfW };
}

/**
 * A burette clamped vertically. When `dropping` is set (or a flow rate is
 * given) the tip delivers discrete drops of about 0.05 mL under gravity —
 * the same reason a real titration is finished drop-wise near the end point.
 */
export function drawBurette(ctx, x, topY, hgt, fillFrac = 1, opts = {}) {
  const w = 15;
  const bot = topY + hgt;
  const th = T();
  const barrelBot = topY + hgt - 16;
  const key = opts.fluidKey || keyOf('burette', x, topY);
  const v = vessel(key);
  const col = opts.liquidColor || th.liquid;

  contactShadow(ctx, x, bot + 2, w * 1.6, { strength: 0.5 });

  const path = (c) => c.rect(x - w / 2, topY, w, barrelBot - topY);

  // Column of titrant.
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  if (fillFrac > 0) {
    const ly = topY + (barrelBot - topY) * (1 - clamp(fillFrac, 0, 1));
    liquidColumn(ctx, { x0: x - w / 2 + 1.5, x1: x + w / 2 - 1.5, bot: barrelBot }, col,
      { level: ly, alpha: 0.9, eps: 0.9, radiusBottom: 0 });
    liquidSurface(ctx, x, ly, w / 2 - 1.5, col, { squash: 0.4, sheen: 0.7 });
  }
  ctx.restore();

  glassBody(ctx, (c) => { path(c); }, { x0: x - w / 2, x1: x + w / 2, top: topY, bot: barrelBot }, { wall: 1.8 });

  // Graduations: 0 at the top, because a burette reads volume DELIVERED.
  ctx.save();
  ctx.strokeStyle = rgba(th.isDark ? '#dce8ff' : '#1d3358', 0.62);
  ctx.font = '600 7.5px system-ui, sans-serif';
  ctx.fillStyle = rgba(th.isDark ? '#dce8ff' : '#1d3358', 0.72);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 20; i++) {
    const gy = topY + ((barrelBot - topY) * i) / 20;
    const major = i % 4 === 0;
    ctx.lineWidth = major ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 1, gy);
    ctx.lineTo(x + w / 2 + (major ? 7 : 3.5), gy);
    ctx.stroke();
    if (major) ctx.fillText(String(i * 2.5), x + w / 2 + 9, gy);
  }
  ctx.restore();

  // Stopcock: a chrome barrel with a PTFE key that turns as it opens.
  const scY = barrelBot + 1;
  chrome(ctx, x - 7, scY, 14, 9, 2);
  const open = clamp(opts.flowRate ? opts.flowRate * 8 : (opts.dropping ? 1 : 0), 0, 1);
  ctx.save();
  ctx.translate(x, scY + 4.5);
  ctx.rotate(open * Math.PI * 0.42);
  plastic(ctx, -10, -2, 20, 4, '#e8ecf3', 2);
  ctx.restore();
  // Jet.
  ctx.save();
  ctx.strokeStyle = th.glassStroke;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, scY + 9); ctx.lineTo(x, bot - 1);
  ctx.stroke();
  ctx.restore();

  // Drops: real ballistics from the jet down to the receiving surface.
  const rate = opts.flowRate ?? (opts.dropping ? 0.6 : 0);
  const targetY = opts.targetY ?? (bot + 60);
  if (rate > 0 || v.drops.drops.length || v.drops.splashes.length) {
    v.drops.update(rate, x, bot, targetY, opts.onImpact);
    ctx.save();
    ctx.fillStyle = rgba(col, 0.94);
    // The drop still hanging at the jet, growing until it detaches.
    if (v.drops.pendingGrowth > 0.05) {
      const g = v.drops.pendingGrowth;
      ctx.beginPath();
      ctx.ellipse(x, bot + 1.6 * g, 1.4 + 1.6 * g, 1.8 + 2.6 * g, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const d of v.drops.drops) {
      // A falling drop stretches along its direction of travel.
      const stretch = clamp(1 + d.v / 900, 1, 2.4);
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 2.3 / Math.sqrt(stretch), 2.3 * stretch, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(d.x - 0.7, d.y - 1, 0.6, 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(col, 0.94);
    }
    for (const s of v.drops.splashes) {
      ctx.globalAlpha = clamp(s.life, 0, 1);
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  const name = opts.label || 'Burette';
  I.apparatus(name, x - w / 2 - 3, topY, w + 18, hgt, { note: opts.note });
  label(ctx, x, topY, name, { anchor: 'above' });
  return { x, topY, bot, tipY: bot, barrelBot };
}

export function drawTestTube(ctx, cx, topY, hgt, wid = 16, fillFrac = 0, liquidColor, opts = {}) {
  const bot = topY + hgt;
  const th = T();
  const key = opts.fluidKey || keyOf('tube', cx, topY);
  const r = wid / 2;

  const path = (c) => {
    c.moveTo(cx - r, topY);
    c.lineTo(cx - r, bot - r);
    c.arc(cx, bot - r, r, Math.PI, 0, false);
    c.lineTo(cx + r, topY);
    c.closePath();
  };

  if (opts.inRack !== true) contactShadow(ctx, cx, bot + 2, wid * 1.5, { strength: 0.55 });

  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  contents(ctx, { x0: cx - r, x1: cx + r, top: topY, bot: bot - 1 }, fillFrac, liquidColor, opts, key);
  ctx.restore();

  glassBody(ctx, path, { x0: cx - r, x1: cx + r, top: topY, bot }, { wall: 1.6 });
  rimEllipse(ctx, cx, topY, r, { squash: 0.3 });

  const name = opts.label === false ? 'Test tube' : (opts.label || 'Test tube');
  I.apparatus(name, cx - r - 2, topY - 3, wid + 4, hgt + 6, { note: opts.note });
  if (opts.label !== false) label(ctx, cx, bot + 5, name, { anchor: 'below' });
  return { cx, topY, bot };
}

/**
 * A mercury-in-glass thermometer. The column is not a bare rectangle: the
 * glass stem acts as a cylindrical lens and magnifies the thread, which is
 * exactly why the column is readable at all in a real thermometer.
 */
export function drawThermometer(ctx, x, topY, hgt, fracHot = 0.5, opts = {}) {
  const bulbR = 6.5;
  const bot = topY + hgt;
  const th = T();
  const stemW = 7;
  const colTop = topY + (hgt - bulbR * 2) * (1 - clamp(fracHot, 0, 1));

  ctx.save();
  // Stem.
  const path = (c) => {
    if (c.roundRect) c.roundRect(x - stemW / 2, topY, stemW, hgt - bulbR, 3.5);
    else c.rect(x - stemW / 2, topY, stemW, hgt - bulbR);
  };
  glassBody(ctx, path, { x0: x - stemW / 2, x1: x + stemW / 2, top: topY, bot: bot - bulbR }, { wall: 1.2 });

  // Mercury thread, magnified by the stem.
  const merc = ctx.createLinearGradient(x - 2, 0, x + 2, 0);
  merc.addColorStop(0, '#7e1414');
  merc.addColorStop(0.4, '#e23b3b');
  merc.addColorStop(0.7, '#ff8080');
  merc.addColorStop(1, '#9c1d1d');
  ctx.fillStyle = merc;
  ctx.fillRect(x - 1.9, colTop, 3.8, bot - bulbR - colTop);

  // Bulb.
  ctx.beginPath();
  ctx.arc(x, bot - bulbR, bulbR, 0, Math.PI * 2);
  const bulb = ctx.createRadialGradient(x - 2, bot - bulbR - 2, 0.5, x, bot - bulbR, bulbR);
  bulb.addColorStop(0, '#ff9a9a');
  bulb.addColorStop(0.55, '#dd2b2b');
  bulb.addColorStop(1, '#7c1010');
  ctx.fillStyle = bulb;
  ctx.fill();
  ctx.strokeStyle = th.glassStroke;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(x - bulbR * 0.34, bot - bulbR - bulbR * 0.36, bulbR * 0.26, 0, Math.PI * 2); ctx.fill();

  // Scale.
  ctx.strokeStyle = rgba(th.ink, 0.55);
  for (let i = 0; i <= 10; i++) {
    const gy = topY + 3 + ((hgt - bulbR - 6) * i) / 10;
    ctx.lineWidth = i % 5 === 0 ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(x + stemW / 2 - 0.5, gy);
    ctx.lineTo(x + stemW / 2 + (i % 5 === 0 ? 5 : 2.5), gy);
    ctx.stroke();
  }
  ctx.restore();

  const name = opts.label || 'Thermometer';
  I.apparatus(name, x - stemW, topY, stemW * 2 + 6, hgt, { note: opts.note });
  label(ctx, x, topY, name, { anchor: 'above' });
}

/* ------------------------------------------------------------------ *
 *  Stands, clamps, burner
 * ------------------------------------------------------------------ */

export function drawRetortStand(ctx, x, baseY, hgt, opts = {}) {
  ctx.save();
  // Cast base, seen in perspective.
  contactShadow(ctx, x, baseY + 2, 76, { strength: 0.75 });
  const g = ctx.createLinearGradient(0, baseY - 5, 0, baseY + 6);
  g.addColorStop(0, shade(T().metal, 0.3));
  g.addColorStop(1, shade(T().metal, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - 36, baseY - 5, 72, 11, 3); else ctx.rect(x - 36, baseY - 5, 72, 11);
  ctx.fill();
  ctx.restore();
  // Rod.
  brushedMetal(ctx, x - 3, baseY - hgt, 6, hgt, { axis: 'v' });
  const name = opts.label === false ? 'Retort stand' : (opts.label || 'Retort stand');
  I.apparatus(name, x - 36, baseY - hgt, 72, hgt + 12, { note: opts.note });
  if (opts.label !== false) label(ctx, x, baseY + 8, name, { anchor: 'below' });
}

/**
 * A Bunsen burner. `opts.air` ∈ [0,1] opens the air hole: fully open gives
 * the hot premixed blue flame with its sharp inner cone, fully closed the
 * luminous yellow sooting flame — the distinction every student is taught
 * to make before heating anything.
 */
export function drawBurner(ctx, cx, baseY, lit = true, opts = {}) {
  const th = T();
  contactShadow(ctx, cx, baseY + 1, 40, { strength: 0.8 });
  ctx.save();
  // Base.
  const g = ctx.createLinearGradient(cx - 18, 0, cx + 18, 0);
  g.addColorStop(0, shade(th.metal, -0.45));
  g.addColorStop(0.3, shade(th.metal, 0.2));
  g.addColorStop(0.6, shade(th.metal, -0.1));
  g.addColorStop(1, shade(th.metal, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(cx - 24, baseY);
  ctx.lineTo(cx + 24, baseY);
  ctx.lineTo(cx + 12, baseY - 26);
  ctx.lineTo(cx - 12, baseY - 26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Barrel + collar.
  brushedMetal(ctx, cx - 6, baseY - 44, 12, 20, { axis: 'v' });
  chrome(ctx, cx - 8, baseY - 30, 16, 6, 1.5);
  // Air hole, open by the amount set.
  const air = clamp(opts.air ?? 1, 0, 1);
  ctx.save();
  ctx.fillStyle = rgba('#0a1220', 0.6 + 0.3 * air);
  ctx.fillRect(cx - 5, baseY - 28, 4 * air + 0.8, 4);
  ctx.restore();

  if (lit) {
    const fh = opts.flameHeight ?? 46;
    drawFlame(ctx, cx, baseY - 44, fh, { air, intensity: opts.intensity ?? 1 });
    /* Announce the flame so whatever stands over it is actually heated.
       A premixed (air-hole open) flame is much hotter than a luminous one,
       which is the whole reason students are told to open the air hole
       before heating anything. */
    addHeatSource(cx, baseY - 44 - fh, (0.55 + 0.45 * air) * (opts.intensity ?? 1), fh);
  }
  const name = opts.label || 'Bunsen burner';
  I.apparatus(name, cx - 24, baseY - 46, 48, 48, { note: air > 0.5 ? 'Air hole open — hot blue flame' : 'Air hole closed — luminous flame' });
  label(ctx, cx, baseY + 6, name, { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Meters
 * ------------------------------------------------------------------ */

/** A moving-coil meter — galvanometer, ammeter or voltmeter. */
export function drawDial(ctx, cx, cy, r, valueFrac, opts = {}) {
  const { label: lab = 'Meter', unit = '', zeroCentre = false } = opts;
  const th = T();
  contactShadow(ctx, cx, cy + r + 4, r * 2.1, { strength: 0.5 });
  ctx.save();
  // Bakelite case.
  ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  const case_ = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  case_.addColorStop(0, '#4a5468');
  case_.addColorStop(1, '#232c3c');
  ctx.fillStyle = case_;
  ctx.fill();
  ctx.restore();

  dialFace(ctx, cx, cy, r);

  ctx.save();
  const startA = Math.PI + Math.PI / 6;
  const endA = -Math.PI / 6;
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = startA + (endA - startA) * t;
    const major = i % 5 === 0;
    ctx.strokeStyle = major ? '#1a2333' : '#57657d';
    ctx.lineWidth = major ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + (r - 6) * Math.cos(a), cy + (r - 6) * Math.sin(a));
    ctx.lineTo(cx + (r - (major ? 14 : 10)) * Math.cos(a), cy + (r - (major ? 14 : 10)) * Math.sin(a));
    ctx.stroke();
  }
  // Mirror strip under the scale — the parallax guard on a real meter.
  ctx.strokeStyle = 'rgba(150,175,210,0.5)';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.arc(cx, cy, r - 4, startA, endA, true); ctx.stroke();

  // Needle, with the settling wobble of a real moving coil.
  const raw = zeroCentre ? 0.5 + 0.5 * clamp(valueFrac, -1, 1) : clamp(valueFrac, 0, 1);
  const wob = (noise1(clock() * 2.2) - 0.5) * 0.004;
  const a = startA + (endA - startA) * clamp(raw + wob, 0, 1);
  const nx = cx + (r - 12) * Math.cos(a);
  const ny = cy + (r - 12) * Math.sin(a);
  // Needle shadow on the dial face, offset — proves the needle stands proud.
  ctx.strokeStyle = 'rgba(30,45,70,0.2)';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(cx + 1.5, cy + 1.5); ctx.lineTo(nx + 1.5, ny + 1.5); ctx.stroke();
  ctx.strokeStyle = '#c02626';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
  chrome(ctx, cx - 3.5, cy - 3.5, 7, 7, 3.5);
  ctx.restore();

  const name = `${lab}${unit ? ` (${unit})` : ''}`;
  I.apparatus(lab, cx - r - 5, cy - r - 5, (r + 5) * 2, (r + 5) * 2, { note: opts.note });
  label(ctx, cx, cy + r + 6, name, { anchor: 'below' });
}

/** A digital instrument panel — multimeter, electronic balance, pH meter. */
export function drawDigitalReadout(ctx, x, y, w, h, text, opts = {}) {
  contactShadow(ctx, x + w / 2, y + h + 3, w, { strength: 0.45 });
  plastic(ctx, x - 4, y - 4, w + 8, h + 8, '#39435a', 5);
  lcdPanel(ctx, x, y, w, h, { lit: true, tint: '#0f3b2e' });
  ctx.save();
  ctx.fillStyle = opts.color || '#7CFC9A';
  ctx.font = `700 ${opts.size || 20}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = opts.color || '#7CFC9A';
  ctx.shadowBlur = 8;
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
  if (opts.label) {
    I.apparatus(opts.label, x - 4, y - 4, w + 8, h + 8, { note: opts.note });
    label(ctx, x + w / 2, y + h + 6, opts.label, { anchor: 'below' });
  }
}

/* ------------------------------------------------------------------ *
 *  Optics
 * ------------------------------------------------------------------ */

/**
 * An optical-bench upright. When bound to a position variable it becomes
 * draggable along the bench, which is how a real student finds a sharp
 * image — by sliding the holder, not by typing a number.
 */
export function drawUpright(ctx, x, baseY, hgt, opts = {}) {
  contactShadow(ctx, x, baseY + 1, 30, { strength: 0.6 });
  brushedMetal(ctx, x - 2, baseY - hgt, 4, hgt, { axis: 'v' });
  ctx.save();
  const g = ctx.createLinearGradient(0, baseY - 4, 0, baseY + 4);
  g.addColorStop(0, shade(T().metal, 0.25));
  g.addColorStop(1, shade(T().metal, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, baseY, 15, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (opts.label) {
    I.apparatus(opts.label, x - 15, baseY - hgt, 30, hgt + 8, { note: opts.note });
    label(ctx, x, baseY + 6, opts.label, { anchor: 'below' });
  }
  if (opts.drag) I.handle(opts.label || 'Upright', { x: x - 14, y: baseY - hgt, w: 28, h: hgt + 8 }, opts.drag);
}

export function drawOpticalBench(ctx, x0, x1, y, opts = {}) {
  const th = T();
  ctx.save();
  contactShadow(ctx, (x0 + x1) / 2, y + 12, x1 - x0, { strength: 0.5, spread: 0.5 });
  const g = ctx.createLinearGradient(0, y, 0, y + 11);
  g.addColorStop(0, shade(th.wood, 0.3));
  g.addColorStop(0.35, th.wood);
  g.addColorStop(1, shade(th.wood, -0.4));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, x1 - x0, 11);
  // Wood grain.
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#3a2412';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 7; i++) {
    const gy = y + 1 + i * 1.4;
    ctx.beginPath();
    for (let px = x0; px < x1; px += 14) ctx.lineTo(px, gy + noise1(px * 0.07 + i * 9) * 1.1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Metre scale along the bench.
  ctx.strokeStyle = rgba('#22160c', 0.65);
  ctx.font = '600 7.5px system-ui, sans-serif';
  ctx.fillStyle = rgba('#1a1109', 0.8);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const n = Math.max(4, Math.round((x1 - x0) / 14));
  for (let i = 0; i <= n; i++) {
    const tx = x0 + ((x1 - x0) * i) / n;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y - (major ? 7 : 3.5));
    ctx.stroke();
    if (major && opts.scaleMax) ctx.fillText(String(Math.round((i / n) * opts.scaleMax)), tx, y + 1.5);
  }
  ctx.restore();
  const name = opts.label || 'Optical bench';
  I.apparatus(name, x0, y - 8, x1 - x0, 20, { note: opts.note });
  label(ctx, (x0 + x1) / 2, y + 13, name, { anchor: 'below' });
}

/** Shared body for a lens: glass with a proper caustic and edge highlight. */
function lensBody(ctx, path, box, opts) {
  glassBody(ctx, path, box, { wall: 3, tintStrength: 1.15 });
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  // Light converging inside the element.
  const g = ctx.createLinearGradient(box.x0, box.top, box.x1, box.bot);
  g.addColorStop(0, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.45, 'rgba(190,225,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(box.x0 - 4, box.top - 4, box.x1 - box.x0 + 8, box.bot - box.top + 8);
  ctx.restore();
  if (opts.holder !== false) {
    // The metal clip that actually holds the element in its stand.
    chrome(ctx, (box.x0 + box.x1) / 2 - 5, box.bot - 2, 10, 7, 1.5);
  }
}

export function drawConvexLens(ctx, cx, cy, r, opts = {}) {
  const bulge = opts.bulge || 10;
  const path = (c) => {
    c.moveTo(cx, cy - r);
    c.quadraticCurveTo(cx + bulge, cy, cx, cy + r);
    c.quadraticCurveTo(cx - bulge, cy, cx, cy - r);
    c.closePath();
  };
  lensBody(ctx, path, { x0: cx - bulge, x1: cx + bulge, top: cy - r, bot: cy + r }, opts);
  const name = opts.label === false ? 'Convex lens' : (opts.label || 'Convex lens');
  I.apparatus(name, cx - bulge - 3, cy - r, bulge * 2 + 6, r * 2, { note: opts.note || 'Converging — real image beyond f' });
  if (opts.label !== false) label(ctx, cx, cy + r + 4, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: cx - bulge - 5, y: cy - r, w: bulge * 2 + 10, h: r * 2 }, opts.drag);
  if (opts.axis) dashedLine(ctx, cx - (opts.axisLen || 200), cy, cx + (opts.axisLen || 200), cy, T().dim);
}

export function drawConcaveLens(ctx, cx, cy, r, opts = {}) {
  const path = (c) => {
    c.moveTo(cx - 6, cy - r);
    c.lineTo(cx + 6, cy - r);
    c.quadraticCurveTo(cx - 2, cy, cx + 6, cy + r);
    c.lineTo(cx - 6, cy + r);
    c.quadraticCurveTo(cx + 2, cy, cx - 6, cy - r);
    c.closePath();
  };
  lensBody(ctx, path, { x0: cx - 7, x1: cx + 7, top: cy - r, bot: cy + r }, opts);
  const name = opts.label === false ? 'Concave lens' : (opts.label || 'Concave lens');
  I.apparatus(name, cx - 9, cy - r, 18, r * 2, { note: opts.note || 'Diverging — virtual image only' });
  if (opts.label !== false) label(ctx, cx, cy + r + 4, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: cx - 10, y: cy - r, w: 20, h: r * 2 }, opts.drag);
}

/** Silvered spherical mirror; the hatched back is the silvered surface. */
function mirrorBody(ctx, cx, cy, r, centreX, a0, a1, name, opts) {
  const th = T();
  ctx.save();
  // Glass front.
  ctx.strokeStyle = rgba('#cfe4ff', 0.9);
  ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.arc(centreX, cy, 62, a0, a1); ctx.stroke();
  // Silvered back.
  ctx.strokeStyle = shade(th.metal, 0.25);
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(centreX + (centreX > cx ? 3 : -3), cy, 62, a0, a1); ctx.stroke();
  // Specular sweep along the surface.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(centreX, cy, 62, lerp(a0, a1, 0.18), lerp(a0, a1, 0.42)); ctx.stroke();
  // Backing hatch.
  ctx.strokeStyle = rgba(th.dim, 0.55);
  ctx.lineWidth = 0.8;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(centreX + (centreX > cx ? i * 2.6 : -i * 2.6), cy, 62, lerp(a0, a1, 0.06), lerp(a0, a1, 0.94));
    ctx.stroke();
  }
  ctx.restore();
  I.apparatus(name, cx - 12, cy - r, 24, r * 2, { note: opts.note });
  label(ctx, cx, cy + r + 4, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: cx - 14, y: cy - r, w: 28, h: r * 2 }, opts.drag);
}

export function drawConcaveMirror(ctx, cx, cy, r, opts = {}) {
  mirrorBody(ctx, cx, cy, r, cx + 60, Math.PI * 0.72, Math.PI * 1.28,
    opts.label || 'Concave mirror', opts);
}

export function drawConvexMirror(ctx, cx, cy, r, opts = {}) {
  mirrorBody(ctx, cx, cy, r, cx - 60, -Math.PI * 0.28, Math.PI * 0.28,
    opts.label || 'Convex mirror', opts);
}

export function drawScreen(ctx, x, baseY, hgt, opts = {}) {
  const th = T();
  contactShadow(ctx, x, baseY + 1, 28, { strength: 0.6 });
  ctx.save();
  // Ground-glass screen, lit from the front so it glows slightly.
  const g = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
  g.addColorStop(0, shade(opts.color || '#f4f2e8', -0.2));
  g.addColorStop(0.4, opts.color || '#f4f2e8');
  g.addColorStop(1, shade(opts.color || '#f4f2e8', -0.35));
  ctx.fillStyle = g;
  ctx.fillRect(x - 3, baseY - hgt, 6, hgt);
  ctx.strokeStyle = rgba(th.stroke, 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 3, baseY - hgt, 6, hgt);
  ctx.restore();
  brushedMetal(ctx, x - 1.5, baseY - 12, 3, 12, { axis: 'v' });
  ctx.save();
  ctx.fillStyle = shade(th.metal, -0.2);
  ctx.beginPath(); ctx.ellipse(x, baseY, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const name = opts.label || 'Screen';
  I.apparatus(name, x - 8, baseY - hgt, 16, hgt + 8, { note: opts.note });
  label(ctx, x, baseY + 6, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: x - 10, y: baseY - hgt, w: 20, h: hgt + 8 }, opts.drag);
}

export function drawCandle(ctx, x, baseY, hgt, opts = {}) {
  contactShadow(ctx, x, baseY + 1, 20, { strength: 0.6 });
  ctx.save();
  const g = ctx.createLinearGradient(x - 5, 0, x + 5, 0);
  g.addColorStop(0, '#d9c896');
  g.addColorStop(0.35, '#fdf3d6');
  g.addColorStop(1, '#c7b483');
  ctx.fillStyle = g;
  ctx.fillRect(x - 5, baseY - hgt, 10, hgt);
  // Wax translucency near the flame.
  const t = ctx.createLinearGradient(0, baseY - hgt, 0, baseY - hgt + 14);
  t.addColorStop(0, 'rgba(255,190,120,0.55)');
  t.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = t;
  ctx.fillRect(x - 5, baseY - hgt, 10, 14);
  ctx.restore();
  // A candle flame is a diffusion flame — no air hole, so fully luminous.
  drawFlame(ctx, x, baseY - hgt, 20, { air: 0.05, intensity: 0.95 });
  const name = opts.label || 'Illuminated object';
  I.apparatus(name, x - 8, baseY - hgt - 22, 16, hgt + 26, { note: opts.note });
  label(ctx, x, baseY + 6, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: x - 10, y: baseY - hgt - 10, w: 20, h: hgt + 14 }, opts.drag);
}

/** An equilateral glass prism, showing its dispersed edge colours. */
export function drawPrism(ctx, cx, cy, size, opts = {}) {
  const path = (c) => {
    c.moveTo(cx, cy - size);
    c.lineTo(cx + size * 0.87, cy + size * 0.5);
    c.lineTo(cx - size * 0.87, cy + size * 0.5);
    c.closePath();
  };
  contactShadow(ctx, cx, cy + size * 0.5 + 2, size * 1.7, { strength: 0.5 });
  glassBody(ctx, path, { x0: cx - size * 0.87, x1: cx + size * 0.87, top: cy - size, bot: cy + size * 0.5 }, { wall: 4, tintStrength: 1.2 });
  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  // Total internal reflection lights the far face.
  const g = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
  g.addColorStop(0, 'rgba(255,255,255,0.34)');
  g.addColorStop(0.5, 'rgba(160,215,255,0.1)');
  g.addColorStop(1, 'rgba(255,255,255,0.26)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  ctx.restore();
  const name = opts.label || 'Glass prism';
  I.apparatus(name, cx - size * 0.87, cy - size, size * 1.74, size * 1.5, { note: opts.note });
  label(ctx, cx, cy + size * 0.5 + 4, name, { anchor: 'below' });
}

export function drawSlab(ctx, x, y, w, h, opts = {}) {
  const path = (c) => c.rect(x, y, w, h);
  contactShadow(ctx, x + w / 2, y + h + 2, w, { strength: 0.45 });
  glassBody(ctx, path, { x0: x, x1: x + w, top: y, bot: y + h }, { wall: 3, tintStrength: 1.15 });
  const name = opts.label || 'Glass slab';
  I.apparatus(name, x, y, w, h, { note: opts.note });
  label(ctx, x + w / 2, y + h + 3, name, { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Mechanics
 * ------------------------------------------------------------------ */

/**
 * A pendulum bob on its thread. If `opts.drag` binds a length variable the
 * bob can be pulled down the thread to set L directly — the model then
 * recomputes T = 2π√(L/g), so the timing changes for the physical reason,
 * not because the drawing moved.
 */
export function drawPendulumBob(ctx, pivotX, pivotY, len, angleRad, opts = {}) {
  const bx = pivotX + len * Math.sin(angleRad);
  const by = pivotY + len * Math.cos(angleRad);
  const r = opts.r || 9;
  const th = T();
  ctx.save();
  // Thread, with a touch of slack catching light.
  ctx.strokeStyle = th.isDark ? 'rgba(220,232,255,0.75)' : 'rgba(40,58,90,0.75)';
  ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(pivotX, pivotY); ctx.lineTo(bx, by); ctx.stroke();
  // Split-cork clamp at the pivot — how the thread is really held.
  cork(ctx, pivotX, pivotY - 7, 11, 8, 8);
  chrome(ctx, pivotX - 9, pivotY - 10, 18, 4, 1.5);

  // Brass bob: a sphere, lit from the upper left with a specular hotspot.
  const base = opts.color || '#b5822f';
  const g = ctx.createRadialGradient(bx - r * 0.4, by - r * 0.45, r * 0.08, bx, by, r);
  g.addColorStop(0, shade(base, 0.65));
  g.addColorStop(0.42, base);
  g.addColorStop(0.82, shade(base, -0.4));
  g.addColorStop(1, shade(base, -0.62));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
  // Rim light bouncing off the bench.
  ctx.strokeStyle = rgba('#ffe9b8', 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(bx, by, r - 0.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.beginPath(); ctx.ellipse(bx - r * 0.35, by - r * 0.4, r * 0.22, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const name = opts.label === false ? 'Bob' : (opts.label || 'Bob');
  I.apparatus(name, bx - r, by - r, r * 2, r * 2, { note: opts.note, round: r });
  if (opts.label !== false) label(ctx, bx, by + r + 2, name, { anchor: 'below' });
  if (opts.drag) I.handle(name, { x: bx - r - 4, y: by - r - 4, w: r * 2 + 8, h: r * 2 + 8, round: r + 4 }, opts.drag);
  return { bx, by };
}

export function drawSpring(ctx, x, topY, len, coils = 10, wid = 16, opts = {}) {
  ctx.save();
  // Drawn as a helix: the front of each turn is bright, the back darker,
  // which is what makes a coil read as round wire rather than a zig-zag.
  const turns = Math.max(3, coils);
  const step = len / turns;
  for (let i = 0; i < turns; i++) {
    const y = topY + i * step;
    ctx.strokeStyle = rgba('#2a3a55', 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y + step / 2, wid / 2, step * 0.45, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    const g = ctx.createLinearGradient(x - wid / 2, 0, x + wid / 2, 0);
    g.addColorStop(0, '#6d7688');
    g.addColorStop(0.32, '#e6ecf6');
    g.addColorStop(0.6, '#98a2b4');
    g.addColorStop(1, '#5a6376');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(x, y + step / 2, wid / 2, step * 0.45, 0, Math.PI * 0.92, Math.PI * 2.08); ctx.stroke();
  }
  ctx.strokeStyle = '#8a93a5';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, topY + 2); ctx.moveTo(x, topY + len - 2); ctx.lineTo(x, topY + len); ctx.stroke();
  ctx.restore();
  const name = opts.label || 'Helical spring';
  I.apparatus(name, x - wid / 2 - 2, topY, wid + 4, len, { note: opts.note });
  label(ctx, x, topY, name, { anchor: 'above' });
  return { x, bottomY: topY + len };
}

export function drawWeight(ctx, x, y, opts = {}) {
  contactShadow(ctx, x, y + 17, 26, { strength: 0.4 });
  ctx.save();
  const base = opts.color || '#6b7280';
  const g = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
  g.addColorStop(0, shade(base, -0.45));
  g.addColorStop(0.28, shade(base, 0.35));
  g.addColorStop(0.6, shade(base, -0.05));
  g.addColorStop(1, shade(base, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x - 12, y, 24, 16, 3); else ctx.rect(x - 12, y, 24, 16);
  ctx.fill();
  ctx.strokeStyle = rgba('#0f1725', 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  // Hanger hook.
  ctx.strokeStyle = '#aab3c2';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(x, y - 2, 3.2, Math.PI * 0.15, Math.PI * 0.85, true); ctx.stroke();
  ctx.restore();
  if (opts.label) {
    I.apparatus(opts.label, x - 12, y, 24, 16, { note: opts.note });
    label(ctx, x, y + 17, opts.label, { anchor: 'below' });
  }
  if (opts.drag) I.handle(opts.label || 'Slotted weight', { x: x - 14, y: y - 4, w: 28, h: 24 }, opts.drag);
}

export function drawRuler(ctx, x0, y, len, opts = {}) {
  ctx.save();
  contactShadow(ctx, x0 + len / 2, y + 15, len, { strength: 0.35, spread: 0.4 });
  const g = ctx.createLinearGradient(0, y, 0, y + 14);
  g.addColorStop(0, '#f6ebc4');
  g.addColorStop(0.5, '#e8d9ab');
  g.addColorStop(1, '#cbb987');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y, len, 14);
  ctx.strokeStyle = rgba('#5c4a22', 0.6);
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y, len, 14);
  ctx.strokeStyle = '#2b2415';
  ctx.font = '600 7px system-ui, sans-serif';
  ctx.fillStyle = '#2b2415';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const n = opts.divisions || 20;
  for (let i = 0; i <= n; i++) {
    const tx = x0 + (len * i) / n;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 1.1 : 0.7;
    ctx.beginPath();
    ctx.moveTo(tx, y);
    ctx.lineTo(tx, y + (major ? 9 : 5));
    ctx.stroke();
    if (major && opts.scaleMax) ctx.fillText(String(Math.round((i / n) * opts.scaleMax)), tx, y + 9.5);
  }
  ctx.restore();
  const name = opts.label || 'Metre scale';
  I.apparatus(name, x0, y, len, 14, { note: opts.note });
  label(ctx, x0 + len / 2, y + 15, name, { anchor: 'below' });
}

/* ------------------------------------------------------------------ *
 *  Electricity — drawn as circuit symbols, as a lab record demands
 * ------------------------------------------------------------------ */

export function drawResistor(ctx, x, y, w = 40, opts = {}) {
  const th = T();
  ctx.save();
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
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
  // A resistor carrying current warms up; show it when the model says so.
  if (opts.power > 0) incandescence(ctx, x, y, w * 0.4, clamp(opts.power, 0, 1), { intensity: 0.6 });
  ctx.restore();
  const name = opts.label || 'Resistor';
  I.apparatus(name, x - w / 2 - 14, y - h - 2, w + 28, h * 2 + 4, { note: opts.note });
  label(ctx, x, y + h + 2, name, { anchor: 'below' });
}

export function drawCell(ctx, x, y, opts = {}) {
  const th = T();
  ctx.save();
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 2, y - 12); ctx.lineTo(x - 2, y + 12); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 3, y - 7); ctx.lineTo(x + 3, y + 7); ctx.stroke();
  ctx.font = '700 9px system-ui, sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.fillText('+', x - 8, y - 12);
  ctx.fillText('−', x + 9, y - 12);
  ctx.restore();
  const name = opts.label === false ? 'Cell' : (opts.label || 'Cell');
  I.apparatus(name, x - 12, y - 14, 24, 28, { note: opts.note });
  if (opts.label !== false) label(ctx, x, y + 15, name, { anchor: 'below' });
}

export function drawKey(ctx, x, y, closed = true, opts = {}) {
  const th = T();
  ctx.save();
  ctx.strokeStyle = th.ink;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 14, y); ctx.lineTo(x - 4, y); ctx.stroke();
  ctx.beginPath();
  if (closed) { ctx.moveTo(x - 4, y); ctx.lineTo(x + 14, y); }
  else { ctx.moveTo(x - 4, y); ctx.lineTo(x + 10, y - 10); }
  ctx.stroke();
  ctx.fillStyle = th.ink;
  ctx.beginPath(); ctx.arc(x - 4, y, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 14, y, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  const name = opts.label || 'Plug key';
  I.apparatus(name, x - 16, y - 12, 34, 20, { note: closed ? 'Closed — circuit complete' : 'Open — no current' });
  label(ctx, x, y + 6, name, { anchor: 'below' });
}

/** Standard denominations of a resistance/post-office box, largest first. */
export const RESISTANCE_BOX_DENOMINATIONS = [100, 50, 20, 10, 10, 5, 2, 2, 1];

/**
 * A plug-type resistance box: a bakelite case with a row of brass block
 * terminals, a brass plug seated in each gap between them. Seating a plug
 * flush in its gap SHORTS that coil out of the circuit; lifting it clear
 * switches the coil IN — the reverse of a household plug, and the single
 * most common wiring mistake with this apparatus, so it is worth drawing
 * correctly rather than as a black box with a number on it.
 *
 * The box's fixed denominations cannot sum to every possible value the
 * resistanceBox slider allows, so the plug pattern below is a greedy,
 * COSMETIC approximation of `ohms` — the number actually used by the
 * physics is always the engraved digital tag underneath, never a count of
 * which plugs look pulled.
 */
export function drawResistanceBox(ctx, cx, topY, ohms, opts = {}) {
  const denominations = RESISTANCE_BOX_DENOMINATIONS;
  let remaining = Math.max(0, ohms);
  const pulled = denominations.map((d) => {
    if (remaining >= d - 1e-6) { remaining -= d; return true; }
    return false;
  });
  const n = denominations.length;
  const gapW = 26;
  const boxW = gapW * n + 24, boxH = 46;
  const x0 = cx - boxW / 2;

  contactShadow(ctx, cx, topY + boxH + 8, boxW * 1.05, { strength: 0.55 });
  plastic(ctx, x0, topY, boxW, boxH, '#241a12', 6);
  // Top bevel/rim, like a real bakelite lid.
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 3, topY + 3, boxW - 6, boxH - 6);
  ctx.restore();

  // Brass terminal blocks, one more than there are gaps.
  for (let i = 0; i <= n; i++) {
    const gx = x0 + 12 + i * gapW;
    brushedMetal(ctx, gx - 4, topY + 7, 8, boxH - 14, { base: '#c9a24a', radius: 2 });
  }
  // Each socket, with its plug either seated (shorted) or lifted (in circuit).
  for (let i = 0; i < n; i++) {
    const gx = x0 + 12 + gapW / 2 + i * gapW;
    const holeY = topY + boxH / 2 - 3;
    ctx.save();
    ctx.fillStyle = 'rgba(8,6,4,0.9)';
    ctx.beginPath(); ctx.arc(gx, holeY, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (pulled[i]) {
      chrome(ctx, gx - 3, holeY - 22, 6, 17, 2.5);
      ctx.save();
      const g = ctx.createRadialGradient(gx - 1, holeY - 24, 0.5, gx, holeY - 22, 5);
      g.addColorStop(0, '#f3d998'); g.addColorStop(1, '#a97d2e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(gx, holeY - 22, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      const g = ctx.createRadialGradient(gx - 1.2, holeY - 1.2, 0.4, gx, holeY, 4.6);
      g.addColorStop(0, '#f3d998'); g.addColorStop(1, '#a97d2e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, holeY, 4.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = 'rgba(235,225,205,0.8)';
    ctx.font = '600 7.5px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(String(denominations[i]), gx, topY + boxH - 4);
    ctx.restore();
  }

  const display = Number.isInteger(ohms) ? String(ohms) : ohms.toFixed(1);
  drawDigitalReadout(ctx, cx - 34, topY + boxH + 14, 68, 24, `${display} Ω`, { size: 14 });
  const name = opts.label || 'Resistance box';
  I.apparatus(name, x0, topY, boxW, boxH + 48, { note: opts.note });
  label(ctx, cx, topY - 6, name, { anchor: 'above' });
}

/**
 * Connecting wire. When a current is flowing the model can pass its
 * magnitude so charge carriers are shown drifting — slowly, because the
 * drift velocity in a copper wire really is under a millimetre per second.
 */
export function drawWireRect(ctx, x0, y0, x1, y1, opts = {}) {
  const th = T();
  ctx.save();
  const X = Math.min(x0, x1), Y = Math.min(y0, y1);
  const W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
  ctx.strokeStyle = opts.color || th.ink;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.strokeRect(X, Y, W, H);
  if (opts.current > 0) {
    const per = 2 * (W + H);
    const n = Math.max(6, Math.round(per / 46));
    const phase = (clock() * clamp(opts.current, 0, 3) * 42) % (per / n);
    ctx.fillStyle = rgba(th.accent, 0.85);
    for (let i = 0; i < n; i++) {
      let d = (i * per) / n + phase;
      d %= per;
      let px, py;
      if (d < W) { px = X + d; py = Y; }
      else if (d < W + H) { px = X + W; py = Y + (d - W); }
      else if (d < 2 * W + H) { px = X + W - (d - W - H); py = Y + H; }
      else { px = X; py = Y + H - (d - 2 * W - H); }
      ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Misc
 * ------------------------------------------------------------------ */

/** A colour swatch — indicator colour, flame-test colour, precipitate. */
export function drawSwatch(ctx, x, y, size, color, text) {
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + size);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, shade(color, -0.22));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, size, size, 5); else ctx.rect(x, y, size, size);
  ctx.fill();
  ctx.strokeStyle = rgba(T().stroke, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(x + 2, y + 2, size - 4, size * 0.22);
  ctx.restore();
  if (text) {
    I.apparatus(text, x, y, size, size);
    label(ctx, x + size / 2, y + size, text, { anchor: 'below' });
  }
}

/** Small caption in the top-left of the scene, used sparingly. */
export function title(ctx, w, text) {
  ctx.save();
  ctx.fillStyle = T().muted;
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, 12, 10);
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 *  Assemblies — apparatus set up the way it is actually set up
 * ------------------------------------------------------------------ *
 * A burner at the bottom of the frame and a beaker at the top, joined by
 * nothing, is not a laboratory: it is two drawings sharing a canvas. The
 * helpers below build the standard assemblies as a bench technician would
 * lay them out, so the flame is under the gauze, the gauze is on the
 * tripod, the vessel is on the gauze, and the heat therefore reaches it.
 */

/** Iron tripod — three legs, the back one seen between the front two. */
export function drawTripod(ctx, cx, baseY, hgt, wid) {
  const th = T();
  const topR = wid / 2;
  ctx.save();
  contactShadow(ctx, cx, baseY + 1, wid * 1.25, { strength: 0.7 });
  ctx.strokeStyle = shade(th.metal, -0.3);
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  // Back leg first, so the front pair overlaps it.
  ctx.strokeStyle = shade(th.metal, -0.5);
  ctx.beginPath(); ctx.moveTo(cx, baseY - hgt); ctx.lineTo(cx + topR * 0.15, baseY - hgt * 0.12); ctx.stroke();
  ctx.strokeStyle = shade(th.metal, -0.18);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * topR * 0.86, baseY - hgt);
    ctx.lineTo(cx + s * topR * 1.14, baseY);
    ctx.stroke();
  }
  // Top ring.
  ctx.strokeStyle = shade(th.metal, 0.1);
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(cx, baseY - hgt, topR, topR * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(cx, baseY - hgt - 1, topR, topR * 0.2, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.restore();
  I.apparatus('Tripod stand', cx - topR * 1.2, baseY - hgt - 4, topR * 2.4, hgt + 6,
    { note: 'Supports the vessel over the flame' });
  return { topY: baseY - hgt, r: topR };
}

/**
 * Wire gauze. The ceramic centre spreads the flame so the vessel is not
 * heated at a point — the reason a beaker cracks if it is heated without
 * one. It glows when the flame under it is hot enough.
 */
export function drawGauze(ctx, cx, y, wid, opts = {}) {
  const th = T();
  const heat = opts.heat ?? heatAt(cx - wid / 2, cx + wid / 2, y);
  ctx.save();
  const g = ctx.createLinearGradient(cx - wid / 2, 0, cx + wid / 2, 0);
  g.addColorStop(0, shade(th.metal, -0.45));
  g.addColorStop(0.4, shade(th.metal, 0.2));
  g.addColorStop(1, shade(th.metal, -0.5));
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - wid / 2, y - 2.5, wid, 5, 2); else ctx.rect(cx - wid / 2, y - 2.5, wid, 5);
  ctx.fill();
  // Ceramic centre disc.
  ctx.fillStyle = heat > 0.35 ? mixColor('#d8d2c4', '#ff7a2a', clamp((heat - 0.35) / 0.65, 0, 1)) : '#d8d2c4';
  ctx.beginPath(); ctx.ellipse(cx, y, wid * 0.26, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  // Mesh.
  ctx.strokeStyle = rgba('#2a3346', 0.35);
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 9; i++) {
    const x = cx - wid / 2 + (wid * i) / 9;
    ctx.beginPath(); ctx.moveTo(x, y - 2.2); ctx.lineTo(x, y + 2.2); ctx.stroke();
  }
  ctx.restore();
  if (heat > 0.3) incandescence(ctx, cx, y, wid * 0.3, clamp((heat - 0.3) / 0.7, 0, 1), { intensity: 0.7 });
  I.apparatus('Wire gauze', cx - wid / 2, y - 4, wid, 8,
    { note: 'Spreads the flame so the vessel is not heated at a point' });
  return y;
}

/** A boss-head and clamp gripping something on a retort-stand rod. */
export function drawClamp(ctx, rodX, y, reachX, opts = {}) {
  const th = T();
  const dir = Math.sign(reachX - rodX) || 1;
  ctx.save();
  chrome(ctx, rodX - 5.5, y - 6, 11, 12, 2);                 // boss head
  brushedMetal(ctx, Math.min(rodX, reachX), y - 2, Math.abs(reachX - rodX), 4, { axis: 'h' });
  // Jaws.
  ctx.fillStyle = shade(th.metal, -0.15);
  ctx.beginPath();
  ctx.ellipse(reachX, y, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2c3446';
  ctx.beginPath(); ctx.ellipse(reachX + dir * 1.5, y, 2.4, 5.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  I.apparatus(opts.label || 'Clamp and boss head', Math.min(rodX, reachX) - 6, y - 9,
    Math.abs(reachX - rodX) + 14, 18, { note: opts.note });
}

/**
 * The standard heating assembly: retort stand, burner, tripod, gauze, and
 * the vessel sitting on top of it — laid out so the flame really is under
 * the vessel and `heatAt` therefore reports heat reaching it.
 *
 * Returns the geometry so a renderer can place a thermometer, a capillary
 * or a stirrer into the vessel it just stood up.
 */
export function heatingAssembly(ctx, cx, benchY, opts = {}) {
  const {
    vesselWidth = 132, vesselHeight = 116, fill = 0.62,
    liquid = '#cfe0f5', lit = true, air = 1, vessel: kind = 'beaker',
    vesselLabel, standSide = -1, flameHeight = 44, stand = true,
  } = opts;

  const burnerBaseY = benchY;
  // Tripod tall enough to clear the flame, vessel sitting on the gauze.
  const tripodH = flameHeight + 42;   // clears the barrel plus the flame
  const gaugeY = burnerBaseY - tripodH;

  if (stand) {
    const rodX = cx + standSide * (vesselWidth * 0.5 + 54);
    drawRetortStand(ctx, rodX, benchY, tripodH + vesselHeight + 76, { label: 'Retort stand' });
  }
  drawBurner(ctx, cx, burnerBaseY, lit, { air, flameHeight });
  drawTripod(ctx, cx, burnerBaseY, tripodH, vesselWidth * 0.92);
  drawGauze(ctx, cx, gaugeY, vesselWidth * 0.96);

  const topY = gaugeY - 3 - vesselHeight;
  let geom;
  if (kind === 'flask') {
    geom = drawConicalFlask(ctx, cx, topY, vesselWidth * 0.34, vesselWidth, vesselHeight, fill, liquid,
      { label: vesselLabel || 'Round-bottom flask' });
  } else {
    geom = drawBeaker(ctx, cx, topY, vesselWidth, vesselHeight, fill, liquid,
      { label: vesselLabel || 'Beaker' });
  }
  return { ...geom, cx, topY, gaugeY, burnerBaseY, bot: gaugeY - 3, heat: heatAt(cx - vesselWidth / 2, cx + vesselWidth / 2, gaugeY - 3) };
}

/* ------------------------------------------------------------------ *
 *  Ray optics — drawing the light, not just the glass
 * ------------------------------------------------------------------ *
 * An optics experiment with no rays on the bench is a photograph of some
 * apparatus. What the student is actually asked to understand is where
 * the light goes, so the light is what gets drawn: the standard
 * construction rays, refracted at the element, converging to the image,
 * and the image itself landing on the screen — sharp only where the
 * lens equation says it is.
 */

/**
 * Trace and draw a thin-lens (or spherical-mirror) construction.
 *
 * Distances are in centimetres and converted with `scale`; the geometry
 * comes from 1/v − 1/u = 1/f, so the picture is the equation.
 *
 * @param opts.f          focal length, cm (positive converging)
 * @param opts.u          object distance, cm (positive, measured from the element)
 * @param opts.hObj       object height, cm
 * @param opts.screenU    where the screen stands, cm from the element
 */
export function drawRayDiagram(ctx, elemX, axisY, opts = {}) {
  const {
    f = 15, u = 40, hObj = 2, scale = 2.2, screenU = null,
    mirror = false, aperture = 56, showConstruction = true,
  } = opts;
  const th = T();

  const uPx = u * scale;
  const hPx = Math.max(34, hObj * scale * 5.0);       // object drawn to a legible height
  const objX = elemX - uPx;
  const objTop = axisY - hPx;

  // Thin-lens equation. v > 0 means a real image on the far side.
  const v = (u === f) ? Infinity : (u * f) / (u - f);
  const m = Number.isFinite(v) ? -v / u : NaN;         // linear magnification
  const vPx = Number.isFinite(v) ? v * scale : Infinity;
  const imgX = mirror ? elemX - vPx : elemX + vPx;
  const imgTop = axisY + hPx * (Number.isFinite(m) ? m : 0);

  const fPx = f * scale;
  ctx.save();

  // Principal axis and the focal points, which the construction needs.
  dashedLine(ctx, elemX - uPx - 60, axisY, elemX + Math.min(400, Math.abs(vPx) + 80), axisY, rgba(th.dim, 0.8));
  for (const sgn of [-1, 1]) {
    const fx = elemX + sgn * fPx;
    ctx.fillStyle = th.accent2;
    ctx.beginPath(); ctx.arc(fx, axisY, 3, 0, Math.PI * 2); ctx.fill();
    label(ctx, fx, axisY + 4, sgn < 0 ? 'F' : "F'", { anchor: 'below', size: 11 });
  }

  // The object, as an upright arrow on the axis.
  arrow(ctx, objX, axisY, objX, objTop, th.accent, 2.2);

  if (showConstruction && Number.isFinite(v)) {
    const rayCol = rgba('#f0a23d', 0.95);
    const half = aperture / 2;
    ctx.lineWidth = 1.5;

    // 1. Parallel to the axis, then through the far focus.
    ctx.strokeStyle = rayCol;
    ctx.beginPath();
    ctx.moveTo(objX, objTop);
    ctx.lineTo(elemX, objTop);
    ctx.lineTo(imgX, imgTop);
    ctx.stroke();

    // 2. Straight through the optical centre, undeviated.
    ctx.strokeStyle = rgba('#e5433d', 0.9);
    ctx.beginPath();
    ctx.moveTo(objX, objTop);
    ctx.lineTo(imgX, imgTop);
    ctx.stroke();

    // 3. Through the near focus, emerging parallel to the axis.
    const nearF = elemX - fPx;
    if (objX < nearF) {
      const tAtLens = (elemX - objX) / (nearF - objX);
      const yAtLens = objTop + (axisY - objTop) * tAtLens;
      if (Math.abs(yAtLens - axisY) < half) {
        ctx.strokeStyle = rgba('#3fae5a', 0.9);
        ctx.beginPath();
        ctx.moveTo(objX, objTop);
        ctx.lineTo(elemX, yAtLens);
        ctx.lineTo(imgX + (imgX > elemX ? 60 : -60), yAtLens);
        ctx.stroke();
      }
    }

    // The image itself, inverted when m is negative — the whole point.
    arrow(ctx, imgX, axisY, imgX, imgTop, '#c02626', 2.6);
    label(ctx, imgX, imgTop + (imgTop > axisY ? 8 : -8),
      `${v > 0 ? 'Real' : 'Virtual'}, ${m < 0 ? 'inverted' : 'erect'} · v = ${v.toFixed(1)} cm`,
      { anchor: imgTop > axisY ? 'below' : 'above', size: 11, bold: true });
  } else if (!Number.isFinite(v)) {
    label(ctx, elemX + 40, axisY - 40, 'Object at F — emergent rays parallel, no image', { anchor: 'right', color: '#8a5a00' });
  }
  ctx.restore();

  return { objX, objTop, hPx, v, m, imgX, imgTop, vPx };
}

/**
 * The patch of light actually falling on the screen. Only at the image
 * distance is it a sharp inverted image; move the screen off and it
 * spreads into the circle of confusion, which is exactly how a student
 * finds the focus — by looking for the sharpest patch, not by reading a
 * number off a slider.
 */
export function drawImageOnScreen(ctx, screenX, axisY, hgt, geom, opts = {}) {
  const { scale = 2.2 } = opts;
  if (!geom || !Number.isFinite(geom.v)) return 0;
  const missPx = Math.abs(screenX - geom.imgX);
  const sharp = clamp(1 - missPx / (26 * scale), 0, 1);
  const imgH = Math.abs(geom.hPx * (geom.m || 0));
  const blur = 2 + (1 - sharp) * 26;

  ctx.save();
  // The cone of light landing on the screen.
  const g = ctx.createRadialGradient(screenX, axisY - imgH / 2 * Math.sign(geom.m || -1), 0,
    screenX, axisY - imgH / 2 * Math.sign(geom.m || -1), imgH / 2 + blur);
  g.addColorStop(0, rgba('#ffe9b0', 0.85 * (0.35 + 0.65 * sharp)));
  g.addColorStop(0.6, rgba('#ffcf70', 0.4 * (0.3 + 0.7 * sharp)));
  g.addColorStop(1, rgba('#ffbb50', 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(screenX, axisY - (imgH / 2) * Math.sign(geom.m || -1) * -1,
    4 + blur * 0.5, imgH / 2 + blur, 0, 0, Math.PI * 2);
  ctx.fill();

  // The inverted image, resolved only when the screen is at v.
  if (sharp > 0.12) {
    ctx.globalAlpha = sharp;
    arrow(ctx, screenX, axisY, screenX, axisY + imgH * Math.sign(geom.m < 0 ? 1 : -1), '#b03018', 2.4);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  label(ctx, screenX, axisY + hgt * 0.5,
    sharp > 0.9 ? 'Sharp image' : sharp > 0.3 ? 'Nearly focused' : 'Blurred — move the screen',
    { anchor: 'below', size: 11, color: sharp > 0.9 ? '#0d7a52' : undefined });
  return sharp;
}
