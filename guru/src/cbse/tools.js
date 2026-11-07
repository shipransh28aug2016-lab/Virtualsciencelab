// cbse_* tools + offline intents (EN / HI / Hinglish).
import { getSyllabus, listSubjects, normaliseSubject, normaliseClass, loadCurriculum, findChapter } from './syllabus.js';
import { getBlueprint } from './blueprint.js';
import { buildQuestionPaper, renderPaper } from './qp.js';
import { chapterSet, mixedSet, revisionPlan } from './practice.js';
import { buildStudyMaterial } from './study.js';
import { answerCheck, checkAnswer } from './marking.js';
import { validatePaper } from './validators.js';
import { questionPaperDoc, markingSchemeDoc, practiceDoc, studyDoc, revisionDoc, flashcardSheet, mindmapMarkdown } from './doc.js';
import { makeQuestion } from './qp.js';
import { makeRng } from './util.js';
import { chapterHas } from './pool.js';
import { flattenQuestion } from './qp.js';

const obj = (props, required = []) => ({ type: 'object', properties: props, required });
const S = { subject: { type: 'string' }, cls: { type: ['string', 'number'], description: 'X, XI, XII or 10/11/12' }, lang: { type: 'string', enum: ['en', 'hi', 'bilingual'] }, seed: { type: ['string', 'number'] } };

async function emit(ctx, k, name, format, spec) {
  const files = k?.services?.has?.('files') ? k.services.get('files') : null;
  if (!files || !ctx?.artifacts) return { name, format, spec };
  try { const r = await files.write(format, spec); const ref = await ctx.artifacts.add(r.blob, r.filename); return { name, format, artifact: { filename: r.filename, mime: r.mime, blobRef: ref } }; } catch { return { name, format, spec }; }
}
const brief = (p) => ({ header: p.header, totals: p.totals, stats: p.stats, warnings: p.warnings, flags: p.flags });
const needSyl = (a) => { const s = getSyllabus(a.subject, a.cls); if (!s) throw new Error('Unknown subject/class'); return s; };

/** Build a bank of single items (mcq / ar / case) for tools. */
function items(a, type, marks, defN) {
  const s = normaliseSubject(a.subject), c = normaliseClass(a.cls || 'XII'), syl = getSyllabus(s, c);
  const chs = a.chapter ? [findChapter(syl, a.chapter)].filter(Boolean) : syl.chapters;
  const rng = makeRng(`${a.seed ?? 'items'}|${type}|${s}|${c}`), state = { used: new Set(), genUse: new Map() }, out = [];
  const n = a.n || defN;
  for (let i = 0; i < n * 6 && out.length < n; i++) {
    const ch = chs[i % chs.length];
    if (!chapterHas(s, c, ch.id, type, marks)) continue;
    const q = makeQuestion({ subject: s, cls: c, chapter: ch.id, type, marks, rng, state });
    if (q) { q.no = out.length + 1; out.push(flattenQuestion(q, a.lang || 'en')); }
  }
  return { subject: s, cls: c, lang: a.lang || 'en', questions: out, totalMarks: out.reduce((t, q) => t + q.marks, 0) };
}

export function defineTools(k) {
  const T = [
    { name: 'cbse_syllabus', description: 'CBSE syllabus (chapters, weights) for a subject/class, or list all subjects.', schema: obj({ subject: S.subject, cls: S.cls }),
      run: async (a) => { await loadCurriculum(); return a?.subject ? needSyl(a) : { subjects: listSubjects() }; } },
    { name: 'cbse_blueprint', description: 'Paper blueprint: marks, sections, internal choice, competency share (flags verified:false when unverified).', schema: obj({ subject: S.subject, cls: S.cls }, ['subject', 'cls']),
      run: async (a) => { await loadCurriculum(); const b = getBlueprint(a.subject, a.cls); if (!b) throw new Error('No blueprint'); return b; } },
    { name: 'cbse_question_paper', description: 'Generate a full CBSE-pattern question paper (en/hi/bilingual) as a document spec; seedable.', schema: obj({ ...S, marks: { type: 'number' }, chapters: { type: 'array', items: { type: 'string' } }, withAnswers: { type: 'boolean' }, format: { type: 'string' }, layout: { type: 'string', enum: ['stacked', 'side'] }, examName: { type: 'string' } }, ['subject', 'cls']),
      run: async (a, ctx) => { await loadCurriculum(); const p = buildQuestionPaper(a); const v = validatePaper(p, { requireChoice: false }); const spec = questionPaperDoc(p, { lang: a.lang || 'en', withAnswers: !!a.withAnswers }); return { ...brief(p), validation: v.summary, paper: p, docSpec: spec, output: await emit(ctx, k, 'question-paper', a.format || 'docx', spec) }; } },
    { name: 'cbse_marking_scheme', description: 'Marking scheme / answer key for a generated paper (pass paper, or subject+cls+seed to regenerate).', schema: obj({ ...S, paper: { type: 'object' }, marks: { type: 'number' } }),
      run: async (a, ctx) => { await loadCurriculum(); const p = a.paper || buildQuestionPaper(a); const spec = markingSchemeDoc(p, { lang: a.lang || 'en' }); return { docSpec: spec, sheetSpec: spec.sheet, output: await emit(ctx, k, 'marking-scheme', 'docx', spec) }; } },
    { name: 'cbse_practice_set', description: 'Chapter-wise or mixed practice set with difficulty ladder; optional spaced revision plan.', schema: obj({ ...S, chapter: { type: 'string' }, n: { type: 'number' }, mixed: { type: 'boolean' }, revisionDays: { type: 'number' } }, ['subject', 'cls']),
      run: async (a, ctx) => { await loadCurriculum(); const set = a.chapter && !a.mixed ? chapterSet(a) : mixedSet(a); const spec = practiceDoc(set, { lang: a.lang || 'en' }); const plan = a.revisionDays ? revisionPlan({ chapters: getSyllabus(a.subject, a.cls).chapters, days: a.revisionDays }) : undefined; return { set, revisionPlan: plan, docSpec: spec, output: await emit(ctx, k, 'practice-set', 'docx', spec) }; } },
    { name: 'cbse_study_material', description: 'Notes, bilingual glossary, formula sheet, mind-map outline, flashcards, 1-page revision.', schema: obj({ subject: S.subject, cls: S.cls, chapter: { type: 'string' }, lang: S.lang, kind: { type: 'string', enum: ['notes', 'flashcards', 'revision', 'mindmap', 'formulas', 'glossary'] } }, ['subject', 'cls']),
      run: async (a, ctx) => { await loadCurriculum(); const m = buildStudyMaterial(a); const kind = a.kind || 'notes'; const spec = kind === 'revision' ? revisionDoc(m, a.lang) : studyDoc(m, { lang: a.lang || 'bilingual' }); const out = { material: m, docSpec: spec, mindmap: mindmapMarkdown(m) }; if (kind === 'flashcards') { out.sheetSpec = flashcardSheet(m); out.output = await emit(ctx, k, 'flashcards', 'xlsx', out.sheetSpec); } else out.output = await emit(ctx, k, 'study-material', 'docx', spec); return out; } },
    { name: 'cbse_case_study', description: 'Case-based questions (passage + sub-questions) with computed answers and marking scheme.', schema: obj({ ...S, chapter: { type: 'string' }, n: { type: 'number' } }, ['subject']),
      run: async (a) => { await loadCurriculum(); return items(a, 'case', 4, 2); } },
    { name: 'cbse_assertion_reason', description: 'Assertion-Reason questions with the standard four options.', schema: obj({ ...S, chapter: { type: 'string' }, n: { type: 'number' } }, ['subject']),
      run: async (a) => { await loadCurriculum(); return items(a, 'ar', 1, 5); } },
    { name: 'cbse_mcq_bank', description: 'MCQs with computed answers and plausible computed distractors.', schema: obj({ ...S, chapter: { type: 'string' }, n: { type: 'number' } }, ['subject']),
      run: async (a) => { await loadCurriculum(); return items(a, 'mcq', 1, 10); } },
    { name: 'cbse_answer_check', description: 'Validate a paper (marks sum, section counts, duplicates, arithmetic re-check, language) -> {ok, issues[]}; or grade {question, answer}.', schema: obj({ paper: { type: 'object' }, question: { type: 'object' }, answer: { type: 'string' }, requireChoice: { type: 'boolean' } }),
      run: async (a) => { if (a.question) return checkAnswer(a.question, a.answer); if (!a.paper) throw new Error('paper or question required'); return answerCheck(a.paper, { requireChoice: a.requireChoice }); } },
  ];
  return T;
}

const CLS = /(?:class|कक्षा|cls)\s*[-:]?\s*(\d{1,2}|xii|xi|x)\b|(\d{1,2})\s*(?:th|वीं|वी)\b/i;
export function parseRequest(text) {
  const t = String(text || '');
  const a = {};
  const cm = CLS.exec(t); if (cm) a.cls = normaliseClass(cm[1] || cm[2]);
  const sub = normaliseSubject(t); if (sub) a.subject = sub;
  const mk = /(\d{2,3})\s*(?:marks|mark|अंक|नंबर|number)/i.exec(t); if (mk) a.marks = +mk[1];
  const ch = /(?:chapter|ch\.?|अध्याय|चैप्टर)\s*(\d+)/i.exec(t) || /(\d+)\s*(?:वाँ|वां|th)?\s*(?:chapter|अध्याय|चैप्टर)/i.exec(t); if (ch) a.chapter = ch[1];
  const nn = /(\d+)\s*(?:questions|question|प्रश्न|mcqs?|सवाल)/i.exec(t); if (nn) a.n = +nn[1];
  if (/[ऀ-ॿ]/.test(t) && !/english/i.test(t)) a.lang = /bilingual|द्विभाषी|dono|दोनों/i.test(t) ? 'bilingual' : 'hi';
  if (/bilingual|dono bhasha|दोनों भाषा|द्विभाषी/i.test(t)) a.lang = 'bilingual';
  return a;
}

export function defineIntents(k) {
  const def = (key, dflt) => { try { return k.config?.get?.(key, dflt) ?? dflt; } catch { return dflt; } };
  const mk = (id, tool, patterns, examples, extra = () => ({})) => ({ id, tool, patterns, examples, extract: (text) => { const a = parseRequest(text); a.cls ||= def('cbse.cls', 'XII'); a.subject ||= def('cbse.subject', 'physics'); return { ...a, ...extra(text, a) }; } });
  return [
    mk('cbse.notes', 'cbse_study_material', [/\b(notes?|study material|summary|revision sheet)\b/i, /(नोट्स|नोट|सारांश|अध्ययन सामग्री)/, /\bka\s+notes\b/i], ['chapter 3 ka notes', 'class 12 physics chapter 2 notes', 'अध्याय 3 के नोट्स बनाओ'], () => ({ kind: 'notes' })),
    mk('cbse.flashcards', 'cbse_study_material', [/\b(flash\s*cards?|flashcards)\b/i, /(फ्लैशकार्ड|फ़्लैशकार्ड)/], ['class 12 chemistry flashcards'], () => ({ kind: 'flashcards' })),
    mk('cbse.marking', 'cbse_marking_scheme', [/\b(marking scheme|answer key|marking)\b/i, /(अंकन योजना|मार्किंग स्कीम|उत्तर कुंजी)/], ['marking scheme banao class 12 physics'], () => ({})),
    mk('cbse.case', 'cbse_case_study', [/\b(case[\s-]*(?:based|study)|case study)\b/i, /(केस\s*(?:आधारित|स्टडी)|प्रकरण)/], ['class 12 accountancy case study banao'], () => ({})),
    mk('cbse.ar', 'cbse_assertion_reason', [/\b(assertion[\s-]*reason|a\s*[-/]\s*r questions)\b/i, /(अभिकथन)/], ['assertion reason questions class 12 chemistry'], () => ({})),
    mk('cbse.mcq', 'cbse_mcq_bank', [/\bmcqs?\b/i, /\bmultiple choice\b/i, /(बहुविकल्पीय|एमसीक्यू)/], ['10 mcq class 11 physics', 'class 12 economics ke mcq'], () => ({})),
    mk('cbse.practice', 'cbse_practice_set', [/\b(practice|worksheet|assignment|exercise)\b/i, /(अभ्यास|वर्कशीट|प्रश्नावली)/], ['chapter 5 ka practice set', 'class 12 maths practice 20 questions'], (t, a) => ({ mixed: !a.chapter })),
    mk('cbse.blueprint', 'cbse_blueprint', [/\b(blueprint|marks distribution|paper pattern|design of (?:the )?paper)\b/i, /(ब्लूप्रिंट|अंक विभाजन|प्रश्न-पत्र का प्रारूप)/], ['class 12 physics blueprint'], () => ({})),
    mk('cbse.syllabus', 'cbse_syllabus', [/\b(syllabus|chapters? list|course structure)\b/i, /(पाठ्यक्रम|सिलेबस)/], ['class 11 chemistry syllabus'], () => ({})),
    mk('cbse.qp', 'cbse_question_paper', [/\b(question paper|sample paper|qp|paper banao|mock (?:test|paper)|prashn patra)\b/i, /(प्रश्न[\s-]*पत्र|प्रश्नपत्र|क्यूपी|सैंपल पेपर|मॉक)/, /\bqp\b.*\b(banao|bana do|create|make|generate)\b/i], ['class 12 physics ka QP banao 70 marks', 'कक्षा 12 भौतिकी का प्रश्न पत्र बनाओ', 'make a 80 marks accountancy paper in Hindi'], () => ({})),
  ];
}
