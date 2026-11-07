// Guru files module: service 'files' + tools file_read / file_write / file_edit.
import * as zip from './zip.js';
import * as docx from './docx.js';
import * as xlsx from './xlsx.js';
import * as pptx from './pptx.js';
import * as pdf from './pdf.js';
import * as md from './md.js';
import * as csv from './csv.js';
import * as html from './html.js';
import { toU8, utf8, decodeText, MIME, slug, imgInfo, b64decode, b64encode } from './util.js';

export { zip, docx, xlsx, pptx, pdf, md, csv, html };

const EXT_ALIAS = { markdown: 'md', htm: 'html', text: 'txt', tsv: 'csv', jpeg: 'jpg', xlsm: 'xlsx', log: 'txt', mdx: 'md' };
const MIME_FMT = Object.fromEntries(Object.entries(MIME).map(([k, v]) => [v, k]));
const OFFICE = ['docx', 'xlsx', 'pptx'];
export const FORMATS = { read: ['txt', 'md', 'csv', 'json', 'html', 'docx', 'xlsx', 'pptx', 'pdf', 'png', 'jpg', 'gif', 'zip'], write: ['docx', 'xlsx', 'pptx', 'pdf', 'md', 'csv', 'html', 'json', 'zip', 'txt'] };

/** Guess format from a file name / mime / magic bytes. */
export async function detect(u8, nameOrMime = '') {
  const s = String(nameOrMime || '').toLowerCase();
  const ext = s.includes('/') && !/\.[a-z0-9]+$/.test(s) ? MIME_FMT[s.split(';')[0]] : (s.split('.').pop() || '').replace(/[^a-z0-9]/g, '');
  let f = EXT_ALIAS[ext] || ext;
  if (u8 && u8.length > 4) {
    if (u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return 'pdf';
    if (u8[0] === 0x89 && u8[1] === 0x50) return 'png';
    if (u8[0] === 0xff && u8[1] === 0xd8) return 'jpg';
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
    if (u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 3 || u8[2] === 5)) {
      try { const z = await zip.read(u8); if (z.has('word/document.xml')) return 'docx'; if (z.has('xl/workbook.xml')) return 'xlsx'; if (z.has('ppt/presentation.xml')) return 'pptx'; return 'zip'; } catch { return f || 'zip'; }
    }
  }
  return f || 'txt';
}

/**
 * Read any supported file.
 * @param {File|Blob|ArrayBuffer|Uint8Array|string} input
 * @param {string} [nameOrMime] file name or mime type
 * @returns {Promise<{format:string,text:string,sheets?:object[],slides?:object[],pages?:object[],blocks?:object[],meta:object}>}
 */
export async function read(input, nameOrMime) {
  const name = nameOrMime || (input && input.name) || (input && input.type) || '';
  const u8 = await toU8(input); const format = await detect(u8, name);
  let r;
  switch (format) {
    case 'docx': r = await docx.read(u8); break;
    case 'xlsx': r = await xlsx.read(u8); break;
    case 'pptx': r = await pptx.read(u8); break;
    case 'pdf': { r = await pdf.read(u8); break; }
    case 'csv': { const t = decodeText(u8); const delimiter = /\.tsv$/i.test(String(name)) ? '\t' : undefined; const rows = csv.parse(t, { delimiter }); r = { format, text: t.replace(/^﻿/, ''), sheets: [{ name: 'Sheet1', rows }], meta: { rows: rows.length, cols: Math.max(0, ...rows.map((x) => x.length)) } }; break; }
    case 'json': { const t = decodeText(u8); let data, valid = true; try { data = JSON.parse(t); } catch { valid = false; } r = { format, text: valid ? JSON.stringify(data, null, 2) : t, data, meta: { valid, type: Array.isArray(data) ? 'array' : typeof data } }; break; }
    case 'html': r = html.read(decodeText(u8)); break;
    case 'md': { const t = decodeText(u8); const { title, blocks } = md.toBlocks(t, { liftTitle: true }); r = { format, text: t, blocks, meta: { title, headings: blocks.filter((b) => /^h\d$/.test(b.t)).map((b) => b.text) } }; break; }
    case 'png': case 'jpg': case 'gif': { const i = imgInfo(u8); r = { format, text: '', meta: { ...(i ? { width: i.width, height: i.height, mime: i.mime } : {}), note: 'Image: metadata only, no OCR' } }; break; }
    case 'zip': { const z = await zip.read(u8); r = { format, text: z.entries.map((e) => `${e.name}${e.isDir ? '' : ` (${e.size} bytes)`}`).join('\n'), meta: { entries: z.entries.map((e) => ({ name: e.name, size: e.size, isDir: e.isDir })) } }; break; }
    default: r = { format: 'txt', text: decodeText(u8), meta: {} };
  }
  r.meta = { ...(r.meta || {}), size: u8.length, ...(typeof name === 'string' && /\.[a-z0-9]+$/i.test(name) ? { filename: name.split(/[\\/]/).pop() } : {}) };
  return r;
}

function asDocSpec(spec) {
  if (typeof spec === 'string') return md.toBlocks(spec, { liftTitle: true });
  const o = { ...(spec || {}) };
  const m = o.markdown ?? o.md; if (typeof m === 'string' && !o.blocks) { const b = md.toBlocks(m, { liftTitle: true }); o.blocks = b.blocks; o.title = o.title ?? b.title; }
  if (!o.blocks && typeof o.text === 'string') o.blocks = md.toBlocks(o.text).blocks;
  return o;
}
/** Convert blocks (or markdown) into a slide spec: each h1/h2 starts a slide; lists/paragraphs become bullets. */
export function toSlides(spec) {
  const d = asDocSpec(spec); const slides = []; let cur = null;
  const start = (title) => { cur = { title, bullets: [] }; slides.push(cur); };
  for (const b of d.blocks || []) {
    const t = b.t || 'p';
    if (t === 'h1' || t === 'h2') start(b.text);
    else { if (!cur) start(d.title || ''); if (t === 'ul' || t === 'ol') cur.bullets.push(...b.items); else if (t === 'table') { cur.layout = 'table'; cur.table = { header: b.header, rows: b.rows }; } else if (t === 'quote') { cur.layout = 'quote'; cur.quote = b.text; } else if (t === 'h3') cur.bullets.push('**' + b.text + '**'); else if (b.text) cur.bullets.push(b.text); }
  }
  return { title: d.title, theme: d.theme, slides: slides.filter((s) => s.title || s.bullets.length || s.table || s.quote) };
}
function asSheetSpec(spec) {
  if (typeof spec === 'string') return { sheets: [{ name: 'Sheet1', rows: csv.parse(spec) }] };
  if (Array.isArray(spec)) return { sheets: [{ name: 'Sheet1', rows: spec }] };
  if (spec && spec.sheets) return spec;
  if (spec && spec.rows) return { ...spec, sheets: [{ name: spec.name || 'Sheet1', rows: spec.rows, widths: spec.widths, formulas: spec.formulas, header: spec.header }] };
  return { sheets: [{ name: 'Sheet1', rows: [[]] }] };
}
const mk = (bytes, mime) => new Blob([bytes], { type: mime });

/**
 * Write a file.
 * @param {'docx'|'xlsx'|'pptx'|'pdf'|'md'|'csv'|'html'|'json'|'zip'|'txt'} format
 * @param {object|string|any[]} spec document / sheet / slide spec (see CONTRACT)
 * @param {object} [opts] pdf options (forceBuiltin, rasterizer)
 * @returns {Promise<{blob:Blob,filename:string,mime:string,bytes:Uint8Array,warnings?:string[]}>}
 */
export async function write(format, spec, opts = {}) {
  const f = EXT_ALIAS[String(format).toLowerCase().replace(/^\./, '')] || String(format).toLowerCase().replace(/^\./, '');
  if (!FORMATS.write.includes(f)) throw new Error(`Unsupported write format: ${format}`);
  const docLike = ['docx', 'pdf', 'html', 'pptx'].includes(f) && typeof spec === 'string';
  const named = docLike ? md.toBlocks(spec, { liftTitle: true }) : spec;
  const base = slug((named && !Array.isArray(named) && typeof named === 'object' && (named.filename || named.name || named.title)) || '', 'guru-' + f).replace(new RegExp(`\\.${f}$`, 'i'), '');
  const warnings = []; let bytes;
  if (f === 'docx') bytes = await docx.write(asDocSpec(spec));
  else if (f === 'xlsx') bytes = await xlsx.write(asSheetSpec(spec));
  else if (f === 'pptx') bytes = await pptx.write(spec && spec.slides ? spec : toSlides(spec));
  else if (f === 'pdf') { const r = await pdf.write(asDocSpec(spec), opts); bytes = r.bytes; warnings.push(...r.warnings); }
  else if (f === 'md') bytes = utf8(typeof spec === 'string' ? spec : spec?.markdown ?? spec?.content ?? (spec?.blocks || spec?.title ? md.fromBlocks(spec) : spec?.text ?? ''));
  else if (f === 'csv') { const rows = typeof spec === 'string' ? csv.parse(spec) : Array.isArray(spec) ? spec : spec?.rows || spec?.sheets?.[0]?.rows || []; bytes = csv.encode(rows, { delimiter: spec?.delimiter }); }
  else if (f === 'html') bytes = utf8(typeof spec === 'string' && /^\s*<(!doctype|html)/i.test(spec) ? spec : html.write(asDocSpec(spec)));
  else if (f === 'json') bytes = utf8(typeof spec === 'string' ? spec : JSON.stringify(spec?.data !== undefined && Object.keys(spec).length <= 3 ? spec.data : spec, null, 2));
  else if (f === 'txt') bytes = utf8(typeof spec === 'string' ? spec : spec?.text ?? spec?.content ?? md.fromBlocks(asDocSpec(spec)));
  else if (f === 'zip') {
    const list = Array.isArray(spec) ? spec : spec?.files ? (Array.isArray(spec.files) ? spec.files : Object.entries(spec.files).map(([name, data]) => ({ name, data }))) : Object.entries(spec || {}).map(([name, data]) => ({ name, data }));
    const norm = []; for (const e of list) { let d = e.data ?? e.content ?? e.text ?? ''; if (typeof d === 'object' && !(d instanceof Uint8Array) && !(d instanceof ArrayBuffer) && typeof d.arrayBuffer !== 'function') d = JSON.stringify(d, null, 2); if (e.base64) d = b64decode(e.base64); norm.push({ name: e.name || e.path, data: d }); }
    bytes = await zip.create(norm);
  }
  const mime = MIME[f];
  return { blob: mk(bytes, ['md', 'csv', 'html', 'json', 'txt'].includes(f) ? mime + ';charset=utf-8' : mime), filename: `${base}.${f}`, mime, bytes, ...(warnings.length ? { warnings } : {}) };
}

/**
 * Edit a file in place (returns a new file).
 * @param {Blob|ArrayBuffer|Uint8Array|string} input
 * @param {string} format docx|xlsx|pptx|md|txt|html|csv|json
 * @param {object[]} ops see per-format docs
 * @returns {Promise<{blob:Blob,bytes:Uint8Array,mime:string,filename?:string,changes:number,warnings:string[]}>}
 */
export async function edit(input, format, ops) {
  if (Array.isArray(format)) { ops = format; format = undefined; }
  const name = (input && input.name) || ''; const u8 = await toU8(input);
  const f = format ? EXT_ALIAS[String(format).toLowerCase()] || String(format).toLowerCase() : await detect(u8, name);
  const list = Array.isArray(ops) ? ops : ops ? [ops] : [];
  let r;
  if (f === 'docx') r = await docx.edit(u8, list);
  else if (f === 'xlsx') r = await xlsx.edit(u8, list);
  else if (f === 'pptx') r = await pptx.edit(u8, list);
  else if (['md', 'txt', 'html'].includes(f)) { const p = md.patch(decodeText(u8), list); const bytes = utf8(p.text); r = { bytes, blob: mk(bytes, MIME[f] + ';charset=utf-8'), mime: MIME[f], changes: p.changes, warnings: p.warnings }; }
  else if (f === 'csv') {
    let rows = csv.parse(decodeText(u8)); let changes = 0; const warnings = [];
    for (const op of list) {
      if (op.op === 'appendRows') { rows.push(...op.rows); changes += op.rows.length; }
      else if (op.op === 'setCell') { while (rows.length <= op.row) rows.push([]); rows[op.row][op.col] = op.value; changes++; }
      else if (op.op === 'replace') { rows = rows.map((r2) => r2.map((c) => (typeof c === 'string' && c.includes(op.find) ? (changes++, c.split(op.find).join(op.replace ?? '')) : c))); }
      else warnings.push('unknown op: ' + op.op);
    }
    const bytes = csv.encode(rows); r = { bytes, blob: mk(bytes, MIME.csv + ';charset=utf-8'), mime: MIME.csv, changes, warnings };
  } else if (f === 'json') {
    const data = JSON.parse(decodeText(u8)); let changes = 0; const warnings = [];
    for (const op of list) {
      if (op.op !== 'set' || !op.path) { warnings.push('unknown op: ' + op.op); continue; }
      const keys = String(op.path).split(/[.\[\]]+/).filter(Boolean); let o = data;
      for (let i = 0; i < keys.length - 1; i++) { if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {}; o = o[keys[i]]; }
      if (['__proto__', 'constructor', 'prototype'].includes(keys[keys.length - 1]) || keys.some((k) => k === '__proto__')) { warnings.push('blocked path'); continue; }
      o[keys[keys.length - 1]] = op.value; changes++;
    }
    const bytes = utf8(JSON.stringify(data, null, 2)); r = { bytes, blob: mk(bytes, MIME.json + ';charset=utf-8'), mime: MIME.json, changes, warnings };
  } else throw new Error(`Editing ${f} is not supported (supported: docx, xlsx, pptx, md, txt, html, csv, json)`);
  const base = name ? slug(name.replace(/\.[^.]+$/, ''), 'edited') : 'edited';
  return { ...r, filename: `${base}.${f}` };
}

// ---------------------------------------------------------------- kernel module
async function sourceBlob(a, ctx, k) {
  const arts = ctx?.artifacts || k.artifacts;
  const ref = a.artifact || a.ref || a.blobRef || (a.source && typeof a.source === 'object' && (a.source.blobRef || a.source.artifact));
  if (ref) { const rec = arts?.get?.(typeof ref === 'object' ? ref.blobRef || ref.id : ref); if (!rec) throw new Error('Artifact not found: ' + JSON.stringify(ref)); return { data: rec.blob, name: rec.filename }; }
  if (typeof a.base64 === 'string') return { data: b64decode(a.base64), name: a.name || a.filename || '' };
  if (typeof a.text === 'string') return { data: utf8(a.text), name: a.name || a.filename || 'input.txt' };
  const cid = a.connector || (typeof a.source === 'string' ? a.source : a.source?.connector);
  const path = a.path || a.id || a.source?.path || a.source?.id;
  if (cid && path) {
    const conns = k.services.get('connectors'); const c = conns && conns.get(cid); if (!c) throw new Error('Connector not available: ' + cid);
    const data = await c.read(path, { as: 'blob' }); return { data, name: a.name || String(path).split('/').pop() };
  }
  throw new Error('Provide one of: artifact (blobRef), base64, text, or connector+path');
}
const clip = (s, n) => (s.length > n ? { text: s.slice(0, n), truncated: true } : { text: s, truncated: false });

/** Kernel module entry. */
export async function register(k) {
  const service = { read, write, edit, detect, zip: { create: zip.create, read: zip.read, crc32: zip.crc32 }, formats: FORMATS, toSlides, md, csv, html };
  k.services.set('files', service);
  const publish = async (out, ctx, extra = {}) => {
    const arts = ctx?.artifacts || k.artifacts;
    if (arts?.add) { const rec = arts.add(out.blob, out.filename); return { artifact: { filename: rec.filename || out.filename, mime: out.mime, blobRef: rec.blobRef || rec.id }, size: out.bytes?.length, ...extra }; }
    return { filename: out.filename, mime: out.mime, size: out.bytes?.length, base64: b64encode(out.bytes), ...extra };
  };
  k.tools.register({
    name: 'file_read', tags: ['files'],
    description: 'Read a file (txt, md, csv, json, html, docx, xlsx, pptx, pdf, images=metadata) from an artifact, base64, inline text, or a connector (drive/local/github). Returns text, structure (sheets/slides/pages) and metadata.',
    schema: { type: 'object', properties: { artifact: { type: 'string', description: 'blobRef of a previous artifact/upload' }, base64: { type: 'string' }, text: { type: 'string' }, name: { type: 'string', description: 'file name or mime (helps format detection)' }, connector: { type: 'string', enum: ['gdrive', 'localfs', 'github', 'web'] }, path: { type: 'string', description: 'path or id within the connector' }, maxChars: { type: 'number' }, maxRows: { type: 'number' } } },
    run: async (a = {}, ctx) => {
      const src = await sourceBlob(a, ctx, k); const r = await read(src.data, a.name || src.name);
      const { text, truncated } = clip(r.text || '', a.maxChars || 12000); const maxRows = a.maxRows || 50;
      const out = { format: r.format, text, truncated, meta: r.meta };
      if (r.sheets) out.sheets = r.sheets.map((s) => ({ name: s.name, totalRows: s.rows.length, rows: s.rows.slice(0, maxRows), formulas: s.formulas && Object.keys(s.formulas).length ? Object.fromEntries(Object.entries(s.formulas).slice(0, 100)) : undefined }));
      if (r.slides) out.slides = r.slides.map((s) => ({ index: s.index, title: s.title, bullets: s.bullets, notes: s.notes, tables: s.tables }));
      if (r.pages) out.pages = r.pages.length;
      if (r.format === 'docx' || r.format === 'md') out.blocks = (r.blocks || []).slice(0, 200);
      return out;
    },
  });
  k.tools.register({
    name: 'file_write', tags: ['files'],
    description: 'Create a downloadable file. format: docx|xlsx|pptx|pdf|md|csv|html|json|zip|txt. Document spec: {title,lang,blocks:[{t:"h1|h2|h3|p|ul|ol|table|img|pagebreak|qa|math|quote|code|bilingual",text,items,rows,header,align}],meta:{author,subject,header,footer}}; sheet spec: {sheets:[{name,rows,widths,formulas,header,freeze,merges}]}; slide spec: {title,theme,slides:[{title,bullets,notes,layout:"title|bullets|two-col|table|quote",table,columns,image}]}. A markdown string is also accepted for docx/pdf/pptx/html.',
    schema: { type: 'object', properties: { format: { type: 'string', enum: FORMATS.write }, spec: {}, filename: { type: 'string' } }, required: ['format', 'spec'] },
    run: async (a, ctx) => {
      const spec = a.filename && spec_isObj(a.spec) ? { ...a.spec, filename: a.filename } : a.spec;
      const out = await write(a.format, spec);
      return publish(out, ctx, out.warnings ? { warnings: out.warnings } : {});
    },
  });
  k.tools.register({
    name: 'file_edit', tags: ['files'],
    description: 'Edit an existing docx/xlsx/pptx/md/csv/json file and save as a new artifact. docx ops: {op:"replace",find,replace} {op:"append",blocks} {op:"fillTable",index,rows,start|append}. xlsx ops: {op:"set",sheet,cell,value|formula} {op:"setCells",cells} {op:"appendRows",rows} {op:"addSheet",name,rows}. pptx ops: {op:"replace"} {op:"addSlide",slide,at} {op:"replaceSlide",index,slide} {op:"deleteSlide",index}. md ops: replace/append/insertAfterHeading/replaceSection/deleteSection.',
    schema: { type: 'object', properties: { artifact: { type: 'string' }, base64: { type: 'string' }, text: { type: 'string' }, name: { type: 'string' }, connector: { type: 'string' }, path: { type: 'string' }, format: { type: 'string' }, ops: { type: 'array', items: { type: 'object' } }, filename: { type: 'string' } }, required: ['ops'] },
    run: async (a, ctx) => {
      const src = await sourceBlob(a, ctx, k); const named = new Blob([src.data instanceof Uint8Array ? src.data : await toU8(src.data)]); named.name = a.name || src.name;
      const out = await edit(named, a.format, a.ops); if (a.filename) out.filename = slug(a.filename.replace(/\.[^.]+$/, '')) + '.' + out.filename.split('.').pop();
      return publish(out, ctx, { changes: out.changes, warnings: out.warnings });
    },
  });
}
function spec_isObj(s) { return s && typeof s === 'object' && !Array.isArray(s); }
export default { register, read, write, edit, detect, zip };
