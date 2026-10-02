/**
 * XI-CHE-E02 — a standard solution of oxalic acid. The bench is the shared
 * standard-solution kit; this file says what is on the shelf.
 *
 * Oxalic acid crystallises as the dihydrate, H₂C₂O₄·2H₂O (M = 126.07), which is
 * stable in air and of known composition: a primary standard. It gives two
 * protons, so its equivalent mass is half its molar mass, 63.04, and 250 mL of
 * 0.1 N (M/20) needs 0.1 × 0.250 × 63.04 = 1.576 g. The dihydrate dissolves with
 * heat TAKEN IN (+35.7 kJ/mol): the flask cools by about 0.7 K as it dissolves.
 * The anhydrous acid (M = 90.03) is on the shelf too, as it is in many
 * laboratories; weighing the wrong one is a mistake the bench lets a student make.
 */
import { createStandardStore } from '../../../../../shared/standard/createStandardStore.js';

export const FORMS = [
  { id: 'dihydrate', short: 'Dihydrate', label: 'Oxalic acid dihydrate', formula: 'H₂C₂O₄·2H₂O', M: 126.07, n: 2, purity: 0.999, rho: 1.65, dissolveTau: 30, dHsol: 35.7 },
  { id: 'anhydrous', short: 'Anhydrous', label: 'Oxalic acid, anhydrous', formula: 'H₂C₂O₄', M: 90.03, n: 2, purity: 0.998, rho: 1.9, dissolveTau: 25, dHsol: 9.7 },
];

export const CFG = {
  code: 'XI-CHE-E02',
  name: 'oxalic acid',
  title: 'A standard solution of oxalic acid',
  subtitle: 'CBSE Class XI · Volumetric analysis · weigh, transfer, dissolve, make up to the mark, mix — and find out what you made',
  forms: FORMS,
  defaultForm: 'dihydrate',
  target: { N: 0.1, flaskMl: 250 },
  nFactorNote: 'Oxalic acid gives two H⁺ per molecule: N = 2 M',
  budgetIds: [
    { id: 'balance', label: 'Error: the balance' }, { id: 'purity', label: 'Error: purity of the solid' }, { id: 'glass', label: 'Error: lost on the glass' },
    { id: 'flask', label: 'Error: this flask’s volume' }, { id: 'fill', label: 'Error: filling to the mark' }, { id: 'temperature', label: 'Error: temperature' },
  ],
  seed: 5,
};

export const useOxalic = createStandardStore(CFG);
