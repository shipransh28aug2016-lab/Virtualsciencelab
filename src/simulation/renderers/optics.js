/**
 * Apparatus renderers — ray optics.
 */
import {
  label, drawOpticalBench, drawUpright, drawConvexLens, drawConcaveLens, drawConcaveMirror, drawConvexMirror, drawScreen, drawCandle, drawPrism, drawSlab, drawDial, theme, drawRayDiagram, drawImageOnScreen, dashedLine, brushedMetal, chrome, contactShadow, noteBounds,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp } from './realism.js';

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
  const th = theme();
  const cx = 380, baseY = 400;

  /* Real and apparent depth. The mark under the slab appears RAISED by
     t(1 - 1/n); the microscope is focused first on the mark, then on the
     mark through the slab, and the difference gives n. Both positions are
     drawn, because the whole measurement is the gap between them. */
  const t = (inputs?.thicknessCm ?? 3) * 34;
  const apparent = clamp((state?.apparent ?? 0) * 34, 0, t);

  drawSlab(ctx, cx - 130, baseY - t, 260, t, { label: `Glass slab · t = ${(inputs?.thicknessCm ?? 3).toFixed(1)} cm` });

  // The ink mark on the paper under it.
  ctx.save();
  ctx.strokeStyle = '#1a2333'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12, baseY - 3); ctx.lineTo(cx + 12, baseY - 3);
  ctx.moveTo(cx, baseY - 15); ctx.lineTo(cx, baseY + 9);
  ctx.stroke();
  ctx.restore();
  label(ctx, cx - 140, baseY, 'Ink cross on paper', { anchor: 'left', size: 11 });

  // Where it appears to be, seen through the slab.
  const appY = baseY - (t - apparent);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12, appY); ctx.lineTo(cx + 12, appY);
  ctx.moveTo(cx, appY - 12); ctx.lineTo(cx, appY + 12);
  ctx.stroke();
  ctx.restore();
  label(ctx, cx + 16, appY, 'Apparent position (raised)', { anchor: 'right', size: 11, color: '#c02626' });

  // The travelling microscope above.
  ctx.save();
  brushedMetal(ctx, cx + 190, baseY - 300, 14, 300, { axis: 'v' });
  brushedMetal(ctx, cx - 40, appY - 150, 240, 22, { axis: 'h' });
  ctx.fillStyle = shade(th.metal, -0.2);
  ctx.beginPath(); ctx.ellipse(cx, appY - 132, 22, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  label(ctx, cx - 44, appY - 140, 'Travelling microscope', { anchor: 'left' });

  // The shift being measured.
  ctx.save();
  ctx.strokeStyle = '#0d7a52'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cx - 170, baseY - 3); ctx.lineTo(cx - 170, appY); ctx.stroke();
  ctx.restore();
  label(ctx, cx - 174, (baseY + appY) / 2,
    `Shift = t(1 − 1/n)`, { anchor: 'left', bold: true, color: '#0d7a52' });
  label(ctx, cx, baseY - t - 70,
    state?.focus ? 'Focused — take the microscope reading' : 'Focusing…',
    { anchor: 'above', bold: true, color: state?.focus ? '#0d7a52' : '#8a5a00' });
}
export function prismDeviation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, cy = 260, size = 90;
  const iDeg = state?.incidence ?? inputs?.incidenceDeg ?? 30;
  const dDeg = state?.deviation ?? 0;

  drawPrism(ctx, cx, cy, size, { label: `Glass prism (A = ${inputs?.angleA ?? 60}°)` });

  /* Light entering the prism is refracted at both faces and comes out
     deviated. As the prism is rotated the deviation falls to a minimum and
     rises again -- the turning point, at which the ray passes
     symmetrically, is what the experiment is looking for. */
  const i = iDeg * Math.PI / 180;
  const entry = { x: cx - size * 0.52, y: cy - 6 };
  const inLen = 210;
  ctx.save();
  ctx.strokeStyle = '#e07a1f'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(entry.x - inLen * Math.cos(i * 0.5), entry.y - inLen * Math.sin(i * 0.5));
  ctx.lineTo(entry.x, entry.y);
  const exit = { x: cx + size * 0.52, y: cy + 6 };
  ctx.lineTo(exit.x, exit.y);
  const out = (i * 0.5) + dDeg * Math.PI / 180;
  ctx.lineTo(exit.x + inLen * Math.cos(out), exit.y + inLen * Math.sin(out));
  ctx.stroke();
  // The undeviated continuation, so the deviation angle has something to
  // be measured against.
  ctx.strokeStyle = rgba(th.dim, 0.8); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(entry.x, entry.y);
  ctx.lineTo(entry.x + (inLen + size) * Math.cos(i * 0.5), entry.y + (inLen + size) * Math.sin(i * 0.5));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Dispersion at the emergent face — a prism separates colours.
  const cols = ['#c02626', '#e07a1f', '#e3d02c', '#3fae5a', '#3d7ae5', '#7a3fc4'];
  ctx.save();
  cols.forEach((c, k) => {
    ctx.strokeStyle = rgba(c, 0.75);
    ctx.lineWidth = 1.6;
    const a = out + (k - 2.5) * 0.012;
    ctx.beginPath();
    ctx.moveTo(exit.x, exit.y);
    ctx.lineTo(exit.x + inLen * Math.cos(a), exit.y + inLen * Math.sin(a));
    ctx.stroke();
  });
  ctx.restore();

  label(ctx, cx, cy - size - 60,
    state?.atMinimum ? `MINIMUM DEVIATION — D = ${dDeg.toFixed(1)}° at i = ${iDeg.toFixed(1)}°`
      : `i = ${iDeg.toFixed(1)}° · D = ${dDeg.toFixed(1)}° — rotate to find the minimum`,
    { anchor: 'above', bold: true, color: state?.atMinimum ? '#0d7a52' : '#8a5a00' });
}
export function lateralDeviation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, cy = 250;
  const tW = 180, tH = 110;
  // The slab.
  drawSlab(ctx, cx - tW / 2, cy - tH / 2, tW, tH, { label: 'Rectangular glass slab' });

  /* A ray through a parallel-sided slab emerges PARALLEL to the incident
     ray but displaced sideways. Drawing the undeviated continuation as a
     dashed line beside the emergent ray is what makes the lateral shift
     visible rather than merely stated. */
  const i = (inputs?.incidenceDeg ?? 40) * Math.PI / 180;
  const n = inputs?.refractiveIndex ?? 1.5;
  const r = Math.asin(Math.sin(i) / n);
  const entryX = cx - tW / 2, entryY = cy - 20;
  const inLen = 190;
  const sx = entryX - inLen * Math.cos(i), sy = entryY - inLen * Math.sin(i);

  ctx.save();
  ctx.strokeStyle = '#e07a1f'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(entryX, entryY); ctx.stroke();
  // Inside the slab, bent towards the normal.
  const exitY = entryY + tW * Math.tan(r);
  ctx.beginPath(); ctx.moveTo(entryX, entryY); ctx.lineTo(entryX + tW, exitY); ctx.stroke();
  // Emergent ray, parallel to the incident one.
  ctx.beginPath();
  ctx.moveTo(entryX + tW, exitY);
  ctx.lineTo(entryX + tW + inLen * Math.cos(i), exitY + inLen * Math.sin(i));
  ctx.stroke();
  // The undeviated path, for comparison.
  ctx.strokeStyle = rgba(th.dim, 0.85); ctx.setLineDash([5, 4]); ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(entryX, entryY);
  ctx.lineTo(entryX + tW + inLen * Math.cos(i), entryY + (tW + inLen * Math.cos(i)) * Math.tan(i));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Normals at both faces.
  for (const x of [entryX, entryX + tW]) {
    dashedLine(ctx, x - 60, x === entryX ? entryY : exitY, x + 60, x === entryX ? entryY : exitY, rgba(th.dim, 0.7));
  }
  label(ctx, sx, sy, 'Incident ray', { anchor: 'left', size: 11, color: '#e07a1f' });

  // The shift itself.
  const shiftPx = clamp((state?.shift ?? 0) * 4, 0, 90);
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.8;
  const ex = entryX + tW + 60;
  ctx.beginPath();
  ctx.moveTo(ex, exitY + 60 * Math.tan(i));
  ctx.lineTo(ex, exitY + 60 * Math.tan(i) - shiftPx);
  ctx.stroke();
  ctx.restore();
  label(ctx, ex + 6, exitY + 60 * Math.tan(i) - shiftPx / 2,
    `Lateral shift ${(state?.shift ?? 0).toFixed(2)} mm`, { anchor: 'right', bold: true, color: '#c02626' });
  label(ctx, cx, cy - tH / 2 - 70,
    `i = ${(inputs?.incidenceDeg ?? 40).toFixed(0)}° · r = ${(r * 180 / Math.PI).toFixed(1)}° — the emergent ray is parallel to the incident ray`,
    { anchor: 'above', bold: true });
}
export function singleSlitDiffraction(ctx, w, h, state, inputs) {
  const th = theme();
  const slitX = 220, screenX = 700, axisY = 250;

  // Source and slit.
  ctx.save();
  ctx.fillStyle = '#c02626';
  ctx.beginPath(); ctx.arc(90, axisY, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  bloomAt(ctx, 90, axisY);
  label(ctx, 90, axisY - 12, inputs?.source || 'Monochromatic source', { anchor: 'above' });

  const slitGap = clamp(30 - (inputs?.slitMm ?? 0.2) * 40, 5, 26);
  ctx.save();
  ctx.fillStyle = shade(th.metal, -0.35);
  ctx.fillRect(slitX - 6, axisY - 140, 12, 140 - slitGap / 2);
  ctx.fillRect(slitX - 6, axisY + slitGap / 2, 12, 140 - slitGap / 2);
  ctx.restore();
  label(ctx, slitX, axisY - 146, `Single slit · a = ${(inputs?.slitMm ?? 0.2).toFixed(2)} mm`, { anchor: 'above' });

  // Screen.
  ctx.save();
  ctx.fillStyle = th.isDark ? '#0b111c' : '#141a25';
  ctx.fillRect(screenX - 6, axisY - 170, 12, 340);
  ctx.restore();
  label(ctx, screenX, axisY + 176, 'Screen', { anchor: 'below' });

  /* The pattern: a broad central maximum with much fainter minima either
     side, its width INVERSELY proportional to the slit width. That inverse
     relation is the whole experiment, so it is computed from the model's
     own central width rather than drawn to look pretty. */
  const cw = clamp((state?.width ?? 4) * 9, 20, 300);
  ctx.save();
  for (let dy = -168; dy <= 168; dy += 2) {
    const beta = (dy / cw) * Math.PI * 2;
    const I = beta === 0 ? 1 : (Math.sin(beta) / beta) ** 2;
    if (I < 0.004) continue;
    ctx.fillStyle = rgba('#ff3a2f', Math.min(1, I * 1.15));
    ctx.fillRect(screenX - 5, axisY + dy, 10, 2);
    // The pattern spilling into the space in front of the screen.
    ctx.fillStyle = rgba('#ff3a2f', Math.min(0.5, I * 0.35));
    ctx.fillRect(screenX - 26, axisY + dy, 20, 2);
  }
  ctx.restore();

  // Envelope of the beam from slit to screen.
  ctx.save();
  ctx.fillStyle = rgba('#ff6a4a', 0.1);
  ctx.beginPath();
  ctx.moveTo(slitX + 6, axisY - slitGap / 2);
  ctx.lineTo(screenX - 6, axisY - cw);
  ctx.lineTo(screenX - 6, axisY + cw);
  ctx.lineTo(slitX + 6, axisY + slitGap / 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = '#0d7a52'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(screenX + 20, axisY - cw); ctx.lineTo(screenX + 20, axisY + cw); ctx.stroke();
  ctx.restore();
  label(ctx, screenX + 24, axisY,
    `Central maximum ${(state?.width ?? 0).toFixed(2)} mm`, { anchor: 'right', bold: true, color: '#0d7a52' });
  label(ctx, 400, 70, 'Narrowing the slit WIDENS the central maximum', { anchor: 'above', size: 12 });
}

/** Small helper: a source glows. */
function bloomAt(ctx, x, y) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
  g.addColorStop(0, 'rgba(255,90,70,0.55)');
  g.addColorStop(1, 'rgba(255,90,70,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
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
