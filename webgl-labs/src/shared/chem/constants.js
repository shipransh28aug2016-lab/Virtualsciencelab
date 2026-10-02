/** Physical constants and the temperature dependence every aqueous calculation needs. */

export const R = 8.314462618;            // J mol⁻¹ K⁻¹
export const F = 96485.33212;            // C mol⁻¹
export const K_B = 1.380649e-23;
export const N_A = 6.02214076e23;
export const KELVIN = 273.15;
export const LN10 = Math.LN10;

/**
 * pK_w(T), the self-ionisation of water: the Harned–Robinson fit
 *
 *     pKw = 4470.99/T − 6.0875 + 0.01706 T
 *
 * 14.94 at 0 °C, 13.995 at 25 °C, 12.26 at 100 °C — which is why neutral water
 * is pH 7.47 in an ice bath and pH 6.13 at the boil, and why "neutral is pH 7"
 * is a statement about 25 °C and not about neutrality.
 */
export const pKw = (tC) => {
  const T = tC + KELVIN;
  return 4470.99 / T - 6.0875 + 0.01706 * T;
};

/** The Debye–Hückel slope A(T) for water, per the Davies form. 0.511 at 25 °C. */
export const daviesA = (tC) => 0.4918 + 6.6e-4 * tC + 5.0e-6 * tC * tC;

/** The Nernstian slope of a glass electrode, mV per pH unit: 2.303RT/F. 59.16
 *  at 25 °C, and it is temperature that changes it, which is why a pH meter has
 *  a temperature compensation at all. */
export const nernstSlope_mV = (tC) => (1000 * LN10 * R * (tC + KELVIN)) / F;
