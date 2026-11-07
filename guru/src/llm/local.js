// Offline engine: no network. Routes text -> tool calls via k.intents, templated bilingual replies,
// and rule-based JSON for planner / critic prompts.
import { textOf, genId } from './util.js';

const DEVA = /[ऀ-ॿ]/;
const HING = /\b(kya|kaise|kaisa|kaun|hai|hain|mujhe|mera|meri|karo|kar|banao|bana|dena|do|batao|samjhao|chahiye|aap|tum|nahi|haan|accha|theek|dhanyavaad|shukriya|namaste|ka|ki|ke|se|mein|par|wala|wali)\b/gi;

/** @returns {'hi'|'en'|'hinglish'} */
export function detectLang(text, k) {
  try {
    const i18n = k?.services?.has?.('i18n') ? k.services.get('i18n') : null;
    if (i18n?.detect) { const d = i18n.detect(text); if (d) return d; }
  } catch { /* fall through */ }
  if (DEVA.test(text)) return 'hi';
  return (String(text).match(HING) || []).length >= 2 ? 'hinglish' : 'en';
}

const R = {
  en: {
    greet: 'Hello! I am Guru, working offline in local mode. Ask me for a CBSE paper, notes, files or Drive tasks.',
    thanks: 'You are welcome!', bye: 'Goodbye! Call me anytime.',
    working: 'On it: running {tool}.',
    done: 'Done.', failed: 'That step failed: {err}', file: 'File ready: {name}',
    suggest: 'This looks like a job for {tool} with {args}. Pass tools to run it.',
    help: 'I am running in offline local mode (no API key). I can route requests to tools. Try: {examples}. Add an API key in Settings for full AI power.',
    nomatch: 'I could not match that to an offline command. {help}',
    status: 'Local engine, offline, no network used.',
  },
  hi: {
    greet: 'नमस्ते! मैं गुरु हूँ, अभी ऑफ़लाइन लोकल मोड में चल रहा हूँ। CBSE पेपर, नोट्स, फ़ाइलें या Drive के काम बताइए।',
    thanks: 'आपका स्वागत है!', bye: 'अलविदा! जब चाहें बुला लीजिए।',
    working: 'ठीक है: {tool} चला रहा हूँ।',
    done: 'हो गया।', failed: 'यह चरण विफल हुआ: {err}', file: 'फ़ाइल तैयार: {name}',
    suggest: 'यह काम {tool} टूल से {args} के साथ होगा। इसे चलाने के लिए टूल दें।',
    help: 'मैं ऑफ़लाइन लोकल मोड में हूँ (कोई API कुंजी नहीं)। मैं अनुरोधों को टूल तक पहुँचा सकता हूँ। आज़माइए: {examples}। पूरी क्षमता के लिए सेटिंग्स में API कुंजी जोड़ें।',
    nomatch: 'मैं इसे किसी ऑफ़लाइन कमांड से मिला नहीं पाया। {help}',
    status: 'लोकल इंजन, ऑफ़लाइन, कोई नेटवर्क उपयोग नहीं।',
  },
  hinglish: {
    greet: 'Namaste! Main Guru hoon, abhi offline local mode mein chal raha hoon. CBSE paper, notes, files ya Drive ka kaam batao.',
    thanks: 'Koi baat nahi!', bye: 'Alvida! Jab chaho bula lena.',
    working: 'Theek hai: {tool} chala raha hoon.',
    done: 'Ho gaya.', failed: 'Yeh step fail hua: {err}', file: 'File ready: {name}',
    suggest: 'Yeh kaam {tool} tool se {args} ke saath hoga. Chalane ke liye tools do.',
    help: 'Main offline local mode mein hoon (API key nahi hai). Main requests ko tools tak pahuncha sakta hoon. Try karo: {examples}. Poori power ke liye Settings mein API key daalo.',
    nomatch: 'Main ise kisi offline command se match nahi kar paya. {help}',
    status: 'Local engine, offline, network use nahi hua.',
  },
};
const tr = (lang, key, v = {}) => (R[lang] || R.en)[key].replace(/\{(\w+)\}/g, (_, n) => (v[n] ?? ''));

const CANNED = [
  ['greet', /^\s*(hi|hello|hey|hii+|namaste|namaskar)\b|^\s*(नमस्ते|नमस्कार|हेलो|हैलो|गुरु)\s*[!.।]*\s*$/i],
  ['thanks', /\b(thanks?|thank you|thx|shukriya|dhanyavaad|dhanyawad)\b|धन्यवाद|शुक्रिया/i],
  ['bye', /^\s*(bye|goodbye|alvida)\b|अलविदा/i],
];

/** Enumerate registered intents from whatever the kernel exposes. */
export function listIntents(k) {
  const I = k?.intents;
  if (!I) return [];
  let l = null;
  for (const n of ['list', 'all', 'getAll']) if (typeof I[n] === 'function') { try { l = I[n](); break; } catch { /* next */ } }
  if (!l) l = I.items || I.intents || null;
  if (l instanceof Map) l = [...l.values()];
  return Array.isArray(l) ? l.filter((x) => x && x.tool) : [];
}

/** Match free text to {tool,args,intent}; prefers kernel's own matcher when present. */
export function route(k, text, lang) {
  const I = k?.intents;
  if (I && typeof I.match === 'function') {
    try {
      let m = I.match(text, lang);
      if (Array.isArray(m)) m = m[0];
      if (m) {
        const tool = m.tool ?? m.intent?.tool;
        if (tool) return { tool, args: m.args ?? (m.intent?.extract ? m.intent.extract(text, lang) : {}) ?? {}, intent: m.intent || m };
      }
    } catch { /* use own matcher */ }
  }
  let best = null, bestScore = 0;
  for (const it of listIntents(k)) {
    for (const p of it.patterns || []) {
      let m;
      try { m = new RegExp(p.source, (p.flags || '').replace(/[gy]/g, '')).exec(text); } catch { continue; }
      if (!m) continue;
      const score = m[0].length + (m.index === 0 ? 0.5 : 0);
      if (score > bestScore) { bestScore = score; best = it; }
    }
  }
  if (!best) return null;
  let args = {};
  try { args = (best.extract ? best.extract(text, lang) : {}) || {}; } catch { args = {}; }
  return { tool: best.tool, args, intent: best };
}

const AGENT_BY_PREFIX = [[/^cbse_/, 'cbse-author'], [/^file_/, 'file-engineer'], [/^(drive|local|github)_/, 'drive-ops'], [/^web_/, 'researcher'], [/^memory_/, 'curator'], [/^(run_js|emit_artifact)$/, 'coder']];
export const agentFor = (tool) => (AGENT_BY_PREFIX.find(([re]) => re.test(tool)) || [null, 'tutor'])[1];

function extractSection(text, label) {
  const m = new RegExp(`${label}\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\s*\\n|\\n[A-Z][A-Za-z ]{2,20}\\s*[:：]|$)`, 'i').exec(text);
  return m ? m[1].trim() : null;
}

function planJSON(k, goal, lang) {
  const r = route(k, goal, lang);
  const tasks = r
    ? [{ id: 't1', agent: agentFor(r.tool), task: goal, deps: [], tool: r.tool, args: r.args }]
    : [{ id: 't1', agent: 'tutor', task: goal, deps: [] }];
  return { goal, tasks, plan: tasks, source: 'local-rules' };
}

function criticJSON(goal, answer) {
  const issues = [];
  let score = 10;
  const a = String(answer || '').trim();
  if (!a) { score = 0; issues.push('empty answer'); }
  else {
    if (a.length < 20) { score -= 3; issues.push('answer too short'); }
    if (DEVA.test(goal) && !DEVA.test(a)) { score -= 3; issues.push('answer not in the requested language (Hindi)'); }
    if (/\b(error|exception|failed)\b|त्रुटि|विफल/i.test(a)) { score -= 3; issues.push('answer mentions an error or failure'); }
    if (/\b(undefined|NaN|null)\b|\[object/.test(a)) { score -= 4; issues.push('answer contains undefined/NaN values'); }
    if (/\b(TODO|TBD|lorem ipsum|placeholder)\b/i.test(a)) { score -= 3; issues.push('answer contains placeholder text'); }
  }
  score = Math.max(0, Math.min(10, score));
  return {
    score, verdict: score >= 8 ? 'pass' : 'revise', issues, feedback: issues.join('; '),
    scores: { correctness: score, cbse_fidelity: score, language: DEVA.test(goal) && !DEVA.test(a) ? 4 : score, completeness: score },
    source: 'local-rules',
  };
}

function short(v, n = 600) {
  let s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) s = '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

function summariseToolResults(results, lang) {
  const lines = [];
  for (const m of results) {
    let v = m.content;
    try { v = JSON.parse(m.content); } catch { /* plain text */ }
    const name = m.name ? `${m.name}: ` : '';
    if (v && typeof v === 'object' && v.error) lines.push(`${name}${tr(lang, 'failed', { err: short(v.error, 200) })}`);
    else if (v && typeof v === 'object' && v.artifact?.filename) lines.push(`${name}${tr(lang, 'file', { name: v.artifact.filename })}`);
    else lines.push(`${name}${short(v)}`);
  }
  return `${tr(lang, 'done')}\n${lines.join('\n')}`.trim();
}

async function stream(text, onToken, signal) {
  if (!onToken) return;
  for (const part of text.match(/\S+\s*/g) || []) {
    if (signal?.aborted) { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }
    try { onToken(part); } catch { /* consumer error ignored */ }
    await Promise.resolve();
  }
}

const approx = (s) => Math.ceil(String(s || '').length / 4);

/**
 * Local chat: same contract as the other providers.
 * @param {object} k kernel API (uses k.intents, optionally k.services i18n)
 * @param {{system?:string,messages?:Array,tools?:Array,json?:boolean,onToken?:Function,signal?:AbortSignal}} opts
 */
export async function chat(k, opts = {}) {
  const { system = '', messages = [], tools, json, onToken, signal } = opts;
  if (signal?.aborted) { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }
  const lastUserMsg = [...messages].reverse().find((m) => m && m.role === 'user');
  const userText = textOf(lastUserMsg?.content ?? (typeof messages[messages.length - 1] === 'string' ? messages[messages.length - 1] : ''));
  const lang = detectLang(userText, k);
  const inTokens = approx(system) + messages.reduce((n, m) => n + approx(textOf(m && m.content)), 0);
  const finish = (text, toolCalls = []) => ({ text, toolCalls, usage: { in: inTokens, out: approx(text) }, provider: 'local' });

  if (json) {
    const sys = `${system}\n${userText.slice(0, 200)}`;
    let obj;
    if (/critic|critique|score .*0\s*(-|–|to)\s*10|rate the answer/i.test(sys)) {
      const goal = extractSection(userText, 'goal') || userText;
      obj = criticJSON(goal, extractSection(userText, 'answer') ?? '');
    } else if (/planner|decompos|\bplan\b|\bDAG\b/i.test(sys)) {
      const goal = extractSection(userText, 'goal') || userText.trim();
      obj = planJSON(k, goal, detectLang(goal, k));
    } else obj = { answer: tr(lang, 'status') };
    return finish(JSON.stringify(obj));
  }

  const trailing = [];
  for (let i = messages.length - 1; i >= 0 && messages[i] && messages[i].role === 'tool'; i--) trailing.unshift({ ...messages[i], content: textOf(messages[i].content) });
  let text, toolCalls = [];
  if (trailing.length) text = summariseToolResults(trailing, lang);
  else {
    const canned = userText.length <= 40 ? CANNED.find(([, re]) => re.test(userText)) : null;
    const r = canned ? null : route(k, userText, lang);
    if (canned) text = tr(lang, canned[0]);
    else if (r) {
      const allowed = !Array.isArray(tools) || !tools.length ? null : tools.some((t) => (t.name || t.function?.name) === r.tool);
      if (allowed) { toolCalls = [{ id: genId('local'), name: r.tool, args: r.args || {} }]; text = tr(lang, 'working', { tool: r.tool }); }
      else text = tr(lang, 'suggest', { tool: r.tool, args: short(r.args || {}, 200) });
    } else {
      const ex = listIntents(k).map((i) => (i.examples || [])[0]).filter(Boolean).slice(0, 4).join(' | ') || '...';
      const help = tr(lang, 'help', { examples: ex });
      text = /\b(help|what can you do)\b|who are you|मदद|तुम कौन|आप कौन|madad|kya kar sakte/i.test(userText) ? help : tr(lang, 'nomatch', { help });
    }
  }
  await stream(text, onToken, signal);
  return finish(text, toolCalls);
}

export const local = { id: 'local', label: 'Local (offline)', needsKey: false, chat };
