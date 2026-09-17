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
     changes something.

     This check used to try ONE control: the first range slider, falling back
     to a segmented button only when no slider existed. That produced false
     death sentences. XII-PHY-B07 and B08 carry a single slider -- the scale's
     least count -- which correctly does not move the apparatus, so the audit
     stopped there and called both labs dead even though their liquid and lens
     buttons visibly redraw the bench. A lab is only dead if NOTHING the
     student can touch moves the picture, so every control is now tried in
     turn and the first one that responds ends the search. */
  const controlCount = await page.evaluate(() =>
    document.querySelectorAll('#controls input[type=range], #controls .seg button, #controls .wiring button, #controls .sw, #controls select, #controls input[type=checkbox]').length);

  let moved = null, a3 = a2;
  for (let i = 0; i < controlCount && !moved; i++) {
    const kind = await page.evaluate((idx) => {
      const el = document.querySelectorAll('#controls input[type=range], #controls .seg button, #controls .wiring button, #controls .sw, #controls select, #controls input[type=checkbox]')[idx];
      if (!el) return null;
      if (el.tagName === 'BUTTON' || el.classList.contains('sw')) {
        if (el.getAttribute('aria-pressed') === 'true') return 'skip';   // already selected: clicking is a no-op
        el.click();
        return el.classList.contains('sw') ? 'switch' : 'segmented';
      }
      if (el.tagName === 'SELECT') {
        if (el.options.length < 2) return 'skip';
        el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
      } else if (el.type === 'checkbox') {
        el.checked = !el.checked;
      } else {
        const lo = +el.min, hi = +el.max;
        el.value = String(+el.value > (lo + hi) / 2 ? lo : hi);
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.tagName === 'SELECT' ? 'select' : (el.type === 'checkbox' ? 'checkbox' : 'slider');
    }, i);
    if (!kind || kind === 'skip') continue;
    await page.waitForTimeout(420);
    const now = await grab();
    if (now !== a3) { moved = `${kind} #${i}`; }
    a3 = now;
  }
  if (!moved) dead.push(id); else responsive.push(`${id} (${moved})`);
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
