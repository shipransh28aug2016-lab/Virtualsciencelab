/**
 * The boiling-point engine.
 *
 * No React, no three, no store — so it can be held to the handbook from plain
 * Node (verify-boiling-point.mjs). Two statements carry the whole experiment:
 *
 *      ANTOINE     log₁₀ P°(t) = A − B / (C + t)
 *      RAOULT      the liquid boils where  Σ xᵢ P°ᵢ(T) = P_atm
 *
 * Everything a Class XI student is asked to observe follows, and none of it is
 * stored as a fact anywhere:
 *
 *   · the BOILING POINT is where the vapour pressure curve crosses the
 *     pressure in the room — so it is a property of the liquid AND the day, and
 *     a boiling point quoted without a pressure is not a measurement;
 *   · a NON-VOLATILE SOLUTE simply lowers x_A, so the liquid must be hotter
 *     before the sum reaches P_atm. In the dilute limit that is exactly
 *     ΔT_b = K_b m with K_b = RT²M/1000ΔH_vap — which the engine reproduces
 *     without ever containing the formula;
 *   · ΔH_vap comes from the slope of the same Antoine curve, and dividing it by
 *     the boiling point gives TROUTON'S CONSTANT. Above about 100 J mol⁻¹ K⁻¹
 *     the liquid is associated — hydrogen bonded — and that verdict is what
 *     chooses the constant in the pressure correction. The chain closes on
 *     itself with nothing looked up;
 *   · a MIXTURE boils over a range, because the vapour leaving is richer in the
 *     more volatile component, so what is left behind is not what you started
 *     with.
 */
import {
  LIQUIDS, SOLUTES, BATHS, THERMOMETERS, NATIVE_SOLUTE, PURITY_MOLE_FRACTION,
  R, KELVIN, STANDARD_PRESSURE, CAPILLARY, CHARGE_ML, SUPERHEAT_LIMIT_C,
  TUBE_LAG_SECONDS, AMBIENT_C, SIDGWICK_NORMAL, SIDGWICK_ASSOCIATED,
  TROUTON_ASSOCIATED_ABOVE, BATH_COOLING_PER_SECOND,
} from './liquids.js';

const C2K = (t) => t + KELVIN;

/* ── Antoine ──────────────────────────────────────────────────────────────── */

/** Vapour pressure of a pure liquid, mm Hg. */
export function vapourPressure(liquid, tC) {
  const { A, B, C } = liquid.antoine;
  return 10 ** (A - B / (C + tC));
}

/** The boiling point at a stated pressure. Antoine inverts in closed form, so
 *  this is exact rather than iterated. */
export function boilingPointC(liquid, pressureMmHg) {
  const { A, B, C } = liquid.antoine;
  return B / (A - Math.log10(pressureMmHg)) - C;
}

/**
 * Enthalpy of vaporisation, J/mol, from the slope of the Antoine curve.
 *
 *      dlnP/dT = ΔH / RT²        (Clausius–Clapeyron)
 *      dlnP/dt = 2.303 B / (C+t)²   (Antoine, differentiated)
 *
 * Equate them. The vapour-pressure data and the latent heat are the same
 * measurement seen twice, and this is the identity that says so.
 */
export function enthalpyVaporisation(liquid, tC) {
  const { B, C } = liquid.antoine;
  const T = C2K(tC);
  return (R * T * T * Math.LN10 * B) / (C + tC) ** 2;
}

/**
 * Trouton's constant, ΔH_vap / T_b. About 88 J mol⁻¹ K⁻¹ for a normal liquid,
 * because the entropy gained on going from any liquid to a gas at one
 * atmosphere is much the same. Markedly higher means the liquid was more
 * ordered than a liquid should be — hydrogen bonding — and markedly lower means
 * the vapour is associated instead.
 */
export function troutonConstant(liquid, pressureMmHg = STANDARD_PRESSURE) {
  const tb = boilingPointC(liquid, pressureMmHg);
  return enthalpyVaporisation(liquid, tb) / C2K(tb);
}

export function isAssociated(liquid) {
  return troutonConstant(liquid) > TROUTON_ASSOCIATED_ABOVE;
}

/** Ebullioscopic constant, K kg mol⁻¹. Derived, never used: the engine reaches
 *  elevation through Raoult's law, and this exists so a student can check the
 *  simulation against the Class XI formula rather than the other way round. */
export function ebullioscopicConstant(liquid) {
  const tb = boilingPointC(liquid, STANDARD_PRESSURE);
  const T = C2K(tb);
  return (R * T * T * liquid.molarMass) / (1000 * enthalpyVaporisation(liquid, tb));
}

/* ── Raoult ───────────────────────────────────────────────────────────────── */

/**
 * Total vapour pressure above a solution. Volatile components contribute their
 * partial pressures; a non-volatile solute contributes nothing but still counts
 * in the mole fractions, which is precisely why it raises the boiling point.
 *
 * Ideality is assumed, and it is worth being honest about where that is safe.
 * Benzene and toluene are the textbook ideal pair and behave. Ethanol and water
 * do not — they form an azeotrope — which is why the bench offers a
 * non-volatile solute for the hydrogen-bonded liquids and keeps volatile
 * mixing to the pair that Raoult's law actually describes.
 */
export function totalVapourPressure(charge, tC) {
  let p = 0;
  const total = charge.moles.reduce((a, c) => a + c.n, 0);
  if (total <= 0) return 0;
  for (const c of charge.moles) {
    if (!c.volatile) continue;
    p += (c.n / total) * vapourPressure(LIQUIDS[c.id], tC);
  }
  return p;
}

/**
 * BUBBLE POINT. The temperature at which the total vapour pressure equals the
 * pressure pushing down on the liquid. Bisected, because with more than one
 * volatile component the sum of Antoine curves does not invert.
 *
 * The pressure that matters at the mouth of the capillary is very slightly
 * more than atmospheric — the head of liquid above it, about 1 mm Hg for a
 * centimetre of immersion. Small, but it is the reason the first bubble leaves
 * at the mouth and not at the surface.
 */
export function bubblePointC(charge, pressureMmHg) {
  const target = pressureMmHg + capillaryHeadMmHg(charge);
  let lo = -60;
  let hi = 400;
  for (let i = 0; i < 90; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (totalVapourPressure(charge, mid) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Hydrostatic head over the capillary mouth, in mm Hg. ρgh against mercury. */
export function capillaryHeadMmHg(charge) {
  const rho = chargeDensity(charge);
  return (CAPILLARY.immersionDepthCm * rho) / 1.36;   // 1 cm of Hg = 1.36 g/cm² ... × 10 mm
}

function chargeDensity(charge) {
  let mass = 0;
  let volume = 0;
  for (const c of charge.moles) {
    const src = c.volatile ? LIQUIDS[c.id] : SOLUTES[c.id];
    const m = c.n * src.molarMass;
    mass += m;
    volume += c.volatile ? m / src.density : 0;
  }
  return volume > 0 ? mass / volume : 1;
}

/**
 * Composition of the vapour coming off, by Raoult and Dalton:
 *
 *      yᵢ = xᵢ P°ᵢ / P_total
 *
 * The vapour is always richer in the more volatile component than the liquid
 * it came from. That is the whole of fractional distillation, and here it is
 * the reason a mixture's boiling point climbs while you watch it.
 */
export function vapourComposition(charge, tC) {
  const total = charge.moles.reduce((a, c) => a + c.n, 0);
  const p = totalVapourPressure(charge, tC);
  if (p <= 0) return charge.moles.map(() => 0);
  return charge.moles.map((c) => (c.volatile
    ? ((c.n / total) * vapourPressure(LIQUIDS[c.id], tC)) / p
    : 0));
}

/* ── Making up the charge ─────────────────────────────────────────────────── */

/**
 * What is actually in the fusion tube: about half a millilitre of the chosen
 * liquid, whatever non-volatile material the grade of sample carries, and any
 * second liquid the student has deliberately added.
 */
export function makeCharge({ liquidId, purity, secondLiquidId = 'none', secondMolePercent = 0 }) {
  const primary = LIQUIDS[liquidId];
  const mass = CHARGE_ML * primary.density;
  const nPrimary = mass / primary.molarMass;

  const moles = [{ id: liquidId, n: nPrimary, volatile: true }];

  if (secondLiquidId !== 'none' && secondLiquidId !== liquidId && secondMolePercent > 0) {
    const f = secondMolePercent / 100;
    moles.push({ id: secondLiquidId, n: (nPrimary * f) / (1 - f), volatile: true });
  }

  const soluteId = NATIVE_SOLUTE[liquidId];
  const x = PURITY_MOLE_FRACTION[purity] ?? PURITY_MOLE_FRACTION.pure;
  const nVolatile = moles.reduce((a, c) => a + c.n, 0);
  /* Particles, not formula units: sodium chloride gives two of them, and
     boiling-point elevation counts particles. */
  const nSolute = ((x * nVolatile) / (1 - x)) * SOLUTES[soluteId].particles;
  moles.push({ id: soluteId, n: nSolute, volatile: false });

  return { moles, soluteId, secondLiquidId };
}

/* ── The run ──────────────────────────────────────────────────────────────── */

/**
 * Bubbles, which are the entire readout of Siwoloboff's method.
 *
 * Below the boiling point the only thing leaving the capillary is the air
 * trapped in it, expanding as it warms: a slow, occasional string, and it stops
 * as soon as the temperature stops rising. Above the boiling point the liquid's
 * own vapour is being driven out, and the rate goes with how far the vapour
 * pressure now exceeds the pressure outside — a rapid, continuous stream.
 *
 * Returns bubbles per second.
 */
export function bubbleRate({ charge, tC, pressureMmHg, dTdt, nucleation = true }) {
  /* No capillary, no bubbles — and that is not a missing feature, it is the
     method. A bubble has to start on something; the capillary is both the
     readout of Siwoloboff's determination and its boiling stone. Take it away
     and the liquid goes past its boiling point in silence. */
  if (!nucleation) return 0;
  const excess = totalVapourPressure(charge, tC) - (pressureMmHg + capillaryHeadMmHg(charge));
  if (excess > 0) return 2.5 + 0.55 * excess;          // vapour: the rapid stream
  const air = Math.max(0, dTdt) * 1.6;                 // trapped air, expanding
  return excess > -25 ? air : air * 0.3;
}

/**
 * How far the liquid has run back up into the capillary, 0 to 1. Once the
 * vapour pressure falls below the pressure outside, the gas left in the
 * capillary is compressed and liquid takes its place — Boyle's law, and the
 * instant it begins is the reading.
 */
export function capillaryIntrusion({ charge, tC, pressureMmHg }) {
  const outside = pressureMmHg + capillaryHeadMmHg(charge);
  const inside = totalVapourPressure(charge, tC);
  if (inside >= outside) return 0;
  return Math.min(1, (outside - inside) / outside / 0.06);
}

/** Sidgwick's correction to 760 mm Hg, and the exact answer beside it. */
export function correctToStandard(observedC, pressureMmHg, associated) {
  const c = associated ? SIDGWICK_ASSOCIATED : SIDGWICK_NORMAL;
  return observedC + c * (STANDARD_PRESSURE - pressureMmHg) * (observedC + 273);
}

/**
 * Advance the bench by dt. Sub-stepped internally so the caller may hand it a
 * simulated minute: the thermal relaxations have time constants of a few
 * seconds, and an explicit step longer than those would oscillate rather than
 * merely be inaccurate.
 */
export function integrate(state, dtTotal) {
  const SUB = Math.max(1, Math.ceil(dtTotal / 0.25));
  let s = state;
  for (let i = 0; i < SUB; i += 1) s = { ...s, ...stepOnce(s, dtTotal / SUB) };
  return {
    bathC: s.bathC, liquidC: s.liquidC, readingC: s.readingC,
    moles: s.moles, boiledAway: s.boiledAway, superheatC: s.superheatC,
    bumped: s.bumped, dTdt: s.dTdt,
  };
}

function stepOnce(state, dt) {
  const bath = BATHS[state.bath];
  const thermo = THERMOMETERS[state.thermometer];
  const charge = { moles: state.moles };

  /* The bath. The burner drives it at the rate the student set and it stops
     dead at the bath liquid's ceiling — water goes on boiling at 100 °C and
     gets no hotter. Off the flame it drifts back towards the room. */
  let bathC;
  if (state.burnerOn) {
    bathC = Math.min(bath.maxC, state.bathC + (state.heatingRate / 60) * dt);
  } else {
    bathC = Math.max(AMBIENT_C, state.bathC - ((state.bathC - AMBIENT_C) * BATH_COOLING_PER_SECOND) * dt);
  }

  const bp = bubblePointC(charge, state.pressureMmHg);

  /*
   * The liquid. It follows the bath until it reaches its boiling point, and
   * then it stops: every further joule goes into latent heat instead of
   * temperature. That plateau is not scripted — it is what happens when the
   * heat arriving is spent boiling rather than warming.
   *
   * Unless there is nothing for it to boil ON. With no capillary and no chip
   * the liquid can be carried past its boiling point without a bubble forming,
   * because a bubble has to start somewhere. It goes on climbing until the
   * superheat is enough to nucleate on the glass itself, and then the whole
   * excess flashes off at once: the tube bumps.
   */
  const canNucleate = state.chips === 'with';
  const ceiling = canNucleate ? bp : bp + SUPERHEAT_LIMIT_C;

  let liquidC = state.liquidC + ((bathC - state.liquidC) / TUBE_LAG_SECONDS) * dt;
  let bumped = state.bumped;
  let superheatC = 0;

  if (liquidC > ceiling) {
    if (canNucleate) {
      liquidC = Math.max(bp, liquidC - ((liquidC - bp) / 0.8) * dt);
    } else {
      /* Bumping: the superheat is discharged in one go and the reading is
         thrown by it. A real and quite dangerous thing, and the reason a
         manual insists on the capillary. */
      bumped = true;
      liquidC = bp;
    }
  }
  if (!canNucleate && liquidC > bp) superheatC = liquidC - bp;

  const dTdt = (liquidC - state.liquidC) / dt;

  /*
   * Boiling off. Whatever heat arrives above what is needed to hold the liquid
   * at its boiling point leaves as vapour, and the vapour's composition is
   * Raoult's, not the liquid's — so a mixture leaves behind a residue that is
   * poorer in the volatile component and boils higher than it did a minute ago.
   */
  let moles = state.moles;
  let boiledAway = state.boiledAway;
  const drive = bathC - bp;
  if (drive > 0 && liquidC >= bp - 0.5) {
    const primary = LIQUIDS[state.liquidId];
    const dH = enthalpyVaporisation(primary, bp);
    /* Heat arriving above the plateau, divided by the latent heat it has to
       supply. The conductance is the tube's, so this is the same first-order
       coupling that sets the lag. */
    const heatW = (drive * 1.1) / TUBE_LAG_SECONDS;
    const dn = Math.min(
      (heatW * dt) / dH,
      0.08 * moles.reduce((a, c) => a + (c.volatile ? c.n : 0), 0),
    );
    if (dn > 0) {
      const y = vapourComposition({ moles }, liquidC);
      moles = moles.map((c, i) => ({ ...c, n: Math.max(c.n - dn * y[i], c.volatile ? 1e-12 : c.n) }));
      boiledAway += dn;
    }
  }

  const readingC = state.readingC + ((bathC - state.readingC) / thermo.lagSeconds) * dt;
  return { bathC, liquidC, readingC, moles, boiledAway, superheatC, bumped, dTdt };
}

/* ── What the student sees ────────────────────────────────────────────────── */

function classify(d) {
  if (d.bathCapped && d.bubblePointC > d.bathMaxC) {
    return {
      key: 'bath-too-cold',
      title: `The ${d.bathLabel.toLowerCase()} bath cannot reach it`,
      detail: `${d.liquid.label} boils at ${d.bubblePointC.toFixed(1)} °C under ${d.pressureMmHg} mm Hg, and this bath stops at ${d.bathMaxC} °C. It will never boil. Change the bath.`,
    };
  }
  if (d.bumped) {
    return {
      key: 'bumped',
      title: 'The tube bumped',
      detail: `With no capillary and no chip there was nothing for a bubble to start on, so the liquid superheated and then went off all at once. The reading it threw is worthless — and in a real laboratory so is the contents of the tube.`,
    };
  }
  if (d.superheatC > 1.5) {
    return {
      key: 'superheating',
      title: `Superheated by ${d.superheatC.toFixed(1)} °C`,
      detail: 'The liquid is above its boiling point and not boiling, because a bubble has to start somewhere. Put the capillary in before this bumps.',
    };
  }
  if (d.burnerOn && d.rapidStream) {
    return {
      key: 'rapid-stream',
      title: 'Rapid, continuous stream of bubbles',
      detail: 'This is the signal to STOP heating, not the reading. Take the flame away and watch for the moment the stream ceases — that is the boiling point, and it is sharp.',
    };
  }
  if (!d.burnerOn && d.rapidStream) {
    return {
      key: 'cooling-stream',
      title: 'Cooling — the stream is slowing',
      detail: `Vapour pressure ${d.vapourPressureMmHg.toFixed(0)} mm Hg against ${(d.pressureMmHg + d.headMmHg).toFixed(0)} outside. Watch the last bubble.`,
    };
  }
  if (!d.burnerOn && d.intrusion > 0.02 && d.observed !== null) {
    return {
      key: 'read',
      title: 'Bubbling has ceased — liquid is entering the capillary',
      detail: `Boiling point ${d.observed.toFixed(1)} °C at ${d.pressureMmHg} mm Hg; ${d.correctedC.toFixed(1)} °C corrected to 760. The vapour pressure has just fallen through atmospheric, which is the definition of the boiling point.`,
    };
  }
  if (d.slowBubbles) {
    return {
      key: 'slow-bubbles',
      title: 'A slow string of bubbles',
      detail: 'That is the air trapped in the capillary expanding, not vapour. Keep heating until the string becomes a rapid continuous stream.',
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
    detail: `Reading ${d.readingC.toFixed(1)} °C, still ${Math.max(0, d.bubblePointC - d.readingC).toFixed(0)} °C below the boiling point. Watch the capillary mouth.`,
  };
}

/** Everything the scene, the HUD and the observation table read. */
export function derive(state) {
  const liquid = LIQUIDS[state.liquidId];
  const bath = BATHS[state.bath];
  const thermo = THERMOMETERS[state.thermometer];
  const charge = { moles: state.moles };

  const bp = bubblePointC(charge, state.pressureMmHg);
  const purePointC = boilingPointC(liquid, state.pressureMmHg);
  const standardPointC = boilingPointC(liquid, STANDARD_PRESSURE);
  const head = capillaryHeadMmHg(charge);
  const vp = totalVapourPressure(charge, state.liquidC);

  const nucleation = state.chips === 'with';
  const rate = bubbleRate({
    charge, tC: state.liquidC, pressureMmHg: state.pressureMmHg, dTdt: state.dTdt, nucleation,
  });
  /* The observable, not the thermodynamic condition. The vapour pressure may
     well exceed atmospheric with no stream at all; that is superheating, and
     it is the state this apparatus exists to prevent. */
  const rapidStream = nucleation && vp >= state.pressureMmHg + head;
  const intrusion = nucleation
    ? capillaryIntrusion({ charge, tC: state.liquidC, pressureMmHg: state.pressureMmHg })
    : 0;

  const lc = thermo.leastCount;
  const round = (t) => Math.round(t / lc) * lc;

  const associated = isAssociated(liquid);
  const observed = state.observedC;
  const correctedC = observed === null ? null : correctToStandard(observed, state.pressureMmHg, associated);

  const totalVolatile = state.moles.reduce((a, c) => a + (c.volatile ? c.n : 0), 0);
  const soluteMoles = state.moles.filter((c) => !c.volatile).reduce((a, c) => a + c.n, 0);

  const d = {
    liquid,
    bathLabel: bath.label, bathMaxC: bath.maxC, bathCapped: state.bathC >= bath.maxC - 0.01,
    smoking: state.bathC > bath.smokesAboveC,
    pressureMmHg: state.pressureMmHg, headMmHg: head,
    bubblePointC: bp, purePointC, standardPointC,
    elevationC: bp - purePointC,
    pressureShiftC: purePointC - standardPointC,
    vapourPressureMmHg: vp,
    enthalpyVaporisation: enthalpyVaporisation(liquid, bp),
    troutonConstant: troutonConstant(liquid),
    associated,
    ebullioscopicConstant: ebullioscopicConstant(liquid),
    bubbleRate: rate,
    rapidStream,
    slowBubbles: !rapidStream && rate > 0.35,
    intrusion,
    bathC: state.bathC, liquidC: state.liquidC, readingC: round(state.readingC),
    thermometerLagC: state.bathC - state.readingC,
    superheatC: state.superheatC, bumped: state.bumped,
    burnerOn: state.burnerOn, chips: state.chips,
    boiledAwayPercent: (state.boiledAway / (totalVolatile + state.boiledAway || 1)) * 100,
    soluteMoleFraction: soluteMoles / (totalVolatile + soluteMoles || 1),
    onset: state.onsetC, observed, correctedC,
    leastCount: lc,
  };
  d.status = classify(d);
  return d;
}

export {
  LIQUIDS, SOLUTES, BATHS, THERMOMETERS, UNKNOWNS, NATIVE_SOLUTE,
  PURITY_MOLE_FRACTION, STANDARD_PRESSURE, AMBIENT_C, CHARGE_ML, CAPILLARY,
  STREAM_CONFIRM_SECONDS, SUPERHEAT_LIMIT_C,
} from './liquids.js';
