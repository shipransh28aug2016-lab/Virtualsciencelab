// Generates Guru icons (PNG 192/512/maskable + SVG) with Node built-ins only.
// Design: indigo rounded tile, white "G" ring with a bar, saffron dot (a spark / bindu).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(OUT, { recursive: true });

const BG1 = [0x1f, 0x6f, 0xeb], BG2 = [0x58, 0x3b, 0xc9], FG = [255, 255, 255], DOT = [0xff, 0xb3, 0x47];

// Shape coverage in unit space (0..1). maskable => full-bleed bg, glyph scaled into the 80% safe zone.
function sample(x, y, maskable) {
  let alpha = 1;
  if (!maskable) { // rounded square, radius 0.22
    const r = 0.22, cx = Math.min(Math.max(x, r), 1 - r), cy = Math.min(Math.max(y, r), 1 - r);
    alpha = Math.hypot(x - cx, y - cy) <= r ? 1 : 0;
    if (!alpha) return [0, 0, 0, 0];
  }
  const t = (x + y) / 2;
  let c = BG1.map((v, i) => v + (BG2[i] - v) * t);
  const s = maskable ? 0.62 : 0.78; // glyph scale
  const u = (x - 0.5) / s, v = (y - 0.5) / s; // glyph space centered, ~[-0.5,0.5]
  const d = Math.hypot(u, v), ang = Math.atan2(v, u);
  const ring = d > 0.30 && d < 0.46;
  const gap = ang > -0.75 && ang < 0.05 && d > 0.2; // opening on the right-upper side
  const bar = u > 0.02 && u < 0.46 && v > -0.04 && v < 0.08 && d < 0.46;
  if ((ring && !gap) || bar) c = FG;
  if (Math.hypot(u - 0.3, v + 0.3) < 0.07) c = DOT;
  return [c[0], c[1], c[2], 255];
}

function render(size, maskable) {
  const SS = 3, raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const p = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, maskable);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const o = py * (size * 4 + 1) + 1 + px * 4, n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  return png(size, raw);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Guru">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6feb"/><stop offset="1" stop-color="#583bc9"/></linearGradient></defs>
  <rect width="512" height="512" rx="113" fill="url(#g)"/>
  <g transform="translate(256 256) scale(399)" fill="none" stroke="#fff" stroke-width="0.16">
    <path d="M0.2 -0.2 A0.38 0.38 0 1 0 0.38 0"/>
    <path d="M0.02 0.02 H0.38" stroke-linecap="butt"/>
  </g>
  <circle cx="376" cy="136" r="28" fill="#ffb347"/>
</svg>
`;

writeFileSync(join(OUT, 'icon-192.png'), render(192, false));
writeFileSync(join(OUT, 'icon-512.png'), render(512, false));
writeFileSync(join(OUT, 'icon-maskable-512.png'), render(512, true));
writeFileSync(join(OUT, 'icon.svg'), svg);
console.log('icons written to', OUT);
