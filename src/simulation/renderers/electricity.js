/**
 * Apparatus renderers — current electricity, magnetism and electronics.
 */
import {
  label, drawResistor, drawCell, drawKey, drawDial, drawWireRect, drawDigitalReadout,
  drawResistanceBox, theme, brushedMetal, chrome, plastic, contactShadow, incandescence, noteBounds,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp, noise1, drawGlassCard } from './realism.js';

const BENCH_Y = 420;

export function resistivity(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 280, x0 = 90, x1 = 690;
  const ok = inputs?.ammeterMode === 'series' && inputs?.voltmeterMode === 'parallel';
  const I = state?.current ?? 0;

  // Circuit loop, with charge carriers drifting when current flows.
  drawWireRect(ctx, x0, y - 140, x1, y, { current: ok ? clamp(I * 2.2, 0, 3) : 0 });

  /* The wire under test, warming as it carries current. Its resistance
     creeps up with temperature, which is why readings are taken quickly --
     so the wire is shown getting hot rather than that being a footnote. */
  const warm = clamp((state?.tempRise ?? 0) / 40, 0, 1);
  drawResistor(ctx, (x0 + x1) / 2, y, 120, {
    label: `${inputs?.wire || 'constantan'} wire · l = ${(inputs?.lengthCm ?? 100).toFixed(0)} cm, d = ${(inputs?.diameterMm ?? 0.4).toFixed(2)} mm`,
    power: warm,
  });

  drawCell(ctx, x0, y - 70, { label: `Cell ${(inputs?.emf ?? 3).toFixed(1)} V` });
  drawKey(ctx, x0 + 130, y - 140, true);
  drawResistor(ctx, x0 + 290, y - 140, 70, { label: 'Rheostat' });

  drawDial(ctx, x1, y - 70, 42, clamp(I / 1.5, 0, 1),
    { label: `Ammeter (${inputs?.ammeterMode || 'series'})`, unit: 'A' });
  drawDial(ctx, (x0 + x1) / 2, y + 110, 42, clamp((state?.voltage ?? 0) / 6, 0, 1),
    { label: `Voltmeter (${inputs?.voltmeterMode || 'parallel'})`, unit: 'V' });

  label(ctx, (x0 + x1) / 2, y - 200,
    !ok ? 'WRONG WIRING — an ammeter goes in series, a voltmeter in parallel'
      : `I = ${I.toFixed(3)} A · V = ${(state?.voltage ?? 0).toFixed(3)} V · V/I = ${I > 1e-3 ? (state.voltage / I).toFixed(2) : '—'} Ω` +
        (warm > 0.15 ? `  (wire +${(state?.tempRise ?? 0).toFixed(0)} °C — take the reading quickly)` : ''),
    { anchor: 'above', bold: true, color: !ok ? '#c02626' : warm > 0.4 ? '#8a5a00' : undefined });
}

/**
 * A short coil of resistance wire, wound on its own bakelite bobbin — the
 * "unknown resistance" side of the bridge. Drawn as its own small apparatus
 * (not a schematic resistor symbol) so both gaps of the bridge read as
 * real components a student would actually pick up and plug in.
 */
function drawCoil(ctx, cx, cy, ohms, opts = {}) {
  const w = 64, h = 26;
  contactShadow(ctx, cx, cy + h / 2 + 6, w * 1.1, { strength: 0.5 });
  plastic(ctx, cx - w / 2, cy - h / 2, w, h, '#3a2a1a', 6);
  ctx.save();
  ctx.strokeStyle = shade('#c07a3a', 0.1);
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  const turns = 7;
  for (let i = 0; i < turns; i++) {
    const tx = cx - w / 2 + 8 + (i * (w - 16)) / (turns - 1);
    ctx.beginPath();
    ctx.ellipse(tx, cy, 4.5, h / 2 - 2, 0, Math.PI * 0.5, Math.PI * 2.5);
    ctx.stroke();
  }
  ctx.restore();
  const name = opts.label || `Unknown coil S`;
  label(ctx, cx, cy - h / 2 - 4, name, { anchor: 'above' });
  label(ctx, cx, cy + h / 2 + 4, Number.isFinite(ohms) ? `≈ ${ohms.toFixed(1)} Ω (to be found)` : 'to be found', { anchor: 'below', size: 10.5 });
}

export function metreBridge(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 400, x0 = 110, x1 = 690;
  const wireY = 320, stripY = 195;
  const leftGapC = cx - 120, rightGapC = cx + 120, gapHalf = 20;

  /* The jockey is where the model says it is, and the galvanometer reads
     the bridge's off-balance -- so the needle swings THROUGH zero at the
     balance point, which is the null the student is hunting for. */
  const l = state?.jockey ?? inputs.jockeyCm ?? 50;
  const jockeyX = x0 + ((x1 - x0) * l) / 100;
  const defl = state?.deflection ?? 0;
  const balanced = !!state?.balanced;

  // Outer circuit loop — cell, key and the two end terminals — always
  // carries the bridge current whenever the key is closed, independent of
  // whether the galvanometer branch happens to be balanced.
  const cellY = 440;
  drawWireRect(ctx, x0, wireY, x1, cellY, { current: 1.1 });
  drawKey(ctx, x0 + 140, cellY, true);
  drawCell(ctx, cx, cellY, { label: `Cell · ${(inputs?.emf ?? 2).toFixed(1)} V` });

  // Brass end-blocks: the thick terminal blocks the metre wire is soldered
  // into, standing proud of the board and carrying current up to the strip.
  ctx.save();
  brushedMetal(ctx, x0 - 10, stripY, 24, wireY - stripY, { base: '#c9a24a', radius: 2 });
  brushedMetal(ctx, x1 - 14, stripY, 24, wireY - stripY, { base: '#c9a24a', radius: 2 });
  ctx.restore();

  // The top strip, with two gaps for R and S and an unbroken middle span
  // whose midpoint feeds the galvanometer — the actual Wheatstone topology,
  // not just two boxes floating near a wire.
  ctx.save();
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 9; ctx.lineCap = 'butt';
  ctx.beginPath(); ctx.moveTo(x0, stripY); ctx.lineTo(leftGapC - gapHalf, stripY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(leftGapC + gapHalf, stripY); ctx.lineTo(rightGapC - gapHalf, stripY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rightGapC + gapHalf, stripY); ctx.lineTo(x1, stripY); ctx.stroke();
  ctx.strokeStyle = rgba('#fff3c9', 0.35); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0, stripY - 3); ctx.lineTo(leftGapC - gapHalf, stripY - 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(leftGapC + gapHalf, stripY - 3); ctx.lineTo(rightGapC - gapHalf, stripY - 3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rightGapC + gapHalf, stripY - 3); ctx.lineTo(x1, stripY - 3); ctx.stroke();
  ctx.restore();
  // Leads from the gap edges up to the resistance box / coil above.
  ctx.save();
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  [[leftGapC - gapHalf, cx - 190 - 30], [leftGapC + gapHalf, cx - 190 + 30]].forEach(([gx, bx]) => {
    ctx.beginPath(); ctx.moveTo(gx, stripY); ctx.lineTo(gx, stripY - 40); ctx.lineTo(bx, stripY - 40); ctx.lineTo(bx, 85 + 23); ctx.stroke();
  });
  [[rightGapC - gapHalf, cx + 190 - 32], [rightGapC + gapHalf, cx + 190 + 32]].forEach(([gx, bx]) => {
    ctx.beginPath(); ctx.moveTo(gx, stripY); ctx.lineTo(gx, stripY - 40); ctx.lineTo(bx, stripY - 40); ctx.lineTo(bx, 110); ctx.stroke();
  });
  ctx.restore();

  drawResistanceBox(ctx, cx - 190, 85, inputs?.resistanceBox ?? 5, { label: 'Resistance box R' });
  // The unknown coil's own resistance is deliberately never shown — finding
  // it IS the experiment — so drawCoil always reports "to be found".
  drawCoil(ctx, cx + 190, 110, undefined, { label: 'Unknown coil S' });

  // Galvanometer, tapped from the strip's midpoint on one side and
  // following the jockey on the other -- a real, flexible lead, not a
  // fixed wire, since the jockey is the thing that actually moves.
  const gCx = cx, gCy = 108, gR = 44;
  drawDial(ctx, gCx, gCy, gR, defl, { label: 'Galvanometer', zeroCentre: true });
  ctx.save();
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(gCx - 10, gCy + gR); ctx.lineTo(gCx - 10, stripY); ctx.stroke();
  const postX = gCx + 10, postY = wireY - 90;
  ctx.beginPath(); ctx.moveTo(gCx + 10, gCy + gR); ctx.lineTo(postX, postY); ctx.lineTo(jockeyX, postY); ctx.lineTo(jockeyX, wireY - 58); ctx.stroke();
  ctx.restore();

  // The metre wire itself, on its board with a scale under it.
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(x0 - 20, wireY, (x1 - x0) + 40, 12);
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0, wireY - 3); ctx.lineTo(x1, wireY - 3); ctx.stroke();
  ctx.strokeStyle = rgba('#2b2415', 0.7); ctx.font = '600 8px system-ui, sans-serif';
  ctx.fillStyle = rgba('#2b2415', 0.85); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i <= 100; i += 5) {
    const tx = x0 + ((x1 - x0) * i) / 100;
    const major = i % 25 === 0;
    ctx.lineWidth = major ? 1.2 : 0.7;
    ctx.beginPath(); ctx.moveTo(tx, wireY + 12); ctx.lineTo(tx, wireY + 12 + (major ? 8 : 4)); ctx.stroke();
    if (major) ctx.fillText(String(i), tx, wireY + 22);
  }
  ctx.restore();
  label(ctx, (x0 + x1) / 2, wireY + 36, 'Uniform metre wire (1 m, constantan)', { anchor: 'below' });

  // The jockey: a rod and plastic thumb-knob sliding along a guide rail,
  // its metal tip actually touching the wire at the model's own `jockey`
  // position, glowing green right at the null the student is hunting for.
  ctx.save();
  brushedMetal(ctx, jockeyX - 3, wireY - 58, 6, 52, { axis: 'v' });
  plastic(ctx, jockeyX - 9, wireY - 76, 18, 20, balanced ? '#1f7a52' : '#7a3a1f', 6);
  ctx.fillStyle = shade(th.metal, -0.2);
  ctx.beginPath(); ctx.moveTo(jockeyX - 6, wireY - 6); ctx.lineTo(jockeyX + 6, wireY - 6); ctx.lineTo(jockeyX, wireY - 1); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (balanced) incandescence(ctx, jockeyX, wireY - 2, 12, 1, { intensity: 0.5 });
  label(ctx, jockeyX, wireY - 80, `Jockey · ${l.toFixed(1)} cm`, { anchor: 'above' });

  // A frosted glassmorphism HUD, floating above the whole bench, carrying
  // the live balance-condition readout -- the one thing a student is
  // actually watching for, kept legible and prominent rather than another
  // small tag glued to a part of the apparatus.
  const hudX = x0 - 20, hudY = 16, hudW = (x1 + 20) - hudX, hudH = 54;
  // drawGlassCard doesn't call noteBounds itself (it's a plain overlay
  // primitive, not a piece of apparatus) -- without registering its own
  // box here, the scene's auto-fit pass never learns this card exists,
  // and crops/pans it half off the top of the canvas.
  noteBounds(hudX, hudY, hudW, hudH);
  drawGlassCard(ctx, hudX, hudY, hudW, hudH);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = balanced ? '#0d7a52' : th.ink;
  ctx.font = '700 15px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(
    balanced ? `Balanced at l = ${l.toFixed(1)} cm  →  S = R(100−l)/l`
      : defl > 0.02 ? 'Deflection to the right — move the jockey LEFT'
        : defl < -0.02 ? 'Deflection to the left — move the jockey RIGHT'
          : 'Slide the jockey to find the null',
    hudX + hudW / 2, hudY + 8);
  ctx.font = '600 11.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = th.muted;
  ctx.textBaseline = 'bottom';
  ctx.fillText(
    `R = ${(inputs?.resistanceBox ?? 5)} Ω · l = ${l.toFixed(1)} cm · balance condition R/S = l/(100−l)`,
    hudX + hudW / 2, hudY + hudH - 8);
  ctx.restore();
}

export function galvanometer(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 400, dialY = 130, benchY = 340;
  const defl = state?.deflection ?? 0;
  const isConversion = !!inputs?.conversion;

  drawDial(ctx, cx, dialY, 54, defl / 30, { label: 'Galvanometer', zeroCentre: true });

  if (!isConversion) {
    // XII-PHY-A04: half-deflection method. Cell + high resistance R in
    // series with the galvanometer; the shunt S, when connected, sits
    // genuinely IN PARALLEL across the galvanometer's own two terminals —
    // not just a text tag — because that parallel topology is the entire
    // point of the half-deflection method.
    drawWireRect(ctx, cx - 220, dialY + 70, cx + 220, benchY, { current: 0.8 });
    drawCell(ctx, cx - 220, (dialY + 70 + benchY) / 2, { label: `Cell · ${cellOfLabel(inputs)}` });
    drawResistor(ctx, cx, benchY, 90, { label: `High resistance R = ${inputs?.resistanceR ?? 3000} Ω` });
    if (inputs?.shuntConnected) {
      ctx.save();
      ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx - 30, dialY + 54); ctx.lineTo(cx - 30, dialY + 100); ctx.lineTo(cx + 30, dialY + 100); ctx.lineTo(cx + 30, dialY + 54); ctx.stroke();
      ctx.restore();
      drawResistor(ctx, cx, dialY + 100, 50, { label: `Shunt S = ${(inputs?.shuntS ?? 0).toFixed(1)} Ω (parallel)` });
    }
    drawGlassCard(ctx, cx - 220, 18, 440, 46);
    ctx.save();
    ctx.textAlign = 'center'; ctx.font = '700 14px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = state?.settled === false ? th.warn : (inputs?.shuntConnected ? '#0d7a52' : th.ink);
    ctx.textBaseline = 'top';
    ctx.fillText(`Deflection ${defl.toFixed(1)} div${inputs?.shuntConnected ? ' with the shunt connected' : ' (no shunt)'}`, cx, 26);
    ctx.font = '600 11px system-ui, -apple-system, sans-serif'; ctx.fillStyle = th.muted; ctx.textBaseline = 'bottom';
    ctx.fillText('Find the shunt that halves the no-shunt deflection: G = SR/(R−S)', cx, 60);
    ctx.restore();
    noteBounds(cx - 220, 18, 440, 46);
    return;
  }

  // XII-PHY-A05: conversion into an ammeter (shunt, parallel) or a
  // voltmeter (series resistance) of a chosen range — each drawn with its
  // real topology, not a floating text tag, since the whole point of the
  // experiment is that the two conversions are wired oppositely.
  const isAmmeter = inputs.conversion === 'ammeter';
  const req = state?.requiredResistance;
  const unit = isAmmeter ? 'A' : 'V';
  if (isAmmeter) {
    ctx.save();
    ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - 30, dialY + 54); ctx.lineTo(cx - 30, dialY + 100); ctx.lineTo(cx + 30, dialY + 100); ctx.lineTo(cx + 30, dialY + 54); ctx.stroke();
    ctx.restore();
    drawResistor(ctx, cx, dialY + 100, 50, { label: `Shunt S = ${Number.isFinite(req) ? req.toFixed(3) : '—'} Ω (parallel, low-resistance)` });
    drawWireRect(ctx, cx - 200, dialY + 130, cx + 200, benchY, { current: 1 });
  } else {
    drawResistor(ctx, cx, dialY + 100, 90, { label: `Series resistance R = ${Number.isFinite(req) ? req.toFixed(0) : '—'} Ω` });
    drawWireRect(ctx, cx - 200, dialY + 150, cx + 200, benchY, { current: 0.6 });
  }
  drawCell(ctx, cx - 200, (dialY + 150 + benchY) / 2, { label: 'Source under test' });
  drawDigitalReadout(ctx, cx + 130, benchY - 40, 100, 30,
    `${((defl / 30) * (inputs?.targetRange ?? 1)).toFixed(2)} ${unit}`,
    { label: `Converted ${isAmmeter ? 'ammeter' : 'voltmeter'} reads`, size: 16 });

  drawGlassCard(ctx, cx - 220, 18, 440, 46);
  ctx.save();
  ctx.textAlign = 'center'; ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = th.ink; ctx.textBaseline = 'top';
  ctx.fillText(`Range 0–${(inputs?.targetRange ?? 1).toFixed(1)} ${unit} · applied ${(inputs?.testValue ?? 0).toFixed(2)} ${unit}`, cx, 26);
  ctx.font = '600 11px system-ui, -apple-system, sans-serif'; ctx.fillStyle = th.muted; ctx.textBaseline = 'bottom';
  ctx.fillText(
    isAmmeter ? `Meter resistance ≈ ${Number.isFinite(state?.meterResistance) ? state.meterResistance.toFixed(3) : '—'} Ω — very LOW, as an ammeter (in series) must be`
      : `Meter resistance ≈ ${Number.isFinite(state?.meterResistance) ? state.meterResistance.toFixed(0) : '—'} Ω — very HIGH, as a voltmeter (in parallel) must be`,
    cx, 60);
  ctx.restore();
  noteBounds(cx - 220, 18, 440, 46);
}
function cellOfLabel(inputs) { return `${{ c2: 2, c3: 3, c4: 4 }[inputs?.cell] ?? 2} V`; }

export function inductorImpedance(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, cy = 240;
  const ac = inputs?.supply === 'ac';
  const iron = inputs?.core === 'iron';

  // The coil, wound on its former, with the core actually in it or not.
  ctx.save();
  if (iron) {
    const g = ctx.createLinearGradient(0, cy - 14, 0, cy + 14);
    g.addColorStop(0, '#8b93a3'); g.addColorStop(0.4, '#cfd6e0'); g.addColorStop(1, '#4d5462');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 150, cy - 13, 300, 26);
  }
  ctx.strokeStyle = shade('#c07a3a', 0.1); ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.ellipse(cx - 110 + i * 20, cy, 10, 30, 0, Math.PI * 0.86, Math.PI * 2.14);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, cx, cy + 38, iron ? 'Coil with soft-iron core' : 'Coil, air core', { anchor: 'below' });
  I_apparatus(cx, cy);

  /* An iron core multiplies the inductance, so on AC it chokes the
     current -- the demonstration this activity exists for. Showing the
     field concentrating in the core is what makes that believable. */
  if (ac) {
    ctx.save();
    const k = iron ? 1 : 0.4;
    ctx.strokeStyle = rgba(th.accent, 0.35 * k);
    ctx.lineWidth = 1.4;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 150 + i * 26, 30 + i * 20, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    label(ctx, cx + 230, cy - 60, iron ? 'Flux concentrated in the core' : 'Flux mostly in air',
      { anchor: 'right', size: 11, color: th.accent });
  }

  // Circuit.
  drawWireRect(ctx, cx - 260, cy - 150, cx + 260, cy + 150,
    { current: ac ? 0 : clamp((state?.current ?? 0) * 2, 0, 3) });
  drawCell(ctx, cx - 260, cy, { label: `${ac ? 'AC' : 'DC'} supply · ${(inputs?.voltageV ?? 6).toFixed(1)} V` });
  drawKey(ctx, cx - 120, cy - 150, true);

  const range = { a10: 10, a5: 5, a2: 2 }[inputs?.ammeter] || 5;
  drawDial(ctx, cx + 260, cy, 42, clamp((state?.current ?? 0) / range, 0, 1),
    { label: `Ammeter (0–${range} A)`, unit: 'A' });

  // The supply waveform — flat for DC, sinusoidal for AC.
  ctx.save();
  ctx.strokeStyle = rgba('#c02626', 0.85); ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (let i = 0; i <= 80; i++) {
    const f = i / 80;
    const xx = cx - 120 + f * 240;
    const yy = cy - 200 - (ac ? Math.sin(f * Math.PI * 4 + (state?.phase ?? 0)) * 22 : 0);
    i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.restore();
  label(ctx, cx - 126, cy - 200, ac ? `AC ${inputs?.frequencyHz ?? 50} Hz` : 'DC', { anchor: 'left', size: 11 });

  label(ctx, cx, cy - 240,
    state?.pinned ? 'OVER RANGE — the needle is pinned, use a larger ammeter'
      : ac ? `Opposition = √(R² + (2πfL)²) = ${(state?.opposition ?? 0).toFixed(2)} Ω · I = ${(state?.current ?? 0).toFixed(3)} A`
        : `On DC only R opposes: ${(state?.opposition ?? 0).toFixed(2)} Ω · I = ${(state?.current ?? 0).toFixed(3)} A`,
    { anchor: 'above', bold: true, color: state?.pinned ? '#c02626' : undefined });
}

/** Register the coil so the pointer can name it. */
function I_apparatus(cx, cy) {
  noteBounds(cx - 170, cy - 46, 340, 92);
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
    blown ? `Fuse blew at ${(inputs?.fuseRatingA ?? 5)} A — too many lamps on this circuit`
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
  drawCell(ctx, cx - 200, cy, { label: 'Meter’s diode-test range' });
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

/**
 * A rheostat symbol that actually shows which mode it is wired in: a
 * sliding arrow across the resistor body when only the wiper and one end
 * are used (a true variable arm), or nothing extra when it is wired
 * across its whole track (a fixed resistor in every way that matters,
 * however it is labelled).
 */
function drawRheostat(ctx, x, y, w, variable) {
  drawResistor(ctx, x, y, w, { label: variable ? 'Rheostat (variable arm)' : 'Rheostat (across full track — fixed!)' });
  if (variable) {
    ctx.save();
    ctx.strokeStyle = theme().accent; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 4, y + 14); ctx.lineTo(x + 6, y - 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 6, y - 14); ctx.lineTo(x + 1, y - 10); ctx.lineTo(x + 10, y - 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

/**
 * XII-PHY-ACT-A4 — the previous version checked `inputs.wiringCorrect`,
 * a field that does not exist anywhere on this model (the real fields
 * are ammeterMode/voltmeterMode/polarity/rheostatMode/keyState), so it
 * always rendered as if the wiring were correct and never actually drew
 * any of the five deliberate faults this activity exists to teach.
 * Rebuilt so each fault changes the DIAGRAM, not just the meter numbers:
 * the ammeter moves from the main loop to a bypass branch around the
 * load when wired in parallel; the voltmeter moves from a branch across
 * the load into the main loop when wired in series; the rheostat shows
 * its wiper arrow only when actually used as a variable arm; and a
 * reversed meter deflects backwards past zero, using the physically
 * correct current/voltage the model itself computes for the fault.
 */
export function circuitAssembly(ctx, w, h, state, inputs) {
  const th = theme();
  const x0 = 130, x1 = 650, yTop = 160, yBot = 340;
  const ammeterSeries = inputs?.ammeterMode !== 'parallel';
  const voltmeterSeries = inputs?.voltmeterMode === 'series';
  const reversed = inputs?.polarity === 'reversed';
  const keyOpen = inputs?.keyState !== 'closed';

  // Main loop: cell (bottom-left) -> up -> key -> rheostat -> across the
  // top -> down the right side (through the ammeter, unless it has been
  // wired in parallel instead) -> the load -> back along the bottom.
  // The wrong-wiring dials sit further right/above the main rectangle
  // than anything else in this scene registers on its own — reserve the
  // room up front so the auto-fit pass never has to guess.
  noteBounds(x0 - 20, yTop - 70, (x1 + 190) - (x0 - 20), (yBot + 30) - (yTop - 70));
  drawWireRect(ctx, x0, yTop, x1, yBot, { current: keyOpen ? 0 : clamp((state?.currentA ?? 0) * 6, 0, 3) });
  drawCell(ctx, x0, (yTop + yBot) / 2, { label: `Cell · ${cellAssemblyLabel(inputs)}` });
  drawKey(ctx, x0 + 90, yTop, !keyOpen);
  drawRheostat(ctx, (x0 + x1) / 2 - 40, yTop, 90, inputs?.rheostatMode !== 'full');

  const loadY = (yTop + yBot) / 2;
  drawResistor(ctx, x1, loadY, 70, { label: `Load · ${loadAssemblyLabel(inputs)}`, note: 'rotated in the diagram — current flows top to bottom through it here' });

  // The ammeter: correctly in series along the top-right corner down to
  // the load, or — wired wrongly — bypassing the load entirely through
  // its own near-zero resistance.
  if (ammeterSeries) {
    drawDial(ctx, x1, yTop + 55, 30, reversed ? -clamp((state?.currentA ?? 0) / 1, 0, 1) : clamp((state?.currentA ?? 0) / 1, 0, 1),
      { label: `Ammeter${reversed ? ' (reversed!)' : ''}`, zeroCentre: true });
  } else {
    ctx.save();
    ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(x1 + 60, loadY - 45); ctx.lineTo(x1 + 60, loadY + 45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, loadY - 45); ctx.lineTo(x1 + 60, loadY - 45); ctx.moveTo(x1, loadY + 45); ctx.lineTo(x1 + 60, loadY + 45); ctx.stroke();
    ctx.restore();
    drawDial(ctx, x1 + 100, loadY, 30, reversed ? -clamp((state?.currentA ?? 0) / 2, 0, 1) : clamp((state?.currentA ?? 0) / 2, 0, 1),
      { label: `Ammeter — WRONG!${reversed ? ' reversed' : ''}`, zeroCentre: true });
  }

  // The voltmeter: correctly across the load (a branch, drawing almost no
  // current), or — wired wrongly — inserted directly into the main loop.
  if (voltmeterSeries) {
    drawDial(ctx, (x0 + x1) / 2 + 60, yTop + 55, 30, reversed ? -clamp((state?.voltageV ?? 0) / 6, 0, 1) : clamp((state?.voltageV ?? 0) / 6, 0, 1),
      { label: `Voltmeter — WRONG!${reversed ? ' reversed' : ''}`, zeroCentre: true });
  } else {
    ctx.save();
    ctx.strokeStyle = '#1d5fd4'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x1 - 40, loadY - 45); ctx.lineTo(x1 - 40, loadY + 45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1 - 40, loadY - 45); ctx.lineTo(x1, loadY - 45); ctx.moveTo(x1 - 40, loadY + 45); ctx.lineTo(x1, loadY + 45); ctx.stroke();
    ctx.restore();
    drawDial(ctx, x1 - 110, loadY, 30, reversed ? -clamp((state?.voltageV ?? 0) / 6, 0, 1) : clamp((state?.voltageV ?? 0) / 6, 0, 1),
      { label: `Voltmeter${reversed ? ' (reversed!)' : ''}`, zeroCentre: true });
  }

  drawGlassCard(ctx, x0 - 20, 40, (x1 + 130) - (x0 - 20), 44);
  ctx.save();
  ctx.textAlign = 'center'; ctx.font = '700 13.5px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = keyOpen ? th.ink : '#c02626';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    keyOpen ? 'Key open — check every connection against the diagram before closing it'
      : `Key closed — I = ${(state?.currentA ?? 0).toFixed(3)} A, V = ${(state?.voltageV ?? 0).toFixed(2)} V across the load`,
    (x0 - 20 + x1 + 130) / 2, 62);
  ctx.restore();
  noteBounds(x0 - 20, 40, (x1 + 130) - (x0 - 20), 44);
}
function cellAssemblyLabel(inputs) { return { c15: '1.5 V', c30: '3.0 V', c60: '6.0 V' }[inputs?.cell] ?? '3.0 V'; }
function loadAssemblyLabel(inputs) { return { r10: '10 Ω', r22: '22 Ω', r47: '47 Ω', lamp: '6 V lamp' }[inputs?.load] ?? '22 Ω'; }

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
