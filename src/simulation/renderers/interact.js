/**
 * Direct manipulation of apparatus on the canvas.
 *
 * A virtual lab where the only way to move anything is a slider in a side
 * panel is a diagram with knobs bolted on. Here every piece of apparatus a
 * primitive draws also registers the rectangle it occupies, so the student
 * can point at it and be told what it is called, and — where moving it
 * means something physically — take hold of it and move it.
 *
 * The crucial rule: **dragging never sets a pixel position**. A handle is
 * declared against a real model variable and an axis calibrated in that
 * variable's own units, so dragging the pendulum bob down does not "make
 * the string look longer", it sets L in centimetres, and the model
 * recomputes T = 2π√(L/g) from the new L like it would from the slider.
 * Manipulation and the physics can therefore never disagree.
 *
 * Regions are rebuilt every frame (the scene is redrawn every frame), so
 * nothing here holds a stale coordinate.
 */

import { theme, rgba, clamp, lerp } from './realism.js';

/* ------------------------------------------------------------------ *
 *  Per-frame region registry
 * ------------------------------------------------------------------ */

let regions = [];
let hover = null;       // region currently under the pointer
let active = null;      // region being dragged
let pointer = { x: -1, y: -1, inside: false };
let onChange = null;    // (varId, value) => void, supplied by the app
let enabled = true;
let xform = { k: 1, dx: 0, dy: 0 };

/**
 * The scene is drawn through a fit transform, so regions are registered in
 * scene coordinates while the pointer arrives in canvas coordinates. One
 * place converts between them; if this were done at each call site a
 * resize would silently leave the highlight ring off the apparatus.
 */
export function setTransform(t) { xform = t || { k: 1, dx: 0, dy: 0 }; }

const toScreen = (r) => ({
  ...r,
  x: r.x * xform.k + xform.dx, y: r.y * xform.k + xform.dy,
  w: r.w * xform.k, h: r.h * xform.k,
  p0: r.p0 === undefined ? undefined : (r.axis === 'x' ? r.p0 * xform.k + xform.dx : r.p0 * xform.k + xform.dy),
  p1: r.p1 === undefined ? undefined : (r.axis === 'x' ? r.p1 * xform.k + xform.dx : r.p1 * xform.k + xform.dy),
});

/** Called once per frame before anything is drawn. */
export function beginFrame() {
  regions = [];
}

/**
 * Register a piece of apparatus. `name` is its correct scientific name —
 * the same string that is printed beside it on the bench.
 */
export function apparatus(name, x, y, w, h, opts = {}) {
  if (!name) return;
  regions.push({
    kind: 'apparatus', name, x, y, w, h,
    note: opts.note || '',
    round: opts.round ?? 8,
  });
}

/**
 * Register a draggable handle bound to a model variable.
 *
 * @param name  what the student is taking hold of
 * @param box   {x,y,w,h} grab area in canvas pixels
 * @param bind  {varId, axis:'x'|'y', p0, p1, v0, v1, unit}
 *              p0..p1 are the pixel positions of the ends of travel and
 *              v0..v1 the variable's value at each end, so the mapping is
 *              exact in the variable's own units.
 */
export function handle(name, box, bind) {
  if (!bind || !bind.varId) return;
  regions.push({
    kind: 'handle', name,
    x: box.x, y: box.y, w: box.w, h: box.h,
    round: box.round ?? 999,
    ...bind,
  });
}

/** Value the given handle would take for the current pointer position. */
function valueAt(r, px, py) {
  const p = r.axis === 'x' ? px : py;
  const t = (p - r.p0) / ((r.p1 - r.p0) || 1);
  return lerp(r.v0, r.v1, clamp(t, 0, 1));
}

function hitTest(px, py) {
  // Later registrations sit on top, so search backwards.
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = toScreen(regions[i]);
    const pad = r.kind === 'handle' ? 6 : 0;   // handles are easier to grab
    if (px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad) return r;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 *  Pointer wiring
 * ------------------------------------------------------------------ */

/**
 * Attach pointer handling to the experiment canvas.
 *
 * @param canvas   the <canvas> element
 * @param change   (varId, value) => void — routed into the app's inputs so
 *                 the model, the readouts, the graph and the theory all
 *                 update exactly as they do for a slider change.
 */
export function attach(canvas, change) {
  if (!canvas || canvas.dataset.interactWired) return;
  canvas.dataset.interactWired = '1';
  onChange = change;

  const local = (e) => {
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width, height: canvas.height };
    const scale = r.width ? canvas.clientWidth / r.width : 1;
    return { x: (e.clientX - r.left) * scale, y: (e.clientY - r.top) * scale };
  };

  const cursorFor = (r) => (!r ? 'default'
    : r.kind === 'handle' ? (r.axis === 'x' ? 'ew-resize' : 'ns-resize')
      : 'help');

  const move = (e) => {
    if (!enabled) return;
    const p = local(e);
    pointer = { x: p.x, y: p.y, inside: true };
    if (active) {
      const v = valueAt(active, p.x, p.y);
      if (onChange) onChange(active.varId, v);
      if (e.cancelable) e.preventDefault();
      return;
    }
    hover = hitTest(p.x, p.y);
    canvas.style.cursor = cursorFor(hover);
  };

  const down = (e) => {
    if (!enabled) return;
    const p = local(e);
    const r = hitTest(p.x, p.y);
    if (r && r.kind === 'handle') {
      active = r;
      canvas.style.cursor = 'grabbing';
      if (canvas.setPointerCapture && e.pointerId !== undefined) {
        try { canvas.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
      }
      if (onChange) onChange(r.varId, valueAt(r, p.x, p.y));
      if (e.cancelable) e.preventDefault();
    }
  };

  const up = () => {
    // Releasing a handle you are still holding must not turn the cursor into
    // the generic "what is this" pointer — you can still drag it again.
    if (active) hover = active;
    active = null;
    canvas.style.cursor = cursorFor(hover);
  };
  const leave = () => { pointer.inside = false; hover = null; active = null; canvas.style.cursor = 'default'; };

  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', leave);
  // Touch: stop the page scrolling while a student drags an apparatus.
  canvas.addEventListener('touchmove', (e) => { if (active && e.cancelable) e.preventDefault(); }, { passive: false });
}

/** Suspend manipulation (e.g. while a timed run is in progress). */
export function setEnabled(v) { enabled = !!v; if (!v) { active = null; hover = null; } }

/** True while the student is actually dragging something. */
export function isDragging() { return !!active; }

/* ------------------------------------------------------------------ *
 *  Overlay — drawn last, on top of the finished scene
 * ------------------------------------------------------------------ */

/**
 * Highlight what is under the pointer and name it. Draggable apparatus
 * additionally shows its axis of travel, so a student can see at a glance
 * which pieces of the bench they are allowed to move.
 */
export function drawOverlay(ctx, w, h) {
  const T = theme();

  // A quiet hint that the scene is manipulable at all.
  const hasHandles = regions.some((r) => r.kind === 'handle');
  if (hasHandles && !hover && !active) {
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = rgba(T.dim, 0.9);
    ctx.fillText('Drag the highlighted apparatus to set it up', w - 10, h - 8);
    ctx.restore();
  }

  const r = active || hover;
  if (!r) return;

  ctx.save();
  // Selection ring.
  const pad = 4;
  ctx.strokeStyle = r.kind === 'handle' ? T.accent : rgba(T.accent, 0.65);
  ctx.lineWidth = r.kind === 'handle' ? 2 : 1.4;
  ctx.setLineDash(r.kind === 'handle' ? [] : [4, 3]);
  ctx.beginPath();
  const rad = Math.min(r.round ?? 8, r.w / 2, r.h / 2);
  if (ctx.roundRect) ctx.roundRect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, rad);
  else ctx.rect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = rgba(T.accent, 0.08);
  ctx.fill();

  // Axis of travel for a handle.
  if (r.kind === 'handle') {
    ctx.strokeStyle = rgba(T.accent, 0.4);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    if (r.axis === 'x') {
      const y = r.y + r.h / 2;
      ctx.moveTo(r.p0, y); ctx.lineTo(r.p1, y);
    } else {
      const x = r.x + r.w / 2;
      ctx.moveTo(x, r.p0); ctx.lineTo(x, r.p1);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Name plate, kept inside the canvas.
  const text = r.kind === 'handle' && r.unit
    ? `${r.name} · drag to set ${r.unit}`
    : r.note ? `${r.name} — ${r.note}` : r.name;
  ctx.font = '700 12px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  const bw = tw + 18;
  const bh = 24;
  let bx = clamp(r.x + r.w / 2 - bw / 2, 6, Math.max(6, w - bw - 6));
  let by = r.y - pad - bh - 6;
  if (by < 6) by = Math.min(h - bh - 6, r.y + r.h + pad + 6);

  ctx.fillStyle = T.isDark ? 'rgba(10,18,32,0.93)' : 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = rgba(T.accent, 0.55);
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 7); else ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = T.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);
  ctx.restore();
}
