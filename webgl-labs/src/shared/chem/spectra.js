/**
 * Spectra and colour — what a solution LOOKS like, from what it absorbs.
 *
 * A coloured solution is a transmission spectrum. Beer–Lambert gives it:
 *
 *      A(λ) = l · Σ εᵢ(λ) cᵢ          T(λ) = 10^(−A(λ))
 *
 * and the eye turns T(λ) into a colour through the CIE colour-matching
 * functions. So the red of methyl orange in acid, the yellow of the same dye in
 * base, and every shade of a universal indicator between them are not painted:
 * each is the spectrum of whatever is actually in the beaker at that pH, dyed
 * through the same pipeline. Dilute a solution and the colour pales for the
 * reason it does in a real flask; mix two dyes and the colour mixes subtractively.
 *
 * Species are described by Gaussian absorption bands — λ₀ (nm), ε₀ (M⁻¹ cm⁻¹),
 * σ (nm) — which is as much structure as a school-level spectrum has.
 */

const LAMBDAS = Array.from({ length: 31 }, (_, i) => 400 + i * 10);      // 400–700 nm
const DL = 10;

/* CIE 1931 colour-matching functions, by the multi-lobe Gaussian fit of Wyman,
   Sloan and Shirley (2013). */
const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const xbar = (l) => 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
const ybar = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
const zbar = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
const CMF = LAMBDAS.map((l) => [xbar(l), ybar(l), zbar(l)]);

const toLinearRGB = ([X, Y, Z]) => [
  3.2406 * X - 1.5372 * Y - 0.4986 * Z,
  -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
  0.0557 * X - 0.2040 * Y + 1.0570 * Z,
];
const XYZ_WHITE = CMF.reduce((a, c) => [a[0] + c[0] * DL, a[1] + c[1] * DL, a[2] + c[2] * DL], [0, 0, 0]);
const RGB_WHITE = toLinearRGB(XYZ_WHITE);

/** A Gaussian band as ε(λ). */
export const bandAt = (b, l) => b.eps * Math.exp(-0.5 * ((l - b.l0) / b.sigma) ** 2);

/** ε(λ) of one absorbing species: the sum of its bands. */
export const epsilonAt = (bands, l) => bands.reduce((a, b) => a + bandAt(b, l), 0);

/**
 * Absorbance spectrum per cm of a mixture: [{ bands, conc }], conc in mol/L.
 */
export function absorbancePerCm(components) {
  return LAMBDAS.map((l) => components.reduce((a, c) => a + c.conc * epsilonAt(c.bands, l), 0));
}

/**
 * The colour of white light after a path of `pathCm` through the mixture, white
 * balanced so that a clear solution is exactly white. Returns linear RGB in
 * [0, 1] — the transmitted fraction per channel, which is also what a shader
 * needs — and the gamma-encoded sRGB for the interface.
 */
export function colourThrough(absPerCm, pathCm = 1) {
  let X = 0; let Y = 0; let Z = 0;
  for (let i = 0; i < LAMBDAS.length; i += 1) {
    const T = 10 ** (-absPerCm[i] * pathCm);
    X += T * CMF[i][0] * DL; Y += T * CMF[i][1] * DL; Z += T * CMF[i][2] * DL;
  }
  const lin = toLinearRGB([X, Y, Z]).map((v, k) => Math.min(1, Math.max(0, v / RGB_WHITE[k])));
  const enc = lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return { linear: lin, srgb: enc, hex: `#${enc.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}` };
}

/**
 * The shader's absorption coefficient, α per scene unit (10 cm), per channel,
 * such that exp(−α L) reproduces the colour at the reference path. The shader
 * then supplies the true chord L, so the same solution is paler at the rim of a
 * beaker and deeper through its middle.
 */
export function sceneAbsorption(linear, pathCm = 1) {
  const pathUnits = pathCm / 10;
  return linear.map((c) => -Math.log(Math.max(c, 0.015)) / pathUnits);
}

/* ── Colour difference, for reading a colour chart ────────────────────────── */

const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function srgbToLab(srgb) {
  const lin = srgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = 0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2];
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const Z = 0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2];
  const fx = labF(X / 0.95047); const fy = labF(Y); const fz = labF(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Hue in degrees (0 red, 120 green, 240 blue) of an sRGB colour, for tests. */
export function hueOf([r, g2, b]) {
  const mx = Math.max(r, g2, b); const mn = Math.min(r, g2, b);
  if (mx === mn) return NaN;
  const d = mx - mn;
  const h = mx === r ? ((g2 - b) / d) % 6 : mx === g2 ? (b - r) / d + 2 : (r - g2) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * Two coloured media in series: their transmittances multiply per channel. A
 * universal indicator in orange juice is the indicator's colour seen through the
 * juice's own, which is why indicator colours are unreliable in coloured samples.
 */
export function multiplyColour(a, b) {
  const lin = a.linear.map((v, i) => v * b[i]);
  const enc = lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return { linear: lin, srgb: enc, hex: `#${enc.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}` };
}
