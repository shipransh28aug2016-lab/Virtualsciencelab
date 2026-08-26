import { chromium } from 'playwright';
const args = process.argv.slice(2);
let clickIdx = null, wait = 4500;
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--click') clickIdx = args[++i];
  else if (args[i] === '--wait') wait = +args[++i];
  else ids.push(args[i]);
}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

for (const id of ids) {
  await page.goto(`http://localhost:8080/index.html#/exp/${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const tb = await page.$$eval('#toolbar button', bs => bs.map((b,i) => `${i}:${b.textContent.trim()}${b.disabled?'(off)':''}`).join(' | '));
  if (clickIdx !== null) {
    for (const spec of String(clickIdx).split(',')) {
      const btns = await page.$$('#toolbar button');
      const b = btns[+spec];
      if (b && !(await b.isDisabled())) await b.click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(wait);
  }
  const ro = await page.$$eval('.ro', rs => rs.map(r => r.textContent.replace(/\s+/g,' ').trim()).join('  |  ')).catch(()=> '');
  const cv = await page.$('#cv');
  await cv.screenshot({ path: `/tmp/shots/${id}${clickIdx!==null?'-run':''}.png` });
  console.log(`${id}\n  toolbar: ${tb}\n  readouts: ${ro}`);
}
console.log(errs.length ? 'PAGE ERRORS:\n' + errs.slice(0,8).join('\n') : 'no page errors');
await browser.close();
