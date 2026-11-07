import test from 'node:test';
import assert from 'node:assert/strict';
import { register, cbse } from '../src/cbse/index.js';
import { makeRng, hasDevanagari } from '../src/cbse/util.js';
import { recheckArithmetic } from '../src/cbse/validators.js';
import { ALL_ENTRIES } from '../src/cbse/generators/index.js';
import { journalBalanced } from '../src/cbse/generators/accountancy.js';

await cbse.loadCurriculum();
const SUBJ = [['physics', 'XII'], ['chemistry', 'XII'], ['accountancy', 'XII'], ['business', 'XII'], ['economics', 'XII'], ['maths', 'XII'], ['physics', 'XI'], ['chemistry', 'XI']];

test('determinism by seed', () => {
  const a = cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 42 });
  const b = cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 42 });
  const c = cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 43 });
  assert.equal(JSON.stringify(a.sections.map((s) => s.questions.map((q) => q.text))), JSON.stringify(b.sections.map((s) => s.questions.map((q) => q.text))));
  assert.notEqual(a.meta.hash, c.meta.hash);
});

test('marks totals and validators pass for every subject', () => {
  for (const [s, c] of SUBJ) {
    const p = cbse.buildQuestionPaper({ subject: s, cls: c, seed: 5 });
    const v = cbse.validatePaper(p);
    assert.equal(p.totals.marks, p.header.maxMarks, `${s} ${c}`);
    assert.ok(v.ok, `${s} ${c}: ${JSON.stringify(v.errors.slice(0, 2))}`);
  }
  const p = cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 1 });
  assert.deepEqual(p.totals.bySection, { A: 16, B: 10, C: 21, D: 8, E: 15 });
});

test('validators catch injected errors', () => {
  const fresh = () => cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 9 });
  let p = fresh(); p.sections[1].questions[0].marks = 3;
  assert.ok(cbse.validatePaper(p).errors.some((e) => e.code === 'question-marks' || e.code === 'section-marks'));
  p = fresh(); p.sections[2].questions[0].i18n.markingScheme[0].marks += 1;
  assert.ok(cbse.validatePaper(p).errors.some((e) => e.code === 'scheme-sum'));
  p = fresh(); p.sections[2].questions[1].i18n.text = p.sections[2].questions[0].i18n.text; p.sections[2].questions[1].text = p.sections[2].questions[0].text;
  assert.ok(cbse.validatePaper(p).errors.some((e) => e.code.startsWith('duplicate')));
  p = fresh(); const mcq = p.sections[0].questions.find((q) => q.meta?.source === 'generator');
  const c = mcq.i18n; c.answerIndex = (c.answerIndex + 1) % 4; c.answer = { en: `(${'abcd'[c.answerIndex]}) ${c.options[c.answerIndex].en}`, hi: c.answer.hi };
  assert.ok(cbse.validatePaper(p).errors.some((e) => e.code === 'arithmetic'));
  p = fresh(); p.sections[3].questions.pop();
  assert.ok(cbse.validatePaper(p).errors.some((e) => e.code === 'section-count'));
  const chk = cbse.answerCheck(p);
  assert.equal(chk.ok, false); assert.ok(chk.issues.length);
});

test('every generator is deterministic, finite and re-computable; journals balance', () => {
  for (const e of ALL_ENTRIES) for (let s = 1; s <= 12; s++) {
    const a = e.fn(makeRng(s)), b = e.fn(makeRng(s));
    assert.equal(JSON.stringify(a), JSON.stringify(b), e.id);
    if (!a) continue;
    if (a.journal) assert.ok(journalBalanced(a.journal), e.id);
    if (!a.case) assert.ok(a.steps.length >= 2 && a.en && a.hi && hasDevanagari(a.hi) || a.hi, e.id);
  }
  const q = cbse.buildQuestionPaper({ subject: 'chemistry', cls: 'XII', seed: 3 }).sections[0].questions.find((x) => x.meta?.source === 'generator');
  assert.equal(recheckArithmetic(q), null);
});

test('Hindi and bilingual output', () => {
  const hi = cbse.buildQuestionPaper({ subject: 'accountancy', cls: 'XII', seed: 2, lang: 'hi' });
  assert.ok(hasDevanagari(hi.header.titleText));
  assert.ok(hi.sections.flatMap((s) => s.questions).every((q) => hasDevanagari(q.text) || /^[\d\s.,+\-×=]+/.test(q.text)));
  const bi = cbse.renderPaper(hi, 'bilingual', 'side');
  const q = bi.sections[2].questions[0];
  assert.ok(q.text.includes(' | ') || q.text.includes('\n'));
  assert.ok(hasDevanagari(q.textHi) && !hasDevanagari(q.textEn));
  const spec = cbse.doc.questionPaperDoc(bi, { lang: 'bilingual', withAnswers: true });
  assert.ok(spec.blocks.length > 40 && spec.blocks.some((b) => b.t === 'h2'));
});

test('blueprint flags unverified data; structure-only subjects', () => {
  const b = cbse.getBlueprint('physics', 'XII');
  assert.equal(b.pattern.verified, false);
  assert.ok(b.flags.some((f) => f.field === 'competencyPct' && f.verified === false));
  const h = cbse.buildQuestionPaper({ subject: 'hindi', cls: 'XII' });
  assert.ok(h.structureOnly && h.sections.length === 3);
  assert.equal(cbse.getSyllabus('physics', 'XII').source, 'repo');
  assert.equal(cbse.scaleBlueprint(b, 35).maxMarks, 35);
});

test('practice, study, marking', () => {
  const set = cbse.chapterSet({ subject: 'physics', cls: 'XII', chapter: '3', n: 6, seed: 1, lang: 'bilingual' });
  assert.equal(set.questions.length, 6);
  assert.ok(['easy', 'hard'].every((d) => set.questions.some((q) => q.difficulty === d)) || set.questions.length === 6);
  const plan = cbse.revisionPlan({ chapters: cbse.getSyllabus('physics', 'XII').chapters, days: 30 });
  assert.ok(plan.some((d) => d.tasks.some((t) => t.kind === 'revise')));
  const m = cbse.buildStudyMaterial({ subject: 'physics', cls: 'XII', chapter: '3' });
  assert.ok(m.glossary.length && m.formulas.length && m.flashcards.length && m.revision.length);
  assert.ok(m.glossary.every((t) => hasDevanagari(t.hi)));
  const p = cbse.buildQuestionPaper({ subject: 'physics', cls: 'XII', seed: 4 });
  const mcq = p.sections[0].questions.find((q) => q.options && q.meta?.source === 'generator');
  assert.equal(cbse.checkAnswer(mcq, 'abcd'[mcq.answerIndex]).marks, 1);
  assert.equal(cbse.checkAnswer(mcq, 'abcd'[(mcq.answerIndex + 1) % 4]).marks, 0);
  assert.ok(cbse.doc.markingSchemeDoc(p).sheet.sheets[0].rows.length > 30);
});

test('register: service, tools, intents', async () => {
  const tools = new Map(), intents = [], svc = new Map();
  const k = { tools: { register: (t) => tools.set(t.name, t) }, intents: { register: (i) => intents.push(i) }, agents: { register() {} }, services: { set: (n, o) => svc.set(n, o), get: (n) => svc.get(n), has: (n) => svc.has(n) }, config: { get: (_, d) => d } };
  await register(k);
  for (const n of ['cbse_syllabus', 'cbse_blueprint', 'cbse_question_paper', 'cbse_practice_set', 'cbse_study_material', 'cbse_marking_scheme', 'cbse_case_study', 'cbse_assertion_reason', 'cbse_mcq_bank', 'cbse_answer_check']) assert.ok(tools.has(n), n);
  assert.ok(svc.has('cbse'));
  const match = (text) => intents.find((i) => i.patterns.some((r) => r.test(text)));
  const qp = match('class 12 physics ka QP banao 70 marks');
  assert.equal(qp.tool, 'cbse_question_paper');
  assert.deepEqual([qp.extract('class 12 physics ka QP banao 70 marks').cls, qp.extract('class 12 physics ka QP banao 70 marks').subject, qp.extract('class 12 physics ka QP banao 70 marks').marks], ['XII', 'physics', 70]);
  const notes = match('chapter 3 ka notes');
  assert.equal(notes.tool, 'cbse_study_material');
  assert.equal(notes.extract('chapter 3 ka notes').chapter, '3');
  const hi = match('कक्षा 12 भौतिकी का प्रश्न पत्र बनाओ');
  assert.equal(hi.tool, 'cbse_question_paper');
  assert.equal(hi.extract('कक्षा 12 भौतिकी का प्रश्न पत्र बनाओ').lang, 'hi');
  const r = await tools.get('cbse_question_paper').run({ subject: 'chemistry', cls: 12, seed: 1, lang: 'hi' }, {});
  assert.ok(r.docSpec.blocks.length && r.validation.errors === 0);
  const chk = await tools.get('cbse_answer_check').run({ paper: r.paper });
  assert.equal(chk.ok, true);
  for (const n of ['cbse_mcq_bank', 'cbse_assertion_reason', 'cbse_case_study']) { const o = await tools.get(n).run({ subject: 'physics', cls: 'XII', n: 2, seed: 1 }); assert.ok(o.questions.length >= 1, n); }
});
