/**
 * MODEL: Preparation of a lyophilic and a lyophobic sol — XII-CHE-A01
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section A, Experiment 1.
 * Hardy-Schulze rule: coagulating power of the ion carrying the charge
 * OPPOSITE to the sol's own rises very steeply with that ion's charge.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-A01',
  formula: 'Coagulating power ∝ 1/(coagulation value); Hardy-Schulze: power rises steeply with the charge of the opposite-signed ion',
  unitSystem: 'Millimole per litre',
  assumptions: ['The sol is freshly prepared and free of excess stabilising electrolyte', 'Only the ion of charge opposite to the sol\'s own does the coagulating', 'The Tyndall effect is checked in a darkened setting'],
  validRange: 'Electrolyte concentration 0-120 mM',
  edgeCases: ['A lyophilic sol (starch, gum, albumin) does not coagulate at these concentrations at all — it needs far more electrolyte'],
  expectedBehaviour: ['Both sols show a Tyndall cone (proving colloidal size), but only the lyophobic one coagulates readily', 'Coagulation value falls sharply as the coagulating ion\'s charge rises'],
};

export const SOLS = {
  ferric: { label: 'Fe(OH)₃ sol (lyophobic, positive)', type: 'lyophobic', charge: '+' },
  arsenous: { label: 'As₂S₃ sol (lyophobic, negative)', type: 'lyophobic', charge: '-' },
  aluminium: { label: 'Al(OH)₃ sol (lyophobic, positive)', type: 'lyophobic', charge: '+' },
  starch: { label: 'Starch sol (lyophilic)', type: 'lyophilic', charge: '0' },
  gum: { label: 'Gum sol (lyophilic)', type: 'lyophilic', charge: '0' },
  albumin: { label: 'Egg albumin sol (lyophilic)', type: 'lyophilic', charge: '0' },
};
export const ELECTROLYTES = {
  nacl: { label: 'NaCl', ionCharge: 1, sign: '-', coagValueNeg: 51 },
  bacl2: { label: 'BaCl₂', ionCharge: 2, sign: '-', coagValueNeg: 0.69 },
  alcl3: { label: 'AlCl₃', ionCharge: 3, sign: '-', coagValueNeg: 0.093 },
  kcl: { label: 'KCl', ionCharge: 1, sign: '+', coagValuePos: 103 },
  k2so4: { label: 'K₂SO₄', ionCharge: 2, sign: '+', coagValuePos: 0.215 },
  k3fecn6: { label: 'K₃[Fe(CN)₆]', ionCharge: 3, sign: '+', coagValuePos: 0.096 },
};

export const defaults = { sol: 'ferric', electrolyte: 'k3fecn6', test: 'tyndall', concentrationMm: 1 };

export function solOf(inputs) { return SOLS[inputs.sol] || SOLS.ferric; }
export function electrolyteOf(inputs) { return ELECTROLYTES[inputs.electrolyte] || ELECTROLYTES.k3fecn6; }

/** The coagulation value for this sol+electrolyte pair, or null if the electrolyte's active ion has the same sign as the sol (so it does not coagulate). */
export function coagulationValueMm(inputs) {
  const s = solOf(inputs);
  const e = electrolyteOf(inputs);
  if (s.type === 'lyophilic') return null; // needs a huge ("protective") amount, effectively never at this scale
  if (s.charge === '+' && e.sign === '+') return e.coagValuePos ?? null;
  if (s.charge === '-' && e.sign === '-') return e.coagValueNeg ?? null;
  return null; // wrong-signed ion (spectator), does not coagulate
}
export function coagulates(inputs) {
  const v = coagulationValueMm(inputs);
  return v !== null && inputs.concentrationMm >= v;
}

export function validate(inputs) {
  const warnings = [];
  const s = solOf(inputs);
  if (s.type === 'lyophilic' && inputs.test === 'coagulate') warnings.push({ field: 'sol', code: 'LYOPHILIC_PROTECTED', message: 'This lyophilic sol will not coagulate at ordinary electrolyte concentrations.', why: 'A lyophilic (solvent-loving) sol is stabilised by a solvation shell, not primarily by charge, and needs an enormous ("salting-out") concentration of electrolyte to precipitate it.' });
  if (coagulationValueMm(inputs) === null && s.type === 'lyophobic') warnings.push({ field: 'electrolyte', code: 'WRONG_SIGN_ION', message: 'This electrolyte\'s active ion carries the same sign as the sol.', why: 'By the Hardy-Schulze rule only the ion of charge OPPOSITE to the sol\'s own does the coagulating; the same-signed ion is a spectator.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 269);
  const s = solOf(inputs);
  const e = electrolyteOf(inputs);
  const v = coagulationValueMm(inputs);
  const observation = inputs.test === 'tyndall'
    ? 'Bright cone of scattered light — confirms colloidal particle size'
    : (coagulates(inputs) ? 'Flocculates / precipitates' : (v === null ? 'No visible change' : 'Stays clear (below coagulation value)'));
  return { trial, sol: s.label, solType: s.type, test: inputs.test, electrolyte: e.label, coagulationMm: v !== null ? sigFig(v * (1 + jitter(rng, 0.03)), 4) : null, observation };
}

export function derive(rows) {
  const coagRows = rows.filter((r) => Number.isFinite(r.coagulationMm));
  if (!coagRows.length) return { ok: false, reason: 'Determine the coagulation value for at least one lyophobic sol / electrolyte pair.' };
  const best = coagRows.reduce((a, b) => (Number(a.coagulationMm) <= Number(b.coagulationMm) ? a : b));
  const worst = coagRows.reduce((a, b) => (Number(a.coagulationMm) >= Number(b.coagulationMm) ? a : b));
  return { ok: true, mostEffective: best.electrolyte, powerRatio: sigFig(Number(worst.coagulationMm) / Number(best.coagulationMm), 4), n: rows.length, points: [] };
}

export default { meta, defaults, SOLS, ELECTROLYTES, init, step, measure, derive, validate, solOf, electrolyteOf, coagulationValueMm, coagulates };
