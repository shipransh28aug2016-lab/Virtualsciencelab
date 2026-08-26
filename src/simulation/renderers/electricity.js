/**
 * Apparatus renderers — current electricity, magnetism and electronics.
 */
import {
  label, drawResistor, drawCell, drawKey, drawDial, drawWireRect, drawDigitalReadout,
  theme, brushedMetal, chrome, plastic, contactShadow, incandescence, noteBounds,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp, noise1 } from './realism.js';

const BENCH_Y = 420;

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
  const railY = 300, x0 = 90, x1 = 710;
  // The metre wire, on its board with a scale under it.
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(x0 - 20, railY, (x1 - x0) + 40, 12);
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, railY - 3); ctx.lineTo(x1, railY - 3); ctx.stroke();
  ctx.strokeStyle = rgba('#2b2415', 0.7); ctx.font = '600 8px system-ui, sans-serif';
  ctx.fillStyle = rgba('#2b2415', 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i <= 100; i += 5) {
    const tx = x0 + ((x1 - x0) * i) / 100;
    const major = i % 25 === 0;
    ctx.lineWidth = major ? 1.2 : 0.7;
    ctx.beginPath(); ctx.moveTo(tx, railY + 12); ctx.lineTo(tx, railY + 12 + (major ? 8 : 4)); ctx.stroke();
    if (major) ctx.fillText(String(i), tx, railY + 22);
  }
  ctx.restore();
  label(ctx, (x0 + x1) / 2, railY + 36, 'Uniform metre wire (1 m, constantan)', { anchor: 'below' });

  /* The jockey is where the model says it is, and the galvanometer reads
     the bridge's off-balance -- so the needle swings THROUGH zero at the
     balance point, which is the null the student is hunting for. */
  const l = state?.jockey ?? inputs.jockeyCm ?? 50;
  const jockeyX = x0 + ((x1 - x0) * l) / 100;
  ctx.save();
  brushedMetal(ctx, jockeyX - 4, railY - 62, 8, 60, { axis: 'v' });
  ctx.fillStyle = shade(th.metal, -0.2);
  ctx.beginPath(); ctx.moveTo(jockeyX - 7, railY - 6); ctx.lineTo(jockeyX + 7, railY - 6); ctx.lineTo(jockeyX, railY - 1); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, jockeyX, railY - 66, `Jockey · ${l.toFixed(1)} cm`, { anchor: 'above' });

  const defl = state?.deflection ?? 0;
  drawDial(ctx, (x0 + x1) / 2, railY - 150, 40, defl, { label: 'Galvanometer', zeroCentre: true });

  // The two gaps: the resistance box, and the unknown coil.
  drawResistor(ctx, x0 + 110, railY - 110, 70, { label: `Resistance box R = ${inputs.resistanceBox ?? 5} Ω` });
  drawResistor(ctx, x1 - 110, railY - 110, 70, { label: 'Unknown resistance S' });
  drawCell(ctx, (x0 + x1) / 2, railY + 90, { label: 'Cell + key' });

  label(ctx, (x0 + x1) / 2, railY - 200,
    state?.balanced ? `Balanced at ${l.toFixed(1)} cm — S = R(100−l)/l`
      : defl > 0 ? 'Deflection to the right — move the jockey left'
        : 'Deflection to the left — move the jockey right',
    { anchor: 'above', bold: true, color: state?.balanced ? '#0d7a52' : '#8a5a00' });
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
  const cx = 380, cy = 250;
  contactShadow(ctx, cx, cy + 150, 300, { strength: 0.7 });
  plastic(ctx, cx - 130, cy - 130, 260, 280, '#2f3a4e', 12);

  const correct = !!state?.correct;
  const val = state?.reading ?? 0;
  const unit = /ohm/i.test(String(inputs?.func)) ? ' Ω' : /volt|dcv|acv/i.test(String(inputs?.func)) ? ' V' : ' mA';
  drawDigitalReadout(ctx, cx - 100, cy - 108, 200, 62,
    correct ? val.toFixed(val < 10 ? 3 : 1) + unit : 'Err',
    { size: 24, color: correct ? '#7CFC9A' : '#ff9b9b' });

  /* The rotary switch actually points at the function selected. Reading a
     resistance on a current range is the mistake this exercise exists to
     catch, so the selector must be visibly wrong when it is wrong. */
  const funcs = ['ohm', 'dcv', 'acv', 'dca', 'diode'];
  const idx = Math.max(0, funcs.indexOf(String(inputs?.func || 'ohm')));
  const ang = -Math.PI * 0.75 + (idx / (funcs.length - 1)) * Math.PI * 1.5;
  ctx.save();
  ctx.fillStyle = '#1d2635';
  ctx.beginPath(); ctx.arc(cx, cy + 30, 52, 0, Math.PI * 2); ctx.fill();
  chrome(ctx, cx - 30, cy + 24, 60, 12, 6);
  ctx.translate(cx, cy + 30); ctx.rotate(ang);
  ctx.fillStyle = '#f4f7fb';
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, -46); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  funcs.forEach((f, i) => {
    const a = -Math.PI * 0.75 + (i / (funcs.length - 1)) * Math.PI * 1.5;
    ctx.fillStyle = i === idx ? '#7CFC9A' : 'rgba(210,225,245,0.65)';
    ctx.fillText(f.toUpperCase(), cx + Math.cos(a - Math.PI / 2) * 68, cy + 30 + Math.sin(a - Math.PI / 2) * 68);
  });
  ctx.restore();

  // Leads, in the sockets they are actually in.
  for (const [dx, col, txt] of [[-46, '#1a1a1a', 'COM'], [46, '#c02626', 'VΩmA']]) {
    ctx.save();
    ctx.fillStyle = '#0f141d';
    ctx.beginPath(); ctx.arc(cx + dx, cy + 120, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + 120);
    ctx.quadraticCurveTo(cx + dx * 2.6, cy + 190, cx + dx * 3.4, cy + 150);
    ctx.stroke();
    ctx.restore();
    label(ctx, cx + dx, cy + 132, txt, { anchor: 'below', size: 9 });
  }

  label(ctx, cx, cy - 140,
    correct ? `Reading ${val.toFixed(2)}${unit}${state?.settling ? ' (settling)' : ''}`
      : 'Wrong function or wrong leads — the meter cannot read this',
    { anchor: 'above', bold: true, color: correct ? '#0d7a52' : '#c02626' });
  label(ctx, cx, cy + 230, `Target: ${inputs?.target || 'circuit'} · ${inputs?.connection || ''}`, { anchor: 'below' });
}

export function householdCircuit(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 250, x0 = 70, x1 = 700;
  const live = y - 90, neutral = y + 110;

  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(x0, live); ctx.lineTo(x1, live); ctx.stroke();
  ctx.strokeStyle = '#1a2333'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(x0, neutral); ctx.lineTo(x1, neutral); ctx.stroke();
  ctx.restore();
  label(ctx, x0 - 4, live, 'Live', { anchor: 'left', color: '#c02626' });
  label(ctx, x0 - 4, neutral, 'Neutral', { anchor: 'left' });

  // Fuse in the LIVE line — where it must be, and it blows if overloaded.
  const blown = !!state?.fuseBlown;
  ctx.save();
  plastic(ctx, x0 + 40, live - 12, 60, 24, '#d8dfe9', 4);
  ctx.strokeStyle = blown ? '#c02626' : '#8a93a3';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (blown) { ctx.moveTo(x0 + 48, live); ctx.lineTo(x0 + 62, live - 6); ctx.moveTo(x0 + 78, live + 6); ctx.lineTo(x0 + 92, live); }
  else { ctx.moveTo(x0 + 48, live); ctx.lineTo(x0 + 92, live); }
  ctx.stroke();
  ctx.restore();
  label(ctx, x0 + 70, live - 14, blown ? 'FUSE BLOWN' : 'Fuse (in the live line)',
    { anchor: 'above', bold: blown, color: blown ? '#c02626' : undefined });

  /* Lamps in PARALLEL each draw their own current from the same supply,
     which is why one can be switched off without the others going out --
     and why the total current, not the voltage, is what rises. */
  const n = 3;
  const on = Math.round(clamp(state?.lamps ?? 0, 0, n));
  for (let i = 0; i < n; i++) {
    const lx = x0 + 200 + i * 160;
    const lit = i < on && !blown;
    ctx.save();
    ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(lx, live); ctx.lineTo(lx, y - 24); ctx.moveTo(lx, y + 24); ctx.lineTo(lx, neutral); ctx.stroke();
    // Switch, in the live side.
    ctx.beginPath(); ctx.moveTo(lx, live); ctx.lineTo(lit ? lx : lx + 12, live + (lit ? 22 : 16)); ctx.stroke();
    ctx.restore();
    // Lamp.
    ctx.save();
    ctx.strokeStyle = th.ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(lx, y, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 15, y - 15); ctx.lineTo(lx + 15, y + 15);
    ctx.moveTo(lx + 15, y - 15); ctx.lineTo(lx - 15, y + 15); ctx.stroke();
    ctx.restore();
    if (lit) incandescence(ctx, lx, y, 30, 0.85, { intensity: 1 });
    label(ctx, lx, y + 26, lit ? `Lamp ${i + 1} — on` : `Lamp ${i + 1} — off`, { anchor: 'below', size: 11 });
  }

  // Current flowing in the mains, animated along the live line.
  if (!blown && (state?.current ?? 0) > 0.001) {
    ctx.save();
    ctx.fillStyle = rgba('#c02626', 0.8);
    const per = x1 - x0;
    const ph = (clock() * 60 * clamp(state.current, 0, 5)) % 40;
    for (let d = ph; d < per; d += 40) {
      ctx.beginPath(); ctx.arc(x0 + d, live, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  label(ctx, (x0 + x1) / 2, live - 60,
    blown ? `Fuse blew at ${(inputs?.fuseA ?? 5)} A — too many lamps on this circuit`
      : `Total current ${(state?.current ?? 0).toFixed(2)} A · lamps in ${inputs?.wiring || 'parallel'}`,
    { anchor: 'above', bold: true, color: blown ? '#c02626' : undefined });
}

export function potentialDrop(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 300, x0 = 90, x1 = 710;
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(x0 - 20, y + 4, (x1 - x0) + 40, 12);
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
  ctx.restore();
  label(ctx, (x0 + x1) / 2, y + 18, 'Uniform resistance wire', { anchor: 'below' });

  /* Potential tapped off the wire is proportional to the length from the
     end, so the voltmeter sweeps linearly as the jockey slides -- which is
     the whole statement being verified. */
  const frac = clamp(state?.jockeyM ?? 0.5, 0, 1);
  const tapX = x0 + (x1 - x0) * frac;
  ctx.save();
  brushedMetal(ctx, tapX - 4, y - 60, 8, 58, { axis: 'v' });
  ctx.fillStyle = shade(th.metal, -0.2);
  ctx.beginPath(); ctx.moveTo(tapX - 7, y - 5); ctx.lineTo(tapX + 7, y - 5); ctx.lineTo(tapX, y); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, tapX, y - 64, `Jockey · ${(frac * 100).toFixed(0)} cm`, { anchor: 'above' });

  // The potential gradient itself, drawn as the ramp it is.
  ctx.save();
  ctx.strokeStyle = rgba(th.accent, 0.55); ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(x0, y - 30); ctx.lineTo(x1, y - 150); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  label(ctx, x1, y - 152, 'Potential gradient (V per metre)', { anchor: 'right', size: 11, color: th.accent });

  const vmax = 3;
  drawDial(ctx, tapX, y - 150, 38, clamp((state?.voltage ?? 0) / vmax, 0, 1), { label: 'Voltmeter', unit: 'V' });
  drawCell(ctx, x0 - 30, y - 80, { label: 'Driver cell' });
  drawResistor(ctx, x0 + 90, y - 120, 60, { label: 'Rheostat' });
  drawKey(ctx, x0 + 220, y - 120, true);

  label(ctx, (x0 + x1) / 2, y - 210,
    `V at the tapping point = ${(state?.voltage ?? 0).toFixed(3)} V`,
    { anchor: 'above', bold: true });
}

export function diodeTester(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, cy = 250;
  const forward = (inputs?.polarity ?? 'forward') === 'forward';
  const conducting = !!state?.conducting;

  // The diode symbol, oriented by the bias actually applied.
  ctx.save();
  ctx.translate(cx, cy);
  if (!forward) ctx.scale(-1, 1);
  ctx.strokeStyle = th.ink; ctx.fillStyle = conducting ? rgba('#0d7a52', 0.35) : 'transparent';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-24, -18); ctx.lineTo(-24, 18); ctx.lineTo(18, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, -18); ctx.lineTo(18, 18); ctx.stroke();
  ctx.restore();
  if (conducting) incandescence(ctx, cx, cy, 34, 0.5, { intensity: 0.7 });
  label(ctx, cx, cy + 24, `${inputs?.component || 'Diode'} — ${forward ? 'forward' : 'reverse'} biased`, { anchor: 'below' });

  // Circuit round it.
  drawWireRect(ctx, cx - 200, cy - 120, cx + 200, cy + 120,
    { current: conducting ? Math.abs(state?.current ?? 0) * 30 : 0 });
  drawCell(ctx, cx - 200, cy, { label: `Supply ${(inputs?.appliedV ?? 0).toFixed(2)} V` });
  drawResistor(ctx, cx, cy - 120, 70, { label: 'Series resistor' });
  drawDial(ctx, cx + 200, cy, 38, clamp((state?.current ?? 0) / 0.05, -1, 1),
    { label: 'Milliammeter', unit: 'mA', zeroCentre: true });

  label(ctx, cx, cy - 170,
    conducting ? `Conducting — ${((state?.current ?? 0) * 1000).toFixed(1)} mA above the knee`
      : forward ? 'Below the knee voltage — almost no current yet'
        : 'Reverse biased — only leakage current',
    { anchor: 'above', bold: true, color: conducting ? '#0d7a52' : '#8a5a00' });
}

export function ldrIntensity(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 260, ldrX = 120;
  const d = inputs.distanceCm ?? 30;
  const lampX = ldrX + 60 + d * 4.4;

  // Optical bench the two sit on.
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(ldrX - 50, y + 60, (lampX - ldrX) + 140, 12);
  ctx.restore();
  label(ctx, (ldrX + lampX) / 2, y + 74, 'Optical bench (metre scale)', { anchor: 'below' });

  /* Illuminance falls as the inverse square of the distance, so the lamp's
     pool of light on the LDR must shrink accordingly -- that is the
     relationship being measured, and it should be visible before it is
     tabulated. */
  const lux = state?.lux ?? 0;
  const bright = clamp(lux / 900, 0, 1);
  ctx.save();
  const g = ctx.createRadialGradient(lampX, y, 2, lampX, y, 40 + bright * 30);
  g.addColorStop(0, rgba('#fff3c8', 0.95));
  g.addColorStop(0.4, rgba('#ffd25e', 0.5));
  g.addColorStop(1, rgba('#ffbb50', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(lampX, y, 40 + bright * 30, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  brushedMetal(ctx, lampX - 6, y + 12, 12, 48, { axis: 'v' });
  label(ctx, lampX, y - 46, `Lamp (${inputs?.lamp || 'source'})`, { anchor: 'above' });

  // The cone of light reaching the cell.
  ctx.save();
  ctx.fillStyle = rgba('#ffd98a', 0.14 + bright * 0.2);
  ctx.beginPath();
  ctx.moveTo(lampX, y - 16); ctx.lineTo(ldrX, y - 22); ctx.lineTo(ldrX, y + 22); ctx.lineTo(lampX, y + 16);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // The cell itself, its zig-zag track lighter the more it is illuminated.
  ctx.save();
  plastic(ctx, ldrX - 22, y - 22, 44, 44, '#3a4152', 6);
  ctx.strokeStyle = mixColor('#6a5a2a', '#ffe9a0', bright);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const yy = y - 16 + i * 6.4;
    ctx.moveTo(ldrX - 14, yy); ctx.lineTo(ldrX + 14, yy);
  }
  ctx.stroke();
  ctx.restore();
  label(ctx, ldrX, y + 26, 'LDR (cadmium sulphide cell)', { anchor: 'below' });

  drawDial(ctx, ldrX, y - 130, 40, clamp(1 - (state?.resistance ?? 0) / 200000, 0, 1),
    { label: 'Ohmmeter', unit: 'Ω' });
  label(ctx, (ldrX + lampX) / 2, y - 190,
    `d = ${d.toFixed(0)} cm · E = ${lux.toFixed(0)} lx · R = ${((state?.resistance ?? 0) / 1000).toFixed(1)} kΩ` +
    (state?.settled ? '' : ' (still responding)'),
    { anchor: 'above', bold: true, color: state?.settled ? undefined : '#8a5a00' });
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
