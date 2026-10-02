/**
 * shot.mjs — look at a bench: a screenshot of it, optionally after a scripted scene.
 *
 *   node tools/shot.mjs XI-CHE-D01 /tmp/d01.png
 *   node tools/shot.mjs XI-CHE-D01 /tmp/d01.png --size 1440x860 --hq
 *   node tools/shot.mjs XI-CHE-D01 /tmp/d01.png --steps /tmp/scene.mjs
 *
 * `--hq` drops the probe's cheap rendering (shadows and antialiasing back on),
 * which also hides the store the probe kit drives, so it cannot be combined with
 * --steps. A steps module default-exports `async (kit) => {…}`; it may take
 * further frames with `kit.page.screenshot({ path })`.
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startApp, launch, openLab } from './probe-kit.mjs';

const args = process.argv.slice(2);
const take = (flag, has = true) => { const i = args.indexOf(flag); if (i < 0) return null; const v = has ? args[i + 1] : true; args.splice(i, has ? 2 : 1); return v; };
const size = (take('--size') ?? '1280x760').split('x').map(Number);
const hq = take('--hq', false);
const steps = take('--steps');
const [code, out = `/tmp/${args[0]}.png`] = args;
if (!code) { console.error('usage: node tools/shot.mjs CODE [out.png] [--size WxH] [--hq] [--steps file.mjs]'); process.exit(2); }

const app = await startApp();
const browser = await launch();
try {
  const kit = await openLab({ url: app.url, code: code.toUpperCase(), browser, width: size[0], height: size[1] });
  if (hq) { await kit.page.goto(`${app.url}/#/${code.toUpperCase()}`, { waitUntil: 'networkidle' }); await kit.page.waitForTimeout(2500); }
  let failure = null;
  if (steps) { try { await (await import(pathToFileURL(resolve(steps)).href)).default(kit); } catch (e) { failure = e; } }
  await kit.page.screenshot({ path: out });
  if (kit.noise.length) console.log(`console noise:\n  ${kit.noise.slice(0, 6).join('\n  ')}`);
  if (failure) console.log(`the steps threw: ${String(failure.message).split('\n')[0]}`);
  console.log(`wrote ${out}`);
  await kit.close();
} finally {
  await browser.close();
  app.stop();
}
