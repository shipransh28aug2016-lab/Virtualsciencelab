// Tests for src/files: zip, docx, xlsx, pptx, md, csv, html, pdf, index (service + tools).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as F from '../src/files/index.js';
import * as Z from '../src/files/zip.js';
import { parse as parseXml, replaceInParagraphs } from '../src/files/xml.js';
import { evaluate } from '../src/files/formula.js';

const dec = new TextDecoder();
const HI = 'नमस्ते दुनिया — भौतिकी: बल, ऊर्जा, कार्य';
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPG = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'));

/** Validate an OOXML package: well-formed XML, content types, relationship targets. */
async function checkPackage(bytes, mainRel) {
  const z = await Z.read(bytes);
  assert.equal(z.names[0], '[Content_Types].xml', 'content types must be first entry');
  const ct = parseXml(await z.text('[Content_Types].xml'));
  const defaults = new Set(ct.children.filter((c) => c.local === 'Default').map((c) => c.attrs.Extension.toLowerCase()));
  const overrides = new Map(ct.children.filter((c) => c.local === 'Override').map((c) => [c.attrs.PartName.slice(1), c.attrs.ContentType]));
  for (const [p] of overrides) assert.ok(z.has(p), `override points to missing part ${p}`);
  for (const n of z.names) {
    if (n.endsWith('/')) continue;
    if (/\.(xml|rels)$/.test(n)) parseXml(await z.text(n)); // throws when malformed
    if (n !== '[Content_Types].xml') assert.ok(overrides.has(n) || defaults.has(n.split('.').pop().toLowerCase()), `no content type for ${n}`);
    if (n.endsWith('.rels')) {
      const base = n.replace(/(^|.*\/)_rels\/[^/]*\.rels$/, '$1');
      for (const r of parseXml(await z.text(n)).children.filter((c) => c.local === 'Relationship')) {
        if (r.attrs.TargetMode === 'External') continue;
        const parts = (r.attrs.Target.startsWith('/') ? '' : base).split('/').filter(Boolean);
        for (const seg of r.attrs.Target.replace(/^\//, '').split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
        assert.ok(z.has(parts.join('/')), `${n}: dangling target ${r.attrs.Target}`);
      }
    }
  }
  const root = parseXml(await z.text('_rels/.rels'));
  assert.ok(root.children.some((r) => r.attrs.Type.endsWith(mainRel)), 'officeDocument relationship missing');
  return z;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'guru-files-'));
const have = (cmd, args = ['--version']) => { try { return spawnSync(cmd, args, { timeout: 20000 }).status === 0; } catch { return false; } };
const hasPy = (mod) => have('python3', ['-I', '-c', `import ${mod}`]);

// ------------------------------------------------------------------ zip
test('zip: create/read round trip, CRC, STORE vs DEFLATE, unicode names', async () => {
  const big = 'abc'.repeat(1000);
  const bytes = await Z.create([{ name: 'a.txt', data: big }, { name: 'हिंदी/b.txt', data: HI }, { name: 's.bin', data: new Uint8Array([1, 2, 3]), store: true }, { name: 'dir/' }]);
  const z = await Z.read(bytes);
  assert.deepEqual(z.names, ['a.txt', 'हिंदी/b.txt', 's.bin', 'dir/']);
  assert.equal(await z.text('a.txt'), big);
  assert.equal(await z.text('हिंदी/b.txt'), HI);
  assert.equal(z.entries[0].method, 8); assert.ok(z.entries[0].csize < big.length);
  assert.equal(z.entries[2].method, 0);
  assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
test('zip: node:zlib fallback path interoperates', async () => {
  Z._forceNodeZlib(true);
  const b = await Z.create({ 'x.txt': 'y'.repeat(2000) }); Z._forceNodeZlib(false);
  assert.equal((await (await Z.read(b)).text('x.txt')).length, 2000);
  const b2 = await Z.create({ 'x.txt': 'z'.repeat(2000) }); Z._forceNodeZlib(true);
  assert.equal((await (await Z.read(b2)).text('x.txt')).length, 2000); Z._forceNodeZlib(false);
});
test('zip: corruption and bad input detected', async () => {
  const b = await Z.create({ 'a.txt': 'hello world '.repeat(50) });
  const bad = b.slice(); bad[40] ^= 0xff;
  await assert.rejects(async () => { const z = await Z.read(bad); await z.get('a.txt'); });
  await assert.rejects(() => Z.read(new Uint8Array([1, 2, 3, 4])));
  await assert.rejects(() => Z.create([{ name: 'a', data: 'x' }, { name: 'a', data: 'y' }]));
});
test('zip: python zipfile can read our archive', { skip: !have('python3') }, async () => {
  const d = tmp(); const f = path.join(d, 'x.zip'); fs.writeFileSync(f, await Z.create({ 'a.txt': 'q'.repeat(500), 'हिंदी.txt': 'hi' }));
  const r = spawnSync('python3', ['-I', '-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(",".join(z.namelist()))', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /a\.txt,हिंदी\.txt/);
});

// ------------------------------------------------------------------ xml/formula helpers
test('xml: parser rejects malformed documents', () => {
  assert.throws(() => parseXml('<a><b></a>')); assert.throws(() => parseXml('<a>')); assert.throws(() => parseXml('<a x="1" x="2"/>')); assert.throws(() => parseXml('<a>&bogus;</a>'));
  assert.equal(parseXml('<a x="&lt;1&gt;"><b/>t</a>').attrs.x, '<1>');
});
test('xml: replaceInParagraphs works across runs', () => {
  const x = '<w:p><w:r><w:t>Hel</w:t></w:r><w:r><w:t>lo wor</w:t></w:r><w:r><w:t>ld</w:t></w:r></w:p>';
  const r = replaceInParagraphs(x, 'w:p', 'w:t', 'lo wo', 'LO & WO'); assert.equal(r.count, 1);
  assert.equal([...r.xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''), 'HelLO &amp; WOrld'); parseXml(r.xml);
});
test('formula: evaluator', () => {
  const g = (s, c, r) => ({ '1,1': 2, '1,2': 3 })[c + ',' + r];
  assert.equal(evaluate('SUM(A1:A2)*2', 'S', g), 10); assert.equal(evaluate('IF(A1>1,"y","n")', 'S', g), 'y');
  assert.deepEqual(evaluate('A1/0', 'S', g), { error: '#DIV/0!' }); assert.equal(evaluate('VLOOKUP(1,A1:A2,1)', 'S', g), undefined);
  assert.equal(evaluate('ROUND(10/3,2)', 'S', g), 3.33);
});

// ------------------------------------------------------------------ docx
const docSpec = {
  title: `प्रश्न पत्र / Question Paper`, lang: 'hi', meta: { author: 'Teacher', header: 'CBSE XII – Physics', footer: 'Guru' },
  blocks: [
    { t: 'h1', text: 'Section A' }, { t: 'h2', text: 'खंड ख' }, { t: 'h3', text: 'Sub' },
    { t: 'p', text: `Plain **bold** and *italic* & <escaped> ${HI}` },
    { t: 'ul', items: ['one', 'दो', { text: 'nested', level: 1 }] }, { t: 'ol', items: ['a', 'b'] }, { t: 'ol', items: ['x', 'y'] },
    { t: 'table', header: ['No', 'Question', 'Marks'], rows: [[1, 'What is बल?', 2], [2, 'Line1\nLine2', { text: 'merged', span: 1, b: true }]], widths: [1, 5, 1] },
    { t: 'bilingual', header: ['English', 'हिन्दी'], rows: [['Force', 'बल'], ['Energy', 'ऊर्जा']] },
    { t: 'img', data: PNG, alt: 'dot', width: 40, height: 40 }, { t: 'pagebreak' },
    { t: 'qa', no: 1, q: 'Define work', a: 'W = F.d' }, { t: 'math', text: 'E = mc²' }, { t: 'code', text: 'a=1\nb=2' }, { t: 'quote', text: 'Quoted' },
  ],
};
test('docx: package validity and parts', async () => {
  const b = await F.docx.write(docSpec);
  const z = await checkPackage(b, '/officeDocument');
  for (const n of ['word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/settings.xml', 'word/footer1.xml', 'word/header1.xml', 'word/media/image1.png', 'docProps/core.xml']) assert.ok(z.has(n), n);
  const doc = await z.text('word/document.xml');
  assert.match(doc, /w:cs="Mangal"|Heading1/); assert.match(doc, /w:tblBorders/); assert.match(doc, /w:br w:type="page"/); assert.match(doc, /w:lang w:bidi="hi-IN"/);
  assert.match(await z.text('word/styles.xml'), /w:cs="Mangal"/);
});
test('docx: round trip write -> read keeps text and structure', async () => {
  const r = await F.docx.read(await F.docx.write(docSpec));
  assert.equal(r.meta.title, docSpec.title); assert.equal(r.meta.author, 'Teacher'); assert.equal(r.meta.header, 'CBSE XII – Physics');
  const kinds = r.blocks.map((b) => b.t);
  assert.deepEqual(kinds.slice(0, 5), ['title', 'h1', 'h2', 'h3', 'p']);
  assert.ok(r.blocks.find((b) => b.t === 'p').text.includes(HI)); assert.ok(r.text.includes('<escaped>'));
  const ul = r.blocks.find((b) => b.t === 'ul'); assert.deepEqual(ul.items, ['one', 'दो', { text: 'nested', level: 1 }]);
  assert.equal(r.blocks.filter((b) => b.t === 'ol').length, 2);
  const tbls = r.blocks.filter((b) => b.t === 'table'); assert.equal(tbls.length, 2);
  assert.deepEqual(tbls[0].rows[0], ['No', 'Question', 'Marks']); assert.equal(tbls[0].rows[2][1], 'Line1\nLine2'); assert.deepEqual(tbls[1].rows[2], ['Energy', 'ऊर्जा']);
});
test('docx: edit replace across runs, append, fillTable, setMeta', async () => {
  const b = await F.docx.write(docSpec);
  const e = await F.docx.edit(b, [
    { op: 'replace', find: 'bold', replace: 'BOLD&' }, { op: 'replace', find: 'Sub', replace: 'उप-खंड' }, { op: 'replace', find: 'CBSE XII', replace: 'CBSE X' },
    { op: 'append', blocks: [{ t: 'h2', text: 'Appended' }, { t: 'ul', items: ['p', 'q'] }, { t: 'ol', items: ['r'] }, { t: 'table', rows: [['k', 'v']] }] },
    { op: 'fillTable', index: 0, start: 1, rows: [['9', 'New Q', '5'], ['10', 'Another', '6'], ['11', 'Third (cloned row)', '7']] },
    { op: 'setMeta', title: 'New title' }, { op: 'replace', find: 'no-such-text', replace: 'x' },
  ]);
  assert.ok(e.warnings.some((w) => /not found/.test(w))); assert.ok(e.changes >= 8);
  await checkPackage(e.bytes, '/officeDocument');
  const r = await F.docx.read(e.bytes);
  assert.ok(r.text.includes('BOLD&') && r.text.includes('उप-खंड') && r.text.includes('Appended') && r.text.includes('Third (cloned row)'));
  assert.equal(r.meta.title, 'New title'); assert.equal(r.meta.header, 'CBSE X – Physics');
  const t0 = r.blocks.find((b) => b.t === 'table'); assert.equal(t0.rows.length, 4); assert.deepEqual(t0.rows[1], ['9', 'New Q', '5']);
  const ul = r.blocks.filter((b) => b.t === 'ul').pop(); assert.deepEqual(ul.items, ['p', 'q']);
});
test('docx: input as Blob / ArrayBuffer accepted; non-docx rejected', async () => {
  const b = await F.docx.write({ blocks: [{ t: 'p', text: 'x' }] });
  assert.equal((await F.docx.read(new Blob([b]))).text, 'x'); assert.equal((await F.docx.read(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))).text, 'x');
  await assert.rejects(() => F.docx.read(new Uint8Array([1, 2, 3])));
  const x = await F.xlsx.write({ sheets: [{ rows: [[1]] }] }); await assert.rejects(() => F.docx.read(x));
});

// ------------------------------------------------------------------ xlsx
const xSpec = {
  sheets: [
    { name: 'Marks / अंक', header: true, freeze: 'A2', widths: [18, 10, 10, 12], merges: ['A6:D6'], filter: true,
      rows: [['नाम / Name', 'Maths', 'Phy', 'Total'], ['आरव', 80, 75, '=B2+C2'], ['Sia', 90.5, 88, '=SUM(B3:C3)'], [new Date(Date.UTC(2026, 3, 1)), true, null, { v: 'x', s: { b: true, fill: 'FFFF00', border: true } }], ['  padded  ', 'a & b < c', 'line1\nline2', { v: 3.14159, fmt: '0.00' }], ['Merged title'], ['avg', '=AVERAGE(B2:B3)', "=Two!A1*2", '=IF(B2>50,"pass","fail")']],
      formulas: { E7: 'B7+C7' }, styles: { A6: { b: true, align: 'center' } } },
    { name: 'Two', rows: [[21, 2], [3, '=A1+A2']] },
  ],
};
test('xlsx: package validity, sheets, shared strings, styles', async () => {
  const b = await F.xlsx.write(xSpec); const z = await checkPackage(b, '/officeDocument');
  for (const n of ['xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) assert.ok(z.has(n), n);
  const s1 = await z.text('xl/worksheets/sheet1.xml');
  assert.match(s1, /<pane [^>]*state="frozen"/); assert.match(s1, /<mergeCell ref="A6:D6"/); assert.match(s1, /<autoFilter/); assert.match(s1, /<f>B2\+C2<\/f><v>155<\/v>/);
  assert.match(await z.text('xl/workbook.xml'), /fullCalcOnLoad="1"/);
});
test('xlsx: round trip with cached formula values, dates, booleans, multi-sheet', async () => {
  const r = await F.xlsx.read(await F.xlsx.write(xSpec));
  assert.equal(r.sheets.length, 2); assert.equal(r.sheets[0].name, 'Marks   अंक'); // "/" is illegal in sheet names
  const s = r.sheets[0].rows;
  assert.deepEqual(s[0], ['नाम / Name', 'Maths', 'Phy', 'Total']); assert.deepEqual(s[1], ['आरव', 80, 75, 155]); assert.equal(s[2][3], 178.5);
  assert.equal(s[3][0], '2026-04-01'); assert.equal(s[3][1], true); assert.equal(s[3][3], 'x');
  assert.equal(s[4][0], '  padded  '); assert.equal(s[4][2], 'line1\nline2'); assert.equal(s[4][3], 3.14159);
  assert.equal(s[6][1], 85.25); assert.equal(s[6][2], 42); assert.equal(s[6][3], 'pass'); // cross-sheet formula
  assert.equal(r.sheets[0].formulas.D2, 'B2+C2'); assert.equal(r.sheets[0].formulas.E7, 'B7+C7');
  assert.deepEqual(r.sheets[0].merges, ['A6:D6']); assert.equal(r.sheets[0].freeze, 'A2'); assert.equal(r.sheets[0].widths[0], 18);
  assert.equal(r.sheets[1].rows[1][1], 24);
});
test('xlsx: reads inline strings, rich text and shared-string files from other writers', async () => {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const bytes = await Z.create([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>' },
    { name: 'xl/workbook.xml', data: `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/sharedStrings.xml', data: `<sst xmlns="${ns}"><si><r><t>Rich </t></r><r><t>text</t></r></si></sst>` },
    { name: 'xl/worksheets/sheet1.xml', data: `<worksheet xmlns="${ns}"><sheetData><row r="2"><c r="B2" t="inlineStr"><is><t>inline</t></is></c><c r="C2" t="s"><v>0</v></c><c r="D2" t="e"><v>#N/A</v></c></row></sheetData></worksheet>` },
  ]);
  const r = await F.xlsx.read(bytes); assert.deepEqual(r.sheets[0].rows, [[], ['', 'inline', 'Rich text', '#N/A']]);
});
test('xlsx: edit set/setCells/appendRows/addSheet/renameSheet and recalculates cached values', async () => {
  const b = await F.xlsx.write(xSpec);
  const e = await F.xlsx.edit(b, [
    { op: 'set', cell: 'B2', value: 99 }, { op: 'set', cell: 'F10', value: 'new & <ok>', style: { b: true } }, { op: 'set', sheet: 'Two', cell: 'C1', formula: 'A1+A2+B2' },
    { op: 'setCells', sheet: 'Two', cells: { A5: 'हिंदी', B5: new Date(Date.UTC(2026, 0, 2)) } }, { op: 'appendRows', sheet: 'Two', rows: [[5, 6, '=A6+B6']] },
    { op: 'addSheet', name: 'Added', header: true, rows: [['h', 'n'], ['a', 1], ['b', '=B2*3']] }, { op: 'renameSheet', sheet: 'Two', name: 'Second' }, { op: 'set', sheet: 'Nope', cell: 'A1', value: 1 },
  ]);
  assert.ok(e.warnings.some((w) => /Nope/.test(w)));
  await checkPackage(e.bytes, '/officeDocument');
  const r = await F.xlsx.read(e.bytes); const m = r.sheets[0].rows;
  assert.equal(m[1][1], 99); assert.equal(m[1][3], 174); assert.equal(m[6][1], 94.75); assert.equal(m[9][5], 'new & <ok>');
  assert.deepEqual(r.sheets.map((s) => s.name), ['Marks   अंक', 'Second', 'Added']);
  assert.equal(r.sheets[1].rows[0][2], 21 + 3 + 24); assert.equal(r.sheets[1].rows[4][0], 'हिंदी'); assert.equal(r.sheets[1].rows[4][1], '2026-01-02'); assert.deepEqual(r.sheets[1].rows[5].slice(0, 3), [5, 6, 11]);
  assert.deepEqual(r.sheets[2].rows, [['h', 'n'], ['a', 1], ['b', 3]]);
  assert.equal(r.sheets[0].merges[0], 'A6:D6'); assert.equal(r.sheets[0].freeze, 'A2');
});

// ------------------------------------------------------------------ pptx
const pSpec = {
  title: 'भौतिकी / Physics', theme: { primary: '0B3D91', accent: 'E07B00' },
  slides: [
    { title: 'Intro: विद्युत धारा', bullets: ['**Current** is flow of charge', 'धारा का मात्रक एम्पियर है', { text: 'sub point', level: 1 }], notes: 'Say slowly\nसमझाएं' },
    { layout: 'two-col', title: 'Compare', columns: [{ heading: 'English', bullets: ['Force', 'Energy'] }, { heading: 'हिन्दी', bullets: ['बल', 'ऊर्जा'] }] },
    { layout: 'table', title: 'Table', table: { header: ['Q', 'Marks'], rows: [['MCQ', 1], ['Long', 5]] } },
    { layout: 'quote', title: 'Quote', quote: 'Science is organised knowledge.', author: 'Spencer' },
    { title: 'With image', bullets: ['a', 'b'], image: { data: PNG } },
  ],
};
test('pptx: package validity, 16:9, notes, theme colours', async () => {
  const b = await F.pptx.write(pSpec); const z = await checkPackage(b, '/officeDocument');
  const pres = await z.text('ppt/presentation.xml'); assert.match(pres, /cx="12192000" cy="6858000"/);
  for (const n of ['ppt/slideMasters/slideMaster1.xml', 'ppt/slideLayouts/slideLayout1.xml', 'ppt/theme/theme1.xml', 'ppt/notesMasters/notesMaster1.xml', 'ppt/notesSlides/notesSlide2.xml', 'ppt/media/image1.png']) assert.ok(z.has(n), n);
  assert.match(await z.text('ppt/theme/theme1.xml'), /0B3D91/); assert.match(await z.text('ppt/theme/theme1.xml'), /script="Deva" typeface="Mangal"/);
  assert.match(await z.text('ppt/slides/slide2.xml'), /<a:cs typeface="Mangal"\/>/);
});
test('pptx: round trip title, bullets, tables, notes', async () => {
  const r = await F.pptx.read(await F.pptx.write(pSpec));
  assert.equal(r.slides.length, 6); assert.equal(r.slides[0].title, 'भौतिकी / Physics');
  assert.equal(r.slides[1].title, 'Intro: विद्युत धारा'); assert.deepEqual(r.slides[1].bullets, ['Current is flow of charge', 'धारा का मात्रक एम्पियर है', { text: 'sub point', level: 1 }]);
  assert.equal(r.slides[1].notes, 'Say slowly\nसमझाएं'); assert.deepEqual(r.slides[3].tables[0], [['Q', 'Marks'], ['MCQ', '1'], ['Long', '5']]);
  assert.ok(r.slides[2].bullets.includes('बल') && r.slides[4].bullets.includes('Science is organised knowledge.')); assert.equal(r.slides[5].pictures, 1);
});
test('pptx: edit replace/addSlide/replaceSlide/deleteSlide keeps package valid', async () => {
  const b = await F.pptx.write(pSpec);
  const e = await F.pptx.edit(b, [{ op: 'replace', find: 'Current', replace: 'CURRENT' }, { op: 'addSlide', slide: { title: 'Added', bullets: ['x'], notes: 'n' } }, { op: 'addSlide', at: 1, slide: { layout: 'title', title: 'First' } }, { op: 'replaceSlide', index: 4, slide: { title: 'Replaced', bullets: ['r'], notes: 'rn' } }, { op: 'deleteSlide', index: 2 }, { op: 'deleteSlide', index: 99 }]);
  assert.ok(e.warnings.length === 1); await checkPackage(e.bytes, '/officeDocument');
  const r = await F.pptx.read(e.bytes);
  assert.deepEqual(r.slides.map((s) => s.title), ['First', 'Intro: विद्युत धारा', 'Replaced', 'Table', 'Quote', 'With image', 'Added']);
  assert.equal(r.slides.length, 7); assert.ok(r.text.includes('CURRENT is flow')); assert.equal(r.slides.find((s) => s.title === 'Added').notes, 'n'); assert.equal(r.slides.find((s) => s.title === 'Replaced').notes, 'rn');
});

// ------------------------------------------------------------------ md / csv / html
test('md: blocks <-> markdown round trip and patching', () => {
  const src = '# T\n\nHello **w** नमस्ते\n\n- a\n  - b\n- c\n\n1. x\n2. y\n\n| A | B |\n| --- | --- |\n| 1 | 2 \\| 3 |\n\n> q\n\n```\ncode\n```\n\n## S2\n\ntext\n';
  const { title, blocks } = F.md.toBlocks(src, { liftTitle: true });
  assert.equal(title, 'T'); assert.deepEqual(blocks.find((b) => b.t === 'ul').items, ['a', { text: 'b', level: 1 }, 'c']); assert.equal(blocks.find((b) => b.t === 'table').rows[0][1], '2 | 3');
  assert.equal(F.md.fromBlocks({ title, blocks }), src);
  const p = F.md.patch('# A\n\nx\n\n## B\n\nold\n\n## C\n\nc\n', [{ op: 'replaceSection', heading: 'B', text: 'new' }, { op: 'insertAfterHeading', heading: 'C', text: 'ins' }, { op: 'replace', find: 'x', replace: 'X' }, { op: 'append', text: 'end' }, { op: 'deleteSection', heading: 'Missing' }]);
  assert.equal(p.text, '# A\n\nX\n\n## B\n\nnew\n\n## C\n\nins\n\nc\n\nend\n'); assert.equal(p.warnings.length, 1);
  assert.equal(F.md.patch('# A\n\n## B\n\nb\n\n## C\n\nc', [{ op: 'deleteSection', heading: 'B' }]).text, '# A\n\n## C\n\nc');
});
test('csv: RFC4180, BOM, quotes, newlines, Devanagari, delimiter detection', () => {
  const rows = [['a,b', 'he said "hi"', 'l1\nl2'], ['नाम', '', ' pad ']];
  const s = F.csv.stringify(rows); assert.deepEqual(F.csv.parse(s), rows);
  assert.deepEqual(F.csv.parse('﻿a;b\r\n1;2\r\n'), [['a', 'b'], ['1', '2']]); assert.deepEqual(F.csv.parse('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(F.csv.parse('a,b\n1,2\n', { header: true, typed: true }), [{ a: 1, b: 2 }]);
  const enc = F.csv.encode([['नाम']]); assert.deepEqual([...enc.slice(0, 3)], [0xef, 0xbb, 0xbf]); assert.deepEqual(F.csv.decode(enc), [['नाम']]);
  assert.throws(() => F.csv.parse('a,"b'));
  assert.equal(F.csv.stringify([['=1+1', 'ok']], { escapeFormulas: true }), "'=1+1,ok\r\n");
});
test('html: write is escaped/standalone, read recovers structure', () => {
  const h = F.html.write({ title: 'T <x>', lang: 'hi', blocks: [{ t: 'h1', text: 'H' }, { t: 'p', text: '<script>alert(1)</script> **b** ' + HI }, { t: 'ul', items: ['a', 'b'] }, { t: 'table', header: ['A', 'B'], rows: [['1', '2']] }] });
  assert.match(h, /^<!doctype html>/); assert.ok(!h.includes('<script>alert')); assert.match(h, /<html lang="hi">/); assert.match(h, /Noto Sans Devanagari/);
  const r = F.html.read(h); assert.equal(r.meta.title, 'T <x>'); assert.ok(r.text.includes(HI)); assert.deepEqual(r.blocks.find((b) => b.t === 'ul').items, ['a', 'b']); assert.deepEqual(r.blocks.find((b) => b.t === 'table').rows, [['A', 'B'], ['1', '2']]);
});

// ------------------------------------------------------------------ pdf
test('pdf: built-in writer produces valid multi-page PDF; reader round-trips text', async () => {
  const blocks = [{ t: 'h1', text: 'Section A' }, { t: 'p', text: 'Hello **bold** world (paren) \\ back. '.repeat(60) }, { t: 'ul', items: ['one', 'two'] }, { t: 'table', header: ['No', 'Question', 'Marks'], rows: Array.from({ length: 70 }, (_, i) => [i + 1, `Question text number ${i} that is rather long and has to wrap inside its cell`, 2]) }, { t: 'p', text: 'नमस्ते' }];
  const r = await F.pdf.write({ title: 'Test Paper', meta: { header: 'CBSE', footer: 'Guru' }, blocks }, { forceBuiltin: true });
  assert.equal(r.mode, 'builtin'); assert.ok(r.pages >= 3); assert.ok(r.warnings.length === 1);
  assert.equal(dec.decode(r.bytes.slice(0, 5)), '%PDF-'); assert.match(dec.decode(r.bytes.slice(-8)), /%%EOF/);
  const rd = await F.pdf.read(r.bytes, { ignoreGuru: true });
  assert.equal(rd.pages.length, r.pages); assert.match(rd.text, /Section A/); assert.match(rd.text, /Hello bold world \(paren\) \\ back\./); assert.match(rd.text, /Question text number 69/); assert.equal(rd.meta.title, 'Test Paper');
  const g = await F.pdf.read(r.bytes); assert.ok(g.text.includes('नमस्ते')); assert.equal(g.meta.guru, true);
  // every xref offset points at "N 0 obj"
  const s = Buffer.from(r.bytes).toString('latin1'); const xr = s.slice(s.indexOf('xref\n')).split('\n'); const n = +xr[1].split(' ')[1];
  for (let i = 1; i < n; i++) { const off = +xr[2 + i].slice(0, 10); assert.ok(s.startsWith(`${i} 0 obj`, off), `xref ${i}`); }
});
test('pdf: raster mode (injected rasteriser) embeds JPEG pages and keeps full text', async () => {
  const r = await F.pdf.write({ title: 'हिन्दी', lang: 'hi', blocks: [{ t: 'h1', text: 'अध्याय' }, { t: 'p', text: 'यह हिंदी पाठ है. English too.' }] }, { rasterizer: async (pages) => pages.map(() => ({ data: JPG, width: 1, height: 1 })), measure: (t, s) => t.length * s.size * 0.5 });
  assert.equal(r.mode, 'raster'); assert.equal(r.warnings.length, 0);
  const s = Buffer.from(r.bytes).toString('latin1'); assert.match(s, /\/DCTDecode/);
  const rd = await F.pdf.read(r.bytes); assert.ok(rd.text.includes('अध्याय') && rd.text.includes('यह हिंदी पाठ है.')); assert.equal(rd.meta.title, 'हिन्दी');
});
test('pdf: reader extracts text from Flate streams, TJ arrays and ToUnicode CMaps', async () => {
  const enc = (s) => new TextEncoder().encode(s);
  const cmap = '/CIDInit begincmap 1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0001> <0928> <0002> <092E> endbfchar 1 beginbfrange <0003> <0004> <0938> endbfrange endcmap';
  const content = 'BT /F1 12 Tf 72 700 Td [(Hel) -30 (lo) -400 (there)] TJ 0 -20 Td (Second line) Tj ET BT /F2 12 Tf 72 600 Td <000100020003> Tj ET';
  const objs = [];
  const add = async (dict, data) => { const z = data ? await Z.deflateZlib(enc(data)) : null; objs.push([dict + (z ? ` /Filter /FlateDecode /Length ${z.length}` : ''), z]); };
  await add('<< /Type /Catalog /Pages 2 0 R >>'); await add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  await add('<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>'); await add('<<', content);
  await add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'); await add('<< /Type /Font /Subtype /Type0 /BaseFont /X /ToUnicode 7 0 R >>'); await add('<<', cmap);
  const parts = ['%PDF-1.5\n']; objs.forEach(([d, z], i) => { parts.push(`${i + 1} 0 obj\n`); if (z) { parts.push(d.replace('<<', '<<') + ' >>\nstream\n', z, '\nendstream\n'); } else parts.push(d + '\n'); parts.push('endobj\n'); });
  parts.push('trailer\n<< /Root 1 0 R >>\n%%EOF');
  const bytes = Z && new Uint8Array(await new Blob(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : p))).arrayBuffer());
  const r = await F.pdf.read(bytes);
  assert.equal(r.pages.length, 1); assert.match(r.text, /Hello there/); assert.match(r.text, /Second line/); assert.ok(r.text.includes('नमसस') || r.text.includes('नमस'), r.text);
  const enc2 = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 9 0 R >>\n')]);
  assert.equal((await F.pdf.read(enc2)).meta.encrypted, true);
  await assert.rejects(() => F.pdf.read(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])));
});

// ------------------------------------------------------------------ index: service + tools
function fakeKernel() {
  const tools = new Map(); const svc = new Map(); const store = new Map(); let n = 0;
  const artifacts = { add(blob, filename) { const id = 'a' + ++n; store.set(id, { blob, filename }); return { id, filename, blobRef: id }; }, get: (id) => store.get(id) };
  return { tools: { register: (t) => tools.set(t.name, t), call: (nm, a, ctx) => tools.get(nm).run(a, ctx || { artifacts }) }, services: { set: (k, v) => svc.set(k, v), get: (k) => svc.get(k), has: (k) => svc.has(k) }, artifacts, svc, tools_: tools, store };
}
test('index: format detection by name, mime and magic bytes', async () => {
  const d = await F.docx.write({ blocks: [{ t: 'p', text: 'x' }] });
  assert.equal(await F.detect(d, 'noext'), 'docx'); assert.equal(await F.detect(new Uint8Array(10), 'a.MD'), 'md'); assert.equal(await F.detect(new Uint8Array(10), 'text/csv'), 'csv'); assert.equal(await F.detect(PNG, ''), 'png'); assert.equal(await F.detect(new Uint8Array(0), 'x.markdown'), 'md');
});
test('index: read/write for every format via service API', async () => {
  const k = fakeKernel(); await F.register(k); const files = k.svc.get('files');
  for (const fmt of ['docx', 'xlsx', 'pptx', 'pdf', 'md', 'csv', 'html', 'json', 'zip', 'txt']) {
    const spec = fmt === 'xlsx' || fmt === 'csv' ? { sheets: [{ rows: [['a', 1], ['नाम', 2]] }] } : fmt === 'pptx' ? pSpec : fmt === 'json' ? { data: { a: [1, 2] } } : fmt === 'zip' ? { files: [{ name: 'a.txt', text: 'hi' }] } : { title: 'Doc ' + fmt, blocks: [{ t: 'p', text: 'Body text' }] };
    const out = await files.write(fmt, spec); assert.ok(out.blob instanceof Blob && out.blob.size > 0, fmt); assert.ok(out.filename.endsWith('.' + fmt), out.filename); assert.ok(out.mime);
    const back = await files.read(out.blob, out.filename); assert.equal(back.format, fmt);
    if (fmt === 'json') assert.deepEqual(back.data, { a: [1, 2] });
    if (fmt === 'xlsx') assert.equal(back.sheets[0].rows[1][0], 'नाम'); if (fmt === 'csv') assert.equal(back.sheets[0].rows[1][0], 'नाम');
    if (['docx', 'pdf', 'md', 'html', 'txt'].includes(fmt)) assert.ok(back.text.includes('Body text'), fmt);
  }
  assert.equal((await files.read(PNG, 'a.png')).meta.width, 1); await assert.rejects(() => files.write('exe', {}));
  const md2 = await files.write('docx', '# Hello\n\n- a\n- b'); assert.equal(md2.filename, 'Hello.docx');
  assert.equal(typeof files.zip.create, 'function'); assert.equal(typeof files.zip.read, 'function');
});
test('index: files.edit handles md/csv/json/docx; unsupported rejected', async () => {
  const k = fakeKernel(); await F.register(k); const files = k.svc.get('files');
  const m = await files.edit(new TextEncoder().encode('# A\n\nold'), 'md', [{ op: 'replace', find: 'old', replace: 'new' }]); assert.equal(await m.blob.text(), '# A\n\nnew');
  const c = await files.edit(new TextEncoder().encode('a,b\n1,2\n'), 'csv', [{ op: 'appendRows', rows: [['नाम', 3]] }, { op: 'setCell', row: 1, col: 0, value: 'x' }]); assert.deepEqual(F.csv.decode(c.bytes), [['a', 'b'], ['x', '2'], ['नाम', '3']]);
  const j = await files.edit(new TextEncoder().encode('{"a":{"b":1}}'), 'json', [{ op: 'set', path: 'a.c[1]', value: 5 }, { op: 'set', path: '__proto__.x', value: 1 }]); assert.deepEqual(JSON.parse(await j.blob.text()), { a: { b: 1, c: [null, 5] } }); assert.equal(j.warnings.length, 1);
  await assert.rejects(() => files.edit(new Uint8Array(4), 'pdf', []));
});
test('index: tools file_write -> file_read -> file_edit through artifacts', async () => {
  const k = fakeKernel(); await F.register(k);
  for (const t of ['file_read', 'file_write', 'file_edit']) assert.ok(k.tools_.has(t), t);
  const w = await k.tools.call('file_write', { format: 'docx', filename: 'paper', spec: { title: 'Q', blocks: [{ t: 'p', text: 'Alpha ' + HI }] } });
  assert.equal(w.artifact.filename, 'paper.docx'); assert.ok(w.artifact.blobRef);
  const r = await k.tools.call('file_read', { artifact: w.artifact.blobRef }); assert.equal(r.format, 'docx'); assert.ok(r.text.includes(HI));
  const e = await k.tools.call('file_edit', { artifact: w.artifact.blobRef, ops: [{ op: 'replace', find: 'Alpha', replace: 'Beta' }], filename: 'paper2' });
  assert.equal(e.artifact.filename, 'paper2.docx'); assert.equal(e.changes, 1);
  const r2 = await k.tools.call('file_read', { artifact: e.artifact.blobRef }); assert.ok(r2.text.includes('Beta'));
  const big = await k.tools.call('file_read', { text: 'x'.repeat(30000), name: 'a.txt', maxChars: 100 }); assert.equal(big.text.length, 100); assert.equal(big.truncated, true);
  const x = await k.tools.call('file_write', { format: 'xlsx', spec: { sheets: [{ rows: [[1, 2], ['=A1+B1']] }] } }); const xr = await k.tools.call('file_read', { artifact: x.artifact.blobRef }); assert.equal(xr.sheets[0].rows[1][0], 3);
  await assert.rejects(() => k.tools.call('file_read', {})); await assert.rejects(() => k.tools.call('file_read', { artifact: 'missing' }));
  const bare = await k.tools.call('file_write', { format: 'md', spec: '# x' }, {}); assert.ok(bare.artifact || bare.base64 !== undefined);
});
test('index: connector source for file_read', async () => {
  const k = fakeKernel(); await F.register(k);
  k.svc.set('connectors', { get: (id) => (id === 'gdrive' ? { read: async (p, o) => { assert.equal(o.as, 'blob'); return new Blob(['# From Drive']); } } : null) });
  const r = await k.tools.call('file_read', { connector: 'gdrive', path: 'abc/notes.md' }); assert.equal(r.format, 'md'); assert.match(r.text, /From Drive/);
});

// ------------------------------------------------------------------ real-world openability
test('external: python-docx / openpyxl / python-pptx open generated files', { skip: !(hasPy('docx') && hasPy('openpyxl') && hasPy('pptx')) }, async () => {
  const d = tmp();
  const docx = await F.docx.edit(await F.docx.write(docSpec), [{ op: 'append', blocks: [{ t: 'ul', items: ['z'] }] }, { op: 'fillTable', index: 0, start: 1, rows: [['7', 'Q7', '1']] }]);
  const xlsx = await F.xlsx.edit(await F.xlsx.write(xSpec), [{ op: 'set', cell: 'B2', value: 7 }, { op: 'addSheet', name: 'New', rows: [[1, '=A1+1']] }]);
  const pptx = await F.pptx.edit(await F.pptx.write(pSpec), [{ op: 'addSlide', slide: { title: 'Z', bullets: ['q'], notes: 'nn' } }]);
  fs.writeFileSync(path.join(d, 'a.docx'), docx.bytes); fs.writeFileSync(path.join(d, 'a.xlsx'), xlsx.bytes); fs.writeFileSync(path.join(d, 'a.pptx'), pptx.bytes);
  const py = `
import sys, docx, openpyxl, pptx
d = docx.Document(sys.argv[1] + '/a.docx')
assert any('${HI.slice(0, 6)}' in p.text for p in d.paragraphs), 'docx text'
assert len(d.tables) >= 2 and d.tables[0].rows[1].cells[1].text == 'Q7', 'docx table'
assert d.sections[0].footer.paragraphs[0].text.startswith('Guru'), 'footer'
w = openpyxl.load_workbook(sys.argv[1] + '/a.xlsx'); s = w.worksheets[0]
assert w.sheetnames[-1] == 'New' and s['B2'].value == 7 and s['D2'].value == '=B2+C2' and s.freeze_panes == 'A2', 'xlsx'
v = openpyxl.load_workbook(sys.argv[1] + '/a.xlsx', data_only=True).worksheets[0]
assert v['D2'].value == 82, v['D2'].value
p = pptx.Presentation(sys.argv[1] + '/a.pptx')
sl = list(p.slides); assert len(sl) == 7 and sl[-1].shapes.title.text == 'Z' and sl[-1].notes_slide.notes_text_frame.text == 'nn', 'pptx'
assert sl[1].notes_slide.notes_text_frame.text.startswith('Say slowly')
print('OK')`;
  const r = spawnSync('python3', ['-I', '-c', py, d], { encoding: 'utf8', timeout: 60000 });
  assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /OK/);
});
test('external: LibreOffice opens docx/xlsx/pptx and renders Devanagari', { skip: !(have('soffice') && have('pdftotext', ['-v'])), timeout: 240000 }, async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.docx'), await F.docx.write(docSpec));
  fs.writeFileSync(path.join(d, 'b.xlsx'), await F.xlsx.write({ sheets: [{ name: 'S1', rows: [[HI, 1], ['x', '=B1*2']] }] }));
  fs.writeFileSync(path.join(d, 'c.pptx'), await F.pptx.write(pSpec));
  const r = spawnSync('soffice', ['--headless', `-env:UserInstallation=file://${d}/profile`, '--convert-to', 'pdf', '--outdir', d, ...['a.docx', 'b.xlsx', 'c.pptx'].map((x) => path.join(d, x))], { encoding: 'utf8', timeout: 200000, cwd: d });
  assert.equal(r.status, 0, r.stderr);
  for (const n of ['a', 'b', 'c']) assert.ok(fs.existsSync(path.join(d, n + '.pdf')), n + '.pdf missing');
  const txt = (n) => spawnSync('pdftotext', ['-layout', path.join(d, n + '.pdf'), '-'], { encoding: 'utf8' }).stdout;
  assert.ok(txt('a').includes('Question Paper') && txt('a').includes('नमस्ते') && txt('a').includes('CBSE XII'), 'docx render');
  assert.ok(txt('b').includes('भौतिकी') && /\b2\b/.test(txt('b')), 'xlsx render');
  assert.ok(txt('c').includes('Physics') && txt('c').includes('एम्पियर'), 'pptx render');
});
test('external: poppler and pypdf read built-in PDFs', { skip: !have('pdftotext', ['-v']) }, async () => {
  const d = tmp(); const r = await F.pdf.write({ title: 'Paper', blocks: [{ t: 'h1', text: 'Heading One' }, { t: 'table', header: ['A', 'B'], rows: [['cell-1', 'cell-2']] }] }, { forceBuiltin: true });
  fs.writeFileSync(path.join(d, 'a.pdf'), r.bytes);
  const out = spawnSync('pdftotext', [path.join(d, 'a.pdf'), '-'], { encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr); assert.ok(out.stdout.includes('Heading One') && out.stdout.includes('cell-2'));
  if (hasPy('pypdf')) { const p = spawnSync('python3', ['-I', '-c', 'import pypdf,sys;r=pypdf.PdfReader(sys.argv[1]);assert len(r.pages)==1 and "Heading One" in r.pages[0].extract_text();print("OK")', path.join(d, 'a.pdf')], { encoding: 'utf8' }); assert.equal(p.status, 0, p.stderr); }
});
