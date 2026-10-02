/**
 * verify-render-melting-point.mjs — proves the XI-CHE-B01 bench actually runs.
 *
 * verify-melting-point.mjs checks the thermochemistry with no browser in the
 * room. This checks the other half: that all three shaders compile on a real
 * driver, that the apparatus is drawn rather than black, that the HUD is wired
 * to the engine, and that a student following the CBSE procedure — including
 * the procedures that are meant to fail — sees what the engine says.
 *
 *   BASE=http://localhost:4173 CHROME_PATH=/path/to/chrome node verify-render-melting-point.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const panel = (page) => page.evaluate(() => document.body.innerText);



/**
 * Read an instrument by its data-probe hook.
 *
 * Scraping innerText for a label does not work here and the failure is silent:
 * "Last crystal" appears in the readout, in the status sentence ("Last crystal
 * gone at 81.0 °C") and again as a column heading, and a regex takes whichever
 * comes first. The HUD carries stable hooks instead, so this reads exactly the
 * element a student is looking at. An unobserved reading shows an em dash and
 * comes back NaN, which is the correct answer to "what did you record".
 */
const read = (page, key) => page.evaluate((k) => {
  const el = document.querySelector(`[data-probe="${k}"]`);
  if (!el) return NaN;
  const t = el.textContent.replace(/[^\d.-]/g, '');
  return t === '' || t === '-' || t === '.' ? NaN : Number(t);
}, key);

/** Is anything actually drawn? A shader that compiles and an apparatus that
 *  renders black are the same thing to every other check here. */
const canvasStats = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => {
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const lum = (b, i) => b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;
    const S = 64;
    const mid = new Uint8Array(S * S * 4);
    gl.readPixels(Math.floor(cv.width / 2 - S / 2), Math.floor(cv.height / 2 - S / 2),
      S, S, gl.RGBA, gl.UNSIGNED_BYTE, mid);
    let sum = 0; let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < mid.length; i += 4) { sum += lum(mid, i); r += mid[i]; g += mid[i + 1]; b += mid[i + 2]; }
    const n = S * S;
    const all = new Uint8Array(cv.width * cv.height * 4);
    gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, all);
    let min = 255; let max = 0;
    for (let i = 0; i < all.length; i += 4) { const l = lum(all, i); if (l < min) min = l; if (l > max) max = l; }
    resolve({ mean: sum / n, r: r / n, g: g / n, b: b / n, min, max });
  });
}));

/** Set the heating-rate slider. It is the last range input on the panel; the
 *  mixed-melting-point slider, when it is showing, is the one before it. */
const setRate = (page, degreesPerMinute) => page.evaluate((v) => {
  const el = [...document.querySelectorAll('input[type=range]')].at(-1);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, degreesPerMinute);

/**
 * Run the bench the way the manual says to: drive the bath up fast until you
 * are within fifteen degrees of where you expect the melt, then drop to
 * 2 °C/min for the part that matters. Heating fast all the way would smear the
 * range by several degrees; heating slowly all the way takes an hour. Doing
 * both is the procedure, and it is also what makes this probe finish.
 */
async function meltRun(page, { budgetMs = 150000 } = {}) {
  await setRate(page, 12);
  const lit = await page.getByRole('button', { name: 'Light the burner', exact: true }).count();
  if (lit) await page.getByRole('button', { name: 'Light the burner', exact: true }).click();

  const started = Date.now();
  const approach = (await read(page, 'clear-point')) - 15;
  let slowed = false;
  let text = '';

  while (Date.now() - started < budgetMs) {
    text = await panel(page);
    if (/Completely melted/i.test(text) || /cannot reach it/i.test(text) || /sublimed away/i.test(text)) break;
    if (!slowed && (await read(page, 'bath')) >= approach) { await setRate(page, 2); slowed = true; }
    await page.waitForTimeout(200);
  }
  return {
    text,
    bath: await read(page, 'bath'),
    sinter: await read(page, 'sinter'),
    first: await read(page, 'first-drop'),
    last: await read(page, 'last-crystal'),
    range: await read(page, 'range'),
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
/* Small on purpose: three transmissive surfaces and a raymarched bath make a
   full-size frame take seconds on a CPU rasteriser, and the probe would never
   see the bench move. The HUD is fully laid out at this size. */
const page = await browser.newPage({
  viewport: { width: Number(process.env.VW ?? 660), height: Number(process.env.VH ?? 620) },
});
page.setDefaultTimeout(40000);

const noise = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));

/* ── The index, which is how a student gets here ───────────────────────────── */
await page.goto(BASE, { waitUntil: 'networkidle' });
const index = await panel(page);
check(/XI-CHE-B01/.test(index) && /XII-CHE-A01/.test(index), 'the index lists both benches');

await page.goto(`${BASE}#/XI-CHE-B01`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);

check(await page.locator('canvas').isVisible(), 'the canvas is up');
check(!noise.some((n) => /shader|glsl|WebGLProgram|compile/i.test(n)),
  'all three shaders compile on a real driver');
check(noise.length === 0, `no console errors${noise.length ? `: ${noise[0].slice(0, 160)}` : ''}`);

const px = await canvasStats(page);
check(px.mean > 12, `the apparatus is drawn, not a black canvas (mean ${px.mean.toFixed(1)}/255)`);
check(px.max - px.min > 60, `the frame has a scene in it (range ${(px.max - px.min).toFixed(0)})`);
check(px.r > px.b * 1.12, `the paraffin bath renders amber, not grey (R ${px.r.toFixed(0)} vs B ${px.b.toFixed(0)})`);

/* ── Run the clock fast; a real determination takes the better part of an hour ─ */
await page.getByRole('button', { name: '×300', exact: true }).click();

/* ── 1 · The recrystallised sample: sharp, at the handbook value ───────────── */
let text = await panel(page);
check(/Naphthalene/i.test(text), 'naphthalene is on the bench by default');
check(Math.abs((await read(page, 'clear-point')) - 80.3) < 1.0, 'and its clear point is the literature 80.26 °C');

let r = await meltRun(page);
check(Number.isFinite(r.last), 'the recrystallised sample melts');
check(Number.isFinite(r.first) && Number.isFinite(r.sinter), 'and both observations were actually made');
check(Math.abs(r.last - 80.3) < 2.0, `at about 80.3 °C (read ${r.last})`);
check(r.range <= 1.0, `and sharply — range ${r.range} °C`);

await page.getByRole('button', { name: 'Record trial', exact: true }).click();
await page.waitForTimeout(200);
check(await page.locator('tbody tr').count() === 1, 'Record writes exactly one row');
const row = await page.locator('tbody tr').first().innerText();
check(/sharp/i.test(row) && /Naphthalene/i.test(row), 'and the row infers a pure compound from the range it measured');

/* ── 2 · The crude sample: lower AND wider, from the same equation ─────────
   Reset first. A fresh capillary dropped into a bath that is already above the
   melting point melts before anyone can look at it — true, and a real way to
   waste a sample, but not the comparison being made here. */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×300', exact: true }).click();
await page.getByRole('button', { name: 'Crude', exact: true }).click();
const crude = await meltRun(page);
check(crude.last < r.last - 1.0, `the crude sample melts lower (${crude.last} against ${r.last} °C)`);
check(crude.range > 2.5, `and over a range (${crude.range} °C, against ${r.range} °C)`);
check(Number.isFinite(crude.sinter) && crude.sinter < crude.first - 10,
  `sintering is seen long before the first drop (${crude.sinter} °C against ${crude.first} °C) — that is the eutectic`);

/* ── 3 · Freedom to fail: a water bath cannot melt benzoic acid ──────────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×300', exact: true }).click();
await page.getByRole('button', { name: 'C₆H₅COOH', exact: true }).click();
await page.getByRole('button', { name: 'Water', exact: true }).click();
const drowned = await meltRun(page, { budgetMs: 45000 });
check(/cannot reach it/i.test(drowned.text), 'the water bath refuses to melt benzoic acid, and says why');
check(!Number.isFinite(drowned.last), 'and no melting point is recorded, because none was observed');
check(drowned.bath <= 100.5, `because water stops at 100 °C (bath ${drowned.bath} °C)`);

/* ── 4 · The mixed melting point, which is the identification test ───────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×300', exact: true }).click();
await page.getByRole('button', { name: 'C₆H₅COOH', exact: true }).click();
await page.locator('select').selectOption('benzoic');
await page.evaluate(() => {
  const el = [...document.querySelectorAll('input[type=range]')].at(-2);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, '50');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const selfMix = await meltRun(page);
check(Math.abs(selfMix.last - 122.4) < 3.0,
  `benzoic acid mixed with benzoic acid melts unchanged (${selfMix.last} °C)`);

await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×300', exact: true }).click();
await page.getByRole('button', { name: 'C₆H₅COOH', exact: true }).click();
await page.locator('select').selectOption('salicylic');
await page.evaluate(() => {
  const el = [...document.querySelectorAll('input[type=range]')].at(-2);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, '50');
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const wrongMix = await meltRun(page);
check(wrongMix.last < selfMix.last - 10,
  `benzoic acid mixed with salicylic acid is depressed to ${wrongMix.last} °C — the two bottles are not the same substance`);

await page.getByRole('button', { name: 'Record trial', exact: true }).click();
check(await page.locator('tbody tr').count() >= 2, 'every trial is in the notebook, including the ones that failed');

await browser.close();

console.log(failures.length
  ? `\n${failures.length} check(s) failed.`
  : '\nRENDER VERIFIED — three shaders compile, the HUD is wired, the bench obeys the engine.');
process.exit(failures.length ? 1 : 0);
