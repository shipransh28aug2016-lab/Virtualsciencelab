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

/**
 * What is actually driving the wire.
 *
 * In XII-PHY-A06 the wire is driven by the AC supply, through a horseshoe
 * magnet (one vibration per cycle, 50 Hz) or an electromagnet (attracted
 * twice per cycle, 100 Hz). There is no tuning fork in that experiment at all.
 *
 * This used to return the fork's frequency whenever `inputs.fork` was set —
 * and it always was, because A06 declares no fork of its own, so the MODEL's
 * default `fork: 'f256'` sat underneath it. The Class XII experiment for
 * finding the frequency of the mains was therefore driven at 256 Hz by a
 * tuning fork that is not part of it, and a student who performed it
 * perfectly was told the mains runs at 255 Hz.
 *
 * The experiment declares which law it is testing; that is what decides the
 * source here, rather than the presence of a key that leaked in from
 * somewhere else.
 */
export function frequencyHz(inputs) {
  if (inputs.mode === 'mains-frequency') {
    const mult = (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).multiplier;
    // An electromagnet can only pull a ferromagnetic wire; on brass it does
    // nothing, so the wire is not driven at twice the supply frequency.
    const effective = inputs.driver === 'electromagnet' && !wireOf(inputs).magnetic ? 1 : mult;
    return MAINS_HZ * effective;
  }
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

export function init(inputs = defaults) { return { forkHz: FORKS[inputs.fork] || 512, t: 0, phase: 0, amplitude: 0, resonant: false, beat: 0 }; }
/**
 * The wire under the fork. Resonance is sharp: the paper rider is only
 * thrown off when the bridge separation puts the wire's natural frequency
 * on the fork's, so the amplitude here is a resonance curve in the
 * mistuning, and the beat frequency is the difference the ear hears.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  /* The fork's FREQUENCY, not the picker's key: the bench read "Tuning
     fork f256 Hz". */
  s.forkHz = FORKS[inputs.fork] || 512;
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
    wire: inputs.wire, wireLabel: wireOf(inputs).label,
  };
}

/**
 * THREE DIFFERENT PRACTICALS SHARE THIS MODEL, and they are not
 * interchangeable:
 *
 *   law-of-length    XI-PHY-B08   f x l is constant at fixed tension
 *   law-of-tension   XI-PHY-B09   l / sqrt(T) is constant at fixed frequency
 *   mains-frequency  XII-PHY-A06  the frequency of the AC supply
 *
 * Which one was being performed used to be INFERRED from the readings: three
 * or more frequencies meant the law of length, three or more loads meant the
 * law of tension, and anything else fell through to the mains-frequency
 * branch. So a student doing XI-PHY-B08 who varied the length without
 * changing the tuning fork — the obvious thing to try, since length is the
 * variable the experiment names — was silently switched into a Class XII AC
 * experiment they had not opened, with its result panel, its accepted value
 * and its units. Nothing said so. Their f x l product was never computed, and
 * they were told the frequency of the mains was wrong.
 *
 * The experiment now DECLARES which law it is, and this refuses rather than
 * substituting a different one. What a student who has not yet varied the
 * right quantity needs is to be told which quantity that is.
 */
const MODE_REQUIREMENTS = {
  'law-of-length': {
    holds: (freqs, loads) => freqs >= 3 && loads <= 1,
    reason: 'This is the law of length: f × l is constant at FIXED tension. Record the resonant length for at least three different tuning forks, leaving the load on the hanger unchanged.',
  },
  'law-of-tension': {
    holds: (freqs, loads) => loads >= 3,
    reason: 'This is the law of tension: l / √T is constant at FIXED frequency. Record the resonant length for at least three different loads, using the same tuning fork throughout.',
  },
  'mains-frequency': {
    holds: (freqs, loads) => loads >= 3 || freqs >= 1,
    reason: 'Record the resonant length at three or more loads so the l–√T line can be fitted.',
  },
};

export function derive(rows, inputs = defaults) {
  if (rows.length < 3) return { ok: false, reason: 'Record the resonant length for at least three settings.' };
  const frequencies = new Set(rows.map((r) => r.frequencyHz));
  const loads = new Set(rows.map((r) => r.loadKg));

  /* One wire throughout. Linear density enters every one of these laws, so
     readings taken on a different wire belong to a different experiment. */
  const wires = [...new Set(rows.map((r) => r.wire).filter(Boolean))];
  if (wires.length > 1) {
    const names = [...new Set(rows.map((r) => r.wireLabel).filter(Boolean))];
    return {
      ok: false,
      reason: `These readings were taken on ${wires.length} different wires (${names.join(', ')}). The linear density enters every one of these laws, so one wire at a time — clear the table and take a full set on each.`,
    };
  }

  const declared = inputs.mode && MODE_REQUIREMENTS[inputs.mode] ? inputs.mode : null;
  if (declared && !MODE_REQUIREMENTS[declared].holds(frequencies.size, loads.size)) {
    return { ok: false, reason: MODE_REQUIREMENTS[declared].reason };
  }

  if (declared === 'law-of-tension') return deriveLawOfTension(rows, inputs);
  if (declared === 'mains-frequency') return deriveMainsFrequency(rows, inputs);

  if (declared === 'law-of-length' || (frequencies.size >= 3 && loads.size <= 1)) {
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

  if (loads.size >= 3) return deriveLawOfTension(rows, inputs);
  return deriveMainsFrequency(rows, inputs);
}

function deriveLawOfTension(rows, inputs) {
  {
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

  return { ok: false, reason: 'Record the resonant length for at least three different loads.' };
}

function deriveMainsFrequency(rows, inputs) {
  // XII-PHY-A06: mains frequency from a single (or few) driver settings.
  const pts = rows.map((r) => ({ x: Number(r.sqrtTension), y: Number(r.resonantLengthCm) }));
  const fit = fitThroughOrigin(pts);
  const mu = linearDensity(inputs);
  const drivenFreq = fit ? 1 / (2 * (fit.slope / 100) * Math.sqrt(mu)) : null;
  const rawMultiplier = (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).multiplier;
  // The wire only doubles the supply frequency if the electromagnet can
  // actually pull it, so the factor divided out here has to be the factor the
  // wire was really driven at — otherwise a brass wire under an electromagnet
  // would report half the mains frequency.
  const multiplier = inputs.driver === 'electromagnet' && !wireOf(inputs).magnetic ? 1 : rawMultiplier;
  return {
    ok: true, mode: 'mains-frequency', driver: (DRIVERS[inputs.driver] || DRIVERS.permanentMagnet).label,
    drivenFrequency: drivenFreq ? sigFig(drivenFreq, 4) : null,
    mainsFrequency: drivenFreq ? sigFig(drivenFreq / multiplier, 4) : null,
    accepted: MAINS_HZ, halvingRequired: multiplier === 2,
    multiplier, r2: fit ? Number(fit.r2.toFixed(4)) : null, n: rows.length, points: pts,
  };
}

export default { meta, defaults, FORKS, WIRES, DRIVERS, MAINS_HZ, G, init, step, measure, derive, validate, wireOf, linearDensity, tensionN, frequencyHz, resonantLengthCm };
