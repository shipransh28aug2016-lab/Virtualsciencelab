// Study material: notes, bilingual glossary, formula sheet, mind-map outline, flashcards, one-page revision.
import { getSyllabus, findChapter, normaliseSubject, normaliseClass, SUBJECTS } from './syllabus.js';
import { bankFor } from './bank/index.js';
import { entriesFor } from './generators/index.js';
import { TERMS } from './knowledge.js';
import { makeRng } from './util.js';

const P = (o, lang) => (lang === 'hi' ? o.hi : lang === 'en' ? o.en : o.en === o.hi ? o.en : `${o.en} / ${o.hi}`);

/** Formulas harvested from generator working (first step of each computed generator). */
export function formulasFor(subject, cls, ch) {
  const out = [];
  for (const e of entriesFor(subject, cls, ch, 'plain')) {
    for (let s = 1; s < 8; s++) {
      const core = e.fn(makeRng(s));
      if (core?.steps?.length) { const [en, hi] = core.steps[0]; if (/[=:]/.test(en) && !/\d{3,}/.test(en) && !out.some((x) => x.en === en)) out.push({ en, hi }); break; }
    }
  }
  return out;
}
export const termsFor = (subject, cls, ch) => TERMS.filter((t) => t.subject === subject && t.cls === cls && (!ch || t.ch === ch));

/**
 * Build study material for a chapter (or the whole class when chapter is omitted).
 * @returns {{subject,cls,chapter,notes,glossary,formulas,mindmap,flashcards,revision}}
 */
export function buildStudyMaterial({ subject, cls, chapter, lang = 'bilingual' }) {
  const s = normaliseSubject(subject), c = normaliseClass(cls);
  const syl = getSyllabus(s, c);
  if (!syl) throw new Error('Unknown subject/class');
  const chs = chapter ? [findChapter(syl, chapter)].filter(Boolean) : syl.chapters;
  if (!chs.length) throw new Error('Chapter not found');
  const sections = chs.map((ch) => {
    const items = bankFor(s, c, { chapter: ch.id, kind: 'concept' });
    const glossary = termsFor(s, c, ch.id);
    const formulas = formulasFor(s, c, ch.id);
    const keyPoints = items.flatMap((it) => it.pts.slice(0, 3));
    const cards = [
      ...glossary.map((t) => ({ front: { en: t.en, hi: t.hi }, back: t.def, tag: 'term' })),
      ...formulas.map((f) => ({ front: { en: `Formula: ${f.en.split(/[=:]/)[0].trim() || 'formula'}`, hi: `सूत्र: ${f.hi.split(/[=:]/)[0].trim() || 'सूत्र'}` }, back: f, tag: 'formula' })),
      ...items.map((it) => ({ front: it.text, back: { en: it.pts.map((p) => p.en).join(' • '), hi: it.pts.map((p) => p.hi).join(' • ') }, tag: 'concept' })),
    ];
    return { chapter: ch, glossary, formulas, keyPoints, questions: items.map((i) => i.text), flashcards: cards,
      mindmap: { root: ch.name, branches: [...glossary.map((t) => ({ label: { en: t.en, hi: t.hi }, children: [t.def] })), ...items.map((it) => ({ label: it.text, children: it.pts.slice(0, 4) })), ...(formulas.length ? [{ label: { en: 'Formulas', hi: 'सूत्र' }, children: formulas }] : [])] } };
  });
  const flashcards = sections.flatMap((x) => x.flashcards);
  const revision = sections.map((x) => ({ chapter: x.chapter.name, points: [...x.glossary.map((t) => ({ en: `${t.en}: ${t.def.en}`, hi: `${t.hi}: ${t.def.hi}` })), ...x.formulas, ...x.keyPoints.slice(0, 4)].slice(0, 10) }));
  return { subject: s, cls: c, lang, title: { en: `${SUBJECTS[s].name.en} Class ${c} - ${chapter ? chs[0].name.en : 'Study Material'}`, hi: `${SUBJECTS[s].name.hi} कक्षा ${c} - ${chapter ? chs[0].name.hi : 'अध्ययन सामग्री'}` }, sections, glossary: sections.flatMap((x) => x.glossary), formulas: sections.flatMap((x) => x.formulas), flashcards, revision,
    notice: syl.verified ? null : { en: 'Chapter list is an embedded default (verified:false); confirm against the latest CBSE syllabus.', hi: 'अध्याय सूची अंतर्निहित डिफ़ॉल्ट है (verified:false); नवीनतम CBSE पाठ्यक्रम से मिलान करें।' } };
}
export { P as pickLang };
