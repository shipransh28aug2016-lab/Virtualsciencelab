// Dependency-free lint: JSON/webmanifest parse, JS syntax (node --check), manifest icon refs exist, sw precache fresh.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'android', '.git', 'www']);
let errors = 0;
const fail = (m) => { console.error('lint:', m); errors++; };
function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n), st = statSync(p);
    if (st.isDirectory()) { if (!SKIP.has(n)) walk(p); continue; }
    const e = extname(n);
    if (e === '.json' || e === '.webmanifest') { try { JSON.parse(readFileSync(p, 'utf8')); } catch (x) { fail(`${p}: ${x.message}`); } }
    else if (e === '.js' || e === '.mjs') {
      const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
      if (r.status !== 0) fail(`${p}: ${r.stderr.trim().split('\n')[0]}`);
    }
  }
}
walk(ROOT);
const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
for (const i of mf.icons || []) if (!existsSync(join(ROOT, i.src))) fail(`manifest icon missing: ${i.src}`);
const sw = spawnSync(process.execPath, [join(ROOT, 'tools/build-sw-manifest.mjs'), '--check'], { encoding: 'utf8' });
if (sw.status !== 0) fail(sw.stderr.trim());
if (errors) process.exit(1);
console.log('lint ok');
