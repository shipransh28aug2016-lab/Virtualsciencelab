// Computes the app-shell file list + content-hash version and writes it into guru/sw.js
// between the PRECACHE markers. Run: node tools/build-sw-manifest.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', 'android', 'tools', 'tests', 'docs', '.well-known', '.git']);
const SKIP_FILES = new Set(['sw.js', 'package.json', 'package-lock.json', 'README.md', 'LICENSE-NOTES.md', 'capacitor.config.json']);
const EXT = /\.(html|js|mjs|css|json|webmanifest|svg|png|jpg|jpeg|webp|ico|woff2?|ttf|txt)$/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !name.startsWith('.')) walk(p, out); }
    else if (EXT.test(name) && !SKIP_FILES.has(name)) out.push(p);
  }
  return out;
}

export function computeManifest() {
  const files = walk(ROOT).map((p) => relative(ROOT, p).split(sep).join('/'));
  const h = createHash('sha256');
  for (const f of files) { h.update(f); h.update('\0'); h.update(readFileSync(join(ROOT, f))); h.update('\0'); }
  const version = h.digest('hex').slice(0, 12);
  // "./" entry makes the navigation request for the scope root resolve offline.
  const urls = ['./', ...files.map((f) => './' + f)];
  return { version, urls };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, urls } = computeManifest();
  const swPath = join(ROOT, 'sw.js');
  const src = readFileSync(swPath, 'utf8');
  const re = /\/\* PRECACHE:BEGIN \*\/[\s\S]*?\/\* PRECACHE:END \*\//;
  if (!re.test(src)) { console.error('sw.js is missing PRECACHE markers'); process.exit(1); }
  const block = `/* PRECACHE:BEGIN */\nconst VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(urls, null, 2)};\n/* PRECACHE:END */`;
  const next = src.replace(re, () => block);
  if (process.argv.includes('--check')) {
    if (next !== src) { console.error('sw.js precache is stale; run npm run build:sw'); process.exit(1); }
  } else if (next !== src) writeFileSync(swPath, next);
  console.log(`sw precache: ${urls.length} urls, version ${version}`);
}
