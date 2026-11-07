// Candidate pools: turn generator entries and bank items into question objects.
import { entriesFor, generateQuestion } from './generators/index.js';
import { coreToQuestion } from './generators/common.js';
import { bankFor, AR_OPTIONS, AR_STEM } from './bank/index.js';
import { allocMarks, bi, makeRng, hashSeed } from './util.js';

const LET = ['a', 'b', 'c', 'd'];
const GROUP = { remember: 'L', understand: 'L', apply: 'A', analyse: 'H', evaluate: 'H', create: 'H' };
export const bloomGroup = (b) => GROUP[b] || 'A';
export const isCompetency = (q) => q.type === 'case' || q.type === 'ar' || ['apply', 'analyse', 'evaluate', 'create'].includes(q.bloom);

const joinPts = (pts, lang) => pts.map((p, i) => `${i + 1}. ${p[lang]}`).join(' ');

/** Written question from a conceptual bank item. */
export function conceptToQuestion(item, { type, marks }) {
  return {
    type, marks, text: item.text, chapter: item.ch, bloom: item.bloom, difficulty: item.diff,
    answer: bi(joinPts(item.pts, 'en'), joinPts(item.pts, 'hi')),
    markingScheme: allocMarks(item.pts, marks), meta: { bank: item.id, source: 'bank' },
  };
}
export function mcqFromBank(item, rng) {
  const idx = rng.shuffle([0, 1, 2, 3]);
  const options = idx.map((i) => item.opts[i]);
  const answerIndex = idx.indexOf(item.ans);
  return {
    type: 'mcq', marks: 1, text: item.text, options, answerIndex, chapter: item.ch, bloom: item.bloom, difficulty: item.diff,
    answer: bi(`(${LET[answerIndex]}) ${options[answerIndex].en}`, `(${LET[answerIndex]}) ${options[answerIndex].hi}`),
    markingScheme: [{ point: bi(`Correct option (${LET[answerIndex]})`, `सही विकल्प (${LET[answerIndex]})`), marks: 1 }], meta: { bank: item.id, source: 'bank' },
  };
}
export function arFromBank(item) {
  const options = AR_OPTIONS.en.map((e, i) => bi(e, AR_OPTIONS.hi[i]));
  const l = LET[item.ans];
  return {
    type: 'ar', marks: 1,
    text: bi(`${AR_STEM.en}\nAssertion (A): ${item.A.en}\nReason (R): ${item.R.en}`, `${AR_STEM.hi}\nअभिकथन (A): ${item.A.hi}\nकारण (R): ${item.R.hi}`),
    options, answerIndex: item.ans, chapter: item.ch, bloom: 'analyse', difficulty: item.diff,
    answer: bi(`(${l}) ${options[item.ans].en}`, `(${l}) ${options[item.ans].hi}`),
    markingScheme: [{ point: bi(`Correct option (${l})`, `सही विकल्प (${l})`), marks: 1 }], meta: { bank: item.id, source: 'bank' },
  };
}
export function caseFromBank(item, rng) {
  const subs = item.subs.map((s, i) => {
    if (s.opts) {
      const q = mcqFromBank({ text: s.text, opts: s.opts, ans: s.ans, ch: item.ch, bloom: item.bloom, diff: item.diff, id: item.id + '#' + i }, rng);
      q.no = i + 1; return q;
    }
    return { no: i + 1, type: 'sa', marks: s.m, text: s.text, chapter: item.ch, bloom: item.bloom, difficulty: item.diff, answer: bi(joinPts(s.pts, 'en'), joinPts(s.pts, 'hi')), markingScheme: allocMarks(s.pts, s.m), meta: { bank: item.id, source: 'bank' } };
  });
  const scheme = [];
  subs.forEach((s) => s.markingScheme.forEach((m) => scheme.push({ point: bi(`(${s.no}) ${m.point.en}`, `(${s.no}) ${m.point.hi}`), marks: m.marks })));
  return {
    type: 'case', marks: subs.reduce((t, s) => t + s.marks, 0), text: item.passage, chapter: item.ch, bloom: item.bloom, difficulty: item.diff, subQuestions: subs, markingScheme: scheme,
    answer: bi(subs.map((s) => `(${s.no}) ${s.answer.en}`).join('; '), subs.map((s) => `(${s.no}) ${s.answer.hi}`).join('; ')), meta: { bank: item.id, source: 'bank' },
  };
}

/** MCQ derived from a concept item: "correct point" form (variant 0) or "odd one out" form (variant 1). */
export function derivedMcq(item, others, rng, variant = 0) {
  const pool = others.filter((o) => o.ch !== item.ch && o.id !== item.id);
  if (pool.length < 3 || !item.pts.length) return null;
  let options, answerIndex, text;
  if (variant === 1) {
    if (item.pts.length < 3) return null;
    const foreign = rng.pick(rng.pick(pool).pts);
    const trues = rng.pickN(item.pts, 3);
    const all = rng.shuffle([{ o: foreign, ok: true }, ...trues.map((o) => ({ o, ok: false }))]);
    options = all.map((x) => x.o); answerIndex = all.findIndex((x) => x.ok);
    text = bi(`Which one of the following does NOT belong to the answer to: "${item.text.en}"`, `प्रश्न "${item.text.hi}" के उत्तर में निम्नलिखित में से कौन-सा कथन सम्मिलित नहीं है?`);
  } else {
    const right = rng.pick(item.pts);
    const wrongs = rng.pickN(pool, 3).map((o) => rng.pick(o.pts));
    const all = rng.shuffle([{ o: right, ok: true }, ...wrongs.map((o) => ({ o, ok: false }))]);
    options = all.map((x) => x.o); answerIndex = all.findIndex((x) => x.ok);
    text = bi(`Which one of the following statements is a correct point in answer to: "${item.text.en}"`, `प्रश्न "${item.text.hi}" के उत्तर में निम्नलिखित में से कौन-सा कथन सही बिंदु है?`);
  }
  if (new Set(options.map((o) => o.en)).size < 4) return null;
  return {
    type: 'mcq', marks: 1, text, options, answerIndex, chapter: item.ch, bloom: 'remember', difficulty: 'easy',
    answer: bi(`(${LET[answerIndex]}) ${options[answerIndex].en}`, `(${LET[answerIndex]}) ${options[answerIndex].hi}`),
    markingScheme: [{ point: bi(`Correct option (${LET[answerIndex]})`, `सही विकल्प (${LET[answerIndex]})`), marks: 1 }], meta: { bank: item.id, source: 'derived-mcq' },
  };
}

/** Case derived from a numeric generator core (same data, three linked sub-questions). */
export function derivedCase(entry, seed) {
  const q = generateQuestion(entry, { type: 'sa', marks: 4, seed });
  if (!q || entry.kind === 'case') return null;
  const mcq = generateQuestion(entry, { type: 'mcq', marks: 1, seed: q.meta.seed });
  if (!mcq) return null;
  const w = q.working || [];
  if (w.length < 2) return null;
  const first = w[0];
  const subs = [
    { ...mcq, no: 1 },
    { no: 2, type: 'sa', marks: 1, text: bi('State the formula or principle used to obtain the answer.', 'उत्तर प्राप्त करने में प्रयुक्त सूत्र अथवा सिद्धांत लिखिए।'), chapter: q.chapter, bloom: 'understand', difficulty: 'easy', answer: first, markingScheme: [{ point: first, marks: 1 }], meta: { gen: q.meta.gen, seed: q.meta.seed, source: 'derived-case' } },
    { no: 3, type: 'sa', marks: 2, text: bi('Show the working steps and write the final result with unit.', 'हल के चरण दिखाइए तथा मात्रक सहित अंतिम परिणाम लिखिए।'), chapter: q.chapter, bloom: 'apply', difficulty: q.difficulty, answer: q.answer, markingScheme: allocMarks(w.slice(1), 2), meta: { gen: q.meta.gen, seed: q.meta.seed, source: 'derived-case' } },
  ];
  const scheme = [];
  subs.forEach((s) => s.markingScheme.forEach((m) => scheme.push({ point: bi(`(${s.no}) ${m.point.en}`, `(${s.no}) ${m.point.hi}`), marks: m.marks })));
  return {
    type: 'case', marks: 4, text: bi(`Read the following information and answer the questions.\n${q.text.en}`, `निम्नलिखित जानकारी पढ़कर प्रश्नों के उत्तर दीजिए।\n${q.text.hi}`), table: q.table, chapter: q.chapter, bloom: 'apply', difficulty: q.difficulty,
    subQuestions: subs, markingScheme: scheme, answer: bi(subs.map((s) => `(${s.no}) ${s.answer.en}`).join('; '), subs.map((s) => `(${s.no}) ${s.answer.hi}`).join('; ')), meta: { gen: q.meta.gen, seed: q.meta.seed, source: 'derived-case' },
  };
}

/** Per (subject, class) pool access with caching. */
const CACHE = new Map();
export function poolFor(subject, cls) {
  const key = subject + cls;
  if (CACHE.has(key)) return CACHE.get(key);
  const gens = entriesFor(subject, cls, null, 'plain');
  const genCases = entriesFor(subject, cls, null, 'case');
  const bank = bankFor(subject, cls);
  const p = {
    gens, genCases,
    concept: bank.filter((b) => b.kind === 'concept'), mcq: bank.filter((b) => b.kind === 'mcq'), ar: bank.filter((b) => b.kind === 'ar'), cases: bank.filter((b) => b.kind === 'case'),
  };
  CACHE.set(key, p);
  return p;
}

export function chapterHas(subject, cls, ch, type, marks) {
  const p = poolFor(subject, cls);
  if (type === 'ar') return p.ar.some((x) => x.ch === ch);
  if (type === 'mcq') return p.mcq.some((x) => x.ch === ch) || p.gens.some((e) => e.ch === ch) || p.concept.some((x) => x.ch === ch);
  if (type === 'case') return p.cases.some((x) => x.ch === ch) || p.genCases.some((e) => e.ch === ch) || p.gens.some((e) => e.ch === ch);
  return p.gens.some((e) => e.ch === ch) || p.concept.some((x) => x.ch === ch && marks >= x.m[0] && marks <= x.m[1]);
}
export const seedFor = (rng) => Math.floor(rng.next() * 4294967295) >>> 0;
export { makeRng, hashSeed };
