// XLSX writer / reader (SpreadsheetML), zero deps. Editing lives in xlsx-edit.js.
import * as Z from './zip.js';
import { esc, parse, kids, kid, desc, textOf } from './xml.js';
import { toU8, colNum, colName, parseRef } from './util.js';
import { XML, NS_MAIN, StyleBook, prepareSheet, renderSheet, sanitizeSheetName, fromSerial } from './xlsx-core.js';
import { evaluate } from './formula.js';
export { edit } from './xlsx-edit.js';

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Build a .xlsx.
 * @param {{title?:string,meta?:{author?:string},sheets:Array<{name?:string,rows:any[][],widths?:number[]|'auto',formulas?:object,header?:boolean,freeze?:string|{row:number,col:number},merges?:string[],styles?:Record<string,object>,filter?:boolean,border?:boolean}>}} spec
 * @returns {Promise<Uint8Array>}
 */
export async function write(spec = {}) {
  const sheetsIn = spec.sheets && spec.sheets.length ? spec.sheets : [{ name: 'Sheet1', rows: spec.rows || [[]] }];
  const used = new Set(); const names = sheetsIn.map((s) => sanitizeSheetName(s.name, used));
  const sb = new StyleBook(); const sst = []; const sstMap = new Map(); let sstCount = 0;
  const strRef = (s) => { sstCount++; if (!sstMap.has(s)) { sstMap.set(s, sst.length); sst.push(s); } return sstMap.get(s); };
  // phase 1: normalise every sheet; phase 2: evaluate cached formula values (cross-sheet aware) and render
  const preps = sheetsIn.map((sp, i) => prepareSheet({ ...sp, name: names[i] }, sb));
  const lowerIdx = new Map(names.map((n, i) => [n.toLowerCase(), i]));
  const get = (sn, c, r) => {
    const i = lowerIdx.get(String(sn).toLowerCase()); if (i === undefined) return undefined;
    const x = preps[i].rows[r - 1]?.[c - 1]; if (!x) return undefined;
    if (x.kind === 'f') { if (x.v === undefined) { if (x._busy) return { error: '#REF!' }; x._busy = true; const cur = names.findIndex((_, k) => preps[k] === preps[i]); x.v = evaluate(x.f, names[cur], get); x._busy = false; } return x.v; }
    return x.kind === 'blank' ? undefined : x.v;
  };
  const parts = preps.map((pr, i) => renderSheet(pr, { strRef, selected: i === 0, evalCached: (c) => evaluate(c.f, names[i], get) }));
  const ct = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const files = [
    { name: '[Content_Types].xml', data: ct },
    { name: '_rels/.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: `${XML}<workbook xmlns="${NS_MAIN}" xmlns:r="${REL}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${names.map((n, i) => `<sheet name="${esc(n).replace(/"/g, '&quot;')}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${names.length + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    ...parts.map((p, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: p })),
    { name: 'xl/styles.xml', data: sb.render() },
    { name: 'xl/sharedStrings.xml', data: `${XML}<sst xmlns="${NS_MAIN}" count="${sstCount}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>` },
    { name: 'docProps/core.xml', data: `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(spec.title || '')}</dc:title><dc:creator>${esc(spec.meta?.author || 'Guru')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Guru</Application></Properties>` },
  ];
  return Z.create(files);
}

// ---------------------------------------------------------------- read
function isDateFmt(id, code) {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
  if (!code) return false;
  const c = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(c) && !/^[#0,.%\s]*$/.test(c);
}

/**
 * Read a .xlsx: all sheets, shared/inline strings, formulas and cached values.
 * @returns {Promise<{format:'xlsx',text:string,sheets:Array<{name:string,rows:any[][],formulas:Record<string,string>,merges:string[],widths:number[],freeze?:string}>,meta:object}>}
 */
export async function read(input) {
  const z = await Z.read(await toU8(input));
  if (!z.has('xl/workbook.xml')) throw new Error('Not an XLSX: xl/workbook.xml missing');
  const wb = parse(await z.text('xl/workbook.xml'));
  const rels = {};
  if (z.has('xl/_rels/workbook.xml.rels')) for (const r of kids(parse(await z.text('xl/_rels/workbook.xml.rels')), 'Relationship')) rels[r.attrs.Id] = r.attrs.Target;
  const sst = [];
  if (z.has('xl/sharedStrings.xml')) for (const si of kids(parse(await z.text('xl/sharedStrings.xml')), 'si')) sst.push(desc(si, 't').filter((t) => !(t.parentPhonetic)).map(textOf).join(''));
  const dateXf = new Set();
  if (z.has('xl/styles.xml')) {
    const st = parse(await z.text('xl/styles.xml')); const codes = {};
    for (const nf of desc(st, 'numFmt')) codes[nf.attrs.numFmtId] = nf.attrs.formatCode;
    const xfs = kids(kid(st, 'cellXfs'), 'xf'); xfs.forEach((x, i) => { const id = +x.attrs.numFmtId; if (isDateFmt(id, codes[id])) dateXf.add(i); });
  }
  const date1904 = kid(wb, 'workbookPr')?.attrs.date1904 === '1';
  const sheets = [];
  for (const sh of kids(kid(wb, 'sheets'), 'sheet')) {
    let target = rels[sh.attrs['r:id']] || rels[Object.keys(sh.attrs).find((k) => k.endsWith(':id'))];
    if (!target) continue;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    if (!z.has(target)) continue;
    const sx = parse(await z.text(target)); const grid = []; const formulas = {};
    let maxC = 0;
    for (const row of desc(kid(sx, 'sheetData'), 'row')) {
      let rn = +row.attrs.r || grid.length + 1; let cn = 0;
      for (const c of kids(row, 'c')) {
        let ci; if (c.attrs.r) { const p = parseRef(c.attrs.r); ci = p.col - 1; rn = p.row; } else ci = cn; cn = ci + 1;
        const t = c.attrs.t; const vEl = kid(c, 'v'); const raw = vEl ? textOf(vEl) : undefined; let val = '';
        if (t === 's') val = sst[+raw] ?? ''; else if (t === 'inlineStr') val = desc(kid(c, 'is') || c, 't').map(textOf).join('');
        else if (t === 'str') val = raw ?? ''; else if (t === 'b') val = raw === '1'; else if (t === 'e') val = raw ?? '#ERR';
        else if (raw !== undefined && raw !== '') { const n = Number(raw); val = Number.isNaN(n) ? raw : dateXf.has(+c.attrs.s) ? fromSerial(date1904 ? n + 1462 : n) : n; }
        const f = kid(c, 'f'); const ft = f ? textOf(f) : ''; if (ft) formulas[colName(ci + 1) + rn] = ft;
        (grid[rn - 1] = grid[rn - 1] || [])[ci] = val; maxC = Math.max(maxC, ci + 1);
      }
    }
    const rows = []; for (let r = 0; r < grid.length; r++) { const src = grid[r] || []; const out = []; for (let c = 0; c < src.length; c++) out.push(src[c] === undefined ? '' : src[c]); rows.push(out); }
    while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
    const merges = desc(sx, 'mergeCell').map((m) => m.attrs.ref);
    const widths = []; for (const c of desc(sx, 'col')) for (let k = +c.attrs.min; k <= +c.attrs.max && k < 2000; k++) widths[k - 1] = +c.attrs.width;
    const pane = desc(sx, 'pane')[0]; let freeze;
    if (pane && pane.attrs.state?.startsWith('frozen')) freeze = colName((+pane.attrs.xSplit || 0) + 1) + ((+pane.attrs.ySplit || 0) + 1);
    sheets.push({ name: sh.attrs.name, rows, formulas, merges, widths, ...(freeze ? { freeze } : {}), ...(sh.attrs.state && sh.attrs.state !== 'visible' ? { hidden: true } : {}) });
  }
  const text = sheets.map((s) => `## ${s.name}\n` + s.rows.map((r) => r.map((v) => String(v).replace(/[\t\n]/g, ' ')).join('\t')).join('\n')).join('\n\n');
  return { format: 'xlsx', text, sheets, meta: { sheetCount: sheets.length, names: sheets.map((s) => s.name), formulaCount: sheets.reduce((n, s) => n + Object.keys(s.formulas).length, 0) } };
}
export { colNum };
