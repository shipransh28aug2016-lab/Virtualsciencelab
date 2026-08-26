/**
 * MODEL: pH of acids, bases, salts and fruit juices — XI-CHE-C01 and C02
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section C, Experiments 1-2.
 * Also the physics behind XI-CHE-C04 (common-ion effect): an optional
 * `commonIonConc` input suppresses a weak acid/base's own ionisation,
 * exactly as adding its salt does in real solution.
 *
 * pH = −log10[H+]; strong electrolytes are taken as fully dissociated;
 * weak ones use [H+] ≈ sqrt(Ka·C) (or the common-ion-corrected quadratic).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-C01',
  formula: 'pH = −log[H⁺]; strong: [H⁺]=C; weak: [H⁺]≈√(Ka·C); pH+pOH=14',
  unitSystem: 'Molarity in mol/L; pH dimensionless',
  assumptions: ['Ideal dilute-solution behaviour (activity ≈ concentration)', 'Kw = 1.0×10⁻¹⁴ at 25 °C', 'Common-ion suppression uses the added salt\'s concentration directly'],
  validRange: 'Concentration 0.001-1 M after dilution',
  edgeCases: ['A weak acid at the same concentration as a strong acid has a distinctly higher pH', 'Adding the common ion suppresses ionisation and raises the pH of a weak acid further'],
  expectedBehaviour: ['Diluting an acid tenfold raises its pH by close to 1 unit if strong, less if weak', 'All fruit juices tested are acidic'],
};

export const KW = 1.0e-14;
/** type: strongAcid | weakAcid | strongBase | weakBase | saltBasic | saltAcidic | saltNeutral | fixed */
export const SAMPLES = {
  hcl: { label: 'Hydrochloric acid', type: 'strongAcid', C: 0.1 },
  h2so4: { label: 'Sulphuric acid', type: 'strongAcid', C: 0.1, basicity: 2 },
  acetic: { label: 'Acetic acid', type: 'weakAcid', C: 0.1, Ka: 1.8e-5 },
  citric: { label: 'Citric acid', type: 'weakAcid', C: 0.1, Ka: 7.4e-4 },
  naoh: { label: 'Sodium hydroxide', type: 'strongBase', C: 0.1 },
  ammonia: { label: 'Ammonium hydroxide', type: 'weakBase', C: 0.1, Kb: 1.8e-5 },
  nacl: { label: 'Sodium chloride', type: 'saltNeutral', pHFixed: 7.0 },
  ch3coona: { label: 'Sodium acetate', type: 'saltBasic', C: 0.1, Kb: KW / 1.8e-5 },
  nh4cl: { label: 'Ammonium chloride', type: 'saltAcidic', C: 0.1, Ka: KW / 1.8e-5 },
  na2co3: { label: 'Sodium carbonate', type: 'saltBasic', C: 0.05, Kb: KW / 4.8e-11 },
  lemon: { label: 'Lemon juice', type: 'fixed', pHFixed: 2.3 },
  orange: { label: 'Orange juice', type: 'fixed', pHFixed: 3.7 },
  tomato: { label: 'Tomato juice', type: 'fixed', pHFixed: 4.3 },
  soap: { label: 'Soap solution', type: 'fixed', pHFixed: 9.8 },
  water: { label: 'Distilled water', type: 'fixed', pHFixed: 7.0 },
};
export const METHODS = { paper: { label: 'pH paper', lc: 1.0 }, universal: { label: 'Universal indicator', lc: 0.5 }, meter: { label: 'pH meter', lc: 0.01 } };

export const defaults = { sample: 'hcl', dilution: 1, method: 'universal', tempC: 25, commonIonConc: 0 };

export function sampleOf(inputs) { return SAMPLES[inputs.sample] || SAMPLES.hcl; }

export function hydrogenIon(inputs) {
  const s = sampleOf(inputs);
  const C = (s.C || 0) / Math.max(1, inputs.dilution) * (s.basicity || 1);
  if (s.type === 'fixed') return 10 ** -s.pHFixed;
  if (s.type === 'strongAcid') return C;
  if (s.type === 'strongBase') return KW / C;
  if (s.type === 'weakAcid') {
    const commonIon = (inputs.commonIonConc || 0) / Math.max(1, inputs.dilution);
    if (commonIon > 0) {
      // Ka = x(commonIon + x)/C, solved as a quadratic (suppressed ionisation).
      const a = 1, b = commonIon, c = -s.Ka * C;
      return (-b + Math.sqrt(b * b - 4 * a * c)) / 2;
    }
    return Math.sqrt(s.Ka * C);
  }
  if (s.type === 'weakBase') {
    const commonIon = (inputs.commonIonConc || 0) / Math.max(1, inputs.dilution);
    const oh = commonIon > 0
      ? (() => { const a = 1, b = commonIon, c = -s.Kb * C; return (-b + Math.sqrt(b * b - 4 * a * c)) / 2; })()
      : Math.sqrt(s.Kb * C);
    return KW / oh;
  }
  if (s.type === 'saltBasic') return KW / Math.sqrt(s.Kb * C);
  if (s.type === 'saltAcidic') return Math.sqrt(s.Ka * C);
  return 1e-7;
}
export function pHTrue(inputs) { return -Math.log10(Math.max(1e-14, hydrogenIon(inputs))); }
export function degreeOfDissociation(inputs) {
  const s = sampleOf(inputs);
  if (s.type !== 'weakAcid' && s.type !== 'weakBase') return null;
  const C = s.C / Math.max(1, inputs.dilution);
  const h = hydrogenIon(inputs);
  const conc = s.type === 'weakAcid' ? h : KW / h;
  return conc / C;
}

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 179);
  const m = METHODS[inputs.method] || METHODS.universal;
  const truePH = pHTrue(inputs);
  const pH = toLeastCount(truePH + jitter(rng, m.lc * 0.4), m.lc);
  const s = sampleOf(inputs);
  const nature = pH < 6.5 ? 'acidic' : pH > 7.5 ? 'basic' : 'neutral';
  return {
    trial, sample: s.label, concentration: s.C || null, method: m.label, pH: Number(pH.toFixed(2)),
    pOH: Number((14 - pH).toFixed(2)), hIon: sigFig(10 ** -pH, 3), nature,
    index: trial,
  };
}

export function derive(rows) {
  if (rows.length < 2) return { ok: false, reason: 'Test at least two solutions to compare.' };
  const mostAcidic = rows.reduce((a, b) => (Number(a.pH) <= Number(b.pH) ? a : b));
  const mostBasic = rows.reduce((a, b) => (Number(a.pH) >= Number(b.pH) ? a : b));
  const dilutionRows = rows.filter((r) => r.sample === rows[0].sample);
  const dilutionCheck = dilutionRows.length > 1;
  return {
    ok: true, mostAcidic: mostAcidic.sample, mostAcidicPH: Number(mostAcidic.pH), mostBasic: mostBasic.sample,
    dilutionCheck, n: rows.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.pH) })),
  };
}

export default { meta, defaults, SAMPLES, METHODS, KW, init, step, measure, derive, validate, sampleOf, hydrogenIon, pHTrue, degreeOfDissociation };
