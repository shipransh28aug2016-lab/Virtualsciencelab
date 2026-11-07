// Local files connector: File System Access API (persisted handle in IndexedDB) with <input type=file> + download fallback.
import { ConnectorError, confirmRequired, safeTool, toBlob, contentFromArgs, TEXT_EXT, mimeFromName, addArtifact } from './util.js';

export const DEFAULT_IGNORE = ['.git', 'node_modules', '.DS_Store', '__pycache__', '.cache', '.idea', '.vscode', 'Thumbs.db', '.gradle', 'build', 'dist'];
const DB = 'guru-connectors';
const STORE = 'kv';
const KEY = 'localfs.root';

/** Minimal IndexedDB key-value store; falls back to an in-memory Map. */
export function makeKv(idb) {
  const mem = new Map();
  const mod = idb === undefined ? (typeof indexedDB !== 'undefined' ? indexedDB : null) : idb;
  if (!mod) return { async get(key) { return mem.get(key); }, async set(key, v) { mem.set(key, v); }, async del(key) { mem.delete(key); } };
  const open = () => new Promise((resolve, reject) => {
    const r = mod.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => { resolve(req && req.result); db.close(); };
      t.onerror = () => { reject(t.error); db.close(); };
    });
  };
  return {
    get: (key) => tx('readonly', (s) => s.get(key)).catch(() => mem.get(key)),
    set: (key, v) => tx('readwrite', (s) => s.put(v, key)).catch(() => { mem.set(key, v); }),
    del: (key) => tx('readwrite', (s) => s.delete(key)).catch(() => { mem.delete(key); }),
  };
}

/** Split a relative path; rejects traversal. */
export function splitPath(p) {
  const segs = String(p || '').split(/[\\/]+/).filter((s) => s && s !== '.');
  if (segs.includes('..')) throw new ConnectorError('bad_path', 'Path traversal is not allowed');
  return segs;
}

function globToRegex(q) {
  if (!/[*?]/.test(q)) return null;
  return new RegExp(`^${q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

/**
 * @param {object} k kernel API
 * @param {{root?:object, kv?:object, idb?:any, win?:any, ignore?:string[]}} [opts] `root` injects a directory handle (tests)
 */
export function createLocalFs(k, opts = {}) {
  const win = opts.win !== undefined ? opts.win : (typeof window !== 'undefined' ? window : null);
  const kv = opts.kv || makeKv(opts.idb);
  const fallback = new Map(); // name -> File (input fallback)
  let root = opts.root || null;
  let granted = !!opts.root;

  const ignore = () => new Set(opts.ignore || (k && k.config ? k.config.get('localfs.ignore', DEFAULT_IGNORE) : DEFAULT_IGNORE));
  const supported = () => !!(win && typeof win.showDirectoryPicker === 'function');
  const canDom = () => typeof document !== 'undefined';

  async function ensurePermission(handle, mode = 'readwrite', request = true) {
    if (!handle || typeof handle.queryPermission !== 'function') return true;
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    if (!request || typeof handle.requestPermission !== 'function') return false;
    return (await handle.requestPermission({ mode })) === 'granted';
  }
  function needRoot() {
    if (!root) throw new ConnectorError('needs_auth', 'No folder selected. Use local_pick first (requires a user gesture).');
    if (!granted) throw new ConnectorError('needs_auth', 'Folder permission expired. Tap to re-grant (connect).');
    return root;
  }
  async function resolveDir(segs, create = false) {
    let d = needRoot();
    for (const s of segs) d = await d.getDirectoryHandle(s, { create });
    return d;
  }
  async function resolveFile(path, create = false) {
    const segs = splitPath(path);
    if (!segs.length) throw new ConnectorError('bad_path', 'File path required');
    const name = segs.pop();
    const dir = await resolveDir(segs, create);
    return { dir, name, handle: await dir.getFileHandle(name, { create }), segs };
  }
  async function* entries(dir) {
    if (typeof dir.values === 'function') { for await (const h of dir.values()) yield h; }
    else for await (const [, h] of dir.entries()) yield h;
  }
  async function toItem(h, prefix, withStat) {
    const path = prefix ? `${prefix}/${h.name}` : h.name;
    if (h.kind === 'directory') return { id: path, name: h.name, mime: 'inode/directory', size: 0, modified: null, isDir: true, path };
    let size = 0; let modified = null; let mime = mimeFromName(h.name);
    if (withStat) { try { const f = await h.getFile(); size = f.size; modified = f.lastModified ? new Date(f.lastModified).toISOString() : null; mime = f.type || mime; } catch { /* ignore */ } }
    return { id: path, name: h.name, mime, size, modified, isDir: false, path };
  }

  const api = {
    id: 'localfs', name: 'Local files', icon: 'folder',
    supported,
    status() {
      if (supported()) return root && granted ? 'ready' : 'needs-auth';
      if (canDom()) return fallback.size ? 'ready' : 'needs-auth';
      return opts.root ? 'ready' : 'unsupported';
    },
    /** Load a persisted handle; permission may still need a user gesture (see connect). */
    async restore() {
      if (!supported() && !opts.kv) return false;
      try {
        const h = await kv.get(KEY);
        if (!h) return false;
        root = h;
        granted = await ensurePermission(h, 'readwrite', false);
        return granted;
      } catch { return false; }
    },
    /** Pick a directory (user gesture) or re-grant a stored one. */
    async connect({ forcePick = false } = {}) {
      if (supported()) {
        if (root && !forcePick && (await ensurePermission(root, 'readwrite', true))) { granted = true; return { status: 'ready', name: root.name }; }
        const h = await win.showDirectoryPicker({ mode: 'readwrite', id: 'guru-root' });
        root = h; granted = true;
        await kv.set(KEY, h);
        return { status: 'ready', name: h.name };
      }
      const files = await api.pickFiles({ multiple: true });
      return { status: files.length ? 'ready' : 'needs-auth', files: files.map((f) => f.name), fallback: true };
    },
    async disconnect() { root = null; granted = false; fallback.clear(); try { await kv.del(KEY); } catch { /* ignore */ } return { status: api.status() }; },

    /** Fallback: <input type=file>. Needs a user gesture. Returns File[]. */
    pickFiles({ accept, multiple = true } = {}) {
      if (!canDom()) return Promise.reject(new ConnectorError('unsupported', 'No DOM available for file input'));
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.multiple = multiple; if (accept) inp.accept = accept;
        inp.style.display = 'none';
        inp.addEventListener('change', () => {
          const files = Array.from(inp.files || []);
          for (const f of files) fallback.set(f.name, f);
          inp.remove(); resolve(files);
        });
        inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
        document.body.appendChild(inp);
        inp.click();
      });
    },
    /** Fallback: trigger a download of a Blob. */
    download(name, content, mime) {
      if (!canDom()) throw new ConnectorError('unsupported', 'Download needs a browser');
      const blob = toBlob(content, mime || mimeFromName(name));
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { id: name, name, url: null, downloaded: true };
    },

    async list(path = '') {
      if (!root && !opts.root) {
        return { items: Array.from(fallback.values()).map((f) => ({ id: f.name, name: f.name, mime: f.type || mimeFromName(f.name), size: f.size, modified: f.lastModified ? new Date(f.lastModified).toISOString() : null, isDir: false, path: f.name })) };
      }
      const segs = splitPath(path);
      const dir = await resolveDir(segs);
      const skip = ignore();
      const prefix = segs.join('/');
      const items = [];
      for await (const h of entries(dir)) { if (!skip.has(h.name)) items.push(await toItem(h, prefix, true)); }
      items.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      return { items };
    },

    async read(path, { as = 'text' } = {}) {
      let file;
      if (!root && fallback.has(path)) file = fallback.get(path);
      else file = await (await resolveFile(path)).handle.getFile();
      if (as === 'blob') return file;
      if (as === 'bytes') return new Uint8Array(await file.arrayBuffer());
      const text = await file.text();
      return as === 'json' ? JSON.parse(text) : text;
    },
    async exists(path) { try { await resolveFile(path); return true; } catch { return false; } },

    /** Write a file (creates folders). Overwriting needs confirmed:true unless `overwrite` is false-y with new file. */
    async write(path, content, { mime, name, create = true, confirmed = false } = {}) {
      const target = path || name;
      if (!target) throw new ConnectorError('bad_path', 'path or name required');
      if (!root) {
        if (canDom()) return api.download(splitPath(target).pop(), content, mime);
        throw new ConnectorError('needs_auth', 'No folder selected');
      }
      needRoot();
      const segs = splitPath(target);
      const fname = segs.pop();
      const existing = await api.exists(segs.concat(fname).join('/'));
      if (existing && confirmed !== true) throw confirmRequired(`overwrite local file ${target}`, { path: target });
      if (!existing && create === false) throw new ConnectorError('not_found', `${target} does not exist`);
      if (!(await ensurePermission(root, 'readwrite', true))) throw new ConnectorError('permission_denied', 'Write permission denied');
      const dir = await resolveDir(segs, true);
      const fh = await dir.getFileHandle(fname, { create: true });
      const w = await fh.createWritable();
      await w.write(typeof content === 'string' ? content : toBlob(content, mime));
      await w.close();
      return { id: [...segs, fname].join('/'), name: fname, url: null, overwritten: existing };
    },

    /** Recursive name (glob/substring) and optional content search honoring the ignore list. */
    async search(q, { path = '', content = false, max = 50, maxDepth = 8, maxFileBytes = 1024 * 1024 } = {}) {
      const query = String(q);
      const re = globToRegex(query);
      const needle = query.toLowerCase();
      const skip = ignore();
      const items = [];
      const startSegs = splitPath(path);
      const startDir = await resolveDir(startSegs);
      async function walk(dir, prefix, depth) {
        for await (const h of entries(dir)) {
          if (items.length >= max) return;
          if (skip.has(h.name)) continue;
          const p = prefix ? `${prefix}/${h.name}` : h.name;
          const nameHit = re ? re.test(h.name) : h.name.toLowerCase().includes(needle);
          if (nameHit) { items.push(await toItem(h, prefix, true)); }
          if (h.kind === 'directory') { if (depth < maxDepth) await walk(h, p, depth + 1); continue; }
          if (content && !nameHit && !re && TEXT_EXT.test(h.name)) {
            try {
              const f = await h.getFile();
              if (f.size <= maxFileBytes) {
                const t = await f.text();
                const i = t.toLowerCase().indexOf(needle);
                if (i >= 0) { const it = await toItem(h, prefix, true); it.snippet = t.slice(Math.max(0, i - 60), i + needle.length + 60).replace(/\s+/g, ' '); items.push(it); }
              }
            } catch { /* unreadable */ }
          }
        }
      }
      await walk(startDir, startSegs.join('/'), 0);
      return { items: items.slice(0, max) };
    },

    async remove(path, { confirmed = false } = {}) {
      if (confirmed !== true) throw confirmRequired(`delete local entry ${path}`, { path });
      const segs = splitPath(path);
      const name = segs.pop();
      if (!name) throw new ConnectorError('bad_path', 'Refusing to delete the root');
      const dir = await resolveDir(segs);
      await dir.removeEntry(name, { recursive: false });
      return { id: path, removed: true };
    },
  };
  return api;
}

export function localTools(fs) {
  return [
    { name: 'local_pick', tags: ['local'], description: 'Select (or reconnect) a local folder with the File System Access API, then optionally list a sub path or read a file. Needs a user gesture to pick; falls back to a file input on unsupported browsers.',
      schema: { type: 'object', properties: { path: { type: 'string', description: 'Sub path to list' }, read: { type: 'string', description: 'File path to read as text' }, forcePick: { type: 'boolean' }, search: { type: 'string' }, content: { type: 'boolean' } } },
      run: safeTool(async (a) => {
        if (fs.status() !== 'ready' || a.forcePick) await fs.connect({ forcePick: !!a.forcePick });
        if (a.read) return { path: a.read, text: (await fs.read(a.read, { as: 'text' })).slice(0, 200000) };
        if (a.search) return fs.search(a.search, { path: a.path || '', content: !!a.content });
        return { status: fs.status(), ...(await fs.list(a.path || '')) };
      }) },
    { name: 'local_save', tags: ['local'], description: 'Save a file to the picked local folder (overwrite needs confirmed:true). Without a folder, triggers a browser download.',
      schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, contentBase64: { type: 'string' }, mime: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['path'] },
      run: safeTool(async (a) => fs.write(a.path, contentFromArgs(a), { mime: a.mime, confirmed: a.confirmed })) },
    { name: 'local_read', tags: ['local'], description: 'Read a text file from the picked local folder.',
      schema: { type: 'object', properties: { path: { type: 'string' }, maxChars: { type: 'number' } }, required: ['path'] },
      run: safeTool(async (a, ctx) => {
        if (!TEXT_EXT.test(a.path)) { const b = await fs.read(a.path, { as: 'blob' }); return addArtifact(ctx, b, a.path.split('/').pop(), b.type); }
        const t = await fs.read(a.path, { as: 'text' }); const max = a.maxChars || 200000;
        return { path: a.path, text: t.slice(0, max), truncated: t.length > max };
      }) },
    { name: 'local_delete', tags: ['local', 'destructive'], description: 'Delete a local file or empty folder. Requires confirmed:true.',
      schema: { type: 'object', properties: { path: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['path'] },
      run: safeTool(async (a) => fs.remove(a.path, { confirmed: a.confirmed })) },
  ];
}
