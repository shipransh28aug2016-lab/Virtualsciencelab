#!/usr/bin/env node
/**
 * Recovery gate — does a failing simulation stay contained?
 *
 * The other three audits ask whether the labs WORK. This one asks what
 * happens when one does not: a lab that throws must not take the
 * application down with it, must say so, and must be recoverable without a
 * page reload. Before the error boundary existed a single throw escaped the
 * requestAnimationFrame callback, the loop was never re-armed, and the
 * student was left with a frozen picture and no message at all.
 *
 * Faults are injected rather than waited for: a throw is forced inside a
 * canvas call mid-run, an experiment fetch is aborted, and an unresolvable
 * id is routed to. Each injection self-heals after firing once, so Retry and
 * Reset have a working bench to restore.
 *
 * Run against `npm start`:  node tools/audit-recovery.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.VLAB_URL || 'http://localhost:8080';
const EXE = process.env.VLAB_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const failures = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} · ${name}`);
  if (!ok) failures.push(name);
};

const browser = await chromium.launch({ executablePath: EXE });
/* The service worker is cache-first by design, so it would satisfy an
   aborted request from cache and the network fault would never reach the
   app. It is blocked here so the failure path is genuinely exercised. */
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const canvas = () => page.evaluate(() => document.querySelector('#cv').toDataURL().slice(-2500));
const boundaryUp = () => page.evaluate(() => !!document.querySelector('#labError'));

/** Force the next render to throw, once. */
const injectRenderFault = (message) => page.evaluate((msg) => {
  const g = document.querySelector('#cv').getContext('2d');
  const original = g.arc.bind(g);
  let calls = 0, fired = false;
  g.arc = function (...args) {
    if (!fired && ++calls > 3) { fired = true; throw new Error(msg); }
    return original(...args);
  };
}, message);

const isLive = async () => { const a = await canvas(); await page.waitForTimeout(700); return a !== (await canvas()); };

await page.goto(`${BASE}/#/exp/XI-PHY-A07`, { waitUntil: 'load' });
await page.waitForTimeout(900);
check('a healthy lab animates', await isLive());

await injectRenderFault('synthetic renderer failure');
await page.waitForTimeout(1000);
const panel = await page.evaluate(() => {
  const el = document.querySelector('#labError');
  return el ? { heading: el.querySelector('h3').textContent, actions: [...el.querySelectorAll('button')].map((b) => b.dataset.act) } : null;
});
check('a renderer throw is caught and shown', !!panel && panel.heading.includes('could not be loaded'));
check('the panel offers retry, reset and report', !!panel && ['retry', 'reset', 'report'].every((a) => panel.actions.includes(a)));
check('the rest of the application stays usable', await page.evaluate(() => !!document.querySelector('#backBtn')));

await page.click('#labError [data-act=retry]');
await page.waitForTimeout(1600);
check('Retry restores a live simulation', (await isLive()) && !(await boundaryUp()));

await injectRenderFault('second synthetic failure');
await page.waitForTimeout(1000);
check('a second, independent failure is caught too', await boundaryUp());
await page.click('#labError [data-act=reset]');
await page.waitForTimeout(1400);
check('Reset rebuilds a live bench', (await isLive()) && !(await boundaryUp()));

await page.goto(`${BASE}/#/exp/NOPE-123`, { waitUntil: 'load' });
await page.waitForTimeout(800);
const unknown = await page.evaluate(() => ({
  toast: document.querySelector('#toast').textContent,
  home: !document.querySelector('#viewHome').hidden,
}));
check('an unresolvable id says so instead of failing silently', unknown.toast.includes('NOPE-123') && unknown.home);

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.route('**/XI-PHY-B02*.json', (r) => r.abort());
await page.evaluate(() => { location.hash = '#/exp/XI-PHY-B02'; });
await page.waitForTimeout(1800);
check('a failed experiment fetch shows the boundary, not a blank bench', await boundaryUp());
await page.unroute('**/XI-PHY-B02*.json');

await page.evaluate(() => { location.hash = '#/exp/XII-CHE-K01'; });
await page.waitForTimeout(1800);
check('a healthy lab still opens after a failure', !(await boundaryUp())
  && await page.evaluate(() => document.querySelector('#labTitle').textContent.includes('Salt Analysis')));

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(' | ')}` : '\nall recovery checks pass');
await browser.close();
process.exit(failures.length ? 1 : 0);
