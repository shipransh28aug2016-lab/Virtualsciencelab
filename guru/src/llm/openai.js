// OpenAI-compatible Chat Completions provider (OpenAI, Azure-style gateways, Ollama, LM Studio, OpenRouter, ...).
import { parseArgs, emit, withJsonRule, cleanJSONText, genId } from './util.js';

export const DEFAULT_BASE = 'https://api.openai.com/v1';
export const MODELS = { smart: 'gpt-4.1', fast: 'gpt-4.1-mini' };

export function toMessages(system, msgs) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const m of msgs) {
    if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content || '' });
    else if (m.role === 'assistant' && m.toolCalls?.length) {
      out.push({
        role: 'assistant', content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })),
      });
    } else out.push({ role: m.role, content: m.content || '' });
  }
  return out;
}

export function buildRequest(req) {
  const base = (req.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const hasTools = req.tools && req.tools.length;
  const system = req.json ? withJsonRule(req.system) : req.system;
  const body = { model: req.model || MODELS[req.tier || 'smart'], messages: toMessages(system, req.messages) };
  if (hasTools) body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
  else if (req.json) body.response_format = { type: 'json_object' };
  if (req.temperature != null) body.temperature = req.temperature;
  if (req.maxTokens) body[base === DEFAULT_BASE ? 'max_completion_tokens' : 'max_tokens'] = req.maxTokens;
  if (req.stream) { body.stream = true; body.stream_options = { include_usage: true }; }
  const headers = { 'content-type': 'application/json' };
  if (req.key) headers.authorization = `Bearer ${req.key}`;
  return { url: `${base}/chat/completions`, init: { method: 'POST', headers, body: JSON.stringify(body) }, body };
}

export function parseResponse(d, json) {
  const msg = d.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((c) => ({ id: c.id || genId(), name: c.function?.name, args: parseArgs(c.function?.arguments) }));
  const text = typeof msg.content === 'string' ? msg.content : '';
  return { text: json ? cleanJSONText(text) : text, toolCalls, usage: { in: d.usage?.prompt_tokens || 0, out: d.usage?.completion_tokens || 0 }, stopReason: d.choices?.[0]?.finish_reason };
}

export async function consume(events, onToken, json) {
  let text = '';
  const usage = { in: 0, out: 0 };
  const calls = {};
  let stopReason;
  for await (const ev of events) {
    if (ev.data === '[DONE]') break;
    let d;
    try { d = JSON.parse(ev.data); } catch { continue; }
    if (d.error) { const e = new Error(d.error.message || 'stream error'); e.name = 'LLMError'; throw e; }
    if (d.usage) { usage.in = d.usage.prompt_tokens || usage.in; usage.out = d.usage.completion_tokens || usage.out; }
    const ch = d.choices?.[0];
    if (!ch) continue;
    if (ch.finish_reason) stopReason = ch.finish_reason;
    const dl = ch.delta || {};
    if (typeof dl.content === 'string' && dl.content) { text += dl.content; emit(onToken, dl.content); }
    for (const tc of dl.tool_calls || []) {
      const i = tc.index ?? 0;
      const c = (calls[i] ||= { id: undefined, name: '', args: '' });
      if (tc.id) c.id = tc.id;
      if (tc.function?.name) c.name += tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
    }
  }
  const toolCalls = Object.keys(calls).map(Number).sort((a, b) => a - b)
    .map((i) => ({ id: calls[i].id || genId(), name: calls[i].name, args: parseArgs(calls[i].args) }));
  return { text: json ? cleanJSONText(text) : text, toolCalls, usage, stopReason };
}

export const openai = {
  id: 'openai', label: 'OpenAI-compatible', needsKey: true, models: MODELS, defaultBaseUrl: DEFAULT_BASE,
  async chat(req, http) {
    const { url, init } = buildRequest(req);
    const o = { signal: req.signal, provider: 'openai', ...(req.http || {}) };
    if (req.stream) return consume(http.sse(url, init, o), req.onToken, req.json);
    const r = parseResponse(await http.json(url, init, o), req.json);
    emit(req.onToken, r.text);
    return r;
  },
};
