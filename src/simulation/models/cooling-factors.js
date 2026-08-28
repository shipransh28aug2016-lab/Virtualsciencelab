/**
 * MODEL: Factors affecting the rate of loss of heat of a liquid — XI-PHY-ACT-B5
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 5.
 * Newton's law of cooling, with the cooling constant k varied by surface
 * finish, cover, and volume — the factors the activity asks about.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B5',
  formula: 'k = hA/(mc); excess = excess0·e^(−kt); ln(excess) linear in t, slope −k',
  unitSystem: 'per second; temperature in °C',
  assumptions: ['The surrounding temperature is constant', 'The liquid is well stirred', 'Excess temperature stays small enough for Newton\'s law to hold'],
  validRange: 'Volume 100-500 cm³, excess up to about 70 °C',
  edgeCases: ['A dull black surface radiates fastest, a polished one slowest', 'A lid roughly halves the rate by suppressing evaporation and convection'],
  expectedBehaviour: ['ln(excess) falls linearly with time', 'Doubling the volume roughly halves the cooling constant'],
};

export const LIQUIDS = { water: { label: 'Water', c: 4186 }, oil: { label: 'Cooking oil', c: 1970 }, glycerine: { label: 'Glycerine', c: 2430 } };
export const SURFACES = { dullBlack: { label: 'Dull black vessel', h: 1.0 }, dullGrey: { label: 'Dull grey vessel', h: 0.65 }, polished: { label: 'Polished vessel', h: 0.33 } };
export const COVERS = { open: { label: 'Open', mult: 1 }, lid: { label: 'With a lid', mult: 0.55 } };

export const defaults = { liquid: 'water', surface: 'dullBlack', cover: 'open', volumeCm3: 200, startExcessC: 45, roomTempC: 28, interval: 30 };

export function coolingConstant(inputs) {
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.water;
  const s = SURFACES[inputs.surface] || SURFACES.dullBlack;
  const cover = COVERS[inputs.cover] || COVERS.open;
  const base = 0.00089 * (200 / inputs.volumeCm3) * (LIQUIDS.water.c / l.c);
  return base * (s.h / SURFACES.dullBlack.h) * cover.mult;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init(inputs = defaults) { return { t: 0, running: true, tempC: inputs.roomTempC + inputs.startExcessC }; }
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt * 20; // time-lapse so the run is watchable
  const k = coolingConstant(inputs);
  s.tempC = inputs.roomTempC + inputs.startExcessC * Math.exp(-k * s.t);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 157);
  const t = (trial - 1) * inputs.interval;
  const k = coolingConstant(inputs);
  const trueTemp = inputs.roomTempC + inputs.startExcessC * Math.exp(-k * t);
  const temp = toLeastCount(trueTemp + jitter(rng, 0.3), 0.5);
  const excess = temp - inputs.roomTempC;
  return {
    trial, timeS: t, tempC: Number(temp.toFixed(1)), excessC: Number(excess.toFixed(1)),
    lnExcess: excess > 0 ? Number(Math.log(excess).toFixed(4)) : null,
    surface: inputs.surface, cover: inputs.cover, volumeCm3: inputs.volumeCm3,
  };
}

/**
 * A calorimeter-shaped vessel (height ≈ diameter is the usual proportion)
 * of the given volume, purely to put a plausible exposed-area figure and
 * an area-to-volume ratio in the result text -- coolingConstant() itself
 * folds area into the simplified 1/volume scaling the activity's own
 * "doubling the volume roughly halves k" rule of thumb rests on, so this
 * geometry is descriptive, not a second independent formula for k.
 */
export function vesselAreaCm2(volumeCm3) {
  const d = Math.cbrt((4 * volumeCm3) / Math.PI); // height = diameter
  return 1.5 * Math.PI * d * d; // curved side (πd·d) + top + bottom (2·π(d/2)²)
}

/** Fit ln(excess) vs time separately within each value of one factor, so a
 * genuine per-group cooling constant can be compared -- rather than
 * assuming the activity's rule of thumb rather than checking it. */
function checkByFactor(usableRows, keyFn, labelFn) {
  const groups = new Map();
  for (const r of usableRows) {
    const key = keyFn(r);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ x: Number(r.timeS), y: Number(r.lnExcess) });
  }
  if (groups.size < 2) return null;
  const out = [];
  for (const [key, pts] of groups) {
    if (pts.length < 2) continue;
    const gFit = linearFit(pts);
    if (gFit) out.push({ name: labelFn(key), k: sigFig(-gFit.slope, 4) });
  }
  return out.length >= 2 ? out : null;
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => Number(r.excessC) > 0.5);
  if (usable.length < 4) return { ok: false, reason: 'Record at least four readings while the liquid is still noticeably warmer than the room.' };
  const pts = usable.map((r) => ({ x: Number(r.timeS), y: Number(r.lnExcess) }));
  const fit = linearFit(pts);
  if (!fit) return { ok: false, reason: 'Space the readings out in time.' };
  const k = -fit.slope;
  const accepted = coolingConstant(inputs);
  const areaCm2 = vesselAreaCm2(inputs.volumeCm3);

  const surfaceCheck = checkByFactor(usable, (r) => r.surface, (key) => (SURFACES[key] || {}).label || key);
  const volumeCheck = checkByFactor(usable, (r) => Number(r.volumeCm3), (key) => key);
  const factorsVaried = ['surface', 'cover', 'volumeCm3'].filter((f) => new Set(rows.map((r) => r[f])).size >= 2).length;

  return {
    ok: true, coolingConstant: sigFig(k, 4), accepted: sigFig(accepted, 4),
    percentError: sigFig((Math.abs(k - accepted) / accepted) * 100, 4),
    halfLifeMin: sigFig(Math.log(2) / k / 60, 4), r2: Number(fit.r2.toFixed(4)),
    volumeCm3: inputs.volumeCm3, liquid: (LIQUIDS[inputs.liquid] || LIQUIDS.water).label,
    surface: (SURFACES[inputs.surface] || SURFACES.dullBlack).label,
    surfaceAreaCm2: sigFig(areaCm2, 4), areaPerVolume: sigFig(areaCm2 / inputs.volumeCm3, 4),
    surfaceCheck, volumeCheck, factorsVaried, covered: inputs.cover === 'lid',
    n: usable.length, points: rows.map((r) => ({ x: Number(r.timeS), y: Number(r.tempC) })),
  };
}

export default { meta, defaults, LIQUIDS, SURFACES, COVERS, init, step, measure, derive, validate, coolingConstant, vesselAreaCm2 };
