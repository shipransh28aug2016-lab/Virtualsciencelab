// RFC 4180 CSV parse/stringify with BOM handling (Excel + Devanagari safe).
import { utf8, decodeText, concat } from './util.js';

/**
 * Parse CSV text into rows of strings.
 * @param {string} text
 * @param {{delimiter?:string,typed?:boolean,header?:boolean}} [opts] delimiter auto-detected when omitted
 * @returns {any[][]|Record<string,any>[]}
 */
export function parse(text, opts = {}) {
  let s = String(text ?? ''); if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let d = opts.delimiter;
  if (!d) {
    const first = s.split(/\r?\n/, 1)[0] || ''; let best = ',', bc = -1;
    for (const c of [',', ';', '\t', '|']) { let n = 0, q = false; for (const ch of first) { if (ch === '"') q = !q; else if (ch === c && !q) n++; } if (n > bc) { bc = n; best = c; } }
    d = best;
  }
  const rows = []; let row = [], f = '', q = false, i = 0, started = false;
  const endField = () => { row.push(f); f = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  while (i < s.length) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += ch; i++; continue;
    }
    if (ch === '"' && f === '' && !started) { q = true; started = true; i++; continue; }
    if (ch === d) { endField(); i++; continue; }
    if (ch === '\r') { endRow(); i += s[i + 1] === '\n' ? 2 : 1; continue; }
    if (ch === '\n') { endRow(); i++; continue; }
    f += ch; started = true; i++;
  }
  if (q) throw new Error('CSV parse error: unterminated quoted field');
  if (f !== '' || row.length || started) endRow();
  const typed = opts.typed ? rows.map((r) => r.map((v) => (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(v) && !/^0\d/.test(v) ? Number(v) : v))) : rows;
  if (opts.header && typed.length) { const h = typed[0].map(String); return typed.slice(1).map((r) => Object.fromEntries(h.map((k, j) => [k, r[j] ?? '']))); }
  return typed;
}

/**
 * Serialise rows to CSV text.
 * @param {any[][]} rows
 * @param {{delimiter?:string,eol?:string,bom?:boolean,escapeFormulas?:boolean}} [opts]
 */
export function stringify(rows, opts = {}) {
  const d = opts.delimiter || ','; const eol = opts.eol || '\r\n';
  const cell = (v) => {
    if (v == null) return '';
    if (v instanceof Date) v = v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 19 : 10);
    let t = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (opts.escapeFormulas && typeof v === 'string' && /^[=+\-@\t\r]/.test(t) && !/^-?\d/.test(t)) t = "'" + t;
    return /[",\r\n]/.test(t) || t.includes(d) || /^\s|\s$/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const body = rows.map((r) => (Array.isArray(r) ? r : [r]).map(cell).join(d)).join(eol) + (rows.length ? eol : '');
  return (opts.bom ? '﻿' : '') + body;
}
/** Encode rows to UTF-8 bytes; BOM on by default so Excel detects Devanagari. */
export function encode(rows, opts = {}) { return utf8(stringify(rows, { bom: true, ...opts })); }
/** Decode CSV bytes (any BOM / encoding) to rows. */
export function decode(u8, opts = {}) { return parse(decodeText(u8), opts); }
export { concat };
