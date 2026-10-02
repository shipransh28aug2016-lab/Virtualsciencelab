/**
 * The aqueous chemistry of a qualitative-analysis bench, as data: what the components are, what they
 * form with one another and with water, what comes out of solution, and how it looks. Everything
 * here is a measured constant at 25 °C and zero ionic strength (NIST critical stability constants,
 * Baes & Mesmer for hydrolysis, the CRC solubility products); what a tube DOES is never written
 * down here — it is whatever the speciation solver finds when these are put together.
 *
 * The convention of shared/equilibria/speciate.js: a species is a combination of components,
 * `nu` counts them (OH⁻ is −H⁺), `logK` is the formation constant. A solid is written as it
 * dissolves, so a hydroxide is  M(OH)ₙ + nH⁺ → Mⁿ⁺ + nH₂O  with the constant log*Ks0.
 *
 * Hydroxo complexes are quoted below by their cumulative OH⁻ constant log βₙ and converted.
 */
export const PKW = 13.995;
const oh = (beta, n) => beta - PKW * n;

export const COMPONENTS = [
  { id: 'H', z: 1 }, { id: 'Cu', z: 2 }, { id: 'Fe', z: 3 }, { id: 'Fe2', z: 2 }, { id: 'Zn', z: 2 }, { id: 'Ca', z: 2 }, { id: 'Pb', z: 2 },
  { id: 'Ba', z: 2 }, { id: 'Al', z: 3 }, { id: 'Ag', z: 1 }, { id: 'NH3', z: 0 },
  { id: 'CO3', z: -2 }, { id: 'SO4', z: -2 }, { id: 'ox', z: -2 }, { id: 'Cl', z: -1 }, { id: 'CrO4', z: -2 }, { id: 'FC', z: -4 }, { id: 'SCN', z: -1 }, { id: 'OAc', z: -1 },
  { id: 'CN', z: -1 }, { id: 'S', z: -2 }, { id: 'NP', z: -2 },
];

const sp = (id, z, nu, logK, dH = 0) => ({ id, z, nu, logK, dH });

export const SPECIES = [
  /* Water, and the acid–base chemistry of the anions and of ammonia. */
  sp('OH', -1, { H: -1 }, -PKW, 55.8),
  sp('HCO3', -1, { CO3: 1, H: 1 }, 10.329, -14.7),
  sp('H2CO3', 0, { CO3: 1, H: 2 }, 16.681, -23.8),
  sp('NH4', 1, { NH3: 1, H: 1 }, 9.244, -52.2),
  sp('HOx', -1, { ox: 1, H: 1 }, 4.266),
  sp('H2Ox', 0, { ox: 1, H: 2 }, 5.518),
  sp('HSO4', -1, { SO4: 1, H: 1 }, 1.99, -22),
  sp('HOAc', 0, { OAc: 1, H: 1 }, 4.757),
  sp('HCrO4', -1, { CrO4: 1, H: 1 }, 6.51),
  sp('Cr2O7', -2, { CrO4: 2, H: 2 }, 14.56),
  sp('HCN', 0, { CN: 1, H: 1 }, 9.21, -43.6),
  sp('HS', -1, { S: 1, H: 1 }, 13.9),
  sp('H2S', 0, { S: 1, H: 2 }, 20.92),
  sp('AgCN2', -1, { Ag: 1, CN: 2 }, 21.1),
  /* [Fe(CN)₅NO]²⁻ + S²⁻ → [Fe(CN)₅NOS]⁴⁻, the violet of the nitroprusside test. Its constant is not in the tables I can cite; 10^4.5 reproduces the
     detection limit usually quoted for the test (about 1 mg of sulfide per litre) and, at the reagent's strength, takes the sulfide up almost completely. */
  sp('NPS', -4, { NP: 1, S: 1 }, 4.5),
  sp('HFC', -3, { FC: 1, H: 1 }, 4.17),
  sp('H2FC', -2, { FC: 1, H: 2 }, 6.37),

  /* Copper(II). */
  sp('CuOH', 1, { Cu: 1, H: -1 }, oh(6.3, 1)),
  sp('CuOH2', 0, { Cu: 1, H: -2 }, oh(12.8, 2)),
  sp('CuOH3', -1, { Cu: 1, H: -3 }, oh(14.5, 3)),
  sp('CuOH4', -2, { Cu: 1, H: -4 }, oh(15.6, 4)),
  sp('CuSO4', 0, { Cu: 1, SO4: 1 }, 2.36),
  sp('CuNH3', 2, { Cu: 1, NH3: 1 }, 4.31),
  sp('CuNH3_2', 2, { Cu: 1, NH3: 2 }, 7.98),
  sp('CuNH3_3', 2, { Cu: 1, NH3: 3 }, 11.02),
  sp('CuNH3_4', 2, { Cu: 1, NH3: 4 }, 13.32),
  sp('CuCl', 1, { Cu: 1, Cl: 1 }, 0.43),

  /* Iron(III) and iron(II). */
  sp('FeOH', 2, { Fe: 1, H: -1 }, -2.19, 43),
  sp('FeOH2', 1, { Fe: 1, H: -2 }, -5.7),
  sp('FeOH4', -1, { Fe: 1, H: -4 }, -21.6),
  sp('Fe2OH2', 4, { Fe: 2, H: -2 }, -2.95),
  sp('FeCl', 2, { Fe: 1, Cl: 1 }, 1.48),
  sp('FeCl2', 1, { Fe: 1, Cl: 2 }, 2.13),
  sp('FeSO4', 1, { Fe: 1, SO4: 1 }, 4.04),
  sp('FeSO4_2', -1, { Fe: 1, SO4: 2 }, 5.38),
  sp('FeSCN', 2, { Fe: 1, SCN: 1 }, 2.95, -20),
  sp('FeSCN2', 1, { Fe: 1, SCN: 2 }, 4.6),
  sp('Feox', 1, { Fe: 1, ox: 1 }, 9.4),
  sp('Feox2', -1, { Fe: 1, ox: 2 }, 16.2),
  sp('Feox3', -3, { Fe: 1, ox: 3 }, 20.2),
  sp('Fe2OH', 1, { Fe2: 1, H: -1 }, -9.5),
  sp('Fe2OH2aq', 0, { Fe2: 1, H: -2 }, -20.6),
  sp('Fe2SO4', 0, { Fe2: 1, SO4: 1 }, 2.2),

  /* Zinc. */
  sp('ZnOH', 1, { Zn: 1, H: -1 }, oh(5.0, 1)),
  sp('ZnOH2', 0, { Zn: 1, H: -2 }, oh(11.1, 2)),
  sp('ZnOH3', -1, { Zn: 1, H: -3 }, oh(13.6, 3)),
  sp('ZnOH4', -2, { Zn: 1, H: -4 }, oh(15.5, 4)),
  sp('ZnNH3', 2, { Zn: 1, NH3: 1 }, 2.37),
  sp('ZnNH3_2', 2, { Zn: 1, NH3: 2 }, 4.81),
  sp('ZnNH3_3', 2, { Zn: 1, NH3: 3 }, 7.31),
  sp('ZnNH3_4', 2, { Zn: 1, NH3: 4 }, 9.46),
  sp('ZnSO4', 0, { Zn: 1, SO4: 1 }, 2.34),

  /* Lead. */
  sp('PbOH', 1, { Pb: 1, H: -1 }, oh(6.3, 1)),
  sp('PbOH2', 0, { Pb: 1, H: -2 }, oh(10.9, 2)),
  sp('PbOH3', -1, { Pb: 1, H: -3 }, oh(13.9, 3)),
  sp('PbCl', 1, { Pb: 1, Cl: 1 }, 1.6, 8),
  sp('PbCl2', 0, { Pb: 1, Cl: 2 }, 1.8, 8),
  sp('PbCl3', -1, { Pb: 1, Cl: 3 }, 1.7, 8),
  sp('PbSO4', 0, { Pb: 1, SO4: 1 }, 2.7),
  sp('PbOAc', 1, { Pb: 1, OAc: 1 }, 2.68),
  sp('PbOAc2', 0, { Pb: 1, OAc: 2 }, 4.08),

  /* Barium, calcium. */
  sp('BaOH', 1, { Ba: 1, H: -1 }, oh(0.64, 1)),
  sp('BaSO4', 0, { Ba: 1, SO4: 1 }, 2.7),
  sp('BaCO3', 0, { Ba: 1, CO3: 1 }, 2.7),
  sp('CaOH', 1, { Ca: 1, H: -1 }, oh(1.3, 1)),
  sp('CaSO4', 0, { Ca: 1, SO4: 1 }, 2.31),
  sp('CaCO3', 0, { Ca: 1, CO3: 1 }, 3.22),
  sp('CaHCO3', 1, { Ca: 1, CO3: 1, H: 1 }, 11.43),
  sp('CaOx', 0, { Ca: 1, ox: 1 }, 3.0),

  /* Aluminium. */
  sp('AlOH', 2, { Al: 1, H: -1 }, -4.99),
  sp('AlOH2', 1, { Al: 1, H: -2 }, -10.1),
  sp('AlOH3', 0, { Al: 1, H: -3 }, -16.0),
  sp('AlOH4', -1, { Al: 1, H: -4 }, -22.9),
  sp('AlSO4', 1, { Al: 1, SO4: 1 }, 3.2),
  sp('AlSO4_2', -1, { Al: 1, SO4: 2 }, 5.1),
  sp('Alox', 1, { Al: 1, ox: 1 }, 6.1),
  sp('Alox2', -1, { Al: 1, ox: 2 }, 11.09),
  sp('Alox3', -3, { Al: 1, ox: 3 }, 15.12),

  /* Silver. */
  sp('AgCl', 0, { Ag: 1, Cl: 1 }, 3.3),
  sp('AgCl2', -1, { Ag: 1, Cl: 2 }, 5.04),
  sp('AgNH3', 1, { Ag: 1, NH3: 1 }, 3.32),
  sp('AgNH3_2', 1, { Ag: 1, NH3: 2 }, 7.24),
  sp('AgOH', 0, { Ag: 1, H: -1 }, oh(2.0, 1)),
  sp('AgOH2', -1, { Ag: 1, H: -2 }, oh(3.99, 2)),
];

const so = (id, nu, logKsp, dH = 0, extra = {}) => ({ id, nu, logKsp, dH, ...extra });

/** Solids, as they dissolve. `minT`/`maxT`: the form that is stable in a temperature window (a hot hydroxide is its oxide); `unless`: components whose presence rules the solid out. */
export const SOLIDS = [
  so('CuOH2', { Cu: 1, H: -2 }, 8.34, 0, { maxT: 65 }),
  so('CuO', { Cu: 1, H: -2 }, 7.65, 0, { minT: 65 }),
  so('CuCO3', { Cu: 1, CO3: 1 }, -9.85),
  so('CuC2O4', { Cu: 1, ox: 1 }, -9.36),
  so('Cu2FC', { Cu: 2, FC: 1 }, -15.9),
  so('FeOH3', { Fe: 1, H: -3 }, 3.2),
  so('FeOH2s', { Fe2: 1, H: -2 }, 11.68),
  so('FeC2O4', { Fe2: 1, ox: 1 }, -6.7),
  /* White ferrous ferrocyanide: with iron(III) about it is turned blue (the lattice Fe(II) is oxidised by Fe³⁺), so it is only a candidate where there is none. */
  so('Fe2FC', { Fe2: 2, FC: 1 }, -17, 0, { unless: ['Fe'] }),
  so('PrussianBlue', { Fe: 4, FC: 3 }, -44),
  so('ZnOH2', { Zn: 1, H: -2 }, 11.49),
  so('ZnCO3', { Zn: 1, CO3: 1 }, -10.8),
  so('ZnC2O4', { Zn: 1, ox: 1 }, -8.9),
  so('Zn2FC', { Zn: 2, FC: 1 }, -15.4),
  so('PbOH2s', { Pb: 1, H: -2 }, 13.3),
  so('PbCl2s', { Pb: 1, Cl: 2 }, -4.79, 26),
  so('PbSO4s', { Pb: 1, SO4: 1 }, -7.8),
  so('PbCO3s', { Pb: 1, CO3: 1 }, -13.1),
  so('PbC2O4', { Pb: 1, ox: 1 }, -9.3),
  so('PbCrO4', { Pb: 1, CrO4: 1 }, -12.6),
  so('Pb2FC', { Pb: 2, FC: 1 }, -18),
  so('BaSO4s', { Ba: 1, SO4: 1 }, -9.96, 26),
  so('BaCO3s', { Ba: 1, CO3: 1 }, -8.56),
  so('BaC2O4', { Ba: 1, ox: 1 }, -6.8),
  so('BaCrO4', { Ba: 1, CrO4: 1 }, -9.93),
  so('CaCO3s', { Ca: 1, CO3: 1 }, -8.48, -12),
  so('CaC2O4s', { Ca: 1, ox: 1 }, -8.64),
  so('CaSO4s', { Ca: 1, SO4: 1 }, -4.61),
  so('CaOH2', { Ca: 1, H: -2 }, 23.09, -16.7),
  so('AlOH3s', { Al: 1, H: -3 }, 10.8),
  so('AgCls', { Ag: 1, Cl: 1 }, -9.75, 65.7),
  so('Ag2SO4', { Ag: 2, SO4: 1 }, -4.85, 17),
  so('Ag2CO3', { Ag: 2, CO3: 1 }, -11.07),
  so('Ag2C2O4', { Ag: 2, ox: 1 }, -10.5),
  so('Ag2CrO4', { Ag: 2, CrO4: 1 }, -11.95),
  so('Ag2O', { Ag: 2, H: -2 }, 12.59),
  so('Ag4FC', { Ag: 4, FC: 1 }, -40.8),
  so('AgSCNs', { Ag: 1, SCN: 1 }, -12.0),
  so('AgCNs', { Ag: 1, CN: 1 }, -16.2),
  so('Ag2S', { Ag: 2, S: 1 }, -49.7),
  so('PbS', { Pb: 1, S: 1 }, -27.5),
  so('FeS', { Fe2: 1, S: 1 }, -18.2),
  /* Carbon dioxide gas at one atmosphere: it forms when dissolved H₂CO₃* would exceed its solubility (K_H = 10^−1.47 M/atm). */
  so('CO2g', { CO3: 1, H: 2 }, -18.151, 4.4),
];

/** How a solid looks, and how it behaves in the tube. `M` g/mol; `tau`: seconds to settle; `look`: the word for it. */
export const SOLID_INFO = {
  CuOH2: { name: 'copper(II) hydroxide', look: 'pale blue', hex: '#8fc4ea', texture: 'gelatinous', M: 97.56, tau: 80 },
  CuO: { name: 'copper(II) oxide', look: 'black', hex: '#1c1c1c', texture: 'granular', M: 79.55, tau: 12 },
  CuCO3: { name: 'copper(II) carbonate', look: 'blue-green', hex: '#5fb8a5', texture: 'fine', M: 123.6, tau: 50 },
  CuC2O4: { name: 'copper(II) oxalate', look: 'pale blue', hex: '#a9cfe6', texture: 'fine', M: 151.6, tau: 40 },
  Cu2FC: { name: 'copper(II) hexacyanoferrate(II)', look: 'chocolate-brown', hex: '#6d3a22', texture: 'gelatinous', M: 339, tau: 60 },
  FeOH3: { name: 'iron(III) hydroxide', look: 'reddish-brown', hex: '#8c3b1a', texture: 'gelatinous', M: 106.9, tau: 110 },
  FeOH2s: { name: 'iron(II) hydroxide', look: 'dirty green', hex: '#7c9a72', texture: 'gelatinous', M: 89.9, tau: 90 },
  FeC2O4: { name: 'iron(II) oxalate', look: 'yellow', hex: '#e2c85a', texture: 'fine', M: 143.9, tau: 40 },
  Fe2FC: { name: 'iron(II) hexacyanoferrate(II)', look: 'white', hex: '#e8ecef', texture: 'fine', M: 323.6, tau: 60 },
  PrussianBlue: { name: 'iron(III) hexacyanoferrate(II)', look: 'intense blue', hex: '#10358c', texture: 'colloidal', M: 859.2, tau: 400 },
  ZnOH2: { name: 'zinc hydroxide', look: 'white', hex: '#f1f1ec', texture: 'gelatinous', M: 99.4, tau: 80 },
  ZnCO3: { name: 'zinc carbonate', look: 'white', hex: '#f1f1ec', texture: 'fine', M: 125.4, tau: 40 },
  ZnC2O4: { name: 'zinc oxalate', look: 'white', hex: '#f4f4ef', texture: 'fine', M: 153.4, tau: 30 },
  Zn2FC: { name: 'zinc hexacyanoferrate(II)', look: 'white', hex: '#e6eef2', texture: 'gelatinous', M: 342.7, tau: 70 },
  PbOH2s: { name: 'lead(II) hydroxide', look: 'white', hex: '#f4f4f0', texture: 'fine', M: 241.2, tau: 35 },
  PbCl2s: { name: 'lead(II) chloride', look: 'white', hex: '#f6f6f2', texture: 'crystalline', M: 278.1, tau: 10 },
  PbSO4s: { name: 'lead(II) sulfate', look: 'white', hex: '#f7f7f4', texture: 'dense', M: 303.3, tau: 12 },
  PbCO3s: { name: 'lead(II) carbonate', look: 'white', hex: '#f4f4f0', texture: 'dense', M: 267.2, tau: 15 },
  PbC2O4: { name: 'lead(II) oxalate', look: 'white', hex: '#f4f4f0', texture: 'dense', M: 295.2, tau: 15 },
  Pb2FC: { name: 'lead(II) hexacyanoferrate(II)', look: 'white', hex: '#f1f1ee', texture: 'fine', M: 484.5, tau: 40 },
  PbCrO4: { name: 'lead(II) chromate', look: 'yellow', hex: '#f0c419', texture: 'dense', M: 323.2, tau: 15 },
  BaSO4s: { name: 'barium sulfate', look: 'white', hex: '#fafafa', texture: 'fine, milky', M: 233.4, tau: 90 },
  BaCO3s: { name: 'barium carbonate', look: 'white', hex: '#f6f6f3', texture: 'fine', M: 197.3, tau: 40 },
  BaC2O4: { name: 'barium oxalate', look: 'white', hex: '#f6f6f3', texture: 'fine', M: 225.3, tau: 40 },
  BaCrO4: { name: 'barium chromate', look: 'pale yellow', hex: '#f0e36a', texture: 'fine', M: 253.3, tau: 40 },
  CaCO3s: { name: 'calcium carbonate', look: 'white', hex: '#f8f8f5', texture: 'fine, milky', M: 100.1, tau: 70 },
  CaC2O4s: { name: 'calcium oxalate', look: 'white', hex: '#f8f8f5', texture: 'fine', M: 146.1, tau: 50 },
  CaSO4s: { name: 'calcium sulfate', look: 'white', hex: '#f4f4f0', texture: 'crystalline', M: 172.2, tau: 20 },
  CaOH2: { name: 'calcium hydroxide', look: 'white', hex: '#f4f4f0', texture: 'fine', M: 74.1, tau: 40 },
  AlOH3s: { name: 'aluminium hydroxide', look: 'white', hex: '#eef0f2', texture: 'gelatinous', M: 78.0, tau: 140 },
  AgCls: { name: 'silver chloride', look: 'white', hex: '#f3f3ee', texture: 'curdy', M: 143.3, tau: 25 },
  Ag2SO4: { name: 'silver sulfate', look: 'white', hex: '#f4f4f0', texture: 'crystalline', M: 311.8, tau: 8 },
  Ag2CO3: { name: 'silver carbonate', look: 'pale yellow', hex: '#e9e4a2', texture: 'fine', M: 275.7, tau: 30 },
  Ag2C2O4: { name: 'silver oxalate', look: 'white', hex: '#f2f2ee', texture: 'fine', M: 303.8, tau: 30 },
  Ag2CrO4: { name: 'silver chromate', look: 'brick-red', hex: '#8f2f1c', texture: 'fine', M: 331.7, tau: 40 },
  Ag2O: { name: 'silver oxide', look: 'brown', hex: '#5d3b28', texture: 'fine', M: 231.7, tau: 30 },
  Ag4FC: { name: 'silver hexacyanoferrate(II)', look: 'white', hex: '#eeeeea', texture: 'curdy', M: 643.4, tau: 40 },
  AgSCNs: { name: 'silver thiocyanate', look: 'white', hex: '#f3f3ee', texture: 'curdy', M: 166, tau: 25 },
  AgCNs: { name: 'silver cyanide', look: 'white', hex: '#f1f1ec', texture: 'curdy', M: 133.9, tau: 25 },
  Ag2S: { name: 'silver sulfide', look: 'black', hex: '#161616', texture: 'fine', M: 247.8, tau: 60 },
  PbS: { name: 'lead(II) sulfide', look: 'black', hex: '#141414', texture: 'dense', M: 239.3, tau: 25 },
  FeS: { name: 'iron(II) sulfide', look: 'black', hex: '#1a1a1a', texture: 'fine', M: 87.9, tau: 40 },
  CO2g: { name: 'carbon dioxide', gas: true, M: 44.01 },
};

/** Absorption bands (λ₀ nm, ε M⁻¹cm⁻¹, σ nm) of the species that colour a solution; every other species is colourless. */
export const BANDS = {
  Cu: [{ l0: 810, eps: 11.5, sigma: 130 }, { l0: 240, eps: 3000, sigma: 30 }],
  CuOH: [{ l0: 770, eps: 40, sigma: 140 }],
  CuSO4: [{ l0: 800, eps: 14, sigma: 130 }],
  CuNH3: [{ l0: 700, eps: 30, sigma: 110 }],
  CuNH3_2: [{ l0: 650, eps: 40, sigma: 100 }],
  CuNH3_3: [{ l0: 620, eps: 50, sigma: 90 }],
  CuNH3_4: [{ l0: 600, eps: 56, sigma: 85 }, { l0: 310, eps: 3500, sigma: 35 }],
  CuOH4: [{ l0: 640, eps: 40, sigma: 110 }],
  CuCl: [{ l0: 800, eps: 12, sigma: 130 }, { l0: 250, eps: 3000, sigma: 30 }],
  FeOH: [{ l0: 335, eps: 1500, sigma: 32 }, { l0: 400, eps: 260, sigma: 38 }],
  FeOH2: [{ l0: 355, eps: 3500, sigma: 40 }, { l0: 410, eps: 420, sigma: 40 }],
  Fe2OH2: [{ l0: 335, eps: 4000, sigma: 38 }, { l0: 400, eps: 500, sigma: 40 }],
  FeCl: [{ l0: 330, eps: 4500, sigma: 38 }, { l0: 405, eps: 300, sigma: 40 }],
  FeCl2: [{ l0: 345, eps: 4500, sigma: 40 }, { l0: 410, eps: 380, sigma: 42 }],
  FeSO4: [{ l0: 320, eps: 3000, sigma: 38 }, { l0: 400, eps: 180, sigma: 40 }],
  FeSO4_2: [{ l0: 330, eps: 3500, sigma: 38 }, { l0: 400, eps: 220, sigma: 40 }],
  FeSCN: [{ l0: 447, eps: 4022, sigma: 40 }, { l0: 510, eps: 1500, sigma: 50 }],
  FeSCN2: [{ l0: 455, eps: 5800, sigma: 45 }, { l0: 520, eps: 2500, sigma: 55 }],
  Feox: [{ l0: 405, eps: 90, sigma: 55 }],
  Feox2: [{ l0: 405, eps: 160, sigma: 55 }],
  Feox3: [{ l0: 410, eps: 260, sigma: 60 }, { l0: 575, eps: 25, sigma: 70 }],
  Fe2: [{ l0: 960, eps: 2.2, sigma: 170 }, { l0: 400, eps: 2.5, sigma: 45 }],
  CrO4: [{ l0: 372, eps: 4800, sigma: 42 }, { l0: 270, eps: 3000, sigma: 30 }],
  HCrO4: [{ l0: 350, eps: 1800, sigma: 42 }, { l0: 440, eps: 500, sigma: 60 }],
  Cr2O7: [{ l0: 350, eps: 2300, sigma: 42 }, { l0: 445, eps: 330, sigma: 55 }],
  FC: [{ l0: 325, eps: 1000, sigma: 35 }, { l0: 420, eps: 2.5, sigma: 40 }],
  HFC: [{ l0: 325, eps: 1000, sigma: 35 }, { l0: 420, eps: 2.5, sigma: 40 }],
  H2FC: [{ l0: 325, eps: 1000, sigma: 35 }],
  NP: [{ l0: 498, eps: 8, sigma: 60 }, { l0: 395, eps: 25, sigma: 40 }],
  NPS: [{ l0: 565, eps: 6000, sigma: 55 }, { l0: 400, eps: 600, sigma: 50 }],
  PbOAc: [],
};

/**
 * The shelf. `conc` is mmol per mL (= mol/L) of each component or spectator (Na, K, NO3, Fe2 is a component). An acid
 * is its anion alone and a base its cation alone: the proton count is not kept, because the charge balance of the
 * solution — which is what the solver solves — is the proton balance.
 */
export const REAGENTS = [
  { id: 'hcl', label: 'Dilute hydrochloric acid', short: 'HCl', formula: '2 M HCl', conc: { Cl: 2 }, swatch: '#e6eef7', maxUnits: 40 },
  { id: 'h2so4', label: 'Dilute sulfuric acid', short: 'H₂SO₄', formula: '1 M H₂SO₄', conc: { SO4: 1 }, swatch: '#e6eef7' },
  { id: 'hno3', label: 'Dilute nitric acid', short: 'HNO₃', formula: '2 M HNO₃', conc: { NO3: 2 }, swatch: '#f2efe2' },
  { id: 'naoh', label: 'Sodium hydroxide, dilute', short: 'NaOH', formula: '2 M NaOH', conc: { Na: 2 }, swatch: '#dfe9f4', maxUnits: 80 },
  { id: 'naohc', label: 'Sodium hydroxide, concentrated', short: 'NaOH c', formula: '6 M NaOH', conc: { Na: 6 }, swatch: '#cfdcec' },
  { id: 'nh4oh', label: 'Ammonia solution, dilute', short: 'NH₄OH', formula: '2 M NH₃', conc: { NH3: 2 }, swatch: '#dff0f4', maxUnits: 100 },
  { id: 'nh4ohc', label: 'Ammonia solution, concentrated', short: 'NH₄OH c', formula: '14 M NH₃', conc: { NH3: 14 }, swatch: '#d4ecf1', maxUnits: 30 },
  { id: 'bacl2', label: 'Barium chloride', short: 'BaCl₂', formula: '0.5 M BaCl₂', conc: { Ba: 0.5, Cl: 1 }, swatch: '#eceff3' },
  { id: 'agno3', label: 'Silver nitrate', short: 'AgNO₃', formula: '0.1 M AgNO₃', conc: { Ag: 0.1, NO3: 0.1 }, swatch: '#f4f1e6' },
  { id: 'k4fec', label: 'Potassium hexacyanoferrate(II)', short: 'K₄Fe(CN)₆', formula: '0.1 M K₄[Fe(CN)₆]', conc: { FC: 0.1, K: 0.4 }, swatch: '#f2e6a0' },
  { id: 'kscn', label: 'Potassium thiocyanate', short: 'KSCN', formula: '0.1 M KSCN', conc: { SCN: 0.1, K: 0.1 }, swatch: '#eceff3' },
  { id: 'k2cro4', label: 'Potassium chromate', short: 'K₂CrO₄', formula: '0.1 M K₂CrO₄', conc: { CrO4: 0.1, K: 0.2 }, swatch: '#f2d23c' },
  { id: 'nh4ox', label: 'Ammonium oxalate', short: '(NH₄)₂C₂O₄', formula: '0.25 M (NH₄)₂C₂O₄', conc: { NH3: 0.5, ox: 0.25 }, swatch: '#eceff3' },
  { id: 'cacl2', label: 'Calcium chloride', short: 'CaCl₂', formula: '0.25 M CaCl₂', conc: { Ca: 0.25, Cl: 0.5 }, swatch: '#eceff3' },
  { id: 'feso4', label: 'Iron(II) sulfate, fresh', short: 'FeSO₄', formula: '0.5 M FeSO₄', conc: { Fe2: 0.5, SO4: 0.5 }, swatch: '#bfe3c2' },
  { id: 'h2so4c', label: 'Concentrated sulfuric acid', short: 'H₂SO₄ c', formula: '18 M H₂SO₄', conc: { SO4: 18 }, swatch: '#f0e8d0', kind: 'concAcid', maxUnits: 10 },
];

/** Henry's law for ammonia: [NH₃]aq = K_H·p, K_H = 57 M/atm at 25 °C, ΔH(solution) = −34.2 kJ/mol. */
export const HENRY_NH3 = { K25: 57, dH: -34.2 };

/** Lime water: saturated calcium hydroxide, 0.020 mol/L at 25 °C (the charge balance supplies the hydroxide). */
export const LIME_WATER = { Ca: 0.02 };          // mmol per mL (= mol/L)

/** The extra shelf of a Lassaigne bench: iron(III), nitroprusside, lead acetate and acetic acid, and distilled water. */
export const LASSAIGNE_REAGENTS = [
  { id: 'fecl3', label: 'Iron(III) chloride', short: 'FeCl₃', formula: '0.1 M FeCl₃', conc: { Fe: 0.1, Cl: 0.3 }, swatch: '#d9b648' },
  { id: 'nitroprusside', label: 'Sodium nitroprusside, fresh', short: 'Na₂[Fe(CN)₅NO]', formula: '0.03 M Na₂[Fe(CN)₅NO]', conc: { NP: 0.03, Na: 0.06 }, swatch: '#d98273' },
  { id: 'pbac2', label: 'Lead acetate', short: 'Pb(OAc)₂', formula: '0.1 M Pb(CH₃COO)₂', conc: { Pb: 0.1, OAc: 0.2 }, swatch: '#eceff3' },
  { id: 'acoh', label: 'Acetic acid, dilute', short: 'CH₃COOH', formula: '2 M CH₃COOH', conc: { OAc: 2 }, swatch: '#e8eef7' },
  { id: 'water', label: 'Distilled water', short: 'H₂O', formula: 'distilled water', conc: {}, swatch: '#cfe3f7' },
];
