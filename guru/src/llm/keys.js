// API-key vault. Optional passphrase => AES-GCM-256 with a PBKDF2-SHA256 derived key (WebCrypto).
// Without a passphrase keys are only base64-encoded (NOT encrypted) in localStorage. Keys are never logged.

const KEY = 'guru.llm.keys.v1';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) { localStorage.getItem(KEY); return localStorage; }
  } catch { /* blocked storage */ }
  return memoryStorage();
}

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/**
 * @param {{storage?:Storage, storageKey?:string, crypto?:Crypto, iterations?:number}} [o]
 */
export function createKeyVault(o = {}) {
  const storage = o.storage || defaultStorage();
  const storageKey = o.storageKey || KEY;
  const iterations = o.iterations || 210000;
  const cache = new Map(); // provider -> plaintext key (session memory only)
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const getCrypto = () => {
    const c = o.crypto || globalThis.crypto;
    if (!c || !c.subtle) throw new Error('WebCrypto unavailable: cannot use a passphrase here');
    return c;
  };

  function load() {
    try { const j = JSON.parse(storage.getItem(storageKey) || '{}'); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
  }
  function save(db) { try { storage.setItem(storageKey, JSON.stringify(db)); } catch { /* quota/blocked: keep in memory only */ } }

  async function derive(passphrase, salt, it) {
    const c = getCrypto();
    const base = await c.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(provider, key, passphrase) {
    const c = getCrypto();
    const salt = c.getRandomValues(new Uint8Array(16));
    const iv = c.getRandomValues(new Uint8Array(12));
    const k = await derive(passphrase, salt, iterations);
    const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(provider) }, k, enc.encode(key)));
    return { v: 1, enc: true, kdf: 'PBKDF2-SHA256', it: iterations, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(provider, e, passphrase) {
    const k = await derive(passphrase, unb64(e.salt), e.it || iterations);
    try {
      const pt = await getCrypto().subtle.decrypt({ name: 'AES-GCM', iv: unb64(e.iv), additionalData: enc.encode(provider) }, k, unb64(e.ct));
      return dec.decode(pt);
    } catch { throw new Error('Wrong passphrase or corrupted key store'); }
  }

  return {
    /** Store a key; with passphrase it is encrypted at rest. Empty key removes it. */
    async set(provider, key, { passphrase } = {}) {
      if (!provider) throw new Error('provider required');
      if (!key) return this.remove(provider);
      const db = load();
      db[provider] = passphrase ? await encrypt(provider, key, passphrase) : { v: 1, enc: false, k: b64(enc.encode(key)) };
      save(db);
      cache.set(provider, key);
    },
    /** @returns {Promise<string|null>} plaintext key, or null if absent/locked. Throws on wrong passphrase. */
    async get(provider, { passphrase } = {}) {
      if (cache.has(provider)) return cache.get(provider);
      const e = load()[provider];
      if (!e) return null;
      if (!e.enc) { const k = dec.decode(unb64(e.k)); cache.set(provider, k); return k; }
      if (!passphrase) return null;
      const k = await decrypt(provider, e, passphrase);
      cache.set(provider, k);
      return k;
    },
    /** Sync: is a key stored (even if locked)? */
    has(provider) { return !!load()[provider]; },
    isEncrypted(provider) { return !!load()[provider]?.enc; },
    isLocked(provider) { const e = load()[provider]; return !!e && !!e.enc && !cache.has(provider); },
    /** Decrypt every encrypted entry with the passphrase into session memory. */
    async unlock(passphrase) {
      const db = load();
      let unlocked = 0, failed = 0;
      for (const [p, e] of Object.entries(db)) {
        if (!e.enc || cache.has(p)) continue;
        try { cache.set(p, await decrypt(p, e, passphrase)); unlocked++; } catch { failed++; }
      }
      return { unlocked, failed };
    },
    /** Forget decrypted keys held in memory. */
    lock() { cache.clear(); },
    remove(provider) { const db = load(); delete db[provider]; save(db); cache.delete(provider); },
    clear() { cache.clear(); try { storage.removeItem(storageKey); } catch { /* ignore */ } },
    list() {
      return Object.entries(load()).map(([provider, e]) => ({ provider, encrypted: !!e.enc, unlocked: cache.has(provider) }));
    },
  };
}
