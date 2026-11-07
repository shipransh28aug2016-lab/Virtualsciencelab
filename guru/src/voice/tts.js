// Text-to-speech over speechSynthesis: voice choice, markdown stripping, numerals, chunking.
import { numerals } from '../i18n/translit.js';
import { scriptStats } from '../i18n/detect.js';

/**
 * Strip markdown/HTML/emoji so the engine reads prose only.
 * @param {string} text
 * @param {'hi'|'en'} [lang]
 */
export function stripMarkdown(text, lang = 'en') {
  let s = String(text ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(/```[\s\S]*?```/g, '\n');
  s = s.replace(/~~~[\s\S]*?~~~/g, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  s = s.replace(/(?:https?:\/\/|www\.)\S+/gi, lang === 'hi' ? 'लिंक' : 'link');
  s = s.split('\n').map((line) => {
    if (/^\s*\|?[\s:\-|]+\|?\s*$/.test(line) && line.includes('-') && line.includes('|')) return '';
    if (/^\s*\|.*\|\s*$/.test(line)) return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).filter(Boolean).join(', ');
    return line.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*>+\s?/, '').replace(/^\s*[-*+•]\s+/, '').replace(/^\s*\d+[.)]\s+/, '').replace(/^\s*([-*_])\1{2,}\s*$/, '');
  }).join('\n');
  s = s.replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(\*|_)(?=\S)(.*?\S)\1/g, '$2').replace(/~~(.*?)~~/g, '$1');
  s = s.replace(/`([^`]*)`/g, '$1');
  s = s.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '');
  s = s.replace(/[*#_~`^|<>]/g, ' ');
  // line breaks become sentence pauses
  s = s.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/[.!?।॥:;,]$/.test(l) ? l : l + '.')).join(' ');
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Make numbers, currency and symbols engine-friendly. Devanagari digits become Latin digits, which both
 * hi-IN and en-IN voices read correctly as numbers.
 * @param {string} text
 * @param {'hi'|'en'} [lang]
 */
export function normalizeForSpeech(text, lang = 'en') {
  let s = numerals(String(text ?? ''), 'latn');
  const hi = lang === 'hi';
  s = s.replace(/(?:₹|Rs\.?|INR)\s?(\d[\d,]*(?:\.\d+)?)/gi, (_, n) => `${n.replace(/,/g, '')} ${hi ? 'रुपये' : 'rupees'}`);
  s = s.replace(/(\d)\s?%/g, (_, d) => `${d} ${hi ? 'प्रतिशत' : 'percent'}`);
  s = s.replace(/(\d),(?=\d{2,3}\b)/g, '$1');
  s = s.replace(/\s&\s/g, hi ? ' और ' : ' and ');
  s = s.replace(/(\d)\s?[-–]\s?(\d)/g, hi ? '$1 से $2' : '$1 to $2');
  s = s.replace(/\b(\d+)\s?x\s?(\d+)\b/gi, hi ? '$1 गुणा $2' : '$1 by $2');
  s = s.replace(/\s?=\s?/g, hi ? ' बराबर ' : ' equals ').replace(/\s\+\s/g, hi ? ' जमा ' : ' plus ');
  return s;
}

/** Dominant speech language of a piece of text. */
export function chunkLang(text) {
  const { devaRatio, total } = scriptStats(text);
  return total && devaRatio >= 0.3 ? 'hi-IN' : 'en-IN';
}

/**
 * Split long text at sentence boundaries (then commas/spaces) into engine-sized chunks.
 * @param {string} text already cleaned
 * @param {number} [maxLen]
 * @returns {string[]}
 */
export function chunkText(text, maxLen = 170) {
  const s = String(text ?? '').trim();
  if (!s) return [];
  const sentences = s.split(/(?<=[.!?।॥;:])\s+/);
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let sent of sentences) {
    while (sent.length > maxLen) {
      let cut = sent.lastIndexOf(', ', maxLen);
      if (cut < maxLen * 0.4) cut = sent.lastIndexOf(' ', maxLen);
      if (cut < 1) cut = maxLen;
      const head = sent.slice(0, cut + 1).trim();
      sent = sent.slice(cut + 1).trim();
      if (cur && (cur + ' ' + head).length > maxLen) push();
      cur = cur ? cur + ' ' + head : head;
      push();
    }
    if (cur && (cur + ' ' + sent).length > maxLen) push();
    cur = cur ? cur + ' ' + sent : sent;
  }
  push();
  return out;
}

/**
 * Pick the best available voice for a BCP-47 language.
 * @param {Array<{name:string,lang:string,localService?:boolean,default?:boolean}>} voices
 * @param {string} lang 'hi-IN' | 'en-IN' | ...
 * @param {string} [preferName] user-chosen voice name
 */
export function pickVoice(voices, lang, preferName) {
  const list = Array.from(voices || []);
  if (!list.length) return null;
  if (preferName) { const p = list.find((v) => v.name === preferName && v.lang.replace('_', '-').toLowerCase().startsWith(lang.slice(0, 2).toLowerCase())); if (p) return p; }
  const want = lang.toLowerCase();
  const base = want.slice(0, 2);
  const score = (v) => {
    const vl = String(v.lang || '').replace('_', '-').toLowerCase();
    let sc = 0;
    if (vl === want) sc += 100;
    else if (vl.startsWith(base + '-') || vl === base) sc += 60 - (base === 'en' ? 0 : 0);
    else return -1;
    if (base === 'en' && vl === 'en-gb') sc += 5; // closest to Indian English when en-IN is absent
    if (/google/i.test(v.name)) sc += 12;
    if (/neural|natural|online|enhanced|premium/i.test(v.name)) sc += 15;
    if (/lekha|kalpana|hemant|veena|rishi|neerja|prabhat|swara|madhur|heera/i.test(v.name)) sc += 6;
    if (v.localService) sc += 3;
    if (v.default) sc += 1;
    return sc;
  };
  let best = null; let bs = -1;
  for (const v of list) { const sc = score(v); if (sc > bs) { best = v; bs = sc; } }
  return best;
}

/**
 * Create a TTS controller (injectable synth/Utterance for tests).
 * @param {{synth?:any, Utterance?:any, getRate?:()=>number, getVoiceName?:(lang:string)=>string|undefined}} [opts]
 */
export function createTTS(opts = {}) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  const synth = opts.synth || g.speechSynthesis || null;
  const U = opts.Utterance || g.SpeechSynthesisUtterance || null;
  let token = 0;

  const supported = () => !!(synth && U);

  function loadVoices(timeout = 1200) {
    return new Promise((resolve) => {
      let v = [];
      try { v = synth.getVoices() || []; } catch (_) { /* ignore */ }
      if (v.length || !synth.addEventListener) return resolve(v);
      const done = () => { try { synth.removeEventListener('voiceschanged', done); } catch (_) { /* ignore */ } clearTimeout(t); try { resolve(synth.getVoices() || []); } catch (_) { resolve([]); } };
      const t = setTimeout(done, timeout);
      synth.addEventListener('voiceschanged', done);
    });
  }

  function cancel() { token++; try { synth && synth.cancel(); } catch (_) { /* ignore */ } }

  /**
   * Speak text, chunked, one utterance at a time.
   * @param {string} text
   * @param {{lang?:string, rate?:number, pitch?:number, volume?:number, voiceName?:string, markdown?:boolean}} [o]
   * @returns {Promise<{chunks:number, cancelled:boolean}>}
   */
  async function speak(text, o = {}) {
    if (!supported()) return { chunks: 0, cancelled: false, unsupported: true };
    cancel();
    const my = token;
    const forced = o.lang && o.lang !== 'auto' ? o.lang : null;
    const pre = forced ? forced.slice(0, 2) : (chunkLang(text) === 'hi-IN' ? 'hi' : 'en');
    const cleaned = normalizeForSpeech(o.markdown === false ? String(text) : stripMarkdown(text, pre), pre);
    const chunks = chunkText(cleaned);
    const voices = await loadVoices();
    if (my !== token) return { chunks: 0, cancelled: true };
    let spoken = 0;
    for (const c of chunks) {
      if (my !== token) return { chunks: spoken, cancelled: true };
      const lang = forced || chunkLang(c);
      const u = new U(c);
      u.lang = lang;
      const v = pickVoice(voices, lang, o.voiceName || (opts.getVoiceName && opts.getVoiceName(lang)));
      if (v) { u.voice = v; u.lang = v.lang || lang; }
      u.rate = o.rate ?? (opts.getRate ? opts.getRate() : 1) ?? 1;
      u.pitch = o.pitch ?? 1;
      u.volume = o.volume ?? 1;
      const result = await new Promise((resolve, reject) => {
        u.onend = () => resolve('end');
        u.onerror = (e) => { const er = e && e.error; if (er === 'interrupted' || er === 'canceled') resolve('cancel'); else reject(new Error('tts-error:' + (er || 'unknown'))); };
        try { synth.speak(u); } catch (err) { reject(err); }
      });
      if (result === 'cancel') return { chunks: spoken, cancelled: true };
      spoken++;
    }
    return { chunks: spoken, cancelled: false };
  }

  return { supported, speak, cancel, loadVoices, pause: () => synth && synth.pause(), resume: () => synth && synth.resume(), speaking: () => !!(synth && synth.speaking) };
}
