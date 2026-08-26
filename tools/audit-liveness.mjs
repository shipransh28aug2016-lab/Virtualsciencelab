import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const root = process.env.VLAB_ROOT || process.cwd();
const idx = JSON.parse(await readFile(`${root}/data/experiments/index.json`,'utf8'));
const ids = idx.experiments.filter(e=>e.contentStatus==='published').map(e=>e.id);

const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport:{width:1280,height:820} });
let cur='', errs=[];
page.on('pageerror', e => errs.push(`${cur}: ${e.message}`));
page.on('console', m => { if (m.type()==='error') errs.push(`${cur}: console ${m.text().slice(0,140)}`); });

const dead=[];
for (const id of ids) {
  cur=id;
  await page.goto(`http://localhost:8080/index.html#/exp/${id}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(260);
  // press the primary action, then sample the canvas twice to see if the
  // picture is actually moving
  const b = await page.$('#toolbar button.primary');
  if (b && !(await b.isDisabled())) await b.click().catch(()=>{});
  await page.waitForTimeout(420);
  const grab = () => page.evaluate(() => {
    const c = document.querySelector('#cv'); if (!c) return '';
    return c.toDataURL('image/png').slice(-3000);
  });
  const a1 = await grab(); await page.waitForTimeout(650); const a2 = await grab();
  if (a1 === a2) dead.push(id);
}
console.log(`labs checked        : ${ids.length}`);
console.log(`runtime errors      : ${errs.length}`);
[...new Set(errs)].slice(0,15).forEach(e=>console.log('  '+e));
console.log(`\nSTILL-STATIC CANVAS : ${dead.length}`);
if (dead.length) console.log('  ' + dead.join(' '));
await browser.close();
