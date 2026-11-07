// Memory service: ties store + retrieval + learning together.
import { createStore } from './store.js';
import { search, tokenSet, jaccard } from './retrieve.js';
import { analyseRun, updateSkillStats, observePrefs, prefMemories, normFeedback, decayRecords, mergeRecords, findDuplicateGroups, consolidateEpisodes, newId } from './learn.js';
import { buildProfile } from './profile.js';
import { SEED_PROFILE, seedStore } from './seed.js';

const KINDS = ['fact', 'pref', 'episode', 'skill', 'lesson'];
const MAX_RUNS = 200;
const DAY = 86400000;

/**
 * @param {{store?:object, llm?:()=>object|null, now?:()=>number, seed?:boolean, dupThreshold?:number}} [o]
 */
export function createMemory(o = {}) {
  const store = o.store || createStore();
  const llm = o.llm || (() => null);
  const clock = o.now || Date.now;
  const dupT = o.dupThreshold ?? 0.85;
  let initP = null;
  let booting = false;

  const svc = {
    store,
    /** Open store, seed once, run due maintenance. */
    init() {
      if (booting) return svc; // re-entrant call from maintenance during boot
      return (initP ||= (async () => {
        booting = true;
        try {
          await store.ready();
          if (o.seed !== false) await seedStore(store, newId);
          if (clock() - store.getMeta('maintained', 0) > DAY / 2) await svc.maintain();
        } finally { booting = false; }
        return svc;
      })());
    },

    /** @returns {Promise<string>} id (existing id if merged into a near-duplicate) */
    async remember({ kind = 'fact', text, tags = [], meta = {}, weight = 1 } = {}) {
      await svc.init();
      text = String(text ?? '').trim();
      if (!text) throw new Error('memory: text required');
      if (!KINDS.includes(kind)) kind = 'fact';
      const now = clock();
      tags = [...new Set([].concat(tags).map(String).filter(Boolean))];
      const ts = tokenSet(text);
      for (const r of store.all()) {
        if (r.kind !== kind) continue;
        const sim = ts.size < 3 ? (r.text.toLowerCase() === text.toLowerCase() ? 1 : 0) : jaccard(ts, tokenSet(r.text));
        if (sim >= dupT) {
          const m = mergeRecords(r, { text, kind, tags, meta, weight, count: 1 }, now);
          await store.put(m);
          return m.id;
        }
      }
      const rec = { id: newId(), kind, text, tags, meta, weight: Number(weight) || 1, created: now, updated: now, hits: 0, count: 1 };
      await store.put(rec);
      return rec.id;
    },

    async recall(query, { k = 6, kind, tags } = {}) {
      await svc.init();
      const now = clock();
      const hits = search(store.all(), query, { k, kind, tags, now });
      for (const h of hits) {
        const r = store.get(h.id);
        if (r) await store.put({ ...r, hits: (r.hits || 0) + 1, accessed: now, weight: Math.min(5, (r.weight ?? 1) + 0.02) });
      }
      return hits;
    },

    async forget(id) { await svc.init(); return store.del(id); },

    /** Record user feedback for a run; adjusts episode weight, skill stats, preferences. */
    async feedback(runId, { score = 0, note = '' } = {}) {
      await svc.init();
      const n = normFeedback(score);
      const runs = store.getMeta('runs', {});
      const run = (runs[runId] ||= { at: clock() });
      run.fb = n; run.note = note;
      const stats = store.getMeta('skillStats', {});
      for (const key of run.skills || []) if (stats[key]) stats[key].fb = (stats[key].fb || 0) + n;
      await store.setMeta('skillStats', stats);
      await store.setMeta('runs', runs);
      const ep = run.episodeId && store.get(run.episodeId);
      if (ep) await store.put({ ...ep, weight: Math.min(5, Math.max(0.1, (ep.weight ?? 1) * (1 + 0.5 * n))), meta: { ...ep.meta, fb: n }, updated: clock() });
      if (note) {
        const prefs = observePrefs(store.getMeta('prefs', {}), note);
        await store.setMeta('prefs', prefs);
        await svc.remember({ kind: 'lesson', text: `${n < 0 ? 'Avoid' : n > 0 ? 'Keep' : 'Note'}: ${note.slice(0, 200)}${ep?.meta?.goal ? ` (task: ${ep.meta.goal.slice(0, 60)})` : ''}`, tags: ['lesson', 'feedback'], weight: n < 0 ? 2 : 1.2 });
      }
      return { runId, score: n };
    },

    /** @returns {Promise<object>} profile (seed + learned prefs + stats) */
    async profile() {
      await svc.init();
      return buildProfile({ profile: store.getMeta('profile', SEED_PROFILE), prefs: store.getMeta('prefs', {}), skillStats: store.getMeta('skillStats', {}), records: store.all(), runs: store.getMeta('runs', {}) });
    },

    /** Distil a RunRecord into lessons; updates stats/preferences. Idempotent per run.id. @returns {Promise<string[]>} */
    async reflect(run) {
      await svc.init();
      if (!run || typeof run !== 'object') return [];
      const runs = store.getMeta('runs', {});
      if (run.id && runs[run.id]?.reflected) return runs[run.id].lessons || [];
      const now = clock();
      const a = analyseRun(run);
      const lessonTexts = [];
      for (const l of a.lessons) {
        await svc.remember({ kind: 'lesson', text: l.text, tags: l.tags, weight: l.weight, meta: { runId: a.id } });
        lessonTexts.push(l.text);
      }
      const epId = await svc.remember({
        kind: 'episode', text: `${a.gist}${a.answerGist ? ` → ${a.answerGist}` : ''}${a.score !== null ? ` [${a.score}/10]` : ''}`,
        tags: ['episode', ...a.agents], weight: a.ok ? 1 : 0.8,
        meta: { runId: a.id, goal: a.gist, score: a.score, ok: a.ok, agents: a.agents, tools: a.tools, lang: a.lang },
      });
      const stats = updateSkillStats(store.getMeta('skillStats', {}), a, now);
      await store.setMeta('skillStats', stats);
      const prefs = observePrefs(store.getMeta('prefs', {}), a.goal);
      await store.setMeta('prefs', prefs);
      for (const p of prefMemories(prefs)) await svc.remember({ kind: 'pref', text: p.text, tags: p.tags, weight: 1.5, meta: { learned: true, dim: p.dim } });
      if (run.id) {
        runs[run.id] = { at: now, reflected: true, episodeId: epId, skills: [...a.agents.map((x) => `agent:${x}`), ...a.tools.map((x) => `tool:${x}`)], lessons: lessonTexts };
        const ids = Object.keys(runs);
        if (ids.length > MAX_RUNS) for (const id of ids.sort((x, y) => runs[x].at - runs[y].at).slice(0, ids.length - MAX_RUNS)) delete runs[id];
        await store.setMeta('runs', runs);
      }
      return lessonTexts;
    },

    async decay(opts) {
      await svc.init();
      const { updates, removeIds } = decayRecords(store.all(), clock(), opts);
      await store.putMany(updates);
      await store.delMany(removeIds);
      return { decayed: updates.length, removed: removeIds.length };
    },

    async dedupe(threshold = dupT) {
      await svc.init();
      let merged = 0;
      for (const [keep, ...dups] of findDuplicateGroups(store.all(), threshold)) {
        let m = keep;
        for (const d of dups) m = mergeRecords(m, d, clock());
        await store.put(m);
        await store.delMany(dups.map((d) => d.id));
        merged += dups.length;
      }
      return { merged };
    },

    async consolidate(opts) {
      await svc.init();
      const { created, removeIds } = await consolidateEpisodes(store.all(), clock(), opts, llm());
      await store.putMany(created);
      await store.delMany(removeIds);
      return { lessons: created.length, removed: removeIds.length };
    },

    /** decay + dedupe + consolidate. */
    async maintain(opts = {}) {
      await store.ready();
      const c = await svc.consolidate(opts);
      const d = await svc.decay(opts);
      const m = await svc.dedupe();
      await store.setMeta('maintained', clock());
      return { ...c, ...d, ...m };
    },

    list({ kind } = {}) { return store.all().filter((r) => !kind || r.kind === kind).sort((a, b) => b.updated - a.updated); },
    export() { return store.export(); },
    async import(json, o2) { await svc.init(); return store.import(json, o2); },
  };
  return svc;
}
