/**
 * The tray. Everything here is measured data — melting point, enthalpy of
 * fusion, molar mass, specific heat — and nothing is a tuning constant.
 *
 * Why enthalpy of fusion is the important column: it is the only thing besides
 * the melting point that the liquidus equation needs, so a compound's entire
 * melting behaviour — how far an impurity depresses it, where its eutectic with
 * another compound sits, how long it takes to melt in the capillary — follows
 * from these two numbers. Nothing about "sharpness" is stored anywhere.
 */

/** Gas constant, J mol⁻¹ K⁻¹. */
export const R = 8.314462618;
export const KELVIN = 273.15;

export const COMPOUNDS = {
  naphthalene: {
    id: 'naphthalene',
    label: 'Naphthalene',
    formula: 'C₁₀H₈',
    meltingPointC: 80.26,
    enthalpyFusion: 19060,      // J/mol
    molarMass: 128.17,          // g/mol
    specificHeat: 1.60,         // J g⁻¹ K⁻¹, solid near the melting point
    colour: [0.94, 0.94, 0.90], // white flakes
    habit: 'flake',
    sublimes: true,             // loses sample on standing and on re-running
    note: 'Coal-tar hydrocarbon. Sublimes appreciably below its melting point.',
  },
  benzoic: {
    id: 'benzoic',
    label: 'Benzoic acid',
    formula: 'C₆H₅COOH',
    meltingPointC: 122.35,
    enthalpyFusion: 18060,
    molarMass: 122.12,
    specificHeat: 1.20,
    colour: [0.97, 0.97, 0.95],
    habit: 'needle',
    sublimes: true,
    note: 'Recrystallised from hot water, so a badly dried sample carries water.',
  },
  urea: {
    id: 'urea',
    label: 'Urea',
    formula: '(NH₂)₂CO',
    meltingPointC: 132.7,
    enthalpyFusion: 13610,
    molarMass: 60.06,
    specificHeat: 1.34,
    colour: [0.98, 0.98, 0.96],
    habit: 'prism',
    sublimes: false,
    decomposesAboveC: 135,      // → biuret + ammonia, which is why it cannot be re-run
    decompositionProduct: 'biuret',
    note: 'Decomposes to biuret just above its melting point; a second run on the same capillary is not the same sample.',
  },
  acetanilide: {
    id: 'acetanilide',
    label: 'Acetanilide',
    formula: 'C₆H₅NHCOCH₃',
    meltingPointC: 114.3,
    enthalpyFusion: 21800,
    molarMass: 135.16,
    specificHeat: 1.31,
    colour: [0.96, 0.95, 0.92],
    habit: 'flake',
    sublimes: false,
    note: 'Recrystallised from water. The classic sharp-melting standard.',
  },

  /* ── Second components: congeners, decomposition products and the damp
        solvent a sample was recrystallised from. These are what "impure"
        actually means, and any of them can also be chosen deliberately for a
        mixed melting point. ─────────────────────────────────────────────── */
  biphenyl: {
    id: 'biphenyl',
    label: 'Biphenyl',
    formula: '(C₆H₅)₂',
    meltingPointC: 69.2,
    enthalpyFusion: 18570,
    molarMass: 154.21,
    specificHeat: 1.45,
    colour: [0.95, 0.95, 0.93],
    habit: 'flake',
    sublimes: true,
    note: 'Travels with naphthalene out of coal tar — the impurity a crude sample really contains.',
  },
  water: {
    id: 'water',
    label: 'Water (damp sample)',
    formula: 'H₂O',
    meltingPointC: 0.0,
    enthalpyFusion: 6010,
    molarMass: 18.015,
    specificHeat: 2.09,
    colour: [0.90, 0.94, 1.0],
    habit: 'none',
    sublimes: false,
    note: 'Not dried after recrystallisation. Low molar mass, so a little mass is a lot of moles — and it is moles that depress a melting point.',
  },
  biuret: {
    id: 'biuret',
    label: 'Biuret',
    formula: 'H₂NCONHCONH₂',
    meltingPointC: 193,
    enthalpyFusion: 20900,
    molarMass: 103.08,
    specificHeat: 1.30,
    colour: [0.97, 0.97, 0.94],
    habit: 'prism',
    sublimes: false,
    note: 'What urea becomes when it is overheated. It is why a re-run urea capillary melts lower than the first.',
  },
  salicylic: {
    id: 'salicylic',
    label: 'Salicylic acid',
    formula: 'C₆H₄(OH)COOH',
    meltingPointC: 158.6,
    enthalpyFusion: 24600,
    molarMass: 138.12,
    specificHeat: 1.26,
    colour: [0.98, 0.97, 0.94],
    habit: 'needle',
    sublimes: false,
    note: 'A different acid that looks exactly like benzoic acid in the bottle.',
  },
};

/** The compounds a student is asked to identify. The rest of the tray exists to
 *  contaminate them, or to be mixed with them. */
export const UNKNOWNS = ['naphthalene', 'benzoic', 'urea', 'acetanilide'];

/** What a crude sample of each is actually contaminated with. Not a generic
 *  "impurity": a named substance with its own melting point and enthalpy, so
 *  the eutectic it forms is a real one. */
export const NATIVE_IMPURITY = {
  naphthalene: 'biphenyl',
  benzoic: 'water',
  urea: 'biuret',
  acetanilide: 'water',
};

/** Mole fraction of the second component for each grade of sample. "Pure" is
 *  not zero, because no sample is: one part in ten thousand is about what a
 *  good recrystallisation leaves, and it is small enough that the eutectic melt
 *  never becomes visible. */
export const PURITY_MOLE_FRACTION = { pure: 1e-4, slight: 0.010, impure: 0.040 };

/** The baths, and the ceiling each one puts on the experiment. */
export const BATHS = {
  oil: {
    id: 'oil', label: 'Liquid paraffin', maxC: 250, smokesAboveC: 210,
    colour: [0.96, 0.86, 0.55], viscosity: 'thick',
    note: 'Convects freely in a Thiele tube and will carry you to 250 °C.',
  },
  water: {
    id: 'water', label: 'Water', maxC: 100, smokesAboveC: 1e9,
    colour: [0.86, 0.93, 1.0], viscosity: 'thin',
    note: 'Boils at 100 °C. Above that it cannot heat the sample at all, however long you wait.',
  },
};

/** Thermometers, by least count. The sharpness of a pure compound is a tenth of
 *  a degree, so the instrument decides whether the student can see it. */
export const THERMOMETERS = {
  t1:  { id: 't1',  label: '1 °C',   leastCount: 1.0, lagSeconds: 7.0 },
  t05: { id: 't05', label: '0.5 °C', leastCount: 0.5, lagSeconds: 6.0 },
  t02: { id: 't02', label: '0.2 °C', leastCount: 0.2, lagSeconds: 4.5 },
};

/**
 * The observational definition of "first drop".
 *
 * Physically the first trace of liquid appears at the eutectic temperature, no
 * matter how little impurity there is — but a film of melt at the grain
 * boundaries is invisible, and no student has ever recorded it. What is recorded
 * is the point at which the column visibly shrinks and wets: about a quarter
 * melted. This constant is the eye, not the thermodynamics, and it is written
 * here in the open rather than buried in a rendering tweak.
 */
export const LIQUID_VISIBLE_FRACTION = 0.25;

/** Earlier than that, a careful observer sees the column sinter — the grains
 *  round off and slump without a droplet forming. The simulation shows it,
 *  because the gap between sintering and the first drop is the whole reason an
 *  impure sample has a range at all. */
export const SINTER_FRACTION = 0.03;

/** Effective heat capacity of the capillary and its contents, expressed per
 *  gram of sample: the glass wall weighs several times what the sample does and
 *  has to be heated too. */
export const CAPILLARY_GLASS_RATIO = 5.0;
export const GLASS_SPECIFIC_HEAT = 0.75;   // J g⁻¹ K⁻¹

/** First-order thermal time constant of the capillary in stirred oil. Small
 *  mass, thin wall: it follows the bath closely, which is exactly why the
 *  thermometer — not the sample — is the slow instrument here. */
export const SAMPLE_LAG_SECONDS = 1.5;

/** Room temperature the bath starts from. */
export const AMBIENT_C = 27;
