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
  formula: 'Le Chatelier: adding a species shifts equilibrium to consume it; removing one shifts to replace it; heating shifts it towards whichever side absorbs heat. Q vs K decides the direction.',
  unitSystem: 'Millimolar (mM) for added reagent; degrees Celsius for temperature; colour intensity as a fraction 0-1',
  assumptions: ['Reactions are fast enough that equilibrium is reached before the colour is judged', 'Dilution effects of adding reagent are small compared with the concentration change intended', 'The concentration stress and the temperature stress act as two independent, additive contributions to the same colour-shift index'],
  validRange: 'Reagent concentration 0-100 mM; temperature 5-80 °C (ice bath to a near-boiling water bath)',
  edgeCases: ['At very high added reagent the colour saturates — Le Chatelier predicts a shift, not an unlimited one', 'Adding a reagent that removes one of the ions (e.g. oxalate complexing Fe³⁺) shifts the equilibrium the OTHER way', 'The two systems respond to heat in OPPOSITE directions: FeSCN formation is exothermic (heating fades it) while the cobalt-chloride forward reaction is endothermic (heating deepens it) — heating and a forward-favouring reagent can therefore reinforce or oppose each other depending on the system'],
  expectedBehaviour: ['Adding either ion of the equilibrium on the reactant side deepens the product colour', 'Diluting with water, or adding a reagent that removes a reactant ion, shifts the equilibrium back and fades the colour', 'Raising the temperature shifts the equilibrium towards the side that absorbs heat (the endothermic direction), by Le Chatelier applied to heat as a stress'],
};

export const SYSTEMS = {
  fescn: {
    label: 'Fe³⁺ + SCN⁻ ⇌ [FeSCN]²⁺',
    equation: 'Fe³⁺(aq, pale yellow) + SCN⁻(aq, colourless) ⇌ [FeSCN]²⁺(aq, blood red)',
    reactantColour: 'pale yellow', productColour: 'blood red',
    // Complex formation here is mildly EXOTHERMIC, so by Le Chatelier's
    // principle heating is itself a stress that shifts the equilibrium
    // back towards the (paler) reactant side, and cooling deepens the red
    // — the reverse of the cobalt-chloride system below. tempSign is the
    // direction (relative to the product side) that RAISING temperature
    // pushes the equilibrium.
    tempSign: -1,
    enthalpyNote: 'Complex formation is mildly exothermic: heating fades the red (shifts left, towards reactants); cooling deepens it (shifts right, towards products).',
    tempEffectShort: 'Exothermic — heat fades it, cold deepens it',
    reagents: {
      fecl3: { label: 'FeCl₃ (adds Fe³⁺)', direction: 1 },
      kscn: { label: 'KSCN (adds SCN⁻)', direction: 1 },
      oxalate: { label: 'Sodium oxalate (removes Fe³⁺ as a complex)', direction: -1 },
      water: { label: 'Water (dilutes)', direction: -1 },
    },
  },
  cocl: {
    label: '[Co(H₂O)₆]²⁺ + 4Cl⁻ ⇌ [CoCl₄]²⁻ + 6H₂O',
    equation: '[Co(H₂O)₆]²⁺(aq, pink) + 4Cl⁻(aq) ⇌ [CoCl₄]²⁻(aq, blue) + 6H₂O(l)',
    reactantColour: 'pink', productColour: 'blue',
    // The forward (pink -> blue) reaction is ENDOTHERMIC, so heating
    // shifts it further towards blue and cooling favours pink — this is
    // already stated in this experiment's own apparatus list ("Water bath
    // (optional) ... warming also favours the blue form") and viva, but
    // until now nothing in the simulation actually let a student vary
    // temperature to see it.
    tempSign: 1,
    enthalpyNote: 'The forward reaction is endothermic: heating deepens the blue (shifts right, towards products); cooling favours pink (shifts left, towards reactants).',
    tempEffectShort: 'Endothermic — heat deepens it, cold fades it',
    reagents: {
      hcl: { label: 'Conc. HCl (adds Cl⁻)', direction: 1 },
      nacl: { label: 'Solid NaCl (adds Cl⁻)', direction: 1 },
      water: { label: 'Water (removes Cl⁻ by dilution, and favours 6 H₂O)', direction: -1 },
      agno3: { label: 'AgNO₃ (removes Cl⁻ as AgCl↓)', direction: -1 },
    },
  },
};

/**
 * NOTE on concentrationMm: 0 was the original default. At c = 0,
 * shiftIndex() below returns exactly the same value (the bare `base`
 * term, 0.35) for every choice of `reagent` — none of fecl3/kscn/oxalate/
 * water changes the equilibrium at all until some non-zero amount is
 * actually added. So a student who opened the experiment and switched
 * between reagents without first moving the "Amount added" slider off
 * its default saw an identical, unchanging colour and an identical row
 * in the observation table no matter which reagent they picked — "no
 * reaction is properly showing" and "no change in observation table".
 * 20 mM is comfortably past the model's own reactant/product colour
 * thresholds in measure() below (giving ~0.76 for a forward reagent and
 * ~0.13 for a reverse one, cleanly outside the 0.35-0.65 "intermediate"
 * band) so the very first, untouched run already shows a real,
 * unambiguous shift.
 */
// 25 °C = ordinary room temperature, i.e. no thermal stress at all — the
// slider's own zero point for the temperature term below.
const ROOM_TEMP_C = 25;

export const defaults = { system: 'fescn', reagent: 'fecl3', concentrationMm: 20, temperatureC: ROOM_TEMP_C };

export function systemOf(inputs) { return SYSTEMS[inputs.system] || SYSTEMS.fescn; }
export function reagentOf(inputs) { const s = systemOf(inputs); return s.reagents[inputs.reagent] || Object.values(s.reagents)[0]; }

/**
 * The temperature term, on its own: 0 at room temperature, rising towards
 * ±0.25 as the water bath (heating) or ice bath (cooling) is used, in the
 * direction set by the system's own enthalpy sign (tempSign). This is a
 * genuine, separate Le Chatelier stress from the concentration change —
 * both this experiment's apparatus list ("Water bath (optional) ...
 * warming also favours the blue form") and its viva already say so, but
 * previously nothing in the simulation let a student act on it or see it.
 * Capped smaller than the concentration term (which can reach ±0.65) since
 * a modest temperature change is a gentler stress than adding a reagent
 * outright.
 */
export function temperatureShift(inputs) {
  const s = systemOf(inputs);
  const dT = (inputs.temperatureC ?? ROOM_TEMP_C) - ROOM_TEMP_C;
  const K3 = 25; // half-saturation temperature offset, °C
  return s.tempSign * (dT / (Math.abs(dT) + K3)) * 0.25;
}

/** Colour-shift index, 0 (pure reactant colour) to 1 (pure product colour), via a saturating law-of-mass-action curve plus an independent temperature term. */
export function shiftIndex(inputs) {
  const r = reagentOf(inputs);
  const K = 12; // nominal half-saturation concentration, mM
  const c = Math.max(0, inputs.concentrationMm);
  const sat = c / (c + K);
  const base = 0.35; // the system starts partially shifted even with no added reagent
  const concDelta = r.direction > 0 ? (1 - base) * sat : -base * sat;
  return Math.max(0, Math.min(1, base + concDelta + temperatureShift(inputs)));
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.concentrationMm === 0 && (inputs.temperatureC ?? ROOM_TEMP_C) === ROOM_TEMP_C) warnings.push({ field: 'concentrationMm', code: 'NO_STRESS_YET', message: 'No reagent has been added and the temperature is still at room temperature.', why: 'Add the chosen reagent, change the temperature, or both, to see which way the equilibrium colour shifts.' });
  return { ok: true, errors: [], warnings };
}
export function init(inputs = defaults) { return { t: 0, position: 0.5, shifting: false, settled: true, equationFull: systemOf(inputs).equation, tempC: inputs.temperatureC ?? ROOM_TEMP_C, tempEffectNote: systemOf(inputs).enthalpyNote, tempEffectShort: systemOf(inputs).tempEffectShort }; }
/**
 * Le Chatelier in progress.
 *
 * Adding a reagent does not move the equilibrium instantly: the system
 * relaxes towards its new position over a few seconds, and the colour of
 * the mixture follows it there. Watching that relaxation IS the
 * experiment -- a tube that simply switches colour teaches nothing about
 * why it moved.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // shiftIndex: negative to the reactant side, positive to the product side.
  const target = 0.5 + Math.max(-0.5, Math.min(0.5, shiftIndex(inputs) * 0.5));
  s.position += (target - s.position) * Math.min(1, dt * 0.7);
  s.shifting = Math.abs(target - s.position) > 0.004;
  s.settled = !s.shifting;
  // Resolved display fields the renderer needs — never re-derived from raw
  // inputs in the renderer itself (renderers never import models here).
  s.equationFull = systemOf(inputs).equation;
  s.tempC = inputs.temperatureC ?? ROOM_TEMP_C;
  s.tempEffectNote = systemOf(inputs).enthalpyNote;
  s.tempEffectShort = systemOf(inputs).tempEffectShort;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 293);
  const idx = Math.max(0, Math.min(1, shiftIndex(inputs) + jitter(rng, 0.02)));
  const s = systemOf(inputs);
  const r = reagentOf(inputs);
  // The reported direction reflects the NET shift actually produced —
  // reagent and temperature are independent stresses that can reinforce or
  // oppose each other, so the honest answer is "which way did the colour
  // actually move", not just "which way does this reagent alone push".
  const base = 0.35;
  const direction = idx > base + 0.03 ? 'towards products' : idx < base - 0.03 ? 'towards reactants' : 'no significant net shift';
  return {
    trial, reagent: r.label, concentrationMm: inputs.concentrationMm, temperatureC: inputs.temperatureC ?? ROOM_TEMP_C,
    shiftIndex: sigFig(idx, 3),
    colourObserved: idx < 0.35 ? s.reactantColour : idx > 0.65 ? s.productColour : `intermediate (between ${s.reactantColour} and ${s.productColour})`,
    direction,
  };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 3) return { ok: false, reason: 'Record the colour at at least three different reagent concentrations.' };
  const rightShift = rows.filter((r) => r.direction === 'towards products');
  const leftShift = rows.filter((r) => r.direction === 'towards reactants');
  const s = systemOf(inputs);
  return {
    ok: true, systemLabel: s.label, equationFull: s.equation, enthalpyNote: s.enthalpyNote,
    bothDirectionsShown: rightShift.length > 0 && leftShift.length > 0,
    maxShift: sigFig(Math.max(...rows.map((r) => Number(r.shiftIndex))), 3),
    minShift: sigFig(Math.min(...rows.map((r) => Number(r.shiftIndex))), 3),
    n: rows.length, points: rows.map((r) => ({ x: Number(r.concentrationMm), y: Number(r.shiftIndex) })),
  };
}

export default { meta, defaults, SYSTEMS, init, step, measure, derive, validate, systemOf, reagentOf, shiftIndex, temperatureShift };
