/**
 * physics.js — the whole simulation lives here, and nothing in it touches
 * React, three.js or the store. That is deliberate: every number the beaker
 * draws can then be checked against a data book from a plain Node script, which
 * is the only way to know the picture is telling the truth.
 *
 * The renderer draws whatever this module says; it never decides anything. And
 * there are no scripted outcomes here: every number is computed, each frame,
 * from the sol's charge, the electrolyte's ions, the concentration the student
 * added, and the elapsed time.
 *
 * The chain of reasoning, once per tick:
 *
 *   1. HARDY–SCHULZE   which ion is actually doing the coagulating?
 *   2. SCHULZE–HARDY   what concentration of it does this sol need? (CCC ∝ z⁻⁶)
 *   3. FUCHS           how much is the double layer still slowing collisions? (W)
 *   4. SMOLUCHOWSKI    how far has aggregation got by now? (t/t½)
 *   5. DLCA            how big are the clusters, and how many are left?
 *   6. RAYLEIGH / MIE  how brightly does the Tyndall beam scatter off them?
 *   7. STOKES          how fast are they falling, and how much has settled?
 *
 * Every one of those steps is a named exported function so it can be unit
 * tested against textbook numbers without a browser.
 */
import {
  K_B, G, WATER, SOLS, ELECTROLYTES, MEASURED_CCC_mM,
  LYOPHILIC_CCC_FACTOR, SATURATION_LIMIT_mM, STABILITY_EXPONENT,
  FRACTAL_DIM_FAST, FRACTAL_DIM_SLOW, FLOC_STRENGTH_C, CHARGE_REVERSAL_MULTIPLE, 
  BEAKER_VOLUME_M3,
} from './chemistry-data.js';

/* ── 1 · HARDY–SCHULZE: which ion coagulates this sol? ──────────────────────
 *
 * "The coagulating power of an ion increases with its charge, and it is the ion
 * carrying the charge OPPOSITE to the sol particle that coagulates it."
 *
 * So the first question is never "what is the valency of the electrolyte" — it
 * is "which of this electrolyte's ions has the opposite sign to my sol". For
 * K₃[Fe(CN)₆] the answer is K⁺ against a negative sol and [Fe(CN)₆]³⁻ against a
 * positive one, and those two answers are three orders of magnitude apart in
 * effect. Where an electrolyte offers several counter-ions the most highly
 * charged one dominates, since the power goes as z⁶.
 */
export function activeCounterIon(sol, electrolyte) {
  const wanted = -Math.sign(sol.charge);           // opposite sign to the particle
  const counterIons = electrolyte.ions.filter((ion) => Math.sign(ion.z) === wanted);
  if (!counterIons.length) return null;            // cannot happen for a salt, but be honest
  return counterIons.reduce((best, ion) => (Math.abs(ion.z) > Math.abs(best.z) ? ion : best));
}

/** The ion of the SAME sign as the sol — it is a spectator, and saying so is
 *  half the teaching. */
export function spectatorIon(sol, electrolyte) {
  const same = Math.sign(sol.charge);
  const ions = electrolyte.ions.filter((ion) => Math.sign(ion.z) === same);
  return ions.length ? ions.reduce((b, i) => (Math.abs(i.z) > Math.abs(b.z) ? i : b)) : null;
}

/* ── 2 · SCHULZE–HARDY: the critical coagulation concentration ──────────────
 *
 * DLVO theory gives CCC ∝ z⁻⁶ for a strongly charged surface: the height of the
 * potential barrier between two particles falls as the counter-ion charge rises,
 * and the sixth power falls out of the algebra of where the barrier vanishes.
 * The classical As₂S₃ series tests it almost exactly —
 *
 *      Na⁺ 51 mM : Ba²⁺ 0.69 mM : Al³⁺ 0.093 mM   =   1 : 1/74 : 1/550
 *      z⁻⁶ predicts                                   1 : 1/64 : 1/729
 *
 * Measured values are used where the literature has them, because a simulation
 * that can be checked against a data book should be. The law fills the gaps, so
 * a combination nobody has tabulated still behaves correctly.
 */
export function criticalCoagulationConcentration_mM(sol, electrolyte) {
  const measured = MEASURED_CCC_mM[sol.id]?.[electrolyte.id];
  if (measured !== undefined) {
    return sol.lyophilic ? measured * LYOPHILIC_CCC_FACTOR : measured;
  }
  const ion = activeCounterIon(sol, electrolyte);
  if (!ion) return Infinity;                        // no counter-ion: no coagulation, ever
  /* Anchor the law on a monovalent counter-ion of this sol, so the absolute
     scale comes from the sol and only the z-dependence from the ion. */
  const row = MEASURED_CCC_mM[sol.id] || {};
  const anchor = row.NaCl ?? 50;                    // mM for z = 1
  const z = Math.abs(ion.z);
  const ccc = anchor / z ** 6;
  return sol.lyophilic ? ccc * LYOPHILIC_CCC_FACTOR : ccc;
}

/**
 * Can this electrolyte reach its own critical concentration before it runs out
 * of solubility? For every lyophobic sol here the answer is yes and the question
 * never arises; for a lyophilic sol it is usually no, and that "no" is the
 * examinable difference between the two classes of colloid.
 */
export function isCoagulable(sol, electrolyte) {
  const ccc = criticalCoagulationConcentration_mM(sol, electrolyte);
  return Number.isFinite(ccc) && ccc <= SATURATION_LIMIT_mM;
}

/** Coagulating power, quoted the way a data table quotes it: relative to the
 *  weakest electrolyte in the set for this sol. 1/CCC is the natural measure. */
export function coagulatingPower(sol, electrolyte) {
  const ccc = criticalCoagulationConcentration_mM(sol, electrolyte);
  const all = Object.values(ELECTROLYTES)
    .map((e) => criticalCoagulationConcentration_mM(sol, e))
    .filter(Number.isFinite);
  const weakest = Math.max(...all, ccc);
  return weakest / ccc;                             // ≥ 1, dimensionless
}

/* ── 3 · FUCHS: the stability ratio W ──────────────────────────────────────
 *
 * W is the factor by which the energy barrier slows coagulation below the
 * diffusion-limited rate: W = 1 means every Brownian encounter sticks, W = 10⁵
 * means one in a hundred thousand does and the sol looks indefinitely stable.
 * Reerink and Overbeek found log W falling linearly with log C, reaching zero at
 * the CCC — which is exactly W = (CCC/C)^β with β ≈ 3.
 */
export function stabilityRatio(concentration_mM, ccc_mM) {
  if (!Number.isFinite(ccc_mM)) return Infinity;
  if (concentration_mM <= 0) return Infinity;
  if (concentration_mM >= ccc_mM) return 1;         // rapid (perikinetic) coagulation
  return (ccc_mM / concentration_mM) ** STABILITY_EXPONENT;
}

/* ── 4 · SMOLUCHOWSKI: the two ways particles find each other ───────────
 *
 * PERIKINETIC — Brownian. k = 8kT/3η, and remarkably it carries no size
 * dependence at all: a small particle diffuses faster but presents a smaller
 * target, and the two cancel exactly. Divided by the Fuchs W when a barrier
 * remains.
 *
 * ORTHOKINETIC — shear. k = (4/3)·G·(2r)³ for a velocity gradient G: two
 * particles on neighbouring streamlines are swept together. It grows as the CUBE
 * of the radius, so it is negligible for a fresh sol and utterly dominant once
 * the clusters are microns across.
 *
 * Both matter, and the fact that they do is the answer to a question a student
 * will otherwise ask. Brownian motion alone cannot build a floc you can see:
 * take the numbers and perikinetic aggregation stalls at a few micrometres,
 * because as the clusters grow there are fewer and fewer of them to collide.
 * Millimetre flakes that settle in a minute need the flask to be SWIRLED, and
 * that is exactly what the practical tells you to do. Shear is therefore a
 * control the student holds, not a constant.
 */
export function perikineticRate(temperatureK, W) {
  const k = (8 * K_B * temperatureK) / (3 * WATER.viscosity);      // m³/s
  return Number.isFinite(W) ? k / W : 0;
}

export function orthokineticRate(radius_m, shearRate_s) {
  return (4 / 3) * shearRate_s * (2 * radius_m) ** 3;              // m³/s
}

/** The collision kernel actually in force, for clusters of this size. */
export function aggregationKernel(radius_m, temperatureK, W, shearRate_s) {
  return perikineticRate(temperatureK, W) + orthokineticRate(radius_m, shearRate_s);
}

/**
 * The half-time for the elementary doubling, quoted for the HUD. For a 0.1% sol
 * above the CCC this is tens of milliseconds — rapid coagulation really is that
 * fast, which is why the liquid clouds the instant the electrolyte goes in. What
 * takes seconds or minutes is growing those doublets into flocs large enough to
 * see and heavy enough to fall.
 */
export function coagulationHalfTime_s(sol, temperatureK, W) {
  const k = perikineticRate(temperatureK, W);
  /*
   * t½ = 2/(kN₀), and the 2 is not decoration: the population obeys
   * dn/dt = −½ k N₀ n², whose solution n = 1/(1 + ½ k N₀ t) reaches a half at
   * t = 2/(kN₀). Substituting k = 8kT/3η gives t½ = 3η/(4 k_B T N₀), which is
   * Smoluchowski's coagulation time as the textbooks print it. Defining the
   * half-time any other way makes the number the HUD quotes disagree with the
   * curve the beaker is drawing, which is the kind of quiet contradiction this
   * whole engine exists to avoid.
   */
  return k > 0 ? 2 / (k * sol.numberDensity) : Infinity;
}

/* ── 5 · DLCA: integrating the population, not evaluating a formula ───────
 *
 * Smoluchowski's closed form N(t) = N₀/(1 + t/t½) assumes a kernel that never
 * changes. Ours changes constantly — it depends on the cluster radius, which
 * depends on how far aggregation has already got, and on a shear rate and a
 * concentration the student can move mid-run. So the population is INTEGRATED:
 *
 *        dN/dt = −½ k(R) N²          (the ½ because a collision consumes two)
 *
 * and the cluster radius follows from mass conservation on a fractal aggregate,
 * R = R₀ · i^(1/d_f) with i = N₀/N particles per cluster. Integrating also means
 * the sol responds to anything the student does at any moment, which a formula
 * evaluated at t cannot do.
 *
 * d_f: freshly formed diffusion-limited clusters are wispy, near 1.8, but they
 * restructure as they grow and as shear works on them; light-scattering and
 * settling measurements on real coagulated sols give 2.0–2.5. The denser value
 * is used because it is what governs both the size and the settling velocity a
 * student actually observes.
 */
export function fractalDimension(fast, shearRate_s) {
  const base = fast ? FRACTAL_DIM_FAST : FRACTAL_DIM_SLOW;
  /* Shear compacts a floc: it snaps the open arms off and rolls what is left
     tighter, which carries d_f towards 2.6 in a vigorously stirred beaker. */
  const compaction = Math.min(0.3, shearRate_s / 300);
  return base + compaction;
}

/**
 * The largest floc this much stirring will allow to survive, R_max = C/√G.
 * Still water imposes no limit at all — nothing is tearing the flocs apart — but
 * in still water Brownian collisions become so rare as the clusters grow that
 * growth stalls in the micron range anyway.
 */
export function maxStableFlocRadius(shearRate_s) {
  return shearRate_s <= 0 ? Infinity : FLOC_STRENGTH_C / Math.sqrt(shearRate_s);
}

/**
 * One integration step. `clusterCount` is N/N₀ and is the only piece of memory
 * the simulation keeps — everything else is a function of it.
 *
 * Sub-stepped because the orthokinetic kernel grows as R³ and can turn stiff the
 * moment shear takes over; a single Euler step there would overshoot straight
 * past total aggregation.
 */
export function stepAggregation({
  clusterCount, sol, temperatureK, W, shearRate_s, dt, d_f,
}) {
  const N0 = sol.numberDensity;
  /* The smallest n that means anything: one floc left in the beaker. Below that
     there is nothing to aggregate with, and a floor pulled out of the air would
     silently become the answer for the final floc size — which is exactly what
     it did the first time this was written. */
  const nFloor = 1 / (N0 * BEAKER_VOLUME_M3);
  let n = Math.max(clusterCount, nFloor);

  /* The n-ODE is now integrated exactly, so the only thing the sub-steps are
     for is k, which changes as the floc grows — and the shear-breakup ceiling,
     which must be re-read before the floc can sail past it. Hold the sub-step
     near 30 ms of SIMULATED time whatever the clock scale, so a ×100 run gets
     more sub-steps rather than a bigger answer. Capped, because a frame must
     still finish. */
  const SUB = Math.min(256, Math.max(8, Math.ceil(dt * 32)));
  const h = dt / SUB;
  for (let i = 0; i < SUB; i += 1) {
    const perCluster = 1 / n;
    const radius = sol.particleRadius * perCluster ** (1 / d_f);
    let k = aggregationKernel(radius, temperatureK, W, shearRate_s);
    /* Growth shuts down as the floc approaches the size this shear can break.
       Cubed so the approach is gentle until it is close, then decisive — which
       is how a floc population really reaches its steady size distribution. */
    const rMax = maxStableFlocRadius(shearRate_s);
    if (Number.isFinite(rMax)) k *= Math.max(0, 1 - (radius / rMax) ** 3);

    /* dn/dt = −½ k N₀ n².  Integrated ANALYTICALLY over the sub-step rather than
       stepped forward by hand:
                n(t+h) = n / (1 + ½ k N₀ n h)
       which is the closed form of Smoluchowski's second-order decay for constant
       k. Two things follow, and both matter more than elegance:
         · it is unconditionally stable and unconditionally positive, so a long
           frame or a ×100 clock cannot overshoot into n ≤ 0;
         · the answer therefore stops depending on the frame rate. An explicit
           Euler step here made a dropped frame flocculate the beaker in one go,
           pinned n to its floor, and handed back a 7 mm "floc" that was nothing
           but the floor — a simulation reporting its own integrator.
       k still varies with radius, which is what the sub-steps are for. */
    n = Math.max(nFloor, n / (1 + 0.5 * k * N0 * n * h));
  }
  return n;
}

/** Cluster geometry from the survivor fraction — the bridge from the population
 *  to everything the eye can see. */
export function clusterGeometry(clusterCount, sol, d_f) {
  const particlesPerCluster = 1 / Math.max(clusterCount, 1e-12);
  const radius = sol.particleRadius * particlesPerCluster ** (1 / d_f);
  return { particlesPerCluster, radius, survivorDensity: sol.numberDensity * clusterCount };
}

/* ── 6 · RAYLEIGH → MIE: the Tyndall beam ──────────────────────────────────
 *
 * The scattering coefficient per unit volume is β = N · σ, and σ depends on
 * where the particle sits relative to the wavelength:
 *
 *   Rayleigh (d ≪ λ):  σ ∝ d⁶/λ⁴     — strongly size- and colour-dependent
 *   Mie      (d ≳ λ):  σ ∝ d²        — geometric, and colourless
 *
 * Coagulation conserves mass, so N·d³ is constant. In the Rayleigh regime that
 * makes β ∝ N·d⁶ ∝ d³: the beam gets DRAMATICALLY brighter as the particles
 * clump. Past the crossover β ∝ N·d² ∝ 1/d and it fades again. A student
 * watching a real coagulation sees exactly that — the cone flares up, whitens,
 * and then dies away as the flocs grow heavy and drop out of the beam.
 *
 * The 1/λ⁴ is why a fine sol scatters a BLUE cone and transmits orange, for the
 * same reason the sky is blue, so the coefficient is returned per channel.
 */
const LAMBDA_RGB = [650e-9, 550e-9, 450e-9];        // m

export function scatteringCoefficientRGB(radius_m, numberDensity) {
  const d = 2 * radius_m;
  return LAMBDA_RGB.map((lambda) => {
    const x = (Math.PI * d) / lambda;               // size parameter
    /* Rayleigh cross-section, with the standard refractive-index factor for
       a dielectric sphere in water. */
    const m = 1.55 / WATER.refractiveIndex;         // relative refractive index
    const f = ((m * m - 1) / (m * m + 2)) ** 2;
    const sigmaR = ((2 * Math.PI ** 5) / 3) * (d ** 6 / lambda ** 4) * f;
    /* Mie asymptote: twice the geometric cross-section, the large-particle
       limit of the extinction paradox. */
    const sigmaM = 2 * Math.PI * radius_m ** 2;
    /*
     * Joined harmonically, not averaged.
     *
     * The two branches differ by two orders of magnitude at the crossover, so a
     * weighted average between them is dominated by the geometric term long
     * before it is valid — and that washes the λ⁻⁴ out of the small-particle
     * limit, which is precisely the colour the Tyndall effect is famous for.
     * 1/(1/σ_R + 1/σ_M) instead returns whichever is SMALLER, smoothly: pure
     * Rayleigh while the particle is small, saturating at the geometric cross-
     * section once it is large, with no tuning constants anywhere.
     */
    void x;   // the size parameter is what this join expresses, implicitly
    return numberDensity / (1 / sigmaR + 1 / sigmaM);
  });
}

/* ── 7 · STOKES: settling ──────────────────────────────────────────────────
 *
 * v = 2r²(ρ_p − ρ_f)g / 9η. The r² is the whole story of why a colloid is
 * stable: a 50 nm particle settles at about 2 nm/s — a millimetre a week, far
 * slower than Brownian motion stirs it back up — while a 20 µm floc falls at
 * 300 µm/s and clears the beaker in minutes. Nothing settles until the
 * aggregates are large, which is why the sediment layer must be driven by the
 * CURRENT cluster radius and not by elapsed time.
 *
 * Fractal flocs are mostly water, so their effective excess density falls as
 * they grow: Δρ_eff = Δρ_solid · (R/R₀)^(d_f − 3).
 */
/**
 * Mie asymmetry parameter g, for the Henyey–Greenstein phase function the shader
 * uses. Interpolates between the two limits a student can actually see:
 *   x ≪ 1  Rayleigh, g → 0      — the cone scatters equally forward and back,
 *                                 and it is blue, so it reads from every side.
 *   x ≫ 1  geometric, g → 0.9   — the light is thrown forward, so a flocculated
 *                                 beaker shows a narrow leaning shaft, not a glow.
 * x = 2πr/λ is the size parameter, so this is tied to the particle size the
 * aggregation model has reached and to nothing else.
 */
export function asymmetryParameter(radius_m) {
  const x = (2 * Math.PI * radius_m) / LAMBDA_RGB[1];
  return (0.9 * x * x) / (9 + x * x);
}

/**
 * Body absorption K of the sol, per metre, per channel.
 *
 * Taken from the sol's absorption spectrum rather than from its apparent colour,
 * because the two are not the same thing and the difference is visible. A
 * colloid's appearance is the ratio K/S of absorption to scattering, and S
 * already carries a steep λ⁻⁴ of its own; deriving K from the colour as well
 * makes the two cancel and the sol renders grey. The absorbance triple is a
 * property of the chromophore — the Fe(III) charge-transfer band, the As₂S₃ band
 * gap — and it does not move when the particles clump, which is exactly why a
 * coagulating sol loses its colour and turns milky white.
 */
export const BODY_ABSORB_PER_M = 11;
export function absorptionCoefficientRGB(sol) {
  return sol.absorbance.map((a) => BODY_ABSORB_PER_M * a);
}

export function stokesVelocity_mps(radius_m, primaryRadius_m, d_f, solidDensity = 2500) {
  const growth = Math.max(1, radius_m / primaryRadius_m);
  const excess = (solidDensity - WATER.density) * growth ** (d_f - 3);
  return (2 * radius_m ** 2 * excess * G) / (9 * WATER.viscosity);
}

/** Stokes–Einstein diffusion coefficient — the Brownian step scale. It falls as
 *  1/r, so the visible jitter slows markedly as clumps form. That slowing is
 *  itself an observation worth making. */
export function diffusionCoefficient(radius_m, temperatureK) {
  return (K_B * temperatureK) / (6 * Math.PI * WATER.viscosity * radius_m);
}

/* ── the observable state, assembled ──────────────────────────────────────── */

/**
 * Everything the renderer and the HUD need, derived in one place so the beaker,
 * the light beam and the observation table can never disagree about what is
 * happening in the flask.
 */
/**
 * Everything the renderer and the HUD need, derived in one place so that the
 * beaker, the light beam and the observation table can never disagree about what
 * is happening in the flask.
 *
 * `clusterCount` (N/N₀) and `settled` are carried IN, because they are integrated
 * quantities — they are the simulation's memory. Everything else is a pure
 * function of them and of what the student has set.
 */
export function derive({
  solId, electrolyteId, concentration_mM, elapsedTime, temperatureK,
  shearRate_s = 0, clusterCount = 1, settled = 0,
}) {
  const sol = SOLS[solId];
  const electrolyte = ELECTROLYTES[electrolyteId];
  const ion = activeCounterIon(sol, electrolyte);
  const spectator = spectatorIon(sol, electrolyte);

  /* The counter-ion's own concentration, not the salt's: BaCl₂ at 1 mM delivers
     2 mM of Cl⁻, and for a positive sol it is the chloride that counts. */
  const ionConcentration_mM = ion ? concentration_mM * ion.n : 0;
  const ccc_mM = criticalCoagulationConcentration_mM(sol, electrolyte);
  const W = stabilityRatio(ionConcentration_mM, ccc_mM);
  const fast = W <= 1.5;                            // essentially barrierless
  const halfTime = coagulationHalfTime_s(sol, temperatureK, W);
  const d_f = fractalDimension(fast, shearRate_s);
  const geom = clusterGeometry(clusterCount, sol, d_f);

  /* CHARGE REVERSAL. Over-adsorption of a highly charged counter-ion flips the
     zeta potential and the sol becomes stable again — a real, and for a student
     a startling, way to fail by adding more. */
  const reversalThreshold = ccc_mM * CHARGE_REVERSAL_MULTIPLE;
  const restabilised = Boolean(ion) && Math.abs(ion.z) >= 3
    && ionConcentration_mM > reversalThreshold;

  /* Coagulated fraction: the share of the original particles now bound into
     something bigger than themselves. */
  const fraction = restabilised ? 0 : 1 - clusterCount;

  const v = stokesVelocity_mps(geom.radius, sol.particleRadius, d_f);
  const sedimentFraction = restabilised ? 0 : Math.min(1, settled);

  /* What still scatters is what has not yet fallen out of the beam. */
  const suspended = Math.max(0, 1 - sedimentFraction);
  const beta = scatteringCoefficientRGB(geom.radius, geom.survivorDensity * suspended);
  /* Normalised against the pristine sol so the HUD can say "× brighter". */
  const beta0 = scatteringCoefficientRGB(sol.particleRadius, sol.numberDensity);
  const tyndallGain = beta[1] / (beta0[1] || 1);

  /* Turbidity is what the eye reads as cloudiness: the extinction coefficient
     over the light path, as Beer–Lambert would have it. Suspended flocs are
     enormously more turbid than the sol they came from even though there is not
     one gram more material in the beaker. */
  const turbidity = beta[1] * 0.07;                 // τ = β L over a 7 cm path

  return {
    sol, electrolyte, ion, spectator,
    ionConcentration_mM, ccc_mM, W, fast, halfTime, shearRate_s,
    coagulationPercentage: fraction * 100,
    clusterRadius: geom.radius,
    survivorDensity: geom.survivorDensity,
    particlesPerCluster: geom.particlesPerCluster,
    fractalDimension: d_f,
    settlingVelocity: v, sedimentFraction,
    scatteringRGB: beta, tyndallGain, turbidity,
    asymmetry: asymmetryParameter(geom.radius),
    restabilised, reversalThreshold,
    coagulable: isCoagulable(sol, electrolyte),
    status: classify({
      ion, ionConcentration_mM, ccc_mM, fraction, restabilised, sedimentFraction, sol,
      shearRate_s, clusterRadius: geom.radius,
    }),
  };
}

/**
 * Advance the integrated state by dt. This is the only function that writes
 * memory, and the store calls nothing else per frame.
 */
export function integrate(state, dt) {
  const sol = SOLS[state.solId];
  const electrolyte = ELECTROLYTES[state.electrolyteId];
  const ion = activeCounterIon(sol, electrolyte);
  const ionConcentration_mM = ion ? state.concentration_mM * ion.n : 0;
  const ccc_mM = criticalCoagulationConcentration_mM(sol, electrolyte);
  const W = stabilityRatio(ionConcentration_mM, ccc_mM);
  const fast = W <= 1.5;
  const d_f = fractalDimension(fast, state.shearRate_s);

  const reversalThreshold = ccc_mM * CHARGE_REVERSAL_MULTIPLE;
  const restabilised = Boolean(ion) && Math.abs(ion.z) >= 3
    && ionConcentration_mM > reversalThreshold;

  /* A re-stabilised sol redisperses: the clusters come apart again, which is
     what "reversible" means and is why the beaker must be able to run backwards
     here. Peptisation, in a word. */
  if (restabilised) {
    const relax = Math.min(1, dt / 4);
    return {
      clusterCount: state.clusterCount + (1 - state.clusterCount) * relax,
      settled: state.settled * (1 - relax),
    };
  }

  const clusterCount = stepAggregation({
    clusterCount: state.clusterCount, sol, temperatureK: state.temperatureK,
    W, shearRate_s: state.shearRate_s, dt, d_f,
  });

  /* Settling, integrated over the column. Only aggregated material falls, and it
     falls at the speed its CURRENT size earns — which is why nothing settles
     while the sol is still colloidal however long you wait. */
  const { radius } = clusterGeometry(clusterCount, sol, d_f);
  const v = stokesVelocity_mps(radius, sol.particleRadius, d_f);
  const column_m = 0.07;
  const aggregated = 1 - clusterCount;
  const settled = Math.min(aggregated, state.settled + (v / column_m) * dt * aggregated);

  return { clusterCount, settled };
}

/**
 * The verdict, in the words a lab report would use. "Freedom to fail" means each
 * of these is a legitimate place to end up, and each one says what to do about
 * it rather than just that something is wrong.
 */
function classify({ ion, ionConcentration_mM, ccc_mM, fraction, restabilised, sedimentFraction, sol, shearRate_s, clusterRadius }) {
  if (!ion) {
    return {
      key: 'no-counter-ion',
      title: 'No coagulation possible',
      detail: `This electrolyte offers no ion of opposite charge to the ${sol.formula} particles, so there is nothing to neutralise them.`,
    };
  }
  if (restabilised) {
    return {
      key: 'restabilised',
      title: 'Sol re-stabilised — charge reversed',
      detail: `Far past the coagulation concentration the ${ion.symbol} ions have over-adsorbed, reversed the sign of the particle charge and dispersed the sol again. Less electrolyte, not more.`,
    };
  }
  if (ccc_mM > SATURATION_LIMIT_mM) {
    return {
      key: 'not-coagulable',
      title: 'Beyond the solubility of the electrolyte',
      detail: `Coagulating this sol would need about ${(ccc_mM / 1000).toPrecision(2)} mol/L of ${ion.symbol} — more than will dissolve in water. No amount of this salt will do it.`,
    };
  }
  /* SALTING OUT. A lyophilic sol is not coagulated the way a lyophobic one is.
     Its particles carry a solvation shell, and an electrolyte has to compete for
     that water before the particles can approach at all — which takes molar,
     not millimolar, concentrations. What then happens is salting out, and the
     order of effectiveness follows the lyotropic (Hofmeister) series rather
     than the Hardy–Schulze rule. Worth saying out loud, because a student who
     has just seen 0.1 mM of AlCl₃ floor an As₂S₃ sol will otherwise assume the
     starch sol is simply broken. */
  if (sol.lyophilic && ionConcentration_mM >= ccc_mM) {
    return {
      key: 'salting-out',
      title: 'Salting out — the solvation shell has been stripped',
      detail: `It took ${(ionConcentration_mM / 1000).toPrecision(2)} mol/L of ${ion.symbol} to dehydrate these particles, against the millimolar dose a lyophobic sol needs. This is salting out, and it is reversible: dilute the electrolyte and the sol re-forms.`,
    };
  }
  if (sol.lyophilic && ionConcentration_mM > ccc_mM * 0.05) {
    return {
      key: 'lyophilic-resisting',
      title: 'Lyophilic sol resisting',
      detail: `Still ${(ccc_mM / 1000).toPrecision(2)} mol/L short of the concentration that would strip the water from these particles. A lyophilic sol is self-stabilising — this is why gum and gelatin are added to protect other sols, not to precipitate them.`,
    };
  }
  if (ionConcentration_mM < ccc_mM * 0.05) {
    return {
      key: 'stable',
      title: 'Sol stable',
      detail: `${ionConcentration_mM.toPrecision(3)} mM of ${ion.symbol} is far below the ${ccc_mM.toPrecision(3)} mM this sol needs. The double layer still keeps the particles apart.`,
    };
  }
  if (ionConcentration_mM < ccc_mM) {
    return {
      key: 'slow',
      title: 'Slow coagulation',
      detail: `Below the critical concentration only a small fraction of collisions succeed, so the sol clouds over the course of minutes rather than seconds.`,
    };
  }
  if (sedimentFraction > 0.6) {
    return {
      key: 'precipitated',
      title: 'Coagulated and settled',
      detail: `The flocs have grown heavy enough for Stokes settling to clear the column. The supernatant above the precipitate no longer shows the Tyndall cone.`,
    };
  }
  if (fraction > 0.5) {
    /* The one piece of advice a real practical gives that a static simulation
       never does: Brownian motion alone will not build a floc you can see. */
    if (shearRate_s < 2 && clusterRadius < 2e-6) {
      return {
        key: 'needs-stirring',
        title: 'Coagulated, but the flocs are still microscopic',
        detail: `${(fraction * 100).toFixed(0)}% of the particles have aggregated and the sol has clouded, but the clusters are only ${(clusterRadius * 1e9).toPrecision(2)} nm across. Brownian collisions get rarer as the clusters grow — swirl the beaker to bring them together by shear, and they will grow into visible flakes and settle.`,
      };
    }
    return {
      key: 'coagulating',
      title: 'Rapid coagulation',
      detail: `Above the critical concentration essentially every collision sticks. The Tyndall beam flares as the clusters grow through the wavelength of light, then whitens and fades as they pass it.`,
    };
  }
  return {
    key: 'onset',
    title: 'Coagulation beginning',
    detail: 'The barrier is down and the first aggregates are forming.',
  };
}

