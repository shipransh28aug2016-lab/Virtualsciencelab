// Persisted config: localStorage when available, in-memory otherwise (Node, private mode).

export function createConfig({ prefix = 'guru.', bus, storage } = {}) {
  let store = storage || null;
  if (!store) {
    try {
      const s = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
      if (s) { s.getItem(prefix + '__probe'); store = s; }
    } catch { store = null; }
  }
  const mem = new Map();
  return {
    get(key, def) {
      try {
        if (store) {
          const v = store.getItem(prefix + key);
          if (v !== null && v !== undefined) return JSON.parse(v);
        }
      } catch { /* fall through to memory */ }
      return mem.has(key) ? mem.get(key) : def;
    },
    set(key, val) {
      mem.set(key, val);
      try { if (store) store.setItem(prefix + key, JSON.stringify(val)); } catch { /* quota/blocked */ }
      bus?.emit('config:change', { key, value: val });
      return val;
    },
    remove(key) {
      mem.delete(key);
      try { store?.removeItem(prefix + key); } catch { /* ignore */ }
    },
  };
}
