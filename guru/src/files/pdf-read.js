// Best-effort PDF text extraction: objects, object streams, Flate content streams, ToUnicode CMaps.
import { inflateZlib } from './zip.js';
import { toU8, dec } from './util.js';

const L1 = new TextDecoder('latin1');
const WIN2 = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' };
const winChar = (c) => WIN2[c] || String.fromCharCode(c);

/** Balanced value extraction for a key in a dictionary body. */
function dictVal(d, key) {
  const m = new RegExp(`/${key}(?![\\w])\\s*`).exec(d); if (!m) return null;
  let i = m.index + m[0].length; const c = d[i];
  if (c === '<' && d[i + 1] === '<') { let depth = 0, j = i; while (j < d.length) { if (d.startsWith('<<', j)) { depth++; j += 2; } else if (d.startsWith('>>', j)) { depth--; j += 2; if (!depth) break; } else j++; } return d.slice(i, j); }
  if (c === '<') { const j = d.indexOf('>', i); return d.slice(i, j + 1); }
  if (c === '(') { let depth = 0, j = i; while (j < d.length) { if (d[j] === '\\') j++; else if (d[j] === '(') depth++; else if (d[j] === ')') { depth--; if (!depth) { j++; break; } } j++; } return d.slice(i, j); }
  if (c === '[') { let depth = 0, j = i; while (j < d.length) { if (d[j] === '[') depth++; else if (d[j] === ']') { depth--; if (!depth) { j++; break; } } j++; } return d.slice(i, j); }
  const r = /^(\d+)\s+\d+\s+R/.exec(d.slice(i)); if (r) return r[0];
  const t = /^[^\s/<>\[\]()]+/.exec(d.slice(i)) || /^\/[^\s/<>\[\]()]+/.exec(d.slice(i)); return t ? t[0] : null;
}
const refNum = (v) => { const m = v && /^(\d+)\s+\d+\s+R/.exec(v.trim()); return m ? +m[1] : null; };
const refs = (v) => [...String(v || '').matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => +m[1]);

async function inflateAny(u8) {
  try { return await inflateZlib(u8); } catch { /* try tolerant */ }
  try { const { inflateRaw } = await import('./zip.js'); return await inflateRaw(u8.subarray(2)); } catch { return null; }
}
function parseCMap(txt) {
  const map = new Map(); let codeLen = 0;
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(txt); if (cs) codeLen = cs[1].length / 2;
  const u = (h) => { let s = ''; for (let i = 0; i + 3 < h.length + 1; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return h.length === 2 ? String.fromCharCode(parseInt(h, 16)) : s; };
  for (const blk of txt.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map.set(parseInt(m[1], 16), u(m[2])); if (!codeLen) codeLen = m[1].length / 2; }
  for (const blk of txt.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:<([0-9a-fA-F]*)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16); if (!codeLen) codeLen = m[1].length / 2; if (hi - lo > 70000) continue;
      if (m[3] !== undefined) { const base = u(m[3]); const last = base.charCodeAt(base.length - 1); for (let c = lo; c <= hi; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + c - lo)); }
      else { const arr = [...m[4].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => u(x[1])); arr.forEach((s, k) => map.set(lo + k, s)); }
    }
  }
  return { map, codeLen: codeLen || 1 };
}

/** Tokenise a content stream (latin1 string) into [{t,v}] */
function* tokens(s) {
  let i = 0; const n = s.length;
  while (i < n) {
    const c = s[i];
    if (c <= ' ') { i++; continue; }
    if (c === '%') { while (i < n && s[i] !== '\n' && s[i] !== '\r') i++; continue; }
    if (c === '(') {
      let depth = 1, j = i + 1, out = '';
      while (j < n && depth) {
        const ch = s[j];
        if (ch === '\\') { const nx = s[j + 1]; if (/[0-7]/.test(nx)) { const m = /^[0-7]{1,3}/.exec(s.slice(j + 1)); out += String.fromCharCode(parseInt(m[0], 8) & 255); j += 1 + m[0].length; continue; } const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }; if (nx === '\n') { j += 2; continue; } out += map[nx] ?? nx; j += 2; continue; }
        if (ch === '(') depth++; else if (ch === ')') { depth--; if (!depth) break; }
        out += ch; j++;
      }
      yield { t: 's', v: out }; i = j + 1; continue;
    }
    if (c === '<' && s[i + 1] === '<') { yield { t: 'o', v: '<<' }; i += 2; continue; }
    if (c === '>' && s[i + 1] === '>') { yield { t: 'o', v: '>>' }; i += 2; continue; }
    if (c === '<') { const j = s.indexOf('>', i); const h = s.slice(i + 1, j).replace(/\s+/g, ''); let out = ''; for (let k = 0; k < h.length; k += 2) out += String.fromCharCode(parseInt(h.slice(k, k + 2).padEnd(2, '0'), 16)); yield { t: 's', v: out, hex: true }; i = j + 1; continue; }
    if (c === '[' || c === ']') { yield { t: 'o', v: c }; i++; continue; }
    if (c === '/') { const m = /^\/[^\s/<>\[\]()%]*/.exec(s.slice(i, i + 200)); yield { t: 'n', v: m[0].slice(1) }; i += m[0].length; continue; }
    const m = /^[^\s/<>\[\]()%]+/.exec(s.slice(i, i + 200)); if (!m) { i++; continue; }
    const w = m[0]; i += w.length;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) yield { t: 'd', v: parseFloat(w) };
    else if (w === 'BI') { const e = s.indexOf('EI', i); i = e < 0 ? n : e + 2; } else yield { t: 'o', v: w };
  }
}

function extractText(content, fonts) {
  let out = ''; let font = null; const stack = []; let curY = 0, lastY = null, positioned = false, pendingSpace = false;
  const decode = (str) => {
    let t = '';
    if (font && font.cmap) { const { map, codeLen } = font.cmap; for (let k = 0; k + codeLen <= str.length; k += codeLen) { let code = 0; for (let b = 0; b < codeLen; b++) code = (code << 8) | str.charCodeAt(b + k); t += map.get(code) ?? (codeLen === 1 ? winChar(code) : ''); } }
    else if (font && font.twoByte) t = '';
    else for (let k = 0; k < str.length; k++) { const c = str.charCodeAt(k); t += c < 32 ? '' : winChar(c); }
    return t;
  };
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; pendingSpace = false; positioned = false; lastY = null; };
  const show = (str) => {
    const t = decode(str); if (!t) return;
    if (out && lastY !== null && Math.abs(curY - lastY) > 1) { if (!out.endsWith('\n')) out += '\n'; }
    else if ((pendingSpace || positioned) && out && !/[\s]$/.test(out)) out += ' ';
    out += t; lastY = curY; positioned = false; pendingSpace = false;
  };
  for (const tk of tokens(content)) {
    if (tk.t !== 'o' || ['[', ']', '<<', '>>'].includes(tk.v)) { stack.push(tk); continue; }
    const op = tk.v;
    if (op === 'Tf') { const nm = stack[stack.length - 2]; font = nm ? fonts[nm.v] || null : null; }
    else if (op === 'Tj') { const a = stack[stack.length - 1]; if (a?.t === 's') show(a.v); }
    else if (op === 'TJ') { const open = stack.map((x) => x.v).lastIndexOf('['); for (let i = open + 1; i < stack.length; i++) { const x = stack[i]; if (x.t === 's') show(x.v); else if (x.t === 'd' && x.v < -200) pendingSpace = true; } }
    else if (op === "'" || op === '"') { nl(); const a = stack[stack.length - 1]; if (a?.t === 's') show(a.v); }
    else if (op === 'Td' || op === 'TD') { curY += stack[stack.length - 1]?.v || 0; positioned = true; }
    else if (op === 'Tm') { curY = stack[stack.length - 1]?.v || 0; positioned = true; }
    else if (op === 'T*') nl();
    else if (op === 'BT') { curY = 0; positioned = false; }
    stack.length = 0;
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
function decodePdfString(v) {
  if (!v) return '';
  let raw = v.trim(); let bytes = '';
  if (raw[0] === '(') { for (const t of tokens(raw)) { bytes = t.v; break; } }
  else if (raw[0] === '<') { for (const t of tokens(raw)) { bytes = t.v; break; } }
  if (bytes.charCodeAt(0) === 0xfe && bytes.charCodeAt(1) === 0xff) { let s = ''; for (let i = 2; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1)); return s; }
  return bytes;
}

/**
 * Best-effort PDF text extraction.
 * @returns {Promise<{format:'pdf',text:string,pages:{index:number,text:string}[],meta:object}>}
 */
export async function read(input, opts = {}) {
  const u8 = await toU8(input);
  if (L1.decode(u8.subarray(0, 8)).indexOf('%PDF') < 0) throw new Error('Not a PDF file');
  const s = L1.decode(u8); const objs = new Map();
  const reObj = /(\d+)\s+(\d+)\s+obj\b/g; let m;
  while ((m = reObj.exec(s))) {
    const num = +m[1]; const start = reObj.lastIndex; const si = s.indexOf('stream', start); const eo = s.indexOf('endobj', start);
    let dict, data = null;
    if (si !== -1 && (eo === -1 || si < eo) && /^\s*(<<[\s\S]*>>)\s*$/.test(s.slice(start, si).replace(/\s+$/, ' ')) || (si !== -1 && eo !== -1 && si < eo && s.slice(start, si).includes('<<'))) {
      dict = s.slice(start, si); let ds = si + 6; if (s[ds] === '\r') ds++; if (s[ds] === '\n') ds++;
      let de = s.indexOf('endstream', ds); if (de === -1) de = eo; const lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (lm && ds + +lm[1] <= u8.length && s.startsWith('endstream', ds + +lm[1]) || lm && /^\s*endstream/.test(s.slice(ds + +lm[1], ds + +lm[1] + 12))) de = ds + +lm[1];
      data = u8.subarray(ds, de); reObj.lastIndex = de;
    } else dict = s.slice(start, eo === -1 ? undefined : eo);
    objs.set(num, { dict: dict.trim(), data });
  }
  const stream = async (o) => {
    if (!o || !o.data) return null;
    if (/\/FlateDecode|\/Fl\b/.test(o.dict)) return inflateAny(o.data);
    if (/\/Filter/.test(o.dict)) return null;
    return o.data;
  };
  // object streams
  for (const [, o] of [...objs]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const d = await stream(o); if (!d) continue; const t = L1.decode(d); const nObj = +(dictVal(o.dict, 'N') || 0), first = +(dictVal(o.dict, 'First') || 0);
    const nums = [...t.slice(0, first).matchAll(/(\d+)\s+(\d+)/g)].slice(0, nObj).map((x) => [+x[1], +x[2]]);
    nums.forEach(([num, off], k) => { const end = k + 1 < nums.length ? nums[k + 1][1] : t.length - first; if (!objs.has(num)) objs.set(num, { dict: t.slice(first + off, first + end).trim(), data: null }); });
  }
  const trailer = [...s.matchAll(/trailer\s*(<<[\s\S]*?>>)\s*(?:startxref|$)/g)].map((x) => x[1]).join(' ') + ' ' + [...objs.values()].filter((o) => /\/Type\s*\/XRef/.test(o.dict)).map((o) => o.dict).join(' ');
  const meta = { objects: objs.size };
  if (/\/Encrypt\b/.test(trailer)) { meta.encrypted = true; return { format: 'pdf', text: '', pages: [], meta: { ...meta, note: 'Encrypted PDF: text not extracted' } }; }
  let catalog = null; for (const [, o] of objs) if (/\/Type\s*\/Catalog\b/.test(o.dict)) { catalog = o; break; }
  const info = refNum(dictVal(trailer, 'Info')) ?? [...objs].find(([, o]) => /\/(Title|Producer|Creator)\s*[(<]/.test(o.dict) && !/\/Type/.test(o.dict))?.[0];
  if (info && objs.get(info)) { const d = objs.get(info).dict; for (const [k, key] of [['title', 'Title'], ['author', 'Author'], ['subject', 'Subject'], ['producer', 'Producer'], ['creator', 'Creator']]) { const v = dictVal(d, key); if (v) { const t = decodePdfString(v); if (t) meta[k] = t; } } }
  const pageNodes = [];
  const walk = (num, inherited, depth = 0) => {
    const o = objs.get(num); if (!o || depth > 40) return; const d = o.dict;
    const res = dictVal(d, 'Resources') || inherited;
    if (/\/Kids\s*\[/.test(d) || /\/Type\s*\/Pages/.test(d)) for (const k of refs(dictVal(d, 'Kids'))) walk(k, res, depth + 1);
    else pageNodes.push({ num, d, res });
  };
  const rootPages = catalog ? refNum(dictVal(catalog.dict, 'Pages')) : null;
  if (rootPages) walk(rootPages, null); else for (const [num, o] of objs) if (/\/Type\s*\/Page\b/.test(o.dict)) pageNodes.push({ num, d: o.dict, res: dictVal(o.dict, 'Resources') });
  const fontCache = new Map();
  const loadFont = async (num) => {
    if (fontCache.has(num)) return fontCache.get(num);
    const o = objs.get(num); const f = { cmap: null, twoByte: false };
    if (o) {
      const tu = refNum(dictVal(o.dict, 'ToUnicode'));
      if (tu) { const d = await stream(objs.get(tu)); if (d) f.cmap = parseCMap(L1.decode(d)); }
      if (/\/Subtype\s*\/Type0/.test(o.dict)) f.twoByte = true;
    }
    fontCache.set(num, f); return f;
  };
  const pages = [];
  for (const [pi, pn] of pageNodes.entries()) {
    let resDict = pn.res || ''; const rn = refNum(resDict); if (rn && objs.get(rn)) resDict = objs.get(rn).dict;
    let fd = dictVal(resDict, 'Font') || ''; const fr = refNum(fd); if (fr && objs.get(fr)) fd = objs.get(fr).dict;
    const fonts = {};
    for (const fm of String(fd).matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) fonts[fm[1]] = await loadFont(+fm[2]);
    let cv = dictVal(pn.d, 'Contents') || ''; const content = [];
    for (const r of refs(cv)) { const d = await stream(objs.get(r)); if (d) content.push(L1.decode(d)); }
    pages.push({ index: pi + 1, text: extractText(content.join('\n'), fonts) });
  }
  meta.pageCount = pages.length;
  let text = pages.map((p) => p.text).join('\n\n').trim();
  const gt = !opts.ignoreGuru && catalog && refNum(dictVal(catalog.dict, 'GuruText'));
  if (gt) { const d = await stream(objs.get(gt)); if (d) { const full = dec.decode(d); const parts = full.split('\f'); text = parts.join('\n\n').trim(); meta.guru = true; if (parts.length === pages.length) parts.forEach((t, i) => { pages[i].text = t; }); } }
  if (!text) meta.note = 'No extractable text layer (scanned/image PDF?)';
  return { format: 'pdf', text, pages, meta };
}
