/**
 * MODEL: Lateral deviation through a glass slab — XII-PHY-ACT-B4
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 4.
 * sin i = μ sin r; d = t·sin(i−r)/cos r.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B4',
  formula: 'd = t·sin(i−r)/cos r, with sin i = μ sin r',
  unitSystem: 'Degree, millimetre',
  assumptions: ['The two faces of the slab are flat and parallel', 'Pins are aligned by eye without parallax'],
  validRange: 'Incidence 0°-80°',
  edgeCases: ['At normal incidence (i=0) the shift is exactly zero', 'The shift never exceeds the slab thickness, however oblique the ray'],
  expectedBehaviour: ['The emergent ray is parallel to the incident ray, only displaced', 'Shift grows with the angle of incidence and with the slab thickness'],
};

export const SLABS = { crown: { label: 'Crown glass slab', mu: 1.52 }, flint: { label: 'Flint glass slab', mu: 1.62 }, dense: { label: 'Dense flint slab', mu: 1.72 }, perspex: { label: 'Perspex slab', mu: 1.49 } };
export const THICKNESSES = { t15: 1.5, t30: 3.0, t45: 4.5 };
export const SCALES = { s01: 0.1, s005: 0.05, s002: 0.02 };

export const defaults = { slab: 'crown', thickness: 't30', scale: 's005', incidenceDeg: 45 };

export function slabOf(inputs) { return SLABS[inputs.slab] || SLABS.crown; }
export function thicknessCm(inputs) { return THICKNESSES[inputs.thickness] || 3.0; }
export function refractionDeg(inputs) { return (Math.asin(Math.sin((inputs.incidenceDeg * Math.PI) / 180) / slabOf(inputs).mu) * 180) / Math.PI; }
export function shiftMm(inputs) {
  const i = (inputs.incidenceDeg * Math.PI) / 180;
  const r = (refractionDeg(inputs) * Math.PI) / 180;
  return thicknessCm(inputs) * 10 * (Math.sin(i - r) / Math.cos(r));
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.incidenceDeg === 0) warnings.push({ field: 'incidenceDeg', code: 'NORMAL_INCIDENCE', message: 'At normal incidence there is no lateral shift to measure.', why: 'sin(i−r) = 0 when i = r = 0, so the emergent ray lies exactly on the incident ray.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, shift: 0, sweep: 0, settled: false }; }
/**
 * A ray through a parallel-sided slab emerges parallel to itself but
 * laterally displaced. Sweeping the angle of incidence shows the shift
 * growing with it, which is the relationship being investigated.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = shiftMm(inputs);
  s.shift += (target - s.shift) * Math.min(1, dt * 3.4);
  s.sweep = (s.sweep + dt * 0.55) % 1;     // the ray being traced along
  s.settled = Math.abs(target - s.shift) < 0.02;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 251);
  const lc = SCALES[inputs.scale] || 0.05;
  const shift = shiftMm(inputs) + jitter(rng, lc * 10);
  return { trial, incidenceDeg: inputs.incidenceDeg, refractionDeg: sigFig(refractionDeg(inputs), 4), shiftMm: Number(shift.toFixed(2)), thicknessCm: thicknessCm(inputs) };
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => Number(r.incidenceDeg) > 0);
  if (usable.length < 4) return { ok: false, reason: 'Record the shift for at least four non-zero angles of incidence.' };
  // Recover mu from the mean of sin(i)/sin(r) implied by each row's shift via inversion is complex;
  // instead average the mu that reproduces the observed shift most closely over a search grid.
  let bestMu = 1.5; let bestErr = Infinity;
  for (let mu = 1.3; mu <= 1.9; mu += 0.002) {
    let err = 0;
    for (const r of usable) {
      const i = (Number(r.incidenceDeg) * Math.PI) / 180;
      const rr = Math.asin(Math.sin(i) / mu);
      const pred = thicknessCm(inputs) * 10 * (Math.sin(i - rr) / Math.cos(rr));
      err += (pred - Number(r.shiftMm)) ** 2;
    }
    if (err < bestErr) { bestErr = err; bestMu = mu; }
  }
  const shifts = usable.map((r) => Number(r.shiftMm));
  const maxShiftMm = Math.max(...shifts);
  const sorted = [...usable].sort((a, b) => Number(a.incidenceDeg) - Number(b.incidenceDeg));
  const shiftIncreases = Number(sorted[sorted.length - 1].shiftMm) > Number(sorted[0].shiftMm);
  return { ok: true, mu: sigFig(bestMu, 4), maxShiftMm: sigFig(maxShiftMm, 4), shiftIncreases, n: usable.length, points: rows.map((r) => ({ x: Number(r.incidenceDeg), y: Number(r.shiftMm) })) };
}

export default { meta, defaults, SLABS, THICKNESSES, SCALES, init, step, measure, derive, validate, slabOf, thicknessCm, refractionDeg, shiftMm };
