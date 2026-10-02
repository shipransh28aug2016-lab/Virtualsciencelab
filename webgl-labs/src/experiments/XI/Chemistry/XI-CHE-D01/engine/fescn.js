/**
 * XI-CHE-D01 — Fe³⁺ + SCN⁻ ⇌ FeSCN²⁺, and everything that can be done to it.
 * Pure: no React, no three, no store.
 *
 * Four 10 mL tubes of one reference mixture (0.001 M of each ion), a shelf of
 * 0.10 M droppers, an ice bath and a hot one. What is in a tube is solved by the
 * shared speciation solver — in activities, with the iron's hydrolysis (an
 * FeCl₃ solution is acidic and partly FeOH²⁺ before any thiocyanate goes in),
 * the oxalate that takes iron away in three steps of stability 10²⁰, the
 * acid–base chemistry of that oxalate, and a temperature dependence for the
 * complex. The colour is computed from the absorption bands of what is there;
 * the colorimeter reads the absorbance at 447 nm, where FeSCN²⁺ absorbs.
 *
 * Constants: K° = 10^2.95 for FeSCN²⁺ (it is 138 at I = 0.5, 25 °C, which is the
 * figure that is measured — the test suite checks that the solver lands on it);
 * ΔH about −20 kJ/mol (published values scatter between about −10 and −25 with
 * the medium); FeOH²⁺ pKa 2.19, ΔH +43 kJ/mol (hydrolysis takes heat); Fe(III) oxalate log K 9.4, log β₂ 16.2, log β₃ 20.2
 * (NIST critical stability constants, I → 0, ±0.5); oxalic acid pKa 1.25 and 4.27.
 */
import { speciate, kAt } from '../../../../../shared/equilibria/speciate.js';
import { absorbancePerCm, colourThrough, epsilonAt, colourName } from '../../../../../shared/chem/spectra.js';
import { activityCoefficient } from '../../../../../shared/chem/aqueous.js';
import { mulberry32, gaussian } from '../../../../../shared/numerics.js';
import { createTubeStore } from '../../../../../shared/tubes/createTubeStore.js';

export const TUBE_ML = 10;
export const LAMBDA_NM = 447;
export const PATH_CM = 1.0;

export const COMPONENTS = [{ id: 'Fe', z: 3 }, { id: 'SCN', z: -1 }, { id: 'ox', z: -2 }, { id: 'H', z: 1 }];
export const SPECIES = [
  { id: 'FeSCN', z: 2, nu: { Fe: 1, SCN: 1 }, logK: 2.95, dH: -20 },
  { id: 'FeOH', z: 2, nu: { Fe: 1, H: -1 }, logK: -2.19, dH: 43 },
  { id: 'Feox', z: 1, nu: { Fe: 1, ox: 1 }, logK: 9.4 },
  { id: 'Feox2', z: -1, nu: { Fe: 1, ox: 2 }, logK: 16.2 },
  { id: 'Feox3', z: -3, nu: { Fe: 1, ox: 3 }, logK: 20.2 },
  { id: 'HOx', z: -1, nu: { H: 1, ox: 1 }, logK: 4.27 },
  { id: 'H2Ox', z: 0, nu: { H: 2, ox: 1 }, logK: 5.52 },
  { id: 'OH', z: -1, nu: { H: -1 }, logK: -13.995, dH: 55.8 },
];

/* Absorption bands (λ₀ nm, ε M⁻¹cm⁻¹, σ nm). FeSCN²⁺ is the charge-transfer band at 447 nm,
   ε(447 nm) = 4700 M⁻¹cm⁻¹ (a main band and a shoulder to the red). Hydrolysed iron(III) is FeOH²⁺: a UV band near 300–340 nm with a faint tail into
   the violet (ε at 447 nm is a few tens) — so a plain FeCl₃ solution is only just yellow — and
   the oxalate complexes are the pale yellow-green of ferrioxalate. Visible shapes are set to the
   appearance a student sees, not fitted to a published spectrum. */
export const BANDS = {
  FeSCN: [{ l0: 447, eps: 4022, sigma: 40 }, { l0: 510, eps: 1500, sigma: 50 }],   // 4700 at 447 nm, with the long red shoulder that makes it blood-red
  FeOH: [{ l0: 335, eps: 1500, sigma: 32 }, { l0: 410, eps: 60, sigma: 60 }],
  Feox: [{ l0: 405, eps: 90, sigma: 55 }],
  Feox2: [{ l0: 405, eps: 160, sigma: 55 }],
  Feox3: [{ l0: 410, eps: 260, sigma: 60 }, { l0: 575, eps: 25, sigma: 70 }],
};

/** What is on the shelf: mmol per mL of each component, a swatch, a name. */
export const REAGENTS = [
  { id: 'fecl3', label: 'Iron(III) chloride', noun: 'iron(III) chloride', short: 'Fe', formula: '0.10 M FeCl₃', conc: { Fe: 0.1, Cl: 0.3 }, ion: 'Fe³⁺', key: 'Fe', swatch: '#d6a23a' },
  { id: 'kscn', label: 'Potassium thiocyanate', noun: 'potassium thiocyanate', short: 'SCN', formula: '0.10 M KSCN', conc: { SCN: 0.1, K: 0.1 }, ion: 'SCN⁻', key: 'SCN', swatch: '#e8ecf3' },
  { id: 'oxalate', label: 'Sodium oxalate', noun: 'sodium oxalate', short: 'Ox', formula: '0.10 M Na₂C₂O₄', conc: { ox: 0.1, Na: 0.2 }, ion: 'C₂O₄²⁻', key: 'ox', swatch: '#dfe6ee' },
  { id: 'hno3', label: 'Nitric acid', noun: 'nitric acid', short: 'H⁺', formula: '0.10 M HNO₃', conc: { NO3: 0.1 }, ion: 'H⁺', key: 'NO3', swatch: '#f3e9c0' },
  { id: 'water', label: 'Distilled water', noun: 'distilled water', short: 'H₂O', formula: 'H₂O', conc: {}, ion: null, key: null, swatch: '#cfe3f7' },
];
const REAGENT_BY_ID = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));

/** The tube holds 15 mL; what goes in beyond that runs over the rim. */
export const TUBE_MAX_ML = 15;
/** ε of FeSCN²⁺ at 447 nm — the figure the worksheet hands out. */
export const EPS_FESCN = epsilonAt(BANDS.FeSCN, LAMBDA_NM);
/** K° of the complex at a temperature (activity basis), by van 't Hoff. */
export const kThermo = (tC) => kAt(2.95, -20, tC);

/** The reference mixture: 5 mL 0.002 M FeCl₃ + 5 mL 0.002 M KSCN, shared out to four tubes. */
const referenceContent = () => ({
  volumeMl: TUBE_ML, mmol: { Fe: 0.01, SCN: 0.01, ox: 0, Cl: 0.03, K: 0.01, Na: 0, NO3: 0 }, spilledMl: 0,
});

const solveTube = (content, tempC, extra = {}) => {
  const V = content.volumeMl; const m = content.mmol; const tot = (k) => m[k] / V;     // mmol/mL = mol/L
  return speciate({
    components: COMPONENTS, species: SPECIES, totals: { Fe: tot('Fe'), SCN: tot('SCN'), ox: tot('ox') },
    spectators: [{ z: 1, c: tot('K') + tot('Na') }, { z: -1, c: tot('Cl') + tot('NO3') }], charge: 'H', T: tempC, ...extra,
  });
};

/** The absorbance at 447 nm and the colour of a solved state, in a 1 cm cell. */
const optics = (c) => {
  const parts = Object.keys(BANDS).map((id) => ({ bands: BANDS[id], conc: c[id] ?? 0 }));
  const A447 = parts.reduce((a, p) => a + epsilonAt(p.bands, LAMBDA_NM) * p.conc, 0) * PATH_CM;
  return { A447, colour: colourThrough(absorbancePerCm(parts), PATH_CM) };
};

export function observe(content, tempC, previous = null) {
  const sp = solveTube(content, tempC, { guess: previous?.free ?? null });
  const { A447, colour } = optics(sp.species);
  return {
    colour, A447, pH: sp.pH, I: sp.ionicStrength, free: sp.free, species: sp.species, gamma: sp.gamma, converged: sp.converged,
    FeSCN: sp.species.FeSCN ?? 0, name: colourName(colour.srgb), tempC,
  };
}

export const REF_A = observe(referenceContent(), 25).A447;

/** What a dose does: mmol in, volume up — and whatever does not fit runs over the rim, taking its share of everything with it. */
export function add(content, reagent, mL) {
  const mmol = { ...content.mmol };
  for (const [k, v] of Object.entries(reagent.conc)) mmol[k] = (mmol[k] ?? 0) + v * mL;
  let V = content.volumeMl + mL; let spilledMl = content.spilledMl ?? 0;
  if (V > TUBE_MAX_ML) {
    const keep = TUBE_MAX_ML / V;
    for (const k of Object.keys(mmol)) mmol[k] *= keep;
    spilledMl += V - TUBE_MAX_ML; V = TUBE_MAX_ML;
  }
  return { volumeMl: V, mmol, spilledMl };
}

/**
 * The reaction quotient the INSTANT after a dose — before this equilibrium has
 * had time to move. The FeSCN²⁺ already there (diluted by the volume added) is
 * held fixed, and everything that is fast — the iron's hydrolysis, the oxalate
 * taking iron, acid and base — is allowed to settle around it. Q against K then
 * says which way the colour is about to go, which is Le Chatelier's argument
 * with numbers in it.
 */
export function instant(before, after, reagent, mL, tempC) {
  const f = before.content.volumeMl / (before.content.volumeMl + mL);
  const frozen = (before.obs.species.FeSCN ?? 0) * f;
  const sp = solveTube(after, tempC, { freeze: { FeSCN: frozen }, guess: before.obs.free });
  const g = sp.gamma;
  const Q = (g(2) * frozen) / (g(3) * sp.free.Fe * g(-1) * sp.free.SCN);
  const K = kThermo(tempC);
  return {
    Q, K, ratio: Q / K, direction: Q < K ? 'right' : 'left', mL, reagent: reagent.id,
    Abefore: before.obs.A447, Ainstant: optics(sp.species).A447, pHinstant: sp.pH,
  };
}

/* ── Notebook ─────────────────────────────────────────────────────────────── */

const noise = (seed) => gaussian(mulberry32(seed));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const DOSES = (t) => Object.entries(t.doses).filter(([, n]) => n > 0).map(([id, n]) => `${plural(n, 'drop')} ${REAGENT_BY_ID[id].noun}`).join(', ') || 'nothing (reference mixture)';

/** The colorimeter: the absorbance at 447 nm in a 1 cm cell, with the jitter of the last digit. */
export const colorimeter = (obs, seed = 1) => Math.max(0, obs.A447 + 0.002 * noise(seed));

/** [FeSCN²⁺] the way the worksheet gets it: A / (ε ℓ). */
export const fescnFromA = (A) => A / (EPS_FESCN * PATH_CM);
export const totalOf = (tube, k) => tube.content.mmol[k] / tube.content.volumeMl;

/** What Le Chatelier says about the last thing done to a tube, and the arithmetic it rests on. */
export function expectation(tube) {
  if (tube.last?.info) {
    const i = tube.last.info;
    return { dir: i.direction, basis: `Q/K = ${i.ratio.toPrecision(2)}`, ratio: i.ratio };
  }
  const dT = tube.tempC - 25;
  if (Math.abs(dT) > 1.5) {
    const r = kThermo(tube.tempC) / kThermo(25);
    return { dir: r < 1 ? 'left' : 'right', basis: `K(${tube.tempC.toFixed(0)} °C)/K(25 °C) = ${r.toPrecision(2)}`, ratio: r };
  }
  return null;
}

export function row({ tube, obs, ctx }) {
  const A = colorimeter(obs, ctx.log.length + 7);
  const info = tube.last?.info ?? null;
  const main = Object.entries(tube.doses).filter(([, n]) => n > 0);
  const stress = main.length === 1 ? main[0][0] : main.length ? 'mixed' : 'none';
  const T = tube.tempC;
  const notes = [];
  if (Math.abs(T - 25) > 1.5) notes.push(`tube at ${T.toFixed(0)} °C`);
  if (tube.bath !== 'air') notes.push(tube.bath === 'ice' ? 'in the ice bath' : 'in the hot bath');
  if (Math.abs(T - (tube.bath === 'ice' ? 0 : tube.bath === 'hot' ? 60 : 25)) > 0.7) notes.push('still changing temperature');
  if (main.length > 1) notes.push('more than one stress');
  if (tube.content.spilledMl > 0) notes.push(`${tube.content.spilledMl.toFixed(1)} mL ran over the rim`);
  /* What it is being compared with: the tube as it was before the last dose, or — for a tube only warmed or cooled — the same tube at room temperature. */
  const exp = expectation(tube);
  const Aprev = info ? info.Abefore : Math.abs(T - 25) > 1.5 ? observe(tube.content, 25, obs).A447 : REF_A;
  /* The worksheet's constant, from the absorbance and the NOMINAL totals — ignoring the iron's hydrolysis, as the worksheet does. */
  const x = fescnFromA(A);
  const Fe = totalOf(tube, 'Fe') - x; const S = totalOf(tube, 'SCN') - x;
  const Kc = tube.doses.oxalate > 0 ? null : Fe > 0 && S > 0 && x > 0 ? x / (Fe * S) : null;
  return {
    tube: tube.id, added: DOSES(tube), stress, nDrops: stress === 'mixed' || stress === 'none' ? null : tube.doses[stress],
    T: Number(T.toFixed(1)), A: Number(A.toFixed(3)), shift: Number(((A - REF_A) / REF_A).toFixed(2)),
    colour: obs.name, QK: info ? Number(info.ratio.toPrecision(2)) : null,
    KT: Math.abs(T - 25) > 1.5 ? Number((kThermo(T) / kThermo(25)).toPrecision(2)) : null, predicted: exp ? exp.dir : '—',
    observed: A > Aprev * 1.04 ? 'deeper' : A < Aprev * 0.96 ? 'paler' : 'no change',
    Kc: Kc === null ? null : Number(Kc.toPrecision(3)), note: notes.join('; '),
  };
}

export function analyse(log) {
  const groups = new Map();
  for (const r of log) {
    if (r.nDrops === null || r.nDrops === undefined || r.stress === 'none') continue;
    if (!groups.has(r.stress)) groups.set(r.stress, []);
    groups.get(r.stress).push(r);
  }
  const series = [...groups].map(([id, rows]) => ({ name: REAGENT_BY_ID[id]?.formula ?? id, points: rows.map((r) => [r.nDrops, r.shift]).sort((a, b) => a[0] - b[0]), connect: true }));
  const judged = log.filter((r) => r.predicted !== '—' && r.stress !== 'mixed' && r.observed !== 'no change');
  const agree = judged.filter((r) => (r.predicted === 'right') === (r.observed === 'deeper'));
  const Kcs = log.filter((r) => r.Kc !== null && Math.abs(r.T - 25) < 1.5).map((r) => r.Kc);
  return { series, judged: judged.length, agree: agree.length, Kc: Kcs.length ? Kcs.reduce((a, b) => a + b, 0) / Kcs.length : null };
}

/* ── What the bench says ──────────────────────────────────────────────────── */

export const activeOf = (s) => s.tubes.find((t) => t.id === s.active);
const bathTarget = (b) => (b === 'ice' ? 0 : b === 'hot' ? 60 : 25);

export function statusOf(s) {
  const t = activeOf(s);
  const target = bathTarget(t.bath);
  if (Math.abs(t.tempC - target) > 0.6) {
    return { key: 'changing', tone: 'info', title: `Tube ${t.id}: ${t.tempC.toFixed(1)} °C, on its way to ${target} °C`, detail: 'A tube takes a minute or so to come to the bath — and the colour follows the temperature. Wait for it before reading (the clock speed helps).' };
  }
  if (t.content.spilledMl > 0) {
    return { key: 'spilled', tone: 'warn', title: `Tube ${t.id} was overfilled`, detail: `${t.content.spilledMl.toFixed(1)} mL ran over the rim, taking its share of everything with it. Take a fresh tube.` };
  }
  const info = t.last?.info;
  if (info) {
    const r = REAGENT_BY_ID[info.reagent];
    return {
      key: `dose-${info.direction}`, tone: 'ok',
      title: `${r.formula}: Q/K = ${info.ratio.toPrecision(2)} → shifts ${info.direction}`,
      detail: info.direction === 'right'
        ? 'Straight after mixing the quotient is below K, so the system makes more FeSCN²⁺ until Q has climbed back to K: the colour deepens.'
        : 'Straight after mixing the quotient is above K, so the system breaks down FeSCN²⁺ until Q has fallen back to K: the colour fades.',
    };
  }
  if (t.bath !== 'air') {
    const r = kThermo(t.tempC) / kThermo(25);
    return { key: `bath-${t.bath}`, tone: 'ok', title: `Tube ${t.id} at ${t.tempC.toFixed(0)} °C: K is ×${r.toPrecision(2)} of its room-temperature value`, detail: r < 1 ? 'The complex forms with heat given out, so warming works against it: it loses colour.' : 'The complex forms with heat given out, so cooling favours it: the colour deepens.' };
  }
  return { key: 'rest', tone: 'info', title: `Tube ${t.id}: the reference mixture`, detail: 'Four tubes of the same pale mixture. Leave one alone as the reference, give the others a reagent or a bath, and compare the colours — then the colorimeter.' };
}

export const CFG = {
  tubes: [{ id: 'A', label: 'A', tag: '#38bdf8' }, { id: 'B', label: 'B', tag: '#fbbf24' }, { id: 'C', label: 'C', tag: '#34d399' }, { id: 'D', label: 'D', tag: '#f472b6' }],
  roomC: 25,
  baths: { air: { T: 'room', tau: 150 }, ice: { T: 0, tau: 40 }, hot: { T: 60, tau: 40 } },
  pathCm: 1.4,
  reagents: REAGENTS,
  initial: () => referenceContent(),
  add, observe, instant, row, analyse,
};

export const useFeScn = createTubeStore(CFG);
export const gammaOf = (z, I, T) => activityCoefficient(z, I, T);
