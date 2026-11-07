// Shared helpers for the orchestrator: ids, JSON extraction, plan normalisation, messages.

export class KernelStop extends Error {
  /** @param {'ABORT'|'BUDGET'|'STEPS'} code */
  constructor(code, message) { super(message || code); this.name = 'KernelStop'; this.code = code; }
}

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const trunc = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
export const estimateTokens = (s) => Math.ceil(String(s || '').length / 4);

/** Deterministic JSON (sorted keys) — used for identical-call detection. */
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

/** Pull a JSON value out of model text (handles ``` fences and prose around it). */
export function extractJSON(text) {
  if (text && typeof text === 'object') return text;
  const s = String(text ?? '').trim();
  const tryParse = (x) => { try { return JSON.parse(x); } catch { return undefined; } };
  let v = tryParse(s);
  if (v !== undefined) return v;
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { v = tryParse(fence[1].trim()); if (v !== undefined) return v; }
  for (let i = 0; i < s.length; i++) {
    const open = s[i];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) { v = tryParse(s.slice(i, j + 1)); if (v !== undefined) return v; break; }
    }
  }
  return null;
}

/** Cheap script-based language guess: 'hi' | 'hinglish' | 'en'. */
export function detectLang(text) {
  const deva = (String(text).match(/[ऀ-ॿ]/g) || []).length;
  const latin = (String(text).match(/[A-Za-z]/g) || []).length;
  if (!deva) return 'en';
  return latin > deva * 0.5 ? 'hinglish' : 'hi';
}

export function langName(lang) {
  if (lang === 'hi') return 'Hindi (Devanagari script)';
  if (lang === 'hinglish') return 'Hinglish (Hindi and English mixed, mirror the user\'s style)';
  return 'English';
}

const MSG = {
  en: {
    nomatch: "I couldn't map that request to an offline skill. Add an API key in Settings for full reasoning, or try a command such as 'make a Class 12 Physics practice set'.",
    budget: 'Stopped early because the work budget was reached. Partial results:',
    failed: 'Some steps failed:',
    files: 'Files',
    empty: 'No result was produced.',
  },
  hi: {
    nomatch: "यह अनुरोध ऑफ़लाइन कौशल से मेल नहीं खाया। पूरी तर्क-क्षमता के लिए सेटिंग्स में API कुंजी जोड़ें, या जैसे 'कक्षा 12 भौतिकी अभ्यास सेट बनाओ' कहें।",
    budget: 'कार्य-सीमा पूरी होने से जल्दी रुकना पड़ा। अब तक के परिणाम:',
    failed: 'कुछ चरण विफल रहे:',
    files: 'फ़ाइलें',
    empty: 'कोई परिणाम नहीं मिला।',
  },
};
/** Localised kernel message (i18n service wins if it knows the key). */
export function msg(k, key, lang) {
  try {
    const i18n = k.services.get('i18n');
    const v = i18n && i18n.t && i18n.t('kernel.' + key);
    if (v && v !== 'kernel.' + key) return v;
  } catch { /* use built-ins */ }
  return (MSG[lang === 'hi' ? 'hi' : 'en'])[key];
}

/** Render any tool result as readable text. */
export function fmtResult(v, k, lang) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const parts = [];
  if (typeof v.text === 'string') parts.push(v.text);
  else if (typeof v.answer === 'string') parts.push(v.answer);
  else if (typeof v.summary === 'string') parts.push(v.summary);
  if (v.artifact && v.artifact.filename) parts.push(`${k ? msg(k, 'files', lang) : 'Files'}: ${v.artifact.filename}`);
  if (parts.length) return parts.join('\n');
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

/**
 * Validate a raw model plan into [{id,agent,task,deps}], dropping unknown deps and breaking cycles.
 * @param {any} raw @param {{has:Function,list:Function}} agents @param {number} max
 */
export function normalizePlan(raw, agents, max = 8, tools = null) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.tasks) ? raw.tasks : Array.isArray(raw?.plan) ? raw.plan : [];
  const fallbackAgent = agents.has('guru') ? 'guru' : agents.list()[0]?.id;
  const tasks = [];
  const ids = new Set();
  arr.forEach((t, i) => {
    if (tasks.length >= max || !t || typeof t !== 'object') return;
    const text = String(t.task ?? t.description ?? t.goal ?? '').trim();
    if (!text) return;
    let id = String(t.id ?? `t${i + 1}`);
    if (ids.has(id)) id = `${id}_${tasks.length}`;
    ids.add(id);
    const task = {
      id, agent: agents.has(t.agent) ? t.agent : fallbackAgent, task: text,
      deps: Array.isArray(t.deps) ? t.deps.map(String) : [],
    };
    if (typeof t.tool === 'string' && t.tool && (!tools || tools.has(t.tool))) {
      task.tool = t.tool; task.args = t.args && typeof t.args === 'object' ? t.args : {};
    }
    tasks.push(task);
  });
  const idx = new Map(tasks.map((t, i) => [t.id, i]));
  for (const t of tasks) t.deps = [...new Set(t.deps)].filter((d) => d !== t.id && idx.has(d));
  // Kahn: anything left over is on a cycle → keep only deps that point earlier in the list.
  const indeg = new Map(tasks.map((t) => [t.id, t.deps.length]));
  const queue = tasks.filter((t) => t.deps.length === 0).map((t) => t.id);
  const done = new Set();
  while (queue.length) {
    const id = queue.shift();
    done.add(id);
    for (const t of tasks) if (t.deps.includes(id) && !done.has(t.id)) {
      indeg.set(t.id, indeg.get(t.id) - 1);
      if (indeg.get(t.id) === 0) queue.push(t.id);
    }
  }
  for (const t of tasks) if (!done.has(t.id)) t.deps = t.deps.filter((d) => idx.get(d) < idx.get(t.id));
  return tasks;
}
