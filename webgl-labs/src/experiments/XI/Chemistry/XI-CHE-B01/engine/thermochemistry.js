/**
 * The melting-point engine.
 *
 * No React, no three, no store — so it can be held to the data book from plain
 * Node (verify-melting-point.mjs). One equation does almost all of the work:
 *
 *      SCHRÖDER–VAN LAAR, the ideal-solubility form of the liquidus
 *
 *          ln x_A = −(ΔH_fus,A / R) · (1/T − 1/T_A)
 *
 * Read forwards it says how much of A can dissolve in the melt at temperature
 * T; read backwards it says at what temperature the last crystal of A finally
 * disappears from a mixture of composition x_A. Everything a Class XI student
 * is asked to observe is a consequence of it, and none of it is stored anywhere
 * as a fact:
 *
 *   · an impurity DEPRESSES the melting point, by exactly the amount the
 *     equation says — and differentiating it at x_A → 1 gives back the
 *     cryoscopic constant K_f = R T_A² M_A / 1000 ΔH_fus, which is the
 *     Class XI textbook formula, never used here but always obeyed;
 *   · melting BEGINS at the eutectic, where the two liquidus branches of the
 *     two components meet, so an impure sample melts over a RANGE;
 *   · a pure sample has no second branch to meet, so its range collapses to
 *     nothing and it melts SHARPLY. Sharpness is an output, not a flag;
 *   · a MIXED MELTING POINT is the same equation with the second component
 *     named by the student, which is why mixing a compound with itself changes
 *     nothing and mixing it with anything else depresses it.
 */
import {
  COMPOUNDS, BATHS, THERMOMETERS, R, KELVIN, PURITY_MOLE_FRACTION,
  NATIVE_IMPURITY, LIQUID_VISIBLE_FRACTION, SINTER_FRACTION,
  CAPILLARY_GLASS_RATIO, GLASS_SPECIFIC_HEAT, SAMPLE_LAG_SECONDS, AMBIENT_C,
} from './compounds.js';

const C2K = (c) => c + KELVIN;
const K2C = (k) => k - KELVIN;

/* ── The liquidus ─────────────────────────────────────────────────────────── */

/**
 * Temperature at which a melt of composition x of component A is saturated in
 * A — i.e. the temperature at which A's last crystal dissolves. Solved directly
 * from Schröder–van Laar, no iteration needed.
 */
export function liquidusK(compound, moleFractionA) {
  if (moleFractionA >= 1) return C2K(compound.meltingPointC);
  if (moleFractionA <= 0) return 0;
  const invT = 1 / C2K(compound.meltingPointC)
    - (R / compound.enthalpyFusion) * Math.log(moleFractionA);
  return 1 / invT;
}

/** The inverse: how much A a melt can hold at temperature T. This is the curve
 *  the lever rule is read against. */
export function saturationMoleFraction(compound, T) {
  if (T >= C2K(compound.meltingPointC)) return 1;
  const lnX = -(compound.enthalpyFusion / R) * (1 / T - 1 / C2K(compound.meltingPointC));
  return Math.exp(lnX);
}

/**
 * The eutectic of a binary pair, from the pure-component data alone.
 *
 * Both components are dissolving in the same melt, so both liquidus equations
 * hold at once; the eutectic is the one temperature where the two mole
 * fractions they demand add to unity. Bisected, because the sum is monotonic in
 * T and nothing cleverer is warranted.
 *
 * This is worth pausing on: naphthalene melts at 80.3 °C and biphenyl at
 * 69.2 °C, yet together they are liquid at 41 °C. Two solids, neither of them
 * remotely molten, and the mixture runs. That is what an impurity does, and it
 * is why the first drop appears so far below the melting point.
 */
const EUTECTIC_CACHE = new Map();

export function eutectic(a, b) {
  if (a.id === b.id) return { temperatureK: C2K(a.meltingPointC), moleFractionB: 0 };
  /* Memoised. It is bisected eighty deep and sits inside the per-frame melted
     fraction, but it depends on nothing that changes during a run — only on two
     compounds' melting points and enthalpies. */
  const key = `${a.id}|${b.id}`;
  const hit = EUTECTIC_CACHE.get(key);
  if (hit) return hit;
  let lo = 1;                                        // nothing is solid at 1 K
  let hi = Math.max(C2K(a.meltingPointC), C2K(b.meltingPointC));
  const total = (T) => saturationMoleFraction(a, T) + saturationMoleFraction(b, T);
  for (let i = 0; i < 80; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (total(mid) < 1) lo = mid; else hi = mid;
  }
  const T = 0.5 * (lo + hi);
  const result = { temperatureK: T, moleFractionB: saturationMoleFraction(b, T) };
  EUTECTIC_CACHE.set(key, result);
  return result;
}

/**
 * LEVER RULE. At temperature T the melt must be saturated, so its composition is
 * fixed by the liquidus; the amount of melt is then whatever it takes to hold
 * all of the impurity.
 *
 *      φ(T) = x_B(total) / x_B(liquidus at T)
 *
 * At the eutectic the liquidus is at its most impurity-tolerant, so φ jumps
 * straight to x_B/x_B(eutectic) — which is the sudden slump a student sees, and
 * the reason the column collapses before anything looks wet.
 */
export function meltedFraction({ host, guest, moleFractionGuest, T }) {
  const Te = eutectic(host, guest).temperatureK;
  if (T <= Te) return 0;
  const hostLiquidus = liquidusK(host, 1 - moleFractionGuest);
  if (T >= hostLiquidus) return 1;
  const xGuestSaturated = 1 - saturationMoleFraction(host, T);
  if (xGuestSaturated <= 0) return 0;
  return Math.min(1, moleFractionGuest / xGuestSaturated);
}

/** dφ/dT, by central difference. Used only to slow the sample down while it is
 *  absorbing its latent heat, so a millikelvin step is ample. */
export function meltedFractionSlope(args, T) {
  const h = 0.002;
  return (meltedFraction({ ...args, T: T + h }) - meltedFraction({ ...args, T: T - h })) / (2 * h);
}

/**
 * The temperature at which a given melted fraction is reached. Bisection on
 * φ(T), which is monotonic. This is how the engine answers "at what temperature
 * would the column look a quarter melted" without simulating anything.
 */
export function temperatureAtFraction(args, target) {
  const Te = eutectic(args.host, args.guest).temperatureK;
  const Tl = liquidusK(args.host, 1 - args.moleFractionGuest);
  if (target >= 1) return Tl;
  let lo = Te;
  let hi = Tl;
  for (let i = 0; i < 60; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (meltedFraction({ ...args, T: mid }) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/* ── Heat ─────────────────────────────────────────────────────────────────── */

/**
 * Λ — the latent heat of the sample expressed as the temperature rise the same
 * heat would have produced if the sample had simply got hotter. It is what makes
 * melting take time, and therefore what makes a fast-heated sample melt over a
 * wider apparent range than a slowly heated one.
 *
 * The capillary's glass wall is included because it weighs several times what
 * the sample does and has to be dragged through the same temperature.
 */
export function latentHeatInKelvin(compound) {
  const cEff = compound.specificHeat + CAPILLARY_GLASS_RATIO * GLASS_SPECIFIC_HEAT;
  return compound.enthalpyFusion / (compound.molarMass * cEff);
}

/**
 * Apparent broadening from heating rate alone, in kelvin.
 *
 *     ΔT ≈ √(2 τ Λ r)
 *
 * Integrate the heat balance across the melt: the bath runs ahead of the stalled
 * sample at rate r, the excess drives the melting, and the sample is free again
 * only after ΔH has gone in. It grows as the SQUARE ROOT of the heating rate,
 * which is the quantitative version of "heat slowly near the melting point".
 * Returned for the HUD to show; the simulation gets it by integrating.
 */
export function rateBroadeningK(compound, ratePerMinute) {
  return Math.sqrt(2 * SAMPLE_LAG_SECONDS * latentHeatInKelvin(compound) * (ratePerMinute / 60));
}

/** Cryoscopic constant, K kg mol⁻¹. Never used by the engine — it is the
 *  Class XI formula, derived from the same two data, offered so a student can
 *  check the simulation against the book rather than the other way round. */
export function cryoscopicConstant(compound) {
  const T = C2K(compound.meltingPointC);
  return (R * T * T * compound.molarMass) / (1000 * compound.enthalpyFusion);
}

/* ── Composition of the sample in the capillary ───────────────────────────── */

/**
 * What is actually in the capillary. Three things can put a second component
 * there and they compose, because in a real lab they compose:
 *   · the grade of sample taken from the bottle;
 *   · a deliberate mixed-melting-point addition;
 *   · what the last run did to it — urea that has been past its melting point
 *     is part biuret, and no amount of care afterwards undoes that.
 */
export function capillaryContents({
  compoundId, impurityId, purity, mixMolePercent = 0, capillaryRuns = 0,
}) {
  const host = COMPOUNDS[compoundId];
  const nativeId = NATIVE_IMPURITY[compoundId] ?? 'biphenyl';
  const chosenId = impurityId && impurityId !== 'none' ? impurityId : nativeId;
  const guest = COMPOUNDS[chosenId];

  let x = PURITY_MOLE_FRACTION[purity] ?? PURITY_MOLE_FRACTION.pure;

  /* A mixed melting point adds the named compound on top of whatever is already
     there. Mixing a compound with itself adds nothing — which is the point of
     the test, and falls out rather than being special-cased. */
  const mixed = mixMolePercent / 100;
  if (chosenId !== compoundId) x = x + mixed - x * mixed;

  /* Decomposition. Each trip past the melting point converts a few per cent of
     a thermally fragile compound into its product, and the product is an
     impurity in what remains. */
  let decomposed = 0;
  if (host.decompositionProduct && capillaryRuns > 0) {
    decomposed = 1 - 0.94 ** capillaryRuns;
    x = x + decomposed - x * decomposed;
  }

  return {
    host,
    guest: chosenId === compoundId ? COMPOUNDS[nativeId] : guest,
    identicalMix: chosenId === compoundId,
    moleFractionGuest: Math.min(0.85, Math.max(1e-6, x)),
    decomposedFraction: decomposed,
  };
}

/* ── The run ──────────────────────────────────────────────────────────────── */

/**
 * One frame. The only function that writes memory.
 *
 * Three temperatures, and keeping them apart is the whole of the thermal
 * pedagogy:
 *   bathC     what the burner is doing to the paraffin;
 *   sampleC   what the crystals in the capillary are actually at — nearly the
 *             bath, except while melting, when latent heat holds them back;
 *   readingC  what the mercury says, which lags both, and which is the only one
 *             of the three the student is allowed to write down.
 */
export function integrate(state, dtTotal) {
  /* Sub-stepped internally, so the caller may hand this a whole simulated
     minute. Both thermal relaxations have time constants of a few seconds and
     an explicit step longer than those would not merely be inaccurate, it would
     oscillate and diverge — a beaker that boils because the clock was set to
     ×300 is not a simulation of anything. */
  const SUB = Math.max(1, Math.ceil(dtTotal / 0.25));
  if (SUB > 1) {
    let s = state;
    for (let i = 0; i < SUB; i += 1) s = { ...s, ...stepOnce(s, dtTotal / SUB) };
    return { bathC: s.bathC, sampleC: s.sampleC, readingC: s.readingC,
      meltedFraction: s.meltedFraction, columnLoss: s.columnLoss };
  }
  return stepOnce(state, dtTotal);
}

function stepOnce(state, dt) {
  const bath = BATHS[state.bath];
  const thermo = THERMOMETERS[state.thermometer];
  const contents = capillaryContents(state);
  const args = {
    host: contents.host, guest: contents.guest,
    moleFractionGuest: contents.moleFractionGuest,
  };

  /* The bath. The burner drives it at the rate the student set, and it stops
     dead at the bath liquid's ceiling — water at 100 °C goes on boiling and
     gets no hotter, which is a failure the student must be allowed to walk
     into. Off the flame it drifts back towards the room. */
  const target = state.burnerOn ? bath.maxC : AMBIENT_C;
  const rate = state.burnerOn ? state.heatingRate / 60 : -0.35 / 60 * (state.bathC - AMBIENT_C);
  let bathC = state.bathC + rate * dt;
  if (state.burnerOn) bathC = Math.min(bathC, target);
  else bathC = Math.max(bathC, AMBIENT_C);

  /* The sample. First-order approach to the bath, slowed by however much of its
     latent heat it is absorbing at this instant. Where φ turns over steeply —
     a pure compound at its melting point — the effective time constant goes to
     infinity and the sample simply stops climbing until it has melted. That
     halt is not scripted; it is 1/(1 + Λ dφ/dT) doing its job. */
  const Ts = C2K(state.sampleC);
  const slope = meltedFractionSlope(args, Ts);
  const lambda = latentHeatInKelvin(contents.host);
  const tau = SAMPLE_LAG_SECONDS * (1 + lambda * Math.max(0, slope));
  const sampleC = state.sampleC + ((bathC - state.sampleC) / tau) * dt;

  /* The thermometer. A mercury bulb in oil is the slowest thing on the stand. */
  const readingC = state.readingC + ((bathC - state.readingC) / thermo.lagSeconds) * dt;

  const fraction = meltedFraction({ ...args, T: C2K(sampleC) });

  /* Sublimation. A compound that sublimes loses column height whenever it is
     hot, which is why a naphthalene capillary left in the bath ends up with
     nothing in it — and why the reading is unaffected, since what is left is
     still pure naphthalene. */
  const subliming = contents.host.sublimes && sampleC > contents.host.meltingPointC - 25;
  const columnLoss = subliming ? Math.min(1, state.columnLoss + 0.0016 * dt) : state.columnLoss;

  return { bathC, sampleC, readingC, meltedFraction: fraction, columnLoss };
}

/* ── What the student sees ────────────────────────────────────────────────── */

function classify(d) {
  if (d.bathCapped && d.liquidusC > d.bathMaxC) {
    return {
      key: 'bath-too-cold',
      title: `The ${d.bathLabel.toLowerCase()} bath cannot reach it`,
      detail: `${d.host.label} melts at ${d.host.meltingPointC.toFixed(1)} °C and this bath stops at ${d.bathMaxC} °C. It will never melt, however long you heat it. Change the bath.`,
    };
  }
  if (d.columnLoss > 0.85) {
    return {
      key: 'sublimed',
      title: 'The sample has sublimed away',
      detail: `${d.host.label} sublimes below its melting point. It has been hot for too long and there is nothing left in the capillary to melt. Pack a fresh one and heat faster through the early part.`,
    };
  }
  if (d.meltedFraction >= 0.999) {
    return {
      key: 'melted',
      title: 'Completely melted — clear liquid',
      detail: `Last crystal gone at ${d.readingC.toFixed(1)} °C. Range ${d.rangeC.toFixed(1)} °C.${d.rangeC <= 1 ? ' Sharp: this is a pure compound.' : ' A range this wide means a second substance is present.'}`,
    };
  }
  if (d.meltedFraction >= LIQUID_VISIBLE_FRACTION) {
    return {
      key: 'melting',
      title: 'Melting — liquid rising in the capillary',
      detail: `${(d.meltedFraction * 100).toFixed(0)}% liquid. Record the last crystal, not this; the melting point is where the solid finally disappears.`,
    };
  }
  if (d.meltedFraction >= SINTER_FRACTION) {
    return {
      key: 'sintering',
      title: 'Sintering — the column is slumping',
      detail: `The eutectic with ${d.guest.label.toLowerCase()} melts at ${d.eutecticC.toFixed(1)} °C, so a film of liquid is already wetting the grains. This is the true start of melting, and it is why an impure sample has a range.`,
    };
  }
  if (d.rateBroadening > 1.0 && d.sampleC > d.onsetC - 12) {
    return {
      key: 'too-fast',
      title: 'Heating too fast near the melting point',
      detail: `At ${d.heatingRate} °C/min the latent heat alone will smear the range by about ${d.rateBroadening.toFixed(1)} °C, and the mercury is ${(d.bathC - d.readingC).toFixed(1)} °C behind the bath. Below 2 °C/min from here.`,
    };
  }
  if (!d.burnerOn) {
    return {
      key: 'cooling',
      title: 'Burner off — the bath is cooling',
      detail: `Bath ${d.bathC.toFixed(0)} °C, reading ${d.readingC.toFixed(1)} °C. Light the burner to begin.`,
    };
  }
  return {
    key: 'heating',
    title: 'Heating',
    detail: `Reading ${d.readingC.toFixed(1)} °C, still ${Math.max(0, d.onsetC - d.readingC).toFixed(0)} °C below anything visible. Watch the capillary, not the clock.`,
  };
}

/**
 * Everything the beaker, the HUD and the observation table read. Pure: it is
 * derived afresh from the state each frame and holds no memory of its own.
 */
export function derive(state) {
  const contents = capillaryContents(state);
  const { host, guest, moleFractionGuest, identicalMix, decomposedFraction } = contents;
  const bath = BATHS[state.bath];
  const thermo = THERMOMETERS[state.thermometer];
  const args = { host, guest, moleFractionGuest };

  const eut = eutectic(host, guest);
  const eutecticC = K2C(eut.temperatureK);
  const liquidusC = K2C(liquidusK(host, 1 - moleFractionGuest));

  /* The two temperatures a student actually writes down, defined the way a
     student defines them: the first the column visibly wets, and the last a
     crystal can be seen. Both come out of the lever rule. */
  const onsetC = K2C(temperatureAtFraction(args, LIQUID_VISIBLE_FRACTION));
  const sinterC = K2C(temperatureAtFraction(args, SINTER_FRACTION));
  const clearC = liquidusC;
  const rateBroadening = rateBroadeningK(host, state.heatingRate);

  /* Quantise to what the instrument can resolve. A pure compound melting over
     a tenth of a degree reads as a single value on a 1 °C thermometer, and that
     is not the simulation being coarse — it is the thermometer. */
  const lc = thermo.leastCount;
  const round = (c) => Math.round(c / lc) * lc;

  const d = {
    host, guest, identicalMix, moleFractionGuest, decomposedFraction,
    bathLabel: bath.label, bathMaxC: bath.maxC, bathCapped: state.bathC >= bath.maxC - 0.01,
    smoking: state.bathC > bath.smokesAboveC,
    leastCount: lc,
    eutecticC, liquidusC, onsetC, sinterC, clearC,
    rangeC: Math.max(0, clearC - onsetC),
    depressionC: host.meltingPointC - liquidusC,
    rateBroadening,
    cryoscopicConstant: cryoscopicConstant(host),
    latentHeatK: latentHeatInKelvin(host),
    bathC: state.bathC, sampleC: state.sampleC,
    readingC: round(state.readingC),
    thermometerLagC: state.bathC - state.readingC,
    meltedFraction: state.meltedFraction,
    columnLoss: state.columnLoss,
    heatingRate: state.heatingRate, burnerOn: state.burnerOn,
    literatureC: host.meltingPointC,
  };
  d.status = classify(d);
  return d;
}

export { COMPOUNDS, BATHS, THERMOMETERS, UNKNOWNS, NATIVE_IMPURITY, LIQUID_VISIBLE_FRACTION, SINTER_FRACTION, AMBIENT_C } from './compounds.js';
