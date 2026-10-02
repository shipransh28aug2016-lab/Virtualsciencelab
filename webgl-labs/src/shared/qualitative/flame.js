/**
 * The flame test, from emission spectra. A salt on a wire in a Bunsen flame (about 1900 K) is
 * atomised in part; the atoms and the hydroxide and chloride molecules that survive radiate in
 * lines and bands, and the colour of the flame is the CIE colour of the sum of them and of the
 * flame's own faint blue. Cobalt glass is a filter with a band of absorbance at 590 nm. Nothing
 * here says "calcium is brick-red": it says where calcium hydroxide's band is, how strong it is
 * against the others, and what the eye makes of that.
 *
 * Positions are the measured band heads and lines (CaOH 554 and 622 nm; BaOH 487–532 nm and the
 * Ba line at 553.5; CuOH 525–555 and the Cu lines 510–522 nm; the Na D lines at 589.0 and 589.6;
 * Pb 405.8 nm; Zn 472, 481, 636 nm). Strengths are relative: per mole in the flame, for a volatile
 * (chloride) salt, at 1900 K, scaled by exp(−E/kT) for the upper level's energy to follow temperature.
 */
const K_EV = 8.617333e-5;

/* CIE 1931 colour-matching functions: Wyman, Sloan and Shirley (2013). */
const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const xbar = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const ybar = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const zbar = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
const LAMBDAS = Array.from({ length: 81 }, (_, i) => 380 + i * 5);

/** Emitters: λ (nm), width σ (nm), relative strength S per mol/L in the flame, upper-level energy E (eV). */
export const EMITTERS = {
  Na: [{ nm: 589.0, sigma: 2.2, S: 150000, E: 2.10 }, { nm: 589.6, sigma: 2.2, S: 75000, E: 2.10 }],
  K: [{ nm: 766.5, sigma: 3, S: 40, E: 1.62 }, { nm: 769.9, sigma: 3, S: 20, E: 1.62 }, { nm: 404.4, sigma: 3, S: 0.4, E: 3.06 }],
  Ca: [{ nm: 622, sigma: 12, S: 1.0, E: 2.0 }, { nm: 554, sigma: 9, S: 0.3, E: 2.2 }, { nm: 422.7, sigma: 2.5, S: 0.05, E: 2.93 }],
  Ba: [{ nm: 487, sigma: 4, S: 0.1, E: 2.55 }, { nm: 512, sigma: 5, S: 0.5, E: 2.42 }, { nm: 524, sigma: 5, S: 0.7, E: 2.37 }, { nm: 532, sigma: 4, S: 0.5, E: 2.33 }, { nm: 553.5, sigma: 3, S: 2.0, E: 2.24 }],
  Cu: [{ nm: 436, sigma: 10, S: 0.5, E: 2.8 }, { nm: 538, sigma: 13, S: 0.7, E: 2.3 }, { nm: 510.5, sigma: 3, S: 0.25, E: 3.8 }, { nm: 515.3, sigma: 3, S: 0.3, E: 3.8 }, { nm: 521.8, sigma: 3, S: 0.4, E: 3.8 }],
  Pb: [{ nm: 405.8, sigma: 4, S: 0.07, E: 4.37 }, { nm: 368.3, sigma: 4, S: 0.05, E: 4.37 }],
  Zn: [{ nm: 472.2, sigma: 3, S: 0.015, E: 6.5 }, { nm: 481.0, sigma: 3, S: 0.02, E: 6.5 }, { nm: 636.2, sigma: 3, S: 0.012, E: 6.5 }],
  Fe: [{ nm: 640, sigma: 80, S: 0.03, E: 1.9 }, { nm: 430, sigma: 6, S: 0.006, E: 3.3 }],
  Al: [{ nm: 484, sigma: 6, S: 0.012, E: 2.6 }, { nm: 467, sigma: 5, S: 0.008, E: 2.7 }],
};

/** How much of a salt reaches the flame as emitting vapour, by its anion: chlorides are volatile, sulfates are not. */
export const VOLATILITY = { Cl: 1.0, NO3: 0.8, ox: 0.4, CO3: 0.3, SO4: 0.12 };
const ANIONS = ['Cl', 'NO3', 'ox', 'CO3', 'SO4'];

/** The flame's own light: the faint blue of CH at 431 nm and C₂ at 516 nm. */
const BACKGROUND = [{ nm: 431, sigma: 7, S: 0.005 }, { nm: 516, sigma: 14, S: 0.003 }, { nm: 470, sigma: 60, S: 0.0016 }];

/** Cobalt-blue glass: a broad absorbance band at 590 nm (A = 3 at the centre). */
const cobalt = (l) => 10 ** (-3.0 * Math.exp(-0.5 * ((l - 590) / 38) ** 2));

/** The mean volatility of the anions in a tube (weighted by how much of each there is); 1 when the wire went through conc. HCl first. */
export function volatilityOf(mmol, hclDip = false) {
  if (hclDip) return 1;
  let num = 0; let den = 0;
  for (const a of ANIONS) { const n = (mmol[a] ?? 0); num += n * VOLATILITY[a]; den += n; }
  return den > 0 ? num / den : 0.5;
}

/** What a wire dipped in a tube carries: effective mol/L of each emitting element, times the volatility. A loop holds about a hundredth of a mL. */
export function loadFrom(content, { hclDip = false } = {}) {
  const V = content.volumeMl; if (V <= 0) return {};
  const vol = volatilityOf(content.mmol, hclDip);
  const out = {};
  for (const el of Object.keys(EMITTERS)) { const c = (content.mmol[el] ?? 0) / V; if (c > 0) out[el] = c * (el === 'Na' || el === 'K' ? 1 : vol); }
  return out;
}

/** The spectrum of everything on the wire t seconds after it went into the flame, and the colour of it. */
export function flame({ loaded = {}, t = 1, filter = 'none', tempK = 1900, luminous = false }) {
  const tau = 7;                                                 // the sample burns off in some seconds
  const spec = LAMBDAS.map(() => 0);
  const add = (nm, sigma, I) => { LAMBDAS.forEach((l, i) => { spec[i] += I * Math.exp(-0.5 * ((l - nm) / sigma) ** 2); }); };
  for (const b of BACKGROUND) add(b.nm, b.sigma, b.S);
  const shares = {};
  for (const [el, c] of Object.entries(loaded)) {
    const decay = Math.exp(-t / (el === 'Na' ? 25 : tau));                       // sodium lingers on a wire for a good while
    const ceff = (c / (1 + c / 0.3)) * (1 - Math.exp(-t / 0.35)) * decay;     // self-absorption; the wire takes a moment to heat
    let tot = 0;
    for (const e of EMITTERS[el] ?? []) {
      const boltz = Math.exp(-e.E / (K_EV * tempK)) / Math.exp(-e.E / (K_EV * 1900));
      const I = e.S * ceff * boltz; tot += I; add(e.nm, e.sigma, I);
    }
    shares[el] = tot;
  }
  if (luminous) add(620, 90, 0.5);                                                // a yellow, sooty flame: incandescent carbon
  let X = 0; let Y = 0; let Z = 0;
  LAMBDAS.forEach((l, i) => { const f = filter === 'cobalt' ? cobalt(l) : 1; X += spec[i] * f * xbar(l); Y += spec[i] * f * ybar(l); Z += spec[i] * f * zbar(l); });
  let lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  const floor = Math.min(...lin);
  if (floor < 0) lin = lin.map((v) => v - floor);                                  // a colour outside the screen's gamut: add white until it is in
  const mx = Math.max(...lin, 1e-12);
  const brightness = 1 - Math.exp(-Y / 0.9);
  const unit = lin.map((v) => v / mx);
  const enc = unit.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  const lit = 0.6 + 0.4 * brightness;
  const srgb = enc.map((v) => Math.min(1, v * lit));
  const hex = `#${srgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  const dominant = Object.entries(shares).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const lambdaD = dominantWavelength(X, Y, Z);
  return { srgb, hex, brightness, Y, hue: hueOf(srgb), dominant, lambdaD, name: flameWord(srgb, brightness, lambdaD) };
}

/** The dominant wavelength of a colour (nm): where the line from the white point through its chromaticity meets the spectral locus. */
export function dominantWavelength(X, Y, Z) {
  const sum = X + Y + Z; if (sum <= 0) return 0;
  const x = X / sum; const y = Y / sum; const xw = 0.3127; const yw = 0.3290;
  const ang = Math.atan2(y - yw, x - xw);
  let best = 0; let bd = Infinity;
  for (let l = 420; l <= 650; l += 1) {          // the colour-matching fit is not to be trusted beyond about 650 nm
    const a = xbar(l); const b = ybar(l); const c = zbar(l); const s = a + b + c;
    const d = Math.abs((((Math.atan2(b / s - yw, a / s - xw) - ang) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

function hueOf([r, g2, b]) {
  const mx = Math.max(r, g2, b); const mn = Math.min(r, g2, b); const d = mx - mn;
  if (d < 1e-6) return 0;
  let h; if (mx === r) h = ((g2 - b) / d + 6) % 6; else if (mx === g2) h = (b - r) / d + 2; else h = (r - g2) / d + 4;
  return h * 60;
}

/** The notebook's word for a flame colour, from its dominant wavelength; for a dim flame, "no characteristic colour". */
export function flameWord(srgb, brightness, lambdaD) {
  if (brightness < 0.14) return 'no characteristic colour (the pale blue of the flame itself)';
  const mx = Math.max(...srgb); const mn = Math.min(...srgb);
  if (mx - mn < 0.1) return 'a pale, whitish flame';
  if (lambdaD < 455) return 'lilac (violet)';
  if (lambdaD < 492) return 'blue';
  if (lambdaD < 513) return 'bluish-green';
  if (lambdaD < 553) return 'apple-green';
  if (lambdaD < 572) return 'yellowish-green';
  if (lambdaD < 586) return 'yellow';
  if (lambdaD < 596) return 'persistent golden-yellow';
  if (lambdaD < 608) return 'brick-red (orange-red)';
  return 'crimson-red';
}
