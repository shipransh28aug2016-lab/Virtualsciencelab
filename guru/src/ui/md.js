// Tiny safe Markdown renderer. Parses to an AST (pure, Node-testable) and builds DOM nodes
// (never innerHTML), so all text is inherently escaped. Links limited to http(s)/mailto.

const INLINE = new RegExp([
  '`([^`\\n]+)`',                                   // 1 code
  '\\$(?!\\s)([^$\\n]+?)(?<!\\s)\\$(?!\\d)',         // 2 math (plain)
  '\\*\\*(?!\\s)(.+?)(?<!\\s)\\*\\*',                // 3 bold
  '__(?!\\s)(.+?)(?<!\\s)__',                       // 4 bold
  '\\*(?![\\s*])(.+?)(?<![\\s*])\\*',                // 5 italic
  '(?<![\\w])_(?![\\s_])(.+?)(?<![\\s_])_(?![\\w])', // 6 italic
  '\\[([^\\]\\n]+)\\]\\(((?:https?:\\/\\/|mailto:)[^\\s)]+)\\)', // 7,8 link
  '(https?:\\/\\/[^\\s<]*[^\\s<.,;:!?)\\]])',         // 9 bare url
].join('|'), 'u');

/** @param {string} s @returns {object[]} inline nodes */
export function parseInline(s) {
  const out = [];
  let rest = String(s ?? '');
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) { out.push({ t: 'text', v: rest }); break; }
    if (m.index) out.push({ t: 'text', v: rest.slice(0, m.index) });
    if (m[1] != null) out.push({ t: 'code', v: m[1] });
    else if (m[2] != null) out.push({ t: 'math', v: m[2] });
    else if (m[3] != null || m[4] != null) out.push({ t: 'b', c: parseInline(m[3] ?? m[4]) });
    else if (m[5] != null || m[6] != null) out.push({ t: 'i', c: parseInline(m[5] ?? m[6]) });
    else if (m[7] != null) out.push({ t: 'a', href: m[8], c: parseInline(m[7]) });
    else out.push({ t: 'a', href: m[9], c: [{ t: 'text', v: m[9] }] });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');

/** @param {string} src @returns {object[]} block nodes */
export function parseMarkdown(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^\s*(```|~~~)\s*([\w+-]*)/.exec(line))) {
      const fence = m[1], buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
      i++;
      blocks.push({ t: 'pre', lang: m[2], v: buf.join('\n') });
    } else if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
      blocks.push({ t: 'h', n: m[1].length, c: parseInline(m[2]) }); i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ t: 'hr' }); i++;
    } else if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(splitRow(lines[i++]));
      blocks.push({ t: 'table', head: head.map(parseInline), align, rows: rows.map((r) => r.map(parseInline)) });
    } else if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ t: 'quote', c: parseMarkdown(buf.join('\n')) });
    } else if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const indent = /^\s*/.exec(lines[i])[0].length;
        const text = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        if (indent >= 2 && items.length) items[items.length - 1].sub.push(text);
        else items.push({ c: parseInline(text), sub: [] });
        i++;
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items: items.map((it) => ({ c: it.c, sub: it.sub.length ? it.sub.map(parseInline) : null })) });
    } else {
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(lines[i])) buf.push(lines[i++]);
      if (!buf.length) { buf.push(lines[i++]); }
      blocks.push({ t: 'p', c: parseInline(buf.join('\n')) });
    }
  }
  return blocks;
}

function inlineDom(nodes, doc) {
  const frag = doc.createDocumentFragment();
  for (const n of nodes) {
    let el;
    switch (n.t) {
      case 'text': {
        n.v.split('\n').forEach((part, idx) => {
          if (idx) frag.append(doc.createElement('br'));
          frag.append(doc.createTextNode(part));
        });
        continue;
      }
      case 'code': el = doc.createElement('code'); el.textContent = n.v; break;
      case 'math': el = doc.createElement('span'); el.className = 'math'; el.textContent = n.v; break;
      case 'b': el = doc.createElement('strong'); el.append(inlineDom(n.c, doc)); break;
      case 'i': el = doc.createElement('em'); el.append(inlineDom(n.c, doc)); break;
      case 'a':
        el = doc.createElement('a');
        el.setAttribute('href', n.href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
        el.append(inlineDom(n.c, doc));
        break;
      default: continue;
    }
    frag.append(el);
  }
  return frag;
}

function blocksDom(blocks, doc) {
  const frag = doc.createDocumentFragment();
  for (const b of blocks) {
    let el;
    switch (b.t) {
      case 'h': el = doc.createElement('h' + Math.min(6, b.n + 1)); el.append(inlineDom(b.c, doc)); break;
      case 'p': el = doc.createElement('p'); el.append(inlineDom(b.c, doc)); break;
      case 'hr': el = doc.createElement('hr'); break;
      case 'quote': el = doc.createElement('blockquote'); el.append(blocksDom(b.c, doc)); break;
      case 'pre': {
        el = doc.createElement('pre');
        const code = doc.createElement('code');
        if (b.lang) code.setAttribute('data-lang', b.lang);
        code.textContent = b.v;
        el.append(code);
        el.setAttribute('tabindex', '0');
        break;
      }
      case 'ul': case 'ol':
        el = doc.createElement(b.t);
        for (const it of b.items) {
          const li = doc.createElement('li');
          li.append(inlineDom(it.c, doc));
          if (it.sub) {
            const ul = doc.createElement('ul');
            for (const s of it.sub) { const sli = doc.createElement('li'); sli.append(inlineDom(s, doc)); ul.append(sli); }
            li.append(ul);
          }
          el.append(li);
        }
        break;
      case 'table': {
        const wrap = doc.createElement('div');
        wrap.className = 'table-wrap';
        wrap.setAttribute('tabindex', '0');
        const tbl = doc.createElement('table');
        const thead = doc.createElement('thead'), tr = doc.createElement('tr');
        b.head.forEach((c, ci) => {
          const th = doc.createElement('th');
          th.setAttribute('scope', 'col');
          if (b.align[ci]) th.setAttribute('data-align', b.align[ci]);
          th.append(inlineDom(c, doc));
          tr.append(th);
        });
        thead.append(tr);
        const tbody = doc.createElement('tbody');
        for (const r of b.rows) {
          const row = doc.createElement('tr');
          r.forEach((c, ci) => {
            const td = doc.createElement('td');
            if (b.align[ci]) td.setAttribute('data-align', b.align[ci]);
            td.append(inlineDom(c, doc));
            row.append(td);
          });
          tbody.append(row);
        }
        tbl.append(thead, tbody);
        wrap.append(tbl);
        el = wrap;
        break;
      }
      default: continue;
    }
    frag.append(el);
  }
  return frag;
}

/**
 * Render markdown into a DocumentFragment.
 * @param {string} src
 * @param {Document} [doc]
 */
export function renderMarkdown(src, doc = globalThis.document) {
  return blocksDom(parseMarkdown(src), doc);
}

/** Strip markdown to speakable plain text. */
export function toPlain(src) {
  return String(src ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
