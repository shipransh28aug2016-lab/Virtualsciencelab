// Settings drawer.
import { h, icon, toast, downloadBlob } from './dom.js';
import { svc, tr, cfg, uiLang, setUiLang, applyTheme, applyI18n } from './ctx.js';

export function openSettings({ onChange }) {
  const dlg = document.getElementById('dlg-settings');
  const changed = () => { onChange && onChange(); };
  const llm = svc('llm');
  const voice = svc('voice');
  const mem = svc('memory');
  let providers = [{ id: 'local', label: 'Local (offline)', needsKey: false }];
  try { if (llm && llm.providers) providers = llm.providers(); } catch { /* ignore */ }
  let st = {};
  try { st = (llm && llm.status()) || {}; } catch { /* ignore */ }

  const field = (label, control, hint) => h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('small', { text: hint }) : null);
  const select = (opts, value, onch) => {
    const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v, text: l })));
    s.value = value;
    s.addEventListener('change', () => onch(s.value));
    return s;
  };
  const textInput = (type, value, ph) => h('input', { type, value: value || '', placeholder: ph || '', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });

  // --- AI engine
  let provider = st.provider || cfg.get('llm.provider', 'local');
  const provSel = select(providers.map((p) => [p.id, p.label || p.id]), provider, (v) => { provider = v; try { llm && llm.setProvider(v); } catch { /* ignore */ } cfg.set('llm.provider', v); changed(); });
  const keyIn = textInput('password', '', st.hasKey ? '••••••••' : 'sk-…');
  const keySave = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    if (!keyIn.value.trim()) return;
    try { await (llm && llm.setKey(provider, keyIn.value.trim())); keyIn.value = ''; toast(tr('settings.saved')); changed(); } catch (e) { toast((e && e.message) || tr('ui.error')); }
  } }, tr('settings.save'));
  const baseIn = textInput('text', cfg.get('llm.openai.baseUrl', ''), 'https://api.openai.com/v1');
  baseIn.addEventListener('change', () => { cfg.set('llm.openai.baseUrl', baseIn.value.trim()); toast(tr('settings.saved')); });

  // --- connectors
  const gIn = textInput('text', cfg.get('gdrive.clientId', ''), '123-abc.apps.googleusercontent.com');
  gIn.addEventListener('change', () => {
    cfg.set('gdrive.clientId', gIn.value.trim());
    try { const c = svc('connectors'); const g = c && c.get('gdrive'); if (g && g.setClientId) g.setClientId(gIn.value.trim()); } catch { /* ignore */ }
    toast(tr('settings.saved'));
  });
  const ghIn = textInput('password', '', cfg.get('github.hasToken', false) ? '••••••••' : 'ghp_…');
  ghIn.addEventListener('change', () => {
    const v = ghIn.value.trim();
    if (!v) return;
    cfg.set('github.token', v); cfg.set('github.hasToken', true);
    try { const c = svc('connectors'); const g = c && c.get('github'); if (g && g.setToken) g.setToken(v); } catch { /* ignore */ }
    ghIn.value = ''; toast(tr('settings.saved'));
  });

  // --- voice / language / theme
  const langSel = select([['en', tr('lang.en')], ['hi', tr('lang.hi')], ['hinglish', tr('lang.hinglish')]], uiLang(), (v) => { setUiLang(v); applyI18n(); changed(); openSettings({ onChange }); });
  const vlSel = select([['auto', 'Auto'], ['hi-IN', 'हिन्दी (hi-IN)'], ['en-IN', 'English (en-IN)']], cfg.get('voice.lang', 'auto'), (v) => cfg.set('voice.lang', v));
  const auto = h('input', { type: 'checkbox', checked: !!cfg.get('voice.autospeak', false) });
  auto.addEventListener('change', () => cfg.set('voice.autospeak', auto.checked));
  const rate = h('input', { type: 'range', min: '0.6', max: '1.4', step: '0.1', value: String(cfg.get('voice.rate', 1)) });
  rate.addEventListener('change', () => cfg.set('voice.rate', Number(rate.value)));
  const themeSel = select([['auto', tr('settings.themeAuto')], ['light', tr('settings.themeLight')], ['dark', tr('settings.themeDark')]], cfg.get('ui.theme', 'auto'), (v) => { cfg.set('ui.theme', v); applyTheme(v); });

  // --- memory
  const memList = h('ul', { class: 'mem-list' });
  const memDet = h('details', {}, h('summary', { text: tr('settings.memView') }), memList);
  async function loadMem() {
    memList.replaceChildren();
    let items = [];
    try { items = mem ? await mem.recall('', { k: 40 }) : []; } catch { /* ignore */ }
    if (!items || !items.length) { memList.append(h('li', {}, h('span', { text: tr('settings.empty') }))); return; }
    for (const it of items) {
      const li = h('li', {}, h('span', {}, h('small', { text: it.kind || '' }), it.text),
        h('button', { class: 'chip-btn', type: 'button', onclick: async () => { try { await mem.forget(it.id); li.remove(); } catch { /* ignore */ } } }, tr('settings.forget')));
      memList.append(li);
    }
  }
  memDet.addEventListener('toggle', () => { if (memDet.open) loadMem(); });
  const impIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  impIn.addEventListener('change', async () => {
    try { const f = impIn.files[0]; if (f) { await mem.import(JSON.parse(await f.text())); toast(tr('settings.imported')); loadMem(); } } catch (e) { toast((e && e.message) || tr('ui.error')); }
    impIn.value = '';
  });

  const sec = (title, ...kids) => h('section', { class: 'sec' }, h('h3', { text: title }), ...kids);
  const unavailable = (s) => s ? null : h('small', { text: tr('ui.unavailable') });

  dlg.replaceChildren(
    h('div', { class: 'dlg-head' }, h('h2', { id: 'settings-title', text: tr('settings.title') }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.close'), onclick: () => dlg.close() }, icon('close'))),
    sec(tr('settings.ai'),
      field(tr('settings.provider'), provSel),
      field(tr('settings.key'), h('div', { class: 'row' }, keyIn, keySave), tr('settings.keyHint')),
      field(tr('settings.baseUrl'), baseIn)),
    sec(tr('settings.connectors'), field(tr('settings.gClient'), gIn), field(tr('settings.ghToken'), ghIn), unavailable(svc('connectors'))),
    sec(tr('settings.voice'),
      field(tr('settings.lang'), langSel),
      field(tr('settings.voiceLang'), vlSel),
      h('label', { class: 'check' }, auto, tr('settings.autoSpeak')),
      field(tr('settings.rate'), rate),
      unavailable(voice)),
    sec(tr('settings.theme'), themeSel),
    sec(tr('settings.memory'),
      memDet,
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          try { const data = await mem.export(); downloadBlob(new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: 'application/json' }), 'guru-memory.json'); } catch (e) { toast((e && e.message) || tr('ui.unavailable')); }
        } }, tr('settings.export')),
        h('button', { class: 'btn', type: 'button', onclick: () => (mem ? impIn.click() : toast(tr('ui.unavailable'))) }, tr('settings.import')),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          if (!mem || !window.confirm(tr('settings.confirmForget'))) return;
          try { const all = await mem.recall('', { k: 1000 }); for (const it of all) await mem.forget(it.id); loadMem(); toast(tr('settings.saved')); } catch (e) { toast((e && e.message) || tr('ui.error')); }
        } }, tr('settings.forgetAll')),
        impIn),
      unavailable(mem)),
  );
  if (!dlg.open) dlg.showModal();
}

export function initDialogDismiss() {
  for (const d of document.querySelectorAll('dialog')) {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  }
}
