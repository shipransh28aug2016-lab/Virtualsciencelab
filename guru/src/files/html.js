// HTML writer (standalone, print-ready) and lightweight reader.
import { esc, escAttr, unesc } from './xml.js';
import { parseInline, resolveImage, b64encode } from './util.js';

const inline = (t) => parseInline(t).map((r) => { const x = esc(r.text).replace(/\n/g, '<br>'); return r.mono ? `<code>${x}</code>` : r.b ? `<strong>${x}</strong>` : r.i ? `<em>${x}</em>` : x; }).join('');
const cell = (c, tag) => { const o = c && typeof c === 'object' ? c : { text: c }; return `<${tag}${o.span > 1 ? ` colspan="${o.span}"` : ''}${o.align ? ` style="text-align:${escAttr(o.align)}"` : ''}>${inline(o.text ?? '')}</${tag}>`; };

/**
 * Render a document spec to standalone HTML.
 * @param {{title?:string,lang?:string,blocks?:object[],meta?:object}} spec
 */
export function write(spec = {}) {
  const lang = spec.lang === 'hi' ? 'hi' : 'en'; const body = [];
  if (spec.title) body.push(`<h1 class="doc-title">${inline(spec.title)}</h1>`);
  for (const b of spec.blocks || []) {
    const x = typeof b === 'string' ? { t: 'p', text: b } : b; const t = x.t || 'p';
    if (t === 'h1' || t === 'h2' || t === 'h3') body.push(`<${t === 'h1' && spec.title ? 'h2' : t}>${inline(x.text)}</${t === 'h1' && spec.title ? 'h2' : t}>`);
    else if (t === 'ul' || t === 'ol') body.push(`<${t}>${(x.items || []).map((i) => `<li${typeof i === 'object' && i.level ? ` style="margin-left:${i.level * 1.5}em"` : ''}>${inline(typeof i === 'object' ? i.text : i)}</li>`).join('')}</${t}>`);
    else if (t === 'table' || t === 'bilingual') body.push(`<table>${x.header ? `<thead><tr>${x.header.map((c) => cell(c, 'th')).join('')}</tr></thead>` : ''}<tbody>${(x.rows || []).map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')}</tbody></table>`);
    else if (t === 'quote') body.push(`<blockquote>${inline(x.text)}</blockquote>`);
    else if (t === 'code') body.push(`<pre><code>${esc(x.text)}</code></pre>`);
    else if (t === 'math') body.push(`<p class="math">${esc(x.text)}</p>`);
    else if (t === 'qa') body.push(`<div class="qa"><p class="q">${x.no ? esc(x.no) + '. ' : ''}${inline(x.q ?? x.question ?? x.text)}</p><p class="a">${inline(x.a ?? x.answer ?? '')}</p></div>`);
    else if (t === 'img') { const im = resolveImage(x); body.push(im ? `<img alt="${escAttr(x.alt || '')}" src="data:${im.info.mime};base64,${b64encode(im.data)}">` : x.src && /^(https?:|data:image\/)/.test(x.src) ? `<img alt="${escAttr(x.alt || '')}" src="${escAttr(x.src)}">` : `<p><em>[${esc(x.alt || 'image')}]</em></p>`); }
    else if (t === 'pagebreak') body.push('<div class="pagebreak"></div>');
    else body.push(`<p>${inline(x.text ?? '')}</p>`);
  }
  const m = spec.meta || {};
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(spec.title || 'Document')}</title>${m.author ? `<meta name="author" content="${escAttr(m.author)}">` : ''}<style>`
    + `body{font-family:"Noto Sans Devanagari","Noto Sans","Mangal","Nirmala UI",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;max-width:820px;margin:0 auto;padding:16px;color:#1b1b1b}h1,h2,h3{color:#1F3864;line-height:1.25}.doc-title{text-align:center}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #888;padding:6px 10px;text-align:left;vertical-align:top}th{background:#1F3864;color:#fff}blockquote{margin:12px 0;padding:4px 14px;border-left:4px solid #888;color:#444;font-style:italic}pre{background:#f2f2f2;padding:10px;overflow:auto}code{font-family:Consolas,monospace}.math{text-align:center;font-style:italic}.qa .q{font-weight:700;margin-bottom:2px}.qa .a{margin-top:0;margin-left:1.2em}img{max-width:100%}.pagebreak{break-after:page}`
    + `@media print{body{max-width:none;padding:0}}</style></head><body>${m.header ? `<header>${inline(m.header)}</header>` : ''}\n${body.join('\n')}\n${m.footer ? `<footer>${inline(m.footer)}</footer>` : ''}</body></html>\n`;
}

/** Strip HTML to blocks + plain text. */
export function read(html) {
  let s = String(html ?? '');
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(s) || [])[1];
  s = s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, '').replace(/<head\b[\s\S]*?<\/head>/i, '');
  const blocks = []; const clean = (h) => unesc(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\f\v ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  const re = /<(h[1-6]|p|ul|ol|table|pre|blockquote|div|section|article|li)\b[^>]*>([\s\S]*?)<\/\1>/gi; let m, last = 0;
  const consumed = []; 
  const body = s.replace(/<table\b[\s\S]*?<\/table>/gi, (tb) => { consumed.push(tb); return `\n@@T${consumed.length - 1}@@\n`; }).replace(/<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi, (l) => { consumed.push(l); return `\n@@T${consumed.length - 1}@@\n`; });
  void re; void last; void m;
  const tokRe = /<(h[1-6]|p|pre|blockquote|li|div|section|article|td|th|dd|dt|figcaption|header|footer|main)\b[^>]*>([\s\S]*?)<\/\1>|@@T(\d+)@@/gi; let tk, any = false;
  while ((tk = tokRe.exec(body))) {
    any = true;
    if (tk[3] !== undefined) {
      const src = consumed[+tk[3]];
      if (/^<table/i.test(src)) blocks.push({ t: 'table', rows: [...src.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((tr) => [...tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => clean(c[1]))) });
      else blocks.push({ t: /^<ol/i.test(src) ? 'ol' : 'ul', items: [...src.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((c) => clean(c[1])) });
    } else {
      const tag = tk[1].toLowerCase(); const inner = tk[2]; if (/<(p|div|h[1-6]|li|table)\b/i.test(inner) && (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main')) { tokRe.lastIndex = tk.index + tk[0].indexOf('>') + 1; continue; }
      const text = clean(inner); if (!text) continue;
      blocks.push(/^h[1-6]$/.test(tag) ? { t: 'h' + Math.min(3, +tag[1]), text } : tag === 'blockquote' ? { t: 'quote', text } : tag === 'pre' ? { t: 'code', text } : { t: 'p', text });
    }
  }
  if (!any) { const t = clean(body); if (t) blocks.push({ t: 'p', text: t }); }
  const text = blocks.map((b) => (/^h\d$/.test(b.t) ? '#'.repeat(+b.t[1]) + ' ' + b.text : b.t === 'ul' ? b.items.map((i) => '- ' + i).join('\n') : b.t === 'ol' ? b.items.map((i, n) => `${n + 1}. ${i}`).join('\n') : b.t === 'table' ? b.rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n') : b.text)).join('\n\n');
  return { format: 'html', text, blocks, meta: { title: title ? clean(title) : undefined } };
}
