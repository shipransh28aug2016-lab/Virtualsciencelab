// Seed knowledge about the primary user. Pinned (never decays); editable via memory tools.

export const SEED_PROFILE = {
  name: 'Teacher',
  role: 'CBSE teacher & edtech developer',
  langPref: 'hinglish',
  subjects: ['Commerce', 'Physics', 'Chemistry'],
  classes: ['XI', 'XII'],
  style: { ui: 'minimal', capability: 'max', output: 'terse', tokenEfficient: true, languages: ['hi', 'en'] },
};

const T = (text, kind, tags, weight = 2) => ({ text, kind, tags, weight, meta: { pinned: true, seed: true } });

export const SEED_MEMORIES = [
  T('User is a CBSE teacher and edtech developer.', 'fact', ['profile', 'role']),
  T('उपयोगकर्ता CBSE शिक्षक और एडटेक डेवलपर है।', 'fact', ['profile', 'role']),
  T('Teaches Commerce, Physics and Chemistry for Classes XI and XII (CBSE).', 'fact', ['profile', 'subjects', 'classes']),
  T('कक्षा 11 और 12 में वाणिज्य, भौतिकी और रसायन विज्ञान पढ़ाते हैं।', 'fact', ['profile', 'subjects', 'classes']),
  T('Builds virtual science labs (Physics/Chemistry simulations) as web apps.', 'fact', ['projects', 'virtual-lab']),
  T('Builds bulk CBSE marksheet / report-card generators from Excel marks data for Classes VI–XII.', 'fact', ['projects', 'marksheet']),
  T('Creates CBSE case-study questions and assertion-reason items; verifies syllabus against official cbseacademic.nic.in curriculum.', 'fact', ['projects', 'case-study', 'syllabus']),
  T('Works in Hindi and English, often mixing both (Hinglish); Devanagari output must render correctly.', 'pref', ['language', 'hindi', 'english']),
  T('उपयोगकर्ता हिंदी और अंग्रेज़ी दोनों में काम करता है; भाषा हिंग्लिश मिश्रित हो सकती है।', 'pref', ['language', 'hindi', 'english']),
  T('Wants minimal UI with maximum capability.', 'pref', ['style', 'ui']),
  T('Prefers terse, token-efficient output: no filler, direct results, artifacts over long prose.', 'pref', ['style', 'output', 'length']),
  T('संक्षिप्त और सीधा उत्तर पसंद है; अनावश्यक विस्तार नहीं।', 'pref', ['style', 'output', 'length']),
  T('CBSE numerics must be computed, never hand-typed; verify marks totals and syllabus freshness before use.', 'lesson', ['cbse', 'quality'], 2.5),
];

/**
 * Seed once. Safe to call repeatedly.
 * @param {{getMeta:Function,setMeta:Function,putMany:Function}} store
 * @param {Function} newId
 * @returns {Promise<boolean>} true if seeded now
 */
export async function seedStore(store, newId) {
  if (store.getMeta('seeded', 0)) return false;
  const now = Date.now();
  await store.putMany(SEED_MEMORIES.map((m) => ({ id: newId('seed'), ...m, tags: [...m.tags], created: now, updated: now, hits: 0, count: 1 })));
  await store.setMeta('seeded', 1);
  await store.setMeta('profile', SEED_PROFILE);
  return true;
}
