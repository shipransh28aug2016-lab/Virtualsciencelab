/**
 * The tray, for XI-CHE-B02.
 *
 * Each liquid carries its Antoine constants and nothing that could be called an
 * answer. A, B and C are fitted to measured vapour-pressure data and are the
 * only thermodynamic input the bench has:
 *
 *      log₁₀ P(mm Hg) = A − B / (C + t/°C)
 *
 * From those three numbers alone the engine gets the boiling point at any
 * pressure, the enthalpy of vaporisation, Trouton's constant, whether the
 * liquid is associated, and the ebullioscopic constant K_b. None of those is
 * stored here, and verify-boiling-point.mjs checks every one of them against
 * the handbook.
 */

export const R = 8.314462618;
export const KELVIN = 273.15;
export const STANDARD_PRESSURE = 760;      // mm Hg

export const LIQUIDS = {
  acetone: {
    id: 'acetone',
    label: 'Acetone',
    formula: 'CH₃COCH₃',
    antoine: { A: 7.11714, B: 1210.595, C: 229.664, minC: -13, maxC: 55 },
    molarMass: 58.08,                      // g/mol
    density: 0.791,                        // g/cm³
    colour: [0.93, 0.95, 0.97],
    flammable: true,
    note: 'Boils below hand-hot. Never on a naked flame in a real laboratory — the bath is the point.',
  },
  ethanol: {
    id: 'ethanol',
    label: 'Ethanol',
    formula: 'C₂H₅OH',
    antoine: { A: 8.20417, B: 1642.89, C: 230.300, minC: 20, maxC: 93 },
    molarMass: 46.07,
    density: 0.789,
    colour: [0.94, 0.96, 0.98],
    flammable: true,
    note: 'Hydrogen bonded, so it boils far above its molar mass would suggest and Trouton’s constant gives it away.',
  },
  water: {
    id: 'water',
    label: 'Water',
    formula: 'H₂O',
    antoine: { A: 8.07131, B: 1730.63, C: 233.426, minC: 1, maxC: 100 },
    molarMass: 18.015,
    density: 0.998,
    colour: [0.90, 0.95, 1.0],
    flammable: false,
    note: 'The reference case, and the one whose boiling point everybody thinks they already know.',
  },
  toluene: {
    id: 'toluene',
    label: 'Toluene',
    formula: 'C₆H₅CH₃',
    antoine: { A: 6.95464, B: 1344.800, C: 219.482, minC: 6, maxC: 137 },
    molarMass: 92.14,
    density: 0.867,
    colour: [0.95, 0.95, 0.94],
    flammable: true,
    note: 'Forms an almost ideal solution with benzene, which is why the two of them are the textbook mixture.',
  },
  aniline: {
    id: 'aniline',
    label: 'Aniline',
    formula: 'C₆H₅NH₂',
    antoine: { A: 7.32010, B: 1731.515, C: 206.049, minC: 102, maxC: 185 },
    molarMass: 93.13,
    density: 1.022,
    colour: [0.90, 0.84, 0.68],
    flammable: false,
    note: 'Boils at 184 °C, so a water bath is not merely slow — it can never get there.',
  },
  benzene: {
    id: 'benzene',
    label: 'Benzene',
    formula: 'C₆H₆',
    antoine: { A: 6.90565, B: 1211.033, C: 220.790, minC: 8, maxC: 103 },
    molarMass: 78.11,
    density: 0.874,
    colour: [0.95, 0.95, 0.96],
    flammable: true,
    note: 'Here as the second component of the one binary mixture that really is ideal.',
  },
};

/** The liquids the published experiment asks a student to identify. Benzene is
 *  on the shelf as a mixing partner rather than as an unknown. */
export const UNKNOWNS = ['acetone', 'ethanol', 'water', 'toluene', 'aniline'];

/**
 * Non-volatile solutes. This is what "impure" means for a liquid: something
 * dissolved in it that has no vapour pressure of its own, so it cannot leave
 * with the vapour. Raoult's law then says the solvent's partial pressure is
 * reduced, and the liquid has to be hotter before it reaches atmospheric
 * pressure — boiling-point ELEVATION, the opposite of what an impurity does to
 * a melting point, and the single fact this experiment most often gets wrong.
 */
export const SOLUTES = {
  sucrose: { id: 'sucrose', label: 'Sucrose', formula: 'C₁₂H₂₂O₁₁', molarMass: 342.30, particles: 1 },
  salt: { id: 'salt', label: 'Sodium chloride', formula: 'NaCl', molarMass: 58.44, particles: 2,
    note: 'Dissociates, so one mole of it makes two moles of particles — and boiling-point elevation counts particles.' },
  residue: { id: 'residue', label: 'Involatile residue', formula: 'tar', molarMass: 300, particles: 1,
    note: 'High-boiling material left from the reaction. Every crude organic liquid has some.' },
};

/** What a crude sample of each liquid is actually carrying. */
export const NATIVE_SOLUTE = {
  acetone: 'residue', ethanol: 'sucrose', water: 'salt',
  toluene: 'residue', aniline: 'residue', benzene: 'residue',
};

/** Mole fraction of solute for each grade. "Pure" is not zero, because no
 *  bottle is; it is small enough that the elevation is below the least count. */
export const PURITY_MOLE_FRACTION = { pure: 1e-4, slight: 0.020, impure: 0.080 };

/** Baths, and the ceiling each puts on the experiment. */
export const BATHS = {
  oil: { id: 'oil', label: 'Liquid paraffin', maxC: 250, smokesAboveC: 210, colour: [0.96, 0.86, 0.55],
    note: 'Takes you to 250 °C, so it will boil anything on this shelf.' },
  water: { id: 'water', label: 'Water', maxC: 100, smokesAboveC: 1e9, colour: [0.86, 0.93, 1.0],
    note: 'Boils at 100 °C itself. Nothing boiling above that can be determined in it, however long you wait.' },
};

export const THERMOMETERS = {
  t1: { id: 't1', label: '1 °C', leastCount: 1.0, lagSeconds: 7.0 },
  t05: { id: 't05', label: '0.5 °C', leastCount: 0.5, lagSeconds: 6.0 },
  t02: { id: 't02', label: '0.2 °C', leastCount: 0.2, lagSeconds: 4.5 },
};

/**
 * Siwoloboff's apparatus, in numbers.
 *
 * The inverted capillary is the whole method. Its sealed end is up and it holds
 * a bubble of air; as the liquid warms, that air expands and leaves as a slow
 * string of bubbles. Once the liquid's vapour pressure reaches the pressure
 * outside, vapour itself starts coming out and the string becomes a rapid
 * continuous stream. Take the flame away and the stream slows; the instant it
 * STOPS and the liquid runs back up into the capillary, the vapour pressure has
 * fallen to exactly atmospheric — and that is the boiling point. It is read on
 * the way down, not on the way up, and it is sharp.
 */
export const CAPILLARY = {
  immersionDepthCm: 1.2,        // how far the mouth sits under the surface
  boreMm: 1.0,
  lengthCm: 3.5,
};

/** Charge in the fusion tube: about 0.5 mL, which is what a manual asks for. */
export const CHARGE_ML = 0.5;

/** Nucleation. A liquid with nothing to boil on can be carried above its
 *  boiling point and then goes off all at once — bumping. The capillary and a
 *  boiling chip both exist to prevent it. */
export const SUPERHEAT_LIMIT_C = 9;

/** First-order thermal time constant of the fusion tube and its contents. It
 *  is a gram of liquid in thin glass, so it follows the bath closely and the
 *  thermometer is again the slow instrument. */
export const TUBE_LAG_SECONDS = 4.0;

export const AMBIENT_C = 27;

/**
 * How long the stream must run before an observer will call it "rapid and
 * continuous". This is the eye, not the thermodynamics, and it is written here
 * in the open rather than buried in the rendering: the first vapour bubble
 * appears the instant the vapour pressure passes atmospheric, but nobody
 * records that — they wait to be sure. Meanwhile the bath goes on climbing, and
 * THAT is why the heating reading runs high and why the manual takes the
 * reading on the way down instead.
 */
export const STREAM_CONFIRM_SECONDS = 8;

/**
 * How fast a Thiele tube full of oil loses heat once the flame is taken away,
 * as a fraction of its excess over the room per second. Slow — which is the
 * whole reason the cooling reading is the sharp one: nothing is being driven,
 * so the bath, the tube and the mercury come down together and the lag between
 * them nearly vanishes.
 */
export const BATH_COOLING_PER_SECOND = 9.0e-4;

/**
 * Sidgwick's pressure correction, the one printed in the manual:
 *
 *      ΔT = C (760 − P)(t_obs + 273)
 *
 * with C = 1.0 × 10⁻⁴ for a normal liquid and 1.2 × 10⁻⁴ for an associated one.
 * The engine does not look up which is which — it computes Trouton's constant
 * and decides. The exact correction, by re-solving Antoine at 760 mm Hg, is
 * computed alongside so a student can see how good the rule of thumb is.
 */
export const SIDGWICK_NORMAL = 1.0e-4;
export const SIDGWICK_ASSOCIATED = 1.2e-4;
export const TROUTON_ASSOCIATED_ABOVE = 100;   // J mol⁻¹ K⁻¹
