// Shared helpers: message/tool normalisation across providers.

let _n = 0;
/** @param {string} [p] */
export function genId(p = 'call') { _n = (_n + 1) % 1e9; return `${p}_${Date.now().toString(36)}${_n.toString(36)}`; }

/** Flatten any content shape (string | parts[] | object) to text. */
export function textOf(c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (typeof p === 'string' ? p : p && p.text != null ? String(p.text) : '')).join('');
  if (typeof c === 'object') return c.text != null ? String(c.text) : JSON.stringify(c);
  return String(c);
}

/** Parse tool arguments that may be an object, JSON string or empty. */
export function parseArgs(a) {
  if (a == null || a === '') return {};
  if (typeof a === 'object') return a;
  try { const v = JSON.parse(a); return v && typeof v === 'object' ? v : { value: v }; } catch { return {}; }
}

/**
 * Normalise tool defs ({name,description,schema} | {parameters} | {input_schema} | OpenAI {function}) to
 * [{name,description,schema}] with schema always a JSON-Schema object.
 */
export function normTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return [];
  const out = [];
  for (const t of tools) {
    const f = (t && t.function) || t;
    if (!f || !f.name) continue;
    const s = f.schema || f.input_schema || f.inputSchema || f.parameters || {};
    out.push({ name: String(f.name), description: String(f.description || ''), schema: { ...s, type: 'object', properties: s.properties || {} } });
  }
  return out;
}

const DROP = new Set(['$schema', '$id', 'additionalProperties', 'default', 'examples', 'title', 'definitions', '$defs']);
/** Strip JSON-Schema keywords Gemini rejects; collapse ['x','null'] unions to nullable. */
export function geminiSchema(s) {
  if (Array.isArray(s)) return s.map(geminiSchema);
  if (!s || typeof s !== 'object') return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) {
    if (DROP.has(k)) continue;
    if (k === 'type' && Array.isArray(v)) {
      const nn = v.filter((x) => x !== 'null');
      o.type = nn[0] || 'string';
      if (v.includes('null')) o.nullable = true;
    } else if (k === 'properties' && v && typeof v === 'object') {
      o.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, geminiSchema(pv)]));
    } else o[k] = k === 'items' ? geminiSchema(v) : v;
  }
  return o;
}

/**
 * Split system prompt out of messages and normalise roles to user|assistant|tool.
 * @returns {{system:string, messages:Array<{role:string,content:string,toolCalls?:Array<{id:string,name:string,args:object}>,toolCallId?:string,name?:string}>}}
 */
export function normalizeConversation(messages, system) {
  const sys = [];
  if (system) sys.push(textOf(system));
  const out = [];
  for (const m of messages || []) {
    if (m == null) continue;
    if (typeof m === 'string') { out.push({ role: 'user', content: m }); continue; }
    const role = m.role === 'model' ? 'assistant' : m.role;
    const content = textOf(m.content);
    if (role === 'system') { if (content) sys.push(content); continue; }
    if (role === 'tool' || role === 'function') {
      out.push({ role: 'tool', content, toolCallId: m.toolCallId || m.tool_call_id || m.id, name: m.name });
      continue;
    }
    const calls = (m.toolCalls || m.tool_calls || []).map((c, i) => {
      const f = c.function || c;
      return { id: c.id || `call_${i}`, name: f.name, args: parseArgs(f.args ?? f.arguments ?? f.input) };
    });
    if (calls.length) out.push({ role: 'assistant', content, toolCalls: calls });
    else out.push({ role: role === 'assistant' ? 'assistant' : 'user', content });
  }
  return { system: sys.filter(Boolean).join('\n\n'), messages: out };
}

export const JSON_RULE = 'Respond with a single valid JSON value only. No prose, no markdown code fences.';
/** @param {string} system */
export function withJsonRule(system) { return system ? `${system}\n\n${JSON_RULE}` : JSON_RULE; }

/** Strip code fences / surrounding prose from a model's JSON reply when it parses; otherwise return text unchanged. */
export function cleanJSONText(text) {
  const t = String(text || '').trim();
  const tryParse = (s) => { try { JSON.parse(s); return true; } catch { return false; } };
  if (tryParse(t)) return t;
  const fence = /^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/.exec(t);
  if (fence && tryParse(fence[1])) return fence[1];
  const a = t.search(/[{[]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a >= 0 && b > a && tryParse(t.slice(a, b + 1))) return t.slice(a, b + 1);
  return t;
}

/** Call onToken without letting consumer exceptions break the stream. */
export function emit(onToken, s) { if (onToken && s) { try { onToken(s); } catch { /* consumer error ignored */ } } }
