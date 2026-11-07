// Copies the web app into ./www (Capacitor webDir) and runs `npx cap sync android` (adds the platform if missing).
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const run = (args) => { const r = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' }); if (r.status !== 0) process.exit(r.status || 1); };

rmSync(WWW, { recursive: true, force: true }); mkdirSync(WWW, { recursive: true });
const skip = new Set(['node_modules', 'android', 'www', 'tools', 'tests', 'docs', '.well-known', 'package.json', 'package-lock.json', 'capacitor.config.json']);
cpSync(ROOT, WWW, { recursive: true, filter: (s) => !skip.has(s.slice(ROOT.length + 1).split(/[\\/]/)[0]) });
const cur = join(ROOT, '..', 'data', 'curriculum');
// CBSE module resolves ../../../data/curriculum from src/cbse; mirror that inside www so it works in the WebView.
if (existsSync(cur)) cpSync(cur, join(WWW, 'data', 'curriculum'), { recursive: true });
if (!existsSync(join(ROOT, 'android'))) run(['cap', 'add', 'android']);
run(['cap', 'sync', 'android']);
console.log('android synced; open with: npx cap open android');
