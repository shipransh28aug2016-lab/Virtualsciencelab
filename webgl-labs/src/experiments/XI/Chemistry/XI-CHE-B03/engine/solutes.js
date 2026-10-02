/**
 * The bench stock for XI-CHE-B03.
 *
 * Solubility is stored as MEASURED POINTS — grams of the anhydrous substance
 * per 100 g of water, which is how a handbook quotes it — and never as a fitted
 * curve with tidy constants. Between the points the engine interpolates in
 * (1/T, ln s), which is van 't Hoff's equation locally, so the shape of the
 * curve is thermodynamics rather than a spline someone liked the look of, and
 * the slope of it is the enthalpy of solution.
 *
 * The anhydrous basis matters. Copper sulphate and alum crystallise as
 * hydrates, so every gram of crystal that forms takes water out of the solvent
 * with it — and every gram of crude that goes in brings water with it. Eight
 * grams of CuSO₄·5H₂O is 5.11 g of salt and 2.89 g of water, which is a third
 * of the solvent in a typical determination. A recovery calculation that
 * ignores it is wrong by more than the answer.
 */

export const R = 8.314462618;
export const KELVIN = 273.15;

export const SOLUTES = {
  copperSulphate: {
    id: 'copperSulphate',
    label: 'Copper(II) sulphate',
    formula: 'CuSO₄·5H₂O',
    anhydrousFormula: 'CuSO₄',
    molarMassAnhydrous: 159.61,
    molarMassCrystal: 249.68,          // the pentahydrate
    hydrate: 5,
    density: 2.286,                    // g/cm³, the pentahydrate
    habit: 'triclinic',
    colour: [0.16, 0.42, 0.78],        // the blue is the hexaaqua ion
    /** Characteristic temperature of the PRODUCT. Copper sulphate pentahydrate
     *  does not melt: it loses its water of crystallisation near 110 °C and
     *  goes white. That transition is what a student times, and it is as sharp
     *  as the crystals are pure. */
    characteristicTempC: 110,
    characteristic: 'loses its water of crystallisation',
    /** g of ANHYDROUS CuSO₄ per 100 g of water. Handbook values. */
    solubilityWater: [[0, 14.3], [20, 20.7], [40, 28.5], [60, 40.0], [80, 55.0], [100, 75.4]],
    solubilityEthanol: [[0, 0.08], [25, 0.10], [60, 0.16]],
    note: 'Steeply soluble in hot water and much less so in cold — which is exactly what makes a solvent good.',
  },
  alum: {
    id: 'alum',
    label: 'Potash alum',
    formula: 'KAl(SO₄)₂·12H₂O',
    anhydrousFormula: 'KAl(SO₄)₂',
    molarMassAnhydrous: 258.19,
    molarMassCrystal: 474.39,          // the dodecahydrate
    hydrate: 12,
    density: 1.757,
    habit: 'octahedral',
    colour: [0.92, 0.94, 0.97],
    characteristicTempC: 92.5,
    characteristic: 'melts in its own water of crystallisation',
    solubilityWater: [[0, 3.0], [20, 5.9], [40, 11.7], [60, 24.8], [80, 71.0], [100, 154.0]],
    solubilityEthanol: [[0, 0.05], [25, 0.08], [60, 0.12]],
    note: 'Twelve waters of crystallisation, so at the boil it very nearly dissolves in its own.',
  },
  benzoic: {
    id: 'benzoic',
    label: 'Benzoic acid',
    formula: 'C₆H₅COOH',
    anhydrousFormula: 'C₆H₅COOH',
    molarMassAnhydrous: 122.12,
    molarMassCrystal: 122.12,
    hydrate: 0,
    density: 1.266,
    habit: 'needle',
    colour: [0.97, 0.97, 0.95],
    characteristicTempC: 122.35,
    characteristic: 'melts',
    /** Benzoic acid in water: barely soluble cold, freely soluble near the
     *  boil. A ratio of thirty-three to one, which is why it recrystallises so
     *  well — and why it takes so much water to dissolve in the first place. */
    solubilityWater: [[0, 0.17], [20, 0.29], [40, 0.56], [60, 1.16], [80, 2.72], [95, 5.60]],
    /** And in ethanol: soluble cold, barely more soluble hot. A ratio of less
     *  than three. Excellent for dissolving, useless for recrystallising, and
     *  the most instructive mistake on this bench. */
    solubilityEthanol: [[0, 32.0], [25, 46.0], [50, 64.0], [78, 86.0]],
    note: 'Choose water and it recrystallises beautifully; choose ethanol and almost all of it stays in the mother liquor.',
  },
};

export const SOLVENTS = {
  water: {
    id: 'water', label: 'Water', formula: 'H₂O',
    density: 0.998, boilingPointC: 100, molarMass: 18.015,
    note: 'Cheap, safe, and the right answer for all three of these.',
  },
  ethanol: {
    id: 'ethanol', label: 'Ethanol', formula: 'C₂H₅OH',
    density: 0.789, boilingPointC: 78.4, molarMass: 46.07,
    note: 'Boils at 78 °C, so it cannot be taken as hot — and it dissolves organic acids far too well when cold.',
  },
};

/**
 * What a crude sample is carrying, and it is two different problems.
 *
 *   soluble    stays behind in the mother liquor, PROVIDED there is enough
 *              solvent to hold it. Squeeze the solvent to maximise recovery and
 *              the impurity comes down with the product.
 *   insoluble  sand, charcoal, undissolved tar. Never dissolves at any
 *              temperature, so nothing but HOT FILTRATION removes it — and if
 *              it is not removed it is weighed as product, which flatters the
 *              recovery and ruins the melting point.
 */
export const CRUDE_GRADES = {
  light: { id: 'light', label: 'Lightly contaminated', soluble: 0.03, insoluble: 0.010 },
  moderate: { id: 'moderate', label: 'Moderately contaminated', soluble: 0.08, insoluble: 0.030 },
  heavy: { id: 'heavy', label: 'Heavily contaminated', soluble: 0.18, insoluble: 0.070 },
};

/** The soluble impurity each crude sample actually carries, with its own
 *  solubility so it can be asked whether it stays dissolved or comes down. */
export const IMPURITIES = {
  copperSulphate: {
    id: 'ferrousSulphate', label: 'Iron(II) sulphate', formula: 'FeSO₄·7H₂O',
    molarMass: 278.0, solubilityWater: [[0, 15.6], [20, 26.5], [50, 48.6], [100, 57.8]],
    note: 'Travels with copper sulphate out of the ore and is greener the more there is.',
  },
  alum: {
    id: 'potassiumSulphate', label: 'Potassium sulphate', formula: 'K₂SO₄',
    molarMass: 174.26, solubilityWater: [[0, 7.4], [20, 11.1], [50, 16.5], [100, 24.1]],
    note: 'Left over from making the alum, and more soluble than the alum itself.',
  },
  benzoic: {
    id: 'phthalic', label: 'Phthalic acid', formula: 'C₆H₄(COOH)₂',
    molarMass: 166.13, solubilityWater: [[0, 0.30], [20, 0.70], [50, 2.90], [100, 18.0]],
    note: 'A by-product of the same oxidation, and rather more soluble in water than benzoic acid.',
  },
};

/** Cooling regimes, in °C per minute. Crystal size follows from these through
 *  nucleation, and purity follows from crystal size through occlusion — so
 *  this control decides the quality of the product, not merely the wait. */
export const COOLING = {
  slow: { id: 'slow', label: 'Left to stand', ratePerMin: 0.25, note: 'Hours. Few nuclei, large well-formed crystals, and very little mother liquor trapped in them.' },
  bench: { id: 'bench', label: 'On the bench', ratePerMin: 1.5, note: 'The usual compromise.' },
  ice: { id: 'ice', label: 'Plunged into ice', ratePerMin: 12.0, note: 'Fast, and it pays for the speed: a shower of tiny crystals with mother liquor trapped all through them.' },
};

/* ── Nucleation and growth ────────────────────────────────────────────────── */

/**
 * Classical nucleation: J = J₀ exp(−B / ln²S).
 *
 * The exponential in 1/ln²S is what makes crystallisation behave the way it
 * does. A solution a few per cent supersaturated produces almost no nuclei at
 * all and can sit there for hours; push the supersaturation a little further
 * and the rate rises by orders of magnitude and the whole flask goes at once.
 * That cliff is the metastable zone, and it is why a slowly cooled solution
 * makes a handful of large crystals and a quenched one makes a powder.
 */
export const NUCLEATION_PREFACTOR = 1.0e6;   // nuclei per second per kg of solution
export const NUCLEATION_B = 2.2;             // dimensionless barrier

/**
 * Reference metastable width, for the HUD to quote. It is not a trigger: the
 * engine integrates the nucleation rate and lets the zone emerge, and this
 * figure is roughly where an unseeded solution of these salts is found to go
 * before it starts. Scratching the flask or dropping in a seed crystal ends the
 * wait at once, whatever the supersaturation.
 */
export const METASTABLE_RATIO = 1.45;

/** Time constant for redissolving crystals when a flask is warmed back up. */
export const GROWTH_SECONDS = 45;

/**
 * Growth coefficient, g cm⁻² s⁻¹ per unit of (S − 1). Set from the linear
 * growth rate a crystal actually manages — a millimetre in an hour or so at a
 * few per cent supersaturation — through dm/dt = (ρ/2)·A·G.
 */
export const GROWTH_COEFFICIENT = 3.0e-5;

/**
 * Occlusion. A crystal traps a film of mother liquor on and inside it, and the
 * amount goes with surface area — so it goes as 1/size for a given mass. Small
 * crystals are therefore dirtier crystals, which is the real reason a manual
 * tells you to cool slowly, and it is a quantitative reason rather than a
 * stylistic one. The constant is in millimetres so it reads as what it is:
 * roughly this fraction of the crystal mass is trapped liquor at 1 mm.
 */
export const OCCLUSION_AT_1MM = 0.035;

/** Washing the crystals with a little ICE-COLD solvent removes the adhering
 *  mother liquor, and dissolves a little of the product doing it. Both. */
export const WASH_REMOVES = 0.82;

export const AMBIENT_C = 27;
