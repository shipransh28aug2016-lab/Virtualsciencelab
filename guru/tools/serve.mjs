// Zero-dependency static server: guru/ at "/", repo /data at "/data". Usage: node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GURU = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(GURU, '..', 'data');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

function resolve(pathname) {
  let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let base = GURU;
  if (rel === 'data' || rel.startsWith('data' + sep)) { base = DATA; rel = rel.slice(5); }
  const full = join(base, rel);
  if (full !== base && !full.startsWith(base + sep)) return null; // traversal guard
  return full;
}

export function createApp() {
  return createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && /\/share-target\/?$/.test(url.pathname)) {
        res.writeHead(303, { Location: './' }); return res.end(); // SW handles this in browsers; fallback for no-SW dev
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method Not Allowed'); }
      let file = resolve(url.pathname);
      if (!file) { res.writeHead(403); return res.end('Forbidden'); }
      let st; try { st = statSync(file); if (st.isDirectory()) { file = join(file, 'index.html'); st = statSync(file); } } catch { res.writeHead(404); return res.end('Not found'); }
      const ext = extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': TYPES[ext] || 'application/octet-stream', 'Content-Length': st.size,
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        ...(file.endsWith('sw.js') ? { 'Service-Worker-Allowed': '/' } : {}),
      });
      if (req.method === 'HEAD') return res.end();
      createReadStream(file).pipe(res);
    } catch { res.writeHead(400); res.end('Bad request'); }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, () => console.log(`Guru serving on http://localhost:${PORT}  (guru/ at /, data/ at /data)`));
}
