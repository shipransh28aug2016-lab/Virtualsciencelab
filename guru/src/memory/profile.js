// Profile assembly: seed profile + learned preferences + usage stats.
import { dominantPrefs } from './learn.js';
import { SEED_PROFILE } from './seed.js';

const LANG_MAP = { hi: 'hi', en: 'en', hinglish: 'hinglish' };

/**
 * @param {{profile?:object, prefs?:object, skillStats?:object, records?:object[], runs?:object}} src
 * @returns {{name:string,role:string,langPref:string,subjects:string[],classes:string[],style:object,stats:object}}
 */
export function buildProfile({ profile = SEED_PROFILE, prefs = {}, skillStats = {}, records = [], runs = {} } = {}) {
  const dom = dominantPrefs(prefs);
  const style = { ...(profile.style || {}) };
  if (dom.length) style.length = dom.length;
  if (dom.format) style.format = dom.format;
  if (dom.out) style.outputLang = dom.out;
  const byKind = {};
  for (const r of records) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  const skills = Object.entries(skillStats)
    .map(([id, s]) => ({ id, runs: s.runs, successRate: s.runs ? +(s.ok / s.runs).toFixed(2) : 0, avgScore: s.scored ? +(s.scoreSum / s.scored).toFixed(1) : null, fb: +(s.fb || 0).toFixed(2) }))
    .sort((a, b) => b.runs - a.runs);
  return {
    name: profile.name,
    role: profile.role,
    langPref: LANG_MAP[dom.lang] || profile.langPref || 'hinglish',
    subjects: [...(profile.subjects || [])],
    classes: [...(profile.classes || [])],
    style,
    stats: { memories: records.length, byKind, runs: Object.keys(runs).length, observed: prefs.n || 0, topSkills: skills.slice(0, 8), weakSkills: skills.filter((s) => s.runs >= 3 && s.successRate < 0.5).slice(0, 5) },
  };
}
