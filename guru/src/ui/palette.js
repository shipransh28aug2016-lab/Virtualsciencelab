// Command palette: built-in commands + kernel tools + agents. Opens with "/" or Ctrl/Cmd+K.
import { h } from './dom.js';
import { ctx, tr } from './ctx.js';

function collect(commands) {
  const items = commands.map((c) => ({ group: 'palette.commands', title: c.title, sub: '', run: c.run }));
  const k = ctx.k;
  try {
    for (const t of (k && k.tools && k.tools.list && k.tools.list()) || []) {
      items.push({ group: 'palette.tools', title: t.name, sub: t.description || '', insert: '@' + t.name + ' ' });
    }
  } catch { /* ignore */ }
  try {
    const ag = k && k.agents && (k.agents.list ? k.agents.list() : null);
    for (const a of ag || []) items.push({ group: 'palette.agents', title: a.name || a.id, sub: a.description || a.role || '', insert: '@' + a.id + ' ' });
  } catch { /* ignore */ }
  return items;
}

export function openPalette({ commands, onInsert }) {
  const dlg = document.getElementById('dlg-palette');
  const all = collect(commands);
  let shown = [];
  let sel = 0;
  const input = h('input', { class: 'pal-input', type: 'search', placeholder: tr('palette.placeholder'), 'aria-label': tr('palette.title'), role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'pal-list', autocomplete: 'off' });
  const list = h('ul', { class: 'pal-list', id: 'pal-list', role: 'listbox' });

  const choose = (it) => {
    dlg.close();
    if (it.run) it.run(); else if (it.insert && onInsert) onInsert(it.insert);
  };
  function render() {
    const q = input.value.trim().toLowerCase();
    shown = all.filter((i) => !q || (i.title + ' ' + i.sub).toLowerCase().includes(q)).slice(0, 60);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.replaceChildren();
    if (!shown.length) { list.append(h('li', { role: 'presentation', text: tr('palette.empty') })); return; }
    let last = '';
    shown.forEach((it, i) => {
      if (it.group !== last) { last = it.group; list.append(h('li', { role: 'presentation', text: tr(it.group) })); }
      const btn = h('button', { class: 'pal-item', type: 'button', role: 'option', id: 'pal-' + i, 'aria-selected': String(i === sel), onclick: () => choose(it) },
        h('b', { text: it.title }), it.sub ? h('small', { text: it.sub }) : null);
      list.append(h('li', { role: 'presentation' }, btn));
    });
    input.setAttribute('aria-activedescendant', 'pal-' + sel);
  }
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, shown.length - 1); render(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[sel]) choose(shown[sel]); }
  });
  dlg.replaceChildren(input, list);
  render();
  if (!dlg.open) dlg.showModal();
  input.focus();
}
