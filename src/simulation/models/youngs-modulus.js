/**
 * MODEL: Young's modulus by Searle's apparatus — XI-PHY-B01
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 1.
 * Y = stress/strain = 4MgL/(πD²·l). Beyond the elastic limit the wire no
 * longer obeys Hooke's law and such readings must be discarded.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B01',
  formula: 'Y = 4MgL/(πD²·l) = slope × L/A',
  unitSystem: 'SI: length in m, load in N, Y in N·m⁻²',
  assumptions: ['The wire is uniform and free of kinks', 'Loading stays within the elastic limit', 'The reference wire cancels sag and temperature effects'],
  validRange: 'Load 0.5-6 kg on a 0.3-1.0 mm wire',
  edgeCases: ['Beyond the elastic limit the extension grows much faster than the load', 'Unloading after that point does not retrace the same line'],
  expectedBehaviour: ['Extension is proportional to load within the elastic limit', 'Y recovers the accepted value for the chosen material'],
};

export const G = 9.792;
export const WIRES = {
  steel: { label: 'Steel wire', Y: 2.0e11, elasticLimitN: 55 },
  copper: { label: 'Copper wire', Y: 1.2e11, elasticLimitN: 35 },
  brass: { label: 'Brass wire', Y: 1.0e11, elasticLimitN: 30 },
  aluminium: { label: 'Aluminium wire', Y: 0.7e11, elasticLimitN: 22 },
};

export const defaults = { loadKg: 0.5, wire: 'steel', lengthM: 2, diameterMm: 0.45 };

export function wireOf(inputs) { return WIRES[inputs.wire] || WIRES.steel; }
export function areaM2(inputs) { const d = inputs.diameterMm / 1000; return (Math.PI * d * d) / 4; }
export function loadN(inputs) { return inputs.loadKg * G; }
export function beyondElasticLimit(inputs) { return loadN(inputs) > wireOf(inputs).elasticLimitN; }

export function extensionM(inputs) {
  const w = wireOf(inputs);
  const F = loadN(inputs);
  if (F <= w.elasticLimitN) return (F * inputs.lengthM) / (w.Y * areaM2(inputs));
  // Beyond the limit, extension grows faster (plastic yielding) than Hooke's law predicts.
  const elasticPart = (w.elasticLimitN * inputs.lengthM) / (w.Y * areaM2(inputs));
  const excess = F - w.elasticLimitN;
  return elasticPart + excess * (elasticPart / w.elasticLimitN) * 3;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (beyondElasticLimit(inputs)) {
    warnings.push({
      field: 'loadKg', code: 'BEYOND_ELASTIC_LIMIT',
      message: 'This load has taken the wire beyond its elastic limit.',
      why: 'Hooke\'s law, and therefore Y = stress/strain as a constant, holds only within the elastic limit. Readings taken beyond it must be discarded, not averaged in with the rest.',
      fix: `Keep the load under about ${(wireOf(inputs).elasticLimitN / G).toFixed(1)} kg for this wire.`,
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, extension: 0, v: 0, settled: false, yielded: false }; }
/**
 * The wire under load. It does not jump to its new length: the load is
 * hung on, the wire stretches and the vernier settles over a moment. Past
 * the elastic limit it keeps extending and does not come back, which is
 * the failure the experiment warns against.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = extensionM(inputs);
  s.yielded = beyondElasticLimit(inputs);
  const k = s.yielded ? 2.0 : 5.5;
  s.extension += (target - s.extension) * Math.min(1, dt * k);
  if (s.yielded) s.extension += target * dt * 0.05;   // creeping, not recovering
  s.settled = !s.yielded && Math.abs(target - s.extension) < Math.max(1e-9, target * 0.003);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 73);
  const trueExt = extensionM(inputs);
  const extM = trueExt + jitter(rng, 0.00004);
  const extCm = extM * 100;
  return {
    trial, loadKg: inputs.loadKg, loadN: sigFig(loadN(inputs), 4),
    extensionCm: Number(extCm.toFixed(3)), extensionMm: Number((extCm * 10).toFixed(2)),
    stressMPa: sigFig(loadN(inputs) / areaM2(inputs) / 1e6, 4),
    strain: sigFig(extM / inputs.lengthM, 5),
    _beyond: beyondElasticLimit(inputs),
  };
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => !r._beyond);
  if (usable.length < 4) return { ok: false, reason: 'Record at least four readings within the elastic limit (discard any taken beyond it).' };
  const pts = usable.map((r) => ({ x: Number(r.extensionMm), y: Number(r.loadN) }));
  const fit = fitThroughOrigin(pts);
  if (!fit) return { ok: false, reason: 'Vary the load between readings.' };
  const slopeSI = fit.slope * 1000; // N per mm -> N per m
  const Y = (slopeSI * inputs.lengthM) / areaM2(inputs);
  const discarded = rows.length - usable.length;
  return {
    ok: true, youngsModulus: sigFig(Y, 4), slope: sigFig(slopeSI, 4), r2: Number(fit.r2.toFixed(4)),
    discardedBeyondLimit: discarded, n: usable.length, points: pts,
  };
}

export default { meta, defaults, WIRES, G, init, step, measure, derive, validate, wireOf, areaM2, loadN, extensionM, beyondElasticLimit };
