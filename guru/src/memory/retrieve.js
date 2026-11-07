// BM25 retrieval over Unicode (Latin + Devanagari) tokens with light Hindi stemming,
// Hinglish alias expansion, recency/weight boost and tag/kind filters.

const DEVA = /[ऀ-ॿ]/;
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/** NFC, lowercase, strip nukta/ZW chars, chandrabindu->anusvara, nasal+stop -> anusvara, Devanagari digits -> ASCII. */
export function normalize(s) {
  return String(s ?? '').normalize('NFC').toLowerCase()
    .replace(/[‌‍़]/g, '')
    .replace(/ँ/g, 'ं')
    .replace(/न्(?=[कखगघचछजझटठडढतथदधपफबभ])/g, 'ं')
    .replace(/म्(?=[पफबभ])/g, 'ं')
    .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966));
}

const STOP = new Set(('the a an is are was were be of to in and or for on with at by from as it this that i my me we you your ' +
  'का की के कि है हैं था थी थे को से में पर और या एक यह वह ये वो मेरी मेरा मेरे मैं आप तुम हम क्या भी तो नहीं कुछ लिए इस उस जो कौन कौनसा ' +
  'hai hain tha thi ka ki ke mera meri mere kya ko se me mein par aur ya ek yeh ye woh wo bhi to nahi kuch liye mujhe tum aap hum').split(/\s+/).map(normalize));

// Longest-first Hindi inflection suffixes (applied only when >=2 code points remain).
const HI_SUFFIX = ['ियाँ', 'ियां', 'ियों', 'ाइये', 'ाइए', 'ाओं', 'ाएं', 'ाएँ', 'ाओ', 'ेंगे', 'ेगा', 'ेगी', 'ोगे', 'ोगी', 'ाना', 'ाने', 'ाया', 'ाये', 'ाई', 'ता', 'ती', 'ते', 'ना', 'ने', 'ों', 'ें', 'ीं', 'ां', 'ाँ', 'ी', 'े', 'ा', 'ो']
  .map(normalize).sort((a, b) => b.length - a.length);

/** @param {string} t normalised token */
export function stem(t) {
  if (DEVA.test(t)) {
    for (const suf of HI_SUFFIX) {
      if (t.endsWith(suf) && [...t].length - [...suf].length >= 2) return t.slice(0, -suf.length);
    }
    return t;
  }
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

// Hinglish / English -> Devanagari equivalents, so Roman and Devanagari queries meet in one token space.
const ALIAS_SRC = {
  hindi: ['हिंदी'], english: ['अंग्रेजी', 'इंग्लिश'], marksheet: ['मार्कशीट'], result: ['रिजल्ट', 'परिणाम'], class: ['कक्षा', 'क्लास'],
  kaksha: ['कक्षा'], physics: ['भौतिकी', 'फिजिक्स'], chemistry: ['रसायन', 'केमिस्ट्री'], commerce: ['वाणिज्य', 'कॉमर्स'],
  teacher: ['शिक्षक', 'टीचर'], shikshak: ['शिक्षक'], student: ['छात्र', 'विद्यार्थी'], vidyarthi: ['विद्यार्थी'], question: ['प्रश्न'], prashn: ['प्रश्न'],
  paper: ['पेपर', 'प्रश्नपत्र'], syllabus: ['पाठ्यक्रम', 'सिलेबस'], notes: ['नोट्स'], lab: ['लैब', 'प्रयोगशाला'], language: ['भाषा'], bhasha: ['भाषा'],
  exam: ['परीक्षा'], pariksha: ['परीक्षा'], answer: ['उत्तर'], uttar: ['उत्तर'], banao: ['बना'], bana: ['बना'], banana: ['बना'],
  likho: ['लिख'], likh: ['लिख'], likhna: ['लिख'], dikhao: ['दिख'], dikha: ['दिख'], karo: ['कर'], karna: ['कर'],
  yaad: ['याद'], rakho: ['रख'], short: ['संक्षिप्त'], sankshep: ['संक्षेप', 'संक्षिप्त'], vistar: ['विस्तार'], detailed: ['विस्तार', 'विस्तृत'],
  user: ['उपयोगकर्ता'], developer: ['डेवलपर'], memory: ['स्मृति', 'मेमोरी'], voice: ['आवाज'], app: ['ऐप'], file: ['फाइल'], marks: ['अंक'], ank: ['अंक'],
};
const ALIAS = new Map(Object.entries(ALIAS_SRC).map(([k, v]) => [k, v.map((d) => stem(normalize(d)))]));

/** Raw normalised word tokens (no stemming, no stopword removal). */
export function words(text) { return normalize(text).match(WORD) || []; }

/** Tokens for indexing/querying: stopwords dropped, stemmed, Roman aliases expanded. */
export function tokenize(text) {
  const out = [];
  for (const w of words(text)) {
    if (STOP.has(w) || w.length < 2 && !DEVA.test(w) && !/\d/.test(w)) continue;
    const s = stem(w);
    out.push(s);
    const al = ALIAS.get(w) || ALIAS.get(s);
    if (al) out.push(...al);
  }
  return out;
}

export function tokenSet(text) { return new Set(tokenize(text)); }

export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
}

const cache = new WeakMap();
function docTokens(r) {
  let t = cache.get(r);
  if (!t) { t = tokenize(`${r.text} ${(r.tags || []).join(' ')}`); cache.set(r, t); }
  return t;
}

/**
 * BM25 search with recency + weight boost.
 * @param {object[]} records
 * @param {string} query
 * @param {{k?:number, kind?:string|string[], tags?:string|string[], now?:number, minScore?:number}} [o]
 * @returns {{id:string,text:string,kind:string,score:number,meta:object,tags:string[]}[]}
 */
export function search(records, query, o = {}) {
  const { k = 6, kind, tags, now = Date.now(), minScore = 0 } = o;
  const qt = [...new Set(tokenize(query))];
  if (!qt.length) return [];
  const kinds = kind ? [].concat(kind) : null;
  const need = tags ? [].concat(tags).map((t) => String(t).toLowerCase()) : null;
  const cand = records.filter((r) => (!kinds || kinds.includes(r.kind)) &&
    (!need || need.every((t) => (r.tags || []).some((x) => String(x).toLowerCase() === t))));
  if (!cand.length) return [];
  const docs = cand.map(docTokens);
  const N = cand.length;
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const df = new Map();
  for (const q of qt) df.set(q, 0);
  const tfs = docs.map((d) => {
    const m = new Map();
    for (const t of d) m.set(t, (m.get(t) || 0) + 1);
    for (const q of qt) if (m.has(q)) df.set(q, df.get(q) + 1);
    return m;
  });
  const k1 = 1.5, b = 0.75;
  const scored = [];
  cand.forEach((r, i) => {
    let s = 0;
    for (const q of qt) {
      const f = tfs[i].get(q);
      if (!f) continue;
      const n = df.get(q);
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * docs[i].length / avgdl));
    }
    if (s <= 0) return;
    const ageDays = Math.max(0, (now - (r.updated || r.created || now)) / 86400000);
    const rec = Math.pow(0.5, ageDays / 30);
    const w = Math.min(5, Math.max(0.1, r.weight ?? 1));
    s *= (1 + 0.3 * rec) * (0.6 + 0.4 * Math.log2(1 + w));
    if (s > minScore) scored.push({ id: r.id, text: r.text, kind: r.kind, score: +s.toFixed(4), meta: r.meta || {}, tags: r.tags || [] });
  });
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, k);
}
