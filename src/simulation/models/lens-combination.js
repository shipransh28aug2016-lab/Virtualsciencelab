/**
 * MODEL: Obtaining a lens combination of specified focal length — XII-PHY-ACT-B7
 * CBSE Class XII Physics (042) 2026-27, Practicals Section B, Activity 7.
 * In contact: 1/F = 1/f1 + 1/f2, i.e. P = P1 + P2 (dioptre).
 * Separated by d: 1/F = 1/f1 + 1/f2 − d/(f1 f2).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-B7',
  formula: 'P = P1 + P2; separated: 1/F = 1/f1+1/f2−d/(f1f2)',
  unitSystem: 'Centimetre for focal length; dioptre for power',
  assumptions: ['Thin lenses, so their powers simply add when in contact', 'Lenses are coaxial'],
  validRange: 'Focal lengths ±10 to ±30 cm; separation 0-5 cm',
  edgeCases: ['Two convex lenses always combine to something stronger (shorter F) than either alone', 'A concave lens is needed to reach a focal length longer than any single lens available'],
  expectedBehaviour: ['Powers add algebraically', 'A specified target focal length is met, or shown to be unreachable, from the given set'],
};

export const LENS_SET = { c10: { label: '+10 cm', f: 10 }, c15: { label: '+15 cm', f: 15 }, c20: { label: '+20 cm', f: 20 }, c30: { label: '+30 cm', f: 30 }, d20: { label: '−20 cm', f: -20 }, d30: { label: '−30 cm', f: -30 } };
export const TARGETS = { t6: 6, t857: 8.57, t12: 12, t20: 20, t60: 60 };

export const defaults = { lensA: 'c15', lensB: 'c20', target: 't857', scale: 's02', separationCm: 0 };

export function lensOf(key) { return LENS_SET[key] || LENS_SET.c15; }
export function powerD(fCm) { return 100 / fCm; }
export function combinedFocalCm(inputs) {
  const f1 = lensOf(inputs.lensA).f;
  const f2 = lensOf(inputs.lensB).f;
  const d = inputs.separationCm / 100;
  const invF = 1 / f1 + 1 / f2 - (d * 100) / (f1 * f2);
  return 1 / invF;
}
export function combinedPowerD(inputs) { return powerD(combinedFocalCm(inputs)); }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 263);
  // A real focal-length determination (by parallax or the lens formula)
  // carries measurement uncertainty; this had none at all, which made the
  // "measured power agrees with P1+P2" check below trivially perfect
  // (0% disagreement) no matter what -- not a genuine confirmation.
  const trueF = combinedFocalCm(inputs);
  const F = trueF + jitter(rng, Math.abs(trueF) * 0.02);
  return {
    trial, lensA: inputs.lensA, lensALabel: lensOf(inputs.lensA).label, lensB: inputs.lensB, lensBLabel: lensOf(inputs.lensB).label,
    combinedFocalCm: sigFig(F, 4), combinedPowerD: sigFig(powerD(F), 4), separationCm: inputs.separationCm,
  };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Try at least one lens pair.' };
  const target = TARGETS[inputs.target] || TARGETS.t857;
  const best = rows.reduce((a, b) => (Math.abs(Number(a.combinedFocalCm) - target) <= Math.abs(Number(b.combinedFocalCm) - target) ? a : b));
  const found = Math.abs(Number(best.combinedFocalCm) - target) <= target * 0.08;
  const bestErrorPct = sigFig((Math.abs(Number(best.combinedFocalCm) - target) / target) * 100, 3);

  // Powers only add exactly for lenses genuinely in contact (d=0); check
  // it against the measured (jittered) reading, not the formula it is
  // supposed to be testing.
  const contactRows = rows.filter((r) => Number(r.separationCm) === 0);
  let powerAgreementPct = null, powersAdd = false;
  if (contactRows.length) {
    const errs = contactRows.map((r) => {
      const theoreticalP = powerD(lensOf(r.lensA).f) + powerD(lensOf(r.lensB).f);
      return Math.abs((Number(r.combinedPowerD) - theoreticalP) / theoreticalP) * 100;
    });
    powerAgreementPct = sigFig(errs.reduce((a, b) => a + b, 0) / errs.length, 3);
    powersAdd = powerAgreementPct < 3;
  }

  // Which pairs from the actual lens set could reach the target, searched
  // for real rather than asserted.
  const keys = Object.keys(LENS_SET);
  const solutionList = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i; j < keys.length; j++) {
      const f1 = LENS_SET[keys[i]].f, f2 = LENS_SET[keys[j]].f;
      const F = 1 / (1 / f1 + 1 / f2);
      if (Math.abs(F - target) <= target * 0.08) solutionList.push(`${LENS_SET[keys[i]].label} + ${LENS_SET[keys[j]].label}`);
    }
  }

  return {
    ok: true, bestFocal: Number(best.combinedFocalCm), found, powersAdd, target, targetPowerD: sigFig(powerD(target), 4),
    pairsTried: new Set(rows.map((r) => `${r.lensA}|${r.lensB}`)).size,
    bestPair: `${best.lensALabel} + ${best.lensBLabel}`, bestErrorPct,
    powerAgreementPct, usedSeparation: rows.some((r) => Number(r.separationCm) > 0),
    solutionsExist: solutionList.length > 0, solutionList,
    n: rows.length, points: [],
  };
}

export default { meta, defaults, LENS_SET, TARGETS, init, step, measure, derive, validate, lensOf, powerD, combinedFocalCm, combinedPowerD };
