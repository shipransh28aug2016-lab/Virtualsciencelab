// i18n module: registers service 'i18n'. DOM-free; apply(root) duck-types any DOM-like root.
import strings, { KEYS } from './strings.js';
import { detect } from './detect.js';
import { translit, numerals } from './translit.js';

export const fonts = {
  deva: '"Noto Sans Devanagari","Noto Serif Devanagari","Mukta","Mangal","Nirmala UI","Kohinoor Devanagari","Devanagari Sangam MN","Lohit Devanagari",sans-serif',
  latin: 'system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Helvetica Neue",Arial',
  get stack() { return `${this.latin},${this.deva}`; },
  /** CSS using only local() sources: no network needed. */
  css: ':root{--font-ui:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans","Noto Sans Devanagari","Mukta","Mangal","Nirmala UI","Kohinoor Devanagari",sans-serif}' +
    ':lang(hi){font-family:"Noto Sans Devanagari","Mukta","Mangal","Nirmala UI","Kohinoor Devanagari","Lohit Devanagari",system-ui,sans-serif;line-height:1.6}' +
    '@font-face{font-family:"Noto Sans Devanagari";src:local("Noto Sans Devanagari"),local("NotoSansDevanagari-Regular"),local("Mukta"),local("Mangal"),local("Nirmala UI");unicode-range:U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF}',
};

const LANGS = ['en', 'hi', 'hinglish'];

/**
 * Create an i18n instance.
 * @param {{get:Function,set:Function}} [config] persisted config (optional)
 * @param {{emit:Function}} [bus]
 */
export function createI18n(config, bus) {
  let cur = 'en';
  let numMode = 'latn';
  if (config) {
    const saved = config.get('lang', 'en');
    if (LANGS.includes(saved)) cur = saved;
    numMode = config.get('numerals', 'latn') === 'deva' ? 'deva' : 'latn';
  }

  const api = {
    /** Translate a key; {var} placeholders are filled from vars. Missing keys return the key itself. */
    t(key, vars, langOverride) {
      const l = langOverride && LANGS.includes(langOverride) ? langOverride : cur;
      let s = strings[l][key];
      if (s === undefined) s = strings.en[key];
      if (s === undefined) return key;
      if (vars) {
        s = s.replace(/\{(\w+)\}/g, (m, n) => {
          if (!(n in vars)) return m;
          const v = String(vars[n]);
          return l === 'hi' && numMode === 'deva' ? numerals(v, 'deva') : v;
        });
      }
      return s;
    },
    has: (key) => key in strings.en,
    keys: () => KEYS.slice(),
    lang: () => cur,
    setLang(l) {
      if (!LANGS.includes(l)) return cur;
      const changed = l !== cur;
      cur = l;
      if (config) config.set('lang', l);
      if (changed && bus) bus.emit('lang:change', { lang: l });
      return cur;
    },
    setNumerals(mode) { numMode = mode === 'deva' ? 'deva' : 'latn'; if (config) config.set('numerals', numMode); return numMode; },
    detect,
    translit,
    numerals,
    fonts,
    /** HTML lang attribute value for the current language. */
    htmlLang: () => (cur === 'hi' ? 'hi' : cur === 'hinglish' ? 'hi-Latn' : 'en'),
    /**
     * Fill [data-i18n] (textContent) and [data-i18n-placeholder|title|aria-label|alt] attributes under root.
     * Optional data-i18n-vars='{"n":3}' supplies placeholders.
     * @param {any} root element/document (anything with querySelectorAll)
     * @returns {number} elements updated
     */
    apply(root) {
      if (!root || typeof root.querySelectorAll !== 'function') return 0;
      let n = 0;
      const vars = (el) => { try { const v = el.getAttribute('data-i18n-vars'); return v ? JSON.parse(v) : undefined; } catch (_) { return undefined; } };
      for (const el of root.querySelectorAll('[data-i18n]')) { el.textContent = api.t(el.getAttribute('data-i18n'), vars(el)); n++; }
      for (const attr of ['placeholder', 'title', 'aria-label', 'alt']) {
        for (const el of root.querySelectorAll(`[data-i18n-${attr}]`)) { el.setAttribute(attr, api.t(el.getAttribute(`data-i18n-${attr}`), vars(el))); n++; }
      }
      const de = root.documentElement || (root.ownerDocument && root.ownerDocument.documentElement);
      if (de && typeof de.setAttribute === 'function') de.setAttribute('lang', api.htmlLang());
      return n;
    },
  };
  return api;
}

export async function register(k) {
  const svc = createI18n(k.config, k.bus);
  k.services.set('i18n', svc);
  return svc;
}

export { strings, KEYS, detect, translit, numerals };
