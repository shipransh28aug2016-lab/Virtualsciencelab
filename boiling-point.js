/**
 * XI-CHE-B02 — determination of the boiling point of an organic compound.
 *
 * A liquid boils when its saturated vapour pressure equals the pressure of the
 * atmosphere above it. That single sentence carries the whole experiment: the
 * boiling point is not a fixed property of the liquid alone but of the liquid
 * AND the pressure, so a boiling point quoted without a pressure is incomplete.
 *
 * At the bench the Siwoloboff method is used. A little liquid is placed in a
 * small tube with an inverted capillary in it, and the whole is warmed in a
 * bath. While the liquid is below its boiling point the air trapped in the
 * capillary merely expands and a slow trickle of bubbles emerges. At the
 * boiling point the vapour pressure of the liquid equals atmospheric pressure
 * and a RAPID, CONTINUOUS stream of bubbles appears. The reading is taken not
 * then, but on cooling: the temperature at which the bubbling just stops and
 * the liquid begins to suck back into the capillary is the boiling point, and
 * it is the sharper observation of the two.
 *
 * Two effects distinguish this from the melting-point experiment. A non-volatile
 * impurity RAISES the boiling point — elevation, not depression — because it
 * lowers the vapour pressure of the solvent. And reduced pressure lowers the
 * boiling point substantially, which is the basis of distillation under vacuum
 * for compounds that would decompose at their normal boiling point.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-B02',
  formula:
    'A liquid boils when its saturated vapour pressure equals the external pressure. '
    + 'Elevation of boiling point ΔTb = Kb·m (colligative). '
    + 'Pressure correction ≈ 0.04 °C per mm Hg for most organic liquids',
  unitSystem: 'Temperature in °C, pressure in mm Hg, impurity as a mole percentage',
  assumptions: [
    'The capillary is sealed at its upper end and open at the lower end, inverted in the liquid',
    'The thermometer bulb is level with the liquid in the small tube',
    'The bath is stirred, so liquid and thermometer are at the same temperature',
    'The impurity is non-volatile and does not react with the liquid',
    'The reading is taken as the bubbling ceases on cooling, not while boiling vigorously',
  ],
  validRange:
    'Liquids boiling between 55 and 220 °C, pressure 600–800 mm Hg, '
    + 'impurity 0–6 mole per cent',
  edgeCases: [
    'At reduced pressure the liquid boils measurably LOWER — the basis of vacuum distillation',
    'A non-volatile impurity RAISES the boiling point, the opposite of the melting-point case',
    'Superheating makes the liquid boil above its true point until a bubble nucleates',
    'A bath that cannot exceed 100 °C will never boil a liquid of higher boiling point',
  ],
  expectedBehaviour: [
    'A rapid continuous stream of bubbles marks the boiling point',
    'The reading is taken as bubbling ceases on cooling, which is the sharper observation',
    'Lower atmospheric pressure gives a lower boiling point',
    'A non-volatile impurity raises the boiling point in proportion to its amount',
    'Boiling chips suppress superheating and give a truer reading',
  ],
};

/**
 * Liquids used at this level. `boilingPointC` is at 760 mm Hg and is what the
 * experiment DETERMINES, so it is never shown before a reading is taken.
 * `kb` is the ebullioscopic constant, in °C per mole fraction.
 */
export const LIQUIDS = {
  acetone: { label: 'Acetone', boilingPointC: 56.1, kb: 29 },
  ethanol: { label: 'Ethanol', boilingPointC: 78.4, kb: 34 },
  water: { label: 'Water', boilingPointC: 100.0, kb: 28 },
  toluene: { label: 'Toluene', boilingPointC: 110.6, kb: 55 },
  aniline: { label: 'Aniline', boilingPointC: 184.1, kb: 61 },
};

/** Purity of the sample, as a mole percentage of NON-VOLATILE impurity. */
export const PURITY = {
  pure: { label: 'Redistilled', impurityPct: 0.0 },
  slight: { label: 'Slightly impure', impurityPct: 1.2 },
  impure: { label: 'Crude sample', impurityPct: 3.5 },
};

/** Heating baths. */
export const BATHS = {
  oil: { label: 'Liquid paraffin bath', maxC: 220 },
  water: { label: 'Water bath', maxC: 98 },
};

/** Are boiling chips present to nucleate bubbles? */
export const CHIPS = {
  with: { label: 'With boiling chips', superheatC: 0.0 },
  without: { label: 'No boiling chips', superheatC: 2.4 },
};

/** Standard atmospheric pressure, mm Hg. */
export const STANDARD_PRESSURE = 760;
/** Rate at which the boiling point falls with pressure, °C per mm Hg. */
export const PRESSURE_COEFF = 0.04;

export const defaults = {
  liquid: 'ethanol',
  purity: 'pure',
  bath: 'oil',
  chips: 'with',
  pressureMmHg: 760,
  timeLapse: 40,
};

/** Elevation of the boiling point caused by a non-volatile impurity, in °C. */
export function elevationC(inputs) {
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.ethanol;
  return l.kb * ((PURITY[inputs.purity] || PURITY.pure).impurityPct / 100);
}

/** Shift in the boiling point due to the pressure not being 760 mm Hg, in °C. */
export function pressureShiftC(inputs) {
  return (inputs.pressureMmHg - STANDARD_PRESSURE) * PRESSURE_COEFF;
}

/** True boiling point under the current conditions, in °C. */
export function boilingPointC(inputs) {
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.ethanol;
  return l.boilingPointC + elevationC(inputs) + pressureShiftC(inputs);
}

/**
 * Temperature at which a rapid stream of bubbles first appears, in °C.
 * Without boiling chips the liquid superheats past its true boiling point
 * before a bubble manages to nucleate.
 */
export function onsetC(inputs) {
  return boilingPointC(inputs) + (CHIPS[inputs.chips] || CHIPS.with).superheatC;
}

/** Can the bath reach the boiling point at all? */
export function bathAdequate(inputs) {
  const bath = BATHS[inputs.bath] || BATHS.oil;
  return bath.maxC > boilingPointC(inputs) + 5;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.ethanol;
  const bath = BATHS[inputs.bath] || BATHS.oil;

  if (!bathAdequate(inputs)) {
    errors.push({
      field: 'bath',
      code: 'BATH_TOO_COOL',
      message: `A ${bath.label.toLowerCase()} cannot boil ${l.label.toLowerCase()}.`,
      why: `The bath cannot be taken above about ${bath.maxC} °C, and this liquid boils higher than that. No stream of bubbles will ever appear, however long it is heated.`,
      fix: 'Use a liquid paraffin bath, which reaches 220 °C.',
    });
  }
  if (inputs.chips === 'without') {
    warnings.push({
      field: 'chips',
      code: 'SUPERHEATING',
      message: 'Without boiling chips the liquid can superheat.',
      why: `A bubble needs somewhere to nucleate. With no rough surface the liquid can be carried a couple of degrees above its true boiling point before it suddenly boils — often violently, throwing liquid up the tube. The observed boiling point then reads about ${(CHIPS.without.superheatC).toFixed(1)} °C too high.`,
      fix: 'Add a boiling chip, or take the reading as the bubbling ceases on cooling.',
    });
  }
  if (inputs.purity !== 'pure') {
    warnings.push({
      field: 'purity',
      code: 'IMPURE_SAMPLE',
      message: `This sample carries about ${(PURITY[inputs.purity] || PURITY.pure).impurityPct} mole per cent of non-volatile impurity.`,
      why: `A dissolved non-volatile solute lowers the vapour pressure of the liquid, so a higher temperature is needed before that pressure matches the atmosphere. The boiling point is RAISED by about ${elevationC(inputs).toFixed(1)} °C — the opposite of what an impurity does to a melting point.`,
      fix: 'Redistil the sample and determine the boiling point again.',
    });
  }
  if (Math.abs(inputs.pressureMmHg - STANDARD_PRESSURE) > 20) {
    warnings.push({
      field: 'pressureMmHg',
      code: 'NON_STANDARD_PRESSURE',
      message: `The pressure is ${inputs.pressureMmHg} mm Hg, not the standard 760.`,
      why: `A liquid boils when its vapour pressure equals the external pressure, so the boiling point depends on that pressure. Here it is shifted by about ${pressureShiftC(inputs).toFixed(1)} °C. A boiling point quoted without its pressure is incomplete.`,
      fix: 'Record the barometric pressure and correct the observed value to 760 mm Hg.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  /* The bath is brought rapidly to within about fifteen degrees of the expected
     boiling point before the careful heating begins. */
  const start = Math.max(20, boilingPointC(inputs) - 15);
  return {
    t: 0,
    running: true,
    tempC: start,
    phase: 'warming',      // warming → bubbling → cooling → read
    bubbleRate: 0,
    onsetAt: null,
    ceaseAt: null,
    finishedAt: null,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  if (s.finishedAt) return s;
  const minutes = (dt * (inputs.timeLapse ?? 1)) / 60;
  s.t += dt * (inputs.timeLapse ?? 1);

  if (!bathAdequate(inputs)) {
    const bath = BATHS[inputs.bath] || BATHS.oil;
    s.tempC = Math.min(s.tempC + 3 * minutes, bath.maxC);
    s.bubbleRate = 0;
    return s;
  }

  const onset = onsetC(inputs);
  const bp = boilingPointC(inputs);

  if (s.phase === 'warming') {
    s.tempC += 3.2 * minutes;
    // A slow trickle from the expanding trapped air, well before boiling.
    s.bubbleRate = Math.max(0, Math.min(0.25, (s.tempC - (bp - 20)) / 80));
    if (s.tempC >= onset) {
      s.phase = 'bubbling';
      s.onsetAt = s.tempC;
    }
  } else if (s.phase === 'bubbling') {
    // A rapid continuous stream. Heat a little further, then take the burner away.
    s.tempC += 2.0 * minutes;
    s.bubbleRate = 1;
    if (s.tempC >= onset + 3) s.phase = 'cooling';
  } else if (s.phase === 'cooling') {
    // The sharp observation: bubbling ceases and liquid sucks back in.
    s.tempC -= 2.4 * minutes;
    s.bubbleRate = s.tempC > bp ? 1 : 0;
    if (s.tempC <= bp) {
      s.phase = 'read';
      s.ceaseAt = s.tempC;
      s.finishedAt = s.t;
    }
  }
  return s;
}

/**
 * One determination. The reading is the temperature at which bubbling CEASED
 * on cooling — refuses until the run has reached that point, because a boiling
 * point cannot be quoted from a liquid that is still merely warming.
 */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!bathAdequate(inputs)) return null;
  if (!state || state.phase !== 'read') return null;

  const lc = 0.5;
  const rng = makeRng(seed + trial * 59);
  const observed = toLeastCount(boilingPointC(inputs) + jitter(rng, lc * 0.7), lc);
  // Corrected to standard pressure, which is how a boiling point is quoted.
  const corrected = toLeastCount(observed - pressureShiftC(inputs), lc);
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.ethanol;

  return {
    trial,
    liquid: l.label,
    purity: (PURITY[inputs.purity] || PURITY.pure).label,
    pressureMmHg: inputs.pressureMmHg,
    onsetC: toLeastCount(onsetC(inputs) + jitter(rng, lc), lc),
    observedC: observed,
    correctedC: corrected,
  };
}

export function derive(rows, inputs = defaults) {
  const vals = rows
    .map((r) => ({ obs: Number(r.observedC), corr: Number(r.correctedC) }))
    .filter((p) => Number.isFinite(p.obs));
  if (vals.length < 2) {
    return { ok: false, reason: 'Determine the boiling point at least twice — a single run could be a mistake.' };
  }

  const l = LIQUIDS[inputs.liquid] || LIQUIDS.ethanol;
  const observed = mean(vals.map((v) => v.obs));
  const corrected = mean(vals.map((v) => v.corr));
  const spread = Math.max(...vals.map((v) => v.obs)) - Math.min(...vals.map((v) => v.obs));

  // Did the student work at more than one pressure? That is the striking check.
  const pressures = [...new Set(rows.map((r) => Number(r.pressureMmHg)))];
  let pressureCheck = null;
  if (pressures.length > 1) {
    pressureCheck = pressures.sort((a, b) => a - b).map((p) => {
      const sub = rows.filter((r) => Number(r.pressureMmHg) === p);
      return { pressureMmHg: p, boilingPoint: sigFig(mean(sub.map((r) => Number(r.observedC))), 5), n: sub.length };
    });
  }

  const purities = [...new Set(rows.map((r) => r.purity))];
  let purityCheck = null;
  if (purities.length > 1) {
    purityCheck = purities.map((name) => {
      const sub = rows.filter((r) => r.purity === name);
      return { name, boilingPoint: sigFig(mean(sub.map((r) => Number(r.observedC))), 5), n: sub.length };
    });
  }

  return {
    ok: true,
    boilingPoint: sigFig(corrected, 5),
    observedBoilingPoint: sigFig(observed, 5),
    accepted: l.boilingPointC,
    percentError: Number((((corrected - l.boilingPointC) / l.boilingPointC) * 100).toFixed(2)),
    deviationC: Number((corrected - l.boilingPointC).toFixed(2)),
    spread: Number(spread.toFixed(2)),
    pressureMmHg: inputs.pressureMmHg,
    pressureShiftC: sigFig(pressureShiftC(inputs), 3),
    correctedForPressure: Math.abs(pressureShiftC(inputs)) > 0.05,
    elevationC: sigFig(elevationC(inputs), 3),
    pure: inputs.purity === 'pure',
    superheated: inputs.chips === 'without',
    superheatC: (CHIPS[inputs.chips] || CHIPS.with).superheatC,
    liquid: l.label,
    pressureCheck,
    pressuresCompared: pressures.length,
    purityCheck,
    puritiesCompared: purities.length,
    n: vals.length,
    points: rows.map((r) => ({ x: Number(r.pressureMmHg), y: Number(r.observedC) })),
  };
}

export default {
  meta, defaults, LIQUIDS, PURITY, BATHS, CHIPS, STANDARD_PRESSURE, PRESSURE_COEFF,
  init, step, measure, derive, validate,
  elevationC, pressureShiftC, boilingPointC, onsetC, bathAdequate,
};
