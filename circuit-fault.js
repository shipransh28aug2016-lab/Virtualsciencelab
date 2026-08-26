/**
 * MODEL: Drawing and correcting a given open circuit — XII-PHY-ACT-A6
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 6:
 * "To draw the diagram of a given open circuit comprising at least a battery,
 *  resistor/rheostat, key, ammeter and voltmeter. Mark the components that are
 *  not connected in proper order and correct the circuit and also the circuit
 *  diagram."
 *
 * Unit III, Chapter 3: Current Electricity — circuit diagrams and the correct
 * placement of measuring instruments.
 *
 * This is the only activity in Section A that is DIAGNOSTIC. The student is not
 * asked to build a circuit or to measure anything; they are handed a circuit
 * that is already wrong and asked to say WHAT is wrong with it and to put it
 * right. So the model works the other way round from every other model in this
 * project: instead of taking settings and producing a reading, it holds a
 * hidden fault and accepts a diagnosis, then reports whether the diagnosis was
 * correct.
 *
 * The faults are the ones the syllabus means by "not connected in proper
 * order", and each has a distinct, observable symptom. That matters: a student
 * must diagnose from the SYMPTOM, not by guessing, so no two faults present the
 * same way.
 *
 *   ammeterParallel  — ammeter across the resistor: it reads a large current
 *                      while the voltmeter reads nearly nothing
 *   voltmeterSeries  — voltmeter in the path: no current flows at all, yet the
 *                      voltmeter reads almost the full supply
 *   cellReversed     — both needles driven backwards against their stops
 *   keyShorted       — the circuit is permanently live; the key does nothing
 *   rheostatFull     — everything reads sensibly, but moving the slider has no
 *                      effect whatever
 *   openLead         — a broken connection: both meters read zero
 */
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A6',
  formula: 'Diagnosis by symptom: I = V/R_total, with the fault altering R_total or the sense of the current',
  unitSystem: 'Volt, ampere, ohm',
  assumptions: [
    'Exactly one fault is present in the circuit at any time',
    'The ammeter has a low resistance and the voltmeter a high one',
    'The cell and the components themselves are undamaged',
    'Connecting wire has negligible resistance unless it is the broken lead',
  ],
  validRange: 'Six standard faults on a cell, rheostat, key, ammeter and voltmeter circuit',
  edgeCases: [
    'A broken lead and a correct circuit with the key open both read zero — the key tells them apart',
    'A rheostat wired across its full track gives sensible readings that simply never change',
    'A reversed cell gives readings of the right size in the wrong direction',
    'An ammeter in parallel and a voltmeter in series are opposite faults with opposite symptoms',
  ],
  expectedBehaviour: [
    'Every fault produces its own distinct symptom on the two meters',
    'Naming the fault correctly is what completes the activity, not adjusting anything',
    'Correcting the identified fault restores sensible readings',
    'A wrong diagnosis is recorded as wrong, with the symptom explained',
  ],
};

/**
 * The faults that can be planted. `symptom` is what the meters do, which is all
 * the student may use to diagnose. `diagram` is the correction to be marked on
 * the circuit diagram, which the activity asks for explicitly.
 */
export const FAULTS = {
  ammeterParallel: {
    label: 'Ammeter across the resistor',
    symptom: 'The ammeter reads a large current while the voltmeter reads almost nothing.',
    diagram: 'Redraw the ammeter in the main path, in series with the resistor.',
    correction: 'ammeterSeries',
  },
  voltmeterSeries: {
    label: 'Voltmeter in the main path',
    symptom: 'No current flows at all, yet the voltmeter reads almost the whole supply voltage.',
    diagram: 'Redraw the voltmeter across the resistor, in parallel with it.',
    correction: 'voltmeterParallel',
  },
  cellReversed: {
    label: 'Cell connected the wrong way round',
    symptom: 'Both needles are driven backwards against their stops.',
    diagram: 'Reverse the cell symbol so its long bar faces the positive terminal of the meters.',
    correction: 'cellCorrect',
  },
  keyShorted: {
    label: 'Key bridged by a wire',
    symptom: 'The circuit is permanently live: opening the key changes nothing.',
    diagram: 'Remove the wire bridging the key so that it can break the circuit.',
    correction: 'keyWorks',
  },
  rheostatFull: {
    label: 'Rheostat across its full track',
    symptom: 'Both meters read sensibly, but moving the slider has no effect whatever.',
    diagram: 'Redraw the rheostat using one end terminal and the sliding contact.',
    correction: 'rheostatVariable',
  },
  openLead: {
    label: 'A broken connecting lead',
    symptom: 'Both meters read exactly zero with the key closed.',
    diagram: 'Mark the gap in the circuit and replace the broken lead.',
    correction: 'leadReplaced',
  },
};

/** The diagnoses the student can offer. Same keys, plus "no fault". */
export const DIAGNOSES = {
  ammeterParallel: { label: 'Ammeter in parallel' },
  voltmeterSeries: { label: 'Voltmeter in series' },
  cellReversed: { label: 'Cell reversed' },
  keyShorted: { label: 'Key shorted out' },
  rheostatFull: { label: 'Rheostat across full track' },
  openLead: { label: 'Broken lead' },
  none: { label: 'No fault found' },
};

/** Which circuit is presented. Each board carries a different planted fault. */
export const BOARDS = {
  board1: { label: 'Board 1', fault: 'ammeterParallel' },
  board2: { label: 'Board 2', fault: 'voltmeterSeries' },
  board3: { label: 'Board 3', fault: 'cellReversed' },
  board4: { label: 'Board 4', fault: 'keyShorted' },
  board5: { label: 'Board 5', fault: 'rheostatFull' },
  board6: { label: 'Board 6', fault: 'openLead' },
};

export const KEY_POSITION = {
  closed: { label: 'Key closed' },
  open: { label: 'Key open' },
};

export const SUPPLY_V = 3.0;
export const LOAD_OHM = 22;
export const AMMETER_OHM = 0.1;
export const VOLTMETER_OHM = 10000;

export const defaults = {
  board: 'board1',
  diagnosis: 'none',
  keyPosition: 'closed',
  sliderPct: 40,
  corrected: false,
};

/** The fault actually present on the chosen board, or null once corrected. */
export function activeFault(inputs) {
  if (inputs.corrected) return null;
  return (BOARDS[inputs.board] || BOARDS.board1).fault;
}

/**
 * What the two meters read, given the planted fault.
 * Returned as an object so the renderer and the notebook see the same thing.
 */
export function meterReadings(inputs) {
  const fault = activeFault(inputs);
  const rh = (inputs.sliderPct / 100) * 20;
  const keyClosed = inputs.keyPosition === 'closed' || fault === 'keyShorted';

  // A broken lead means no path at all, whatever the key does.
  if (fault === 'openLead') return { currentA: 0, voltageV: 0, backwards: false, live: false };
  if (!keyClosed) return { currentA: 0, voltageV: 0, backwards: false, live: false };

  if (fault === 'voltmeterSeries') {
    const i = SUPPLY_V / (VOLTMETER_OHM + LOAD_OHM + rh);
    // Almost the whole supply appears across the voltmeter itself.
    return { currentA: i, voltageV: i * VOLTMETER_OHM, backwards: false, live: true };
  }

  if (fault === 'ammeterParallel') {
    const bypass = (LOAD_OHM * AMMETER_OHM) / (LOAD_OHM + AMMETER_OHM);
    const i = SUPPLY_V / (bypass + rh);
    return { currentA: i, voltageV: i * bypass, backwards: false, live: true };
  }

  // rheostatFull pins the rheostat at its full value, so nothing varies.
  const rEff = fault === 'rheostatFull' ? 20 : rh;
  const i = SUPPLY_V / (LOAD_OHM + rEff + AMMETER_OHM);
  return {
    currentA: i,
    voltageV: i * LOAD_OHM,
    backwards: fault === 'cellReversed',
    live: true,
  };
}

/** Is the student's diagnosis the right one? */
export function diagnosisCorrect(inputs) {
  const fault = activeFault(inputs);
  if (fault === null) return inputs.diagnosis === 'none';
  return inputs.diagnosis === fault;
}

export function validate(inputs) {
  const errors = [];
  const warnings = [];

  /* Fires only once the student has CHANGED something — moved the slider off
     its opening position or corrected the board — so that the bench does not
     open with a warning already showing. `measure` refuses without a diagnosis
     regardless, so nothing is lost by staying quiet at the start. */
  if (inputs.diagnosis === 'none' && activeFault(inputs) !== null
      && (inputs.sliderPct !== defaults.sliderPct || inputs.corrected)) {
    warnings.push({
      field: 'diagnosis',
      code: 'NO_DIAGNOSIS_YET',
      message: 'No fault has been named yet.',
      why: 'This activity is not about adjusting the circuit until it works. It asks you to say WHICH component is connected wrongly, and that has to be read off the behaviour of the two meters.',
      fix: 'Close the key, watch both meters, move the slider, and then choose the fault that matches what you see.',
    });
  }

  if (inputs.keyPosition === 'open' && activeFault(inputs) !== 'keyShorted' && activeFault(inputs) !== null) {
    warnings.push({
      field: 'keyPosition',
      code: 'KEY_OPEN',
      message: 'The key is open, so both meters read zero whatever the fault is.',
      why: 'An open key breaks the circuit deliberately, which looks exactly like a broken lead. With no current flowing the meters cannot tell you anything, so no fault can be diagnosed from this state.',
      fix: 'Close the key and observe the meters.',
    });
  }

  if (inputs.corrected && !diagnosisCorrect({ ...inputs, corrected: false })) {
    warnings.push({
      field: 'corrected',
      code: 'CORRECTED_WRONG_FAULT',
      message: 'The circuit has been corrected, but the fault named was not the one that was there.',
      why: 'Repairing a circuit without identifying the fault teaches nothing. The activity is examined on the diagnosis and on the corrected diagram, not on whether the meters end up reading sensibly.',
      fix: 'Undo the correction, name the fault from the symptom, and only then correct it.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  const r = meterReadings(inputs);
  return {
    t: 0,
    running: true,
    currentA: 0,
    voltageV: 0,
    backwards: r.backwards,
    live: r.live,
    settled: false,
    finishedAt: null,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  if (s.finishedAt) return s;
  s.t += dt;

  const r = meterReadings(inputs);
  s.currentA += (r.currentA - s.currentA) * Math.min(1, dt * 8);
  s.voltageV += (r.voltageV - s.voltageV) * Math.min(1, dt * 8);
  s.backwards = r.backwards;
  s.live = r.live;

  if (!s.settled && s.t > 0.5) {
    s.settled = true;
    s.finishedAt = s.t;
  }
  return s;
}

/**
 * One diagnosis. Refuses until a fault has actually been named — the activity
 * records a judgement, and "I have not decided" is not one.
 */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (!validate(inputs).ok) return null;
  if (!state || !state.settled) return null;
  if (inputs.diagnosis === 'none') return null;

  const fault = activeFault(inputs);
  const r = meterReadings(inputs);
  const correct = diagnosisCorrect(inputs);

  return {
    trial,
    board: (BOARDS[inputs.board] || BOARDS.board1).label,
    ammeterReading: r.backwards ? 'backwards' : sigFig(r.currentA, 3),
    voltmeterReading: r.backwards ? 'backwards' : sigFig(r.voltageV, 3),
    diagnosis: (DIAGNOSES[inputs.diagnosis] || DIAGNOSES.none).label,
    correct,
    // The actual fault is recorded only once it has been correctly named.
    actualFault: correct ? (FAULTS[fault] || {}).label || 'none' : '—',
  };
}

/**
 * The result is a diagnostic record: how many boards were examined and how many
 * faults were correctly identified. Refuses until several boards have been
 * tried, because one correct guess proves nothing.
 */
export function derive(rows, inputs) {
  if (!rows || rows.length < 3) {
    return { ok: false, reason: 'Diagnose at least three boards. One correct answer could be a guess.' };
  }

  const boards = new Set(rows.map((r) => r.board));
  if (boards.size < 3) {
    return {
      ok: false,
      reason: `Only ${boards.size} different board${boards.size === 1 ? '' : 's'} examined. Each board carries a different fault — work through at least three of them.`,
    };
  }

  const correct = rows.filter((r) => r.correct);
  const identified = [...new Set(correct.map((r) => r.actualFault))].filter((f) => f !== '—');

  return {
    ok: true,
    n: rows.length,
    boardsExamined: boards.size,
    correctCount: correct.length,
    accuracyPct: sigFig((correct.length / rows.length) * 100, 3),
    faultsIdentified: identified.join(', ') || 'none',
    faultCount: identified.length,
    allCorrect: correct.length === rows.length,
    // The correction to be marked on the diagram, for the fault last found.
    diagramNote: correct.length
      ? (Object.values(FAULTS).find((f) => f.label === correct[correct.length - 1].actualFault) || {}).diagram || ''
      : '',
    points: [],
  };
}

export default {
  meta, defaults, init, step, measure, derive, validate,
  FAULTS, DIAGNOSES, BOARDS, KEY_POSITION, SUPPLY_V, LOAD_OHM,
  activeFault, meterReadings, diagnosisCorrect,
};
