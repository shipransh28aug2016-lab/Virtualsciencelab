/**
 * Apparatus renderers — chemistry (Classes XI and XII).
 */
import {
  label, drawBeaker, drawConicalFlask, drawBurette, drawTestTube, drawThermometer, drawRetortStand, drawBurner, drawSwatch, drawStopClock, theme, heatingAssembly, drawClamp, drawTripod, drawGauze, heatAt, noteBounds, drawDigitalReadout, brushedMetal, chrome, plastic, contactShadow, incandescence,
} from './apparatus.js';
import { clock, dt, rgba, shade, mixColor, clamp, lerp, noise1 } from './realism.js';

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
/* ── XI-CHE-B02 · the boiling point, animated ─────────────────────────────────
 *
 * Everything the student SEES here follows the model's `state`; the renderer
 * decides nothing about the chemistry. What a pure function of the state cannot
 * hold is what the eye sees LAGGING behind it — the mercury catching up with
 * the bath, the burner's glow fading in and out, bubbles in flight — and that
 * lives in this one object, reset whenever the run's clock goes back to zero.
 *
 *   state.phase   idle → preheat → warming → bubbling → cooling → read
 *
 *   idle      burner out, bath at room temperature, mercury at the bottom
 *   Start     the burner lights and its element glows; the bath takes on a warm
 *             colour and convection cells begin to turn; the mercury climbs
 *   bubbling  a continuous stream of bubbles leaves the inverted capillary
 *   cooling   the burner is taken away; the glow fades; the stream thins
 *   read      bubbling stops and the liquid is drawn back up the capillary
 */
const BP = { Td: null, power: 0, grow: 0, bubbles: [], pops: [], spawned: 0, lastT: 0 };
const BP_HEAT_PHASES = new Set(['preheat', 'warming', 'bubbling']);
const bpHash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** The warm, turning liquid, painted INSIDE the bath's clip. `k` is the burner's power 0–1, `hf` how hot the bath is. */
function bathHeat(ctx, box, k, hf, t, dark) {
  const { x0, x1, level, bot } = box;
  const w = x1 - x0; const h = bot - level;
  if (h < 12 || k < 0.015) return;
  ctx.save();
  // The base of the bath, hottest and least dense, glows and thickens as it warms.
  const g = ctx.createLinearGradient(0, bot, 0, level);
  g.addColorStop(0, rgba('#ff8a2a', 0.46 * k));
  g.addColorStop(0.5, rgba('#ff9d3a', 0.16 * k * (0.5 + hf)));
  g.addColorStop(1, rgba('#ff9d3a', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x0, level, w, h);

  /* Two convection cells. Liquid heated over the burner rises through the
     middle, spreads outward under the surface and sinks along the cooler walls,
     so the left cell turns anticlockwise and the right clockwise. A dash that
     travels along each loop reads as the current itself. */
  const ink = dark ? '255,214,160' : '150,70,10';
  const speed = 16 + 52 * k;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (const [sx, dir] of [[0.27, 1], [0.73, -1]]) {
    for (let ring = 0; ring < 2; ring += 1) {
      const sc = 1 - ring * 0.4;
      ctx.setLineDash([5, 9]);
      ctx.lineDashOffset = dir * t * speed * (1 + ring * 0.45);
      ctx.strokeStyle = `rgba(${ink},${(0.5 * k * (1 - ring * 0.35)).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(x0 + w * sx, level + h * 0.52, w * 0.2 * sc, h * 0.34 * sc, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // Heat shimmer: faint wavy lines lifting off the bottom, quicker as the bath gets hotter.
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const ph = (t * (0.16 + 0.34 * k) + i * 0.25) % 1;
    const y = bot - 6 - ph * (h - 12);
    ctx.strokeStyle = `rgba(${ink},${(0.22 * k * Math.sin(ph * Math.PI)).toFixed(3)})`;
    ctx.beginPath();
    for (let x = x0 + 3; x <= x1 - 3; x += 4) {
      const yy = y + Math.sin(x * 0.13 + t * (2.4 + 3 * k) + i * 1.7) * (1.2 + 2.2 * k);
      if (x === x0 + 3) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function boilingPoint(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  /*
   * The model's state fields are `tempC`, `phase` and `bubbleRate` (init() never
   * sets `temperature`, `bathTemp` or `boilingPoint`): reading any other name
   * once froze the thermometer and the bubble stream at their fall-back values
   * whatever the liquid, the bath or the phase. `bubbleRate` is the model's own
   * 0–1 bubbling intensity.
   */
  const T0 = state?.tempC ?? 25;
  const near = state?.bubbleRate ?? 0;
  const phase = state?.phase ?? 'idle';
  const fdt = dt();
  /* Someone who has asked their system for less motion keeps the observation —
     the bubbles, the climbing mercury — and loses the decoration: the turning
     convection cells and the shimmer stand still. */
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t = calm ? 0 : clock();

  /* A new run (the clock went back to zero): the mercury starts from wherever
     the model starts, and nothing is left in flight. */
  const now = state?.t ?? 0;
  if (BP.Td === null || now < BP.lastT - 1e-6) { BP.Td = T0; BP.power = 0; BP.grow = 0; BP.bubbles = []; BP.pops = []; }
  BP.lastT = now;

  /* The thermometer is not the bath: glass and mercury take a moment to catch up,
     so the column rises smoothly and never leaps. Capped, so that at a fast clock
     it trails by a few degrees rather than minutes. */
  BP.Td += (T0 - BP.Td) * (1 - Math.exp(-fdt / 0.45));
  BP.Td = clamp(BP.Td, T0 - 6, T0 + 6);
  const Td = BP.Td;
  const burnerOn = !!state?.running && BP_HEAT_PHASES.has(phase);
  BP.power += ((burnerOn ? 1 : 0) - BP.power) * (1 - Math.exp(-fdt / 0.35));
  const k = BP.power;
  const hf = clamp((Td - 25) / 120, 0, 1) ** 0.8;

  const oil = inputs?.bath !== 'water';
  const bathColour = oil ? mixColor('#efdc9b', '#d98a2c', hf) : mixColor('#c7dff2', '#e6d6b8', hf * 0.6);
  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 152, vesselHeight: 130, fill: 0.68,
    liquid: bathColour, lit: burnerOn, vesselLabel: false, flameHeight: 44,
    /* heat: 0 — the generic "burner under a vessel" bubbling and steam are off:
       a paraffin bath at 80 °C does not bubble, and the only bubbles on this bench
       should be the ones from the capillary, which are the observation. The bath
       paints its own warmth and convection instead. */
    vesselOpts: { heat: 0, paint: (c, box) => bathHeat(c, box, k, hf, t, th.isDark) },
  });

  // The burner's element: the gauze under the bath glows, pulsing a little, while the burner is on.
  if (k > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.85 + 0.15 * noise1(t * 5);
    const hg = ctx.createRadialGradient(cx, A.gaugeY, 4, cx, A.gaugeY, 92);
    hg.addColorStop(0, rgba('#ff9a3c', 0.5 * k * flick));
    hg.addColorStop(0.45, rgba('#ff7a1c', 0.2 * k * flick));
    hg.addColorStop(1, rgba('#ff7a1c', 0));
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.ellipse(cx, A.gaugeY + 2, 94, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgba('#ffb36b', 0.55 * k * flick);
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx - 62, A.gaugeY + 1); ctx.lineTo(cx + 62, A.gaugeY + 1); ctx.stroke();
    ctx.restore();
  }

  const rodX = cx - 130;
  drawClamp(ctx, rodX, A.topY + 20, cx - 40, { label: 'Clamp' });

  // Siwoloboff tube, standing in the bath with its inverted capillary.
  const tubeTop = A.topY - 54;
  const tubeX = cx + 14;
  drawTestTube(ctx, tubeX, tubeTop, 150, 30, 0.42, th.liquid, { label: false, inRack: true, heat: 0 });
  const tubeBot = tubeTop + 150;
  const mouthY = tubeBot - 12;
  const surfaceY = tubeBot - 62;

  /* The capillary: sealed at the top, open at the foot. Air trapped in it is
     what bubbles out; on cooling, liquid is drawn back in to replace it. */
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(205,220,240,0.95)';
  ctx.lineWidth = 4.2;
  ctx.beginPath(); ctx.moveTo(tubeX, tubeBot - 54); ctx.lineTo(tubeX, mouthY); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tubeX, tubeBot - 52); ctx.lineTo(tubeX, mouthY); ctx.stroke();
  if (phase === 'read') {
    const suck = clamp(((state?.t ?? 0) - (state?.finishedAt ?? 0)) / 90 + 0.12, 0, 1);
    const colH = 4 + suck * 20;
    ctx.fillStyle = rgba(th.liquid, 0.62);
    ctx.fillRect(tubeX - 1.5, mouthY - colH, 3, colH);
    ctx.strokeStyle = rgba('#ffffff', 0.7);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tubeX, mouthY - colH, 1.6, 0, Math.PI, true); ctx.stroke();
  }
  ctx.restore();

  /* The observation: a slow trickle of expanding air well below the boiling point,
     then a rapid continuous stream once the vapour pressure reaches atmospheric.
     A bubble swells at the mouth, lets go, rises through the liquid growing as
     the pressure above it falls, and pops at the surface. */
  const rate = near > 0.02 ? 1.5 + near * 13 : 0;             // bubbles a second
  const rNext = 1.8 + near * 2.2;
  BP.grow += rate * fdt;
  while (BP.grow >= 1) {
    BP.grow -= 1;
    const id = BP.spawned += 1;
    BP.bubbles.push({ r: rNext * (0.85 + 0.35 * bpHash(id)), y: mouthY - 3, vy: 30 + 72 * near + 14 * bpHash(id + 9), ph: bpHash(id + 3) * 6.28 });
  }
  ctx.save();
  const drawBubble = (x, y, r) => {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * (1 + 0.1 * near), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, Math.max(0.5, r * 0.28), 0, Math.PI * 2); ctx.fill();
  };
  if (rate > 0) drawBubble(tubeX, mouthY - 1 - rNext * BP.grow ** 0.5 * 0.6, rNext * BP.grow ** 0.6);   // the one forming
  for (let i = BP.bubbles.length - 1; i >= 0; i -= 1) {
    const b = BP.bubbles[i];
    b.y -= b.vy * fdt;
    b.vy *= 1 + 0.35 * fdt;
    b.r *= 1 + 0.16 * fdt;
    if (b.y <= surfaceY) { BP.pops.push({ x: tubeX + Math.sin(b.ph + (mouthY - b.y) * 0.09) * (1.6 + near * 1.6), y: surfaceY, age: 0, r: b.r }); BP.bubbles.splice(i, 1); continue; }
    drawBubble(tubeX + Math.sin(b.ph + (mouthY - b.y) * 0.09) * (1.6 + near * 1.6), b.y, b.r);
  }
  for (let i = BP.pops.length - 1; i >= 0; i -= 1) {
    const p = BP.pops[i];
    p.age += fdt;
    if (p.age > 0.22) { BP.pops.splice(i, 1); continue; }
    ctx.strokeStyle = `rgba(255,255,255,${(0.7 * (1 - p.age / 0.22)).toFixed(3)})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r + 6 * (p.age / 0.22), (p.r + 6 * (p.age / 0.22)) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  drawThermometer(ctx, cx - 24, A.topY - 100, 214, clamp((Td - 20) / 200, 0, 1));

  /* Callouts, to the right of the bath where there is room: a label stacked on
     the apparatus it names is a label nobody can read. */
  const bx = A.x1 + 12;
  const callout = (fromX, fromY, atY, text) => {
    ctx.save();
    ctx.strokeStyle = rgba(th.accent, 0.5);
    ctx.fillStyle = rgba(th.accent, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fromX, fromY); ctx.lineTo(bx, atY); ctx.stroke();
    ctx.beginPath(); ctx.arc(fromX, fromY, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    label(ctx, bx, atY, text, { anchor: 'right', size: 11.5 });
  };
  callout(tubeX + 15, tubeTop + 26, tubeTop + 22, 'Siwoloboff tube');
  callout(tubeX, mouthY - 6, mouthY - 10, 'Inverted capillary');
  callout(A.x1 - 3, A.bot - 22, A.bot - 20, oil ? 'Liquid paraffin bath' : 'Water bath');

  const reading = Td.toFixed(1);
  const phaseText = phase === 'idle' ? `${reading} °C — burner off`
    : phase === 'read' ? `Bubbling ceased — ${reading} °C`
      : phase === 'cooling' ? `Cooling — ${reading} °C`
        : near >= 0.98 ? `Rapid stream — ${reading} °C`
          : `${reading} °C — heating`;
  label(ctx, bx, A.topY + 40, phaseText,
    { anchor: 'right', bold: true, color: phase === 'read' || near >= 0.98 ? '#c02626' : undefined });
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
    label: state?.sampleLabel || 'Sample solution', graduations: false,
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
  /*
   * inputs?.titrant is a real field only for XI-CHE-E05's own picker (and
   * even there a bare code like 'na2co3', never the literal string
   * 'KMnO4'), so this never actually matched for the two permanganate
   * titrations (XII-CHE-J01/J02) -- the burette always showed a generic
   * liquid colour instead of potassium permanganate's characteristic deep
   * purple. state.titrantIsPermanganate is resolved by the model itself
   * from whichever system is actually running.
   */
  const titrantCol = state?.titrantIsPermanganate ? '#8b2fa8' : th.liquid;
  const titrantLabel = state?.titrantName || inputs?.titrant || 'titrant';
  const analyteLabel = state?.analyteName || inputs?.analyte || 'analyte';

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
    label: `Burette (${titrantLabel})`,
  });

  drawConicalFlask(ctx, cx, flaskTop, 46, 150, flaskH, 0.42, fill, {
    label: `Conical flask (${analyteLabel})`,
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
    `${state?.electrolyteLabel || 'Electrolyte'} at ${(inputs?.concentrationMm ?? 0).toFixed(1)} mmol/L`,
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
const OIL_LABEL = { mustard: 'Mustard oil', coconut: 'Coconut oil', olive: 'Olive oil', castor: 'Castor oil' };
const AGENT_LABEL = { none: 'No emulsifier', soap: 'Soap', detergent: 'Detergent', gum: 'Gum acacia', limewater: 'Lime water' };
const AGENT_TYPE = { none: null, soap: 'oil-in-water', detergent: 'oil-in-water', gum: 'oil-in-water', limewater: 'water-in-oil' };

/**
 * An emulsion, and the two tests done on it.
 *
 * The bench was a test tube of one colour and a thin rectangle that grew
 * for two seconds. The measurement here is a TIME — how long the mixture
 * stays milky — and there was no clock; the two layers that separate were
 * never drawn; and the dilution test, which is half the practical and the
 * only way to tell an oil-in-water emulsion from a water-in-oil one, was a
 * word in a picker that changed nothing on the bench at all.
 */
export function emulsion(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2 - 110;
  const sep = clamp(state?.separation ?? 0, 0, 1);
  const oilName = OIL_LABEL[inputs?.oil] || 'Mustard oil';
  const agentKey = inputs?.agent || 'none';
  const agentName = AGENT_LABEL[agentKey] || 'No emulsifier';
  const type = AGENT_TYPE[agentKey];
  const dilution = inputs?.test === 'dilution';
  const pct = Number(inputs?.agentPct ?? 0);

  const topY = 60, hgt = 230, wid = 56;
  const { bot } = drawTestTube(ctx, cx, topY, hgt, wid, 0.78, '#ecdfae',
    { label: `${oilName} + water${agentKey !== 'none' ? ` + ${agentName} ${pct.toFixed(1)}%` : ''}` });

  /*
   * The contents, in the three bands they actually form: oil floating on
   * top, water below, and the milky emulsion between them. As the mixture
   * separates the milk is squeezed out of the middle into the two clear
   * layers, which is exactly what the separation time measures.
   */
  const liqTop = topY + hgt * 0.16;
  const liqBot = bot - 16;
  const span = liqBot - liqTop;
  const oilBand = span * 0.34 * sep;
  const waterBand = span * 0.66 * sep;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#e4c75f';                                   // oil, risen
  ctx.fillRect(cx - wid / 2 + 3, liqTop, wid - 6, oilBand);
  ctx.fillStyle = mixColor('#f7f3e4', '#cfd9e6', 0.5);          // water, below
  ctx.fillRect(cx - wid / 2 + 3, liqBot - waterBand, wid - 6, waterBand);
  ctx.fillStyle = '#f6f1df';                                    // the emulsion itself
  ctx.fillRect(cx - wid / 2 + 3, liqTop + oilBand, wid - 6, span - oilBand - waterBand);
  ctx.restore();

  if (sep > 0.06 && sep < 0.97) {
    label(ctx, cx + wid / 2 + 6, liqTop + oilBand, 'oil', { anchor: 'right', size: 10 });
    label(ctx, cx + wid / 2 + 6, liqBot - waterBand, 'water', { anchor: 'right', size: 10 });
  }

  const elapsed = state?.elapsed ?? 0;
  if (!dilution) {
    /* The clock belongs to the separation test — the dilution test is not
       timed, and a clock ticking beside it says otherwise. */
    drawStopClock(ctx, cx + 220, 150, 72, elapsed, {
      leastCount: 1,
      label: 'Stop clock',
      sub: sep > 0.95 ? 'layers separated' : 'timing the emulsion',
      running: sep < 0.95,
    });
    label(ctx, cx, topY - 22,
      sep > 0.95 ? `Separated after ${elapsed.toFixed(0)} s`
        : sep > 0.5 ? 'Separating — the milky band is thinning'
          : 'Milky throughout — still emulsified',
      { anchor: 'above', bold: true });
    return;
  }

  /*
   * THE DILUTION TEST. A drop of the emulsion is put into water and another
   * into oil; whichever it mixes freely with is the continuous phase. That
   * is the whole of how an oil-in-water emulsion is told from a
   * water-in-oil one, and it was not on the bench.
   */
  const ow = type === 'oil-in-water';
  const dishes = [
    { x: cx + 170, name: 'diluted with WATER', mixes: ow },
    { x: cx + 310, name: 'diluted with OIL', mixes: type === 'water-in-oil' },
  ];
  for (const d of dishes) {
    const dy = 150;
    ctx.save();
    ctx.strokeStyle = rgba(th.ink, 0.35); ctx.lineWidth = 1.4;
    ctx.fillStyle = rgba('#ffffff', 0.22);
    ctx.beginPath(); ctx.ellipse(d.x, dy, 54, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(d.x - 54, dy); ctx.quadraticCurveTo(d.x, dy + 52, d.x + 54, dy); ctx.stroke();
    ctx.restore();

    ctx.save();
    if (d.mixes) {
      /* Mixes freely: one even, slightly cloudy pool. */
      ctx.fillStyle = rgba('#eef0e6', 0.9);
      ctx.beginPath(); ctx.ellipse(d.x, dy + 9, 46, 15, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      /* Refuses: the drop stays as a separate globule. */
      ctx.fillStyle = rgba('#dfe6ef', 0.85);
      ctx.beginPath(); ctx.ellipse(d.x, dy + 9, 46, 15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e4c75f';
      for (const [ddx, ddy, rr] of [[-14, 4, 9], [10, 9, 7], [0, 14, 5]]) {
        ctx.beginPath(); ctx.ellipse(d.x + ddx, dy + ddy, rr, rr * 0.62, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    label(ctx, d.x, dy - 20, d.name, { anchor: 'above', size: 11 });
    label(ctx, d.x, dy + 42, d.mixes ? 'mixes freely' : 'stays as globules',
      { anchor: 'below', size: 11, bold: d.mixes, color: d.mixes ? '#0d7a52' : undefined });
  }
  label(ctx, cx + 240, 248,
    type ? `Continuous phase: ${ow ? 'water' : 'oil'} — ${type}`
      : 'No emulsifier — nothing stays mixed to dilute',
    { anchor: 'below', bold: true });
}
/**
 * The thiosulphate clock reaction.
 *
 * What the bench showed was a flask, and a TRIANGLE where the cross should
 * be, and nothing else. On an experiment whose measurement is a time it had
 * no clock; on an experiment whose variable is a concentration it looked the
 * same at every concentration; and its temperature, the other thing the rate
 * depends on, was a number in a panel rather than a thermometer in the
 * liquid.
 *
 * Everything drawn here comes from the model: the turbidity is the sulphur
 * the reaction has actually produced, the tint is the thiosulphate actually
 * in the flask, and the clock reads the model's own elapsed time.
 */
export function reactionKinetics(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = w / 2 - 90;
  const turbidity = Math.min(1, state?.turbidity ?? 0);

  /* Concentration is visible, because it is the independent variable. The
     tint comes from how much of the 50 mL is thiosulphate rather than water,
     so a dilute flask looks dilute before the reaction begins. */
  const thio = Number(inputs?.thioVolume ?? 50);
  const water = Number(inputs?.waterVolume ?? 0);
  const frac = thio + water > 0 ? thio / (thio + water) : 1;
  const liquid = mixColor('#eef4f8', '#dfe9d8', frac);

  const { bot } = drawConicalFlask(ctx, cx, 30, 40, 130, 120, 0.5, liquid,
    { label: `${thio.toFixed(0)} mL Na₂S₂O₃ + ${water.toFixed(0)} mL water + ${Number(inputs?.hclVolume ?? 5).toFixed(0)} mL HCl` });

  /* The sulphur, as it forms: a pale suspension that thickens across the
     whole liquid rather than a shade drawn over the cross. */
  if (turbidity > 0.01) {
    ctx.save();
    ctx.globalAlpha = 0.85 * turbidity;
    ctx.fillStyle = '#f2f3ec';
    ctx.beginPath();
    ctx.moveTo(cx - 58, bot - 4);
    ctx.lineTo(cx + 58, bot - 4);
    ctx.lineTo(cx + 19, bot - 62);
    ctx.lineTo(cx - 19, bot - 62);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* An actual cross, on the tile under the flask, seen through the liquid. */
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - turbidity / 0.78);
  ctx.strokeStyle = '#1a2333';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  const r = 11;
  ctx.beginPath();
  ctx.moveTo(cx - r, bot - 20 - r); ctx.lineTo(cx + r, bot - 20 + r);
  ctx.moveTo(cx + r, bot - 20 - r); ctx.lineTo(cx - r, bot - 20 + r);
  ctx.stroke();
  ctx.restore();

  drawThermometer(ctx, cx + 92, 44, 130, clamp(((Number(inputs?.tempC ?? 25)) - 10) / 60, 0, 1),
    { label: `${Number(inputs?.tempC ?? 25).toFixed(0)} °C` });

  // The instrument this experiment measures with.
  drawStopClock(ctx, w - 150, h * 0.42, 70, state?.elapsed ?? 0, {
    leastCount: 0.2,
    running: Boolean(state?.running && !state?.finishedAt),
    sub: state?.finishedAt ? 'cross gone — record the time' : 'watching the cross',
  });

  label(ctx, cx, bot + 8,
    turbidity >= 0.78 ? 'The cross has disappeared — stop the clock'
      : state?.running ? 'Cross still visible through the liquid'
        : 'Cross mark on the tile under the flask',
    { anchor: 'below' });
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

  /*
   * Renderers never import a model, so the half-cells are handed over on
   * `state`: which metal, which salt, what colour its solution is. They used
   * to be written into this function — ZnSO₄ on the left, CuSO₄ on the right,
   * a grey electrode and a copper one — so an iron/silver cell drew a
   * correctly calculated emf above two beakers labelled with salts that were
   * not in them.
   */
  const anode = state?.anode || { label: 'Zinc', salt: 'ZnSO₄', metal: '#b7bcc4', solution: '#e8eef2' };
  const cathode = state?.cathode || { label: 'Copper', salt: 'CuSO₄', metal: '#c98b4a', solution: '#7fb6e6' };

  const L = drawBeaker(ctx, cx - 150, topY, 170, 190, 0.66, anode.solution,
    { label: `${anode.label} in ${anode.salt}`, graduations: false });
  const R = drawBeaker(ctx, cx + 150, topY, 170, 190, 0.66, cathode.solution,
    { label: `${cathode.label} in ${cathode.salt}`, graduations: false });

  // Electrodes dipping into each.
  for (const [x, base, name] of [[cx - 150, anode.metal, `${anode.label} electrode (anode, −)`],
                                  [cx + 150, cathode.metal, `${cathode.label} electrode (cathode, +)`]]) {
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
