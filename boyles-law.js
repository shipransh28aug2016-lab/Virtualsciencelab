/**
 * MODEL: Boyle's law — XI-PHY-B03
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 3:
 * "To study the variation in volume with pressure for a sample of air at
 *  constant temperature by plotting graphs between P and V, and between
 *  P and 1/V."
 *
 * Unit IX, Chapter 12: Kinetic Theory — equation of state of a perfect gas,
 * work done in compressing a gas.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, fitThroughOrigin, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B03',
  formula: 'PV = constant at constant temperature;  P ∝ 1/V;  P = k·(1/V)',
  unitSystem: 'Pressure in cm of mercury, volume in cm³ (read as a length of the air column)',
  assumptions: [
    'The temperature of the trapped air stays constant throughout',
    'The tube is uniform in bore, so the length of the air column is proportional to its volume',
    'The trapped air behaves as an ideal gas over this range',
    'No air leaks past the mercury, and the mercury is clean and dry',
    'Atmospheric pressure is steady during the experiment',
  ],
  validRange: 'Mercury level difference −40 to +40 cm; total pressure 36 to 116 cm of mercury',
  edgeCases: [
    'A P–V graph is a hyperbola, never a straight line',
    'A P against 1/V graph IS a straight line through the origin — this is the real test',
    'Compressing the gas quickly warms it, so the readings drift until it cools again',
    'If the temperature is not constant, PV is not constant and the law appears to fail',
  ],
  expectedBehaviour: [
    'The product PV is the same for every reading, within experimental error',
    'Halving the volume doubles the pressure',
    'P against 1/V is a straight line passing through the origin',
    'The slope of the P against 1/V line equals the constant PV',
  ],
};

/** Atmospheric pressure in cm of mercury; barometer reading on the day. */
export const ATMOSPHERIC_CM = 76.0;

/** Bore of the closed tube, in cm² — converts column length to volume. */
export const BORE_AREA_CM2 = 0.50;

export const defaults = {
  levelDifferenceCm: 0,   // open-arm level minus closed-arm level
  tempC: 27,
  atmosphericCm: ATMOSPHERIC_CM,
  scaleLC: 0.1,           // metre scale least count (cm)
  quickCompression: false,
};

/**
 * A fixed mass of air is trapped. At zero level difference the trapped air is
 * at exactly atmospheric pressure and occupies this length of tube.
 */
export const BASE_LENGTH_CM = 30.0;

/** Total pressure of the trapped air, in cm of mercury. */
export function pressure(inputs) {
  return inputs.atmosphericCm + inputs.levelDifferenceCm;
}

/**
 * Length of the trapped air column, from Boyle's law.
 * P₁V₁ = P₂V₂ with V proportional to length, so L = L₀·P₀/P.
 */
export function columnLength(inputs) {
  const P = pressure(inputs);
  if (P <= 0) return null;
  return (BASE_LENGTH_CM * inputs.atmosphericCm) / P;
}

/** Volume of the trapped air, in cm³. */
export function volume(inputs) {
  const L = columnLength(inputs);
  return L === null ? null : L * BORE_AREA_CM2;
}

/** The constant PV for this trapped sample, in cm-of-mercury × cm³. */
export function pvConstant(inputs) {
  return inputs.atmosphericCm * BASE_LENGTH_CM * BORE_AREA_CM2;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const P = pressure(inputs);

  if (P <= 5) {
    errors.push({
      field: 'levelDifferenceCm',
      code: 'PRESSURE_TOO_LOW',
      message: 'The pressure of the trapped air would be almost zero.',
      why: 'Lowering the open arm this far would draw the mercury thread apart and the air would escape. Keep the level difference above about −70 cm.',
    });
  }
  if (inputs.quickCompression) {
    warnings.push({
      field: 'quickCompression',
      code: 'ADIABATIC',
      message: 'You raised the open arm quickly.',
      why: 'Compressing a gas quickly does work on it and warms it, so the process is not isothermal. Boyle\'s law only holds at constant temperature, and the reading drifts as the gas cools back to room temperature.',
      fix: 'Raise the tube slowly and wait a minute or two before taking each reading.',
    });
  }
  if (Math.abs(inputs.levelDifferenceCm) < 3) {
    warnings.push({
      field: 'levelDifferenceCm',
      code: 'TOO_FEW_DECADES',
      message: 'The pressure has barely changed from atmospheric.',
      why: 'To show that PV is constant you need a good spread of pressures. Readings clustered near atmospheric all give nearly the same volume, so the graph is a short stub from which nothing can be concluded.',
    });
  }
  if (inputs.tempC !== 27) {
    warnings.push({
      field: 'tempC', code: 'TEMP_CHANGE',
      message: 'The temperature is not the one recorded at the start.',
      why: 'Boyle\'s law applies only at constant temperature. If the room warms during the experiment, PV drifts upward and the P against 1/V line no longer passes through the origin.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0, running: true,
    level: inputs.levelDifferenceCm,
    column: columnLength(inputs),
    settling: false,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.level += (inputs.levelDifferenceCm - s.level) * Math.min(1, dt * 5);
  const target = columnLength({ ...inputs, levelDifferenceCm: s.level });
  s.column += (target - s.column) * Math.min(1, dt * 6);
  s.pressure = pressure({ ...inputs, levelDifferenceCm: s.level });
  s.settling = Math.abs(target - s.column) > 0.05;
  s.t += dt;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 23 + Math.round(inputs.levelDifferenceCm * 10));
  const P = pressure(inputs);
  const trueL = columnLength(inputs);
  if (trueL === null) return null;

  const L = toLeastCount(trueL + jitter(rng, inputs.scaleLC * 0.9), inputs.scaleLC);
  const V = L * BORE_AREA_CM2;
  const Pread = toLeastCount(P + jitter(rng, inputs.scaleLC * 0.6), inputs.scaleLC);

  return {
    trial,
    levelDifferenceCm: Number(inputs.levelDifferenceCm.toFixed(1)),
    pressureCm: Number(Pread.toFixed(1)),
    columnLengthCm: Number(L.toFixed(1)),
    volumeCm3: Number(V.toFixed(2)),
    invVolume: Number((1 / V).toFixed(5)),
    product: Number((Pread * V).toFixed(1)),
    tempC: inputs.tempC,
  };
}

/**
 * Two analyses, both required by the practical:
 *  (a) the product PV, which should be constant
 *  (b) P against 1/V, which should be a straight line through the origin
 */
export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => Number(r.volumeCm3) > 0 && Number(r.pressureCm) > 0);
  if (usable.length < 4) return { ok: false, reason: 'Record at least four different pressures.' };

  const products = usable.map((r) => Number(r.product));
  const meanPV = mean(products);
  const spread = Math.max(...products) - Math.min(...products);
  const spreadPct = (spread / meanPV) * 100;

  const invPts = usable.map((r) => ({ x: Number(r.invVolume), y: Number(r.pressureCm) }));
  const through = fitThroughOrigin(invPts);
  const free = linearFit(invPts);

  return {
    ok: true,
    meanProduct: sigFig(meanPV, 4),
    spread: sigFig(spread, 3),
    spreadPercent: sigFig(spreadPct, 3),
    constant: sigFig(pvConstant(inputs), 4),
    slope: sigFig(through.slope, 4),
    freeSlope: free ? sigFig(free.slope, 4) : null,
    intercept: free ? sigFig(free.intercept, 3) : null,
    r2: free ? Number(free.r2.toFixed(4)) : null,
    isothermal: spreadPct < 4,
    n: usable.length,
    // The plotted graph is P against 1/V, the one that is a straight line.
    points: invPts,
    pvPoints: usable.map((r) => ({ x: Number(r.volumeCm3), y: Number(r.pressureCm) })),
  };
}

export default {
  meta, defaults, ATMOSPHERIC_CM, BORE_AREA_CM2, BASE_LENGTH_CM,
  init, step, measure, derive, validate,
  pressure, columnLength, volume, pvConstant,
};
