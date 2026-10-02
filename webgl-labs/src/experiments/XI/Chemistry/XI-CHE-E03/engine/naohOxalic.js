/**
 * XI-CHE-E03 — the strength of a sodium hydroxide solution, by titration against standard oxalic
 * acid. The bench is the shared titration kit; this file says what is in the flask and what is in
 * the burette.
 *
 * 2 NaOH + H₂C₂O₄ → Na₂C₂O₄ + 2 H₂O: one mole of oxalic acid takes two of hydroxide, so a mole of NaOH
 * needs 0.5 mol of acid. The bottle marked "about 0.1 M" really holds 0.0951 M (sodium hydroxide takes
 * CO₂ and water from the air); that is the number a student is there to find. At the end point the flask
 * is sodium oxalate, a weak base (pH ≈ 8.4): phenolphthalein turns there, methyl orange does not
 * turn until the flask is a good deal more acid — and the bench lets a student find that out.
 */
import { createTitration } from '../../../../../shared/titration/createTitration.js';

export const NAOH_M = 0.0951;

export const CFG = {
  code: 'XI-CHE-E03',
  title: 'Strength of sodium hydroxide by titration against oxalic acid',
  subtitle: 'CBSE Class XI · Volumetric analysis · NaOH in the flask, standard oxalic acid in the burette, the pH from the solver in activities',
  flask: { recipe: 'naoh', short: 'NaOH', unknown: true, trueC: NAOH_M, nEq: 1 },
  burette: { recipe: 'oxalic', short: 'oxalic acid', nEq: 2 },
  ratio: 0.5,                                                         // mol oxalic acid per mol NaOH
  standard: { default: 0.1, min: 0.02, max: 0.2, note: 'The standard you made in E02: a more dilute acid means more mL to the end point — and a smaller jump.' },
  analyteMl: { default: 20, min: 5, max: 25, note: 'About 0.1 M. The bottle does not say exactly: that is what you are finding.' },
  indicators: ['phenolphthalein', 'methylOrange', 'bromothymolBlue', 'universal', 'none'],
  defaultIndicator: 'phenolphthalein',
  degas: false,
  readyText: 'Note the initial burette reading, then add acid: 1 mL at a time at first, noting the colour or pH after each.',
  tableEmpty: 'Add acid, swirl, and record: 1 mL at a time while the pH moves slowly, single drops while it moves fast. The graph is drawn from your own points, and so is the end point.',
  resultHint: 'N₁V₁ = N₂V₂ at the middle of the steepest interval: 2 NaOH per oxalic acid.',
};

export const { useStore: useNaohOxalic, engine: ENGINE } = createTitration(CFG);
