/**
 * Apparatus renderers — mechanics and measuring instruments.
 *
 * Every renderer here draws the LIVE state its model is producing, not a
 * still life of the apparatus: the block that stays put until it slips,
 * the projectile in flight, the beam that oscillates before it settles,
 * the pendulum whose envelope is decaying. Signature is
 * (ctx, w, h, state, inputs) throughout, and the scene is laid out in
 * scene space against a shared bench so the frame can be fitted to it.
 */
import {
  label, bench, dashedLine, drawRuler, drawWeight, drawPendulumBob, drawSpring,
  drawDial, drawUpright, drawRetortStand, drawClamp, theme, noteBounds, brushedMetal,
  chrome, plastic, contactShadow,
} from './apparatus.js';
import { clock, rgba, shade, clamp, lerp, noise1 } from './realism.js';

/* One bench line for the whole file, so scenes cannot drift apart. */
const BENCH_Y = 430;

/** A jaw-style instrument (vernier callipers / screw gauge) gripping a specimen. */
function drawJawInstrument(ctx, cx, cy, gap, instrumentLabel, specimenLabel, opts = {}) {
  const th = theme();
  ctx.save();
  // Beam and fixed jaw.
  brushedMetal(ctx, cx - 150, cy - 7, 250, 14, { axis: 'h' });
  brushedMetal(ctx, cx - 158, cy - gap / 2 - 46, 16, gap + 92, { axis: 'v' });
  // Jaws.
  ctx.strokeStyle = shade(th.metal, -0.05);
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 150, cy - gap / 2); ctx.lineTo(cx - 30, cy - gap / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 150, cy + gap / 2); ctx.lineTo(cx - 30, cy + gap / 2); ctx.stroke();
  ctx.restore();

  // The specimen actually gripped between them.
  if (specimenLabel && gap < 200) {
    ctx.save();
    const r = Math.max(3, gap / 2 - 3);
    const g = ctx.createRadialGradient(cx - 82, cy - r * 0.4, r * 0.1, cx - 75, cy, r);
    g.addColorStop(0, '#f0dca6'); g.addColorStop(0.5, '#c9a24a'); g.addColorStop(1, '#6d5320');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx - 75, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    label(ctx, cx - 75, cy + gap / 2 + 6, specimenLabel, { anchor: 'below' });
  }
  label(ctx, cx - 60, cy - gap / 2 - 50, instrumentLabel, { anchor: 'above', bold: true });
  noteBounds(cx - 170, cy - gap / 2 - 70, 320, gap + 140);
}

/**
 * The magnified scale window every one of these instruments is actually
 * read through — main scale above, sliding scale below, and the division
 * that coincides picked out, because finding the coincidence IS the skill
 * being examined.
 */
function drawScaleWindow(ctx, x, y, wid, opts = {}) {
  const { mainDiv = 10, subDiv = 10, offset = 0, subLabel = 'Vernier scale', reading = '' } = opts;
  const th = theme();
  ctx.save();
  plastic(ctx, x - 8, y - 30, wid + 16, 82, th.isDark ? '#243149' : '#e9eef7', 6);
  // Main scale.
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1;
  ctx.font = '600 8px system-ui, sans-serif';
  ctx.fillStyle = th.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (let i = 0; i <= mainDiv; i++) {
    const tx = x + (wid * i) / mainDiv;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 1.3 : 0.8;
    ctx.beginPath(); ctx.moveTo(tx, y - 20); ctx.lineTo(tx, y - (major ? 4 : 9)); ctx.stroke();
    if (major) ctx.fillText(String(i), tx, y - 22);
  }
  // Sliding scale, displaced by the fractional part being read.
  const slide = x + offset * (wid / mainDiv);
  ctx.strokeStyle = th.accent;
  ctx.textBaseline = 'top';
  ctx.fillStyle = th.accent;
  // Which division coincides: the whole point of a vernier.
  const coincide = Math.round(offset * subDiv) % subDiv;
  for (let i = 0; i <= subDiv; i++) {
    // A vernier's divisions are slightly SHORTER than the main scale's --
    // (n-1) main divisions spread over n vernier divisions. That mismatch
    // is the whole instrument, so it is drawn, not approximated.
    const tx = slide + (i * wid * (mainDiv - 1)) / (mainDiv * subDiv);
    const hit = i === coincide;
    ctx.lineWidth = hit ? 2 : 0.9;
    ctx.strokeStyle = hit ? '#c02626' : th.accent;
    ctx.beginPath(); ctx.moveTo(tx, y + 2); ctx.lineTo(tx, y + (hit ? 20 : 13)); ctx.stroke();
    if (hit) { ctx.fillStyle = '#c02626'; ctx.fillText(String(i), tx, y + 21); ctx.fillStyle = th.accent; }
  }
  ctx.restore();
  label(ctx, x + wid / 2, y + 54, `${subLabel}${reading ? ` · ${reading}` : ''}`, { anchor: 'below', size: 11 });
  noteBounds(x - 12, y - 46, wid + 24, 110);
}

export function vernierCallipers(ctx, w, h, state, inputs) {
  const cx = 430, cy = 210;
  // The jaws sit at the size the model has actually travelled to.
  const mm = (state?.jaw ?? 0) * 1000 || (inputs?.jawOpening ?? 2) * 10;
  const gap = clamp(24 + mm * 3.4, 24, 190);
  drawJawInstrument(ctx, cx, cy, gap, 'Vernier callipers', 'Specimen');
  const frac = (mm / 10) % 1;
  drawScaleWindow(ctx, cx - 150, cy + 150, 300, {
    offset: frac, subLabel: 'Main scale + vernier scale',
    reading: `${mm.toFixed(2)} mm${state?.gripped ? '' : ' — closing…'}`,
  });
  label(ctx, cx + 150, cy - 40,
    state?.gripped ? 'Jaws closed on the specimen — take the reading'
      : 'Closing the jaws…', { anchor: 'right', color: state?.gripped ? '#0d7a52' : undefined });
}

export function screwGauge(ctx, w, h, state, inputs) {
  const cx = 430, cy = 200;
  const mm = state?.spindle ?? (inputs?.thimble ?? 0.5);
  const gap = clamp(20 + mm * 26, 20, 170);
  drawJawInstrument(ctx, cx, cy, gap, 'Screw gauge', 'Wire');

  // The thimble, turned to the fraction the model reports.
  const tx = cx + 60, ty = cy;
  ctx.save();
  brushedMetal(ctx, tx - 8, ty - 34, 70, 68, { axis: 'h' });
  ctx.strokeStyle = rgba(theme().ink, 0.65);
  const turn = (state?.thimble ?? 0) * Math.PI * 2;
  for (let i = 0; i < 24; i++) {
    const a = turn + (i / 24) * Math.PI * 2;
    const yy = ty + Math.sin(a) * 30;
    if (Math.cos(a) < 0) continue;                 // only the near face
    ctx.lineWidth = i % 5 === 0 ? 1.5 : 0.8;
    ctx.beginPath(); ctx.moveTo(tx + 2, yy); ctx.lineTo(tx + (i % 5 === 0 ? 22 : 14), yy); ctx.stroke();
  }
  ctx.restore();
  label(ctx, tx + 62, ty - 40, 'Thimble (circular scale)', { anchor: 'right' });
  label(ctx, cx - 160, cy - 60, 'Ratchet', { anchor: 'left' });
  drawScaleWindow(ctx, cx - 150, cy + 150, 300, {
    offset: (mm / 0.5) % 1, mainDiv: 10, subDiv: 50,
    subLabel: 'Pitch scale + circular scale',
    reading: `${mm.toFixed(3)} mm${state?.gripped ? ' — ratchet slipping' : ' — turning'}`,
  });
}

export function irregularLamina(ctx, w, h, state, inputs) {
  const th = theme();
  const ox = 90, oy = 60, gw = 420, gh = 320, n = 16;
  ctx.save();
  ctx.fillStyle = th.isDark ? '#1b2740' : '#fdfdf7';
  ctx.fillRect(ox, oy, gw, gh);
  ctx.strokeStyle = rgba('#3d7ae5', 0.35); ctx.lineWidth = 0.7;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(ox + (gw * i) / n, oy); ctx.lineTo(ox + (gw * i) / n, oy + gh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy + (gh * i) / n); ctx.lineTo(ox + gw, oy + (gh * i) / n); ctx.stroke();
  }
  ctx.restore();

  /* The lamina hangs from a pin and swings until it settles; the vertical
     it settles to is the line the student must rule, which is why the
     reading cannot be taken until the swing has died away. */
  const swing = state?.swing ?? 0;
  const pinX = ox + gw * 0.55, pinY = oy + gh * 0.16;
  ctx.save();
  ctx.translate(pinX, pinY); ctx.rotate(swing); ctx.translate(-pinX, -pinY);
  ctx.fillStyle = rgba(th.accent, 0.32);
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(pinX - gw * 0.22, pinY + gh * 0.06);
  ctx.bezierCurveTo(pinX + gw * 0.2, pinY - gh * 0.04, pinX + gw * 0.3, pinY + gh * 0.4, pinX + gw * 0.06, pinY + gh * 0.64);
  ctx.bezierCurveTo(pinX - gw * 0.2, pinY + gh * 0.8, pinX - gw * 0.38, pinY + gh * 0.4, pinX - gw * 0.22, pinY + gh * 0.06);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  // Plumb line from the same pin — the reference the vertical is ruled against.
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath(); ctx.moveTo(pinX, pinY); ctx.lineTo(pinX, oy + gh); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#8a5a2b';
  ctx.beginPath(); ctx.moveTo(pinX - 5, oy + gh - 16); ctx.lineTo(pinX + 5, oy + gh - 16); ctx.lineTo(pinX, oy + gh); ctx.closePath(); ctx.fill();
  chrome(ctx, pinX - 4, pinY - 4, 8, 8, 4);
  ctx.restore();
  label(ctx, pinX, pinY - 6, 'Pin (suspension hole)', { anchor: 'above', leader: true });
  label(ctx, pinX + 6, oy + gh - 8, 'Plumb line', { anchor: 'right' });
  label(ctx, ox + gw / 2, oy + gh + 6, 'Irregular lamina traced on graph paper', { anchor: 'below' });
  label(ctx, ox + gw + 20, oy + 40,
    state?.settled ? 'At rest — rule the vertical' : 'Still swinging — wait',
    { anchor: 'right', bold: true, color: state?.settled ? '#0d7a52' : '#8a5a00' });
}

export function spherometer(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 400, cy = 250;
  contactShadow(ctx, cx, cy + 96, 240, { strength: 0.6 });
  // Glass plate / the surface being measured.
  ctx.save();
  ctx.fillStyle = rgba('#bcd4ea', 0.55);
  ctx.strokeStyle = rgba(th.stroke, 0.5); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(cx, cy + 90, 150, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, cx + 152, cy + 90, 'Glass plate / curved surface', { anchor: 'right' });

  // Tripod legs.
  ctx.save();
  ctx.strokeStyle = shade(th.metal, -0.15); ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const dx of [-96, 96, 0]) {
    ctx.beginPath(); ctx.moveTo(cx + dx * 0.28, cy - 10); ctx.lineTo(cx + dx, cy + 86); ctx.stroke();
  }
  ctx.restore();

  // The central screw, at the height the model has driven it to.
  const screw = state?.screw ?? 0;
  const legY = cy + 86 - clamp(screw, -3, 3) * 12;
  brushedMetal(ctx, cx - 3, cy - 96, 6, legY - (cy - 96), { axis: 'v' });

  // Graduated disc, rotating with the screw.
  ctx.save();
  const discR = 62;
  ctx.fillStyle = th.isDark ? '#243350' : '#f6f8fc';
  ctx.beginPath(); ctx.arc(cx, cy - 96, discR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = shade(th.metal, -0.2); ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = rgba(th.ink, 0.7);
  for (let i = 0; i < 50; i++) {
    const a = screw * Math.PI * 2 + (i / 50) * Math.PI * 2;
    const major = i % 10 === 0;
    ctx.lineWidth = major ? 1.4 : 0.7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (discR - 3), cy - 96 + Math.sin(a) * (discR - 3));
    ctx.lineTo(cx + Math.cos(a) * (discR - (major ? 13 : 8)), cy - 96 + Math.sin(a) * (discR - (major ? 13 : 8)));
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, cx, cy - 96 - discR - 4, 'Circular (disc) scale', { anchor: 'above' });
  label(ctx, cx - 100, cy - 30, 'Vertical (pitch) scale', { anchor: 'left' });
  label(ctx, cx, cy + 112,
    state?.contact ? 'Central leg just touching — read the disc' : 'Turning the screw down…',
    { anchor: 'below', bold: true, color: state?.contact ? '#0d7a52' : undefined });
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
  const cx = 400, cy = 210;
  const P = inputs.pGwt ?? 100, Q = inputs.qGwt ?? 100;
  const scale = 0.85;
  /* These angles come from the model's own equilibrium solution
     (stringAnglesRad), not a fixed guess — they are exactly the angles at
     which the resultant of P and Q is vertical, equal and opposite to S.
     Drawing them at any fixed angle instead (as an earlier version did)
     produces a picture whose own resultant is NOT vertical: a diagram that
     visibly contradicts the equilibrium it claims to show. */
  const angP = state?.angPScreen ?? Math.PI * 0.78;
  const angQ = state?.angQScreen ?? Math.PI * 0.22;
  // The knot settles into equilibrium rather than being pinned there.
  const kx = cx + (state?.knotX ?? 0) * 40;
  const ky = cy + (state?.knotY ?? 0) * 40;

  // Board and pulleys.
  ctx.save();
  ctx.fillStyle = rgba(th.isDark ? '#22314c' : '#f2ede0', 0.9);
  ctx.fillRect(90, 60, 620, 330);
  ctx.strokeStyle = rgba(th.stroke, 0.4); ctx.lineWidth = 1.4;
  ctx.strokeRect(90, 60, 620, 330);
  ctx.restore();
  label(ctx, 400, 58, 'Gravesand apparatus (vertical board)', { anchor: 'above' });

  const px = kx + P * scale * Math.cos(angP), py = ky - P * scale * Math.sin(angP);
  const qx = kx + Q * scale * Math.cos(angQ), qy = ky - Q * scale * Math.sin(angQ);
  for (const [x, y] of [[px, py], [qx, qy]]) {
    chrome(ctx, x - 10, y - 10, 20, 20, 10);
    ctx.save();
    ctx.strokeStyle = th.accent; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
  }
  // The unknown weight, hanging straight down from the knot.
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx, ky + 130); ctx.stroke();
  ctx.restore();
  drawWeight(ctx, kx, ky + 130, { label: 'Unknown weight S' });

  // The parallelogram the two known forces close, and its resultant.
  dashedLine(ctx, px, py, px + (qx - kx), py + (qy - ky), rgba(th.dim, 0.9));
  dashedLine(ctx, qx, qy, qx + (px - kx), qy + (py - ky), rgba(th.dim, 0.9));
  ctx.save();
  ctx.strokeStyle = '#0d7a52'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(px + (qx - kx), py + (qy - ky)); ctx.stroke();
  ctx.restore();
  label(ctx, px + (qx - kx) / 2, py + (qy - ky) / 2, 'Resultant R', { anchor: 'right', color: '#0d7a52', size: 11 });

  label(ctx, px, py - 12, `P = ${P} gwt`, { anchor: 'above' });
  label(ctx, qx, qy - 12, `Q = ${Q} gwt`, { anchor: 'above' });
  label(ctx, kx - 8, ky, 'Knot', { anchor: 'left' });
  label(ctx, 400, 410,
    state?.settled ? 'Knot at rest — R is equal and opposite to S' : 'Knot still settling…',
    { anchor: 'below', bold: true, color: state?.settled ? '#0d7a52' : undefined });
}
export function simplePendulum(ctx, w, h, state, inputs) {
  const th = theme();
  const pivotX = w / 2, pivotY = 30;
  const lenPx = 20 + ((inputs.lengthCm ?? 60) / 150) * (h - 90);
  const angle = ((state?.angleDeg ?? inputs.amplitudeDeg ?? 8) * Math.PI) / 180;
  /* The bob is draggable along the thread and bound to L in centimetres,
     not to its pixel position: releasing it re-enters the model, which
     recomputes T = 2π√(L/g) exactly as it would from the slider. */
  drawPendulumBob(ctx, pivotX, pivotY, lenPx, angle, {
    label: 'Bob',
    drag: {
      varId: 'lengthCm', axis: 'y', unit: 'length L in cm',
      p0: pivotY + 20, p1: pivotY + 20 + (h - 90), v0: 0, v1: 150,
    },
  });
  label(ctx, pivotX, pivotY, 'Support / clamp', { anchor: 'above' });
  label(ctx, pivotX + 60, pivotY + lenPx / 2, `L = ${(inputs.lengthCm ?? 60).toFixed(0)} cm`, { anchor: 'right', bg: false });
  ctx.save(); ctx.fillStyle = th.muted; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`Stop-clock: ${(state?.stopwatch ?? 0).toFixed(1)} s   Oscillations: ${state?.completedOscillations ?? 0}/${inputs.oscillations ?? 20}`, w / 2, h - 14);
  ctx.restore();
}
export function friction(ctx, w, h, state, inputs) {
  const th = theme();
  const tableY = 300, x0 = 60, pulleyX = 620;
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(x0, tableY, pulleyX - x0 + 20, 14);
  ctx.strokeStyle = rgba('#3a2412', 0.4); ctx.lineWidth = 1;
  ctx.strokeRect(x0, tableY, pulleyX - x0 + 20, 14);
  ctx.restore();
  label(ctx, (x0 + pulleyX) / 2, tableY + 15, 'Horizontal table', { anchor: 'below' });

  const blockW = inputs.face === 'narrow' ? 46 : 92;
  const blockH = inputs.face === 'narrow' ? 56 : 32;
  /* The block sits still until the pull exceeds limiting friction, then
     slides. `state.x` is the model's integrated displacement, so what is
     seen is the motion the physics produced. */
  const slid = clamp((state?.x ?? 0) * 260, 0, pulleyX - x0 - blockW - 130);
  const bx = 150 + slid;
  contactShadow(ctx, bx + blockW / 2, tableY + 1, blockW * 1.2, { strength: 0.5 });
  ctx.save();
  const g = ctx.createLinearGradient(0, tableY - blockH, 0, tableY);
  g.addColorStop(0, '#d8a973'); g.addColorStop(0.4, '#b98a5a'); g.addColorStop(1, '#8a6236');
  ctx.fillStyle = g;
  ctx.fillRect(bx, tableY - blockH, blockW, blockH);
  ctx.strokeStyle = rgba('#4a3016', 0.6); ctx.lineWidth = 1.2;
  ctx.strokeRect(bx, tableY - blockH, blockW, blockH);
  ctx.restore();
  label(ctx, bx + blockW / 2, tableY - blockH - 4, 'Wooden block', { anchor: 'above' });

  // Thread over the pulley to the pan.
  ctx.save();
  ctx.strokeStyle = rgba(th.ink, 0.8); ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bx + blockW, tableY - blockH / 2);
  ctx.lineTo(pulleyX, tableY - blockH / 2);
  ctx.stroke();
  ctx.restore();
  chrome(ctx, pulleyX - 12, tableY - blockH / 2 - 12, 24, 24, 12);
  label(ctx, pulleyX + 14, tableY - blockH / 2 - 16, 'Frictionless pulley', { anchor: 'right' });

  const panDrop = clamp((state?.x ?? 0) * 260, 0, 120);
  drawWeight(ctx, pulleyX, tableY - blockH / 2 + 34 + panDrop, { label: `Pan + weights (${inputs.loadG ?? 0} g)` });

  // Force arrows: what is pulling, and what is holding it back.
  const applied = state?.applied ?? 0;
  const scale = 240;
  if (applied > 0.0005) {
    arrowLabel(ctx, bx + blockW, tableY - blockH / 2, applied * scale, th.accent, `Pull ${(applied).toFixed(3)} N`);
    const back = state?.slipping ? applied * 0.85 : applied;
    arrowLabel(ctx, bx, tableY - blockH / 2, -back * scale, '#c02626',
      state?.slipping ? 'Kinetic friction' : 'Static friction (matches the pull)');
  }
  label(ctx, (x0 + pulleyX) / 2, 130,
    state?.slipping ? `Slipping — the block is accelerating (v = ${(state.v ?? 0).toFixed(2)} m/s)`
      : applied > 0 ? 'Static friction is still holding it — add more load'
        : 'Add weights to the pan',
    { anchor: 'above', bold: true, color: state?.slipping ? '#c02626' : undefined });
}

/** A horizontal force arrow with its magnitude named beside it. */
function arrowLabel(ctx, x, y, len, colour, text) {
  if (Math.abs(len) < 2) return;
  ctx.save();
  ctx.strokeStyle = colour; ctx.fillStyle = colour; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
  const d = Math.sign(len);
  ctx.beginPath();
  ctx.moveTo(x + len, y);
  ctx.lineTo(x + len - d * 9, y - 5);
  ctx.lineTo(x + len - d * 9, y + 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, x + len / 2, y - 8, text, { anchor: 'above', size: 11, color: colour });
}
export function inclinedPlane(ctx, w, h, state, inputs) {
  const th = theme();
  const ang = ((inputs.angleDeg ?? 30) * Math.PI) / 180;
  const baseX = 90, baseY = 380, L = 420;
  const topX = baseX + L * Math.cos(ang), topY = baseY - L * Math.sin(ang);

  ctx.save();
  ctx.fillStyle = rgba(th.wood, 0.9);
  ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(topX, topY); ctx.lineTo(topX, baseY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba('#3a2412', 0.55); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.restore();
  label(ctx, (baseX + topX) / 2, baseY + 6, 'Inclined plane', { anchor: 'below' });
  label(ctx, baseX + 74, baseY - 12, `θ = ${(inputs.angleDeg ?? 30).toFixed(0)}°`, { anchor: 'right', bold: true });

  /* The roller sits where the model has moved it: still when the pan load
     balances the component of weight down the slope, accelerating either
     way when it does not. */
  const along = clamp(0.42 + (state?.s ?? 0) * 0.02, 0.06, 0.92);
  const rx = baseX + (topX - baseX) * along;
  const ry = baseY + (topY - baseY) * along;
  const R = 22;
  const nx = Math.sin(ang), ny = -Math.cos(ang);
  ctx.save();
  const g = ctx.createRadialGradient(rx + nx * R - 6, ry + ny * R - 8, 3, rx + nx * R, ry + ny * R, R);
  g.addColorStop(0, '#e9edf4'); g.addColorStop(0.5, '#98a2b4'); g.addColorStop(1, '#414a5b');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(rx + nx * R, ry + ny * R, R, 0, Math.PI * 2); ctx.fill();
  // Spokes, so rolling is visible as rotation and not just translation.
  ctx.strokeStyle = rgba('#22293a', 0.55); ctx.lineWidth = 1.6;
  const roll = (state?.s ?? 0) / (R / 100);
  for (let i = 0; i < 4; i++) {
    const a = roll + (i / 4) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(rx + nx * R, ry + ny * R);
    ctx.lineTo(rx + nx * R + Math.cos(a) * R * 0.82, ry + ny * R + Math.sin(a) * R * 0.82);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, rx + nx * R, ry + ny * R - R - 4, 'Roller', { anchor: 'above' });

  // Thread up the slope, over the pulley at the top, to the pan.
  ctx.save();
  ctx.strokeStyle = rgba(th.ink, 0.8); ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(rx + nx * R, ry + ny * R);
  ctx.lineTo(topX + nx * R, topY + ny * R);
  ctx.stroke();
  ctx.restore();
  chrome(ctx, topX + nx * R - 10, topY + ny * R - 10, 20, 20, 10);
  drawWeight(ctx, topX + nx * R + 4, topY + ny * R + 28, { label: `Pan ${inputs.panGwt ?? 0} gwt` });

  label(ctx, 470, 150,
    state?.balanced ? 'Balanced — the pan load equals the force along the plane'
      : (state?.v ?? 0) > 0 ? 'Pan is heavier — the roller is being pulled up'
        : 'Roller is running down — add load',
    { anchor: 'right', bold: true, color: state?.balanced ? '#0d7a52' : '#8a5a00' });
}
export function youngsModulus(ctx, w, h, state, inputs) {
  const th = theme();
  const topY = 60, cx = 400;
  const restLen = 250;
  // Extension from the model, magnified so a fraction of a millimetre reads.
  const ext = (state?.extension ?? 0) * 1000 * 260;
  const len = restLen + clamp(ext, 0, 130);

  // Rigid support.
  ctx.save();
  ctx.fillStyle = shade(th.metal, -0.3);
  ctx.fillRect(cx - 150, topY - 22, 300, 22);
  ctx.restore();
  label(ctx, cx, topY - 24, 'Rigid support', { anchor: 'above' });

  // Two wires: the experimental one and the reference, which is the whole
  // point of Searle's apparatus -- it cancels sag of the support and any
  // change in temperature.
  for (const [dx, name, l] of [[-46, 'Reference wire', restLen], [46, 'Experimental wire', len]]) {
    ctx.save();
    ctx.strokeStyle = shade('#b9c2d0', state?.yielded && dx > 0 ? -0.3 : 0.1);
    ctx.lineWidth = dx > 0 && state?.yielded ? 1.4 : 2.2;
    ctx.beginPath(); ctx.moveTo(cx + dx, topY); ctx.lineTo(cx + dx, topY + l); ctx.stroke();
    ctx.restore();
    label(ctx, cx + dx + (dx > 0 ? 10 : -10), topY + 70, name, { anchor: dx > 0 ? 'right' : 'left', size: 11 });
  }

  // The spirit level and micrometer between the two frames.
  const tilt = clamp(ext * 0.0022, -0.1, 0.1);
  ctx.save();
  ctx.translate(cx, topY + restLen + 16);
  ctx.rotate(tilt);
  brushedMetal(ctx, -70, -6, 140, 12, { axis: 'h' });
  // Bubble, off-centre until the micrometer is turned back to level.
  ctx.fillStyle = rgba('#9fd8ef', 0.9);
  ctx.fillRect(-26, -3.4, 52, 7);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(clamp(-tilt * 260, -20, 20), 0, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  label(ctx, cx + 78, topY + restLen + 16, 'Spirit level + micrometer', { anchor: 'right', size: 11 });

  drawWeight(ctx, cx + 46, topY + len + 30, { label: `Load ${(inputs.loadKg ?? 0.5).toFixed(1)} kg` });
  label(ctx, cx, 420,
    state?.yielded ? 'PAST THE ELASTIC LIMIT — the wire is yielding and will not recover'
      : state?.settled ? `Settled — extension ${((state?.extension ?? 0) * 1000).toFixed(3)} mm`
        : 'Wire still stretching…',
    { anchor: 'below', bold: true, color: state?.yielded ? '#c02626' : state?.settled ? '#0d7a52' : undefined });
}
export function helicalSpring(ctx, w, h, state, inputs) {
  const th = theme();
  const topY = 20, restLen = 90;
  const ext = (state?.x ?? 0) * 1000; // m -> mm-ish scaling for pixels
  const len = restLen + Math.min(160, ext * 4);
  ctx.save(); ctx.fillStyle = th.metal; ctx.fillRect(w / 2 - 40, topY - 12, 80, 12); ctx.restore();
  drawSpring(ctx, w / 2, topY, len, 12, 22, { label: 'Helical spring' });
  /* Pull the load hanger down to add slotted weights: the drag sets the
     load in grams, so the extension that follows is Hooke's law acting on
     the new force, not the drawing being stretched. */
  drawWeight(ctx, w / 2 - 12, topY + len, {
    label: `${inputs.loadG ?? 0} g`,
    drag: {
      varId: 'loadG', axis: 'y', unit: 'load in g',
      p0: topY + restLen, p1: topY + restLen + 160, v0: 0, v1: 600,
    },
  });
  label(ctx, w / 2 + 70, topY + len / 2, 'Pointer & scale', { anchor: 'right' });
}
export function paperScale(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 250, x0 = 90, len = 560;
  drawRuler(ctx, x0, y, len, { label: 'Hand-made paper scale', divisions: 20, scaleMax: 20 });

  // The object being measured, laid against the zero of the scale.
  const objLen = clamp((state?.aligned ?? inputs?.lengthCm ?? 6) * 28, 20, len - 20);
  ctx.save();
  const g = ctx.createLinearGradient(0, y - 26, 0, y - 4);
  g.addColorStop(0, '#e5b57a'); g.addColorStop(1, '#b07f43');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - 26, objLen, 22);
  ctx.strokeStyle = rgba('#54371a', 0.6); ctx.lineWidth = 1.1;
  ctx.strokeRect(x0, y - 26, objLen, 22);
  ctx.restore();
  label(ctx, x0 + objLen / 2, y - 28, 'Object under test', { anchor: 'above' });

  // Where its far end falls on the scale, which is the reading.
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x0 + objLen, y - 30); ctx.lineTo(x0 + objLen, y + 22); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  label(ctx, x0 + objLen, y + 26,
    `Reading ${((objLen / 28)).toFixed(2)} cm`, { anchor: 'below', bold: true, color: '#c02626' });
}
export function principleOfMoments(ctx, w, h, state, inputs) {
  const th = theme();
  const cy = 230, len = 560, pivotX = 400, x0 = pivotX - len / 2;
  // The rule tips by the net moment the model computed.
  const tilt = state?.tilt ?? 0;

  ctx.save();
  ctx.translate(pivotX, cy);
  ctx.rotate(tilt);
  ctx.strokeStyle = th.wood; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
  ctx.strokeStyle = rgba('#3a2412', 0.5); ctx.lineWidth = 0.8;
  for (let i = 0; i <= 20; i++) {
    const tx = -len / 2 + (len * i) / 20;
    ctx.beginPath(); ctx.moveTo(tx, -4.5); ctx.lineTo(tx, i % 5 === 0 ? -12 : -8); ctx.stroke();
  }
  ctx.restore();

  // Knife edge.
  ctx.save();
  ctx.fillStyle = shade(th.metal, -0.1);
  ctx.beginPath(); ctx.moveTo(pivotX - 14, cy + 10); ctx.lineTo(pivotX + 14, cy + 10); ctx.lineTo(pivotX, cy - 8); ctx.closePath(); ctx.fill();
  ctx.restore();
  brushedMetal(ctx, pivotX - 4, cy + 10, 8, 130, { axis: 'v' });
  label(ctx, pivotX, cy + 146, 'Knife edge (pivot)', { anchor: 'below' });

  // Hangers, carried round with the tilt.
  const place = (armCm, massG, name) => {
    const dx = (armCm / 50) * (len / 2);
    const px = pivotX + dx * Math.cos(tilt);
    const py = cy + dx * Math.sin(tilt);
    ctx.save();
    ctx.strokeStyle = rgba(th.ink, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 28); ctx.stroke();
    ctx.restore();
    drawWeight(ctx, px, py + 28, { label: `${name} ${massG} g` });
  };
  place(-(inputs.leftArmCm ?? 20), inputs.leftMassG ?? 50, 'Known');
  place(inputs.rightArmCm ?? 20, inputs.rightMassG ?? 50, 'Unknown');

  label(ctx, pivotX, 110,
    state?.balanced ? 'Balanced — anticlockwise moment = clockwise moment'
      : `Out of balance by ${Math.abs(state?.net ?? 0).toFixed(0)} g·cm — move a hanger`,
    { anchor: 'above', bold: true, color: state?.balanced ? '#0d7a52' : '#8a5a00' });
}
export function graphPlotting(ctx, w, h, state, inputs) {
  const th = theme();
  const ox = 110, oy = 80, gw = 520, gh = 300;
  ctx.save();
  ctx.fillStyle = th.isDark ? '#1b2740' : '#fdfdf7';
  ctx.fillRect(ox, oy, gw, gh);
  ctx.strokeStyle = rgba('#3d7ae5', 0.3); ctx.lineWidth = 0.7;
  for (let i = 0; i <= 20; i++) {
    ctx.beginPath(); ctx.moveTo(ox + (gw * i) / 20, oy); ctx.lineTo(ox + (gw * i) / 20, oy + gh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy + (gh * i) / 20); ctx.lineTo(ox + gw, oy + (gh * i) / 20); ctx.stroke();
  }
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + gh); ctx.lineTo(ox + gw, oy + gh); ctx.stroke();
  ctx.restore();
  label(ctx, ox + gw / 2, oy + gh + 8, 'Independent variable →', { anchor: 'below', size: 11 });
  label(ctx, ox - 8, oy + gh / 2, 'Dependent variable →', { anchor: 'left', size: 11 });

  /* The line is drawn in as the student would draw it, so the best-fit
     appears rather than being pre-printed on the paper. */
  const drawn = clamp(state?.drawn ?? 0, 0, 1);
  const pts = 9;
  ctx.save();
  ctx.fillStyle = th.accent;
  for (let i = 0; i < pts; i++) {
    const f = i / (pts - 1);
    if (f > drawn) break;
    const px = ox + gw * (0.06 + f * 0.88);
    const py = oy + gh * (0.88 - f * 0.74) + (noise1(i * 3.1) - 0.5) * 14;
    ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    // Error bars: a plotted point without them hides its own uncertainty.
    ctx.strokeStyle = rgba(th.accent, 0.7); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py - 9); ctx.lineTo(px, py + 9); ctx.stroke();
  }
  if (drawn > 0.25) {
    ctx.strokeStyle = '#c02626'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + gw * 0.06, oy + gh * 0.88);
    ctx.lineTo(ox + gw * (0.06 + drawn * 0.88), oy + gh * (0.88 - drawn * 0.74));
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, ox + gw * 0.6, oy + gh * 0.3, 'Line of best fit', { anchor: 'right', color: '#c02626', size: 11 });
}
export function rollingFriction(ctx, w, h, state, inputs) {
  const th = theme();
  const tableY = 300, x0 = 70, pulleyX = 620;
  ctx.save();
  ctx.fillStyle = th.wood; ctx.fillRect(x0, tableY, pulleyX - x0 + 20, 14);
  ctx.restore();
  label(ctx, (x0 + pulleyX) / 2, tableY + 15, 'Horizontal table', { anchor: 'below' });

  const R = 20;
  const rx = clamp(180 + (state?.s ?? 0) * 200, 120, pulleyX - 60);
  contactShadow(ctx, rx, tableY + 1, R * 2.4, { strength: 0.5 });
  ctx.save();
  const g = ctx.createRadialGradient(rx - 6, tableY - R - 7, 2, rx, tableY - R, R);
  g.addColorStop(0, '#eef2f8'); g.addColorStop(0.5, '#98a2b4'); g.addColorStop(1, '#3d4553');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(rx, tableY - R, R, 0, Math.PI * 2); ctx.fill();
  // Spokes show it ROLLING rather than sliding — the distinction being made.
  ctx.strokeStyle = rgba('#232a3a', 0.6); ctx.lineWidth = 1.6;
  const roll = (state?.s ?? 0) / (R / 220);
  for (let i = 0; i < 4; i++) {
    const a = roll + (i / 4) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(rx, tableY - R);
    ctx.lineTo(rx + Math.cos(a) * R * 0.82, tableY - R + Math.sin(a) * R * 0.82);
    ctx.stroke();
  }
  ctx.restore();
  label(ctx, rx, tableY - R * 2 - 4, 'Roller', { anchor: 'above' });

  ctx.save();
  ctx.strokeStyle = rgba(th.ink, 0.8); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(rx + R, tableY - R); ctx.lineTo(pulleyX, tableY - R); ctx.stroke();
  ctx.restore();
  chrome(ctx, pulleyX - 11, tableY - R - 11, 22, 22, 11);
  label(ctx, pulleyX + 13, tableY - R - 14, 'Pulley', { anchor: 'right' });
  drawWeight(ctx, pulleyX, tableY - R + 30, { label: `Fine-weight pan (${inputs.panG ?? 0} g)` });
  label(ctx, (x0 + pulleyX) / 2, 140,
    state?.rolling ? `Rolling — v = ${(state.v ?? 0).toFixed(3)} m/s, decelerating`
      : 'Rolling friction is far smaller than sliding friction — a tiny load starts it',
    { anchor: 'above', bold: true });
}
export function projectileRange(ctx, w, h, state, inputs) {
  const th = theme();
  const groundY = 400, launchX = 70;
  const angle = ((inputs.angleDeg ?? 45) * Math.PI) / 180;
  /* Mirrors LAUNCHERS/TABLE_HEIGHT_M in models/projectile-range.js. Kept as
     a small local lookup (renderers draw from state+inputs only, never
     import a model) rather than duplicating the whole table. */
  const LAUNCHER_SPEED = { soft: 4.0, medium: 6.0, strong: 8.2 };
  const G = 9.792;
  const u0 = LAUNCHER_SPEED[inputs.launcher] ?? LAUNCHER_SPEED.medium;
  const h0 = inputs.mount === 'table' ? 0.9 : 0;
  /* Scale the bench to the flight, not the other way round: a fixed
     pixels-per-metre left a 3 m throw as a thumbnail in the corner of a
     wide canvas. Predicted range measured from a height needs the full
     time of flight, not the ground-level R = u²sin(2θ)/g shortcut. */
  const uy0 = u0 * Math.sin(angle);
  const flightT = (uy0 + Math.sqrt(uy0 * uy0 + 2 * G * h0)) / G;
  const predicted = Math.max(0.5, u0 * Math.cos(angle) * flightT);
  const PX = clamp(560 / predicted, 18, 200);
  const launchY = groundY - h0 * PX;

  ctx.save();
  ctx.strokeStyle = rgba(th.stroke, 0.6); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(30, groundY); ctx.lineTo(launchX + predicted * PX + 80, groundY); ctx.stroke();
  ctx.restore();

  // A table under the launcher when it is mounted above the floor.
  if (h0 > 0) {
    brushedMetal(ctx, launchX - 34, launchY, 68, groundY - launchY, { axis: 'v' });
    contactShadow(ctx, launchX, groundY, 50, { strength: 0.5 });
    label(ctx, launchX, groundY + 6, `Table · h = ${h0.toFixed(2)} m`, { anchor: 'below' });
  }

  // The launcher, aimed where it is actually aimed.
  ctx.save();
  ctx.translate(launchX, launchY);
  ctx.rotate(-angle);
  brushedMetal(ctx, 0, -9, 58, 18, { axis: 'h' });
  ctx.restore();
  contactShadow(ctx, launchX, launchY, 60, { strength: 0.6 });
  label(ctx, launchX, launchY + 6, `Launcher · θ = ${(inputs.angleDeg ?? 45).toFixed(0)}°`, { anchor: 'below' });

  // The predicted path, and the projectile actually on it.
  ctx.save();
  ctx.strokeStyle = rgba(th.dim, 0.75); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let t = 0; t <= flightT + 0.02; t += 0.02) {
    const x = launchX + u0 * Math.cos(angle) * t * PX;
    const heightAboveFloor = h0 + u0 * Math.sin(angle) * t - 0.5 * G * t * t;
    const y = groundY - heightAboveFloor * PX;
    if (heightAboveFloor < 0) break;
    t === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();

  if (state?.flying || state?.landed) {
    const bx = launchX + (state.x ?? 0) * PX;
    const by = groundY - (state.y ?? h0) * PX;
    ctx.save();
    const g = ctx.createRadialGradient(bx - 3, by - 4, 1, bx, by, 9);
    g.addColorStop(0, '#f5f8fc'); g.addColorStop(0.5, '#8d97a8'); g.addColorStop(1, '#39414f');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill();
    // Velocity components, the whole content of the experiment.
    if (state.flying) {
      arrowLabel(ctx, bx, by, (state.vx ?? 0) * 9, th.accent2, 'vₓ (constant)');
      ctx.save();
      ctx.strokeStyle = '#c02626'; ctx.fillStyle = '#c02626'; ctx.lineWidth = 2.2;
      const vy = -(state.vy ?? 0) * 9;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + vy); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by + vy);
      ctx.lineTo(bx - 5, by + vy - Math.sign(vy) * 9);
      ctx.lineTo(bx + 5, by + vy - Math.sign(vy) * 9);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  const R = state?.landed ? state.range : null;
  if (R) {
    ctx.save();
    ctx.strokeStyle = '#0d7a52'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(launchX, groundY + 22); ctx.lineTo(launchX + R * PX, groundY + 22); ctx.stroke();
    ctx.restore();
    label(ctx, launchX + (R * PX) / 2, groundY + 24, `Range = ${R.toFixed(2)} m`, { anchor: 'below', bold: true, color: '#0d7a52' });
  }
  label(ctx, 400, 60,
    state?.landed ? 'Landed — record the range'
      : state?.flying ? `In flight · t = ${(state.t ?? 0).toFixed(2)} s` : 'Press launch',
    { anchor: 'above', bold: true });
}
export function energyConservation(ctx, w, h, state, inputs) {
  const th = theme();
  const baseY = 380, leftX = 90, midX = 380, rightX = 670;
  const h1 = (inputs.releaseHeightCm ?? 20) * 4.2;

  ctx.save();
  ctx.strokeStyle = th.wood; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(leftX, baseY - h1);
  ctx.quadraticCurveTo(midX - 120, baseY, midX, baseY);
  ctx.quadraticCurveTo(midX + 120, baseY, rightX, baseY - h1 * 0.86);
  ctx.stroke();
  ctx.restore();
  label(ctx, midX, baseY + 6, 'Double inclined track', { anchor: 'below' });

  /* The ball is where the model's energy bookkeeping puts it: potential
     converting to kinetic and back, minus what friction has taken. */
  const hNow = (state?.height ?? 0) * 100 * 4.2;
  const side = (state?.direction ?? 1);
  const frac = clamp(hNow / Math.max(1, h1), 0, 1);
  const bx = side < 0 ? lerp(midX, leftX, frac) : lerp(midX, rightX, frac);
  const by = baseY - hNow - 12;

  ctx.save();
  const g = ctx.createRadialGradient(bx - 4, by - 5, 1, bx, by, 12);
  g.addColorStop(0, '#f2f6fb'); g.addColorStop(0.5, '#98a2b4'); g.addColorStop(1, '#3b4351');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(bx, by, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  label(ctx, bx, by - 14, 'Ball', { anchor: 'above' });

  // Release height and the height actually regained.
  for (const [x, hh, txt, col] of [[leftX, h1, `h₁ = ${(inputs.releaseHeightCm ?? 20).toFixed(0)} cm`, th.accent],
                                    [rightX, h1 * 0.86, 'h₂ regained', '#c02626']]) {
    ctx.save();
    ctx.strokeStyle = col; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 40, baseY - hh); ctx.lineTo(x + 40, baseY - hh); ctx.stroke();
    ctx.restore();
    label(ctx, x, baseY - hh - 4, txt, { anchor: 'above', size: 11, color: col });
  }

  // Live energy split — the statement the experiment is testing.
  const ke = clamp(1 - frac, 0, 1);
  const barY = 100, barW = 300, barX = 240;
  ctx.save();
  ctx.fillStyle = rgba(th.accent, 0.85);
  ctx.fillRect(barX, barY, barW * (1 - ke), 14);
  ctx.fillStyle = rgba('#c02626', 0.85);
  ctx.fillRect(barX + barW * (1 - ke), barY, barW * ke, 14);
  ctx.strokeStyle = rgba(th.stroke, 0.5); ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, 14);
  ctx.restore();
  label(ctx, barX + barW / 2, barY - 4, 'Potential ↔ kinetic energy', { anchor: 'above', size: 11 });
}
export function scaleDepression(ctx, w, h, state, inputs) {
  const th = theme();
  const y = 240, x0 = 110, x1 = 660;
  const cantilever = inputs?.arrangement !== 'supportedCentre';
  // The sag the model computed, oscillating in and settling.
  const depress = clamp(state?.depression ?? 0, -20, 120) * 2.2;

  ctx.save();
  ctx.strokeStyle = th.wood; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath();
  if (cantilever) {
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + depress * 0.5, x1, y + depress);
  } else {
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + depress * 2, x1, y);
  }
  ctx.stroke();
  ctx.restore();
  label(ctx, (x0 + x1) / 2, y - 12, 'Metre scale (beam)', { anchor: 'above' });

  if (cantilever) {
    brushedMetal(ctx, x0 - 30, y - 26, 26, 52, { axis: 'v' });
    label(ctx, x0 - 34, y, 'Clamped end', { anchor: 'left' });
    drawWeight(ctx, x1, y + depress + 10, { label: `Load ${inputs?.loadG ?? 50} g` });
  } else {
    for (const x of [x0, x1]) { brushedMetal(ctx, x - 12, y, 24, 34, { axis: 'v' }); }
    label(ctx, x0, y + 36, 'Knife-edge support', { anchor: 'below' });
    drawWeight(ctx, (x0 + x1) / 2, y + depress * 2 + 8, { label: `Load ${inputs?.loadG ?? 50} g` });
  }

  // The microscope/pointer reading the sag.
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x1 - 40, y); ctx.lineTo(x1 + 60, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  label(ctx, x1 + 62, y, 'Unloaded level', { anchor: 'right', size: 11, color: '#c02626' });
  label(ctx, (x0 + x1) / 2, 120,
    state?.settled ? `Settled — depression ${(state?.depression ?? 0).toFixed(2)} mm`
      : 'Still oscillating — wait before reading',
    { anchor: 'above', bold: true, color: state?.settled ? '#0d7a52' : '#8a5a00' });
}
export function pendulumDamping(ctx, w, h, state, inputs) {
  const th = theme();
  const pivotX = 400, pivotY = 70, len = 260;
  drawRetortStand(ctx, pivotX - 150, 430, 400, { label: 'Stand' });
  drawClamp(ctx, pivotX - 150, pivotY, pivotX - 8, { label: 'Clamp' });

  /* Amplitude comes from the model's exponential envelope, and the swing
     inside it from the pendulum's own period, so the decay drawn here is
     the decay the student will plot. */
  const ampDeg = state?.amplitude ?? (inputs.startAmplitudeDeg ?? 15);
  const angle = ((state?.angle ?? ampDeg) * Math.PI) / 180;
  const env = ((state?.envelope ?? 1));

  // The envelope itself, traced as the arc the bob no longer reaches.
  ctx.save();
  ctx.strokeStyle = rgba('#c02626', 0.4); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2;
  const a0 = ((inputs.startAmplitudeDeg ?? 15) * Math.PI) / 180;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, len, Math.PI / 2 - sgn * a0, Math.PI / 2 - sgn * a0 * env, sgn > 0);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  drawPendulumBob(ctx, pivotX, pivotY, len, angle, { label: 'Bob', r: 12 });
  label(ctx, pivotX + 210, pivotY + 120,
    `Amplitude ${ampDeg.toFixed(1)}° · ${(env * 100).toFixed(0)}% of the start`,
    { anchor: 'right', bold: true });
  label(ctx, pivotX, 420, 'Amplitude decays exponentially — energy ∝ amplitude²', { anchor: 'below', size: 11 });
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
