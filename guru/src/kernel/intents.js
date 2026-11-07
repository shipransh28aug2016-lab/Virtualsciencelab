// Offline intent router (en + hi + Hinglish patterns registered by modules).

const SPLIT = /\s*(?:,?\s*\b(?:and then|then|after that|afterwards)\b|;|फिर|उसके बाद|और फिर)\s*/iu;

export function createIntents(bus) {
  const list = [];
  const test = (text, lang) => {
    let best = null;
    for (const it of list) {
      for (const p of it.patterns) {
        p.lastIndex = 0;
        const m = p.exec(text);
        if (!m) continue;
        const score = 0.1 + (m[0].length / Math.max(text.length, 1));
        if (!best || score > best.score) {
          let args = {};
          try { args = it.extract ? (it.extract(text, lang) || {}) : {}; } catch { args = {}; }
          best = { id: it.id, tool: it.tool, args, score, segment: text };
        }
      }
    }
    return best;
  };
  return {
    register(it) {
      if (!it || !it.id || !it.tool) throw new Error('intents.register: id and tool required');
      const patterns = (it.patterns || []).map((p) => (p instanceof RegExp ? p : new RegExp(String(p), 'iu')));
      list.push({ examples: [], ...it, patterns });
      bus?.emit('intent:registered', { id: it.id });
    },
    list() { return list.map(({ id, tool, examples, patterns }) => ({ id, tool, examples, patterns })); },
    /** Best single match for the whole text, or null. */
    match(text, lang) { return test(String(text || ''), lang); },
    /** Multi-step: split on "then"/"फिर"; if every segment matches returns all, else the single best. */
    matchAll(text, lang) {
      const t = String(text || '').trim();
      const segs = t.split(SPLIT).map((s) => s.trim()).filter(Boolean);
      if (segs.length > 1) {
        const ms = segs.map((s) => { const m = test(s, lang); return m && { ...m, segment: s }; });
        if (ms.every(Boolean)) return ms;
      }
      const one = test(t, lang);
      return one ? [one] : [];
    },
  };
}
