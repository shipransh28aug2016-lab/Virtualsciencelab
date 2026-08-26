/**
 * Apparatus renderers — ray optics.
 */
import {
  label, drawOpticalBench, drawUpright, drawConvexLens, drawConcaveLens, drawConcaveMirror,
  drawConvexMirror, drawScreen, drawCandle, drawPrism, drawSlab, drawDial, theme,
} from './apparatus.js';

function benchScene(ctx, w, h) {
  const y = h - 60;
  drawOpticalBench(ctx, 30, w - 30, y);
  return y;
}

export function convexLens(ctx, w, h, state, inputs) {
  const y = benchScene(ctx, w, h);
  const cx = w / 2;
  drawCandle(ctx, 60, y, 40);
  drawConvexLens(ctx, cx, y - 40, 55, { axis: true, axisLen: w / 2 - 40 });
  const v = state?.v;
  const screenX = Number.isFinite(v) ? Math.min(w - 60, cx + v * 2.2) : w - 90;
  drawScreen(ctx, screenX, y, 80, { label: Number.isFinite(v) ? 'Screen (sharp image)' : 'Screen (no real image)' });
}
export function concaveMirror(ctx, w, h, state, inputs) {
  const y = benchScene(ctx, w, h);
  const mirrorX = w - 90;
  drawCandle(ctx, 60, y, 40);
  drawConcaveMirror(ctx, mirrorX, y - 40, 60);
  const v = state?.v;
  if (Number.isFinite(v)) drawScreen(ctx, Math.max(70, mirrorX - v * 2.2), y, 80, { label: 'Screen' });
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
