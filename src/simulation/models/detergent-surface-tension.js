/**
 * MODEL: Effect of a detergent on the surface tension of water — XI-PHY-ACT-B4
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 4.
 * T = rhρg/2 by capillary rise, tracked as detergent concentration rises
 * towards and past the critical micelle concentration (CMC), beyond which
 * T stops falling.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B4',
  formula: 'T = rhρg/2',
  unitSystem: 'mN/m, tube radius in mm',
  assumptions: ['The contact angle is nearly zero for clean water on clean glass', 'The solution is well mixed before each reading'],
  validRange: 'Concentration 0-0.4 g/L',
  edgeCases: ['Above the critical micelle concentration, adding more detergent no longer lowers T'],
  expectedBehaviour: ['T falls sharply at first, then levels off at a plateau'],
};

export const G = 9.792;
export const RHO = 998;
export const TUBES = { t02: { label: 'Capillary (0.2 mm)', radiusMm: 0.20 }, t035: { label: 'Capillary (0.35 mm)', radiusMm: 0.35 }, t05: { label: 'Capillary (0.5 mm)', radiusMm: 0.50 }, t08: { label: 'Capillary (0.8 mm)', radiusMm: 0.80 } };
export const T_PURE = 0.072; // N/m at 25 C
export const T_PLATEAU = 0.031;
export const CMC = 0.18; // g/L

export const defaults = { tube: 't035', concentrationGPerL: 0, tubeState: 'clean', waterTempC: 25 };

export function tubeOf(inputs) { return TUBES[inputs.tube] || TUBES.t035; }
export function surfaceTensionNPerM(inputs) {
  const c = Math.min(inputs.concentrationGPerL, CMC * 3);
  const frac = Math.min(1, c / CMC);
  const T = T_PURE - (T_PURE - T_PLATEAU) * (1 - Math.exp(-3 * frac));
  const dTdC = -0.0002 * (inputs.waterTempC - 25);
  const greasy = inputs.tubeState === 'greasy' ? 0.6 : 1;
  return (T + dTdC) * greasy;
}
export function riseMm(inputs) {
  const r = tubeOf(inputs).radiusMm / 1000;
  const T = surfaceTensionNPerM(inputs);
  return ((2 * T) / (r * RHO * G)) * 1000;
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.tubeState === 'greasy') warnings.push({ field: 'tubeState', code: 'GREASY_TUBE', message: 'A greasy tube reads a low, unreliable rise.', why: 'Grease raises the contact angle, so the assumption cosθ ≈ 1 fails.' });
  if (inputs.concentrationGPerL > CMC * 1.5) warnings.push({ field: 'concentrationGPerL', code: 'PAST_CMC', message: 'This concentration is well past the point where T stops falling.', why: 'Once micelles form at the critical micelle concentration, extra detergent no longer lowers the surface tension.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 151);
  const r = tubeOf(inputs).radiusMm;
  const h = riseMm(inputs) + jitter(rng, 0.5);
  const T = (r / 1000 / 2) * (RHO * G) * (h / 1000);
  return { trial, concentrationGPerL: inputs.concentrationGPerL, radiusMm: r, riseMm: Number(h.toFixed(2)), productMm2: sigFig(r * h, 4), surfaceTensionMNm: sigFig(T * 1000, 4) };
}

export function derive(rows) {
  if (rows.length < 4) return { ok: false, reason: 'Record the rise at at least four detergent concentrations.' };
  const pure = rows.find((r) => Number(r.concentrationGPerL) === 0) || rows[0];
  const highest = rows.reduce((a, b) => (Number(a.concentrationGPerL) >= Number(b.concentrationGPerL) ? a : b));
  const drop = ((Number(pure.surfaceTensionMNm) - Number(highest.surfaceTensionMNm)) / Number(pure.surfaceTensionMNm)) * 100;
  const sorted = [...rows].sort((a, b) => Number(a.concentrationGPerL) - Number(b.concentrationGPerL));
  const lastTwo = sorted.slice(-2);
  const plateauSeen = lastTwo.length === 2 && Math.abs(Number(lastTwo[0].surfaceTensionMNm) - Number(lastTwo[1].surfaceTensionMNm)) < 3;
  return { ok: true, surfaceTensionPure: sigFig(Number(pure.surfaceTensionMNm), 4), drop: sigFig(drop, 4), plateauSeen, n: rows.length, points: rows.map((r) => ({ x: Number(r.concentrationGPerL), y: Number(r.surfaceTensionMNm) })) };
}

export default { meta, defaults, TUBES, G, RHO, T_PURE, T_PLATEAU, CMC, init, step, measure, derive, validate, tubeOf, surfaceTensionNPerM, riseMm };
