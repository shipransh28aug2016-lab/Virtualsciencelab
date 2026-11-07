// Practice sets: chapter-wise, mixed, difficulty ladders, spaced revision plan.
import { getSyllabus, normaliseSubject, normaliseClass, findChapter } from './syllabus.js';
import { makeRng } from './util.js';
import { makeQuestion, flattenQuestion } from './qp.js';
import { chapterHas } from './pool.js';

const TYPES = {
  commerce: [['mcq', 1], ['sa', 3], ['case', 4], ['long', 6]],
  science: [['mcq', 1], ['vsa', 2], ['sa', 3], ['la', 5]],
};
const LADDER = ['easy', 'easy', 'medium', 'medium', 'medium', 'hard'];

function build({ subject, cls, chapters, n, seed, lang, ladder, types }) {
  const s = normaliseSubject(subject), c = normaliseClass(cls);
  const syl = getSyllabus(s, c);
  if (!syl || syl.structureOnly) throw new Error('No practice content for this subject/class');
  const rng = makeRng(`${seed ?? 'practice'}|${s}|${c}|${chapters.join(',')}`);
  const state = { used: new Set(), genUse: new Map() };
  const mix = types || (['accountancy', 'business', 'economics'].includes(s) ? TYPES.commerce : TYPES.science);
  const out = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const [type, marks] = mix[out.length % mix.length];
    const ch = chapters[i % chapters.length];
    if (!chapterHas(s, c, ch, type, marks)) continue;
    const target = ladder ? { diff: LADDER[Math.min(LADDER.length - 1, Math.floor(out.length * LADDER.length / n))] } : {};
    const q = makeQuestion({ subject: s, cls: c, chapter: ch, type, marks, rng, state, target });
    if (q) { q.no = out.length + 1; out.push(q); }
  }
  return { subject: s, cls: c, chapters, seed: String(seed ?? 'practice'), lang, ladder: !!ladder, questions: out.map((q) => ({ ...flattenQuestion(q, lang), no: q.no })), totalMarks: out.reduce((t, q) => t + q.marks, 0) };
}

export function chapterSet({ subject, cls, chapter, n = 10, seed, lang = 'en', ladder = true }) {
  const syl = getSyllabus(subject, cls);
  const ch = findChapter(syl, chapter);
  if (!ch) throw new Error('Chapter not found');
  return { ...build({ subject, cls, chapters: [ch.id], n, seed, lang, ladder }), chapterName: ch.name };
}
export function mixedSet({ subject, cls, n = 20, seed, lang = 'en', chapters }) {
  const syl = getSyllabus(subject, cls);
  const ids = chapters?.length ? chapters.map((x) => findChapter(syl, x)?.id).filter(Boolean) : syl.chapters.map((x) => x.id);
  return build({ subject, cls, chapters: ids, n, seed, lang, ladder: false });
}
/** Easy -> hard ladder across several chapters. */
export function difficultyLadder(o) { return build({ ...o, chapters: o.chapters || getSyllabus(o.subject, o.cls).chapters.map((x) => x.id), n: o.n || 12, lang: o.lang || 'en', ladder: true }); }

/**
 * Spaced revision plan: each chapter is studied once, then revised at +1, +3, +7, +14 days (within the window).
 * @param {{chapters:{id:string,name:object}[], days:number, perDay?:number, start?:string}} o
 */
export function revisionPlan({ chapters, days = 30, perDay = 2, start }) {
  const t0 = start ? new Date(start + 'T00:00:00Z') : new Date(Date.UTC(2026, 0, 1));
  const plan = Array.from({ length: days }, (_, d) => ({ day: d + 1, date: new Date(t0.getTime() + d * 86400000).toISOString().slice(0, 10), tasks: [] }));
  const gaps = [1, 3, 7, 14];
  const learnDays = Math.max(1, Math.ceil(chapters.length / perDay));
  chapters.forEach((ch, i) => {
    const d0 = Math.min(Math.floor(i / perDay), days - 1);
    plan[d0].tasks.push({ chapter: ch.id, name: ch.name, kind: 'learn' });
    gaps.forEach((g, k) => { const d = d0 + g; if (d < days) plan[d].tasks.push({ chapter: ch.id, name: ch.name, kind: 'revise', round: k + 1 }); });
  });
  if (days > learnDays + 2) plan[days - 1].tasks.push({ chapter: null, name: { en: 'Full mock paper + error review', hi: 'पूर्ण मॉक पेपर तथा त्रुटि समीक्षा' }, kind: 'mock' });
  return plan.filter((p) => p.tasks.length);
}
