/**
 * MODEL: Effect of light intensity on an LDR — XII-PHY-ACT-B3
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 3.
 * E = I/d² (inverse square); R = A·E^(−γ), so R ∝ d^(2γ); the log-log
 * slope is 2γ. Ambient room light adds to E and depresses the fitted γ.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B3',
  formula: 'E = I/d²; R = A·E^(−γ); log R vs log d has slope 2γ',
  unitSystem: 'Ohm, centimetre',
  assumptions: ['The lamp is a reasonable point source', 'The LDR\'s response settles quickly compared with the time between readings', 'Ambient light, if present, is roughly uniform over the distances used'],
  validRange: 'Distance 10-120 cm',
  edgeCases: ['Room light adds a constant illuminance that dominates at large distance, flattening the log-log plot and depressing the fitted γ'],
  expectedBehaviour: ['Resistance rises steadily as the lamp is moved away', 'γ recovered in the dark is close to the accepted 0.7-0.9 for CdS'],
};

export const CELLS = { gl5528: { label: 'GL5528 (CdS)', A: 2.4e6, gamma: 0.72 }, gl5537: { label: 'GL5537 (CdS)', A: 1.8e6, gamma: 0.75 }, orp12: { label: 'ORP12 (CdS)', A: 3.0e6, gamma: 0.80 } };
export const LAMPS = { lamp15: { label: '15 W lamp', I: 15 }, lamp40: { label: '40 W lamp', I: 40 }, lamp90: { label: '90 W lamp', I: 90 } };
export const ROOMS = { dark: { label: 'Blacked-out room', ambientLux: 0 }, dim: { label: 'Dim room', ambientLux: 4 }, lit: { label: 'Room lights on', ambientLux: 60 } };

export const defaults = { distanceCm: 30, cell: 'gl5528', lamp: 'lamp40', room: 'dark', scale: 'o10' };

export function cellOf(inputs) { return CELLS[inputs.cell] || CELLS.gl5528; }
export function illuminance(inputs) {
  const lampI = (LAMPS[inputs.lamp] || LAMPS.lamp40).I;
  const dM = inputs.distanceCm / 100;
  return lampI / (dM * dM) + (ROOMS[inputs.room] || ROOMS.dark).ambientLux;
}
export function resistanceOhm(inputs) { const c = cellOf(inputs); return c.A * illuminance(inputs) ** -c.gamma; }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0, resistance: 0, lux: 0, settled: false }; }
/**
 * An LDR is slow. Its resistance falls as carriers are photo-generated and
 * recovers much more slowly in the dark -- so it lags behind a change in
 * illumination, and a reading taken too soon is wrong.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const targetLux = illuminance(inputs);
  const targetR = resistanceOhm(inputs);
  s.lux += (targetLux - s.lux) * Math.min(1, dt * 5);
  // Rise (getting darker) is slower than fall, as in a real cell.
  const tau = targetR > s.resistance ? 1.4 : 0.5;
  s.resistance += (targetR - s.resistance) * Math.min(1, dt / tau);
  s.settled = Math.abs(targetR - s.resistance) < Math.max(1, targetR * 0.005);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 229);
  const R = resistanceOhm(inputs) * (1 + jitter(rng, 0.03));
  return { trial, distanceCm: inputs.distanceCm, resistanceOhm: sigFig(R, 4), logD: sigFig(Math.log10(inputs.distanceCm), 4), logR: sigFig(Math.log10(R), 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.logD), y: Number(r.logR) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the resistance at at least four different distances.' };
  const fit = linearFit(pts);
  if (!fit) return { ok: false, reason: 'Vary the distance between readings.' };
  const gamma = fit.slope / 2;
  const accepted = cellOf(inputs).gamma;
  return { ok: true, gamma: sigFig(gamma, 4), slope: sigFig(fit.slope, 4), accepted, percentError: sigFig(((gamma - accepted) / accepted) * 100, 3), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, CELLS, LAMPS, ROOMS, init, step, measure, derive, validate, cellOf, illuminance, resistanceOhm };
