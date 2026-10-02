/**
 * Reference data for the aqueous benches: acids, bases, salts and the foods and
 * household liquids a student is asked to test. Every constant is a measured
 * pK at 25 °C and zero ionic strength (CRC Handbook of Chemistry and Physics;
 * Harris, Quantitative Chemical Analysis, Appendix), and nothing here is an
 * answer — a pH is what the solver computes from these.
 *
 * A "weak system" is the general object: a substance with a total concentration
 * C that can lose protons, described by its successive pKa values and the
 * charge z0 of its fully protonated form. Acetic acid is { z0: 0, pKas: [4.756] }.
 * Ammonia is the same machinery seen from the other side: its fully protonated
 * form is NH₄⁺, so { z0: +1, pKas: [9.245] } — a base is just an acid that was
 * added in its deprotonated form. That is why one solver covers acids, bases,
 * salts, buffers and ampholytes without a special case for any of them.
 */

/* ── Weak acids and bases ───────────────────────────────────────────────────
   `dH` is the enthalpy of ionisation in kJ/mol where a well-established value
   exists, one per step. It gives pKa its temperature dependence through van 't
   Hoff, d(pKa)/d(1/T) = ΔH/(R ln 10) — small for acetic acid (−0.4, so its pH
   barely moves with temperature) and large for ammonium (+52, so an ammonia
   solution's pH falls by about 0.03 per degree). Where no value is given the
   pKa is held at its 25 °C figure and the bench says nothing about it. */
export const WEAK = {
  acetic:    { id: 'acetic',    label: 'Acetic acid',     formula: 'CH₃COOH',   z0: 0,  pKas: [4.756], dH: [-0.41] },
  formic:    { id: 'formic',    label: 'Formic acid',     formula: 'HCOOH',     z0: 0,  pKas: [3.751] },
  benzoic:   { id: 'benzoic',   label: 'Benzoic acid',    formula: 'C₆H₅COOH',  z0: 0,  pKas: [4.202] },
  lactic:    { id: 'lactic',    label: 'Lactic acid',     formula: 'CH₃CH(OH)COOH', z0: 0, pKas: [3.86] },
  hf:        { id: 'hf',        label: 'Hydrofluoric acid', formula: 'HF',      z0: 0,  pKas: [3.17] },
  hocl:      { id: 'hocl',      label: 'Hypochlorous acid', formula: 'HOCl',    z0: 0,  pKas: [7.53] },
  hcn:       { id: 'hcn',       label: 'Hydrocyanic acid', formula: 'HCN',      z0: 0,  pKas: [9.21], dH: [43.6] },
  phthalic:  { id: 'phthalic',  label: 'Phthalic acid',   formula: 'C₆H₄(COOH)₂', z0: 0, pKas: [2.950, 5.408] },
  boric:     { id: 'boric',     label: 'Boric acid',      formula: 'B(OH)₃',    z0: 0,  pKas: [9.236], dH: [13.8] },
  oxalic:    { id: 'oxalic',    label: 'Oxalic acid',     formula: 'H₂C₂O₄',    z0: 0,  pKas: [1.252, 4.266] },
  carbonic:  { id: 'carbonic',  label: 'Carbonic acid (CO₂ + H₂O)', formula: 'H₂CO₃', z0: 0, pKas: [6.352, 10.329], dH: [7.7, 14.7] },
  phosphoric:{ id: 'phosphoric',label: 'Phosphoric acid', formula: 'H₃PO₄',     z0: 0,  pKas: [2.148, 7.198, 12.375], dH: [-8.0, 3.6, 16.0] },
  citric:    { id: 'citric',    label: 'Citric acid',     formula: 'C₆H₈O₇',    z0: 0,  pKas: [3.128, 4.761, 6.396] },
  malic:     { id: 'malic',     label: 'Malic acid',      formula: 'C₄H₆O₅',    z0: 0,  pKas: [3.40, 5.20] },
  tartaric:  { id: 'tartaric',  label: 'Tartaric acid',   formula: 'C₄H₆O₆',    z0: 0,  pKas: [3.036, 4.366] },
  ascorbic:  { id: 'ascorbic',  label: 'Ascorbic acid',   formula: 'C₆H₈O₆',    z0: 0,  pKas: [4.10, 11.79] },
  sulphurous:{ id: 'sulphurous',label: 'Sulphurous acid', formula: 'H₂SO₃',     z0: 0,  pKas: [1.857, 7.172] },
  bisulphate:{ id: 'bisulphate',label: 'Hydrogensulphate', formula: 'HSO₄⁻',    z0: -1, pKas: [1.99], dH: [-22.4] },
  h2s:       { id: 'h2s',       label: 'Hydrogen sulphide', formula: 'H₂S',     z0: 0,  pKas: [7.02, 13.9] },
  /* Bases, as the protonated form that is their conjugate acid. */
  ammonia:   { id: 'ammonia',   label: 'Ammonia',         formula: 'NH₃',       z0: +1, pKas: [9.245], dH: [52.2] },
  methylamine:{id: 'methylamine',label: 'Methylamine',    formula: 'CH₃NH₂',    z0: +1, pKas: [10.62] },
  pyridine:  { id: 'pyridine',  label: 'Pyridine',        formula: 'C₅H₅N',     z0: +1, pKas: [5.23] },
  aniline:   { id: 'aniline',   label: 'Aniline',         formula: 'C₆H₅NH₂',   z0: +1, pKas: [4.60] },
  glycine:   { id: 'glycine',   label: 'Glycine',         formula: 'NH₂CH₂COOH', z0: +1, pKas: [2.35, 9.78] },
  /* Metal aqua cations: the first hydrolysis step, which is why a solution of
     a salt of a strong acid can still be acidic. */
  iron3:     { id: 'iron3',     label: 'Iron(III) ion',   formula: 'Fe³⁺(aq)',  z0: +3, pKas: [2.19] },
  aluminium: { id: 'aluminium', label: 'Aluminium ion',   formula: 'Al³⁺(aq)',  z0: +3, pKas: [5.0] },
  copper2:   { id: 'copper2',   label: 'Copper(II) ion',  formula: 'Cu²⁺(aq)',  z0: +2, pKas: [7.97] },
  zinc:      { id: 'zinc',      label: 'Zinc ion',        formula: 'Zn²⁺(aq)',  z0: +2, pKas: [8.96] },
};

/* ── Sparingly soluble hydroxides: pH set by a solubility product ─────────── */
export const SOLIDS = {
  magnesiumHydroxide: { id: 'magnesiumHydroxide', label: 'Magnesium hydroxide', formula: 'Mg(OH)₂', z: 2, Ksp: 5.61e-12 },
  calciumHydroxide:   { id: 'calciumHydroxide',   label: 'Calcium hydroxide',   formula: 'Ca(OH)₂', z: 2, Ksp: 5.02e-6 },
};

/**
 * What a student can pick off the shelf. A substance is a recipe in terms of the
 * three kinds of thing the solver understands:
 *
 *   strong   ions that are simply there: { z, c } per mole of substance
 *   weak     weak systems: { id, c } per mole
 *   solid    an excess solid of limited solubility
 *
 * `c` for the strong and weak parts is the amount per mole of the substance, so
 * a concentration slider scales the whole recipe. Foods and juices are given as
 * a composition in mol/L as they come from the bottle (USDA food composition
 * tables and the beverage literature), and the slider then dilutes them.
 */
const ion = (z, c) => ({ z, c });

export const SUBSTANCES = {
  /* Strong acids and bases */
  hcl:   { id: 'hcl',   label: 'Hydrochloric acid', formula: 'HCl',    group: 'Acids', strong: [ion(-1, 1)] },
  hno3:  { id: 'hno3',  label: 'Nitric acid',       formula: 'HNO₃',   group: 'Acids', strong: [ion(-1, 1)] },
  h2so4: { id: 'h2so4', label: 'Sulphuric acid',    formula: 'H₂SO₄',  group: 'Acids', weak: [{ id: 'bisulphate', c: 1 }] },
  naoh:  { id: 'naoh',  label: 'Sodium hydroxide',  formula: 'NaOH',   group: 'Bases', strong: [ion(+1, 1)] },
  koh:   { id: 'koh',   label: 'Potassium hydroxide', formula: 'KOH',  group: 'Bases', strong: [ion(+1, 1)] },
  /* Weak acids and bases */
  citric:{ id: 'citricAcid', label: 'Citric acid', formula: 'C₆H₈O₇', group: 'Acids', weak: [{ id: 'citric', c: 1 }] },
  acetic:{ id: 'aceticAcid', label: 'Acetic acid',  formula: 'CH₃COOH', group: 'Acids', weak: [{ id: 'acetic', c: 1 }] },
  formic:{ id: 'formicAcid', label: 'Formic acid',  formula: 'HCOOH',   group: 'Acids', weak: [{ id: 'formic', c: 1 }] },
  oxalic:{ id: 'oxalicAcid', label: 'Oxalic acid',  formula: 'H₂C₂O₄',  group: 'Acids', weak: [{ id: 'oxalic', c: 1 }] },
  phosphoric: { id: 'phosphoricAcid', label: 'Phosphoric acid', formula: 'H₃PO₄', group: 'Acids', weak: [{ id: 'phosphoric', c: 1 }] },
  ammonia:{ id: 'ammoniaSoln', label: 'Ammonia solution', formula: 'NH₃', group: 'Bases', weak: [{ id: 'ammonia', c: 1 }] },
  /* Salts, which are not neutral */
  nacl:  { id: 'nacl',  label: 'Sodium chloride',   formula: 'NaCl',   group: 'Salts', strong: [ion(+1, 1), ion(-1, 1)] },
  nh4cl: { id: 'nh4cl', label: 'Ammonium chloride', formula: 'NH₄Cl',  group: 'Salts', strong: [ion(-1, 1)], weak: [{ id: 'ammonia', c: 1 }] },
  naac:  { id: 'naac',  label: 'Sodium acetate',    formula: 'CH₃COONa', group: 'Salts', strong: [ion(+1, 1)], weak: [{ id: 'acetic', c: 1 }] },
  na2co3:{ id: 'na2co3',label: 'Sodium carbonate',  formula: 'Na₂CO₃', group: 'Salts', strong: [ion(+1, 2)], weak: [{ id: 'carbonic', c: 1 }] },
  nahco3:{ id: 'nahco3',label: 'Sodium hydrogencarbonate', formula: 'NaHCO₃', group: 'Salts', strong: [ion(+1, 1)], weak: [{ id: 'carbonic', c: 1 }] },
  fecl3: { id: 'fecl3', label: 'Iron(III) chloride', formula: 'FeCl₃', group: 'Salts', strong: [ion(-1, 3)], weak: [{ id: 'iron3', c: 1 }] },
  alcl3: { id: 'alcl3', label: 'Aluminium chloride', formula: 'AlCl₃', group: 'Salts', strong: [ion(-1, 3)], weak: [{ id: 'aluminium', c: 1 }] },
  /* Copper(II) sulphate is deliberately NOT on the shelf. Cu²⁺ hydrolyses to a
     dimer, Cu₂(OH)₂²⁺, that is as abundant as the monomer at 0.1 M; the solver
     represents only mononuclear species, so it would read about 4.8 where a
     meter reads about 4.1. A wrong pH shown confidently is worse than a missing
     bottle. */
  /* Sparingly soluble */
  mgoh2: { id: 'mgoh2', label: 'Milk of magnesia',  formula: 'Mg(OH)₂', group: 'Household', solid: { id: 'magnesiumHydroxide', total: 0.5 }, fixedConcentration: true },
  limewater: { id: 'limewater', label: 'Lime water', formula: 'Ca(OH)₂', group: 'Household', solid: { id: 'calciumHydroxide', total: 0.05 }, fixedConcentration: true },
};

/**
 * Juices, drinks and household liquids, as they come from the bottle. Amounts
 * are mol/L, from published composition data; the cations are the potassium and
 * sodium the acids are partly neutralised by, which is what makes real fruit
 * juice a buffer and not a bare acid. The pH of each is COMPUTED, and the test
 * suite holds it to the range the literature gives, not to a single number.
 */
export const FOODS = {
  lemon:  { id: 'lemon',  label: 'Lemon juice',   group: 'Food & drink', note: 'About 5% citric acid',
            strong: [ion(+1, 0.033)], weak: [{ id: 'citric', c: 0.245 }, { id: 'malic', c: 0.012 }] },
  orange: { id: 'orange', label: 'Orange juice',  group: 'Food & drink', note: 'Citric acid, partly neutralised by potassium',
            strong: [ion(+1, 0.050)], weak: [{ id: 'citric', c: 0.042 }, { id: 'malic', c: 0.006 }] },
  apple:  { id: 'apple',  label: 'Apple juice',   group: 'Food & drink', note: 'Mostly malic acid',
            strong: [ion(+1, 0.027)], weak: [{ id: 'malic', c: 0.030 }] },
  /* USDA, per 100 g: K 237 mg, Na 5, Ca 10, Mg 11, P 24, plus chloride and
     sulphate. Net strong cation = K + Na + 2Ca + 2Mg − Cl − 2SO₄ ≈ 0.061 eq/L;
     phosphate is its own weak system. Titratable acidity of tomato juice is
     0.4–0.8 % as citric acid, and 0.6 % (0.031 M) is taken. The pH is sensitive
     to this — about 0.3 of a unit per 0.006 M of net cation, which is ripeness,
     and why the published range for tomatoes is a whole unit wide. */
  tomato: { id: 'tomato', label: 'Tomato juice',  group: 'Food & drink', note: 'Citric and malic acids, buffered by potassium',
            strong: [ion(+1, 0.061)], weak: [{ id: 'citric', c: 0.031 }, { id: 'malic', c: 0.0075 }, { id: 'phosphoric', c: 0.0077 }] },
  vinegar:{ id: 'vinegar',label: 'Vinegar',       group: 'Food & drink', note: '5% acetic acid',
            weak: [{ id: 'acetic', c: 0.83 }] },
  cola:   { id: 'cola',   label: 'Cola',          group: 'Food & drink', note: 'Phosphoric acid and dissolved carbon dioxide',
            weak: [{ id: 'phosphoric', c: 0.0055 }, { id: 'carbonic', c: 0.060 }] },
  /* Milk is deliberately NOT here. Its pH (6.6) is set by casein, which carries
     a net negative charge, and by calcium phosphate held in the colloid; a
     composition of dissolved minerals and acids cannot represent either, and the
     solver — correctly — returns pH 11.7 for it. */
  rain:   { id: 'rain',   label: 'Rain water',    group: 'Environment', note: 'Water in equilibrium with 410 ppm CO₂',
            weak: [{ id: 'carbonic', c: 1.4e-5 }] },
  water:  { id: 'water',  label: 'Pure water',    group: 'Environment', note: 'Nothing dissolved at all' },
};

/**
 * The calibration buffers a pH meter is set against, as the SOLUTIONS they are.
 * `nist` is the certified value (NIST/IUPAC primary standards at 25 °C); the
 * recipe is the exact composition, so the verification suite can ask the solver
 * to reproduce each certified pH from nothing but the composition and the pKa —
 * which is the strongest independent test the aqueous engine has. The meter is
 * calibrated against the certified number, as in a real laboratory.
 */
/** The certified pH of each standard at 5 °C steps (NIST/IUPAC), which is what a
 *  meter's temperature-compensated buffer recognition looks up. */
const NIST_TABLE = {
  pH4:  { 15: 3.999, 20: 4.002, 25: 4.005, 30: 4.011, 35: 4.018, 40: 4.027 },
  pH7:  { 15: 6.900, 20: 6.881, 25: 6.865, 30: 6.853, 35: 6.844, 40: 6.838 },
  pH9:  { 15: 9.276, 20: 9.225, 25: 9.180, 30: 9.139, 35: 9.102, 40: 9.068 },
  pH10: { 15: 10.118, 20: 10.062, 25: 10.012, 30: 9.966, 35: 9.926, 40: 9.889 },
};
export function certifiedPH(bufferId, tC) {
  const row = NIST_TABLE[bufferId];
  const ts = Object.keys(row).map(Number);
  const t = Math.min(ts[ts.length - 1], Math.max(ts[0], tC));
  const lo = ts.filter((x) => x <= t).pop();
  const hi = ts.find((x) => x >= t);
  return lo === hi ? row[lo] : row[lo] + ((row[hi] - row[lo]) * (t - lo)) / (hi - lo);
}

export const BUFFERS = {
  pH4:  { id: 'pH4',  label: 'pH 4.01 buffer',  nist: 4.005,  note: '0.05 m potassium hydrogen phthalate',
          strong: [ion(+1, 0.05)], weak: [{ id: 'phthalic', c: 0.05 }] },
  pH7:  { id: 'pH7',  label: 'pH 6.86 buffer',  nist: 6.865,  note: '0.025 m KH₂PO₄ + 0.025 m Na₂HPO₄',
          strong: [ion(+1, 0.075)], weak: [{ id: 'phosphoric', c: 0.05 }] },
  pH9:  { id: 'pH9',  label: 'pH 9.18 buffer',  nist: 9.180,  note: '0.01 m borax',
          strong: [ion(+1, 0.02)], weak: [{ id: 'boric', c: 0.04 }] },
  pH10: { id: 'pH10', label: 'pH 10.01 buffer', nist: 10.012, note: '0.025 m NaHCO₃ + 0.025 m Na₂CO₃',
          strong: [ion(+1, 0.075)], weak: [{ id: 'carbonic', c: 0.05 }] },
};
