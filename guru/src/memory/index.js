// Memory module entry: registers service 'memory' + tools memory_remember/recall/forget/profile.
import { createMemory } from './service.js';

export { createMemory } from './service.js';
export { createStore } from './store.js';
export { search, tokenize } from './retrieve.js';

const firstMatch = (patterns, text) => {
  for (const p of patterns) { const m = String(text).match(p); if (m && m[1]) return m[1].trim(); }
  return String(text).trim();
};

/** @param {object} k kernel API */
export async function register(k) {
  const mem = createMemory({ llm: () => (k.services.has('llm') ? k.services.get('llm') : null) });
  await mem.init();
  k.services.set('memory', mem);

  k.tools.register({
    name: 'memory_remember', tags: ['memory'],
    description: 'Save a durable fact, preference, lesson or note to long-term memory.',
    schema: { type: 'object', properties: { text: { type: 'string' }, kind: { type: 'string', enum: ['fact', 'pref', 'episode', 'skill', 'lesson'] }, tags: { type: 'array', items: { type: 'string' } }, weight: { type: 'number' } }, required: ['text'] },
    run: async (a) => ({ id: await mem.remember({ kind: a.kind || 'fact', text: a.text, tags: a.tags, weight: a.weight }) }),
  });
  k.tools.register({
    name: 'memory_recall', tags: ['memory'],
    description: 'Search long-term memory (Hindi/English/Hinglish). Returns top matches.',
    schema: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'integer' }, kind: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['query'] },
    run: async (a) => (await mem.recall(a.query, { k: a.k || 6, kind: a.kind, tags: a.tags })).map(({ id, text, kind, score }) => ({ id, text, kind, score })),
  });
  k.tools.register({
    name: 'memory_forget', tags: ['memory'],
    description: 'Delete a memory by id, or the best match for a query.',
    schema: { type: 'object', properties: { id: { type: 'string' }, query: { type: 'string' } } },
    run: async (a) => {
      if (a.id) return { removed: (await mem.forget(a.id)) ? [a.id] : [] };
      if (a.query) { const [h] = await mem.recall(a.query, { k: 1 }); if (h && !mem.store.get(h.id)?.meta?.pinned) { await mem.forget(h.id); return { removed: [h.id], text: h.text }; } }
      return { removed: [] };
    },
  });
  k.tools.register({
    name: 'memory_profile', tags: ['memory'],
    description: 'Get the user profile: role, language, subjects, style, usage stats.',
    schema: { type: 'object', properties: {} },
    run: async () => mem.profile(),
  });

  if (k.intents?.register) {
    const R = [
      { id: 'memory.remember', tool: 'memory_remember', patterns: [/\b(?:remember|note down|don'?t forget)\b\s*(?:that\s*)?(.+)/i, /yaad\s*rakh\w*\s*(?:ki)?\s*(.+)/i, /याद\s*रख[\p{L}\p{M}]*\s*(?:कि\s*)?(.+)/u], extract: (t) => ({ text: firstMatch(R[0].patterns, t) }), examples: ['remember that I teach class 12 physics', 'yaad rakho ki marks out of 80 hain', 'याद रखो कि मुझे संक्षिप्त उत्तर चाहिए'] },
      { id: 'memory.recall', tool: 'memory_recall', patterns: [/\b(?:what do you (?:remember|know) about|recall)\b\s*(.+)/i, /(.+?)\s+(?:ke baare mein|ke bare me)\s+kya\s+yaad/i, /(.+?)\s+के\s+बारे\s+में\s+क्या\s+याद/u], extract: (t) => ({ query: firstMatch(R[1].patterns, t) }), examples: ['what do you remember about marksheets', 'marksheet ke baare mein kya yaad hai'] },
      { id: 'memory.forget', tool: 'memory_forget', patterns: [/\bforget\b\s*(?:about\s*)?(.+)/i, /bhool\s*ja\w*\s*(.+)/i, /भूल\s*जा[\p{L}\p{M}]*\s*(.+)/u], extract: (t) => ({ query: firstMatch(R[2].patterns, t) }), examples: ['forget my old email', 'bhool jao purani class'] },
    ];
    for (const r of R) k.intents.register(r);
  }

  // Learn from every finished run (idempotent per run id, so a kernel-side reflect is harmless).
  k.bus?.on?.('run:done', (p) => { const run = p?.run || p; if (run && run.goal) mem.reflect(run).catch(() => {}); });
  return mem;
}
