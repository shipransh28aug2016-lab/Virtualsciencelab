// Speech-to-text over Web Speech API with hi-IN / en-IN / auto (retry on the other language when confidence is low).
import { detect } from '../i18n/detect.js';

/** @param {any} [g] global object (injectable for tests) */
export function getRecognition(g = typeof globalThis !== 'undefined' ? globalThis : {}) {
  return g.SpeechRecognition || g.webkitSpeechRecognition || null;
}

/** @param {any} [g] */
export function sttSupported(g) { return !!getRecognition(g); }

/** Is this final result unreliable enough to warrant trying the other language? Confidence 0 means "unknown" in Chrome. */
export function shouldRetry(res, threshold = 0.6) {
  if (!res || !String(res.text || '').trim()) return true;
  return typeof res.confidence === 'number' && res.confidence > 0 && res.confidence < threshold;
}

/**
 * Choose the best of several candidate transcripts {text, lang, confidence}.
 * Prefers higher confidence (unknown counts as 0.5); ties favour text whose script matches its recognition language.
 */
export function pickBest(cands) {
  const list = (cands || []).filter((c) => c && String(c.text || '').trim());
  if (!list.length) return null;
  const score = (c) => {
    const conf = c.confidence > 0 ? c.confidence : 0.5;
    const d = detect(c.text);
    const match = (c.lang || '').startsWith('hi') ? d !== 'en' : d === 'en';
    return conf + (match ? 0.05 : 0);
  };
  return list.reduce((a, b) => (score(b) > score(a) ? b : a));
}

const other = (l) => (l === 'hi-IN' ? 'en-IN' : 'hi-IN');
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);

/**
 * Start listening.
 * @param {{lang?:'hi-IN'|'en-IN'|'auto', continuous?:boolean, preferred?:string, confidenceThreshold?:number,
 *  onInterim?:(t:string)=>void, onFinal?:(t:string, meta:{lang:string,confidence:number,retried:boolean})=>void,
 *  onError?:(e:{code:string})=>void, onEnd?:()=>void, onRetry?:(e:{from:string,to:string})=>void, SR?:any}} [o]
 * @returns {{stop:()=>void, readonly active:boolean}}
 */
export function listen(o = {}) {
  const SR = o.SR || getRecognition();
  const auto = (o.lang || 'auto') === 'auto';
  const thr = o.confidenceThreshold ?? 0.6;
  let cur = auto ? (o.preferred === 'en-IN' ? 'en-IN' : 'hi-IN') : o.lang;
  let stopped = false;
  let rec = null;
  let next = null; // language to switch to on end
  let held = []; // candidates of the current utterance
  let delivered = false;

  const noop = () => {};
  const onInterim = o.onInterim || noop;
  const onFinal = o.onFinal || noop;
  const onError = o.onError || noop;

  const handle = {
    stop() { stopped = true; next = null; flush(); try { rec && rec.stop(); } catch (_) { /* already stopped */ } },
    get active() { return !stopped; },
  };
  if (!SR) { Promise.resolve().then(() => { stopped = true; onError({ code: 'unsupported' }); (o.onEnd || noop)(); }); return handle; }

  function flush() {
    if (!held.length) return;
    const best = pickBest(held);
    const retried = held.length > 1;
    held = [];
    if (best) { delivered = true; onFinal(best.text.trim(), { lang: best.lang, confidence: best.confidence, retried }); }
  }

  function start() {
    rec = new SR();
    rec.lang = cur;
    rec.interimResults = true;
    rec.continuous = !!o.continuous;
    rec.maxAlternatives = 1;
    const thisLang = cur;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const alt = r[0] || {};
        const text = String(alt.transcript || '');
        if (!r.isFinal) { interim += text; continue; }
        const cand = { text, lang: thisLang, confidence: alt.confidence || 0 };
        if (auto && held.length === 0 && shouldRetry(cand, thr) && !stopped) {
          held.push(cand);
          next = other(thisLang);
          (o.onRetry || noop)({ from: thisLang, to: next });
          try { rec.stop(); } catch (_) { /* ignore */ }
        } else {
          held.push(cand);
          flush();
          if (auto && cand.confidence > 0) cur = thisLang;
        }
      }
      if (interim) onInterim(interim);
    };
    rec.onerror = (e) => {
      const code = (e && e.error) || 'error';
      if (code === 'language-not-supported' && auto) { next = other(thisLang); return; }
      if (FATAL.has(code)) stopped = true;
      if (code !== 'aborted') onError({ code });
    };
    rec.onend = () => {
      if (next && !stopped) { cur = next; next = null; start(); return; }
      flush();
      if (o.continuous && !stopped) { try { start(); return; } catch (_) { /* fall through */ } }
      stopped = true;
      void delivered;
      (o.onEnd || noop)();
    };
    try { rec.start(); } catch (err) { stopped = true; onError({ code: 'start-failed', message: String(err && err.message || err) }); (o.onEnd || noop)(); }
  }
  start();
  return handle;
}
