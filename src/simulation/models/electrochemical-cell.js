/**
 * MODEL: Cell potential vs concentration (Nernst equation) — XII-CHE-D01
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section D, Experiment 1.
 * Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s); E = E° − (0.0591/n)·log([Zn²⁺]/[Cu²⁺]) at 298 K.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-D01',
  formula: 'E = E° − (2.303RT/nF)·log([oxidised]/[reduced]); at 298K, (2.303RT/F)=0.0591',
  unitSystem: 'Volt; concentration in mol/L',
  assumptions: ['The salt bridge maintains electrical neutrality without net chemical effect', 'Electrode reactions are reversible and at equilibrium at the moment of reading', 'Activity ≈ concentration at these dilutions'],
  validRange: 'Concentration 0.001-1 M',
  edgeCases: ['Without a salt bridge no steady current path exists and the meter reads erratically or zero', 'Using the same metal for both electrodes gives zero standard potential'],
  expectedBehaviour: ['E falls by 0.0295 V for each tenfold rise in [Zn²⁺]/[Cu²⁺] (n=2)', 'The E vs log(ratio) graph is a straight line whose intercept is E°'],
};

/**
 * The electrodes, and everything the bench needs to DRAW the half-cell the
 * student chose.
 *
 * The renderer used to hold all of this itself, hardcoded to zinc and copper:
 * the beakers were labelled ZnSO₄ and CuSO₄, and the electrodes "Zinc
 * (anode, −)" and "Copper (cathode, +)", whichever metals were actually
 * selected. A student who set up an iron/silver cell watched a correctly
 * calculated 1.24 V appear above a pair of beakers labelled with two salts
 * that were not in them.
 *
 * Colour is not decoration here either. Copper(II) sulphate solution is blue
 * and iron(II) sulphate pale green, and those colours are how a chemist knows
 * at a glance what is in the beaker; zinc sulphate and silver nitrate are
 * colourless. They belong with the species, not with the drawing.
 */
export const ELECTRODES = {
  zn: { label: 'Zinc', symbol: 'Zn', ion: 'Zn²⁺', salt: 'ZnSO₄', ePotential: -0.76,
    solution: null, metal: '#b7bcc4' },
  fe: { label: 'Iron', symbol: 'Fe', ion: 'Fe²⁺', salt: 'FeSO₄', ePotential: -0.44,
    solution: '#cfe4d2', metal: '#8f939a' },
  cu: { label: 'Copper', symbol: 'Cu', ion: 'Cu²⁺', salt: 'CuSO₄', ePotential: 0.34,
    solution: '#7fb6e6', metal: '#c98b4a' },
  ag: { label: 'Silver', symbol: 'Ag', ion: 'Ag⁺', salt: 'AgNO₃', ePotential: 0.80,
    solution: null, metal: '#d8dadd' },
};

/** The colour a solution of this metal's salt actually is. */
export function solutionColour(electrode) {
  // A colourless solution is still visible as water in glass, so it is drawn
  // as the faintest tint rather than as nothing at all.
  return electrode?.solution || '#e8eef2';
}
export const N_ELECTRONS = 2; // for the standard Zn/Cu couple; used as the default n

export const defaults = { cathodeConc: 1, anodeConc: 1, anode: 'zn', cathode: 'cu', saltBridge: true, tempC: 25 };

export function anodeOf(inputs) { return ELECTRODES[inputs.anode] || ELECTRODES.zn; }
export function cathodeOf(inputs) { return ELECTRODES[inputs.cathode] || ELECTRODES.cu; }
export function standardEMF(inputs) { return cathodeOf(inputs).ePotential - anodeOf(inputs).ePotential; }

export function emfV(inputs) {
  if (!inputs.saltBridge) return null;
  const T = inputs.tempC + 273.15;
  const coeff = (2.303 * 8.314 * T) / (96485 * N_ELECTRONS);
  const ratio = inputs.anodeConc / inputs.cathodeConc;
  return standardEMF(inputs) - coeff * Math.log10(ratio);
}

export function validate(inputs) {
  const errors = [];
  if (!inputs.saltBridge) errors.push({ field: 'saltBridge', code: 'NO_SALT_BRIDGE', message: 'Without a salt bridge the circuit is not complete.', why: 'The salt bridge carries ionic current between the two half-cells, maintaining electrical neutrality. Without it, charge builds up at each electrode and the meter reads zero or fluctuates erratically.', fix: 'Connect the salt bridge between the two half-cells.' });
  if (inputs.anode === inputs.cathode) errors.push({ field: 'cathode', code: 'SAME_METAL', message: 'Both electrodes are the same metal.', why: 'A cell needs two different half-reactions to produce a net potential; identical electrodes give E° = 0.' });
  return { ok: errors.length === 0, errors, warnings: [] };
}
export function init() { return { t: 0, emf: 0, charge: 0, migration: 0 }; }

/**
 * The cell on load. The voltmeter does not snap to the Nernst value: the
 * electrode reaches its equilibrium potential over a second or two, and
 * without the salt bridge charge separation builds up and the reading
 * collapses to nothing — which is the point of including the bridge.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  /* Hand the renderer the two half-cells it is drawing. It cannot import this
     module, so anything it needs to name or colour has to travel on state —
     and if it does not, it ends up hardcoded and silently wrong the moment a
     student changes a metal. */
  const a = anodeOf(inputs);
  const c = cathodeOf(inputs);
  s.anode = { label: a.label, symbol: a.symbol, ion: a.ion, salt: a.salt, metal: a.metal, solution: solutionColour(a) };
  s.cathode = { label: c.label, symbol: c.symbol, ion: c.ion, salt: c.salt, metal: c.metal, solution: solutionColour(c) };
  const target = emfV(inputs);
  if (target === null) {
    // No salt bridge: the circuit polarises and the reading dies away.
    s.emf = s.emf * Math.max(0, 1 - dt * 2.2);
    s.migration = 0;
    return s;
  }
  s.emf += (target - s.emf) * Math.min(1, dt * 2.4);
  s.charge += Math.abs(s.emf) * dt;                    // ions moved so far
  s.migration = (s.migration + dt * (0.25 + Math.abs(s.emf) * 0.5)) % 1;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const e = emfV(inputs);
  if (e === null || inputs.anode === inputs.cathode) return null;
  const rng = makeRng(seed + trial * 283);
  const ratio = inputs.anodeConc / inputs.cathodeConc;
  const reading = Number((e + jitter(rng, 0.004)).toFixed(4));
  return { trial, anodeConc: inputs.anodeConc, cathodeConc: inputs.cathodeConc, ratio: sigFig(ratio, 4), logRatio: Number(Math.log10(ratio).toFixed(4)), emf: reading, tempC: inputs.tempC };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.logRatio), y: Number(r.emf) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the cell potential at at least four different concentration ratios.' };
  const fit = linearFit(pts);
  if (!fit) return { ok: false, reason: 'Vary the concentration ratio between readings.' };
  const T = inputs.tempC + 273.15;
  const coeff = (2.303 * 8.314 * T) / 96485;
  const nFromSlope = -coeff / fit.slope;
  /*
   * The panel states what the slope SHOULD be, how many electrons that
   * implies, and the accepted E°. None of the three was returned, so it read
   * "Slope = -0.0296 V per decade (expected undefined)" and "n = 2.00
   * (expected undefined) · accepted E° = undefined V" — the three numbers a
   * student checks their work against.
   *
   * The Nernst slope is 2.303RT/nF per decade, and it is NEGATIVE here
   * because the x-axis is log([Zn²⁺]/[Cu²⁺]): raising the anode ion
   * concentration lowers the cell potential.
   */
  const expectedSlope = -coeff / N_ELECTRONS;
  return {
    ok: true,
    standardPotential: sigFig(fit.intercept, 4),
    slope: sigFig(fit.slope, 4),
    expectedSlope: sigFig(expectedSlope, 4),
    nFromSlope: sigFig(nFromSlope, 3),
    electrons: N_ELECTRONS,
    acceptedE0: sigFig(standardEMF(inputs), 4),
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { solutionColour, meta, defaults, ELECTRODES, N_ELECTRONS, init, step, measure, derive, validate, anodeOf, cathodeOf, standardEMF, emfV };
