// PPTX writer / reader / editor, zero deps.
import * as Z from './zip.js';
import { esc, parse, kids, kid, desc, textOf, replaceInParagraphs, escAttr } from './xml.js';
import { toU8, utf8, dec, MIME } from './util.js';
import { XML, REL, SLIDE_W, SLIDE_H, resolveTheme, themeXml, masterXml, layoutXml, notesMasterXml, notesXml, relsXml } from './pptx-parts.js';
import { buildSlide } from './pptx-slides.js';

const CT = (n) => `application/vnd.openxmlformats-officedocument.presentationml.${n}+xml`;
const ext = (i) => (i.info.type === 'jpeg' ? 'jpg' : i.info.type);

/**
 * Build a .pptx (16:9).
 * @param {{title?:string,theme?:object,slides:Array<{title?:string,bullets?:any[],notes?:string,image?:object,layout?:'title'|'bullets'|'two-col'|'table'|'quote',table?:{header?:any[],rows:any[][]},quote?:string,author?:string,columns?:any[],left?:any,right?:any,subtitle?:string}>,meta?:{author?:string}}} spec
 * @returns {Promise<Uint8Array>}
 */
export async function write(spec = {}) {
  const th = resolveTheme(spec.theme); let slides = (spec.slides || []).slice();
  if (spec.title && (!slides.length || slides[0].layout !== 'title')) slides.unshift({ layout: 'title', title: spec.title, subtitle: spec.subtitle });
  if (!slides.length) slides = [{ layout: 'title', title: spec.title || 'Untitled' }];
  const built = slides.map((s) => buildSlide(s, th));
  const anyNotes = built.some((b) => b.notesParas);
  const files = []; const add = (name, data) => files.push({ name, data });
  const imgExts = new Set(); let imgN = 0;
  const ov = [['/ppt/presentation.xml', CT('presentation.main')], ['/ppt/slideMasters/slideMaster1.xml', CT('slideMaster')], ['/ppt/slideLayouts/slideLayout1.xml', CT('slideLayout')], ['/ppt/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'], ['/ppt/presProps.xml', CT('presProps')], ['/ppt/viewProps.xml', CT('viewProps')], ['/ppt/tableStyles.xml', CT('tableStyles')], ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'], ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml']];
  const presRels = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml'], ['rId3', 'presProps', 'presProps.xml'], ['rId4', 'viewProps', 'viewProps.xml'], ['rId5', 'tableStyles', 'tableStyles.xml']];
  let ridN = 6; const sldIds = [];
  built.forEach((b, i) => {
    const n = i + 1; const rels = [['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']];
    b.images.forEach((im) => { imgN++; imgExts.add(ext(im)); const nm = `image${imgN}.${ext(im)}`; add('ppt/media/' + nm, im.data); rels.push([im.rid, 'image', '../media/' + nm]); });
    if (b.notesParas) { rels.push(['rIdNotes', 'notesSlide', `../notesSlides/notesSlide${n}.xml`]); add(`ppt/notesSlides/notesSlide${n}.xml`, notesXml(b.notesParas)); add(`ppt/notesSlides/_rels/notesSlide${n}.xml.rels`, relsXml([['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'], ['rId2', 'slide', `../slides/slide${n}.xml`]])); ov.push([`/ppt/notesSlides/notesSlide${n}.xml`, CT('notesSlide')]); }
    add(`ppt/slides/slide${n}.xml`, b.xml); add(`ppt/slides/_rels/slide${n}.xml.rels`, relsXml(rels)); ov.push([`/ppt/slides/slide${n}.xml`, CT('slide')]);
    presRels.push([`rId${ridN}`, 'slide', `slides/slide${n}.xml`]); sldIds.push(`<p:sldId id="${255 + n}" r:id="rId${ridN}"/>`); ridN++;
  });
  let notesMasterId = '';
  if (anyNotes) {
    add('ppt/notesMasters/notesMaster1.xml', notesMasterXml()); add('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([['rId1', 'theme', '../theme/theme2.xml']]));
    add('ppt/theme/theme2.xml', themeXml(th, 'Guru Notes')); ov.push(['/ppt/notesMasters/notesMaster1.xml', CT('notesMaster')], ['/ppt/theme/theme2.xml', 'application/vnd.openxmlformats-officedocument.theme+xml']);
    presRels.push([`rId${ridN}`, 'notesMaster', 'notesMasters/notesMaster1.xml']); notesMasterId = `<p:notesMasterIdLst><p:notesMasterId r:id="rId${ridN}"/></p:notesMasterIdLst>`; ridN++;
  }
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  add('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...imgExts].map((e) => `<Default Extension="${e}" ContentType="${e === 'jpg' ? 'image/jpeg' : 'image/' + e}"/>`).join('')}${ov.map(([p, t]) => `<Override PartName="${p}" ContentType="${t}"/>`).join('')}</Types>`);
  add('_rels/.rels', relsXml([['rId1', 'officeDocument', 'ppt/presentation.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'], ['rId3', 'extended-properties', 'docProps/app.xml']]));
  add('ppt/presentation.xml', `${XML}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${notesMasterId}<p:sldIdLst>${sldIds.join('')}</p:sldIdLst><p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  add('ppt/_rels/presentation.xml.rels', relsXml(presRels));
  add('ppt/slideMasters/slideMaster1.xml', masterXml()); add('ppt/slideMasters/_rels/slideMaster1.xml.rels', relsXml([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]));
  add('ppt/slideLayouts/slideLayout1.xml', layoutXml()); add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', relsXml([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]));
  add('ppt/theme/theme1.xml', themeXml(th));
  add('ppt/presProps.xml', `${XML}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`);
  add('ppt/viewProps.xml', `${XML}<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`);
  add('ppt/tableStyles.xml', `${XML}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(spec.title || slides[0].title || '')}</dc:title><dc:creator>${esc(spec.meta?.author || 'Guru')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  add('docProps/app.xml', `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Guru</Application><Slides>${slides.length}</Slides></Properties>`);
  files.sort((a, b) => (a.name === '[Content_Types].xml' ? -1 : b.name === '[Content_Types].xml' ? 1 : 0));
  return Z.create(files);
}

// ---------------------------------------------------------------- read
const resolvePath = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};
async function relsOf(z, part) {
  const rp = part.replace(/([^/]+)$/, '_rels/$1.rels'); const out = {};
  if (z.has(rp)) for (const r of kids(parse(await z.text(rp)), 'Relationship')) out[r.attrs.Id] = { type: r.attrs.Type, target: r.attrs.TargetMode === 'External' ? r.attrs.Target : resolvePath(part, r.attrs.Target) };
  return out;
}
const paraTxt = (p) => desc(p, 'r').concat([]).length || true ? (() => { let s = ''; for (const c of p.children) { if (c.local === 'r') s += textOf(kid(c, 't')); else if (c.local === 'br') s += '\n'; else if (c.local === 'fld') s += textOf(kid(c, 't')); } return s; })() : '';

function readShapes(tree) {
  const out = { title: '', bullets: [], tables: [], pictures: 0, ordered: [] };
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.local === 'sp') {
        const ph = desc(kid(c, 'nvSpPr') || c, 'ph')[0]; const type = ph?.attrs.type;
        const tb = kid(c, 'txBody'); if (!tb) continue;
        const paras = kids(tb, 'p').map((p) => ({ text: paraTxt(p), level: +(kid(p, 'pPr')?.attrs.lvl || 0) })).filter((p) => p.text.trim());
        if (!paras.length) continue;
        if (type === 'title' || type === 'ctrTitle') out.title = out.title || paras.map((p) => p.text).join(' ');
        else if (type === 'sldNum' || type === 'dt' || type === 'ftr') continue;
        else paras.forEach((p) => out.bullets.push(p.level ? { text: p.text, level: p.level } : p.text));
      } else if (c.local === 'graphicFrame') {
        const tbl = desc(c, 'tbl')[0];
        if (tbl) out.tables.push(kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => kids(kid(tc, 'txBody'), 'p').map(paraTxt).join('\n').trim())));
      } else if (c.local === 'pic') out.pictures++;
      else if (c.local === 'grpSp') walk(c);
    }
  };
  walk(tree); return out;
}
async function slideOrder(z) {
  const pres = parse(await z.text('ppt/presentation.xml')); const rels = await relsOf(z, 'ppt/presentation.xml');
  return { pres, rels, list: kids(kid(pres, 'sldIdLst'), 'sldId').map((s) => ({ id: s.attrs.id, rid: s.attrs['r:id'], path: rels[s.attrs['r:id']]?.target })).filter((s) => s.path && z.has(s.path)) };
}

/**
 * Read slide text, tables and notes.
 * @returns {Promise<{format:'pptx',text:string,slides:Array<{index:number,title:string,bullets:any[],text:string,tables:string[][][],notes:string,pictures:number}>,meta:object}>}
 */
export async function read(input) {
  const z = await Z.read(await toU8(input));
  if (!z.has('ppt/presentation.xml')) throw new Error('Not a PPTX: ppt/presentation.xml missing');
  const { list } = await slideOrder(z); const slides = [];
  for (const [i, s] of list.entries()) {
    const sx = parse(await z.text(s.path)); const tree = kid(kid(sx, 'cSld'), 'spTree');
    const sh = readShapes(tree); let notes = '';
    const rels = await relsOf(z, s.path); const nr = Object.values(rels).find((r) => /notesSlide$/.test(r.type));
    if (nr && z.has(nr.target)) {
      const nt = kid(kid(parse(await z.text(nr.target)), 'cSld'), 'spTree');
      const parts = []; for (const sp of kids(nt, 'sp')) { const ph = desc(kid(sp, 'nvSpPr'), 'ph')[0]; if (ph?.attrs.type === 'body') parts.push(kids(kid(sp, 'txBody'), 'p').map(paraTxt).join('\n')); }
      notes = parts.join('\n').trim();
    }
    const bl = sh.bullets.map((b) => (typeof b === 'object' ? b.text : b));
    const text = [sh.title, ...bl, ...sh.tables.flatMap((t) => t.map((r) => r.join(' | ')))].filter(Boolean).join('\n');
    slides.push({ index: i + 1, title: sh.title, bullets: sh.bullets, text, tables: sh.tables, notes, pictures: sh.pictures });
  }
  const text = slides.map((s) => `## Slide ${s.index}${s.title ? ': ' + s.title : ''}\n` + [...s.bullets.map((b) => (typeof b === 'object' ? '  '.repeat(b.level) + '- ' + b.text : '- ' + b)), ...s.tables.flatMap((t) => t.map((r) => '| ' + r.join(' | ') + ' |')), s.notes ? 'Notes: ' + s.notes : ''].filter(Boolean).join('\n')).join('\n\n');
  return { format: 'pptx', text, slides, meta: { slideCount: slides.length } };
}

// ---------------------------------------------------------------- edit
function themeFromDeck(files) {
  const t = files.has('ppt/theme/theme1.xml') ? dec.decode(files.get('ppt/theme/theme1.xml')) : '';
  const g = (tag) => (new RegExp(`<a:${tag}>\\s*<a:srgbClr val="([0-9A-Fa-f]{6})"`).exec(t) || [])[1];
  const f = (new RegExp('<a:minorFont>\\s*<a:latin typeface="([^"]+)"').exec(t) || [])[1];
  const cs = (new RegExp('<a:minorFont>[\\s\\S]*?<a:font script="Deva" typeface="([^"]+)"').exec(t) || [])[1];
  return resolveTheme({ primary: g('accent1') || g('dk2'), accent: g('accent2'), text: g('dk1'), bg: g('lt1'), light: g('lt2'), font: f, devFont: cs });
}

/**
 * Edit a .pptx. ops: {op:'replace',find,replace} | {op:'addSlide',slide,at?} | {op:'replaceSlide',index,slide} | {op:'deleteSlide',index}
 * Slide indexes are 1-based.
 */
export async function edit(input, ops = []) {
  const z = await Z.read(await toU8(input)); const files = await z.all();
  const text = (n) => dec.decode(files.get(n));
  let ct = text('[Content_Types].xml'); let presXml = text('ppt/presentation.xml'); let presRels = text('ppt/_rels/presentation.xml.rels');
  const warnings = []; let changes = 0; const th = themeFromDeck(files);
  const sizeM = /<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(presXml); const size = sizeM ? { w: +sizeM[1] / 914400, h: +sizeM[2] / 914400 } : { w: 13.333, h: 7.5 };
  const layoutOf = async () => { for (const n of [...files.keys()].sort()) if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n)) return n; return null; };
  const hasNotesMaster = () => [...files.keys()].some((k) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(k));
  const addOverride = (p, t) => { if (!ct.includes(`PartName="${p}"`)) ct = ct.replace('</Types>', `<Override PartName="${p}" ContentType="${t}"/></Types>`); };
  const ensureDefault = (e) => { if (!new RegExp(`<Default[^>]*Extension="${e}"`, 'i').test(ct)) ct = ct.replace(/(<Types\b[^>]*>)/, `$1<Default Extension="${e}" ContentType="${e === 'jpg' ? 'image/jpeg' : 'image/' + e}"/>`); };
  const nextFree = (re) => { let n = 1; while (files.has(re(n))) n++; return n; };

  async function writeSlide(path, sl, existingRels) {
    const b = buildSlide(sl, th, size); files.set(path, utf8(b.xml));
    const rels = [['rId1', 'slideLayout', '../slideLayouts/' + (await layoutOf()).split('/').pop()]];
    for (const im of b.images) {
      let k = 1; while (files.has(`ppt/media/image${k}.${ext(im)}`)) k++;
      files.set(`ppt/media/image${k}.${ext(im)}`, im.data); ensureDefault(ext(im)); rels.push([im.rid, 'image', `../media/image${k}.${ext(im)}`]);
    }
    const n = /slide(\d+)\.xml$/.exec(path)[1];
    const oldNotes = existingRels && Object.values(existingRels).find((r) => /notesSlide$/.test(r.type));
    if (b.notesParas && hasNotesMaster()) {
      let np = oldNotes?.target; if (!np) { const k = nextFree((x) => `ppt/notesSlides/notesSlide${x}.xml`); np = `ppt/notesSlides/notesSlide${k}.xml`; }
      files.set(np, utf8(notesXml(b.notesParas)));
      const nm = [...files.keys()].find((k) => /^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(k));
      files.set(np.replace(/([^/]+)$/, '_rels/$1.rels'), utf8(relsXml([['rId1', 'notesMaster', '../notesMasters/' + nm.split('/').pop()], ['rId2', 'slide', `../slides/slide${n}.xml`]])));
      rels.push(['rIdNotes', 'notesSlide', '../notesSlides/' + np.split('/').pop()]); addOverride('/' + np, CT('notesSlide'));
    } else {
      if (b.notesParas) warnings.push('notes skipped: deck has no notes master');
      if (oldNotes) { files.delete(oldNotes.target); files.delete(oldNotes.target.replace(/([^/]+)$/, '_rels/$1.rels')); ct = ct.replace(new RegExp(`<Override[^>]*PartName="/${oldNotes.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), ''); }
    }
    files.set(path.replace(/([^/]+)$/, '_rels/$1.rels'), utf8(relsOf2(rels)));
  }
  const relsOf2 = relsXml;
  const order = async () => slideOrder({ has: (n) => files.has(n), text: async (n) => text(n) });
  const reparse = async () => { files.set('ppt/presentation.xml', utf8(presXml)); files.set('ppt/_rels/presentation.xml.rels', utf8(presRels)); };

  for (const op of ops) {
    try {
      if (op.op === 'replace') {
        let total = 0;
        for (const n of [...files.keys()]) if (/^ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml$/.test(n)) {
          const r = replaceInParagraphs(text(n), 'a:p', 'a:t', op.find, op.replace ?? '', op.all !== false); if (r.count) { files.set(n, utf8(r.xml)); total += r.count; }
        }
        changes += total; if (!total) warnings.push(`replace: "${op.find}" not found`);
      } else if (op.op === 'addSlide') {
        const k = nextFree((x) => `ppt/slides/slide${x}.xml`); const path = `ppt/slides/slide${k}.xml`;
        await writeSlide(path, op.slide || {}, null); addOverride('/' + path, CT('slide'));
        const rid = 'rId' + (Math.max(0, ...[...presRels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1);
        presRels = presRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL}/slide" Target="slides/slide${k}.xml"/></Relationships>`);
        const nid = Math.max(255, ...[...presXml.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)].map((m) => +m[1])) + 1; const tag = `<p:sldId id="${nid}" r:id="${rid}"/>`;
        const ids = [...presXml.matchAll(/<p:sldId\b[^>]*\/>/g)];
        if (!ids.length) presXml = /<p:sldIdLst\s*\/>/.test(presXml) ? presXml.replace(/<p:sldIdLst\s*\/>/, `<p:sldIdLst>${tag}</p:sldIdLst>`) : presXml.replace(/(<p:sldSz)/, `<p:sldIdLst>${tag}</p:sldIdLst>$1`);
        else if (op.at != null && op.at >= 1 && op.at <= ids.length) presXml = presXml.slice(0, ids[op.at - 1].index) + tag + presXml.slice(ids[op.at - 1].index);
        else presXml = presXml.slice(0, ids[ids.length - 1].index + ids[ids.length - 1][0].length) + tag + presXml.slice(ids[ids.length - 1].index + ids[ids.length - 1][0].length);
        changes++;
      } else if (op.op === 'replaceSlide' || op.op === 'deleteSlide') {
        await reparse(); const { list } = await order(); const s = list[(op.index || 0) - 1];
        if (!s) throw new Error('slide ' + op.index + ' not found');
        if (op.op === 'replaceSlide') { const rels = await relsOf({ has: (n) => files.has(n), text: async (n) => text(n) }, s.path); await writeSlide(s.path, op.slide || {}, rels); }
        else {
          const rels = await relsOf({ has: (n) => files.has(n), text: async (n) => text(n) }, s.path);
          for (const r of Object.values(rels)) if (/notesSlide$/.test(r.type) && files.has(r.target)) { files.delete(r.target); files.delete(r.target.replace(/([^/]+)$/, '_rels/$1.rels')); ct = ct.replace(new RegExp(`<Override[^>]*PartName="/${r.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), ''); }
          files.delete(s.path); files.delete(s.path.replace(/([^/]+)$/, '_rels/$1.rels'));
          ct = ct.replace(new RegExp(`<Override[^>]*PartName="/${s.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), '');
          presXml = presXml.replace(new RegExp(`<p:sldId\\b[^>]*r:id="${s.rid}"[^>]*/>`), '');
          presRels = presRels.replace(new RegExp(`<Relationship\\b[^>]*Id="${s.rid}"[^>]*/>`), '');
        }
        changes++;
      } else warnings.push('unknown op: ' + (op.op || JSON.stringify(op)));
    } catch (e) { warnings.push(`${op.op}: ${e.message}`); }
  }
  parse(presXml); parse(presRels); parse(ct);
  files.set('ppt/presentation.xml', utf8(presXml)); files.set('ppt/_rels/presentation.xml.rels', utf8(presRels)); files.set('[Content_Types].xml', utf8(ct));
  for (const [n, d] of files) if (n.endsWith('.xml') && /^ppt\/slides\//.test(n)) parse(dec.decode(d));
  const names = ['[Content_Types].xml', ...[...files.keys()].filter((k) => k !== '[Content_Types].xml')];
  const bytes = await Z.create(names.map((name) => ({ name, data: files.get(name) })));
  return { bytes, blob: new Blob([bytes], { type: MIME.pptx }), mime: MIME.pptx, changes, warnings };
}
void escAttr;
