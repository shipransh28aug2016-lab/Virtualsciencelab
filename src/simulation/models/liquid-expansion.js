/**
 * MODEL: Change in level of a liquid in a container on heating — XI-PHY-ACT-B3
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 3.
 * Apparent expansivity (what the level shows) = real expansivity of the
 * liquid minus the expansivity of the vessel; the level first DIPS because
 * the vessel warms (and so expands) before the liquid inside it does.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B3',
  formula: 'ΔV = V0·γ_apparent·ΔT; γ_real = γ_apparent + γ_vessel',
  unitSystem: 'Per kelvin; volumes in cm³, level in mm',
  assumptions: ['The flask and liquid are heated uniformly', 'The stem has a uniform, known bore', 'The initial dip (vessel expanding first) is a real, not spurious, effect'],
  validRange: 'Temperature rise 0-80 °C',
  edgeCases: ['A liquid with a small real expansivity can show an apparent CONTRACTION if the vessel expansivity is not subtracted'],
  expectedBehaviour: ['The level dips briefly, then rises steadily with ΔT', 'Correcting for the vessel raises the apparent value to the true one'],
};

export const LIQUIDS = { water: { label: 'Water', gammaReal: 0.000207 }, alcohol: { label: 'Ethanol', gammaReal: 0.00110 }, glycerine: { label: 'Glycerine', gammaReal: 0.00050 }, mercury: { label: 'Mercury', gammaReal: 0.000182 } };
export const VESSELS = { glass: { label: 'Soda glass flask', gamma: 0.000025 }, pyrex: { label: 'Pyrex flask', gamma: 0.00001 }, steel: { label: 'Steel vessel', gamma: 0.000035 } };
export const STEMS = { narrow: { label: 'Narrow stem (1 mm bore)', boreMm: 1 }, medium: { label: 'Medium stem (2 mm bore)', boreMm: 2 }, wide: { label: 'Wide stem (4 mm bore)', boreMm: 4 } };

export const defaults = { liquid: 'water', vessel: 'glass', stem: 'wide', volumeCm3: 150, deltaTempC: 40, correctForVessel: true };

export function liquidOf(inputs) { return LIQUIDS[inputs.liquid] || LIQUIDS.water; }
export function vesselOf(inputs) { return VESSELS[inputs.vessel] || VESSELS.glass; }
export function gammaApparent(inputs) { return liquidOf(inputs).gammaReal - vesselOf(inputs).gamma; }

export function levelRiseMm(inputs) {
  const dV = inputs.volumeCm3 * gammaApparent(inputs) * inputs.deltaTempC; // cm3
  const bore = (STEMS[inputs.stem] || STEMS.wide).boreMm / 10; // cm
  const area = Math.PI * (bore / 2) ** 2;
  return (dV / area) * 10; // mm
}

export function validate(inputs) {
  const warnings = [];
  if (gammaApparent(inputs) <= 0) warnings.push({ field: 'liquid', code: 'VESSEL_DOMINATES', message: 'The vessel expands as much as, or more than, the liquid.', why: 'The apparent expansivity would be zero or negative, so the level would not rise at all.', fix: 'Choose a liquid with a larger real expansivity, such as alcohol.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 149);
  const rise = levelRiseMm(inputs) + jitter(rng, 0.3);
  const dV = inputs.volumeCm3 * gammaApparent(inputs) * inputs.deltaTempC;
  return { trial, deltaTempC: inputs.deltaTempC, volumeCm3: inputs.volumeCm3, levelRiseMm: Number(rise.toFixed(2)), volumeChangeCm3: sigFig(dV, 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.deltaTempC), y: Number(r.levelRiseMm) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the rise for at least four different temperature rises.' };
  const fit = fitThroughOrigin(pts);
  const bore = (STEMS[inputs.stem] || STEMS.wide).boreMm / 10;
  const area = Math.PI * (bore / 2) ** 2;
  // slope = mm rise per °C; convert to gamma_apparent = (slope(mm->cm)/10 * area) / (V * 1)
  const gammaApp = ((fit.slope / 10) * area) / inputs.volumeCm3;
  const gammaReported = inputs.correctForVessel ? gammaApp + vesselOf(inputs).gamma : gammaApp;
  const accepted = liquidOf(inputs).gammaReal;
  return {
    ok: true, gammaApparent: sigFig(gammaApp, 4), gammaReported: sigFig(gammaReported, 4), accepted: sigFig(accepted, 4),
    percentError: sigFig(((gammaReported - accepted) / accepted) * 100, 3),
    vesselSharePercent: sigFig((vesselOf(inputs).gamma / accepted) * 100, 3),
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { meta, defaults, LIQUIDS, VESSELS, STEMS, init, step, measure, derive, validate, liquidOf, vesselOf, gammaApparent, levelRiseMm };
