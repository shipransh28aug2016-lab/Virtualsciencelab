/**
 * XI-CHE-E01 — weighing: tare, readability, repeatability, weighing by difference.
 * Pure: no React, no three, no store.
 *
 * What stands on the pan is a set of OBJECTS, each made of PARTS with their own
 * mass and density (a weighing bottle and the salt in it are two things as far
 * as Archimedes is concerned), their own temperature above the room, and — for
 * the sodium hydroxide, the anhydrous copper sulfate — their own appetite for
 * the water in the air. The balance underneath (shared/balance) turns what is
 * there into a display the way the hardware does; this file knows only what
 * the student has set in front of it, what they wrote down, and what that says.
 */
import { BALANCES } from '../../../../../shared/balance/balance.js';
import {
  freshObjects as buildObjects, massOf, sampleOf, panItems, stepObjects as stepAll, spatulaPortion, addSample,
} from '../../../../../shared/balance/objects.js';
import { mulberry32 } from '../../../../../shared/numerics.js';

/* ── The things on the bench ─────────────────────────────────────────────────── */

const GLASS = 2.23;                                      // borosilicate, g/cm³
/** Every object is built fresh from this: parts (g, g/cm³), and what can be done to it. */
export const CATALOGUE = {
  bottle: { id: 'bottle', label: 'Weighing bottle, empty', shape: 'bottle', lid: true, container: true, parts: [{ id: 'glass', label: 'glass', m: 8.24, rho: GLASS }] },
  glass: { id: 'glass', label: 'Watch glass, empty', shape: 'watchglass', container: true, parts: [{ id: 'glass', label: 'glass', m: 9.86, rho: GLASS }] },
  salt: {
    id: 'salt', label: 'Weighing bottle + sodium chloride', shape: 'bottle', lid: true, container: true,
    parts: [{ id: 'glass', label: 'glass', m: 8.24, rho: GLASS }, { id: 'sample', label: 'sodium chloride', m: 5.126, rho: 2.16 }],
  },
  coin: { id: 'coin', label: 'One-rupee coin, on the pan itself', shape: 'coin', parts: [{ id: 'coin', label: 'cupronickel', m: 6.032, rho: 8.9 }] },
  cuso4: {
    id: 'cuso4', label: 'Watch glass + anhydrous copper(II) sulfate', shape: 'watchglass', container: true,
    parts: [{ id: 'glass', label: 'glass', m: 9.86, rho: GLASS }, { id: 'sample', label: 'anhydrous CuSO₄', m: 2.62, rho: 3.6, hygro: { rate: 6e-5, cap: 0.35 } }],
  },
  naoh: {
    id: 'naoh', label: 'Weighing bottle + sodium hydroxide pellets', shape: 'bottle', lid: true, startOpen: true, container: true,
    parts: [{ id: 'glass', label: 'glass', m: 8.24, rho: GLASS }, { id: 'sample', label: 'NaOH pellets', m: 2.0, rho: 2.13, hygro: { rate: 2.5e-4, cap: 1.2 } }],
  },
  crucible: { id: 'crucible', label: 'Porcelain crucible, just out of the oven', shape: 'crucible', parts: [{ id: 'porcelain', label: 'porcelain', m: 18.75, rho: 2.4 }], dT: 45 },
  check: { id: 'check', label: 'Check weight, 10.0000 g (certified)', shape: 'weight', parts: [{ id: 'steel', label: 'stainless steel', m: 10.0, rho: 8.0 }] },
  block: { id: 'block', label: 'Steel block, 250 g', shape: 'block', parts: [{ id: 'steel', label: 'steel', m: 250.0, rho: 7.85 }] },
  calweight: { id: 'calweight', label: 'Calibration weight, 100.0000 g (certified)', shape: 'calweight', parts: [{ id: 'steel', label: 'stainless steel', m: 100.0, rho: 8.0 }] },
  received: { id: 'received', label: 'Beaker + the salt tipped into it', shape: 'beaker', container: true, parts: [{ id: 'glass', label: 'glass', m: 32.41, rho: GLASS }], hidden: true },
};
export const OBJECT_ORDER = ['bottle', 'glass', 'salt', 'coin', 'cuso4', 'naoh', 'crucible', 'check', 'block', 'calweight'];

export const freshObjects = () => buildObjects(CATALOGUE);
export { massOf, sampleOf, panItems, spatulaPortion, addSample };
/** Everything on the bench moves on with the clock (the pan makes no difference to a crucible cooling). */
export const stepObjects = (objects, pan, dt) => stepAll(objects, dt);

/** Tip a bottle out into the beaker: most of it goes; a film stays behind. */
export function tipOut(objects, fromId, seed, count) {
  const from = objects[fromId];
  const s = sampleOf(from);
  if (s <= 0) return { objects, moved: 0, left: 0 };
  const residue = Number((s * (0.0015 + 0.004 * mulberry32((seed * 31 + count * 977) >>> 0)())).toFixed(5));
  const moved = Number((s - residue).toFixed(5));
  const received = addSample({ ...objects.received, hidden: false }, moved);
  return {
    objects: {
      ...objects,
      [fromId]: { ...from, transferred: true, parts: from.parts.map((p) => (p.id === 'sample' ? { ...p, m: residue } : p)) },
      received,
    },
    moved, left: residue,
  };
}

/* ── What the instrument says, for the notebook ──────────────────────────────── */

export const BALANCE_CHOICES = [
  { id: 'top2', label: 'Top-pan, 0.01 g' }, { id: 'top3', label: 'Precision, 0.001 g' }, { id: 'ana4', label: 'Analytical, 0.0001 g' }, { id: 'beam', label: 'Mechanical beam' },
];
export const labelOfBalance = (id) => BALANCE_CHOICES.find((b) => b.id === id)?.label ?? id;

/** The count of least counts a spread is, for a balance. */
export const leastCount = (id) => (id === 'beam' ? 0.05 : BALANCES[id].d);

/** Flags a careful student would have noticed — written in the notebook beside the number. */
const zeroOf = (bm) => (bm ? bm.zeroErr + bm.adjust : 0);
export function notesFor({ balanceId, bal, beam, objects, pan, reading }) {
  const n = [];
  if (balanceId === 'beam') {
    if (!reading.atRest) n.push('pointer not at rest');
    if (Math.abs(zeroOf(beam)) > 0.0143) n.push('zero not set');
  }
  if (balanceId !== 'beam' && bal) {
    const sp = BALANCES[balanceId];
    if (!reading.stable) n.push('reading not steady');
    if (sp.drift0 * Math.exp(-bal.t / sp.warmTau) > 1.5) n.push('zero still drifting (warm-up)');
    if (bal.tilt > 0.2) n.push(`out of level (${bal.tilt.toFixed(1)}°)`);
    if (sp.shield && bal.shield === 'open') n.push('draft shield open');
    if (bal.clock - bal.shockAt < 8 && bal.shockG !== 0) n.push('object was dropped on the pan');
    if (Math.abs(bal.tareG) > 0.5 * sp.d) n.push(`tare held: ${bal.tareG.toFixed(sp.decimals)} g`);
  }
  for (const id of pan) {
    const o = objects[id];
    if (o.dT > 1) n.push(`${o.label.split(',')[0].toLowerCase()} is ${o.dT.toFixed(0)} K warm`);
    if (o.parts.some((p) => p.hygro && p.gain < p.hygro.cap * 0.999) && !(o.lid && o.lidOn)) n.push('sample exposed to the air');
  }
  return n.join('; ');
}

export function row({ balanceId, objectId, objects, pan, reading, bal, beam, trial }) {
  const o = objects[objectId];
  const d = leastCount(balanceId);
  const decimals = balanceId === 'beam' ? 2 : BALANCES[balanceId].decimals;
  return {
    trial, balance: labelOfBalance(balanceId), object: o ? o.label : '—', objectId, afterTransfer: Boolean(o?.transferred),
    tare: balanceId === 'beam' ? '—' : Number(bal.tareG.toFixed(decimals)),
    reading: reading.value, text: reading.text ?? reading.value.toFixed(2), d, steady: (reading.stable ?? reading.atRest) ? 'yes' : 'no',
    note: notesFor({ balanceId, bal, beam, objects, pan, reading }),
  };
}

const mean = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length;
const sd = (xs) => (xs.length > 1 ? Math.sqrt(xs.reduce((a, v) => a + (v - mean(xs)) ** 2, 0) / (xs.length - 1)) : null);

/** What the readings say: how well the instrument repeats, and what weighing by difference found. */
export function analyse(log) {
  const groups = new Map();
  for (const r of log) {
    if (r.objectId === undefined || r.objectId === null) continue;
    const key = `${r.balance}|${r.objectId}|${r.afterTransfer ? 'after' : 'before'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const stats = [...groups.values()].map((rows) => {
    const xs = rows.map((r) => r.reading); const d = rows[0].d;
    return { balance: rows[0].balance, object: rows[0].object, objectId: rows[0].objectId, after: rows[0].afterTransfer, n: xs.length, mean: mean(xs), sd: sd(xs), range: Math.max(...xs) - Math.min(...xs), d };
  });
  const last = stats.length ? stats.reduce((a, s) => (s.n >= (a?.n ?? 0) ? s : a), null) : null;
  const full = [...log].reverse().find((r) => r.objectId === 'salt' && !r.afterTransfer);
  const after = [...log].reverse().find((r) => r.objectId === 'salt' && r.afterTransfer && r.balance === full?.balance);
  const byDifference = full && after ? { full: full.reading, after: after.reading, transferred: Number((full.reading - after.reading).toFixed(4)), balance: full.balance } : null;
  const series = stats.filter((s) => s.n >= 2).map((s) => ({ name: `${s.object.split(' + ')[0]}${s.after ? ' (after)' : ''}`, points: log.filter((r) => r.objectId === s.objectId && r.balance === s.balance && Boolean(r.afterTransfer) === s.after).map((r, i) => [i + 1, r.reading]), connect: true }));
  return { stats, last, byDifference, series };
}

/* ── What the bench says ─────────────────────────────────────────────────────── */

export function statusOf(s) {
  const { balanceId, bal, beam, reading } = s.display;
  if (balanceId === 'beam') {
    const zero = beam.zeroErr + beam.adjust;
    if (s.pan.length === 0 && Math.abs(zero) > 0.0143) return { key: 'beam-zero', tone: 'warn', title: 'The pointer is not at zero', detail: 'Empty pan, every rider at zero, and the pointer still rests off the mark. Turn the adjusting screw before you weigh anything.' };
    if (s.pan.length === 0) return { key: 'beam-empty', tone: 'info', title: 'Nothing on the pan', detail: 'Put the object on the pan and slide the riders — hundreds first, then tens, then the fine beam — until the pointer rests at zero.' };
    return reading.atRest
      ? { key: 'beam-rest', tone: 'ok', title: `Pointer at zero: ${reading.value.toFixed(2)} g`, detail: 'Read the riders. The pointer is at rest on the mark: record it.' }
      : { key: 'beam-swing', tone: 'info', title: 'The pointer is still moving', detail: 'A beam balance takes a few seconds to stop. If it rests above zero the riders are too light; below, too heavy.' };
  }
  const sp = BALANCES[balanceId];
  const drift = sp.drift0 * Math.exp(-bal.t / sp.warmTau);
  if (reading.over) return { key: 'overload', tone: 'bad', title: 'Overload', detail: `The pan carries more than the ${sp.cap} g the balance is built for. Take it off.` };
  if (bal.tilt > 0.2) return { key: 'level', tone: 'warn', title: `Out of level by ${bal.tilt.toFixed(1)}°`, detail: 'The bubble is off the ring. A tilted balance reads low by m(1 − cos θ): small for grams, large for a 100 g weight. Turn the feet.' };
  if (sp.shield && bal.shield === 'open' && !reading.stable) return { key: 'draft', tone: 'warn', title: 'The reading wanders', detail: 'Air moving in the room pushes on the pan. Close the draft shield and give it a few seconds.' };
  if (!reading.stable) {
    const hygro = s.pan.some((id) => s.objects[id].parts.some((p) => p.hygro && !(s.objects[id].lid && s.objects[id].lidOn) && p.gain < p.hygro.cap * 0.99));
    const warm = s.pan.some((id) => s.objects[id].dT > 2);
    return { key: 'unsteady', tone: 'info', title: 'Not steady yet', detail: hygro ? 'The sample is taking water from the air: the reading creeps up and will not stop. Put the lid on.' : warm ? 'The object is warmer than the room: the air rising round it lifts the pan. Let it cool.' : 'The asterisk lights when the display has stopped changing. Wait for it before you record.' };
  }
  if (drift > 1.5 && s.pan.length === 0) return { key: 'warming', tone: 'info', title: 'Still warming up', detail: `The zero is wandering by about ${(drift).toFixed(0)} counts as the electronics warm. Tare just before each weighing, or wait (the clock speed helps).` };
  if (s.pan.length === 0) return { key: 'empty', tone: 'info', title: 'Pan empty', detail: 'Put a container on the pan and press tare, then add the sample — or weigh the whole thing and subtract.' };
  return { key: 'steady', tone: 'ok', title: `Steady: ${reading.text} g`, detail: 'The reading has stopped changing. Record it — and then do it again, to see how much of the last digit is real.' };
}
