// Google Drive / Docs / Sheets / Slides connector (REST + Google Identity Services token client).
import {
  ConnectorError, confirmRequired, requestWithRetry, errorFromResponse, toBlob, toBytes, mimeFromName,
  safeTool, contentFromArgs, addArtifact, fromUtf8,
} from './util.js';

export const SCOPES = {
  file: 'https://www.googleapis.com/auth/drive.file',
  readonly: 'https://www.googleapis.com/auth/drive.readonly',
  docs: 'https://www.googleapis.com/auth/documents',
  sheets: 'https://www.googleapis.com/auth/spreadsheets',
  slides: 'https://www.googleapis.com/auth/presentations',
};
export const DEFAULT_SCOPES = Object.values(SCOPES);
export const GIS_URL = 'https://accounts.google.com/gsi/client';
export const FOLDER = 'application/vnd.google-apps.folder';
export const NATIVE = {
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
};
const OOXML = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
/** Export formats per Google-native type. */
export const EXPORTS = {
  [NATIVE.doc]: { docx: OOXML.docx, pdf: 'application/pdf', txt: 'text/plain', html: 'text/html', md: 'text/markdown', odt: 'application/vnd.oasis.opendocument.text', epub: 'application/epub+zip' },
  [NATIVE.sheet]: { xlsx: OOXML.xlsx, pdf: 'application/pdf', csv: 'text/csv', tsv: 'text/tab-separated-values', ods: 'application/x-vnd.oasis.opendocument.spreadsheet' },
  [NATIVE.slides]: { pptx: OOXML.pptx, pdf: 'application/pdf', txt: 'text/plain', odp: 'application/vnd.oasis.opendocument.presentation' },
};
const CONVERT_MAP = [
  [/^(text\/(plain|markdown|html|rtf)|application\/(rtf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.oasis\.opendocument\.text|msword))$/, NATIVE.doc],
  [/^(text\/(csv|tab-separated-values)|application\/(vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|vnd\.oasis\.opendocument\.spreadsheet|vnd\.ms-excel))$/, NATIVE.sheet],
  [/^application\/(vnd\.openxmlformats-officedocument\.presentationml\.presentation|vnd\.oasis\.opendocument\.presentation|vnd\.ms-powerpoint)$/, NATIVE.slides],
];
const FIELDS = 'id,name,mimeType,size,modifiedTime,parents,webViewLink,trashed';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Decide target Google-native mime for convert-on-upload. `convert`: true|'doc'|'sheet'|'slides'. */
export function convertTarget(convert, sourceMime) {
  if (!convert) return null;
  if (typeof convert === 'string' && NATIVE[convert]) return NATIVE[convert];
  if (typeof convert === 'string' && Object.values(NATIVE).includes(convert)) return convert;
  for (const [re, target] of CONVERT_MAP) if (re.test(sourceMime || '')) return target;
  throw new ConnectorError('cannot_convert', `No Google-native conversion for ${sourceMime}`);
}

/** Build a multipart/related upload body. */
export function buildMultipart(metadata, blob, mime, boundary) {
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  return new Blob([head, blob, `\r\n--${boundary}--`], { type: `multipart/related; boundary=${boundary}` });
}

function docText(doc) {
  const out = [];
  const walk = (els) => {
    for (const el of els || []) {
      if (el.paragraph) {
        out.push((el.paragraph.elements || []).map((e) => (e.textRun && e.textRun.content) || '').join('').replace(/\n$/, ''));
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          out.push((row.tableCells || []).map((c) => {
            const sub = []; const save = out.length; walk(c.content); sub.push(...out.splice(save)); return sub.join(' ');
          }).join('\t'));
        }
      }
    }
  };
  walk(doc.body && doc.body.content);
  return out.join('\n');
}
function slidesText(pres) {
  return (pres.slides || []).map((s, i) => {
    const parts = [];
    for (const pe of s.pageElements || []) {
      for (const te of (pe.shape && pe.shape.text && pe.shape.text.textElements) || []) {
        if (te.textRun && te.textRun.content) parts.push(te.textRun.content);
      }
    }
    return `--- Slide ${i + 1} ---\n${parts.join('').trim()}`;
  }).join('\n\n');
}

/**
 * @param {object} k kernel API
 * @param {{fetch?:Function, sleep?:Function, loadGis?:Function, clientId?:string, resumableThreshold?:number, chunkSize?:number}} [opts]
 */
export function createGdrive(k, opts = {}) {
  const cfg = (key, def) => (k && k.config ? k.config.get(key, def) : def);
  const doFetch = (...a) => (opts.fetch || globalThis.fetch)(...a);
  let token = null;
  let expiresAt = 0;
  let tokenClient = null;
  let clientForId = null;
  let pending = null;
  let gisPromise = null;
  let consented = false;

  const clientId = () => opts.clientId || cfg('google.clientId', '') || '';
  const scopes = () => { const s = cfg('google.scopes', null); return Array.isArray(s) && s.length ? s : DEFAULT_SCOPES; };

  function loadGis() {
    if (opts.loadGis) return opts.loadGis();
    const g = globalThis.google;
    if (g && g.accounts && g.accounts.oauth2) return Promise.resolve(g.accounts.oauth2);
    if (typeof document === 'undefined') return Promise.reject(new ConnectorError('unsupported', 'Google Identity Services needs a browser'));
    if (!gisPromise) {
      gisPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = GIS_URL; s.async = true; s.defer = true;
        s.onload = () => (globalThis.google && globalThis.google.accounts ? resolve(globalThis.google.accounts.oauth2) : reject(new ConnectorError('gis_failed', 'GIS loaded without oauth2')));
        s.onerror = () => { gisPromise = null; reject(new ConnectorError('gis_failed', 'Could not load Google Identity Services')); };
        document.head.appendChild(s);
      });
    }
    return gisPromise;
  }

  async function requestToken(prompt) {
    const id = clientId();
    if (!id) throw new ConnectorError('needs_auth', 'Set your Google OAuth Client ID in settings (google.clientId)');
    const oauth2 = await loadGis();
    if (!tokenClient || clientForId !== id) {
      clientForId = id;
      tokenClient = oauth2.initTokenClient({
        client_id: id,
        scope: scopes().join(' '),
        callback: (r) => pending && pending.resolve(r),
        error_callback: (e) => pending && pending.reject(new ConnectorError('auth_failed', (e && (e.message || e.type)) || 'auth failed')),
      });
    }
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      try { tokenClient.requestAccessToken(prompt === undefined ? {} : { prompt }); } catch (e) { reject(new ConnectorError('auth_failed', e.message)); }
    }).then((r) => {
      if (!r || r.error || !r.access_token) throw new ConnectorError('auth_failed', (r && (r.error_description || r.error)) || 'no token');
      token = r.access_token;
      expiresAt = Date.now() + Math.max(60, Number(r.expires_in) || 3600) * 1000 - 60000;
      consented = true;
      return token;
    });
  }

  async function ensureToken() {
    if (token && Date.now() < expiresAt) return token;
    return requestToken(consented ? '' : undefined);
  }

  function buildUrl(url, query) {
    const u = new URL(url);
    for (const [kk, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(kk, String(v));
    return u.toString();
  }

  /** Authenticated request with 401-refresh and backoff. Returns parsed JSON (or Response when raw). */
  async function call(url, { method = 'GET', headers = {}, body, query, raw = false, okStatuses = [] } = {}) {
    const full = buildUrl(url, query);
    const res = await requestWithRetry(doFetch, async () => {
      const t = await ensureToken();
      return [full, { method, headers: { Authorization: `Bearer ${t}`, ...headers }, body }];
    }, { sleep: opts.sleep, baseDelay: opts.baseDelay, retries: opts.retries, onUnauthorized: async () => { token = null; expiresAt = 0; } });
    if (raw) return res;
    if (!res.ok && !okStatuses.includes(res.status)) throw await errorFromResponse(res);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const mapFile = (f) => ({
    id: f.id, name: f.name, mime: f.mimeType, size: f.size ? Number(f.size) : 0, modified: f.modifiedTime || null,
    isDir: f.mimeType === FOLDER, path: f.id, url: f.webViewLink || null, parents: f.parents || [],
    native: Object.values(NATIVE).includes(f.mimeType),
  });

  const api = {
    id: 'gdrive', name: 'Google Drive', icon: 'drive',
    SCOPES, FOLDER, NATIVE,

    status() {
      if (token && Date.now() < expiresAt) return 'ready';
      if (!opts.loadGis && typeof document === 'undefined' && !(globalThis.google && globalThis.google.accounts)) return 'unsupported';
      return 'needs-auth';
    },
    /** Interactive sign-in (call from a user gesture). */
    async connect() { await requestToken(undefined); return { status: 'ready' }; },
    /** Provide an externally obtained access token (e.g. tests, native shells). */
    setToken(t, expiresInSec = 3600) { token = t; expiresAt = Date.now() + expiresInSec * 1000 - 60000; consented = true; },
    async disconnect() {
      const t = token; token = null; expiresAt = 0; consented = false;
      try {
        const g = globalThis.google;
        if (t && g && g.accounts && g.accounts.oauth2 && g.accounts.oauth2.revoke) g.accounts.oauth2.revoke(t, () => {});
      } catch { /* ignore */ }
      return { status: api.status() };
    },

    /** List a folder (id; ''|'root' = My Drive), raw query ('q:...') or name search. */
    async list(pathOrQuery = '', { pageToken, pageSize = 100, orderBy = 'folder,name' } = {}) {
      let q;
      const p = String(pathOrQuery || '');
      if (!p || p === 'root' || p === '/') q = "'root' in parents and trashed=false";
      else if (p.startsWith('q:')) q = p.slice(2);
      else if (/^[\w-]{10,}$/.test(p)) q = `'${esc(p)}' in parents and trashed=false`;
      else q = `name contains '${esc(p)}' and trashed=false`;
      return api._files(q, { pageToken, pageSize, orderBy });
    },
    async _files(q, { pageToken, pageSize = 100, orderBy } = {}) {
      const r = await call(`${API}/files`, { query: {
        q, pageSize, pageToken, orderBy, fields: `nextPageToken,files(${FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true,
      } });
      return { items: (r.files || []).map(mapFile), next: r.nextPageToken || undefined };
    },
    /** Follow nextPageToken until exhausted or `max` items collected. */
    async listAll(pathOrQuery, { max = 1000, ...o } = {}) {
      const items = [];
      let pageToken;
      do {
        const r = await (o.search ? api.search(pathOrQuery, { pageToken }) : api.list(pathOrQuery, { pageToken, ...o }));
        items.push(...r.items);
        pageToken = r.next;
      } while (pageToken && items.length < max);
      return { items: items.slice(0, max), next: pageToken };
    },
    async search(text, { pageToken, pageSize = 50 } = {}) {
      const t = String(text);
      const q = t.startsWith('q:') ? t.slice(2) : `(name contains '${esc(t)}' or fullText contains '${esc(t)}') and trashed=false`;
      return api._files(q, { pageToken, pageSize, orderBy: 'modifiedTime desc' });
    },
    async meta(id) { return mapFile(await call(`${API}/files/${encodeURIComponent(id)}`, { query: { fields: FIELDS, supportsAllDrives: true } })); },

    /** Read a file's content. Returns {meta, content}. */
    async readFile(id, { as = 'text', range } = {}) {
      const meta = await api.meta(id);
      const enc = encodeURIComponent(id);
      if (meta.mime === NATIVE.doc && as !== 'blob') {
        const d = await call(`https://docs.googleapis.com/v1/documents/${enc}`);
        return { meta, content: as === 'json' ? d : docText(d) };
      }
      if (meta.mime === NATIVE.slides && as !== 'blob') {
        const d = await call(`https://slides.googleapis.com/v1/presentations/${enc}`);
        return { meta, content: as === 'json' ? d : slidesText(d) };
      }
      if (meta.mime === NATIVE.sheet && as !== 'blob') {
        const sheets = await api.sheetValues(id, range);
        return { meta, content: as === 'json' ? sheets : sheets.map((s) => `# ${s.name}\n${s.values.map((r) => r.join('\t')).join('\n')}`).join('\n\n') };
      }
      if (meta.native) {
        const ext = meta.mime === NATIVE.doc ? 'docx' : meta.mime === NATIVE.sheet ? 'xlsx' : 'pptx';
        const ex = await api.exportFile(id, ext);
        return { meta, content: ex.blob };
      }
      const res = await call(`${API}/files/${enc}`, { query: { alt: 'media', supportsAllDrives: true }, raw: true });
      if (!res.ok) throw await errorFromResponse(res);
      if (as === 'blob') return { meta, content: await res.blob() };
      if (as === 'json') return { meta, content: await res.json() };
      return { meta, content: await res.text() };
    },
    async read(id, o) { return (await api.readFile(id, o)).content; },

    /** Export a Google-native file to docx|xlsx|pptx|pdf|... */
    async exportFile(id, format = 'pdf') {
      const meta = await api.meta(id);
      const table = EXPORTS[meta.mime];
      if (!table) throw new ConnectorError('not_native', `${meta.name} is not a Google Docs/Sheets/Slides file; use read()`);
      const mime = table[String(format).toLowerCase()];
      if (!mime) throw new ConnectorError('bad_format', `Supported export formats: ${Object.keys(table).join(', ')}`);
      const res = await call(`${API}/files/${encodeURIComponent(id)}/export`, { query: { mimeType: mime }, raw: true });
      if (!res.ok) throw await errorFromResponse(res);
      return { blob: await res.blob(), mime, filename: `${meta.name}.${String(format).toLowerCase()}`, meta };
    },

    /** Sheets values: all tabs (or one A1 range). Returns [{name, values}]. */
    async sheetValues(id, range) {
      const enc = encodeURIComponent(id);
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${enc}`;
      if (range) {
        const r = await call(`${base}/values/${encodeURIComponent(range)}`);
        return [{ name: r.range || range, values: r.values || [] }];
      }
      const m = await call(base, { query: { fields: 'sheets.properties.title' } });
      const titles = (m.sheets || []).map((s) => s.properties.title);
      if (!titles.length) return [];
      const u = new URL(`${base}/values:batchGet`);
      for (const t of titles) u.searchParams.append('ranges', t);
      const r = await call(u.toString());
      return (r.valueRanges || []).map((v, i) => ({ name: titles[i], range: v.range, values: v.values || [] }));
    },
    /** Overwrite cells (destructive: needs confirmed:true). */
    async updateSheet(id, range, values, { confirmed = false, input = 'USER_ENTERED' } = {}) {
      if (confirmed !== true) throw confirmRequired(`overwrite cells ${range} in spreadsheet ${id}`, { id, range, rows: values.length });
      const r = await call(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}`, {
        method: 'PUT', query: { valueInputOption: input }, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
      });
      return { updatedRange: r.updatedRange, updatedCells: r.updatedCells, updatedRows: r.updatedRows };
    },
    async appendSheet(id, range, values, { input = 'USER_ENTERED' } = {}) {
      const r = await call(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}:append`, {
        method: 'POST', query: { valueInputOption: input, insertDataOption: 'INSERT_ROWS' }, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ majorDimension: 'ROWS', values }),
      });
      return { updatedRange: r.updates && r.updates.updatedRange, updatedCells: r.updates && r.updates.updatedCells };
    },

    async mkdir(name, { parent } = {}) {
      const body = { name, mimeType: FOLDER };
      if (parent) body.parents = [parent];
      const f = await call(`${API}/files`, { method: 'POST', query: { fields: FIELDS, supportsAllDrives: true }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return mapFile(f);
    },

    /**
     * Upload (multipart <= threshold, else resumable). `convert` converts to Google-native.
     * With `id` updates that file's content (destructive: needs confirmed:true).
     */
    async upload(content, { name, mime, parent, convert, id, confirmed = false } = {}) {
      if (id && confirmed !== true) throw confirmRequired(`overwrite Drive file ${id}`, { id });
      if (!id && !name) throw new ConnectorError('bad_args', 'name is required for new files');
      const srcMime = mime || mimeFromName(name);
      const blob = toBlob(content, srcMime);
      const target = convertTarget(convert, srcMime);
      const metadata = {};
      if (name) metadata.name = name;
      if (target) metadata.mimeType = target;
      if (!id && parent) metadata.parents = [parent];
      const threshold = opts.resumableThreshold || cfgNum('gdrive.resumableThreshold', 5 * 1024 * 1024);
      const query = { fields: FIELDS, supportsAllDrives: true };
      const url = id ? `${UPLOAD}/files/${encodeURIComponent(id)}` : `${UPLOAD}/files`;
      const method = id ? 'PATCH' : 'POST';
      let f;
      if (blob.size <= threshold) {
        const boundary = `guru${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const body = buildMultipart(metadata, blob, srcMime, boundary);
        f = await call(url, { method, query: { ...query, uploadType: 'multipart' }, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
      } else {
        f = await resumable(url, method, query, metadata, blob, srcMime);
      }
      return mapFile(f);
    },

    async write(pathOrId, content, o = {}) {
      const f = o.create || !pathOrId
        ? await api.upload(content, { ...o, name: o.name || pathOrId })
        : await api.upload(content, { ...o, id: pathOrId });
      return { id: f.id, name: f.name, url: f.url, mime: f.mime };
    },

    /** Move to trash. Requires {confirmed:true}. */
    async remove(id, { confirmed = false } = {}) {
      if (confirmed !== true) throw confirmRequired(`move Drive file ${id} to trash`, { id });
      const f = await call(`${API}/files/${encodeURIComponent(id)}`, { method: 'PATCH', query: { fields: FIELDS, supportsAllDrives: true }, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      return { id: f.id, name: f.name, trashed: true };
    },
  };

  function cfgNum(key, def) { const v = Number(cfg(key, def)); return Number.isFinite(v) && v > 0 ? v : def; }

  async function resumable(url, method, query, metadata, blob, mime) {
    const chunk = opts.chunkSize || 8 * 1024 * 1024;
    const init = await call(url, {
      method, query: { ...query, uploadType: 'resumable' }, raw: true,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify(metadata),
    });
    if (!init.ok) throw await errorFromResponse(init);
    const loc = init.headers.get('location');
    if (!loc) throw new ConnectorError('upload_failed', 'No resumable session URI returned');
    let offset = 0;
    while (offset < blob.size) {
      const end = Math.min(offset + chunk, blob.size);
      const res = await call(loc, { method: 'PUT', raw: true, headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` }, body: blob.slice(offset, end) });
      if (res.status === 308) {
        const m = /bytes=0-(\d+)/.exec(res.headers.get('range') || '');
        offset = m ? Number(m[1]) + 1 : end;
        continue;
      }
      if (!res.ok) throw await errorFromResponse(res);
      return JSON.parse(await res.text());
    }
    throw new ConnectorError('upload_failed', 'Resumable upload ended without a final response');
  }

  api._internals = { call, ensureToken, mapFile };
  return api;
}

/** Tool definitions for the Drive connector. */
export function driveTools(drive) {
  const idProp = { type: 'string', description: 'Drive file/folder ID' };
  return [
    { name: 'drive_list', tags: ['drive'], description: 'List files in a Google Drive folder (default My Drive root). Supports pagination via pageToken or all:true.',
      schema: { type: 'object', properties: { folderId: idProp, query: { type: 'string', description: "Raw Drive query (e.g. \"mimeType='application/pdf'\")" }, pageToken: { type: 'string' }, all: { type: 'boolean' }, max: { type: 'number' } } },
      run: safeTool(async (a) => {
        const target = a.query ? `q:${a.query}` : a.folderId || '';
        const r = a.all ? await drive.listAll(target, { max: a.max || 500 }) : await drive.list(target, { pageToken: a.pageToken });
        return { items: r.items, next: r.next || null };
      }) },
    { name: 'drive_search', tags: ['drive'], description: 'Search Google Drive by name or full text.',
      schema: { type: 'object', properties: { q: { type: 'string' }, pageToken: { type: 'string' } }, required: ['q'] },
      run: safeTool(async (a) => { const r = await drive.search(a.q, { pageToken: a.pageToken }); return { items: r.items, next: r.next || null }; }) },
    { name: 'drive_read', tags: ['drive'], description: 'Read a Drive file as text (Docs/Sheets/Slides via REST; others raw). Use export for binary conversions.',
      schema: { type: 'object', properties: { id: idProp, as: { type: 'string', enum: ['text', 'json'] }, range: { type: 'string', description: 'A1 range for Sheets' }, maxChars: { type: 'number' } }, required: ['id'] },
      run: safeTool(async (a) => {
        const { meta, content } = await drive.readFile(a.id, { as: a.as || 'text', range: a.range });
        if (typeof Blob !== 'undefined' && content instanceof Blob) return { meta, note: 'binary file; use drive_export or file_read', size: content.size };
        if (typeof content === 'string') {
          const max = a.maxChars || 200000;
          return { meta, text: content.slice(0, max), truncated: content.length > max };
        }
        return { meta, json: content };
      }) },
    { name: 'drive_write', tags: ['drive'], description: 'Upload a file to Drive (new file, or overwrite with id + confirmed:true). convert:true converts md/docx/xlsx/pptx/csv into Google Docs/Sheets/Slides.',
      schema: { type: 'object', properties: { name: { type: 'string' }, content: { type: 'string' }, contentBase64: { type: 'string' }, mime: { type: 'string' }, parent: idProp, convert: { type: ['boolean', 'string'], description: "true or 'doc'|'sheet'|'slides'" }, id: { type: 'string', description: 'Existing file to overwrite' }, confirmed: { type: 'boolean' } } },
      run: safeTool(async (a) => {
        const content = contentFromArgs(a);
        const f = a.id
          ? await drive.upload(content, { name: a.name, mime: a.mime, convert: a.convert, id: a.id, confirmed: a.confirmed })
          : await drive.upload(content, { name: a.name, mime: a.mime, parent: a.parent, convert: a.convert });
        return { file: f, id: f.id, name: f.name, url: f.url };
      }) },
    { name: 'drive_export', tags: ['drive'], description: 'Export a Google Doc/Sheet/Slides to docx, xlsx, pptx, pdf, csv, txt, html or md.',
      schema: { type: 'object', properties: { id: idProp, format: { type: 'string' } }, required: ['id', 'format'] },
      run: safeTool(async (a, ctx) => { const e = await drive.exportFile(a.id, a.format); return addArtifact(ctx, e.blob, e.filename, e.mime); }) },
    { name: 'drive_mkdir', tags: ['drive'], description: 'Create a Drive folder.',
      schema: { type: 'object', properties: { name: { type: 'string' }, parent: idProp }, required: ['name'] },
      run: safeTool(async (a) => ({ folder: await drive.mkdir(a.name, { parent: a.parent }) })) },
    { name: 'drive_trash', tags: ['drive', 'destructive'], description: 'Move a Drive file to trash. Requires confirmed:true.',
      schema: { type: 'object', properties: { id: idProp, confirmed: { type: 'boolean' } }, required: ['id'] },
      run: safeTool(async (a) => drive.remove(a.id, { confirmed: a.confirmed })) },
    { name: 'sheet_update', tags: ['drive', 'destructive'], description: 'Overwrite cells in a Google Sheet via the values API (A1 range, 2D values). Requires confirmed:true.',
      schema: { type: 'object', properties: { id: idProp, range: { type: 'string' }, values: { type: 'array', items: { type: 'array' } }, confirmed: { type: 'boolean' }, append: { type: 'boolean', description: 'append rows instead (no confirmation needed)' } }, required: ['id', 'range', 'values'] },
      run: safeTool(async (a) => (a.append ? drive.appendSheet(a.id, a.range, a.values) : drive.updateSheet(a.id, a.range, a.values, { confirmed: a.confirmed }))) },
  ];
}
// fromUtf8/toBytes re-exported for tests that decode multipart bodies
export { fromUtf8, toBytes };
