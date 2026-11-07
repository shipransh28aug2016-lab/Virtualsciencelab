// Shared helpers for Guru connectors. Zero deps, Node >=18 and browser safe.

/** Structured connector error. `code` is machine readable. */
export class ConnectorError extends Error {
  /** @param {string} code @param {string} [message] @param {object} [extra] */
  constructor(code, message, extra) {
    super(message || code);
    this.name = 'ConnectorError';
    this.code = code;
    if (extra) Object.assign(this, extra);
  }
}

/** Error thrown by destructive operations invoked without `confirmed:true`. */
export function confirmRequired(action, detail) {
  return new ConnectorError('confirmation_required',
    `Confirmation required: ${action}. Re-run with confirmed:true after the user agrees.`, { action, detail });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function utf8(s) { return new TextEncoder().encode(s); }
export function fromUtf8(b) { return new TextDecoder('utf-8').decode(b); }

/** @param {Uint8Array} u8 */
export function bytesToBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
/** @param {string} b64 */
export function base64ToBytes(b64) {
  const s = atob(String(b64).replace(/\s/g, ''));
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/** Convert string|Blob|ArrayBuffer|Uint8Array to Uint8Array. */
export async function toBytes(content) {
  if (typeof content === 'string') return utf8(content);
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof Blob !== 'undefined' && content instanceof Blob) return new Uint8Array(await content.arrayBuffer());
  throw new ConnectorError('bad_content', 'content must be string, Blob, ArrayBuffer or Uint8Array');
}

/** Convert content to a Blob with the given mime. */
export function toBlob(content, mime) {
  if (typeof Blob !== 'undefined' && content instanceof Blob) {
    return mime && !content.type ? content.slice(0, content.size, mime) : content;
  }
  if (typeof content === 'string' || content instanceof Uint8Array || content instanceof ArrayBuffer) {
    return new Blob([content], { type: mime || 'application/octet-stream' });
  }
  throw new ConnectorError('bad_content', 'content must be string, Blob, ArrayBuffer or Uint8Array');
}

/** Accept tool-level content: string, or {base64, mime}. */
export function contentFromArgs(args) {
  if (args.contentBase64) return base64ToBytes(args.contentBase64);
  if (args.content === undefined || args.content === null) throw new ConnectorError('bad_content', 'content is required');
  if (typeof args.content === 'object' && !(args.content instanceof Uint8Array) && !(args.content instanceof ArrayBuffer)
    && !(typeof Blob !== 'undefined' && args.content instanceof Blob)) return JSON.stringify(args.content, null, 2);
  return args.content;
}

function retryAfterMs(res) {
  const h = res.headers && res.headers.get && res.headers.get('retry-after');
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n * 1000);
  const d = Date.parse(h);
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

async function isRetryable(res) {
  if (res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) return true;
  if (res.status === 403 && typeof res.clone === 'function') {
    try {
      const j = await res.clone().json();
      const reasons = ((j && j.error && j.error.errors) || []).map((e) => e.reason);
      return reasons.some((r) => /ratelimit|quotaexceeded|backenderror/i.test(String(r)));
    } catch { return false; }
  }
  return false;
}

/**
 * fetch with 401-refresh (once) and exponential backoff on 429/5xx/rate-limit 403.
 * `build()` returns [url, init] and is re-invoked on each attempt (so fresh tokens are used).
 */
export async function requestWithRetry(fetchFn, build, o = {}) {
  const { retries = 4, baseDelay = 500, maxDelay = 16000, sleep: sl = sleep, onUnauthorized } = o;
  const delay = (a) => Math.min(maxDelay, baseDelay * 2 ** a) + Math.random() * baseDelay * 0.2;
  let attempt = 0;
  let refreshed = false;
  for (;;) {
    const [url, init] = await build();
    let res;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      if (attempt >= retries) throw new ConnectorError('network', (e && e.message) || 'network error');
      await sl(delay(attempt++));
      continue;
    }
    if (res.status === 401 && onUnauthorized && !refreshed) {
      refreshed = true;
      await onUnauthorized(res);
      continue;
    }
    if (attempt < retries && (await isRetryable(res))) {
      const ra = retryAfterMs(res);
      await sl(ra !== null ? Math.min(ra, 60000) : delay(attempt));
      attempt++;
      continue;
    }
    return res;
  }
}

/** Best-effort error from a non-ok Response. */
export async function errorFromResponse(res, fallbackCode = 'http_error') {
  let msg = '';
  try {
    const t = await res.text();
    try { const j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || t; } catch { msg = t; }
  } catch { /* ignore */ }
  const code = res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : res.status === 404 ? 'not_found'
    : res.status === 429 ? 'rate_limited' : fallbackCode;
  return new ConnectorError(code, `${res.status} ${String(msg).slice(0, 300)}`.trim(), { status: res.status });
}

/** Wrap a tool body so it always returns a structured result and never throws. */
export function safeTool(fn) {
  return async (args, ctx) => {
    try {
      const r = await fn(args || {}, ctx || {});
      if (r && typeof r === 'object' && !Array.isArray(r) && 'ok' in r) return r;
      if (r && typeof r === 'object' && !Array.isArray(r)) return { ok: true, ...r };
      return { ok: true, result: r };
    } catch (e) {
      if (e && e.code === 'confirmation_required') {
        return { ok: false, needsConfirmation: true, action: e.action, message: e.message, detail: e.detail || null };
      }
      return { ok: false, error: { code: (e && e.code) || 'error', message: (e && e.message) || String(e), status: e && e.status } };
    }
  };
}

/** Register a binary result via ctx.artifacts when available. */
export function addArtifact(ctx, blob, filename, mime) {
  const info = { filename, mime: mime || blob.type || 'application/octet-stream', size: blob.size };
  if (ctx && ctx.artifacts && typeof ctx.artifacts.add === 'function') {
    const blobRef = ctx.artifacts.add(blob, filename);
    return { artifact: { ...info, blobRef } };
  }
  return { artifact: info, note: 'no artifact store in ctx; binary not attached' };
}

const MIME_BY_EXT = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', html: 'text/html', htm: 'text/html',
  json: 'application/json', xml: 'application/xml', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation', rtf: 'application/rtf',
};
/** Guess a mime type from a filename. */
export function mimeFromName(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return (m && MIME_BY_EXT[m[1].toLowerCase()]) || 'application/octet-stream';
}
export const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|html?|xml|css|js|mjs|ts|py|java|c|cpp|h|yml|yaml|toml|ini|cfg|sh|sql|svg|tex|log)$/i;
