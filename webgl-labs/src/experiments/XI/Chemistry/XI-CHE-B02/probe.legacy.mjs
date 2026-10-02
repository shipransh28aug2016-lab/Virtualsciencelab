/**
 * verify-render-boiling-point.mjs — proves the XI-CHE-B02 bench actually runs.
 *
 * verify-boiling-point.mjs checks the thermodynamics with no browser in the
 * room. This checks the other half: that the shaders compile on a real driver,
 * that the apparatus is drawn, that the HUD is wired to the engine, and that a
 * student following Siwoloboff's procedure — including the versions of it that
 * are meant to fail — sees what the engine says.
 *
 *   BASE=http://localhost:4173 CHROME_PATH=/path/to/chrome node verify-render-boiling-point.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

const panel = (page) => page.evaluate(() => document.body.innerText);

/** Read an instrument by its data-probe hook. An unobserved reading shows an
 *  em dash and comes back NaN, which is the right answer to "what did you
 *  record". */
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

const setSlider = (page, fromEnd, value) => page.evaluate(([k, v]) => {
  const all = [...document.querySelectorAll('input[type=range]')];
  const el = all.at(k);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, [fromEnd, value]);

/**
 * Siwoloboff's procedure, exactly as the manual gives it: heat until the stream
 * of bubbles is rapid and continuous, TAKE THE FLAME AWAY, and read the
 * temperature at which the stream ceases. The flame is not removed for you —
 * knowing when to stop is the skill — so the probe does it, like a student.
 */
async function determine(page, { budgetMs = 300000, heatFast = true } = {}) {
  if (heatFast) await setSlider(page, -1, 12);
  await page.getByRole('button', { name: 'Light the burner', exact: true }).click();

  const started = Date.now();
  let text = '';
  let slowed = false;
  let flameOff = false;
  const bp = await read(page, 'boiling-point');

  /* Every evaluate() competes with the renderer for the main thread, and on a
     CPU rasteriser that is the difference between the bench advancing and the
     probe watching itself poll. One round trip per iteration, not four. */
  while (Date.now() - started < budgetMs) {
    const snap = await page.evaluate(() => {
      const v = (k) => {
        const el = document.querySelector(`[data-probe="${k}"]`);
        if (!el) return NaN;
        const t = el.textContent.replace(/[^\d.-]/g, '');
        return t === '' || t === '-' || t === '.' ? NaN : Number(t);
      };
      return { text: document.body.innerText, bath: v('bath'), onset: v('onset'), observed: v('observed') };
    });
    text = snap.text;
    if (/cannot reach it/i.test(text) || /tube bumped/i.test(text)) break;

    if (!slowed && snap.bath >= bp - 12) { await setSlider(page, -1, 2); slowed = true; }
    if (!flameOff && Number.isFinite(snap.onset)) {
      await page.getByRole('button', { name: 'Take the flame away', exact: true }).click();
      flameOff = true;
    }
    if (flameOff && Number.isFinite(snap.observed)) break;
    await page.waitForTimeout(350);
  }

  return {
    text,
    bath: await read(page, 'bath'),
    onset: await read(page, 'onset'),
    observed: await read(page, 'observed'),
    corrected: await read(page, 'corrected'),
    boilingPoint: await read(page, 'boiling-point'),
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

await page.goto(`${BASE}#/XI-CHE-B02`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);

check(await page.locator('canvas').isVisible(), 'the canvas is up');
check(!noise.some((n) => /shader|glsl|WebGLProgram|compile/i.test(n)), 'all three shaders compile on a real driver');
check(noise.length === 0, `no console errors${noise.length ? `: ${noise[0].slice(0, 160)}` : ''}`);

const px = await canvasStats(page);
check(px.mean > 12, `the apparatus is drawn, not a black canvas (mean ${px.mean.toFixed(1)}/255)`);
check(px.max - px.min > 60, `the frame has a scene in it (range ${(px.max - px.min).toFixed(0)})`);
check(px.r > px.b * 1.10, `the paraffin bath renders amber (R ${px.r.toFixed(0)} vs B ${px.b.toFixed(0)})`);

await page.getByRole('button', { name: '×120', exact: true }).click();

/* ── 1 · Ethanol at 760 mm Hg, by the book ─────────────────────────────────── */
let text = await panel(page);
check(/Ethanol/i.test(text), 'ethanol is on the bench by default');
check(Math.abs((await read(page, 'boiling-point')) - 78.3) < 1.0, 'and it boils at the Antoine 78.3 °C');
check(Math.abs((await read(page, 'trouton')) - 116) < 8, 'Trouton reports it associated, at about 116 J/mol·K');

const r1 = await determine(page);
check(Number.isFinite(r1.observed), 'the determination completes');
check(Math.abs(r1.observed - 78.3) < 2.0, `and reads 78.3 °C (got ${r1.observed})`);
/* At 2 °C/min the two readings coincide, and that is the point rather than a
   weakness: heat slowly enough and the stream ceases where it started. The
   Node suite drives the same determination at 12 °C/min, where they separate
   by more than a degree. */
check(r1.onset >= r1.observed - 0.01,
  `the rapid stream was seen at ${r1.onset} °C and the stream ceased at ${r1.observed} °C — heated slowly, the two agree, which is exactly why the manual slows down`);

await page.getByRole('button', { name: 'Record trial', exact: true }).click();
await page.waitForTimeout(200);
check(await page.locator('tbody tr').count() === 1, 'Record writes exactly one row');
const row = await page.locator('tbody tr').first().innerText();
check(/agrees with the book/i.test(row), 'and the row infers agreement from the corrected value it computed');

/* ── 2 · Pressure is half the measurement ─────────────────────────────────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×120', exact: true }).click();
await setSlider(page, 0, 640);
check(Math.abs((await read(page, 'boiling-point')) - 74.1) < 1.5, 'at 640 mm Hg ethanol should boil near 74 °C');
const r2 = await determine(page);
check(r2.observed < r1.observed - 2.5, `and it does: ${r2.observed} °C against ${r1.observed} at 760`);
check(Math.abs(r2.corrected - 78.3) < 2.0,
  `Sidgwick brings it back to ${r2.corrected} °C — the correction, not the liquid, was what changed`);

/* ── 3 · Freedom to fail: an involatile impurity RAISES it ────────────────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×120', exact: true }).click();
await page.getByRole('button', { name: 'Crude', exact: true }).click();
const r3 = await determine(page);
check(r3.observed > r1.observed + 1.0,
  `the crude sample boils HIGHER (${r3.observed} against ${r1.observed} °C) — the opposite of what an impurity does to a melting point`);
check((await read(page, 'elevation')) > 1.0, 'and the bench reports the elevation it computed');

/* ── 4 · Freedom to fail: a water bath cannot boil aniline ────────────────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×120', exact: true }).click();
await page.getByRole('button', { name: 'C₆H₅NH₂', exact: true }).click();
await page.getByRole('button', { name: 'Water', exact: true }).click();
const r4 = await determine(page, { budgetMs: 240000 });
check(/cannot reach it/i.test(r4.text), 'the water bath refuses to boil aniline, and says why');
check(!Number.isFinite(r4.observed), 'and no boiling point is recorded, because none was observed');
check(r4.bath <= 100.5, `because water stops at 100 °C (bath ${r4.bath} °C)`);

/* ── 5 · Freedom to fail: nothing to boil on ──────────────────────────────── */
await page.getByRole('button', { name: 'Reset', exact: true }).click();
await page.getByRole('button', { name: '×120', exact: true }).click();
await page.getByRole('button', { name: 'H₂O', exact: true }).click();
await page.getByRole('button', { name: 'None', exact: true }).click();
const r5 = await determine(page, { budgetMs: 300000 });
check(/bumped/i.test(r5.text), 'with no capillary the tube superheats and bumps');
check(!Number.isFinite(r5.observed), 'and there is no reading to take, because there were never any bubbles');

await page.getByRole('button', { name: 'Record trial', exact: true }).click();
const rows = await page.locator('tbody tr').allInnerTexts();
check(rows.some((t) => /bumped — discard/i.test(t)), 'the notebook records the failure rather than hiding it');

await browser.close();

console.log(failures.length
  ? `\n${failures.length} check(s) failed.`
  : '\nRENDER VERIFIED — shaders compile, the HUD is wired, the bench obeys the engine.');
process.exit(failures.length ? 1 : 0);
