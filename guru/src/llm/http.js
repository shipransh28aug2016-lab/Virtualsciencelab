// fetch wrapper: retry with exponential backoff + jitter, Retry-After, timeout, abort, secret redaction.
import { readSSE } from './sse.js';

export class LLMError extends Error {
  /** @param {string} message @param {{status?:number,retryable?:boolean,provider?:string,code?:string,cause?:any}} [o] */
  constructor(message, o = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = o.status; this.retryable = !!o.retryable; this.provider = o.provider; this.code = o.code;
    if (o.cause) this.cause = o.cause;
  }
}

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
export function abortError() { const e = new Error('Aborted'); e.name = 'AbortError'; return e; }

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(() => { signal?.removeEventListener('abort', on); resolve(); }, ms);
    const on = () => { clearTimeout(t); reject(abortError()); };
    signal?.addEventListener('abort', on, { once: true });
  });
}

function secretsOf(headers = {}) {
  const out = [];
  for (const [k, v] of Object.entries(headers)) {
    if (/^(x-api-key|authorization|x-goog-api-key)$/i.test(k) && v) out.push(String(v).replace(/^Bearer\s+/i, ''));
  }
  return out;
}
function redact(msg, secrets) {
  let s = String(msg ?? '');
  for (const x of secrets) if (x.length >= 6) s = s.split(x).join('***');
  return s;
}
function extractMsg(body) {
  try {
    const j = JSON.parse(body);
    const e = j.error ?? j;
    return (typeof e === 'string' ? e : e.message) || body.slice(0, 300);
  } catch { return String(body || '').slice(0, 300); }
}
async function safeText(res) { try { return await res.text(); } catch { return ''; } }
function retryAfterMs(res) {
  const h = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  if (h == null) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.min(n * 1000, 30000));
  const d = Date.parse(h);
  return Number.isNaN(d) ? undefined : Math.max(0, Math.min(d - Date.now(), 30000));
}

/**
 * @param {{fetch?:Function, sleep?:Function, retries?:number, baseDelayMs?:number, timeoutMs?:number}} [defaults]
 */
export function createHttp(defaults = {}) {
  const fetchImpl = defaults.fetch || ((...a) => globalThis.fetch(...a));
  const sleep = defaults.sleep || abortableSleep;

  async function send(url, init, o = {}) {
    const retries = o.retries ?? defaults.retries ?? 2;
    const base = o.baseDelayMs ?? defaults.baseDelayMs ?? 500;
    const timeoutMs = o.timeoutMs ?? defaults.timeoutMs ?? 60000;
    const provider = o.provider || 'llm';
    const secrets = secretsOf(init.headers);
    for (let attempt = 0; ; attempt++) {
      if (o.signal?.aborted) throw abortError();
      const ctl = new AbortController();
      let timedOut = false;
      const onAbort = () => ctl.abort();
      o.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs) : null;
      const cleanup = () => { if (timer) clearTimeout(timer); o.signal?.removeEventListener('abort', onAbort); };
      let failure;
      try {
        const res = await fetchImpl(url, { ...init, signal: ctl.signal });
        if (res.ok) return { res, cleanup, timedOut: () => timedOut };
        const body = await safeText(res);
        failure = new LLMError(`${provider} HTTP ${res.status}: ${redact(extractMsg(body), secrets)}`, { status: res.status, retryable: RETRY_STATUS.has(res.status), provider });
        failure.retryAfterMs = retryAfterMs(res);
      } catch (e) {
        if (o.signal?.aborted) { cleanup(); throw abortError(); }
        failure = timedOut
          ? new LLMError(`${provider} request timed out after ${timeoutMs}ms`, { code: 'timeout', retryable: true, provider })
          : new LLMError(`${provider} network error: ${redact(e && e.message, secrets)}`, { code: 'network', retryable: true, provider, cause: e });
      }
      cleanup();
      if (!failure.retryable || attempt >= retries) throw failure;
      await sleep(failure.retryAfterMs ?? Math.min(8000, base * 2 ** attempt + Math.random() * base / 2), o.signal);
    }
  }

  return {
    send,
    /** POST and parse a JSON body. */
    async json(url, init, o = {}) {
      const { res, cleanup, timedOut } = await send(url, init, o);
      try { return await res.json(); }
      catch (e) {
        if (o.signal?.aborted) throw abortError();
        if (timedOut()) throw new LLMError(`${o.provider || 'llm'} response timed out`, { code: 'timeout', provider: o.provider });
        throw new LLMError(`${o.provider || 'llm'} returned invalid JSON`, { code: 'bad_response', provider: o.provider, cause: e });
      } finally { cleanup(); }
    },
    /** POST and iterate SSE events; retries apply until the response headers arrive. */
    async *sse(url, init, o = {}) {
      const { res, cleanup } = await send(url, init, o);
      cleanup();
      try {
        const body = res.body ?? (await res.text());
        yield* readSSE(body, { signal: o.signal, idleMs: o.timeoutMs ?? defaults.timeoutMs ?? 60000 });
      } catch (e) {
        if (o.signal?.aborted) throw abortError();
        if (e && e.name === 'TimeoutError') throw new LLMError(`${o.provider || 'llm'} stream stalled`, { code: 'timeout', provider: o.provider });
        throw e;
      }
    },
  };
}
