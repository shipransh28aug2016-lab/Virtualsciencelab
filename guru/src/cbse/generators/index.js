// Generator registry: look up computed-question entries by subject/class/chapter and build questions.
import { PHYSICS_XII, PHYSICS_XI, PHYSICS_CASES } from './physics.js';
import { CHEMISTRY_XI, CHEMISTRY_XII } from './chemistry.js';
import { ACCOUNTANCY_XII, ACCOUNTANCY_XI, ACCOUNTANCY_CASES } from './accountancy.js';
import { ECONOMICS_XII, ECONOMICS_XI, ECONOMICS_CASES } from './economics.js';
import { MATHS_X, MATHS_XI, MATHS_XII } from './maths.js';
import { coreToQuestion, caseToQuestion } from './common.js';
import { makeRng } from '../util.js';

export const ALL_ENTRIES = [
  ...PHYSICS_XII, ...PHYSICS_XI, ...PHYSICS_CASES, ...CHEMISTRY_XI, ...CHEMISTRY_XII,
  ...ACCOUNTANCY_XII, ...ACCOUNTANCY_XI, ...ACCOUNTANCY_CASES, ...ECONOMICS_XII, ...ECONOMICS_XI, ...ECONOMICS_CASES,
  ...MATHS_X, ...MATHS_XI, ...MATHS_XII,
];
const BY_ID = new Map(ALL_ENTRIES.map((e) => [e.id, e]));
const DIFF = { easy: 'easy', medium: 'medium', hard: 'hard' };

/** @returns {object[]} entries for subject/class (optionally chapter / case-only / non-case) */
export function entriesFor(subject, cls, chapter, kind) {
  return ALL_ENTRIES.filter((e) => e.subject === subject && e.cls === cls && (!chapter || e.ch === chapter)
    && (kind === 'case' ? e.kind === 'case' : kind === 'plain' ? e.kind !== 'case' : true));
}
export const getEntry = (id) => BY_ID.get(id) || null;
export function chaptersWithGenerators(subject, cls) { return [...new Set(entriesFor(subject, cls).map((e) => e.ch))]; }

/** Run a generator, retrying seeds when it declines (returns null). @returns {{core:object,seed:number}|null} */
export function runEntry(entry, seed) {
  for (let i = 0; i < 12; i++) {
    const s = (seed + i * 7919) >>> 0;
    const core = entry.fn(makeRng(s));
    if (core) return { core, seed: s };
  }
  return null;
}

/**
 * Build a question from a generator entry.
 * @param {object} entry @param {{type:string, marks:number, seed:number}} o
 */
export function generateQuestion(entry, o) {
  const run = runEntry(entry, o.seed);
  if (!run) return null;
  const base = { id: entry.id, seed: run.seed, chapter: entry.ch, bloom: entry.bloom, difficulty: DIFF[entry.diff] || 'medium' };
  if (run.core.case) return caseToQuestion(run.core, { ...base, type: 'case', marks: o.marks });
  return coreToQuestion(run.core, { ...base, type: o.type, marks: o.marks });
}

/** Recompute a generated question's core from its meta (for arithmetic re-check). */
export function regenerate(meta) {
  const entry = getEntry(String(meta.gen).split('#')[0]);
  if (!entry) return null;
  const core = entry.fn(makeRng(meta.seed));
  return core ? { entry, core } : null;
}
