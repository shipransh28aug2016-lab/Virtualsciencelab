/**
 * standard.js — a standard solution, made by hand. Pure: no React, no three, no
 * store, no clock.
 *
 * What a volumetric flask does is simple and unforgiving: it holds a stated volume
 * at 20 °C when the bottom of the meniscus rests on a line scratched round a neck a
 * centimetre across — so a millilitre is eight millimetres of neck, and an eye that is
 * not level with the line misplaces the meniscus by a fraction of that. Everything a
 * student does to the concentration happens before the line: how much solid really
 * reaches the flask (a film stays on the bottle and the funnel unless it is rinsed
 * in), whether it has dissolved, how warm the flask is, how far the water went past
 * the mark, whether the flask has been turned over enough for the top to be the
 * same as the bottom.
 *
 * The concentration the flask really holds is
 *
 *      c = n / V        n the moles of solute in the flask, V its volume at the temperature of use
 *
 * and the student's own figure is  m_weighed / (M · V_nominal). The ratio of the two
 * is the product of independent factors — the balance, the purity of what was in the
 * jar, what was lost on the glass, the flask's own tolerance, how far it was filled,
 * the temperature — which is the error budget the bench shows at the end.
 */
import { mulberry32 } from '../numerics.js';

/** Density of water, g/mL, 0–40 °C (Tanaka et al., Metrologia 2001). */
export const waterDensity = (T) => 0.99997495 * (1 - ((T - 3.983035) ** 2 * (T + 301.797)) / (522528.9 * (T + 69.34881)));

/** Class-A volumetric flasks: nominal volume, tolerance (mL) and neck inner diameter (mm). Calibrated to contain, at 20 °C. */
export const FLASKS = {
  100: { mL: 100, tol: 0.08, neckMm: 9.2 },
  250: { mL: 250, tol: 0.12, neckMm: 12.5 },
  500: { mL: 500, tol: 0.2, neckMm: 15.8 },
  1000: { mL: 1000, tol: 0.3, neckMm: 19.8 },
};
export const CP_WATER = 4.18;                 // J g⁻¹ K⁻¹
export const TAU_ROOM = 420;                  // s, the flask coming to the room
export const VIEW_MM = 300;                   // how far the eye is from the neck
export const RINSE_ML = 10;                   // a squirt from the wash bottle

/** This flask's own volume at 20 °C: within tolerance, and it is the same error every time it is used. */
export const flaskVolume20 = (flask, seed = 3) => flask.mL + flask.tol * 0.7 * (2 * mulberry32(seed * 977)() - 1);
/** Millimetres of neck per millilitre. */
export const mmPerMl = (flask) => 1000 / (Math.PI * (flask.neckMm / 2) ** 2);

export function newBatch({ flaskMl = 250, form, seed = 3, roomC = 25 }) {
  const flask = FLASKS[flaskMl];
  return {
    form, flaskMl, seed, roomC, V20: flaskVolume20(flask, seed),
    water: 0,                                   // mL of liquid in the flask
    layer: 0,                                   // mL of it that has the solute in it (the rest, on top, is water that has not been mixed in)
    solid: 0, dissolved: 0,                     // mol of solute in the flask: as crystals, and in solution
    funnel: 0,                                  // mol of solute sitting on the funnel
    T: roomC, inversions: 0, stoppered: false, funnelIn: true, spilledMol: 0, spilledMl: 0,
    poured: 0,                                  // mol of solute that has been tipped towards the flask in all
    swirlLeft: 0,
  };
}

/** The mark plus what the neck holds above it (about 45 mm of neck: 5 mL in a 250). */
export const brimMl = (b) => b.V20 + 45 / mmPerMl(FLASKS[b.flaskMl]);

/** The fraction of the liquid that has the solute through it. */
export const mixedFraction = (b) => (b.water > 0 ? Math.min(1, b.layer / b.water) : 1);

/**
 * The tip of a bottle of solid through a funnel into the flask. `moleMoved` is what
 * leaves the bottle; a fraction stays on the funnel. Pouring beside the funnel (no
 * funnel in) spills a fraction on the bench.
 */
export function tipIn(b, moleMoved) {
  const stick = 0.0025 + 0.004 * mulberry32(b.seed * 31 + Math.round(b.poured * 1e6))();
  if (!b.funnelIn) {
    const spilled = moleMoved * 0.03;
    return { ...b, solid: b.solid + moleMoved - spilled, spilledMol: b.spilledMol + spilled, poured: b.poured + moleMoved };
  }
  return { ...b, solid: b.solid + moleMoved * (1 - stick), funnel: b.funnel + moleMoved * stick, poured: b.poured + moleMoved };
}

/** Water into the flask — on top of what is there, at the flask's temperature in proportion. Past the brim it runs over. */
export function addWater(b, ml, waterC = b.roomC) {
  if (ml <= 0) return b;
  const before = b.water;
  const water = before + ml;
  const T = (b.T * Math.max(before, 1) + waterC * ml) / (Math.max(before, 1) + ml);
  let next = { ...b, water, T, layer: before === 0 ? ml : b.layer };
  if (next.water > brimMl(next)) {
    const over = next.water - brimMl(next); const f = over / next.water;
    next = { ...next, water: brimMl(next), layer: next.layer * (1 - f * (1 - mixedFraction(next))), solid: next.solid * (1 - f), dissolved: next.dissolved * (1 - f), spilledMl: next.spilledMl + over, spilledMol: next.spilledMol + (next.solid + next.dissolved) * f };
  }
  return next;
}

/** A squirt from the wash bottle over the funnel: most of the film goes into the flask with ten mL of water. */
export function rinseFunnel(b, ml = RINSE_ML) {
  const back = b.funnel * 0.9;
  return addWater({ ...b, funnel: b.funnel - back, dissolved: b.dissolved + back }, ml, b.roomC);
}

/**
 * Take liquid out with a pipette, from the neck: the top comes first. If the top is water
 * that has not been mixed in, that fixes an overshoot; if it has been mixed, what comes
 * out is solution, and what is left is exactly as dilute as it was.
 */
export function removeWater(b, ml) {
  const take = Math.min(ml, b.water);
  if (take <= 0) return b;
  const top = Math.max(0, b.water - b.layer);
  const fromLayer = Math.max(0, take - top);
  const f = b.layer > 0 ? fromLayer / b.layer : 0;
  return {
    ...b, water: b.water - take, layer: b.layer - fromLayer, dissolved: b.dissolved * (1 - f), solid: b.solid * (1 - f),
    spilledMol: b.spilledMol + b.dissolved * f,
  };
}

/** Swirl: the solid dissolves faster, and the water is stirred in, for the next twenty seconds. */
export const swirl = (b) => ({ ...b, swirlLeft: 20 });

/** Turn the stoppered flask over: each inversion mixes 45 % of what is left unmixed. */
export function invert(b) {
  if (!b.stoppered) return b;
  const gap = b.water - b.layer;
  return { ...b, layer: gap < 1e-4 * b.water ? b.water : b.layer + gap * 0.45, inversions: b.inversions + 1 };
}

/** Dissolution, the heat of it, the water being stirred in, and the flask coming to the room. */
export function stepBatch(b, dt) {
  let { solid, dissolved, T, swirlLeft, layer } = b;
  const swirling = swirlLeft > 0;
  const tau = b.form.dissolveTau * (swirling ? 1 : 14);
  if (swirling) layer += (b.water - layer) * (1 - Math.exp(-dt / 5));
  swirlLeft = Math.max(0, swirlLeft - dt);
  if (solid > 0 && b.water > 5) {
    const d = solid * (1 - Math.exp(-dt / tau));
    solid -= d; dissolved += d;
    /* ΔH of solution (kJ/mol) heats or cools the water it goes into. */
    T += (-b.form.dHsol * 1000 * d) / (CP_WATER * Math.max(b.water, 5));
  }
  T += (b.roomC - T) * (1 - Math.exp(-dt / TAU_ROOM));
  const gone = solid < 2e-5;                       // a couple of milligrams is a crystal you cannot see: it has dissolved
  return { ...b, solid: gone ? 0 : solid, dissolved: gone ? dissolved + solid : dissolved, T, swirlLeft, layer };
}

/** Where the meniscus is against the mark, mm (positive: above). */
export const levelMm = (b) => {
  const flask = FLASKS[b.flaskMl];
  const volAtT = b.V20 * (1 + 1e-5 * (b.T - 20));                   // the glass at its own temperature
  /* Below the shoulder of the neck the level is somewhere in the bulb: it is only a millimetre-for-millimetre reading in the neck. */
  return Math.max(-50, (b.water - volAtT) * mmPerMl(flask));
};
/** What the student sees: the true level and the parallax of an eye that is not at the mark (mm above (+) or below (−) it). */
export const seenMm = (b, eyeMm) => levelMm(b) + eyeMm * (FLASKS[b.flaskMl].neckMm / VIEW_MM);

/** What the flask holds, at the temperature it is used at. */
export function truth(b, useC = b.roomC) {
  const n = b.solid + b.dissolved;
  const Vuse = b.water * (waterDensity(b.T) / waterDensity(useC));  // the liquid contracts or expands with the temperature
  const M = Vuse > 0 ? n / (Vuse / 1000) : 0;
  return { n, M, N: M * b.form.n, volumeMl: Vuse };
}

/**
 * The same flask, sampled at a depth — 0 at the top, 1 at the bottom. The solution lies
 * under whatever water was added on top and not mixed in; a sample from the water
 * on top is water.
 */
export function aliquot(b, depth, useC = b.roomC) {
  const t = truth(b, useC);
  if (b.water <= 0) return 0;
  const topFrac = Math.max(0, (b.water - b.layer) / b.water);
  const s = (x) => x * x * (3 - 2 * x);                                        // a soft edge, not a knife
  const inLayer = s(Math.min(1, Math.max(0, (depth - topFrac) / 0.06 + 0.5)));
  const cLayer = (t.n / (b.layer / 1000)) * (waterDensity(useC) / waterDensity(b.T)) ** 0;
  return cLayer * inLayer;
}

/** The student's own figure, from what the notebook says: the mass transferred (by difference), and the flask's nominal volume. */
export const claimed = (form, massG, flaskMl) => {
  const M = massG / (form.M * (flaskMl / 1000));
  return { M, N: M * form.n };
};

/** Why the figure is what it is: independent factors, each as a percentage, and their product. */
export function budget(b, { reportedG, trueG, useC = b.roomC }) {
  const t = truth(b, useC);
  const nWeighed = (trueG * b.form.purity) / b.form.M;               // what left the bottle, as solute
  const nReported = reportedG / b.form.M;
  const factors = [
    { id: 'balance', label: 'The balance: what the display said against the mass that left the bottle', f: nReported > 0 ? trueG / reportedG : 1 },
    { id: 'purity', label: 'What was in the jar: purity of the solid', f: b.form.purity },
    { id: 'glass', label: 'Lost on the bottle, funnel and bench', f: nWeighed > 0 ? t.n / nWeighed : 1 },
    { id: 'flask', label: 'This flask’s own volume against its label', f: FLASKS[b.flaskMl].mL / b.V20 },
    { id: 'fill', label: 'How far the water went past (or short of) the mark', f: (b.V20 * (1 + 1e-5 * (b.T - 20))) / b.water },
    { id: 'temperature', label: 'Made up at one temperature, used at another', f: waterDensity(useC) / waterDensity(b.T) / (1 + 1e-5 * (b.T - 20)) },   // the liquid contracts; the glass that marked the volume had grown a hair
  ];
  const product = factors.reduce((a, x) => a * x.f, 1);
  return { factors: factors.map((x) => ({ ...x, pct: (x.f - 1) * 100 })), totalPct: (product - 1) * 100, claimedM: nReported / (FLASKS[b.flaskMl].mL / 1000), trueM: t.M };
}

/** The arithmetic of the plan, checked: what mass a student who wrote this must have been thinking of. */
export function planFeedback({ planned, required, form, forms }) {
  const ratio = planned / required;
  if (Math.abs(ratio - 1) <= 0.012) return { ok: true, key: 'ok', text: `${planned.toFixed(3)} g is right for the volume and the normality asked for.` };
  if (Math.abs(ratio - form.n) <= 0.05 * form.n) return { ok: false, key: 'molar', text: `That is ${ratio.toFixed(1)} times what is needed: it makes the molarity asked for, not the normality. ${form.label} gives ${form.n} equivalents per mole, so N = ${form.n} M — divide the molar mass by ${form.n}.` };
  if (Math.abs(ratio - 1 / form.n) <= 0.05 / form.n) return { ok: false, key: 'inverse', text: `That is about 1/${form.n} of what is needed: the molar mass was multiplied by the n-factor instead of divided.` };
  for (const other of forms) {
    if (other.id === form.id) continue;
    const r = other.M / form.M;
    if (Math.abs(ratio - r) <= 0.02 * r) return { ok: false, key: 'form', text: `That is the mass for ${other.label} (M = ${other.M}), not for ${form.label} (M = ${form.M}).` };
  }
  return { ok: false, key: 'off', text: `${planned.toFixed(3)} g is ${Math.abs(100 * (ratio - 1)).toFixed(0)} % ${ratio > 1 ? 'more' : 'less'} than the target needs. Check M, the n-factor and the volume in litres.` };
}
