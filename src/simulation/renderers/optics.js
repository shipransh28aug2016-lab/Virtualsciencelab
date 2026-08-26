/**
 * Apparatus renderers — ray optics.
 */
import {
  label, drawOpticalBench, drawUpright, drawConvexLens, drawConcaveLens, drawConcaveMirror,
  drawConvexMirror, drawScreen, drawCandle, drawPrism, drawSlab, drawDial, theme,
  drawRayDiagram, drawImageOnScreen,
} from './apparatus.js';

/* Pixels per centimetre along the optical bench. One constant, so the
   object, the image and the printed scale can never drift apart. */
const SCALE = 5.2;

/* The bench is laid out in scene space; the frame is fitted to it
   afterwards. The axis sits well above the bench so there is room for the
   rays, which are the actual subject of every one of these experiments. */
const BENCH_Y = 470;
const AXIS_Y = 230;

/**
 * The bench is cut to the experiment, not the other way round. A metre
 * rule drawn far wider than the apparatus standing on it forces the whole
 * scene to be scaled down to fit the rule — which is what left the rays
 * too small to read.
 */
function benchScene(ctx, w, h, x0 = 40, x1 = 640) {
  drawOpticalBench(ctx, x0 - 40, x1 + 40, BENCH_Y, { scaleMax: Math.round((x1 - x0 + 80) / SCALE) });
  return BENCH_Y;
}

/** Focal length declared by whichever element the student has mounted. */
function focalOf(inputs, fallback) {
  const id = inputs?.lens || inputs?.mirror || inputs?.element;
  const m = typeof id === 'string' && id.match(/(\d+)/);
  return m ? Number(m[1]) : (inputs?.focalLengthCm ?? fallback);
}

export function convexLens(ctx, w, h, state, inputs) {
  const lensX = 380;
  const u = inputs?.objectDistanceCm ?? 40;
  const f = focalOf(inputs, 15);
  const screenU0 = inputs?.screenPosCm ?? state?.screen ?? (Number.isFinite(state?.v) ? state.v : 24);
  benchScene(ctx, w, h, lensX - u * SCALE, lensX + Math.max(screenU0, 20) * SCALE);

  // The light path, computed from 1/v − 1/u = 1/f. Drawn first so the
  // apparatus sits on top of its own rays.
  const geom = drawRayDiagram(ctx, lensX, AXIS_Y, {
    f, u, hObj: inputs?.objectHeightCm ?? 2, scale: SCALE, aperture: 110,
  });

  // Object: a candle on an upright, at the distance the model is using.
  drawUpright(ctx, geom.objX, BENCH_Y, BENCH_Y - AXIS_Y);
  drawCandle(ctx, geom.objX, AXIS_Y, geom.hPx, {
    label: `Illuminated object · u = ${u.toFixed(1)} cm`,
    drag: { varId: 'objectDistanceCm', axis: 'x', unit: 'object distance u',
      p0: lensX, p1: lensX - 110 * SCALE, v0: 0, v1: 110 },
  });

  drawUpright(ctx, lensX, BENCH_Y, BENCH_Y - AXIS_Y);
  drawConvexLens(ctx, lensX, AXIS_Y, 72, { label: `Convex lens · f = ${f} cm`, bulge: 13 });

  // Screen where the student has actually put it.
  const screenU = screenU0;
  const screenX = lensX + screenU * SCALE;
  drawUpright(ctx, screenX, BENCH_Y, BENCH_Y - AXIS_Y - 60);
  const sharp = drawImageOnScreen(ctx, screenX, AXIS_Y, 120, geom, { scale: SCALE });
  drawScreen(ctx, screenX, AXIS_Y + 60, 120, {
    label: `Screen · ${screenU.toFixed(1)} cm`,
    drag: { varId: 'screenPosCm', axis: 'x', unit: 'screen position',
      p0: lensX, p1: lensX + 120 * SCALE, v0: 0, v1: 120 },
  });
  if (sharp > 0.9) label(ctx, (lensX + screenX) / 2, AXIS_Y - 150,
    `1/v − 1/u = 1/f   →   f = ${(1 / (1 / geom.v + 1 / u)).toFixed(1)} cm`,
    { anchor: 'above', bold: true, size: 13 });
}
export function concaveMirror(ctx, w, h, state, inputs) {
  const mirrorX = 700;
  const u = inputs?.objectDistanceCm ?? 30;
  const f = focalOf(inputs, 15);
  benchScene(ctx, w, h, mirrorX - u * SCALE, mirrorX);

  // A concave mirror forms its image back on the SAME side as the object,
  // so the construction is reflected about the mirror.
  const geom = drawRayDiagram(ctx, mirrorX, AXIS_Y, {
    f, u, hObj: inputs?.objectHeightCm ?? 2, scale: SCALE, mirror: true, aperture: 120,
  });

  drawUpright(ctx, geom.objX, BENCH_Y, BENCH_Y - AXIS_Y);
  drawCandle(ctx, geom.objX, AXIS_Y, geom.hPx, {
    label: `Illuminated object · u = ${u.toFixed(1)} cm`,
    drag: { varId: 'objectDistanceCm', axis: 'x', unit: 'object distance u',
      p0: mirrorX, p1: mirrorX - 80 * SCALE, v0: 0, v1: 80 },
  });

  drawUpright(ctx, mirrorX, BENCH_Y, BENCH_Y - AXIS_Y);
  drawConcaveMirror(ctx, mirrorX, AXIS_Y, 72, { label: `Concave mirror · f = ${f} cm` });

  const v = state?.v;
  if (Number.isFinite(v)) {
    const sx = mirrorX - v * SCALE;
    drawUpright(ctx, sx, BENCH_Y, BENCH_Y - AXIS_Y - 60);
    drawScreen(ctx, sx, AXIS_Y + 60, 120, { label: `Screen · v = ${v.toFixed(1)} cm` });
    drawImageOnScreen(ctx, sx, AXIS_Y, 120, geom, { scale: SCALE });
  }
}
export function auxiliaryLens(ctx, w, h, state, inputs) {
  const y = benchScene(ctx, w, h);
  drawCandle(ctx, 60, y, 40);
  drawConvexLens(ctx, w / 2 - 60, y - 40, 50, { label: 'Auxiliary convex lens' });
  if (inputs?.mirror !== undefined || inputs?.element === undefined) {
    drawConvexMirror(ctx, w - 90, y - 40, 55);
  }
  if (inputs?.element) {
    ctx.save(); ctx.fillStyle = '#8ea0b8'; ctx.strokeStyle = theme().stroke;
    ctx.fillRect(w - 110, y - 60, 8, 40); ctx.restore();
    label(ctx, w - 106, y - 60, 'Element under test', { anchor: 'above' });
  }
}
export function refractiveIndex(ctx, w, h, state, inputs) {
  const y = h / 2;
  if (inputs?.method === 'concaveMirror') {
    drawConcaveMirror(ctx, w / 2 + 40, y, 60);
    ctx.save(); ctx.fillStyle = theme().liquid; ctx.globalAlpha = 0.5; ctx.fillRect(w / 2 - 40, y - 10, 80, 20); ctx.globalAlpha = 1; ctx.restore();
    label(ctx, w / 2, y + 12, 'Thin liquid layer', { anchor: 'below' });
  } else if (inputs?.method === 'liquidLens') {
    drawConvexLens(ctx, w / 2, y - 30, 45, { label: 'Plano-convex lens' });
    ctx.save(); ctx.fillStyle = theme().liquid; ctx.globalAlpha = 0.5; ctx.fillRect(w / 2 - 45, y - 4, 90, 12); ctx.globalAlpha = 1; ctx.restore();
    label(ctx, w / 2, y + 8, 'Liquid film on plane mirror', { anchor: 'below' });
  } else {
    drawSlab(ctx, w / 2 - 60, y - 50, 120, 100, { label: 'Glass slab' });
    label(ctx, w / 2, y - 70, 'Travelling microscope above', { anchor: 'above' });
  }
}
export function prismDeviation(ctx, w, h, state, inputs) {
  const cx = w / 2, cy = h / 2;
  drawPrism(ctx, cx, cy - 20, 80, { label: 'Equilateral prism' });
  const i = ((inputs?.incidenceDeg ?? 50) * Math.PI) / 180;
  ctx.save(); ctx.strokeStyle = theme().accent; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(40, cy - 20 - 80 * Math.tan(i - 0.6)); ctx.lineTo(cx - 40, cy + 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 40, cy + 20); ctx.lineTo(w - 40, cy - 20 + (state?.deviation ?? 0) * 1.2); ctx.stroke();
  ctx.restore();
  label(ctx, 40, cy - 20 - 80 * Math.tan(i - 0.6), 'Incident ray', { anchor: 'above', bg: false });
  label(ctx, w - 40, cy - 20 + (state?.deviation ?? 0) * 1.2, 'Emergent ray', { anchor: 'above', bg: false });
}
export function lateralDeviation(ctx, w, h, state, inputs) {
  const cx = w / 2, cy = h / 2;
  drawSlab(ctx, cx - 60, cy - 60, 120, 120, { label: 'Glass slab' });
  const i = ((inputs?.incidenceDeg ?? 45) * Math.PI) / 180;
  ctx.save(); ctx.strokeStyle = theme().accent; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(30, cy - 60 - 60 * Math.tan(i)); ctx.lineTo(cx - 60, cy - 60); ctx.stroke();
  const shift = (state?.shiftMm ?? 0) / 3;
  ctx.beginPath(); ctx.moveTo(cx + 60, cy + 60); ctx.lineTo(w - 30, cy + 60 + (w - 30 - cx - 60) * Math.tan(i) + shift); ctx.stroke();
  ctx.restore();
  label(ctx, w - 30, cy + 60, `shift ≈ ${(state?.shiftMm ?? 0).toFixed(1)} mm`, { anchor: 'right', bg: false });
}
export function singleSlitDiffraction(ctx, w, h, state, inputs) {
  const cx = w / 3;
  ctx.save(); ctx.fillStyle = '#333'; ctx.fillRect(cx - 4, 20, 8, h - 100); ctx.fillRect(cx - 4, h / 2 + 6, 8, h - 100); ctx.restore();
  label(ctx, cx, h - 80, 'Slit', { anchor: 'below' });
  const screenX = w - 60;
  ctx.save();
  const wpx = Math.min(120, (state?.pending ? 20 : (state?.width ?? 40)));
  const centralW = 30;
  ctx.fillStyle = theme().accent; ctx.globalAlpha = 0.6;
  ctx.fillRect(screenX - 3, h / 2 - centralW / 2, 6, centralW);
  ctx.globalAlpha = 0.25;
  ctx.fillRect(screenX - 3, h / 2 - centralW, 6, centralW / 2 - 4);
  ctx.fillRect(screenX - 3, h / 2 + centralW / 2 + 4, 6, centralW / 2 - 4);
  ctx.globalAlpha = 1; ctx.restore();
  label(ctx, screenX, h / 2 + centralW, 'Screen: diffraction pattern', { anchor: 'below' });
  ctx.save(); ctx.strokeStyle = theme().dim; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, h / 2); ctx.lineTo(screenX, h / 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}
export function imageFormation(ctx, w, h, state, inputs) {
  const y = benchScene(ctx, w, h);
  const cx = w / 2;
  drawCandle(ctx, 60, y, 40);
  if (inputs?.element === 'mirror') drawConcaveMirror(ctx, w - 90, y - 40, 55);
  else drawConvexLens(ctx, cx, y - 40, 50, { label: 'Convex lens' });
  const v = state?.imageDistanceCm ?? state?.v;
  if (Number.isFinite(v)) {
    const sx = inputs?.element === 'mirror' ? Math.max(80, w - 90 - v * 2) : Math.min(w - 60, cx + v * 2);
    drawScreen(ctx, sx, y, 80, { label: 'Screen' });
  }
}
export function lensCombination(ctx, w, h, state, inputs) {
  const y = benchScene(ctx, w, h);
  const cx = w / 2;
  drawCandle(ctx, 50, y, 40);
  drawConvexLens(ctx, cx - 20, y - 40, 45, { label: 'Lens A' });
  drawConvexLens(ctx, cx + 20, y - 40, 45, { label: 'Lens B' });
  label(ctx, cx, y - 100, `Combined F ≈ ${(state?.combinedFocalCm ?? '—')} cm`, { anchor: 'above', bg: false });
}
export function pnDiode(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, cy = h / 2 - 20;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 20, cy - 14); ctx.lineTo(cx - 20, cy + 14); ctx.lineTo(cx + 14, cy); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 14, cy - 14); ctx.lineTo(cx + 14, cy + 14); ctx.stroke();
  ctx.restore();
  label(ctx, cx, cy + 20, `${inputs?.diode || 'si'} diode, ${inputs?.bias || 'forward'} bias`, { anchor: 'below' });
  drawDial(ctx, cx - 110, cy, 30, (state?.currentA ?? 0), { label: 'Milliammeter' });
  drawDial(ctx, cx + 110, cy, 30, (inputs?.supplyV ?? 0) / 6, { label: 'Voltmeter' });
}

export const RENDERERS = {
  'convex-lens': convexLens,
  'concave-mirror': concaveMirror,
  'auxiliary-lens': auxiliaryLens,
  'refractive-index': refractiveIndex,
  'prism-deviation': prismDeviation,
  'lateral-deviation': lateralDeviation,
  'single-slit-diffraction': singleSlitDiffraction,
  'image-formation': imageFormation,
  'lens-combination': lensCombination,
  'pn-diode': pnDiode,
};
export default RENDERERS;
