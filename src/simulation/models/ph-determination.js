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
export function init() { return { t: 0, pH: 7, reading: 7, settled: false, dipped: false }; }
/**
 * A glass electrode does not answer instantly. It drifts towards the true
 * pH over a few seconds as the gel layer equilibrates with the solution --
 * which is why a reading is taken only once the display stops moving, and
 * why the meter must be left in the buffer before it is trusted.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = pHTrue(inputs);
  s.pH = target;
  s.dipped = true;
  const tau = (inputs.method === 'pHMeter' || inputs.method === 'meter') ? 1.6 : 0.7;
  s.reading += (target - s.reading) * Math.min(1, dt / tau);
  s.settled = Math.abs(target - s.reading) < 0.01;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 179);
  const m = METHODS[inputs.method] || METHODS.universal;
  const truePH = pHTrue(inputs);
  const pH = toLeastCount(truePH + jitter(rng, m.lc * 0.4), m.lc);
  const s = sampleOf(inputs);
  const nature = pH < 6.5 ? 'acidic' : pH > 7.5 ? 'basic' : 'neutral';
  return {
    trial, sample: s.label, concentration: s.C || null, method: m.label, pH: Number(pH.toFixed(2)),
    pOH: Number((14 - pH).toFixed(2)), hIon: sigFig(10 ** -pH, 3), nature, dilution: inputs.dilution ?? 1,
    index: trial,
  };
}

export function derive(rows) {
  if (rows.length < 2) return { ok: false, reason: 'Test at least two solutions to compare.' };
  const mostAcidic = rows.reduce((a, b) => (Number(a.pH) <= Number(b.pH) ? a : b));
  const mostBasic = rows.reduce((a, b) => (Number(a.pH) >= Number(b.pH) ? a : b));

  /*
   * dilutionCheck used to be a bare boolean, but the result panel reads
   * dilutionCheck.sample/.deltaPH/.decades/.perDecade — a boolean has none
   * of those, so the "check" text would have silently rendered
   * "undefined" units all the way down the moment two dilutions of the
   * same sample were actually recorded.
   */
  const bySample = new Map();
  for (const r of rows) {
    if (!bySample.has(r.sample)) bySample.set(r.sample, []);
    bySample.get(r.sample).push(r);
  }
  let dilutionCheck = null;
  for (const [sample, rs] of bySample) {
    const distinct = [...new Set(rs.map((r) => Number(r.dilution)))];
    if (distinct.length < 2) continue;
    const sorted = [...rs].sort((a, b) => Number(a.dilution) - Number(b.dilution));
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const decades = Math.log10(Number(hi.dilution) / Number(lo.dilution));
    if (!(decades > 0)) continue;
    const deltaPH = Number(hi.pH) - Number(lo.pH);
    dilutionCheck = { sample, deltaPH: sigFig(deltaPH, 3), decades: sigFig(decades, 3), perDecade: sigFig(deltaPH / decades, 3) };
    break;
  }

  const acids = rows.filter((r) => r.nature === 'acidic').length;
  const bases = rows.filter((r) => r.nature === 'basic').length;
  const neutral = rows.filter((r) => r.nature === 'neutral').length;

  return {
    ok: true, mostAcidic: mostAcidic.sample, mostAcidicPH: Number(mostAcidic.pH),
    mostBasic: mostBasic.sample, mostBasicPH: Number(mostBasic.pH),
    acids, bases, neutral,
    dilutionCheck, n: rows.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.pH) })),
  };
}

export default { meta, defaults, SAMPLES, METHODS, KW, init, step, measure, derive, validate, sampleOf, hydrogenIon, pHTrue, degreeOfDissociation };
