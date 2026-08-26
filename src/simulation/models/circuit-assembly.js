/**
 * MODEL: Assembling the components of a given circuit — XII-PHY-ACT-A4
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 4:
 * "To assemble the components of a given electrical circuit."
 *
 * Unit III, Chapter 3: Current Electricity — circuit diagrams, series and
 * parallel connection, measuring instruments in a circuit.
 *
 * The student is given a circuit DIAGRAM and must connect real components to
 * match it. The examinable skill is the translation from symbol to apparatus,
 * and the mistakes are always the same handful:
 *
 *   · the ammeter put in parallel and the voltmeter in series;
 *   · the meters connected with reversed polarity, so the needle drives
 *     backwards against its stop;
 *   · the rheostat wired across its full resistance instead of as a variable
 *     arm, so it does nothing;
 *   · the key left closed while the circuit is being built.
 *
 * The consequence of each is computed rather than merely announced. An ammeter
 * in parallel with the load is a near short circuit, so the model reports the
 * current that would actually flow. A voltmeter in series chokes the circuit to
 * nearly nothing, so it reports that too. The numbers are what make the mistake
 * land.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, toLeastCount } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A4',
  formula: 'I = V/R_total; ammeter R ≈ 0.1 Ω in series; voltmeter R ≈ 10 kΩ in parallel',
  unitSystem: 'Volt, ampere, ohm',
  assumptions: [
    'The cell has a small but non-zero internal resistance',
    'The ammeter has a low resistance and the voltmeter a high one, as real meters do',
    'Connecting wires and contacts have negligible resistance',
    'The rheostat is linear along its track',
    'Components are undamaged at the start of each attempt',
  ],
  validRange: 'Supply 1.5 to 12 V; load 5 to 100 Ω; rheostat 0 to 50 Ω',
  edgeCases: [
    'An ammeter in parallel with the load is a near short circuit and draws a damaging current',
    'A voltmeter in series reduces the current to a few microampere, so nothing works',
    'Reversed meter polarity drives the needle backwards against its stop',
    'A rheostat connected across its whole track cannot vary anything',
    'With the key closed during assembly, a wrong connection is live the moment it is made',
  ],
  expectedBehaviour: [
    'Only the correct arrangement gives a sensible reading on both meters',
    'The ammeter reading falls as the rheostat resistance is increased',
    'Each wrong connection produces its own characteristic symptom, not a generic failure',
    'The circuit must be checked before the key is closed',
  ],
};

/** The load whose current and voltage are to be measured. */
export const LOADS = {
  r10: { label: '10 Ω resistor', ohm: 10 },
  r22: { label: '22 Ω resistor', ohm: 22 },
  r47: { label: '47 Ω resistor', ohm: 47 },
  lamp: { label: '6 V lamp', ohm: 24 },
};

/** Cells available as the supply. */
export const CELLS = {
  c15: { label: '1.5 V cell', emfV: 1.5, internalOhm: 0.5 },
  c30: { label: '3.0 V (two cells)', emfV: 3.0, internalOhm: 0.8 },
  c60: { label: '6.0 V battery', emfV: 6.0, internalOhm: 0.4 },
};

/** Where the ammeter is connected. */
export const AMMETER_MODE = {
  series: { label: 'In series', correct: true },
  parallel: { label: 'In parallel', correct: false },
};

/** Where the voltmeter is connected. */
export const VOLTMETER_MODE = {
  parallel: { label: 'In parallel', correct: true },
  series: { label: 'In series', correct: false },
};

/** Which way round the meter terminals are connected. */
export const POLARITY = {
  correct: { label: 'Correct (+ to +)', correct: true },
  reversed: { label: 'Reversed', correct: false },
};

/** How the rheostat is wired into the circuit. */
export const RHEOSTAT_MODE = {
  variable: { label: 'As a variable arm', correct: true },
  full: { label: 'Across the full track', correct: false },
};

/** Whether the key is open while the circuit is being assembled. */
export const KEY_STATE = {
  open: { label: 'Open while wiring', correct: true },
  closed: { label: 'Closed while wiring', correct: false },
};

/** Resistances of the real instruments, in ohm. Hidden from the student. */
export const AMMETER_OHM = 0.1;
export const VOLTMETER_OHM = 10000;

export const defaults = {
  load: 'r22',
  cell: 'c30',
  ammeterMode: 'series',
  voltmeterMode: 'parallel',
  polarity: 'correct',
  rheostatMode: 'variable',
  keyState: 'open',
  rheostatOhm: 5,
};

/** The rheostat resistance actually in circuit, in ohm. */
export function effectiveRheostatOhm(inputs) {
  // Wired across its whole track it contributes its full value and cannot vary.
  return inputs.rheostatMode === 'full' ? 50 : inputs.rheostatOhm;
}

/**
 * The current that actually flows, in ampere.
 *
 * This is where the wrong connections show their real consequence rather than
 * simply being flagged as wrong.
 */
export function circuitCurrentA(inputs) {
  const cell = CELLS[inputs.cell] || CELLS.c30;
  const load = LOADS[inputs.load] || LOADS.r22;
  const rh = effectiveRheostatOhm(inputs);

  // A voltmeter in series puts 10 kΩ in the path: the current all but vanishes.
  if (inputs.voltmeterMode === 'series') {
    return cell.emfV / (VOLTMETER_OHM + load.ohm + rh + cell.internalOhm);
  }
  // An ammeter in parallel with the load bypasses it through 0.1 Ω.
  if (inputs.ammeterMode === 'parallel') {
    const bypass = (load.ohm * AMMETER_OHM) / (load.ohm + AMMETER_OHM);
    return cell.emfV / (bypass + rh + cell.internalOhm);
  }
  return cell.emfV / (load.ohm + rh + AMMETER_OHM + cell.internalOhm);
}

/** The potential difference across the load, in volt. */
export function loadVoltageV(inputs) {
  const load = LOADS[inputs.load] || LOADS.r22;
  if (inputs.ammeterMode === 'parallel') {
    const bypass = (load.ohm * AMMETER_OHM) / (load.ohm + AMMETER_OHM);
    return circuitCurrentA(inputs) * bypass;
  }
  return circuitCurrentA(inputs) * load.ohm;
}

/** Is every connection right? */
export function isCorrect(inputs) {
  return (AMMETER_MODE[inputs.ammeterMode] || {}).correct === true
    && (VOLTMETER_MODE[inputs.voltmeterMode] || {}).correct === true
    && (POLARITY[inputs.polarity] || {}).correct === true
    && (RHEOSTAT_MODE[inputs.rheostatMode] || {}).correct === true;
}

/** Would the ammeter be damaged by this arrangement? */
export function ammeterAtRisk(inputs) {
  return inputs.ammeterMode === 'parallel' && circuitCurrentA(inputs) > 1.5;
}

export function validate(inputs) {
  const errors = [];
  const warnings = [];

  if (inputs.ammeterMode === 'parallel') {
    errors.push({
      field: 'ammeterMode',
      code: 'AMMETER_IN_PARALLEL',
      message: `The ammeter is across the load, which is very nearly a short circuit — about ${circuitCurrentA(inputs).toFixed(2)} A would flow.`,
      why: 'An ammeter is built with a very LOW resistance so that inserting it does not change the current it is measuring. Placed across the load, that low resistance carries almost all the current and bypasses the component entirely. The meter is not rated for this and would be damaged.',
      fix: 'Break the circuit and put the ammeter IN the path, in series with the load.',
    });
  }

  if (inputs.voltmeterMode === 'series') {
    errors.push({
      field: 'voltmeterMode',
      code: 'VOLTMETER_IN_SERIES',
      message: `The voltmeter is in the path, so only about ${(circuitCurrentA(inputs) * 1e6).toFixed(0)} µA flows and nothing works.`,
      why: 'A voltmeter is built with a very HIGH resistance so that it draws almost no current from the circuit it examines. Put in series, that high resistance chokes the current to nearly nothing, and almost the whole supply voltage appears across the meter instead of across the load.',
      fix: 'Connect the voltmeter ACROSS the load, in parallel with it.',
    });
  }

  if (inputs.polarity === 'reversed') {
    errors.push({
      field: 'polarity',
      code: 'REVERSED_POLARITY',
      message: 'The meter terminals are reversed, so the needle is driven backwards.',
      why: 'A moving-coil meter deflects in the direction set by the current through it. Connected the wrong way round the needle is forced back against its stop, where it can read nothing and can be bent.',
      fix: 'Connect the positive terminal of each meter to the terminal nearer the positive of the cell.',
    });
  }

  if (inputs.rheostatMode === 'full') {
    warnings.push({
      field: 'rheostatMode',
      code: 'RHEOSTAT_NOT_VARIABLE',
      message: 'The rheostat is connected across its whole track, so sliding the contact changes nothing.',
      why: 'A rheostat varies resistance only when the circuit uses the SLIDING contact together with one end terminal. Wired across the two end terminals it is simply a fixed resistor of its full value, and moving the slider has no effect at all.',
      fix: 'Connect one end terminal and the sliding contact, so that moving the slider changes the length of track in circuit.',
    });
  }

  if (inputs.keyState === 'closed') {
    warnings.push({
      field: 'keyState',
      code: 'KEY_CLOSED',
      message: 'The key is closed while the circuit is being assembled.',
      why: 'With the key closed every connection is live as soon as it is made, so a wrong connection passes current immediately — before anyone has had a chance to check the circuit against the diagram. This is how meters are damaged and cells are flattened.',
      fix: 'Keep the key open, complete and check all the connections, and close it only when taking a reading.',
    });
  }

  if (ammeterAtRisk(inputs)) {
    warnings.push({
      field: 'ammeterMode',
      code: 'AMMETER_DAMAGE',
      message: 'A current of this size through the ammeter would damage it.',
      why: 'The full-scale deflection of a laboratory ammeter is typically well under an ampere. Several amperes through the movement burns out the coil.',
      fix: 'Correct the connection before closing the key.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0,
    running: true,
    currentA: 0,
    voltageV: 0,
    needleBackwards: inputs.polarity === 'reversed',
    settled: false,
    finishedAt: null,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  if (s.finishedAt) return s;
  s.t += dt;

  // Nothing flows until the key is closed for the reading.
  const target = circuitCurrentA(inputs);
  s.currentA += (target - s.currentA) * Math.min(1, dt * 8);
  s.voltageV += (loadVoltageV(inputs) - s.voltageV) * Math.min(1, dt * 8);
  s.needleBackwards = inputs.polarity === 'reversed';

  if (!s.settled && s.t > 0.5) {
    s.settled = true;
    s.finishedAt = s.t;
  }
  return s;
}

/**
 * One reading from the assembled circuit. Refuses whenever the assembly has an
 * outright error: a circuit wired wrongly has no reading worth recording, and
 * pretending otherwise would teach the opposite of the lesson.
 */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!validate(inputs).ok) return null;
  if (!state || !state.settled) return null;

  const rng = makeRng(seed + trial * 73);
  const i = circuitCurrentA(inputs);
  const v = loadVoltageV(inputs);

  return {
    trial,
    load: (LOADS[inputs.load] || LOADS.r22).label,
    cell: (CELLS[inputs.cell] || CELLS.c30).label,
    rheostatOhm: sigFig(effectiveRheostatOhm(inputs), 3),
    currentA: sigFig(Math.max(0, toLeastCount(i + jitter(rng, 0.002), 0.002)), 3),
    voltageV: sigFig(Math.max(0, toLeastCount(v + jitter(rng, 0.02), 0.02)), 3),
    correct: isCorrect(inputs),
  };
}

/**
 * The assembled circuit should obey Ohm's law, so the readings are used to
 * recover the resistance of the load. That is the check that the circuit was
 * assembled correctly: a wrong circuit does not give the right resistance.
 */
export function derive(rows, inputs) {
  if (!rows || rows.length < 3) {
    return { ok: false, reason: 'Take at least three readings at different rheostat settings.' };
  }

  const settings = new Set(rows.map((r) => r.rheostatOhm));
  if (settings.size < 2) {
    return {
      ok: false,
      reason: 'Every reading was taken at the same rheostat setting. Vary the rheostat — if the current does not change when you move the slider, the rheostat is wired wrongly.',
    };
  }

  const usable = rows.filter((r) => r.currentA > 0);
  if (!usable.length) {
    return { ok: false, reason: 'No current flowed in any reading. Check the circuit against the diagram before closing the key.' };
  }

  // R = V/I for each row, then averaged.
  const rValues = usable.map((r) => r.voltageV / r.currentA);
  const R = rValues.reduce((a, b) => a + b, 0) / rValues.length;
  const load = LOADS[inputs.load] || LOADS.r22;
  const percentError = Math.abs((R - load.ohm) / load.ohm) * 100;

  const currents = usable.map((r) => r.currentA);
  const varied = Math.max(...currents) - Math.min(...currents) > 0.005;

  return {
    ok: true,
    n: rows.length,
    settingsTried: settings.size,
    load: load.label,
    resistance: sigFig(R, 3),
    accepted: load.ohm,
    percentError: sigFig(percentError, 2),
    currentRange: `${sigFig(Math.min(...currents), 3)} to ${sigFig(Math.max(...currents), 3)}`,
    rheostatWorks: varied,
    allCorrect: rows.every((r) => r.correct),
    cell: (CELLS[inputs.cell] || CELLS.c30).label,
    points: usable.map((r) => ({ x: r.currentA, y: r.voltageV })),
  };
}

export default {
  meta, defaults, init, step, measure, derive, validate,
  LOADS, CELLS, AMMETER_MODE, VOLTMETER_MODE, POLARITY, RHEOSTAT_MODE, KEY_STATE,
  AMMETER_OHM, VOLTMETER_OHM,
  effectiveRheostatOhm, circuitCurrentA, loadVoltageV, isCorrect, ammeterAtRisk,
};
