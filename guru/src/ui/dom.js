// Tiny DOM helpers. Browser-only at call time; importable under Node.
const SVG = 'http://www.w3.org/2000/svg';

/** Create an element. props: class, text, on<Event> handlers, attributes/properties. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'open') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const PATHS = {
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  clip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.500-8.500a3.300 3.300 0 0 1 4.700 4.700L9.700 17.200a1.700 1.700 0 0 1-2.400-2.400L14.500 7.600',
  send: 'M4 12L20 4l-6 16-2.500-6.500z',
  sliders: 'M4 7h7M15 7h5M4 17h3M11 17h9M13 5v4M9 15v4',
  plus: 'M12 5v14M5 12h14',
  up: 'M7 11v9H4v-9zM7 11l4-8c1.500 0 2.500 1 2.200 2.500L12.600 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7',
  down: 'M7 11v9H4v-9zM7 11l4-8c1.500 0 2.500 1 2.200 2.500L12.600 9H19a2 2 0 0 1 2 2.300l-1.200 7A2 2 0 0 1 17.800 20H7',
  download: 'M12 4v11m-4-4l4 4 4-4M5 20h14',
  cloud: 'M7 18a4 4 0 0 1-.5-7.970A5.500 5.500 0 0 1 17 8.500 4.500 4.500 0 0 1 17.500 18z',
  stop: 'M7 7h10v10H7z',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  speaker: 'M4 10v4h4l5 4V6l-5 4zM16.500 9a4 4 0 0 1 0 6',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  brain: 'M12 3a4 4 0 0 0-4 4 3 3 0 0 0-2 5 3 3 0 0 0 2 5 4 4 0 0 0 4 4zM12 3a4 4 0 0 1 4 4 3 3 0 0 1 2 5 3 3 0 0 1-2 5 4 4 0 0 1-4 4z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
};
/** Inline SVG icon (stroke = currentColor). */
export function icon(name) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic ic-' + name);
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', PATHS[name] || '');
  s.append(p);
  return s;
}
export function hydrateIcons(root) {
  for (const el of $$('[data-icon]', root)) {
    if (!el.querySelector('svg')) el.prepend(icon(el.dataset.icon));
  }
}

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename || 'download' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
