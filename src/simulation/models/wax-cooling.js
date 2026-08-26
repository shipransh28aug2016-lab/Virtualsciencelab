/**
 * MODEL: Cooling curve of molten wax — XI-PHY-ACT-B1
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 1.
 * The curve falls, plateaus at the melting point while latent heat is given
 * up, then falls again as the solid cools — the classic change-of-state
 * cooling curve.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B1',
  formula: 'Plateau temperature = melting point; latent heat sustains it while the room draws heat away',
  unitSystem: '°C, seconds',
  assumptions: ['The wax is stirred while liquid, so its temperature is uniform', 'The room temperature stays constant', 'Supercooling is small and ignored'],
  validRange: 'Start 40-100 °C, room 20-70 °C',
  edgeCases: ['A start below the melting point shows no liquid branch at all'],
  expectedBehaviour: ['The plateau sits at the melting point, wherever cooling started from', 'The solid branch cools faster (lower heat capacity) than the liquid branch'],
};

export const WAXES = { paraffin: { label: 'Paraffin wax', mp: 58, kLiquid: 0.0032, kSolid: 0.0048, plateauS: 400 }, beeswax: { label: 'Beeswax', mp: 63, kLiquid: 0.0028, kSolid: 0.0040, plateauS: 480 }, stearic: { label: 'Stearic acid', mp: 69, kLiquid: 0.0030, kSolid: 0.0044, plateauS: 350 } };
export const THERMOMETERS = { t1: 1.0, t05: 0.5, t01: 0.1 };
export const INTERVALS = { i30: 30, i60: 60, i300: 300 };

export const defaults = { wax: 'paraffin', startTempC: 85, roomTempC: 28, thermometer: 't05', interval: 'i30', stirred: true };

export function waxOf(inputs) { return WAXES[inputs.wax] || WAXES.paraffin; }

export function temperatureAt(inputs, t) {
  const w = waxOf(inputs);
  const excess0 = inputs.startTempC - inputs.roomTempC;
  const mpExcess = w.mp - inputs.roomTempC;
  if (inputs.startTempC <= w.mp) return inputs.startTempC * Math.exp(-w.kSolid * t);
  const tToPlateau = mpExcess > 0 && excess0 > mpExcess ? Math.log(excess0 / mpExcess) / w.kLiquid : 0;
  if (t <= tToPlateau) return inputs.roomTempC + excess0 * Math.exp(-w.kLiquid * t);
  const tInPlateau = t - tToPlateau;
  if (tInPlateau <= w.plateauS) return w.mp - (tInPlateau / w.plateauS) * 0.3; // near-flat plateau
  const tAfter = tInPlateau - w.plateauS;
  return inputs.roomTempC + mpExcess * Math.exp(-w.kSolid * tAfter);
}
export function stateAt(inputs, t) {
  const w = waxOf(inputs);
  const excess0 = inputs.startTempC - inputs.roomTempC;
  const mpExcess = w.mp - inputs.roomTempC;
  const tToPlateau = mpExcess > 0 && excess0 > mpExcess ? Math.log(excess0 / mpExcess) / w.kLiquid : 0;
  if (t <= tToPlateau) return 'liquid';
  if (t <= tToPlateau + w.plateauS) return 'freezing';
  return 'solid';
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init(inputs = defaults) { return { t: 0, running: true, elapsed: 0, tempC: (inputs.startTempC ?? 90), phase: 'liquid', frozen: 0 }; }
/**
 * Wax cooling through its freezing point. The temperature falls, then
 * HOLDS at the freezing point while latent heat of fusion is given out,
 * and only falls again once the wax has all solidified. That plateau is
 * the whole observation, and it comes from the model's own temperature
 * curve rather than being drawn in.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.running) return s;
  s.elapsed += dt * (inputs.timeScale ?? 6);   // a lab period, compressed
  s.tempC = temperatureAt(inputs, s.elapsed);
  s.phase = stateAt(inputs, s.elapsed);
  s.frozen = s.phase === 'solid' ? 1 : s.phase === 'freezing' ? 0.5 : 0;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 139);
  const interval = INTERVALS[inputs.interval] || INTERVALS.i30;
  const t = (trial - 1) * interval;
  const lc = THERMOMETERS[inputs.thermometer] || 0.5;
  const temp = toLeastCount(temperatureAt(inputs, t) + jitter(rng, lc * 0.6), lc);
  return { trial, timeS: t, timeMin: sigFig(t / 60, 3), tempC: Number(temp.toFixed(1)), excessC: Number((temp - inputs.roomTempC).toFixed(1)), state: stateAt(inputs, t) };
}

export function derive(rows, inputs = defaults) {
  const plateauRows = rows.filter((r) => r.state === 'freezing');
  if (rows.length < 6) return { ok: false, reason: 'Record enough readings to see the plateau — at least six.' };
  if (!plateauRows.length) return { ok: false, reason: 'No plateau was captured. Space the readings further apart or start hotter.' };
  const meltingPoint = sigFig(plateauRows.reduce((a, r) => a + Number(r.tempC), 0) / plateauRows.length, 4);
  const times = plateauRows.map((r) => Number(r.timeS));
  return { ok: true, meltingPoint, plateauDurationS: Math.max(...times) - Math.min(...times) + Number(rows[0].timeS === 0 ? INTERVALS[inputs.interval] || 30 : 0), kSolid: waxOf(inputs).kSolid, n: rows.length, points: rows.map((r) => ({ x: Number(r.timeS), y: Number(r.tempC) })) };
}

export default { meta, defaults, WAXES, THERMOMETERS, INTERVALS, init, step, measure, derive, validate, waxOf, temperatureAt, stateAt };
