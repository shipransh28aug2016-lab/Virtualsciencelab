/**
 * XI-CHE-E04 — a standard solution of sodium carbonate. The bench is the shared
 * standard-solution kit; this file says what is on the shelf.
 *
 * Anhydrous Na₂CO₃ (M = 105.99) takes two protons, so its equivalent mass is 53.00
 * and 250 mL of 0.1 N needs 0.1 × 0.250 × 53.00 = 1.325 g. It dissolves with heat given
 * OUT (−26.7 kJ/mol): the flask warms, and must come back to the room before the last
 * of the water goes in. It is hygroscopic: a jar left open carries water (and CO₂), so the
 * sample is weighed with its lid on between additions. The decahydrate on the same shelf
 * (washing soda, M = 286.14) is the wrong jar — 2.7 times the mass for the same normality.
 */
import { createStandardStore } from '../../../../../shared/standard/createStandardStore.js';

export const FORMS = [
  {
    id: 'anhydrous', short: 'Anhydrous, dried', label: 'Sodium carbonate, anhydrous A.R. (dried)', formula: 'Na₂CO₃', M: 105.99, n: 2, purity: 0.999, rho: 2.54, dissolveTau: 25, dHsol: -26.7,
    hygro: { rate: 1.2e-5, cap: 0.025 },
  },
  {
    id: 'undried', short: 'Anhydrous, left open', label: 'Sodium carbonate, anhydrous (jar left open: 0.6 % water)', formula: 'Na₂CO₃', M: 105.99, n: 2, purity: 0.994, rho: 2.54, dissolveTau: 25, dHsol: -26.7,
    hygro: { rate: 1.2e-5, cap: 0.025 },
  },
  { id: 'decahydrate', short: 'Washing soda', label: 'Washing soda, sodium carbonate decahydrate', formula: 'Na₂CO₃·10H₂O', M: 286.14, n: 2, purity: 0.995, rho: 1.46, dissolveTau: 40, dHsol: 67 },
];

export const CFG = {
  code: 'XI-CHE-E04',
  name: 'sodium carbonate',
  title: 'A standard solution of sodium carbonate',
  subtitle: 'CBSE Class XI · Volumetric analysis · a hygroscopic primary standard that heats the flask as it dissolves',
  forms: FORMS,
  defaultForm: 'anhydrous',
  target: { N: 0.1, flaskMl: 250 },
  nFactorNote: 'Na₂CO₃ takes two H⁺ in titration with a strong acid: N = 2 M',
  budgetIds: [
    { id: 'balance', label: 'Error: the balance' }, { id: 'purity', label: 'Error: purity of the solid' }, { id: 'glass', label: 'Error: lost on the glass' },
    { id: 'flask', label: 'Error: this flask’s volume' }, { id: 'fill', label: 'Error: filling to the mark' }, { id: 'temperature', label: 'Error: temperature' },
  ],
  seed: 9,
};

export const useCarbonate = createStandardStore(CFG);
