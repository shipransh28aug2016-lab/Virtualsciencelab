/**
 * Apparatus renderers — current electricity, magnetism and electronics.
 */
import { label, drawResistor, drawCell, drawKey, drawDial, drawWireRect, drawDigitalReadout, theme } from './apparatus.js';

export function resistivity(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(w - 60, y); ctx.moveTo(60, y); ctx.lineTo(60, y - 60); ctx.lineTo(w - 60, y - 60); ctx.lineTo(w - 60, y); ctx.stroke();
  ctx.restore();
  drawResistor(ctx, w / 2, y, 70, { label: `${(inputs.wire || 'constantan')} wire` });
  drawCell(ctx, 100, y - 60, { label: 'Cell' });
  drawKey(ctx, 160, y - 60, true);
  drawDial(ctx, w - 100, y - 60, 34, (state?.current ?? 0) / 1.5, { label: 'Ammeter', zeroCentre: false });
  drawDial(ctx, w / 2, y + 60, 34, (state?.voltage ?? 0) / 6, { label: 'Voltmeter (parallel)' });
  label(ctx, 220, y - 60, 'Rheostat', { anchor: 'above' });
}

export function metreBridge(ctx, w, h, state, inputs) {
  const th = theme();
  const railY = h / 2 + 10, x0 = 50, x1 = w - 50;
  ctx.save(); ctx.fillStyle = th.wood; ctx.fillRect(x0, railY, x1 - x0, 8); ctx.restore();
  const jockeyX = x0 + ((x1 - x0) * (inputs.jockeyCm ?? 50)) / 100;
  ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(jockeyX, railY - 40); ctx.lineTo(jockeyX, railY); ctx.stroke(); ctx.restore();
  label(ctx, jockeyX, railY - 40, 'Jockey', { anchor: 'above' });
  drawDial(ctx, w / 2, railY - 80, 26, 0, { label: 'Galvanometer', zeroCentre: true });
  label(ctx, x0 + 60, railY + 8, 'Resistance box (R)', { anchor: 'below' });
  label(ctx, x1 - 60, railY + 8, 'Unknown coil (S)', { anchor: 'below' });
  label(ctx, w / 2, railY, 'Metre bridge wire', { anchor: 'below' });
}

export function galvanometer(ctx, w, h, state, inputs) {
  const th = theme();
  drawDial(ctx, w / 2, h / 2 - 10, 60, (state?.deflection ?? 0) / 30, { label: 'Galvanometer', zeroCentre: true });
  drawCell(ctx, 60, h - 40, { label: 'Cell' });
  drawResistor(ctx, w / 2, h - 40, 70, { label: 'Resistance box R' });
  if (inputs?.shuntConnected) label(ctx, w - 60, h - 40, 'Shunt S', { anchor: 'above' });
}

export function inductorImpedance(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, cy = h / 2;
  ctx.save(); ctx.strokeStyle = th.metal; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(cx - 60 + i * 16, cy, 12, Math.PI, 0); ctx.stroke(); }
  ctx.restore();
  label(ctx, cx, cy + 14, `Coil (${inputs?.core || 'air'} core)`, { anchor: 'below' });
  drawDial(ctx, 90, h - 50, 30, (state?.currentA ?? 0) / 2, { label: 'Ammeter' });
  drawDial(ctx, w - 90, h - 50, 30, (state?.voltageV ?? 0) / 12, { label: `Voltmeter (${inputs?.supply === 'ac' ? 'AC' : 'DC'})` });
}

export function multimeter(ctx, w, h, state, inputs) {
  const th = theme();
  drawDigitalReadout(ctx, w / 2 - 70, h / 2 - 30, 140, 50, 'MULTIMETER', { label: 'Digital multimeter', size: 15 });
  label(ctx, w / 2, h / 2 + 40, `Function: ${inputs?.func?.toUpperCase() || '—'}  •  ${inputs?.connection || ''}`, { anchor: 'below' });
  label(ctx, w / 2, h / 2 - 60, inputs?.target ? `Target: ${inputs.target}` : 'Target circuit', { anchor: 'above' });
}

export function householdCircuit(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(30, y - 40); ctx.lineTo(w - 30, y - 40); ctx.moveTo(30, y + 40); ctx.lineTo(w - 30, y + 40); ctx.stroke();
  ctx.restore();
  label(ctx, 30, y - 40, 'Live', { anchor: 'above' }); label(ctx, 30, y + 40, 'Neutral', { anchor: 'below' });
  [0, 1, 2].forEach((i) => {
    const x = 90 + i * ((w - 150) / (inputs?.wiring === 'series' ? 1 : 1)) * (inputs?.wiring === 'series' ? 1 : 1) + (inputs?.wiring === 'series' ? i * 0 : i * ((w - 180) / 2));
    const lx = inputs?.wiring === 'series' ? 90 + i * ((w - 180) / 2) : 90 + i * ((w - 180) / 2);
    ctx.save(); ctx.strokeStyle = '#e8b23d'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(lx, y, 14, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    label(ctx, lx, y - 14, `Lamp ${i + 1}`, { anchor: 'above', size: 10 });
    drawKey(ctx, lx, y - 40, true);
  });
  label(ctx, w - 60, y - 40, 'Fuse', { anchor: 'above' });
}

export function potentialDrop(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2 + 20, x0 = 50, x1 = w - 50;
  ctx.save(); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.restore();
  const tapX = x0 + ((x1 - x0) * (inputs.tapLengthCm ?? 40)) / 100;
  ctx.save(); ctx.strokeStyle = th.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tapX, y - 40); ctx.lineTo(tapX, y); ctx.stroke(); ctx.restore();
  drawDial(ctx, tapX, y - 60, 26, (state?.pH ?? 0), { label: 'Voltmeter' });
  label(ctx, x0, y + 6, 'Uniform resistance wire', { anchor: 'below' });
  drawCell(ctx, x0 - 20, y - 40, { label: 'Driver cell' });
}

export function diodeTester(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, cy = h / 2;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 20, cy - 14); ctx.lineTo(cx - 20, cy + 14); ctx.lineTo(cx + 14, cy); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 14, cy - 14); ctx.lineTo(cx + 14, cy + 14); ctx.stroke();
  ctx.restore();
  label(ctx, cx, cy + 16, inputs?.component ? `Component: ${inputs.component}` : 'Diode / LED under test', { anchor: 'below' });
  drawDigitalReadout(ctx, cx - 60, cy - 70, 120, 34, 'DIODE TEST', { size: 12 });
}

export function ldrIntensity(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 90;
  ctx.save(); ctx.fillStyle = '#4a4a4a'; ctx.beginPath(); ctx.arc(cx, h / 2, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, cx, h / 2 + 16, 'LDR', { anchor: 'below' });
  const lampX = cx + 30 + ((w - 160) * (inputs.distanceCm ?? 30)) / 120;
  const grad = ctx.createRadialGradient(lampX, h / 2, 2, lampX, h / 2, 26);
  grad.addColorStop(0, th.flame); grad.addColorStop(1, 'rgba(255,180,90,0)');
  ctx.save(); ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(lampX, h / 2, 26, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  label(ctx, lampX, h / 2 + 26, 'Lamp', { anchor: 'below' });
  ctx.save(); ctx.strokeStyle = th.dim; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, h / 2); ctx.lineTo(lampX, h / 2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  label(ctx, (cx + lampX) / 2, h / 2 - 10, `d = ${inputs.distanceCm ?? 30} cm`, { anchor: 'above', bg: false });
}

export function componentId(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, cy = h / 2;
  ctx.save(); ctx.fillStyle = '#caa06a'; ctx.strokeStyle = th.stroke; ctx.beginPath(); ctx.roundRect(cx - 30, cy - 14, 60, 28, 6); ctx.fill(); ctx.stroke(); ctx.restore();
  label(ctx, cx, cy + 14, inputs?.specimen ? `Specimen: ${inputs.specimen}` : 'Specimen from the tray', { anchor: 'below' });
  drawDial(ctx, cx, cy - 60, 30, 0, { label: 'Ohmmeter' });
}

export function circuitAssembly(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  ctx.save(); ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.strokeRect(60, y - 50, w - 120, 100); ctx.restore();
  drawCell(ctx, 90, y, { label: 'Cell' });
  drawKey(ctx, 150, y - 50, inputs?.wiringCorrect !== false);
  drawResistor(ctx, w / 2, y - 50, 60, { label: 'Resistor' });
  drawDial(ctx, w - 90, y, 28, 0.4, { label: 'Ammeter' });
  label(ctx, w / 2, y + 50, 'Assemble to match the circuit diagram', { anchor: 'below' });
}

export function circuitFault(ctx, w, h, state, inputs) {
  const th = theme();
  const y = h / 2;
  ctx.save(); ctx.strokeStyle = state?.backwards ? th.bad : th.ink; ctx.lineWidth = 1.6;
  ctx.strokeRect(60, y - 50, w - 120, 100); ctx.restore();
  drawCell(ctx, 90, y, { label: 'Cell' });
  drawKey(ctx, 150, y - 50, inputs?.keyPosition !== 'open');
  drawResistor(ctx, w / 2, y - 50, 60, { label: 'Rheostat' });
  drawDial(ctx, w - 90, y - 50, 26, (state?.currentA ?? 0) / 0.15, { label: 'Ammeter', zeroCentre: state?.backwards });
  drawDial(ctx, w - 90, y + 20, 26, (state?.voltageV ?? 0) / 3, { label: 'Voltmeter', zeroCentre: state?.backwards });
  label(ctx, w / 2, y + 50, `Board: ${inputs?.board || '—'}`, { anchor: 'below' });
}

export const RENDERERS = {
  resistivity,
  'metre-bridge': metreBridge,
  galvanometer,
  'inductor-impedance': inductorImpedance,
  multimeter,
  'household-circuit': householdCircuit,
  'potential-drop': potentialDrop,
  'diode-tester': diodeTester,
  'ldr-intensity': ldrIntensity,
  'component-id': componentId,
  'circuit-assembly': circuitAssembly,
  'circuit-fault': circuitFault,
};
export default RENDERERS;
