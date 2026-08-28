/**
 * MODEL: Parallelogram law of vectors — XI-PHY-A06
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 6.
 * At equilibrium the resultant of P and Q equals the unknown weight S.
 * R = sqrt(P^2+Q^2+2PQ cos theta); equilibrium needs |P-Q| <= S <= P+Q, and
 * the apparatus itself finds theta — the student never sets it directly.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A06',
  formula: 'R = √(P²+Q²+2PQ·cosθ); at equilibrium S = R',
  unitSystem: 'Forces as gram-weight, converted to newton; angle in degree',
  assumptions: ['Pulleys are frictionless, so tension equals the weight hung', 'Strings are light and inextensible', 'The knot hangs clear of the board'],
  validRange: 'P, Q 50-250 gwt; unknown 40-300 gwt',
  edgeCases: ['S > P+Q: no equilibrium is possible, the knot is simply dragged down', 'S < |P-Q|: the knot is pulled into a pulley'],
  expectedBehaviour: ['The resultant equals the true weight of the body for any valid P, Q', 'A narrower angle between P and Q means a heavier body'],
};

export const G = 9.792;
export const BODIES = { s1: { label: 'Body S₁', trueGwt: 152 }, s2: { label: 'Body S₂', trueGwt: 96 }, s3: { label: 'Body S₃', trueGwt: 210 } };
export const PULLEYS = { good: { label: 'Low-friction pulleys', slack: 0 }, stiff: { label: 'Stiff pulleys', slack: 4 } };

export const defaults = { pGwt: 100, qGwt: 100, body: 's1', pulley: 'good' };

export function bodyOf(inputs) { return BODIES[inputs.body] || BODIES.s1; }

/** True equilibrium exists only if the three magnitudes can close a triangle. */
export function canBalance(inputs) {
  const S = bodyOf(inputs).trueGwt;
  return S <= inputs.pGwt + inputs.qGwt && S >= Math.abs(inputs.pGwt - inputs.qGwt);
}

/** The angle theta between P and Q that the apparatus settles at, by the cosine rule. */
export function thetaDeg(inputs) {
  const { pGwt: P, qGwt: Q } = inputs;
  const S = bodyOf(inputs).trueGwt;
  const cosT = (S * S - P * P - Q * Q) / (2 * P * Q);
  return (Math.acos(Math.max(-1, Math.min(1, cosT))) * 180) / Math.PI;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  if (!canBalance(inputs)) {
    errors.push({
      field: 'pGwt', code: 'NO_EQUILIBRIUM',
      message: 'No equilibrium is possible with these weights.',
      why: `Three concurrent forces can balance only if each is no more than the sum of the other two (a triangle must close). S = ${bodyOf(inputs).trueGwt} gwt, but P+Q = ${inputs.pGwt + inputs.qGwt} and |P−Q| = ${Math.abs(inputs.pGwt - inputs.qGwt)}.`,
      fix: 'Increase P and/or Q, or choose a lighter body.',
    });
  }
  if ((PULLEYS[inputs.pulley] || PULLEYS.good).slack > 0) {
    warnings.push({ field: 'pulley', code: 'STIFF_PULLEY', message: 'These pulleys have noticeable friction.', why: 'The knot can rest anywhere within a small range instead of at the true equilibrium point; tap the board gently before marking directions.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

/**
 * The angle each string makes with the UPWARD vertical, on its own side of
 * it. The three tensions balance only when the resultant of P and Q is
 * exactly vertical (equal and opposite to S hanging straight down), so
 * these two angles are not free — they are fixed by P, Q and the angle
 * between them (thetaDeg), via the standard resultant-angle formula
 * tan(angleFromP) = Q·sinθ / (P + Q·cosθ), with angleFromQ = θ − angleFromP.
 * The renderer draws the strings at exactly these angles: drawing them at
 * any other (e.g. fixed) angle would show a picture whose resultant is NOT
 * vertical — a diagram that visibly contradicts the equilibrium it claims.
 */
export function stringAnglesRad(inputs) {
  const { pGwt: P, qGwt: Q } = inputs;
  const theta = (thetaDeg(inputs) ?? 90) * Math.PI / 180;
  const angleP = Math.atan2(Q * Math.sin(theta), P + Q * Math.cos(theta));
  const angleQ = theta - angleP;
  return { angleP, angleQ, theta };
}

export function init() { return { t: 0, knotX: 0, knotY: 0, vx: 0, vy: 0, settled: false }; }
/**
 * The knot finding equilibrium. Released off-balance it is pulled to the
 * point where the three tensions sum to zero, oscillating a little on the
 * way -- which is what makes the parallelogram construction believable
 * rather than asserted.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // Net pull towards equilibrium, damped. The knot's rest position is the
  // origin of this local wobble frame; the STRING DIRECTIONS (not this
  // wobble) are what must carry the real equilibrium angle, so those are
  // computed separately and exposed for the renderer via stringAnglesRad().
  const k = 30, c = 6.4;
  s.vx += (0 - s.knotX) * k * dt - c * s.vx * dt;
  s.vy += (0 - s.knotY) * k * dt - c * s.vy * dt;
  s.knotX += s.vx * dt; s.knotY += s.vy * dt;
  s.settled = Math.hypot(s.vx, s.vy) < 0.01;
  s.balanced = canBalance(inputs);
  const { angleP, angleQ } = stringAnglesRad(inputs);
  // Screen-space angles (standard math convention, y increasing downward is
  // handled by the renderer): P hangs up-and-left of vertical, Q up-and-right.
  s.angPScreen = Math.PI / 2 + angleP;
  s.angQScreen = Math.PI / 2 - angleQ;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!canBalance(inputs)) return null;
  const rng = makeRng(seed + trial * 59);
  const trueTheta = thetaDeg(inputs);
  const noise = (PULLEYS[inputs.pulley] || PULLEYS.good).slack + 1.5;
  const theta = Number((trueTheta + jitter(rng, noise)).toFixed(1));
  const rad = (theta * Math.PI) / 180;
  const R = Math.sqrt(inputs.pGwt ** 2 + inputs.qGwt ** 2 + 2 * inputs.pGwt * inputs.qGwt * Math.cos(rad));
  return { trial, pGwt: inputs.pGwt, qGwt: inputs.qGwt, thetaDeg: theta, resultantGwt: sigFig(R, 4), weightN: sigFig((R / 1000) * G, 4) };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.resultantGwt)).filter(Number.isFinite);
  if (vals.length < 3) return { ok: false, reason: 'Record equilibrium for at least three different pairs of P and Q.' };
  const distinctSettings = new Set(rows.map((r) => `${r.pGwt},${r.qGwt}`)).size;
  const settingsVaried = distinctSettings >= vals.length - 1;
  const m = mean(vals);
  const acceptedGwt = bodyOf(inputs).trueGwt;
  return {
    ok: true, meanResultant: sigFig(m, 4), weightN: sigFig((m / 1000) * G, 4),
    meanAngle: sigFig(mean(rows.map((r) => Number(r.thetaDeg))), 4),
    spreadPercent: sigFig(((Math.max(...vals) - Math.min(...vals)) / m) * 100, 3),
    settingsVaried, variedSettings: settingsVaried, distinctSettings, n: vals.length,
    body: bodyOf(inputs).label, accepted: acceptedGwt, acceptedN: sigFig((acceptedGwt / 1000) * G, 4),
    points: rows.map((r) => ({ x: Number(r.thetaDeg), y: Number(r.resultantGwt) })),
  };
}

export default { meta, defaults, BODIES, PULLEYS, G, init, step, measure, derive, validate, bodyOf, canBalance, thetaDeg, stringAnglesRad };
