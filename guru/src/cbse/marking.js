// Marking scheme, answer key and answer checking.
import { validatePaper } from './validators.js';
import { valueText } from './generators/common.js';
import { sumMarks } from './util.js';

const canon = (q) => q.i18n || q;
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}.]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));

/** Marking-scheme rows for every question (EN/HI/both). */
export function markingRows(paper, lang = 'en') {
  const pick = (o) => (lang === 'hi' ? o.hi : lang === 'en' ? o.en : o.en === o.hi ? o.en : `${o.en} / ${o.hi}`);
  const rows = [];
  for (const s of paper.sections) for (const q of s.questions) {
    for (const x of q.alt ? [q, q.alt] : [q]) {
      const c = canon(x);
      rows.push({ section: s.id, no: q.no + (x === q.alt ? ' (OR)' : ''), marks: c.marks, answer: pick(c.answer), scheme: c.markingScheme.map((m) => `${pick(m.point)} [${m.marks}]`).join('\n') });
    }
  }
  return rows;
}

/**
 * Evaluate a student's answer against a question.
 * MCQ/AR: letter or option text. Numeric: first number within 1% tolerance. Descriptive: keyword coverage of scheme points.
 * @returns {{marks:number, outOf:number, feedback:{en:string,hi:string}}}
 */
export function checkAnswer(question, studentAnswer) {
  const c = canon(question);
  const ans = String(studentAnswer ?? '').trim();
  const out = (marks, en, hi) => ({ marks, outOf: c.marks, feedback: { en, hi } });
  if (!ans) return out(0, 'No answer given.', 'कोई उत्तर नहीं दिया गया।');
  if (c.options) {
    const letter = /^\(?([a-d])\)?(?:[\s.:)]|$)/i.exec(ans)?.[1]?.toLowerCase();
    const idx = letter ? 'abcd'.indexOf(letter) : c.options.findIndex((o) => norm(o.en) === norm(ans) || norm(o.hi) === norm(ans));
    return idx === c.answerIndex ? out(c.marks, 'Correct.', 'सही उत्तर।') : out(0, `Incorrect. Correct answer: ${c.answer.en}`, `गलत। सही उत्तर: ${c.answer.hi}`);
  }
  const target = c.answer?.value;
  const nums = ans.replace(/,/g, '').match(/-?\d+(?:\.\d+)?(?:\s*[x×]\s*10\^?-?\d+)?/g);
  if (typeof target === 'number' && nums) {
    const val = (t) => { const m = /(-?\d+(?:\.\d+)?)\s*[x×]\s*10\^?(-?\d+)/.exec(t); return m ? +m[1] * 10 ** +m[2] : +t; };
    const hit = nums.map(val).some((v) => Math.abs(v - target) <= Math.abs(target) * 0.01 + 1e-12);
    if (hit) return out(c.marks, 'Final answer is correct.', 'अंतिम उत्तर सही है।');
    const half = Math.max(0, +(c.marks / 2).toFixed(1));
    return out(half >= 1 ? Math.floor(half) : 0, `Final answer differs from ${c.answer.en}; method marks possible.`, `अंतिम उत्तर ${c.answer.hi} से भिन्न है; विधि के अंक संभव।`);
  }
  const have = tokens(ans);
  let got = 0;
  for (const m of c.markingScheme) {
    const t = [...tokens(m.point.en), ...tokens(m.point.hi)];
    if (!t.length) continue;
    const cov = t.filter((w) => have.has(w)).length / t.length;
    if (cov >= 0.4) got += m.marks; else if (cov >= 0.2) got += m.marks / 2;
  }
  got = Math.min(c.marks, Math.round(got * 2) / 2);
  return out(got, `Matched ${got} of ${c.marks} marks by key points.`, `मुख्य बिंदुओं के आधार पर ${c.marks} में से ${got} अंक।`);
}

/** cbse_answer_check core: validate a paper -> {ok, issues[]}. */
export function answerCheck(paper, opt) {
  const v = validatePaper(paper, opt);
  return { ok: v.ok, issues: [...v.errors.map((e) => ({ level: 'error', ...e })), ...v.warnings.map((e) => ({ level: 'warning', ...e }))], summary: v.summary };
}
export { sumMarks, valueText };
