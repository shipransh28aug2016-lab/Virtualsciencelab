/**
 * MODEL: Resistivity of a wire from a V-I graph — XII-PHY-A01
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Experiment 1.
 * V = IR (Ohm's law); ρ = RA/L = RπD²/(4L).
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig, sciText } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-A01',
  formula: 'V = IR; ρ = RπD²/(4L)',
  unitSystem: 'SI: ohm, ohm-metre',
  assumptions: ['The wire stays at a constant temperature over the range used', 'Ammeter and voltmeter are ideal enough not to disturb the circuit appreciably', 'The wire is of uniform cross-section'],
  validRange: 'Current 0.05-1.5 A',
  edgeCases: ['Too high a current heats the wire and curves the V-I line', 'Swapping ammeter series/parallel or voltmeter parallel/series wiring gives a wrong resistance'],
  expectedBehaviour: ['V is proportional to I — Ohm\'s law', 'ρ is a property of the material, independent of the wire\'s length or diameter'],
};

export const WIRES = { constantan: { label: 'Constantan wire', rho: 4.9e-7 }, nichrome: { label: 'Nichrome wire', rho: 1.1e-6 }, copper: { label: 'Copper wire', rho: 1.68e-8 } };

export const defaults = { wire: 'constantan', rheostatFrac: 0.5, lengthCm: 100, diameterMm: 0.4, emf: 3, ammeterMode: 'series', voltmeterMode: 'parallel' };

export function wireOf(inputs) { return WIRES[inputs.wire] || WIRES.constantan; }
export function areaM2(inputs) { const d = inputs.diameterMm / 1000; return (Math.PI * d * d) / 4; }
export function resistanceOhm(inputs) { return (wireOf(inputs).rho * (inputs.lengthCm / 100)) / areaM2(inputs); }
export function wiredCorrectly(inputs) { return inputs.ammeterMode === 'series' && inputs.voltmeterMode === 'parallel'; }

export function circuitCurrent(inputs) {
  const R = resistanceOhm(inputs);
  const rheostat = 2 + inputs.rheostatFrac * 8; // ohm, in series
  return inputs.emf / (R + rheostat + 0.5);
}

export function validate(inputs) {
  const warnings = [];
  if (!wiredCorrectly(inputs)) warnings.push({ field: 'ammeterMode', code: 'WRONG_WIRING', message: 'The meters are not wired the standard way.', why: 'An ammeter must carry the full circuit current (series) and a voltmeter must sample the wire\'s own voltage (parallel). Any other arrangement measures the wrong thing.', fix: 'Connect the ammeter in series and the voltmeter in parallel with the wire.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, current: 0, voltage: 0, tempRise: 0, settled: false }; }
/**
 * The circuit carrying current.
 *
 * Meters do not answer instantly, and the wire does not stay cold: the
 * current warms it, its resistance creeps up with temperature, and the
 * reading drifts down -- which is exactly why readings are taken quickly
 * and the key is opened between them. Wiring the meters the wrong way
 * round (ammeter in parallel, voltmeter in series) passes no useful
 * current at all, and the model says so rather than quietly reading on.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!wiredCorrectly(inputs)) {
    s.current += (0 - s.current) * Math.min(1, dt * 5);
    s.voltage += (0 - s.voltage) * Math.min(1, dt * 5);
    s.tempRise = Math.max(0, s.tempRise - dt * 4);
    s.settled = Math.abs(s.current) < 1e-4;
    return s;
  }
  // Joule heating raises the wire's temperature and so its resistance.
  const R0 = resistanceOhm(inputs);
  const R = R0 * (1 + 0.00004 * s.tempRise);
  const target = circuitCurrent(inputs) * (R0 / R);
  s.current += (target - s.current) * Math.min(1, dt * 4);
  s.voltage += (s.current * R - s.voltage) * Math.min(1, dt * 4);
  // Heating towards a steady state where loss balances input.
  const equilibrium = s.current * s.current * R * 26;
  s.tempRise += (equilibrium - s.tempRise) * Math.min(1, dt * 0.35);
  s.settled = Math.abs(target - s.current) < Math.max(1e-4, Math.abs(target) * 0.004);
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!wiredCorrectly(inputs)) return null;
  const rng = makeRng(seed + trial * 191);
  const I = circuitCurrent(inputs) * (0.4 + 0.15 * ((trial - 1) % 6));
  const V = I * resistanceOhm(inputs) + jitter(rng, 0.01);
  const Iread = Number((I + jitter(rng, I * 0.01)).toFixed(3));
  /* The specimen this reading belongs to travels WITH the reading. Without
     it, derive() had to take the wire, the length and the diameter from
     whatever happened to be set when Calculate was pressed — which need not
     be what was on the bench when the readings were taken. */
  return {
    trial, current: Iread, voltage: Number(V.toFixed(3)), ratio: sigFig(V / Iread, 4),
    wire: wireOf(inputs).label, wireKey: inputs.wire,
    lengthCm: inputs.lengthCm, diameterMm: inputs.diameterMm,
  };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.current), y: Number(r.voltage) }));
  if (pts.length < 4) return { ok: false, reason: 'Record at least four different current settings.' };

  /*
   * ONE SPECIMEN PER GRAPH.
   *
   * The V–I line has a single slope because it is the resistance of ONE piece
   * of wire. Readings taken after the wire, its length or its diameter were
   * changed belong to a different resistance, and fitting one line through
   * the lot produced a slope that is not the resistance of anything — from
   * which ρ was then computed, to three significant figures, using whichever
   * length and diameter happened to be set at the moment Calculate was
   * pressed rather than the ones the readings were taken at.
   *
   * Changing the specimen is the right thing to do — it is how you show ρ is
   * a property of the material and not of the sample — but it starts a new
   * graph, and it has to be said rather than silently averaged.
   */
  const specimens = new Set(rows.map((r) => `${r.wireKey ?? ''}|${r.lengthCm ?? ''}|${r.diameterMm ?? ''}`));
  if (specimens.size > 1) {
    const wires = [...new Set(rows.map((r) => r.wire).filter(Boolean))];
    return {
      ok: false,
      reason: wires.length > 1
        ? `These readings come from ${wires.length} different wires (${wires.join(', ')}). One V–I line is the resistance of one specimen — clear the table and take a full set on each wire separately.`
        : 'The length or diameter of the wire was changed part-way through. One V–I line is the resistance of one specimen, so clear the table and take a full set at each setting.',
    };
  }

  // Take the specimen from the READINGS, falling back to the current setup
  // only for a table recorded before this was tracked.
  const first = rows[0] || {};
  const lengthCm = Number.isFinite(Number(first.lengthCm)) ? Number(first.lengthCm) : inputs.lengthCm;
  const diameterMm = Number.isFinite(Number(first.diameterMm)) ? Number(first.diameterMm) : inputs.diameterMm;
  const specimen = { ...inputs, lengthCm, diameterMm, wire: first.wireKey || inputs.wire };

  const fit = fitThroughOrigin(pts);
  const rho = (fit.slope * areaM2(specimen)) / (lengthCm / 100);
  const accepted = wireOf(specimen).rho;
  return {
    ok: true, resistance: sigFig(fit.slope, 4), rho: sigFig(rho, 3), accepted,
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
    wire: wireOf(specimen).label, lengthCm, diameterMm,
    rhoText: sciText(rho, 'Ω·m'), acceptedText: sciText(accepted, 'Ω·m'),
  };
}

export default { meta, defaults, WIRES, init, step, measure, derive, validate, wireOf, areaM2, resistanceOhm, wiredCorrectly, circuitCurrent };
