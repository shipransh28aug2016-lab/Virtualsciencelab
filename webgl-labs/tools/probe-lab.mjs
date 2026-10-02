/**
 * probe-lab.mjs — render-check one or more benches in a real GL context.
 *
 *   node tools/probe-lab.mjs                      every bench
 *   node tools/probe-lab.mjs XI-CHE-C01 XI-CHE-C0 a code, or a prefix
 *   node tools/probe-lab.mjs --generic XI-CHE-C01 only the checks every bench gets
 *   node tools/probe-lab.mjs --rebuild …          force a fresh build
 *
 * It builds if the build is stale and serves it itself, so it can never test a
 * stale bundle and never leaves a server behind. For each bench it runs:
 *
 *   1. the generic checks — the canvas draws, every shader compiles, there are no
 *      console errors, and EVERY control on the bench visibly does something;
 *   2. the bench's own probe.mjs, if it has one: a scenario that does what a
 *      student does, including the things that are meant to fail;
 *   3. or, for the first four benches, their original standalone script.
 */
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, launch, startApp, openLab, findChrome } from './probe-kit.mjs';

const args = process.argv.slice(2);
const flag = (f) => { const i = args.indexOf(f); if (i >= 0) args.splice(i, 1); return i >= 0; };
const genericOnly = flag('--generic');
const rebuild = flag('--rebuild');
const wanted = args.map((s) => s.toUpperCase());

const EXP = join(ROOT, 'src', 'experiments');
const labs = [];
for (const cls of readdirSync(EXP)) for (const subj of readdirSync(join(EXP, cls))) {
  for (const code of readdirSync(join(EXP, cls, subj))) {
    const dir = join(EXP, cls, subj, code);
    if (existsSync(join(dir, 'meta.js'))) labs.push({ code, dir });
  }
}
labs.sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
const chosen = wanted.length ? labs.filter((l) => wanted.some((w) => l.code.toUpperCase().startsWith(w))) : labs;
if (!chosen.length) { console.error(`no bench matches ${wanted.join(', ')}`); process.exit(2); }

if (!findChrome()) { console.error('no Chromium found (set CHROME_PATH)'); process.exit(2); }

const app = await startApp({ rebuild });
const browser = await launch();
const summary = [];

try {
  for (const lab of chosen) {
    console.log(`\n${lab.code}`);
    const probe = join(lab.dir, 'probe.mjs');
    const legacy = join(lab.dir, 'probe.legacy.mjs');
    let failed = 0;
    const t0 = Date.now();

    if (existsSync(legacy) && !existsSync(probe) && !genericOnly) {
      const r = spawnSync(process.execPath, [legacy], {
        cwd: ROOT, encoding: 'utf8', timeout: 25 * 60 * 1000,
        env: { ...process.env, BASE: app.url, CHROME_PATH: findChrome() },
      });
      process.stdout.write(r.stdout.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n'));
      failed = r.status === 0 ? 0 : 1;
      if (r.status !== 0 && r.stderr) console.log(r.stderr.split('\n').slice(0, 6).join('\n'));
    } else {
      const kit = await openLab({ url: app.url, code: lab.code, browser });
      try {
        await kit.generic();
        if (existsSync(probe) && !genericOnly) {
          const mod = await import(pathToFileURL(probe).href);
          await mod.default(kit);
        }
      } catch (e) {
        kit.check(false, `probe threw: ${String(e.message).split('\n')[0]}`);
      }
      failed = kit.failed.length;
      await kit.close();
    }
    summary.push({ code: lab.code, failed, seconds: Math.round((Date.now() - t0) / 1000) });
  }
} finally {
  await browser.close();
  app.stop();
}

console.log('\n' + summary.map((s) => `  ${s.failed ? 'FAIL' : ' ok '}  ${s.code.padEnd(14)} ${s.seconds}s`).join('\n'));
const bad = summary.filter((s) => s.failed).length;
console.log(bad ? `\n${bad} bench(es) failed.` : `\nRENDER VERIFIED — ${summary.length} bench(es).`);
process.exit(bad ? 1 : 0);
