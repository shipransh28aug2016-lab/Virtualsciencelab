/**
 * Apparatus renderers — chemistry (Classes XI and XII).
 */
import {
  label, drawBeaker, drawConicalFlask, drawBurette, drawTestTube, drawThermometer,
  drawRetortStand, drawBurner, drawSwatch, theme,
} from './apparatus.js';

export function meltingPoint(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawRetortStand(ctx, cx, h - 30, h - 100);
  drawBeaker(ctx, cx, 50, 100, 100, 0.7, '#e8c877', { label: 'Melting-point bath' });
  drawThermometer(ctx, cx, 20, 120, 0.6);
  ctx.save(); ctx.fillStyle = '#d8d0c0'; ctx.fillRect(cx + 10, 60, 4, 60); ctx.restore();
  label(ctx, cx + 12, 120, 'Capillary + sample', { anchor: 'below' });
  drawBurner(ctx, cx, h - 20, true);
}
export function boilingPoint(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawRetortStand(ctx, cx, h - 30, h - 100);
  const { topY } = drawBeaker(ctx, cx, 60, 100, 100, 0.7, '#e8c877', { label: 'Heating bath' });
  drawTestTube(ctx, cx, 30, 100, 24, 0.3, th.liquid, { label: 'Siwoloboff tube' });
  drawThermometer(ctx, cx + 30, 20, 120, 0.6);
}
export function crystallisation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawBeaker(ctx, cx, 40, 140, 110, 0.6, th.liquid, { label: 'Hot saturated solution' });
  drawBurner(ctx, cx, h - 20, true);
  ctx.save(); ctx.fillStyle = '#dfe8f5'; ctx.globalAlpha = 0.8;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(cx - 40 + i * 16, bot - 10, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.restore();
  label(ctx, cx, bot + 4, 'Crystals forming on cooling', { anchor: 'below' });
}
export function phDetermination(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawTestTube(ctx, cx, 30, 120, 28, 0.6, th.liquid, { label: inputs?.sample || 'Sample solution' });
  const ph = state?.pH ?? 7;
  const colour = ph < 3 ? '#e5433d' : ph < 6 ? '#f0a23d' : ph < 8 ? '#3fae5a' : ph < 11 ? '#3d7ae5' : '#7a3fc4';
  drawSwatch(ctx, cx + 60, 60, 40, colour, `pH ≈ ${ph.toFixed ? ph.toFixed(1) : ph}`);
  label(ctx, cx, 160, `Method: ${inputs?.method || 'universal indicator'}`, { anchor: 'below' });
}
export function titration(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY } = drawBurette(ctx, cx, 15, 150, 1 - (state?.delivered ?? 0) / 50, { liquidColor: th.liquid, dropping: state?.flowing, label: 'Burette (titrant)' });
  const colourMap = { colourless: 'rgba(255,255,255,0.15)', pink: '#f2a6c8', yellow: '#f3e26b', orange: '#f0a23d', red: '#e5433d', green: '#3fae5a', blue: '#3d7ae5', violet: '#7a3fc4' };
  let key = (state?.colour || 'colourless').split(' ')[0].split('(')[0].trim();
  const fill = colourMap[key] || th.liquid;
  drawConicalFlask(ctx, cx, 190, 40, 110, 110, 0.35, fill, { label: 'Conical flask (analyte)' });
  label(ctx, cx, 40, `Delivered: ${(state?.delivered ?? 0).toFixed(1)} mL`, { anchor: 'above', bg: false });
  label(ctx, cx + 90, 190, state?.colour || 'colourless', { anchor: 'right' });
}
export function solPreparation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { bot } = drawBeaker(ctx, cx, 30, 120, 120, 0.55, '#c98b4a', { label: inputs?.sol ? `${inputs.sol} sol` : 'Colloidal sol' });
  if (inputs?.test === 'tyndall') {
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 70, 40); ctx.lineTo(cx + 40, 90); ctx.stroke(); ctx.restore();
    label(ctx, cx - 70, 40, 'Light beam (Tyndall cone)', { anchor: 'above' });
  }
}
export function dialysis(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawBeaker(ctx, cx, 30, 160, 120, 0.7, th.liquid, { label: 'Outer water (dialysing tank)' });
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.setLineDash([3, 2]); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.roundRect(cx - 40, 55, 80, 60, 10); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  label(ctx, cx, 55, `Sol in membrane bag (${inputs?.membrane || 'parchment'})`, { anchor: 'above' });
}
export function emulsion(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawTestTube(ctx, cx, 20, 150, 34, 0.6, '#e8d089', { label: `Oil + water${inputs?.agent && inputs.agent !== 'none' ? ' + ' + inputs.agent : ''}` });
  ctx.save(); ctx.fillStyle = '#f2e6b0'; ctx.globalAlpha = 0.8;
  const sep = Math.min(1, (state?.t ?? 0) / 2);
  ctx.fillRect(cx - 15, topY + 20, 30, 20 * sep);
  ctx.globalAlpha = 1; ctx.restore();
}
export function reactionKinetics(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY, bot } = drawConicalFlask(ctx, cx, 30, 40, 130, 120, 0.5, th.liquid, { label: 'Na₂S₂O₃ + HCl' });
  const turbidity = Math.min(1, state?.turbidity ?? 0);
  ctx.save(); ctx.fillStyle = '#222'; ctx.globalAlpha = 1 - turbidity;
  ctx.beginPath(); ctx.moveTo(cx - 8, bot - 6); ctx.lineTo(cx + 8, bot - 6); ctx.lineTo(cx, bot - 20); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, cx, bot + 6, turbidity > 0.9 ? 'Cross has disappeared' : 'Cross mark under the flask', { anchor: 'below' });
}
export function calorimetry(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { topY } = drawBeaker(ctx, cx, 40, 110, 110, 0.65, th.liquid, { label: 'Calorimeter (insulated cup)' });
  drawThermometer(ctx, cx, topY - 30, 120, Math.min(1, ((state?.tempC ?? 26) - 15) / 40));
}
export function electrochemicalCell(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawBeaker(ctx, cx - 90, 40, 100, 100, 0.7, '#dcefe8', { label: `${inputs?.anode || 'zn'} half-cell` });
  drawBeaker(ctx, cx + 90, 40, 100, 100, 0.7, '#eaf0dc', { label: `${inputs?.cathode || 'cu'} half-cell` });
  ctx.save(); ctx.strokeStyle = th.dim; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 40, 90); ctx.lineTo(cx + 40, 90); ctx.stroke(); ctx.restore();
  label(ctx, cx, 90, 'Salt bridge', { anchor: 'above' });
  ctx.save(); ctx.strokeStyle = th.metal; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 90, 20); ctx.lineTo(cx + 90, 20); ctx.stroke(); ctx.restore();
  label(ctx, cx, 20, `EMF ≈ ${(state?.pH ?? 0)} V`, { anchor: 'above', bg: false });
}
export function chromatography(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, chamberY = 30, chamberH = h - 90;
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.6;
  ctx.strokeRect(cx - 60, chamberY, 120, chamberH); ctx.restore();
  const front = Math.min(chamberH - 20, (state?.progress ?? 1) * (chamberH - 20));
  ctx.save(); ctx.strokeStyle = th.dim; ctx.setLineDash([4, 3]); ctx.beginPath();
  ctx.moveTo(cx - 60, chamberY + chamberH - 20 - front); ctx.lineTo(cx + 60, chamberY + chamberH - 20 - front); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  label(ctx, cx + 60, chamberY + chamberH - 20 - front, 'Solvent front', { anchor: 'right', bg: false });
  ['#e8890c', '#2f7d4f', '#8fc45c'].forEach((c, i) => {
    ctx.save(); ctx.fillStyle = c; ctx.beginPath();
    ctx.arc(cx - 20 + i * 20, chamberY + chamberH - 10 - front * (0.5 + i * 0.15), 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });
  ctx.save(); ctx.fillStyle = th.liquid; ctx.fillRect(cx - 60, chamberY + chamberH - 10, 120, 8); ctx.restore();
  label(ctx, cx, chamberY + chamberH, 'Chromatography chamber', { anchor: 'below' });
}

export const RENDERERS = {
  'melting-point': meltingPoint,
  'boiling-point': boilingPoint,
  crystallisation,
  'ph-determination': phDetermination,
  titration,
  'sol-preparation': solPreparation,
  dialysis,
  emulsion,
  'reaction-kinetics': reactionKinetics,
  calorimetry,
  'electrochemical-cell': electrochemicalCell,
  chromatography,
};
export default RENDERERS;
