/**
 * Acid–base indicators, as the weak acids they are.
 *
 * An indicator is a weak acid whose conjugate forms have different colours, so
 * its colour is a readout of the fraction in each form, and that fraction is set
 * by pH through its own pKa:
 *
 *      [In⁻]/[HIn] = 10^(pH − pKa)       (× activity coefficients)
 *
 * which is why an indicator "changes" over about pKa ± 1 and is not, as
 * schoolbooks sometimes imply, a switch at a number. Two consequences follow
 * that a student should be able to find out for themselves:
 *
 *   · the colour of a solution at a given pH is the MIX of the two forms, so
 *     between the pure colours there is an intermediate one (orange for methyl
 *     orange, which is neither red nor yellow); and
 *   · an indicator is itself an acid or base, so a few drops in a very weakly
 *     buffered sample change its pH. The indicator goes into the solver as one
 *     more weak system.
 *
 * The absorption bands are the dyes' published λmax and ε, as Gaussians.
 */
import { colourThrough, absorbancePerCm, srgbToLab, deltaE } from './spectra.js';
import { gaussian } from '../numerics.js';
import { activityCoefficient } from './aqueous.js';

/* Each form: bands [{ l0, eps, sigma }]. z0 is the charge of the most protonated
   form; pKas are successive. */
export const INDICATORS = {
  methylOrange: {
    id: 'methylOrange', label: 'Methyl orange', z0: 0, pKas: [3.46], range: [3.1, 4.4], MW: 327.3,
    forms: [{ name: 'HIn', colour: 'red', bands: [{ l0: 510, eps: 4.0e4, sigma: 48 }] },
            { name: 'In⁻', colour: 'yellow', bands: [{ l0: 464, eps: 2.7e4, sigma: 42 }] }],
  },
  methylRed: {
    id: 'methylRed', label: 'Methyl red', z0: 0, pKas: [5.0], range: [4.4, 6.2], MW: 269.3,
    forms: [{ name: 'HIn', colour: 'red', bands: [{ l0: 530, eps: 2.5e4, sigma: 46 }] },
            { name: 'In⁻', colour: 'yellow', bands: [{ l0: 430, eps: 2.0e4, sigma: 46 }] }],
  },
  bromothymolBlue: {
    id: 'bromothymolBlue', label: 'Bromothymol blue', z0: -1, pKas: [7.1], range: [6.0, 7.6], MW: 624.4,
    forms: [{ name: 'HIn⁻', colour: 'yellow', bands: [{ l0: 430, eps: 1.9e4, sigma: 38 }] },
            { name: 'In²⁻', colour: 'blue', bands: [{ l0: 617, eps: 3.8e4, sigma: 38 }] }],
  },
  phenolphthalein: {
    id: 'phenolphthalein', label: 'Phenolphthalein', z0: 0, pKas: [9.3], range: [8.2, 10.0], MW: 318.3,
    forms: [{ name: 'HIn', colour: 'colourless', bands: [] },
            /* The dianion's band is not a single Gaussian: it is asymmetric, with a
               shoulder near 515 nm and absorption tailing into the violet. A lone
               553 nm band renders violet; the real solution is magenta-pink. */
            { name: 'In⁻', colour: 'pink', bands: [{ l0: 553, eps: 3.0e4, sigma: 34 }, { l0: 515, eps: 0.5e4, sigma: 28 }, { l0: 410, eps: 1.0e4, sigma: 45 }] }],
  },
  thymolBlue: {
    id: 'thymolBlue', label: 'Thymol blue', z0: 0, pKas: [1.65, 8.9], range: [1.2, 2.8], MW: 466.6,
    forms: [{ name: 'H₂In', colour: 'red', bands: [{ l0: 548, eps: 3.0e4, sigma: 40 }] },
            { name: 'HIn⁻', colour: 'yellow', bands: [{ l0: 430, eps: 1.8e4, sigma: 40 }] },
            { name: 'In²⁻', colour: 'blue', bands: [{ l0: 596, eps: 3.4e4, sigma: 40 }] }],
  },
  litmus: {
    id: 'litmus', label: 'Litmus', z0: 0, pKas: [6.5], range: [4.5, 8.3], MW: 0,
    forms: [{ name: 'HIn', colour: 'red', bands: [{ l0: 505, eps: 1.2e4, sigma: 60 }] },
            { name: 'In⁻', colour: 'blue', bands: [{ l0: 590, eps: 1.4e4, sigma: 50 }] }],
  },
};

/**
 * Universal indicator: Yamada's formulation, a mixture of four indicators whose
 * transitions overlap so that the colour walks through the spectrum as pH rises.
 * Proportions are the published ones by mass (thymol blue 0.05 g, methyl red
 * 0.125 g, bromothymol blue 0.6 g, phenolphthalein 0.2 g), converted to moles.
 * `scale` sets the strength; it is a property of how much dye is in the bottle,
 * not a tuned colour.
 */
const YAMADA_G = { thymolBlue: 0.05, methylRed: 0.125, bromothymolBlue: 0.6, phenolphthalein: 0.2 };
export const UNIVERSAL_MOLES = Object.fromEntries(
  Object.entries(YAMADA_G).map(([id, grams]) => [id, grams / INDICATORS[id].MW]),
);
const BTB_MOLES = UNIVERSAL_MOLES.bromothymolBlue;
/* Bottle strength, mol/L of bromothymol blue in the tube. At 3×10⁻⁵ the acid end
   comes out a pale salmon; at 6×10⁻⁵ it is the orange-red of a real universal
   indicator, and the base end a clear blue. Strength is how much dye is in the
   bottle — an appearance parameter, not a thermodynamic one; every pKa is the
   published value. */
export const UNIVERSAL_STRENGTH = 6.0e-5;

export const universalConcentrations = (strength = UNIVERSAL_STRENGTH) => Object.fromEntries(
  Object.entries(UNIVERSAL_MOLES).map(([id, n]) => [id, (n / BTB_MOLES) * strength]),
);

/**
 * Fractions of an indicator in each form at a given pH, with the activity
 * coefficients the solver found. Same algebra as aqueous.js.
 */
export function formFractions(ind, pH, gz = () => 1) {
  const aH = 10 ** -pH;
  const w = [1];
  for (let j = 1; j <= ind.pKas.length; j += 1) {
    w.push(w[j - 1] * ((10 ** -ind.pKas[j - 1]) * gz(ind.z0 - (j - 1))) / (gz(ind.z0 - j) * aH));
  }
  const tot = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / tot);
}

/**
 * An indicator, as the thing it adds to a sample for the SOLVER: its weak
 * systems, and the counter-ion that makes the bottle electroneutral.
 *
 * The counter-ion is the subtle part and getting it wrong pushes the pH the
 * wrong way. A bottle of indicator is adjusted to sit at the dye's own mid-range
 * — so that a drop does not change the colour of what it is dropped into — which
 * means each dye molecule carries, on average, the charge it has at that pH, and
 * is accompanied by exactly enough Na⁺ to balance it. Added to a sample at that
 * pH it changes nothing; added anywhere else it takes up or gives off protons,
 * which is the whole of how an indicator disturbs what it measures.
 */
export function indicatorAdditive(concs) {
  const weak = []; let counter = 0;
  for (const [id, C] of Object.entries(concs)) {
    const ind = INDICATORS[id];
    const mid = 0.5 * (ind.pKas[0] + ind.pKas[ind.pKas.length - 1]);
    const f = formFractions(ind, mid);
    const avgCharge = f.reduce((a, fj, j) => a + fj * (ind.z0 - j), 0);
    weak.push({ id, C, z0: ind.z0, pKas: ind.pKas });
    counter += -avgCharge * C;
  }
  return { weak, strong: [{ z: +1, c: counter }] };
}

/** The colour of a set of indicators at a pH, through `pathCm` of solution. */
export function indicatorColour(concs, pH, { pathCm = 1, gz } = {}) {
  const components = [];
  for (const [id, c] of Object.entries(concs)) {
    const ind = INDICATORS[id];
    const f = formFractions(ind, pH, gz);
    ind.forms.forEach((form, j) => { if (form.bands.length) components.push({ bands: form.bands, conc: c * f[j] }); });
  }
  return colourThrough(absorbancePerCm(components), pathCm);
}

export const universalColour = (pH, opts = {}) => indicatorColour(universalConcentrations(opts.strength), pH, opts);

/* ── The colour chart a student matches against ───────────────────────────── */

export const CHART_PH = Array.from({ length: 14 }, (_, i) => i + 1);

/** Patches for the chart on a pH-paper booklet or a universal-indicator card. */
export function buildChart({ pathCm = 1, strength } = {}) {
  return CHART_PH.map((pH) => {
    const c = universalColour(pH, { pathCm, strength });
    return { pH, hex: c.hex, srgb: c.srgb, lab: srgbToLab(c.srgb) };
  });
}

/**
 * What a student reads off the chart: the patch nearest in colour to what they
 * see. Returns the pH of that patch and how close the match was.
 *
 * `noise` is the standard deviation, in CIE ΔE, of the student's own judgement —
 * ambient lighting, the strip still wet, a chart printed on paper — and it is
 * the reason the method has the resolution it does. Without it the chart would
 * be read perfectly, since the colour in the tube and the colour on the chart
 * come out of the same arithmetic; with a realistic 5–6 ΔE adjacent patches in
 * the green and blue-green either side of neutral are easy to confuse, and the
 * answer is good to about a unit. That is not a flaw in the chart. It is why a
 * meter exists.
 */
export function readChart(srgb, chart, { rng = null, noise = 0 } = {}) {
  const lab = srgbToLab(srgb);
  const seen = rng && noise ? lab.map((v) => v + gaussian(rng) * noise) : lab;
  let best = chart[0]; let bd = Infinity;
  for (const p of chart) { const d = deltaE(seen, p.lab); if (d < bd) { bd = d; best = p; } }
  return { pH: best.pH, deltaE: bd };
}

/**
 * An indicator in a vessel: the colour a solution of pH `pH`, ionic strength
 * `I` and total volume `volumeMl` shows after `drops` drops of the bottle. The
 * dye is diluted by the volume it goes into, so the same drops are a paler
 * colour in a bigger flask. Universal indicator is dosed like the tube it was
 * made for — five drops in 10 mL is the reference strength.
 */
export const INDICATOR_BOTTLES = { phenolphthalein: 1.0, methylOrange: 1.0, bromothymolBlue: 0.4, methylRed: 0.2, thymolBlue: 0.4 };   // g/L
const CLEAR = { linear: [1, 1, 1], srgb: [1, 1, 1], hex: '#ffffff' };
export function vesselColour({ indicator, drops, pH, I = 0, tC = 25, volumeMl, pathCm = 3, dropMl = 0.05 }) {
  if (!indicator || indicator === 'none' || drops <= 0) return CLEAR;
  const gz = (z) => activityCoefficient(z, I, tC);
  if (indicator === 'universal') {
    return indicatorColour(universalConcentrations(UNIVERSAL_STRENGTH * (drops / 5) * (10 / volumeMl)), pH, { pathCm, gz });
  }
  const conc = (INDICATOR_BOTTLES[indicator] / INDICATORS[indicator].MW) * ((drops * dropMl) / volumeMl);
  return indicatorColour({ [indicator]: conc }, pH, { pathCm, gz });
}
