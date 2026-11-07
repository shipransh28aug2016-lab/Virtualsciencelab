// Document specs for services 'files' (write(format, spec)): {title, lang, blocks, meta}.
import { markingRows } from './marking.js';

const L = (o, lang) => (typeof o === 'string' ? o : lang === 'hi' ? o.hi : lang === 'en' ? o.en : o.en === o.hi ? o.en : `${o.en}\n${o.hi}`);
const OPT = ['(a)', '(b)', '(c)', '(d)'];

function qBlocks(q, lang, answers, label) {
  const c = q.i18n || q;
  const b = [{ t: 'p', text: `${label} ${L(c.text, lang)}  [${c.marks}]` }];
  if (c.table) b.push({ t: 'table', header: c.table.header, rows: c.table.rows });
  if (c.options) b.push({ t: 'ul', items: c.options.map((o, i) => `${OPT[i]} ${L(o, lang)}`) });
  c.subQuestions?.forEach((s) => { b.push({ t: 'p', text: `(${s.no}) ${L(s.text, lang)}  [${s.marks}]` }); if (s.options) b.push({ t: 'ul', items: s.options.map((o, i) => `${OPT[i]} ${L(o, lang)}`) }); });
  if (answers) {
    b.push({ t: 'p', text: `${lang === 'hi' ? 'उत्तर' : 'Answer'}: ${L(c.answer, lang)}` });
    if (c.journal) for (const e of c.journal) b.push({ t: 'table', header: ['Particulars', 'Dr (₹)', 'Cr (₹)'], rows: e.lines.map((l) => [l.cr ? `   To ${L(l.acc, lang)}` : L(l.acc, lang), l.dr ?? '', l.cr ?? '']) });
  }
  return b;
}

export function questionPaperDoc(paper, { lang = paper.lang || 'en', withAnswers = false } = {}) {
  const h = paper.header;
  const blocks = [
    { t: 'h1', text: L(h.title, lang) },
    { t: 'p', text: `${lang === 'hi' ? 'कक्षा' : 'Class'} ${h.cls}  |  ${L(h.subject, lang)} (${h.code})  |  ${lang === 'hi' ? 'समय' : 'Time'}: ${L(h.time, lang)}  |  ${lang === 'hi' ? 'अधिकतम अंक' : 'Max. Marks'}: ${h.maxMarks}` },
    { t: 'p', text: L(h.notice, lang) },
    { t: 'h3', text: lang === 'hi' ? 'सामान्य निर्देश' : 'General Instructions' },
    { t: 'ol', items: (lang === 'hi' ? h.instructions.hi : lang === 'en' ? h.instructions.en : h.instructions.en.map((e, i) => `${e} / ${h.instructions.hi[i]}`)) },
  ];
  for (const s of paper.sections) {
    blocks.push({ t: 'h2', text: L(s.name, lang) });
    if (s.instructions) blocks.push({ t: 'p', text: L(s.instructions, lang) });
    if (paper.structureOnly) { blocks.push({ t: 'p', text: `${s.count} x ${s.marksEach} = ${s.count * s.marksEach}` }); continue; }
    for (const q of s.questions) {
      blocks.push(...qBlocks(q, lang, withAnswers, `Q${q.no}.`));
      if (q.alt) { blocks.push({ t: 'p', text: lang === 'hi' ? 'अथवा' : 'OR' }); blocks.push(...qBlocks(q.alt, lang, withAnswers, `Q${q.no}.`)); }
    }
  }
  return { title: L(h.title, lang === 'bilingual' ? 'en' : lang), lang: lang === 'bilingual' ? 'hi' : lang, blocks, meta: { subject: h.code, footer: 'Guru CBSE practice paper', header: `${h.cls} ${h.code}` } };
}

export function markingSchemeDoc(paper, { lang = 'en' } = {}) {
  const rows = markingRows(paper, lang);
  return { title: `${L(paper.header.title, lang === 'bilingual' ? 'en' : lang)} - ${lang === 'hi' ? 'अंकन योजना' : 'Marking Scheme'}`, lang: lang === 'bilingual' ? 'hi' : lang,
    blocks: [{ t: 'h1', text: lang === 'hi' ? 'अंकन योजना' : 'Marking Scheme' }, { t: 'table', header: ['Sec', 'Q', 'Marks', 'Answer', 'Marking points'], rows: rows.map((r) => [r.section, r.no, r.marks, r.answer, r.scheme]) }],
    meta: { subject: paper.header.code }, sheet: { sheets: [{ name: 'Marking Scheme', rows: [['Section', 'Q', 'Marks', 'Answer', 'Marking points'], ...rows.map((r) => [r.section, r.no, r.marks, r.answer, r.scheme])] }] } };
}

export function practiceDoc(set, { lang = set.lang || 'en', withAnswers = true } = {}) {
  const blocks = [{ t: 'h1', text: lang === 'hi' ? 'अभ्यास प्रश्न' : 'Practice Set' }];
  set.questions.forEach((q) => blocks.push(...qBlocks(q, lang, false, `Q${q.no}.`)));
  if (withAnswers) { blocks.push({ t: 'pagebreak' }, { t: 'h2', text: lang === 'hi' ? 'उत्तर' : 'Answers' }); set.questions.forEach((q) => blocks.push({ t: 'p', text: `Q${q.no}. ${(q.i18n ? L(q.i18n.answer, lang) : q.answer)}` })); }
  return { title: lang === 'hi' ? 'अभ्यास प्रश्न' : 'Practice Set', lang: lang === 'bilingual' ? 'hi' : lang, blocks, meta: { subject: set.subject } };
}

export function studyDoc(m, { lang = 'bilingual' } = {}) {
  const blocks = [{ t: 'h1', text: L(m.title, lang) }];
  if (m.notice) blocks.push({ t: 'p', text: L(m.notice, lang) });
  for (const s of m.sections) {
    blocks.push({ t: 'h2', text: L(s.chapter.name, lang) });
    if (s.glossary.length) { blocks.push({ t: 'h3', text: lang === 'hi' ? 'मुख्य शब्द' : 'Key terms' }, { t: 'table', header: ['English', 'हिन्दी', 'Definition / परिभाषा'], rows: s.glossary.map((t) => [t.en, t.hi, L(t.def, lang)]) }); }
    if (s.formulas.length) blocks.push({ t: 'h3', text: lang === 'hi' ? 'सूत्र' : 'Formulas' }, { t: 'ul', items: s.formulas.map((f) => L(f, lang)) });
    if (s.keyPoints.length) blocks.push({ t: 'h3', text: lang === 'hi' ? 'मुख्य बिंदु' : 'Key points' }, { t: 'ul', items: s.keyPoints.map((k) => L(k, lang)) });
  }
  return { title: L(m.title, 'en'), lang: 'hi', blocks, meta: { subject: m.subject }, slides: { title: L(m.title, 'en'), slides: m.sections.map((s) => ({ title: L(s.chapter.name, lang), bullets: [...s.glossary.map((t) => `${t.en} / ${t.hi}: ${L(t.def, 'en')}`), ...s.formulas.map((f) => L(f, 'en'))].slice(0, 8), layout: 'bullets' })) } };
}
export const revisionDoc = (m, lang = 'bilingual') => ({ title: `${L(m.title, 'en')} - 1 page`, lang: 'hi', blocks: [{ t: 'h1', text: L(m.title, lang) }, ...m.revision.flatMap((r) => [{ t: 'h3', text: L(r.chapter, lang) }, { t: 'ul', items: r.points.map((p) => L(p, lang)) }])], meta: { subject: m.subject } });
export const flashcardSheet = (m) => ({ sheets: [{ name: 'Flashcards', rows: [['Front (EN)', 'Front (HI)', 'Back (EN)', 'Back (HI)', 'Type'], ...m.flashcards.map((c) => [c.front.en, c.front.hi, c.back.en, c.back.hi, c.tag])] }] });
export const mindmapMarkdown = (m) => m.sections.map((s) => `# ${s.chapter.name.en} / ${s.chapter.name.hi}\n` + s.mindmap.branches.map((b) => `- ${b.label.en} / ${b.label.hi}\n` + b.children.map((c) => `  - ${c.en}`).join('\n')).join('\n')).join('\n\n');
