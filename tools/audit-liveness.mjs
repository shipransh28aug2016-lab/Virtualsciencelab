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

const dead=[]; const responsive=[];
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
  if (a1 !== a2) continue;                       // the scene is animating

  /* A canvas that does not change on its own is not necessarily dead: an
     experiment sitting in equilibrium -- a balanced metre rule, a block
     with no load on the pan -- is CORRECTLY still, and a real bench would
     be too. What such a scene must do is respond the instant the student
     changes something. So before calling a lab dead, nudge a control and
     see whether the picture follows. */
  const moved = await page.evaluate(() => {
    const sl = document.querySelector('#controls input[type=range]');
    if (sl) {
      const lo = +sl.min, hi = +sl.max;
      sl.value = String(+sl.value > (lo + hi) / 2 ? lo : hi);
      sl.dispatchEvent(new Event('input', { bubbles: true }));
      return 'slider';
    }
    const b = document.querySelector('#controls .seg button:not([aria-pressed=true]), #controls .wiring button:not([aria-pressed=true])');
    if (b) { b.click(); return 'segmented'; }
    const sw = document.querySelector('#controls .sw');
    if (sw) { sw.click(); return 'switch'; }
    return null;
  });
  await page.waitForTimeout(500);
  const a3 = await grab();
  if (a3 === a2) dead.push(id); else responsive.push(`${id} (${moved})`);
}
console.log(`labs checked        : ${ids.length}`);
console.log(`runtime errors      : ${errs.length}`);
[...new Set(errs)].slice(0,15).forEach(e=>console.log('  '+e));
console.log(`animating on their own : ${ids.length - dead.length - responsive.length}`);
console.log(`still, but respond to a control : ${responsive.length}`);
if (responsive.length) console.log('  ' + responsive.join('  '));
console.log(`DEAD (no motion, no response)   : ${dead.length}`);
if (dead.length) console.log('  ' + dead.join(' '));
await browser.close();
