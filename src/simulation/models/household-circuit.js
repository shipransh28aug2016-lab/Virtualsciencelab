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
export function init() { return { t: 0 }; }
export function step(state) { return state; }

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 223);
  const v = voltagePerLampV(inputs) + jitter(rng, 1);
  const p = (v * v) / lampResistanceOhm(inputs);
  const iTotal = totalCurrentA(inputs) + jitter(rng, 0.01);
  return { trial, wiring: inputs.wiring, switches: inputs.switches, fuse: inputs.fuse, voltagePerLamp: Number(v.toFixed(1)), powerPerLamp: sigFig(p, 4), totalCurrent: sigFig(iTotal, 4) };
}

export function derive(rows) {
  if (rows.length < 1) return { ok: false, reason: 'Assemble and test at least one wiring arrangement.' };
  const last = rows[rows.length - 1];
  return { ok: true, voltagePerLamp: Number(last.voltagePerLamp), totalCurrent: Number(last.totalCurrent), recommendedFuseA: Math.ceil(Number(last.totalCurrent) * 1.3), n: rows.length, points: [] };
}

export default { meta, defaults, LAMPS, SUPPLY_V, init, step, measure, derive, validate, lampOf, lampResistanceOhm, voltagePerLampV, powerPerLampW, totalCurrentA, safeFuse, switchesSafe, fuseInLive };
