// Constructors for curated bilingual bank items.
export const AR_OPTIONS = {
  en: ['Both A and R are true and R is the correct explanation of A.', 'Both A and R are true but R is not the correct explanation of A.', 'A is true but R is false.', 'A is false but R is true.'],
  hi: ['अभिकथन (A) और कारण (R) दोनों सत्य हैं तथा कारण (R), अभिकथन (A) की सही व्याख्या करता है।', 'अभिकथन (A) और कारण (R) दोनों सत्य हैं, परंतु कारण (R), अभिकथन (A) की सही व्याख्या नहीं करता।', 'अभिकथन (A) सत्य है, परंतु कारण (R) असत्य है।', 'अभिकथन (A) असत्य है, परंतु कारण (R) सत्य है।'],
};
export const AR_STEM = {
  en: 'Given below are two statements labelled Assertion (A) and Reason (R). Select the correct option.',
  hi: 'नीचे दो कथन दिए गए हैं: अभिकथन (A) तथा कारण (R)। सही विकल्प चुनिए।',
};
const pairs = (pts) => pts.map(([en, hi]) => ({ en, hi }));

/** Conceptual written question usable for marks in [lo,hi]. */
export const Q = (subject, cls, ch, m, bloom, diff, en, hi, pts) => ({ kind: 'concept', subject, cls, ch, m, bloom, diff, text: { en, hi }, pts: pairs(pts) });
/** Conceptual MCQ with 4 [en,hi] option pairs and index of the correct one. */
export const M = (subject, cls, ch, bloom, diff, en, hi, opts, ans) => ({ kind: 'mcq', subject, cls, ch, bloom, diff, text: { en, hi }, opts: opts.map(([e, h]) => ({ en: e, hi: h })), ans });
/** Assertion-reason item; code a|b|c|d = index of the correct standard option. */
export const AR = (subject, cls, ch, diff, aEn, aHi, rEn, rHi, code) => ({ kind: 'ar', subject, cls, ch, bloom: 'analyse', diff, A: { en: aEn, hi: aHi }, R: { en: rEn, hi: rHi }, ans: 'abcd'.indexOf(code) });
/** Curated case: passage + sub-questions [{m, en, hi, opts?, ans?, pts?}] */
export const CASE = (subject, cls, ch, bloom, diff, pEn, pHi, subs) => ({ kind: 'case', subject, cls, ch, bloom, diff, passage: { en: pEn, hi: pHi }, subs: subs.map((s) => ({ m: s.m, text: { en: s.en, hi: s.hi }, opts: s.opts?.map(([e, h]) => ({ en: e, hi: h })), ans: s.ans, pts: s.pts ? pairs(s.pts) : undefined })) });
