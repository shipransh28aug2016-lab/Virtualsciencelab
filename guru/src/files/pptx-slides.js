// Slide-level XML generation for the PPTX writer/editor.
import { esc, escAttr } from './xml.js';
import { parseInline, hasDeva, resolveImage } from './util.js';
import { NS, XML, SLIDE_W } from './pptx-parts.js';

const IN = 914400; const E = (v) => Math.round(v * IN);
const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';

function run(text, o, th) {
  const dev = hasDeva(text);
  return `<a:r><a:rPr lang="${dev ? 'hi-IN' : 'en-US'}"${o.sz ? ` sz="${Math.round(o.sz * 100)}"` : ''}${o.b ? ' b="1"' : ''}${o.i ? ' i="1"' : ''} dirty="0">${o.color ? `<a:solidFill><a:srgbClr val="${o.color}"/></a:solidFill>` : ''}<a:latin typeface="${escAttr(o.mono ? 'Consolas' : th.font)}"/><a:cs typeface="${escAttr(th.devFont)}"/></a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}
/** Paragraph from text with inline markdown. opts: {sz,b,i,color,align,bullet,level,spaceAfter} */
export function paragraph(text, o, th) {
  const runs = parseInline(String(text ?? '')).map((r) => run(r.text, { ...o, b: o.b || r.b, i: o.i || r.i, mono: r.mono }, th)).join('');
  const lvl = o.level || 0;
  const ppr = `<a:pPr${o.bullet ? ` marL="${342900 + 400050 * lvl}" indent="-285750"` : ' marL="0" indent="0"'}${o.align ? ` algn="${o.align}"` : ''}${lvl ? ` lvl="${lvl}"` : ''}><a:spcBef><a:spcPts val="${o.before ?? 600}"/></a:spcBef>${o.bullet ? `<a:buClr><a:srgbClr val="${o.bulletColor || th.accent}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="${lvl ? '&#8211;' : '&#8226;'}"/>` : '<a:buNone/>'}</a:pPr>`;
  return `<a:p>${ppr}${runs}<a:endParaRPr lang="en-US"${o.sz ? ` sz="${Math.round(o.sz * 100)}"` : ''}/></a:p>`;
}
const pos = (b) => `<a:xfrm><a:off x="${E(b.x)}" y="${E(b.y)}"/><a:ext cx="${E(b.w)}" cy="${E(b.h)}"/></a:xfrm>`;

class Shapes {
  constructor() { this.id = 1; this.xml = ''; this.images = []; }
  next() { return ++this.id; }
  text(name, b, paras, o = {}) {
    const id = this.next();
    const nv = o.ph ? `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${o.ph}"${o.phIdx != null ? ` idx="${o.phIdx}"` : ''}/></p:nvPr>` : '<p:cNvSpPr txBox="1"/><p:nvPr/>';
    this.xml += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escAttr(name)} ${id}"/>${nv}</p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : '<a:noFill/>'}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${o.anchor || 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
  }
  rect(b, fill, name = 'Accent') {
    const id = this.next();
    this.xml += `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name} ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${pos(b)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  }
  picture(b, im, alt) {
    const id = this.next(); const rid = 'rIdImg' + (this.images.length + 1);
    this.images.push({ rid, ...im });
    // fit inside box preserving aspect
    let { w, h } = b; const ar = im.info.width && im.info.height ? im.info.width / im.info.height : w / h;
    if (w / h > ar) w = h * ar; else h = w / ar;
    const bb = { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
    this.xml += `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${escAttr(alt || '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${pos(bb)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  }
  table(b, rows, th, hasHeader) {
    const id = this.next(); const n = Math.max(1, ...rows.map((r) => r.length)); const rh = Math.min(0.62, b.h / rows.length);
    const sz = rows.length > 9 || n > 5 ? 12 : rows.length > 6 || n > 4 ? 14 : 16;
    const gw = Math.floor(E(b.w) / n); const bd = (t) => `<a:${t} w="9525"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:${t}>`;
    const trs = rows.map((r, ri) => {
      const head = hasHeader && ri === 0;
      const tcs = Array.from({ length: n }, (_, ci) => {
        const c = r[ci]; const o = c && typeof c === 'object' ? c : { text: c };
        const fill = head ? th.primary : o.fill || (ri % 2 ? 'FFFFFF' : th.light);
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${String(o.text ?? '').split('\n').map((ln) => paragraph(ln, { sz, b: head || o.b, color: head ? 'FFFFFF' : th.text, before: 0, align: o.align }, th)).join('')}</a:txBody><a:tcPr marL="91440" marR="91440" marT="45720" marB="45720" anchor="ctr">${['lnL', 'lnR', 'lnT', 'lnB'].map(bd).join('')}<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill></a:tcPr></a:tc>`;
      }).join('');
      return `<a:tr h="${E(rh)}">${tcs}</a:tr>`;
    }).join('');
    this.xml += `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${E(b.x)}" y="${E(b.y)}"/><a:ext cx="${gw * n}" cy="${E(rh) * rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${hasHeader ? 1 : 0}" bandRow="1"/><a:tblGrid>${Array.from({ length: n }, () => `<a:gridCol w="${gw}"/>`).join('')}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
  }
}
const bulletSize = (n, chars) => (n <= 4 && chars < 260 ? 26 : n <= 6 && chars < 420 ? 22 : n <= 9 ? 18 : 15);
const asItems = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : String(v).split('\n'));
const bulletParas = (items, th, sz, color) => items.map((it) => { const o = typeof it === 'object' ? it : { text: it }; return paragraph(o.text, { sz: o.level ? sz - 3 : sz, bullet: true, level: Math.min(o.level || 0, 3), color: color || th.text }, th); }).join('');
const charsOf = (items) => items.reduce((n, it) => n + String(typeof it === 'object' ? it.text : it).length, 0);

/**
 * Build slide XML for a slide spec.
 * @returns {{xml:string, images:object[], notesParas:string|null}}
 */
export function buildSlide(sl, th, size = { w: 13.333, h: 7.5 }) {
  const S = new Shapes(); const W = size.w, H = size.h; const kind = sl.layout || (sl.table ? 'table' : sl.quote ? 'quote' : sl.columns || sl.left || sl.right ? 'two-col' : 'bullets');
  const title = sl.title ?? ''; let bg = '';
  const padX = 0.6 * (W / 13.333), cw = W - 2 * padX;
  const titleBar = () => {
    S.text('Title', { x: padX, y: 0.35, w: cw, h: 1.0 }, paragraph(title, { sz: String(title).length > 60 ? 26 : 32, b: true, color: th.primary, before: 0 }, th), { ph: 'title', anchor: 'ctr' });
    S.rect({ x: padX + 0.1, y: 1.38, w: 1.2, h: 0.06 }, th.accent);
  };
  const img = resolveImage(sl.image);
  if (kind === 'title') {
    bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${th.primary}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    S.text('Title', { x: 0.9, y: 2.2, w: W - 1.8, h: 1.8 }, paragraph(title, { sz: String(title).length > 50 ? 36 : 44, b: true, color: 'FFFFFF', before: 0 }, th), { ph: 'title', anchor: 'b' });
    S.rect({ x: 1.0, y: 4.15, w: 1.6, h: 0.07 }, th.accent);
    const sub = sl.subtitle ?? (Array.isArray(sl.bullets) ? sl.bullets.map((b) => (typeof b === 'object' ? b.text : b)).join('\n') : sl.bullets);
    if (sub) S.text('Subtitle', { x: 0.9, y: 4.4, w: W - 1.8, h: 1.8 }, asItems(sub).map((t) => paragraph(t, { sz: 22, color: 'E7E6E6', before: 300 }, th)).join(''));
    if (img) S.picture({ x: W - 3.4, y: 0.5, w: 2.8, h: 2.0 }, img, sl.alt || title);
  } else if (kind === 'quote') {
    bg = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${th.light}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    S.rect({ x: 1.0, y: 1.5, w: 0.1, h: 3.6 }, th.accent);
    const q = sl.quote ?? asItems(sl.bullets)[0] ?? title;
    S.text('Quote', { x: 1.4, y: 1.4, w: W - 2.8, h: 3.8 }, paragraph(q, { sz: String(q).length > 160 ? 26 : 34, i: true, color: th.primary, before: 0 }, th), { anchor: 'ctr' });
    const by = sl.author ?? sl.by ?? sl.attribution; if (by) S.text('Attribution', { x: 1.4, y: 5.4, w: W - 2.8, h: 0.6 }, paragraph('— ' + by, { sz: 20, color: th.muted, before: 0 }, th));
    if (title) S.text('Title', { x: padX, y: 0.3, w: cw, h: 0.8 }, paragraph(title, { sz: 20, b: true, color: th.muted, before: 0 }, th), { ph: 'title' });
  } else if (kind === 'table') {
    titleBar();
    const header = sl.table?.header || null; const rows = sl.table?.rows || (Array.isArray(sl.table) ? sl.table : []);
    const all = header ? [header, ...rows] : rows;
    if (all.length) S.table({ x: padX + 0.1, y: 1.75, w: cw - 0.2, h: 4.9 }, all, th, !!header || sl.table?.headerRow !== false && !!header);
  } else if (kind === 'two-col') {
    titleBar();
    let cols = sl.columns || [sl.left ?? null, sl.right ?? null];
    if (!sl.columns && sl.left == null && sl.right == null) { const b = asItems(sl.bullets); const h = Math.ceil(b.length / 2); cols = [b.slice(0, h), b.slice(h)]; }
    const colW = (cw - 0.4) / 2;
    cols.slice(0, 2).forEach((c, i) => {
      const o = c && !Array.isArray(c) && typeof c === 'object' ? c : { bullets: c }; const items = asItems(o.bullets ?? o.items ?? o.text);
      const sz = bulletSize(items.length, charsOf(items)) - 2; let y = 1.75;
      if (o.heading) { S.text('Heading', { x: padX + i * (colW + 0.4), y, w: colW, h: 0.6 }, paragraph(o.heading, { sz: 22, b: true, color: th.accent, before: 0 }, th)); y += 0.65; }
      S.text('Content', { x: padX + i * (colW + 0.4), y, w: colW, h: 6.9 - y }, bulletParas(items, th, sz), { ph: i === 0 && !o.heading ? 'body' : undefined, phIdx: i === 0 && !o.heading ? 1 : undefined });
    });
  } else {
    titleBar(); const items = asItems(sl.bullets ?? sl.text);
    const sz = bulletSize(items.length, charsOf(items)); const wide = img ? cw * 0.58 : cw;
    S.text('Content', { x: padX + 0.1, y: 1.75, w: wide, h: 5.1 }, bulletParas(items, th, sz), { ph: 'body', phIdx: 1 });
    if (img) S.picture({ x: padX + wide + 0.3, y: 1.8, w: cw - wide - 0.3, h: 4.8 }, img, sl.alt || title);
  }
  const xml = `${XML}<p:sld ${NS}><p:cSld>${bg}<p:spTree>${grp}${S.xml}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const notes = sl.notes ? asItems(sl.notes).map((t) => `<a:p><a:r><a:rPr lang="${hasDeva(t) ? 'hi-IN' : 'en-US'}"/><a:t>${esc(t)}</a:t></a:r></a:p>`).join('') : null;
  return { xml, images: S.images, notesParas: notes };
}
void SLIDE_W;
