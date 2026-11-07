// Persistent memory store: IndexedDB with in-memory fallback (Node, private mode, errors).
// All records are cached in a Map (write-through) so reads are synchronous and fast.

export const SCHEMA_VERSION = 1;
const APP = 'guru-memory';

function openIDB(name) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, SCHEMA_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('mem')) db.createObjectStore('mem', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('idb open failed'));
    r.onblocked = () => reject(new Error('idb blocked'));
  });
}

function run(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    let req;
    const t = db.transaction(store, mode);
    try { req = fn(t.objectStore(store)); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('tx aborted'));
  });
}

/** Upgrade older export payloads to the current schema. */
export function migrate(data) {
  if (Array.isArray(data)) data = { app: APP, version: 1, memories: data, meta: {} };
  if (!data || typeof data !== 'object') throw new Error('invalid memory export');
  if (data.app && data.app !== APP) throw new Error('not a guru memory export');
  const v = Number(data.version || 1);
  if (v > SCHEMA_VERSION) throw new Error(`export version ${v} is newer than supported ${SCHEMA_VERSION}`);
  return { app: APP, version: SCHEMA_VERSION, memories: Array.isArray(data.memories) ? data.memories : [], meta: data.meta && typeof data.meta === 'object' ? data.meta : {} };
}

/**
 * @param {{name?:string, backend?:'auto'|'memory'}} [opts]
 */
export function createStore(opts = {}) {
  const name = opts.name || 'guru-memory';
  const mem = new Map();
  const meta = new Map();
  let db = null;
  let kind = 'memory';
  let readyP = null;

  async function init() {
    if (opts.backend !== 'memory' && typeof indexedDB !== 'undefined') {
      try {
        db = await openIDB(name);
        const rows = await run(db, 'mem', 'readonly', (s) => s.getAll());
        const mrows = await run(db, 'meta', 'readonly', (s) => s.getAll());
        for (const r of rows || []) mem.set(r.id, r);
        for (const m of mrows || []) meta.set(m.key, m.value);
        kind = 'idb';
      } catch { db = null; kind = 'memory'; }
    }
    return api;
  }

  async function persist(storeName, fn) {
    if (!db) return;
    try { await run(db, storeName, 'readwrite', fn); } catch { /* degrade to cache-only */ }
  }

  const api = {
    get kind() { return kind; },
    ready() { return (readyP ||= init()); },
    get(id) { return mem.get(id); },
    all() { return [...mem.values()]; },
    get size() { return mem.size; },
    async put(rec) { mem.set(rec.id, rec); await persist('mem', (s) => s.put(rec)); return rec; },
    async putMany(recs) {
      for (const r of recs) mem.set(r.id, r);
      if (db) await persist('mem', (s) => { let q; for (const r of recs) q = s.put(r); return q; });
    },
    async del(id) { const had = mem.delete(id); await persist('mem', (s) => s.delete(id)); return had; },
    async delMany(ids) {
      for (const id of ids) mem.delete(id);
      if (db) await persist('mem', (s) => { let q; for (const id of ids) q = s.delete(id); return q; });
    },
    getMeta(key, def) { return meta.has(key) ? meta.get(key) : def; },
    async setMeta(key, value) { meta.set(key, value); await persist('meta', (s) => s.put({ key, value })); },
    async clear() {
      mem.clear(); meta.clear();
      if (db) { await persist('mem', (s) => s.clear()); await persist('meta', (s) => s.clear()); }
    },
    /** @returns {object} JSON-serialisable snapshot */
    export() {
      return { app: APP, version: SCHEMA_VERSION, exported: Date.now(), memories: this.all(), meta: Object.fromEntries(meta) };
    },
    /**
     * @param {string|object} json
     * @param {{replace?:boolean}} [o] replace=true wipes first; otherwise merge (newer record wins, missing meta keys added)
     * @returns {Promise<{memories:number, meta:number}>}
     */
    async import(json, o = {}) {
      const data = migrate(typeof json === 'string' ? JSON.parse(json) : json);
      if (o.replace) await this.clear();
      const add = [];
      for (const r of data.memories) {
        if (!r || typeof r.id !== 'string' || typeof r.text !== 'string') continue;
        const cur = mem.get(r.id);
        if (!cur || (r.updated || 0) > (cur.updated || 0)) add.push(r);
      }
      await this.putMany(add);
      let m = 0;
      for (const [k, v] of Object.entries(data.meta)) {
        if (!meta.has(k)) { await this.setMeta(k, v); m++; }
      }
      return { memories: add.length, meta: m };
    },
  };
  return api;
}
