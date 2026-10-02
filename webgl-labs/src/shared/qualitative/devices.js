/**
 * The small instruments of a qualitative-analysis bench — what a strip of paper, a nose and a glass
 * rod tell you about the gas over a tube. Each one reads the same physical quantity the solver
 * already has (the partial pressure of ammonia over the liquid, from Henry's law) and applies the
 * physics of the device: a film of moist water on the paper dissolves ammonia and becomes basic;
 * a nose has a threshold in parts per million; a rod wet with conc. HCl makes a smoke of
 * ammonium chloride where the two gases meet.
 */
import { HENRY_NH3 } from './ions.js';

/** The gas that reaches something held at the mouth of an open tube is a fraction of what is over the liquid: more when it is hot and rising. */
export const headspaceFraction = (tempC) => 0.12 + 0.5 * Math.max(0, Math.min(1, (tempC - 25) / 70));

/** ppm of ammonia at the mouth of the tube. */
export const ammoniaPpm = (obs) => obs.pNH3 * headspaceFraction(obs.tempC) * 1e6;

/**
 * pH of the film of moist water on a strip of paper held in air with ammonia at pressure p (atm) for `seconds`.
 * The film (about 10 mg of water on a square centimetre) has the air's carbon dioxide in it — 1.3·10⁻⁵ M of H₂CO₃*, pH 5.6
 * before there is any ammonia — and the ammonia that diffuses to it (D = 2.3·10⁻⁵ m²/s through a 1 mm still layer) neutralises
 * that and then makes it basic: [H⁺] + [NH₄⁺] = [OH⁻] + [HCO₃⁻], solved for [H⁺], with [NH₄⁺] what has arrived, 4.7·10⁻⁵ M per ppm
 * in 5 s, or what Henry's law would let the film hold if that is less. About one part per million turns red litmus in a few seconds.
 */
export function filmPH(p, seconds = 5) {
  const nh3 = HENRY_NH3.K25 * p; const co2 = 1.3e-5;
  const arrived = 4.7e-5 * (p * 1e6) * (seconds / 5);
  const f = (pH) => { const h = 10 ** -pH; return h + Math.min(arrived, nh3 * h * 10 ** 9.244) - 1e-14 / h - 10 ** -6.352 * co2 / h; };
  let lo = 3; let hi = 12;
  for (let i = 0; i < 70; i += 1) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/** Litmus changes colour over pH 4.5–8.3 (pKa about 6.5): red below, blue above, purple in between. */
export function litmusColour(pH) {
  const f = 1 / (1 + 10 ** (6.5 - pH));          // fraction in the blue form
  const red = [0.86, 0.22, 0.30]; const blue = [0.25, 0.32, 0.78];
  const rgb = red.map((v, i) => v + f * (blue[i] - v));
  return { frac: f, srgb: rgb, hex: `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}` };
}

/** A strip of moist litmus held at the mouth of the tube: red paper (the acid form) can turn blue, blue paper can turn red. */
export function litmusAtMouth(obs, kind) {
  const ppm = ammoniaPpm(obs);
  const pH = filmPH(ppm * 1e-6);
  const now = litmusColour(pH);
  const was = litmusColour(kind === 'red' ? 4.2 : 9.4);
  const turned = kind === 'red' && now.frac > 0.7;
  return { pH, ppm, was, now: kind === 'red' ? now : was, turned, text: kind === 'red' ? (turned ? 'moist red litmus turns blue' : 'moist red litmus stays red') : 'moist blue litmus stays blue' };
}

/** What a careful sniff (a hand wafting the air towards the nose) makes of it. */
export function smellOf(obs) {
  const ppm = ammoniaPpm(obs);
  const text = ppm < 3 ? 'no smell' : ppm < 20 ? 'a faint smell of ammonia' : ppm < 200 ? 'a pungent smell of ammonia' : 'a choking, tear-starting smell of ammonia — too much to sniff safely';
  return { ppm, text, hazard: ppm >= 300 };
}

/** A glass rod wet with concentrated HCl held at the mouth: NH₃ + HCl → NH₄Cl as a white smoke. */
export function hclRod(obs) {
  const ppm = ammoniaPpm(obs);
  return { ppm, fumes: ppm > 3, text: ppm > 3 ? 'dense white fumes round the rod (ammonium chloride)' : 'nothing visible at the rod' };
}
