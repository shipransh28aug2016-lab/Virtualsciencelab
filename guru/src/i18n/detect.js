// Language detection: script ratio + romanised-Hindi (Hinglish) word list. DOM-free.

const DEVA = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;

/** Romanised Hindi words that are (almost) never English. Ambiguous ones (hi, me, to, do, par, the) are excluded. */
export const HINGLISH_WORDS = new Set((
  'hai hain tha thi hoga hogi honge hota hoti hote ho raha rahi rahe rahega kya kyun kyon kaise kaisa kaisi kaun kab kahan kidhar kitna kitne kitni ' +
  'nahi nahin nhi mat na haan ji accha achha acha theek thik bahut bohot bahot thoda zyada jyada kam bilkul abhi phir lekin magar aur ya toh ' +
  'mujhe mujhko mera meri mere main mai hum humein hamara hamari tum tumhe tumhara aap aapka aapki aapke apna apni apne woh wo ye yeh yahan wahan ' +
  'isko usko inko unko isme usme ismein usmein iska uska iski uski ka ki ke ko se mein ' +
  'karo karna kar kare karen karein kijiye kijie kariye karenge karunga karungi karke kiya kiye ' +
  'batao bata batana bataiye banao bana banana banaiye dikhao dikhana dikhaiye kholo kholna khol bhejo bhejna bhej likho likhna padho padhna padhao ' +
  'sunao suno sunna bolo bolna boliye bolo samjhao samjhana samajh samjha samajhna chalo chalao chaliye ruko ruk rukna band shuru khatam ' +
  'dena do dijiye dijie lena lo lijiye chahiye chahta chahti sakta sakti sakte paya paye ' +
  'bhi sab sabhi kuch koi kisi sirf bas wala wali wale waala ' +
  'aaj kal parso subah shaam raat ghar kaam padhai kitab sawal sawaal jawab jawaab pariksha vidyarthi shikshak adhyapak kaksha ' +
  'namaste namaskar dhanyavaad dhanyavad shukriya kripya maaf ' +
  'ek teen chaar paanch panch chhe saat aath nau das sau hazaar lakh ' +
  'naya nayi naye purana purani pehle pehla baad niche upar andar bahar ' +
  'guruji mujhse tumse usse isse humse aapse hamare tumhare unka unki unke inka inki inke ' +
  'kyunki isliye lekin agar warna jab tab jaise waise toh'
).split(/\s+/).filter(Boolean));

/**
 * Count script letters.
 * @param {string} text
 * @returns {{deva:number, latin:number, total:number, devaRatio:number}}
 */
export function scriptStats(text) {
  const s = String(text || '');
  const deva = (s.match(DEVA) || []).length;
  const latin = (s.match(LATIN) || []).length;
  const total = deva + latin;
  return { deva, latin, total, devaRatio: total ? deva / total : 0 };
}

/**
 * Count tokens that look like romanised Hindi.
 * @param {string} text
 * @returns {{hits:number, tokens:number}}
 */
export function hinglishHits(text) {
  const toks = String(text || '').toLowerCase().match(/[a-z]+/g) || [];
  let hits = 0;
  for (const t of toks) if (HINGLISH_WORDS.has(t)) hits++;
  return { hits, tokens: toks.length };
}

/**
 * Detect language of a text.
 * 'hi' = mostly Devanagari; 'en' = English; 'hinglish' = romanised Hindi or Hindi/English mix.
 * @param {string} text
 * @returns {'hi'|'en'|'hinglish'}
 */
export function detect(text) {
  const { deva, latin, devaRatio } = scriptStats(text);
  if (deva + latin === 0) return 'en';
  if (devaRatio >= 0.8) return 'hi';
  if (devaRatio >= 0.15 && deva >= 2) return 'hinglish';
  const { hits, tokens } = hinglishHits(text);
  if (hits >= 1 && tokens > 0 && hits / tokens >= 0.2) return 'hinglish';
  if (hits >= 2 && hits / tokens >= 0.12) return 'hinglish';
  return 'en';
}

/**
 * Map a detected language to a BCP-47 speech tag.
 * @param {'hi'|'en'|'hinglish'} l
 */
export function speechTag(l) { return l === 'en' ? 'en-IN' : 'hi-IN'; }

export default detect;
