// Chat stream: user bubbles, assistant turns with live status, collapsible trace, markdown answer,
// artifact chips and feedback actions.
import { h, icon, downloadBlob, toast } from './dom.js';
import { renderMarkdown, toPlain } from './md.js';
import { ctx, svc, tr, cfg, uiLang } from './ctx.js';

const $msgs = () => document.getElementById('messages');
const $stream = () => document.getElementById('stream');

export function scrollDown() {
  const s = $stream();
  if (s) s.scrollTop = s.scrollHeight;
}

export function clearChat() {
  const m = $msgs();
  for (const c of Array.from(m.children)) if (c.id !== 'empty') c.remove();
  document.getElementById('empty').hidden = false;
}

export function addUser(text, files = []) {
  document.getElementById('empty').hidden = true;
  const b = h('div', { class: 'msg-user', text });
  for (const f of files) b.append(h('span', { class: 'att', text: f.name }));
  $msgs().append(b);
  scrollDown();
}

function blobFrom(a) {
  if (a.blob instanceof Blob) return a.blob;
  if (a.data != null) return new Blob([a.data], { type: a.mime || 'application/octet-stream' });
  if (typeof a.text === 'string') return new Blob([a.text], { type: a.mime || 'text/plain' });
  const ref = a.blobRef;
  if (ref instanceof Blob) return ref;
  try {
    const store = ctx.k && (ctx.k.artifacts || (ctx.k.services.has('artifacts') && ctx.k.services.get('artifacts')));
    const got = store && typeof store.get === 'function' ? store.get(ref ?? a.id) : null;
    if (got instanceof Blob) return got;
    if (got && got.blob instanceof Blob) return got.blob;
  } catch { /* ignore */ }
  return null;
}

function artifactChip(a) {
  const name = a.filename || a.name || 'file';
  const blob = blobFrom(a);
  const row = h('div', { class: 'art' }, h('div', { class: 'name' }, icon('file'), name));
  const dl = h('button', { class: 'chip-btn', type: 'button', onclick: () => (blob ? downloadBlob(blob, name) : toast(tr('ui.unavailable'))) }, icon('download'), tr('ui.download'));
  row.append(dl);
  const conns = svc('connectors');
  let drive = null;
  try { drive = conns && conns.get('gdrive'); } catch { /* ignore */ }
  if (drive && blob) {
    const save = h('button', {
      class: 'chip-btn', type: 'button',
      onclick: async () => {
        save.disabled = true;
        try {
          if (drive.status && drive.status() !== 'ready' && drive.connect) await drive.connect();
          await drive.write(name, blob, { mime: a.mime || blob.type, name, create: true });
          save.lastChild.textContent = tr('ui.saved');
          toast(tr('ui.saved'));
        } catch (e) { save.disabled = false; toast((e && e.message) || tr('ui.error')); }
      },
    }, icon('cloud'), tr('ui.saveDrive'));
    row.append(save);
  }
  if (blob && /^(text\/html|application\/pdf|image\/)/.test(a.mime || blob.type || '')) {
    row.append(h('button', { class: 'chip-btn', type: 'button', onclick: () => { const u = URL.createObjectURL(blob); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } }, tr('ui.open')));
  }
  return row;
}

/** One assistant turn. Returns a controller. */
export function beginTurn() {
  document.getElementById('empty').hidden = true;
  const live = h('div', { class: 'live' }, h('i', { class: 'spin' }), h('span', { class: 't', text: tr('ui.thinking') }));
  const traceList = h('ol');
  const trace = h('details', { class: 'trace', hidden: true }, h('summary', { text: '' }), traceList);
  const body = h('div', { class: 'md' });
  const arts = h('div', { class: 'artifacts' });
  const actions = h('div', { class: 'actions', hidden: true });
  const root = h('article', { class: 'msg-bot', 'aria-busy': 'true' }, trace, live, body, arts, actions);
  $msgs().append(root);
  scrollDown();
  let steps = 0;
  const seen = new Set();
  let answer = '';

  const updateSummary = () => {
    trace.hidden = steps === 0;
    trace.querySelector('summary').textContent = '\u{1F9E0} ' + (steps === 1 ? tr('ui.step') : tr('ui.steps', { n: steps }));
  };
  return {
    root,
    status(text) { const t = live.querySelector('.t'); if (t && text) t.textContent = text; },
    step(label, detail, isErr) {
      steps++;
      traceList.append(h('li', { class: isErr ? 'err' : '' }, h('b', { text: label }), detail ? ' ' + detail : ''));
      updateSummary();
    },
    setAnswer(md) {
      answer = String(md ?? '');
      body.replaceChildren(renderMarkdown(answer));
      scrollDown();
    },
    artifact(a) {
      const key = (a.filename || a.name || '') + ':' + (a.id || a.blobRef || '');
      if (seen.has(key)) return;
      seen.add(key);
      arts.append(artifactChip(a));
      scrollDown();
    },
    node(el) { root.append(el); scrollDown(); },
    get answer() { return answer; },
    finish(runId) {
      live.remove();
      root.removeAttribute('aria-busy');
      if (!answer) return;
      const mem = svc('memory');
      const voice = svc('voice');
      const rate = (score, btn, other) => async () => {
        btn.classList.add('sel'); other.classList.remove('sel');
        try { if (mem && mem.feedback) await mem.feedback(runId, { score }); } catch { /* ignore */ }
        toast(tr('ui.thanks'));
      };
      const up = h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.good'), title: tr('ui.good') }, icon('up'));
      const down = h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.bad'), title: tr('ui.bad') }, icon('down'));
      up.addEventListener('click', rate(1, up, down));
      down.addEventListener('click', rate(-1, down, up));
      actions.append(up, down);
      if (voice && voice.supported && voice.supported().tts) {
        actions.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': tr('ui.speak'), title: tr('ui.speak'), onclick: () => { try { voice.speak(toPlain(answer), { lang: uiLang() === 'hi' ? 'hi-IN' : 'en-IN' }); } catch { /* ignore */ } } }, icon('speaker')));
      }
      actions.append(h('button', {
        class: 'icon-btn', type: 'button', 'aria-label': tr('ui.copy'), title: tr('ui.copy'),
        onclick: async () => { try { await navigator.clipboard.writeText(answer); toast(tr('ui.copied')); } catch { /* ignore */ } },
      }, icon('copy')));
      actions.hidden = false;
      if (cfg.get('voice.autospeak', false) && voice) { try { voice.speak(toPlain(answer), { lang: uiLang() === 'hi' ? 'hi-IN' : 'en-IN', rate: cfg.get('voice.rate', 1) }); } catch { /* ignore */ } }
    },
  };
}
