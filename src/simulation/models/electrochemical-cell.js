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

export const ELECTRODES = { zn: { label: 'Zinc', ePotential: -0.76 }, fe: { label: 'Iron', ePotential: -0.44 }, cu: { label: 'Copper', ePotential: 0.34 }, ag: { label: 'Silver', ePotential: 0.80 } };
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
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const e = emfV(inputs);
  if (e === null || inputs.anode === inputs.cathode) return null;
  const rng = makeRng(seed + trial * 283);
  const ratio = inputs.anodeConc / inputs.cathodeConc;
  const reading = Number((e + jitter(rng, 0.004)).toFixed(4));
  return { anodeConc: inputs.anodeConc, cathodeConc: inputs.cathodeConc, ratio: sigFig(ratio, 4), logRatio: Number(Math.log10(ratio).toFixed(4)), emf: reading, tempC: inputs.tempC };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.logRatio), y: Number(r.emf) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the cell potential at at least four different concentration ratios.' };
  const fit = linearFit(pts);
  if (!fit) return { ok: false, reason: 'Vary the concentration ratio between readings.' };
  const T = inputs.tempC + 273.15;
  const coeff = (2.303 * 8.314 * T) / 96485;
  const nFromSlope = -coeff / fit.slope;
  return { ok: true, standardPotential: sigFig(fit.intercept, 4), slope: sigFig(fit.slope, 4), nFromSlope: sigFig(nFromSlope, 3), r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts };
}

export default { meta, defaults, ELECTRODES, N_ELECTRONS, init, step, measure, derive, validate, anodeOf, cathodeOf, standardEMF, emfV };
