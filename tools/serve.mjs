#!/usr/bin/env node
/**
 * Zero-dependency static file server for local development.
 * `npm start` / `npm run dev` → http://localhost:8080
 *
 * Serves the repository root as-is (index.html, assets/, src/, data/,
 * sw.js, manifest.webmanifest, …) so the app runs exactly as it will when
 * hosted as static files, with no build step.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    let filePath = join(root, rel);

    // Prevent escaping the project root.
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let st;
    try {
      st = await stat(filePath);
    } catch {
      // SPA-ish fallback for navigations to unknown paths.
      filePath = join(root, 'index.html');
      st = await stat(filePath);
    }
    if (st.isDirectory()) filePath = join(filePath, 'index.html');

    const body = await readFile(filePath);
    const type = MIME[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`CBSE V-Lab dev server → http://localhost:${port}`);
});
