/**
 * Apparatus renderers — heat, fluids and their Section-B activities.
 */
import {
  label, drawBeaker, drawThermometer, drawRetortStand, drawBurner, drawTestTube, theme, drawWeight, brushedMetal, chrome, plastic, contactShadow, incandescence, noteBounds, drawClamp,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp, noise1 } from './realism.js';

const BENCH_Y = 430;

export function boylesLaw(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, topY = 60, tubeH = 330;
  /* Quill tube and open limb. The trapped air column is what the model
     computes from the pressure, so the column visibly shortens as mercury
     is added -- pV = constant, shown rather than asserted. */
  const colCm = state?.column ?? 30;
  const colPx = clamp((colCm / 40) * tubeH, 20, tubeH - 20);
  const diff = (inputs.levelDifferenceCm ?? 0) * 2.4;

  const limb = (x, fillTop, fillBot, name) => {
    ctx.save();
    ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.8;
    ctx.fillStyle = rgba(th.glass, 0.6);
    ctx.beginPath(); ctx.rect(x - 15, topY, 30, tubeH); ctx.fill(); ctx.stroke();
    // Mercury: dense, metallic, with a convex meniscus (it does NOT wet glass).
    const g = ctx.createLinearGradient(x - 15, 0, x + 15, 0);
    g.addColorStop(0, '#5c6472'); g.addColorStop(0.35, '#d7dde6');
    g.addColorStop(0.6, '#98a1af'); g.addColorStop(1, '#454c59');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, fillTop, 28, fillBot - fillTop);
    ctx.beginPath(); ctx.ellipse(x, fillTop, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    label(ctx, x, topY + tubeH + 6, name, { anchor: 'below' });
  };

  const closedTopMerc = topY + colPx;
  limb(cx - 70, closedTopMerc, topY + tubeH, 'Closed limb');
  limb(cx + 70, closedTopMerc + diff, topY + tubeH, 'Open limb');
  // Connecting tube at the base.
  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(cx - 70, topY + tubeH); ctx.lineTo(cx + 70, topY + tubeH); ctx.stroke();
  ctx.restore();

  // The trapped air, which is the thing being measured.
  ctx.save();
  ctx.fillStyle = rgba('#cfe3f5', 0.3);
  ctx.fillRect(cx - 84, topY, 28, colPx);
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(cx - 100, topY); ctx.lineTo(cx - 100, closedTopMerc); ctx.stroke();
  ctx.restore();
  label(ctx, cx - 104, (topY + closedTopMerc) / 2, `Trapped air ${colCm.toFixed(1)} cm`,
    { anchor: 'left', bold: true, color: '#c02626' });

  label(ctx, cx, topY - 8,
    `p = ${(state?.pressure ?? 76).toFixed(1)} cm Hg · pV = ${((state?.pressure ?? 76) * colCm).toFixed(0)}`,
    { anchor: 'above', bold: true });
}

export function surfaceTension(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  const B = drawBeaker(ctx, cx, BENCH_Y - 120, 260, 120, 0.55, th.liquid,
    { label: 'Beaker of liquid', graduations: false });
  const surface = B.bot - 120 * 0.55;

  /* The column climbs to h = 2T cosθ / (r ρ g). A narrower tube lifts it
     higher -- the inverse relation the experiment is built to show -- and
     the meniscus at the top is concave because water wets clean glass. */
  const riseMm = state?.rise ?? 0;
  const risePx = clamp(riseMm * 3.2, 0, 210);
  const tubeW = clamp(20 - (inputs?.tubeRadiusMm ?? 0.5) * 2, 7, 18);
  const tubeTop = surface - risePx - 60;

  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.5;
  ctx.fillStyle = rgba(th.glass, 0.55);
  ctx.beginPath(); ctx.rect(cx - tubeW / 2, tubeTop, tubeW, (B.bot - 14) - tubeTop);
  ctx.fill(); ctx.stroke();
  // Liquid in the capillary.
  ctx.fillStyle = rgba(th.liquid, 0.9);
  ctx.fillRect(cx - tubeW / 2 + 1.4, surface - risePx, tubeW - 2.8, (B.bot - 16) - (surface - risePx));
  // Concave meniscus.
  ctx.strokeStyle = rgba(shade(th.liquid, -0.4), 0.8); ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - tubeW / 2 + 1.4, surface - risePx - 3);
  ctx.quadraticCurveTo(cx, surface - risePx + 4, cx + tubeW / 2 - 1.4, surface - risePx - 3);
  ctx.stroke();
  ctx.restore();
  label(ctx, cx, tubeTop - 4, 'Capillary tube', { anchor: 'above' });

  // The rise itself, measured from the free surface.
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.3; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(cx + 24, surface); ctx.lineTo(cx + 120, surface); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 24, surface - risePx); ctx.lineTo(cx + 120, surface - risePx); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx + 110, surface); ctx.lineTo(cx + 110, surface - risePx); ctx.stroke();
  ctx.restore();
  label(ctx, cx + 124, surface - risePx / 2, `h = ${riseMm.toFixed(2)} mm`,
    { anchor: 'right', bold: true, color: '#c02626' });
  label(ctx, cx, tubeTop - 40,
    state?.settled ? 'Column steady — read the height' : 'Column still rising…',
    { anchor: 'above', bold: true, color: state?.settled ? '#0d7a52' : '#8a5a00' });
}

export function viscosity(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 400;
  const jarTop = 40, jarH = 400, jarW = 150;
  const jarBot = jarTop + jarH;
  drawBeaker(ctx, cx, jarTop, jarW, jarH, 0.94, th.liquidAlt,
    { label: 'Viscous liquid (tall measuring jar)', graduations: false });

  /* The marks are a fixed distance apart, and the ball's position between
     them is the model's own integrated fall — not a decorative loop. The
     ball must reach terminal velocity BEFORE the upper mark, which is why
     the upper mark sits well below the surface. */
  const upperY = jarTop + jarH * 0.24;
  const fallPx = jarH * 0.62;
  const lowerY = upperY + fallPx;
  for (const [y, name] of [[upperY, 'Upper mark'], [lowerY, 'Lower mark']]) {
    ctx.save();
    ctx.strokeStyle = 'rgba(190,40,40,0.85)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(cx - jarW / 2 - 8, y); ctx.lineTo(cx + jarW / 2 + 8, y); ctx.stroke();
    ctx.restore();
    label(ctx, cx - jarW / 2 - 10, y, name, { anchor: 'left' });
  }

  const dFall = (inputs?.fallDistanceCm ?? 30) / 100;      // metres between marks
  const yFrac = Math.min(1, (state?.y ?? 0) / Math.max(1e-6, dFall));
  const ballY = state?.released ? upperY + yFrac * fallPx : jarTop + 18;
  const r = Math.max(4, (inputs?.ballDiameterMm ?? 4) * 1.5);

  ctx.save();
  // Steel ball, lit like everything else on this bench.
  const g = ctx.createRadialGradient(cx - r * 0.4, ballY - r * 0.45, r * 0.1, cx, ballY, r);
  g.addColorStop(0, '#f2f5fa'); g.addColorStop(0.45, '#9aa5b6');
  g.addColorStop(1, '#3f4757');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, ballY, r, 0, Math.PI * 2); ctx.fill();
  // Wake behind a ball that is actually moving.
  if (state?.released && (state?.v ?? 0) > 0.001) {
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, ballY - r - i * 7, r * (1 - i * 0.18), Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }
  ctx.restore();
  label(ctx, cx + r + 6, ballY, 'Falling sphere', { anchor: 'right' });

  const vT = (state?.v ?? 0);
  label(ctx, cx + jarW / 2 + 90, jarTop + 60,
    !state?.released ? 'Release the ball at the surface'
      : state?.landed ? `Reached lower mark in ${(state.elapsed ?? 0).toFixed(2)} s`
        : `v = ${(vT * 100).toFixed(2)} cm/s${state?.atTerminal ? ' — terminal' : ' — still accelerating'}`,
    { anchor: 'right', bold: true, color: state?.atTerminal ? '#0d7a52' : undefined });
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
  const boxY = 300, x0 = 70, x1 = 700;
  ctx.save();
  const g = ctx.createLinearGradient(0, boxY, 0, boxY + 46);
  g.addColorStop(0, shade(th.wood, 0.25)); g.addColorStop(1, shade(th.wood, -0.4));
  ctx.fillStyle = g; ctx.fillRect(x0, boxY, x1 - x0, 46);
  ctx.strokeStyle = rgba('#3a2412', 0.5); ctx.lineWidth = 1.2;
  ctx.strokeRect(x0, boxY, x1 - x0, 46);
  // Sound holes.
  ctx.fillStyle = 'rgba(20,12,4,0.6)';
  for (const dx of [0.3, 0.7]) { ctx.beginPath(); ctx.arc(x0 + (x1 - x0) * dx, boxY + 23, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  label(ctx, (x0 + x1) / 2, boxY + 48, 'Sonometer (hollow wooden box)', { anchor: 'below' });

  // Bridges, at the separation the student has set.
  const sep = inputs.bridgeSeparationCm ?? 30;
  const px = (x1 - x0) / 100;
  const bA = x0 + 60, bB = bA + sep * px;
  for (const [bx, n] of [[bA, 'Bridge A'], [bB, 'Bridge B']]) {
    ctx.save();
    ctx.fillStyle = shade(th.metal, -0.1);
    ctx.beginPath(); ctx.moveTo(bx - 9, boxY); ctx.lineTo(bx + 9, boxY); ctx.lineTo(bx, boxY - 20); ctx.closePath(); ctx.fill();
    ctx.restore();
    label(ctx, bx, boxY + 2, n, { anchor: 'below', size: 11 });
  }

  /* The vibrating segment between the bridges: a standing wave whose
     amplitude is the model's resonance curve, so it only really moves when
     the wire is in tune with the fork. */
  const amp = clamp(state?.amplitude ?? 0, 0, 1) * 26;
  const ph = state?.phase ?? 0;
  ctx.save();
  ctx.strokeStyle = shade('#b9c2d0', 0.1); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x0 + 20, boxY - 20); ctx.lineTo(bA, boxY - 20);
  ctx.moveTo(bB, boxY - 20); ctx.lineTo(x1 - 20, boxY - 20); ctx.stroke();
  // The segment itself.
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const xx = lerp(bA, bB, f);
    const yy = boxY - 20 - Math.sin(Math.PI * f) * Math.sin(ph) * amp;
    i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  // Envelope, so the mode is visible even at an instant of zero displacement.
  if (amp > 1) {
    ctx.strokeStyle = rgba('#c02626', 0.28); ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const f = i / 40;
        const xx = lerp(bA, bB, f);
        const yy = boxY - 20 + sgn * Math.sin(Math.PI * f) * amp;
        i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.restore();

  // The paper rider — thrown off at resonance, which is the observation.
  const riderX = (bA + bB) / 2;
  const thrown = state?.resonant && amp > 12;
  ctx.save();
  ctx.fillStyle = '#f6f2e2'; ctx.strokeStyle = 'rgba(60,50,20,0.5)'; ctx.lineWidth = 0.8;
  const ry = thrown ? boxY - 20 - 40 - Math.abs(Math.sin(clock() * 9)) * 22 : boxY - 24;
  ctx.beginPath(); ctx.moveTo(riderX - 8, ry); ctx.lineTo(riderX + 8, ry - 4); ctx.lineTo(riderX + 6, ry + 5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, riderX, ry - 6, 'Paper rider', { anchor: 'above', size: 11 });

  // Tuning fork and the tensioning load.
  ctx.save();
  ctx.strokeStyle = shade(th.metal, 0.05); ctx.lineWidth = 5; ctx.lineCap = 'round';
  const fx = x1 - 40;
  const buzz = state?.resonant ? Math.sin(clock() * 40) * 1.6 : 0;
  ctx.beginPath();
  ctx.moveTo(fx - 9 + buzz, boxY - 110); ctx.lineTo(fx - 9 + buzz, boxY - 40);
  ctx.moveTo(fx + 9 - buzz, boxY - 110); ctx.lineTo(fx + 9 - buzz, boxY - 40);
  ctx.moveTo(fx, boxY - 40); ctx.lineTo(fx, boxY - 12);
  ctx.stroke();
  ctx.restore();
  label(ctx, fx, boxY - 114, `Tuning fork ${inputs.forkHz ?? inputs.fork ?? ''} Hz`, { anchor: 'above' });
  drawWeight(ctx, x1 - 4, boxY + 70, { label: `Tension load ${(inputs.loadKg ?? 1).toFixed(2)} kg` });

  label(ctx, (x0 + x1) / 2, boxY - 150,
    state?.resonant ? `RESONANCE — the rider is thrown off (l = ${sep.toFixed(1)} cm)`
      : `Off tune by ${(state?.beat ?? 0).toFixed(1)} Hz — adjust the bridges`,
    { anchor: 'above', bold: true, color: state?.resonant ? '#0d7a52' : '#8a5a00' });
}

export function resonanceTube(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 330, topY = 60, tubeH = 350;
  const lvl = clamp(state?.levelCm ?? 5, 0, 100);
  const waterY = topY + tubeH * (1 - lvl / 100) * 0 + topY + tubeH - (tubeH * (1 - lvl / 100));

  // The resonance tube, with the water level the reservoir sets.
  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.8;
  ctx.fillStyle = rgba(th.glass, 0.5);
  ctx.beginPath(); ctx.rect(cx - 30, topY, 60, tubeH); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(th.liquid, 0.85);
  ctx.fillRect(cx - 28, waterY, 56, topY + tubeH - waterY);
  ctx.restore();
  label(ctx, cx, topY + tubeH + 6, 'Resonance tube', { anchor: 'below' });

  /* The standing wave in the air column: a node at the water surface (the
     air cannot move there) and an antinode just past the open end. Drawing
     it makes the odd-quarter-wavelength condition obvious. */
  const amp = clamp(state?.loudness ?? 0, 0, 1) * 24;
  const ph = state?.phase ?? 0;
  ctx.save();
  ctx.strokeStyle = rgba('#c02626', 0.85); ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const yy = lerp(waterY, topY - 8, f);
    const xx = cx + Math.sin((Math.PI / 2) * f) * Math.sin(ph) * amp;
    i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
  }
  ctx.stroke();
  ctx.restore();
  label(ctx, cx + 36, waterY, 'Node (water surface)', { anchor: 'right', size: 11 });
  label(ctx, cx + 36, topY - 8, 'Antinode (open end)', { anchor: 'right', size: 11 });

  // Fork over the mouth.
  ctx.save();
  ctx.strokeStyle = shade(th.metal, 0.05); ctx.lineWidth = 5; ctx.lineCap = 'round';
  const buzz = state?.resonant ? Math.sin(clock() * 40) * 1.5 : 0;
  ctx.beginPath();
  ctx.moveTo(cx - 11 + buzz, topY - 92); ctx.lineTo(cx - 11 + buzz, topY - 30);
  ctx.moveTo(cx + 11 - buzz, topY - 92); ctx.lineTo(cx + 11 - buzz, topY - 30);
  ctx.stroke();
  ctx.restore();
  label(ctx, cx, topY - 96, 'Tuning fork', { anchor: 'above' });

  // Reservoir that sets the level, and the loudness meter.
  const rx = cx + 250;
  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.6;
  ctx.fillStyle = rgba(th.glass, 0.5);
  ctx.beginPath(); ctx.rect(rx - 40, waterY - 40, 80, 120); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba(th.liquid, 0.85);
  ctx.fillRect(rx - 38, waterY - 10, 76, 88);
  ctx.strokeStyle = rgba(th.ink, 0.5);
  ctx.beginPath(); ctx.moveTo(cx + 30, topY + tubeH - 14); ctx.lineTo(rx - 40, waterY + 70); ctx.stroke();
  ctx.restore();
  label(ctx, rx, waterY - 44, 'Levelling reservoir', { anchor: 'above' });

  label(ctx, cx, topY - 140,
    state?.resonant ? `RESONANCE at l = ${lvl.toFixed(1)} cm — the sound is loudest here`
      : 'Raise or lower the reservoir until the sound is loudest',
    { anchor: 'above', bold: true, color: state?.resonant ? '#0d7a52' : undefined });
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
  /* The stem level is read straight off the model's own levelMm, which
     dips first (the glass warms, and so expands, before the bulk liquid
     does) and only then climbs past its start -- the physical point of
     the activity. A bare rectangle at a fixed 40px used to sit here,
     changing with nothing: not the heating, not the liquid, not time. */
  const baselinePx = 40;
  const levelPx = clamp(baselinePx + (state?.levelMm ?? 0) * 2.2, 4, 96);
  ctx.fillStyle = th.liquid; ctx.fillRect(cx - 3, topY - levelPx, 6, levelPx); ctx.restore();
  label(ctx, cx, topY - 100, 'Narrow stem', { anchor: 'above' });
  drawBurner(ctx, cx, h - 10, state?.heating !== false);
  label(ctx, cx, h - 30,
    state?.heating
      ? `Heating — vessel +${(state?.tempVesselC ?? 0).toFixed(1)} °C, liquid +${(state?.tempLiquidC ?? 0).toFixed(1)} °C · level ${(state?.levelMm ?? 0).toFixed(2)} mm`
      : 'Press start to heat the flask',
    { anchor: 'below', size: 11 });
}

export function detergentSurfaceTension(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  const B = drawBeaker(ctx, cx, BENCH_Y - 120, 260, 120, 0.55, '#dcefe8',
    { label: 'Water + detergent', graduations: false });
  const surface = B.bot - 120 * 0.55;
  // Detergent lowers T, so the column stands LOWER -- the comparison being made.
  const risePx = clamp((state?.rise ?? 0) * 3.4, 0, 200);
  const tubeTop = surface - risePx - 60;

  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.5;
  ctx.fillStyle = rgba(th.glass, 0.55);
  ctx.beginPath(); ctx.rect(cx - 6, tubeTop, 12, (B.bot - 14) - tubeTop); ctx.fill(); ctx.stroke();
  ctx.fillStyle = rgba('#8fc9b4', 0.9);
  ctx.fillRect(cx - 4.6, surface - risePx, 9.2, (B.bot - 16) - (surface - risePx));
  ctx.restore();
  label(ctx, cx, tubeTop - 4, 'Capillary tube', { anchor: 'above' });
  label(ctx, cx + 30, surface - risePx, `h = ${(state?.rise ?? 0).toFixed(2)} mm`,
    { anchor: 'right', bold: true, color: '#c02626' });
  label(ctx, cx, tubeTop - 40,
    'Detergent lowers the surface tension, so the column stands lower',
    { anchor: 'above', size: 11 });
}

export function coolingFactors(ctx, w, h, state, inputs) {
  const cx = 380;
  const T = state?.tempC ?? 60;
  const room = inputs.roomTempC ?? 25;
  const excess = clamp((T - room) / Math.max(1, inputs.startExcessC ?? 50), 0, 1);
  const lid = inputs.cover === 'lid';

  const B = drawBeaker(ctx, cx, BENCH_Y - 150, 170, 150, 0.68, '#cfe0f2', {
    label: lid ? 'Covered calorimeter' : 'Open calorimeter',
    // Newton's law: the rate of loss follows the excess temperature, so a
    // hot open vessel steams and a cool or covered one does not.
    steam: lid ? 0 : excess * 0.8,
    heat: 0,
  });
  if (lid) {
    ctx.save();
    ctx.fillStyle = 'rgba(150,160,175,0.9)';
    ctx.fillRect(cx - 92, B.topY - 8, 184, 9);
    ctx.restore();
    label(ctx, cx + 94, B.topY - 4, 'Lid', { anchor: 'right', size: 11 });
  }
  drawThermometer(ctx, cx + 40, B.topY - 110, 210, clamp((T - 20) / 80, 0, 1));
  label(ctx, cx - 100, B.topY + 50, `${T.toFixed(1)} °C`, { anchor: 'left', bold: true, size: 15 });
  label(ctx, cx, B.bot + 30,
    `Excess over room temperature: ${(T - room).toFixed(1)} °C — the rate of cooling follows it`,
    { anchor: 'below', size: 11 });
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
