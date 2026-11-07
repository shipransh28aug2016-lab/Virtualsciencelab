// Page layout engine shared by the canvas rasteriser and the built-in Latin PDF writer.
// Works in PDF points with a top-down y axis; emits draw commands per page.
import { parseInline, resolveImage } from './util.js';

export const A4 = { w: 595.28, h: 841.89 };
// Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32..126.
const HN = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
/** Width in points of Latin text in Helvetica (approx. for non-ASCII). */
export function latinMeasure(text, st) {
  const sz = st.size || 11; let w = 0;
  for (const ch of String(text)) { const c = ch.codePointAt(0); w += st.mono ? 600 : c >= 32 && c <= 126 ? (st.bold ? HB : HN)[c - 32] : 556; }
  return (w * sz) / 1000;
}

const seg = (s) => (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment) : [...s]);

/**
 * Lay out a document spec into pages.
 * @param {object} spec doc spec
 * @param {(text:string, st:{size:number,bold?:boolean,italic?:boolean,mono?:boolean})=>number} measure
 * @param {{pageLabel?:string, size?:{w:number,h:number}, imageOk?:(info)=>boolean, baseSize?:number}} [opt]
 * @returns {{pages:{cmds:object[],lines:string[]}[], size:{w:number,h:number}, text:string}}
 */
export function layout(spec, measure, opt = {}) {
  const size = opt.size || (spec.orientation === 'landscape' ? { w: A4.h, h: A4.w } : A4);
  const M = { l: 54, r: 54, t: 66, b: 66 }; const W = size.w - M.l - M.r; const bottom = size.h - M.b;
  const base = opt.baseSize || 11; const pages = []; let page, y;
  const newPage = () => { page = { cmds: [], lines: [] }; pages.push(page); y = M.t; };
  newPage();
  const ensure = (h) => { if (y + h > bottom && y > M.t + 1) newPage(); };
  const wrap = (text, width, st) => {
    const lines = []; let cur = [], cw = 0;
    const flush = () => { while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) { cw -= cur[cur.length - 1].w; cur.pop(); } lines.push({ segs: cur, w: Math.max(cw, 0) }); cur = []; cw = 0; };
    const add = (t, s) => { const w = measure(t, { ...st, ...s, size: st.size }); cur.push({ text: t, st: { ...st, ...s }, w }); cw += w; };
    for (const run of parseInline(text)) {
      const rs = { b: run.b, i: run.i, mono: run.mono, bold: st.bold || run.b, italic: st.italic || run.i };
      for (const part of run.text.split(/(\n)/)) {
        if (part === '\n') { flush(); continue; }
        for (const tok of part.split(/(\s+)/)) {
          if (!tok) continue; const w = measure(tok, { ...st, ...rs, size: st.size });
          if (/^\s+$/.test(tok)) { if (cur.length) add(' ', rs); continue; }
          if (cw + w > width && cur.length) flush();
          if (w > width) { let piece = ''; for (const g of seg(tok)) { if (measure(piece + g, { ...st, ...rs, size: st.size }) > width && piece) { add(piece, rs); flush(); piece = ''; } piece += g; } if (piece) add(piece, rs); }
          else add(tok, rs);
        }
      }
    }
    if (cur.length || !lines.length) flush();
    return lines;
  };
  const emit = (lines, x, width, st, lh, align = 'left', color) => {
    for (const ln of lines) {
      ensure(lh); let px = x + (align === 'center' ? (width - ln.w) / 2 : align === 'right' ? width - ln.w : 0);
      for (const sg of ln.segs) { page.cmds.push({ k: 'text', x: px, y: y + st.size * 1.08, text: sg.text, size: st.size, bold: !!sg.st.bold, italic: !!sg.st.italic, mono: !!sg.st.mono, color: color || st.color }); px += sg.w; }
      page.lines.push(ln.segs.map((s) => s.text).join('')); y += lh;
    }
  };
  const para = (text, st, o = {}) => { const x = M.l + (o.indent || 0); const lines = wrap(text, W - (o.indent || 0), st); emit(lines, x, W - (o.indent || 0), st, st.size * (o.lead || 1.4), o.align, o.color); return lines; };
  const gap = (h) => { y += h; };
  const heading = (text, sz, color, before, after, align) => {
    gap(before); const st = { size: sz, bold: true, color }; const lines = wrap(text, W, st); ensure(lines.length * sz * 1.3 + sz * 1.4 + after);
    emit(lines, M.l, W, st, sz * 1.3, align); gap(after);
  };
  const cellText = (c) => (c && typeof c === 'object' ? c.text ?? '' : c ?? '');
  const table = (b) => {
    const header = b.header || null; const rows = (b.rows || []).map((r) => (Array.isArray(r) ? r : [r])); const all = header ? [header, ...rows] : rows;
    if (!all.length) return; const n = Math.max(1, ...all.map((r) => r.length));
    const ratios = Array.isArray(b.widths) && b.widths.length === n ? b.widths : Array(n).fill(1); const sum = ratios.reduce((a, c) => a + c, 0);
    const cw = ratios.map((r) => (W * r) / sum); const pad = 4; const sz = base - 1; const lh = sz * 1.35; const usable = bottom - M.t;
    const drawRow = (r, head, zebra) => {
      const cells = Array.from({ length: n }, (_, i) => wrap(String(cellText(r[i])), cw[i] - 2 * pad, { size: sz, bold: head }));
      let lc = Math.max(...cells.map((c) => c.length)); let h = lc * lh + 2 * pad;
      if (h > usable) { lc = Math.floor((usable - 2 * pad) / lh); h = lc * lh + 2 * pad; }
      return { cells, h, lc, head, zebra };
    };
    const paint = (row) => {
      let x = M.l; const startY = y;
      row.cells.forEach((lines, i) => {
        if (row.head) page.cmds.push({ k: 'rect', x, y: startY, w: cw[i], h: row.h, fill: '#1F3864' }); else if (row.zebra) page.cmds.push({ k: 'rect', x, y: startY, w: cw[i], h: row.h, fill: '#F2F2F2' });
        page.cmds.push({ k: 'rect', x, y: startY, w: cw[i], h: row.h, stroke: '#808080', lw: 0.5 });
        let ly = startY + pad;
        for (const ln of lines.slice(0, row.lc)) {
          let px = x + pad; for (const sg of ln.segs) { page.cmds.push({ k: 'text', x: px, y: ly + sz * 1.08, text: sg.text, size: sz, bold: !!sg.st.bold || row.head, italic: !!sg.st.italic, mono: !!sg.st.mono, color: row.head ? '#FFFFFF' : undefined }); px += sg.w; }
          ly += lh;
        }
        x += cw[i];
      });
      page.lines.push(row.cells.map((c) => c.slice(0, row.lc).map((l) => l.segs.map((s) => s.text).join('')).join(' ')).join(' | '));
      y += row.h;
    };
    const hrow = header ? drawRow(header, true) : null;
    all.forEach((r, ri) => {
      const head = !!header && ri === 0; const row = head ? hrow : drawRow(r, false, (ri - (header ? 1 : 0)) % 2 === 1);
      if (y + row.h > bottom && y > M.t + 1) { newPage(); if (hrow && !head) paint(hrow); }
      paint(row);
    });
    gap(8);
  };

  if (spec.title) { heading(spec.title, 22, '#1F3864', 0, 10, 'center'); }
  for (const raw of spec.blocks || []) {
    const b = typeof raw === 'string' ? { t: 'p', text: raw } : raw; const t = b.t || 'p'; const txt = String(b.text ?? '');
    switch (t) {
      case 'h1': heading(txt, 17, '#1F3864', 12, 6); break;
      case 'h2': heading(txt, 14, '#2F5496', 10, 4); break;
      case 'h3': heading(txt, 12, '#2F5496', 8, 3); break;
      case 'p': para(txt, { size: base, bold: b.bold, italic: b.italic }, { align: b.align }); gap(6); break;
      case 'quote': { const sy = y; const lines = para(txt, { size: base, italic: true, color: '#444444' }, { indent: 14 }); page.cmds.push({ k: 'rect', x: M.l + 2, y: sy, w: 3, h: Math.max(lines.length * base * 1.4, 4), fill: '#808080' }); gap(6); break; }
      case 'math': para(txt, { size: base + 1, italic: true }, { align: 'center' }); gap(6); break;
      case 'code': for (const ln of txt.split('\n')) { ensure(base * 1.3); page.cmds.push({ k: 'rect', x: M.l, y, w: W, h: base * 1.3, fill: '#F2F2F2' }); const lines = wrap(ln || ' ', W - 8, { size: base - 1.5, mono: true }); emit(lines.slice(0, 1), M.l + 4, W - 8, { size: base - 1.5, mono: true }, base * 1.3); } gap(6); break;
      case 'ul': case 'ol': (b.items || []).forEach((it, i) => { const o = typeof it === 'object' ? it : { text: it }; const ind = 16 + 16 * (o.level || 0); ensure(base * 1.4); const mk = t === 'ul' ? (o.level ? '–' : '•') : `${i + 1}.`; page.cmds.push({ k: 'text', x: M.l + ind - 14, y: y + base * 1.08, text: mk, size: base }); para(String(o.text ?? ''), { size: base }, { indent: ind }); gap(2); }); gap(4); break;
      case 'table': case 'bilingual': table(t === 'bilingual' ? { header: b.header, rows: b.rows, widths: [1, 1] } : b); break;
      case 'qa': { para(`${b.no ? b.no + '. ' : ''}${b.q ?? b.question ?? txt}`, { size: base, bold: true }); const a = b.a ?? b.answer; if (a) para(String(a), { size: base }, { indent: 16 }); gap(6); break; }
      case 'img': {
        const im = resolveImage(b);
        if (im && im.info.width && (!opt.imageOk || opt.imageOk(im.info))) {
          let w = Math.min(W, (b.width || im.info.width) * 0.75), h = w * (im.info.height / im.info.width); if (h > bottom - M.t) { h = bottom - M.t; w = h * (im.info.width / im.info.height); }
          ensure(h + 6); page.cmds.push({ k: 'img', x: M.l + (W - w) / 2, y, w, h, data: im.data, info: im.info }); y += h + 6;
        } else para(`[${b.alt || 'image'}]`, { size: base, italic: true });
        break;
      }
      case 'pagebreak': newPage(); break;
      default: para(txt, { size: base }); gap(6);
    }
  }
  const m = spec.meta || {}; const N = pages.length; const label = opt.pageLabel || 'Page';
  pages.forEach((pg, i) => {
    if (m.header) pg.cmds.push({ k: 'text', x: M.l, y: 36, text: String(m.header), size: 9, color: '#595959' });
    const ft = `${label} ${i + 1} / ${N}`; pg.cmds.push({ k: 'text', x: size.w - M.r - measure(ft, { size: 9 }), y: size.h - 34, text: ft, size: 9, color: '#595959' });
    if (m.footer) pg.cmds.push({ k: 'text', x: M.l, y: size.h - 34, text: String(m.footer), size: 9, color: '#595959' });
  });
  return { pages, size, text: pages.map((p) => p.lines.join('\n')).join('\f') };
}
