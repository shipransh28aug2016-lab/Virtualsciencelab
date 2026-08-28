/**
 * Apparatus renderers for the Chemistry models added to close the CBSE
 * 2026-27 gap — equilibrium shift, standard solutions, salt analysis,
 * preparations, and the functional-group and biomolecule tests.
 *
 * Each of these is a REACTION, so what is drawn is the reaction running:
 * the equilibrium sliding to its new position and the colour following it
 * there, the fusion tube coming to red heat, the iodine clock sitting
 * clear and then going blue-black all at once, crystals growing as the
 * liquor cools. The numbers all come from the model's own state.
 */
import {
  label, drawTestTube, drawBeaker, drawConicalFlask, drawSwatch, drawBurner,
  drawRetortStand, drawClamp, drawDigitalReadout, drawTripod, drawGauze,
  heatingAssembly, theme, noteBounds, brushedMetal, chrome, plastic,
  contactShadow,
} from './apparatus.js';
import { clock, rgba, shade, mixColor, clamp, lerp, noise1 } from './realism.js';

const BENCH_Y = 430;

/** A wooden test-tube rack — tubes should stand in something. */
function drawRack(ctx, cx, baseY, slots, spacing) {
  const th = theme();
  const wdt = spacing * (slots + 0.6);
  contactShadow(ctx, cx, baseY + 1, wdt, { strength: 0.6 });
  ctx.save();
  const g = ctx.createLinearGradient(0, baseY - 16, 0, baseY);
  g.addColorStop(0, shade(th.wood, 0.28));
  g.addColorStop(1, shade(th.wood, -0.35));
  ctx.fillStyle = g;
  ctx.fillRect(cx - wdt / 2, baseY - 16, wdt, 16);
  ctx.strokeStyle = rgba('#3a2412', 0.5); ctx.lineWidth = 1;
  ctx.strokeRect(cx - wdt / 2, baseY - 16, wdt, 16);
  ctx.restore();
  noteBounds(cx - wdt / 2, baseY - 20, wdt, 26);
  label(ctx, cx, baseY + 2, 'Test-tube rack', { anchor: 'below' });
}

export function equilibriumShift(ctx, w, h, state, inputs) {
  const cx = 380;
  const cocl = inputs?.system === 'cocl';
  // Reactant and product colours for the two systems on the syllabus.
  const colourA = cocl ? '#e8a8c0' : '#f5e6a8';        // [Co(H2O)6]2+ pink / Fe3+ pale yellow
  const colourB = cocl ? '#2f6fd0' : '#a8201a';        // [CoCl4]2- blue  / [Fe(SCN)]2+ blood red

  /* The mixture's colour IS the equilibrium position, so it is interpolated
     from the model's own `position` rather than switched. Watching it slide
     across is the observation Le Chatelier's principle is taught from. */
  const pos = clamp(state?.position ?? 0.5, 0, 1);
  const mix = mixColor(colourA, colourB, pos);

  drawRack(ctx, cx, BENCH_Y, 1, 120);
  drawTestTube(ctx, cx, BENCH_Y - 250, 250, 52, 0.72, mix, {
    label: cocl ? 'Cobalt chloride equilibrium' : 'Fe³⁺ / SCN⁻ equilibrium',
    inRack: true,
    stirring: state?.shifting ? 0.28 : 0,
  });

  // The two end-member colours, so the student can see which way it moved.
  drawSwatch(ctx, cx + 150, BENCH_Y - 250, 54, colourA, cocl ? '[Co(H₂O)₆]²⁺ pink' : 'Fe³⁺ pale yellow');
  drawSwatch(ctx, cx + 150, BENCH_Y - 160, 54, colourB, cocl ? '[CoCl₄]²⁻ blue' : '[Fe(SCN)]²⁺ blood red');

  // Where the equilibrium currently sits, as a position on that scale.
  const barX = cx - 130, barY = BENCH_Y - 300, barW = 260;
  ctx.save();
  const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  g.addColorStop(0, colourA); g.addColorStop(1, colourB);
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(barX, barY, barW, 10, 5); else ctx.rect(barX, barY, barW, 10);
  ctx.fill();
  ctx.strokeStyle = rgba(theme().stroke, 0.5); ctx.lineWidth = 1; ctx.stroke();
  // Marker.
  const mx = barX + barW * pos;
  ctx.fillStyle = theme().ink;
  ctx.beginPath(); ctx.moveTo(mx, barY - 5); ctx.lineTo(mx - 5, barY - 13); ctx.lineTo(mx + 5, barY - 13); ctx.closePath(); ctx.fill();
  ctx.restore();
  label(ctx, barX + barW / 2, barY - 15, 'Equilibrium position', { anchor: 'above', size: 11 });
  label(ctx, cx, BENCH_Y - 306,
    state?.shifting ? `Shifting ${pos > 0.5 ? 'forward' : 'backward'} — ${inputs?.reagent || 'reagent'} added`
      : 'At equilibrium', { anchor: 'above', bold: true, color: state?.shifting ? '#8a5a00' : '#0d7a52' });
}

export function electronicBalance(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380, cy = 300;
  contactShadow(ctx, cx, cy + 62, 300, { strength: 0.7 });
  // Instrument body and draught shield.
  plastic(ctx, cx - 150, cy - 20, 300, 82, th.isDark ? '#2b3850' : '#dfe5ef', 8);
  ctx.save();
  ctx.strokeStyle = rgba('#9fb2cc', 0.7); ctx.lineWidth = 1.4;
  ctx.strokeRect(cx - 96, cy - 150, 192, 130);
  ctx.fillStyle = rgba('#cfe0f2', 0.14);
  ctx.fillRect(cx - 96, cy - 150, 192, 130);
  ctx.restore();
  label(ctx, cx - 98, cy - 140, 'Draught shield', { anchor: 'left', size: 11 });

  // Pan, and the sample on it.
  chrome(ctx, cx - 58, cy - 26, 116, 7, 3);
  ctx.save();
  const g = ctx.createLinearGradient(0, cy - 58, 0, cy - 26);
  g.addColorStop(0, '#fbfcfe'); g.addColorStop(1, '#c9d3e2');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx - 34, cy - 58, 68, 32, 4); else ctx.rect(cx - 34, cy - 58, 68, 32);
  ctx.fill();
  ctx.restore();
  label(ctx, cx, cy - 60, inputs?.object || 'Sample in a watch glass', { anchor: 'above' });

  /* A real balance does not settle instantly, and its last digit hunts
     while it does. Showing "----" until it is stable is the habit the
     experiment is trying to build. */
  const settled = !!state?.settled;
  const dp = inputs?.balance === 'digital3' ? 3 : 2;
  const shown = settled
    ? `${((state?.displayG ?? 0) + (state?.drift ?? 0)).toFixed(dp)} g`
    : `${(state?.displayG ?? 0).toFixed(dp)}`;
  drawDigitalReadout(ctx, cx - 78, cy + 4, 156, 44, shown,
    { label: 'Electronic top-pan balance', size: 19, color: settled ? '#7CFC9A' : '#5f8f6f' });
  // The stability mark a real balance shows before a reading may be taken.
  if (settled) {
    ctx.save();
    ctx.fillStyle = '#7CFC9A';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('g', cx + 58, cy + 26);
    ctx.restore();
  }
  label(ctx, cx, cy + 92,
    settled ? 'Stable — record the mass'
      : 'Waiting for the reading to stabilise…',
    { anchor: 'below', bold: true, color: settled ? '#0d7a52' : '#8a5a00' });
}

export function standardSolution(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  const neckTop = BENCH_Y - 330, shoulder = BENCH_Y - 190, bot = BENCH_Y;
  const halfW = 92;

  contactShadow(ctx, cx, bot + 1, halfW * 2.2, { strength: 0.7 });
  // A volumetric flask: long narrow neck, pear body, flat base.
  const path = (c) => {
    c.moveTo(cx - 13, neckTop);
    c.lineTo(cx - 13, shoulder - 40);
    c.quadraticCurveTo(cx - halfW, shoulder + 6, cx - halfW, bot - 16);
    c.quadraticCurveTo(cx - halfW, bot, cx - halfW + 18, bot);
    c.lineTo(cx + halfW - 18, bot);
    c.quadraticCurveTo(cx + halfW, bot, cx + halfW, bot - 16);
    c.quadraticCurveTo(cx + halfW, shoulder + 6, cx + 13, shoulder - 40);
    c.lineTo(cx + 13, neckTop);
    c.closePath();
  };

  /* Filling happens in two stages, and only in that order: the solid must
     be fully dissolved BEFORE the flask is made up to the mark, or the
     concentration is wrong. The scene refuses to run them together. */
  const dissolved = clamp(state?.dissolved ?? 0, 0, 1);
  const level = clamp(state?.level ?? 0, 0, 1);
  const liquidTop = lerp(bot - 20, shoulder - 46, 0.55 + level * 0.45);

  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  // Solution, tinted by how much has dissolved.
  const col = mixColor('#e9f0f8', th.liquid, dissolved);
  ctx.fillStyle = rgba(col, 0.9);
  ctx.fillRect(cx - halfW, liquidTop, halfW * 2, bot - liquidTop);
  // Undissolved solid swirling on the base until it is gone.
  if (dissolved < 1) {
    const sw = state?.swirl ?? 0;
    ctx.fillStyle = rgba('#ffffff', 0.85);
    for (let i = 0; i < 14; i++) {
      const a = sw + (i / 14) * Math.PI * 2;
      const rr = 20 + (i % 5) * 8;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rr, bot - 14 - Math.abs(Math.sin(a)) * 5 * (1 - dissolved),
        1.6 * (1 - dissolved) + 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.7;
  ctx.beginPath(); path(ctx); ctx.stroke();
  ctx.restore();

  // The graduation mark itself — the whole point of a volumetric flask.
  const markY = shoulder - 52;
  ctx.save();
  ctx.strokeStyle = '#c02626'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cx - 17, markY); ctx.lineTo(cx + 17, markY); ctx.stroke();
  ctx.restore();
  label(ctx, cx + 19, markY, `${inputs?.flask || '250'} mL mark`, { anchor: 'right', size: 11, color: '#c02626' });

  label(ctx, cx, neckTop - 4, inputs?.solute ? `${inputs.solute} weighed out` : 'Weighed solid', { anchor: 'above' });
  label(ctx, cx, bot + 4, 'Volumetric flask', { anchor: 'below' });
  label(ctx, cx + 130, shoulder,
    dissolved < 1 ? `Dissolving — swirl until clear (${(dissolved * 100).toFixed(0)}%)`
      : level < 1 ? 'Dissolved — now make up to the mark'
        : 'Made up to the mark — solution is standard',
    { anchor: 'right', bold: true, color: level >= 1 ? '#0d7a52' : '#8a5a00' });
}

/** Shared: one tube in a rack whose contents develop over time. */
function developingTube(ctx, cx, state, inputs, opts) {
  const dev = clamp(state?.development ?? 0, 0, 1);
  const base = opts.baseColour;
  const col = mixColor(base, opts.positiveColour, dev);
  drawRack(ctx, cx, BENCH_Y, 1, 120);
  drawTestTube(ctx, cx, BENCH_Y - 240, 240, 50, 0.6, col, {
    label: opts.label, inRack: true,
    // A positive test that throws a precipitate shows it settling out.
    precipitate: opts.precipitate ? dev * 0.8 : 0,
    precipitateColor: opts.precipitateColour,
    coarsePrecipitate: true,
  });
  return { dev, col };
}

export function saltAnalysis(ctx, w, h, state, inputs) {
  const cx = 360;
  const { dev } = developingTube(ctx, cx, state, inputs, {
    label: `Salt under test: ${inputs?.salt || '—'}`,
    baseColour: '#e7edf5', positiveColour: '#cfe0f2',
    precipitate: true, precipitateColour: '#fdfefe',
  });
  label(ctx, cx, BENCH_Y - 268, `Test: ${inputs?.test || 'appearance'}`, { anchor: 'above', bold: true });
  label(ctx, cx + 150, BENCH_Y - 190,
    dev > 0.9 ? 'Observation complete — record it'
      : dev > 0.05 ? 'Precipitate forming…' : 'No change so far',
    { anchor: 'right', color: dev > 0.9 ? '#0d7a52' : undefined });
}

export function functionalGroupTest(ctx, w, h, state, inputs) {
  const cx = 360;
  // Most functional-group tests announce themselves in colour.
  const { dev } = developingTube(ctx, cx, state, inputs, {
    label: inputs?.compound || 'Compound under test',
    baseColour: '#f2eede', positiveColour: '#e07a1f',
    precipitate: /dnp|tollens|fehling|iodoform/i.test(String(inputs?.test)),
    precipitateColour: /tollens/i.test(String(inputs?.test)) ? '#c9ccd2' : '#f0c419',
  });
  label(ctx, cx, BENCH_Y - 268, `Reagent: ${inputs?.test || '—'}`, { anchor: 'above', bold: true });
  label(ctx, cx + 150, BENCH_Y - 190,
    state?.complete ? (dev > 0.5 ? 'POSITIVE — characteristic change' : 'Negative — no change')
      : 'Warming the tube…',
    { anchor: 'right', bold: true, color: state?.complete ? (dev > 0.5 ? '#0d7a52' : '#8a5a00') : undefined });
}

export function biomoleculeTest(ctx, w, h, state, inputs) {
  const cx = 360;
  const t = String(inputs?.test || '');
  // Each classical test has its own colour: Molisch violet ring, Biuret
  // violet, Ninhydrin blue-purple, Fehling brick red, iodine blue-black.
  const positive = /molisch|biuret|ninhydrin/i.test(t) ? '#7a3fc4'
    : /fehling|benedict/i.test(t) ? '#b2401b'
      : /iodine|starch/i.test(t) ? '#1c2b52' : '#3fae5a';
  const { dev } = developingTube(ctx, cx, state, inputs, {
    label: inputs?.sample || 'Sample',
    baseColour: '#f4ecd0', positiveColour: positive,
    precipitate: /fehling|benedict/i.test(t),
    precipitateColour: '#b2401b',
  });
  label(ctx, cx, BENCH_Y - 268, `Reagent: ${t || '—'}`, { anchor: 'above', bold: true });
  label(ctx, cx + 150, BENCH_Y - 190,
    state?.complete ? (dev > 0.5 ? 'POSITIVE' : 'Negative — no colour developed') : 'Developing…',
    { anchor: 'right', bold: true, color: state?.complete ? (dev > 0.5 ? '#0d7a52' : '#8a5a00') : undefined });
}

export function lassaigneTest(ctx, w, h, state, inputs) {
  const cx = 300;
  const glow = clamp(state?.glow ?? 0, 0, 1);

  // Fusion tube held in a clamp, heated to red heat.
  drawRetortStand(ctx, cx - 130, BENCH_Y, 360, { label: 'Retort stand' });
  drawClamp(ctx, cx - 130, BENCH_Y - 210, cx - 26, { label: 'Test-tube holder' });
  drawTestTube(ctx, cx, BENCH_Y - 250, 150, 34, 0.2, '#b9beca', {
    label: 'Fusion tube (Na + compound)', inRack: true, heat: glow,
  });
  drawBurner(ctx, cx, BENCH_Y, true, { air: 1, flameHeight: 62 });

  /* Red heat is not decorative here: the fusion is not complete until the
     tube reaches it, and testing the extract early gives a false negative. */
  if (glow > 0.25) {
    ctx.save();
    const k = (glow - 0.25) / 0.75;
    const g = ctx.createLinearGradient(0, BENCH_Y - 130, 0, BENCH_Y - 100);
    g.addColorStop(0, rgba(mixColor('#8c1a05', '#ff7a12', k), 0.75 * k));
    g.addColorStop(1, rgba('#ff9c2a', 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - 20, BENCH_Y - 132, 40, 34);
    ctx.restore();
  }

  // The extract, once there is one to test.
  const ex = clamp(state?.extract ?? 0, 0, 1);
  drawRack(ctx, cx + 300, BENCH_Y, 1, 110);
  drawTestTube(ctx, cx + 300, BENCH_Y - 220, 220, 46, 0.2 + ex * 0.45, '#eef3fb', {
    label: 'Sodium fusion extract', inRack: true,
  });
  label(ctx, cx + 140, BENCH_Y - 300,
    state?.fused ? 'Fusion complete — filter and test the extract'
      : `Heating to red heat… ${(glow * 100).toFixed(0)}%`,
    { anchor: 'right', bold: true, color: state?.fused ? '#0d7a52' : '#8a5a00' });
}

export function clockReaction(ctx, w, h, state, inputs) {
  const cx = 380;
  /* The iodine clock stays completely clear while the thiosulphate lasts,
     and then goes blue-black all at once. That switch is the measurement,
     so the colour must hold flat and then jump -- a gradual fade would
     teach the wrong thing entirely. */
  const blue = clamp(state?.blue ?? 0, 0, 1);
  const col = mixColor('#eef3fb', '#141d3a', blue);

  const F = drawConicalFlask(ctx, cx, BENCH_Y - 210, 52, 180, 210, 0.55, col, {
    label: 'KI + starch + thiosulphate + H₂O₂',
    stirring: state?.running && blue < 0.5 ? 0.25 : 0,
  });

  // The cross on the tile under the flask, which is what is watched.
  ctx.save();
  ctx.globalAlpha = 1 - blue;
  ctx.strokeStyle = '#1a2333'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 22, BENCH_Y - 22); ctx.lineTo(cx + 22, BENCH_Y + 6);
  ctx.moveTo(cx + 22, BENCH_Y - 22); ctx.lineTo(cx - 22, BENCH_Y + 6);
  ctx.stroke();
  ctx.restore();

  label(ctx, cx, BENCH_Y + 12,
    blue > 0.5 ? 'Blue-black — stop the clock' : 'Watch for the sudden blue-black colour',
    { anchor: 'below', bold: blue > 0.5, color: blue > 0.5 ? '#c02626' : undefined });
  label(ctx, cx + 190, BENCH_Y - 300,
    state?.finishedAt ? `Clock time ${state.finishedAt.toFixed(1)} s`
      : state?.running ? `t = ${(state.elapsed ?? 0).toFixed(1)} s — induction period`
        : 'Mix the solutions and start the clock',
    { anchor: 'right', bold: true });
}

export function saltPreparation(ctx, w, h, state, inputs) {
  const cx = 380;
  const ferric = inputs?.product === 'ferricOxalate';
  const evap = clamp(state?.evaporated ?? 0, 0, 1);
  const cry = clamp(state?.crystals ?? 0, 0, 1);
  const heating = state?.phase === 'evaporating';

  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 176, vesselHeight: 120,
    // The liquor concentrates as it evaporates, so it deepens in colour.
    fill: 0.66 - evap * 0.3,
    liquid: ferric ? '#2f9e57' : '#9fd8ea',
    lit: heating, air: 1, flameHeight: 42,
    vesselLabel: 'Evaporating dish (reaction mixture)',
  });

  // Crystals growing on cooling.
  if (cry > 0) {
    ctx.save();
    const n = Math.round(cry * 28);
    for (let i = 0; i < n; i++) {
      const rx = cx - 70 + ((i * 41) % 140);
      const ry = A.bot - 8 - ((i * 11) % 10);
      const size = (3 + ((i * 7) % 4)) * (inputs?.cooling === 'slow' ? 1.7 : 0.9);
      ctx.save();
      ctx.translate(rx, ry);
      ctx.rotate(((i * 53) % 90) * Math.PI / 180);
      ctx.fillStyle = ferric ? 'rgba(120,220,160,0.92)' : 'rgba(180,215,240,0.92)';
      ctx.strokeStyle = 'rgba(60,110,160,0.8)'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -size); ctx.lineTo(size * 0.6, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.6, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  label(ctx, cx, A.bot + 26,
    state?.phase === 'evaporating' ? `Evaporating to the crystallisation point (${(evap * 100).toFixed(0)}%)`
      : state?.phase === 'complete' ? `Crystals grown — ${inputs?.cooling === 'slow' ? 'slow cooling gave large, well-formed crystals' : 'fast cooling gave small crystals'}`
        : 'Cooling — crystals separating',
    { anchor: 'below', bold: true });
  label(ctx, cx + 150, A.topY + 40, `Product: ${inputs?.product || 'double salt'}`, { anchor: 'right' });
}

export function organicPreparation(ctx, w, h, state, inputs) {
  const th = theme();
  const cx = 380;
  const reflux = clamp(state?.reflux ?? 0, 0, 1);
  const boiling = clamp(state?.bubbles ?? 0, 0, 1);

  const A = heatingAssembly(ctx, cx, BENCH_Y, {
    vesselWidth: 168, vesselHeight: 128, fill: 0.55,
    liquid: '#f0e2b8', lit: true, air: 1, flameHeight: 40,
    vessel: 'flask', vesselLabel: 'Reaction flask',
    boiling, bubbling: boiling * 20,
  });

  /* The reflux condenser is the piece of apparatus that makes this a
     PREPARATION and not just boiling something away: vapour rises, is
     condensed on the cold inner tube and runs back, so nothing is lost
     over what can be a long reaction. */
  const cTop = A.topY - 210, cBot = A.topY + 6;
  ctx.save();
  ctx.strokeStyle = th.glassStroke; ctx.lineWidth = 1.6;
  ctx.fillStyle = rgba('#bcd4ea', 0.2);
  ctx.beginPath(); ctx.rect(cx - 22, cTop, 44, cBot - cTop); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.rect(cx - 8, cTop - 10, 16, cBot - cTop + 12); ctx.stroke();
  // Water jacket, in at the bottom and out at the top — always that way round.
  for (const [y, txt] of [[cBot - 34, 'Water in'], [cTop + 30, 'Water out']]) {
    ctx.beginPath(); ctx.moveTo(cx + 22, y); ctx.lineTo(cx + 52, y - 12); ctx.stroke();
    label(ctx, cx + 54, y - 12, txt, { anchor: 'right', size: 10 });
  }
  // Condensate running back down the inner tube.
  if (reflux > 0.5) {
    const t = clock();
    ctx.fillStyle = rgba('#cfe6f7', 0.9);
    for (let i = 0; i < 4; i++) {
      const ph = ((t * 0.6 + i * 0.25) % 1);
      ctx.beginPath();
      ctx.ellipse(cx - 4 + (i % 2) * 8, cTop + 20 + ph * (cBot - cTop - 30), 1.8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  label(ctx, cx, cTop - 12, 'Reflux (water) condenser', { anchor: 'above' });
  drawRetortStand(ctx, cx - 150, BENCH_Y, 470, { label: 'Retort stand' });
  drawClamp(ctx, cx - 150, cTop + 70, cx - 24, { label: 'Clamp' });

  label(ctx, cx + 170, A.topY + 60,
    state?.phase === 'complete' ? 'Reaction complete — pour into ice-cold water'
      : state?.phase === 'reacting' ? `Refluxing — ${(100 * (state?.product ?? 0)).toFixed(0)}% converted`
        : `Heating to reflux… ${(reflux * 100).toFixed(0)}%`,
    { anchor: 'right', bold: true, color: state?.phase === 'complete' ? '#0d7a52' : undefined });
  label(ctx, cx, BENCH_Y + 30, inputs?.preparation || 'Organic preparation', { anchor: 'below' });
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
