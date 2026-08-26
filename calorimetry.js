/**
 * MODEL: Calorimetry — XII-CHE-C01, C02 and C03
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Category C, Thermochemistry:
 *   C1 "Enthalpy of dissolution of Copper Sulphate or Potassium Nitrate."
 *   C2 "Enthalpy of neutralization of strong acid (HCl) and strong base (NaOH)."
 *   C3 "Determination of enthalpy change during interaction (Hydrogen bond
 *       formation) between Acetone and Chloroform."
 *
 * Unit IV, Chapter 4 (Chemical Kinetics is V; Thermodynamics is Unit III of the
 * theory course) — the practical sits with Thermodynamics.
 *
 * ONE model serves all three experiments, because all three are the same
 * measurement performed on three different systems:
 *
 *      q = m·c·ΔT          heat picked up by the calorimeter contents
 *      ΔH = −q / n         per mole of the thing that changed
 *
 * What differs is only WHAT is dissolved, mixed or neutralised, and what `n`
 * counts. Writing three near-identical models would have been duplication of
 * the worst kind: three places for the same arithmetic to drift apart. The
 * `mode` input selects the system.
 *
 * Two points of physics are worth stating because they are where marks are
 * actually lost:
 *
 *   1. THE CALORIMETER ITSELF ABSORBS HEAT. A polystyrene cup absorbs little,
 *      a glass beaker a great deal. Ignoring the water equivalent makes every
 *      ΔH come out too small in magnitude, and the model reproduces that error
 *      faithfully rather than hiding it — the student can switch the correction
 *      on and off and watch the answer move.
 *
 *   2. SIGN CONVENTION. A temperature RISE means heat was released by the
 *      system, so ΔH is NEGATIVE. Endothermic dissolution (KNO₃) cools the
 *      water and gives a positive ΔH. Students routinely lose the sign, so the
 *      model refuses to paper over it.
 *
 * Accepted values (kJ mol⁻¹), from standard tables:
 *
 *      KNO₃ dissolution                +34.9   endothermic, water cools
 *      NH₄Cl dissolution               +14.8   endothermic
 *      CuSO₄ anhydrous dissolution     −66.5   exothermic, water warms
 *      CuSO₄·5H₂O dissolution          +11.7   endothermic
 *      HCl + NaOH neutralisation       −57.1   the strong/strong value
 *      CH₃COOH + NaOH                  −50.6   weak acid: less exothermic
 *      NH₄OH + HCl                     −51.1   weak base: less exothermic
 *      acetone + chloroform mixing     −1.9    per mole of mixture, equimolar
 *
 * The two copper sulphate figures are deliberately both present, because their
 * difference is the enthalpy of hydration of the anhydrous salt by Hess's law:
 * −66.5 − (+11.7) = −78.2 kJ mol⁻¹, a quantity that cannot be measured directly
 * at all. That is the best single idea in this category.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, percentError, toLeastCount } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-C01',
  formula: 'q = m\u00b7c\u00b7\u0394T and \u0394H = \u2212q/n; a temperature RISE means heat released, so \u0394H is negative',
  unitSystem: 'Mass in gram, temperature in \u00b0C, heat in joule, enthalpy in kJ mol\u207b\u00b9',
  assumptions: [
    'The specific heat capacity of every dilute aqueous solution is taken as that of water, 4.18 J g\u207b\u00b9 K\u207b\u00b9',
    'The density of every dilute solution is taken as 1.00 g cm\u207b\u00b3, so volume in cm\u00b3 equals mass in gram',
    'Dissolution or reaction is complete before the maximum temperature is read',
    'Heat exchanged with the room during the run is negligible over the short time involved',
    'The thermometer and stirrer are part of the calorimeter and are covered by its water equivalent',
  ],
  validRange: 'Solute 1 to 10 g in 50 to 200 cm\u00b3 of water; acid and base 0.5 to 2.0 M; calorimeter water equivalent 2 to 60 g',
  edgeCases: [
    'An endothermic dissolution COOLS the water, so \u0394T is negative and \u0394H positive',
    'Ignoring the water equivalent makes every result too small in magnitude',
    'A glass beaker has a large water equivalent and gives a badly low answer if uncorrected',
    'Too little solute gives a temperature change smaller than the thermometer can resolve',
    'Neutralising a weak acid gives a less exothermic result, because energy is spent ionising it',
    'Acetone and chloroform give the largest heat effect at equimolar composition, not at either extreme',
  ],
  expectedBehaviour: [
    'Dissolving potassium nitrate cools the water; dissolving anhydrous copper sulphate warms it',
    'Strong acid with strong base always gives about \u221257 kJ mol\u207b\u00b9, whichever pair is used',
    'A weak acid or weak base gives a smaller heat of neutralisation',
    'The heat evolved on mixing acetone and chloroform is greatest at equal mole fractions',
  ],
};

/** Which of the three experiments is being performed. */
export const MODES = {
  dissolution: { label: 'Dissolution' },
  neutralisation: { label: 'Neutralisation' },
  mixing: { label: 'Acetone + chloroform' },
};

/** Solutes for the dissolution experiment. `dHkJ` is the accepted value. */
export const SOLUTES = {
  kno3: { label: 'KNO\u2083', molarMass: 101.1, dHkJ: +34.9, note: 'Endothermic: the water cools.' },
  nh4cl: { label: 'NH\u2084Cl', molarMass: 53.5, dHkJ: +14.8, note: 'Endothermic, but only mildly so.' },
  cuso4: {
    label: 'CuSO\u2084 anhydrous', molarMass: 159.6, dHkJ: -66.5,
    note: 'Strongly exothermic, because the anhydrous salt is being hydrated as it dissolves.',
  },
  cuso4_5h2o: {
    label: 'CuSO\u2084\u00b75H\u2082O', molarMass: 249.7, dHkJ: +11.7,
    note: 'Endothermic: this salt is already hydrated, so only the lattice has to be broken.',
  },
};

/** Acid and base pairs for the neutralisation experiment. */
export const ACIDS = {
  hcl: { label: 'HCl', strong: true, ionisationKJ: 0 },
  ch3cooh: { label: 'CH\u2083COOH', strong: false, ionisationKJ: 6.5 },
};
export const BASES = {
  naoh: { label: 'NaOH', strong: true, ionisationKJ: 0 },
  nh4oh: { label: 'NH\u2084OH', strong: false, ionisationKJ: 6.0 },
};

/** The strong-acid / strong-base value that every such pair converges on. */
export const NEUTRALISATION_KJ = -57.1;

/** Molar enthalpy of mixing at equimolar composition, acetone + chloroform. */
export const MIXING_KJ_EQUIMOLAR = -1.9;

/** Calorimeters, by how much heat they themselves soak up. */
export const CALORIMETERS = {
  polystyrene: { label: 'Polystyrene cup', waterEquivalentG: 4 },
  vacuum: { label: 'Vacuum flask', waterEquivalentG: 12 },
  glass: { label: 'Glass beaker', waterEquivalentG: 55 },
};

/** Thermometer least counts. */
export const SCALES = {
  t1: { label: '1 \u00b0C', leastCount: 1 },
  t05: { label: '0.5 \u00b0C', leastCount: 0.5 },
  t01: { label: '0.1 \u00b0C', leastCount: 0.1 },
};

/** Specific heat capacity of water, J g⁻¹ K⁻¹. */
export const C_WATER = 4.18;

export const defaults = {
  mode: 'dissolution',
  solute: 'kno3',
  acid: 'hcl',
  base: 'naoh',
  calorimeter: 'polystyrene',
  scale: 't01',
  correctForCalorimeter: true,
  massG: 5.0,
  waterCm3: 100,
  molarity: 1.0,
  acetoneFraction: 0.5,
};

export function soluteOf(inputs) {
  return SOLUTES[inputs.solute] || SOLUTES.kno3;
}
export function calorimeterOf(inputs) {
  return CALORIMETERS[inputs.calorimeter] || CALORIMETERS.polystyrene;
}

/** Moles of whatever `n` counts for the mode in use. */
export function molesReacting(inputs) {
  if (inputs.mode === 'dissolution') {
    return inputs.massG / soluteOf(inputs).molarMass;
  }
  if (inputs.mode === 'neutralisation') {
    // Equal volumes of acid and base, so the moles of water formed equal the
    // moles of the limiting reagent — which for equal concentrations is either.
    return (inputs.molarity * inputs.waterCm3) / 1000;
  }
  // Mixing: total moles of liquid mixture, using approximate molar volumes.
  const totalCm3 = inputs.waterCm3;
  const acetoneCm3 = totalCm3 * inputs.acetoneFraction;
  const chloroformCm3 = totalCm3 * (1 - inputs.acetoneFraction);
  const acetoneMol = (acetoneCm3 * 0.784) / 58.08;
  const chloroformMol = (chloroformCm3 * 1.489) / 119.38;
  return acetoneMol + chloroformMol;
}

/** The accepted molar enthalpy for the system currently set up, kJ mol⁻¹. */
export function acceptedKJ(inputs) {
  if (inputs.mode === 'dissolution') return soluteOf(inputs).dHkJ;
  if (inputs.mode === 'neutralisation') {
    const a = ACIDS[inputs.acid] || ACIDS.hcl;
    const b = BASES[inputs.base] || BASES.naoh;
    // Energy spent ionising a weak species is not available as heat, so the
    // measured value is less exothermic by that amount.
    return NEUTRALISATION_KJ + a.ionisationKJ + b.ionisationKJ;
  }
  /*
   * Acetone-chloroform mixing. The excess enthalpy of a mixture that forms one
   * hydrogen bond per pair goes as x(1−x), which is greatest at x = 0.5 and
   * vanishes at either pure liquid. Scaled so x = 0.5 gives the accepted value.
   */
  const x = inputs.acetoneFraction;
  return MIXING_KJ_EQUIMOLAR * (x * (1 - x)) / 0.25;
}

/** Total mass the heat has to warm: contents plus the calorimeter's equivalent. */
export function effectiveMassG(inputs) {
  const calW = calorimeterOf(inputs).waterEquivalentG;
  if (inputs.mode === 'dissolution') return inputs.waterCm3 + inputs.massG + calW;
  if (inputs.mode === 'neutralisation') return inputs.waterCm3 * 2 + calW;
  return inputs.waterCm3 + calW;
}

/**
 * The temperature change the thermometer would show, °C.
 *
 * Positive for an exothermic change (water warms), negative for endothermic.
 */
export function temperatureChangeC(inputs) {
  const n = molesReacting(inputs);
  const dH = acceptedKJ(inputs);
  const q = -dH * 1000 * n;          // joule released to the contents
  return q / (effectiveMassG(inputs) * C_WATER);
}

/**
 * The enthalpy the student computes from their reading.
 *
 * If they do not correct for the calorimeter they divide by too small a mass,
 * so the magnitude comes out LOW. That is the commonest systematic error in
 * this experiment and the model reproduces it exactly.
 */
export function computedKJ(inputs, observedDeltaT) {
  const n = molesReacting(inputs);
  if (n <= 0) return null;
  const calW = calorimeterOf(inputs).waterEquivalentG;
  const massUsed = inputs.correctForCalorimeter
    ? effectiveMassG(inputs)
    : effectiveMassG(inputs) - calW;
  const q = massUsed * C_WATER * observedDeltaT;
  return -(q / 1000) / n;
}

/** True when the change gives out heat and the thermometer rises. */
export function isExothermic(inputs) {
  return acceptedKJ(inputs) < 0;
}

export function validate(inputs) {
  const errors = [];
  const warnings = [];

  if (inputs.mode === 'dissolution' && !(inputs.massG > 0)) {
    errors.push({
      field: 'massG',
      code: 'NO_SOLUTE',
      message: 'No solute has been weighed out.',
      why: 'The enthalpy of dissolution is per mole of solute dissolved. With none there is no heat effect and nothing to divide by.',
      fix: 'Weigh out a few grams of the salt.',
    });
  }

  if (!(inputs.waterCm3 > 0)) {
    errors.push({
      field: 'waterCm3',
      code: 'NO_WATER',
      message: 'The calorimeter is empty.',
      why: 'The heat released or absorbed is detected as a temperature change of the liquid in the calorimeter.',
      fix: 'Measure out the liquid before starting.',
    });
  }

  // Too small a temperature change cannot be read reliably.
  const dT = Math.abs(temperatureChangeC(inputs));
  const lc = (SCALES[inputs.scale] || SCALES.t01).leastCount;
  if (inputs.waterCm3 > 0 && dT > 0 && dT < lc * 3) {
    warnings.push({
      field: 'scale',
      code: 'CHANGE_TOO_SMALL',
      message: `The temperature change is only about ${dT.toFixed(2)} \u00b0C.`,
      why: `With a least count of ${lc} \u00b0C a change this small cannot be read to better than a few tens of per cent, so the enthalpy will be very uncertain.`,
      fix: 'Use more solute, less water, or a thermometer with a finer scale.',
    });
  }

  // The systematic error the experiment exists to teach.
  if (!inputs.correctForCalorimeter) {
    const calW = calorimeterOf(inputs).waterEquivalentG;
    warnings.push({
      field: 'correctForCalorimeter',
      code: 'NO_WATER_EQUIVALENT',
      message: 'The water equivalent of the calorimeter is being ignored.',
      why: `The calorimeter, thermometer and stirrer absorb heat too \u2014 ${calW} g of water equivalent here. Leaving it out means dividing by too little mass, so every enthalpy comes out too small in magnitude.`,
      fix: 'Switch the correction on, or determine the water equivalent separately.',
    });
  }

  if (inputs.calorimeter === 'glass') {
    warnings.push({
      field: 'calorimeter',
      code: 'POOR_CALORIMETER',
      message: 'A glass beaker is a poor calorimeter.',
      why: 'Glass conducts heat well and has a large water equivalent, so much of the heat goes into the vessel and into the room rather than into the liquid.',
      fix: 'Use a polystyrene cup or a vacuum flask.',
    });
  }

  if (inputs.mode === 'neutralisation') {
    const a = ACIDS[inputs.acid] || ACIDS.hcl;
    const b = BASES[inputs.base] || BASES.naoh;
    if (!a.strong || !b.strong) {
      warnings.push({
        field: 'acid',
        code: 'WEAK_SPECIES',
        message: 'A weak acid or base is being neutralised.',
        why: 'A weak species is only partly ionised, and energy has to be spent ionising the rest. That energy is not released as heat, so the measured enthalpy is less exothermic than the strong/strong value of \u221257.1 kJ mol\u207b\u00b9.',
        fix: 'Use HCl with NaOH to obtain the standard value, then compare.',
      });
    }
  }

  if (inputs.mode === 'mixing' && (inputs.acetoneFraction <= 0.02 || inputs.acetoneFraction >= 0.98)) {
    warnings.push({
      field: 'acetoneFraction',
      code: 'NEARLY_PURE',
      message: 'The mixture is very nearly a pure liquid.',
      why: 'The heat effect comes from hydrogen bonds formed BETWEEN acetone and chloroform molecules, so it vanishes when either component is almost absent.',
      fix: 'Move towards equal mole fractions, where the effect is largest.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0,
    settled: false,
    finishedAt: null,
    startTempC: 26.0,
    tempC: 26.0,
    mixed: false,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // Mixing happens at 0.4 s, then the temperature moves to its new value and
  // settles, exactly as a real calorimeter trace does.
  s.mixed = s.t >= 0.4;
  const target = s.startTempC + temperatureChangeC(inputs);
  if (s.mixed) {
    s.tempC += (target - s.tempC) * Math.min(1, dt / 0.30);
  }
  if (s.t >= 1.8 && !s.settled) {
    s.settled = true;
    s.finishedAt = s.t;
    s.tempC = target;
  }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!validate(inputs).ok) return null;
  if (!state || !state.settled) return null;

  const rng = makeRng(seed * 37 + trial);
  const lc = (SCALES[inputs.scale] || SCALES.t01).leastCount;
  const trueDelta = temperatureChangeC(inputs);
  // Read the two temperatures, each quantised — this is where the real
  // uncertainty in the experiment comes from.
  const t1 = toLeastCount(state.startTempC, lc);
  const t2 = toLeastCount(state.startTempC + trueDelta * (1 + jitter(rng, 0.02)), lc);
  const observed = t2 - t1;

  // A change too small to register at all gives no usable reading.
  if (Math.abs(observed) < lc * 0.5) return null;

  const dH = computedKJ(inputs, observed);

  const system = inputs.mode === 'dissolution'
    ? soluteOf(inputs).label
    : inputs.mode === 'neutralisation'
      ? `${(ACIDS[inputs.acid] || ACIDS.hcl).label} + ${(BASES[inputs.base] || BASES.naoh).label}`
      : `acetone ${(inputs.acetoneFraction * 100).toFixed(0)} %`;

  return {
    trial,
    system,
    initialC: sigFig(t1, 4),
    finalC: sigFig(t2, 4),
    deltaC: sigFig(observed, 3),
    moles: sigFig(molesReacting(inputs), 3),
    enthalpyKJ: sigFig(dH, 4),
    _mode: inputs.mode,
    _accepted: acceptedKJ(inputs),
    _corrected: inputs.correctForCalorimeter,
    _solute: inputs.solute,
    _fraction: inputs.acetoneFraction,
  };
}

export function derive(rows, inputs = defaults) {
  if (!rows || rows.length < 3) {
    return {
      ok: false,
      reason: 'Take at least three readings. A single calorimeter run is too easily spoiled by a draught or a slow thermometer to stand on its own.',
    };
  }

  const mean = rows.reduce((s, r) => s + r.enthalpyKJ, 0) / rows.length;
  const accepted = acceptedKJ(inputs);
  const err = percentError(mean, accepted);

  const spread = Math.max(...rows.map((r) => r.enthalpyKJ))
    - Math.min(...rows.map((r) => r.enthalpyKJ));

  const exo = mean < 0;
  const signCorrect = (mean < 0) === (accepted < 0);
  const uncorrected = rows.some((r) => r._corrected === false);

  /*
   * The Hess's law bonus. If the student has measured BOTH copper sulphate
   * salts, the difference gives the enthalpy of hydration of the anhydrous
   * salt — a quantity no experiment can reach directly.
   */
  const anhydrous = rows.filter((r) => r._solute === 'cuso4');
  const hydrated = rows.filter((r) => r._solute === 'cuso4_5h2o');
  let hydrationKJ = null;
  if (anhydrous.length && hydrated.length) {
    const a = anhydrous.reduce((s, r) => s + r.enthalpyKJ, 0) / anhydrous.length;
    const b = hydrated.reduce((s, r) => s + r.enthalpyKJ, 0) / hydrated.length;
    hydrationKJ = sigFig(a - b, 4);
  }

  // For the mixing experiment, did they find the maximum at equimolar?
  let peakAtEquimolar = null;
  if (inputs.mode === 'mixing') {
    const strongest = rows.reduce((a, b) =>
      (Math.abs(a.enthalpyKJ) >= Math.abs(b.enthalpyKJ) ? a : b));
    peakAtEquimolar = Math.abs(strongest._fraction - 0.5) <= 0.15;
  }

  return {
    ok: true,
    n: rows.length,
    meanKJ: sigFig(mean, 4),
    accepted: sigFig(accepted, 4),
    percentError: sigFig(err, 3),
    spreadKJ: sigFig(spread, 3),
    exothermic: exo,
    signCorrect,
    uncorrected,
    calorimeter: calorimeterOf(inputs).label,
    waterEquivalentG: calorimeterOf(inputs).waterEquivalentG,
    hydrationKJ,
    peakAtEquimolar,
    mode: inputs.mode,
    points: [],
  };
}

export default {
  meta,
  MODES,
  SOLUTES,
  ACIDS,
  BASES,
  CALORIMETERS,
  SCALES,
  C_WATER,
  NEUTRALISATION_KJ,
  MIXING_KJ_EQUIMOLAR,
  defaults,
  soluteOf,
  calorimeterOf,
  molesReacting,
  acceptedKJ,
  effectiveMassG,
  temperatureChangeC,
  computedKJ,
  isExothermic,
  validate,
  init,
  step,
  measure,
  derive,
};
