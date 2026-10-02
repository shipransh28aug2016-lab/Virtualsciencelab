/**
 * XI-CHE-E05 — the strength of hydrochloric acid, by titration against standard sodium carbonate.
 * The bench is the shared titration kit; this file says what is in the flask and what is in the burette.
 *
 * Na₂CO₃ + 2 HCl → 2 NaCl + H₂O + CO₂: two moles of acid to one of carbonate, in two steps. The first
 * (CO₃²⁻ → HCO₃⁻, pH ≈ 8.3) is where phenolphthalein turns; the second (HCO₃⁻ → H₂CO₃, pH ≈ 4) is
 * where methyl orange does. The carbonic acid is not a spectator: carbon dioxide leaves a flask that
 * is acid enough to make it, at a rate swirling raises, and the pH just short of the second end
 * point is not the closed-system value. The acid in the bottle is really 0.1046 M.
 */
import { createTitration } from '../../../../../shared/titration/createTitration.js';

export const HCL_M = 0.1046;

export const CFG = {
  code: 'XI-CHE-E05',
  title: 'Strength of hydrochloric acid by titration against standard sodium carbonate',
  subtitle: 'CBSE Class XI · Volumetric analysis · standard Na₂CO₃ in the flask, HCl in the burette; two end points, and the CO₂ in between',
  flask: { recipe: 'na2co3', short: 'Na₂CO₃', nEq: 2 },
  burette: { recipe: 'hcl', short: 'HCl', unknown: true, trueC: HCL_M },
  ratio: 2,                                                           // mol HCl per mol Na₂CO₃
  unknownIsBurette: true,
  standard: { default: 0.1, min: 0.05, max: 0.2, note: 'The standard you made in E04. A more dilute carbonate takes less acid to the end point.' },
  analyteMl: { default: 20, min: 10, max: 25, note: 'Pipetted from the standard solution.' },
  indicators: ['methylOrange', 'phenolphthalein', 'bromothymolBlue', 'universal', 'none'],
  defaultIndicator: 'methylOrange',
  degas: true,
  readyText: 'Note the initial burette reading, then run in the acid: 1 mL at a time at first. There are two jumps — which one does your indicator follow?',
  tableEmpty: 'Run in the acid, swirl, and record. A pH curve for carbonate has two steps; the volume to the second is the one that matters.',
  resultHint: 'HCl = 2 × (Na₂CO₃ concentration × volume) / titre, at the second end point.',
};

export const { useStore: useHclCarbonate, engine: ENGINE } = createTitration(CFG);
