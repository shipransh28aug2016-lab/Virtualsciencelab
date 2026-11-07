// Minimal XML helpers: escaping, strict well-formedness parser, text replacement.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
/** Escape text for XML content (also strips illegal control chars). */
export function esc(s) {
  s = String(s ?? '');
  if (typeof s.toWellFormed === 'function') s = s.toWellFormed();
  return s.replace(BAD, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export const escAttr = (s) => esc(s).replace(/"/g, '&quot;');
export function unesc(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) => {
    if (e[0] === '#') { const cp = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch { return ''; } }
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[e];
  });
}
export const local = (n) => n.slice(n.indexOf(':') + 1);

const TOK = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=\/>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>|([^<]+)/gy;
const ATTR = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * Parse XML into {name,local,attrs,children[],text?} nodes. Throws on malformed XML.
 * @param {string} xml
 */
export function parse(xml) {
  const root = { name: '#doc', local: '#doc', attrs: {}, children: [] };
  const stack = [root]; TOK.lastIndex = 0; let pos = 0, m;
  while (pos < xml.length) {
    TOK.lastIndex = pos; m = TOK.exec(xml);
    if (!m) throw new Error('XML not well-formed near offset ' + pos + ': ' + xml.slice(pos, pos + 40));
    pos = TOK.lastIndex; const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push({ name: '#text', local: '#text', text: m[1] });
    else if (m[3]) {
      if (m[2]) {
        if (stack.length < 2 || top.name !== m[3]) throw new Error(`XML not well-formed: unexpected </${m[3]}>`);
        stack.pop();
      } else {
        const attrs = {}; let a; ATTR.lastIndex = 0;
        while ((a = ATTR.exec(m[4]))) { if (a[1] in attrs) throw new Error('Duplicate attribute ' + a[1]); attrs[a[1]] = unesc(a[2] ?? a[3]); }
        const el = { name: m[3], local: local(m[3]), attrs, children: [] };
        top.children.push(el);
        if (!m[5]) stack.push(el);
      }
    } else if (m[6] !== undefined) {
      if (/&(?!(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);)/.test(m[6])) throw new Error('XML not well-formed: bad entity');
      top.children.push({ name: '#text', local: '#text', text: unesc(m[6]) });
    }
  }
  if (stack.length !== 1) throw new Error('XML not well-formed: unclosed <' + stack[stack.length - 1].name + '>');
  const els = root.children.filter((c) => c.name !== '#text');
  if (els.length !== 1) throw new Error('XML not well-formed: expected single root');
  return els[0];
}
/** Well-formedness check. @returns {true} or throws */
export function assertWellFormed(xml) { parse(xml); return true; }

export const kids = (n, l) => (n?.children || []).filter((c) => c.local === l);
export const kid = (n, l) => (n?.children || []).find((c) => c.local === l);
export function desc(n, l, out = []) {
  for (const c of n?.children || []) { if (c.local === l) out.push(c); if (c.children) desc(c, l, out); }
  return out;
}
export function textOf(n) {
  if (!n) return '';
  if (n.name === '#text') return n.text;
  return (n.children || []).map(textOf).join('');
}

/**
 * Replace text inside paragraph runs of serialized XML (works across run boundaries).
 * P = paragraph tag (w:p | a:p), T = text tag (w:t | a:t).
 * @returns {{xml:string,count:number}}
 */
export function replaceInParagraphs(xml, P, T, find, repl, all = true) {
  let count = 0; if (!find) return { xml, count };
  const pRe = new RegExp(`<${P}(?:\\s[^>]*[^/>])?>[\\s\\S]*?</${P}>`, 'g');
  const tRe = new RegExp(`(<${T}(?:\\s[^>]*)?>)([^<]*)(</${T}>)`, 'g');
  const out = xml.replace(pRe, (para) => {
    if (!all && count) return para;
    const segs = []; let m; tRe.lastIndex = 0;
    while ((m = tRe.exec(para))) segs.push({ at: m.index, len: m[0].length, open: m[1], close: m[3], text: unesc(m[2]) });
    if (!segs.length) return para;
    const joined = segs.map((s) => s.text).join('');
    const hits = []; let from = 0, i;
    while ((i = joined.indexOf(find, from)) !== -1) { hits.push(i); from = i + find.length; if (!all) break; }
    if (!hits.length) return para;
    const offs = []; let o = 0; for (const s of segs) { offs.push(o); o += s.text.length; }
    for (const s of hits.slice().reverse()) {
      const e = s + find.length; let first = true;
      segs.forEach((sg, k) => {
        const a = offs[k], b = a + sg.text.length;
        if (sg.text.length === 0 || !(a < e && b > s)) return;
        const ls = Math.max(s, a) - a, le = Math.min(e, b) - a;
        sg.text = sg.text.slice(0, ls) + (first ? repl : '') + sg.text.slice(le); first = false;
      });
      count++;
    }
    let res = para;
    for (let k = segs.length - 1; k >= 0; k--) {
      const s = segs[k]; let open = s.open;
      if (!/xml:space=/.test(open)) open = open.replace(/>$/, ' xml:space="preserve">');
      res = res.slice(0, s.at) + open + esc(s.text) + s.close + res.slice(s.at + s.len);
    }
    return res;
  });
  return { xml: out, count };
}
