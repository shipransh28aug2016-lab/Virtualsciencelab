// Google Gemini provider: generateContent / streamGenerateContent (SSE) + functionDeclarations.
import { parseArgs, emit, geminiSchema, cleanJSONText, genId, withJsonRule } from './util.js';

export const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';
export const MODELS = { smart: 'gemini-2.5-pro', fast: 'gemini-2.5-flash' };

export function toContents(msgs) {
  const names = {};
  for (const m of msgs) for (const c of m.toolCalls || []) names[c.id] = c.name;
  const out = [];
  const push = (role, parts) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push(...parts); else out.push({ role, parts: [...parts] });
  };
  for (const m of msgs) {
    if (m.role === 'tool') {
      let resp;
      try { resp = JSON.parse(m.content); } catch { resp = null; }
      if (!resp || typeof resp !== 'object' || Array.isArray(resp)) resp = { result: resp ?? m.content };
      push('user', [{ functionResponse: { name: m.name || names[m.toolCallId] || 'tool', response: resp } }]);
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args || {} } });
      if (parts.length) push('model', parts);
    } else if (m.content) push('user', [{ text: m.content }]);
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', parts: [{ text: out.length ? '(continue)' : 'Hello' }] });
  return out;
}

export function buildRequest(req) {
  const model = req.model || MODELS[req.tier || 'smart'];
  const hasTools = req.tools && req.tools.length;
  const body = { contents: toContents(req.messages) };
  const system = req.json ? withJsonRule(req.system) : req.system;
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (hasTools) {
    body.tools = [{
      functionDeclarations: req.tools.map((t) => {
        const d = { name: t.name, description: t.description };
        if (Object.keys(t.schema.properties || {}).length) d.parameters = geminiSchema(t.schema);
        return d;
      }),
    }];
  }
  const gc = {};
  if (req.json && !hasTools) gc.responseMimeType = 'application/json';
  if (req.temperature != null) gc.temperature = req.temperature;
  if (req.maxTokens) gc.maxOutputTokens = req.maxTokens;
  if (Object.keys(gc).length) body.generationConfig = gc;
  const base = (req.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:${req.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': req.key };
  return { url, init: { method: 'POST', headers, body: JSON.stringify(body) }, body };
}

function absorb(acc, d, onToken) {
  if (d.error) { const e = new Error(d.error.message || 'Gemini error'); e.name = 'LLMError'; throw e; }
  const u = d.usageMetadata;
  if (u) { acc.usage.in = u.promptTokenCount ?? acc.usage.in; acc.usage.out = u.candidatesTokenCount ?? acc.usage.out; }
  const cand = d.candidates?.[0];
  if (cand?.finishReason) acc.stopReason = cand.finishReason;
  for (const p of cand?.content?.parts || []) {
    if (typeof p.text === 'string' && !p.thought) { acc.text += p.text; emit(onToken, p.text); }
    else if (p.functionCall) acc.toolCalls.push({ id: p.functionCall.id || genId(), name: p.functionCall.name, args: parseArgs(p.functionCall.args) });
  }
}
const fresh = () => ({ text: '', toolCalls: [], usage: { in: 0, out: 0 } });
const done = (acc, json) => ({ ...acc, text: json ? cleanJSONText(acc.text) : acc.text });

export function parseResponse(d, json, onToken) { const a = fresh(); absorb(a, d, onToken); return done(a, json); }

export async function consume(events, onToken, json) {
  const a = fresh();
  for await (const ev of events) {
    if (ev.data === '[DONE]') break;
    let d;
    try { d = JSON.parse(ev.data); } catch { continue; }
    absorb(a, d, onToken);
  }
  return done(a, json);
}

export const gemini = {
  id: 'gemini', label: 'Google Gemini', needsKey: true, models: MODELS, defaultBaseUrl: DEFAULT_BASE,
  async chat(req, http) {
    const { url, init } = buildRequest(req);
    const o = { signal: req.signal, provider: 'gemini', ...(req.http || {}) };
    if (req.stream) return consume(http.sse(url, init, o), req.onToken, req.json);
    return parseResponse(await http.json(url, init, o), req.json, req.onToken);
  },
};
