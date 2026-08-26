/**
 * MODEL: Identifying a diode, an LED, a resistor and a capacitor — XII-PHY-ACT-B1
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 1:
 * "To identify a diode, an LED, a resistor and a capacitor from a mixed
 *  collection of such items."
 *
 * Unit IX, Chapter 14: Semiconductor Electronics.
 *
 * This is an IDENTIFICATION activity, so the model works like the fault-finding
 * one in Section A rather than like a measurement bench: it holds a hidden
 * identity for each specimen in the tray and accepts a naming. What it must
 * never do is display the answer — the whole activity is the inference from
 * evidence to identity.
 *
 * The evidence is deliberately incomplete on its own. That is the point. A
 * student who looks only at the body of a component can be fooled: a black
 * cylinder with a band could be a diode, and a small blue disc could be either
 * a capacitor or a resistor in an unfamiliar package. It is the OHMMETER TEST
 * BOTH WAYS that separates the four, because each type has its own signature:
 *
 *   resistor   — the SAME finite reading whichever way round the probes go.
 *                A resistor has no polarity.
 *   diode      — a low reading one way and open circuit the other. That
 *                asymmetry IS the p-n junction, and nothing else in the tray
 *                shows it.
 *   LED        — the same asymmetry as a diode, but the forward reading is
 *                markedly higher, because the junction of a light-emitting
 *                diode needs about 1.8 V rather than 0.7 V to conduct. On many
 *                school meters an LED will not light on the ohms range at all,
 *                which is itself a useful clue and a common source of confusion.
 *   capacitor  — open circuit in the steady state BOTH ways, but the needle
 *                kicks first and then falls back as the capacitor charges from
 *                the meter's internal cell. A large electrolytic kicks
 *                visibly; a small ceramic barely moves, which is why a
 *                capacitor is so often mistaken for a broken component.
 *
 * So the model exposes three observations per specimen — appearance, forward
 * reading, reverse reading — and the student must combine them. Appearance
 * alone is never sufficient, and the model enforces that by including specimens
 * whose appearance is genuinely ambiguous.
 */
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B1',
  formula:
    'Identification by ohmmeter asymmetry: R_forward ≠ R_reverse for a junction; R_forward = R_reverse for a resistor; both open for a capacitor after it charges',
  unitSystem: 'Resistance in ohm; forward voltage in volt',
  assumptions: [
    'The ohmmeter drives a small current from its own internal cell, so the circuit under test is dead',
    'The meter can supply enough voltage to forward-bias a silicon junction (about 0.7 V) but may not light an LED',
    'Each specimen is a single undamaged component, not a network',
    'The capacitors are discharged before testing, so the first reading is the charging transient',
  ],
  validRange: 'Eight specimens covering four component types, tested on the ohms range in both directions',
  edgeCases: [
    'A capacitor and a broken component both read open circuit in the steady state — the initial kick tells them apart',
    'A diode and an LED both conduct one way only — the size of the forward reading tells them apart',
    'A small ceramic capacitor gives so brief a kick that it looks like an open circuit',
    'Reading a junction in one direction only cannot distinguish a diode from a resistor',
    'An electrolytic capacitor connected the wrong way round in a real circuit would be damaged, though the ohmmeter test is harmless',
  ],
  expectedBehaviour: [
    'A resistor reads the same both ways round',
    'A diode and an LED read low one way and open the other',
    'A capacitor kicks and then falls back to open circuit, both ways round',
    'Naming a specimen correctly completes it; a wrong naming is recorded with the evidence that contradicts it',
  ],
};

/**
 * The tray of specimens. `type` is the hidden answer. `look` is what the body
 * of the component shows, and is deliberately ambiguous for several of them.
 *
 * `forwardOhm` / `reverseOhm` are what the meter settles on; `kick` is whether
 * the needle visibly deflects first. `null` means an open-circuit indication.
 */
export const SPECIMENS = {
  s1: {
    label: 'Specimen 1',
    type: 'resistor',
    look: 'Small beige cylinder with four coloured bands',
    forwardOhm: 470, reverseOhm: 470, kick: false, forwardV: null,
  },
  s2: {
    label: 'Specimen 2',
    type: 'diode',
    look: 'Black cylinder with a single grey band at one end',
    forwardOhm: 620, reverseOhm: null, kick: false, forwardV: 0.7,
  },
  s3: {
    label: 'Specimen 3',
    type: 'led',
    look: 'Clear red dome, two legs of unequal length',
    forwardOhm: 1850, reverseOhm: null, kick: false, forwardV: 1.8,
  },
  s4: {
    label: 'Specimen 4',
    type: 'capacitor',
    look: 'Small blue disc marked 104',
    forwardOhm: null, reverseOhm: null, kick: false, forwardV: null,
  },
  s5: {
    label: 'Specimen 5',
    type: 'capacitor',
    look: 'Black barrel with a stripe and a long leg, marked 100 µF',
    forwardOhm: null, reverseOhm: null, kick: true, forwardV: null,
  },
  s6: {
    label: 'Specimen 6',
    type: 'resistor',
    look: 'Small blue cylinder, bands hard to read',
    forwardOhm: 10000, reverseOhm: 10000, kick: false, forwardV: null,
  },
  s7: {
    label: 'Specimen 7',
    type: 'diode',
    look: 'Small glass bead with a black band',
    forwardOhm: 540, reverseOhm: null, kick: false, forwardV: 0.6,
  },
  s8: {
    label: 'Specimen 8',
    type: 'led',
    look: 'Clear green dome, two legs of unequal length',
    forwardOhm: 2100, reverseOhm: null, kick: false, forwardV: 2.0,
  },
};

/** The four names the student may give a specimen. */
export const IDENTITIES = {
  resistor: { label: 'Resistor' },
  diode: { label: 'Diode' },
  led: { label: 'LED' },
  capacitor: { label: 'Capacitor' },
};

/** Which observation the student is making. */
export const TESTS = {
  look: { label: 'Look at it' },
  forward: { label: 'Ohms, one way' },
  reverse: { label: 'Ohms, reversed' },
};

export const defaults = {
  specimen: 's1',
  test: 'forward',
  identification: 'resistor',
};

/** The specimen currently in the clips. */
export function activeSpecimen(inputs) {
  return SPECIMENS[inputs.specimen] || SPECIMENS.s1;
}

/**
 * What the meter shows for the current specimen and test direction.
 * `ohm: null` is an open-circuit indication.
 */
export function observation(inputs) {
  const sp = activeSpecimen(inputs);
  if (inputs.test === 'look') {
    return { kind: 'look', text: sp.look, ohm: undefined, kick: false };
  }
  const ohm = inputs.test === 'reverse' ? sp.reverseOhm : sp.forwardOhm;
  // A capacitor kicks whichever way round it is connected.
  const kick = sp.type === 'capacitor' && sp.kick;
  return { kind: 'ohms', ohm, kick, text: null };
}

/** Has the student actually gathered enough evidence to name this specimen? */
export function evidenceFor(inputs, tested = {}) {
  const seen = tested[inputs.specimen] || {};
  return { forward: !!seen.forward, reverse: !!seen.reverse, look: !!seen.look };
}

export function identificationCorrect(inputs) {
  return activeSpecimen(inputs).type === inputs.identification;
}

/**
 * The evidence that settles this specimen, phrased as the reason rather than
 * the answer. Used when a naming is wrong, so the feedback teaches the
 * inference instead of just correcting the label.
 */
export function evidenceNote(inputs) {
  const sp = activeSpecimen(inputs);
  switch (sp.type) {
    case 'resistor':
      return `It reads ${sp.forwardOhm} Ω the same way round and ${sp.reverseOhm} Ω reversed. Equal readings both ways means no junction and no polarity.`;
    case 'diode':
      return `It reads about ${sp.forwardOhm} Ω one way and open circuit the other. That asymmetry is a p-n junction, and the low forward reading points to an ordinary silicon diode rather than an LED.`;
    case 'led':
      return `It conducts one way only, but the forward reading is about ${sp.forwardOhm} Ω — far higher than an ordinary diode, because a light-emitting junction needs roughly ${sp.forwardV} V to conduct.`;
    case 'capacitor':
      return sp.kick
        ? 'It reads open circuit in the steady state both ways round, but the needle kicks first and falls back. That charging transient is what distinguishes a capacitor from a broken component.'
        : 'It reads open circuit both ways round, with no measurable steady current. A small ceramic capacitor charges so quickly that the kick is easy to miss — the marking 104 means 100 nF.';
    default:
      return '';
  }
}

export function validate(inputs) {
  const errors = [];
  const warnings = [];
  const sp = activeSpecimen(inputs);

  if (!SPECIMENS[inputs.specimen]) {
    errors.push({
      field: 'specimen',
      code: 'NO_SPECIMEN',
      message: 'No specimen is in the clips.',
      why: 'Nothing can be identified until a component is connected to the meter.',
      fix: 'Choose a specimen from the tray.',
    });
  }

  if (inputs.test === 'look') {
    warnings.push({
      field: 'test',
      code: 'APPEARANCE_ONLY',
      message: 'Appearance alone does not identify a component.',
      why: 'A black cylinder with a band could be a diode, and an unfamiliar package could hide a resistor or a capacitor. Several specimens in this tray are deliberately ambiguous to look at.',
      fix: 'Test it on the ohms range both ways round before naming it.',
    });
  }

  // Naming a junction device from one direction only is the classic error.
  if (inputs.test === 'forward' && (sp.type === 'diode' || sp.type === 'led')
    && (inputs.identification === 'diode' || inputs.identification === 'led')) {
    warnings.push({
      field: 'test',
      code: 'ONE_DIRECTION_ONLY',
      message: 'A single forward reading cannot prove there is a junction.',
      why: 'A resistor also gives a finite reading. What identifies a junction is that the reading DISAPPEARS when the probes are reversed.',
      fix: 'Take the reverse reading as well, then name it.',
    });
  }

  if (sp.type === 'capacitor' && !sp.kick && inputs.test !== 'look') {
    warnings.push({
      field: 'specimen',
      code: 'FAINT_TRANSIENT',
      message: 'This specimen reads open circuit with barely any deflection.',
      why: 'A small capacitor charges almost instantly, so the kick is very brief. An open circuit both ways with no other evidence is ambiguous between a small capacitor and a damaged component.',
      fix: 'Look at the body marking as well: a number such as 104 is a capacitance code.',
    });
  }

  if (sp.type === 'led' && inputs.test === 'forward') {
    warnings.push({
      field: 'specimen',
      code: 'LED_MAY_NOT_LIGHT',
      message: 'The LED probably will not light on the ohms range.',
      why: 'The meter supplies only a small current, often too little to make the junction glow visibly, so a dark LED does not mean a faulty one.',
      fix: 'Judge it by the size of the forward reading, not by whether it lights.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0,
    settled: false,
    finishedAt: null,
    // The transient the meter shows while a capacitor charges.
    needle: 0,
    specimen: inputs.specimen,
    test: inputs.test,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;

  const sp = activeSpecimen(inputs);
  const isCap = sp.type === 'capacitor';

  // A capacitor's needle kicks and then decays back; everything else is steady.
  if (isCap && inputs.test !== 'look') {
    const tau = sp.kick ? 0.45 : 0.05;
    s.needle = Math.exp(-s.t / tau);
  } else {
    s.needle = 0;
  }

  // Settle quickly: this is an inspection, not a measurement that takes time.
  if (s.t >= 1.2 && !s.settled) {
    s.settled = true;
    s.finishedAt = s.t;
  }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!validate(inputs).ok) return null;
  if (!state || !state.settled) return null;

  const sp = activeSpecimen(inputs);
  const obs = observation(inputs);
  const correct = identificationCorrect(inputs);

  const fmt = (v) => (v === null ? 'open' : `${sigFig(v, 3)} Ω`);

  return {
    trial,
    specimen: sp.label,
    forward: fmt(sp.forwardOhm),
    reverse: fmt(sp.reverseOhm),
    kick: sp.type === 'capacitor' && sp.kick ? 'yes' : 'no',
    identification: (IDENTITIES[inputs.identification] || {}).label || '—',
    correct,
    // The true identity is recorded only once it has been named correctly.
    actual: correct ? (IDENTITIES[sp.type] || {}).label : '—',
    _type: sp.type,
    _observed: obs.kind,
  };
}

export function derive(rows, inputs) {
  if (!rows || rows.length < 4) {
    return {
      ok: false,
      reason: 'Identify at least four specimens. The activity asks for a diode, an LED, a resistor and a capacitor, so fewer than four cannot cover them.',
    };
  }

  const specimens = new Set(rows.map((r) => r.specimen));
  if (specimens.size < 4) {
    return {
      ok: false,
      reason: `Only ${specimens.size} different specimen${specimens.size === 1 ? '' : 's'} examined. Work through at least four different ones from the tray.`,
    };
  }

  const correct = rows.filter((r) => r.correct);
  const typesFound = [...new Set(correct.map((r) => r._type))];
  const allFour = ['resistor', 'diode', 'led', 'capacitor'].every((t) => typesFound.includes(t));

  // Which of the four the student has still not correctly named.
  const missing = ['resistor', 'diode', 'led', 'capacitor']
    .filter((t) => !typesFound.includes(t))
    .map((t) => IDENTITIES[t].label);

  // Did they ever confuse the two junction devices? That is the interesting error.
  const junctionConfusion = rows.some(
    (r) => !r.correct
      && (r._type === 'diode' || r._type === 'led')
      && (r.identification === 'Diode' || r.identification === 'LED'),
  );

  return {
    ok: true,
    n: rows.length,
    specimensExamined: specimens.size,
    correctCount: correct.length,
    accuracyPct: sigFig((correct.length / rows.length) * 100, 3),
    typesIdentified: typesFound.map((t) => IDENTITIES[t].label).join(', ') || 'none',
    typeCount: typesFound.length,
    allFourFound: allFour,
    missingTypes: missing.join(', '),
    junctionConfusion,
    points: [],
  };
}

export default {
  meta,
  SPECIMENS,
  IDENTITIES,
  TESTS,
  defaults,
  activeSpecimen,
  observation,
  evidenceFor,
  identificationCorrect,
  evidenceNote,
  validate,
  init,
  step,
  measure,
  derive,
};
