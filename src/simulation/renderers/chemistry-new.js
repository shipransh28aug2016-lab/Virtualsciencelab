/**
 * Apparatus renderers for the 10 new Chemistry models added to close the
 * CBSE 2026-27 gap (equilibrium shift, standard solutions, salt analysis,
 * organic/inorganic preparations, functional-group and biomolecule tests).
 */
import { label, drawTestTube, drawBeaker, drawSwatch, drawBurner, drawRetortStand, drawDigitalReadout, theme } from './apparatus.js';

export function equilibriumShift(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const idx = state?.t !== undefined ? undefined : undefined; // colour computed by caller via inputs already
  drawTestTube(ctx, cx, 30, 130, 30, 0.7, th.liquid, { label: 'Test tube' });
  const colourA = inputs?.system === 'cocl' ? '#e8a8c0' : '#f5e6a8';
  const colourB = inputs?.system === 'cocl' ? '#3d7ae5' : '#c0261f';
  drawSwatch(ctx, cx + 60, 60, 46, colourA, 'Reactant colour');
  drawSwatch(ctx, cx + 60, 120, 46, colourB, 'Product colour');
  label(ctx, cx, 165, `Reagent: ${inputs?.reagent || '—'}`, { anchor: 'below' });
}
export function electronicBalance(ctx, w, h, state, inputs) {
  drawDigitalReadout(ctx, w / 2 - 70, h / 2 - 25, 140, 50, `${(state?.settled ? 'stable' : '...')}`, { label: 'Electronic top-pan balance', size: 16 });
  label(ctx, w / 2, h / 2 + 55, inputs?.object || 'sample on pan', { anchor: 'below' });
}
export function standardSolution(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 8, 20); ctx.lineTo(cx - 8, 70); ctx.lineTo(cx - 45, 150); ctx.quadraticCurveTo(cx, 165, cx + 45, 150); ctx.lineTo(cx + 8, 70); ctx.lineTo(cx + 8, 20);
  ctx.stroke(); ctx.restore();
  ctx.save(); ctx.fillStyle = th.liquid; ctx.beginPath();
  ctx.moveTo(cx - 40, 145); ctx.lineTo(cx + 40, 145); ctx.lineTo(cx + 30, 158); ctx.lineTo(cx - 30, 158); ctx.closePath(); ctx.fill(); ctx.restore();
  label(ctx, cx, 165, 'Volumetric flask, made up to the mark', { anchor: 'below' });
  label(ctx, cx, 20, inputs?.solute ? `${inputs.solute} weighed out` : 'Weighed solid', { anchor: 'above' });
}
export function saltAnalysis(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawTestTube(ctx, cx, 30, 120, 28, 0.5, '#dfe6ee', { label: `Salt under test: ${inputs?.salt || '—'}` });
  label(ctx, cx, 170, `Test: ${inputs?.test || 'appearance'}`, { anchor: 'below' });
}
export function lassaigneTest(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawRetortStand(ctx, cx - 60, h - 20, h - 90);
  drawTestTube(ctx, cx - 60, 30, 100, 22, 0.15, '#c9c9c9', { label: 'Fusion tube (Na + compound)' });
  drawBurner(ctx, cx - 60, h - 12, true);
  drawTestTube(ctx, cx + 70, 40, 90, 26, 0.6, '#eef3fb', { label: 'Sodium fusion extract' });
}
export function functionalGroupTest(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawTestTube(ctx, cx, 30, 120, 28, 0.5, '#f2eede', { label: inputs?.compound || 'Compound under test' });
  label(ctx, cx, 170, `Reagent: ${inputs?.test || '—'}`, { anchor: 'below' });
}
export function biomoleculeTest(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawTestTube(ctx, cx, 30, 120, 28, 0.55, '#f4ecd0', { label: inputs?.sample || 'Sample' });
  label(ctx, cx, 170, `Reagent: ${inputs?.test || '—'}`, { anchor: 'below' });
}
export function clockReaction(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  const { bot } = drawBeaker(ctx, cx, 30, 130, 120, 0.6, '#eef3fb', { label: 'KI + starch + thiosulphate + H₂O₂' });
  ctx.save(); ctx.fillStyle = '#1c2b52'; ctx.globalAlpha = Math.min(1, (state?.t ?? 0) / 2);
  ctx.beginPath(); ctx.arc(cx, bot - 20, 30, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
  label(ctx, cx, bot + 6, 'Watch for the sudden blue-black colour', { anchor: 'below' });
}
export function saltPreparation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawBeaker(ctx, cx, 30, 130, 100, 0.6, inputs?.product === 'ferricOxalate' ? '#3fae5a' : '#dcefe8', { label: 'Reaction mixture (evaporating)' });
  drawBurner(ctx, cx, h - 20, true);
  label(ctx, cx, 150, inputs?.product ? `Product: ${inputs.product}` : 'Double / complex salt', { anchor: 'below' });
}
export function organicPreparation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2;
  drawRetortStand(ctx, cx, h - 20, h - 90);
  drawBeaker(ctx, cx, 30, 110, 100, 0.6, '#f2e6c2', { label: 'Reaction flask (reflux)' });
  drawBurner(ctx, cx, h - 12, true);
  label(ctx, cx, 145, inputs?.preparation || 'Organic preparation', { anchor: 'below' });
}

export const RENDERERS = {
  'equilibrium-shift': equilibriumShift,
  'electronic-balance': electronicBalance,
  'standard-solution': standardSolution,
  'salt-analysis': saltAnalysis,
  'lassaigne-test': lassaigneTest,
  'functional-group-test': functionalGroupTest,
  'biomolecule-test': biomoleculeTest,
  'clock-reaction': clockReaction,
  'salt-preparation': saltPreparation,
  'organic-preparation': organicPreparation,
};
export default RENDERERS;
