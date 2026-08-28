/**
 * MODEL: Sonometer — XI-PHY-B08 (law of length), XI-PHY-B09 (law of tension),
 * and XII-PHY-A06 (frequency of the AC mains). One vibrating-wire physics
 * model serves all three, since all three read a resonant length from
 * f = (1/2l)√(T/μ).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, linearFit, sigFig, mean } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-B08',
  formula: 'f = (1/2l)√(T/μ);  T = Mg;  μ = πr²ρ',
  unitSystem: 'SI: newton, metre, kg/m; lengths reported in cm',
  assumptions: ['The wire is uniform and flexible', 'It vibrates in its fundamental mode with the paper riders showing maximum flutter', 'The bridges are sharp and do not damp the wire'],
  validRange: 'Load 0.25-8 kg; resonant length 5-90 cm',
  edgeCases: ['An electromagnet attracts an iron wire twice per mains cycle, so it drives the wire at 100 Hz, not 50 Hz'],
  expectedBehaviour: ['f × l is constant at fixed tension — the law of length', 'l ∝ √T at fixed frequency — the law of tension'],
};

export const G = 9.792;
export const FORKS = { f256: 256, f288: 288, f320: 320, f384: 384, f480: 480, f512: 512 };
export const WIRES = { steel: { label: 'Steel wire (thin)', radiusMm: 0.20, rho: 7800, magnetic: true }, brass: { label: 'Brass wire', radiusMm: 0.22, rho: 8500, magnetic: false }, steelThick: { label: 'Steel wire (thick)', radiusMm: 0.30, rho: 7800, magnetic: true } };
export const DRIVERS = { permanentMagnet: { label: 'Horseshoe (permanent) magnet', multiplier: 1 }, electromagnet: { label: 'Electromagnet', multiplier: 2 } };
export const MAINS_HZ = 50;

export const defaults = { bridgeSeparationCm: 19.5, fork: 'f256', loadKg: 1, wire: 'steel', driver: 'permanentMagnet' };

export function wireOf(inputs) { return WIRES[inputs.wire] || WIRES.steel; }
export function linearDensity(inputs) { const w = wireOf(inputs); const r = w.radiusMm / 1000; return Math.PI * r * r * w.rho; }
export function tensionN(inputs) { return inputs.loadKg * G; }

/** Driving frequency: a tuning fork's own frequency, or the mains-driven case. */
export function frequencyHz(inputs) {
  if (inputs.fork) return FORKS[inputs.fork] || FORKS.f256;
  const mult = wireOf(inputs).magnetic ? (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).multiplier : 1;
  return MAINS_HZ * mult;
}

export function resonantLengthCm(inputs) {
  const f = frequencyHz(inputs);
  const mu = linearDensity(inputs);
  const l = (1 / (2 * f)) * Math.sqrt(tensionN(inputs) / mu); // metre
  return l * 100;
}

export function validate(inputs) {
  const errors = [], warnings = [];
  const l = resonantLengthCm(inputs);
  if (l > 95 || l < 3) errors.push({ field: 'bridgeSeparationCm', code: 'OFF_WIRE', message: `The resonant length for this setting is about ${l.toFixed(1)} cm, off the sonometer's usable length.`, why: 'Change the load, or choose a different fork, so the resonant point falls on the wire.' });
  if (inputs.driver === 'electromagnet' && !wireOf(inputs).magnetic) {
    warnings.push({ field: 'wire', code: 'NON_MAGNETIC_WIRE', message: 'An electromagnet cannot drive a non-magnetic wire.', why: 'The electromagnet pulls a steel wire twice per AC cycle; brass is not attracted at all.', fix: 'Use a steel wire with the electromagnet.' });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, phase: 0, amplitude: 0, resonant: false, beat: 0 }; }
/**
 * The wire under the fork. Resonance is sharp: the paper rider is only
 * thrown off when the bridge separation puts the wire's natural frequency
 * on the fork's, so the amplitude here is a resonance curve in the
 * mistuning, and the beat frequency is the difference the ear hears.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const fWire = frequencyHz(inputs);
  const fFork = inputs.forkHz ?? (typeof inputs.fork === 'string' ? Number((inputs.fork.match(/\d+/) || [256])[0]) : 256);
  const detune = Math.abs(fWire - fFork);
  // A lightly damped resonance: amplitude falls off with mistuning.
  const Q = 42;
  const target = 1 / Math.sqrt(1 + (2 * Q * detune / Math.max(1, fFork)) ** 2);
  s.amplitude += (target - s.amplitude) * Math.min(1, dt * 4);
  s.resonant = target > 0.7;
  s.beat = detune;
  // Phase of the standing wave, slowed so the shape is visible on screen.
  s.phase = (s.phase + dt * Math.min(14, fWire * 0.05)) % (Math.PI * 2);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 101);
  const trueL = resonantLengthCm(inputs);
  const l = Number((trueL + jitter(rng, 0.15)).toFixed(2));
  const f = frequencyHz(inputs);
  const T = tensionN(inputs);
  return {
    trial, frequencyHz: f, resonantLengthCm: l, invLength: sigFig(1 / l, 5), product: sigFig(f * l, 4),
    loadKg: inputs.loadKg, tensionN: sigFig(T, 4), sqrtTension: sigFig(Math.sqrt(T), 4), ratio: sigFig(l / Math.sqrt(T), 4),
  };
}

export function derive(rows, inputs = defaults) {
  if (rows.length < 3) return { ok: false, reason: 'Record the resonant length for at least three settings.' };
  const frequencies = new Set(rows.map((r) => r.frequencyHz));
  const loads = new Set(rows.map((r) => r.loadKg));

  if (frequencies.size >= 3 && loads.size <= 1) {
    // Law of length: f x l constant.
    const products = rows.map((r) => Number(r.product));
    const m = mean(products);
    const spread = ((Math.max(...products) - Math.min(...products)) / m) * 100;
    const pts = rows.map((r) => ({ x: Number(r.invLength), y: Number(r.frequencyHz) }));
    const fit = fitThroughOrigin(pts);
    /*
     * f = v/(2l_m), and x here is 1/l_cm = 100/l_m, so
     * f = v/(2 l_cm/100) = 50v * (1/l_cm) = 50v * x -- the slope of this
     * fit is 50v, not 100v. Dividing by 100 (mistaking the fit for one
     * against 1/l already in metres, off by an extra factor of the l_cm-
     * to-l_m conversion folded into x) reported a wave speed half the
     * true value, e.g. 50.0 m/s instead of 99.98 m/s for the default
     * steel wire at 1 kg tension against a directly computed
     * sqrt(T/mu) = 99.95 m/s.
     */
    return {
      ok: true, mode: 'law-of-length', tensionN: sigFig(tensionN(inputs), 4),
      meanProduct: sigFig(m, 5), spreadPercent: sigFig(spread, 3), constant: spread < 4,
      waveSpeed: fit ? sigFig(fit.slope / 50, 4) : null, r2: fit ? Number(fit.r2.toFixed(4)) : null,
      n: rows.length, points: pts,
    };
  }

  if (loads.size >= 3) {
    // Law of tension: l/sqrt(T) constant.
    const ratios = rows.map((r) => Number(r.ratio));
    const m = mean(ratios);
    const spread = ((Math.max(...ratios) - Math.min(...ratios)) / m) * 100;
    const pts = rows.map((r) => ({ x: Number(r.sqrtTension), y: Number(r.resonantLengthCm) }));
    const fit = fitThroughOrigin(pts);
    const f = Number(rows[0].frequencyHz);
    const slopeSI = fit ? fit.slope / 100 : null; // cm per sqrt(N) -> m per sqrt(N)
    const linDensity = slopeSI ? 1 / (2 * f * slopeSI) ** 2 : null;
    // A free (not forced-through-origin) fit is the only way to actually
    // CHECK "intercept should be zero" -- fitThroughOrigin always reports
    // an intercept of exactly 0 by construction, so it could never fail
    // the very check the result text claims to be making.
    const freeFit = pts.length >= 3 ? linearFit(pts) : null;
    return {
      ok: true, mode: 'law-of-tension', frequencyHz: f,
      meanRatio: sigFig(m, 4), spreadPercent: sigFig(spread, 3), proportional: spread < 4,
      intercept: freeFit ? sigFig(freeFit.intercept, 3) : null,
      linearDensity: linDensity ? sigFig(linDensity, 4) : null, acceptedDensity: sigFig(linearDensity(inputs), 4),
      r2: fit ? Number(fit.r2.toFixed(4)) : null, n: rows.length, points: pts,
    };
  }

  // XII-PHY-A06: mains frequency from a single (or few) driver settings.
  const pts = rows.map((r) => ({ x: Number(r.sqrtTension), y: Number(r.resonantLengthCm) }));
  const fit = fitThroughOrigin(pts);
  const mu = linearDensity(inputs);
  const drivenFreq = fit ? 1 / (2 * (fit.slope / 100) * Math.sqrt(mu)) : null;
  const multiplier = (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).multiplier;
  return {
    ok: true, mode: 'mains-frequency', driver: (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).label,
    drivenFrequency: drivenFreq ? sigFig(drivenFreq, 4) : null,
    mainsFrequency: drivenFreq ? sigFig(drivenFreq / multiplier, 4) : null,
    accepted: MAINS_HZ, halvingRequired: multiplier === 2,
    multiplier, r2: fit ? Number(fit.r2.toFixed(4)) : null, n: rows.length, points: pts,
  };
}

export default { meta, defaults, FORKS, WIRES, DRIVERS, MAINS_HZ, G, init, step, measure, derive, validate, wireOf, linearDensity, tensionN, frequencyHz, resonantLengthCm };
