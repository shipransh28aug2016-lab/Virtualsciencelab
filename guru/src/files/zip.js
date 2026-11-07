// ZIP (STORE+DEFLATE) with CRC32. Uses CompressionStream when present, node:zlib otherwise.
import { utf8, toU8, concat, dec } from './util.js';

const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
/** CRC-32 (IEEE). @param {Uint8Array} u8 @returns {number} */
export function crc32(u8, prev = 0) {
  let c = (prev ^ 0xffffffff) >>> 0;
  for (let i = 0; i < u8.length; i++) c = TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

let forceNode = false;
/** Test hook: force the node:zlib code path. */
export function _forceNodeZlib(v) { forceNode = !!v; }

async function nodeZlib() {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try { const name = 'node:zlib'; return await import(/* @vite-ignore */ name); } catch { /* fall through */ }
  }
  return null;
}
async function viaStream(kind, fmt, u8, maxOut) {
  const stream = new Blob([u8]).stream().pipeThrough(new (kind === 'c' ? CompressionStream : DecompressionStream)(fmt));
  if (!maxOut) return new Uint8Array(await new Response(stream).arrayBuffer());
  const rd = stream.getReader(); const parts = []; let n = 0;
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    n += value.length; if (n > maxOut) { try { await rd.cancel(); } catch { /* ignore */ } throw new Error('ZIP entry exceeds declared size'); }
    parts.push(value);
  }
  const out = new Uint8Array(n); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; }
  return out;
}
async function run(kind, fmt, u8, maxOut) {
  if (!forceNode && typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined') return viaStream(kind, fmt, u8, maxOut);
  const z = await nodeZlib();
  if (!z) throw new Error('No DEFLATE implementation available');
  const fn = { c: { 'deflate-raw': 'deflateRawSync', deflate: 'deflateSync' }, d: { 'deflate-raw': 'inflateRawSync', deflate: 'inflateSync' } }[kind][fmt];
  return new Uint8Array(maxOut ? z[fn](u8, { maxOutputLength: maxOut }) : z[fn](u8));
}
/** Raw DEFLATE. */ export const deflateRaw = (u8) => run('c', 'deflate-raw', u8);
/** Raw INFLATE. */ export const inflateRaw = (u8, maxOut) => run('d', 'deflate-raw', u8, maxOut);
/** zlib-wrapped deflate (PDF FlateDecode). */ export const deflateZlib = (u8) => run('c', 'deflate', u8);
/** zlib-wrapped inflate. */ export const inflateZlib = (u8) => run('d', 'deflate', u8);

function dosTime(d) { return [((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff]; }

/**
 * Create a ZIP archive.
 * @param {Array<{name:string,data:Uint8Array|string,store?:boolean,date?:Date}>|Record<string,Uint8Array|string>} files
 * @param {{date?:Date}} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function create(files, opts = {}) {
  const list = Array.isArray(files) ? files : Object.entries(files).map(([name, data]) => ({ name, data }));
  const local = [], central = []; let offset = 0;
  const seen = new Set();
  for (const f of list) {
    const name = String(f.name).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || seen.has(name)) { if (seen.has(name)) throw new Error('Duplicate zip entry: ' + name); continue; }
    seen.add(name);
    const nameB = utf8(name); const isDir = name.endsWith('/');
    const raw = isDir ? new Uint8Array(0) : typeof f.data === 'string' ? utf8(f.data) : await toU8(f.data);
    let method = 0, body = raw;
    if (!f.store && raw.length > 32) { const d = await deflateRaw(raw); if (d.length < raw.length) { method = 8; body = d; } }
    const [t, dd] = dosTime(f.date || opts.date || new Date()); const crc = crc32(raw);
    const lh = new Uint8Array(30 + nameB.length); const v = new DataView(lh.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, method, true);
    v.setUint16(10, t, true); v.setUint16(12, dd, true); v.setUint32(14, crc, true); v.setUint32(18, body.length, true);
    v.setUint32(22, raw.length, true); v.setUint16(26, nameB.length, true); v.setUint16(28, 0, true); lh.set(nameB, 30);
    local.push(lh, body);
    const ch = new Uint8Array(46 + nameB.length); const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, method, true);
    c.setUint16(12, t, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, raw.length, true);
    c.setUint16(28, nameB.length, true); c.setUint32(38, isDir ? 0x10 : 0, true); c.setUint32(42, offset, true); ch.set(nameB, 46);
    central.push(ch); offset += lh.length + body.length;
  }
  const cd = concat(central); const end = new Uint8Array(22); const e = new DataView(end.buffer);
  if (central.length > 0xffff || offset > 0xfffffff0) throw new Error('Archive too large (ZIP64 unsupported)');
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, central.length, true); e.setUint16(10, central.length, true);
  e.setUint32(12, cd.length, true); e.setUint32(16, offset, true);
  return concat([...local, cd, end]);
}

/**
 * Open a ZIP archive.
 * @param {Uint8Array|ArrayBuffer|Blob} input
 * @param {{maxTotal?:number}} [opts]
 */
export async function read(input, opts = {}) {
  const u8 = await toU8(input); const maxTotal = opts.maxTotal ?? 256 * 1024 * 1024;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Not a ZIP archive (end record not found)');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || p === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  const entries = []; const map = new Map(); let total = 0;
  for (let k = 0; k < count; k++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP central directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    total += size; if (total > maxTotal) throw new Error('ZIP expands beyond limit');
    const ent = { name, size, csize, method, crc, flags, lho, isDir: name.endsWith('/') };
    entries.push(ent); map.set(name, ent); p += 46 + nl + el + cl;
  }
  async function get(name) {
    const e = map.get(name); if (!e) throw new Error('No such entry: ' + name);
    if (e.flags & 1) throw new Error('Encrypted ZIP entries are not supported');
    if (dv.getUint32(e.lho, true) !== 0x04034b50) throw new Error('Corrupt local header for ' + name);
    const start = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true);
    const body = u8.subarray(start, start + e.csize);
    let out;
    if (e.method === 0) out = body; else if (e.method === 8) out = await inflateRaw(body, e.size + 1); else throw new Error('Unsupported compression method ' + e.method);
    if (out.length !== e.size) throw new Error('Size mismatch for ' + name);
    if (crc32(out) !== e.crc) throw new Error('CRC mismatch for ' + name);
    return out;
  }
  return {
    entries, names: entries.map((e) => e.name), has: (n) => map.has(n), get,
    text: async (n) => dec.decode(await get(n)),
    /** Load every file entry into a Map(name -> Uint8Array). */
    async all() { const m = new Map(); for (const e of entries) if (!e.isDir) m.set(e.name, await get(e.name)); return m; },
  };
}
export default { create, read, crc32 };
