/**
 * MODEL: Galvanometer — XII-PHY-A04 (resistance by half-deflection, and
 * figure of merit) and XII-PHY-A05 (conversion to ammeter/voltmeter).
 * Half-deflection: S = GR/(R−S), exact; G≈S only when R≫G.
 * Ammeter shunt (parallel): S = IgG/(I−Ig). Voltmeter series: R = V/Ig − G.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, toLeastCount } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-A04',
  formula: 'G = SR/(R−S); k = E/((R+G)·θ); shunt S = IgG/(I−Ig); series R = V/Ig − G',
  unitSystem: 'Ohm; current in microampere for the figure of merit',
  assumptions: ['The galvanometer scale is linear', 'The cell\'s internal resistance is small compared with R', 'Deflection is proportional to current over the range used'],
  validRange: 'Series resistance 500-10000 Ω',
  edgeCases: ['A small R relative to G makes the crude approximation G≈S noticeably wrong'],
  expectedBehaviour: ['Halving the deflection with a shunt in parallel gives S = GR/(R−S)', 'A converted ammeter has very low resistance; a converted voltmeter very high'],
};

export const GALVANOMETERS = { g1: { label: 'Galvanometer 1', G: 60, kMicro: 26 }, g2: { label: 'Galvanometer 2', G: 100, kMicro: 15 }, g3: { label: 'Galvanometer 3', G: 40, kMicro: 40 } };
export const CELLS = { c2: { label: '2 V cell', emf: 2 }, c3: { label: '3 V cell', emf: 3 }, c4: { label: '4 V cell', emf: 4 } };

/*
 * `conversion` is NOT given a default here on purpose. This one model
 * serves two experiments (XII-PHY-A04 half-deflection, XII-PHY-A05
 * ammeter/voltmeter conversion) and measure()/derive() use
 * `if (inputs.conversion)` to tell which is running. XII-PHY-A04's own
 * experiment JSON never declares a `conversion` variable at all -- and
 * main.js's initialInputs() only OVERRIDES model defaults with an
 * experiment's own declared variables, it never clears fields the
 * experiment doesn't mention. A default of 'ammeter' here would have
 * leaked into every XII-PHY-A04 run un-overridden, permanently truthy, so
 * the half-deflection experiment would ALWAYS have taken the conversion
 * branch of measure() and derive() -- recording a conversion-mode
 * pseudo-deflection instead of the actual half-deflection circuit, and
 * showing "Conversion into an ammeter..." instead of G and the figure of
 * merit, no matter what the student actually did. XII-PHY-A05 is
 * unaffected: it declares `conversion` itself, with its own default of
 * 'ammeter', in its own JSON.
 */
/*
 * The shunt is a resistance box plugged across the galvanometer, so it has a
 * resistance the moment it is connected — you cannot plug in nought ohms.
 * Starting it at zero meant the "shunt connected" switch did nothing at all:
 * every reading still recorded S = 0, and the calculation asked for a shunted
 * reading the student believed they had already taken.
 */
export const defaults = { resistanceR: 3000, shuntS: 50, shuntConnected: false, galvanometer: 'g1', cell: 'c2', targetRange: 1, testValue: 0.5 };

export function galvOf(inputs) { return GALVANOMETERS[inputs.galvanometer] || GALVANOMETERS.g1; }
export function cellOf(inputs) { return CELLS[inputs.cell] || CELLS.c2; }
export function fullScaleDiv() { return 30; }

/** Ampere or volt, according to what the galvanometer is being converted into. */
export function unitOf(inputs) { return inputs.conversion === 'voltmeter' ? 'V' : 'A'; }

/** Deflection in divisions for the half-deflection circuit (A04). */
export function deflectionDiv(inputs) {
  const g = galvOf(inputs);
  const k = g.kMicro * 1e-6;
  const I = inputs.shuntConnected
    ? cellOf(inputs).emf / (inputs.resistanceR + (g.G * inputs.shuntS) / (g.G + inputs.shuntS))
    : cellOf(inputs).emf / (inputs.resistanceR + g.G);
  const currentThroughG = inputs.shuntConnected ? I * (inputs.shuntS / (g.G + inputs.shuntS)) : I;
  return Math.min(fullScaleDiv(), currentThroughG / k);
}

/** The shunt that would give exactly half the no-shunt deflection. */
export function halfDeflectionShunt(inputs) {
  const g = galvOf(inputs);
  return (g.G * inputs.resistanceR) / (inputs.resistanceR + g.G);
}

/** Required conversion resistance for A05. */
export function requiredResistance(inputs) {
  const g = galvOf(inputs);
  const ig = g.kMicro * 1e-6 * fullScaleDiv();
  if (inputs.conversion === 'ammeter') return (ig * g.G) / (inputs.targetRange - ig);
  return inputs.targetRange / ig - g.G;
}
export function meterResistance(inputs) {
  const g = galvOf(inputs);
  const req = requiredResistance(inputs);
  return inputs.conversion === 'ammeter' ? (g.G * req) / (g.G + req) : g.G + req;
}

export function validate(inputs) {
  /* A connected shunt of zero ohms is a short circuit, and the commonest way
     to get stuck on this activity: the switch is on, so the student believes
     the shunt is in, and every reading still records S = 0. */
  if (inputs.shuntConnected && !(inputs.shuntS > 0)) {
    const v = validateRest(inputs);
    v.warnings.unshift({
      field: 'shuntS', code: 'SHUNT_ZERO',
      message: 'The shunt is switched in but its resistance is still zero.',
      why: 'Zero ohms across the galvanometer is a short circuit, not a shunt: all the current bypasses the coil and the reading is the same as with no shunt at all.',
      fix: 'Raise S until the deflection falls to about half its unshunted value.',
    });
    return v;
  }
  return validateRest(inputs);
}

function validateRest(inputs) {
  const warnings = [];
  if (!inputs.shuntConnected && inputs.conversion !== 'voltmeter' && inputs.resistanceR < galvOf(inputs).G * 5) {
    warnings.push({ field: 'resistanceR', code: 'R_TOO_SMALL', message: 'R is not much larger than G.', why: 'The half-deflection method\'s simple check G≈S is only a fair approximation when R≫G; for a small R the exact formula G=SR/(R−S) must be used and differs noticeably.' });
  }
  return { ok: true, errors: [], warnings };
}

/** Deflection in divisions the pointer is actually being asked to settle at, right now, for whichever of the two experiments this input set belongs to. */
function targetDeflectionDiv(inputs) {
  if (inputs.conversion) {
    // A05: the converted meter reads testValue out of targetRange, full-scale
    // at fullScaleDiv() divisions -- exactly what measure() below assumes.
    return Math.min(fullScaleDiv(), Math.max(0, (inputs.testValue / inputs.targetRange) * fullScaleDiv()));
  }
  // A04: the actual half-deflection circuit.
  return deflectionDiv(inputs);
}

export function init(inputs = defaults) {
  return { t: 0, deflection: 0, settled: false, requiredResistance: requiredResistance(inputs), meterResistance: meterResistance(inputs) };
}
/**
 * The needle was permanently frozen at zero on the live canvas -- step()
 * was a bare pass-through, so `state.deflection` (what the renderer's dial
 * actually reads) never existed on state at all, only inside the one-shot
 * `measure()` snapshot taken when a reading is recorded. A moving-coil
 * galvanometer visibly swings up and settles as R, the shunt, or the test
 * value change; that swing is watched for by the actual procedure (find
 * the half-deflection point BY EYE), so it has to be live, not a jump-cut.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = targetDeflectionDiv(inputs);
  s.deflection += (target - s.deflection) * Math.min(1, dt * 5);
  s.settled = Math.abs(target - s.deflection) < 0.15;
  s.requiredResistance = requiredResistance(inputs);
  s.meterResistance = meterResistance(inputs);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 197);
  if (inputs.conversion) {
    const g = galvOf(inputs);
    const ig = g.kMicro * 1e-6 * fullScaleDiv();
    /*
     * The last four steps of this practical are "connect the converted
     * instrument together with the standard meter", "compare them at several
     * points across the range", "tabulate the TWO readings and find the
     * difference at each point", "confirm that the converted instrument reads
     * correctly over its full range" — and the observation table had one
     * column for the deflection and nowhere to write either reading down.
     * Four steps of the procedure could not be carried out at the bench that
     * prints them.
     */
    if (inputs.testValue > inputs.targetRange) {
      return {
        v: null,
        reason: `The test ${inputs.conversion === 'ammeter' ? 'current' : 'voltage'} is ${sigFig(inputs.testValue, 3)} ${unitOf(inputs)}, beyond the ${inputs.targetRange} ${unitOf(inputs)} the instrument was converted to — the pointer is hard against its stop. Bring it back inside the range, or convert the galvanometer to a larger one.`,
      };
    }
    const defl = Math.min(fullScaleDiv(), (inputs.testValue / inputs.targetRange) * fullScaleDiv() + jitter(rng, 0.2));
    /* The converted instrument is read off ITS scale: one division is a
       thirtieth of the range, and that is as finely as it can be read. */
    const lcConverted = inputs.targetRange / fullScaleDiv();
    const converted = toLeastCount((defl / fullScaleDiv()) * inputs.targetRange, lcConverted);
    /* The standard meter beside it is a better instrument, read to a
       hundredth of the same range. */
    const standard = toLeastCount(inputs.testValue + jitter(rng, lcConverted * 0.08), inputs.targetRange / 100);
    return {
      trial, resistanceR: inputs.resistanceR, deflection: Number(defl.toFixed(1)),
      standardReading: sigFig(standard, 4), convertedReading: sigFig(converted, 4),
      difference: sigFig(converted - standard, 2),
      currentMicroA: sigFig(ig * (defl / fullScaleDiv()) * 1e6, 4),
    };
  }
  const defl = deflectionDiv(inputs) + jitter(rng, 0.15);
  const g = galvOf(inputs);
  return { trial, galvanometer: g.label, resistanceR: inputs.resistanceR, shuntS: inputs.shuntConnected ? inputs.shuntS : 0, deflection: Number(defl.toFixed(1)), currentMicroA: sigFig(defl * g.kMicro, 4) };
}

export function derive(rows, inputs = defaults) {
  if (inputs.conversion) {
    const tested = rows.filter((r) => Number.isFinite(Number(r.standardReading)));
    if (tested.length < 3) {
      return { ok: false, reason: `Compare the converted instrument with the standard at ${3 - tested.length} more point${3 - tested.length > 1 ? 's' : ''} across its range — one agreement is not a calibration.` };
    }
    const spread = new Set(tested.map((r) => Number(r.standardReading)));
    if (spread.size < 3) {
      return { ok: false, reason: 'All these comparisons were made at the same test value. Move the rheostat and compare at several points across the range.' };
    }
    const g = galvOf(inputs);
    const isAmmeter = inputs.conversion === 'ammeter';
    const diffs = tested.map((r) => Math.abs(Number(r.convertedReading) - Number(r.standardReading)));
    const worst = Math.max(...diffs);
    const oneDivision = inputs.targetRange / fullScaleDiv();
    return {
      ok: true, mode: inputs.conversion, range: inputs.targetRange, unit: isAmmeter ? 'A' : 'V',
      /*
       * The shunt is CALCULATED from G, Ig and the range chosen, so its
       * "accepted value" is whatever that calculation gives for the range on
       * the bench — not the 0.0468 Ω belonging to the 1 A conversion in the
       * manual. What can be right or wrong here is the finished instrument,
       * and that is what these last three numbers report.
       */
      accepted: sigFig(requiredResistance(inputs), 4),
      pointsCompared: tested.length,
      worstDifference: sigFig(worst, 2),
      meanDifference: sigFig(diffs.reduce((a, b) => a + b, 0) / diffs.length, 2),
      readsTrue: worst <= oneDivision * 1.01,
      oneDivision: sigFig(oneDivision, 3),
      connection: isAmmeter ? 'shunt, in parallel with the galvanometer' : 'resistance, in series with the galvanometer',
      formula: isAmmeter ? 'S = IgG/(I−Ig)' : 'R = V/Ig − G',
      galvanometerResistance: g.G,
      requiredResistance: sigFig(requiredResistance(inputs), 4), meterResistance: sigFig(meterResistance(inputs), 4),
      fullScaleCurrentMicroA: sigFig(g.kMicro * fullScaleDiv(), 4),
      n: rows.length, points: rows.map((r) => ({ x: Number(r.trial), y: Number(r.deflection) })),
    };
  }
  /*
   * Half deflection needs a reading with the shunt OUT and one with it IN.
   * "In" means a shunt with resistance: the switch on its own, with S still
   * at zero, puts a short circuit across the galvanometer rather than a
   * shunt, and records the same zero as an open key. A student who flips the
   * switch and takes a reading has done what the switch says and is then
   * refused with "record both without and with the shunt connected", which
   * they believe they have. So the two cases are told apart.
   */
  /*
   * Half deflection measures ONE galvanometer. Three of them are on the
   * bench, and a set taken across all three — θ on the first, the shunted
   * reading on the second — gives a G that belongs to no instrument at all.
   * Nothing said so, and the answer came back 27% from the resistance of
   * whichever one happened to be connected last.
   */
  const instruments = [...new Set(rows.map((r) => r.galvanometer).filter(Boolean))];
  if (instruments.length > 1) {
    return { ok: false, reason: `These readings are of ${instruments.length} different galvanometers (${instruments.join(', ')}). G belongs to one instrument — clear the table and take θ and the shunted reading on the same one.` };
  }

  const noShunt = rows.find((r) => Number(r.shuntS) === 0);
  const withShunt = rows.filter((r) => Number(r.shuntS) > 0);
  if (!noShunt) {
    return { ok: false, reason: 'Record the deflection θ with the shunt disconnected first — that is the deflection the shunt has to halve.' };
  }
  if (!withShunt.length) {
    return { ok: false, reason: 'Now connect the shunt AND give it a resistance: with S at zero the switch puts a short circuit across the galvanometer, not a shunt. Raise S until the deflection falls to about half of θ, then record it.' };
  }
  const theta = Number(noShunt.deflection);
  const half = withShunt.reduce((a, b) => (Math.abs(Number(a.deflection) - theta / 2) <= Math.abs(Number(b.deflection) - theta / 2) ? a : b));
  const R = Number(half.resistanceR);
  const S = Number(half.shuntS);
  const G = (S * R) / (R - S);
  const k = Number(noShunt.currentMicroA) / theta;
  /* The accepted G belongs to the instrument the READINGS were taken on. */
  const g = Object.values(GALVANOMETERS).find((x) => x.label === instruments[0]) || galvOf(inputs);
  return {
    ok: true, mode: 'half-deflection', resistance: sigFig(G, 4), figureOfMeritMicro: sigFig(k, 4),
    fullScaleCurrentMicroA: sigFig(k * fullScaleDiv(), 4), approxG: sigFig(S, 4), approxResistance: sigFig(S, 4),
    instrument: g.label, accepted: g.G, acceptedK: g.kMicro,
    n: rows.length, points: rows.map((r) => ({ x: Number(r.resistanceR), y: Number(r.deflection) })),
  };
}

export default { meta, defaults, GALVANOMETERS, CELLS, init, step, measure, derive, validate, galvOf, cellOf, deflectionDiv, halfDeflectionShunt, requiredResistance, meterResistance };
