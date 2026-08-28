/**
 * MODEL: Metre bridge — XII-PHY-A02 (resistance of a coil) and XII-PHY-A03
 * (laws of combination of resistances, series and parallel).
 * Balance: P/Q = R/S = l/(100−l), so S = R(100−l)/l.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-A02',
  formula: 'S = R(100−l)/l; ρ = SA/L; series S = S1+S2; parallel 1/S = 1/S1+1/S2',
  unitSystem: 'Ohm; balance length in cm',
  assumptions: ['The bridge wire is uniform, so resistance is proportional to length', 'The galvanometer is used only to detect zero current, not to measure it', 'End resistances at the copper strips are negligible or corrected for'],
  validRange: 'Balance length 10-90 cm from the left end for a reliable result',
  edgeCases: ['A balance point near either end (under 20 cm or over 80 cm) is imprecise; change R'],
  expectedBehaviour: ['The wire is most sensitive when the balance point is near the middle', 'Series combination gives S1+S2; parallel gives less than either alone'],
};

export const COILS = { coilA: { label: 'Coil A', ohm: 4.7 }, coilB: { label: 'Coil B', ohm: 8.2 }, coilC: { label: 'Coil C', ohm: 2.5 } };
export const WIRE_LENGTH_M = 0.28; // effective length of resistance wire in the coil, for resistivity
export const WIRE_DIAMETER_MM = 0.3;

export const defaults = { resistanceBox: 5, jockeyCm: 50, unknown: 'coilA', combination: 'single', emf: 2 };

export function coilOf(inputs) { return COILS[inputs.unknown] || COILS.coilA; }
export function trueS(inputs) {
  const base = coilOf(inputs).ohm;
  if (inputs.combination === 'series') return base + (COILS.coilB.ohm);
  if (inputs.combination === 'parallel') return 1 / (1 / base + 1 / COILS.coilB.ohm);
  return base;
}
export function balanceLengthCm(inputs) {
  const R = inputs.resistanceBox;
  const S = trueS(inputs);
  // l is measured from the LEFT end of the wire — the same side as the
  // resistance box R — matching the standard CBSE mnemonic R/S = l/(100-l).
  // (This was previously l = 100S/(R+S), the length on S's side; measure()
  // below recovers S with the opposite-convention formula R(100-l)/l, so the
  // two disagreed and every reported unknown resistance came out as R²/S
  // instead of S — confirmed numerically: R=5, S=4.7 recovered 5.32, not 4.7.)
  return (100 * R) / (R + S);
}
export function atBalance(inputs) { return Math.abs(inputs.jockeyCm - balanceLengthCm(inputs)) <= 0.3; }

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!atBalance(inputs)) warnings.push({ field: 'jockeyCm', code: 'NOT_BALANCED', message: 'The galvanometer is not showing a null.', why: 'Slide the jockey until there is no deflection in the galvanometer.', fix: 'Move the jockey towards the balance point.' });
  const bl = balanceLengthCm(inputs);
  if (bl < 20 || bl > 80) warnings.push({ field: 'resistanceBox', code: 'POOR_BALANCE_ZONE', message: `The balance point is at about ${bl.toFixed(0)} cm, close to one end.`, why: 'The bridge is most sensitive to small errors when the balance point is near the middle. A balance near either end gives a less precise result.', fix: 'Change the resistance box value so the balance point moves towards the centre.' });
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, deflection: 0, balanced: false, jockey: 50 }; }
/**
 * The bridge as the jockey is slid along the wire. The galvanometer
 * deflection is proportional to the bridge's off-balance ratio, so it
 * swings through zero AT the balance point — the null the student is
 * hunting for — rather than being a lamp that switches on when a number
 * matches.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const lBal = balanceLengthCm(inputs);
  const l = inputs.jockeyCm ?? state.jockey ?? lBal;
  s.jockey = l;
  // Off-balance current, normalised; sign tells the student which way to move.
  const off = (l - lBal) / 50;
  const target = Math.max(-1, Math.min(1, off * 3.2));
  s.deflection += (target - s.deflection) * Math.min(1, dt * 7);
  s.balanced = Math.abs(l - lBal) < 0.3;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!atBalance(inputs)) return null;
  const rng = makeRng(seed + trial * 193);
  const l = toLeastCount(balanceLengthCm(inputs) + jitter(rng, 0.15), 0.1);
  const S = (inputs.resistanceBox * (100 - l)) / l;
  return { trial, resistanceBox: inputs.resistanceBox, balanceLength: l, rightLength: Number((100 - l).toFixed(1)), unknownS: sigFig(S, 4) };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.unknownS)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Balance the bridge for at least three different resistance-box values.' };
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const area = Math.PI * (WIRE_DIAMETER_MM / 1000 / 2) ** 2;
  const rho = (mean * area) / WIRE_LENGTH_M;
  return { ok: true, resistance: sigFig(mean, 4), rho: sigFig(rho, 3), expected: trueS(inputs), n: vals.length, points: rows.map((r) => ({ x: Number(r.resistanceBox), y: Number(r.balanceLength) })) };
}

export default { meta, defaults, COILS, WIRE_LENGTH_M, WIRE_DIAMETER_MM, init, step, measure, derive, validate, coilOf, trueS, balanceLengthCm, atBalance };
