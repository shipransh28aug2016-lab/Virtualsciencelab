// Learning: run analysis -> lessons, skill stats, preference extraction, decay, dedupe/merge, consolidation.
import { tokenSet, jaccard, words } from './retrieve.js';

const DAY = 86400000;
export const HALF_LIFE_DAYS = { episode: 14, lesson: 90, skill: 120, pref: 180, fact: 365 };
const gist = (s, n = 80) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const top = (o) => Object.entries(o || {}).sort((a, b) => b[1] - a[1]);

/** Cheap local language detector: 'hi' | 'en' | 'hinglish'. */
export function detectLang(text) {
  const t = String(text || '');
  const deva = (t.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (t.match(/[a-zA-Z]/g) || []).length;
  if (!deva && !latin) return 'en';
  if (deva / (deva + latin) > 0.5) return 'hi';
  const hing = /\b(hai|hain|kya|karo|kar|banao|bana|mujhe|mera|meri|aur|nahi|chahiye|dikhao|likho|batao|do|kaise|kyun|ke liye|wala|wali|isko|usko|abhi|bhi|se|ko|ka|ki|ke)\b/gi;
  const hits = (t.match(hing) || []).length;
  if (deva && latin) return 'hinglish';
  return hits >= 2 ? 'hinglish' : 'en';
}

const FORMATS = { docx: /\b(docx|word)\b|वर्ड/i, pdf: /\bpdf\b/i, xlsx: /\b(xlsx|excel|spreadsheet)\b|एक्सेल/i, pptx: /\b(pptx|ppt|slides?|presentation)\b|स्लाइड|प्रेजेंटेशन/i, md: /\b(markdown|\.md)\b/i, csv: /\bcsv\b/i };
const OUTLANG = { hi: /\b(in hindi|hindi (?:me|mein)|hindi version)\b|हिंदी में|हिन्दी में/i, en: /\b(in english|english (?:me|mein))\b|अंग्रेजी में|अंग्रेज़ी में/i, bilingual: /\b(bilingual|dono bhasha|both languages)\b|द्विभाषी|दोनों भाषा/i };
const LENGTH = { short: /\b(short|brief|concise|terse|tl;?dr|summary|chhota|sankshep|in short)\b|संक्षेप|संक्षिप्त|छोटा/i, long: /\b(detailed|in detail|elaborate|long|step by step|vistar|vistaar)\b|विस्तार|विस्तृत/i };

/** Update preference counters from a piece of user text. Mutates and returns prefs. */
export function observePrefs(prefs, text) {
  prefs.n = (prefs.n || 0) + 1;
  prefs.lang ||= {}; prefs.out ||= {}; prefs.format ||= {}; prefs.length ||= {};
  bump(prefs.lang, detectLang(text));
  for (const [k, re] of Object.entries(OUTLANG)) if (re.test(text)) bump(prefs.out, k);
  for (const [k, re] of Object.entries(FORMATS)) if (re.test(text)) bump(prefs.format, k);
  for (const [k, re] of Object.entries(LENGTH)) if (re.test(text)) bump(prefs.length, k);
  return prefs;
}

/** Dominant preference per dimension (count>=3, share>=0.6). */
export function dominantPrefs(prefs) {
  const res = {};
  for (const dim of ['lang', 'out', 'format', 'length']) {
    const t = top(prefs?.[dim]);
    const total = t.reduce((s, [, n]) => s + n, 0);
    if (t.length && t[0][1] >= 3 && t[0][1] / total >= 0.6) res[dim] = t[0][0];
  }
  return res;
}

const PREF_TEXT = {
  lang: (v) => `User usually writes in ${v === 'hi' ? 'Hindi' : v === 'hinglish' ? 'Hinglish' : 'English'}`,
  out: (v) => `User prefers outputs in ${v === 'hi' ? 'Hindi' : v === 'en' ? 'English' : 'bilingual Hindi+English'}`,
  format: (v) => `User prefers ${v} format for documents`,
  length: (v) => `User prefers ${v === 'short' ? 'short, terse' : 'detailed'} answers`,
};
export function prefMemories(prefs) {
  return Object.entries(dominantPrefs(prefs)).map(([dim, v]) => ({ text: PREF_TEXT[dim](v), tags: ['pref', dim, String(v)], dim }));
}

const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** Turn a RunRecord into a structured analysis (tolerant of partial records). */
export function analyseRun(run) {
  const goal = String(run.goal || '');
  const plan = Array.isArray(run.plan) ? run.plan : arr(run.plan?.tasks);
  const tasks = arr(run.tasks).length ? arr(run.tasks) : plan;
  const agents = [...new Set(tasks.map((t) => t.agent).filter(Boolean))];
  const tools = new Set();
  for (const t of tasks) {
    for (const x of arr(t.tools)) tools.add(typeof x === 'string' ? x : x?.name);
    for (const x of arr(t.toolCalls)) tools.add(typeof x === 'string' ? x : x?.name);
  }
  for (const x of arr(run.toolCalls)) tools.add(typeof x === 'string' ? x : x?.name);
  tools.delete(undefined);
  const cr = run.critique;
  const score = typeof cr === 'number' ? cr : typeof cr?.score === 'number' ? cr.score : null;
  const issues = typeof cr === 'object' && cr ? [...arr(cr.issues), ...arr(cr.problems), ...arr(cr.fixes)].map((x) => (typeof x === 'string' ? x : x?.text || x?.issue || '')).filter(Boolean) : [];
  if (typeof cr === 'object' && cr && !issues.length && score !== null && score < 8) {
    for (const f of [cr.feedback, cr.notes, cr.text, cr.summary]) if (typeof f === 'string' && f) { issues.push(f); break; }
  }
  const failures = tasks.filter((t) => t.error || /^(error|failed)$/i.test(t.status || ''));
  const ok = score !== null ? score >= 8 : !run.error && !!run.answer && !failures.length;
  const g = gist(goal);
  const lessons = [];
  for (const i of issues.slice(0, 3)) lessons.push({ text: `Avoid: ${gist(i, 140)} (task: ${g})`, weight: 1.5, tags: ['lesson', 'critique'] });
  if (score !== null && score < 8 && !issues.length) lessons.push({ text: `Low score ${score}/10 on "${g}" — revisit approach`, weight: 1.2, tags: ['lesson', 'critique'] });
  for (const f of failures.slice(0, 2)) lessons.push({ text: `${f.agent || 'task'} failed on "${g}": ${gist(f.error?.message || f.error || f.status, 100)}`, weight: 1.5, tags: ['lesson', 'failure'] });
  if (ok && (score === null || score >= 9) && agents.length && tools.size) lessons.push({ text: `For "${g}" use ${agents.join('+')} with ${[...tools].slice(0, 5).join(', ')}`, weight: 1, tags: ['lesson', 'success'] });
  for (const l of arr(run.lessons)) if (typeof l === 'string' && l.trim()) lessons.push({ text: gist(l, 200), weight: 1, tags: ['lesson'] });
  return { id: run.id, goal, gist: g, lang: run.lang || detectLang(goal), agents, tools: [...tools], score, ok, lessons, answerGist: gist(run.answer, 100) };
}

/** Per-skill (agent/tool) success statistics. Mutates and returns stats. */
export function updateSkillStats(stats, a, now = Date.now()) {
  const keys = [...a.agents.map((x) => `agent:${x}`), ...a.tools.map((x) => `tool:${x}`)];
  for (const key of keys) {
    const s = (stats[key] ||= { runs: 0, ok: 0, scoreSum: 0, scored: 0, fb: 0, last: 0 });
    s.runs++; if (a.ok) s.ok++;
    if (a.score !== null) { s.scoreSum += a.score; s.scored++; }
    s.last = now;
  }
  return stats;
}

/** Map feedback score (-1|0|1|2..5) onto [-1,1]. */
export function normFeedback(score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s === 0) return 0;
  if (s <= -1) return -1;
  if (s === 1) return 1;
  return Math.max(-1, Math.min(1, (s - 3) / 2));
}

/**
 * Exponential decay by kind half-life. Pinned records are exempt.
 * @returns {{updates:object[], removeIds:string[]}}
 */
export function decayRecords(records, now = Date.now(), o = {}) {
  const hl = { ...HALF_LIFE_DAYS, ...(o.halfLife || {}) };
  const minWeight = o.minWeight ?? 0.05;
  const updates = [], removeIds = [];
  for (const r of records) {
    if (r.meta?.pinned) continue;
    const last = r.decayed || r.updated || r.created || now;
    const dt = (now - last) / DAY;
    if (dt < 1 / 24) continue;
    const w = (r.weight ?? 1) * Math.pow(0.5, dt / (hl[r.kind] || 90));
    if (w < minWeight) removeIds.push(r.id);
    else updates.push({ ...r, weight: +w.toFixed(4), decayed: now });
  }
  return { updates, removeIds };
}

/** Merge b into a copy of a (a is the survivor). */
export function mergeRecords(a, b, now = Date.now()) {
  const wa = a.weight ?? 1, wb = b.weight ?? 1;
  return {
    ...a,
    text: (b.weight ?? 1) > wa || (wb === wa && b.text.length > a.text.length && b.kind !== 'episode') ? b.text : a.text,
    tags: [...new Set([...(a.tags || []), ...(b.tags || [])])],
    meta: { ...(b.meta || {}), ...(a.meta || {}), pinned: a.meta?.pinned || b.meta?.pinned || undefined },
    weight: Math.min(5, Math.max(wa, wb) + 0.25 * Math.min(wa, wb)),
    count: (a.count || 1) + (b.count || 1),
    created: Math.min(a.created || now, b.created || now),
    updated: now,
  };
}

/** Group near-duplicates (same kind, jaccard >= threshold). Returns [[survivor, ...dups]] by descending weight. */
export function findDuplicateGroups(records, threshold = 0.8) {
  const byKind = new Map();
  for (const r of records) (byKind.get(r.kind) || byKind.set(r.kind, []).get(r.kind)).push(r);
  const groups = [];
  for (const list of byKind.values()) {
    const sets = list.map((r) => tokenSet(r.text));
    const used = new Set();
    const order = list.map((_, i) => i).sort((i, j) => (list[j].weight ?? 1) - (list[i].weight ?? 1));
    for (const i of order) {
      if (used.has(i)) continue;
      const g = [list[i]];
      for (const j of order) {
        if (j === i || used.has(j)) continue;
        const sim = sets[i].size < 3 && sets[j].size < 3 ? (list[i].text.trim().toLowerCase() === list[j].text.trim().toLowerCase() ? 1 : 0) : jaccard(sets[i], sets[j]);
        if (sim >= threshold) { g.push(list[j]); used.add(j); }
      }
      used.add(i);
      if (g.length > 1) groups.push(g);
    }
  }
  return groups;
}

let _id = 0;
export const newId = (p = 'm') => `${p}_${Date.now().toString(36)}${(_id++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Summarise old episodes into lessons. Rule-based; uses `llm` (service) only when online with a key.
 * @returns {Promise<{created:object[], removeIds:string[]}>}
 */
export async function consolidateEpisodes(records, now = Date.now(), o = {}, llm = null) {
  const olderThan = (o.olderThanDays ?? 14) * DAY, minGroup = o.minGroup ?? 3;
  const old = records.filter((r) => r.kind === 'episode' && !r.meta?.pinned && now - (r.updated || r.created) >= olderThan);
  const groups = new Map();
  for (const r of old) {
    const key = r.meta?.agents?.[0] || r.tags?.find((t) => t !== 'episode') || 'general';
    (groups.get(key) || groups.set(key, []).get(key)).push(r);
  }
  const created = [], removeIds = [];
  for (const [key, list] of groups) {
    if (list.length < minGroup) continue;
    const scores = list.map((r) => r.meta?.score).filter((x) => typeof x === 'number');
    const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
    const okN = list.filter((r) => r.meta?.ok).length;
    const terms = {}, tools = {};
    for (const r of list) {
      for (const w of new Set(words(r.meta?.goal || r.text))) if (w.length >= 4) bump(terms, w);
      for (const t of r.meta?.tools || []) bump(tools, t);
    }
    const topTerms = top(terms).filter(([, n]) => n > 1).slice(0, 5).map(([w]) => w);
    const topTools = top(tools).slice(0, 4).map(([t]) => t);
    let text = `${list.length} past "${key}" tasks${avg !== null ? `, avg score ${avg.toFixed(1)}` : ''}, ${okN} ok` +
      (topTerms.length ? `; themes: ${topTerms.join(', ')}` : '') + (topTools.length ? `; tools: ${topTools.join(', ')}` : '');
    if (llm?.chat && llm.status?.().online && llm.status?.().hasKey) {
      try {
        const r = await llm.chat({ tier: 'fast', system: 'Summarise task history into 1-2 terse reusable lessons. No preamble.', messages: [{ role: 'user', content: list.map((x) => `- ${x.text}`).join('\n').slice(0, 4000) }] });
        if (r?.text?.trim()) text = gist(r.text.trim(), 400) + ` [${text}]`;
      } catch { /* keep rule-based summary */ }
    }
    const wsum = list.reduce((s, r) => s + (r.weight ?? 1), 0);
    created.push({ id: newId(), kind: 'lesson', text, tags: ['lesson', 'consolidated', key], meta: { consolidated: list.length, source: key }, weight: Math.min(3, 1 + wsum * 0.2), created: now, updated: now, hits: 0, count: 1 });
    removeIds.push(...list.map((r) => r.id));
  }
  return { created, removeIds };
}
