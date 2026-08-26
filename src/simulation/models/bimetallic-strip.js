/**
 * XI-PHY-ACT-B2 — the effect of heating on a bi-metallic strip.
 *
 * Two strips of different metals are riveted or welded face to face. Heating
 * them makes both expand, but not by the same amount: the metal with the
 * larger coefficient of linear expansion grows more. Because they are bonded
 * along their whole length they cannot slide past one another, so the only way
 * the pair can accommodate the difference is to CURVE, with the faster-growing
 * metal on the outside of the bend.
 *
 * The activity is qualitative in the syllabus wording — "observe and explain" —
 * but the deflection is perfectly measurable against a scale, and measuring it
 * is what turns the observation into physics. The tip deflection of a
 * cantilevered bimetallic strip is
 *
 *     δ = 3·L²·(α₁ − α₂)·ΔT / (2·t)      (small deflections, equal thicknesses)
 *
 * which says three things worth discovering: the bend depends on the
 * DIFFERENCE of the expansivities and not on either alone, it grows with the
 * SQUARE of the length, and it is inversely proportional to the thickness.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, linearFit, fitThroughOrigin, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B2',
  formula:
    'δ = 3·L²·(α₁ − α₂)·ΔT / (2·t);  the strip curves with the metal of larger α on the outside',
  unitSystem: 'Lengths in mm, temperature in °C, α in K⁻¹, deflection in mm',
  assumptions: [
    'The two metals are bonded along their whole length and cannot slide on each other',
    'Both strips have the same thickness, so the neutral axis lies at the join',
    'The deflection is small compared with the length, so the curvature is uniform',
    'Both metals are at the same temperature throughout',
    'The strip is clamped rigidly at one end and free at the other',
  ],
  validRange: 'Strips 40–160 mm long and 0.4–1.6 mm thick, heated 0–200 °C above room temperature',
  edgeCases: [
    'Two strips of the SAME metal have zero difference in expansivity and cannot bend at all',
    'With no temperature change there is no deflection, whatever the pair',
    'A very thick strip resists bending and the deflection becomes too small to read',
    'Cooling below the bonding temperature bends the strip the opposite way',
  ],
  expectedBehaviour: [
    'The strip bends towards the metal of SMALLER expansivity',
    'The deflection is proportional to the temperature rise',
    'Doubling the length quadruples the deflection',
    'Doubling the thickness halves the deflection',
    'An invar–brass pair bends far more than a steel–copper pair',
  ],
};

/**
 * Coefficients of linear expansion, per kelvin. Standard textbook values.
 * `alpha` is a property of the material, so it may be shown; the DIFFERENCE
 * the activity determines is what the student must extract from the graph.
 */
export const METALS = {
  invar: { label: 'Invar', alpha: 1.2e-6 },
  steel: { label: 'Steel', alpha: 12.0e-6 },
  copper: { label: 'Copper', alpha: 16.8e-6 },
  brass: { label: 'Brass', alpha: 19.0e-6 },
  aluminium: { label: 'Aluminium', alpha: 23.1e-6 },
};

/** Bonded pairs available on the bench. */
export const PAIRS = {
  invarBrass: { label: 'Invar and brass', a: 'brass', b: 'invar' },
  steelCopper: { label: 'Steel and copper', a: 'copper', b: 'steel' },
  steelBrass: { label: 'Steel and brass', a: 'brass', b: 'steel' },
  brassAlum: { label: 'Brass and aluminium', a: 'aluminium', b: 'brass' },
  // A deliberate null case: identical metals cannot bend.
  brassBrass: { label: 'Brass and brass', a: 'brass', b: 'brass' },
};

/** Scales the deflection is read against. */
export const SCALES = {
  mm1: { label: '1 mm', lc: 1.0 },
  mm05: { label: '0.5 mm', lc: 0.5 },
  mm01: { label: '0.1 mm', lc: 0.1 },
};

export const defaults = {
  pair: 'invarBrass',
  lengthMm: 100,
  thicknessMm: 0.8,
  deltaTempC: 80,
  scale: 'mm05',
};

/** Difference in expansivity between the two metals of the pair, per K. */
export function alphaDifference(inputs) {
  const p = PAIRS[inputs.pair] || PAIRS.invarBrass;
  return METALS[p.a].alpha - METALS[p.b].alpha;
}

/** True tip deflection, in mm. */
export function deflectionMm(inputs) {
  const dA = alphaDifference(inputs);
  return (3 * inputs.lengthMm * inputs.lengthMm * dA * inputs.deltaTempC) / (2 * inputs.thicknessMm);
}

/** Which metal ends up on the outside of the bend. */
export function outerMetal(inputs) {
  const p = PAIRS[inputs.pair] || PAIRS.invarBrass;
  if (METALS[p.a].alpha === METALS[p.b].alpha) return null;
  return METALS[p.a].alpha > METALS[p.b].alpha ? METALS[p.a].label : METALS[p.b].label;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const p = PAIRS[inputs.pair] || PAIRS.invarBrass;
  const dA = alphaDifference(inputs);
  const lc = (SCALES[inputs.scale] || SCALES.mm05).lc;

  if (Math.abs(dA) < 1e-12) {
    errors.push({
      field: 'pair',
      code: 'SAME_METAL',
      message: 'Both strips are the same metal, so the pair cannot bend.',
      why: 'A bimetallic strip works only because the two metals expand by DIFFERENT amounts. With the same metal on both sides they grow together, there is nothing to accommodate, and the strip simply gets longer while staying straight.',
      fix: 'Choose a pair of two different metals.',
    });
  }
  if (inputs.deltaTempC === 0) {
    errors.push({
      field: 'deltaTempC',
      code: 'NO_HEATING',
      message: 'There is no temperature change.',
      why: 'The deflection is proportional to the temperature rise. With no heating there is no differential expansion and no bend to measure.',
      fix: 'Heat the strip above room temperature.',
    });
  }
  const d = Math.abs(deflectionMm(inputs));
  if (d > 0 && d < lc * 2) {
    warnings.push({
      field: 'scale',
      code: 'DEFLECTION_TOO_SMALL',
      message: `A deflection of about ${d.toFixed(2)} mm cannot be read to any useful precision on a ${lc} mm scale.`,
      why: 'The reading would be one or two least counts, so the percentage error is enormous. Either the strip is too thick, too short, or barely heated — or the scale is too coarse for it.',
      fix: 'Use a longer or thinner strip, heat it more, or read against a finer scale.',
    });
  }
  if (inputs.thicknessMm >= 1.4) {
    warnings.push({
      field: 'thicknessMm',
      code: 'THICK_STRIP',
      message: 'A thick strip is stiff and bends very little.',
      why: 'The deflection is inversely proportional to the thickness, so doubling it halves the bend. A thick strip makes the effect hard to see even though the physics is unchanged.',
      fix: 'Use a thinner strip to make the effect clear.',
    });
  }
  if (d > inputs.lengthMm * 0.25) {
    warnings.push({
      field: 'deltaTempC',
      code: 'LARGE_DEFLECTION',
      message: `The tip has moved ${d.toFixed(1)} mm on a ${inputs.lengthMm} mm strip.`,
      why: 'The simple formula assumes the deflection is small compared with the length, so the curvature can be treated as uniform and the arc as a parabola. This far out that approximation is no longer safe.',
      fix: 'Reduce the temperature rise or use a shorter strip.',
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return { t: 0, running: true, appliedDeltaT: 0, deflection: 0 };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  // The strip warms towards the set temperature and the bend follows it.
  const target = inputs.deltaTempC;
  s.appliedDeltaT += (target - s.appliedDeltaT) * Math.min(1, dt * 2.2);
  const frac = target === 0 ? 0 : s.appliedDeltaT / target;
  s.deflection = deflectionMm(inputs) * frac;
  s.t += dt;
  return s;
}

/** One reading: the tip deflection against the scale. */
export function measure(state, inputs, seed = 1, trial = 1) {
  if (Math.abs(alphaDifference(inputs)) < 1e-12) return null;
  if (inputs.deltaTempC === 0) return null;

  const lc = (SCALES[inputs.scale] || SCALES.mm05).lc;
  const rng = makeRng(seed + trial * 23 + Math.round(inputs.deltaTempC));
  const trueD = deflectionMm(inputs);
  const reading = toLeastCount(trueD + jitter(rng, lc * 0.55), lc);

  const p = PAIRS[inputs.pair] || PAIRS.invarBrass;
  return {
    trial,
    deltaTempC: inputs.deltaTempC,
    lengthMm: inputs.lengthMm,
    thicknessMm: inputs.thicknessMm,
    deflectionMm: reading,
    perDegree: Number((reading / inputs.deltaTempC).toFixed(4)),
    pair: p.label,
  };
}

export function derive(rows, inputs = defaults) {
  const pts = rows
    .map((r) => ({ x: Number(r.deltaTempC), y: Number(r.deflectionMm) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 3) {
    return { ok: false, reason: 'Record the deflection at three or more different temperatures.' };
  }
  const distinct = new Set(pts.map((p) => p.x));
  if (distinct.size < 3) {
    return {
      ok: false,
      reason: 'Change the temperature rise between readings — repeating one temperature is the same measurement several times.',
    };
  }

  const through = fitThroughOrigin(pts);
  const free = linearFit(pts);
  const p = PAIRS[inputs.pair] || PAIRS.invarBrass;

  /*
   * The slope of deflection against temperature rise is 3L²Δα/2t, so the
   * DIFFERENCE in expansivity follows from it. This is the quantity the
   * activity actually determines — the individual α of neither metal can be
   * found from a bimetallic strip, only their difference.
   */
  const alphaDiff = (through.slope * 2 * inputs.thicknessMm)
    / (3 * inputs.lengthMm * inputs.lengthMm);

  // Did the student vary the length? δ ∝ L² is the striking check.
  const lengths = [...new Set(rows.map((r) => Number(r.lengthMm)))];
  let lengthCheck = null;
  if (lengths.length > 1) {
    lengthCheck = lengths.sort((a, b) => a - b).map((L) => {
      const sub = rows.filter((r) => Number(r.lengthMm) === L);
      const perDeg = sub.reduce((a, r) => a + Number(r.perDegree), 0) / sub.length;
      return { lengthMm: L, perDegree: sigFig(perDeg, 3) };
    });
  }

  return {
    ok: true,
    slope: sigFig(through.slope, 4),
    alphaDifference: alphaDiff,
    alphaDifferenceText: `${(alphaDiff * 1e6).toFixed(2)} × 10⁻⁶ K⁻¹`,
    accepted: alphaDifference(inputs),
    acceptedText: `${(alphaDifference(inputs) * 1e6).toFixed(2)} × 10⁻⁶ K⁻¹`,
    percentError: Number((((alphaDiff - alphaDifference(inputs)) / alphaDifference(inputs)) * 100).toFixed(2)),
    r2: free ? Number(free.r2.toFixed(4)) : null,
    intercept: free ? sigFig(free.intercept, 3) : null,
    outerMetal: outerMetal(inputs),
    pair: p.label,
    lengthMm: inputs.lengthMm,
    thicknessMm: inputs.thicknessMm,
    lengthCheck,
    lengthsCompared: lengths.length,
    n: pts.length,
    points: pts,
  };
}

export default {
  meta, defaults, METALS, PAIRS, SCALES,
  init, step, measure, derive, validate,
  alphaDifference, deflectionMm, outerMetal,
};
