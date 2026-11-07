// Device connector: Web Share Target inbox (Cache API written by the service worker), clipboard, camera capture.
import { ConnectorError, confirmRequired, safeTool, addArtifact, TEXT_EXT } from './util.js';

/** Contract with the service worker (see report): cache name and key layout. */
export const SHARE_CACHE = 'guru-share-inbox-v1';
export const SHARE_PREFIX = '/__share__/';
const META_RE = /\/__share__\/([^/]+)\/meta\.json$/;

/**
 * @param {object} k kernel API
 * @param {{caches?:CacheStorage, nav?:Navigator, doc?:Document, loc?:Location}} [opts]
 */
export function createDevice(k, opts = {}) {
  const cachesApi = () => (opts.caches !== undefined ? opts.caches : (typeof caches !== 'undefined' ? caches : null));
  const nav = () => (opts.nav !== undefined ? opts.nav : (typeof navigator !== 'undefined' ? navigator : null));
  const doc = () => (opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null));
  const loc = () => (opts.loc !== undefined ? opts.loc : (typeof location !== 'undefined' ? location : null));
  const origin = () => { const l = loc(); return l && l.origin && l.origin !== 'null' ? l.origin : 'https://guru.local'; };
  let off = null;

  async function cache() {
    const c = cachesApi();
    if (!c) throw new ConnectorError('unsupported', 'Cache API unavailable');
    return c.open(SHARE_CACHE);
  }

  const api = {
    id: 'device', name: 'Device (share, clipboard, camera)', icon: 'phone',
    status() { return cachesApi() || (nav() && nav().clipboard) || doc() ? 'ready' : 'unsupported'; },
    async connect() { return { status: api.status() }; },
    async disconnect() { return { status: api.status() }; },

    inbox: {
      /** All shared items (newest first): {id,ts,title,text,url,files:[{name,type,size}]}. */
      async list() {
        const c = await cache();
        const reqs = await c.keys();
        const out = [];
        for (const r of reqs) {
          if (!META_RE.test(new URL(r.url).pathname)) continue;
          try { const res = await c.match(r); if (res) out.push(await res.json()); } catch { /* skip corrupt */ }
        }
        return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      },
      async get(id) {
        const c = await cache();
        const res = await c.match(`${origin()}${SHARE_PREFIX}${encodeURIComponent(id)}/meta.json`);
        if (!res) throw new ConnectorError('not_found', `Share ${id} not found`);
        return res.json();
      },
      /** Blob of the n-th shared file. */
      async file(id, n = 0) {
        const c = await cache();
        const res = await c.match(`${origin()}${SHARE_PREFIX}${encodeURIComponent(id)}/file/${n}`);
        if (!res) throw new ConnectorError('not_found', `Share ${id} file ${n} not found`);
        const blob = await res.blob();
        let name = `shared-${n}`;
        try { name = decodeURIComponent(res.headers.get('X-Filename') || name); } catch { /* keep default */ }
        return { blob, name, type: res.headers.get('Content-Type') || blob.type };
      },
      async remove(id) {
        const c = await cache();
        const prefix = `${SHARE_PREFIX}${encodeURIComponent(id)}/`;
        let n = 0;
        for (const r of await c.keys()) if (new URL(r.url).pathname.startsWith(prefix)) { await c.delete(r); n++; }
        return n;
      },
    },

    /** Listen for the SW's postMessage({type:'guru-share', id}) and ?share=<id> on load; emits bus 'share:received'. */
    watchShares() {
      if (off) return off;
      const cleanups = [];
      const fire = async (id) => {
        try { const item = await api.inbox.get(id); if (k && k.bus) k.bus.emit('share:received', item); } catch { /* ignore */ }
      };
      const sw = nav() && nav().serviceWorker;
      if (sw && sw.addEventListener) {
        const h = (e) => { if (e && e.data && e.data.type === 'guru-share' && e.data.id) fire(e.data.id); };
        sw.addEventListener('message', h); cleanups.push(() => sw.removeEventListener('message', h));
      }
      const l = loc();
      if (l && l.search) {
        const id = new URLSearchParams(l.search).get('share');
        if (id) {
          fire(id);
          try { const u = new URL(l.href); u.searchParams.delete('share'); if (typeof history !== 'undefined') history.replaceState(null, '', u.pathname + u.search + u.hash); } catch { /* ignore */ }
        }
      }
      off = () => { cleanups.forEach((f) => f()); off = null; };
      return off;
    },

    clipboard: {
      async readText() {
        const n = nav();
        if (!n || !n.clipboard || !n.clipboard.readText) throw new ConnectorError('unsupported', 'Clipboard read unavailable (needs HTTPS + user permission)');
        return n.clipboard.readText();
      },
      async writeText(text) {
        const n = nav();
        if (!n || !n.clipboard || !n.clipboard.writeText) throw new ConnectorError('unsupported', 'Clipboard write unavailable');
        await n.clipboard.writeText(String(text));
        return { written: String(text).length };
      },
    },

    /** Open the camera/file chooser via <input capture>. Needs a user gesture. Resolves a File or null (cancelled). */
    capture({ kind = 'image', facing = 'environment' } = {}) {
      const d = doc();
      if (!d) return Promise.reject(new ConnectorError('unsupported', 'Camera capture needs a browser'));
      return new Promise((resolve) => {
        const inp = d.createElement('input');
        inp.type = 'file';
        inp.accept = kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : 'image/*';
        inp.setAttribute('capture', facing === 'user' ? 'user' : 'environment');
        inp.style.display = 'none';
        inp.addEventListener('change', () => { const f = inp.files && inp.files[0] ? inp.files[0] : null; inp.remove(); resolve(f); });
        inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
        d.body.appendChild(inp);
        inp.click();
      });
    },

    // connector protocol: items are shares; read(`${id}` | `${id}/${n}`)
    async list() {
      const shares = await api.inbox.list();
      return { items: shares.map((s) => ({ id: s.id, name: s.title || (s.text || s.url || '').slice(0, 60) || `share ${s.id}`, mime: 'application/x-guru-share', size: (s.files || []).length, modified: s.ts ? new Date(s.ts).toISOString() : null, isDir: false, path: s.id })) };
    },
    async read(idOrPath, { as = 'json' } = {}) {
      const [id, n] = String(idOrPath).split('/');
      if (n !== undefined) {
        const f = await api.inbox.file(id, Number(n));
        if (as === 'blob') return f.blob;
        return f.blob.text();
      }
      return api.inbox.get(id);
    },
    async search(q) {
      const needle = String(q).toLowerCase();
      const shares = await api.inbox.list();
      const hit = shares.filter((s) => [s.title, s.text, s.url, ...(s.files || []).map((f) => f.name)].join(' ').toLowerCase().includes(needle));
      return { items: hit.map((s) => ({ id: s.id, name: s.title || s.url || s.id, mime: 'application/x-guru-share', size: (s.files || []).length, modified: s.ts ? new Date(s.ts).toISOString() : null, isDir: false, path: s.id })) };
    },
    async write(target, content) {
      if (target === 'clipboard') return { id: 'clipboard', name: 'clipboard', url: null, ...(await api.clipboard.writeText(content)) };
      throw new ConnectorError('unsupported', 'device.write only supports target "clipboard"');
    },
    async remove(id, { confirmed = false } = {}) {
      if (confirmed !== true) throw confirmRequired(`discard shared item ${id}`, { id });
      return { id, removed: await api.inbox.remove(id) };
    },
  };
  return api;
}

export function deviceTools(dev) {
  return [
    { name: 'device_inbox', tags: ['device'], description: 'Items shared to Guru from other Android apps (Web Share Target). action: list | read | discard (discard needs confirmed:true). read returns text/url and attaches shared files as artifacts.',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'read', 'discard'] }, id: { type: 'string' }, file: { type: 'number', description: 'file index to attach/read' }, confirmed: { type: 'boolean' } } },
      run: safeTool(async (a, ctx) => {
        const action = a.action || 'list';
        if (action === 'list') return { items: await dev.inbox.list() };
        if (!a.id) throw new ConnectorError('bad_args', 'id required');
        if (action === 'discard') return dev.remove(a.id, { confirmed: a.confirmed });
        const item = await dev.inbox.get(a.id);
        if (a.file === undefined) return { item };
        const f = await dev.inbox.file(a.id, a.file);
        if (TEXT_EXT.test(f.name) || /^text\//.test(f.type)) return { item, file: { name: f.name, type: f.type, text: (await f.blob.text()).slice(0, 200000) } };
        return { item, ...addArtifact(ctx, f.blob, f.name, f.type) };
      }) },
    { name: 'device_clipboard', tags: ['device'], description: 'Read or write the device clipboard (read needs user permission).',
      schema: { type: 'object', properties: { action: { type: 'string', enum: ['read', 'write'] }, text: { type: 'string' } }, required: ['action'] },
      run: safeTool(async (a) => (a.action === 'write' ? dev.clipboard.writeText(a.text || '') : { text: await dev.clipboard.readText() })) },
    { name: 'device_capture', tags: ['device'], description: 'Open the camera to capture a photo/video (needs a user gesture); result is attached as an artifact.',
      schema: { type: 'object', properties: { kind: { type: 'string', enum: ['image', 'video', 'audio'] }, facing: { type: 'string', enum: ['environment', 'user'] } } },
      run: safeTool(async (a, ctx) => {
        const f = await dev.capture({ kind: a.kind, facing: a.facing });
        if (!f) return { cancelled: true };
        return addArtifact(ctx, f, f.name, f.type);
      }) },
  ];
}
