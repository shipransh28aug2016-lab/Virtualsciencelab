// LLM service: provider registry, key vault, retry/timeout/abort, local fallback, normalised results.
import { anthropic } from './anthropic.js';
import { openai, DEFAULT_BASE as OPENAI_BASE } from './openai.js';
import { gemini } from './gemini.js';
import { local } from './local.js';
import { createKeyVault } from './keys.js';
import { createHttp } from './http.js';
import { normalizeConversation, normTools } from './util.js';

export { createKeyVault } from './keys.js';
export { createHttp, LLMError } from './http.js';
export { readSSE, createSSEParser } from './sse.js';

const PROVIDERS = { anthropic, openai, gemini, local };
const REMOTE = ['anthropic', 'openai', 'gemini'];

function memConfig() {
  const m = new Map();
  return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => { m.set(k, v); } };
}

/**
 * Build the llm service.
 * @param {{k?:object, config?:{get:Function,set:Function}, vault?:object, storage?:Storage, crypto?:Crypto, fetch?:Function, sleep?:Function, http?:object}} [o]
 */
export function createLLM(o = {}) {
  const k = o.k || {};
  const cfg = o.config || k.config || memConfig();
  const vault = o.vault || createKeyVault({ storage: o.storage, crypto: o.crypto });
  const http = o.http || createHttp({ fetch: o.fetch, sleep: o.sleep });

  const isOnline = () => (typeof navigator !== 'undefined' && navigator && 'onLine' in navigator ? navigator.onLine !== false : true);
  const baseUrl = (id) => cfg.get(`llm.${id}.baseUrl`, '') || PROVIDERS[id]?.defaultBaseUrl;
  const keyOptional = (id) => id === 'openai' && baseUrl('openai').replace(/\/+$/, '') !== OPENAI_BASE;
  const modelFor = (id, tier) => cfg.get(`llm.model.${id}.${tier}`, '') || PROVIDERS[id]?.models?.[tier] || null;

  function activeId() {
    const p = cfg.get('llm.provider', 'auto');
    if (p && p !== 'auto') return PROVIDERS[p] ? p : 'local';
    return REMOTE.find((id) => vault.has(id)) || 'local';
  }

  const svc = {
    /**
     * @param {{messages:Array,system?:string,tools?:Array,stream?:boolean,onToken?:Function,signal?:AbortSignal,tier?:'fast'|'smart',json?:boolean,provider?:string,model?:string,maxTokens?:number,temperature?:number,fallback?:boolean}} opts
     * @returns {Promise<{text:string,toolCalls:Array<{id:string,name:string,args:object}>,usage:{in:number,out:number},provider:string}>}
     */
    async chat(opts = {}) {
      const tier = opts.tier === 'fast' ? 'fast' : 'smart';
      const wanted = opts.provider || activeId();
      const conv = normalizeConversation(opts.messages, opts.system);
      const tools = normTools(opts.tools);
      let id = PROVIDERS[wanted] ? wanted : 'local';
      let key = null, reason;
      if (id !== 'local') {
        key = await vault.get(id);
        if (!key && !keyOptional(id)) { reason = vault.has(id) ? 'locked' : 'nokey'; id = 'local'; }
        else if (!isOnline()) { reason = 'offline'; id = 'local'; }
      }
      const runLocal = async (extra) => {
        const r = await local.chat(k, { ...opts, system: conv.system, messages: conv.messages, tools: opts.tools });
        return { ...r, provider: 'local', ...extra };
      };
      if (id === 'local') return runLocal(wanted !== 'local' ? { fallback: true, reason } : {});

      let emitted = false;
      const onToken = opts.onToken ? (t) => { emitted = true; opts.onToken(t); } : undefined;
      const req = {
        key, baseUrl: baseUrl(id), model: opts.model || modelFor(id, tier), tier, system: conv.system, messages: conv.messages, tools,
        stream: opts.stream ?? !!opts.onToken, onToken, signal: opts.signal, json: !!opts.json,
        maxTokens: opts.maxTokens, temperature: opts.temperature,
        http: { retries: cfg.get('llm.retries', undefined), timeoutMs: cfg.get('llm.timeoutMs', undefined), baseDelayMs: cfg.get('llm.backoffMs', undefined) },
      };
      try {
        const r = await PROVIDERS[id].chat(req, http);
        return { text: r.text || '', toolCalls: r.toolCalls || [], usage: r.usage || { in: 0, out: 0 }, provider: id, model: req.model, stopReason: r.stopReason };
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        if (opts.signal?.aborted) throw e;
        if (opts.fallback !== false && cfg.get('llm.fallbackLocal', true) && !emitted) return runLocal({ fallback: true, reason: 'error', error: String(e && e.message || e) });
        throw e;
      }
    },

    /** @returns {{provider:string,online:boolean,hasKey:boolean,locked:boolean,model:string|null}} */
    status() {
      const id = activeId();
      return {
        provider: id, online: isOnline(), hasKey: id === 'local' ? false : vault.has(id) || keyOptional(id),
        locked: id !== 'local' && vault.isLocked(id), model: id === 'local' ? null : modelFor(id, 'smart'),
      };
    },
    setProvider(id) {
      if (id !== 'auto' && !PROVIDERS[id]) throw new Error(`Unknown provider: ${id}`);
      cfg.set('llm.provider', id);
    },
    /** Store (optionally passphrase-encrypted) key. Empty key removes it. */
    async setKey(provider, key, { passphrase } = {}) {
      if (!REMOTE.includes(provider)) throw new Error(`Provider ${provider} does not use a key`);
      await vault.set(provider, key, { passphrase });
    },
    /** Decrypt passphrase-protected keys for this session. */
    unlock: (passphrase) => vault.unlock(passphrase),
    lock: () => vault.lock(),
    hasKey: (provider) => vault.has(provider),
    setBaseUrl(provider, url) { cfg.set(`llm.${provider}.baseUrl`, url || ''); },
    setModel(provider, tier, model) { cfg.set(`llm.model.${provider}.${tier}`, model || ''); },
    providers: () => Object.values(PROVIDERS).map((p) => ({ id: p.id, label: p.label, needsKey: p.needsKey })),
    describe() {
      return {
        ...svc.status(), providers: svc.providers(), keys: vault.list(),
        models: Object.fromEntries(REMOTE.map((id) => [id, { smart: modelFor(id, 'smart'), fast: modelFor(id, 'fast') }])),
        baseUrls: { openai: baseUrl('openai'), anthropic: baseUrl('anthropic'), gemini: baseUrl('gemini') },
      };
    },
  };
  return svc;
}

/** Kernel entry point. @param {object} k */
export async function register(k) {
  const svc = createLLM({ k });
  k.services.set('llm', svc);
  k.tools.register({
    name: 'llm_status',
    description: 'Report the active LLM provider, whether a key is configured, online state, models and available providers.',
    schema: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => svc.describe(),
    tags: ['llm', 'system'],
  });
  try {
    k.intents?.register({
      id: 'llm_status', tool: 'llm_status',
      patterns: [/\b(llm|ai|model|provider)\s+(status|info)\b/i, /\bwhich\s+(model|provider|llm)\b/i, /\b(am i|are you)\s+(offline|online)\b/i, /मॉडल\s*(स्टेटस|की स्थिति)|प्रोवाइडर/],
      extract: () => ({}),
      examples: ['llm status', 'which model are you using', 'मॉडल स्टेटस'],
    });
  } catch { /* intents optional */ }
}
