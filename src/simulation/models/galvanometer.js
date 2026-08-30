/**
 * MODEL: Galvanometer — XII-PHY-A04 (resistance by half-deflection, and
 * figure of merit) and XII-PHY-A05 (conversion to ammeter/voltmeter).
 * Half-deflection: S = GR/(R−S), exact; G≈S only when R≫G.
 * Ammeter shunt (parallel): S = IgG/(I−Ig). Voltmeter series: R = V/Ig − G.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

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
export const defaults = { resistanceR: 3000, shuntS: 0, shuntConnected: false, galvanometer: 'g1', cell: 'c2', targetRange: 1, testValue: 0.5 };

export function galvOf(inputs) { return GALVANOMETERS[inputs.galvanometer] || GALVANOMETERS.g1; }
export function cellOf(inputs) { return CELLS[inputs.cell] || CELLS.c2; }
export function fullScaleDiv() { return 30; }

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
    const defl = Math.min(fullScaleDiv(), (inputs.testValue / inputs.targetRange) * fullScaleDiv() + jitter(rng, 0.2));
    return { trial, resistanceR: inputs.resistanceR, deflection: Number(defl.toFixed(1)), currentMicroA: sigFig(ig * (defl / fullScaleDiv()) * 1e6, 4) };
  }
  const defl = deflectionDiv(inputs) + jitter(rng, 0.15);
  const g = galvOf(inputs);
  return { trial, resistanceR: inputs.resistanceR, shuntS: inputs.shuntConnected ? inputs.shuntS : 0, deflection: Number(defl.toFixed(1)), currentMicroA: sigFig(defl * g.kMicro, 4) };
}

export function derive(rows, inputs = defaults) {
  if (inputs.conversion) {
    if (rows.length < 1) return { ok: false, reason: 'Take at least one reading with the converted meter.' };
    const g = galvOf(inputs);
    const isAmmeter = inputs.conversion === 'ammeter';
    return {
      ok: true, mode: inputs.conversion, range: inputs.targetRange, unit: isAmmeter ? 'A' : 'V',
      connection: isAmmeter ? 'shunt, in parallel with the galvanometer' : 'resistance, in series with the galvanometer',
      formula: isAmmeter ? 'S = IgG/(I−Ig)' : 'R = V/Ig − G',
      galvanometerResistance: g.G,
      requiredResistance: sigFig(requiredResistance(inputs), 4), meterResistance: sigFig(meterResistance(inputs), 4),
      fullScaleCurrentMicroA: sigFig(g.kMicro * fullScaleDiv(), 4),
      n: rows.length, points: rows.map((r) => ({ x: Number(r.trial), y: Number(r.deflection) })),
    };
  }
  const noShunt = rows.find((r) => Number(r.shuntS) === 0);
  const withShunt = rows.filter((r) => Number(r.shuntS) > 0);
  if (!noShunt || !withShunt.length) return { ok: false, reason: 'Record the deflection both without and with the shunt connected.' };
  const theta = Number(noShunt.deflection);
  const half = withShunt.reduce((a, b) => (Math.abs(Number(a.deflection) - theta / 2) <= Math.abs(Number(b.deflection) - theta / 2) ? a : b));
  const R = Number(half.resistanceR);
  const S = Number(half.shuntS);
  const G = (S * R) / (R - S);
  const k = Number(noShunt.currentMicroA) / theta;
  const g = galvOf(inputs);
  return {
    ok: true, mode: 'half-deflection', resistance: sigFig(G, 4), figureOfMeritMicro: sigFig(k, 4),
    fullScaleCurrentMicroA: sigFig(k * fullScaleDiv(), 4), approxG: sigFig(S, 4), approxResistance: sigFig(S, 4),
    accepted: g.G, acceptedK: g.kMicro,
    n: rows.length, points: rows.map((r) => ({ x: Number(r.resistanceR), y: Number(r.deflection) })),
  };
}

export default { meta, defaults, GALVANOMETERS, CELLS, init, step, measure, derive, validate, galvOf, cellOf, deflectionDiv, halfDeflectionShunt, requiredResistance, meterResistance };
