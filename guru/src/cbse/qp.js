// Question-paper assembly: blueprint + chapter weightage + difficulty/Bloom mix + no duplicates + seedable RNG.
import { getSyllabus, normaliseSubject, normaliseClass, SUBJECTS } from './syllabus.js';
import { getBlueprint, scaleBlueprint } from './blueprint.js';
import { generateQuestion } from './generators/index.js';
import { makeRng, hashSeed, exactKey, sumMarks, bi } from './util.js';
import { poolFor, chapterHas, conceptToQuestion, mcqFromBank, arFromBank, caseFromBank, derivedMcq, derivedCase, bloomGroup, isCompetency, seedFor } from './pool.js';

export const DEFAULT_DIFFICULTY = { easy: 40, medium: 40, hard: 20 };
const NUMERIC_SHARE = { physics: 0.5, chemistry: 0.45, accountancy: 0.7, economics: 0.45, maths: 0.8, business: 0 };

/** Render a bilingual value for a language/layout. */
export function pick(o, lang, layout = 'stacked') {
  if (o == null) return '';
  if (typeof o === 'string') return o;
  if (lang === 'en') return o.en;
  if (lang === 'hi') return o.hi;
  if (o.en === o.hi) return o.en;
  return layout === 'side' ? `${o.en} | ${o.hi}` : `${o.en}\n${o.hi}`;
}

function apportion(weights, total, ids) {
  const sum = ids.reduce((t, i) => t + weights[i], 0) || 1;
  const t = {};
  ids.forEach((i) => { t[i] = (weights[i] / sum) * total; });
  return t;
}
function assignMix(n, mix, rng, order = ['easy', 'medium', 'hard']) {
  const sum = order.reduce((t, k) => t + (mix[k] || 0), 0) || 1;
  const counts = order.map((k) => Math.floor(((mix[k] || 0) / sum) * n));
  let rem = n - counts.reduce((a, b) => a + b, 0), i = 0;
  while (rem-- > 0) { counts[i % counts.length]++; i++; }
  const arr = [];
  order.forEach((k, idx) => { for (let c = 0; c < counts[idx]; c++) arr.push(k); });
  return rng.shuffle(arr);
}

/** Build one question for a slot, or null. `used` holds stem keys (duplicates are rejected). */
function buildForSlot(ctx, slot, ch, target, rng, used, exclude = new Set()) {
  const { subject, cls } = ctx;
  const pool = poolFor(subject, cls);
  const score = (cand) => (cand.difficulty === target.diff ? 2 : 0) + (bloomGroup(cand.bloom) === target.group ? 2 : 0) + rng.next();
  const accept = (q) => {
    if (!q) return false;
    const k = exactKey(q.text.en);
    if (used.has(k) || exclude.has(k)) return false;
    if (q.meta?.gen && (ctx.genUse.get(q.meta.gen.split('#')[0]) || 0) >= (subject === 'maths' ? 3 : 2)) return false;
    return true;
  };
  const tries = [];
  const type = slot.type;
  const marks = slot.marks;
  const numericOK = SUBJECTS[subject].numeric && NUMERIC_SHARE[subject] > 0;
  const addGen = (kind) => {
    const entries = (kind === 'case' ? pool.genCases : pool.gens).filter((e) => e.ch === ch);
    for (let a = 0; a < 6 && entries.length; a++) {
      const e = rng.pick(entries);
      const q = generateQuestion(e, { type: kind === 'case' ? 'case' : type, marks, seed: seedFor(rng) });
      if (q) tries.push(q);
    }
  };
  if (type === 'ar') {
    pool.ar.filter((x) => x.ch === ch).forEach((x) => tries.push(arFromBank(x)));
  } else if (type === 'mcq') {
    pool.mcq.filter((x) => x.ch === ch).forEach((x) => tries.push(mcqFromBank(x, rng)));
    if (numericOK) addGen('mcq');
    if (tries.length < 4) pool.concept.filter((x) => x.ch === ch).forEach((x) => { for (const v of [0, 1]) { const d = derivedMcq(x, pool.concept, rng, v); if (d) tries.push(d); } });
  } else if (type === 'case') {
    pool.cases.filter((x) => x.ch === ch).forEach((x) => tries.push(caseFromBank(x, rng)));
    addGen('case');
    if (!tries.length && numericOK) {
      const entries = pool.gens.filter((e) => e.ch === ch);
      for (let a = 0; a < 4 && entries.length; a++) { const q = derivedCase(rng.pick(entries), seedFor(rng)); if (q) tries.push(q); }
    }
  } else {
    const wantGen = numericOK && rng.chance(NUMERIC_SHARE[subject]);
    if (wantGen || !pool.concept.some((x) => x.ch === ch && marks >= x.m[0] && marks <= x.m[1])) addGen('written');
    pool.concept.filter((x) => x.ch === ch && marks >= x.m[0] && marks <= x.m[1]).forEach((x) => tries.push(conceptToQuestion(x, { type, marks })));
  }
  const ok = tries.filter(accept).sort((a, b) => score(b) - score(a));
  const q = ok[0];
  if (!q) return null;
  q.marks = marks; // slot is the source of truth for marks
  return q;
}

function noteGen(ctx, q) { const g = q.meta?.gen; if (g) { const k = g.split('#')[0]; ctx.genUse.set(k, (ctx.genUse.get(k) || 0) + 1); } }

function finalise(q, ctx, no) {
  q.no = no;
  q.competency = isCompetency(q);
  const chap = ctx.chapters.find((c) => c.id === q.chapter);
  q.chapterName = chap ? chap.name : null;
  return q;
}

/**
 * Assemble a full question paper.
 * @param {{subject:string, cls:string, marks?:number, chapters?:string[], seed?:string|number, lang?:'en'|'hi'|'bilingual', layout?:'stacked'|'side', difficulty?:{easy:number,medium:number,hard:number}, competencyPct?:number, title?:string, examName?:string, internalChoice?:boolean}} o
 */
export function buildQuestionPaper(o) {
  const subject = normaliseSubject(o.subject), cls = normaliseClass(o.cls);
  if (!subject || !cls) throw new Error('Unknown subject or class');
  const syl = getSyllabus(subject, cls);
  let bp = getBlueprint(subject, cls);
  if (!syl || !bp) throw new Error(`No syllabus/blueprint for ${subject} class ${cls}`);
  if (o.marks && o.marks !== bp.maxMarks) bp = scaleBlueprint(bp, o.marks);
  const lang = o.lang || 'en', layout = o.layout || 'stacked';
  const seed = o.seed ?? 'guru';
  const rng = makeRng(`${seed}|${subject}|${cls}|${bp.maxMarks}|${(o.chapters || []).join(',')}`);
  const diffMix = o.difficulty || DEFAULT_DIFFICULTY;
  const comp = o.competencyPct ?? bp.pattern.competencyPct ?? 50;
  const chapters = o.chapters?.length ? syl.chapters.filter((c) => o.chapters.includes(c.id) || o.chapters.includes(String(c.no))) : syl.chapters;
  const ctx = { subject, cls, chapters: syl.chapters, genUse: new Map() };
  const header = {
    board: 'CBSE', title: o.title || { en: `Practice Question Paper - ${SUBJECTS[subject].name.en} (${syl.code})`, hi: `अभ्यास प्रश्न-पत्र - ${SUBJECTS[subject].name.hi} (${syl.code})` },
    examName: o.examName || null, subject: SUBJECTS[subject].name, code: syl.code, cls, maxMarks: bp.maxMarks, timeMinutes: bp.time,
    time: { en: `${bp.time / 60 >= 1 ? +(bp.time / 60).toFixed(2) + ' hours' : bp.time + ' minutes'}`, hi: `${bp.time / 60 >= 1 ? +(bp.time / 60).toFixed(2) + ' घंटे' : bp.time + ' मिनट'}` },
    instructions: bp.instructions, seed: String(seed), notice: { en: 'Practice paper modelled on the CBSE blueprint; not an official CBSE paper.', hi: 'यह CBSE ब्लूप्रिंट पर आधारित अभ्यास प्रश्न-पत्र है; आधिकारिक CBSE प्रश्न-पत्र नहीं है।' },
  };
  if (bp.structureOnly) {
    return {
      header, structureOnly: true, lang, layout,
      sections: bp.sections.map((s) => ({ id: s.id, name: s.name, instructions: s.instr || null, type: s.type, marksEach: s.marks, count: s.count, questions: [] })),
      totals: { marks: bp.maxMarks, questions: bp.sections.reduce((t, s) => t + s.count, 0), bySection: Object.fromEntries(bp.sections.map((s) => [s.id, s.marks * s.count])) },
      flags: bp.flags, warnings: [{ en: 'Structure-only subject: sections and marks distribution provided; question content is not generated.', hi: 'केवल संरचना वाला विषय: खंड तथा अंक-विभाजन दिया गया है; प्रश्न-सामग्री सृजित नहीं की गई।' }], blueprint: bp,
    };
  }
  // ---- slots
  const slots = [];
  for (const s of bp.sections) {
    for (let i = 0; i < s.count; i++) {
      const isAr = s.type === 'mcq' && s.arCount && i >= s.count - s.arCount;
      slots.push({ section: s.id, idx: i, type: isAr ? 'ar' : s.type, marks: s.marks });
    }
  }
  const weights = Object.fromEntries(chapters.map((c) => [c.id, c.weight]));
  const targetMarks = apportion(weights, bp.maxMarks, chapters.map((c) => c.id));
  const got = Object.fromEntries(chapters.map((c) => [c.id, 0]));
  const warnings = [];
  // difficulty + bloom targets, allocated proportional across slots
  const diffs = assignMix(slots.length, diffMix, rng);
  const groups = assignMix(slots.length, { L: 100 - comp, A: Math.round(comp * 0.65), H: Math.round(comp * 0.35) }, rng, ['L', 'A', 'H']);
  slots.forEach((s, i) => { s.target = { diff: s.marks >= 5 ? 'hard' : diffs[i], group: s.type === 'ar' ? 'H' : groups[i] }; });
  const order = slots.map((s, i) => i).sort((a, b) => slots[b].marks - slots[a].marks || a - b);
  const used = new Set();
  const built = new Map();
  for (const si of order) {
    const slot = slots[si];
    const cands = chapters.map((c) => c.id).filter((id) => chapterHas(subject, cls, id, slot.type, slot.marks));
    const ranked = cands.map((id) => ({ id, d: targetMarks[id] - got[id] + rng.next() * 0.5 })).sort((a, b) => b.d - a.d);
    let q = null, usedCh = null;
    for (const r of ranked) {
      q = buildForSlot(ctx, slot, r.id, slot.target, rng, used);
      if (q) { usedCh = r.id; break; }
    }
    if (!q) {
      // fall back: any chapter of the class (even outside the selected set), then relax type
      for (const c of syl.chapters) { q = buildForSlot(ctx, slot, c.id, slot.target, rng, used); if (q) { usedCh = c.id; break; } }
      if (q) warnings.push({ en: `Slot ${slot.section}${slot.idx + 1}: selected chapters had no ${slot.type} items; used chapter ${usedCh}.`, hi: `स्लॉट ${slot.section}${slot.idx + 1}: चयनित अध्यायों में ${slot.type} प्रश्न उपलब्ध नहीं थे; अध्याय ${usedCh} का प्रयोग हुआ।` });
    }
    if (!q && slot.type === 'ar') {
      slot.type = 'mcq';
      for (const r of ranked.length ? ranked : syl.chapters.map((c) => ({ id: c.id }))) { q = buildForSlot(ctx, slot, r.id, slot.target, rng, used); if (q) { usedCh = r.id; break; } }
      if (q) warnings.push({ en: `Slot ${slot.section}${slot.idx + 1}: no Assertion-Reason item available for this subject/class; an MCQ was used. Add AR items to the bank.`, hi: `स्लॉट ${slot.section}${slot.idx + 1}: इस विषय/कक्षा के लिए अभिकथन-कारण प्रश्न उपलब्ध नहीं; बहुविकल्पीय प्रश्न लिया गया।` });
    }
    if (!q && slot.type === 'case') {
      const alt = { ...slot, type: 'sa' };
      for (const r of ranked.length ? ranked : syl.chapters.map((c) => ({ id: c.id }))) { q = buildForSlot(ctx, alt, r.id, slot.target, rng, used); if (q) { usedCh = r.id; q.type = 'sa'; break; } }
      if (q) warnings.push({ en: `Slot ${slot.section}${slot.idx + 1}: no case-based item available; an application question was used.`, hi: `स्लॉट ${slot.section}${slot.idx + 1}: केस आधारित प्रश्न उपलब्ध नहीं; अनुप्रयोग प्रश्न लिया गया।` });
    }
    if (!q) { warnings.push({ en: `Slot ${slot.section}${slot.idx + 1} (${slot.type}, ${slot.marks}m) could not be filled.`, hi: `स्लॉट ${slot.section}${slot.idx + 1} (${slot.type}, ${slot.marks} अंक) नहीं भरा जा सका।` }); continue; }
    used.add(exactKey(q.text.en)); noteGen(ctx, q);
    got[usedCh] = (got[usedCh] || 0) + slot.marks;
    built.set(si, q);
  }
  // ---- internal choice
  const useChoice = o.internalChoice !== false;
  const sections = bp.sections.map((s) => ({ id: s.id, name: s.name, instructions: s.instr || null, type: s.type, marksEach: s.marks, count: s.count, questions: [] }));
  let no = 0;
  slots.forEach((slot, si) => {
    const q = built.get(si);
    if (!q) return;
    finalise(q, ctx, ++no);
    sections.find((s) => s.id === slot.section).questions.push(q);
  });
  if (useChoice) {
    for (const sec of sections) {
      const want = bp.internalChoice[sec.id] || 0;
      if (!want || !sec.questions.length) continue;
      const prefer = sec.questions.filter((q) => q.type !== 'case' && q.type !== 'ar' && q.type !== 'mcq');
      const targets = (prefer.length ? prefer : sec.questions.filter((q) => q.type !== 'ar' && q.type !== 'mcq')).slice(0, want);
      for (const q of targets) {
        const slot = { type: q.type, marks: q.marks };
        let alt = buildForSlot(ctx, slot, q.chapter, { diff: q.difficulty, group: bloomGroup(q.bloom) }, rng, used);
        if (!alt) for (const c of syl.chapters) { alt = buildForSlot(ctx, slot, c.id, { diff: q.difficulty, group: bloomGroup(q.bloom) }, rng, used); if (alt) break; }
        if (alt) { used.add(exactKey(alt.text.en)); noteGen(ctx, alt); alt.marks = q.marks; finalise(alt, ctx, q.no); q.alt = alt; }
      }
      const have = sec.questions.filter((q) => q.alt).length;
      if (have < want && sec.type !== 'case') warnings.push({ en: `Section ${sec.id}: internal choice available for ${have} of ${want} required question(s).`, hi: `खंड ${sec.id}: ${want} में से ${have} प्रश्नों में आंतरिक विकल्प उपलब्ध।` });
    }
  }
  // ---- stats
  const all = sections.flatMap((s) => s.questions);
  const tot = all.reduce((t, q) => t + q.marks, 0) || 1;
  const stats = {
    difficulty: Object.fromEntries(['easy', 'medium', 'hard'].map((k) => [k, +(all.filter((q) => q.difficulty === k).reduce((t, q) => t + q.marks, 0) / tot * 100).toFixed(1)])),
    bloom: Object.fromEntries(['L', 'A', 'H'].map((k) => [k, +(all.filter((q) => bloomGroup(q.bloom) === k).reduce((t, q) => t + q.marks, 0) / tot * 100).toFixed(1)])),
    competencyPct: +(all.filter((q) => q.competency).reduce((t, q) => t + q.marks, 0) / tot * 100).toFixed(1),
    competencyTarget: comp, chapterMarks: Object.fromEntries(Object.entries(got).filter(([, v]) => v).map(([k, v]) => [k, v])), chapterTarget: Object.fromEntries(Object.entries(targetMarks).map(([k, v]) => [k, +v.toFixed(1)])),
  };
  if (Math.abs(stats.competencyPct - comp) > 15) warnings.push({ en: `Competency-focused share is ${stats.competencyPct}% against a target of ${comp}% (question bank depth for this subject/class is limited).`, hi: `क्षमता-आधारित प्रश्नों का अंश ${stats.competencyPct}% है जबकि लक्ष्य ${comp}% है (इस विषय/कक्षा में प्रश्न-बैंक की गहराई सीमित है)।` });
  const totals = { marks: sumMarks(all.map((q) => ({ marks: q.marks }))), questions: all.length, bySection: Object.fromEntries(sections.map((s) => [s.id, sumMarks(s.questions.map((q) => ({ marks: q.marks })))])) };
  const paper = { header, lang, layout, sections, totals, stats, flags: bp.flags, warnings, blueprint: bp, meta: { seed: String(seed), generator: 'guru-cbse', subject, cls, hash: hashSeed(JSON.stringify(sections.map((s) => s.questions.map((q) => q.text.en)))) } };
  return renderPaper(paper, lang, layout);
}


/** Flatten a canonical (bilingual-object) question into display strings; canonical form kept in `i18n`. */
export function flattenQuestion(q, lang = 'en', layout = 'stacked') {
  const P = (o) => pick(o, lang, layout);
  const c = q.i18n || q;
  const f = { ...c };
  delete f.i18n; delete f.working;
  f.text = P(c.text); f.textEn = c.text.en; f.textHi = c.text.hi;
  if (c.options) { f.options = c.options.map(P); f.optionsEn = c.options.map((o) => o.en); f.optionsHi = c.options.map((o) => o.hi); }
  f.answer = P(c.answer); f.answerEn = c.answer.en; f.answerHi = c.answer.hi;
  f.markingScheme = c.markingScheme.map((m) => ({ point: P(m.point), marks: m.marks }));
  if (c.subQuestions) f.subQuestions = c.subQuestions.map((x) => flattenQuestion(x, lang, layout));
  if (c.alt) f.alt = flattenQuestion(c.alt, lang, layout);
  if (c.journal) f.journal = c.journal.map((e) => ({ no: e.no, lines: e.lines.map((l) => ({ acc: P(l.acc), dr: l.dr, cr: l.cr })), narr: P(e.narr) }));
  f.i18n = c;
  return f;
}

/** Re-render a paper in another language/layout (no re-generation). */
export function renderPaper(paper, lang = 'en', layout = 'stacked') {
  const P = (o) => pick(o, lang, layout);
  return { ...paper, lang, layout, header: { ...paper.header, titleText: P(paper.header.title), subjectText: P(paper.header.subject), timeText: P(paper.header.time), noticeText: P(paper.header.notice) },
    sections: paper.sections.map((s) => ({ ...s, nameText: P(s.name), instructionsText: s.instructions ? P(s.instructions) : '', questions: s.questions.map((q) => flattenQuestion(q, lang, layout)) })) };
}
