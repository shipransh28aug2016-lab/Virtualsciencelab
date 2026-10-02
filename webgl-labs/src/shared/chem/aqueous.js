/**
 * Aqueous equilibria — one solver for every acid, base, salt, buffer and
 * ampholyte on the bench.
 *
 * It does not know what an "acid" is. It knows three things and one law:
 *
 *   STRONG IONS   present at fixed concentration, whatever the pH
 *   WEAK SYSTEMS  a total concentration C of something that can lose protons,
 *                 with successive pKa values and the charge of its most
 *                 protonated form. A base is the same object added in its
 *                 deprotonated form — ammonia is { z0: +1, pKa: 9.245 } — so
 *                 acids, bases, salts and buffers need no special cases.
 *   SOLIDS        sparingly soluble hydroxides held by a solubility product
 *   THE LAW       electroneutrality:  [H⁺] + Σ(cations) = [OH⁻] + Σ(anions)
 *
 * The charge balance is monotonic in pH — more base, more negative charge — so
 * it is solved by bisection, which cannot fail to converge. Nothing is
 * approximated: not "[H⁺] ≈ √(Ka C)", not "ignore water". That is how 10⁻⁸ M HCl
 * comes out at pH 6.98 rather than 8, and why a 0.1 M solution of a weak acid
 * and a 0.1 M solution of its salt both fall out of the same code.
 *
 * ACTIVITIES. A pH meter measures the activity of H⁺, not its concentration, so
 * the solver works in activities with the Davies equation,
 *
 *     log γ = −A z² ( √I/(1+√I) − 0.3 I ),   A = 0.509 at 25 °C
 *
 * and the ionic strength I is itself computed from the solution found, so the
 * two are iterated to agreement. That is the difference between pH 1.00 and the
 * 1.09 a real 0.1 M HCl gives, and it is the first thing a student's meter
 * disagrees with the textbook about.
 */
import { bisect } from '../numerics.js';
import { pKw as pKwOf, daviesA, R, LN10, KELVIN } from './constants.js';

const DAVIES_LIMIT = 2.0;       // above this ionic strength the equation is extrapolated

function gammaOf(z, I, A) {
  if (z === 0) return 1;
  const sq = Math.sqrt(I);
  return 10 ** (-A * z * z * (sq / (1 + sq) - 0.3 * I));
}

/** γ for an ion of charge z at ionic strength I and temperature tC (Davies). */
export const activityCoefficient = (z, I, tC = 25) => gammaOf(z, Math.min(I, DAVIES_LIMIT), daviesA(tC));

/**
 * Solve a system for pH.
 *
 *   system = {
 *     T,                                   °C
 *     strong: [{ z, c }],                  fixed ions, mol/L
 *     weak:   [{ id, C, z0, pKas }],       weak systems, mol/L total
 *     solids: [{ id, z, Ksp, total }],     excess sparingly soluble hydroxides
 *   }
 *
 * Returns { pH, aH, H, OH, ionicStrength, gammaH, species, imbalance, extrapolated }.
 */
export function solveAqueous(system) {
  const T = system.T ?? 25;
  const A = daviesA(T);
  const Kw = 10 ** -pKwOf(T);
  const strong = system.strong ?? [];
  /* pKa at this temperature, by van 't Hoff from the 25 °C value. */
  const dInvT = 1 / (T + KELVIN) - 1 / (25 + KELVIN);
  const weak = (system.weak ?? []).map((w) => ({
    ...w, pKas: w.pKas.map((pk, j) => pk + (((w.dH?.[j] ?? 0) * 1000) / (R * LN10)) * dInvT),
  }));
  const solids = system.solids ?? [];

  const strongI = 0.5 * strong.reduce((a, s) => a + s.c * s.z * s.z, 0);

  /* Everything that depends on pH, at a given ionic strength. */
  const speciate = (pH, I) => {
    const gz = (z) => gammaOf(z, I, A);
    const aH = 10 ** -pH;
    const H = aH / gz(1);
    const OH = Kw / aH / gz(1);

    let net = H - OH;                                  // net positive charge, mol/L
    let ionic = 0.5 * (H + OH);

    for (const s of strong) { net += s.z * s.c; ionic += 0.5 * s.c * s.z * s.z; }

    const systems = weak.map((w) => {
      /* Successive species S₀…Sₙ, Sⱼ having lost j protons. From
         Kⱼ = a(Sⱼ) aH / a(Sⱼ₋₁):  [Sⱼ]/[Sⱼ₋₁] = Kⱼ γ(Sⱼ₋₁) / (γ(Sⱼ) aH). */
      const weights = [1];
      for (let j = 1; j <= w.pKas.length; j += 1) {
        const ratio = (10 ** -w.pKas[j - 1]) * gz(w.z0 - (j - 1)) / (gz(w.z0 - j) * aH);
        weights.push(weights[j - 1] * ratio);
      }
      const total = weights.reduce((a, b) => a + b, 0);
      const species = weights.map((wj, j) => ({ z: w.z0 - j, fraction: wj / total, conc: (w.C * wj) / total }));
      for (const sp of species) { net += sp.z * sp.conc; ionic += 0.5 * sp.conc * sp.z * sp.z; }
      return { id: w.id, species };
    });

    const dissolved = solids.map((sol) => {
      /* Ksp = a(M) a(OH)ⁿ with n = z, and the solid cannot dissolve more than
         there is of it. */
      const aOH = Kw / aH;
      const c = Math.min(sol.total, (sol.Ksp / aOH ** sol.z) / gz(sol.z));
      net += sol.z * c; ionic += 0.5 * sol.z * sol.z * c;
      return { id: sol.id, c, saturated: c < sol.total * 0.999 };
    });

    return { aH, H, OH, net, ionic, systems, dissolved };
  };

  /* pH and I depend on each other; iterate to agreement, damped. */
  let I = strongI;
  let pH = 7;
  let conv = false;
  for (let it = 0; it < 80; it += 1) {
    pH = bisect((p) => speciate(p, Math.min(I, DAVIES_LIMIT)).net, -3, 17.5, { tol: 1e-13 });
    const next = speciate(pH, Math.min(I, DAVIES_LIMIT)).ionic;
    if (Math.abs(next - I) < 1e-12 * Math.max(1, I)) { I = next; conv = true; break; }
    I = 0.5 * I + 0.5 * next;
  }

  const final = speciate(pH, Math.min(I, DAVIES_LIMIT));
  return {
    pH, aH: final.aH, H: final.H, OH: final.OH,
    ionicStrength: I, gammaH: gammaOf(1, Math.min(I, DAVIES_LIMIT), A),
    species: final.systems, solids: final.dissolved,
    imbalance: final.net,                    // should be ~0: electroneutrality, to machine precision
    converged: conv && Number.isFinite(pH),
    extrapolated: I > DAVIES_LIMIT,
    /* Davies is validated against the NIST primary standards at I ≤ 0.1 (to
       0.01 pH). By I ≈ 0.3 it is good to a tenth or two for 2:1 salts, and the
       bench says so rather than implying a precision it does not have. */
    accuracy: I <= 0.15 ? 'good' : I <= DAVIES_LIMIT ? 'approximate' : 'poor',
  };
}

/** Scale every concentration by f — dilution, or concentrating by evaporation. */
export function dilute(system, f) {
  return {
    ...system,
    strong: (system.strong ?? []).map((s) => ({ ...s, c: s.c * f })),
    weak: (system.weak ?? []).map((w) => ({ ...w, C: w.C * f })),
    /* A solid in excess is not diluted by water: it is still there, and it still
       saturates. Only the amount available to dissolve is unchanged. */
    solids: system.solids ?? [],
  };
}

/** Add something else's weak systems and counter-ions to a system. */
export function withAdditive(system, additive) {
  return { ...system, strong: [...(system.strong ?? []), ...(additive.strong ?? [])], weak: [...(system.weak ?? []), ...(additive.weak ?? [])] };
}

/** Add a fixed ion — a drop of strong acid or base seen from the solver's side. */
export function withIon(system, z, c) {
  return { ...system, strong: [...(system.strong ?? []), { z, c }] };
}

/**
 * Buffer capacity β = dC_base/dpH, mol L⁻¹ pH⁻¹, by adding a hair of strong base
 * and seeing how far the pH moves. The measure of how much a solution resists
 * having its pH changed, and the reason a buffer is a buffer: β peaks when the
 * acid and its conjugate base are present in equal amounts, at 0.576 C.
 */
export function bufferCapacity(system, delta = 1e-6) {
  const a = solveAqueous(system).pH;
  const b = solveAqueous(withIon(system, +1, delta)).pH;
  return delta / (b - a);
}

/**
 * Mix solutions: [{ system, volume }] → the system the mixture is, with every
 * concentration the volume-weighted average. Nothing is solved here — the
 * result is just another system, and the solver finds what the mixing did.
 * That is how a film of acid carried on an unrinsed electrode into pure water,
 * or the 24.9 mL of base in a titration flask, ends up as a pH.
 */
export function mix(parts) {
  const V = parts.reduce((a, p) => a + p.volume, 0);
  const strong = [];
  const weakTotals = new Map();
  const solids = [];
  let T = 0;
  for (const { system, volume } of parts) {
    const f = volume / V;
    T += (system.T ?? 25) * f;
    for (const s of system.strong ?? []) strong.push({ z: s.z, c: s.c * f });
    for (const w of system.weak ?? []) {
      const prev = weakTotals.get(w.id);
      weakTotals.set(w.id, { ...w, C: (prev?.C ?? 0) + w.C * f });
    }
    for (const sol of system.solids ?? []) if (!solids.some((x) => x.id === sol.id)) solids.push(sol);
  }
  return { T, strong, weak: [...weakTotals.values()], solids };
}

/* ── Building a system from things off the shelf ─────────────────────────── */

/**
 * Assemble a system from recipes (see species.js). Each part is
 * { recipe, scale }: `scale` is the molarity of a chemical, or the dilution of a
 * food (1 = as it comes from the bottle). Weak systems of the same kind add
 * their totals — acetic acid and sodium acetate in one beaker are one acetic
 * system, and the solver finds the buffer on its own.
 */
export function systemFrom(parts, { T = 25, WEAK, SOLIDS }) {
  const strong = [];
  const weakTotals = new Map();
  const solids = [];
  for (const { recipe, scale } of parts) {
    for (const s of recipe.strong ?? []) strong.push({ z: s.z, c: s.c * scale });
    for (const w of recipe.weak ?? []) weakTotals.set(w.id, (weakTotals.get(w.id) ?? 0) + w.c * scale);
    if (recipe.solid) solids.push({ ...SOLIDS[recipe.solid.id], total: recipe.solid.total });
  }
  const weak = [...weakTotals].map(([id, C]) => ({ id, C, z0: WEAK[id].z0, pKas: WEAK[id].pKas, dH: WEAK[id].dH }));
  return { T, strong, weak, solids };
}
