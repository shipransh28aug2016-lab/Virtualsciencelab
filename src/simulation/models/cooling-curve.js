/**
 * MODEL: Newton's law of cooling — XI-PHY-B06
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Experiment 6:
 * "To study the relationship between the temperature of a hot body and time by
 *  plotting a cooling curve."
 *
 * Unit VII, Chapter 10: Thermal Properties of Matter — heat transfer,
 * Newton's law of cooling.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, sigFig } from '../../utils/measure.js';
import { mixedSetRefusal, specimenOfRows } from '../one-specimen.js';

export const meta = {
  id: 'XI-PHY-B06',
  formula: 'dθ/dt = −k(θ − θ₀);  θ = θ₀ + (θ₁ − θ₀)e^(−kt);  ln(θ − θ₀) = ln(θ₁ − θ₀) − kt',
  unitSystem: 'Temperature in °C, time in seconds (recorded each half minute)',
  assumptions: [
    'The temperature excess over the surroundings is small, so Newton\'s law applies',
    'The surrounding temperature stays constant throughout',
    'The liquid is stirred, so it is at a uniform temperature',
    'Heat is lost only to the surroundings, at a rate proportional to the excess temperature',
    'The thermometer bulb is fully immersed and does not touch the vessel',
  ],
  validRange: 'Starting temperature 60 to 90 °C, room temperature 15 to 35 °C, run up to 20 minutes',
  edgeCases: [
    'The curve is exponential, never a straight line — a straight cooling curve means an error',
    'The body can never cool below the surrounding temperature',
    'A large initial excess departs from Newton\'s law, since radiation then follows Stefan\'s law',
    'A blackened or larger vessel cools faster: k depends on the surface and its area',
  ],
  expectedBehaviour: [
    'Cooling is rapid at first and slows as the excess temperature falls',
    'The temperature approaches the room temperature asymptotically',
    'A graph of ln(θ − θ₀) against t is a straight line of slope −k',
    'Doubling the excess temperature doubles the initial rate of cooling',
  ],
};

/** Calorimeters differ in how fast they lose heat. */
export const VESSELS = {
  polished: { label: 'Polished copper calorimeter', k: 0.00165, emissivity: 'low' },
  blackened: { label: 'Blackened calorimeter', k: 0.00305, emissivity: 'high' },
  glass: { label: 'Glass beaker', k: 0.00225, emissivity: 'medium' },
};

export const LIQUIDS = {
  water: { label: 'Water', specificHeat: 4186 },
  oil: { label: 'Cooking oil', specificHeat: 1970 },
};

export const defaults = {
  vessel: 'polished',
  liquid: 'water',
  startTempC: 80,
  roomTempC: 25,
  massG: 100,
  lidOn: false,
  thermoLC: 0.5,      // thermometer least count (°C)
  intervalS: 30,      // reading taken every half minute
  /*
   * TIME LAPSE. A real cooling run takes fifteen to twenty minutes, which is
   * fine at the bench but unusable in a browser: a student would stare at a
   * static screen. The simulated clock therefore runs faster than real time by
   * this factor, and the times RECORDED in the observation table are the
   * simulated ones, so every number the student writes down is the number a
   * real experiment would give. Only the waiting is compressed.
   */
  timeLapse: 25,
};

/**
 * Cooling constant. It rises with surface losses and falls with thermal mass,
 * so a heavier body of the same liquid cools more slowly.
 */
export function coolingConstant(inputs) {
  const v = VESSELS[inputs.vessel] || VESSELS.polished;
  const l = LIQUIDS[inputs.liquid] || LIQUIDS.water;
  const massFactor = 100 / Math.max(20, inputs.massG);
  const heatFactor = LIQUIDS.water.specificHeat / l.specificHeat;
  const lidFactor = inputs.lidOn ? 0.72 : 1;   // a lid cuts evaporation losses
  return v.k * massFactor * heatFactor * lidFactor;
}

/** Newton's law of cooling, solved exactly. */
export function temperatureAt(inputs, tSeconds) {
  const k = coolingConstant(inputs);
  const excess = inputs.startTempC - inputs.roomTempC;
  return inputs.roomTempC + excess * Math.exp(-k * tSeconds);
}

/** Instantaneous rate of cooling in °C per second (negative). */
export function coolingRate(inputs, tSeconds) {
  const k = coolingConstant(inputs);
  return -k * (temperatureAt(inputs, tSeconds) - inputs.roomTempC);
}

export function validate(inputs) {
  const errors = [], warnings = [];

  if (inputs.startTempC <= inputs.roomTempC) {
    errors.push({
      field: 'startTempC',
      code: 'NOT_HOT',
      message: 'The liquid must start hotter than the room.',
      why: 'With no excess temperature there is no net heat loss, so nothing cools and there is no curve to plot.',
    });
  }
  if (inputs.startTempC - inputs.roomTempC > 60) {
    warnings.push({
      field: 'startTempC',
      code: 'LARGE_EXCESS',
      message: 'The excess temperature is very large.',
      why: 'Newton\'s law of cooling holds only for a small excess over the surroundings. At a large excess, radiation follows Stefan\'s fourth-power law and the early part of your curve will bend away from a true exponential.',
      fix: 'Begin recording once the liquid has fallen to about 70 °C.',
    });
  }
  if (inputs.lidOn) {
    warnings.push({
      field: 'lidOn', code: 'LID',
      message: 'The lid reduces the rate of cooling.',
      why: 'A lid suppresses evaporation and convection from the surface, so k falls by roughly a third. The shape of the curve is still exponential; only the constant changes.',
    });
  }
  if (inputs.thermoLC > 0.5) {
    warnings.push({
      field: 'thermoLC', code: 'COARSE_THERMOMETER',
      message: 'This thermometer is too coarse for the tail of the curve.',
      why: 'Late in the run the temperature changes by only a fraction of a degree between readings, so a coarse thermometer records the same value repeatedly and the logarithmic plot loses its straightness.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0,
    // The clock starts as soon as the hot liquid is in the calorimeter, which
    // is what step 4 of the procedure says. There is nothing to set up first.
    running: true,
    tempC: inputs.startTempC,
    nextReadingAt: 0,
    history: [{ t: 0, temp: inputs.startTempC }],
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  if (!s.running) return s;
  s.t += dt * (inputs.timeLapse ?? 1);
  s.tempC = temperatureAt(inputs, s.t);
  // keep a trace for the live curve, sampled so the array cannot grow forever
  const last = s.history[s.history.length - 1];
  if (!last || s.t - last.t >= 4) {
    s.history = [...s.history, { t: Number(s.t.toFixed(1)), temp: s.tempC }].slice(-400);
  }
  s.readingDue = s.t >= s.nextReadingAt;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 17);
  const t = state?.t ?? (trial - 1) * inputs.intervalS;
  const trueTemp = temperatureAt(inputs, t);
  const reading = toLeastCount(trueTemp + jitter(rng, inputs.thermoLC * 0.7), inputs.thermoLC);
  const excess = reading - inputs.roomTempC;

  return {
    trial,
    vessel: (VESSELS[inputs.vessel] || VESSELS.polished).label,
    liquid: (LIQUIDS[inputs.liquid] || LIQUIDS.water).label,
    timeS: Math.round(t),
    timeMin: Number((t / 60).toFixed(2)),
    tempC: Number(reading.toFixed(1)),
    roomTempC: inputs.roomTempC,
    excess: Number(excess.toFixed(1)),
    lnExcess: excess > 0 ? Number(Math.log(excess).toFixed(4)) : null,
  };
}

/**
 * Two analyses, both expected in the write-up:
 *  (a) the cooling curve itself, θ against t — exponential, not linear
 *  (b) ln(θ − θ₀) against t — a straight line of slope −k, which is the
 *      quantitative verification of Newton's law
 */
export function derive(rows, inputs = defaults) {
  /* A cooling curve is ONE liquid in ONE vessel: the constant being measured
     is a property of that pair, and a set taken across two of them has no
     single k at all. */
  const mixed = mixedSetRefusal(rows, 'vessel', 'vessels')
    || mixedSetRefusal(rows, 'liquid', 'liquids');
  if (mixed) return mixed;

  const usable = rows.filter((r) => Number(r.excess) > 0.6 && Number.isFinite(Number(r.lnExcess)));
  if (usable.length < 4) {
    return { ok: false, reason: 'Record at least four readings while the liquid is still well above room temperature.' };
  }

  const logPts = usable.map((r) => ({ x: Number(r.timeS), y: Number(r.lnExcess) }));

  /*
   * Say what is wrong with the set, not that the arithmetic gave up.
   *
   * "Could not fit the logarithmic plot" is what a student sees after
   * recording eight readings without the clock running: every one is at the
   * same instant, the line through them is vertical, and the message names
   * the failure of the fit rather than the thing they did. A cooling curve is
   * a set of temperatures at DIFFERENT times, and that is the sentence to
   * say.
   */
  const times = logPts.map((p) => p.x);
  const span = Math.max(...times) - Math.min(...times);
  if (span < 1) {
    return {
      ok: false,
      reason: `All ${usable.length} readings were taken at the same instant (t = ${Math.round(times[0])} s). A cooling curve is a temperature at each of several TIMES: start the clock, let the liquid cool, and record again every half minute or so as it falls.`,
    };
  }
  if (span < 30) {
    return {
      ok: false,
      reason: `These readings span only ${Math.round(span)} s of cooling. Over so short a stretch the fall is smaller than the thermometer can resolve, so the plot has nothing to fit. Let it cool for several minutes, recording as you go.`,
    };
  }

  const fit = linearFit(logPts);
  if (!fit) return { ok: false, reason: 'Could not fit the logarithmic plot.' };

  const k = -fit.slope;
  if (!(k > 0)) {
    /*
     * A negative cooling constant is a liquid that got hotter, which is not
     * what these readings are of. It happened when the set was taken over so
     * short a stretch that the thermometer's own least count outweighed the
     * fall, and the panel then printed "half-life null s" beside it — the
     * word null, in the line that is supposed to be the answer.
     */
    return {
      ok: false,
      reason: `Over these readings the excess temperature does not fall — the fitted line has the wrong sign. Let the liquid cool further between readings, or take them over a longer stretch, so that the fall is larger than the thermometer can resolve.`,
    };
  }
  const vessel = specimenOfRows(VESSELS, rows, 'vessel', VESSELS[inputs.vessel] || VESSELS.polished);
  const liquid = specimenOfRows(LIQUIDS, rows, 'liquid', LIQUIDS[inputs.liquid] || LIQUIDS.water);
  /* k belongs to the vessel and liquid the READINGS were taken on. */
  const accepted = coolingConstant({
    ...inputs,
    vessel: Object.keys(VESSELS).find((key) => VESSELS[key].label === vessel.label) || inputs.vessel,
    liquid: Object.keys(LIQUIDS).find((key) => LIQUIDS[key].label === liquid.label) || inputs.liquid,
  });
  // Time to fall to half the initial excess follows directly from k.
  const halfLife = Math.log(2) / k;

  return {
    ok: true,
    coolingConstant: sigFig(k, 4),
    accepted: sigFig(accepted, 4),
    slope: sigFig(fit.slope, 4),
    r2: Number(fit.r2.toFixed(4)),
    halfLifeS: sigFig(halfLife, 3),
    halfLifeMin: sigFig(halfLife / 60, 3),
    roomTempC: inputs.roomTempC,
    vessel: vessel.label,
    liquid: liquid.label,
    n: usable.length,
    // the plotted curve is temperature against time; the fit is on the log plot
    points: rows.map((r) => ({ x: Number(r.timeS), y: Number(r.tempC) })),
    logPoints: logPts,
  };
}

export default {
  meta, defaults, VESSELS, LIQUIDS,
  init, step, measure, derive, validate,
  temperatureAt, coolingConstant, coolingRate,
};
