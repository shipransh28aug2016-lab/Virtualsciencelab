/**
 * verify-all.mjs — run every lab's engine suite.
 *
 *   node tools/verify-all.mjs                 all labs
 *   node tools/verify-all.mjs XI-CHE-B03 …    only these codes (or code prefixes)
 *
 * Each lab owns src/experiments/[Class]/[Subject]/[Code]/verify.mjs, a Node-only
 * suite that holds its engine to measured data. This finds them by glob, runs
 * each in its own process (so one suite's module state can never leak into the
 * next), and totals the checks. A lab with no verify.mjs is reported, not
 * skipped silently — a bench with no engine suite is a bench nobody has checked.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXP = join(ROOT, 'src', 'experiments');
const wanted = process.argv.slice(2).map((s) => s.toUpperCase());


const labs = [];
for (const cls of readdirSync(EXP)) {
  for (const subject of readdirSync(join(EXP, cls))) {
    for (const code of readdirSync(join(EXP, cls, subject))) {
      const dir = join(EXP, cls, subject, code);
      if (existsSync(join(dir, 'meta.js'))) labs.push({ code, dir });
    }
  }
}

/* Shared engines hold themselves to the data book too: src/shared/<name>/verify.mjs. */
const SHARED = join(ROOT, 'src', 'shared');
for (const name of readdirSync(SHARED)) {
  if (existsSync(join(SHARED, name, 'verify.mjs'))) labs.push({ code: `shared/${name}`, dir: join(SHARED, name) });
}
labs.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

const chosen = wanted.length ? labs.filter((l) => wanted.some((w) => l.code.toUpperCase().startsWith(w))) : labs;
if (!chosen.length) { console.error(`no lab matches ${wanted.join(', ')}`); process.exit(2); }

let totalChecks = 0;
const bad = [];
const unsuited = [];

for (const lab of chosen) {
  const suite = join(lab.dir, 'verify.mjs');
  if (!existsSync(suite)) { unsuited.push(lab.code); continue; }
  const r = spawnSync(process.execPath, [suite], { encoding: 'utf8' });
  const m = /(\d+) checks? passed/.exec(r.stdout);
  const n = m ? Number(m[1]) : 0;
  totalChecks += n;
  if (r.status === 0 && n > 0) {
    console.log(`  ok   ${lab.code.padEnd(14)} ${String(n).padStart(3)} checks`);
  } else {
    bad.push(lab.code);
    console.log(`  FAIL ${lab.code.padEnd(14)}`);
    console.log((r.stderr || r.stdout).split('\n').slice(0, 14).map((l) => `         ${l}`).join('\n'));
  }
}

if (unsuited.length) console.log(`\n  no verify.mjs: ${unsuited.join(', ')}`);
console.log(`\n${chosen.length - bad.length - unsuited.length}/${chosen.length} suites green, ${totalChecks} checks.`);
process.exit(bad.length || unsuited.length ? 1 : 0);
