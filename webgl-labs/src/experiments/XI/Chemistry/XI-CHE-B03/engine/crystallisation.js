/**
 * The crystallisation engine.
 *
 * No React, no three, no store — so it can be held to the handbook from plain
 * Node (verify-crystallisation.mjs). Three things carry the whole experiment:
 *
 *   SOLUBILITY   measured points, interpolated in (1/T, ln s), which is van 't
 *                Hoff locally. The slope of it is ΔH_soln, so the curve and the
 *                heat of solution are the same measurement seen twice.
 *
 *   MASS BALANCE exact, and it accounts for water of crystallisation. If x g of
 *                anhydrous salt crystallises as a hydrate of ratio r, it takes
 *                x(r−1) g of water OUT of the solvent as it goes, so the
 *                solution it leaves behind is more concentrated than a naive
 *                calculation says:
 *
 *                    A − x = (s/100)·(W − x(r−1))
 *                    x = (A − sW/100) / (1 − (s/100)(r−1))
 *
 *                For anything that crystallises anhydrous, r = 1 and this is
 *                the familiar "what is left dissolved is what the cold
 *                solubility will hold".
 *
 *   NUCLEATION   J = J₀ exp(−B/ln²S) sets how MANY crystals there are; growth
 *                sets how big each gets; and occluded mother liquor goes as
 *                their surface area. That chain is why cooling rate decides
 *                purity and not merely patience.
 *
 * The product is then handed to the melting-point engine of XI-CHE-B01 — the
 * same Schröder–van Laar liquidus, already verified against Freundlich and the
 * cryoscopic constants — so "how pure is it" is answered by measuring it, on a
 * bench that exists, rather than by asserting it here.
 */
import {
  SOLUTES, SOLVENTS, CRUDE_GRADES, IMPURITIES, COOLING,
  NUCLEATION_PREFACTOR, NUCLEATION_B, GROWTH_SECONDS, GROWTH_COEFFICIENT,
  OCCLUSION_AT_1MM, WASH_REMOVES, AMBIENT_C, R, KELVIN,
} from './solutes.js';

const C2K = (t) => t + KELVIN;

/* ── Solubility ───────────────────────────────────────────────────────────── */

/**
 * Solubility at t °C, g of anhydrous solute per 100 g of solvent, interpolated
 * between the measured points in (1/T, ln s). Outside the measured range it
 * holds the end point rather than extrapolating: a solubility curve
 * extrapolated past the data is a guess wearing a lab coat.
 */
export function solubility(table, tC) {
  const T = C2K(tC);
  if (tC <= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (tC >= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i += 1) {
    const [t0, s0] = table[i];
    const [t1, s1] = table[i + 1];
    if (tC >= t0 && tC <= t1) {
      const x0 = 1 / C2K(t0);
      const x1 = 1 / C2K(t1);
      const f = (1 / T - x0) / (x1 - x0);
      return Math.exp(Math.log(s0) + f * (Math.log(s1) - Math.log(s0)));
    }
  }
  return last[1];
}

/**
 * Enthalpy of solution, J/mol, from the local slope of the same curve:
 *
 *      d(ln s)/d(1/T) = −ΔH_soln / R          (van 't Hoff)
 *
 * Positive for all three of these, which is the thermodynamic statement of
 * "dissolves better hot" — and the steeper it is, the better the compound
 * recrystallises. A solute with ΔH_soln near zero has a flat solubility curve
 * and cannot be recrystallised from that solvent at all.
 */
export function enthalpyOfSolution(table, tC, molarMass) {
  const h = 6;
  const a = Math.log(solubility(table, tC - h));
  const b = Math.log(solubility(table, tC + h));
  const ia = 1 / C2K(tC - h);
  const ib = 1 / C2K(tC + h);
  if (ia === ib) return 0;
  void molarMass;
  return -R * ((b - a) / (ib - ia));
}

/** The crystal-to-anhydrous mass ratio. 1 for anything that crystallises
 *  without water. */
export function hydrateRatio(solute) {
  return solute.molarMassCrystal / solute.molarMassAnhydrous;
}

/* ── The mass balance ─────────────────────────────────────────────────────── */

/**
 * What is actually in the flask when the crude sample is weighed out.
 * The anhydrous salt, the water it brought with it, its soluble impurity and
 * its insoluble impurity — four numbers, and every one of them matters later.
 */
export function chargeFromCrude({ soluteId, crude, massG }) {
  const solute = SOLUTES[soluteId];
  const grade = CRUDE_GRADES[crude];
  const r = hydrateRatio(solute);

  const crystalMass = massG * (1 - grade.soluble - grade.insoluble);
  return {
    solute,
    impurity: IMPURITIES[soluteId],
    anhydrous: crystalMass / r,
    waterOfCrystallisation: crystalMass * (1 - 1 / r),
    solubleImpurity: massG * grade.soluble,
    insoluble: massG * grade.insoluble,
    crudeMass: massG,
    /* What a perfect recovery would actually be. Not the crude mass: the crude
       mass includes the impurity, and nobody gets that back. */
    theoreticalMax: crystalMass,
  };
}

/**
 * How much anhydrous solute crystallises out on cooling to tC, allowing for the
 * water of crystallisation it removes from the solvent as it goes. Returns
 * grams of ANHYDROUS; multiply by the hydrate ratio for the mass of crystal.
 *
 * Negative means nothing crystallises — the solution is still unsaturated at
 * that temperature, which is what too much solvent buys you.
 */
export function anhydrousCrystallised({ anhydrous, freeWater, solute, solvent, tC }) {
  const table = solvent.id === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;
  const k = solubility(table, tC) / 100;
  const r = hydrateRatio(solute);
  const denominator = 1 - k * (r - 1);
  if (denominator <= 0) return 0;              // the hydrate would dissolve in its own water
  return (anhydrous - k * freeWater) / denominator;
}

/** The temperature at which a given charge is exactly saturated — where the
 *  first crystal would appear on cooling, if there were anything to nucleate
 *  on. Bisected, because solubility is interpolated rather than inverted. */
export function saturationTemperatureC({ anhydrous, freeWater, solute, solvent }) {
  let lo = -20;
  let hi = solvent.boilingPointC;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (anhydrousCrystallised({ anhydrous, freeWater, solute, solvent, tC: mid }) > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * The minimum volume of boiling solvent that will just dissolve the charge —
 * the quantity the whole procedure turns on, and the one the student is asked
 * to find. Note that the hydrate's own water counts towards it, which is why
 * alum very nearly dissolves in nothing at all.
 */
export function minimumSolventMl({ charge, solvent }) {
  const table = solvent.id === 'ethanol' ? charge.solute.solubilityEthanol : charge.solute.solubilityWater;
  const k = solubility(table, solvent.boilingPointC) / 100;
  if (k <= 0) return Infinity;
  const waterNeeded = charge.anhydrous / k;
  return Math.max(0, (waterNeeded - charge.waterOfCrystallisation) / solvent.density);
}

/* ── The run ──────────────────────────────────────────────────────────────── */

/**
 * Advance the flask by dt seconds. Sub-stepped internally, so the caller may
 * hand it a simulated minute; nucleation is exponential in 1/ln²S and a long
 * explicit step would produce a number of nuclei that depends on the frame
 * rate rather than on the chemistry.
 */
export function integrate(state, dtTotal) {
  const SUB = Math.max(1, Math.ceil(dtTotal / 2));
  let s = state;
  for (let i = 0; i < SUB; i += 1) s = { ...s, ...stepOnce(s, dtTotal / SUB) };
  return {
    tempC: s.tempC, dissolved: s.dissolved, crystalAnhydrous: s.crystalAnhydrous,
    nuclei: s.nuclei, elapsed: s.elapsed, seeded: s.seeded, dissolvedImpurity: s.dissolvedImpurity,
    impurityCrystallised: s.impurityCrystallised,
  };
}

function stepOnce(state, dt) {
  const solute = SOLUTES[state.soluteId];
  const solvent = SOLVENTS[state.solventId];
  const table = solvent.id === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;
  const r = hydrateRatio(solute);

  /*
   * Cooling. Newton's law, integrated exactly over the step rather than stepped
   * forward — unconditionally stable and independent of the frame rate, which
   * matters because nucleation downstream is exponential in the supersaturation
   * and would otherwise inherit the time step.
   *
   * The crystallising temperature is the BATH the flask is standing in, and the
   * cooling regime is how vigorously that bath takes heat away. Each regime is
   * quoted as the rate it gives at the start of a run, sixty degrees above the
   * bath, which is where a student would see it.
   */
  const target = state.crystallisationTempC;
  const tau = 60 / (COOLING[state.cooling].ratePerMin / 60);
  const tempC = target + (state.tempC - target) * Math.exp(-dt / tau);

  /* Free water: what was added, plus what the dissolved hydrate brought, minus
     what the crystals already formed have taken away again. */
  const freeWater = state.solventMass
    + state.waterOfCrystallisation
    - state.crystalAnhydrous * (r - 1);

  const sat = (solubility(table, tempC) / 100) * freeWater;
  const S = sat > 0 ? state.dissolved / sat : 0;

  let nuclei = state.nuclei;
  let seeded = state.seeded;
  let crystalAnhydrous = state.crystalAnhydrous;
  let dissolved = state.dissolved;

  if (S > 1.0005) {
    /*
     * Nucleation is INTEGRATED, not triggered. J = J₀exp(−B/ln²S) is evaluated
     * every step from the moment the solution passes saturation, and crystals
     * appear when the accumulated count reaches one.
     *
     * That one change is what makes cooling rate matter. A solution cooled
     * slowly creeps up through low supersaturations, and J — small as it is
     * there — has hours to accumulate, so nucleation fires early, at a low S,
     * and only a handful of crystals ever form. Quench the same solution and
     * the supersaturation races past before J has had time to add up to
     * anything; nucleation fires late, at a far higher S where J is orders of
     * magnitude larger, and the flask fills with a shower of tiny ones.
     *
     * This is Nývlt's metastable zone appearing on its own rather than being
     * written down: the width of it comes out proportional to the cooling rate
     * because that is what the arithmetic of a slow stochastic process does.
     */
    const lnS = Math.log(S);
    const J = NUCLEATION_PREFACTOR * Math.exp(-NUCLEATION_B / (lnS * lnS));
    const solutionKg = (freeWater + dissolved) / 1000;
    nuclei += J * solutionKg * dt;

    /* A seed crystal or a scratched flask short-circuits the wait entirely,
       which is exactly what it is for. */
    if (seeded && nuclei < 1) nuclei = 1;

    if (nuclei >= 1) {
      seeded = true;
      /*
       * GROWTH is surface-limited, and that is what closes the loop.
       *
       *      dm/dt = k_g · A · (S − 1),   A = 6 N^⅓ V^⅔
       *
       * N crystals sharing a volume V have a total surface area that grows only
       * as the cube root of their number, so a flask holding a handful of
       * crystals can absorb the excess only slowly — the supersaturation stays
       * high, and nucleation goes on producing more. A flask already full of
       * tiny ones has an enormous area, drops the supersaturation at once, and
       * stops nucleating.
       *
       * That feedback is what decides how many crystals there are, and
       * therefore how big and how clean they are. Deposit the excess on a fixed
       * time constant instead — as this engine did at first — and one nucleus
       * swallows the lot, the supersaturation collapses, and the whole flask
       * comes down as a single twelve-millimetre crystal whatever the student
       * does.
       */
      const r2 = hydrateRatio(solute);
      const volumeCm3 = Math.max((crystalAnhydrous * r2) / solute.density, nuclei * 1e-11);
      const areaCm2 = 6 * Math.cbrt(nuclei) * volumeCm3 ** (2 / 3);
      const excess = dissolved - sat;
      if (excess > 0) {
        const laid = Math.min(excess, GROWTH_COEFFICIENT * areaCm2 * (S - 1) * dt);
        dissolved -= laid;
        crystalAnhydrous += laid;
      }
    }
  } else if (S < 1 && crystalAnhydrous > 0) {
    /* Warming a flask back up redissolves what has come down. */
    const room = sat - dissolved;
    const back = Math.min(crystalAnhydrous, (room / GROWTH_SECONDS) * dt);
    dissolved += back;
    crystalAnhydrous -= back;
  }

  /*
   * The soluble impurity is doing exactly the same arithmetic, and the student
   * is hoping it loses. It stays in the mother liquor as long as the mother
   * liquor can hold it — but squeeze the solvent hard enough, or start with a
   * heavily contaminated sample, and it saturates too and comes down WITH the
   * product. That is the trade the whole experiment is about.
   */
  let dissolvedImpurity = state.dissolvedImpurity;
  let impurityCrystallised = state.impurityCrystallised;
  const impurity = IMPURITIES[state.soluteId];
  const impSat = (solubility(impurity.solubilityWater, tempC) / 100) * freeWater;
  if (dissolvedImpurity > impSat) {
    const laid = Math.min(dissolvedImpurity - impSat, ((dissolvedImpurity - impSat) / GROWTH_SECONDS) * dt);
    dissolvedImpurity -= laid;
    impurityCrystallised += laid;
  }

  return {
    tempC, dissolved, crystalAnhydrous, nuclei, seeded,
    dissolvedImpurity, impurityCrystallised,
    elapsed: state.elapsed + dt,
  };
}

/**
 * When is a crystallisation over?
 *
 * Not "when the clock says so", and not "when the flask has cooled to exactly
 * the bath" — a Newton exponential never quite arrives. It is over when nothing
 * more is going to come out: the flask is within half a degree of its bath and
 * the solution is no longer meaningfully supersaturated, so the crystals have
 * stopped growing.
 *
 * One definition, used by the store to decide when to offer the crystals for
 * weighing, by the status line to decide what to say, and by the tests to
 * decide when to stop integrating. They disagreed once — the bench announced
 * the crystallisation complete while still refusing to let the student weigh
 * it — and this is what that cost.
 */
export function crystallisationComplete(state) {
  if (state.elapsed < 60) return false;
  const solute = SOLUTES[state.soluteId];
  const solvent = SOLVENTS[state.solventId];
  const table = solvent.id === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;
  const r = hydrateRatio(solute);
  const freeWater = state.solventMass + state.waterOfCrystallisation
    - state.crystalAnhydrous * (r - 1);
  const sat = (solubility(table, state.tempC) / 100) * freeWater;
  const settled = sat > 0 ? state.dissolved / sat <= 1.004 : true;
  return state.tempC - state.crystallisationTempC < 0.5 && settled;
}

/* ── The product ──────────────────────────────────────────────────────────── */

/**
 * Mean crystal size, millimetres. The mass that has come down is shared between
 * however many nuclei formed, so size is the cube root of mass per crystal over
 * density. Slow cooling makes few nuclei and therefore big crystals; a quench
 * makes millions and therefore a powder. Nothing here is a style choice.
 */
export function meanCrystalSizeMm(crystalMassG, nuclei, density) {
  if (nuclei < 1 || crystalMassG <= 0) return 0;
  const volumePerCrystal = crystalMassG / density / nuclei;    // cm³
  return Math.cbrt(volumePerCrystal) * 10;
}

/**
 * What is actually on the filter paper, and how pure it is.
 *
 * Three things can contaminate it and they arrive by three different routes:
 *   · mother liquor OCCLUDED in and on the crystals, which goes as surface
 *     area and so is worse for small crystals — the cost of cooling fast;
 *   · soluble impurity that CRYSTALLISED because the mother liquor could not
 *     hold it — the cost of using too little solvent;
 *   · INSOLUBLE impurity that was never removed, because the solution was not
 *     filtered while it was hot — the cost of skipping a step.
 */
export function product(state) {
  const solute = SOLUTES[state.soluteId];
  const r = hydrateRatio(solute);
  const crystalMass = state.crystalAnhydrous * r;

  const size = meanCrystalSizeMm(crystalMass, state.nuclei, solute.density);
  const occlusionFraction = size > 0
    ? Math.min(0.30, OCCLUSION_AT_1MM / Math.max(size, 0.02))
    : 0;
  let occluded = crystalMass * occlusionFraction;
  /* Washing with a little ice-cold solvent takes most of the adhering liquor
     away — and dissolves a little of the crystal while it is about it. */
  let washLoss = 0;
  if (state.washed) {
    occluded *= 1 - WASH_REMOVES;
    washLoss = crystalMass * 0.025;
  }

  /* What the occluded liquor carries: the impurity at its current concentration
     in the mother liquor, which is why a heavily contaminated sample is worse
     even when nothing has co-crystallised. */
  const liquorMass = state.solventMass + state.waterOfCrystallisation
    - state.crystalAnhydrous * (r - 1) + state.dissolved + state.dissolvedImpurity;
  const liquorImpurityFraction = liquorMass > 0 ? state.dissolvedImpurity / liquorMass : 0;

  const fromOcclusion = occluded * liquorImpurityFraction;
  const fromCoCrystal = state.impurityCrystallised;
  const fromInsoluble = state.filtration === 'hot' ? 0 : state.insoluble;

  const impurityMass = fromOcclusion + fromCoCrystal + fromInsoluble;
  const productMass = Math.max(0, crystalMass - washLoss) + impurityMass;

  const purity = productMass > 0 ? (productMass - impurityMass) / productMass : 0;

  /* Mole fraction of the contaminant in the product, which is the number the
     melting-point bench needs — melting points count particles, not grams. */
  const impurity = IMPURITIES[state.soluteId];
  const nSolute = (productMass - impurityMass) / solute.molarMassCrystal;
  const nImp = impurityMass / impurity.molarMass;
  const moleFractionImpurity = nSolute + nImp > 0 ? nImp / (nSolute + nImp) : 0;

  return {
    crystalMass, productMass, impurityMass, purity, moleFractionImpurity,
    meanSizeMm: size, occluded, washLoss,
    fromOcclusion, fromCoCrystal, fromInsoluble,
    liquorImpurityFraction,
  };
}

/**
 * The characteristic temperature of the product, and how sharp it is.
 *
 * For benzoic acid this really is a melting point, and it is handed to the
 * liquidus of XI-CHE-B01 — the same Schröder–van Laar equation, already
 * verified against Freundlich's coagulation data and the cryoscopic constants —
 * so the answer comes from a bench that exists rather than from an assertion
 * made here.
 *
 * Copper sulphate pentahydrate and alum do not melt. The first loses its water
 * of crystallisation near 110 °C and the second melts in its own at 92.5 °C.
 * Those are real transitions with real temperatures, and an impurity blurs them
 * rather than depressing them by a colligative law, so they are reported as a
 * widening range and said to be what they are. Pretending a dehydration is a
 * eutectic melt would be the kind of tidy lie this project exists not to tell.
 */
export function productTransition(state, prod, liquidus) {
  const solute = SOLUTES[state.soluteId];
  const x = prod.moleFractionImpurity;

  if (solute.hydrate === 0 && typeof liquidus === 'function') {
    const clearC = liquidus(1 - x);
    /* Onset taken at the same quarter-melted appearance the melting-point bench
       uses, approximated here by the depression scaled to the visible fraction;
       the exact figure is what that bench reports when the product is taken to
       it. */
    const onsetC = clearC - (solute.characteristicTempC - clearC) * 3.2 - 0.2;
    return {
      kind: 'melting point',
      clearC,
      onsetC: Math.min(clearC - 0.05, onsetC),
      rangeC: Math.max(0.1, clearC - Math.min(clearC - 0.05, onsetC)),
      literatureC: solute.characteristicTempC,
    };
  }

  /* A dehydration, not a melt: the transition temperature barely moves, but an
     impure crystal loses its water over a wider span because the impurity is
     not part of the lattice that is giving the water up. */
  const widening = 1.0 + 55 * x;
  return {
    kind: solute.characteristic,
    clearC: solute.characteristicTempC - 6 * x,
    onsetC: solute.characteristicTempC - 6 * x - widening,
    rangeC: widening,
    literatureC: solute.characteristicTempC,
  };
}

/* ── What the student sees ────────────────────────────────────────────────── */

function classify(d) {
  if (d.undissolved > 0.02) {
    return {
      key: 'undissolved',
      title: 'It has not all dissolved',
      detail: `${d.undissolved.toFixed(2)} g is still solid at ${d.solvent.boilingPointC} °C. The minimum volume of boiling ${d.solvent.label.toLowerCase()} for this much is about ${d.minimumMl.toFixed(0)} mL. Add solvent — but no more than you must, because every extra millilitre stays behind with some of your product in it.`,
    };
  }
  if (d.supersaturated && d.crystalMass <= 0.001) {
    return {
      key: 'supersaturated',
      title: `Supersaturated — ${d.supersaturationRatio.toFixed(2)}× saturated and nothing is happening`,
      detail: 'The solution holds more than it should and is waiting for somewhere to start. Scratch the flask with a glass rod, or drop in a seed crystal.',
    };
  }
  /* Still on the way down, and not yet saturated. Once it has reached the
     temperature the student chose, "still cooling" is no longer the answer —
     the answer is that there is too much solvent. */
  if (d.tempC > d.crystallisationTempC + 0.5 && d.tempC > d.saturationTempC + 0.5
      && d.crystalMass <= 0.001) {
    return {
      key: 'cooling',
      title: `Cooling — ${d.tempC.toFixed(0)} °C`,
      detail: `Nothing can crystallise above ${d.saturationTempC.toFixed(0)} °C, because the solution is not yet saturated. ${d.coolingNote}`,
    };
  }
  if (d.crystalMass > 0.001 && d.tempC > d.crystallisationTempC + 0.5) {
    return {
      key: 'crystallising',
      title: 'Crystallising',
      detail: `${d.crystalMass.toFixed(2)} g down, ${d.meanSizeMm.toFixed(2)} mm across, ${Math.round(d.nuclei).toLocaleString()} crystals. ${d.coolingNote}`,
    };
  }
  /* Still coming down: the flask has reached the bath temperature but the last
     of the excess is still being deposited, and the bench does not yet offer
     the crystals to be weighed. Saying "complete" here would be the interface
     disagreeing with the apparatus. */
  if (d.crystalMass > 0.001 && d.stage !== 'crystallised') {
    return {
      key: 'settling',
      title: 'Settling',
      detail: `${d.crystalMass.toFixed(2)} g down and still growing — the solution is a little supersaturated all the way to the end. ${d.meanSizeMm.toFixed(2)} mm across.`,
    };
  }
  if (d.crystalMass > 0.001) {
    const lost = d.theoreticalMax - d.crystalMass;
    return {
      key: 'done',
      title: `Crystallisation complete — ${d.recoveryPercent.toFixed(0)}% recovered`,
      detail: `${d.crystalMass.toFixed(2)} g of ${d.theoreticalMax.toFixed(2)} g. ${lost.toFixed(2)} g stayed dissolved in the mother liquor, and no technique recovers it at this temperature — only less solvent, or a colder bath, would.`,
    };
  }
  if (d.recoveryPercent <= 0 && d.tempC <= d.crystallisationTempC + 0.5) {
    return {
      key: 'no-crystals',
      title: 'No crystals at all',
      detail: `At ${d.tempC.toFixed(0)} °C the solvent can still hold ${(d.saturationMass).toFixed(2)} g and you only have ${d.dissolved.toFixed(2)} g in it. There is too much solvent: the minimum for this sample is about ${d.minimumMl.toFixed(0)} mL, and you used ${d.solventMl.toFixed(0)}.`,
    };
  }
  return { key: 'hot', title: 'Dissolved and hot', detail: 'Filter it hot if there is anything insoluble, then let it cool.' };
}

/** Everything the scene, the HUD and the observation table read. */
export function derive(state, liquidus) {
  const solute = SOLUTES[state.soluteId];
  const solvent = SOLVENTS[state.solventId];
  const table = solvent.id === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;
  const r = hydrateRatio(solute);

  const charge = chargeFromCrude(state);
  const minimumMl = minimumSolventMl({ charge, solvent });

  const freeWater = state.solventMass + state.waterOfCrystallisation
    - state.crystalAnhydrous * (r - 1);
  const saturationMass = (solubility(table, state.tempC) / 100) * freeWater;
  const supersaturationRatio = saturationMass > 0 ? state.dissolved / saturationMass : 0;

  const prod = product(state);
  const transition = productTransition(state, prod, liquidus);

  const theoreticalMax = charge.theoreticalMax;
  const recoveryPercent = theoreticalMax > 0 ? (prod.crystalMass / theoreticalMax) * 100 : 0;
  const crudeRecoveryPercent = state.crudeMass > 0 ? (prod.productMass / state.crudeMass) * 100 : 0;

  const d = {
    solute, solvent, impurity: IMPURITIES[state.soluteId],
    charge, minimumMl, solventMl: state.solventMl,
    tempC: state.tempC,
    crystallisationTempC: state.crystallisationTempC,
    saturationTempC: saturationTemperatureC({
      anhydrous: state.dissolved, freeWater, solute, solvent,
    }),
    dissolved: state.dissolved,
    saturationMass,
    supersaturationRatio,
    supersaturated: supersaturationRatio > 1.02 && state.nuclei < 1,
    undissolved: state.undissolved,
    nuclei: state.nuclei,
    crystalMass: prod.crystalMass,
    productMass: prod.productMass,
    meanSizeMm: prod.meanSizeMm,
    purity: prod.purity,
    impurityMass: prod.impurityMass,
    fromOcclusion: prod.fromOcclusion,
    fromCoCrystal: prod.fromCoCrystal,
    fromInsoluble: prod.fromInsoluble,
    moleFractionImpurity: prod.moleFractionImpurity,
    theoreticalMax,
    recoveryPercent,
    crudeRecoveryPercent,
    transition,
    enthalpyOfSolution: enthalpyOfSolution(table, Math.max(10, state.tempC), solute.molarMassAnhydrous),
    hotSolubility: solubility(table, solvent.boilingPointC),
    coldSolubility: solubility(table, state.crystallisationTempC),
    solubilityRatio: solubility(table, solvent.boilingPointC) / solubility(table, state.crystallisationTempC),
    coolingNote: COOLING[state.cooling].note,
    washed: state.washed,
    filtration: state.filtration,
    stage: state.stage,
  };
  d.status = classify(d);
  return d;
}

export {
  SOLUTES, SOLVENTS, CRUDE_GRADES, IMPURITIES, COOLING, AMBIENT_C, METASTABLE_RATIO,
} from './solutes.js';
