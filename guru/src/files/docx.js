// DOCX writer / reader / editor (WordprocessingML), zero deps.
import * as Z from './zip.js';
import { esc, escAttr, parse, kids, kid, desc, textOf, replaceInParagraphs } from './xml.js';
import { toU8, parseInline, hasDeva, resolveImage, utf8, MIME } from './util.js';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS = `xmlns:w="${NS_W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const px2emu = (px) => Math.round(px * 9525);

function rPr(o, dev) {
  let s = '';
  if (o.mono) s += `<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="${escAttr(dev)}"/>`;
  if (o.b) s += '<w:b/><w:bCs/>';
  if (o.i) s += '<w:i/><w:iCs/>';
  if (o.color) s += `<w:color w:val="${escAttr(String(o.color).replace('#', ''))}"/>`;
  if (o.size) s += `<w:sz w:val="${Math.round(o.size * 2)}"/><w:szCs w:val="${Math.round(o.size * 2)}"/>`;
  if (o.u) s += '<w:u w:val="single"/>';
  if (o.hi) s += `<w:shd w:val="clear" w:color="auto" w:fill="${escAttr(o.hi)}"/>`;
  if (o.deva) s += '<w:lang w:bidi="hi-IN"/>';
  return s;
}
function runXml(text, o, dev) {
  const props = rPr({ ...o, deva: hasDeva(text) }, dev);
  let inner = '';
  for (const p of String(text).split(/(\n|\t)/)) {
    if (p === '\n') inner += '<w:br/>'; else if (p === '\t') inner += '<w:tab/>';
    else if (p) inner += `<w:t xml:space="preserve">${esc(p)}</w:t>`;
  }
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${inner}</w:r>`;
}
function inlineRuns(text, base, dev) {
  return parseInline(text).map((r) => runXml(r.text, { ...base, ...(r.b ? { b: true } : {}), ...(r.i ? { i: true } : {}), ...(r.mono ? { mono: true } : {}) }, dev)).join('');
}
function para(content, p = {}) {
  let pp = '';
  if (p.style) pp += `<w:pStyle w:val="${p.style}"/>`;
  if (p.keepNext) pp += '<w:keepNext/>';
  if (p.pageBreakBefore) pp += '<w:pageBreakBefore/>';
  if (p.numId) pp += `<w:numPr><w:ilvl w:val="${p.ilvl || 0}"/><w:numId w:val="${p.numId}"/></w:numPr>`;
  if (p.bar) pp += `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${p.bar}"/></w:pBdr>`;
  if (p.shade) pp += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shade}"/>`;
  if (p.after != null || p.before != null) pp += `<w:spacing${p.before != null ? ` w:before="${p.before}"` : ''}${p.after != null ? ` w:after="${p.after}"` : ''}/>`;
  if (p.ind) pp += `<w:ind w:left="${p.ind}"/>`;
  if (p.align) pp += `<w:jc w:val="${p.align === 'justify' ? 'both' : p.align}"/>`;
  return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ''}${content}</w:p>`;
}

function cellXml(c, w, dev, hdr, fillDefault) {
  const o = c && typeof c === 'object' && !Array.isArray(c) ? c : { text: c };
  const text = o.text == null ? '' : String(o.text);
  const fill = o.fill ? String(o.fill).replace('#', '') : hdr ? fillDefault : null;
  let tcPr = `<w:tcW w:w="${w}" w:type="dxa"/>`;
  if (o.span > 1) tcPr += `<w:gridSpan w:val="${o.span}"/>`;
  if (fill) tcPr += `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  const lines = text.split('\n');
  const ps = lines.map((ln) => para(inlineRuns(ln, { b: o.b || o.bold || hdr, ...(hdr && !o.fill ? { color: 'FFFFFF' } : {}) }, dev), { align: o.align, after: 40, before: 40 })).join('');
  return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${ps}</w:tc>`;
}
function tableXml(b, ctx) {
  const rows = (b.rows || []).map((r) => (Array.isArray(r) ? r : [r]));
  const header = b.header || null;
  const all = header ? [header, ...rows] : rows;
  const ncol = Math.max(1, ...all.map((r) => r.reduce((n, c) => n + (c && c.span > 1 ? c.span : 1), 0)));
  let ratios = Array.isArray(b.widths) && b.widths.length === ncol ? b.widths.map(Number) : Array(ncol).fill(1);
  const sum = ratios.reduce((a, c) => a + c, 0) || ncol;
  const ws = ratios.map((r) => Math.floor((ctx.contentW * r) / sum));
  const bd = (n) => `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="7F7F7F"/>`;
  let x = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${ctx.contentW}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(bd).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${ws.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  all.forEach((r, ri) => {
    const hdr = !!header && ri === 0; let ci = 0;
    x += `<w:tr><w:trPr><w:cantSplit/>${hdr ? '<w:tblHeader/>' : ''}</w:trPr>`;
    const cells = r.slice(); while (cells.reduce((n, c) => n + (c && c.span > 1 ? c.span : 1), 0) < ncol) cells.push('');
    for (const c of cells) {
      const span = c && c.span > 1 ? c.span : 1; let w = 0; for (let k = 0; k < span; k++) w += ws[ci + k] || 0;
      x += cellXml(c, w, ctx.dev, hdr, '1F3864'); ci += span;
    }
    x += '</w:tr>';
  });
  return x + '</w:tbl>' + para('', { after: 60 });
}
function imageXml(b, ctx) {
  const im = resolveImage(b);
  if (!im || !ctx.addImage) return para(inlineRuns(`[${b.alt || b.text || 'image'}]`, { i: true }, ctx.dev));
  const rid = ctx.addImage(im);
  let wpx = b.width || im.info.width || 400, hpx = b.height || im.info.height || 300;
  const maxW = ctx.contentW / 15; if (wpx > maxW) { hpx = hpx * maxW / wpx; wpx = maxW; }
  const cx = px2emu(wpx), cy = px2emu(hpx), id = ctx.nextDocPr();
  return para(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}" descr="${escAttr(b.alt || '')}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`, { align: b.align || 'center' });
}
function listXml(b, ctx) {
  const ordered = b.t === 'ol'; const numId = ctx.listNum(ordered);
  return (b.items || []).map((it) => {
    const o = typeof it === 'object' ? it : { text: it };
    if (ctx.plainLists) return para(inlineRuns(`${ordered ? '•' : '•'} ${o.text}`, {}, ctx.dev), { ind: 720 + 360 * (o.level || 0), after: 40 });
    return para(inlineRuns(String(o.text ?? ''), {}, ctx.dev), { style: 'ListParagraph', numId, ilvl: Math.min(o.level || 0, 2), after: 40 });
  }).join('');
}

/** Convert one block-spec to WordprocessingML. */
export function blockXml(b, ctx) {
  const dev = ctx.dev; const t = b.t || 'p';
  const text = b.text ?? '';
  switch (t) {
    case 'h1': case 'h2': case 'h3': return para(inlineRuns(text, {}, dev), { style: 'Heading' + t[1], align: b.align });
    case 'p': return para(b.runs ? b.runs.map((r) => runXml(r.text, r, dev)).join('') : inlineRuns(text, { b: b.bold, i: b.italic }, dev), { align: b.align });
    case 'quote': return para(inlineRuns(text, { i: true }, dev), { bar: '7F7F7F', ind: 360, after: 120 });
    case 'code': return String(text).split('\n').map((ln) => para(runXml(ln, { mono: true, size: 9.5 }, dev), { shade: 'F2F2F2', after: 0 })).join('') + para('', { after: 60 });
    case 'math': return para(runXml(text, { i: true }, dev), { align: 'center', after: 120 });
    case 'ul': case 'ol': return listXml(b, ctx);
    case 'table': return tableXml(b, ctx);
    case 'bilingual': return tableXml({ header: b.header || null, rows: b.rows, widths: [1, 1] }, ctx);
    case 'img': return imageXml(b, ctx);
    case 'pagebreak': return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    case 'qa': {
      const q = b.q ?? b.question ?? text, a = b.a ?? b.answer ?? (b.items && b.items[0]) ?? '';
      return para(inlineRuns((b.no ? b.no + '. ' : '') + q, { b: true }, dev), { keepNext: true, after: 40 }) + (a !== '' ? para(inlineRuns(String(a), {}, dev), { ind: 360 }) : '');
    }
    default: return para(inlineRuns(String(text), {}, dev));
  }
}

const bulletLvls = [0, 1, 2].map((l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="${['•', '–', '▪'][l]}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:hint="default"/></w:rPr></w:lvl>`).join('');
const decLvls = [['decimal', '%1.'], ['lowerLetter', '%2.'], ['lowerRoman', '%3.']].map(([f, t], l) => `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${f}"/><w:lvlText w:val="${t}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (l + 1)}" w:hanging="360"/></w:pPr></w:lvl>`).join('');
const numberingXml = (nums) => `${XML}<w:numbering ${NS}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:name w:val="guru-bullet"/>${bulletLvls}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:name w:val="guru-decimal"/>${decLvls}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${nums}</w:numbering>`;
const numDef = (id) => `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`;

function stylesXml(dev, lang) {
  const head = (id, name, sz, color, before, after, lvl) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}"/><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="${color}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  return `${XML}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="${escAttr(dev)}" w:cs="${escAttr(dev)}"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="${lang}" w:eastAsia="en-US" w:bidi="hi-IN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
    + `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`
    + `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>`
    + `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>`
    + `<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F3864"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>`
    + head('Heading1', 'heading 1', 32, '1F3864', 360, 120, 0) + head('Heading2', 'heading 2', 28, '2F5496', 240, 80, 1) + head('Heading3', 'heading 3', 24, '2F5496', 200, 60, 2)
    + `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:contextualSpacing/></w:pPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>`
    + `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="595959"/><w:sz w:val="18"/></w:rPr></w:style>`
    + `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr></w:style></w:styles>`;
}

/**
 * Build a .docx.
 * @param {{title?:string,lang?:string,blocks?:object[],meta?:{author?:string,subject?:string,header?:string,footer?:string,devFont?:string},orientation?:'portrait'|'landscape'}} spec
 * @returns {Promise<Uint8Array>}
 */
export async function write(spec = {}) {
  const meta = spec.meta || {}; const dev = meta.devFont || spec.devFont || 'Mangal';
  const lang = spec.lang === 'hi' ? 'hi-IN' : 'en-IN';
  const land = spec.orientation === 'landscape';
  const pgW = land ? 16838 : 11906, pgH = land ? 11906 : 16838, mar = 1134;
  const images = []; let docPr = 0; const nums = []; let nextNum = 2;
  const ctx = {
    dev, contentW: pgW - 2 * mar, nextDocPr: () => ++docPr,
    addImage(im) { const id = 'rIdImg' + (images.length + 1); images.push({ id, name: `media/image${images.length + 1}.${im.info.type === 'jpeg' ? 'jpg' : im.info.type}`, ...im }); return id; },
    listNum(ordered) { if (!ordered) return 1; const id = nextNum++; nums.push(numDef(id)); return id; },
  };
  let body = '';
  if (spec.title) body += para(inlineRuns(spec.title, {}, dev), { style: 'Title' });
  for (const b of spec.blocks || []) body += blockXml(typeof b === 'string' ? { t: 'p', text: b } : b, ctx);
  if (!body) body = para('');
  const hasHeader = !!meta.header;
  const fieldRun = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const footer = `${XML}<w:ftr ${NS}>${para((meta.footer ? inlineRuns(meta.footer, {}, dev) + runXml('\t', {}, dev) : '') + runXml(spec.lang === 'hi' ? 'पृष्ठ ' : 'Page ', {}, dev) + fieldRun, { style: 'Footer' })}</w:ftr>`;
  const header = hasHeader ? `${XML}<w:hdr ${NS}>${para(inlineRuns(meta.header, {}, dev), { style: 'Header' })}</w:hdr>` : null;
  const sect = `<w:sectPr>${hasHeader ? '<w:headerReference w:type="default" r:id="rIdHdr"/>' : ''}<w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="${pgW}" w:h="${pgH}"${land ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1134" w:right="${mar}" w:bottom="1134" w:left="${mar}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`;
  const document = `${XML}<w:document ${NS}><w:body>${body}${sect}</w:body></w:document>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const imgExt = new Set(images.map((i) => (i.info.type === 'jpeg' ? 'jpg' : i.info.type)));
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...imgExt].map((e) => `<Default Extension="${e}" ContentType="${e === 'jpg' ? 'image/jpeg' : 'image/' + e}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>${hasHeader ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' : ''}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const docRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSty" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rIdNum" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rIdSet" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rIdFtr" Type="${REL}/footer" Target="footer1.xml"/>${hasHeader ? `<Relationship Id="rIdHdr" Type="${REL}/header" Target="header1.xml"/>` : ''}${images.map((i) => `<Relationship Id="${i.id}" Type="${REL}/image" Target="${i.name}"/>`).join('')}</Relationships>`;
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(spec.title || '')}</dc:title><dc:subject>${esc(meta.subject || '')}</dc:subject><dc:creator>${esc(meta.author || 'Guru')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Guru</Application></Properties>`;
  const settings = `${XML}<w:settings ${NS}><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="${lang}" w:bidi="hi-IN"/></w:settings>`;
  const files = [
    { name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document }, { name: 'word/_rels/document.xml.rels', data: docRels },
    { name: 'word/styles.xml', data: stylesXml(dev, lang) }, { name: 'word/numbering.xml', data: numberingXml(nums.join('')) },
    { name: 'word/settings.xml', data: settings }, { name: 'word/footer1.xml', data: footer },
    { name: 'docProps/core.xml', data: core }, { name: 'docProps/app.xml', data: app },
  ];
  if (header) files.push({ name: 'word/header1.xml', data: header });
  for (const i of images) files.push({ name: 'word/' + i.name, data: i.data });
  return Z.create(files);
}

// ---------------------------------------------------------------- read
function paraText(p) {
  let s = '';
  const walk = (n) => {
    for (const c of n.children || []) {
      switch (c.local) {
        case 't': s += textOf(c); break;
        case 'tab': s += '\t'; break;
        case 'br': case 'cr': s += c.attrs['w:type'] === 'page' ? '' : '\n'; break;
        case 'noBreakHyphen': s += '-'; break;
        case 'r': case 'hyperlink': case 'fldSimple': case 'ins': case 'smartTag': case 'sdt': case 'sdtContent': walk(c); break;
        default: break;
      }
    }
  };
  walk(p); return s;
}

/**
 * Read a .docx.
 * @returns {Promise<{format:'docx',text:string,blocks:object[],meta:object}>}
 */
export async function read(input) {
  const z = await Z.read(await toU8(input));
  if (!z.has('word/document.xml')) throw new Error('Not a DOCX: word/document.xml missing');
  const doc = parse(await z.text('word/document.xml'));
  const styleName = {};
  if (z.has('word/styles.xml')) for (const s of kids(parse(await z.text('word/styles.xml')), 'style')) styleName[s.attrs['w:styleId']] = (kid(s, 'name')?.attrs['w:val'] || '').toLowerCase();
  const numFmt = {};
  if (z.has('word/numbering.xml')) {
    const nx = parse(await z.text('word/numbering.xml')); const abs = {};
    for (const a of kids(nx, 'abstractNum')) { const l0 = kids(a, 'lvl')[0]; abs[a.attrs['w:abstractNumId']] = kid(l0, 'numFmt')?.attrs['w:val']; }
    for (const n of kids(nx, 'num')) numFmt[n.attrs['w:numId']] = abs[kid(n, 'abstractNumId')?.attrs['w:val']];
  }
  const blocks = []; const body = kid(doc, 'body');
  const handle = (n) => {
    if (n.local === 'p') {
      const ppr = kid(n, 'pPr'); const sid = kid(ppr, 'pStyle')?.attrs['w:val'] || '';
      const sname = styleName[sid] || sid.toLowerCase(); const text = paraText(n);
      const num = kid(ppr, 'numPr');
      const hm = /^heading\s*(\d)/.exec(sname) || /^heading(\d)/.exec(sid.toLowerCase());
      if (/^title$/.test(sname)) { blocks.push({ t: 'title', text }); return; }
      if (hm) { blocks.push({ t: 'h' + Math.min(+hm[1], 6), text }); return; }
      const lvl = +(kid(num, 'ilvl')?.attrs['w:val'] || 0);
      if (num && kid(num, 'numId')?.attrs['w:val'] !== '0') {
        const fmt = numFmt[kid(num, 'numId')?.attrs['w:val']]; const t = fmt === 'bullet' || !fmt ? 'ul' : 'ol';
        const last = blocks[blocks.length - 1];
        if (last && last.t === t && last._n === kid(num, 'numId')?.attrs['w:val']) last.items.push(lvl ? { text, level: lvl } : text);
        else blocks.push({ t, items: [lvl ? { text, level: lvl } : text], _n: kid(num, 'numId')?.attrs['w:val'] });
        return;
      }
      if (n.children.some((c) => c.local === 'r' && kids(c, 'br').some((b) => b.attrs['w:type'] === 'page'))) blocks.push({ t: 'pagebreak' });
      if (text.trim() || !blocks.length || blocks[blocks.length - 1].t !== 'p' || true) { if (text.trim()) blocks.push({ t: 'p', text }); }
    } else if (n.local === 'tbl') {
      const rows = kids(n, 'tr').map((tr) => kids(tr, 'tc').map((tc) => kids(tc, 'p').map(paraText).join('\n').trim()));
      blocks.push({ t: 'table', rows });
    } else if (n.local === 'sdt') { const c = kid(n, 'sdtContent'); (c?.children || []).forEach(handle); }
  };
  (body?.children || []).forEach(handle);
  for (const b of blocks) delete b._n;
  const lines = [];
  for (const b of blocks) {
    if (b.t === 'title') lines.push('# ' + b.text);
    else if (/^h\d$/.test(b.t)) lines.push('#'.repeat(+b.t[1] + (blocks.some((x) => x.t === 'title') ? 1 : 0)).slice(0, 6) + ' ' + b.text);
    else if (b.t === 'p') lines.push(b.text);
    else if (b.t === 'ul' || b.t === 'ol') b.items.forEach((it, i) => { const o = typeof it === 'object' ? it : { text: it, level: 0 }; lines.push('  '.repeat(o.level || 0) + (b.t === 'ul' ? '- ' : `${i + 1}. `) + o.text); });
    else if (b.t === 'table') b.rows.forEach((r) => lines.push('| ' + r.map((c) => c.replace(/\n/g, ' ')).join(' | ') + ' |'));
    else if (b.t === 'pagebreak') lines.push('\f');
    lines.push('');
  }
  const meta = { paragraphs: blocks.filter((b) => b.t === 'p').length, tables: blocks.filter((b) => b.t === 'table').length };
  if (z.has('docProps/core.xml')) {
    const c = parse(await z.text('docProps/core.xml'));
    for (const [k, l] of [['title', 'title'], ['author', 'creator'], ['subject', 'subject'], ['created', 'created'], ['modified', 'modified']]) { const v = textOf(kid(c, l)); if (v) meta[k] = v; }
  }
  for (const nm of z.names) {
    const m = /^word\/(header|footer)\d*\.xml$/.exec(nm);
    if (m) { const t = desc(parse(await z.text(nm)), 'p').map(paraText).join(' ').trim(); if (t) meta[m[1]] = ((meta[m[1]] || '') + ' ' + t).trim(); }
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  meta.words = (text.match(/\S+/g) || []).length;
  return { format: 'docx', text, blocks, meta };
}

// ---------------------------------------------------------------- edit
function setCellText(tcXml, text, dev) {
  const m = /^(<w:tc(?:\s[^>]*)?>)(<w:tcPr>[\s\S]*?<\/w:tcPr>)?([\s\S]*)(<\/w:tc>)$/.exec(tcXml);
  if (!m) return tcXml;
  const firstP = /<w:p(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:p>/.exec(m[3]);
  const ppr = firstP ? (/<w:pPr>[\s\S]*?<\/w:pPr>/.exec(firstP[0]) || [''])[0] : '';
  const rpr = firstP ? (/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(firstP[0]) || [''])[0] : '';
  const ps = String(text ?? '').split('\n').map((ln) => `<w:p>${ppr}${runXml(ln, {}, dev).replace('<w:r>', '<w:r>' + rpr)}</w:p>`).join('');
  return m[1] + (m[2] || '') + ps + m[4];
}

/**
 * Edit a .docx. ops: {op:'replace',find,replace,all?} | {op:'append',blocks} | {op:'fillTable',index,rows,start?,append?} | {op:'setMeta',title,author,subject}
 * @returns {Promise<{bytes:Uint8Array,blob:Blob,mime:string,changes:number,warnings:string[]}>}
 */
export async function edit(input, ops = []) {
  const z = await Z.read(await toU8(input)); const files = await z.all();
  const warnings = []; let changes = 0;
  if (!files.has('word/document.xml')) throw new Error('Not a DOCX: word/document.xml missing');
  let docXml = new TextDecoder().decode(files.get('word/document.xml'));
  const dev = 'Mangal';
  for (const op of ops) {
    if (op.op === 'replace') {
      const r = replaceInParagraphs(docXml, 'w:p', 'w:t', op.find, op.replace ?? '', op.all !== false);
      docXml = r.xml; changes += r.count;
      for (const nm of files.keys()) if (/^word\/(header|footer)\d*\.xml$/.test(nm)) {
        const h = replaceInParagraphs(new TextDecoder().decode(files.get(nm)), 'w:p', 'w:t', op.find, op.replace ?? '', op.all !== false);
        if (h.count) { files.set(nm, utf8(h.xml)); changes += h.count; }
      }
      if (!r.count) warnings.push(`replace: "${op.find}" not found in body`);
    } else if (op.op === 'append') {
      let numXml = files.has('word/numbering.xml') ? new TextDecoder().decode(files.get('word/numbering.xml')) : '';
      const ours = numXml.includes('guru-decimal') && numXml.includes('guru-bullet');
      const bulletId = ours ? 1 : 0;
      let nextId = Math.max(1, ...[...numXml.matchAll(/w:numId="(\d+)"/g)].map((m) => +m[1])) + 1; let added = '';
      const ctx = { dev, contentW: 9638, nextDocPr: () => 1000 + changes, plainLists: !ours, addImage: null, listNum: (ord) => { if (!ord) return bulletId; const id = nextId++; added += numDef(id); return id; } };
      const blocks = (op.blocks || []).map((b) => (typeof b === 'string' ? { t: 'p', text: b } : b));
      const xml = blocks.map((b) => blockXml(b, ctx)).join('');
      const at = docXml.lastIndexOf('<w:sectPr');
      const bodyEnd = docXml.lastIndexOf('</w:body>');
      const pos = at !== -1 && at > docXml.lastIndexOf('</w:p>') ? at : bodyEnd;
      docXml = docXml.slice(0, pos) + xml + docXml.slice(pos); changes += blocks.length;
      if (added) { numXml = numXml.replace('</w:numbering>', added + '</w:numbering>'); files.set('word/numbering.xml', utf8(numXml)); }
      if (blocks.some((b) => b.t === 'img')) warnings.push('append: images are not embedded when editing; alt text used');
    } else if (op.op === 'fillTable') {
      const tbls = [...docXml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)];
      const tm = tbls[op.index ?? 0];
      if (!tm) { warnings.push(`fillTable: table ${op.index ?? 0} not found`); continue; }
      const rowRe = /<w:tr(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:tr>/g;
      let rows = [...tm[0].matchAll(rowRe)].map((m) => m[0]);
      const startRow = op.append ? rows.length : op.start ?? 0;
      (op.rows || []).forEach((vals, i) => {
        const ri = startRow + i;
        while (rows.length <= ri) rows.push(rows[rows.length - 1]);
        const cellRe = /<w:tc(?:\s[^>]*[^/>])?>[\s\S]*?<\/w:tc>/g; let ci = 0;
        rows[ri] = rows[ri].replace(cellRe, (tc) => { const v = vals[ci++]; return v === undefined || v === null ? tc : setCellText(tc, v, dev); });
        if (ri >= startRow + i && op.append && i === 0) { /* appended row cloned from last */ }
        changes++;
      });
      const first = tm[0].search(rowRe);
      const lastEnd = tm[0].lastIndexOf('</w:tr>') + 7;
      const newTbl = tm[0].slice(0, first) + rows.join('') + tm[0].slice(lastEnd);
      docXml = docXml.slice(0, tm.index) + newTbl + docXml.slice(tm.index + tm[0].length);
    } else if (op.op === 'setMeta' && files.has('docProps/core.xml')) {
      let c = new TextDecoder().decode(files.get('docProps/core.xml'));
      for (const [k, tag] of [['title', 'dc:title'], ['author', 'dc:creator'], ['subject', 'dc:subject']]) if (op[k] != null) {
        const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>|<${tag}/>`); const rep = `<${tag}>${esc(op[k])}</${tag}>`;
        c = re.test(c) ? c.replace(re, rep) : c.replace('</cp:coreProperties>', rep + '</cp:coreProperties>'); changes++;
      }
      files.set('docProps/core.xml', utf8(c));
    } else warnings.push('unknown op: ' + (op.op || JSON.stringify(op)));
  }
  parse(docXml);
  files.set('word/document.xml', utf8(docXml));
  const order = ['[Content_Types].xml', ...[...files.keys()].filter((k) => k !== '[Content_Types].xml')];
  const bytes = await Z.create(order.map((name) => ({ name, data: files.get(name) })));
  return { bytes, blob: new Blob([bytes], { type: MIME.docx }), mime: MIME.docx, changes, warnings };
}
