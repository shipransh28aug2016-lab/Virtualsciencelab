// Guru UI bootstrap. Boots the kernel (if present) and wires the UI to its bus and services.
// Every service is optional: missing pieces degrade to a working, honest UI.
import { h, icon, hydrateIcons, toast } from './ui/dom.js';
import { ctx, svc, tr, cfg, uiLang, setUiLang, applyI18n, applyTheme } from './ui/ctx.js';
import { addUser, beginTurn, clearChat } from './ui/chat.js';
import { initComposer } from './ui/composer.js';
import { openSettings, initDialogDismiss } from './ui/settings.js';
import { openPalette } from './ui/palette.js';

let composer;
let turn = null;
let abort = null;
let running = false;
const offs = [];

const LANGS = ['en', 'hi', 'hinglish'];
const LANG_LABEL = { en: 'EN', hi: 'हि', hinglish: 'Mix' };

async function bootKernel() {
  try {
    const mod = await import('./kernel/index.js');
    const k = await mod.createKernel();
    for (const fn of ['boot', 'start', 'init']) {
      if (typeof k[fn] === 'function') { await k[fn](); break; }
    }
    return k;
  } catch (e) {
    console.warn('[guru] kernel unavailable:', e && e.message);
    return null;
  }
}

/* ---------- status & language chrome ---------- */
function refreshStatus() {
  let st = null;
  try { st = svc('llm') && svc('llm').status(); } catch { /* ignore */ }
  const online = !!(st && st.online && st.provider && st.provider !== 'local');
  const el = document.getElementById('status');
  el.classList.toggle('online', online);
  const label = online ? tr('ui.statusOnline') + (st.provider ? ' · ' + st.provider : '') : tr('ui.statusLocal');
  document.getElementById('status-text').textContent = label;
  el.title = label;
  el.setAttribute('aria-label', tr('ui.status') + ': ' + label);
}
function refreshLangButton() {
  const b = document.getElementById('btn-lang');
  b.textContent = LANG_LABEL[uiLang()] || 'EN';
}
function refreshAll() {
  applyI18n();
  refreshStatus();
  refreshLangButton();
  buildSuggestions();
  composer && composer.setBusy(running);
}
function cycleLang() {
  const next = LANGS[(LANGS.indexOf(uiLang()) + 1) % LANGS.length];
  setUiLang(next);
  refreshAll();
}

function buildSuggestions() {
  const box = document.getElementById('suggestions');
  box.replaceChildren();
  for (const n of [1, 2, 3, 4]) {
    box.append(h('button', { class: 'sug', type: 'button', text: tr('sug.' + n), onclick: () => composer.setText(tr('sug.' + n)) }));
  }
}

/* ---------- bus -> current turn ---------- */
const short = (v, n = 90) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const errMsg = (e) => (e && (e.message || e.error?.message || e.error)) || tr('ui.error');

function wireBus(k) {
  const on = (evt, fn) => { try { offs.push(k.bus.on(evt, (p) => { if (turn) { try { fn(p || {}); } catch (e) { console.warn(e); } } })); } catch { /* ignore */ } };
  on('recall', (p) => turn.step('recall', Array.isArray(p.items) ? p.items.length + ' memories' : ''));
  on('plan', (p) => { const t = p.tasks || p.plan || []; turn.step('plan', Array.isArray(t) ? t.length + ' tasks' : short(t)); turn.status(tr('ui.thinking')); });
  on('task:start', (p) => { turn.step(p.agent || 'task', short(p.task || p.goal || '')); turn.status((p.agent || '') + ' ' + short(p.task || '', 50)); });
  on('task:token', (p) => { const t = p.text ?? p.token ?? p.delta; if (typeof t === 'string' && t.trim()) turn.status(t.trim().slice(-60)); });
  on('tool:call', (p) => { turn.step('tool', (p.name || p.tool || '') + ' ' + short(p.args, 60)); turn.status(p.name || p.tool); });
  on('tool:result', (p) => turn.step('result', (p.name || p.tool || '') + ' ' + (p.error ? short(p.error) : 'ok'), !!p.error));
  on('critique', (p) => turn.step('critique', p.score != null ? p.score + '/10' : short(p.text || '')));
  on('refine', (p) => turn.step('refine', short(p.reason || p.feedback || '')));
  on('artifact', (p) => turn.artifact(p.artifact || p));
  on('answer', (p) => { const t = typeof p === 'string' ? p : p.text ?? p.answer; if (t) turn.setAnswer(t); });
  on('run:error', (p) => turn.step('error', short(errMsg(p)), true));
  on('module:error', (p) => console.warn('[guru] module error', p));
  on('ask', (p) => askUser(p));
}

function askUser(p) {
  const input = h('input', { type: 'text', 'aria-label': p.question || tr('ui.askReply') });
  const done = (val) => {
    box.remove();
    try { if (typeof p.resolve === 'function') p.resolve(val); ctx.k.bus.emit('ask:answer', { id: p.id, answer: val }); } catch { /* ignore */ }
  };
  const box = h('div', { class: 'ask' }, h('b', { text: p.question || p.text || '' }), input,
    h('button', { class: 'btn primary', type: 'button', onclick: () => done(input.value) }, tr('ui.askReply')));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value); });
  turn.node(box);
  input.focus();
}

/* ---------- run ---------- */
async function onSend(text, files) {
  if (running) return;
  const goal = composer.compose(text, files);
  if (!goal) return;
  addUser(text || files.map((f) => f.name).join(', '), files);
  running = true;
  composer.setBusy(true);
  turn = beginTurn();
  const k = ctx.k;
  abort = new AbortController();
  let rec = null;
  try {
    if (k && typeof k.run === 'function') {
      rec = await k.run(goal, { lang: uiLang(), signal: abort.signal });
    } else if (svc('llm')) {
      const r = await svc('llm').chat({ messages: [{ role: 'user', content: goal }], signal: abort.signal });
      rec = { answer: r.text };
    } else {
      rec = { answer: tr('ui.engineMissing') };
    }
    const ans = rec && (rec.answer ?? rec.text);
    if (ans) turn.setAnswer(typeof ans === 'string' ? ans : ans.text || JSON.stringify(ans));
    for (const a of (rec && rec.artifacts) || []) turn.artifact(a);
    if (rec && !turn.answer && !(rec.artifacts || []).length) turn.setAnswer(tr('ui.error'));
  } catch (e) {
    if (e && e.name === 'AbortError') turn.setAnswer('_' + tr('ui.stop') + '_');
    else { turn.step('error', short(errMsg(e)), true); turn.setAnswer('**' + tr('ui.error') + '**\n\n' + errMsg(e)); }
  } finally {
    turn.finish(rec && rec.id);
    turn = null; abort = null; running = false;
    composer.setBusy(false);
    refreshStatus();
  }
}

/* ---------- commands ---------- */
function newChat() {
  if (running && abort) abort.abort();
  clearChat();
  composer.focus();
}
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
  const t = dark ? 'light' : 'dark';
  cfg.set('ui.theme', t); applyTheme(t);
}
const showSettings = () => openSettings({ onChange: () => { refreshAll(); } });
const showPalette = () => openPalette({
  commands: [
    { title: tr('cmd.settings'), run: showSettings },
    { title: tr('cmd.newChat'), run: newChat },
    { title: tr('cmd.lang'), run: cycleLang },
    { title: tr('cmd.theme'), run: toggleTheme },
    { title: tr('cmd.attach'), run: () => composer.pickSource() },
  ],
  onInsert: (t) => composer.insert(t),
});

/** Handle voice.parseCommand results. Returns false when not a UI command. */
function onVoiceCommand(cmd) {
  const id = String(cmd.intent || '').toLowerCase();
  if (id.includes('setting')) showSettings();
  else if (id.includes('lang')) {
    const a = String((cmd.args && (cmd.args.lang || cmd.args.language)) || '').toLowerCase();
    if (LANGS.includes(a)) { setUiLang(a); refreshAll(); } else cycleLang();
  } else if (id.includes('new')) newChat();
  else if (id.includes('upload') || id.includes('attach')) composer.pickSource();
  else if (id.includes('stop')) { try { svc('voice').cancel(); } catch { /* ignore */ } if (abort) abort.abort(); }
  else if (id.includes('read') || id.includes('speak')) {
    const last = Array.from(document.querySelectorAll('.msg-bot .md')).pop();
    if (last && svc('voice')) { try { svc('voice').speak(last.textContent, {}); } catch { /* ignore */ } }
  } else return false;
  return true;
}

/* ---------- onboarding ---------- */
function onboard() {
  if (cfg.get('ui.onboarded', false)) return;
  const dlg = document.getElementById('dlg-onboard');
  const pick = (l) => { setUiLang(l); cfg.set('ui.onboarded', true); dlg.close(); refreshAll(); composer.focus(); };
  dlg.replaceChildren(
    h('div', { class: 'lead' }, h('h2', { id: 'onboard-title', text: tr('onboard.title') + ' / भाषा चुनें' }), h('p', { text: tr('onboard.sub') })),
    h('div', { class: 'lang-grid' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => pick('en') }, 'English'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => pick('hi') }, 'हिन्दी'),
      h('button', { class: 'btn', type: 'button', onclick: () => pick('hinglish') }, 'Hinglish')));
  dlg.addEventListener('cancel', () => { cfg.set('ui.onboarded', true); });
  dlg.showModal();
}

/* ---------- boot ---------- */
async function main() {
  hydrateIcons(document);
  applyTheme(cfg.get('ui.theme', 'auto'));
  composer = initComposer({ onSend, onStop: () => abort && abort.abort(), onCommand: onVoiceCommand, onPalette: showPalette });
  composer.setBusy(false);
  initDialogDismiss();

  document.getElementById('btn-settings').addEventListener('click', showSettings);
  document.getElementById('btn-new').addEventListener('click', newChat);
  document.getElementById('btn-lang').addEventListener('click', cycleLang);
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); showPalette(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !document.querySelector('dialog[open]')) { e.preventDefault(); showPalette(); }
  });
  refreshAll();

  const k = await bootKernel();
  ctx.k = k;
  if (k) {
    wireBus(k);
    try { k.bus.on('llm:status', refreshStatus); k.bus.on('i18n:change', refreshAll); } catch { /* ignore */ }
    const il = svc('i18n');
    if (il && !cfg.get('ui.onboarded', false) === false) { try { il.setLang(cfg.get('ui.lang', il.lang())); } catch { /* ignore */ } }
  }
  addEventListener('online', refreshStatus);
  addEventListener('offline', refreshStatus);
  refreshAll();
  onboard();
  document.documentElement.setAttribute('data-ready', k ? 'kernel' : 'standalone');
}

main().catch((e) => { console.error('[guru] boot failed', e); toast(tr('ui.error')); });
