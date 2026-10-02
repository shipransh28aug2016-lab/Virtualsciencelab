#!/usr/bin/env node
/**
 * DOES THE LAB PAGE LAY ITSELF OUT LIKE A LAB?
 *
 * Three promises the lab view makes, checked in a real browser at the widths
 * people actually use:
 *
 *   1. THE TITLE NEVER STRANDS A WORD. A title that wraps must not end on a line
 *      of one word ("compound" on its own), at any width, for the longest
 *      titles in the catalogue.
 *   2. THE WORKSPACE IS A WORKSPACE FROM A TABLET UP. At 641 px and wider the
 *      apparatus is on the left and ONE panel — three tabs: Controls, Table,
 *      Graph — is on the right, exactly as tall as the apparatus, scrolling
 *      inside itself. Only a phone (≤ 640 px) stacks, and there every panel is
 *      shown, the tab bar is not.
 *   3. NOTHING OVERFLOWS SIDEWAYS, at any of those widths.
 *
 *   node tools/audit-lab-layout.mjs                 # the default sample
 *   node tools/audit-lab-layout.mjs XI-CHE-B02      # one experiment
 *   node tools/audit-lab-layout.mjs --all           # every published lab, at three widths
 *   BASE=http://localhost:8090 CHROME_PATH=… node tools/audit-lab-layout.mjs
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const root = process.env.VLAB_ROOT || process.cwd();

/* A server of our own unless BASE says where one is, so the audit never depends
   on someone having started one. */
let server = null;
let BASE = process.env.BASE;
if (!BASE) {
  const PORT = Number(process.env.VLAB_PORT || 8097);
  BASE = `http://localhost:${PORT}`;
  server = spawn(process.execPath, [join(root, 'tools/serve.mjs')], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  process.on('exit', () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`${BASE}/index.html`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
}
const idx = JSON.parse(await readFile(`${root}/data/experiments/index.json`, 'utf8'));
const published = idx.experiments.filter((e) => e.contentStatus === 'published');

const everyLab = process.argv.includes('--all');
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
/* The longest titles are the ones that wrap worst; the boiling point is the one
   that was reported. */
const sample = everyLab ? published.map((e) => e.id) : asked.length ? asked : [
  'XI-CHE-B02',
  ...[...published].sort((a, b) => b.title.length - a.title.length).slice(0, 5).map((e) => e.id),
];
const ids = [...new Set(sample)].filter((id) => published.some((e) => e.id === id));
/* Every lab at three widths (a phone, a tablet, a laptop), or the sample at thirteen. */
const WIDTHS = everyLab ? [390, 700, 1280] : [360, 390, 600, 640, 641, 768, 900, 1000, 1024, 1280, 1366, 1600, 1920];

const exe = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const failures = [];
const check = (ok, label) => { if (!ok) { failures.push(label); console.log(`FAIL  ${label}`); } return ok; };

for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/index.html#/exp/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewLab:not([hidden]) #cv', { timeout: 20000 });
  await page.waitForTimeout(500);
  let rows = 0;

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: w < 641 ? 800 : 900 });
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const $ = (s) => document.querySelector(s);
      const vis = (el) => el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height, w: b.width }; };

      /* Lines of the title, and the words on the last one. */
      const title = $('#labTitle');
      const range = document.createRange();
      const words = [];
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const re = /\S+/g; let m;
        while ((m = re.exec(n.textContent))) {
          range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
          const rc = range.getBoundingClientRect();
          words.push({ w: m[0], top: Math.round(rc.top) });
        }
      }
      const tops = [...new Set(words.map((x) => x.top))].sort((a, b) => a - b);
      const lastLine = words.filter((x) => Math.abs(x.top - tops[tops.length - 1]) < 3).length;

      const stage = $('.lab-stage'); const bench = $('#bench');
      const panels = ['#panelControls', '#panelTable', '#graphPanel'].map((s) => $(s));
      return {
        lines: tops.length, lastLine, nWords: words.length,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        stage: box(stage), bench: box(bench),
        tabBar: vis($('#benchTabs')),
        shown: panels.filter((p) => !p.hidden && vis(p)).length,
        possible: panels.filter((p) => !p.hidden).length,
      };
    });

    const tag = `${id} @${w}px`;
    check(r.lines < 2 || r.lastLine >= 2, `${tag}: the title ends on a line of one word (${r.lines} lines, ${r.lastLine} on the last)`);
    check(r.overflow <= 1, `${tag}: the page overflows sideways by ${r.overflow}px`);
    if (w >= 641) {
      check(r.bench.l >= r.stage.r - 1 && Math.abs(r.bench.t - r.stage.t) < 3, `${tag}: the panel is not beside the apparatus (stage ${JSON.stringify(r.stage)}, panel ${JSON.stringify(r.bench)})`);
      check(r.tabBar, `${tag}: no tab bar`);
      check(r.shown === 1, `${tag}: ${r.shown} bench panels showing at once, expected exactly one`);
      check(Math.abs(r.bench.h - Math.max(r.stage.h, 480)) < 4, `${tag}: the panel is ${r.bench.h.toFixed(0)}px tall beside an apparatus ${r.stage.h.toFixed(0)}px tall`);
    } else {
      check(r.bench.t >= r.stage.b - 1, `${tag}: the panels do not stack under the apparatus`);
      check(!r.tabBar, `${tag}: the tab bar is showing on a phone`);
      check(r.shown === r.possible, `${tag}: ${r.shown} of ${r.possible} panels showing — a phone shows them all`);
    }
    rows += 1;
  }

  /* The tabs work: click, keyboard, and the panel follows. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(150);
  const which = () => page.evaluate(() => ['#panelControls', '#panelTable', '#graphPanel'].map((s) => document.querySelector(s))
    .map((p) => !p.hidden && p.getClientRects().length > 0));
  check(JSON.stringify(await which()) === JSON.stringify([true, false, false]), `${id}: opens on Controls`);
  await page.click('#tabTable');
  check(JSON.stringify(await which()) === JSON.stringify([false, true, false]), `${id}: Table tab shows the table`);
  const hasGraph = await page.evaluate(() => !document.querySelector('#tabGraph').hidden);
  if (hasGraph) {
    await page.focus('#tabTable'); await page.keyboard.press('ArrowRight');
    check(JSON.stringify(await which()) === JSON.stringify([false, false, true]), `${id}: ArrowRight moves to Graph`);
  }
  await page.keyboard.press('Home');
  check(JSON.stringify(await which()) === JSON.stringify([true, false, false]), `${id}: Home returns to Controls`);
  /* Calculate with too few readings writes its reason into the table panel — which must then be showing. */
  await page.evaluate(() => document.querySelector('#aCalc')?.removeAttribute('disabled'));
  await page.evaluate(() => document.querySelector('#aCalc')?.click());
  check(JSON.stringify(await which()) === JSON.stringify([false, true, false]), `${id}: Calculate result brings up the table panel`);
  check(errs.length === 0, `${id}: page errors — ${errs[0]}`);
  console.log(`${errs.length || failures.some((f) => f.startsWith(id)) ? 'FAIL' : ' ok '}  ${id}: ${rows} widths, tabs, keyboard`);
  await page.close();
}
await browser.close();
if (failures.length) { console.log(`\n${failures.length} problem(s).`); process.exit(1); }
console.log('\nLAYOUT VERIFIED');
