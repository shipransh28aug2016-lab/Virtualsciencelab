/**
 * MODEL: Preparation of a standard solution — XI-CHE-E02 (oxalic acid) and
 * XI-CHE-E04 (sodium carbonate).
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section E.
 *
 * A "standard" solution is one whose concentration is known exactly from
 * the mass of a pure primary standard weighed out and made up to a known
 * volume — no titration is needed to know ITS concentration, which is
 * exactly why it can be used to standardise something else (E3, E5).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-E02',
  formula: 'Molarity = mass / (molar mass × volume in L); Normality = Molarity × basicity/acidity (n-factor)',
  unitSystem: 'Gram, millilitre, mol/L',
  assumptions: ['The solid is a primary standard: pure, stable, of precisely known formula, non-hygroscopic during weighing', 'All of the weighed solid is transferred into the volumetric flask (no residue left in the weighing bottle or funnel)', 'The flask is made up to the mark with the meniscus read at eye level'],
  validRange: 'Solid 1-10 g in a 100-1000 mL volumetric flask',
  edgeCases: ['Weighing by difference (before/after transfer) catches any solid left behind, which an ordinary weighing would miss', 'Using a beaker\'s "100 mL" graduation instead of a volumetric flask introduces a large volume error'],
  expectedBehaviour: ['Normality equals Molarity for oxalic acid\'s acid role only if the n-factor (basicity 2) is applied', 'The concentration calculated from mass and volume needs no titration at all — that is what "standard" means'],
};

export const SOLUTES = {
  oxalic: { label: 'Oxalic acid (H₂C₂O₄·2H₂O)', molarMass: 126.07, nFactor: 2 },
  na2co3: { label: 'Anhydrous sodium carbonate (Na₂CO₃)', molarMass: 106.0, nFactor: 2 },
};
export const FLASKS = { f100: 100, f250: 250, f500: 500, f1000: 1000 };
export const BALANCES = { digital2: 0.01, digital3: 0.001 };

export const defaults = { solute: 'oxalic', massG: 1.575, flask: 'f250', balance: 'digital2', completeTransfer: true, madeUpToMark: true };

export function soluteOf(inputs) { return SOLUTES[inputs.solute] || SOLUTES.oxalic; }
export function flaskMl(inputs) { return FLASKS[inputs.flask] || 250; }
export function effectiveMassG(inputs) { return inputs.completeTransfer ? inputs.massG : inputs.massG * 0.97; } // a little left behind if not rinsed in fully
export function effectiveVolumeMl(inputs) { return inputs.madeUpToMark ? flaskMl(inputs) : flaskMl(inputs) * 1.02; }
export function molarity(inputs) { return effectiveMassG(inputs) / (soluteOf(inputs).molarMass * (effectiveVolumeMl(inputs) / 1000)); }
export function normality(inputs) { return molarity(inputs) * soluteOf(inputs).nFactor; }

/**
 * What the preparation is AIMING at, and what must be weighed to hit it.
 *
 * "Prepare 250 mL of M/20 oxalic acid" is the whole instruction, and the
 * first thing a student does is work out the mass. The bench offered a mass
 * slider from 1 g to 10 g, said nothing about what the solution was supposed
 * to be, accepted 3 g without a murmur — and the result panel then reported
 * a perfectly correctly-calculated 0.197 N as differing from the accepted
 * value by 97%. The target was known to the experiment file and to nothing
 * the student could see.
 */
export function targetNormality(inputs) { return Number(inputs.targetNormality) || 0.1; }
export function requiredMassG(inputs) {
  const sol = soluteOf(inputs);
  const eqMass = sol.molarMass / sol.nFactor;
  return (targetNormality(inputs) * (flaskMl(inputs) / 1000)) * eqMass;
}

export function validate(inputs) {
  const warnings = [];
  if (!inputs.completeTransfer) warnings.push({ field: 'completeTransfer', code: 'INCOMPLETE_TRANSFER', message: 'Some solid may have been left behind in the weighing bottle or funnel.', why: 'Any solid not rinsed into the flask is solid that never dissolved, so the true concentration is lower than the mass weighed out implies.', fix: 'Rinse the weighing bottle and funnel with several small portions of distilled water into the flask.' });
  if (!inputs.madeUpToMark) warnings.push({ field: 'madeUpToMark', code: 'OVERFILLED', message: 'The flask was not made up exactly to the graduation mark.', why: 'A volumetric flask is calibrated to hold its stated volume only up to the etched mark; overshooting it dilutes the solution below its intended concentration.', fix: 'Add water dropwise near the mark and read the meniscus at eye level.' });
  return { ok: true, errors: [], warnings };
}
/**
 * Resolve the human-readable quantities the renderer needs to show on the
 * canvas — the full solute name, the flask's actual mL capacity, and the
 * target molarity/normality this weighing is aiming for. Renderers never
 * import models (see chemistry-new.js), so these must be computed here and
 * attached to `state`; without this the renderer had nothing but the raw
 * input KEYS to display ('oxalic', 'f100'), which is exactly why the flask
 * mark read "f100 mL mark" and the solid was labelled "oxalic weighed out"
 * instead of "Oxalic acid (H₂C₂O₄·2H₂O)". The target M/N are well-defined
 * the instant mass and flask are chosen — the whole point of a primary
 * standard is that the concentration is known from mass and volume alone,
 * before a single drop of water is added — so they are shown immediately,
 * not only after the animation finishes.
 */
function liveReadout(inputs) {
  return {
    soluteLabel: soluteOf(inputs).label,
    nFactor: soluteOf(inputs).nFactor,
    flaskMlNow: flaskMl(inputs),
    molarityNow: sigFig(molarity(inputs), 4),
    normalityNow: sigFig(normality(inputs), 4),
  };
}

export function init(inputs = defaults) {
  return { t: 0, dissolved: 0, level: 0, settled: false, swirl: 0, ...liveReadout(inputs) };
}
/**
 * Making up a standard solution. The solid dissolves as it is swirled,
 * then the flask is made up to the graduation mark -- both take time, and
 * the solution is not standard until the first has finished.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  s.dissolved = Math.min(1, s.dissolved + dt * 0.34);
  // Only make up to the mark once the solute is fully in solution.
  if (s.dissolved > 0.92) s.level = Math.min(1, s.level + dt * 0.5);
  s.swirl = (s.swirl + dt * (s.dissolved < 1 ? 2.2 : 0.4)) % (Math.PI * 2);
  s.settled = s.level >= 1;
  Object.assign(s, liveReadout(inputs));
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 311);
  const M = molarity(inputs) * (1 + jitter(rng, 0.004));
  return { trial, solute: soluteOf(inputs).label, massG: inputs.massG, volumeMl: flaskMl(inputs), molarity: sigFig(M, 4), normality: sigFig(M * soluteOf(inputs).nFactor, 4) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Prepare and record at least one standard solution.' };

  /*
   * One flask, one solution. Three rows meant three preparations, and the
   * calculation quietly reported the last of them as if the others had not
   * happened — so a student who weighed out 1.5 g, then 3 g, then 5 g was
   * shown a single confident concentration with no hint that it belonged to
   * only one of the three.
   */
  const preparations = [...new Set(rows.map((r) => `${r.solute} · ${r.massG} g in ${r.volumeMl} mL`))];
  if (preparations.length > 1) {
    return {
      ok: false,
      reason: `These are ${preparations.length} different preparations (${preparations.join('; ')}). A standard solution is one flask — clear the table and record the one you are actually using.`,
    };
  }

  const last = rows[rows.length - 1];
  const target = targetNormality(inputs);
  const need = requiredMassG(inputs);
  const got = Number(last.normality);
  return {
    ok: true,
    molarity: Number(last.molarity), normality: got, massG: Number(last.massG),
    /* The accepted value here is the concentration the practical set out to
       make, and the mass that would have made it. */
    accepted: sigFig(target, 3),
    targetNormality: sigFig(target, 3),
    requiredMassG: sigFig(need, 4),
    massErrorG: sigFig(Number(last.massG) - need, 3),
    errorPct: sigFig(((got - target) / target) * 100, 3),
    n: rows.length, points: [],
  };
}

export default { meta, defaults, SOLUTES, FLASKS, BALANCES, init, step, measure, derive, validate, soluteOf, flaskMl, effectiveMassG, effectiveVolumeMl, molarity, normality, targetNormality, requiredMassG };
