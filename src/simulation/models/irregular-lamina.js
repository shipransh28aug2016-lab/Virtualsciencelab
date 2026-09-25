/**
 * MODEL: Volume of an irregular lamina — XI-PHY-A03
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 3.
 * V = A·t, with A found by counting graph-paper squares (simulated with a
 * true area plus a counting scatter that shrinks as the grid gets finer,
 * since a finer grid leaves a smaller fraction of the area in doubt at the
 * boundary) and t by a screw gauge.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig, percentError } from '../../utils/measure.js';
import { nullPoint, nullRefusal } from '../null-point.js';
import { mixedSetRefusal, specimenOfRows } from '../one-specimen.js';

export const meta = {
  id: 'XI-PHY-A03',
  formula: 'A = N·a² (squares counted on graph paper); V = A·t',
  unitSystem: 'Thickness in mm, area in cm², volume in cm³',
  assumptions: ['Lamina of uniform thickness', 'Boundary squares more than half inside are counted whole', 'Outline traced without tilting the pencil'],
  validRange: 'Area 10-60 cm²; thickness 0.5-3 mm; grid 1, 2 or 5 mm',
  edgeCases: ['A coarse grid leaves more of the area in doubt', 'Non-uniform thickness shows as a spread across trials'],
  expectedBehaviour: ['Percentage errors of A and t add to give that of V', 'A 1 mm grid gives a visibly tighter area than a 5 mm grid'],
};

export const LAMINAS = {
  brass: { label: 'Brass lamina', areaCm2: 28.4, thicknessMm: 1.62 },
  aluminium: { label: 'Aluminium lamina', areaCm2: 34.0, thicknessMm: 1.05 },
  steel: { label: 'Steel lamina', areaCm2: 19.6, thicknessMm: 2.30 },
  card: { label: 'Card lamina', areaCm2: 42.5, thicknessMm: 0.60 },
};
export const GAUGES = { sg50: { pitch: 0.5, n: 50 }, sg100: { pitch: 1.0, n: 100 }, sg50f: { pitch: 0.5, n: 100 } };
export const GRIDS = { g1: { label: '1 mm squares', aMm: 1, countError: 0.015 }, g2: { label: '2 mm squares', aMm: 2, countError: 0.03 }, g5: { label: '5 mm squares', aMm: 5, countError: 0.07 } };

export const defaults = { lamina: 'brass', gauge: 'sg50', grid: 'g1', thimble: 1.62, zeroErrorDiv: 0, useRatchet: true };

export function laminaOf(inputs) { return LAMINAS[inputs.lamina] || LAMINAS.brass; }
export function leastCount(inputs) { const g = GAUGES[inputs.gauge] || GAUGES.sg50; return g.pitch / g.n; }
export function zeroErrorMm(inputs) { return inputs.zeroErrorDiv * leastCount(inputs); }
export function gripped(inputs) { return Math.abs(inputs.thimble - laminaOf(inputs).thicknessMm) <= Math.max(0.03, leastCount(inputs) * 3); }

/**
 * Whether the screw gauge has closed on the sheet. The ratchet is the real
 * indicator — it slips once the faces are gripping — so the student is told
 * whether to keep closing or to back off.
 */
export function nullIndicator(inputs) {
  return nullPoint({
    label: 'Screw gauge',
    current: inputs.thimble,
    target: laminaOf(inputs).thicknessMm,
    tolerance: Math.max(0.03, leastCount(inputs) * 3),
    increase: 'The sheet is being compressed — open the thimble a little.',
    decrease: 'The faces are still clear of the sheet — close the thimble further.',
    atNullText: 'the ratchet just slips — the faces are gripping',
    awayFrom: 'not gripping',
  });
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!gripped(inputs)) warnings.push({ field: 'thimble', code: 'NOT_GRIPPED', message: 'The screw gauge has not been closed on the lamina.', why: 'Move the thimble slider until the faces just meet the sheet.' });
  const grid = GRIDS[inputs.grid] || GRIDS.g1;
  if (grid.aMm >= 5) warnings.push({ field: 'grid', code: 'COARSE_GRID', message: '5 mm graph paper leaves a large fraction of the area in doubt.', why: 'All the uncertainty in the area lies in the boundary squares; a coarser grid makes each of them bigger relative to the total area.', fix: 'Use 1 mm graph paper for the tracing.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, swing: 0.35, settled: false, hole: 0 }; }
/**
 * The lamina hung from a pin, with a plumb line beside it. Both swing and
 * are damped to rest, and the vertical they settle to is the line that
 * must be ruled -- so the student has to wait for stillness before
 * marking, exactly as at the bench.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // Damped pendular swing of the suspended lamina.
  s.swing = 0.35 * Math.exp(-s.t * 0.75) * Math.cos(s.t * 4.6);
  s.settled = Math.abs(s.swing) < 0.004;
  s.hole = inputs.holeIndex ?? 0;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!gripped(inputs)) return { v: null, reason: nullRefusal(nullIndicator(inputs)) };
  const rng = makeRng(seed + trial * 41);
  const lc = leastCount(inputs);
  const lam = laminaOf(inputs);
  const thickness = toLeastCount(lam.thicknessMm - zeroErrorMm(inputs) * 0 + jitter(rng, lc * 0.6) + zeroErrorMm(inputs), lc);
  const grid = GRIDS[inputs.grid] || GRIDS.g1;
  const aSq = (grid.aMm / 10) ** 2; // cm² per square
  const trueSquares = lam.areaCm2 / aSq;
  const squares = Math.round(trueSquares * (1 + jitter(rng, grid.countError)));
  const complete = Math.round(squares * 0.72);
  const boundary = squares - complete;
  const area = squares * aSq;
  const volume = (area * thickness) / 10; // mm -> cm
  return {
    trial, lamina: laminaOf(inputs).label, pitchScaleReading: Number((thickness - (thickness % (GAUGES[inputs.gauge] || GAUGES.sg50).pitch)).toFixed(2)),
    circularDivision: Math.round((thickness % (GAUGES[inputs.gauge] || GAUGES.sg50).pitch) / lc),
    thickness: Number(thickness.toFixed(3)), completeSquares: complete, boundarySquares: boundary,
    area: sigFig(area, 4), volume: sigFig(volume, 4),
  };
}

export function derive(rows, inputs = defaults) {
  const mixed = mixedSetRefusal(rows, 'lamina', 'laminae');
  if (mixed) return mixed;

  if (rows.length < 3) return { ok: false, reason: 'Record at least three trials.' };
  const t = mean(rows.map((r) => Number(r.thickness)));
  const a = mean(rows.map((r) => Number(r.area)));
  const v = (a * t) / 10;
  const accepted = (laminaOf(inputs).areaCm2 * laminaOf(inputs).thicknessMm) / 10;
  /*
   * The error budget, which is the point of this experiment.
   *
   * V = A × t, and percentage errors ADD in a product — so the result panel
   * has always said "% in the area + % in the thickness = % in the volume,
   * the area dominates, so a finer grid helps more than a finer screw gauge."
   * It had no numbers to say it with: none of the three percentages was
   * returned, so a student read "undefined% + undefined% = undefined%" under
   * the one conclusion this practical exists to reach.
   *
   * The area's share comes from the grid — all the doubt in a counted area is
   * in the boundary squares, and a coarser grid makes each of them bigger
   * relative to the whole. The thickness's share is the screw gauge's least
   * count against the thickness measured.
   */
  const grid = GRIDS[inputs.grid] || GRIDS.g1;
  const areaPct = grid.countError * 100;
  const thicknessPct = t > 0 ? (leastCount(inputs) / t) * 100 : 0;
  return {
    ok: true, volume: sigFig(v, 4), meanArea: sigFig(a, 4), meanThickness: sigFig(t, 4),
    lamina: laminaOf(inputs).label,
    gridLabel: grid.label,
    areaPct: sigFig(areaPct, 2),
    thicknessPct: sigFig(thicknessPct, 2),
    totalPct: sigFig(areaPct + thicknessPct, 2),
    accepted: sigFig(accepted, 4), percentError: sigFig(percentError(v, accepted), 3), n: rows.length,
    points: rows.map((r, i) => ({ x: i + 1, y: Number(r.volume) })),
  };
}

export default { meta, defaults, LAMINAS, GAUGES, GRIDS, init, step, measure, derive, validate, laminaOf, leastCount, gripped, nullIndicator};
