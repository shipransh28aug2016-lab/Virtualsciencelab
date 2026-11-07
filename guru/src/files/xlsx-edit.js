// In-place XLSX editing: set cells, append rows, add sheets. Preserves everything not touched.
import * as Z from './zip.js';
import { parse, kids, kid, esc, unesc } from './xml.js';
import { toU8, utf8, MIME, colName, parseRef, dec } from './util.js';
import { bookFromStyles, normCell, renderCell, prepareSheet, renderSheet, sanitizeSheetName, XML, NS_MAIN } from './xlsx-core.js';
import { evaluate } from './formula.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Row/cell level view of a worksheet's <sheetData> that keeps untouched XML verbatim. */
class SheetData {
  constructor(xml) {
    this.xml = xml; this.rows = new Map();
    const m = /<sheetData(?:\s[^>]*)?>([\s\S]*?)<\/sheetData>/.exec(xml);
    this.empty = !m; const body = m ? m[1] : '';
    const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g; let r;
    while ((r = rowRe.exec(body))) {
      const rn = +/\br="(\d+)"/.exec(r[1])[1]; const cells = new Map();
      const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let c, auto = 0;
      while ((c = cellRe.exec(r[2] || ''))) { const rm = /\br="([A-Z]+\d+)"/.exec(c[1]); const col = rm ? parseRef(rm[1]).col : ++auto; cells.set(col, c[0]); }
      this.rows.set(rn, { attrs: r[1].replace(/\s*\bspans="[^"]*"/, ''), cells });
    }
  }
  styleOf(ref) { const { row, col } = parseRef(ref); const c = this.rows.get(row)?.cells.get(col); const m = c && /\bs="(\d+)"/.exec(c.split('>')[0]); return m ? +m[1] : 0; }
  set(ref, cellXml) {
    const { row, col } = parseRef(ref);
    if (!this.rows.has(row)) this.rows.set(row, { attrs: ` r="${row}"`, cells: new Map() });
    this.rows.get(row).cells.set(col, cellXml);
  }
  lastRow() { return Math.max(0, ...this.rows.keys()); }
  maxCol() { let m = 0; for (const r of this.rows.values()) for (const c of r.cells.keys()) m = Math.max(m, c); return m; }
  serialize() {
    const rows = [...this.rows.entries()].sort((a, b) => a[0] - b[0]);
    const body = rows.map(([rn, r]) => `<row${r.attrs}>${[...r.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x).join('')}</row>`).join('');
    let xml = this.xml;
    xml = this.empty ? xml.replace(/<sheetData\s*\/>/, `<sheetData>${body}</sheetData>`) : xml.replace(/<sheetData(\s[^>]*)?>[\s\S]*?<\/sheetData>/, `<sheetData>${body}</sheetData>`);
    return xml.replace(/<dimension\b[^>]*\/>/, `<dimension ref="A1:${colName(Math.max(1, this.maxCol()))}${Math.max(1, this.lastRow())}"/>`);
  }
}

/**
 * Edit a .xlsx.
 * ops: {op:'set',sheet?,cell,value?,formula?,style?,fmt?} | {op:'setCells',sheet?,cells:{A1:v}} | {op:'appendRows',sheet?,rows,style?}
 *      | {op:'addSheet',name,rows,...sheetSpec} | {op:'renameSheet',sheet,name}
 * @returns {Promise<{bytes:Uint8Array,blob:Blob,mime:string,changes:number,warnings:string[]}>}
 */
export async function edit(input, ops = []) {
  const z = await Z.read(await toU8(input)); const files = await z.all();
  if (!files.has('xl/workbook.xml')) throw new Error('Not an XLSX: xl/workbook.xml missing');
  const text = (n) => dec.decode(files.get(n));
  let wbXml = text('xl/workbook.xml'); let relsXml = text('xl/_rels/workbook.xml.rels'); let ctXml = text('[Content_Types].xml');
  const sb = bookFromStyles(files.has('xl/styles.xml') ? text('xl/styles.xml') : '<styleSheet/>');
  const warnings = []; let changes = 0;
  const wbDoc = parse(wbXml);
  const relMap = {}; for (const r of kids(parse(relsXml), 'Relationship')) relMap[r.attrs.Id] = r.attrs.Target;
  let sheets = kids(kid(wbDoc, 'sheets'), 'sheet').map((s) => {
    let t = relMap[s.attrs['r:id']]; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); return { name: s.attrs.name, path: t, id: s.attrs['r:id'] };
  });
  const open = new Map();
  const getSD = (sel) => {
    const sh = sel == null ? sheets[0] : typeof sel === 'number' ? sheets[sel] : sheets.find((s) => s.name.toLowerCase() === String(sel).toLowerCase());
    if (!sh) throw new Error('Sheet not found: ' + sel);
    if (!open.has(sh.path)) open.set(sh.path, new SheetData(text(sh.path)));
    return open.get(sh.path);
  };
  const sst = [];
  if (files.has('xl/sharedStrings.xml')) for (const m of text('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) sst.push(unesc([...m[1].matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join('')));
  let memo = new Map();
  const cachedOf = (cell) => {
    const t = /\bt="(\w+)"/.exec(cell.slice(0, cell.indexOf('>')))?.[1]; const v = /<v>([^<]*)<\/v>/.exec(cell);
    if (t === 'inlineStr') return unesc([...cell.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((x) => x[1]).join(''));
    if (!v) return undefined;
    if (t === 's') return sst[+v[1]]; if (t === 'str') return unesc(v[1]); if (t === 'b') return v[1] === '1'; if (t === 'e') return { error: v[1] };
    const n = Number(v[1]); return Number.isNaN(n) ? v[1] : n;
  };
  const cellVal = (sn, c, r) => {
    const sh = sheets.find((x) => x.name.toLowerCase() === String(sn).toLowerCase()); if (!sh) return undefined;
    const cell = getSD(sh.name).rows.get(r)?.cells.get(c); if (!cell) return undefined;
    const key = sh.name + '|' + c + '|' + r; if (memo.has(key)) return memo.get(key);
    const f = /<f(?:\s[^>]*)?>([^<]+)<\/f>/.exec(cell); let val;
    if (f) { memo.set(key, { error: '#REF!' }); val = evaluate(unesc(f[1]), sh.name, cellVal); if (val === undefined) val = cachedOf(cell); } else val = cachedOf(cell);
    memo.set(key, val); return val;
  };
  /** Recompute cached <v> of every formula cell so viewers that skip recalculation show fresh numbers. */
  const refreshFormulas = () => {
    memo = new Map();
    for (const sh of sheets) {
      const sd = getSD(sh.name);
      for (const row of sd.rows.values()) for (const [col, cell] of row.cells) {
        const f = /<f(?:\s[^>]*)?>([^<]+)<\/f>/.exec(cell); if (!f || /<f[^>]*t="shared"/.test(cell)) continue;
        const v = cellVal(sh.name, col, +/\br="[A-Z]+(\d+)"/.exec(cell)[1]); if (v === undefined) continue;
        const ref = /\br="([A-Z]+\d+)"/.exec(cell)[1]; const sm = /\bs="(\d+)"/.exec(cell.slice(0, cell.indexOf('>')));
        row.cells.set(col, renderCell(ref, { kind: 'f', f: unesc(f[1]), v, s: sm ? +sm[1] : 0 }, null));
      }
    }
  };
  const putCell = (sd, sheetName, ref, raw, baseStyleFromCell = true) => {
    const norm = normCell(raw, sb, null);
    const hasStyle = raw && typeof raw === 'object' && !(raw instanceof Date) && (raw.s || raw.style || raw.fmt);
    if (!norm.s && baseStyleFromCell && !hasStyle && !(raw instanceof Date)) norm.s = sd.styleOf(ref);
    sd.set(ref, renderCell(ref, norm, null)); changes++;
  };
  const sheetNameOf = (sel) => (sel == null ? sheets[0] : typeof sel === 'number' ? sheets[sel] : sheets.find((s) => s.name.toLowerCase() === String(sel).toLowerCase()))?.name;

  for (const op of ops) {
    try {
      if (op.op === 'set') {
        const sd = getSD(op.sheet); const sn = sheetNameOf(op.sheet);
        const raw = { v: op.value, f: op.formula, s: op.style, fmt: op.fmt };
        if (op.value && typeof op.value === 'object' && !(op.value instanceof Date)) Object.assign(raw, op.value, { s: op.style ?? op.value.s });
        putCell(sd, sn, op.cell.toUpperCase(), op.value instanceof Date ? op.value : raw);
      } else if (op.op === 'setCells') {
        const sd = getSD(op.sheet); const sn = sheetNameOf(op.sheet);
        for (const [ref, v] of Object.entries(op.cells || {})) putCell(sd, sn, ref.toUpperCase(), v);
      } else if (op.op === 'appendRows') {
        const sd = getSD(op.sheet); const sn = sheetNameOf(op.sheet); let r = sd.lastRow();
        for (const row of op.rows || []) { r++; (Array.isArray(row) ? row : [row]).forEach((v, ci) => { const raw = v && typeof v === 'object' && !(v instanceof Date) ? v : { v }; if (op.style && !raw.s) raw.s = op.style; putCell(sd, sn, colName(ci + 1) + r, raw, false); }); }
      } else if (op.op === 'addSheet') {
        const used = new Set(sheets.map((s) => s.name.toLowerCase())); const name = sanitizeSheetName(op.name, used);
        const prep = prepareSheet({ ...op, name }, sb);
        const get = (sn, c, r) => { if (sn.toLowerCase() === name.toLowerCase()) { const x = prep.rows[r - 1]?.[c - 1]; return x && x.kind !== 'blank' ? (x.kind === 'f' ? (x.v ??= evaluate(x.f, name, get)) : x.v) : undefined; } return cellVal(sn, c, r); };
        const xml = renderSheet(prep, { selected: false, evalCached: (c) => evaluate(c.f, name, get) });
        let n = 1; while (files.has(`xl/worksheets/sheet${n}.xml`)) n++;
        const path = `xl/worksheets/sheet${n}.xml`; files.set(path, utf8(xml));
        const rid = 'rId' + (Math.max(0, ...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1);
        relsXml = relsXml.replace('</Relationships>', `<Relationship Id="${rid}" Type="${REL}/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
        const sid = Math.max(0, ...[...wbXml.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1])) + 1;
        wbXml = wbXml.replace('</sheets>', `<sheet name="${esc(name).replace(/"/g, '&quot;')}" sheetId="${sid}" r:id="${rid}"/></sheets>`);
        if (!/xmlns:r=/.test(wbXml.slice(0, 600))) wbXml = wbXml.replace(/<workbook\b/, `<workbook xmlns:r="${REL}"`);
        ctXml = ctXml.replace('</Types>', `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
        sheets.push({ name, path, id: rid }); changes++;
      } else if (op.op === 'renameSheet') {
        const sh = sheets.find((s) => s.name.toLowerCase() === String(op.sheet).toLowerCase()); if (!sh) throw new Error('Sheet not found: ' + op.sheet);
        const used = new Set(sheets.filter((s) => s !== sh).map((s) => s.name.toLowerCase())); const nn = sanitizeSheetName(op.name, used);
        wbXml = wbXml.replace(new RegExp(`(<sheet\\b[^>]*name=")${sh.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(")`), `$1${esc(nn)}$2`);
        sh.name = nn; changes++;
      } else warnings.push('unknown op: ' + (op.op || JSON.stringify(op)));
    } catch (e) { warnings.push(`${op.op}: ${e.message}`); }
  }
  if (changes) refreshFormulas();
  for (const [path, sd] of open) files.set(path, utf8(sd.serialize()));
  if (files.has('xl/styles.xml') || sb.xfs.length) files.set('xl/styles.xml', utf8(sb.patch(files.has('xl/styles.xml') ? text('xl/styles.xml') : sb.render())));
  // formulas changed: drop stale calcChain and force recalculation on load
  if (files.has('xl/calcChain.xml')) {
    files.delete('xl/calcChain.xml');
    ctXml = ctXml.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
    relsXml = relsXml.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, '');
  }
  if (/<calcPr\b/.test(wbXml)) wbXml = wbXml.replace(/<calcPr\b([^>]*?)(\/?)>/, (m, a, s) => `<calcPr${a.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"${s}>`);
  else wbXml = /<extLst/.test(wbXml) ? wbXml.replace('<extLst', '<calcPr fullCalcOnLoad="1"/><extLst') : wbXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  parse(wbXml); parse(relsXml); parse(ctXml);
  files.set('xl/workbook.xml', utf8(wbXml)); files.set('xl/_rels/workbook.xml.rels', utf8(relsXml)); files.set('[Content_Types].xml', utf8(ctXml));
  const order = ['[Content_Types].xml', ...[...files.keys()].filter((k) => k !== '[Content_Types].xml')];
  const bytes = await Z.create(order.map((name) => ({ name, data: files.get(name) })));
  return { bytes, blob: new Blob([bytes], { type: MIME.xlsx }), mime: MIME.xlsx, changes, warnings };
}
void XML; void NS_MAIN;
