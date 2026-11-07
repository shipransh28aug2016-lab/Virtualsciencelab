// Shared UI context: graceful access to kernel services, i18n with built-in fallback, config.
import { STRINGS } from './strings.js';

export const ctx = { k: null };

const mem = new Map();
function ls() { try { return globalThis.localStorage; } catch { return null; } }

/** Service lookup that never throws. */
export function svc(name) {
  try { return ctx.k && ctx.k.services && ctx.k.services.has(name) ? ctx.k.services.get(name) : null; } catch { return null; }
}

/** Persistent UI config: kernel config when present, else localStorage. */
export const cfg = {
  get(key, def) {
    try { if (ctx.k && ctx.k.config) { const v = ctx.k.config.get(key, undefined); if (v !== undefined) return v; } } catch { /* ignore */ }
    try { const s = ls(); const raw = s ? s.getItem('guru.cfg.' + key) : mem.get(key); if (raw != null) return JSON.parse(raw); } catch { /* ignore */ }
    return def;
  },
  set(key, val) {
    try { if (ctx.k && ctx.k.config) ctx.k.config.set(key, val); } catch { /* ignore */ }
    try { const s = ls(); const raw = JSON.stringify(val); if (s) s.setItem('guru.cfg.' + key, raw); else mem.set(key, raw); } catch { /* ignore */ }
  },
};

export function uiLang() {
  const i = svc('i18n');
  try { const l = i && i.lang(); if (l) return l; } catch { /* ignore */ }
  return cfg.get('ui.lang', 'en');
}
const baseLang = () => (uiLang() === 'hi' ? 'hi' : 'en');

/** Translate: i18n service first, then built-in strings, then the key. */
export function tr(key, vars) {
  const i = svc('i18n');
  if (i) {
    try { const v = i.t(key, vars); if (v && v !== key) return v; } catch { /* ignore */ }
  }
  let s = (STRINGS[baseLang()] && STRINGS[baseLang()][key]) || STRINGS.en[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, n) => (vars[n] ?? ''));
  return s;
}

/** Apply data-i18n (text) and data-i18n-attr ("attr:key,attr:key") under root. */
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = tr(el.getAttribute('data-i18n'));
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(',')) {
      const [attr, key] = pair.split(':').map((x) => x.trim());
      if (attr && key) el.setAttribute(attr, tr(key));
    }
  }
  document.documentElement.lang = baseLang();
}

export function setUiLang(l) {
  const i = svc('i18n');
  try { if (i) i.setLang(l); } catch { /* ignore */ }
  cfg.set('ui.lang', l);
}

export function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
  try { const s = ls(); if (s) { if (t === 'light' || t === 'dark') s.setItem('guru.ui.theme', t); else s.removeItem('guru.ui.theme'); } } catch { /* ignore */ }
}
