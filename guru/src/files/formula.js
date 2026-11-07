// Tiny spreadsheet formula evaluator used to store cached values for generated workbooks
// (many mobile viewers show cached values only). Unsupported constructs yield `undefined`.
import { colNum, colName } from './util.js';

class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
const TOK = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)|("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z_][\w.]*)!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)(?![\w(])|([A-Za-z_][\w.]*)(?=\()|(TRUE|FALSE)\b|(<>|<=|>=|[-+*\/^&=<>%(),:]))/iy;

function tokenize(src) {
  const out = []; TOK.lastIndex = 0; let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOK.lastIndex = pos; const m = TOK.exec(src); if (!m) throw new Error('bad token');
    pos = TOK.lastIndex;
    if (m[1] !== undefined) out.push({ k: 'n', v: parseFloat(m[1]) });
    else if (m[2] !== undefined) out.push({ k: 's', v: m[2].slice(1, -1).replace(/""/g, '"') });
    else if (m[4] !== undefined) out.push({ k: 'r', sheet: m[3] ? m[3].slice(0, -1).replace(/^'|'$/g, '') : null, ref: m[4].replace(/\$/g, '').toUpperCase() });
    else if (m[5] !== undefined) out.push({ k: 'f', v: m[5].toUpperCase() });
    else if (m[6] !== undefined) out.push({ k: 'b', v: m[6].toUpperCase() === 'TRUE' });
    else out.push({ k: 'o', v: m[7] });
  }
  return out;
}
const num = (v) => { if (v instanceof FErr) throw v; if (v == null || v === '') return 0; if (typeof v === 'boolean') return +v; const n = typeof v === 'number' ? v : Number(v); if (Number.isNaN(n)) throw new FErr('#VALUE!'); return n; };
const flat = (args) => args.flatMap((a) => (a && a.range ? a.range : [a]));

const FN = {
  SUM: (a) => flat(a).reduce((s, v) => (typeof v === 'number' ? s + v : v instanceof FErr ? (() => { throw v; })() : s), 0),
  PRODUCT: (a) => flat(a).filter((v) => typeof v === 'number').reduce((s, v) => s * v, 1),
  AVERAGE: (a) => { const n = flat(a).filter((v) => typeof v === 'number'); if (!n.length) throw new FErr('#DIV/0!'); return n.reduce((s, v) => s + v, 0) / n.length; },
  MIN: (a) => Math.min(...flat(a).filter((v) => typeof v === 'number'), ...(flat(a).some((v) => typeof v === 'number') ? [] : [0])),
  MAX: (a) => Math.max(...flat(a).filter((v) => typeof v === 'number'), ...(flat(a).some((v) => typeof v === 'number') ? [] : [0])),
  COUNT: (a) => flat(a).filter((v) => typeof v === 'number').length,
  COUNTA: (a) => flat(a).filter((v) => v !== null && v !== undefined && v !== '').length,
  ROUND: (a) => { const d = 10 ** num(a[1] ?? 0); return Math.round((num(a[0]) + Number.EPSILON * Math.sign(num(a[0]))) * d) / d; },
  ROUNDUP: (a) => { const d = 10 ** num(a[1] ?? 0); const x = num(a[0]); return Math.sign(x) * Math.ceil(Math.abs(x) * d) / d; },
  ROUNDDOWN: (a) => { const d = 10 ** num(a[1] ?? 0); const x = num(a[0]); return Math.sign(x) * Math.floor(Math.abs(x) * d) / d; },
  ABS: (a) => Math.abs(num(a[0])), INT: (a) => Math.floor(num(a[0])), SQRT: (a) => { const x = num(a[0]); if (x < 0) throw new FErr('#NUM!'); return Math.sqrt(x); },
  POWER: (a) => num(a[0]) ** num(a[1]), MOD: (a) => { const d = num(a[1]); if (!d) throw new FErr('#DIV/0!'); const x = num(a[0]); return x - d * Math.floor(x / d); },
  PI: () => Math.PI, IF: (a) => (a[0] instanceof FErr ? (() => { throw a[0]; })() : a[0] ? a[1] ?? true : a[2] ?? false),
  AND: (a) => flat(a).every(Boolean), OR: (a) => flat(a).some(Boolean), NOT: (a) => !a[0],
  IFERROR: (a) => (a[0] instanceof FErr ? a[1] : a[0]),
  CONCAT: (a) => flat(a).map((v) => (v ?? '')).join(''), CONCATENATE: (a) => flat(a).map((v) => (v ?? '')).join(''),
  LEN: (a) => String(a[0] ?? '').length, UPPER: (a) => String(a[0] ?? '').toUpperCase(), LOWER: (a) => String(a[0] ?? '').toLowerCase(),
};

/**
 * Evaluate a formula (without leading "=").
 * @param {string} f
 * @param {string} sheet current sheet name
 * @param {(sheet:string, col:number, row:number)=>any} get cell value getter (should itself evaluate formulas)
 * @returns {number|string|boolean|undefined|{error:string}}
 */
export function evaluate(f, sheet, get) {
  let toks;
  try { toks = tokenize(f); } catch { return undefined; }
  let i = 0; let unsupported = false;
  const peek = () => toks[i], eat = () => toks[i++];
  const isOp = (v) => toks[i] && toks[i].k === 'o' && toks[i].v === v;
  function rangeOf(t) {
    const [a, b = a] = t.ref.split(':'); const ma = /([A-Z]+)(\d+)/.exec(a), mb = /([A-Z]+)(\d+)/.exec(b);
    const c1 = colNum(ma[1]), c2 = colNum(mb[1]), r1 = +ma[2], r2 = +mb[2]; const out = [];
    if ((Math.abs(c2 - c1) + 1) * (Math.abs(r2 - r1) + 1) > 200000) throw new FErr('#VALUE!');
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(get(t.sheet || sheet, c, r));
    return { range: out, single: !t.ref.includes(':') };
  }
  const scalar = (v) => (v && v.range ? (v.single ? v.range[0] : (() => { throw new FErr('#VALUE!'); })()) : v);
  function primary() {
    const t = eat(); if (!t) throw new Error('eof');
    if (t.k === 'n' || t.k === 's' || t.k === 'b') return t.v;
    if (t.k === 'r') return rangeOf(t);
    if (t.k === 'f') {
      eat(); const args = [];
      if (!isOp(')')) { do { args.push(isOp(',') || isOp(')') ? undefined : expr()); } while (isOp(',') && eat()); }
      if (!isOp(')')) throw new Error('paren'); eat();
      const fn = FN[t.v]; if (!fn) { unsupported = true; return 0; }
      const needScalar = !['SUM', 'PRODUCT', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'AND', 'OR', 'CONCAT', 'CONCATENATE'].includes(t.v);
      return fn(needScalar ? args.map(scalar) : args);
    }
    if (t.k === 'o' && t.v === '(') { const v = expr(); if (!isOp(')')) throw new Error('paren'); eat(); return v; }
    if (t.k === 'o' && (t.v === '-' || t.v === '+')) { const v = unary(); return t.v === '-' ? -num(scalar(v)) : v; }
    throw new Error('syntax');
  }
  function postfix() { let v = primary(); while (isOp('%')) { eat(); v = num(scalar(v)) / 100; } return v; }
  function unary() { return postfix(); }
  function power() { let v = unary(); while (isOp('^')) { eat(); v = num(scalar(v)) ** num(scalar(unary())); } return v; }
  function mul() { let v = power(); while (isOp('*') || isOp('/')) { const o = eat().v; const r = num(scalar(power())); if (o === '/') { if (r === 0) throw new FErr('#DIV/0!'); v = num(scalar(v)) / r; } else v = num(scalar(v)) * r; } return v; }
  function add() { let v = mul(); while (isOp('+') || isOp('-')) { const o = eat().v; const r = num(scalar(mul())); v = o === '+' ? num(scalar(v)) + r : num(scalar(v)) - r; } return v; }
  function cat() { let v = add(); while (isOp('&')) { eat(); v = String(scalar(v) ?? '') + String(scalar(add()) ?? ''); } return v; }
  function expr() {
    let v = cat();
    while (peek() && peek().k === 'o' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) {
      const o = eat().v; const a = scalar(v), b = scalar(cat());
      const x = typeof a === 'string' && typeof b === 'string' ? [a.toLowerCase(), b.toLowerCase()] : [a ?? 0, b ?? 0];
      v = { '=': x[0] === x[1], '<>': x[0] !== x[1], '<': x[0] < x[1], '>': x[0] > x[1], '<=': x[0] <= x[1], '>=': x[0] >= x[1] }[o];
    }
    return v;
  }
  try {
    const v = scalar(expr());
    if (i < toks.length || unsupported) return undefined;
    if (v instanceof FErr) return { error: v.code };
    if (typeof v === 'number' && !Number.isFinite(v)) return { error: '#NUM!' };
    return v;
  } catch (e) { if (e instanceof FErr) return { error: e.code }; return undefined; }
}
export { colName };
