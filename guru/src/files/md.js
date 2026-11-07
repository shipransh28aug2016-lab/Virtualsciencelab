// Markdown <-> block spec, plus patching.
const hasTable = (l, n) => /^\s*\|.*\|\s*$/.test(l) && n && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(n);
const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/**
 * Parse markdown to {title, blocks}. First "# " heading becomes title when `liftTitle`.
 * @param {string} md
 * @param {{liftTitle?:boolean}} [o]
 */
export function toBlocks(md, o = {}) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n'); const blocks = []; let i = 0, title;
  const push = (b) => blocks.push(b);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(```|~~~)\s*(\w*)/.exec(l))) { const buf = []; i++; while (i < lines.length && !lines[i].startsWith(m[1])) buf.push(lines[i++]); i++; push({ t: 'code', text: buf.join('\n'), lang: m[2] || undefined }); continue; }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
      const lv = Math.min(m[1].length, 3);
      if (o.liftTitle && m[1].length === 1 && title === undefined && !blocks.length) title = m[2]; else push({ t: 'h' + lv, text: m[2] });
      i++; continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { i++; continue; }
    if (hasTable(l, lines[i + 1])) {
      const header = splitRow(l); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      push({ t: 'table', header, rows }); continue;
    }
    if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l))) {
      const ordered = /\d/.test(m[2]); const items = [];
      while (i < lines.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])) && /\d/.test(m[2]) === ordered) {
        const lvl = Math.min(2, Math.floor(m[1].replace(/\t/g, '    ').length / 2)); const text = m[3].replace(/^\[[ xX]\]\s+/, '');
        items.push(lvl ? { text, level: lvl } : text); i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i])) { const last = items[items.length - 1]; if (typeof last === 'string') items[items.length - 1] = last + ' ' + lines[i].trim(); else last.text += ' ' + lines[i].trim(); i++; }
      }
      push({ t: ordered ? 'ol' : 'ul', items }); continue;
    }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); push({ t: 'quote', text: buf.join(' ').trim() }); continue; }
    if ((m = /^!\[([^\]]*)\]\(([^)]*)\)\s*$/.exec(l))) { push({ t: 'img', alt: m[1], src: m[2] }); i++; continue; }
    if (/^\\pagebreak|^<!--\s*pagebreak\s*-->|^\f/.test(l)) { push({ t: 'pagebreak' }); i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|~~~|>\s?|\s*([-*+]|\d+[.)])\s+)/.test(lines[i]) && !hasTable(lines[i], lines[i + 1])) buf.push(lines[i++].trim());
    push({ t: 'p', text: buf.join(' ') });
  }
  return { title, blocks };
}

const cellMd = (c) => String(c && typeof c === 'object' ? c.text ?? '' : c ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
/**
 * Render a document spec to markdown.
 * @param {{title?:string,blocks?:object[]}} spec
 */
export function fromBlocks(spec) {
  const out = []; if (spec.title) out.push('# ' + spec.title);
  for (const b of spec.blocks || []) {
    const t = typeof b === 'string' ? 'p' : b.t || 'p'; const x = typeof b === 'string' ? { text: b } : b;
    if (t === 'h1' || t === 'h2' || t === 'h3') out.push('#'.repeat(+t[1]) + ' ' + x.text);
    else if (t === 'ul' || t === 'ol') out.push((x.items || []).map((it, n) => { const o = typeof it === 'object' ? it : { text: it }; return '  '.repeat(o.level || 0) + (t === 'ul' ? '- ' : `${n + 1}. `) + o.text; }).join('\n'));
    else if (t === 'table' || t === 'bilingual') {
      const head = x.header || (x.rows && x.rows[0] ? x.rows[0].map(() => '') : []); const rows = x.rows || [];
      const n = Math.max(head.length, ...rows.map((r) => r.length), 1);
      const pad = (r) => Array.from({ length: n }, (_, k) => cellMd(r[k]));
      out.push(['| ' + pad(head).join(' | ') + ' |', '| ' + Array(n).fill('---').join(' | ') + ' |', ...rows.map((r) => '| ' + pad(r).join(' | ') + ' |')].join('\n'));
    } else if (t === 'code') out.push('```\n' + (x.text || '') + '\n```');
    else if (t === 'quote') out.push('> ' + x.text);
    else if (t === 'math') out.push('$$ ' + x.text + ' $$');
    else if (t === 'qa') out.push(`**Q${x.no ? ' ' + x.no : ''}.** ${x.q ?? x.question ?? x.text}\n\n**A.** ${x.a ?? x.answer ?? ''}`);
    else if (t === 'img') out.push(`![${x.alt || ''}](${x.src || ''})`);
    else if (t === 'pagebreak') out.push('<!-- pagebreak -->');
    else out.push(x.text ?? '');
  }
  return out.join('\n\n') + '\n';
}

/**
 * Patch markdown text. ops: {op:'replace',find,replace,all?} | {op:'append',text|blocks} | {op:'prepend',text}
 * | {op:'insertAfterHeading',heading,text} | {op:'replaceSection',heading,text} | {op:'deleteSection',heading}
 * @returns {{text:string,changes:number,warnings:string[]}}
 */
export function patch(md, ops = []) {
  let s = String(md ?? ''); let changes = 0; const warnings = [];
  const sections = (src) => {
    const ls = src.split('\n'); const hs = [];
    let fence = false;
    ls.forEach((l, k) => { if (/^(```|~~~)/.test(l)) fence = !fence; const m = !fence && /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l); if (m) hs.push({ line: k, level: m[1].length, text: m[2] }); });
    return { ls, hs };
  };
  const find = (src, heading) => {
    const { ls, hs } = sections(src); const key = String(heading).replace(/^#+\s*/, '').trim().toLowerCase();
    const idx = hs.findIndex((h) => h.text.toLowerCase() === key); if (idx < 0) return null;
    const end = (hs.slice(idx + 1).find((h) => h.level <= hs[idx].level) || { line: ls.length }).line;
    return { ls, start: hs[idx].line, end };
  };
  for (const op of ops) {
    if (op.op === 'replace') {
      if (!op.find) { warnings.push('replace: empty find'); continue; }
      const parts = s.split(op.find); const n = parts.length - 1;
      if (!n) { warnings.push(`replace: "${op.find}" not found`); continue; }
      if (op.all === false) { s = parts[0] + (op.replace ?? '') + parts.slice(1).join(op.find); changes++; } else { s = parts.join(op.replace ?? ''); changes += n; }
    } else if (op.op === 'append') { const add = op.blocks ? fromBlocks({ blocks: op.blocks }) : String(op.text ?? ''); s = s.replace(/\s*$/, '') + '\n\n' + add.replace(/^\n+/, ''); if (!s.endsWith('\n')) s += '\n'; changes++; }
    else if (op.op === 'prepend') { s = String(op.text ?? '').replace(/\s*$/, '') + '\n\n' + s.replace(/^\n+/, ''); changes++; }
    else if (op.op === 'insertAfterHeading' || op.op === 'replaceSection' || op.op === 'deleteSection') {
      const f = find(s, op.heading); if (!f) { warnings.push(`${op.op}: heading "${op.heading}" not found`); continue; }
      const head = f.ls[f.start]; const before = f.ls.slice(0, f.start); const body = f.ls.slice(f.start + 1, f.end); const after = f.ls.slice(f.end);
      let mid;
      if (op.op === 'insertAfterHeading') mid = [head, '', String(op.text).trim(), '', ...body];
      else if (op.op === 'replaceSection') mid = [head, '', String(op.text).trim(), ''];
      else mid = [];
      s = [...before, ...mid, ...after].join('\n').replace(/\n{3,}/g, '\n\n'); changes++;
    } else warnings.push('unknown op: ' + (op.op || JSON.stringify(op)));
  }
  return { text: s, changes, warnings };
}
