// Composer: autosizing textarea, tap-to-toggle mic with live interim text, attachments, send/stop.
import { h, icon, toast } from './dom.js';
import { svc, tr, cfg, uiLang } from './ctx.js';

const MAX_ATTACH_CHARS = 12000;

export function initComposer({ onSend, onStop, onCommand, onPalette }) {
  const form = document.getElementById('composer');
  const input = document.getElementById('input');
  const send = document.getElementById('btn-send');
  const mic = document.getElementById('btn-mic');
  const attachBtn = document.getElementById('btn-attach');
  const fileInput = document.getElementById('file-input');
  const attBox = document.getElementById('attachments');
  let busy = false;
  let attachments = [];
  let session = null;
  let baseText = '';

  const autosize = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  };
  input.addEventListener('input', () => {
    if (input.value === '/') { input.value = ''; autosize(); onPalette && onPalette(); return; }
    autosize();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });

  function renderAttachments() {
    attBox.replaceChildren();
    attBox.hidden = attachments.length === 0;
    attachments.forEach((a, i) => {
      attBox.append(h('span', { class: 'fchip' }, h('span', { text: a.name }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.close'), onclick: () => { attachments.splice(i, 1); renderAttachments(); } }, icon('close'))));
    });
  }

  async function addFile(file) {
    let text = '';
    const files = svc('files');
    try {
      if (files && files.read) { const r = await files.read(file, file.name); text = r.text || (r.sheets ? JSON.stringify(r.sheets).slice(0, MAX_ATTACH_CHARS) : '') || ''; }
      else if (/^text\/|json|csv|markdown/.test(file.type) || /\.(txt|md|csv|json|html)$/i.test(file.name)) text = await file.text();
    } catch (e) { toast((e && e.message) || tr('ui.error')); }
    attachments.push({ name: file.name, text: text.slice(0, MAX_ATTACH_CHARS), file });
    renderAttachments();
  }
  /** Add a Drive/other item with already-read text. */
  function addText(name, text) { attachments.push({ name, text: String(text || '').slice(0, MAX_ATTACH_CHARS) }); renderAttachments(); }

  fileInput.addEventListener('change', async () => {
    for (const f of Array.from(fileInput.files)) await addFile(f);
    fileInput.value = '';
  });
  attachBtn.addEventListener('click', () => api.pickSource());

  function stopMic() {
    if (session) { try { session.stop(); } catch { /* ignore */ } session = null; }
    mic.classList.remove('rec'); mic.setAttribute('aria-pressed', 'false');
    mic.setAttribute('aria-label', tr('ui.mic'));
  }
  mic.addEventListener('click', () => {
    if (session) { stopMic(); return; }
    const voice = svc('voice');
    if (!voice || !voice.supported || !voice.supported().stt) { toast(tr('ui.noVoice')); return; }
    baseText = input.value ? input.value.replace(/\s*$/, ' ') : '';
    const vl = cfg.get('voice.lang', 'auto');
    try {
      session = voice.listen({
        lang: vl === 'auto' ? (uiLang() === 'hi' ? 'hi-IN' : uiLang() === 'hinglish' ? 'auto' : 'en-IN') : vl,
        onInterim: (t) => { input.value = baseText + t; autosize(); },
        onFinal: (t) => {
          const cmd = voice.parseCommand ? voice.parseCommand(t, uiLang()) : null;
          if (cmd && onCommand && onCommand(cmd) !== false) { input.value = baseText.trim(); }
          else input.value = baseText + t;
          autosize(); stopMic();
        },
      });
      mic.classList.add('rec'); mic.setAttribute('aria-pressed', 'true');
      mic.setAttribute('aria-label', tr('ui.micOn'));
    } catch (e) { session = null; toast((e && e.message) || tr('ui.noVoice')); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) { onStop && onStop(); return; }
    const text = input.value.trim();
    if (!text && !attachments.length) return;
    stopMic();
    const files = attachments;
    input.value = ''; autosize();
    attachments = []; renderAttachments();
    onSend(text, files);
  });

  const api = {
    input,
    setBusy(b) {
      busy = b;
      send.replaceChildren(icon(b ? 'stop' : 'send'));
      const label = tr(b ? 'ui.stop' : 'ui.send');
      send.setAttribute('aria-label', label); send.title = label;
    },
    setText(t) { input.value = t; autosize(); input.focus(); },
    insert(t) { input.value = (input.value ? input.value + ' ' : '') + t; autosize(); input.focus(); },
    focus() { input.focus(); },
    addFile, addText,
    async pickSource() {
      let drive = null;
      try { const c = svc('connectors'); drive = c && c.get('gdrive'); } catch { /* ignore */ }
      if (!drive) { fileInput.click(); return; }
      const dlg = document.getElementById('dlg-pick');
      const close = () => dlg.close();
      const list = h('ul', { class: 'pick-list' });
      const opt = (label, fn) => h('li', {}, h('button', { class: 'pal-item', type: 'button', onclick: fn }, h('b', { text: label })));
      list.append(
        opt(tr('ui.thisDevice'), () => { close(); fileInput.click(); }),
        opt(tr('ui.drive'), async () => {
          list.replaceChildren(h('li', { class: 'live', text: tr('ui.thinking') }));
          try {
            if (drive.status && drive.status() !== 'ready' && drive.connect) await drive.connect();
            const r = await drive.list('');
            list.replaceChildren();
            const items = (r.items || []).filter((x) => !x.isDir).slice(0, 30);
            if (!items.length) list.append(h('li', { class: 'live', text: tr('ui.noFiles') }));
            for (const it of items) {
              list.append(opt(it.name, async () => {
                close();
                try { const txt = await drive.read(it.id, { as: 'text' }); addText(it.name, typeof txt === 'string' ? txt : JSON.stringify(txt)); } catch (e) { toast((e && e.message) || tr('ui.error')); }
              }));
            }
          } catch (e) { close(); toast((e && e.message) || tr('ui.error')); }
        }),
      );
      dlg.replaceChildren(
        h('div', { class: 'dlg-head' }, h('h2', { id: 'pick-title', text: tr('ui.attach') }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.close'), onclick: close }, icon('close'))),
        list);
      dlg.showModal();
    },
    /** Compose the final goal text including attached file contents. */
    compose(text, files) {
      let out = text;
      for (const f of files) if (f.text) out += `\n\n[Attached file: ${f.name}]\n${f.text}`;
      return out.trim();
    },
  };
  return api;
}
