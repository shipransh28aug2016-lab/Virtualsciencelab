/**
 * Apparatus renderers — heat, fluids and their Section-B activities.
 */
import {
  label, drawBeaker, drawThermometer, drawRetortStand, drawBurner, drawTestTube, theme,
} from './apparatus.js';

export function boylesLaw(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, topY = 20, tubeH = h - 60;
  const level = 0.5 - (inputs.levelDifferenceCm ?? 0) / 200;
  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.8;
  // closed limb
  ctx.beginPath(); ctx.moveTo(cx - 40, topY); ctx.lineTo(cx - 40, topY + tubeH); ctx.lineTo(cx - 10, topY + tubeH); ctx.lineTo(cx - 10, topY); ctx.stroke();
  // open limb
  ctx.beginPath(); ctx.moveTo(cx + 10, topY - 10); ctx.lineTo(cx + 10, topY + tubeH); ctx.lineTo(cx + 40, topY + tubeH); ctx.lineTo(cx + 40, topY - 10); ctx.stroke();
  ctx.fillStyle = '#b8bec8';
  const closedMercTop = topY + (tubeH - (state?.column ?? 30) * 3);
  ctx.fillRect(cx - 38, closedMercTop, 26, topY + tubeH - closedMercTop);
  ctx.fillRect(cx + 12, topY + tubeH * level, 26, tubeH - tubeH * level);
  ctx.restore();
  label(ctx, cx - 25, topY, 'Trapped air column', { anchor: 'above' });
  label(ctx, cx + 25, topY - 10, 'Open limb (mercury)', { anchor: 'above' });
}

export function surfaceTension(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawBeaker(ctx, cx, h - 130, 200, 100, 0.5, th.liquid, { label: 'Beaker of liquid' });
  const riseCm = 20;
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - 4, topY - riseCm * 3); ctx.lineTo(cx - 4, bot + 20); ctx.lineTo(cx + 4, bot + 20); ctx.lineTo(cx + 4, topY - riseCm * 3); ctx.stroke();
  ctx.fillStyle = th.liquid; ctx.fillRect(cx - 3, topY - riseCm, 6, bot - topY + riseCm);
  ctx.restore();
  label(ctx, cx, topY - riseCm * 3, 'Capillary tube', { anchor: 'above' });
}

export function viscosity(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawBeaker(ctx, cx, 20, 140, h - 60, 0.9, th.liquidAlt, { label: 'Viscous liquid (measuring jar)' });
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath();
  const y = 30 + ((state?.t ?? 0) * 40) % (h - 80);
  ctx.arc(cx, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, cx + 90, h / 2, 'Falling sphere', { anchor: 'right', bg: false });
  label(ctx, cx - 90, 40, 'Upper mark', { anchor: 'left', bg: false });
  label(ctx, cx - 90, h - 60, 'Lower mark', { anchor: 'left', bg: false });
}

export function coolingCurve(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2 - 60;
  drawRetortStand(ctx, cx, h - 30, h - 90);
  const { topY, bot } = drawBeaker(ctx, cx, 60, 90, 90, 0.6, th.liquid, { label: 'Calorimeter' });
  drawThermometer(ctx, cx, topY - 30, 130, Math.min(1, ((state?.tempC ?? 60) - 25) / 60));
  label(ctx, cx, bot + 6, `${(state?.tempC ?? inputs.startTempC ?? 80).toFixed(1)} °C`, { anchor: 'below', bold: true });
}

export function specificHeat(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2 - 40;
  drawRetortStand(ctx, cx, h - 30, h - 100);
  const { topY, bot } = drawBeaker(ctx, cx, 70, 90, 90, 0.6, th.liquid, { label: 'Calorimeter + water' });
  drawThermometer(ctx, cx, topY - 30, 120, 0.5);
  drawBurner(ctx, w - 70, h - 30, true);
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath(); ctx.arc(w - 70, h - 100, 12, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, w - 70, h - 116, 'Solid in a boiling tube', { anchor: 'above' });
}

export function sonometer(ctx, w, h, state, inputs) {
  const th = theme();
  const boxY = h / 2 + 20;
  ctx.save(); ctx.fillStyle = th.wood; ctx.fillRect(40, boxY, w - 140, 30); ctx.strokeStyle = th.stroke; ctx.strokeRect(40, boxY, w - 140, 30); ctx.restore();
  label(ctx, 40 + (w - 140) / 2, boxY + 30, 'Sonometer box', { anchor: 'below' });
  ['A', 'B'].forEach((n, i) => {
    const x = 60 + i * ((w - 180) * ((inputs.resonantLengthCm ?? 20) / 100));
    ctx.save(); ctx.strokeStyle = th.metal; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, boxY - 4); ctx.lineTo(x, boxY + 4); ctx.stroke(); ctx.restore();
  });
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(40, boxY); ctx.lineTo(w - 100, boxY); ctx.stroke(); ctx.restore();
  label(ctx, w - 60, boxY, 'Pulley + hanging load', { anchor: 'right' });
  label(ctx, 60, boxY - 10, 'Bridge', { anchor: 'above' });
}

export function resonanceTube(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, topY = 20;
  const level = topY + (h - 60) * (1 - Math.min(1, (inputs.airColumnCm ?? 16) / 100));
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.rect(cx - 22, topY, 44, h - 60); ctx.stroke();
  ctx.fillStyle = th.liquid; ctx.fillRect(cx - 20, level, 40, topY + h - 60 - level);
  ctx.restore();
  label(ctx, cx, topY, 'Resonance tube', { anchor: 'above' });
  ctx.save(); ctx.fillStyle = '#8b93a3'; ctx.beginPath(); ctx.arc(cx + 60, topY - 6, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, cx + 60, topY - 18, 'Tuning fork', { anchor: 'above' });
}

export function waxCooling(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawRetortStand(ctx, cx, h - 30, h - 100);
  drawTestTube(ctx, cx, 40, 130, 40, 0.7, '#e8c877', { label: 'Wax (in a boiling tube)' });
  drawThermometer(ctx, cx, 30, 110, Math.min(1, ((state?.tempC ?? inputs.startTempC ?? 80) - 25) / 60));
}

export function bimetallicStrip(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, y = h / 2;
  const bend = Math.min(30, (state?.t ?? 0) * 6);
  ctx.save(); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 100, y); ctx.quadraticCurveTo(cx, y - bend, cx + 100, y - bend * 1.6); ctx.stroke();
  ctx.strokeStyle = '#9aa3b0'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx - 100, y + 5); ctx.quadraticCurveTo(cx, y - bend + 5, cx + 100, y - bend * 1.6 + 5); ctx.stroke();
  ctx.restore();
  label(ctx, cx - 100, y, 'Clamp', { anchor: 'left' });
  label(ctx, cx + 100, y - bend * 1.6, 'Free end (deflects on heating)', { anchor: 'right' });
  drawBurner(ctx, cx, h - 20, true);
}

export function liquidExpansion(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawBeaker(ctx, cx, h - 120, 160, 90, 0.85, th.liquid, { label: 'Flask of liquid' });
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - 4, topY - 100); ctx.lineTo(cx - 4, topY); ctx.lineTo(cx + 4, topY); ctx.lineTo(cx + 4, topY - 100); ctx.stroke();
  ctx.fillStyle = th.liquid; ctx.fillRect(cx - 3, topY - 40, 6, 40); ctx.restore();
  label(ctx, cx, topY - 100, 'Narrow stem', { anchor: 'above' });
  drawBurner(ctx, cx, h - 10, true);
}

export function detergentSurfaceTension(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawBeaker(ctx, cx, h - 130, 200, 100, 0.5, '#dcefe8', { label: 'Water + detergent' });
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - 4, topY - 60); ctx.lineTo(cx - 4, bot + 10); ctx.lineTo(cx + 4, bot + 10); ctx.lineTo(cx + 4, topY - 60); ctx.stroke();
  ctx.fillStyle = th.liquid; ctx.fillRect(cx - 3, topY - 20, 6, bot - topY + 30); ctx.restore();
  label(ctx, cx, topY - 60, 'Capillary tube', { anchor: 'above' });
}

export function coolingFactors(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY } = drawBeaker(ctx, cx, 60, 110, 100, 0.7, th.liquid, { label: inputs.cover === 'lid' ? 'Covered calorimeter' : 'Open calorimeter' });
  drawThermometer(ctx, cx, topY - 30, 110, Math.min(1, ((state?.tempC ?? 60) - 20) / 50));
}

export function bernoulliPressure(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(30, y - 30); ctx.lineTo(w * 0.4, y - 30); ctx.lineTo(w * 0.55, y - 8); ctx.lineTo(w * 0.7, y - 30); ctx.lineTo(w - 30, y - 30);
  ctx.lineTo(w - 30, y + 30); ctx.lineTo(w * 0.7, y + 30); ctx.lineTo(w * 0.55, y + 8); ctx.lineTo(w * 0.4, y + 30); ctx.lineTo(30, y + 30);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, w * 0.55, y - 8, 'Throat (narrow section)', { anchor: 'above' });
  label(ctx, w * 0.2, y - 30, 'Wide section', { anchor: 'above' });
  const h1 = (state?.heightMm ?? 0) / 6;
  ctx.save(); ctx.fillStyle = th.liquid;
  ctx.fillRect(w * 0.2 - 6, y - 60, 12, 30 - h1 / 2); ctx.fillRect(w * 0.55 - 6, y - 60, 12, 30 + h1 / 2);
  ctx.restore();
  label(ctx, w * 0.4, y - 66, 'Manometer', { anchor: 'above' });
}

export const RENDERERS = {
  'boyles-law': boylesLaw,
  'surface-tension': surfaceTension,
  viscosity,
  'cooling-curve': coolingCurve,
  'specific-heat': specificHeat,
  sonometer,
  'resonance-tube': resonanceTube,
  'wax-cooling': waxCooling,
  'bimetallic-strip': bimetallicStrip,
  'liquid-expansion': liquidExpansion,
  'detergent-surface-tension': detergentSurfaceTension,
  'cooling-factors': coolingFactors,
  'bernoulli-pressure': bernoulliPressure,
};
export default RENDERERS;
