/**
 * MODEL: Plotting a graph with proper scales and error bars — XI-PHY-ACT-A3
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 3.
 * A fixed, realistic dataset is supplied; the activity is about JUDGEMENT —
 * choice of scale, drawing error bars, and taking the slope from the line
 * rather than from two isolated points.
 */
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A3',
  formula: 'slope = rise/run, from the best-fit line, not from two points',
  unitSystem: 'Depends on the dataset chosen',
  assumptions: ['Each point carries a stated uncertainty (its error bar)', 'A good straight line passes within most of the error bars'],
  validRange: 'Six-point datasets',
  edgeCases: ['A coarse y-scale hides scatter and makes a poor fit look acceptable', 'Taking the slope from two points ignores the other four readings'],
  expectedBehaviour: ['The best-fit line passes within the error bar of most points', 'A finer scale reveals scatter that a coarse one hides'],
};

export const DATASETS = {
  springLoad: { label: 'Spring: load vs extension', xLabel: 'Load (g)', yLabel: 'Extension (cm)', throughOrigin: true, points: [[50, 0.95], [100, 1.78], [150, 2.74], [200, 3.65], [250, 4.51], [300, 5.49]], errorCm: 0.1 },
  pendulum: { label: 'Pendulum: L vs T²', xLabel: 'L (cm)', yLabel: 'T² (s²)', throughOrigin: true, points: [[40, 1.62], [60, 2.44], [80, 3.24], [100, 4.06], [120, 4.87], [140, 5.68]], errorCm: 0.12 },
  resistance: { label: 'V-I graph of a resistor', xLabel: 'Current (A)', yLabel: 'Voltage (V)', throughOrigin: true, points: [[0.2, 0.98], [0.4, 2.05], [0.6, 2.95], [0.8, 4.10], [1.0, 4.92], [1.2, 6.08]], errorCm: 0.08 },
  thermistor: { label: 'Cooling curve (not linear)', xLabel: 'Time (s)', yLabel: 'Temperature (°C)', throughOrigin: false, points: [[0, 80], [60, 68], [120, 59], [180, 52], [240, 46], [300, 41]], errorCm: 0.6 },
};

export const defaults = { dataset: 'springLoad', yScale: 'auto', slopeMethod: 'bestFit', forceThroughOrigin: true, showErrorBars: true };

export function datasetOf(inputs) { return DATASETS[inputs.dataset] || DATASETS.springLoad; }

export function validate(inputs) {
  const warnings = [];
  if (inputs.yScale === 'veryCoarse') warnings.push({ field: 'yScale', code: 'SCALE_HIDES_SCATTER', message: 'A very coarse y-scale hides the scatter in the points.', why: 'If the axis spans far more than the data needs, small but real deviations from the line become invisible, and a bad fit can look perfect.', fix: 'Choose a scale that makes the points fill most of the graph.' });
  if (inputs.slopeMethod === 'twoPoints') warnings.push({ field: 'slopeMethod', code: 'TWO_POINT_SLOPE', message: 'Taking the slope from two points uses only a third of the data.', why: 'The best-fit line uses every point and averages out random error; two points carry only their own two errors, magnified by the calculation.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed, trial) {
  const d = datasetOf(inputs);
  const i = (trial - 1) % d.points.length;
  const [x, y] = d.points[i];
  return { trial, x, y, errorBar: d.errorCm, yMin: sigFig(y - d.errorCm, 4), yMax: sigFig(y + d.errorCm, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 4) return { ok: false, reason: 'Plot at least four points from the dataset.' };
  const d = datasetOf(inputs);
  const pts = rows.map((r) => ({ x: Number(r.x), y: Number(r.y) }));
  let slope;
  if (inputs.slopeMethod === 'twoPoints' && pts.length >= 2) {
    const a = pts[0]; const b = pts[pts.length - 1];
    slope = (b.y - a.y) / (b.x - a.x);
  } else {
    const fit = linearFit(pts);
    slope = fit ? fit.slope : null;
  }
  const fit = linearFit(pts);
  const within = rows.filter((r) => {
    const pred = fit ? fit.slope * Number(r.x) + fit.intercept : Number(r.y);
    return Math.abs(pred - Number(r.y)) <= Number(r.errorBar);
  }).length;
  return { ok: true, slope: slope !== null ? sigFig(slope, 4) : null, r2: fit ? Number(fit.r2.toFixed(4)) : null, pointsWithinError: within, n: rows.length, points: pts, xLabel: d.xLabel, yLabel: d.yLabel };
}

export default { meta, defaults, DATASETS, init, step, measure, derive, validate, datasetOf };
