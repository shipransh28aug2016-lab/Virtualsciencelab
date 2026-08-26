/**
 * MODEL: Mass by a physical beam balance — XI-PHY-A05
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Experiment 5:
 * "To determine the mass of two different objects using a beam balance."
 *
 * Unit I, Chapter 1: Units and Measurements.
 *
 * The instrument is a null device, and that is what makes it different from
 * every other measuring instrument in Section A. It does not display a value;
 * it tells you only whether two torques are equal. The number comes from the
 * weights you chose, not from the balance.
 *
 * What the balance actually reports is the RESTING POINT — the centre of the
 * pointer's swing — because a real beam never stops swinging in a reasonable
 * time. The resting point is found from turning points, taking three on one
 * side and two on the other so that the damping of the swing cancels.
 *
 * Mass is then obtained from the sensitivity: how many divisions the resting
 * point shifts per milligram of excess load.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-A05',
  formula: 'At balance, m·g·a = M·g·a, so m = M. Resting point R = (mean of odd turning points + mean of even turning points)/2; mass = M + (R − R₀)/S, where S is the sensitivity in divisions per mg',
  unitSystem: 'Masses in gram; sensitivity in scale divisions per milligram',
  assumptions: [
    'The two arms of the beam are of equal length',
    'The beam is horizontal and the pointer reads at the centre of the scale when both pans are empty',
    'The weights in the box are correct and are handled only with forceps',
    'The balance is used with the beam raised gently, and readings are taken while it swings freely',
    'Buoyancy of air on the body and on the weights is neglected',
  ],
  validRange: 'Load 0 to 200 g; weight box down to 10 mg; sensitivity 1.5 to 2.4 divisions per mg; pointer scale ±10 divisions',
  edgeCases: [
    'Unequal arms give a constant proportional error that a single weighing cannot reveal',
    'A zero error of the unloaded balance shifts every result by the same amount',
    'Handling weights with fingers adds grease and moisture, so they read heavy',
    'Loading or unloading a pan while the beam is swinging can damage the knife edges',
    'A resting point beyond the end of the scale means the load is far from balanced and no reading is possible',
  ],
  expectedBehaviour: [
    'The resting point of the unloaded balance is the zero of the instrument and must be subtracted',
    'Adding excess mass moves the resting point in proportion to that excess',
    'A more sensitive balance shifts further for the same excess mass',
    'Turning points decrease steadily as the swing dies away, so an odd number on one side and an even number on the other averages the damping out',
  ],
};

/** Balances on the bench. `sensitivity` is scale divisions per milligram. */
export const BALANCES = {
  standard: { label: 'Physical balance', sensitivity: 1.5, zeroDiv: 0, armRatio: 1.0 },
  sensitive: { label: 'Sensitive balance', sensitivity: 2.4, zeroDiv: 0, armRatio: 1.0 },
  offset: { label: 'Balance with zero error', sensitivity: 1.5, zeroDiv: 1.8, armRatio: 1.0 },
  unequal: { label: 'Balance with unequal arms', sensitivity: 1.5, zeroDiv: 0, armRatio: 1.0004 },
};

/** Bodies to be weighed. `trueMassG` is hidden from the student. */
export const BODIES = {
  bodyA: { label: 'Body A (glass stopper)', trueMassG: 24.386 },
  bodyB: { label: 'Body B (metal cylinder)', trueMassG: 57.142 },
  bodyC: { label: 'Body C (small pebble)', trueMassG: 9.735 },
};

export const defaults = {
  balance: 'standard',
  body: 'bodyA',
  weightsG: 24.3,        // gram weights from the box, in the right pan
  fractionalMg: 90,      // fractional weights, in milligram
  bodyOnPan: true,
};

/**
 * Total load in the right pan, in gram.
 *
 * A real weight box holds gram weights and a separate set of fractional
 * weights, and the student uses both. Modelling it as one slider would either
 * be too coarse to ever balance or need ten thousand steps to drag through.
 */
export function panLoadG(inputs) {
  return (inputs.weightsG || 0) + (inputs.fractionalMg || 0) / 1000;
}

/** The mass the balance actually has to match, including any arm inequality. */
export function effectiveMassG(inputs) {
  const b = BODIES[inputs.body] || BODIES.bodyA;
  const bal = BALANCES[inputs.balance] || BALANCES.standard;
  // With unequal arms, the weights needed differ from the true mass by the arm
  // ratio. The student cannot detect this from one weighing — that is the point.
  return b.trueMassG * bal.armRatio;
}

/** Excess load in the left pan, in milligram. */
export function excessMg(inputs) {
  if (!inputs.bodyOnPan) return -panLoadG(inputs) * 1000;
  return (effectiveMassG(inputs) - panLoadG(inputs)) * 1000;
}

/**
 * Resting point in scale divisions, measured from the centre of the scale.
 * The scale runs from −10 to +10 divisions; beyond that the pointer is off it.
 */
export function restingPoint(inputs) {
  const bal = BALANCES[inputs.balance] || BALANCES.standard;
  return bal.zeroDiv + excessMg(inputs) * bal.sensitivity;
}

/** Is the pointer still on the scale? */
export function onScale(inputs) {
  return Math.abs(restingPoint(inputs)) <= 10;
}

/**
 * Turning points of a damped swing about the resting point.
 * Five of them: three on one side, two on the other.
 */
export function turningPoints(inputs, seed = 1) {
  const rng = makeRng(seed);
  const rest = restingPoint(inputs);
  const amp = 6.5;
  const damp = 0.82;
  const out = [];
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const a = amp * Math.pow(damp, i);
    out.push(Number((rest + side * a + jitter(rng, 0.12)).toFixed(2)));
  }
  return out;
}

/**
 * Resting point from five turning points, the way it is done at the bench:
 * mean of the three on one side, mean of the two on the other, then the mean
 * of those two means. Averaging all five equally would NOT cancel the damping.
 */
export function restingFromTurningPoints(tps) {
  const odd = tps.filter((_, i) => i % 2 === 0);
  const even = tps.filter((_, i) => i % 2 === 1);
  if (!odd.length || !even.length) return NaN;
  return (mean(odd) + mean(even)) / 2;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const bal = BALANCES[inputs.balance] || BALANCES.standard;

  if (!onScale(inputs)) {
    errors.push({
      field: 'weightsG',
      code: 'OFF_SCALE',
      message: `The pointer has gone right off the scale (${restingPoint(inputs).toFixed(0)} divisions).`,
      why: 'The balance is a null instrument: it only reads correctly when the two pans are nearly equal. A large excess simply drives the pointer to the end stop, and no resting point can be found.',
      fix: 'Add or remove weights until the pointer swings about the centre of the scale.',
    });
  }
  if (bal.zeroDiv) {
    warnings.push({
      field: 'balance',
      code: 'ZERO_ERROR',
      message: `The unloaded balance rests at ${bal.zeroDiv} divisions, not at zero.`,
      why: 'This is the zero error of the instrument. It shifts every reading by the same amount, so it does not average out over trials and must be subtracted.',
      fix: 'Find the resting point with both pans empty first, and subtract it.',
    });
  }
  if (bal.armRatio !== 1) {
    warnings.push({
      field: 'balance',
      code: 'UNEQUAL_ARMS',
      message: 'The arms of this beam are not exactly equal.',
      why: 'Equality of moments gives m·a₁ = M·a₂, so the weights needed are M = m·a₁/a₂. A single weighing cannot reveal this, because the balance still comes to rest. The remedy is the method of double weighing: weigh again with the body and weights interchanged, and take the geometric mean.',
      fix: 'Repeat the weighing with the pans interchanged and compare.',
    });
  }
  if (!inputs.bodyOnPan) {
    warnings.push({
      field: 'bodyOnPan',
      code: 'NO_BODY',
      message: 'There is no body on the left pan.',
      why: 'With an empty left pan you are measuring the resting point of the balance itself. That is a useful reading — it is the zero — but it is not the mass of anything.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0, running: true, pointer: 0, swingAmp: 6.5,
    rest: restingPoint(inputs), settled: false,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  const rest = restingPoint(inputs);
  s.rest += (rest - s.rest) * Math.min(1, dt * 4);
  // A real beam swings and dies away; the pointer is never simply still.
  s.swingAmp *= Math.exp(-dt * 0.35);
  if (Math.abs(rest - state.rest) > 0.4) s.swingAmp = 6.5;   // disturbed by loading
  s.pointer = s.rest + s.swingAmp * Math.cos(state.t * 3.4);
  s.settled = s.swingAmp < 0.8;
  s.t += dt;
  return s;
}

/**
 * One trial = one complete weighing: five turning points, the resting point
 * they give, and the mass that follows from the sensitivity.
 */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!onScale(inputs)) return null;

  const bal = BALANCES[inputs.balance] || BALANCES.standard;
  const tps = turningPoints(inputs, seed + trial * 29);
  const rest = restingFromTurningPoints(tps);
  // The mass is the weights in the pan plus whatever the pointer offset says
  // is still missing, converted through the sensitivity.
  const massG = panLoadG(inputs) + ((rest - bal.zeroDiv) / bal.sensitivity) / 1000;

  return {
    trial,
    weightsG: Number(panLoadG(inputs).toFixed(3)),
    fractionalMg: inputs.fractionalMg || 0,
    tp1: tps[0], tp2: tps[1], tp3: tps[2], tp4: tps[3], tp5: tps[4],
    restingPoint: Number(rest.toFixed(2)),
    mass: Number(massG.toFixed(4)),
    body: (BODIES[inputs.body] || BODIES.bodyA).label,
  };
}

/** Mean mass over the trials. */
export function derive(rows, inputs = defaults) {
  const ms = rows.map((r) => Number(r.mass)).filter(Number.isFinite);
  if (ms.length < 3) return { ok: false, reason: 'Complete at least three weighings.' };

  const bal = BALANCES[inputs.balance] || BALANCES.standard;
  const body = BODIES[inputs.body] || BODIES.bodyA;
  const m = mean(ms);
  const spread = Math.max(...ms) - Math.min(...ms);

  // Did the student weigh more than one body? The practical asks for two.
  const bodies = [...new Set(rows.map((r) => r.body))];
  let second = null;
  if (bodies.length > 1) {
    const per = bodies.map((bname) => {
      const sub = rows.filter((r) => r.body === bname).map((r) => Number(r.mass));
      return { body: bname, mass: sigFig(mean(sub), 5), n: sub.length };
    });
    second = { bodies: per, difference: sigFig(Math.abs(per[0].mass - per[1].mass), 4) };
  }

  return {
    ok: true,
    meanMass: sigFig(m, 5),
    spread: Number(spread.toFixed(4)),
    meanRestingPoint: sigFig(mean(rows.map((r) => Number(r.restingPoint))), 3),
    sensitivity: bal.sensitivity,
    zeroDiv: bal.zeroDiv,
    body: body.label,
    accepted: body.trueMassG,
    unequalArms: bal.armRatio !== 1,
    armRatio: bal.armRatio,
    balance: bal.label,
    secondBody: second,
    bodiesWeighed: bodies.length,
    n: ms.length,
    points: rows.map((r, i) => ({ x: i + 1, y: Number(r.mass) })),
  };
}

export default {
  meta, defaults, BALANCES, BODIES,
  init, step, measure, derive, validate,
  effectiveMassG, excessMg, restingPoint, onScale, turningPoints,
  restingFromTurningPoints, panLoadG,
};
