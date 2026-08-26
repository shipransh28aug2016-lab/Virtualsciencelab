/**
 * MODEL: Role of emulsifying agents in stabilising an emulsion — XII-CHE-A03
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section A, Experiment 3.
 * Stokes' law: v = 2r²Δρg/9η, so separation time t = h/v ∝ η/(r²Δρ). An
 * emulsifier shrinks the droplet radius, and since t ∝ 1/r², a modest drop
 * in radius buys a large increase in stability.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-A03',
  formula: 't = h/v, v = 2r²Δρg/9η, so t ∝ η/(r²Δρ)',
  unitSystem: 'Seconds',
  assumptions: ['Droplets are small enough for Stokes\' law to describe their rise/fall', 'The emulsifier is well mixed in before shaking', 'The dilution test\'s "which phase mixes freely" rule identifies the continuous phase'],
  validRange: 'Emulsifier 0-5%',
  edgeCases: ['Beyond about 2% agent the interface is fully covered and extra agent adds almost nothing', 'Lime water gives a water-in-oil emulsion, the opposite type to soap or detergent'],
  expectedBehaviour: ['Separation time rises sharply with a little emulsifier, then levels off', 'Detergent outperforms soap; gum is a weaker (protective-colloid) stabiliser'],
};

export const OILS = { mustard: { label: 'Mustard oil', baseTimeS: 65 }, coconut: { label: 'Coconut oil', baseTimeS: 58 }, olive: { label: 'Olive oil', baseTimeS: 72 }, castor: { label: 'Castor oil', baseTimeS: 90 } };
export const AGENTS = { none: { label: 'No emulsifier', maxRatio: 1, half: 1, type: null }, soap: { label: 'Soap', maxRatio: 22, half: 0.4, type: 'oil-in-water' }, detergent: { label: 'Detergent', maxRatio: 32, half: 0.3, type: 'oil-in-water' }, gum: { label: 'Gum acacia', maxRatio: 9, half: 0.8, type: 'oil-in-water' }, limewater: { label: 'Lime water', maxRatio: 14, half: 0.6, type: 'water-in-oil' } };

export const defaults = { oil: 'mustard', agent: 'soap', test: 'separation', agentPct: 1, scale: 'w1' };

export function oilOf(inputs) { return OILS[inputs.oil] || OILS.mustard; }
export function agentOf(inputs) { return AGENTS[inputs.agent] || AGENTS.none; }

export function separationTimeS(inputs) {
  const a = agentOf(inputs);
  if (a.type === null || inputs.agentPct <= 0) return oilOf(inputs).baseTimeS;
  const frac = inputs.agentPct / (inputs.agentPct + a.half); // saturating uptake, plateaus past ~2%
  const ratio = 1 + (a.maxRatio - 1) * frac;
  return oilOf(inputs).baseTimeS * ratio;
}
export function emulsionType(inputs) { const a = agentOf(inputs); return a.type || 'unstable (no true emulsion)'; }

export function validate() { return { ok: true, errors: [], warnings: [] }; }
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 277);
  const t = separationTimeS(inputs) * (1 + jitter(rng, 0.04));
  return { trial, oil: oilOf(inputs).label, agent: agentOf(inputs).label, agentPct: inputs.agentPct, separationS: sigFig(t, 4), emulsionType: emulsionType(inputs) };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 2) return { ok: false, reason: 'Compare at least the plain mixture and one emulsified trial.' };
  const control = rows.find((r) => r.agent === AGENTS.none.label) || rows.reduce((a, b) => (Number(a.separationS) <= Number(b.separationS) ? a : b));
  const best = rows.reduce((a, b) => (Number(a.separationS) >= Number(b.separationS) ? a : b));
  const ratio = Number(best.separationS) / Number(control.separationS);
  return { ok: true, stabilisationRatio: sigFig(ratio, 4), bestAgent: best.agent, n: rows.length, points: [] };
}

export default { meta, defaults, OILS, AGENTS, init, step, measure, derive, validate, oilOf, agentOf, separationTimeS, emulsionType };
