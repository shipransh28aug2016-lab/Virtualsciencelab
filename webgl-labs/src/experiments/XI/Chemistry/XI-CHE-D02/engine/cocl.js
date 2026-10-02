/**
 * XI-CHE-D02 — [Co(H₂O)₆]²⁺ + 4 Cl⁻ ⇌ [CoCl₄]²⁻ + 6 H₂O, and everything that can be done to it.
 * Pure: no React, no three, no store.
 *
 * Four 3 mL tubes of 0.10 M CoCl₂ (pink), a shelf of concentrated HCl, solid NaCl,
 * water and silver nitrate, an ice bath and a hot one. What is in a tube is solved
 * by the shared speciation solver: the complex, the silver chloride that comes out
 * (and the AgCl₂⁻ that holds some of it in strong chloride), the salt that crystallises
 * when the brine is saturated. The colour is built from the absorption bands of the
 * two cobalt species; the spectrometer reads absorbance at a chosen wavelength in a
 * chosen cell, and runs off its scale when it should.
 *
 * Constants. The medium is up to 8 M in chloride, where Davies has nothing to say
 * and the constants are measured as concentration quotients — so this bench works in
 * concentrations (activity: false) and K is an EFFECTIVE constant for the overall
 * step, K = [CoCl₄²⁻]/([Co(H₂O)₆²⁺][Cl⁻]⁴) = 4.5 × 10⁻³ M⁻⁴ at 25 °C (half the cobalt
 * is blue at 3.9 M chloride — what is seen in the lab; the real system passes through
 * CoCl⁺, CoCl₂ and CoCl₃⁻ and the fourth power is only the average), ΔH = +50 kJ/mol
 * (the forward step breaks six Co–OH₂ bonds for four Co–Cl: it takes heat).
 * AgCl: Ksp = 10⁻⁹·⁷⁵ (ΔH +65.7 kJ/mol), AgCl₂⁻ log β₂ = 5.04; NaCl: Ksp = 37.7 M²
 * (a saturated brine is 6.14 M).
 */
import { speciate, kAt } from '../../../../../shared/equilibria/speciate.js';
import { absorbancePerCm, colourThrough, epsilonAt, colourName } from '../../../../../shared/chem/spectra.js';
import { mulberry32, gaussian } from '../../../../../shared/numerics.js';
import { createTubeStore } from '../../../../../shared/tubes/createTubeStore.js';

export const TUBE_ML = 3;
export const TUBE_MAX_ML = 15;
export const OFF_SCALE = 2.5;
export const WAVELENGTHS = [510, 600, 692];

export const COMPONENTS = [{ id: 'Co', z: 2 }, { id: 'Cl', z: -1 }, { id: 'Ag', z: 1 }, { id: 'Na', z: 1 }];
export const LOGK_COCL4 = Math.log10(4.5e-3);
export const DH_COCL4 = 50;
export const SPECIES = [
  { id: 'CoCl4', z: -2, nu: { Co: 1, Cl: 4 }, logK: LOGK_COCL4, dH: DH_COCL4 },
  { id: 'AgCl2', z: -1, nu: { Ag: 1, Cl: 2 }, logK: 5.04 },
];
export const SOLIDS = [
  { id: 'AgCl', nu: { Ag: 1, Cl: 1 }, logKsp: -9.75, dH: 65.7 },
  { id: 'NaCl', nu: { Na: 1, Cl: 1 }, logKsp: Math.log10(37.7), dH: 3.9 },
];

/* Absorption bands (λ₀ nm, ε M⁻¹cm⁻¹, σ nm). [Co(H₂O)₆]²⁺: the 510 nm band with its shoulders,
   ε(510) = 4.6 (the figure the data sheet gives). [CoCl₄]²⁻: the three-fold band of a tetrahedral
   d⁷ ion at 612–692 nm, ε(692) = 570 — a hundred times stronger, which is why a little of it
   is enough. Visible baselines are shaped to the appearance, not fitted to a published spectrum. */
const PINK = [{ l0: 510, eps: 3.37, sigma: 22 }, { l0: 478, eps: 2.25, sigma: 16 }, { l0: 536, eps: 1.6, sigma: 20 }, { l0: 410, eps: 0.94, sigma: 40 }];
const BLUE = [
  { l0: 692, eps: 540, sigma: 13 }, { l0: 662, eps: 430, sigma: 13 }, { l0: 636, eps: 330, sigma: 13 }, { l0: 612, eps: 200, sigma: 14 },
  { l0: 535, eps: 15, sigma: 42 }, { l0: 335, eps: 4000, sigma: 28 },
];
export const epsPink = (nm) => epsilonAt(PINK, nm);
export const epsBlue = (nm) => epsilonAt(BLUE, nm);

/** What is on the shelf. Liquids carry mmol per mL; a solid carries mmol per unit taken. */
export const REAGENTS = [
  { id: 'hcl', label: 'Concentrated hydrochloric acid', noun: 'conc. hydrochloric acid', short: 'HCl', formula: '12 M HCl', conc: { Cl: 12 }, ion: 'Cl⁻', key: 'Cl', unit: 'drop', maxUnits: 40, swatch: '#e6efc8' },
  { id: 'nacl', label: 'Solid sodium chloride', noun: 'solid sodium chloride', short: 'NaCl', formula: 'solid NaCl, 0.10 g a pinch', mlPer: 0, perUnit: { Na: 1.711, Cl: 1.711 }, ion: 'Cl⁻', key: 'Cl', unit: 'pinch', maxUnits: 10, swatch: '#f4f4f0' },
  { id: 'water', label: 'Distilled water', noun: 'distilled water', short: 'H₂O', formula: 'H₂O', conc: {}, ion: null, key: null, unit: 'drop', maxUnits: 50, swatch: '#cfe3f7' },
  { id: 'agno3', label: 'Silver nitrate', noun: 'silver nitrate', short: 'Ag⁺', formula: '1.0 M AgNO₃', conc: { Ag: 1 }, ion: 'Ag⁺', key: 'Ag', unit: 'drop', maxUnits: 40, swatch: '#e3e8ef' },
];
const REAGENT_BY_ID = Object.fromEntries(REAGENTS.map((r) => [r.id, r]));
export const unitOf = (r) => (r.unit === 'pinch' ? 'pinch' : 'drop');
export const perUnitMmol = (r, key) => (r.perUnit ? r.perUnit[key] ?? 0 : (r.conc[key] ?? 0) * (r.mlPer ?? 0.05));

/** The reference tube: 3 mL of 0.10 M CoCl₂. */
const referenceContent = () => ({ volumeMl: TUBE_ML, mmol: { Co: 0.3, Cl: 0.6, Ag: 0, Na: 0 }, spilledMl: 0 });

export const kThermo = (tC) => kAt(LOGK_COCL4, DH_COCL4, tC);

const solveTube = (content, tempC, extra = {}) => {
  const V = content.volumeMl; const m = content.mmol;
  return speciate({
    components: COMPONENTS, species: SPECIES, solids: SOLIDS, totals: { Co: m.Co / V, Cl: m.Cl / V, Ag: m.Ag / V, Na: m.Na / V },
    T: tempC, activity: false, ...extra,
  });
};

export function observe(content, tempC, previous = null) {
  const sp = solveTube(content, tempC, { guess: previous?.free ?? null, guessSolids: previous?.solids ?? null });
  const V = content.volumeMl;
  const pink = sp.free.Co; const blue = sp.species.CoCl4 ?? 0;
  const absPerCm = absorbancePerCm([{ bands: PINK, conc: pink }, { bands: BLUE, conc: blue }]);
  const colour = colourThrough(absPerCm, 1.0);
  const Co = content.mmol.Co / V;
  /* The solids, as the eye has them: the suspension just after it forms and the bed it settles into. */
  const mmolAgCl = (sp.solids.AgCl ?? 0) * V; const mmolNaCl = (sp.solids.NaCl ?? 0) * V;
  const obs = {
    colour, free: sp.free, species: sp.species, solids: sp.solids, converged: sp.converged, tempC,
    x: Co > 0 ? blue / Co : 0, pink, blue, name: colourName(colour.srgb),
    /** Absorbance at a wavelength (nm) in a cell (cm). */
    A: (nm, cm) => cm * (epsPink(nm) * pink + epsBlue(nm) * blue),
  };
  if (mmolAgCl > 1e-6 || mmolNaCl > 1e-6) {
    const agcl = mmolAgCl * 143.32 >= mmolNaCl * 58.44;
    if (agcl) {
      obs.precip = [0.96, 0.96, 0.93, Math.min(0.85, 0.2 + 4 * mmolAgCl)];
      obs.bed = [0.95, 0.95, 0.92, Math.min(0.14, 0.01 + 0.05 * mmolAgCl)];
      obs.scatter = Math.min(0.9, 0.2 + 3 * mmolAgCl); obs.scatterColour = [0.96, 0.96, 0.93]; obs.settleTau = 40;
    } else {
      obs.precip = [1, 1, 1, 0]; obs.bed = [0.98, 0.98, 0.96, Math.min(0.2, 0.015 + 0.02 * mmolNaCl)]; obs.settleTau = 3;
    }
  }
  return obs;
}

export const REF = observe(referenceContent(), 25);

/** What a dose does: mmol in, volume up — and what does not fit runs over the rim. */
export function add(content, reagent, mL, ctx = {}) {
  const mmol = { ...content.mmol };
  const units = ctx.units ?? 1;
  if (reagent.perUnit) for (const [k, v] of Object.entries(reagent.perUnit)) mmol[k] = (mmol[k] ?? 0) + v * units;
  else for (const [k, v] of Object.entries(reagent.conc)) mmol[k] = (mmol[k] ?? 0) + v * mL;
  let V = content.volumeMl + mL; let spilledMl = content.spilledMl ?? 0;
  if (V > TUBE_MAX_ML) {
    const keep = TUBE_MAX_ML / V;
    for (const k of Object.keys(mmol)) mmol[k] *= keep;
    spilledMl += V - TUBE_MAX_ML; V = TUBE_MAX_ML;
  }
  return { volumeMl: V, mmol, spilledMl };
}

/**
 * The reaction quotient the INSTANT after a dose — before the cobalt equilibrium has moved. The
 * [CoCl₄²⁻] already there (diluted by the volume added) is held fixed; what is fast and not the
 * cobalt's — silver chloride coming out, salt dissolving — settles around it. Q against K then
 * says which way the colour is about to go.
 */
export function instant(before, after, reagent, mL, tempC) {
  const f = before.content.volumeMl / (before.content.volumeMl + mL);
  const frozen = (before.obs.species.CoCl4 ?? 0) * f;
  const sp = solveTube(after, tempC, { freeze: { CoCl4: frozen }, guess: before.obs.free, guessSolids: before.obs.solids });
  const Q = frozen / (sp.free.Co * sp.free.Cl ** 4);
  const K = kThermo(tempC);
  return { Q, K, ratio: Q / K, direction: Q < K ? 'right' : 'left', mL, reagent: reagent.id, xBefore: before.obs.x, Cl: sp.free.Cl };
}

/* ── Notebook ─────────────────────────────────────────────────────────────── */

const noise = (seed) => gaussian(mulberry32(seed));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const DOSES = (t) => Object.entries(t.doses).filter(([, n]) => n > 0).map(([id, n]) => `${plural(n, unitOf(REAGENT_BY_ID[id]))} ${REAGENT_BY_ID[id].noun}`).join(', ') || 'nothing (reference solution)';

export const totalOf = (tube, k) => tube.content.mmol[k] / tube.content.volumeMl;

/** The spectrometer: absorbance at λ in a cell, to a digit of jitter — or null when it is off its scale. */
export function spectrometer(obs, nm, cm, seed = 1) {
  const A = obs.A(nm, cm);
  return A > OFF_SCALE ? null : Math.max(0, A + 0.002 * noise(seed));
}

/** The fraction of the cobalt that is CoCl₄²⁻, the way the data sheet gets it: Beer–Lambert for two absorbers. */
export function fractionFromA(A, nm, cm, Co) {
  if (A === null || !(Co > 0)) return null;
  const p = epsPink(nm); const b = epsBlue(nm);
  return (A / (Co * cm) - p) / (b - p);
}

/** What Le Chatelier says about the last thing done to a tube. */
export function expectation(tube) {
  if (tube.last?.info) { const i = tube.last.info; return { dir: i.direction, ratio: i.ratio }; }
  if (Math.abs(tube.tempC - 25) > 1.5) { const r = kThermo(tube.tempC) / kThermo(25); return { dir: r < 1 ? 'left' : 'right', ratio: r }; }
  return null;
}

export function row({ tube, obs, ctx }) {
  const nm = Number(ctx.opts.wavelength); const cm = Number(ctx.opts.cell);
  const A = spectrometer(obs, nm, cm, ctx.log.length + 11);
  const Co = totalOf(tube, 'Co');
  const x = fractionFromA(A, nm, cm, Co);
  const info = tube.last?.info ?? null;
  const T = tube.tempC;
  const main = Object.entries(tube.doses).filter(([, n]) => n > 0);
  const stress = main.length === 1 ? main[0][0] : main.length ? 'mixed' : 'none';
  const notes = [];
  if (Math.abs(T - 25) > 1.5) notes.push(`tube at ${T.toFixed(0)} °C`);
  if (tube.bath !== 'air') notes.push(tube.bath === 'ice' ? 'in the ice bath' : 'in the hot bath');
  if (Math.abs(T - (tube.bath === 'ice' ? 0 : tube.bath === 'hot' ? 80 : 25)) > 0.7) notes.push('still changing temperature');
  if (A === null) notes.push(`off the scale (A > ${OFF_SCALE}): a thinner cell or a weaker band`);
  if (main.length > 1) notes.push('more than one stress');
  if (tube.content.spilledMl > 0) notes.push(`${tube.content.spilledMl.toFixed(1)} mL ran over the rim`);
  if ((obs.solids.AgCl ?? 0) > 0) notes.push('AgCl precipitate');
  if ((obs.solids.NaCl ?? 0) > 0) notes.push('NaCl undissolved: the brine is saturated');
  const exp = expectation(tube);
  const xPrev = info ? info.xBefore : Math.abs(T - 25) > 1.5 ? observe(tube.content, 25, obs).x : REF.x;
  /* The worksheet's constant: the chloride is the chloride in the tube less the four each CoCl₄²⁻ has taken — and none of this means anything with silver in it. */
  const ClTot = totalOf(tube, 'Cl');
  const ClFree = x === null ? null : ClTot - 4 * x * Co;
  const usable = x !== null && x > 0.03 && x < 0.97 && tube.content.mmol.Ag === 0 && !(obs.solids.NaCl > 0);
  const R = usable ? x / (1 - x) : null;
  const Kc = usable && ClFree > 0 ? R / ClFree ** 4 : null;
  return {
    tube: tube.id, added: DOSES(tube), stress, nDrops: stress === 'mixed' || stress === 'none' ? null : tube.doses[stress],
    T: Number(T.toFixed(1)), nm, cm, A: A === null ? 'off scale' : Number(A.toFixed(3)), blue: x === null ? null : Number(x.toFixed(3)),
    colour: obs.name, Cl: Number(ClTot.toPrecision(3)), QK: info ? Number(info.ratio.toPrecision(2)) : null,
    KT: Math.abs(T - 25) > 1.5 ? Number((kThermo(T) / kThermo(25)).toPrecision(2)) : null, predicted: exp ? exp.dir : '—',
    observed: obs.x > xPrev + 0.02 ? 'bluer' : obs.x < xPrev - 0.02 ? 'pinker' : 'no change',
    logCl: ClFree !== null && ClFree > 0 ? Number(Math.log10(ClFree).toFixed(4)) : null, logR: R === null ? null : Number(Math.log10(R).toFixed(4)),
    Kc: Kc === null ? null : Number(Kc.toPrecision(3)), note: notes.join('; '),
  };
}

/** A straight line through (x, y) points by least squares. */
function fitLine(pts) {
  const n = pts.length; if (n < 3) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n; const my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (sxx < 1e-9) return null;
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { slope, intercept: my - slope * mx };
}

export function analyse(log) {
  const pts = log.filter((r) => r.logR !== null && r.logCl !== null && Math.abs(r.T - 25) < 1.5).map((r) => [r.logCl, r.logR]);
  const fit = fitLine(pts);
  const xs = pts.map((p) => p[0]);
  const line = fit ? [[Math.min(...xs), fit.slope * Math.min(...xs) + fit.intercept], [Math.max(...xs), fit.slope * Math.max(...xs) + fit.intercept]] : undefined;
  const judged = log.filter((r) => r.predicted !== '—' && r.stress !== 'mixed' && r.observed !== 'no change');
  const agree = judged.filter((r) => (r.predicted === 'right') === (r.observed === 'bluer'));
  const Kcs = log.filter((r) => r.Kc !== null && Math.abs(r.T - 25) < 1.5).map((r) => r.Kc);
  return {
    series: [{ name: 'log R', points: pts, line }], points: pts.length, slope: fit ? fit.slope : null,
    judged: judged.length, agree: agree.length, Kc: Kcs.length ? Kcs.reduce((a, b) => a + b, 0) / Kcs.length : null,
  };
}

/* ── What the bench says ──────────────────────────────────────────────────── */

export const activeOf = (s) => s.tubes.find((t) => t.id === s.active);
const bathTarget = (b) => (b === 'ice' ? 0 : b === 'hot' ? 80 : 25);

export function statusOf(s) {
  const t = activeOf(s);
  const target = bathTarget(t.bath);
  if (Math.abs(t.tempC - target) > 0.6) {
    return { key: 'changing', tone: 'info', title: `Tube ${t.id}: ${t.tempC.toFixed(1)} °C, on its way to ${target} °C`, detail: 'A tube takes a minute or so to come to the bath — and the colour follows the temperature. Wait for it before judging (the clock speed helps).' };
  }
  if (t.content.spilledMl > 0) {
    return { key: 'spilled', tone: 'warn', title: `Tube ${t.id} was overfilled`, detail: `${t.content.spilledMl.toFixed(1)} mL ran over the rim, taking its share of everything with it. Take a fresh tube.` };
  }
  if ((t.obs.solids.NaCl ?? 0) > 0) {
    return { key: 'saturated', tone: 'warn', title: `Tube ${t.id}: the brine is saturated`, detail: 'Crystals of salt lie on the bottom. Salt that will not dissolve cannot raise the chloride any further — 6.1 M is as much as sodium chloride can give.' };
  }
  const info = t.last?.info;
  if (info) {
    const r = REAGENT_BY_ID[info.reagent];
    return {
      key: `dose-${info.direction}`, tone: 'ok',
      title: `${r.formula}: Q/K = ${info.ratio.toPrecision(2)} → shifts ${info.direction}`,
      detail: info.direction === 'right'
        ? 'Straight after mixing the quotient is below K, so the system makes more CoCl₄²⁻ until Q has climbed back to K: bluer.'
        : 'Straight after mixing the quotient is above K, so the system turns CoCl₄²⁻ back into the hexaaqua ion until Q has fallen to K: pinker.',
    };
  }
  if (t.bath !== 'air') {
    const r = kThermo(t.tempC) / kThermo(25);
    return { key: `bath-${t.bath}`, tone: 'ok', title: `Tube ${t.id} at ${t.tempC.toFixed(0)} °C: K is ×${r.toPrecision(2)} of its room-temperature value`, detail: r > 1 ? 'The forward reaction takes heat in, so warming favours it: bluer.' : 'The forward reaction takes heat in, so cooling works against it: pinker.' };
  }
  return { key: 'rest', tone: 'info', title: `Tube ${t.id}: 0.10 M cobalt(II) chloride`, detail: 'Four tubes of the same pink solution. Leave one alone as the reference; give the others chloride, water, silver or a bath.' };
}

export const CFG = {
  tubes: [{ id: 'A', label: 'A', tag: '#38bdf8' }, { id: 'B', label: 'B', tag: '#fbbf24' }, { id: 'C', label: 'C', tag: '#34d399' }, { id: 'D', label: 'D', tag: '#f472b6' }],
  roomC: 25,
  baths: { air: { T: 'room', tau: 150 }, ice: { T: 0, tau: 40 }, hot: { T: 80, tau: 40 } },
  pathCm: 1.4,
  reagents: REAGENTS,
  options: { wavelength: { default: '510', values: WAVELENGTHS.map(String) }, cell: { default: '1', values: ['1', '0.1'] } },
  initial: () => referenceContent(),
  add, observe, instant, row, analyse,
};

export const useCoCl = createTubeStore(CFG);
