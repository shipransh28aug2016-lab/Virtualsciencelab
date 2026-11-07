#!/usr/bin/env node
// Runs every tests/*.test.mjs (+ src/**/tests) with node:test, prints a summary table.
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(here, f));
const only = process.argv[2];
const rows = [];
for (const f of files) {
  if (only && !f.includes(only)) continue;
  const t0 = Date.now();
  const out = await new Promise((res) => {
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', f], { cwd: path.dirname(here) });
    let buf = ''; p.stdout.on('data', (d) => (buf += d)); p.stderr.on('data', (d) => (buf += d));
    const to = setTimeout(() => p.kill('SIGKILL'), 240000);
    p.on('close', (code) => { clearTimeout(to); res({ code, buf }); });
  });
  const n = (re) => Number((out.buf.match(re) || [, 0])[1]);
  rows.push({ file: path.basename(f), pass: n(/^# pass (\d+)/m), fail: n(/^# fail (\d+)/m), skip: n(/^# skipped (\d+)/m), ms: Date.now() - t0, code: out.code, buf: out.buf });
}
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('FILE', 32) + pad('PASS', 6) + pad('FAIL', 6) + pad('SKIP', 6) + 'MS');
for (const r of rows) console.log(pad(r.file, 32) + pad(r.pass, 6) + pad(r.fail, 6) + pad(r.skip, 6) + r.ms + (r.code ? '  <-- FAILED' : ''));
const bad = rows.filter((r) => r.code);
for (const r of bad) {
  const fails = r.buf.split('\n').filter((l) => /^\s*not ok/.test(l)).slice(0, 15);
  console.log('\n[' + r.file + '] failures:\n' + fails.join('\n'));
}
console.log(`\nTOTAL pass=${rows.reduce((a, r) => a + r.pass, 0)} fail=${rows.reduce((a, r) => a + r.fail, 0)} skip=${rows.reduce((a, r) => a + r.skip, 0)}`);
process.exit(bad.length ? 1 : 0);
