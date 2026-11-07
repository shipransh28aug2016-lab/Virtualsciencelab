// Shared helpers for the files module. Pure, DOM-free, Node >=18 safe.
export const enc = new TextEncoder();
export const dec = new TextDecoder('utf-8');

export const MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf', md: 'text/markdown', csv: 'text/csv', html: 'text/html',
  json: 'application/json', zip: 'application/zip', txt: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
};

/** @param {string} s @returns {Uint8Array} */
export const utf8 = (s) => enc.encode(String(s));

/** Convert File|Blob|ArrayBuffer|TypedArray|string to Uint8Array. */
export async function toU8(x) {
  if (x == null) throw new TypeError('No input');
  if (x instanceof Uint8Array) return x;
  if (typeof x === 'string') return utf8(x);
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  if (typeof x.arrayBuffer === 'function') return new Uint8Array(await x.arrayBuffer());
  throw new TypeError('Unsupported input type');
}

export function concat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function b64encode(u8) {
  let s = ''; const C = 0x8000;
  for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C));
  return btoa(s);
}
export function b64decode(str) {
  const s = atob(String(str).replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Decode text bytes: honours UTF-8/UTF-16 BOM, falls back to windows-1252. */
export function decodeText(u8) {
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return dec.decode(u8.subarray(3));
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch { return new TextDecoder('windows-1252').decode(u8); }
}

export const hasDeva = (s) => /[ऀ-ॿ꣠-ꣿ]/.test(s);

/** Make a safe filename (keeps Devanagari/Unicode letters). */
export function slug(name, fallback = 'guru-file') {
  const s = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80);
  return s || fallback;
}

/**
 * Parse light inline markdown into runs: **bold**, *italic*, `code`, [t](u) -> t.
 * @returns {{text:string,b?:boolean,i?:boolean,mono?:boolean}[]}
 */
export function parseInline(text) {
  const src = String(text ?? '').replace(/!?\[([^\]]*)\]\(([^)\s]*)\)/g, (m, t) => t);
  const runs = []; const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) runs.push({ text: src.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('**')) runs.push({ text: tok.slice(2, -2), b: true });
    else if (tok.startsWith('`')) runs.push({ text: tok.slice(1, -1), mono: true });
    else runs.push({ text: tok.slice(1, -1), i: true });
    last = m.index + tok.length;
  }
  if (last < src.length) runs.push({ text: src.slice(last) });
  return runs.length ? runs : [{ text: '' }];
}

/** Detect image type and pixel size from bytes. */
export function imgInfo(u8) {
  if (!u8 || u8.length < 24) return null;
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return { type: 'png', mime: 'image/png', width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (u8[0] === 0xff && u8[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) { i++; continue; }
      const mk = u8[i + 1];
      if (mk === 0xd8 || (mk >= 0xd0 && mk <= 0xd7) || mk === 0x01) { i += 2; continue; }
      const len = (u8[i + 2] << 8) | u8[i + 3];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc)
        return { type: 'jpeg', mime: 'image/jpeg', height: (u8[i + 5] << 8) | u8[i + 6], width: (u8[i + 7] << 8) | u8[i + 8], comps: u8[i + 9] };
      i += 2 + len;
    }
    return { type: 'jpeg', mime: 'image/jpeg', width: 0, height: 0 };
  }
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46)
    return { type: 'gif', mime: 'image/gif', width: u8[6] | (u8[7] << 8), height: u8[8] | (u8[9] << 8) };
  return null;
}

/** Resolve an `img` block / slide image payload into {data,info} or null. */
export function resolveImage(img) {
  if (!img) return null;
  let data = img.data ?? img.bytes ?? null;
  if (typeof data === 'string') { try { data = b64decode(data); } catch { data = null; } }
  if (!data && typeof img.src === 'string' && img.src.startsWith('data:')) { try { data = b64decode(img.src); } catch { data = null; } }
  if (!(data instanceof Uint8Array)) return null;
  const info = imgInfo(data);
  if (!info || info.type === 'gif' && false) return null;
  return { data, info };
}

export const colNum = (letters) => { let n = 0; for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
export const colName = (n) => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
export function parseRef(ref) {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(ref);
  if (!m) throw new Error('Bad cell reference: ' + ref);
  return { col: colNum(m[1]), row: +m[2] };
}
