/**
 * IndexedDB persistence (§19). Promise wrapper, no dependencies.
 * Stores: studentProfile, experimentProgress, observations, assessmentResults,
 *         vivaAttempts, settings, syncQueue.
 * Every write is local-first; sync is optional and never blocks lab work.
 */
const DB_NAME = 'cbse-vlab';
const DB_VERSION = 1;
const STORES = [
  'studentProfile', 'experimentProgress', 'experimentAttempts', 'observations',
  'assessmentResults', 'vivaAttempts', 'settings', 'cachedCurriculum', 'syncQueue',
];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const opts = name === 'syncQueue' ? { keyPath: 'id', autoIncrement: true } : { keyPath: 'key' };
          db.createObjectStore(name, opts);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * Run one transaction and resolve with the IDBRequest's result.
 *
 * Subtlety that caused a real bug: `store.get()` returns an IDBRequest whose
 * `.result` is NOT populated synchronously. Reading it when the transaction
 * completes is a race — we must wait for the request's own `onsuccess`. Reads
 * therefore resolve from the request, and writes resolve on transaction
 * completion (so the data is genuinely durable before we continue).
 */
function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let req;
    try { req = fn(s); } catch (e) { reject(e); return; }

    let value;
    let settled = false;
    if (req && typeof req === 'object' && 'onsuccess' in req) {
      req.onsuccess = () => { value = req.result; };
      req.onerror = () => { if (!settled) { settled = true; reject(req.error); } };
    }
    t.oncomplete = () => { if (!settled) { settled = true; resolve(value); } };
    t.onerror = () => { if (!settled) { settled = true; reject(t.error); } };
    t.onabort = () => { if (!settled) { settled = true; reject(t.error); } };
  }));
}

/** Memory fallback so the lab still works in private mode / blocked storage. */
const memory = new Map();
const memKey = (store, key) => `${store}:${key}`;

export async function put(store, key, value) {
  const record = { key, value, updated: Date.now() };
  try { await tx(store, 'readwrite', (s) => s.put(record)); }
  catch { memory.set(memKey(store, key), record); }
  return value;
}

export async function get(store, key, fallback = null) {
  try {
    const record = await tx(store, 'readonly', (s) => s.get(key));
    // A miss yields undefined; a hit is our {key, value, updated} wrapper.
    if (record && record.value !== undefined) return record.value;
    return fallback;
  } catch {
    const m = memory.get(memKey(store, key));
    return m ? m.value : fallback;
  }
}

export async function getAll(store) {
  try {
    const rows = (await tx(store, 'readonly', (s) => s.getAll())) || [];
    return rows.map((r) => (r && r.value !== undefined ? r.value : r));
  } catch {
    return [...memory.entries()]
      .filter(([k]) => k.startsWith(`${store}:`))
      .map(([, v]) => v.value);
  }
}

export async function del(store, key) {
  try { await tx(store, 'readwrite', (s) => s.delete(key)); }
  catch { memory.delete(memKey(store, key)); }
}

/** Queue a change for optional sync when a network appears. Never blocks. */
export async function enqueueSync(type, payload) {
  try {
    await tx('syncQueue', 'readwrite', (s) => s.add({ type, payload, at: Date.now() }));
  } catch { /* offline-only install: queue is best effort */ }
}

/* ── domain helpers ───────────────────────────────────────────── */

export const saveObservations = (expId, rows) => put('observations', expId, rows);
export const loadObservations = (expId) => get('observations', expId, []);

export async function saveProgress(expId, patch) {
  const prev = (await get('experimentProgress', expId, {})) || {};
  const next = { ...prev, ...patch, expId, updated: Date.now() };
  await put('experimentProgress', expId, next);
  await enqueueSync('progress', next);
  return next;
}
export const loadProgress = (expId) => get('experimentProgress', expId, null);
export const allProgress = () => getAll('experimentProgress');

export const saveAssessment = (expId, result) => put('assessmentResults', expId, result);
export const loadAssessment = (expId) => get('assessmentResults', expId, null);

export const saveNotebook = (expId, note) => put('experimentAttempts', `${expId}:notebook`, note);
export const loadNotebook = (expId) => get('experimentAttempts', `${expId}:notebook`, null);

/** Settings use localStorage: they must be readable synchronously at boot. */
export function getSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(`vlab:${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
export function setSetting(key, value) {
  try { localStorage.setItem(`vlab:${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  put('settings', key, value).catch(() => {});
}
