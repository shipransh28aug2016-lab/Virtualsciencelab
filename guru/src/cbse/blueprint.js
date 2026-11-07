// Paper blueprints (marks distribution, sections, internal choice, competency share).
// Everything not backed by repo data is flagged verified:false so the teacher confirms against the latest CBSE circular.
import { getSyllabus, normaliseSubject, normaliseClass } from './syllabus.js';

const S = (id, type, marks, count, extra = {}) => ({ id, type, marks, count, ...extra });

const SCI_SECTIONS = [
  S('A', 'mcq', 1, 16, { arCount: 2, name: { en: 'Section A - MCQ / Assertion-Reason', hi: 'खंड क - बहुविकल्पीय / अभिकथन-कारण' },
    instr: { en: '14 MCQs and 2 Assertion-Reason questions of 1 mark each.', hi: '14 बहुविकल्पीय प्रश्न तथा 2 अभिकथन-कारण प्रश्न, प्रत्येक 1 अंक का।' } }),
  S('B', 'vsa', 2, 5, { name: { en: 'Section B - Very Short Answer', hi: 'खंड ख - अति लघु उत्तरीय' }, instr: { en: '5 questions of 2 marks each.', hi: '5 प्रश्न, प्रत्येक 2 अंक का।' } }),
  S('C', 'sa', 3, 7, { name: { en: 'Section C - Short Answer', hi: 'खंड ग - लघु उत्तरीय' }, instr: { en: '7 questions of 3 marks each.', hi: '7 प्रश्न, प्रत्येक 3 अंक का।' } }),
  S('D', 'case', 4, 2, { name: { en: 'Section D - Case Based', hi: 'खंड घ - केस आधारित' }, instr: { en: '2 case-based questions of 4 marks each.', hi: '2 केस आधारित प्रश्न, प्रत्येक 4 अंक का।' } }),
  S('E', 'la', 5, 3, { name: { en: 'Section E - Long Answer', hi: 'खंड ङ - दीर्घ उत्तरीय' }, instr: { en: '3 questions of 5 marks each.', hi: '3 प्रश्न, प्रत्येक 5 अंक का।' } }),
];
const SCI_CHOICE = { A: 0, B: 1, C: 2, D: 2, E: 3 };

const MATH_SECTIONS = [
  S('A', 'mcq', 1, 20, { arCount: 2, name: { en: 'Section A - MCQ / Assertion-Reason', hi: 'खंड क - बहुविकल्पीय / अभिकथन-कारण' }, instr: { en: '18 MCQs and 2 Assertion-Reason questions of 1 mark each.', hi: '18 बहुविकल्पीय तथा 2 अभिकथन-कारण प्रश्न, प्रत्येक 1 अंक का।' } }),
  S('B', 'vsa', 2, 5, { name: { en: 'Section B - Very Short Answer', hi: 'खंड ख - अति लघु उत्तरीय' }, instr: { en: '5 questions of 2 marks each.', hi: '5 प्रश्न, प्रत्येक 2 अंक का।' } }),
  S('C', 'sa', 3, 6, { name: { en: 'Section C - Short Answer', hi: 'खंड ग - लघु उत्तरीय' }, instr: { en: '6 questions of 3 marks each.', hi: '6 प्रश्न, प्रत्येक 3 अंक का।' } }),
  S('D', 'la', 5, 4, { name: { en: 'Section D - Long Answer', hi: 'खंड घ - दीर्घ उत्तरीय' }, instr: { en: '4 questions of 5 marks each.', hi: '4 प्रश्न, प्रत्येक 5 अंक का।' } }),
  S('E', 'case', 4, 3, { name: { en: 'Section E - Case Based', hi: 'खंड ङ - केस आधारित' }, instr: { en: '3 case-based questions of 4 marks each.', hi: '3 केस आधारित प्रश्न, प्रत्येक 4 अंक का।' } }),
];
const MATH_CHOICE = { A: 0, B: 2, C: 2, D: 2, E: 3 };

const sec = (id, type, marks, count, en, hi, extra = {}) => S(id, type, marks, count, { name: { en: `Section ${id} - ${en}`, hi: `खंड ${id} - ${hi}` }, ...extra });

const MCQ20 = sec('A', 'mcq', 1, 20, 'Objective (MCQ / Assertion-Reason / Case-based MCQ)', 'वस्तुनिष्ठ', { arCount: 2, instr: { en: '20 objective questions of 1 mark each.', hi: '20 वस्तुनिष्ठ प्रश्न, प्रत्येक 1 अंक का।' } });

const DEFS = {
  physics: { time: 180, theory: 70, practical: 30, sections: SCI_SECTIONS, choice: SCI_CHOICE, competency: 50, selected: 20, constructed: 30 },
  chemistry: { time: 180, theory: 70, practical: 30, sections: SCI_SECTIONS, choice: SCI_CHOICE, competency: 50, selected: 20, constructed: 30 },
  accountancy: { time: 180, theory: 80, practical: 20, competency: 50, selected: 20, constructed: 30, choice: { A: 0, B: 1, C: 1, D: 2, E: 1 },
    sections: [MCQ20, sec('B', 'sa', 3, 4, 'Short Answer', 'लघु उत्तरीय'), sec('C', 'case', 4, 4, 'Case / Application Based', 'केस / अनुप्रयोग आधारित'),
      sec('D', 'long', 6, 4, 'Long Answer (Numerical)', 'दीर्घ उत्तरीय (संख्यात्मक)'), sec('E', 'long', 8, 1, 'Long Answer (Numerical)', 'दीर्घ उत्तरीय (संख्यात्मक)')] },
  business: { time: 180, theory: 80, practical: 20, competency: 50, selected: 20, constructed: 30, choice: { A: 0, B: 1, C: 1, D: 2, E: 1 },
    sections: [MCQ20, sec('B', 'sa', 3, 4, 'Short Answer', 'लघु उत्तरीय'), sec('C', 'case', 4, 4, 'Case Based', 'केस आधारित'),
      sec('D', 'la', 5, 4, 'Long Answer', 'दीर्घ उत्तरीय'), sec('E', 'la', 6, 2, 'Long Answer', 'दीर्घ उत्तरीय')] },
  economics: { time: 180, theory: 80, practical: 20, competency: 50, selected: 20, constructed: 30, choice: { A: 0, B: 2, C: 1, D: 3 },
    sections: [MCQ20, sec('B', 'sa', 3, 6, 'Short Answer', 'लघु उत्तरीय'), sec('C', 'case', 4, 3, 'Case / Data Based', 'केस / आँकड़ा आधारित'), sec('D', 'long', 6, 5, 'Long Answer', 'दीर्घ उत्तरीय')] },
  maths: { time: 180, theory: 80, practical: 20, sections: MATH_SECTIONS, choice: MATH_CHOICE, competency: 50, selected: 20, constructed: 30 },
  hindi: { time: 180, theory: 80, practical: 20, structureOnly: true, competency: null, choice: { A: 0, B: 1, C: 1 },
    sections: [sec('A', 'reading', 1, 20, 'Reading (Unseen Passages)', 'अपठित बोध', { instr: { en: 'Unseen passages with 1-mark MCQ / VSA items.', hi: 'अपठित गद्यांश पर आधारित 1 अंक के प्रश्न।' } }),
      sec('B', 'writing', 5, 4, 'Writing Skills', 'रचनात्मक लेखन'), sec('C', 'literature', 8, 5, 'Literature', 'पाठ्यपुस्तक')] },
  english: { time: 180, theory: 80, practical: 20, structureOnly: true, competency: null, choice: { A: 0, B: 1, C: 1 },
    sections: [sec('A', 'reading', 1, 20, 'Reading Comprehension', 'पठन बोध'), sec('B', 'writing', 5, 4, 'Writing Skills', 'लेखन कौशल'), sec('C', 'literature', 8, 5, 'Literature', 'साहित्य')] },
};

const X_MATHS = { ...DEFS.maths, practical: 0, internalNote: 'Class X (Standard) uses 80 theory + 20 internal assessment; pattern flagged verified:false.' };

/**
 * Get a blueprint. The sum of section marks is verified when built.
 * @returns {object|null} {subject,code,cls,maxMarks,time,theory,practical,sections,internalChoice,pattern:{competencyPct,...},verified,flags}
 */
export function getBlueprint(subject, cls) {
  const s = normaliseSubject(subject), c = normaliseClass(cls);
  if (!s || !c) return null;
  let d = DEFS[s];
  if (s === 'maths' && c === 'X') d = X_MATHS;
  if (!d) return null;
  const syl = getSyllabus(s, c);
  const sections = d.sections.map((x) => ({ ...x }));
  const maxMarks = sections.reduce((t, x) => t + x.marks * x.count, 0);
  const flags = [];
  const verified = false; // pattern details are embedded, not read from the repo curriculum JSON
  flags.push({ field: 'sections/marks distribution', verified: false, note: 'Embedded pattern; confirm against the latest CBSE sample paper / circular.' });
  flags.push({ field: 'internalChoice', verified: false, note: 'Counts of questions with internal choice are configurable defaults.' });
  const repoSub = syl?.practical;
  if (repoSub?.marks != null) flags.push({ field: 'practicalMarks', verified: true, note: 'From repo curriculum JSON.' });
  else flags.push({ field: 'practicalMarks', verified: false, note: 'Embedded default.' });
  flags.push({ field: 'competencyPct', verified: false, note: 'Default competency-focused share; not present in repo curriculum data. Confirm with latest CBSE circular.' });
  if (d.structureOnly) flags.push({ field: 'content', verified: false, note: 'Structure-only subject: sections and marks only, no generated content.' });
  return {
    subject: s, code: syl?.code || '', cls: c, maxMarks, time: d.time, theory: d.theory,
    practical: repoSub?.marks ?? d.practical, structureOnly: !!d.structureOnly,
    sections, internalChoice: { ...d.choice },
    pattern: { competencyPct: d.competency, selectedResponsePct: d.selected, constructedResponsePct: d.constructed, verified: false },
    verified, flags,
    instructions: {
      en: ['All questions are compulsory.', 'The question paper has sections as indicated; read each section\'s instructions.', 'Internal choice is provided in some questions; attempt only one of the alternatives.', 'Use of calculators is not permitted unless stated.'],
      hi: ['सभी प्रश्न अनिवार्य हैं।', 'प्रश्न-पत्र में दर्शाए अनुसार खंड हैं; प्रत्येक खंड के निर्देश पढ़ें।', 'कुछ प्रश्नों में आंतरिक विकल्प दिया गया है; केवल एक विकल्प हल करें।', 'जब तक निर्देशित न हो, कैलकुलेटर का प्रयोग वर्जित है।'],
    },
  };
}

/** Scale a blueprint to a target total marks by trimming question counts proportionally (keeps per-question marks). */
export function scaleBlueprint(bp, target) {
  if (!target || target === bp.maxMarks) return bp;
  const factor = target / bp.maxMarks;
  const sections = bp.sections.map((s) => ({ ...s }));
  // proportional counts, then fix the remainder using the smallest-mark section that can absorb it
  for (const s of sections) s.count = Math.max(0, Math.round(s.count * factor));
  const total = () => sections.reduce((t, s) => t + s.marks * s.count, 0);
  let guard = 200;
  while (total() !== target && guard-- > 0) {
    const diff = target - total();
    const cand = sections.filter((s) => (diff > 0 ? true : s.count > 0)).sort((a, b) => a.marks - b.marks);
    const fit = (diff > 0 ? cand.filter((s) => s.marks <= diff) : cand.filter((s) => s.marks <= -diff));
    const pickS = (diff > 0 ? fit[fit.length - 1] : fit[fit.length - 1]) || cand[0];
    if (!pickS) break;
    pickS.count += diff > 0 ? 1 : -1;
  }
  for (const s of sections) { s.arCount = Math.min(s.arCount || 0, s.count); }
  const out = { ...bp, sections: sections.filter((s) => s.count > 0), maxMarks: total(), scaledFrom: bp.maxMarks };
  out.internalChoice = { ...bp.internalChoice };
  if (out.maxMarks !== target) out.flags = [...bp.flags, { field: 'maxMarks', verified: false, note: `Could not scale exactly to ${target}; got ${out.maxMarks}.` }];
  else out.flags = [...bp.flags, { field: 'maxMarks', verified: false, note: `Scaled from ${bp.maxMarks} to ${target} marks proportionally (not an official pattern).` }];
  out.time = Math.max(30, Math.round((bp.time * target / bp.maxMarks) / 15) * 15);
  return out;
}

export function listBlueprints() {
  const out = [];
  for (const s of Object.keys(DEFS)) for (const c of ['X', 'XI', 'XII']) { const b = getBlueprint(s, c); if (b && (getSyllabus(s, c))) out.push({ subject: s, cls: c, maxMarks: b.maxMarks, time: b.time }); }
  return out;
}
