/**
 * Speciation by mass action — the general form of what aqueous.js does for
 * acids and bases, for anything that forms complexes.
 *
 * A system is a set of COMPONENTS (the species you could weigh out: Fe³⁺, SCN⁻,
 * oxalate, H⁺) and SPECIES built from them (FeSCN²⁺ = Fe + SCN, Fe(ox)₃³⁻ =
 * Fe + 3 ox, OH⁻ = −H, …), each with a formation constant. The unknowns are the
 * free concentrations of the components; the equations are
 *
 *   mass balance      T_j = c_j + Σ_s ν_sj c_s           (each component)
 *   electroneutrality Σ z_i c_i + spectators = 0         (for the one component
 *                                                          named `charge`, usually H⁺ — which
 *                                                          is how a pH is solved, not assumed)
 *   mass action       c_s = K_s(T) Π (γ_j c_j)^ν_sj / γ_s
 *
 * with Davies activities recomputed from the solution as it is found, and
 * K_s(T) from van 't Hoff. Newton–Raphson on ln c, a numerical Jacobian and a
 * backtracking line search, restarted from several guesses: a complex that is
 * 10²⁰ times more stable than its parts is a stiff problem, and a solver that
 * cannot take it is not the one to put under a student's experiment.
 *
 * `freeze` holds named species at a fixed concentration and solves everything
 * else around them — the way to ask "what is the reaction quotient the INSTANT
 * after the acid goes in, before this one equilibrium has had time to move".
 *
 * SOLIDS. A sparingly soluble salt is a phase, not a species: it is there only if
 * the solution would otherwise be supersaturated, and then exactly enough of it
 * comes out for the ion activity product to equal Ksp. The solver finds which
 * solids are present by trying: solve with none, test every solid's product
 * against its Ksp, add the ones that are over, re-solve with their amounts as
 * extra unknowns, and drop any whose amount comes out as nothing.
 *
 * `activity: false` makes every γ = 1 — for media so concentrated that Davies has
 * nothing to say (the constants are then concentration quotients, and must have
 * been measured as such).
 */
import { activityAt } from '../chem/aqueous.js';
import { pKw, R, KELVIN } from '../chem/constants.js';

const LN10 = Math.LN10;

/** K at temperature T from its 25 °C value and the enthalpy (kJ/mol), by van 't Hoff. */
export const kAt = (logK25, dH = 0, tC = 25) => 10 ** (logK25 - (dH * 1000) / (R * LN10) * (1 / (tC + KELVIN) - 1 / (25 + KELVIN)));

function solveLinear(A, b) {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r += 1) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) { let s = M[r][n]; for (let k = r + 1; k < n; k += 1) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

/**
 * @param components [{ id, z, fixed? }]   `fixed` = a free concentration (mol/L) to hold (a buffered pH)
 * @param species    [{ id, z, nu: {comp: n}, logK, dH? }]
 * @param solids     [{ id, nu: {comp: n}, logKsp, dH? }]   dissolution constants (activity product at saturation)
 * @param totals     { comp: mol/L }        for every component that is neither fixed nor `charge`
 * @param spectators [{ z, c }]             ions that take part in nothing but the ionic strength and the charge
 * @param charge     component solved by electroneutrality
 * @param freeze     { speciesId: mol/L }
 * @param guess      { comp: mol/L }        free concentrations to start from (the previous solution, for a small step)
 * @param guessSolids { solidId: mol/L }    the solids that were present, and how much
 * @param activity   false: all γ = 1
 */
export function speciate({
  components: allComponents, species: allSpecies, solids: allSolids = [], totals, spectators = [], charge = null, T = 25,
  freeze = {}, maxIter = 300, guess = null, guessSolids = null, activity = true,
}) {
  /* A component with none of it in the tube takes no part: drop it, and every
     species that needs it, rather than ask the solver for the logarithm of zero. */
  const components = allComponents.filter((c) => c.fixed !== undefined || c.id === charge || (totals[c.id] ?? 0) > 1e-15);
  const have = new Set(components.map((c) => c.id));
  const species = allSpecies.filter((s) => Object.keys(s.nu).every((j) => have.has(j)));
  const solidDefs = allSolids.filter((s) => Object.keys(s.nu).every((j) => have.has(j) && totals[j] !== undefined));
  const unknown = components.filter((c) => c.fixed === undefined);
  const nC = components.length; const nS = species.length; const nU = unknown.length;

  /* Index tables, built once: the residual runs thousands of times. */
  const cIdx = Object.fromEntries(components.map((c, i) => [c.id, i]));
  const uOf = components.map((c) => unknown.indexOf(c));
  const zC = components.map((c) => c.z);
  const zS = species.map((s) => s.z);
  const nu = species.map((s) => Object.entries(s.nu).map(([j, n]) => [cIdx[j], n]));
  const Ks = species.map((s) => kAt(s.logK, s.dH, T));
  const held = species.map((s) => freeze[s.id]);
  const solNu = solidDefs.map((s) => Object.entries(s.nu).map(([j, n]) => [cIdx[j], n]));
  const lnKsp = solidDefs.map((s) => Math.log(kAt(s.logKsp, s.dH, T)));
  /* The most of a solid that could possibly form, from the component it runs out of first. */
  const limit = solidDefs.map((s) => Math.min(...Object.entries(s.nu).map(([j, n]) => (totals[j] ?? Infinity) / n)));
  const chargeIdx = unknown.findIndex((c) => c.id === charge);
  const spectatorI = spectators.reduce((a, sp) => a + 0.5 * sp.z * sp.z * sp.c, 0);
  const spectatorPos = spectators.reduce((a, sp) => a + (sp.z > 0 ? sp.z * sp.c : 0), 0);
  const spectatorNeg = spectators.reduce((a, sp) => a + (sp.z < 0 ? -sp.z * sp.c : 0), 0);
  const tot = unknown.map((c) => Math.max(totals[c.id] ?? 0, 1e-300));

  const gammaAt = activity ? activityAt(T) : () => 1;
  const ZOFF = 6;                    // charges −6…+6 index a flat table: no string keys in the hot loop
  const memo = new Float64Array(2 * ZOFF + 1);
  let lastI = 0.01;                  // each evaluation starts from the last one's ionic strength: a Newton step barely moves it
  const evalAt = (x) => {
    const c = new Array(nC);
    for (let i = 0; i < nC; i += 1) c[i] = uOf[i] < 0 ? components[i].fixed : Math.exp(x[uOf[i]]);
    const cs = new Array(nS);
    let I = lastI;
    const gam = (z) => { const m = memo[z + ZOFF]; return m === 0 ? (memo[z + ZOFF] = gammaAt(z, I)) : m; };
    /* What the ionic strength would be if the activities were those of I. */
    const sumAt = () => {
      memo.fill(0);
      let sum = spectatorI;
      for (let i = 0; i < nC; i += 1) sum += 0.5 * zC[i] * zC[i] * c[i];
      for (let s = 0; s < nS; s += 1) {
        if (held[s] !== undefined) cs[s] = held[s];
        else {
          let a = Ks[s] / gam(zS[s]);
          for (const [j, n] of nu[s]) a *= (gam(zC[j]) * c[j]) ** n;
          cs[s] = a;
        }
        sum += 0.5 * zS[s] * zS[s] * cs[s];
      }
      return sum;
    };
    /* Activities and ionic strength, iterated to self-consistency — to
       convergence, not to a fixed count: a quotient that is a percent off
       because I was a percent off is a quotient nobody can check. Secant steps
       on r(I) = sum(I) − I; plain damped iteration if they ever stall. */
    let I0 = I; let r0 = sumAt() - I0; let done = !activity || Math.abs(r0) < 1e-12 * Math.max(1, I0);
    if (!done) {
      I = Math.max(0, I0 + 0.6 * r0);
      for (let k = 0; k < 60; k += 1) {
        const r1 = sumAt() - I;
        if (Math.abs(r1) < 1e-12 * Math.max(1, I)) { done = true; break; }
        const slope = (r1 - r0) / (I - I0);
        let next = Number.isFinite(slope) && Math.abs(slope) > 1e-9 ? I - r1 / slope : I + 0.6 * r1;
        if (!(next >= 0)) next = Math.max(0, I + 0.6 * r1);
        I0 = I; r0 = r1; I = next;
      }
      if (!done) { for (let k = 0; k < 80; k += 1) { const nx = 0.4 * I + 0.6 * sumAt(); const ok = Math.abs(nx - I) < 1e-12 * Math.max(1, I); I = nx; if (ok) break; } }
      sumAt();   // species at the converged I
    } else if (!activity) { I = sumAt(); }
    lastI = I;
    return { c, cs, I, gam: (z) => gammaAt(z, I) };
  };
  /* ln of the ion activity product of solid k. */
  const lnIAP = (k, c, gam) => solNu[k].reduce((a, [j, n]) => a + n * (Math.log(gam(zC[j])) + Math.log(Math.max(c[j], 1e-300))), 0);

  /** The residual for an active set of solids: unknowns are ln c for each free component, then ln p for each solid present. */
  const residual = (x, active) => {
    const { c, cs, gam } = evalAt(x);
    const p = active.map((k, a) => Math.exp(x[nU + a]));
    const F = new Array(nU + active.length);
    for (let u = 0; u < nU; u += 1) {
      if (u === chargeIdx) {
        let pos = spectatorPos; let neg = spectatorNeg;
        for (let i = 0; i < nC; i += 1) { if (zC[i] > 0) pos += zC[i] * c[i]; else neg -= zC[i] * c[i]; }
        for (let s = 0; s < nS; s += 1) { if (zS[s] > 0) pos += zS[s] * cs[s]; else neg -= zS[s] * cs[s]; }
        F[u] = (pos - neg) / Math.max(pos + neg, 1e-30);
      } else {
        const ci = cIdx[unknown[u].id];
        let sum = c[ci];
        for (let s = 0; s < nS; s += 1) for (const [j, n] of nu[s]) if (j === ci) sum += n * cs[s];
        active.forEach((k, a) => { for (const [j, n] of solNu[k]) if (j === ci) sum += n * p[a]; });
        F[u] = Math.log(Math.max(sum, 1e-300) / tot[u]);
      }
    }
    active.forEach((k, a) => { F[nU + a] = lnIAP(k, c, gam) - lnKsp[k]; });
    return F;
  };
  const norm = (F) => F.reduce((a, v) => a + v * v, 0);

  const fromTotals = (hi, lo) => (c) => (c.id === charge ? Math.log(hi) : Math.log(Math.max(totals[c.id], 1e-12) * lo));
  const starts = [
    fromTotals(1e-7, 1), fromTotals(1e-3, 1e-2), fromTotals(1e-10, 1e-6), fromTotals(1e-2, 1e-9),
  ];
  if (guess) { const base = starts[0]; starts.unshift((c) => (guess[c.id] > 0 ? Math.log(guess[c.id]) : base(c))); }

  /** Newton on the whole system for a given set of solids present. */
  const solve = (active) => {
    let best = null;
    for (const start of starts) for (const share of active.length ? [-1, 0.5, 0.98] : [0]) {
      /* share −1: start each solid from the amount it had last time, if we were told. */
      let x = unknown.map(start).concat(active.map((k) => Math.log(Math.max(share < 0 ? (guessSolids?.[solidDefs[k].id] ?? limit[k] * 0.5) : limit[k] * share, 1e-30))));
      let F = residual(x, active); let f0 = norm(F);
      for (let it = 0; it < maxIter; it += 1) {
        if (f0 < 1e-22) break;
        const N = x.length;
        const J = x.map(() => new Array(N));
        for (let j = 0; j < N; j += 1) {
          const h = 1e-6; const xp = x.slice(); xp[j] += h;
          const Fp = residual(xp, active);
          for (let i = 0; i < N; i += 1) J[i][j] = (Fp[i] - F[i]) / h;
        }
        const dx = solveLinear(J, F.map((v) => -v));
        if (!dx) break;
        const big = Math.max(...dx.map(Math.abs));
        const scale = big > 3 ? 3 / big : 1;
        let lam = 1; let moved = false;
        for (let ls = 0; ls < 30; ls += 1) {
          const xn = x.map((v, i) => v + lam * scale * dx[i]);
          const Fn = residual(xn, active); const fn = norm(Fn);
          if (Number.isFinite(fn) && fn < f0) { x = xn; F = Fn; f0 = fn; moved = true; break; }
          lam *= 0.5;
        }
        if (!moved) break;
      }
      if (!best || f0 < best.f) best = { x, f: f0 };
      if (best.f < 1e-22) return best;
    }
    return best;
  };

  /* Which solids are present: try, test, add, drop. */
  let active = guessSolids ? solidDefs.map((d, k) => k).filter((k) => guessSolids[solidDefs[k].id] > 0) : []; let best = null;
  for (let round = 0; round < 6; round += 1) {
    best = solve(active);
    if (!solidDefs.length) break;
    lastI = 0.01;
    const { c, gam } = evalAt(best.x);
    const over = solidDefs.map((_, k) => k).filter((k) => !active.includes(k) && lnIAP(k, c, gam) > lnKsp[k] + 1e-9);
    const gone = active.filter((k, a) => Math.exp(best.x[nU + a]) < 1e-9 * limit[k]);
    if (!over.length && !gone.length) break;
    active = active.filter((k) => !gone.includes(k)).concat(over);
  }
  lastI = 0.01;
  const { c, cs, I, gam } = evalAt(best.x);
  const free = Object.fromEntries(components.map((q, i) => [q.id, c[i]]));
  const speciesOut = Object.fromEntries(species.map((q, i) => [q.id, cs[i]]));
  const solidsOut = Object.fromEntries(solidDefs.map((q, k) => { const a = active.indexOf(k); return [q.id, a < 0 ? 0 : Math.exp(best.x[nU + a])]; }));
  const saturation = Object.fromEntries(solidDefs.map((q, k) => [q.id, Math.exp(lnIAP(k, c, gam) - lnKsp[k])]));
  const aH = free.H !== undefined ? gam(components[cIdx.H].z) * free.H : null;
  return {
    free, species: speciesOut, solids: solidsOut, saturation, ionicStrength: I, gamma: gam, pH: aH ? -Math.log10(aH) : null,
    residual: Math.sqrt(best.f), converged: best.f < 1e-16,
  };
}

/** The reaction quotient of species `product` from its parts, in activities, for a solved state. */
export function quotient(res, species, productId) {
  const s = species.find((q) => q.id === productId);
  const comps = Object.entries(s.nu);
  let q = res.gamma(s.z) * res.species[productId];
  for (const [j, n] of comps) {
    const z = j === 'H' ? 1 : res.zOf?.[j];
    q /= (res.gamma(z ?? 0) * res.free[j]) ** n;
  }
  return q;
}
