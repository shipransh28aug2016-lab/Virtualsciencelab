/**
 * MODEL: Using a mechanical/electronic balance — XI-CHE-E01
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section E, Experiment 1.
 *
 * Unlike the physics beam balance (a null instrument), a modern top-pan
 * electronic balance DISPLAYS a mass directly. The skill being examined is
 * different: taring correctly, reading to the balance's own readability,
 * not slamming the pan, and recognising drift/instability.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-E01',
  formula: 'Net mass = gross reading − tare (container) mass',
  unitSystem: 'Gram',
  assumptions: ['The balance is on a stable, vibration-free bench and levelled', 'It has been zeroed/tared before the sample is added', 'The sample is at room temperature (a hot sample creates air convection that drifts the reading)'],
  validRange: 'Mass 0.1-200 g',
  edgeCases: ['Weighing directly on the pan without a container contaminates the balance and the chemical', 'A hygroscopic solid gains mass steadily if left open on the pan, and never settles'],
  expectedBehaviour: ['The reading settles to a stable value within a couple of seconds for an ordinary solid', 'Taring subtracts the container exactly, so net mass is independent of which container is used'],
};

/**
 * What is on the pan, separated into the SAMPLE and the CONTAINER it sits in.
 *
 * These used to carry a single `trueG`, and `netMassG` subtracted the tare
 * from it. But the entries are named for what stands on the pan — "Weighing
 * bottle + salt sample" — so `trueG` was the gross mass, while 5.126 g is the
 * mass of the salt, which is also what the experiment declares as its
 * accepted result. Subtracting an 8.240 g bottle from 5.126 g gave a NET MASS
 * OF −3.11 g: the balance reported a negative quantity of salt, held it to
 * three decimal places, and the audit compared it against an accepted 5.126 g
 * without anything anywhere objecting.
 *
 * Keeping the two apart makes taring mean what it means. The pan carries
 * sample + container; an untared balance shows that sum; taring subtracts the
 * container the student says is there, so taring with the wrong container is
 * still a mistake a student can make — and is warned about — rather than an
 * arithmetic accident built into the data.
 */
export const OBJECTS = {
  salt5:  { label: 'Weighing bottle + salt sample',     sampleG: 5.126, containerG: 8.240, container: 'weighing bottle' },
  coin:   { label: 'Coin, weighed directly on the pan', sampleG: 6.032, containerG: 0,     container: 'none' },
  watch:  { label: 'Watch glass + solid',               sampleG: 2.620, containerG: 9.860, container: 'watch glass' },
  bottle: { label: 'Empty weighing bottle (tare check)', sampleG: 0,    containerG: 8.240, container: 'weighing bottle' },
};
export const BALANCES = { digital2: { label: 'Digital balance, readability 0.01 g', lc: 0.01 }, digital3: { label: 'Digital balance, readability 0.001 g', lc: 0.001 }, mechanical: { label: 'Mechanical (beam) top-pan balance', lc: 0.1 } };

export const defaults = { object: 'salt5', balance: 'digital2', tared: true, containerMassG: 8.240 };

export function objectOf(inputs) { return OBJECTS[inputs.object] || OBJECTS.salt5; }
export function balanceOf(inputs) { return BALANCES[inputs.balance] || BALANCES.digital2; }
/** Everything standing on the pan. */
export function grossMassG(inputs) {
  const o = objectOf(inputs);
  return o.sampleG + o.containerG;
}

/**
 * What the balance displays: the whole pan load, or — once tared — the pan
 * load less the container the student tared with. Taring with a container
 * that is not the one on the pan leaves exactly that difference behind, which
 * is the error this practical is meant to teach.
 */
export function netMassG(inputs) {
  return inputs.tared ? grossMassG(inputs) - (inputs.containerMassG || 0) : grossMassG(inputs);
}

export function validate(inputs) {
  const warnings = [];
  const o = objectOf(inputs);
  if (!inputs.tared && inputs.object !== 'bottle') warnings.push({ field: 'tared', code: 'NOT_TARED', message: 'The balance has not been tared (zeroed) with the empty container on the pan.', why: 'Without taring, the displayed mass includes the container, not just the sample.', fix: 'Place the empty container, press tare/zero, then add the sample.' });
  if (inputs.tared && Math.abs((inputs.containerMassG || 0) - o.containerG) > 0.005) {
    warnings.push({
      field: 'containerMassG', code: 'WRONG_TARE',
      message: o.containerG === 0
        ? `${o.label} sits directly on the pan, so there is nothing to tare out.`
        : `The tare is set to ${(inputs.containerMassG || 0).toFixed(3)} g, but the ${o.container} on the pan weighs ${o.containerG.toFixed(3)} g.`,
      why: 'Taring subtracts whatever mass you tell it the container has. If that is not the container actually on the pan, the difference stays in every reading.',
      fix: o.containerG === 0 ? 'Set the tare to zero for a sample weighed directly.' : `Tare with the empty ${o.container} on the pan.`,
    });
  }
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, displayG: 0, settled: false }; }
/**
 * A top-pan balance settling. The display hunts in its last digit while
 * the pan is still moving and only then stabilises -- which is why a mass
 * is read after the stability indicator appears, not before.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = grossMassG(inputs);
  s.displayG = (s.displayG ?? 0) + (target - (s.displayG ?? 0)) * Math.min(1, dt * 2.2);
  /* Air currents over an unshielded pan keep the last digit hunting by a
     count or two -- which is why a balance is read with the draught shield
     closed, and why "wait for the stability mark" is drilled into every
     student. */
  const lc = balanceOf(inputs).lc;
  s.drift = inputs.shieldClosed === false ? Math.sin(s.t * 5.1) * lc : 0;
  s.settled = Math.abs(target - s.displayG) < lc * 0.5;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state || !state.settled) return null;
  const rng = makeRng(seed + trial * 307);
  const lc = balanceOf(inputs).lc;
  const reading = toLeastCount(netMassG(inputs) + jitter(rng, lc * 0.6), lc);
  return { trial, object: objectOf(inputs).label, balance: balanceOf(inputs).label, tared: inputs.tared, reading: Number(reading.toFixed(4)) };
}

export function derive(rows, inputs = defaults) {
  const vals = rows.map((r) => Number(r.reading)).filter(Number.isFinite);
  if (vals.length < 2) return { ok: false, reason: 'Weigh the sample at least twice to check repeatability.' };
  const m = mean(vals);
  return { ok: true, meanMass: sigFig(m, 5), accepted: sigFig(netMassG(inputs), 5), spread: Number((Math.max(...vals) - Math.min(...vals)).toFixed(4)), n: vals.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.reading) })) };
}

export default { meta, defaults, OBJECTS, BALANCES, init, step, measure, derive, validate, objectOf, balanceOf, grossMassG, netMassG };
