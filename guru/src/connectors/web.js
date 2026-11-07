// Web connector: SSRF-safe https fetch (optional CORS proxy), readability extractor, configurable search.
import { ConnectorError, safeTool } from './util.js';

/* ---------------- SSRF guard ---------------- */

function v4Blocked(a, b, c) {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

function parseV6(h) {
  let s = h;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (dotted) {
    const n = dotted.slice(1).map(Number);
    s = s.slice(0, dotted.index) + ((n[0] << 8) | n[1]).toString(16) + ':' + ((n[2] << 8) | n[3]).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** True when a hostname (as in URL.hostname) targets localhost, a private/reserved IP or an internal name. */
export function isBlockedHost(hostname) {
  let h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.includes(':')) {
    const g = parseV6(h);
    if (!g) return true;
    const zero5 = g.slice(0, 5).every((x) => x === 0);
    const v4of = (hi, lo) => v4Blocked(hi >> 8, hi & 255, lo >> 8);
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
    if (zero5 && g[5] === 0xffff) return v4of(g[6], g[7]); // ::ffff:a.b.c.d
    if (zero5 && g[5] === 0) return true; // ::/96 deprecated v4-compatible
    if (g[0] === 0x64 && g[1] === 0xff9b) return v4of(g[6], g[7]); // NAT64
    if (g[0] === 0x2002) return v4of(g[1], g[2]); // 6to4
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link/site-local
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    return false;
  }
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const n = m.slice(1).map(Number);
    if (n.some((x) => x > 255)) return true;
    return v4Blocked(n[0], n[1], n[2]);
  }
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(h)) return true; // odd numeric forms never legit
  if (h === 'localhost' || !h.includes('.')) return true; // single-label (intranet) names
  return /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa|in-addr\.arpa)$/.test(h);
}

/** Validate a URL for server-side-like fetching; returns URL or throws ConnectorError. */
export function assertSafeUrl(input) {
  let u;
  try { u = new URL(String(input)); } catch { throw new ConnectorError('bad_url', `Invalid URL: ${String(input).slice(0, 100)}`); }
  if (u.protocol !== 'https:') throw new ConnectorError('https_only', 'Only https:// URLs are allowed');
  if (u.username || u.password) throw new ConnectorError('bad_url', 'Credentials in URLs are not allowed');
  if (isBlockedHost(u.hostname)) throw new ConnectorError('ssrf_blocked', `Host ${u.hostname} is blocked (private, local or internal)`);
  return u;
}

/* ---------------- readability ---------------- */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', rupee: '₹', laquo: '«', raquo: '»', times: '×', deg: '°' };
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m; } catch { return m; }
    }
    return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const DROP = new Set(['script', 'style', 'noscript', 'svg', 'template', 'iframe', 'object', 'canvas', 'select', 'button', 'head', 'nav', 'footer', 'aside', 'form', 'dialog']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'br', 'li', 'ul', 'ol', 'tr', 'table', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'figure', 'figcaption', 'dd', 'dt', 'dl', 'header', 'details', 'summary']);
const JUNK_ATTR = /(^|[\s_-])(nav|navbar|menu|footer|sidebar|breadcrumb|cookie|consent|banner|advert|ads?|sponsor|promo|share|social|comment|related|newsletter|popup|modal|subscribe)([\s_-]|$)/i;

function attrOf(attrs, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : '';
}

/**
 * Extract the main readable text from HTML without a DOM.
 * @param {string} html @returns {{title:string, text:string, byline:string, length:number}}
 */
export function extractReadable(html) {
  const src = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  let title = '';
  const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src);
  if (tm) title = decodeEntities(tm[1]).replace(/\s+/g, ' ').trim();
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(src) || /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(src);
  if (og) title = decodeEntities(og[1]).trim() || title;
  const bym = /<meta[^>]+name=["']author["'][^>]*content=["']([^"']*)["']/i.exec(src);
  const byline = bym ? decodeEntities(bym[1]).trim() : '';

  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)|</g;
  const stack = []; // {tag, drop, main}
  let dropDepth = 0; let mainDepth = 0;
  const all = []; const main = [];
  const emit = (t) => { if (dropDepth) return; all.push(t); if (mainDepth) main.push(t); };
  let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) { emit(m[4]); continue; }
    if (!m[2]) continue;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (!closing) {
      const attrs = m[3] || '';
      const selfClosing = /\/\s*$/.test(attrs) || VOID.has(tag);
      if (VOID.has(tag)) { if (BLOCK.has(tag)) emit('\n'); continue; }
      const role = attrOf(attrs, 'role').toLowerCase();
      const cls = `${attrOf(attrs, 'class')} ${attrOf(attrs, 'id')}`;
      const hidden = /\bhidden\b/i.test(attrs) || /aria-hidden=["']true/i.test(attrs) || /display\s*:\s*none/i.test(attrOf(attrs, 'style'));
      const isMain = tag === 'article' || tag === 'main' || role === 'main' || /(^|[\s_-])(article-body|post-content|entry-content|story-body|content-body)([\s_-]|$)/i.test(cls);
      const drop = DROP.has(tag) || hidden || ['navigation', 'banner', 'complementary', 'contentinfo', 'search'].includes(role)
        || (tag !== 'body' && tag !== 'html' && tag !== 'article' && tag !== 'main' && JUNK_ATTR.test(cls));
      if (selfClosing) continue;
      stack.push({ tag, drop, main: isMain && !drop });
      if (drop) dropDepth++;
      if (isMain && !drop) mainDepth++;
      if (BLOCK.has(tag)) emit(/^h[1-6]$/.test(tag) ? `\n\n${'#'.repeat(Number(tag[1]))} ` : tag === 'li' ? '\n- ' : '\n');
    } else {
      let i = stack.length - 1;
      while (i >= 0 && stack[i].tag !== tag) i--;
      if (i < 0) continue;
      while (stack.length > i) {
        const f = stack.pop();
        if (f.drop) dropDepth--;
        if (f.main) mainDepth--;
      }
      if (BLOCK.has(tag)) emit(/^h[1-6]$/.test(tag) ? '\n\n' : '\n');
    }
  }
  const clean = (parts) => decodeEntities(parts.join(''))
    .replace(/[ \t\f\v ]+/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
  const mainText = clean(main);
  const allText = clean(all);
  const text = mainText.length >= 200 && mainText.length >= allText.length * 0.3 ? mainText : allText;
  if (!title) { const h1 = /^# (.+)$/m.exec(text); if (h1) title = h1[1]; }
  return { title, text, byline, length: text.length };
}

/* ---------------- fetch + search ---------------- */

async function readCapped(res, maxBytes) {
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = []; let total = 0; let truncated = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (total + value.length > maxBytes) { chunks.push(value.subarray(0, maxBytes - total)); total = maxBytes; truncated = true; try { await reader.cancel(); } catch { /* ignore */ } break; }
      chunks.push(value); total += value.length;
    }
    const out = new Uint8Array(total); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return { bytes: out, truncated };
  }
  const b = new Uint8Array(await res.arrayBuffer());
  return { bytes: b.subarray(0, maxBytes), truncated: b.length > maxBytes };
}

function decodeBody(bytes, contentType) {
  let label = (/charset=["']?([\w-]+)/i.exec(contentType || '') || [])[1];
  if (!label) { const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048)); label = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(head) || [])[1]; }
  try { return new TextDecoder(label || 'utf-8').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

/**
 * @param {object} k kernel API
 * @param {{fetch?:Function, proxy?:string}} [opts]
 */
export function createWeb(k, opts = {}) {
  const cfg = (key, def) => (opts[key.replace('web.', '')] !== undefined ? opts[key.replace('web.', '')] : (k && k.config ? k.config.get(key, def) : def));
  const doFetch = (...a) => (opts.fetch || globalThis.fetch)(...a);

  function proxied(target) {
    const p = cfg('web.proxy', '');
    if (!p) return target;
    if (!/^https:\/\//i.test(p)) throw new ConnectorError('bad_proxy', 'web.proxy must be an https:// URL (use {url} as placeholder)');
    return p.includes('{url}') ? p.replace('{url}', encodeURIComponent(target)) : p + encodeURIComponent(target);
  }
  async function timedFetch(url, init, timeout, signal) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    const onAbort = () => ac.abort();
    if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    try {
      return await doFetch(url, { ...init, signal: ac.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new ConnectorError('timeout', `Request timed out after ${timeout}ms`);
      throw new ConnectorError('network', (e && e.message) || 'network error');
    } finally { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); }
  }

  const api = {
    id: 'web', name: 'Web', icon: 'globe',
    isBlockedHost, assertSafeUrl, extractReadable,
    status() { return typeof (opts.fetch || globalThis.fetch) === 'function' ? 'ready' : 'unsupported'; },
    async connect() { return { status: api.status() }; },
    async disconnect() { return { status: api.status() }; },

    /** Fetch a page as text. HTML is reduced to readable text unless raw:true. */
    async fetchText(url, { timeout = cfg('web.timeoutMs', 15000), maxBytes = cfg('web.maxBytes', 2 * 1024 * 1024), raw = false, signal } = {}) {
      const u = assertSafeUrl(url);
      const res = await timedFetch(proxied(u.toString()), { method: 'GET', redirect: 'follow', credentials: 'omit', headers: { Accept: 'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.5' } }, timeout, signal);
      if (!cfg('web.proxy', '') && res.url) assertSafeUrl(res.url); // revalidate after redirects
      if (!res.ok) throw new ConnectorError('http_error', `HTTP ${res.status} for ${u.hostname}`, { status: res.status });
      const ct = res.headers.get('content-type') || '';
      if (ct && !/^(text\/|application\/(json|xml|xhtml\+xml|rss\+xml|atom\+xml|javascript|ld\+json))/i.test(ct)) {
        throw new ConnectorError('unsupported_content', `Content-Type ${ct} is not text; download it with a file tool instead`);
      }
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > maxBytes * 4) throw new ConnectorError('too_large', `Response is ${len} bytes (cap ${maxBytes})`);
      const { bytes, truncated } = await readCapped(res, maxBytes);
      const body = decodeBody(bytes, ct);
      const isHtml = /html/i.test(ct) || (!ct && /^\s*<(!doctype|html)/i.test(body));
      if (!isHtml || raw) return { url: u.toString(), status: res.status, contentType: ct, title: '', text: body, truncated, bytes: bytes.length };
      const r = extractReadable(body);
      return { url: u.toString(), status: res.status, contentType: ct, title: r.title, byline: r.byline, text: r.text, truncated, bytes: bytes.length };
    },

    /** Search via configured endpoint: web.searchProvider = searxng|brave|tavily|custom, web.searchUrl, web.searchKey. */
    async search(q, { n = 8, signal } = {}) {
      const provider = String(cfg('web.searchProvider', '') || '').toLowerCase();
      const key = cfg('web.searchKey', '');
      const base = cfg('web.searchUrl', '');
      const timeout = cfg('web.timeoutMs', 15000);
      const query = String(q || '').trim();
      if (!query) throw new ConnectorError('bad_args', 'query required');
      if (!provider) throw new ConnectorError('needs_config', 'Configure web.searchProvider (searxng|brave|tavily|custom) and web.searchUrl/web.searchKey in settings');
      let res; let parse;
      if (provider === 'searxng' || provider === 'custom') {
        if (!base) throw new ConnectorError('needs_config', 'web.searchUrl required');
        const u = new URL(base);
        if (!/^https?:$/.test(u.protocol)) throw new ConnectorError('bad_url', 'searchUrl must be http(s)');
        if (provider === 'searxng') { if (!u.pathname.endsWith('/search')) u.pathname = `${u.pathname.replace(/\/$/, '')}/search`; u.searchParams.set('format', 'json'); }
        u.searchParams.set('q', query);
        const headers = { Accept: 'application/json' }; if (key) headers.Authorization = `Bearer ${key}`;
        res = await timedFetch(u.toString(), { method: 'GET', headers }, timeout, signal);
        parse = (j) => (j.results || j.items || []).map((r) => ({ title: r.title || r.name || '', url: r.url || r.link || '', snippet: r.content || r.snippet || r.description || '' }));
      } else if (provider === 'brave') {
        if (!key) throw new ConnectorError('needs_auth', 'web.searchKey (Brave Search API key) required');
        res = await timedFetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`, { method: 'GET', headers: { Accept: 'application/json', 'X-Subscription-Token': key } }, timeout, signal);
        parse = (j) => ((j.web && j.web.results) || []).map((r) => ({ title: r.title, url: r.url, snippet: decodeEntities((r.description || '').replace(/<[^>]+>/g, '')) }));
      } else if (provider === 'tavily') {
        if (!key) throw new ConnectorError('needs_auth', 'web.searchKey (Tavily API key) required');
        res = await timedFetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ query, max_results: n }) }, timeout, signal);
        parse = (j) => (j.results || []).map((r) => ({ title: r.title, url: r.url, snippet: r.content || '' }));
      } else throw new ConnectorError('needs_config', `Unknown web.searchProvider "${provider}"`);
      if (!res.ok) throw new ConnectorError('search_failed', `Search HTTP ${res.status}`, { status: res.status });
      const results = parse(await res.json()).filter((r) => r.url).slice(0, n);
      return { provider, query, results };
    },

    // connector protocol
    async list() { return { items: [] }; },
    async read(url, { as = 'text' } = {}) {
      const r = await api.fetchText(url);
      return as === 'json' ? r : r.text;
    },
    async write() { throw new ConnectorError('unsupported', 'The web connector is read-only'); },
    async remove() { throw new ConnectorError('unsupported', 'The web connector is read-only'); },
  };
  return api;
}

export function webTools(web) {
  return [
    { name: 'web_fetch', tags: ['web'], description: 'Fetch a public https web page and return readable text (HTML boilerplate removed). Private/localhost hosts are blocked. Uses the configured CORS proxy if any.',
      schema: { type: 'object', properties: { url: { type: 'string' }, raw: { type: 'boolean', description: 'return source without readability extraction' }, maxChars: { type: 'number' } }, required: ['url'] },
      run: safeTool(async (a, ctx) => {
        const r = await web.fetchText(a.url, { raw: !!a.raw, signal: ctx && ctx.signal });
        const max = a.maxChars || 60000;
        return { ...r, text: r.text.slice(0, max), truncated: r.truncated || r.text.length > max };
      }) },
    { name: 'web_search', tags: ['web'], description: 'Search the web through the configured endpoint (SearxNG, Brave or Tavily).',
      schema: { type: 'object', properties: { q: { type: 'string' }, n: { type: 'number' } }, required: ['q'] },
      run: safeTool(async (a, ctx) => web.search(a.q, { n: a.n || 8, signal: ctx && ctx.signal })) },
  ];
}
