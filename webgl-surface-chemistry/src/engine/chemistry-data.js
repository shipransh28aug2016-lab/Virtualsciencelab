/**
 * SURFACE CHEMISTRY — the reference data the engine reasons over.
 *
 * Nothing here is a scripted outcome. These are measured physical constants and
 * literature critical-coagulation concentrations; every observation the
 * simulation produces is computed from them at run time. If a value is not in
 * the table the engine falls back to the Schulze–Hardy z⁻⁶ law, which is why a
 * student can combine a sol and an electrolyte that no textbook tabulates and
 * still get a defensible answer.
 *
 * CBSE Class XII Chemistry (043), Unit: Surface Chemistry.
 */

/* ── Physical constants (SI) ───────────────────────────────────────────── */
export const K_B = 1.380649e-23;        // Boltzmann constant, J/K
export const N_A = 6.02214076e23;       // Avogadro constant, /mol
export const G = 9.80665;               // standard gravity, m/s²

/* Water at 298 K — the dispersion medium for every sol here. */
export const WATER = {
  viscosity: 8.9e-4,      // Pa·s  (η)
  density: 997,           // kg/m³ (ρ_f)
  refractiveIndex: 1.333,
};

/**
 * THE SOLS.
 *
 * `charge` is the sign of the charge the colloidal particle carries, and it is
 * the single most important field in this file: the Hardy–Schulze rule says the
 * ion that coagulates a sol is the one of OPPOSITE sign. Get this wrong and the
 * whole simulation inverts — K₃[Fe(CN)₆] would appear to be a feeble coagulant
 * for ferric hydroxide when in fact it is the most powerful electrolyte in the
 * set for it.
 *
 * `lyophilic` sols are solvent-loving: their particles carry a thick solvation
 * shell, so an electrolyte cannot bring them together until it has first
 * dehydrated them. They need roughly a thousand times more electrolyte, and
 * they act as protective colloids for lyophobic sols. That difference is the
 * examinable distinction, so it is a property of the material, not a special
 * case in the code.
 */
export const SOLS = {
  ferricHydroxide: {
    id: 'ferricHydroxide',
    label: 'Ferric hydroxide sol',
    formula: 'Fe(OH)₃',
    /* Relative absorbance at 650 / 550 / 450 nm. Iron(III) oxo-hydroxide's
       charge-transfer band sits in the blue, which is why the sol is brown. */
    absorbance: [1, 7, 20],
    charge: +1,                    // POSITIVE sol → coagulated by anions
    lyophilic: false,
    /* Adsorbs Fe³⁺ from its own hydrolysis, which is where the positive
       charge comes from. Prepared by hydrolysing FeCl₃ in boiling water. */
    origin: 'FeCl₃ + 3H₂O → Fe(OH)₃(sol) + 3HCl (hot water hydrolysis)',
    colour: [0.62, 0.28, 0.10],    // reddish-brown, linear sRGB
    particleRadius: 5.0e-8,        // 50 nm — inside the 1–1000 nm colloidal range
    numberDensity: 2.0e18,         // particles per m³ of a typical 0.1% sol
    zetaPotential_mV: +38,
  },
  arsenousSulphide: {
    id: 'arsenousSulphide',
    label: 'Arsenious sulphide sol',
    formula: 'As₂S₃',
    /* A 2.7 eV band gap: everything below ~460 nm is absorbed, the rest passes.
       That is the whole reason the sol is yellow. */
    absorbance: [1, 2, 25],
    charge: -1,                    // NEGATIVE sol → coagulated by cations
    lyophilic: false,
    origin: 'As₂O₃ + 3H₂S → As₂S₃(sol) + 3H₂O',
    colour: [0.86, 0.74, 0.20],    // lemon-yellow
    particleRadius: 3.0e-8,        // 30 nm
    numberDensity: 4.0e18,
    zetaPotential_mV: -42,
  },
  starch: {
    id: 'starch',
    label: 'Starch sol',
    formula: '(C₆H₁₀O₅)ₙ',
    absorbance: [1, 1, 1.4],          // colourless; the faint blue is scattering, not pigment
    charge: -1,                    // weakly negative
    lyophilic: true,               // solvent-loving, reversible, self-stabilising
    origin: 'Starch dispersed in hot water — a macromolecular (lyophilic) sol',
    colour: [0.93, 0.93, 0.90],    // milky white
    particleRadius: 4.0e-8,
    numberDensity: 3.0e18,
    zetaPotential_mV: -12,
    /* Freundlich gold number: mg of this sol that just prevents the coagulation
       of 10 mL of standard gold sol by 1 mL of 10% NaCl. Smaller is better. */
    goldNumber: 25,
  },
  gumArabic: {
    id: 'gumArabic',
    label: 'Gum arabic sol',
    formula: 'Arabinogalactan',
    absorbance: [1, 1.1, 1.6],        // very pale straw
    charge: -1,
    lyophilic: true,
    origin: 'Acacia gum dissolved in water — a lyophilic protective colloid',
    colour: [0.88, 0.84, 0.68],
    particleRadius: 6.0e-8,
    numberDensity: 2.5e18,
    zetaPotential_mV: -18,
    goldNumber: 0.15,              // far more protective than starch
  },
};

/**
 * THE ELECTROLYTES.
 *
 * Each carries the ions it releases, with the charge number of each. The engine
 * chooses which of them is doing the work from the sol's sign — it never
 * assumes the "valency of the electrolyte", because that phrase has no meaning
 * for a salt like K₃[Fe(CN)₆], whose cation is monovalent and whose anion is
 * trivalent. Which of the two matters depends entirely on the sol.
 */
export const ELECTROLYTES = {
  NaCl: {
    id: 'NaCl', label: 'Sodium chloride', formula: 'NaCl',
    ions: [{ symbol: 'Na⁺', z: +1, n: 1 }, { symbol: 'Cl⁻', z: -1, n: 1 }],
  },
  BaCl2: {
    id: 'BaCl2', label: 'Barium chloride', formula: 'BaCl₂',
    ions: [{ symbol: 'Ba²⁺', z: +2, n: 1 }, { symbol: 'Cl⁻', z: -1, n: 2 }],
  },
  AlCl3: {
    id: 'AlCl3', label: 'Aluminium chloride', formula: 'AlCl₃',
    ions: [{ symbol: 'Al³⁺', z: +3, n: 1 }, { symbol: 'Cl⁻', z: -1, n: 3 }],
  },
  K2SO4: {
    id: 'K2SO4', label: 'Potassium sulphate', formula: 'K₂SO₄',
    ions: [{ symbol: 'K⁺', z: +1, n: 2 }, { symbol: 'SO₄²⁻', z: -2, n: 1 }],
  },
  K3FeCN6: {
    id: 'K3FeCN6', label: 'Potassium ferricyanide', formula: 'K₃[Fe(CN)₆]',
    ions: [{ symbol: 'K⁺', z: +1, n: 3 }, { symbol: '[Fe(CN)₆]³⁻', z: -3, n: 1 }],
  },
};

/**
 * MEASURED CRITICAL COAGULATION CONCENTRATIONS, in mmol/L.
 *
 * The concentration at which coagulation becomes rapid — the point where the
 * electrical double layer has been compressed enough that essentially every
 * Brownian collision sticks. Values from Freundlich's classical series, which
 * is where the Hardy–Schulze rule came from in the first place.
 *
 * Read the As₂S₃ row as a demonstration of the rule: 51 → 0.69 → 0.093 as the
 * CATION goes 1+ → 2+ → 3+, a factor of about 550 across two steps, while
 * K₃[Fe(CN)₆] — trivalent, but in its ANION — does almost nothing to it.
 *
 * Read the Fe(OH)₃ row as the proof that it is the counter-ion that counts:
 * NaCl and BaCl₂ have nearly the SAME coagulating power on it (9.25 vs 9.65),
 * because for a positive sol both are simply sources of Cl⁻.
 */
export const MEASURED_CCC_mM = {
  arsenousSulphide: { NaCl: 51.0, BaCl2: 0.69, AlCl3: 0.093, K2SO4: 65.5, K3FeCN6: 74.0 },
  ferricHydroxide: { NaCl: 9.25, BaCl2: 9.65, AlCl3: 11.6, K2SO4: 0.205, K3FeCN6: 0.096 },
};

/**
 * How much harder it is to coagulate a lyophilic sol. The solvation shell has
 * to be stripped before the particles can touch, so the electrolyte
 * requirement rises by orders of magnitude — which is why gelatin and gum are
 * added to protect a lyophobic sol rather than to precipitate it.
 */
export const LYOPHILIC_CCC_FACTOR = 60;

/**
 * And an electrolyte cannot be more concentrated than its own solubility. The
 * factor above puts a lyophilic sol's requirement into the molar range — which
 * is exactly where salting out happens for gelatin and starch — but for the
 * weaker electrolytes it lands beyond what will dissolve. Saying so is the
 * lesson: a lyophilic sol is not coagulated by adding salt at all. It is
 * coagulated by taking the solvent away, with alcohol or acetone, and only then
 * does an electrolyte finish the job.
 */
export const SATURATION_LIMIT_mM = 5000;   // ≈ 5 M, near the solubility of NaCl

/** 100 mL of sol — the volume in the beaker, and the only thing that says how
 *  few clusters "all of it in one lump" actually is. */
export const BEAKER_VOLUME_M3 = 1.0e-4;

/**
 * Reerink–Overbeek slope. Below the CCC the Fuchs stability ratio W rises
 * steeply as the concentration falls, W = (CCC/C)^β, and β of 2–4 matches the
 * measured log W against log C lines for aqueous sols.
 */
export const STABILITY_EXPONENT = 3.2;

/**
 * Fractal dimension of the aggregates — the number that decides both how large
 * a floc gets and how fast it falls.
 *
 * Idealised diffusion-limited cluster aggregation, simulated in a dilute box with
 * no restructuring, gives d_f ≈ 1.8, and that figure is quoted often enough to be
 * worth naming. It is not what a beaker contains. Real aggregates restructure as
 * they grow and as the liquid shears them, and light-scattering and settling
 * measurements on coagulated sols and on alum flocs give 2.1–2.6. The measured
 * range is used here, because the point of the simulation is to reproduce what a
 * student sees settle — and the difference is not small: at half a millimetre,
 * d_f = 1.8 predicts a floc that takes an hour to fall through the beaker and
 * d_f = 2.2 one that takes three minutes, which is what actually happens.
 */
export const FRACTAL_DIM_FAST = 2.1;   // rapid, above the CCC: open but restructured
export const FRACTAL_DIM_SLOW = 2.4;   // slow, below it: denser still, more compact

/**
 * Shear breaks flocs as well as building them. A floc grows until the
 * hydrodynamic stress across it exceeds its own strength, which puts a ceiling
 * on size of R_max ≈ C/√G — the Tambo–François relation, with the exponent
 * near a half for aqueous flocs. The constant is set from alum-floc practice:
 * about half a millimetre at a gentle G = 20 s⁻¹.
 *
 * This is why water-treatment plants flocculate GENTLY, and why a student who
 * shakes the beaker hard gets a cloud of small dense flocs instead of the big
 * flakes they were after. Stirring harder is not stirring better.
 */
export const FLOC_STRENGTH_C = 2.24e-3;   // m·s^-½  →  R_max = C/√G

/**
 * Charge reversal. Enough of a highly charged counter-ion does not merely
 * neutralise the particle — it over-adsorbs, reverses the sign of the zeta
 * potential and RE-STABILISES the sol. A student who pours in aluminium
 * chloride expecting more precipitate can watch it redisperse instead, which is
 * a real and instructive failure, not a bug.
 */
export const CHARGE_REVERSAL_MULTIPLE = 120;   // × CCC, for z ≥ 3 counter-ions
