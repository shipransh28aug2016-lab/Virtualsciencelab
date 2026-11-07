// Validators: marks sums, section counts, duplicates, arithmetic re-check by re-computation, journal balance, language checks.
import { regenerate } from './generators/index.js';
import { valueText } from './generators/common.js';
import { exactKey, hasDevanagari, sumMarks } from './util.js';
import { getBlueprint } from './blueprint.js';

const E = (code, msg, where) => ({ code, msg, where });
const stripLabel = (s) => String(s).replace(/^\([a-d]\)\s*/, '').trim();
const canon = (q) => q.i18n || q;
const approx = (a, b) => Math.abs(a - b) < 1e-9;
const ENGLISH_WORD = /[A-Za-z]{5,}/g;

/** Recompute a generated question from meta (gen + seed) and compare its stored answer. @returns {string|null} error message */
export function recheckArithmetic(q) {
  const c = canon(q);
  const meta = c.meta;
  if (!meta?.gen || meta.source === 'bank') return null;
  const run = regenerate(meta);
  if (!run) return `generator ${meta.gen} not found`;
  if (c.type === 'case' && !meta.gen.includes('#') && Array.isArray(c.subQuestions) && run.core.case) {
    for (let i = 0; i < c.subQuestions.length; i++) {
      const sub = run.core.subs[i];
      const exp = valueText(sub).en;
      const sq = c.subQuestions[i];
      const have = sq.options ? stripLabel(sq.options[sq.answerIndex]?.en ?? '') : sq.answer?.en;
      if (sq.options ? have !== exp : have !== exp) return `sub-question ${i + 1}: expected "${exp}", found "${have}"`;
    }
    return null;
  }
  if (meta.source === 'derived-case') {
    // derived cases embed an ordinary core; verify the embedded MCQ and the working answer
    const sub = c.subQuestions?.[0];
    if (sub?.options) {
      const exp = valueText(run.core).en;
      if (stripLabel(sub.options[sub.answerIndex].en) !== exp) return `derived case: expected "${exp}"`;
    }
    return null;
  }
  const core = run.core;
  if (core.case) return null;
  const exp = valueText(core).en;
  const have = c.options ? stripLabel(c.options[c.answerIndex]?.en ?? '') : String(c.answer?.en ?? '');
  if (have !== exp) return `expected "${exp}", found "${have}"`;
  if (!c.options && typeof c.answer?.value === 'number' && core.value !== undefined && !approx(c.answer.value, core.value)) return `numeric value mismatch (${c.answer.value} vs ${core.value})`;
  return null;
}

function checkScheme(q, errs, where) {
  const c = canon(q);
  const m = sumMarks(c.markingScheme || []);
  if (!approx(m, sumMarks([{ marks: c.marks }]))) errs.push(E('scheme-sum', `marking scheme totals ${m} but question carries ${c.marks}`, where));
  if (c.subQuestions) {
    const sm = sumMarks(c.subQuestions);
    if (!approx(sm, c.marks)) errs.push(E('sub-sum', `sub-question marks total ${sm} but case carries ${c.marks}`, where));
    c.subQuestions.forEach((s, i) => checkScheme(s, errs, `${where}.${i + 1}`));
  }
}

function checkMcq(q, errs, where) {
  const c = canon(q);
  if (c.options) {
    if (c.options.length !== 4) errs.push(E('options', `expected 4 options, found ${c.options.length}`, where));
    if (!(c.answerIndex >= 0 && c.answerIndex < c.options.length)) errs.push(E('answer-index', 'answerIndex out of range', where));
    else {
      const lbl = 'abcd'[c.answerIndex];
      if (!String(c.answer.en).startsWith(`(${lbl})`)) errs.push(E('answer-label', `answer label does not match answerIndex (${lbl})`, where));
      if (stripLabel(c.answer.en) !== c.options[c.answerIndex].en) errs.push(E('answer-text', 'answer text differs from the option it points to', where));
    }
    const seen = new Set();
    for (const o of c.options) { const k = exactKey(o.en); if (seen.has(k)) errs.push(E('option-dup', `duplicate option "${o.en}"`, where)); seen.add(k); }
  }
  c.subQuestions?.forEach((s, i) => checkMcq(s, errs, `${where}.${i + 1}`));
}

function checkLanguage(q, errs, warns, where) {
  const c = canon(q);
  const check = (o, what, strict) => {
    if (!o) return;
    if (!o.en || !o.hi) { errs.push(E('lang-missing', `${what}: missing ${!o.en ? 'English' : 'Hindi'} text`, where)); return; }
    if (hasDevanagari(o.en)) errs.push(E('lang-en-devanagari', `${what}: English text contains Devanagari`, where));
    if (!hasDevanagari(o.hi)) {
      const words = (o.hi.match(ENGLISH_WORD) || []);
      if (words.length && strict) errs.push(E('lang-hi-missing', `${what}: Hindi text has no Devanagari ("${o.hi.slice(0, 40)}")`, where));
      else if (words.length) warns.push(E('lang-hi-latin', `${what}: Hindi text is Latin-only`, where));
    }
  };
  check(c.text, 'stem', true);
  c.markingScheme?.forEach((m) => check(m.point, 'marking point', false));
  c.subQuestions?.forEach((s, i) => checkLanguage(s, errs, warns, `${where}.${i + 1}`));
}

function checkJournal(q, errs, where) {
  const c = canon(q);
  for (const e of c.journal || []) {
    const dr = e.lines.reduce((t, l) => t + (l.dr || 0), 0), cr = e.lines.reduce((t, l) => t + (l.cr || 0), 0);
    if (dr !== cr) errs.push(E('journal-unbalanced', `journal entry ${e.no}: debit ${dr} != credit ${cr}`, where));
  }
  c.subQuestions?.forEach((s, i) => checkJournal(s, errs, `${where}.${i + 1}`));
}

/**
 * Validate a question paper.
 * @param {object} paper output of buildQuestionPaper
 * @param {{recompute?:boolean, requireChoice?:boolean}} [opt]
 * @returns {{ok:boolean, errors:object[], warnings:object[], summary:object}}
 */
export function validatePaper(paper, opt = {}) {
  const errors = [], warnings = [];
  const bp = paper.blueprint || getBlueprint(paper.meta?.subject, paper.meta?.cls);
  if (!paper.structureOnly) {
    const all = [];
    for (const s of paper.sections) {
      const spec = bp?.sections.find((x) => x.id === s.id);
      const secMarks = sumMarks(s.questions.map((q) => ({ marks: q.marks })));
      if (spec) {
        if (s.questions.length !== spec.count) errors.push(E('section-count', `Section ${s.id}: ${s.questions.length} questions, blueprint requires ${spec.count}`, s.id));
        if (!approx(secMarks, spec.count * spec.marks)) errors.push(E('section-marks', `Section ${s.id}: marks ${secMarks}, expected ${spec.count * spec.marks}`, s.id));
        s.questions.forEach((q) => { if (q.marks !== spec.marks) errors.push(E('question-marks', `Q${q.no}: ${q.marks} marks, section expects ${spec.marks}`, `Q${q.no}`)); });
        const want = bp.internalChoice?.[s.id] || 0;
        if (opt.requireChoice && want && s.type !== 'case') {
          const have = s.questions.filter((q) => q.alt).length;
          if (have < want) errors.push(E('internal-choice', `Section ${s.id}: internal choice in ${have} question(s), blueprint requires ${want}`, s.id));
        }
      }
      all.push(...s.questions);
    }
    const total = sumMarks(all.map((q) => ({ marks: q.marks })));
    if (!approx(total, paper.header.maxMarks)) errors.push(E('total-marks', `sum of question marks ${total} != paper total ${paper.header.maxMarks}`, 'paper'));
    if (paper.totals && !approx(paper.totals.marks, total)) errors.push(E('totals-field', `totals.marks ${paper.totals.marks} != computed ${total}`, 'paper'));
    // duplicates (exact stem text, EN and HI)
    const seenEn = new Map(), seenHi = new Map();
    for (const q of all.flatMap((x) => (x.alt ? [x, x.alt] : [x]))) {
      const c = canon(q);
      const ke = exactKey(c.text.en), kh = exactKey(c.text.hi);
      if (seenEn.has(ke)) errors.push(E('duplicate-stem', `Q${q.no} duplicates the stem of Q${seenEn.get(ke)}`, `Q${q.no}`)); else seenEn.set(ke, q.no);
      if (seenHi.has(kh) && !seenEn.has(ke + '#x')) { if (seenHi.get(kh) !== q.no || false) { /* same Hindi text but different English is flagged */ if (!errors.some((e) => e.where === `Q${q.no}` && e.code === 'duplicate-stem')) errors.push(E('duplicate-stem-hi', `Q${q.no} duplicates the Hindi stem of Q${seenHi.get(kh)}`, `Q${q.no}`)); } } else seenHi.set(kh, q.no);
    }
    for (const q of all) {
      for (const x of q.alt ? [q, q.alt] : [q]) {
        const w = `Q${x.no}${x === q.alt ? ' (OR)' : ''}`;
        checkScheme(x, errors, w); checkMcq(x, errors, w); checkJournal(x, errors, w); checkLanguage(x, errors, warnings, w);
        if (opt.recompute !== false) { const r = recheckArithmetic(x); if (r) errors.push(E('arithmetic', r, w)); }
      }
    }
    // chapter coverage versus weights
    const tgt = paper.stats?.chapterTarget, got = paper.stats?.chapterMarks;
    if (tgt && got) {
      for (const [ch, t] of Object.entries(tgt)) {
        const g = got[ch] || 0;
        if (t > 0 && Math.abs(g - t) > Math.max(6, t * 0.75)) warnings.push(E('chapter-weight', `chapter ${ch}: ${g} marks vs target ${t}`, ch));
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, summary: { questions: paper.totals?.questions, marks: paper.totals?.marks, errors: errors.length, warnings: warnings.length } };
}

/** Validate a standalone question (practice item, MCQ, case ...). */
export function validateQuestion(q) {
  const errors = [], warnings = [];
  checkScheme(q, errors, 'Q'); checkMcq(q, errors, 'Q'); checkJournal(q, errors, 'Q'); checkLanguage(q, errors, warnings, 'Q');
  const r = recheckArithmetic(q); if (r) errors.push(E('arithmetic', r, 'Q'));
  return { ok: errors.length === 0, errors, warnings };
}
