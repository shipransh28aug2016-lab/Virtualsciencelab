/**
 * MODEL: Bending a glass tube — XI-CHE-A02
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section A, Experiment 2
 * (Basic Laboratory Techniques).
 *
 * What this models, and what it does not
 * --------------------------------------
 * It models the APPARATUS, not the student's hands. A browser cannot judge
 * manual dexterity and this lab does not pretend to: there is no score for
 * technique and nothing here replaces supervised bench practice.
 *
 * What it can do honestly is model the physics every bench rule comes from.
 * Soda-lime glass has no melting point — it softens continuously as its
 * viscosity falls, and every instruction the student is given ("use a wing
 * top", "rotate it constantly", "take it out of the flame before you bend
 * it", "heat a wide band, not a spot") is a consequence of that curve and of
 * how heat spreads through the wall. A student who shortens the heated band
 * and watches the bend kink has learned the reason, not the rule.
 *
 * Viscosity: Vogel-Fulcher-Tammann, log10 eta(Pa.s) = A + B/(T - T0) with
 * A = -2.585, B = 4215, T0 = 263 °C. Those constants reproduce all three
 * standard fixed points of soda-lime glass to within a couple of degrees:
 *   annealing point (eta = 1e12 Pa.s)  -> 552 °C   (published ~550 °C)
 *   softening point (eta = 10^6.6)     -> 719 °C   (published ~720 °C)
 *   working point   (eta = 1e3 Pa.s)   -> 1018 °C  (published ~1000 °C)
 *
 * Bending: the overhanging end sags under its own weight. Viscous flow gives
 * a strain rate eps' = sigma/(3 eta) (Trouton ratio 3 for uniaxial flow), so
 * the curvature rate is eps'/r_o and the angle rate is that times the heated
 * length. Nothing is animated towards a target -- the bend rate falls
 * straight out of the temperature.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean, percentError, clamp, fitThroughOrigin } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-A02',
  formula: 'log₁₀η = −2.585 + 4215/(T−263); dθ/dt = σL/(3ηr₀); R = L/θ; t/t₀ = 1/(1 + r₀/R)',
  unitSystem: 'SI internally (K, m, Pa·s); bench units on screen (°C, mm, degrees)',
  assumptions: [
    'Soda-lime (soft) glass tubing, the standard school glass',
    'The heated band is at one temperature along its length (lumped capacitance)',
    'The tube sags under its own weight only; no force is applied by hand',
    'The whole heated band becomes the arc of the bend, so R = L/θ',
    'Wall thinning follows from volume conservation in the wall, not from flow along the tube',
  ],
  validRange: 'Band 10-70 mm; target angle 30-135°; rotation 0-60 rpm; glass 20-1100 °C',
  edgeCases: [
    'Below about 700 °C the viscosity is so high the tube will not bend at all — forcing it snaps the glass',
    'Above about 1000 °C it sags faster than it can be arrested, the bore closes and the tube collapses',
    'A narrow heated band gives a small bend radius and a severely thinned outer wall — the classic kink',
    'Without rotation the flame side runs far hotter than the far side and the wall bends unevenly',
    'An air-hole-closed (luminous) flame is too cool to soften the glass and deposits soot on it',
  ],
  expectedBehaviour: [
    'The bend radius is proportional to the heated band length: R = L/θ, a straight line through the origin whose slope recovers the angle',
    'A wider heated band gives a larger radius and a thicker, sounder outer wall',
    'The wing top heats a broad band; the open blue flame heats a spot however wide a band is asked for',
    'Rotating the tube closes the gap between the flame side and the far side of the wall',
  ],
};

/* ── physical constants ─────────────────────────────────────────── */
export const G = 9.792;
export const SIGMA_SB = 5.670374419e-8;      // Stefan-Boltzmann, W/(m²·K⁴)
export const RHO_GLASS = 2500;               // kg/m³, soda-lime
export const C_GLASS = 840;                  // J/(kg·K)
export const K_GLASS = 1.0;                  // W/(m·K)
export const EMISSIVITY = 0.90;
export const H_FLAME = 120;                  // W/(m²·K), flame-to-solid convection
export const H_AIR = 15;                     // W/(m²·K), natural convection
export const AMBIENT_C = 28;
export const OVERHANG_M = 0.12;              // the free end beyond the heated band

/* VFT constants for soda-lime glass, eta in Pa.s, T in °C. */
export const VFT = { A: -2.585, B: 4215, T0: 263 };

/**
 * `droopC` is how much cooler the ENDS of the heated band run than its
 * centre. A wing top lays a broad, even flat flame down the band; a bare
 * blue flame is a cone, hot in the middle and falling away sharply. That
 * profile is what decides whether a bend is a curve or a kink, so it is
 * modelled rather than asserted (see `bendRate`).
 */
export const FLAMES = {
  wingTop: { label: 'Wing top (flame spreader)', flameC: 1150, spreadMm: 70, droopC: 70, sooty: false, air: 0.9 },
  open: { label: 'Air hole open (blue)', flameC: 1500, spreadMm: 16, droopC: 260, sooty: false, air: 1 },
  luminous: { label: 'Air hole closed (luminous)', flameC: 800, spreadMm: 30, droopC: 150, sooty: true, air: 0 },
};
export const TUBES = {
  t6: { label: '6 mm tube', odMm: 6, wallMm: 1.0 },
  t8: { label: '8 mm tube', odMm: 8, wallMm: 1.2 },
  t10: { label: '10 mm tube', odMm: 10, wallMm: 1.5 },
};

export const defaults = {
  tube: 't8', flame: 'wingTop', bandLengthMm: 45, targetAngleDeg: 90,
  rotationRpm: 30, inFlame: true, pyrometerLC: 10,
};

/* ── geometry ───────────────────────────────────────────────────── */
export function tubeOf(inputs) { return TUBES[inputs.tube] || TUBES.t8; }
export function flameOf(inputs) { return FLAMES[inputs.flame] || FLAMES.wingTop; }
/** Outer and inner radius, metres. */
export function radii(inputs) {
  const t = tubeOf(inputs);
  const ro = (t.odMm / 2) / 1000;
  return { ro, ri: Math.max(1e-4, ro - t.wallMm / 1000) };
}
/**
 * How much of the tube the flame actually heats. Asking for a 60 mm band
 * from a 16 mm blue flame does not produce one -- which is the whole reason
 * a wing top exists.
 */
export function heatedLengthM(inputs) {
  return Math.min(inputs.bandLengthMm, flameOf(inputs).spreadMm) / 1000;
}

/**
 * Net heat flux per unit area into glass at `tempC`, W/m².
 *
 * `exposure` is the fraction of the time this part of the wall faces the
 * flame — 1 for a tube held still, 0.5 for one rotated steadily. What it
 * faces decides what it radiates AGAINST: a tube sitting inside the flame
 * exchanges radiation with the combustion gases around it, not with the
 * room. Treating it as radiating to a 28 °C room while it sits in a 1150 °C
 * flame is what pinned the earlier version of this model at 573 °C, well
 * below the softening point, so a wing top could never soften the glass.
 */
export function netFluxWm2(tempC, exposure, flameC) {
  const Tk = tempC + 273.15, Fk = flameC + 273.15, Ak = AMBIENT_C + 273.15;
  const inFlame = H_FLAME * (flameC - tempC) + EMISSIVITY * SIGMA_SB * (Fk ** 4 - Tk ** 4);
  const inAir = -H_AIR * (tempC - AMBIENT_C) - EMISSIVITY * SIGMA_SB * (Tk ** 4 - Ak ** 4);
  return exposure * inFlame + (1 - exposure) * inAir;
}

/**
 * The temperature this flame can hold the glass at, where heat in balances
 * heat out. Bisection on `netFluxWm2`, which is monotonically decreasing in
 * temperature, so the root is unique. validate() asks this rather than
 * comparing the flame temperature against a hand-picked margin.
 */
export function equilibriumTempC(inputs) {
  const flameC = flameOf(inputs).flameC;
  const exposure = 1 - 0.5 * clamp(inputs.rotationRpm / 30, 0, 1);
  let lo = AMBIENT_C, hi = flameC;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (netFluxWm2(mid, exposure, flameC) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Viscosity of soda-lime glass at T °C, in Pa·s (VFT). */
export function viscosity(tempC) {
  const denom = tempC - VFT.T0;
  if (denom <= 1) return 1e20;                       // below T0 the glass is rigid
  return 10 ** (VFT.A + VFT.B / denom);
}
/** The three standard fixed points, inverted from the same curve. */
export function tempForViscosity(etaPaS) {
  return VFT.T0 + VFT.B / (Math.log10(etaPaS) - VFT.A);
}
export const SOFTENING_C = tempForViscosity(10 ** 6.6);
export const WORKING_C = tempForViscosity(1e3);
export const ANNEALING_C = tempForViscosity(1e12);

/**
 * Bending stress in the outer fibre from the weight of the overhanging end.
 * M = ρ·A·g·ℓ²/2 for a uniform cantilever; σ = M·r₀/I with I the second
 * moment of a hollow circular section.
 */
export function bendingStressPa(inputs) {
  const { ro, ri } = radii(inputs);
  const area = Math.PI * (ro * ro - ri * ri);
  const I = (Math.PI / 4) * (ro ** 4 - ri ** 4);
  const moment = RHO_GLASS * area * G * (OVERHANG_M ** 2) / 2;
  return (moment * ro) / I;
}

/**
 * Angular bending rate, rad/s, with `tempC` the temperature at the CENTRE
 * of the heated band.
 *
 * The band is not isothermal along its length. Curvature rates add along
 * the tube, so the angle rate is the integral of the compliance:
 *
 *     dθ/dt = (σ / 3r₀) · ∫ dx / η(T(x))
 *
 * and because η is exponential in T, the cooler ends contribute almost
 * nothing — they stiffen the band and slow the whole bend. Taking the band
 * as uniformly at its peak temperature (as this model first did) overstates
 * the rate by about three times and makes the workable window far too
 * narrow to hit. The profile is parabolic, falling by the flame's `droopC`
 * at the ends, and is integrated over 9 samples by the trapezium rule.
 */
export function bendRate(tempC, inputs) {
  const { ro } = radii(inputs);
  const L = heatedLengthM(inputs);
  const droop = flameOf(inputs).droopC;
  const N = 9;
  let compliance = 0;
  for (let i = 0; i < N; i++) {
    const u = -1 + (2 * i) / (N - 1);            // −1 … +1 across the band
    const w = i === 0 || i === N - 1 ? 0.5 : 1;  // trapezium weights
    compliance += (w / viscosity(tempC - droop * u * u)) * (L / (N - 1));
  }
  return (bendingStressPa(inputs) * compliance) / (3 * ro);
}

/* ── geometry of the finished bend ──────────────────────────────── */
/** Centreline radius of the bend: the heated band becomes the arc. */
export function bendRadiusMm(angleDeg, inputs) {
  const theta = (angleDeg * Math.PI) / 180;
  if (theta <= 1e-4) return Infinity;
  return (heatedLengthM(inputs) * 1000) / theta;
}
/**
 * Outer-wall thickness as a fraction of the original, from volume
 * conservation in the wall: the outer fibre is stretched by ε = r₀/R, so the
 * wall there thins to t₀/(1 + ε). Uneven heating around the circumference
 * thins it further, because the softer side takes more of the strain.
 */
export function wallRatio(angleDeg, circDeltaC, inputs) {
  const R = bendRadiusMm(angleDeg, inputs);
  if (!Number.isFinite(R)) return 1;
  const { ro } = radii(inputs);
  const strain = (ro * 1000) / R;
  const even = clamp(1 - circDeltaC / 260, 0.3, 1);   // 260 °C across the wall ruins it
  return clamp((1 / (1 + strain)) * even, 0, 1);
}

/**
 * How the bend turned out. The target angle is needed, not just the wall:
 * on a luminous flame the glass sits near 656 °C, where its viscosity is
 * 1.4 x 10^8 Pa.s, and over four minutes it creeps about 6 degrees. The wall
 * is barely strained, so judging by wall thickness alone called that a sound
 * bend. It is not a bend at all -- the tube never softened.
 */
export function verdictOf(state, inputs = defaults) {
  if (state.collapsed) return 'collapsed';
  const target = inputs.targetAngleDeg || defaults.targetAngleDeg;
  if (state.angleDeg < Math.max(5, 0.5 * target)) return 'notSoftened';
  const w = state.wallRatio;
  if (w < 0.6) return 'kinked';
  if (state.circDeltaC > 120) return 'uneven';
  if (w < 0.8) return 'thinned';
  return 'good';
}
export const VERDICTS = {
  good: 'Sound bend — round bore, even wall',
  thinned: 'Bend made, but the outer wall is thin',
  kinked: 'Kinked — the bend radius was far too small',
  uneven: 'Bent out of true — one side of the wall was much hotter',
  collapsed: 'Collapsed — the glass was too fluid and the bore closed',
  notSoftened: 'Never softened enough to bend',
};

/* ── validation ─────────────────────────────────────────────────── */
export function validate(inputs) {
  const errors = [], warnings = [];
  const f = flameOf(inputs);
  const eq = equilibriumTempC(inputs);
  if (eq < SOFTENING_C) {
    errors.push({
      field: 'flame', code: 'FLAME_TOO_COOL',
      message: 'This flame cannot soften the glass, however long you hold it there.',
      why: `Heat in balances heat out at about ${Math.round(eq)} °C, and soda-lime glass does not soften until about ${Math.round(SOFTENING_C)} °C. A luminous flame is cool because the air hole is shut, and it deposits soot on the tube as well.`,
      fix: 'Open the air hole, and fit a wing top to spread the flame.',
    });
  }
  if (inputs.bandLengthMm > f.spreadMm + 1) {
    warnings.push({
      field: 'bandLengthMm', code: 'FLAME_TOO_NARROW',
      message: `This flame heats only about ${f.spreadMm} mm, however wide a band you ask for.`,
      why: 'A narrow heated band becomes a short arc, so the bend radius is small and the outer wall is stretched thin — the classic kink.',
      fix: 'Fit a wing top, which spreads the flame across the whole band.',
    });
  }
  const R = bendRadiusMm(inputs.targetAngleDeg, inputs);
  if (Number.isFinite(R) && R < 3 * tubeOf(inputs).odMm) {
    warnings.push({
      field: 'bandLengthMm', code: 'RADIUS_TOO_TIGHT',
      message: 'The bend radius will be less than three tube diameters.',
      why: `Heating ${Math.round(heatedLengthM(inputs) * 1000)} mm and bending it through ${inputs.targetAngleDeg}° gives a radius of about ${R.toFixed(0)} mm on a ${tubeOf(inputs).odMm} mm tube. The outer wall has to stretch by r₀/R to get round it.`,
      fix: 'Heat a longer band, or bend through a smaller angle.',
    });
  }
  if (inputs.rotationRpm < 10) {
    warnings.push({
      field: 'rotationRpm', code: 'NOT_ROTATING',
      message: 'The tube is barely being rotated.',
      why: 'Only the side facing the flame is heated. Glass conducts heat poorly (k ≈ 1 W/m·K), so the far side stays hundreds of degrees cooler and the wall bends unevenly.',
      fix: 'Roll the tube steadily between finger and thumb, about 30 rpm.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

/* ── state ──────────────────────────────────────────────────────── */
/**
 * `heating` is the burner, and it is the run flag main.js recognises, so the
 * primary button reads "Light the burner" like every other heated bench in
 * this application. `inputs.inFlame` is a separate thing: whether the tube is
 * being held in that flame. Both have to be true for the glass to gain heat,
 * which is exactly the distinction the experiment turns on — the burner stays
 * lit while the tube comes out to be bent.
 */
export function init(inputs = defaults) {
  return {
    t: 0, heating: false,
    hotC: AMBIENT_C, coldC: AMBIENT_C, meanC: AMBIENT_C, circDeltaC: 0,
    angleDeg: 0, wallRatio: 1, radiusMm: Infinity,
    soot: 0, collapsed: false, frozen: true, flameTime: 0, finishedAt: null,
    bendTempC: null, reheats: 0, wasSoft: false,
  };
}

/** Rate of angle change is capped only to keep one frame from stepping past
 *  a whole bend; exceeding the cap IS the collapse the student must avoid. */
const MAX_RATE_RAD_S = 3.0;

export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (s.finishedAt) return s;

  const { ro, ri } = radii(inputs);
  const L = heatedLengthM(inputs);
  const f = flameOf(inputs);
  const inFlame = !!s.heating && !!inputs.inFlame;

  /* Heat balance on the heated band, split into the side facing the flame
     and the far side. Rotation decides how the flame's heat is shared
     between them; conduction round the wall then closes the gap. */
  const wallArea = Math.PI * (ro * ro - ri * ri);
  const massHalf = (RHO_GLASS * wallArea * L) / 2;
  const capacity = Math.max(1e-9, massHalf * C_GLASS);
  const areaHalf = Math.PI * ro * L;                     // half the circumference

  const evenness = clamp(inputs.rotationRpm / 30, 0, 1); // 30 rpm shares it fully
  const shareHot = 1 - 0.5 * evenness;                   // 1.0 still, 0.5 rotating
  const shareCold = 1 - shareHot;

  const flux = (tempC, share) => areaHalf * netFluxWm2(tempC, inFlame ? share : 0, f.flameC);
  // Conduction around the wall, over a path half the circumference long.
  const path = Math.max(1e-4, Math.PI * (ro + ri) / 2);
  const qCond = (K_GLASS * wallArea * (s.hotC - s.coldC)) / path;

  s.hotC += ((flux(s.hotC, shareHot) - qCond) * dt) / capacity;
  s.coldC += ((flux(s.coldC, shareCold) + qCond) * dt) / capacity;
  s.hotC = clamp(s.hotC, AMBIENT_C, f.flameC);
  s.coldC = clamp(s.coldC, AMBIENT_C, f.flameC);
  s.meanC = (s.hotC + s.coldC) / 2;
  s.circDeltaC = Math.abs(s.hotC - s.coldC);

  if (inFlame) {
    s.flameTime += dt;
    if (f.sooty) s.soot = clamp(s.soot + dt * 0.25, 0, 1);
  }

  /* The bend. Nothing is animated towards the target: the rate is read off
     the viscosity, and the viscosity is read off the temperature. */
  if (!s.collapsed && s.angleDeg < inputs.targetAngleDeg) {
    const rate = bendRate(s.meanC, inputs);              // rad/s
    if (rate > MAX_RATE_RAD_S) {
      // Too fluid to arrest: the bore closes before the angle can be held.
      s.collapsed = true;
      s.angleDeg = Math.min(180, s.angleDeg + 40);
      s.wallRatio = 0.2;
      s.bendTempC = s.bendTempC ?? s.meanC;
    } else if (rate > 1e-4) {
      /* The glass creeps imperceptibly for a long while before it is really
         bending, so the temperature worth recording is the one at which it
         started to move at a visible rate -- about a degree a second -- not
         the first instant the viscosity allowed any flow at all. */
      if (s.bendTempC === null && rate > 0.0175) s.bendTempC = s.meanC;
      s.angleDeg = Math.min(inputs.targetAngleDeg, s.angleDeg + (rate * dt * 180) / Math.PI);
    }
  }
  if (!s.collapsed) {
    s.wallRatio = wallRatio(s.angleDeg, s.circDeltaC, inputs);
  }
  s.radiusMm = bendRadiusMm(s.angleDeg, inputs);

  /* Whether the shape can still change is a property of the glass right
     now, not a latch. Below the annealing point it is set; put it back in
     the flame and it softens again and the bend goes on from where it
     stopped. That is not a convenience -- a 90° bend in an 8 mm tube
     genuinely takes two or three heats, because the band loses its heat in
     a second or two once it leaves the flame, and counting those reheats is
     part of what the student is learning. */
  const soft = s.meanC >= ANNEALING_C;
  if (soft && !s.wasSoft) { if (s.angleDeg > 0.5) s.reheats += 1; s.wasSoft = true; }
  if (!soft) s.wasSoft = false;
  s.frozen = !soft;

  const done = s.collapsed || s.angleDeg >= inputs.targetAngleDeg - 0.05;
  if (done && s.frozen) s.finishedAt = s.finishedAt ?? s.t;

  return s;
}

/* ── one row of the observation table ───────────────────────────── */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (state.angleDeg < 1 && !state.collapsed) return null;   // nothing has happened yet
  const rng = makeRng(seed + trial * 181);
  const lc = inputs.pyrometerLC || 10;
  const bendTemp = state.bendTempC ?? state.meanC;
  const angle = Number((state.angleDeg + jitter(rng, 0.8)).toFixed(1));
  const R = bendRadiusMm(angle, inputs);
  return {
    trial,
    bandMm: Number((heatedLengthM(inputs) * 1000).toFixed(1)),
    bendTempC: Math.round((bendTemp + jitter(rng, lc * 0.4)) / lc) * lc,
    angleDeg: angle,
    radiusMm: Number.isFinite(R) ? Number(R.toFixed(1)) : 0,
    wallRatio: Number(state.wallRatio.toFixed(3)),
    reheats: state.reheats,
    verdict: VERDICTS[verdictOf(state, inputs)],
  };
}

/* ── the result the experiment exists to produce ────────────────── */
export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => Number(r.radiusMm) > 0 && Number(r.angleDeg) > 5);
  if (usable.length < 3) {
    return { ok: false, reason: 'Bend the tube at three or more heated band lengths, so the radius can be plotted against the band.' };
  }
  /* R = L/θ, so R against L is a straight line through the origin whose
     slope is 1/θ. Fitting it recovers the angle actually bent through --
     an independent check on the protractor reading. */
  const pts = usable.map((r) => ({ x: Number(r.bandMm), y: Number(r.radiusMm) }));
  const fit = fitThroughOrigin(pts);
  const angleFromSlope = fit.slope > 0 ? (180 / Math.PI) / fit.slope : 0;
  const angleMeasured = mean(usable.map((r) => Number(r.angleDeg)));
  const meanWall = mean(usable.map((r) => Number(r.wallRatio)));
  const sound = usable.filter((r) => Number(r.wallRatio) >= 0.8).length;

  return {
    ok: true,
    n: usable.length,
    slope: sigFig(fit.slope, 4),
    r2: Number(fit.r2.toFixed(4)),
    angleFromSlope: sigFig(angleFromSlope, 4),
    angleMeasured: sigFig(angleMeasured, 4),
    targetAngleDeg: inputs.targetAngleDeg,
    percentError: sigFig(percentError(angleFromSlope, angleMeasured), 3),
    meanWallRatio: sigFig(meanWall, 3),
    soundBends: sound,
    minRadiusForSoundMm: sigFig(3 * tubeOf(inputs).odMm, 3),
    softeningC: sigFig(SOFTENING_C, 4),
    workingC: sigFig(WORKING_C, 4),
    points: pts,
  };
}

export default {
  meta, defaults, FLAMES, TUBES, VFT, VERDICTS, G,
  init, step, measure, derive, validate,
  tubeOf, flameOf, radii, heatedLengthM, viscosity, tempForViscosity,
  netFluxWm2, equilibriumTempC, bendingStressPa, bendRate, bendRadiusMm, wallRatio, verdictOf,
  SOFTENING_C, WORKING_C, ANNEALING_C,
};
