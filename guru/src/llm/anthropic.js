// Anthropic Messages API provider (browser-direct, SSE streaming, tool_use).
import { parseArgs, emit, withJsonRule, cleanJSONText } from './util.js';

export const DEFAULT_BASE = 'https://api.anthropic.com';
export const MODELS = { smart: 'claude-sonnet-5-5', fast: 'claude-haiku-5-5' };

/** Convert normalised messages to Anthropic content blocks (tool results fold into user turns). */
export function toMessages(msgs) {
  const out = [];
  const push = (role, blocks) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks); else out.push({ role, content: [...blocks] });
  };
  for (const m of msgs) {
    if (m.role === 'tool') push('user', [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content || '' }]);
    else if (m.role === 'assistant') {
      const b = [];
      if (m.content) b.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls || []) b.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
      if (b.length) push('assistant', b);
    } else if (m.content) push('user', [{ type: 'text', text: m.content }]);
  }
  for (const m of out) if (m.role === 'user') m.content.sort((a, b) => (b.type === 'tool_result') - (a.type === 'tool_result'));
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: out.length ? '(continue)' : 'Hello' }] });
  return out;
}

/** @returns {{url:string, init:RequestInit, body:object}} */
export function buildRequest(req) {
  const body = {
    model: req.model || MODELS[req.tier || 'smart'],
    max_tokens: req.maxTokens || 4096,
    messages: toMessages(req.messages),
  };
  const system = req.json ? withJsonRule(req.system) : req.system;
  if (system) body.system = system;
  if (req.tools && req.tools.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.stream) body.stream = true;
  const url = `${(req.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')}/v1/messages`;
  const headers = {
    'content-type': 'application/json',
    'x-api-key': req.key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  return { url, init: { method: 'POST', headers, body: JSON.stringify(body) }, body };
}

/** Normalise a non-streaming response. */
export function parseResponse(d, json) {
  let text = '';
  const toolCalls = [];
  for (const b of d.content || []) {
    if (b.type === 'text') text += b.text || '';
    else if (b.type === 'tool_use') toolCalls.push({ id: b.id, name: b.name, args: parseArgs(b.input) });
  }
  return { text: json ? cleanJSONText(text) : text, toolCalls, usage: { in: d.usage?.input_tokens || 0, out: d.usage?.output_tokens || 0 }, stopReason: d.stop_reason };
}

/** Consume an async iterable of SSE events into a normalised response. */
export async function consume(events, onToken, json) {
  let text = '';
  const usage = { in: 0, out: 0 };
  const blocks = {};
  let stopReason;
  for await (const ev of events) {
    if (ev.data === '[DONE]') break;
    let d;
    try { d = JSON.parse(ev.data); } catch { continue; }
    switch (d.type) {
      case 'message_start':
        usage.in = d.message?.usage?.input_tokens || 0;
        usage.out = d.message?.usage?.output_tokens || 0;
        break;
      case 'content_block_start': {
        const cb = d.content_block || {};
        blocks[d.index] = cb.type === 'tool_use' ? { id: cb.id, name: cb.name, json: '' } : null;
        if (cb.type === 'text' && cb.text) { text += cb.text; emit(onToken, cb.text); }
        break;
      }
      case 'content_block_delta': {
        const x = d.delta || {};
        if (x.type === 'text_delta') { text += x.text || ''; emit(onToken, x.text); }
        else if (x.type === 'input_json_delta' && blocks[d.index]) blocks[d.index].json += x.partial_json || '';
        break;
      }
      case 'message_delta':
        if (d.usage?.output_tokens != null) usage.out = d.usage.output_tokens;
        if (d.usage?.input_tokens != null) usage.in = d.usage.input_tokens;
        stopReason = d.delta?.stop_reason || stopReason;
        break;
      case 'error': {
        const e = new Error(d.error?.message || 'Anthropic stream error');
        e.name = 'LLMError';
        throw e;
      }
      default: break;
    }
  }
  const toolCalls = Object.keys(blocks).map(Number).sort((a, b) => a - b)
    .filter((i) => blocks[i]).map((i) => ({ id: blocks[i].id, name: blocks[i].name, args: parseArgs(blocks[i].json || '{}') }));
  return { text: json ? cleanJSONText(text) : text, toolCalls, usage, stopReason };
}

export const anthropic = {
  id: 'anthropic', label: 'Anthropic Claude', needsKey: true, models: MODELS, defaultBaseUrl: DEFAULT_BASE,
  /** @param {object} req normalised request @param {object} http from createHttp */
  async chat(req, http) {
    const { url, init } = buildRequest(req);
    const o = { signal: req.signal, provider: 'anthropic', ...(req.http || {}) };
    if (req.stream) return consume(http.sse(url, init, o), req.onToken, req.json);
    const r = parseResponse(await http.json(url, init, o), req.json);
    emit(req.onToken, r.text);
    return r;
  },
};
