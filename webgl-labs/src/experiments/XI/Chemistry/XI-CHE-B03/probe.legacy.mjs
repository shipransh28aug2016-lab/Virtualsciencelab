/**
 * verify-render-crystallisation.mjs — proves the XI-CHE-B03 bench actually runs,
 * and that every control on it is wired to the engine.
 *
 * verify-crystallisation.mjs checks the chemistry with no browser in the room,
 * including a control-response matrix that sweeps every variable. This checks
 * the other half: that the shaders compile, the apparatus is drawn, the staged
 * procedure enforces its own order, and turning a control in the interface
 * actually moves the number the engine computes — a control wired to nothing
 * looks identical to a correct one until something drives it.
 *
 *   BASE=http://localhost:4173 CHROME_PATH=/path/to/chrome node verify-render-crystallisation.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const panel = (page) => page.evaluate(() => document.body.innerText);

const read = (page, key) => page.evaluate((k) => {
  const el = document.querySelector(`[data-probe="${k}"]`);
  if (!el) return NaN;
  const t = el.textContent.replace(/[^\d.-]/g, '');
  return t === '' || t === '-' || t === '.' ? NaN : Number(t);
}, key);

const canvasStats = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => {
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const lum = (b, i) => b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;
    const S = 64;
    const mid = new Uint8Array(S * S * 4);
    gl.readPixels(Math.floor(cv.width / 2 - S / 2), Math.floor(cv.height / 2 - S / 2),
      S, S, gl.RGBA, gl.UNSIGNED_BYTE, mid);
    let sum = 0; let r = 0; let b = 0;
    for (let i = 0; i < mid.length; i += 4) { sum += lum(mid, i); r += mid[i]; b += mid[i + 2]; }
    const n = S * S;
    const all = new Uint8Array(cv.width * cv.height * 4);
    gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, all);
    let min = 255; let max = 0;
    for (let i = 0; i < all.length; i += 4) { const l = lum(all, i); if (l < min) min = l; if (l > max) max = l; }
    resolve({ mean: sum / n, r: r / n, b: b / n, min, max });
  });
}));

/** Sliders, by their position on the panel. */
const SLIDER = { mass: 0, solvent: 1, coolTemp: 2 };
const setSlider = (page, index, value) => page.evaluate(([i, v]) => {
  const el = [...document.querySelectorAll('input[type=range]')][i];
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [index, value]);

/**
 * Click a button by its exact visible label.
 *
 * Deliberately a text locator rather than getByRole: on this page the role
 * engine matches some of these buttons and not others — "bench" and "ice"
 * resolve, "slow" and "light" do not, though all of them are plain enabled
 * <button>s with exactly that text. Whatever the cause, what a student clicks
 * is the text they can see, so that is what the probe clicks. On failure it
 * says what WAS on the page, because "timed out waiting for a button" is the
 * least useful sentence a probe can produce.
 */
const byLabel = (page, name) => page.locator('button')
  .filter({ hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });

const click = async (page, name) => {
  try {
    await byLabel(page, name).first().click({ timeout: 25000 });
  } catch (e) {
    const there = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()));
    throw new Error(`could not click "${name}": ${String(e.message).split('\n')[0]}\n      buttons present: ${JSON.stringify(there)}`);
  }
};

/** Dissolve, cool, and wait for the crop. */
async function crystallise(page, { budgetMs = 200000, filter = true } = {}) {
  await click(page, 'Heat & dissolve');
  /* Wait for the STAGE to change rather than for a fixed delay: on a CPU
     rasteriser a fixed wait is a race, and "still says undissolved" would then
     mean "the renderer was busy" rather than "it did not dissolve". */
  await byLabel(page, 'Set aside to cool').first().waitFor({ state: 'visible' });
  const hot = await panel(page);
  if (/not all dissolved/i.test(hot)) return { text: hot, dissolvedAll: false };
  await click(page, filter ? 'Filter hot' : 'Skip filtration');
  await click(page, 'Set aside to cool');

  /* Wait for the BENCH to say it is finished — the "Weigh the crystals" action
     appearing — rather than for a phrase. The two used to be able to disagree,
     and this check is here because they did. */
  const started = Date.now();
  let text = '';
  while (Date.now() - started < budgetMs) {
    text = await panel(page);
    if (/Weigh the crystals/i.test(text) || /No crystals at all/i.test(text)) break;
    await page.waitForTimeout(400);
  }
  return {
    text,
    dissolvedAll: true,
    recovery: await read(page, 'recovery'),
    mass: await read(page, 'mass'),
    size: await read(page, 'size'),
    purity: await read(page, 'purity'),
  };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-component-update', '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints,MediaRouter,ComponentUpdater',
  ],
});
const page = await browser.newPage({
  viewport: { width: Number(process.env.VW ?? 600), height: Number(process.env.VH ?? 600) },
});
page.setDefaultTimeout(40000);

const noise = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}#/XI-CHE-B03`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);

check(await page.locator('canvas').isVisible(), 'the canvas is up');
check(!noise.some((n) => /shader|glsl|WebGLProgram|compile/i.test(n)), 'the shaders compile on a real driver');
check(noise.length === 0, `no console errors${noise.length ? `: ${noise[0].slice(0, 160)}` : ''}`);

const px = await canvasStats(page);
check(px.mean > 12, `the apparatus is drawn, not a black canvas (mean ${px.mean.toFixed(1)}/255)`);
check(px.max - px.min > 60, `the frame has a scene in it (range ${(px.max - px.min).toFixed(0)})`);

await click(page, '×3000');

/* ── 1 · The minimum volume is computed and shown, not guessed ─────────────── */
let text = await panel(page);
check(/Copper\(II\) sulphate/i.test(text), 'copper sulphate is on the bench by default');
const minMl = await read(page, 'minimum');
check(minMl > 2 && minMl < 6, `and the bench computes the minimum solvent as ${minMl} mL, not 26`);

/* ── 2 · Every slider is wired: turning it must move the engine ────────────── */
const ratio0 = await read(page, 'ratio');
await setSlider(page, SLIDER.coolTemp, 0);
const ratioCold = await read(page, 'ratio');
check(ratioCold > ratio0, `the crystallising temperature is live: the hot/cold solubility ratio moves ${ratio0} → ${ratioCold}× when the bath goes to 0 °C`);
await setSlider(page, SLIDER.coolTemp, 20);

const min8 = await read(page, 'minimum');
await setSlider(page, SLIDER.mass, 14);
const min14 = await read(page, 'minimum');
check(min14 > min8, `the mass slider is live: twice the sample needs ${min14} mL against ${min8}`);
await setSlider(page, SLIDER.mass, 8);

/* ── 3 · The run itself, from the minimum volume ───────────────────────────── */
await setSlider(page, SLIDER.solvent, 6);
const good = await crystallise(page);
check(good.recovery > 55 && good.recovery < 85, `6 mL of boiling water returns ${good.recovery}% — the arithmetic of the two solubilities`);
check(good.mass > 3, `and ${good.mass} g of crystals`);

await click(page, 'Weigh the crystals');
await page.waitForTimeout(200);
check(await page.locator('tbody tr').count() === 1, 'weighing writes exactly one row');

/* ── 4 · Freedom to fail: too much solvent, which is the usual mistake ─────── */
await click(page, 'Start again');
await click(page, '×3000');
await setSlider(page, SLIDER.solvent, 26);
const drowned = await crystallise(page, { budgetMs: 90000 });
check(/No crystals at all/i.test(drowned.text), 'at 26 mL nothing crystallises, and the bench says why');
check(drowned.recovery < 1, `recovery ${drowned.recovery}% — the published default was seven times the minimum`);

/* ── 5 · Cooling rate decides the crystals, not the yield ─────────────────── */
await click(page, 'Start again');
await click(page, '×3000');
await setSlider(page, SLIDER.solvent, 6);
await click(page, 'slow');
const slow = await crystallise(page);
await click(page, 'Start again');
await click(page, '×3000');
await setSlider(page, SLIDER.solvent, 6);
await click(page, 'ice');
const ice = await crystallise(page);
check(slow.size > ice.size * 1.8, `cooling slowly gives ${slow.size} mm crystals against ${ice.size} mm from a quench`);
check(slow.purity > ice.purity, `and purer ones: ${slow.purity}% against ${ice.purity}%`);
/* Both baths are at the same temperature, so at equilibrium both must give the
   same recovery; a quench simply stops a little further from equilibrium. The
   point is that the cooling rate moves the crystal SIZE by a factor of several
   and the yield hardly at all. */
check(Math.abs(slow.recovery - ice.recovery) < 10,
  `while the recovery hardly moves (${slow.recovery}% against ${ice.recovery}%) — cooling rate is a purity control, not a yield control: it changed the crystal size by ${(slow.size / ice.size).toFixed(1)}×`);

/* ── 6 · Freedom to fail: the wrong solvent ───────────────────────────────── */
await click(page, 'Start again');
await click(page, '×3000');
await click(page, 'Ethanol');
await setSlider(page, SLIDER.solvent, 60);
const wrong = await crystallise(page, { budgetMs: 30000 });
check(wrong.dissolvedAll === false, 'copper sulphate does not dissolve in ethanol at all');
check(/not all dissolved/i.test(wrong.text), 'and the bench says so rather than pretending');

/* ── 7 · The procedure is staged, and the order is the student’s to get right ─ */
await click(page, 'Start again');
text = await panel(page);
check(/Heat & dissolve/i.test(text) && !/Filter hot/i.test(text),
  'before anything is dissolved the only action offered is to dissolve it');
await click(page, 'Heat & dissolve');
text = await panel(page);
check(/Filter hot/i.test(text), 'once it is hot, the hot filtration becomes possible');
await click(page, 'Set aside to cool');
text = await panel(page);
check(!/Filter hot/i.test(text), 'and once it is cooling it is too late — which is the point of the word "hot"');

await browser.close();

console.log(failures.length
  ? `\n${failures.length} check(s) failed.`
  : '\nRENDER VERIFIED — shaders compile, every control is wired, the bench obeys the engine.');
process.exit(failures.length ? 1 : 0);
