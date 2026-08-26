/**
 * Apparatus renderers — mechanics and measurement instruments (Section A,
 * plus the mechanics activities of Section B). Every renderer has the
 * signature (ctx, w, h, state, inputs) and draws a labelled bench, the way
 * a diagram in a lab manual would.
 */
import {
  label, bench, dashedLine, drawRuler, drawWeight, drawPendulumBob, drawSpring,
  drawDial, drawUpright, theme,
} from './apparatus.js';

/** A jaw-style instrument (vernier callipers / screw gauge) gripping a specimen. */
function drawJawInstrument(ctx, w, h, openingFrac, instrumentLabel, specimenLabel) {
  const cx = w / 2, cy = h / 2, gap = 30 + openingFrac * 120;
  const th = theme();
  ctx.save();
  ctx.strokeStyle = th.metal; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 90, cy - gap / 2); ctx.lineTo(cx - 20, cy - gap / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 90, cy + gap / 2); ctx.lineTo(cx - 20, cy + gap / 2); ctx.stroke();
  ctx.fillStyle = th.metal; ctx.fillRect(cx - 100, cy - gap / 2 - 40, 14, gap + 80);
  ctx.restore();
  if (gap < 160) {
    ctx.save(); ctx.fillStyle = '#c9a24a'; ctx.strokeStyle = th.stroke; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx - 45, cy, gap / 2 - 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    label(ctx, cx - 45, cy + gap / 2, specimenLabel, { anchor: 'below' });
  }
  label(ctx, cx - 55, cy - gap / 2 - 40, instrumentLabel, { anchor: 'above', bold: true });
}

export function vernierCallipers(ctx, w, h, state, inputs) {
  const frac = Math.max(0, Math.min(1, (inputs.jawOpening ?? 2) / 6));
  drawJawInstrument(ctx, w, h, frac, 'Vernier callipers', 'Specimen');
  label(ctx, w / 2 + 120, h / 2, `Main scale + vernier scale`, { anchor: 'right' });
}
export function screwGauge(ctx, w, h, state, inputs) {
  const frac = Math.max(0, Math.min(1, (inputs.thimble ?? 0.5) / 5));
  drawJawInstrument(ctx, w, h, frac, 'Screw gauge', 'Wire / sheet');
  label(ctx, w / 2 + 90, h / 2 - 60, 'Thimble (circular scale)', { anchor: 'right' });
  label(ctx, w / 2 - 110, h / 2 - 60, 'Ratchet', { anchor: 'left' });
}
export function irregularLamina(ctx, w, h, state, inputs) {
  const th = theme();
  ctx.save(); ctx.strokeStyle = th.stroke; ctx.lineWidth = 1;
  const ox = 40, oy = 40, gw = w - 80, gh = h - 120, n = 16;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(ox + (gw * i) / n, oy); ctx.lineTo(ox + (gw * i) / n, oy + gh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy + (gh * i) / n); ctx.lineTo(ox + gw, oy + (gh * i) / n); ctx.stroke();
  }
  ctx.fillStyle = th.accent; ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.moveTo(ox + gw * 0.3, oy + gh * 0.2);
  ctx.bezierCurveTo(ox + gw * 0.75, oy + gh * 0.1, ox + gw * 0.85, oy + gh * 0.55, ox + gw * 0.6, oy + gh * 0.8);
  ctx.bezierCurveTo(ox + gw * 0.35, oy + gh * 0.95, ox + gw * 0.15, oy + gh * 0.55, ox + gw * 0.3, oy + gh * 0.2);
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
  label(ctx, ox + gw / 2, oy + gh, 'Irregular lamina traced on graph paper', { anchor: 'below' });
  const frac = Math.max(0, Math.min(1, (inputs.thimble ?? 1.6) / 4));
  drawJawInstrument(ctx, w, h * 0.4, frac, 'Screw gauge', 'Lamina edge');
}
export function spherometer(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, baseY = h / 2 + 40;
  ctx.save(); ctx.strokeStyle = th.metal; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, baseY + 60, 60, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  [-1, 0, 1].forEach((k) => {
    const legX = cx + k * 40;
    ctx.beginPath(); ctx.moveTo(legX, baseY); ctx.lineTo(legX, baseY - 30); ctx.stroke();
  });
  const screwLen = 30 + (1 - Math.min(1, (inputs.screwTurns ?? 0) / 3)) * 20;
  ctx.strokeStyle = th.accent; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(cx, baseY - 30); ctx.lineTo(cx, baseY - screwLen); ctx.stroke();
  ctx.restore();
  label(ctx, cx, baseY - screwLen, 'Central screw', { anchor: 'above' });
  label(ctx, cx, baseY + 65, 'Spherical surface under test', { anchor: 'below' });
}
export function beamBalance(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, pivotY = h / 2 - 60;
  const angle = Math.max(-0.35, Math.min(0.35, ((state?.pointer ?? 0) / 10) * 0.3));
  ctx.save();
  ctx.strokeStyle = th.metal; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx, pivotY); ctx.lineTo(cx, pivotY + 120); ctx.stroke();
  ctx.translate(cx, pivotY); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(-110, 0); ctx.lineTo(110, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -6); ctx.strokeStyle = th.dim; ctx.lineWidth = 1.4; ctx.stroke();
  ['left', 'right'].forEach((side, i) => {
    const sx = i === 0 ? -110 : 110;
    ctx.strokeStyle = th.dim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx - 14, 24); ctx.moveTo(sx, 0); ctx.lineTo(sx + 14, 24); ctx.stroke();
    ctx.fillStyle = '#c9a24a'; ctx.fillRect(sx - 16, 24, 32, 4);
  });
  ctx.restore();
  label(ctx, cx, pivotY - 55, 'Pointer & scale', { anchor: 'above' });
  label(ctx, cx - 110, pivotY + 34, 'Left pan (body)', { anchor: 'below' });
  label(ctx, cx + 110, pivotY + 34, 'Right pan (weights)', { anchor: 'below' });
}
export function parallelogramLaw(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, cy = h / 2;
  const P = inputs.pGwt ?? 100, Q = inputs.qGwt ?? 100;
  const scale = 0.5;
  const angP = Math.PI * 0.78, angQ = Math.PI * 0.22;
  const px = cx + P * scale * Math.cos(angP), py = cy - P * scale * Math.sin(angP);
  const qx = cx + Q * scale * Math.cos(angQ), qy = cy - Q * scale * Math.sin(angQ);
  ctx.save(); ctx.strokeStyle = th.stroke; ctx.lineWidth = 2;
  [[px, py], [qx, qy]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = th.accent; ctx.stroke(); });
  ctx.strokeStyle = th.bad; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + 130); ctx.stroke();
  dashedLine(ctx, px, py, px + (qx - cx), py + (qy - cy));
  dashedLine(ctx, qx, qy, qx + (px - cx), qy + (py - cy));
  ctx.restore();
  label(ctx, px, py, `P = ${P} gwt`, { anchor: 'above' });
  label(ctx, qx, qy, `Q = ${Q} gwt`, { anchor: 'above' });
  label(ctx, cx, cy + 130, 'Unknown weight S', { anchor: 'below' });
  label(ctx, cx, cy, 'Knot', { anchor: 'left' });
}
export function simplePendulum(ctx, w, h, state, inputs) {
  const th = theme();
  const pivotX = w / 2, pivotY = 30;
  const lenPx = 20 + ((inputs.lengthCm ?? 60) / 150) * (h - 90);
  const angle = ((state?.angleDeg ?? inputs.amplitudeDeg ?? 8) * Math.PI) / 180;
  drawPendulumBob(ctx, pivotX, pivotY, lenPx, angle, { label: 'Bob' });
  label(ctx, pivotX, pivotY, 'Support / clamp', { anchor: 'above' });
  label(ctx, pivotX + 60, pivotY + lenPx / 2, `L = ${(inputs.lengthCm ?? 60).toFixed(0)} cm`, { anchor: 'right', bg: false });
  ctx.save(); ctx.fillStyle = th.muted; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Stop-clock: ${(state?.stopwatch ?? 0).toFixed(1)} s   Oscillations: ${state?.completedOscillations ?? 0}/${inputs.oscillations ?? 20}`, w / 2, h - 14);
  ctx.restore();
}
export function friction(ctx, w, h, state, inputs) {
  const th = theme();
  const tableY = h / 2 + 40;
  ctx.save(); ctx.fillStyle = th.wood; ctx.fillRect(30, tableY, w - 60, 14); ctx.restore();
  const blockW = inputs.face === 'narrow' ? 40 : 80, blockH = inputs.face === 'narrow' ? 44 : 26;
  const bx = w / 2 - 60;
  ctx.save(); ctx.fillStyle = '#b98a5a'; ctx.strokeStyle = th.stroke;
  ctx.fillRect(bx, tableY - blockH, blockW, blockH); ctx.strokeRect(bx, tableY - blockH, blockW, blockH); ctx.restore();
  label(ctx, bx + blockW / 2, tableY - blockH, 'Wooden block', { anchor: 'above' });
  ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx + blockW, tableY - blockH / 2); ctx.lineTo(w - 60, tableY - blockH / 2); ctx.stroke();
  ctx.restore();
  label(ctx, w - 60, tableY - blockH / 2, 'Pulley', { anchor: 'right' });
  drawWeight(ctx, w - 55, tableY - blockH / 2 + 10, { label: 'Pan + weights' });
  label(ctx, 30, tableY + 14, 'Horizontal table', { anchor: 'below' });
}
export function inclinedPlane(ctx, w, h, state, inputs) {
  const th = theme();
  const angle = ((inputs.angleDeg ?? 30) * Math.PI) / 180;
  const baseY = h - 50, baseX = 60, len = w - 160;
  ctx.save(); ctx.strokeStyle = th.wood; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(baseX + len * Math.cos(angle), baseY - len * Math.sin(angle)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(baseX + len, baseY); ctx.strokeStyle = th.dim; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  const rx = baseX + len * 0.55 * Math.cos(angle), ry = baseY - len * 0.55 * Math.sin(angle);
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath(); ctx.arc(rx, ry, 14, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, rx, ry, inputs.body === 'block' ? 'Sliding block' : 'Roller', { anchor: 'above' });
  label(ctx, baseX + len * 0.3, baseY - 8, `θ = ${(inputs.angleDeg ?? 30).toFixed(0)}°`, { anchor: 'above', bg: false });
  label(ctx, baseX + len / 2, baseY, 'Inclined plane', { anchor: 'below' });
}
export function youngsModulus(ctx, w, h, state, inputs) {
  const th = theme();
  const topY = 20, wireLen = h - 140;
  ctx.save(); ctx.fillStyle = th.metal; ctx.fillRect(w / 2 - 60, topY - 12, 120, 12); ctx.restore();
  ['A (experimental)', 'B (reference)'].forEach((lab, i) => {
    const wx = w / 2 + (i === 0 ? -25 : 25);
    ctx.save(); ctx.strokeStyle = th.metal; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(wx, topY); ctx.lineTo(wx, topY + wireLen); ctx.stroke(); ctx.restore();
    label(ctx, wx, topY, lab, { anchor: 'above', size: 10 });
  });
  drawWeight(ctx, w / 2 - 25, topY + wireLen, { label: `Load ${(inputs.loadKg ?? 0.5).toFixed(1)} kg` });
  label(ctx, w / 2 + 90, topY + wireLen * 0.5, 'Vernier scale (extension)', { anchor: 'right' });
}
export function helicalSpring(ctx, w, h, state, inputs) {
  const th = theme();
  const topY = 20, restLen = 90;
  const ext = (state?.x ?? 0) * 1000; // m -> mm-ish scaling for pixels
  const len = restLen + Math.min(160, ext * 4);
  ctx.save(); ctx.fillStyle = th.metal; ctx.fillRect(w / 2 - 40, topY - 12, 80, 12); ctx.restore();
  drawSpring(ctx, w / 2, topY, len, 12, 22, { label: 'Helical spring' });
  drawWeight(ctx, w / 2 - 12, topY + len, { label: `${inputs.loadG ?? 0} g` });
  label(ctx, w / 2 + 70, topY + len / 2, 'Pointer & scale', { anchor: 'right' });
}
export function paperScale(ctx, w, h, state, inputs) {
  const th = theme();
  drawRuler(ctx, 40, h / 2, w - 80, { label: 'Hand-made paper scale', divisions: 20 });
  ctx.save(); ctx.fillStyle = '#caa06a'; ctx.strokeStyle = th.stroke;
  ctx.fillRect(60, h / 2 - 20, 120, 14); ctx.strokeRect(60, h / 2 - 20, 120, 14); ctx.restore();
  label(ctx, 120, h / 2 - 20, 'Object under test', { anchor: 'above' });
}
export function principleOfMoments(ctx, w, h, state, inputs) {
  const th = theme();
  const cy = h / 2, len = w - 100;
  const pivotX = w / 2;
  ctx.save(); ctx.strokeStyle = th.wood; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(50, cy); ctx.lineTo(50 + len, cy); ctx.stroke();
  ctx.fillStyle = th.metal; ctx.beginPath(); ctx.moveTo(pivotX - 12, cy + 8); ctx.lineTo(pivotX + 12, cy + 8); ctx.lineTo(pivotX, cy - 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, pivotX, cy + 8, 'Knife edge (pivot)', { anchor: 'below' });
  const unknownX = 50 + ((inputs.unknownPosCm ?? 20) / 100) * len;
  const knownX = 50 + ((inputs.knownPosCm ?? 80) / 100) * len;
  drawWeight(ctx, unknownX, cy - 20, { label: 'Body P (unknown)' });
  drawWeight(ctx, knownX, cy - 20, { label: 'Known mass' });
  label(ctx, 50, cy + 8, 'Metre scale', { anchor: 'below' });
}
export function graphPlotting(ctx, w, h, state, inputs) {
  const th = theme();
  const ox = 60, oy = h - 40, gw = w - 90, gh = h - 70;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - gh); ctx.moveTo(ox, oy); ctx.lineTo(ox + gw, oy); ctx.stroke();
  ctx.restore();
  label(ctx, ox + gw / 2, oy, 'Independent variable →', { anchor: 'below' });
  ctx.save(); ctx.translate(ox - 34, oy - gh / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = th.muted; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Dependent variable →', 0, 0); ctx.restore();
  label(ctx, ox + gw / 2, oy - gh, 'Graph paper: choose a scale that fills the sheet', { anchor: 'above' });
}
export function rollingFriction(ctx, w, h, state, inputs) {
  const th = theme();
  const tableY = h / 2 + 40;
  ctx.save(); ctx.fillStyle = th.wood; ctx.fillRect(30, tableY, w - 60, 14); ctx.restore();
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath(); ctx.arc(w / 2 - 40, tableY - 16, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, w / 2 - 40, tableY - 32, 'Roller', { anchor: 'above' });
  ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w / 2 - 24, tableY - 16); ctx.lineTo(w - 60, tableY - 16); ctx.stroke(); ctx.restore();
  label(ctx, w - 60, tableY - 16, 'Pulley', { anchor: 'right' });
  drawWeight(ctx, w - 55, tableY - 6, { label: 'Fine-weight pan' });
}
export function projectileRange(ctx, w, h, state, inputs) {
  const th = theme();
  const groundY = h - 30, launchX = 50;
  const angle = ((inputs.angleDeg ?? 45) * Math.PI) / 180;
  ctx.save(); ctx.strokeStyle = th.stroke; ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(w, groundY); ctx.stroke();
  ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(launchX, groundY); ctx.lineTo(launchX + 40 * Math.cos(angle), groundY - 40 * Math.sin(angle)); ctx.stroke();
  const g = 9.792, u = 6;
  ctx.strokeStyle = th.dim; ctx.setLineDash([4, 4]); ctx.beginPath();
  for (let t = 0; t <= 2; t += 0.02) {
    const x = launchX + u * Math.cos(angle) * t * 40;
    const y = groundY - (u * Math.sin(angle) * t - 0.5 * g * t * t) * 40;
    if (y > groundY) break;
    if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  label(ctx, launchX, groundY, 'Spring launcher', { anchor: 'below' });
  label(ctx, w / 2, groundY, 'Range measured along the ground', { anchor: 'below' });
}
export function energyConservation(ctx, w, h, state, inputs) {
  const th = theme();
  const baseY = h - 40;
  ctx.save(); ctx.strokeStyle = th.wood; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(40, baseY - 120); ctx.lineTo(w / 2, baseY); ctx.lineTo(w - 40, baseY - 90); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath(); ctx.arc(40, baseY - 118, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, 40, baseY - 128, `Release, h1 = ${inputs.releaseHeightCm ?? 20} cm`, { anchor: 'above' });
  label(ctx, w - 40, baseY - 100, 'Height regained, h2', { anchor: 'above' });
  label(ctx, w / 2, baseY, 'Double inclined track', { anchor: 'below' });
}
export function scaleDepression(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  const cantilever = inputs?.arrangement !== 'supportedCentre';
  const depress = Math.min(60, (state?.t ?? 0) * 0 + (inputs?.loadG ?? 50) / 8);
  ctx.save(); ctx.strokeStyle = th.wood; ctx.lineWidth = 8;
  if (cantilever) {
    ctx.beginPath(); ctx.moveTo(60, y); ctx.quadraticCurveTo((60 + w - 60) / 2, y + depress * 0.5, w - 60, y + depress); ctx.stroke();
    ctx.fillStyle = th.metal; ctx.fillRect(40, y - 20, 20, 40);
  } else {
    ctx.beginPath(); ctx.moveTo(60, y); ctx.quadraticCurveTo(w / 2, y + depress, w - 60, y); ctx.stroke();
    ctx.fillStyle = th.metal; ctx.fillRect(50, y, 16, 16); ctx.fillRect(w - 66, y, 16, 16);
  }
  ctx.restore();
  label(ctx, cantilever ? 40 : w / 2, cantilever ? y - 20 : y + depress, cantilever ? 'Clamp' : 'Load at centre', { anchor: cantilever ? 'left' : 'below' });
  label(ctx, 60, y + 20, 'Metre scale (beam)', { anchor: 'below' });
}
export function pendulumDamping(ctx, w, h, state, inputs) {
  const th = theme();
  const pivotX = w / 2, pivotY = 30, len = h - 90;
  const t = state?.t ?? 0;
  const amp = (inputs.initialAmplitudeCm ?? 12) * Math.exp(-((0.006) * t));
  const angle = ((amp / len) * Math.PI) / 3;
  drawPendulumBob(ctx, pivotX, pivotY, len, Math.sin(t) * angle, { label: 'Bob (damping)' });
  ctx.save(); ctx.fillStyle = th.muted; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Amplitude decays exponentially — energy ∝ amplitude²', w / 2, h - 12);
  ctx.restore();
}

export const RENDERERS = {
  'vernier-callipers': vernierCallipers,
  'screw-gauge': screwGauge,
  'irregular-lamina': irregularLamina,
  spherometer,
  'beam-balance': beamBalance,
  'parallelogram-law': parallelogramLaw,
  'simple-pendulum': simplePendulum,
  friction,
  'inclined-plane': inclinedPlane,
  'youngs-modulus': youngsModulus,
  'helical-spring': helicalSpring,
  'paper-scale': paperScale,
  'principle-of-moments': principleOfMoments,
  'graph-plotting': graphPlotting,
  'rolling-friction': rollingFriction,
  'projectile-range': projectileRange,
  'energy-conservation': energyConservation,
  'scale-depression': scaleDepression,
  'pendulum-damping': pendulumDamping,
};
export default RENDERERS;
