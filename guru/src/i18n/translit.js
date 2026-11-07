// Practical Latin <-> Devanagari transliteration and numeral conversion. DOM-free.
// Latin->Devanagari is a phonetic Hinglish scheme ("aa" long a, "ee" long i, "oo" long u, capital T/D/N retroflex mid-word).

const DEVA_DIGITS = '०१२३४५६७८९';

/**
 * Convert digits between Latin (0-9) and Devanagari (०-९).
 * @param {string} text
 * @param {'deva'|'latn'} to
 */
export function numerals(text, to = 'latn') {
  const s = String(text ?? '');
  if (to === 'deva') return s.replace(/[0-9]/g, (d) => DEVA_DIGITS[+d]);
  return s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

// ---------------- Latin -> Devanagari ----------------
const CONS = [
  ['chh', 'छ'], ['ksh', 'क्ष'], ['gya', null], ['kh', 'ख'], ['gh', 'घ'], ['ch', 'च'], ['jh', 'झ'],
  ['Th', 'ठ'], ['Dh', 'ढ'], ['th', 'थ'], ['dh', 'ध'], ['ph', 'फ'], ['bh', 'भ'], ['sh', 'श'],
  ['T', 'ट'], ['D', 'ड'], ['N', 'ण'],
  ['k', 'क'], ['g', 'ग'], ['c', 'क'], ['j', 'ज'], ['t', 'त'], ['d', 'द'], ['n', 'न'], ['p', 'प'], ['b', 'ब'],
  ['m', 'म'], ['y', 'य'], ['r', 'र'], ['l', 'ल'], ['v', 'व'], ['w', 'व'], ['s', 'स'], ['h', 'ह'],
  ['f', 'फ़'], ['z', 'ज़'], ['q', 'क़'], ['x', 'क्स'],
];
const VOWELS = [
  ['aa', 'आ', 'ा'], ['ai', 'ऐ', 'ै'], ['au', 'औ', 'ौ'], ['ee', 'ई', 'ी'], ['ii', 'ई', 'ी'],
  ['oo', 'ऊ', 'ू'], ['uu', 'ऊ', 'ू'], ['ou', 'औ', 'ौ'], ['a', 'अ', ''], ['i', 'इ', 'ि'],
  ['u', 'उ', 'ु'], ['e', 'ए', 'े'], ['o', 'ओ', 'ो'],
];
const VIRAMA = '्';
const ANUSVARA_BEFORE = new Set(['k', 'kh', 'g', 'gh', 'ch', 'chh', 'j', 'jh', 't', 'th', 'd', 'dh', 'p', 'ph', 'b', 'bh', 's', 'sh', 'f', 'T', 'Th', 'D', 'Dh', 'c', 'z']);

/** Small lexicon where schwa/length rules cannot be inferred. Keys lowercase. */
export const LEXICON = {
  hai: 'है', hain: 'हैं', nahi: 'नहीं', nahin: 'नहीं', nhi: 'नहीं', kya: 'क्या', kyun: 'क्यों', kyon: 'क्यों',
  mein: 'में', main: 'मैं', mai: 'मैं', mera: 'मेरा', meri: 'मेरी', mere: 'मेरे', aap: 'आप', aapka: 'आपका', aapki: 'आपकी',
  hum: 'हम', tum: 'तुम', ye: 'ये', yeh: 'यह', woh: 'वह', wo: 'वो', ka: 'का', ki: 'की', ke: 'के', ko: 'को', se: 'से',
  aur: 'और', bhi: 'भी', hi: 'ही', toh: 'तो', par: 'पर', kitab: 'किताब', jawab: 'जवाब', sawal: 'सवाल', hindi: 'हिंदी',
  angrezi: 'अंग्रेज़ी', namaste: 'नमस्ते', dhanyavaad: 'धन्यवाद', shukriya: 'शुक्रिया', guru: 'गुरु', kaam: 'काम',
  kaise: 'कैसे', kaun: 'कौन', kab: 'कब', kahan: 'कहाँ', yahan: 'यहाँ', wahan: 'वहाँ', accha: 'अच्छा', achha: 'अच्छा',
  theek: 'ठीक', thik: 'ठीक', bahut: 'बहुत', abhi: 'अभी', phir: 'फिर', lekin: 'लेकिन', sab: 'सब', kuch: 'कुछ',
  mujhe: 'मुझे', tumhe: 'तुम्हें', karo: 'करो', kijiye: 'कीजिए', batao: 'बताओ', banao: 'बनाओ', kholo: 'खोलो',
  bolo: 'बोलो', sunao: 'सुनाओ', padho: 'पढ़ो', likho: 'लिखो', ruko: 'रुको', chalo: 'चलो', ek: 'एक', do: 'दो',
  teen: 'तीन', chaar: 'चार', paanch: 'पाँच', physics: 'फिजिक्स', chemistry: 'केमिस्ट्री', class: 'क्लास',
  paper: 'पेपर', chat: 'चैट', settings: 'सेटिंग', setting: 'सेटिंग', english: 'इंग्लिश', pdf: 'पीडीएफ',
  file: 'फ़ाइल', upload: 'अपलोड', stop: 'स्टॉप', kal: 'कल', aaj: 'आज', ghar: 'घर', naya: 'नया', nayi: 'नई',
};

function matchTok(list, s, i) {
  for (const row of list) if (s.startsWith(row[0], i)) return row;
  return null;
}

function wordToDeva(word) {
  const lw = word.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LEXICON, lw)) return LEXICON[lw];
  // First letter is never retroflex-marked; later capitals T/D/N (and Th/Dh) are.
  const src = word.slice(0, 1).toLowerCase() + word.slice(1);
  const low = src.toLowerCase();
  const toks = [];
  let i = 0;
  while (i < src.length) {
    if (low.startsWith('gy', i) && /[aeiou]/.test(low[i + 2] || '')) { toks.push({ t: 'c', k: 'gy', d: 'ज्ञ' }); i += 2; continue; }
    const v = matchTok(VOWELS, low, i);
    if (v) { toks.push({ t: 'v', k: v[0] }); i += v[0].length; continue; }
    const c = matchTok(CONS, src, i) || matchTok(CONS, low, i);
    if (c && c[1]) { toks.push({ t: 'c', k: c[0].toLowerCase() === c[0] ? c[0] : c[0], d: c[1] }); i += c[0].length; continue; }
    toks.push({ t: 'o', d: src[i] }); i++;
  }
  let out = '';
  let pending = false; // last emitted consonant still lacks a vowel sign
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    const prev = toks[n - 1];
    const next = toks[n + 1];
    const last = n === toks.length - 1;
    if (tk.t === 'c') {
      if ((tk.k === 'n' || tk.k === 'm') && prev && prev.t === 'v' && next && next.t === 'c' && ANUSVARA_BEFORE.has(next.k)) {
        out += 'ं'; pending = false; continue;
      }
      if (pending) out += VIRAMA;
      out += tk.d; pending = true;
    } else if (tk.t === 'v') {
      let k = tk.k;
      if (last && pending && k === 'a') k = 'aa';
      if (last && pending && k === 'i' && toks.length > 2) k = 'ee';
      const row = VOWELS.find((r) => r[0] === k);
      out += pending ? row[2] : row[1];
      pending = false;
    } else { out += tk.d; pending = false; }
  }
  return out.normalize('NFC');
}

// ---------------- Devanagari -> Latin ----------------
const D_CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
  'क़': 'q', 'ख़': 'kh', 'ग़': 'gh', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y',
};
const D_INDEP = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e' };
const D_MATRA = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e' };

function devaWordToLatin(word) {
  const chars = [...word.normalize('NFD')];
  const units = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (D_CONS[ch] !== undefined) {
      let cons = D_CONS[ch];
      if (chars[i + 1] === '\u093C') { cons = D_CONS[(ch + '\u093C').normalize('NFC')] ?? cons; i++; }
      if (ch === 'ज' && chars[i + 1] === VIRAMA && chars[i + 2] === 'ञ') { cons = 'gy'; i += 2; }
      const u = { c: cons, v: null, inherent: true };
      const nx = chars[i + 1];
      if (nx === VIRAMA) { u.inherent = false; i++; }
      else if (D_MATRA[nx]) { u.v = D_MATRA[nx]; u.inherent = false; i++; }
      units.push(u);
    } else if (D_INDEP[ch]) units.push({ c: '', v: D_INDEP[ch], inherent: false });
    else if (ch === 'ं' || ch === 'ँ') units.push({ nasal: true });
    else if (ch === 'ः') units.push({ lit: 'h' });
    else if (ch === '\u093C') continue;
    else if (ch === '।' || ch === '॥') units.push({ lit: '.' });
    else units.push({ lit: ch });
  }
  const idx = [];
  units.forEach((u, n) => { if (u.c) idx.push(n); });
  // word-final inherent schwa is silent
  const lastCons = idx[idx.length - 1];
  const tail = lastCons === undefined ? [] : units.slice(lastCons + 1).filter((u) => u.lit === undefined && !u.nasal);
  if (lastCons !== undefined && tail.length === 0 && units[lastCons].inherent && idx.length > 1) units[lastCons].inherent = false;
  const hasVowel = (u) => u.v !== null || u.inherent;
  // medial schwa deletion (VC_CV), right to left
  for (let j = idx.length - 2; j >= 1; j--) {
    const u = units[idx[j]]; const p = units[idx[j - 1]]; const nx = units[idx[j + 1]];
    if (u.inherent && idx[j - 1] === idx[j] - 1 && idx[j + 1] === idx[j] + 1 && hasVowel(p) && hasVowel(nx)) u.inherent = false;
  }
  let out = '';
  for (let n = 0; n < units.length; n++) {
    const u = units[n];
    if (u.lit !== undefined) { out += u.lit; continue; }
    if (u.nasal) { const nxt = units[n + 1]; out += nxt && nxt.c && /^[pbm]/.test(nxt.c) ? 'm' : 'n'; continue; }
    out += u.c;
    if (u.v) out += (n === units.length - 1 && u.v === 'aa') ? 'a' : u.v;
    else if (u.inherent) out += 'a';
  }
  return out;
}

/**
 * Practical transliteration between scripts. Non-letters, digits and existing target-script text pass through.
 * @param {string} text
 * @param {'deva'|'latin'} to
 */
export function translit(text, to = 'deva') {
  const s = String(text ?? '');
  if (to === 'latin' || to === 'latn') {
    return s.replace(/[ऀ-ॿ]+/g, (w) => devaWordToLatin(w));
  }
  return s.replace(/[A-Za-z]+/g, (w) => wordToDeva(w));
}

export default translit;
