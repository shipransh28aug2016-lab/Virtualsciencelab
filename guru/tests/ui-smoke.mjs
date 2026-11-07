// UI smoke test (playwright + chromium). Usage: node guru/tests/ui-smoke.mjs
// Serves guru/ on a free port, loads at 390x844, checks composer/settings/palette, saves screenshots.
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = '/tmp/claude-0/guru-ui';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = join(root, p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
    if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }).end(await readFile(f));
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

await mkdir(OUT, { recursive: true });
async function launch() {
  try { return await chromium.launch({ args: ['--no-sandbox'] }); } catch { /* fall back to a preinstalled build */ }
  const { readdirSync } = await import('node:fs');
  for (const d of readdirSync('/opt/pw-browsers').filter((x) => /^chromium-\d+/.test(x))) {
    for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const exe = join('/opt/pw-browsers', d, sub);
      if (existsSync(exe)) return chromium.launch({ args: ['--no-sandbox'], executablePath: exe });
    }
  }
  throw new Error('no chromium found');
}
const browser = await launch();

let failures = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) failures++; };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-IN' });
const page = await ctx.newPage();
const errors = [];
// Missing sibling modules (kernel etc.) legitimately 404 while other agents are still landing them.
const tolerated = (t) => /Failed to load resource.*404/.test(t) || /kernel\/index\.js/.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !tolerated(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('html[data-ready]');
// first-run onboarding
check(await page.locator('#dlg-onboard[open]').count() === 1, 'onboarding shown on first run');
await page.screenshot({ path: `${OUT}/01-onboarding.png` });
await page.getByRole('button', { name: 'English' }).click();
check(await page.locator('#dlg-onboard[open]').count() === 0, 'onboarding dismissed');

check(await page.locator('.topbar').isVisible(), 'topbar visible');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
check(!overflow, 'no horizontal overflow at 390px');
await page.screenshot({ path: `${OUT}/02-empty.png` });

// composer
await page.fill('#input', '**Hello** Guru');
check((await page.inputValue('#input')) === '**Hello** Guru', 'composer accepts text');
await page.click('#btn-send');
await page.waitForSelector('.msg-user');
check((await page.locator('.msg-user').innerText()).includes('Hello'), 'user message rendered');
await page.waitForSelector('.msg-bot .md >> text=/./', { timeout: 8000 }).catch(() => {});
await page.waitForFunction(() => !document.querySelector('.msg-bot[aria-busy]'), null, { timeout: 8000 });
check(await page.locator('.msg-bot').count() === 1, 'assistant turn finished');
await page.screenshot({ path: `${OUT}/03-chat.png` });

// markdown render sanity (safe: script text stays text)
const md = await page.evaluate(async () => {
  const m = await import('/src/ui/md.js');
  const d = document.createElement('div');
  d.append(m.renderMarkdown('# T\n\n| a | b |\n|---|---|\n| 1 | <img src=x onerror=alert(1)> |\n\n- x\n- **y**\n\n[l](javascript:alert(1)) `c` $E=mc^2$'));
  return { html: d.innerHTML, imgs: d.querySelectorAll('img').length, links: d.querySelectorAll('a').length, tbl: d.querySelectorAll('table').length };
});
check(md.imgs === 0 && md.links === 0 && md.tbl === 1, 'markdown escapes HTML and blocks javascript: links');

// settings
await page.click('#btn-settings');
await page.waitForSelector('#dlg-settings[open]');
check(await page.locator('#dlg-settings .sec').count() >= 4, 'settings drawer opens with sections');
await page.screenshot({ path: `${OUT}/04-settings.png` });
await page.selectOption('#dlg-settings select >> nth=-1', 'dark').catch(() => {});
await page.keyboard.press('Escape');
check(await page.locator('#dlg-settings[open]').count() === 0, 'settings closes with Escape');

// palette via Ctrl+K and '/'
await page.keyboard.press('Control+k');
await page.waitForSelector('#dlg-palette[open]');
check(await page.locator('.pal-item').count() >= 1, 'palette lists commands');
await page.screenshot({ path: `${OUT}/05-palette.png` });
await page.keyboard.press('Escape');

// language toggle + dark theme
await page.click('#btn-lang');
check((await page.textContent('#btn-lang')).trim() === 'हि', 'language toggle -> Hindi');
await page.screenshot({ path: `${OUT}/06-hindi.png` });
await page.emulateMedia({ colorScheme: 'dark' });
await page.screenshot({ path: `${OUT}/07-dark.png` });

check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll UI smoke checks passed. Screenshots in ' + OUT);
process.exit(failures ? 1 : 0);
