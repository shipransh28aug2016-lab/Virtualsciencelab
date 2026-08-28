/**
 * Apparatus renderers — chemistry (Classes XI and XII).
 */
import {
  label, drawBeaker, drawConicalFlask, drawBurette, drawTestTube, drawThermometer, drawRetortStand, drawBurner, drawSwatch, theme, heatingAssembly, drawClamp, drawTripod, drawGauze, heatAt, noteBounds, drawDigitalReadout, brushedMetal, chrome, plastic, contactShadow, incandescence,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp, noise1 } from './realism.js';

/* The bench top every chemistry scene stands on. Fixed in scene space —
   the frame is fitted to the apparatus afterwards, so a scene never has to
   guess how tall the canvas will be. */
const BENCH_Y = 430;

export function meltingPoint(ctx, w, h, state, inputs) {
  const cx = 380;
  const T0 = state?.bathTemp ?? state?.temperature ?? 30;
  const mp = state?.meltingPoint ?? inputs?.meltingPoint ?? 122;
  // The bath is a liquid paraffin / sulphuric acid bath: it is heated, and
  // how far it has climbed is what the whole experiment is watching.
  const frac = clamp((T0 - 20) / 200, 0, 1);
  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 150, vesselHeight: 128, fill: 0.66,
    liquid: '#e8c877', lit: state?.heating !== false, air: 1,
    vesselLabel: 'Melting-point bath (liquid paraffin)',
    flameHeight: 30 + 26 * (inputs?.heatingRate ?? 0.5),
  });

  // Thermometer clamped so its bulb sits beside the sample, not on the base.
  const rodX = cx - 129;
  drawClamp(ctx, rodX, A.topY + 26, cx - 34, { label: 'Clamp holding thermometer' });
  drawThermometer(ctx, cx - 16, A.topY - 96, 210, frac);

  // The capillary, rubber-banded to the thermometer stem.
  const capTop = A.topY - 10;
  const capBot = A.bot - 26;
  ctx.save();
  ctx.strokeStyle = 'rgba(200,215,235,0.95)';
  ctx.lineWidth = 4.5;
  ctx.beginPath(); ctx.moveTo(cx + 6, capTop); ctx.lineTo(cx + 6, capBot); ctx.stroke();
  // The packed solid in the sealed end — and its melting, which is the
  // observation the student is actually making.
  const melted = clamp((T0 - (mp - 1.5)) / 3, 0, 1);
  ctx.strokeStyle = melted > 0.5 ? '#eef3fb' : '#f4f0e2';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(cx + 6, capBot - 16 * (1 - melted * 0.45));
  ctx.lineTo(cx + 6, capBot - 1);
  ctx.stroke();
  if (melted > 0.05 && melted < 1) {
    // Meniscus collapsing as the last of the solid goes.
    ctx.fillStyle = rgba('#ffffff', 0.6 * melted);
    ctx.beginPath(); ctx.arc(cx + 6, capBot - 16 * (1 - melted * 0.45), 2.4, 0, Math.PI * 2); ctx.fill();
  }
  // Rubber band.
  ctx.strokeStyle = '#c9744e';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(cx - 22, A.topY + 6); ctx.lineTo(cx + 12, A.topY + 6); ctx.stroke();
  ctx.restore();
  label(ctx, cx + 8, capBot + 4, 'Capillary + sample', { anchor: 'below', leader: true });

  label(ctx, cx + 120, A.topY + 44,
    melted >= 1 ? `Melted — ${T0.toFixed(1)} °C` : melted > 0 ? `Melting… ${T0.toFixed(1)} °C` : `Bath ${T0.toFixed(1)} °C`,
    { anchor: 'right', bold: true, color: melted > 0 ? '#c02626' : undefined });
}
export function boilingPoint(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  /*
   * The model's actual state fields are `tempC` and `bubbleRate` (init()
   * never sets `temperature`, `bathTemp` or `boilingPoint` at all) -- so
   * this always fell through to the hardcoded fallbacks of 30 degC and
   * 78 degC, frozen regardless of which liquid was chosen, how long the
   * bath had been heating, or what phase (warming/bubbling/cooling/read)
   * the run was actually in. The thermometer and bubble stream never
   * moved. bubbleRate is the model's own 0-1 bubbling intensity for
   * exactly this purpose -- no need to re-derive it from a boiling point
   * this renderer has no correct way to know independently.
   */
  const T0 = state?.tempC ?? 30;
  const near = state?.bubbleRate ?? 0;
  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 152, vesselHeight: 130, fill: 0.68,
    liquid: '#e8c877', lit: state?.phase === 'warming' || state?.phase === 'bubbling', vesselLabel: 'Heating bath', flameHeight: 44,
  });
  const rodX = cx - 130;
  drawClamp(ctx, rodX, A.topY + 20, cx - 40, { label: 'Clamp' });

  // Siwoloboff tube, standing in the bath with its inverted capillary.
  const tubeTop = A.topY - 54;
  drawTestTube(ctx, cx + 14, tubeTop, 150, 30, 0.42, th.liquid,
    { label: 'Siwoloboff tube (liquid under test)', inRack: true });
  const tubeBot = tubeTop + 150;

  // The observation: a rapid, continuous stream of bubbles from the
  // inverted capillary means the vapour pressure has reached atmospheric —
  // the boiling point is read as the stream just stops on cooling.
  ctx.save();
  ctx.strokeStyle = 'rgba(205,220,240,0.95)';
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(cx + 14, tubeBot - 54); ctx.lineTo(cx + 14, tubeBot - 12); ctx.stroke();
  if (near > 0.02) {
    const t = clock();
    const n = Math.round(3 + near * 9);
    for (let i = 0; i < n; i++) {
      const ph = ((t * (0.5 + near * 2.4) + i / n) % 1);
      const by = tubeBot - 12 - ph * (tubeBot - 12 - (tubeTop + 88));
      const r = 1.4 + near * 2.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(cx + 14 + Math.sin(ph * 7 + i) * 2.5, by, r, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
  label(ctx, cx + 14, tubeBot - 4, 'Inverted capillary', { anchor: 'below', leader: true });

  drawThermometer(ctx, cx - 24, A.topY - 100, 214, clamp((T0 - 20) / 200, 0, 1));
  const phaseText = state?.phase === 'read'
    ? `Bubbling ceased here — ${T0.toFixed(1)} °C`
    : near >= 0.98 ? `Rapid stream — ${T0.toFixed(1)} °C` : `${T0.toFixed(1)} °C`;
  label(ctx, cx + 128, A.topY + 40, phaseText,
    { anchor: 'right', bold: true, color: state?.phase === 'read' || near >= 0.98 ? '#c02626' : undefined });
}
export function crystallisation(ctx, w, h, state, inputs) {
  const cx = 380;
  const heating = state?.heating ?? true;
  const T0 = state?.temperature ?? 80;
  // Crystals appear on COOLING, as solubility falls below what is dissolved.
  const yieldFrac = clamp(state?.yieldFraction ?? (heating ? 0 : clamp((70 - T0) / 50, 0, 1)), 0, 1);
  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 168, vesselHeight: 128, fill: 0.6,
    liquid: '#cfe2f2', lit: heating,
    vesselLabel: heating ? 'Hot saturated solution' : 'Solution cooling',
    flameHeight: 42,
  });

  // Crystals growing on the base as the liquor cools.
  ctx.save();
  const t = clock();
  const n = Math.round(yieldFrac * 26);
  for (let i = 0; i < n; i++) {
    const rx = cx - 66 + ((i * 37) % 132);
    const size = 3 + ((i * 13) % 5) + yieldFrac * 3;
    const ry = A.bot - 8 - ((i * 7) % 9);
    const grow = clamp((yieldFrac * 26 - i) / 3, 0, 1);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(((i * 41) % 90) * Math.PI / 180 + Math.sin(t * 0.2 + i) * 0.02);
    ctx.fillStyle = rgba('#eef4fd', 0.92);
    ctx.strokeStyle = rgba('#8fb0d8', 0.9);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -size * grow); ctx.lineTo(size * 0.62 * grow, 0);
    ctx.lineTo(0, size * grow); ctx.lineTo(-size * 0.62 * grow, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  label(ctx, cx, A.bot + 26,
    heating ? 'Evaporating to saturation' : `Crystals forming on cooling — ${(yieldFrac * 100).toFixed(0)}% deposited`,
    { anchor: 'below' });
  label(ctx, cx + 130, A.topY + 42, `${T0.toFixed(0)} °C`, { anchor: 'right', bold: true });
}
export function phDetermination(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 340;
  /* The meter reads towards the true pH rather than snapping to it: a
     glass electrode takes seconds to equilibrate, and a reading taken
     before it settles is the commonest error in this experiment. */
  const shown = state?.reading ?? state?.pH ?? 7;
  const settled = !!state?.settled;
  const colourFor = (p) => p < 3 ? '#e5433d' : p < 6 ? '#f0a23d' : p < 8 ? '#3fae5a' : p < 11 ? '#3d7ae5' : '#7a3fc4';
  const colour = colourFor(shown);

  drawBeaker(ctx, cx, BENCH_Y - 150, 160, 150, 0.62, colour, {
    label: inputs?.sample || 'Sample solution', graduations: false,
  });

  // Electrode (or the paper strip) dipping into it.
  const meter = /meter/i.test(String(inputs?.method));
  if (meter) {
    drawRetortStand(ctx, cx - 140, BENCH_Y, 330, { label: 'Stand' });
    drawClamp(ctx, cx - 140, BENCH_Y - 230, cx - 22, { label: 'Electrode clamp' });
    ctx.save();
    ctx.fillStyle = '#dfe6f0';
    ctx.strokeStyle = 'rgba(40,60,95,0.4)'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(cx - 9, BENCH_Y - 258, 18, 190, 5); else ctx.rect(cx - 9, BENCH_Y - 258, 18, 190);
    ctx.fill(); ctx.stroke();
    // The glass bulb at the tip, which is what actually senses.
    ctx.fillStyle = rgba('#cfe3f5', 0.85);
    ctx.beginPath(); ctx.arc(cx, BENCH_Y - 64, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    label(ctx, cx + 12, BENCH_Y - 230, 'Combined glass electrode', { anchor: 'right', size: 11 });
    drawDigitalReadout(ctx, cx + 190, BENCH_Y - 210, 150, 56,
      settled ? shown.toFixed(2) : shown.toFixed(2) + '…',
      { label: 'pH meter', size: 22, color: settled ? '#7CFC9A' : '#5f8f6f' });
  } else {
    // Universal indicator paper, against the printed colour chart.
    ctx.save();
    ctx.fillStyle = colour;
    ctx.fillRect(cx + 120, BENCH_Y - 250, 26, 90);
    ctx.strokeStyle = rgba(th.stroke, 0.5); ctx.lineWidth = 1;
    ctx.strokeRect(cx + 120, BENCH_Y - 250, 26, 90);
    ctx.restore();
    label(ctx, cx + 133, BENCH_Y - 252, 'Indicator paper', { anchor: 'above', size: 11 });
    for (let p = 1; p <= 13; p += 2) {
      drawSwatch(ctx, cx + 170 + ((p - 1) / 2) * 34, BENCH_Y - 250, 30, colourFor(p), String(p));
    }
    label(ctx, cx + 270, BENCH_Y - 190, 'Colour chart', { anchor: 'below', size: 11 });
  }

  label(ctx, cx, BENCH_Y - 320,
    settled ? `pH = ${shown.toFixed(2)} — reading stable`
      : `Equilibrating… ${shown.toFixed(2)}`,
    { anchor: 'above', bold: true, color: settled ? '#0d7a52' : '#8a5a00' });
  label(ctx, cx, BENCH_Y + 28, `Method: ${inputs?.method || 'universal indicator'}`, { anchor: 'below' });
}
export function titration(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 400;
  const delivered = state?.delivered ?? 0;
  const flowing = !!state?.flowing;

  const colourMap = {
    colourless: 'rgba(214,230,246,0.34)', pink: '#f2a6c8', yellow: '#f3e26b',
    orange: '#f0a23d', red: '#e5433d', green: '#3fae5a', blue: '#3d7ae5',
    violet: '#7a3fc4', purple: '#8b4fd0', brown: '#8a5a2b', colourles: 'rgba(214,230,246,0.34)',
  };
  const key = (state?.colour || 'colourless').split(' ')[0].split('(')[0].trim().toLowerCase();
  const fill = colourMap[key] || th.liquid;
  const titrantCol = inputs?.titrant === 'KMnO4' ? '#8b2fa8' : th.liquid;

  // ── the stand that actually holds the burette ──
  const rodX = cx - 132;
  drawRetortStand(ctx, rodX, BENCH_Y, 470, { label: 'Retort stand' });

  const buretteTop = BENCH_Y - 452;
  const buretteLen = 258;
  drawClamp(ctx, rodX, buretteTop + 62, cx - 12, { label: 'Burette clamp' });

  // ── the flask, standing on a glazed white tile so the end point shows ──
  const flaskH = 132, flaskTop = BENCH_Y - flaskH;
  ctx.save();
  ctx.fillStyle = th.isDark ? '#e8edf5' : '#fbfcfe';
  ctx.strokeStyle = 'rgba(40,60,95,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - 90, BENCH_Y - 5, 180, 9, 2); else ctx.rect(cx - 90, BENCH_Y - 5, 180, 9);
  ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, cx + 92, BENCH_Y, 'White glazed tile', { anchor: 'right' });

  // The burette delivers real drops onto the liquid surface in the flask.
  const F = { topY: flaskTop, bodyTop: flaskTop + flaskH * 0.28, bot: BENCH_Y - 5 };
  const surfaceY = F.bot - (F.bot - F.bodyTop) * 0.42;

  drawBurette(ctx, cx, buretteTop, buretteLen, 1 - delivered / 50, {
    liquidColor: titrantCol,
    flowRate: flowing ? (state?.flowRate ?? 0.5) : 0,
    targetY: surfaceY,
    label: `Burette (${inputs?.titrant || 'titrant'})`,
  });

  drawConicalFlask(ctx, cx, flaskTop, 46, 150, flaskH, 0.42, fill, {
    label: `Conical flask (${inputs?.analyte || 'analyte'})`,
    stirring: flowing ? 0.35 : 0,
  });

  // ── the reading, where a student's eye actually goes ──
  const vEq = state?.equivalenceVolume;
  const near = Number.isFinite(vEq) ? Math.max(0, 1 - Math.abs(vEq - delivered) / 2) : 0;
  label(ctx, cx + 118, buretteTop + 120, `Delivered  ${delivered.toFixed(1)} mL`,
    { anchor: 'right', bold: true, size: 14 });
  label(ctx, cx + 118, buretteTop + 148, `Indicator: ${state?.colour || 'colourless'}`,
    { anchor: 'right', color: fill.startsWith('rgba') ? undefined : fill });
  if (state?.atEndPoint) {
    label(ctx, cx, flaskTop - 26, 'END POINT — permanent colour change', { anchor: 'above', bold: true, color: '#c02626' });
  } else if (near > 0.4) {
    label(ctx, cx, flaskTop - 26, 'Near end point — add drop-wise, swirl', { anchor: 'above', color: '#8a5a00' });
  }
  if (state?.overshot) {
    label(ctx, cx, flaskTop - 26, 'OVERSHOT — refill and repeat', { anchor: 'above', bold: true, color: '#c02626' });
  }
}
export function solPreparation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  /* A sol scatters light (the Tyndall cone) because its particles are big
     enough to scatter but too small to settle. Adding enough electrolyte
     coagulates it: the particles clump, the beam fades, and the floc
     settles out. The beam's brightness IS the model's `tyndall`. */
  const tyn = clamp(state?.tyndall ?? 1, 0, 1);
  const settled = clamp(state?.settled ?? 0, 0, 1);
  const base = inputs?.sol === 'fe' ? '#a8521f' : '#c98b4a';

  const B = drawBeaker(ctx, cx, BENCH_Y - 170, 200, 170, 0.62,
    mixColor(base, '#dfe6ee', 1 - tyn), {
      label: inputs?.sol ? `${inputs.sol} sol` : 'Colloidal sol',
      precipitate: settled * 0.9,
      precipitateColor: base,
      coarsePrecipitate: true,
      graduations: false,
    });

  // The beam, and the cone it lights up inside the sol.
  const beamY = B.topY + 60;
  ctx.save();
  ctx.strokeStyle = rgba('#fff3c8', 0.9); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - 240, beamY - 24); ctx.lineTo(cx - 100, beamY); ctx.stroke();
  // Inside the sol the beam becomes visible — that is the Tyndall effect.
  if (tyn > 0.03) {
    const g = ctx.createLinearGradient(cx - 100, 0, cx + 100, 0);
    g.addColorStop(0, rgba('#fff6d8', 0.62 * tyn));
    g.addColorStop(1, rgba('#fff6d8', 0.06 * tyn));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - 100, beamY - 4); ctx.lineTo(cx + 100, beamY - 22);
    ctx.lineTo(cx + 100, beamY + 22); ctx.lineTo(cx - 100, beamY + 4);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  label(ctx, cx - 244, beamY - 26, 'Light beam', { anchor: 'left' });
  label(ctx, cx, B.topY - 30,
    state?.coagulation > 0.05
      ? `Coagulating — Tyndall beam fading (${(100 * (1 - tyn)).toFixed(0)}% gone)`
      : 'Sol is stable — the beam shows a clear Tyndall cone',
    { anchor: 'above', bold: true, color: state?.coagulation > 0.05 ? '#8a5a00' : '#0d7a52' });
  label(ctx, cx, B.bot + 28,
    `${inputs?.electrolyte || 'Electrolyte'} at ${(inputs?.concentrationMm ?? 0).toFixed(1)} mmol/L`,
    { anchor: 'below', size: 11 });
}
export function dialysis(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  /* Crystalloid leaves the bag through the membrane; the colloid cannot
     follow, because its particles are too large for the pores. So the bag
     lightens and the tank darkens, and the two together conserve what
     started inside. */
  const frac = clamp(state?.fraction ?? 1, 0, 1);
  const outside = 1 - frac;

  const B = drawBeaker(ctx, cx, BENCH_Y - 200, 300, 200, 0.72,
    mixColor('#eaf1f8', '#8fb8dd', outside), {
      label: 'Outer water (dialysing tank)', graduations: false,
      stirring: inputs?.stirred ? 0.3 : 0,
    });

  // The membrane bag, suspended in it.
  const bagY = B.topY + 46, bagH = 108, bagW = 120;
  ctx.save();
  ctx.strokeStyle = rgba(th.ink, 0.55); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx, B.topY - 30); ctx.lineTo(cx, bagY); ctx.stroke();
  ctx.fillStyle = rgba(mixColor('#c98b4a', '#e3d9c6', outside), 0.85);
  ctx.strokeStyle = rgba('#6f5b3a', 0.85);
  ctx.setLineDash([4, 3]); ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - bagW / 2, bagY, bagW, bagH, 16);
  else ctx.rect(cx - bagW / 2, bagY, bagW, bagH);
  ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  label(ctx, cx, bagY - 4, `Membrane bag (${inputs?.membrane || 'parchment'})`, { anchor: 'above' });

  // Crystalloid crossing the membrane — the process itself.
  ctx.save();
  const t = clock();
  for (let i = 0; i < 14; i++) {
    const ph = ((t * 0.35 + i / 14) % 1);
    const side = i % 2 ? 1 : -1;
    const px = cx + side * (bagW / 2 + ph * 70);
    const py = bagY + 20 + ((i * 13) % (bagH - 30));
    ctx.fillStyle = rgba('#3d7ae5', 0.55 * (1 - ph) * frac);
    ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  label(ctx, cx + 190, B.topY + 40,
    `Inside ${(frac * 100).toFixed(0)}% · outside ${(outside * 100).toFixed(0)}%`,
    { anchor: 'right', bold: true });
  label(ctx, cx, B.bot + 28,
    inputs?.water === 'standing'
      ? 'Standing water saturates — dialysis stalls at a plateau'
      : 'Water changed regularly — the gradient is kept up',
    { anchor: 'below', size: 11 });
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
  const cx = 380, topY = BENCH_Y - 190;
  const bridge = inputs?.saltBridge !== false;
  const emf = state?.emf ?? 0;

  const L = drawBeaker(ctx, cx - 150, topY, 170, 190, 0.66, '#dcefe8',
    { label: `${inputs?.anode || 'Zn'} in ZnSO₄`, graduations: false });
  const R = drawBeaker(ctx, cx + 150, topY, 170, 190, 0.66, '#bfe0f2',
    { label: `${inputs?.cathode || 'Cu'} in CuSO₄`, graduations: false });

  // Electrodes dipping into each.
  for (const [x, base, name] of [[cx - 150, '#b7bcc4', 'Zinc electrode (anode, −)'],
                                  [cx + 150, '#c98b4a', 'Copper electrode (cathode, +)']]) {
    ctx.save();
    const g = ctx.createLinearGradient(x - 11, 0, x + 11, 0);
    g.addColorStop(0, shade(base, -0.4)); g.addColorStop(0.35, shade(base, 0.35)); g.addColorStop(1, shade(base, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(x - 11, topY - 60, 22, 190);
    ctx.restore();
    label(ctx, x, topY - 64, name, { anchor: 'above', size: 11 });
  }

  /* The salt bridge completes the circuit. Without it charge separation
     builds up at once and the reading collapses -- which is exactly what
     the model does, and why the bridge is not optional. */
  if (bridge) {
    ctx.save();
    ctx.strokeStyle = shade('#e6e9ef', -0.1); ctx.lineWidth = 15; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 90, topY + 40);
    ctx.quadraticCurveTo(cx, topY - 40, cx + 90, topY + 40);
    ctx.stroke();
    ctx.strokeStyle = rgba('#9fb2cc', 0.9); ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(cx - 90, topY + 40);
    ctx.quadraticCurveTo(cx, topY - 40, cx + 90, topY + 40);
    ctx.stroke();
    ctx.restore();
    label(ctx, cx, topY - 34, 'Salt bridge (KCl in agar)', { anchor: 'above' });
    // Ions migrating through it, keeping each half-cell neutral.
    const m = state?.migration ?? 0;
    ctx.save();
    for (let i = 0; i < 6; i++) {
      const f = ((m + i / 6) % 1);
      const bx = lerp(cx - 90, cx + 90, f);
      const by = topY + 40 - Math.sin(Math.PI * f) * 80;
      ctx.fillStyle = rgba(i % 2 ? '#c02626' : '#1d5fd4', 0.75);
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  } else {
    label(ctx, cx, topY - 34, 'NO salt bridge — the circuit cannot be completed',
      { anchor: 'above', bold: true, color: '#c02626' });
  }

  // Voltmeter across the electrodes.
  ctx.save();
  ctx.strokeStyle = th.ink; ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 150, topY - 80); ctx.lineTo(cx - 150, topY - 140);
  ctx.lineTo(cx - 60, topY - 140);
  ctx.moveTo(cx + 60, topY - 140); ctx.lineTo(cx + 150, topY - 140);
  ctx.lineTo(cx + 150, topY - 80);
  ctx.stroke();
  ctx.restore();
  drawDigitalReadout(ctx, cx - 60, topY - 168, 120, 52, `${emf.toFixed(3)} V`,
    { label: 'Digital voltmeter', size: 20, color: Math.abs(emf) > 0.02 ? '#7CFC9A' : '#5f8f6f' });

  label(ctx, cx, topY - 200,
    bridge ? `E_cell = ${emf.toFixed(3)} V` : 'Reading has collapsed — replace the salt bridge',
    { anchor: 'above', bold: true, color: bridge ? '#0d7a52' : '#c02626' });
}
export function chromatography(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2, chamberY = 30, chamberH = h - 90;
  ctx.save(); ctx.strokeStyle = th.glassStroke; ctx.fillStyle = th.glass; ctx.lineWidth = 1.6;
  ctx.strokeRect(cx - 60, chamberY, 120, chamberH); ctx.restore();
  const baseY = chamberY + chamberH - 20;
  /*
   * The paper's usable length (PAPER_LENGTH_CM, 15) sets the pixel scale,
   * so real centimetre distances from the model -- the actual sample's
   * spots and the actual solvent front for the chosen solvent and run
   * time -- map onto the chamber consistently. This used to draw three
   * hardcoded dots at fixed relative heights regardless of which sample,
   * solvent or run time was selected, so a cation separation looked
   * identical to a leaf-pigment one and neither ever moved with the
   * actual chemistry.
   */
  const pxPerCm = (chamberH - 20) / 15;
  const frontCm = state?.frontCm ?? 0;
  const frontY = baseY - frontCm * pxPerCm;
  ctx.save(); ctx.strokeStyle = th.dim; ctx.setLineDash([4, 3]); ctx.beginPath();
  ctx.moveTo(cx - 60, frontY); ctx.lineTo(cx + 60, frontY); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  label(ctx, cx + 60, frontY, 'Solvent front', { anchor: 'right', bg: false });

  const spots = state?.spots ?? [];
  const n = spots.length || 1;
  spots.forEach((spot, i) => {
    const spotX = cx - 20 + ((i - (n - 1) / 2) * 40) / Math.max(1, n - 1 || 1);
    const spotY = baseY - spot.distanceCm * pxPerCm;
    ctx.save(); ctx.fillStyle = spot.colour || th.liquid; ctx.beginPath();
    ctx.arc(spotX, spotY, 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  });

  ctx.save(); ctx.fillStyle = th.liquid; ctx.fillRect(cx - 60, baseY + 10, 120, 8); ctx.restore();
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
