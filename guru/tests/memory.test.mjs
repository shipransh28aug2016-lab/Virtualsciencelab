import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemory } from '../src/memory/service.js';
import { createStore } from '../src/memory/store.js';
import { search, tokenize, stem, normalize } from '../src/memory/retrieve.js';
import { analyseRun, decayRecords, detectLang, observePrefs, dominantPrefs } from '../src/memory/learn.js';
import { register } from '../src/memory/index.js';

const DAY = 86400000;
let T = Date.parse('2026-01-01T00:00:00Z');
const fresh = (seed = false) => createMemory({ store: createStore({ backend: 'memory' }), seed, now: () => T });

test('tokenizer: Devanagari stemming, nukta/chandrabindu normalisation, Roman aliases', () => {
  assert.equal(stem(normalize('किताबें')), stem(normalize('किताब')));
  assert.equal(stem(normalize('लड़कियों')), stem(normalize('लड़की')) + '');
  assert.equal(normalize('हिन्दी'), normalize('हिंदी'));
  assert.ok(tokenize('meri bhasha').includes(tokenize('भाषा')[0]));
  assert.deepEqual(tokenize('मेरी क्या है'), []); // stopwords only
  assert.equal(normalize('१२३'), '123');
});

test('ranking: BM25 relevance, weight and recency boost', async () => {
  const m = fresh();
  await m.remember({ text: 'Physics practical viva questions for class 12', tags: ['physics'] });
  const best = await m.remember({ text: 'CBSE marksheet generator reads marks from Excel and prints report cards', tags: ['marksheet'] });
  await m.remember({ text: 'Accountancy partnership deed format', tags: ['commerce'] });
  const r = await m.recall('marksheet excel marks');
  assert.equal(r[0].id, best);
  assert.ok(r[0].score > 0);
  assert.equal((await m.recall('zzzunknownterm')).length, 0);

  // weight boost between otherwise identical texts
  const a = { id: 'a', kind: 'fact', text: 'unit test ranking topic', tags: [], weight: 0.3, created: T, updated: T };
  const b = { ...a, id: 'b', weight: 3 };
  assert.equal(search([a, b], 'ranking topic', { now: T })[0].id, 'b');
  // recency boost
  const old = { ...a, id: 'old', weight: 1, updated: T - 365 * DAY, created: T - 365 * DAY };
  const nw = { ...a, id: 'new', weight: 1, updated: T, created: T };
  assert.equal(search([old, nw], 'ranking topic', { now: T })[0].id, 'new');
});

test('filters: kind and tags', async () => {
  const m = fresh();
  await m.remember({ kind: 'fact', text: 'marksheet alpha', tags: ['x'] });
  await m.remember({ kind: 'lesson', text: 'marksheet beta', tags: ['y'] });
  assert.equal((await m.recall('marksheet', { kind: 'lesson' })).length, 1);
  const t = await m.recall('marksheet', { tags: ['x'] });
  assert.equal(t.length, 1);
  assert.match(t[0].text, /alpha/);
});

test('Hindi, Hinglish and mixed queries retrieve seeded profile', async () => {
  const m = fresh(true);
  const hi = await m.recall('उपयोगकर्ता शिक्षक');
  assert.ok(hi.length && /शिक्षक|teacher/i.test(hi[0].text));
  const hi2 = await m.recall('मेरी भाषा क्या है');
  assert.ok(hi2.some((x) => /हिंदी|Hindi/.test(x.text)));
  const hing = await m.recall('meri bhasha hindi english');
  assert.ok(hing.some((x) => /Hinglish|Hindi/.test(x.text)));
  const cross = await m.recall('marksheet kaise banate hain');
  assert.ok(cross.some((x) => /marksheet/i.test(x.text)));
  const sub = await m.recall('भौतिकी रसायन कक्षा');
  assert.ok(sub.length > 0);
  assert.ok((await m.recall('physics chemistry teacher'))[0].text.length > 0);
});

test('dedupe: remember merges near-duplicates; dedupe() merges existing', async () => {
  const m = fresh();
  const a = await m.remember({ text: 'User prefers short terse answers always', tags: ['a'], weight: 1 });
  const b = await m.remember({ text: 'User prefers short terse answers always.', tags: ['b'], weight: 1 });
  assert.equal(a, b);
  const rec = m.store.get(a);
  assert.deepEqual(rec.tags.sort(), ['a', 'b']);
  assert.ok(rec.weight > 1 && rec.count === 2);
  // raw insert of duplicates then batch dedupe
  for (const id of ['d1', 'd2']) await m.store.put({ id, kind: 'fact', text: 'chemistry titration lab report format', tags: [], weight: 1, created: T, updated: T });
  const before = m.store.size;
  const { merged } = await m.dedupe();
  assert.equal(merged, 1);
  assert.equal(m.store.size, before - 1);
  const distinct = await m.remember({ text: 'Completely different accountancy ledger note' });
  assert.notEqual(distinct, a);
});

test('decay: half-life reduces weight, removes stale, spares pinned', async () => {
  const m = fresh();
  const ep = await m.remember({ kind: 'episode', text: 'old episode about nothing important' });
  const fact = await m.remember({ kind: 'fact', text: 'durable fact alpha beta gamma' });
  const pin = await m.remember({ kind: 'episode', text: 'pinned episode keep forever', meta: { pinned: true } });
  T += 14 * DAY;
  let r = await m.decay();
  assert.ok(Math.abs(m.store.get(ep).weight - 0.5) < 0.01, 'episode halves after 14d');
  assert.ok(m.store.get(fact).weight > 0.95);
  T += 120 * DAY;
  r = await m.decay();
  assert.equal(m.store.get(ep), undefined);
  assert.ok(r.removed >= 1);
  assert.ok(m.store.get(pin));
  const { updates } = decayRecords([{ id: 'z', kind: 'lesson', text: 'x', weight: 1, updated: T }], T);
  assert.equal(updates.length, 0); // no time elapsed
});

test('consolidate: old episodes summarised into one lesson', async () => {
  const m = fresh();
  await m.init();
  for (let i = 0; i < 4; i++) await m.store.put({ id: `e${i}`, kind: 'episode', text: `marksheet batch ${i} done`, tags: ['episode', 'file-engineer'], meta: { agents: ['file-engineer'], goal: `generate marksheet batch ${i}`, score: 8 + (i % 2), ok: true, tools: ['file_write'] }, weight: 1, created: T - 30 * DAY, updated: T - 30 * DAY });
  await m.store.put({ id: 'recent', kind: 'episode', text: 'recent one', tags: ['episode'], meta: { agents: ['tutor'] }, weight: 1, created: T, updated: T });
  const r = await m.consolidate();
  assert.equal(r.lessons, 1);
  assert.equal(r.removed, 4);
  const les = m.list({ kind: 'lesson' })[0];
  assert.match(les.text, /file-engineer/);
  assert.match(les.text, /marksheet/);
  assert.ok(m.store.get('recent'));
});

test('export/import round trip (and merge semantics, bad input)', async () => {
  const a = fresh(true);
  await a.remember({ text: 'unique roundtrip memory zebra', tags: ['t'] });
  await a.reflect({ id: 'r1', goal: 'make pdf short summary', answer: 'ok', critique: { score: 9 }, tasks: [{ agent: 'tutor', tools: ['file_write'] }] });
  const dump = JSON.parse(JSON.stringify(a.export()));
  const b = fresh();
  const res = await b.import(JSON.stringify(dump));
  assert.equal(res.memories, a.store.size);
  assert.equal((await b.recall('zebra'))[0].text, 'unique roundtrip memory zebra');
  assert.deepEqual(b.store.getMeta('skillStats'), a.store.getMeta('skillStats'));
  assert.equal((await b.import(dump)).memories, 0); // idempotent merge
  await assert.rejects(() => b.import({ app: 'other' }));
  await assert.rejects(() => b.import({ app: 'guru-memory', version: 99, memories: [] }));
  await b.import(dump, { replace: true });
  assert.equal(b.store.size, a.store.size);
});

test('reflect: lessons, skill stats, preferences, idempotency, feedback', async () => {
  const m = fresh(true);
  const bad = { id: 'run1', goal: 'Generate class 12 physics question paper in Hindi', answer: 'draft', critique: { score: 5, issues: ['marks total mismatch', 'missing case-based section'] }, tasks: [{ agent: 'cbse-author', tools: ['cbse_question_paper'] }, { agent: 'critic', status: 'error', error: 'timeout' }] };
  const lessons = await m.reflect(bad);
  assert.ok(lessons.some((l) => /marks total mismatch/.test(l)));
  assert.ok(lessons.some((l) => /critic failed/.test(l)));
  const stats = m.store.getMeta('skillStats');
  assert.equal(stats['agent:cbse-author'].runs, 1);
  assert.equal(stats['agent:cbse-author'].ok, 0);
  assert.equal(stats['tool:cbse_question_paper'].scored, 1);
  assert.deepEqual(await m.reflect(bad), lessons); // idempotent
  assert.equal(m.store.getMeta('skillStats')['agent:cbse-author'].runs, 1);

  const good = (i) => ({ id: `g${i}`, goal: `Make xlsx marksheet short, brief please ${i}`, answer: 'done', critique: { score: 9 }, tasks: [{ agent: 'file-engineer', tools: ['file_write'] }] });
  for (let i = 0; i < 4; i++) await m.reflect(good(i));
  const s2 = m.store.getMeta('skillStats')['agent:file-engineer'];
  assert.equal(s2.runs, 4); assert.equal(s2.ok, 4);
  const p = await m.profile();
  assert.equal(p.style.format, 'xlsx');
  assert.equal(p.style.length, 'short');
  assert.ok(p.stats.topSkills.find((x) => x.id === 'agent:file-engineer').successRate === 1);
  assert.ok(m.list({ kind: 'pref' }).some((x) => /xlsx/.test(x.text)));
  assert.ok((await m.recall('physics question paper marks', { kind: 'lesson' })).length > 0);

  const ep = m.store.get(m.store.getMeta('runs').run1.episodeId);
  const w0 = ep.weight;
  await m.feedback('run1', { score: -1, note: 'too long, keep it short' });
  assert.ok(m.store.get(ep.id).weight < w0);
  assert.ok(m.store.getMeta('skillStats')['agent:cbse-author'].fb < 0);
  assert.ok(m.list({ kind: 'lesson' }).some((x) => /too long/.test(x.text)));
});

test('profile: seed + language detection + prefs helpers', async () => {
  const m = fresh(true);
  const p = await m.profile();
  assert.match(p.role, /CBSE teacher/);
  assert.deepEqual(p.subjects, ['Commerce', 'Physics', 'Chemistry']);
  assert.equal(p.style.output, 'terse');
  assert.equal(detectLang('कक्षा 12 का पेपर बनाओ'), 'hi');
  assert.equal(detectLang('mujhe marksheet banao jaldi'), 'hinglish');
  assert.equal(detectLang('Create a question paper'), 'en');
  const pr = {};
  for (let i = 0; i < 4; i++) observePrefs(pr, 'हिंदी में प्रश्नपत्र बनाओ');
  assert.equal(dominantPrefs(pr).out, 'hi');
  assert.equal(analyseRun({ goal: 'g', answer: 'a' }).ok, true);
});

test('module register: service + tools + run:done reflection', async () => {
  const tools = new Map(), services = new Map(), handlers = {}, intents = [];
  const k = {
    bus: { on: (e, f) => { (handlers[e] ||= []).push(f); return () => {}; }, emit: (e, p) => (handlers[e] || []).forEach((f) => f(p)) },
    tools: { register: (t) => tools.set(t.name, t), call: (n, a) => tools.get(n).run(a, {}) },
    services: { set: (n, v) => services.set(n, v), get: (n) => services.get(n), has: (n) => services.has(n) },
    intents: { register: (i) => intents.push(i) },
  };
  await register(k);
  assert.ok(services.has('memory'));
  for (const n of ['memory_remember', 'memory_recall', 'memory_forget', 'memory_profile']) assert.ok(tools.has(n), n);
  const { id } = await k.tools.call('memory_remember', { text: 'Board exam date sheet pinned note xyzzy' });
  assert.equal((await k.tools.call('memory_recall', { query: 'xyzzy' }))[0].id, id);
  assert.deepEqual((await k.tools.call('memory_forget', { id })).removed, [id]);
  assert.equal((await k.tools.call('memory_profile', {})).langPref.length > 0, true);
  const rem = intents.find((i) => i.id === 'memory.remember');
  assert.ok(rem.patterns.some((p) => p.test('remember that marks are out of 80')));
  assert.equal(rem.extract('yaad rakho ki marks 80 mein hain').text, 'marks 80 mein hain');
  k.bus.emit('run:done', { run: { id: 'bus1', goal: 'quick task', answer: 'x' } });
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(services.get('memory').store.getMeta('runs').bus1.reflected);
});
