/**
 * MODEL: Force constant of a helical spring — XI-PHY-B02
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 2.
 * Hooke's law: F = k·x. The state carries `x` (extension in metre) and
 * `settled`, which main.js's readout panel reads directly.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B02',
  formula: 'F = k·x',
  unitSystem: 'Load in gram converted to newton; extension in metre',
  assumptions: ['The spring is loaded within its elastic limit', 'The spring is light compared with the loads used', 'It hangs freely, oscillations having died away'],
  validRange: 'Load 0-600 g',
  edgeCases: ['Too heavy a load can permanently deform a soft spring'],
  expectedBehaviour: ['Extension is proportional to load: a straight line through the origin', 'A stiffer spring gives a smaller extension for the same load'],
};

export const G = 9.792;
export const SPRINGS = { steel: { label: 'Steel spring', k: 24.5 }, brass: { label: 'Brass spring', k: 15.8 }, stiff: { label: 'Stiff spring', k: 48.0 } };

export const defaults = { loadG: 100, springType: 'steel' };

export function springOf(inputs) { return SPRINGS[inputs.springType] || SPRINGS.steel; }
export function extensionM(inputs) { return ((inputs.loadG / 1000) * G) / springOf(inputs).k; }

export function validate(inputs) {
  const warnings = [];
  if (inputs.loadG === 0) warnings.push({ field: 'loadG', code: 'NO_LOAD', message: 'No load is hung yet.', why: 'A single reading with no load gives zero extension and adds nothing to the graph beyond the origin itself.' });
  return { ok: true, errors: [], warnings };
}

export function init(inputs = defaults) { return { t: 0, x: 0, settled: false, target: extensionM(inputs) }; }

export function step(state, inputs, dt) {
  const s = { ...state };
  const target = extensionM(inputs);
  s.x += (target - s.x) * Math.min(1, dt * 5);
  s.settled = Math.abs(target - s.x) < 0.0003;
  s.t += dt;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state || !state.settled) return null;
  const rng = makeRng(seed + trial * 79);
  const trueX = extensionM(inputs);
  const xM = trueX + jitter(rng, 0.0006);
  return { trial, loadG: inputs.loadG, loadN: sigFig((inputs.loadG / 1000) * G, 4), extensionCm: Number((xM * 100).toFixed(2)), extensionM: Number(xM.toFixed(4)) };
}

export function derive(rows) {
  const pts = rows.map((r) => ({ x: Number(r.extensionM), y: Number(r.loadN) })).filter((p) => p.x > 0);
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different loads.' };
  const fit = fitThroughOrigin(pts);
  if (!fit) return { ok: false, reason: 'Vary the load between readings.' };
  return { ok: true, k: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, SPRINGS, G, init, step, measure, derive, validate, springOf, extensionM };
