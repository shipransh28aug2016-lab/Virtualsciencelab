/**
 * objects.js — the things that go on a pan, for every bench that weighs. Pure.
 *
 * An OBJECT is made of PARTS with their own mass and density (a weighing bottle and
 * the salt in it are two things as far as Archimedes is concerned), a temperature
 * above the room, and — for a sample that takes water from the air — a `hygro`
 * rate and cap. A catalogue is a plain map of id → definition; these functions
 * build working objects from it, flatten what is on the pan into the items the
 * balance engine takes, and let everything on the bench move on with the clock.
 */
import { stepItems } from './balance.js';
import { mulberry32 } from '../numerics.js';

export const freshObjects = (catalogue) => Object.fromEntries(Object.entries(catalogue).map(([id, o]) => [id, {
  ...o, parts: o.parts.map((p) => ({ ...p, gain: 0 })), dT: o.dT ?? 0, lidOn: Boolean(o.lid) && !o.startOpen, transferred: false,
}]));

export const massOf = (o) => o.parts.reduce((a, p) => a + p.m, 0);
export const sampleOf = (o) => o.parts.find((p) => p.id === 'sample')?.m ?? 0;

/** The parts of what is on the pan, as the balance sees them. */
export function panItems(objects, pan) {
  return pan.flatMap((id) => {
    const o = objects[id];
    const sealed = o.lid && o.lidOn;
    return o.parts.map((p) => ({ id: p.id === 'steel' && id === 'calweight' ? 'calweight' : `${id}:${p.id}`, m: p.m, rho: p.rho, dT: o.dT, gain: p.gain, hygro: p.hygro, exposed: !sealed }));
  });
}

/** Everything on the bench moves on: samples take up water, warm things cool, on the pan or off it. */
export function stepObjects(objects, dt) {
  const out = {};
  for (const [id, o] of Object.entries(objects)) {
    const sealed = o.lid && o.lidOn;
    let dT = o.dT;
    const parts = o.parts.map((p) => {
      const item = { id: p.id, m: p.m, rho: p.rho, dT: o.dT, gain: p.gain, hygro: p.hygro, exposed: !sealed };
      const next = stepItems([item], dt)[0];
      dT = next.dT ?? dT;
      return next === item ? p : { ...p, m: next.m, gain: next.gain ?? 0 };
    });
    out[id] = parts.some((p, i) => p !== o.parts[i]) || dT !== o.dT ? { ...o, parts, dT: o.parts.length ? dT : 0 } : o;
  }
  return out;
}

/** A spatula-full: the portion asked for, give or take what a hand does. */
export function spatulaPortion(nominalG, seed, count) {
  const u = mulberry32((seed * 7919 + count * 104729) >>> 0)();
  return Math.max(0.001, Number((nominalG * (0.88 + 0.24 * u)).toFixed(4)));
}

/** Add `g` of a sample to an object; `def` ({ label, rho, hygro? }) says what it is when the object had none. */
export function addSample(o, g, def = { label: 'sodium chloride', rho: 2.16 }) {
  const has = o.parts.some((p) => p.id === 'sample');
  const parts = has ? o.parts.map((p) => (p.id === 'sample' ? { ...p, m: p.m + g } : p)) : [...o.parts, { id: 'sample', label: def.label, m: g, rho: def.rho, hygro: def.hygro, gain: 0 }];
  return { ...o, parts };
}
