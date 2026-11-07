// Bank registry: curated conceptual items in English and Hindi.
import { PHYSICS_BANK, PHYSICS_CASES_BANK } from './physics.js';
import { CHEMISTRY_BANK, CHEMISTRY_CASES_BANK } from './chemistry.js';
import { ACCOUNTANCY_BANK, BUSINESS_BANK, ECONOMICS_BANK, COMMERCE_CASES_BANK } from './commerce.js';
import { MATHS_BANK } from './maths.js';
import { EXTRA_BANK } from './extra.js';
import { MORE_BANK } from './more.js';
export { AR_OPTIONS, AR_STEM } from './helpers.js';

const withId = (arr) => arr.map((it, i) => ({ ...it, id: `bank.${it.subject}.${it.cls}.${it.ch}.${it.kind}.${i}` }));
export const BANK = withId([...PHYSICS_BANK, ...PHYSICS_CASES_BANK, ...CHEMISTRY_BANK, ...CHEMISTRY_CASES_BANK, ...ACCOUNTANCY_BANK, ...BUSINESS_BANK, ...ECONOMICS_BANK, ...COMMERCE_CASES_BANK, ...MATHS_BANK, ...EXTRA_BANK, ...MORE_BANK]);
const BY_ID = new Map(BANK.map((b) => [b.id, b]));
export const getBankItem = (id) => BY_ID.get(id) || null;

/** @returns {object[]} bank items for subject/class (+ optional chapter, kind). */
export function bankFor(subject, cls, { chapter, kind } = {}) {
  return BANK.filter((b) => b.subject === subject && b.cls === cls && (!chapter || b.ch === chapter) && (!kind || b.kind === kind));
}
