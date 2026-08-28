/**
 * MODEL: Paper chromatography — XII-CHE-E01 and XII-CHE-E02
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Category E:
 *   E1 "Separation of pigments from extracts of leaves and flowers by paper
 *       chromatography and determination of Rf values."
 *   E2 "Separation of constituents present in an inorganic mixture containing
 *       two cations only (constituents having large difference in Rf values to
 *       be provided)."
 *
 * Unit VIII / general analytical technique.
 *
 * One model serves both, because both are the same physics on different
 * mixtures. A spot of mixture is placed on paper, the paper stands in solvent,
 * and the solvent climbs by capillary action carrying the components with it.
 * Each component partitions between the moving solvent and the water held in
 * the paper fibres, and how far it travels depends on which phase it prefers:
 *
 *      Rf = distance travelled by the component / distance travelled by solvent
 *
 * Rf is a ratio of two distances, so it is DIMENSIONLESS and — this is the
 * whole reason the technique is useful — INDEPENDENT of how long the run went
 * on or how far the solvent climbed. A student who runs the paper for twice as
 * long gets bigger distances but the same Rf. The model enforces that exactly,
 * because it is the single most important property of the quantity.
 *
 * Rf is always between 0 and 1. A component with Rf = 0 has not moved at all;
 * Rf = 1 would mean it moved with the solvent front. Neither is useful, and
 * both are modelled as failures rather than as results.
 *
 * The two experiments differ in what goes wrong:
 *
 *   E1 (leaf pigments) — the classic error is letting the SOLVENT LEVEL cover
 *      the spot. The pigment then dissolves off into the reservoir instead of
 *      climbing, and the run is ruined. The second error is running the paper
 *      until the front reaches the top, so the fastest components pile up
 *      against the end and cannot be resolved.
 *
 *   E2 (two cations) — the syllabus says explicitly that the two must have a
 *      LARGE DIFFERENCE in Rf. If they are too close the spots overlap and no
 *      separation is achieved, which the model reports as a failure to
 *      separate rather than as two numbers.
 *
 * Rf values for leaf pigments in petroleum ether / acetone are the standard
 * published ones: carotene 0.95, pheophytin 0.83, xanthophyll 0.71,
 * chlorophyll a 0.65, chlorophyll b 0.45.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, percentError, toLeastCount } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-E01',
  formula: 'Rf = distance moved by the component / distance moved by the solvent front; dimensionless and between 0 and 1',
  unitSystem: 'Distances in cm; Rf dimensionless',
  assumptions: [
    'The paper is uniform, so the solvent climbs at the same rate across its width',
    'The chamber is closed and saturated with solvent vapour, so the paper does not dry as the run proceeds',
    'The spot is small and concentrated, so each component starts from effectively one point',
    'The temperature is steady, since both solubility and capillary rise depend on it',
    'The solvent front is marked immediately on removal, before any of it evaporates',
  ],
  validRange: 'Solvent front 2 to 14 cm; spotting line 1 to 3 cm above the base; run time 5 to 60 minutes',
  edgeCases: [
    'If the solvent level is above the spotting line the sample dissolves away and nothing separates',
    'If the front reaches the top of the paper the fastest components are compressed together',
    'A component that does not move at all has Rf = 0 and cannot be identified by Rf',
    'Two components with similar Rf overlap and are not resolved',
    'Rf is unchanged by running the paper for longer, which is the point of using a ratio',
  ],
  expectedBehaviour: [
    'The solvent climbs the paper by capillary action and carries the components with it',
    'A more soluble, less strongly adsorbed component travels further and has a larger Rf',
    'Rf is the same however far the solvent front is allowed to travel',
    'Two components separate cleanly only if their Rf values differ appreciably',
  ],
};

/** What is being separated. */
export const SAMPLES = {
  spinach: {
    label: 'Spinach leaf extract',
    kind: 'pigment',
    components: [
      { name: 'Carotene', rf: 0.95, colour: '#e8890c' },
      { name: 'Pheophytin', rf: 0.83, colour: '#7d7a3a' },
      { name: 'Xanthophyll', rf: 0.71, colour: '#e3c23a' },
      { name: 'Chlorophyll a', rf: 0.65, colour: '#2f7d4f' },
      { name: 'Chlorophyll b', rf: 0.45, colour: '#8fc45c' },
    ],
  },
  marigold: {
    label: 'Marigold petal extract',
    kind: 'pigment',
    components: [
      { name: 'Carotene', rf: 0.95, colour: '#e8890c' },
      { name: 'Lutein', rf: 0.62, colour: '#f0b429' },
      { name: 'Chlorophyll b', rf: 0.45, colour: '#8fc45c' },
    ],
  },
  hibiscus: {
    label: 'Hibiscus petal extract',
    kind: 'pigment',
    components: [
      { name: 'Carotene', rf: 0.95, colour: '#e8890c' },
      { name: 'Anthocyanin', rf: 0.28, colour: '#a8306b' },
    ],
  },
  /* Inorganic mixtures for E2. The syllabus requires a LARGE difference in Rf,
     and `nickelCobalt` deliberately does not have one, so the student can see
     what a failed separation looks like. */
  copperIron: {
    label: 'Cu\u00b2\u207a and Fe\u00b3\u207a',
    kind: 'cation',
    components: [
      { name: 'Fe\u00b3\u207a', rf: 0.86, colour: '#b5651d', reagent: 'Potassium ferrocyanide \u2192 blue' },
      { name: 'Cu\u00b2\u207a', rf: 0.30, colour: '#2f7fb5', reagent: 'Ammonia \u2192 deep blue' },
    ],
  },
  nickelCobalt: {
    label: 'Ni\u00b2\u207a and Co\u00b2\u207a',
    kind: 'cation',
    components: [
      { name: 'Co\u00b2\u207a', rf: 0.54, colour: '#c2427a', reagent: 'Ammonium thiocyanate \u2192 blue' },
      { name: 'Ni\u00b2\u207a', rf: 0.47, colour: '#3f9e6a', reagent: 'Dimethylglyoxime \u2192 red' },
    ],
  },
};

/** Developing solvents. */
export const SOLVENTS = {
  petAcetone: { label: 'Pet. ether : acetone 9:1', rate: 1.0, suits: 'pigment' },
  acetoneHcl: { label: 'Acetone : conc. HCl 8:2', rate: 0.85, suits: 'cation' },
  butanol: { label: 'n-Butanol : acetic acid', rate: 0.55, suits: 'cation' },
};

/** Least count of the ruler used to measure the spots. */
export const SCALES = {
  r01: { label: '1 mm', leastCount: 0.1 },
  r005: { label: '0.5 mm', leastCount: 0.05 },
};

export const defaults = {
  sample: 'spinach',
  solvent: 'petAcetone',
  scale: 'r01',
  solventLevelCm: 1.0,
  spotLineCm: 2.0,
  /* 12 minutes puts the solvent front around 10 cm, comfortably short of the
     15 cm paper. A longer default run would reach the top edge and trip the
     FRONT_AT_TOP warning before the student had done anything wrong. */
  runMinutes: 12,
};

export function sampleOf(inputs) {
  return SAMPLES[inputs.sample] || SAMPLES.spinach;
}
export function solventOf(inputs) {
  return SOLVENTS[inputs.solvent] || SOLVENTS.petAcetone;
}

/** Total usable length of the paper strip, cm. */
export const PAPER_LENGTH_CM = 15;

/**
 * How far the solvent front has climbed ABOVE THE SPOTTING LINE, in cm.
 *
 * Capillary rise slows as the column lengthens, so the front advances roughly
 * as the square root of time. It cannot pass the top of the paper.
 */
export function solventFrontCm(inputs) {
  const t = Math.max(0, inputs.runMinutes);
  const reach = 2.9 * solventOf(inputs).rate * Math.sqrt(t);
  const headroom = PAPER_LENGTH_CM - inputs.spotLineCm;
  return Math.min(reach, headroom);
}

/** True when the solvent in the trough is level with or above the spot. */
export function spotSubmerged(inputs) {
  return inputs.solventLevelCm >= inputs.spotLineCm;
}

/** True when the front has run right to the end of the paper. */
export function frontAtTop(inputs) {
  return solventFrontCm(inputs) >= (PAPER_LENGTH_CM - inputs.spotLineCm) - 0.05;
}

/** Is this solvent the right kind for this sample? */
export function solventSuits(inputs) {
  return solventOf(inputs).suits === sampleOf(inputs).kind;
}

/**
 * Where each component has reached, in cm above the spotting line.
 *
 * If the spot is submerged nothing separates at all: the sample washes off into
 * the trough. That is a failure of the run, not a set of small Rf values.
 */
export function spotPositions(inputs) {
  if (spotSubmerged(inputs)) return [];
  const front = solventFrontCm(inputs);
  const wrongSolvent = !solventSuits(inputs);
  return sampleOf(inputs).components.map((c) => ({
    ...c,
    // The wrong solvent still moves things, but compresses them badly.
    distanceCm: front * (wrongSolvent ? c.rf * 0.35 : c.rf),
  }));
}

/**
 * Are all the components resolved from one another?
 *
 * Two spots closer than about 5 mm on the paper are not separated in
 * practice. This is judged on the actual developed distance (Rf x front),
 * not on Rf alone, deliberately: real spot resolution improves with a
 * longer run even at fixed Rf, which is exactly why "run it further" is
 * standard chromatography practice, and it is also why nickelCobalt (a
 * genuinely close Rf pair, 0.54 vs 0.47) needs its own slow, cation-suited
 * solvent and a realistic run time to show the failed separation it is
 * there to demonstrate -- an unrealistically fast run can rescue even a
 * poorly-chosen pair, which is a real limitation worth letting a student
 * discover rather than hiding behind a synthetic Rf-only cutoff.
 */
export function resolved(inputs) {
  const spots = spotPositions(inputs);
  if (spots.length < 2) return true;
  const sorted = [...spots].sort((a, b) => a.distanceCm - b.distanceCm);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].distanceCm - sorted[i - 1].distanceCm < 0.5) return false;
  }
  return true;
}

/** The smallest gap between neighbouring spots, cm. */
export function closestGapCm(inputs) {
  const spots = spotPositions(inputs);
  if (spots.length < 2) return Infinity;
  const sorted = [...spots].sort((a, b) => a.distanceCm - b.distanceCm);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    min = Math.min(min, sorted[i].distanceCm - sorted[i - 1].distanceCm);
  }
  return min;
}

export function validate(inputs) {
  const errors = [];
  const warnings = [];

  if (!(inputs.runMinutes > 0)) {
    errors.push({
      field: 'runMinutes',
      code: 'NOT_RUN',
      message: 'The chromatogram has not been developed.',
      why: 'The solvent has to climb the paper before anything can separate.',
      fix: 'Leave the paper standing in the solvent for a measured time.',
    });
  }

  // The classic ruinous mistake.
  if (spotSubmerged(inputs)) {
    errors.push({
      field: 'solventLevelCm',
      code: 'SPOT_SUBMERGED',
      message: 'The solvent level is at or above the spotting line.',
      why: 'The sample dissolves straight off the paper into the trough instead of being carried up it. Nothing separates and the run is wasted.',
      fix: 'Lower the solvent so it stands well below the pencil line, or raise the line.',
    });
  }

  if (frontAtTop(inputs) && !spotSubmerged(inputs)) {
    warnings.push({
      field: 'runMinutes',
      code: 'FRONT_AT_TOP',
      message: 'The solvent front has reached the end of the paper.',
      why: 'Once the front runs off the paper its position can no longer be marked, and the fastest components pile up against the end where they cannot be told apart.',
      fix: 'Stop the run while the front is still a centimetre or two from the top.',
    });
  }

  if (!solventSuits(inputs)) {
    warnings.push({
      field: 'solvent',
      code: 'WRONG_SOLVENT',
      message: 'This solvent is not the usual choice for this sample.',
      why: sampleOf(inputs).kind === 'pigment'
        ? 'Leaf pigments are non-polar and need a largely non-polar solvent such as petroleum ether with a little acetone. An aqueous or acidic solvent barely moves them.'
        : 'Metal cations need an acidic aqueous solvent to travel as their complexes. A non-polar solvent leaves them at the origin.',
      fix: 'Choose the solvent normally used for this kind of mixture.',
    });
  }

  if (!spotSubmerged(inputs) && inputs.runMinutes > 0 && !resolved(inputs)) {
    warnings.push({
      field: 'sample',
      code: 'NOT_RESOLVED',
      message: 'Two of the spots have not separated.',
      why: `The closest pair are only ${closestGapCm(inputs).toFixed(2)} cm apart. Components whose Rf values are too similar overlap on the paper and cannot be measured separately \u2014 which is why the syllabus asks for a mixture whose components differ appreciably in Rf.`,
      fix: 'Run the paper further, or use a mixture whose components differ more in Rf.',
    });
  }

  if (inputs.spotLineCm < 1.0) {
    warnings.push({
      field: 'spotLineCm',
      code: 'LINE_TOO_LOW',
      message: 'The spotting line is very close to the bottom edge.',
      why: 'There is then almost no room to keep the solvent below it, and the slightest excess submerges the spot.',
      fix: 'Draw the line about 2 cm from the bottom.',
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function init(inputs = defaults) {
  return {
    t: 0,
    settled: false,
    finishedAt: null,
    progress: 0,
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  // The whole run is shown compressed into about two seconds.
  s.progress = Math.min(1, s.t / 1.8);
  if (s.t >= 1.8 && !s.settled) {
    s.settled = true;
    s.finishedAt = s.t;
    s.progress = 1;
  }
  /*
   * The renderer draws whatever is in `state` (it never imports a model,
   * by design), so the ACTUAL sample's components -- their real colours
   * and real Rf-scaled positions -- have to be handed to it here, scaled
   * by how far the run has progressed. Without this the renderer had no
   * way to know which sample was even running and fell back to three
   * hardcoded, fixed-position dots regardless of whether the experiment
   * was five leaf pigments, two cations, or which solvent and run time
   * had actually been chosen.
   */
  const finalFront = solventFrontCm(inputs);
  s.frontCm = finalFront * s.progress;
  s.spots = spotSubmerged(inputs)
    ? []
    : spotPositions(inputs).map((c) => ({ name: c.name, colour: c.colour, distanceCm: c.distanceCm * s.progress }));
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!validate(inputs).ok) return null;
  if (!state || !state.settled) return null;

  const spots = spotPositions(inputs);
  if (!spots.length) return null;

  const rng = makeRng(seed * 41 + trial);
  const lc = (SCALES[inputs.scale] || SCALES.r01).leastCount;
  const frontTrue = solventFrontCm(inputs);
  const front = toLeastCount(frontTrue, lc);
  if (front <= 0) return null;

  // The student measures each spot; here we record the SLOWEST and FASTEST
  // plus the count, since one row per run keeps the table readable.
  const sorted = [...spots].sort((a, b) => b.distanceCm - a.distanceCm);
  const rows = sorted.map((c) => {
    const d = toLeastCount(c.distanceCm * (1 + jitter(rng, 0.015)), lc);
    return { name: c.name, distanceCm: d, rf: d / front, accepted: c.rf };
  });

  const fastest = rows[0];

  return {
    trial,
    sample: sampleOf(inputs).label,
    frontCm: sigFig(front, 3),
    spots: rows.length,
    topComponent: fastest.name,
    topDistanceCm: sigFig(fastest.distanceCm, 3),
    topRf: sigFig(fastest.rf, 3),
    resolvedText: resolved(inputs) ? 'yes' : 'no',
    _rows: rows,
    _resolved: resolved(inputs),
    _runMinutes: inputs.runMinutes,
    _kind: sampleOf(inputs).kind,
  };
}

export function derive(rows, inputs = defaults) {
  if (!rows || rows.length < 2) {
    return {
      ok: false,
      reason: 'Develop at least two chromatograms. One run cannot show that Rf is independent of how far the solvent travelled, which is the property that makes it useful.',
    };
  }

  // Pool every component measurement across the runs.
  const all = [];
  for (const r of rows) for (const c of r._rows || []) all.push(c);

  const names = [...new Set(all.map((c) => c.name))];
  const perComponent = names.map((name) => {
    const hits = all.filter((c) => c.name === name);
    const mean = hits.reduce((s, c) => s + c.rf, 0) / hits.length;
    const accepted = hits[0].accepted;
    return {
      name,
      rf: sigFig(mean, 3),
      accepted: sigFig(accepted, 3),
      errorPct: sigFig(percentError(mean, accepted), 3),
      n: hits.length,
    };
  }).sort((a, b) => b.rf - a.rf);

  const worst = perComponent.reduce((a, b) =>
    (Math.abs(a.errorPct) >= Math.abs(b.errorPct) ? a : b));

  /*
   * The central check: Rf must be the same however far the solvent ran. Compare
   * the same component measured at two different front distances.
   */
  const fronts = [...new Set(rows.map((r) => r.frontCm))];
  let rfStable = null;
  let rfSpread = null;
  if (fronts.length >= 2) {
    const shared = names.filter((n) =>
      rows.filter((r) => (r._rows || []).some((c) => c.name === n)).length >= 2);
    if (shared.length) {
      const spreads = shared.map((n) => {
        const vals = rows
          .map((r) => (r._rows || []).find((c) => c.name === n))
          .filter(Boolean)
          .map((c) => c.rf);
        return Math.max(...vals) - Math.min(...vals);
      });
      rfSpread = sigFig(Math.max(...spreads), 3);
      rfStable = rfSpread < 0.05;
    }
  }

  const allResolved = rows.every((r) => r._resolved);

  return {
    ok: true,
    n: rows.length,
    frontsUsed: fronts.length,
    frontRange: `${Math.min(...fronts)}\u2013${Math.max(...fronts)} cm`,
    componentCount: perComponent.length,
    componentList: perComponent.map((c) => `${c.name} ${c.rf}`).join(', '),
    highest: perComponent[0].name,
    highestRf: perComponent[0].rf,
    lowest: perComponent[perComponent.length - 1].name,
    lowestRf: perComponent[perComponent.length - 1].rf,
    worstErrorPct: worst.errorPct,
    worstComponent: worst.name,
    rfStable,
    rfSpread,
    allResolved,
    kind: rows[0]._kind,
    points: [],
  };
}

export default {
  meta,
  SAMPLES,
  SOLVENTS,
  SCALES,
  PAPER_LENGTH_CM,
  defaults,
  sampleOf,
  solventOf,
  solventFrontCm,
  spotSubmerged,
  frontAtTop,
  solventSuits,
  spotPositions,
  resolved,
  closestGapCm,
  validate,
  init,
  step,
  measure,
  derive,
};
