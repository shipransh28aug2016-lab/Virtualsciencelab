/**
 * MODEL: Conservation of energy on a double inclined plane — XI-PHY-ACT-A6
 * CBSE Class XI Physics (042) 2026-27, Practicals Section A, Activity 6.
 * A rolling solid sphere: KE = (7/10)mv²; ideally h2 = h1; friction/rolling
 * losses reduce h2 below h1, and the ratio is the fraction of energy retained.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-A6',
  formula: 'v = √(10gh/7) for a rolling sphere; ideally h2 = h1',
  unitSystem: 'SI: metre, joule (reported in millijoule)',
  assumptions: ['The sphere rolls without slipping the whole way', 'Air resistance is negligible', 'The track is rigid'],
  validRange: 'Release height 5-40 cm',
  edgeCases: ['The ball never rises above its release height, which would need energy from nowhere', 'A rough track dissipates noticeably more energy'],
  expectedBehaviour: ['h2 is always ≤ h1', 'The retained fraction is roughly constant across release heights on the same track'],
};

export const G = 9.792;
export const TRACKS = { polished: { label: 'Polished track', retain: 0.886 }, plain: { label: 'Plain track', retain: 0.80 }, rough: { label: 'Rough track', retain: 0.55 } };
export const BALLS = { steel: { label: 'Steel ball', massG: 28 }, glass: { label: 'Glass ball', massG: 16 }, brass: { label: 'Brass ball', massG: 30 } };

export const defaults = { releaseHeightCm: 20, angle1Deg: 25, angle2Deg: 25, track: 'polished', ball: 'steel' };

export function trackOf(inputs) { return TRACKS[inputs.track] || TRACKS.polished; }
export function ballOf(inputs) { return BALLS[inputs.ball] || BALLS.steel; }
export function regainedHeightCm(inputs) { return inputs.releaseHeightCm * trackOf(inputs).retain; }

export function validate(inputs) {
  const warnings = [];
  if (inputs.releaseHeightCm < 5) warnings.push({ field: 'releaseHeightCm', code: 'TOO_LOW', message: 'A very small release height gives a small, hard-to-read regained height.', why: 'Reading errors become a large fraction of a small height.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 131);
  const m = ballOf(inputs).massG / 1000;
  const h1 = inputs.releaseHeightCm / 100;
  const h2 = regainedHeightCm(inputs) / 100 + jitter(rng, 0.003);
  return {
    trial, h1: Number((h1 * 100).toFixed(2)), h2: Number((h2 * 100).toFixed(2)),
    ratio: sigFig(h2 / h1, 4), pe1: sigFig(m * G * h1 * 1000, 4), pe2: sigFig(m * G * h2 * 1000, 4),
    lostMJ: sigFig(m * G * (h1 - h2) * 1000, 4),
  };
}

export function derive(rows) {
  const ratios = rows.map((r) => Number(r.ratio)).filter(Number.isFinite);
  if (ratios.length < 3) return { ok: false, reason: 'Record at least three release heights.' };
  const m = mean(ratios);
  return { ok: true, ratio: sigFig(m, 4), percentRetained: sigFig(m * 100, 4), energyLost: sigFig(mean(rows.map((r) => Number(r.lostMJ))), 4), n: ratios.length, points: rows.map((r) => ({ x: Number(r.h1), y: Number(r.h2) })) };
}

export default { meta, defaults, TRACKS, BALLS, G, init, step, measure, derive, validate, trackOf, ballOf, regainedHeightCm };
