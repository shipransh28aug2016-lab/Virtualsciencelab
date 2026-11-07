// PDF writer. DOM available -> styled pages rasterised via canvas and embedded as JPEG (any script, incl. Devanagari).
// Otherwise a built-in Latin-only text writer (standard 14 fonts, WinAnsi). Reader lives in pdf-read.js.
import { deflateZlib } from './zip.js';
import { utf8, concat, imgInfo } from './util.js';
import { layout, latinMeasure, A4 } from './pdf-layout.js';
export { read } from './pdf-read.js';

const FONT_STACK = '"Noto Sans Devanagari","Noto Sans","Mangal","Nirmala UI","Segoe UI",Roboto,system-ui,sans-serif';
const MONO_STACK = 'Consolas,"Courier New",monospace';
const WIN = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };

/** Encode text to a WinAnsi PDF literal body (escaped). Returns {s, lost}. */
export function winAnsi(text) {
  let s = '', lost = 0;
  for (const ch of String(text)) {
    let c = ch.codePointAt(0);
    if (c === 0xa0) c = 0x20;
    if (c >= 0x20 && c <= 0x7e) { s += c === 0x28 || c === 0x29 || c === 0x5c ? '\\' + ch : ch; continue; }
    if (c >= 0xa1 && c <= 0xff) { s += '\\' + c.toString(8); continue; }
    if (WIN[c]) { s += '\\' + WIN[c].toString(8); continue; }
    if (/[̀-ͯ​-‏️]/.test(ch)) continue;
    if (c === 9 || c === 10 || c === 13) { s += ' '; continue; }
    s += '?'; lost++;
  }
  return { s, lost };
}
const rgb = (hex) => { const h = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!h) return '0 0 0'; const n = parseInt(h[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => +(v / 255).toFixed(3)).join(' '); };
const f2 = (n) => +n.toFixed(2);
const latin1 = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const hex16 = (s) => '<FEFF' + [...s].map((c) => { const cp = c.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000; return (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); } return cp.toString(16).padStart(4, '0'); }).join('') + '>';
const pdfStr = (s) => (/^[\x20-\x7e]*$/.test(s) ? '(' + s.replace(/[\\()]/g, '\\$&') + ')' : hex16(s));

class Builder {
  constructor() { this.bodies = []; }
  alloc() { this.bodies.push(null); return this.bodies.length; }
  put(id, body) { this.bodies[id - 1] = body; }
  add(body) { const id = this.alloc(); this.put(id, body); return id; }
  async stream(dict, data, compress = true) {
    let d = data, extra = '';
    if (compress && data.length > 120) { const z = await deflateZlib(data); if (z.length < data.length) { d = z; extra = ' /Filter /FlateDecode'; } }
    return concat([latin1(`<< ${dict}${extra} /Length ${d.length} >>\nstream\n`), d, latin1('\nendstream')]);
  }
  finish(rootId, infoId) {
    const parts = [latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]; let off = parts[0].length; const offs = [];
    this.bodies.forEach((b, i) => {
      const body = typeof b === 'string' ? latin1(b) : b; const head = latin1(`${i + 1} 0 obj\n`); const tail = latin1('\nendobj\n');
      offs.push(off); parts.push(head, body, tail); off += head.length + body.length + tail.length;
    });
    const n = this.bodies.length + 1;
    let x = `xref\n0 ${n}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    x += `trailer\n<< /Size ${n} /Root ${rootId} 0 R${infoId ? ` /Info ${infoId} 0 R` : ''} >>\nstartxref\n${off}\n%%EOF\n`;
    parts.push(latin1(x)); return concat(parts);
  }
}

function canvasKind() {
  try {
    if (typeof OffscreenCanvas !== 'undefined' && new OffscreenCanvas(1, 1).getContext('2d')) return 'offscreen';
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') { const c = document.createElement('canvas'); if (c.getContext && c.getContext('2d')) return 'dom'; }
  } catch { /* no canvas */ }
  return null;
}
const mkCanvas = (kind, w, h) => { if (kind === 'offscreen') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const fontStr = (st, scale = 1) => `${st.italic ? 'italic ' : ''}${st.bold ? '700 ' : '400 '}${(st.size || 11) * scale}px ${st.mono ? MONO_STACK : FONT_STACK}`;
async function canvasToJpeg(c, q = 0.9) {
  const blob = c.convertToBlob ? await c.convertToBlob({ type: 'image/jpeg', quality: q }) : await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
  return new Uint8Array(await blob.arrayBuffer());
}
async function loadImage(data, mime) {
  const blob = new Blob([data], { type: mime });
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
}
/** Default rasteriser: draws layout pages onto canvases and returns JPEG bytes. */
export function canvasRasterizer(kind, scale = 2) {
  return async (pages, { size }) => {
    const out = [];
    for (const pg of pages) {
      const c = mkCanvas(kind, Math.round(size.w * scale), Math.round(size.h * scale)); const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.textBaseline = 'alphabetic';
      for (const cmd of pg.cmds) {
        if (cmd.k === 'rect') { if (cmd.fill) { g.fillStyle = cmd.fill; g.fillRect(cmd.x * scale, cmd.y * scale, cmd.w * scale, cmd.h * scale); } if (cmd.stroke) { g.strokeStyle = cmd.stroke; g.lineWidth = (cmd.lw || 0.5) * scale; g.strokeRect(cmd.x * scale, cmd.y * scale, cmd.w * scale, cmd.h * scale); } }
        else if (cmd.k === 'text') { g.font = fontStr(cmd, scale); g.fillStyle = cmd.color || '#000000'; g.fillText(cmd.text, cmd.x * scale, cmd.y * scale); }
        else if (cmd.k === 'img') { try { const im = await loadImage(cmd.data, cmd.info.mime); g.drawImage(im, cmd.x * scale, cmd.y * scale, cmd.w * scale, cmd.h * scale); } catch { /* skip undecodable image */ } }
      }
      out.push({ data: await canvasToJpeg(c), width: c.width, height: c.height });
    }
    return out;
  };
}

/**
 * Create a PDF.
 * @param {{title?:string,lang?:string,blocks?:object[],meta?:{author?:string,subject?:string,header?:string,footer?:string},orientation?:string}} spec
 * @param {{rasterizer?:Function, forceBuiltin?:boolean, measure?:Function, scale?:number}} [opts]
 * @returns {Promise<{bytes:Uint8Array, mode:'raster'|'builtin', pages:number, warnings:string[]}>}
 */
export async function write(spec = {}, opts = {}) {
  const warnings = []; const kind = opts.forceBuiltin ? null : canvasKind();
  const raster = !opts.forceBuiltin && (opts.rasterizer || kind) ? opts.rasterizer || canvasRasterizer(kind, opts.scale || 2) : null;
  let measure = latinMeasure;
  if (raster) {
    if (opts.measure) measure = opts.measure;
    else if (kind) { const g = mkCanvas(kind, 4, 4).getContext('2d'); measure = (t, st) => { g.font = fontStr({ ...st, size: 100 }); return (g.measureText(t).width * (st.size || 11)) / 100; }; try { if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready; } catch { /* ignore */ } }
  }
  const lay = layout(spec, measure, { pageLabel: spec.lang === 'hi' && raster ? 'पृष्ठ' : 'Page', imageOk: raster ? undefined : (i) => i.type === 'jpeg' && (i.comps === 1 || i.comps === 3) });
  const B = new Builder(); const catalog = B.alloc(), pagesId = B.alloc();
  const fontIds = ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique', 'Courier', 'Courier-Bold'].map((n) => B.add(`<< /Type /Font /Subtype /Type1 /BaseFont /${n} /Encoding /WinAnsiEncoding >>`));
  const fontRes = `/Font << ${fontIds.map((id, i) => `/F${i + 1} ${id} 0 R`).join(' ')} >>`;
  const fontName = (c) => (c.mono ? (c.bold ? '/F6' : '/F5') : c.bold ? (c.italic ? '/F4' : '/F2') : c.italic ? '/F3' : '/F1');
  const { size } = lay; let lost = 0; const pageIds = [];
  const rasters = raster ? await raster(lay.pages, { size, spec }) : null;
  for (let pi = 0; pi < lay.pages.length; pi++) {
    const pg = lay.pages[pi]; let content = ''; let xo = ''; const xobjs = [];
    const text = (c, invisible) => {
      const e = winAnsi(c.text); lost += invisible ? 0 : e.lost; const body = invisible ? e.s.replace(/\?/g, '') : e.s; if (!body.trim()) return '';
      return `BT ${fontName(c)} ${f2(c.size)} Tf 1 0 0 1 ${f2(c.x)} ${f2(size.h - c.y)} Tm (${body}) Tj ET\n`;
    };
    if (rasters) {
      const r = rasters[pi]; const imId = B.add(await B.stream(`/Type /XObject /Subtype /Image /Width ${r.width} /Height ${r.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, r.data, false));
      xo = `/XObject << /Im0 ${imId} 0 R >>`; content = `q ${f2(size.w)} 0 0 ${f2(size.h)} 0 0 cm /Im0 Do Q\nBT 3 Tr ET\n3 Tr\n`;
      for (const c of pg.cmds) if (c.k === 'text') content += text(c, true);
      content += '0 Tr\n';
    } else {
      for (const c of pg.cmds) {
        if (c.k === 'rect') {
          if (c.fill) content += `${rgb(c.fill)} rg ${f2(c.x)} ${f2(size.h - c.y - c.h)} ${f2(c.w)} ${f2(c.h)} re f\n`;
          if (c.stroke) content += `${rgb(c.stroke)} RG ${f2(c.lw || 0.5)} w ${f2(c.x)} ${f2(size.h - c.y - c.h)} ${f2(c.w)} ${f2(c.h)} re S\n`;
        } else if (c.k === 'text') content += `${rgb(c.color)} rg\n` + text(c, false);
        else if (c.k === 'img') {
          const info = imgInfo(c.data); const imId = B.add(await B.stream(`/Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} /ColorSpace ${info.comps === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, c.data, false));
          const nm = `Im${xobjs.length + 1}`; xobjs.push(`/${nm} ${imId} 0 R`); content += `q ${f2(c.w)} 0 0 ${f2(c.h)} ${f2(c.x)} ${f2(size.h - c.y - c.h)} cm /${nm} Do Q\n`;
        }
      }
      if (xobjs.length) xo = `/XObject << ${xobjs.join(' ')} >>`;
    }
    const cid = B.add(await B.stream('', latin1(content)));
    pageIds.push(B.add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f2(size.w)} ${f2(size.h)}] /Resources << ${fontRes} ${xo} >> /Contents ${cid} 0 R >>`));
  }
  B.put(pagesId, `<< /Type /Pages /Kids [${pageIds.map((i) => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`);
  const textId = B.add(await B.stream('/Type /GuruText', utf8(lay.text)));
  B.put(catalog, `<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (${spec.lang === 'hi' ? 'hi-IN' : 'en-IN'}) /GuruText ${textId} 0 R >>`);
  const d = new Date(); const pd = (n) => String(n).padStart(2, '0');
  const dstr = `D:${d.getUTCFullYear()}${pd(d.getUTCMonth() + 1)}${pd(d.getUTCDate())}${pd(d.getUTCHours())}${pd(d.getUTCMinutes())}${pd(d.getUTCSeconds())}Z`;
  const info = B.add(`<< /Title ${pdfStr(spec.title || '')} /Author ${pdfStr(spec.meta?.author || 'Guru')} /Subject ${pdfStr(spec.meta?.subject || '')} /Creator (Guru) /Producer (Guru files module) /CreationDate (${dstr}) >>`);
  if (lost) warnings.push(`${lost} non-Latin character(s) replaced with "?": the built-in PDF writer is Latin-only. Generate the PDF in a browser (canvas) or export DOCX for Hindi/Unicode text.`);
  return { bytes: B.finish(catalog, info), mode: raster ? 'raster' : 'builtin', pages: lay.pages.length, warnings };
}
export { A4 };
