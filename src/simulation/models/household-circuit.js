/**
 * MODEL: Assembling a household lighting circuit — XII-PHY-ACT-A3
 * CBSE Class XII Physics (042) 2026-27, Practicals Section A, Activity 3.
 * Three lamps, switches, a fuse: parallel keeps each lamp at full voltage
 * and independently switched; series starves every lamp to a ninth of its
 * rated power and one failure kills them all.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-PHY-ACT-A3',
  formula: 'R = V²/P (lamp resistance at rating); parallel: each lamp at full V; series: V/3 each, P falls to 1/9',
  unitSystem: 'Volt, watt, ampere',
  assumptions: ['Mains supply 220 V', 'Lamp resistance is taken as constant at its working value', 'The fuse is ideal, opening only above its rated current'],
  validRange: 'Lamp rating 40-100 W',
  edgeCases: ['A switch in the neutral still turns the lamp off, but the holder stays live — unsafe', 'A fuse in the neutral does not disconnect the live wire on a fault — unsafe'],
  expectedBehaviour: ['Parallel wiring gives full brightness and independent switching', 'Series wiring dims every lamp to a ninth of its rated power'],
};

export const LAMPS = { w40: { label: '40 W lamp', ratedW: 40 }, w60: { label: '60 W lamp', ratedW: 60 }, w100: { label: '100 W lamp', ratedW: 100 } };
export const SUPPLY_V = 220;

export const defaults = { lamp: 'w60', wiring: 'parallel', switches: 'eachLive', fuse: 'live', earthing: 'earthed', fuseRatingA: 3 };

export function lampOf(inputs) { return LAMPS[inputs.lamp] || LAMPS.w60; }
export function lampResistanceOhm(inputs) { return (SUPPLY_V * SUPPLY_V) / lampOf(inputs).ratedW; }

export function voltagePerLampV(inputs) { return inputs.wiring === 'series' ? SUPPLY_V / 3 : SUPPLY_V; }
export function powerPerLampW(inputs) { const v = voltagePerLampV(inputs); return (v * v) / lampResistanceOhm(inputs); }
export function totalCurrentA(inputs) {
  const iPerLamp = voltagePerLampV(inputs) / lampResistanceOhm(inputs);
  return inputs.wiring === 'series' ? iPerLamp : iPerLamp * 3;
}
export function safeFuse(inputs) { return inputs.fuseRatingA > totalCurrentA(inputs) && inputs.fuseRatingA <= totalCurrentA(inputs) * 3; }
export function switchesSafe(inputs) { return inputs.switches !== 'eachNeutral'; }
export function fuseInLive(inputs) { return inputs.fuse === 'live'; }

export function validate(inputs) {
  const warnings = [];
  if (!switchesSafe(inputs)) warnings.push({ field: 'switches', code: 'SWITCH_IN_NEUTRAL', message: 'A switch in the neutral wire is unsafe.', why: 'The lamp still turns off, but with the switch open the holder and lamp body remain connected to the live wire through the filament, so they stay live — a shock hazard when changing the bulb.', fix: 'Place each switch in the live wire.' });
  if (!fuseInLive(inputs)) warnings.push({ field: 'fuse', code: 'FUSE_IN_NEUTRAL', message: 'A fuse in the neutral wire does not make the circuit safe.', why: 'On a fault the fuse blows, but the appliance stays connected to the live wire through the neutral link, so it remains live even though it has stopped working.', fix: 'Place the fuse in the live wire, close to the point of entry.' });
  if (inputs.earthing !== 'earthed') warnings.push({ field: 'earthing', code: 'NOT_EARTHED', message: 'This circuit has no earth connection.', why: 'Without an earth, a fault that connects the metal body to live has no low-resistance path to trip the fuse quickly, so the body stays dangerously live.' });
  if (!safeFuse(inputs)) warnings.push({ field: 'fuseRatingA', code: 'BAD_FUSE_RATING', message: 'This fuse rating does not suit the working current.', why: `The circuit draws about ${totalCurrentA(inputs).toFixed(2)} A normally. A fuse must be rated just above that, so it does not blow in normal use but still protects the wiring on a fault.` });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, current: 0, lamps: 0, fuseBlown: false, switchPhase: 0 }; }
/**
 * The lighting circuit. Lamps in parallel each draw their own current from
 * the same supply, so the total rises with every one switched on — and
 * past the fuse rating the fuse goes, which is the safety lesson the
 * experiment carries.
 *
 * This used to read inputs.supplyV/lampsOn/lamps/lampWatt/fuseA -- none of
 * which are fields this experiment actually has (the real controls are
 * lamp/wiring/switches/fuse/earthing/fuseRatingA) -- so the animation
 * always fell back to its hardcoded defaults (220 V, one 60 W lamp, a 5 A
 * fuse) regardless of the lamp rating, wiring, or fuse rating the student
 * had actually chosen. Now driven by the model's own totalCurrentA(),
 * which already accounts for the chosen lamp, wiring and (for series) the
 * voltage each lamp actually gets.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  const target = s.fuseBlown ? 0 : totalCurrentA(inputs);
  s.current += (target - s.current) * Math.min(1, dt * 6);
  s.lamps = s.fuseBlown ? 0 : 3;
  if (!s.fuseBlown && s.current > (inputs.fuseRatingA ?? defaults.fuseRatingA)) { s.fuseBlown = true; }
  s.switchPhase = (s.switchPhase + dt) % 1;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 223);
  const v = voltagePerLampV(inputs) + jitter(rng, 1);
  const p = (v * v) / lampResistanceOhm(inputs);
  const iTotal = totalCurrentA(inputs) + jitter(rng, 0.01);
  return { trial, wiring: inputs.wiring, switches: inputs.switches, fuse: inputs.fuse, earthing: inputs.earthing, voltagePerLamp: Number(v.toFixed(1)), powerPerLamp: sigFig(p, 4), totalCurrent: sigFig(iTotal, 4) };
}

/** The three safety faults this activity specifically tests for. */
function rowUnsafe(r) { return r.switches === 'eachNeutral' || r.fuse !== 'live' || r.earthing !== 'earthed'; }
/** The one fully correct assembly: parallel lamps, a switch per lamp in the live wire, fuse in the live wire, earthed casing. */
function rowCorrect(r) { return r.wiring === 'parallel' && r.switches === 'eachLive' && r.fuse === 'live' && r.earthing === 'earthed'; }

export function derive(rows, inputs = defaults) {
  if (rows.length < 1) return { ok: false, reason: 'Assemble and test at least one wiring arrangement.' };
  const last = rows[rows.length - 1];
  const arrangements = new Set(rows.map((r) => `${r.wiring}|${r.switches}|${r.fuse}|${r.earthing}`));
  const unsafeRows = rows.filter(rowUnsafe);
  const correctRow = rows.find(rowCorrect);
  return {
    ok: true, voltagePerLamp: Number(last.voltagePerLamp), totalCurrent: Number(last.totalCurrent),
    recommendedFuseA: Math.ceil(Number(last.totalCurrent) * 1.3),
    arrangementsTried: arrangements.size, lamp: lampOf(inputs).label, ratedPower: lampOf(inputs).ratedW,
    powerPerLamp: Number(last.powerPerLamp),
    parallelCurrent: sigFig(totalCurrentA({ ...inputs, wiring: 'parallel' }), 4),
    seriesCurrent: sigFig(totalCurrentA({ ...inputs, wiring: 'series' }), 4),
    foundUnsafe: unsafeRows.length > 0, unsafeCount: unsafeRows.length,
    // rowCorrect() only ever matches one exact combination, so its parts are fixed, readable text rather than raw option keys.
    foundCorrect: !!correctRow,
    finalWiring: correctRow ? 'parallel' : null, finalSwitches: correctRow ? 'a switch per lamp in the live wire' : null,
    finalFuse: correctRow ? 'in the live wire' : null, finalEarthing: correctRow ? 'earthed' : null,
    n: rows.length, points: [],
  };
}

export default { meta, defaults, LAMPS, SUPPLY_V, init, step, measure, derive, validate, lampOf, lampResistanceOhm, voltagePerLampV, powerPerLampW, totalCurrentA, safeFuse, switchesSafe, fuseInLive };
