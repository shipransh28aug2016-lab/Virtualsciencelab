// Shared SpreadsheetML building blocks (styles, cells, sheet XML).
import { esc, escAttr } from './xml.js';
import { colName, colNum, parseRef, hasDeva } from './util.js';

export const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
export const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const BUILTIN = { General: 0, '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, 'mm-dd-yy': 14 };

/** Excel serial number from a JS Date (UTC based, 1900 system). */
export const toSerial = (d) => d.getTime() / 86400000 + 25569;
export function fromSerial(n) {
  const ms = Math.round((n - 25569) * 86400000); const d = new Date(ms);
  const iso = d.toISOString();
  return n % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19);
}
const rgb = (c) => 'FF' + String(c).replace('#', '').toUpperCase().padStart(6, '0').slice(-6);

/** Registry of fonts/fills/borders/numFmts/xfs that can extend an existing styles.xml. */
export class StyleBook {
  constructor(base = { fonts: 1, fills: 2, borders: 1, xfs: 1, numFmtNext: 164 }) {
    this.base = base; this.fonts = []; this.fills = []; this.borders = []; this.numFmts = []; this.xfs = []; this.cache = new Map(); this.sub = new Map();
    this.nextFmt = base.numFmtNext; this.fmtIds = new Map();
  }
  _add(list, key, xml, baseCount) {
    const k = list === this.fonts ? 'f' : list === this.fills ? 'l' : 'b';
    const ck = k + key; if (this.sub.has(ck)) return this.sub.get(ck);
    list.push(xml); const id = baseCount + list.length - 1; this.sub.set(ck, id); return id;
  }
  fmtId(code) {
    if (code == null) return 0;
    if (code in BUILTIN) return BUILTIN[code];
    if (!this.fmtIds.has(code)) { this.fmtIds.set(code, this.nextFmt); this.numFmts.push(`<numFmt numFmtId="${this.nextFmt}" formatCode="${escAttr(code)}"/>`); this.nextFmt++; }
    return this.fmtIds.get(code);
  }
  /** @returns {number} cellXfs index */
  xf(s) {
    if (!s) return 0;
    const key = JSON.stringify(s); if (this.cache.has(key)) return this.cache.get(key);
    let fontId = 0, fillId = 0, borderId = 0;
    if (s.b || s.i || s.u || s.color || s.size || s.font) {
      const x = `<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.u ? '<u/>' : ''}<sz val="${s.size || 11}"/><color ${s.color ? `rgb="${rgb(s.color)}"` : 'theme="1"'}/><name val="${escAttr(s.font || 'Calibri')}"/><family val="2"/></font>`;
      fontId = this._add(this.fonts, x, x, this.base.fonts);
    }
    if (s.fill) { const x = `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(s.fill)}"/><bgColor indexed="64"/></patternFill></fill>`; fillId = this._add(this.fills, x, x, this.base.fills); }
    if (s.border) {
      const st = typeof s.border === 'string' ? s.border : 'thin'; const side = (n) => `<${n} style="${st}"><color rgb="FF808080"/></${n}>`;
      const x = `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`; borderId = this._add(this.borders, x, x, this.base.borders);
    }
    const numFmtId = this.fmtId(s.fmt ?? s.numFmt);
    const al = s.align || s.valign || s.wrap ? `<alignment${s.align ? ` horizontal="${s.align}"` : ''}${s.valign ? ` vertical="${s.valign}"` : ''}${s.wrap ? ' wrapText="1"' : ''}/>` : '';
    const xml = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1">' + al + '</xf>' : '/>'}`;
    this.xfs.push(xml); const id = this.base.xfs + this.xfs.length - 1; this.cache.set(key, id); return id;
  }
  /** Complete styles.xml for new workbooks. */
  render() {
    const c = (tag, base, extra, dflt) => `<${tag} count="${base + extra.length}">${dflt}${extra.join('')}</${tag}>`;
    return `${XML}<styleSheet xmlns="${NS_MAIN}">${this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.join('')}</numFmts>` : ''}`
      + c('fonts', 1, this.fonts, '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>')
      + c('fills', 2, this.fills, '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>')
      + c('borders', 1, this.borders, '<border><left/><right/><top/><bottom/><diagonal/></border>')
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + c('cellXfs', 1, this.xfs, '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>')
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/></styleSheet>';
  }
  /** Merge additions into an existing styles.xml string. */
  patch(xml) {
    const add = (tag, items) => {
      if (!items.length) return;
      const re = new RegExp(`<${tag}\\b([^>]*)count="(\\d+)"([^>]*)>`);
      if (re.test(xml)) { xml = xml.replace(re, (m, a, n, b) => `<${tag}${a}count="${+n + items.length}"${b}>`); xml = xml.replace(`</${tag}>`, items.join('') + `</${tag}>`); }
      else if (tag === 'numFmts') xml = xml.replace(/(<styleSheet\b[^>]*>)/, `$1<numFmts count="${items.length}">${items.join('')}</numFmts>`);
    };
    add('numFmts', this.numFmts); add('fonts', this.fonts); add('fills', this.fills); add('borders', this.borders); add('cellXfs', this.xfs);
    return xml;
  }
}
/** Seed a StyleBook from an existing styles.xml. */
export function bookFromStyles(xml) {
  const cnt = (tag) => { const m = new RegExp(`<${tag}\\b[^>]*count="(\\d+)"`).exec(xml); if (m) return +m[1]; const body = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml); return body ? (body[1].match(/<(font|fill|border|xf)\b/g) || []).length : 0; };
  const ids = [...xml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"/g)].map((m) => +m[1]);
  return new StyleBook({ fonts: cnt('fonts'), fills: cnt('fills'), borders: cnt('borders'), xfs: cnt('cellXfs'), numFmtNext: Math.max(163, ...ids) + 1 });
}

/** Normalise a user cell into {kind,v,f,style}. */
export function normCell(raw, sb, sheetStyle) {
  let o = raw && typeof raw === 'object' && !(raw instanceof Date) && !Array.isArray(raw) ? raw : { v: raw };
  let { v, f } = o; let style = { ...(sheetStyle || {}), ...(o.s || o.style || {}) };
  if (o.fmt) style.fmt = o.fmt; if (o.bold) style.b = true;
  if (typeof v === 'string' && v.startsWith('=') && v.length > 1 && f == null) { f = v.slice(1); v = undefined; }
  if (typeof f === 'string' && f.startsWith('=')) f = f.slice(1);
  if (v instanceof Date) { if (Number.isNaN(v.getTime())) v = null; else { const n = toSerial(v); if (!style.fmt) style.fmt = n % 1 === 0 ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm'; v = n; } }
  if (o.t === 'date' && typeof v === 'string') { const d = new Date(v); if (!Number.isNaN(d.getTime())) { v = toSerial(d); if (!style.fmt) style.fmt = 'yyyy-mm-dd'; } }
  if (o.t === 'number' && typeof v === 'string') v = Number(v);
  if (typeof v === 'number' && !Number.isFinite(v)) v = null;
  const s = sb.xf(Object.keys(style).length ? style : null);
  if (f != null) return { kind: 'f', f: String(f), v, s };
  if (v == null || v === '') return { kind: 'blank', s };
  if (typeof v === 'boolean') return { kind: 'b', v, s };
  if (typeof v === 'number') return { kind: 'n', v, s };
  return { kind: 's', v: String(v), s };
}

/** Render a <c> element. strRef(str) -> shared string index (write) or null for inline. */
export function renderCell(ref, c, strRef) {
  const s = c.s ? ` s="${c.s}"` : '';
  switch (c.kind) {
    case 'blank': return `<c r="${ref}"${s}/>`;
    case 'n': return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
    case 'b': return `<c r="${ref}"${s} t="b"><v>${c.v ? 1 : 0}</v></c>`;
    case 's': {
      if (strRef) return `<c r="${ref}"${s} t="s"><v>${strRef(c.v)}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }
    case 'f': {
      const cv = c.v; let t = '', vv = '';
      if (cv && typeof cv === 'object' && cv.error) { t = ' t="e"'; vv = `<v>${esc(cv.error)}</v>`; }
      else if (typeof cv === 'number') vv = `<v>${cv}</v>`;
      else if (typeof cv === 'boolean') { t = ' t="b"'; vv = `<v>${cv ? 1 : 0}</v>`; }
      else if (typeof cv === 'string') { t = ' t="str"'; vv = `<v>${esc(cv)}</v>`; }
      return `<c r="${ref}"${s}${t}><f>${esc(c.f)}</f>${vv}</c>`;
    }
    default: return '';
  }
}

export function autoWidth(rows) {
  const w = [];
  rows.forEach((r) => r.forEach((c, i) => {
    if (!c) return; const t = c.kind === 's' ? c.v : c.kind === 'n' ? String(c.v) : c.kind === 'f' ? String(c.v ?? c.f.length > 8 ? 10 : 6) : '';
    const len = Math.max(...String(t).split('\n').map((l) => l.length * (hasDeva(l) ? 1.25 : 1)), 0);
    w[i] = Math.max(w[i] || 0, len);
  }));
  return w.map((x) => Math.min(60, Math.max(8, Math.ceil((x || 0) + 2))));
}

/** Parse a freeze spec ('B2' | {row,col}) to {rows, cols}. */
export function freezeOf(fr) {
  if (!fr) return null;
  if (typeof fr === 'string') { const r = parseRef(fr); return { rows: r.row - 1, cols: r.col - 1 }; }
  if (typeof fr === 'object') return { rows: fr.row ?? fr.rows ?? 0, cols: fr.col ?? fr.cols ?? 0 };
  if (fr === true) return { rows: 1, cols: 0 };
  return null;
}
export function sheetViews(fr, selected) {
  const f = freezeOf(fr);
  let pane = '';
  if (f && (f.rows || f.cols)) {
    const active = f.rows && f.cols ? 'bottomRight' : f.rows ? 'bottomLeft' : 'topRight';
    pane = `<pane${f.cols ? ` xSplit="${f.cols}"` : ''}${f.rows ? ` ySplit="${f.rows}"` : ''} topLeftCell="${colName(f.cols + 1)}${f.rows + 1}" activePane="${active}" state="frozen"/><selection pane="${active}"/>`;
  }
  return `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>`;
}
export function sanitizeSheetName(n, used) {
  let s = String(n || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Sheet';
  let base = s, k = 2; while (used.has(s.toLowerCase())) { const suf = ` (${k++})`; s = base.slice(0, 31 - suf.length) + suf; }
  used.add(s.toLowerCase()); return s;
}

/**
 * Build a worksheet XML from a sheet spec.
 * @param {object} sp spec
 * @param {StyleBook} sb
 * @param {{strRef?:Function, evalCached?:Function, selected?:boolean}} o
 */
export function buildSheet(sp, sb, o = {}) { return renderSheet(prepareSheet(sp, sb), o); }

/** Normalise a sheet spec into {sp, sb, rows} (rows[r][c] = normalised cell). */
export function prepareSheet(sp, sb) {
  const rows = [];
  const hdr = sp.header === true || sp.header === 'bold';
  const headStyle = { b: true, fill: 'D9E1F2', border: true, valign: 'center', wrap: true };
  const bodyStyle = sp.border ? { border: true } : null;
  (sp.rows || []).forEach((r, ri) => {
    const arr = Array.isArray(r) ? r : [r];
    rows[ri] = arr.map((raw, ci) => normCell(raw, sb, hdr && ri === 0 ? headStyle : bodyStyle));
  });
  const set = (ref, extra) => {
    const { col, row } = parseRef(ref); rows[row - 1] = rows[row - 1] || [];
    const prev = rows[row - 1][col - 1];
    rows[row - 1][col - 1] = normCell(extra, sb, null) && { ...normCell(extra, sb, null) };
    return prev;
  };
  const fm = sp.formulas;
  const flist = Array.isArray(fm) ? fm.map((x) => [x.cell || x.ref, x.f || x.formula, x.s || x.style]) : fm ? Object.entries(fm).map(([k, v]) => [k, typeof v === 'object' ? v.f : v, typeof v === 'object' ? v.s : undefined]) : [];
  for (const [ref, f, st] of flist) { const { col, row } = parseRef(ref); const prev = rows[row - 1]?.[col - 1]; set(ref, { f, s: st, v: undefined }); if (prev && prev.s && !st) rows[row - 1][col - 1].s = prev.s; }
  for (const [rng, st] of Object.entries(sp.styles || {})) {
    const [a, b = a] = rng.split(':'); const A = parseRef(a), B = parseRef(b);
    for (let r = Math.min(A.row, B.row); r <= Math.max(A.row, B.row); r++) for (let c = Math.min(A.col, B.col); c <= Math.max(A.col, B.col); c++) {
      rows[r - 1] = rows[r - 1] || []; const cur = rows[r - 1][c - 1];
      const base = cur ? { ...cur } : { kind: 'blank', s: 0 };
      // merge style: re-normalise with the extra style on top of the existing xf is not trivially reversible, so layer on raw
      const merged = { ...(cur && cur.rawStyle ? cur.rawStyle : {}), ...st };
      base.s = sb.xf(merged); base.rawStyle = merged; rows[r - 1][c - 1] = base;
    }
  }
  return { sp, sb, rows, hdr };
}

/** Serialise a prepared sheet to worksheet XML. */
export function renderSheet(prep, o = {}) {
  const { sp, rows, hdr } = prep;
  let maxC = 0; rows.forEach((r) => { maxC = Math.max(maxC, r ? r.length : 0); });
  let sd = '';
  const heights = sp.heights || {};
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r]; const h = heights[r + 1] ?? (hdr && r === 0 ? undefined : undefined);
    if (!cells && h == null) continue;
    let x = `<row r="${r + 1}"${h != null ? ` ht="${h}" customHeight="1"` : ''}>`;
    (cells || []).forEach((c, ci) => { if (!c) return; const ref = colName(ci + 1) + (r + 1); if (c.kind === 'f' && c.v === undefined && o.evalCached) c.v = o.evalCached(c, ref); x += renderCell(ref, c, o.strRef); });
    sd += x + '</row>';
  }
  const dim = rows.length && maxC ? `<dimension ref="A1:${colName(maxC)}${rows.length}"/>` : '<dimension ref="A1"/>';
  let widths = sp.widths;
  if (!widths || widths === 'auto') widths = autoWidth(rows);
  const wl = Array.isArray(widths) ? widths : Object.entries(widths).reduce((a, [k, v]) => { a[colNum(k) - 1] = v; return a; }, []);
  const cols = wl.map((w, i) => (w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '')).join('');
  const merges = (sp.merges || []).filter(Boolean);
  const filt = sp.filter && maxC ? `<autoFilter ref="A1:${colName(maxC)}${rows.length}"/>` : '';
  return `${XML}<worksheet xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${sp.tabColor ? `<sheetPr><tabColor rgb="${rgb(sp.tabColor)}"/></sheetPr>` : ''}${dim}${sheetViews(sp.freeze, o.selected)}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${sd}</sheetData>${filt}${merges.length ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${escAttr(m)}"/>`).join('')}</mergeCells>` : ''}<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
}
