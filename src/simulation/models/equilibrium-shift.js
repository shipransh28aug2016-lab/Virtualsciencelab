/**
 * MODEL: Shift in ionic equilibrium (Le Chatelier's principle) — XI-CHE-D01
 * (Fe³⁺/SCN⁻) and XI-CHE-D02 ([Co(H₂O)₆]²⁺/Cl⁻).
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section D.
 *
 *   D1:  Fe³⁺(aq, pale yellow) + SCN⁻(aq, colourless) ⇌ [FeSCN]²⁺(aq, blood red)
 *        Adding Fe³⁺ or SCN⁻ shifts the equilibrium right (deeper red);
 *        adding a common-ion-removing reagent (e.g. oxalate, which complexes
 *        Fe³⁺) shifts it left (colour fades).
 *
 *   D2:  [Co(H₂O)₆]²⁺(aq, pink) + 4Cl⁻(aq) ⇌ [CoCl₄]²⁻(aq, blue) + 6H₂O
 *        Adding concentrated HCl (Cl⁻) shifts right (pink → blue); adding
 *        water shifts left (blue → pink) — the classic "cobalt chloride" demo.
 *
 * The model reports a colour-intensity index (0=starting colour, 1=fully
 * shifted) computed from the law of mass action with a fixed nominal K, so
 * the direction and near-saturation behaviour are physically motivated
 * rather than an arbitrary slider mapping.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-D01',
  formula: 'Le Chatelier: adding a species shifts equilibrium to consume it; removing one shifts to replace it. Q vs K decides the direction.',
  unitSystem: 'Millimolar (mM) for added reagent; colour intensity as a fraction 0-1',
  assumptions: ['Reactions are fast enough that equilibrium is reached before the colour is judged', 'Dilution effects of adding reagent are small compared with the concentration change intended', 'Only one equilibrium is being perturbed at a time'],
  validRange: 'Reagent concentration 0-100 mM',
  edgeCases: ['At very high added reagent the colour saturates — Le Chatelier predicts a shift, not an unlimited one', 'Adding a reagent that removes one of the ions (e.g. oxalate complexing Fe³⁺) shifts the equilibrium the OTHER way'],
  expectedBehaviour: ['Adding either ion of the equilibrium on the reactant side deepens the product colour', 'Diluting with water, or adding a reagent that removes a reactant ion, shifts the equilibrium back and fades the colour'],
};

export const SYSTEMS = {
  fescn: {
    label: 'Fe³⁺ + SCN⁻ ⇌ [FeSCN]²⁺',
    reactantColour: 'pale yellow', productColour: 'blood red',
    reagents: {
      fecl3: { label: 'FeCl₃ (adds Fe³⁺)', direction: 1 },
      kscn: { label: 'KSCN (adds SCN⁻)', direction: 1 },
      oxalate: { label: 'Sodium oxalate (removes Fe³⁺ as a complex)', direction: -1 },
      water: { label: 'Water (dilutes)', direction: -1 },
    },
  },
  cocl: {
    label: '[Co(H₂O)₆]²⁺ + 4Cl⁻ ⇌ [CoCl₄]²⁻ + 6H₂O',
    reactantColour: 'pink', productColour: 'blue',
    reagents: {
      hcl: { label: 'Conc. HCl (adds Cl⁻)', direction: 1 },
      nacl: { label: 'Solid NaCl (adds Cl⁻)', direction: 1 },
      water: { label: 'Water (removes Cl⁻ by dilution, and favours 6 H₂O)', direction: -1 },
      agno3: { label: 'AgNO₃ (removes Cl⁻ as AgCl↓)', direction: -1 },
    },
  },
};

export const defaults = { system: 'fescn', reagent: 'fecl3', concentrationMm: 0 };

export function systemOf(inputs) { return SYSTEMS[inputs.system] || SYSTEMS.fescn; }
export function reagentOf(inputs) { const s = systemOf(inputs); return s.reagents[inputs.reagent] || Object.values(s.reagents)[0]; }

/** Colour-shift index, 0 (pure reactant colour) to 1 (pure product colour), via a saturating law-of-mass-action curve. */
export function shiftIndex(inputs) {
  const r = reagentOf(inputs);
  const K = 12; // nominal half-saturation concentration, mM
  const c = Math.max(0, inputs.concentrationMm);
  const sat = c / (c + K);
  const base = 0.35; // the system starts partially shifted even with no added reagent
  const delta = r.direction > 0 ? (1 - base) * sat : -base * sat;
  return Math.max(0, Math.min(1, base + delta));
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.concentrationMm === 0) warnings.push({ field: 'concentrationMm', code: 'NO_REAGENT_YET', message: 'No reagent has been added yet.', why: 'Add the chosen reagent to see which way the equilibrium colour shifts.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 293);
  const idx = Math.max(0, Math.min(1, shiftIndex(inputs) + jitter(rng, 0.02)));
  const s = systemOf(inputs);
  const r = reagentOf(inputs);
  return {
    trial, reagent: r.label, concentrationMm: inputs.concentrationMm, shiftIndex: sigFig(idx, 3),
    colourObserved: idx < 0.35 ? s.reactantColour : idx > 0.65 ? s.productColour : `intermediate (between ${s.reactantColour} and ${s.productColour})`,
    direction: r.direction > 0 ? 'towards products' : 'towards reactants',
  };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 3) return { ok: false, reason: 'Record the colour at at least three different reagent concentrations.' };
  const rightShift = rows.filter((r) => r.direction === 'towards products');
  const leftShift = rows.filter((r) => r.direction === 'towards reactants');
  const s = systemOf(inputs);
  return {
    ok: true, systemLabel: s.label, bothDirectionsShown: rightShift.length > 0 && leftShift.length > 0,
    maxShift: sigFig(Math.max(...rows.map((r) => Number(r.shiftIndex))), 3),
    minShift: sigFig(Math.min(...rows.map((r) => Number(r.shiftIndex))), 3),
    n: rows.length, points: rows.map((r) => ({ x: Number(r.concentrationMm), y: Number(r.shiftIndex) })),
  };
}

export default { meta, defaults, SYSTEMS, init, step, measure, derive, validate, systemOf, reagentOf, shiftIndex };
