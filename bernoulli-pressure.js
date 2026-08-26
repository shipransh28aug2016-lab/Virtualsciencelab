/**
 * XI-PHY-ACT-B7 — the decrease in pressure with increase in the velocity of a
 * fluid.
 *
 * Water flows through a tube that narrows in the middle. The same volume must
 * pass every section each second, so where the tube is narrow the water must
 * move faster:
 *
 *     A₁v₁ = A₂v₂        (the equation of continuity)
 *
 * Speeding the water up takes energy, and in a horizontal tube the only source
 * of that energy is the pressure. So where the flow is fast the pressure is
 * LOW, and a manometer tapped into the throat stands lower than one tapped
 * into the wide section:
 *
 *     p₁ + ½ρv₁² = p₂ + ½ρv₂²      (Bernoulli, horizontal)
 *
 * so the pressure difference is ½ρ(v₂² − v₁²), which is what the manometer
 * measures. Because it depends on the SQUARE of the velocity, doubling the
 * flow rate quadruples the pressure drop — a striking and easily checked
 * result.
 *
 * This is the counter-intuitive part of fluid mechanics: students expect a
 * constriction to squeeze the water and RAISE the pressure there. It does the
 * opposite, and that is exactly why the activity is set.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B7',
  formula:
    'A₁v₁ = A₂v₂;  p₁ + ½ρv₁² = p₂ + ½ρv₂²;  Δp = ½ρ(v₂² − v₁²) = ρ·g·h_manometer',
  unitSystem: 'Flow rate in cm³/s, areas in cm², velocities in m/s, pressure difference in mm of water',
  assumptions: [
    'The flow is steady and streamline, not turbulent',
    'The liquid is incompressible, so the volume flow rate is the same at every section',
    'The tube is horizontal, so no height term enters Bernoulli\'s equation',
    'Viscous losses along the short working section are small compared with the pressure change',
    'The manometer tappings are flush with the wall and do not disturb the flow',
  ],
  validRange: 'Flow rates of 0–300 cm³/s through throats of 0.20–1.00 cm² bore',
  edgeCases: [
    'With no flow the velocity is zero everywhere and the two manometer arms stand level',
    'A throat the same size as the tube produces no speed-up and no pressure difference',
    'Too high a flow rate makes the flow turbulent and Bernoulli no longer applies cleanly',
    'A very narrow throat can drop the pressure below zero gauge and draw in air',
  ],
  expectedBehaviour: [
    'The pressure at the throat is LOWER than in the wide section, not higher',
    'The pressure difference is proportional to the square of the flow rate',
    'A narrower throat gives a larger pressure drop at the same flow rate',
    'With no flow the manometer arms stand level',
    'A plot of Δp against the square of the flow rate is a straight line through the origin',
  ],
};

export const G = 9.792;
/** Density of water, kg/m³. */
export const RHO = 997;

/** Bore of the wide section of the tube, in cm². */
export const WIDE_AREA_CM2 = 3.14;

/** Interchangeable throats. */
export const THROATS = {
  t100: { label: '1.00 cm²', areaCm2: 1.00 },
  t060: { label: '0.60 cm²', areaCm2: 0.60 },
  t035: { label: '0.35 cm²', areaCm2: 0.35 },
  t020: { label: '0.20 cm²', areaCm2: 0.20 },
  // A null case: no constriction at all, so no speed-up and no pressure drop.
  tNone: { label: 'No constriction', areaCm2: WIDE_AREA_CM2 },
};

/** Manometer liquids. Water is sensitive; mercury reads a small height. */
export const MANOMETERS = {
  water: { label: 'Water manometer', densityRatio: 1.0, lc: 1.0 },
  mercury: { label: 'Mercury manometer', densityRatio: 13.6, lc: 1.0 },
};

/** Reynolds number above which the flow is no longer reliably streamline. */
export const RE_TURBULENT = 4000;

/** Usable height of each manometer limb, in mm. */
export const MANOMETER_LIMB_MM = 150;

/*
 * Flow rates are in the range that keeps the flow STREAMLINE, which is what
 * Bernoulli's equation as used here requires.
 *
 * An earlier draft ran at 40–300 cm³/s. Through a 0.35 cm² throat that is over
 * 2.8 m/s and a Reynolds number above 20 000, so the TURBULENT warning fired
 * at every single setting — a warning that is always on tells the student
 * nothing. Streamline flow through these throats needs roughly 5–25 cm³/s,
 * and the bench is scaled to that: the warning now marks the genuine boundary
 * where the assumption fails, which is the point of having it.
 */
export const defaults = {
  throat: 't035',
  manometer: 'water',
  flowRateCm3PerS: 12,
};

/** Velocity in the wide section, in m/s. */
export function wideVelocity(inputs) {
  return (inputs.flowRateCm3PerS / WIDE_AREA_CM2) / 100;
}

/** Velocity at the throat, in m/s. */
export function throatVelocity(inputs) {
  const th = THROATS[inputs.throat] || THROATS.t035;
  return (inputs.flowRateCm3PerS / th.areaCm2) / 100;
}

/** Pressure difference between wide section and throat, in pascal. */
export function pressureDropPa(inputs) {
  const v1 = wideVelocity(inputs);
  const v2 = throatVelocity(inputs);
  return 0.5 * RHO * (v2 * v2 - v1 * v1);
}

/** The same difference expressed as a manometer height, in mm of its liquid. */
export function manometerHeightMm(inputs) {
  const man = MANOMETERS[inputs.manometer] || MANOMETERS.water;
  const dp = pressureDropPa(inputs);
  return (dp / (RHO * man.densityRatio * G)) * 1000;
}

/** Reynolds number at the throat, the test of streamline flow. */
export function reynoldsAtThroat(inputs) {
  const th = THROATS[inputs.throat] || THROATS.t035;
  const d = 2 * Math.sqrt(th.areaCm2 / Math.PI) / 100;   // hydraulic diameter, m
  const eta = 1.002e-3;                                   // water at 20 °C
  return (RHO * throatVelocity(inputs) * d) / eta;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const th = THROATS[inputs.throat] || THROATS.t035;

  if (inputs.flowRateCm3PerS === 0) {
    errors.push({
      field: 'flowRateCm3PerS',
      code: 'NO_FLOW',
      message: 'There is no flow through the tube.',
      why: 'With the water at rest the velocity is zero everywhere, so there is no difference in velocity and no difference in pressure. Both manometer arms stand at the same level.',
      fix: 'Open the tap to start the water flowing.',
    });
  }
  if (Math.abs(th.areaCm2 - WIDE_AREA_CM2) < 1e-9) {
    errors.push({
      field: 'throat',
      code: 'NO_CONSTRICTION',
      message: 'This section is the same bore as the rest of the tube.',
      why: 'The pressure falls because the water is forced to speed up. With no constriction the velocity is the same at both tappings, so by Bernoulli the pressures are equal too and nothing can be observed.',
      fix: 'Fit a throat narrower than the tube.',
    });
  }
  const re = reynoldsAtThroat(inputs);
  if (re > RE_TURBULENT) {
    warnings.push({
      field: 'flowRateCm3PerS',
      code: 'TURBULENT',
      message: `The Reynolds number at the throat is about ${Math.round(re)}, so the flow is turbulent.`,
      why: 'Bernoulli\'s equation as used here assumes steady streamline flow along a stream tube. In turbulent flow energy is dissipated in eddies, the manometer reading fluctuates, and the measured pressure drop exceeds the simple prediction.',
      fix: 'Reduce the flow rate, or use a wider throat.',
    });
  }
  const h = manometerHeightMm(inputs);
  /*
   * Cavitation was checked against one atmosphere, which at these streamline
   * flow rates can never be approached — an unreachable warning. What DOES
   * limit the apparatus is the height of the manometer tube. The limbs on this
   * bench are 150 mm of scale, and the narrow throat at a high flow rate
   * exceeds that — a threshold of a metre could never be reached from any
   * setting the widgets offer, which would have made the warning dead code.
   */
  if (h > MANOMETER_LIMB_MM) {
    warnings.push({
      field: 'throat',
      code: 'OFF_THE_MANOMETER',
      message: `A drop of ${h.toFixed(0)} mm exceeds the ${MANOMETER_LIMB_MM} mm limb of the manometer.`,
      why: 'The manometer limb is only so tall. A narrow throat at a high flow rate drops the pressure so far that the water is drawn right out of the limb, and no reading can be taken.',
      fix: 'Use a wider throat, a lower flow rate, or a mercury manometer.',
    });
  }
  const man = MANOMETERS[inputs.manometer] || MANOMETERS.water;
  if (h > 0 && h < man.lc * 3) {
    warnings.push({
      field: 'manometer',
      code: 'READING_TOO_SMALL',
      message: `A manometer reading of only ${h.toFixed(1)} mm is hard to measure.`,
      why: 'A dense manometer liquid such as mercury moves only a thirteenth as far as water for the same pressure difference. That is useful for large pressures but wastes resolution on small ones.',
      fix: 'Use a water manometer, a narrower throat, or a higher flow rate.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return { t: 0, running: true, flow: 0, heightMm: 0, settled: false };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.flow += (inputs.flowRateCm3PerS - s.flow) * Math.min(1, dt * 3);
  const frac = inputs.flowRateCm3PerS === 0 ? 0 : s.flow / inputs.flowRateCm3PerS;
  // Height follows the square of the flow, so it lags then settles.
  s.heightMm = manometerHeightMm(inputs) * frac * frac;
  s.settled = Math.abs(manometerHeightMm(inputs) - s.heightMm) < 0.4;
  s.t += dt;
  return s;
}

/** One reading: the difference in manometer levels at this flow rate. */
export function measure(state, inputs, seed = 1, trial = 1) {
  const th = THROATS[inputs.throat] || THROATS.t035;
  if (inputs.flowRateCm3PerS === 0) return null;
  if (Math.abs(th.areaCm2 - WIDE_AREA_CM2) < 1e-9) return null;

  const man = MANOMETERS[inputs.manometer] || MANOMETERS.water;
  const rng = makeRng(seed + trial * 43 + inputs.flowRateCm3PerS);
  // Turbulence makes the reading visibly unsteady.
  const turbulent = reynoldsAtThroat(inputs) > RE_TURBULENT;
  const noise = man.lc * (turbulent ? 2.6 : 0.45);
  const reading = toLeastCount(manometerHeightMm(inputs) + jitter(rng, noise), man.lc);

  const q = inputs.flowRateCm3PerS;
  return {
    trial,
    flowRateCm3PerS: q,
    flowSquared: Number((q * q).toFixed(0)),
    wideVelocity: Number(wideVelocity(inputs).toFixed(3)),
    throatVelocity: Number(throatVelocity(inputs).toFixed(3)),
    manometerMm: reading,
    pressureDropPa: Number((reading / 1000 * RHO * man.densityRatio * G).toFixed(1)),
    throat: th.label,
  };
}

export function derive(rows, inputs = defaults) {
  const pts = rows
    .map((r) => ({ x: Number(r.flowSquared), y: Number(r.pressureDropPa) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) {
    return { ok: false, reason: 'Record the manometer reading at three or more different flow rates.' };
  }
  const distinct = new Set(pts.map((p) => p.x));
  if (distinct.size < 3) {
    return {
      ok: false,
      reason: 'Change the flow rate between readings — repeating one rate is the same measurement several times.',
    };
  }

  const through = fitThroughOrigin(pts);
  const free = linearFit(pts);
  const th = THROATS[inputs.throat] || THROATS.t035;

  /*
   * Δp = ½ρ(1/A₂² − 1/A₁²)·Q², so the slope of Δp against Q² gives the density
   * of the flowing liquid once the two areas are known. Recovering ρ is the
   * quantitative check that Bernoulli's equation actually describes the data.
   */
  const a1 = WIDE_AREA_CM2 / 1e4;
  const a2 = th.areaCm2 / 1e4;
  const geom = 0.5 * (1 / (a2 * a2) - 1 / (a1 * a1)) * 1e-12;  // Q² in (cm³/s)² → (m³/s)²
  const rhoFromSlope = through.slope / geom;

  // Linear in Q rather than Q²? Compare the two fits.
  const linPts = rows
    .map((r) => ({ x: Number(r.flowRateCm3PerS), y: Number(r.pressureDropPa) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const linFit = linearFit(linPts);

  const throats = [...new Set(rows.map((r) => r.throat))];
  let throatCheck = null;
  if (throats.length > 1) {
    throatCheck = throats.map((name) => {
      const sub = rows.filter((r) => r.throat === name);
      return {
        name,
        meanDrop: sigFig(sub.reduce((a, r) => a + Number(r.manometerMm), 0) / sub.length, 4),
        n: sub.length,
      };
    });
  }

  const maxRe = Math.max(...rows.map((r) => reynoldsAtThroat({
    ...inputs, flowRateCm3PerS: Number(r.flowRateCm3PerS),
  })));

  return {
    ok: true,
    slope: through.slope,
    densityFromSlope: sigFig(rhoFromSlope, 4),
    acceptedDensity: RHO,
    percentError: Number((((rhoFromSlope - RHO) / RHO) * 100).toFixed(2)),
    r2: free ? Number(free.r2.toFixed(4)) : null,
    r2Linear: linFit ? Number(linFit.r2.toFixed(4)) : null,
    squareLawBetter: !!(free && linFit && free.r2 > linFit.r2),
    maxThroatVelocity: sigFig(Math.max(...rows.map((r) => Number(r.throatVelocity))), 3),
    maxWideVelocity: sigFig(Math.max(...rows.map((r) => Number(r.wideVelocity))), 3),
    maxReynolds: Math.round(maxRe),
    streamline: maxRe <= RE_TURBULENT,
    throat: th.label,
    throatAreaCm2: th.areaCm2,
    wideAreaCm2: WIDE_AREA_CM2,
    throatCheck,
    throatsCompared: throats.length,
    n: pts.length,
    points: pts,
  };
}

export default {
  meta, defaults, THROATS, MANOMETERS, G, RHO, WIDE_AREA_CM2, RE_TURBULENT, MANOMETER_LIMB_MM,
  init, step, measure, derive, validate,
  wideVelocity, throatVelocity, pressureDropPa, manometerHeightMm, reynoldsAtThroat,
};
