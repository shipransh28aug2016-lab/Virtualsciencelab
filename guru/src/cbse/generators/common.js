// Core -> question builders shared by all computed generators.
// A "core" is what a generator fn(rng) returns:
//   numeric: {en, hi, steps:[[en,hi],...], value, unit?, sig?, wrong?:[numbers]}
//   textual: {en, hi, steps, ansText:{en,hi}, wrongText?:[{en,hi}]}   (non-numeric answers)
//   optional: table:{header,rows}, journal:[{...}], extra fields kept on the question
// A "case core": {case:true, passage:{en,hi}, table?, subs:[core + {marks, mode:'mcq'|'num'}]}
import { makeRng, fmt, allocMarks, bi } from '../util.js';

const LET = ['a', 'b', 'c', 'd'];
export const letter = (i) => LET[i];

export function valueText(core) {
  if (core.ansText) return core.ansText;
  const t = `${fmt(core.value, core.sig || 3)}${core.unit ? ' ' + core.unit : ''}`;
  return { en: t, hi: t };
}

/** Build 3 distinct wrong options plausible for numeric answers. */
function wrongTexts(core, rng) {
  const main = valueText(core).en;
  const seen = new Set([main]);
  const out = [];
  const add = (v) => {
    if (!isFinite(v)) return;
    const t = `${fmt(v, core.sig || 3)}${core.unit ? ' ' + core.unit : ''}`;
    if (!seen.has(t)) { seen.add(t); out.push({ en: t, hi: t }); }
  };
  for (const w of core.wrong || []) add(w);
  const facs = rng.shuffle([2, 0.5, 10, 0.1, 4, 0.25, 1.5, 3, 0.75, 100]);
  for (const f of facs) { if (out.length >= 3) break; add(core.value * f); }
  if (core.value === 0) for (let i = 1; out.length < 3; i++) add(i);
  return out.slice(0, 3);
}

/** Options + index for an MCQ built from a core. */
export function mcqOptions(core, rng) {
  const correct = valueText(core);
  const wrongs = core.ansText
    ? (core.wrongText || []).filter((w) => w.en !== correct.en).slice(0, 3)
    : wrongTexts(core, rng);
  const all = rng.shuffle([{ o: correct, ok: true }, ...wrongs.map((o) => ({ o, ok: false }))]);
  return { options: all.map((x) => x.o), answerIndex: all.findIndex((x) => x.ok) };
}

function stepsToPoints(core) {
  return (core.steps || []).map(([en, hi]) => bi(en, hi));
}

/**
 * Convert a core into a question object.
 * @param {object} core generator output
 * @param {{type:string, marks:number, id:string, seed:number, chapter:string, bloom:string, difficulty:string, mode?:string}} o
 */
export function coreToQuestion(core, o) {
  const rng = makeRng(o.seed + ':opt');
  const q = {
    type: o.type, marks: o.marks, text: bi(core.en, core.hi), chapter: o.chapter, bloom: o.bloom, difficulty: o.difficulty,
    meta: { gen: o.id, seed: o.seed, source: 'generator' },
  };
  if (core.table) q.table = core.table;
  const ans = valueText(core);
  if (o.type === 'mcq' || o.mode === 'mcq') {
    const { options, answerIndex } = mcqOptions(core, rng);
    q.type = 'mcq'; q.options = options; q.answerIndex = answerIndex;
    q.answer = { en: `(${letter(answerIndex)}) ${options[answerIndex].en}`, hi: `(${letter(answerIndex)}) ${options[answerIndex].hi}`, value: core.value, unit: core.unit || '' };
    q.markingScheme = [{ point: bi(`Correct option (${letter(answerIndex)}): ${options[answerIndex].en}`, `सही विकल्प (${letter(answerIndex)}): ${options[answerIndex].hi}`), marks: o.marks }];
    q.working = stepsToPoints(core);
    return q;
  }
  q.answer = { en: ans.en, hi: ans.hi, value: core.value, unit: core.unit || '' };
  if (core.journal) q.journal = core.journal;
  if (core.answerTable) q.answerTable = core.answerTable;
  const pts = stepsToPoints(core);
  q.markingScheme = allocMarks(pts.length ? pts : [bi(`Final answer: ${ans.en}`, `अंतिम उत्तर: ${ans.hi}`)], o.marks);
  q.working = pts;
  return q;
}

/** Case core -> case-based question with sub-questions. */
export function caseToQuestion(core, o) {
  const subs = core.subs.map((s, i) => {
    const sq = coreToQuestion(s, { ...o, id: o.id + '#' + (i + 1), type: s.mode === 'mcq' ? 'mcq' : 'sa', marks: s.marks, seed: o.seed + i + 1, mode: s.mode });
    sq.no = i + 1;
    return sq;
  });
  const scheme = [];
  subs.forEach((s) => s.markingScheme.forEach((m) => scheme.push({ point: bi(`(${s.no}) ${m.point.en}`, `(${s.no}) ${m.point.hi}`), marks: m.marks })));
  return {
    type: 'case', marks: subs.reduce((t, s) => t + s.marks, 0), text: core.passage, chapter: o.chapter, bloom: o.bloom, difficulty: o.difficulty,
    table: core.table, subQuestions: subs, markingScheme: scheme, answer: bi(subs.map((s) => `(${s.no}) ${s.answer.en}`).join('; '), subs.map((s) => `(${s.no}) ${s.answer.hi}`).join('; ')),
    meta: { gen: o.id, seed: o.seed, source: 'generator' },
  };
}

/** Helper for generators: define a registry entry. */
export const E = (id, ch, bloom, diff, fn, extra = {}) => ({ id, ch, bloom, diff, fn, ...extra });
export const rnd = (rng, lo, hi, step = 1) => lo + step * rng.int(0, Math.round((hi - lo) / step));
export const roundTo = (v, dp) => +v.toFixed(dp);
