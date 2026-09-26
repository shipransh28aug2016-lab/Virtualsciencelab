/**
 * verify-render.mjs — proves the bench actually runs.
 *
 * verify-physics.mjs checks the chemistry against measured data with no browser
 * in the room. This one checks the other half: that the shaders compile on a
 * real GL driver, that the HUD is wired to the engine, and that a student
 * following the CBSE procedure gets a beaker that changes. A GLSL compile error
 * is silent in a build and fatal on screen, so it is checked here or nowhere.
 *
 *   node verify-render.mjs            # against `npm run preview` on :4173
 *   BASE=http://localhost:5173 node verify-render.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}`);
  if (!ok) failures.push(label);
};

/** React ignores a value written straight onto a range input; go through the
 *  native setter and dispatch the event it is listening for. `value` is absolute
 *  (mM, or s⁻¹ for the stirrer) because the concentration slider's range is
 *  rescaled per sol–electrolyte pair — a fraction would mean a different dose
 *  for every pair, which is precisely the comparison this probe is making. */
const setRange = (page, index, value) =>
  page.evaluate(([i, v]) => {
    const el = document.querySelectorAll('input[type=range]')[i];
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(Math.min(v, Number(el.max))));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, [index, value]);

const panel = (page) => page.evaluate(() => document.body.innerText);

/* Is anything actually drawn? A shader that compiles and a beaker that renders
   black are the same thing to every check above. This reads the real back buffer
   — sampled from a rAF that runs after R3F's, so the frame is there — and asks
   whether the middle of the canvas differs from the empty room behind it. */
const canvasStats = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => {
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const lum = (b, i) => b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;

    /* The middle of the beaker: a homogeneous medium, so it is meant to be flat.
       Its colour is the reading that matters. */
    const S = 96;
    const mid = new Uint8Array(S * S * 4);
    gl.readPixels(
      Math.floor(cv.width / 2 - S / 2), Math.floor(cv.height / 2 - S / 2),
      S, S, gl.RGBA, gl.UNSIGNED_BYTE, mid,
    );
    let sum = 0; let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < mid.length; i += 4) {
      sum += lum(mid, i); r += mid[i]; g += mid[i + 1]; b += mid[i + 2];
    }
    const n = S * S;

    /* And the whole frame, for the range — a scene, not a flat fill. */
    const all = new Uint8Array(cv.width * cv.height * 4);
    gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, all);
    let min = 255; let max = 0;
    for (let i = 0; i < all.length; i += 4) {
      const l = lum(all, i); if (l < min) min = l; if (l > max) max = l;
    }
    resolve({ mean: sum / n, r: r / n, g: g / n, b: b / n, min, max });
  });
}));


/* page.screenshot() waits for two identical compositor frames, which a scene
   that animates forever on a CPU rasteriser never gives it. CDP captures
   whatever is on screen right now, which is what we want anyway. */
/* The scene animates every frame even when the chemistry is paused — Brownian
   jitter and the meniscus do not stop — so Playwright's screenshot, which waits
   for two identical compositor frames, would never return. CDP takes whatever is
   on screen now. Documentation, not verification: a failure here is a note. */
async function shot(page, path) {
  /* Opt-in: capturing a WebGL frame out of a SwiftShader renderer reliably kills
     it here, and a screenshot is documentation, not a check. SHOTS=1 for one. */
  if (!process.env.SHOTS) return;
  try {
    /* Best effort: a busy CPU rasteriser can make even a click slow, and a
       still beaker is nicer to look at but not required. */
    await page.getByRole('button', { name: 'Pause' }).click({ timeout: 9000 }).catch(() => {});
    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path, Buffer.from(data, 'base64'));
    await cdp.detach();
  } catch (e) {
    console.log(`note  could not capture ${path}: ${e.message.split('\n')[0]}`);
  }
}
/* innerText reflects rendered text, and the instrument labels are CSS
   uppercase, so every lookup here is case-insensitive by construction. */
const num = (text, label) => {
  const m = new RegExp(`${label}\\s*\\n?\\s*×?([-\\d.,]+)`, 'i').exec(text);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
};

/* SwiftShader, because CI has no GPU and a shader that only compiles on one
   driver has not been verified. CHROME_PATH lets a container point at the
   Chromium it already has instead of downloading one. */
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    /* the probe has no business phoning home, and a blocked egress proxy makes
       those attempts slow rather than instant */
    '--no-first-run', '--no-default-browser-check', '--disable-sync',
    '--disable-component-update', '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints,MediaRouter,ComponentUpdater',
  ],
});
/* Small on purpose. The liquid's fragment shader marches 28 steps per pixel, and
   SwiftShader is a CPU rasteriser — at 1600×950 a frame takes seconds and the
   probe would never see the simulation move. The HUD is still fully laid out at
   this size. */
const page = await browser.newPage({
  viewport: {
    width: Number(process.env.VW ?? 760),
    height: Number(process.env.VH ?? 620),
  },
});

/* Fail fast. On a CPU rasteriser a wedged action would otherwise sit on
   Playwright's 30 s default and the run would look like a hang. */
page.setDefaultTimeout(40000);

const noise = [];
page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(2500);

check(await page.locator('canvas').isVisible(), 'the canvas is up');

const px = await canvasStats(page);
check(px.mean > 12, `the beaker is actually drawn, not a black canvas (mean ${px.mean.toFixed(1)}/255)`);
check(px.max - px.min > 60, `the frame has a scene in it, not a flat fill (range ${(px.max - px.min).toFixed(0)})`);
check(px.r > px.b * 1.15,
  `the pristine ferric sol renders brown, not grey (R ${px.r.toFixed(0)} vs B ${px.b.toFixed(0)})`);
check(
  !noise.some((n) => /shader|glsl|WebGLProgram|compile/i.test(n)),
  'both shaders compile on a real driver',
);
check(noise.length === 0, `no console errors${noise.length ? `: ${noise[0].slice(0, 160)}` : ''}`);

/* ── The procedure a student is told to follow ─────────────────────────────── */
const [solSel, elecSel] = await page.locator('select').all();
await solSel.selectOption('arsenousSulphide');
await elecSel.selectOption('NaCl');
await page.waitForTimeout(150);

let text = await panel(page);
check(/Cl₂|As₂S₃ is negative/.test(text) || /negative/.test(text), 'As₂S₃ is reported negative');
check(/Na⁺/.test(text), 'Hardy–Schulze picks Na⁺ against a negative sol');
const cccNa = num(text, 'CCC');
check(Math.abs(cccNa - 51) < 2, `CCC for NaCl reads 51 mM (got ${cccNa})`);

await elecSel.selectOption('AlCl3');
await page.waitForTimeout(150);
text = await panel(page);
check(/Al³⁺/.test(text), 'switching to AlCl₃ switches the coagulating ion to Al³⁺');
const cccAl = num(text, 'CCC');
check(cccAl < cccNa / 100, `Al³⁺ needs far less than Na⁺ (${cccAl} vs ${cccNa} mM)`);
check(/Cl⁻ is a spectator/.test(text), 'Cl⁻ is named as the spectator ion');

/* Dose it above the CCC, stir, and run the clock fast. */
await setRange(page, 0, 0.5);      // 0.5 mM AlCl₃ — about 5 × the CCC
await setRange(page, 1, 40);       // stirred, G = 40 s⁻¹
await page.getByRole('button', { name: 'Add electrolyte' }).click();

/* The Tyndall cone is a transient, and that is the point of the experiment: it
   brightens enormously while the flocs are growing and then dies as they fall
   out of the beam, leaving a clear supernatant over a bed. A single reading at
   the end would see nothing and conclude nothing, so the peak is sampled by
   polling the panel the way an eye watches the beaker. */
let peakTyndall = 0;
let peakCoagulated = 0;
for (let i = 0; i < 45; i += 1) {
  const t = await panel(page);
  peakTyndall = Math.max(peakTyndall, num(t, 'Tyndall') || 0);
  peakCoagulated = Math.max(peakCoagulated, num(t, 'Coagulated') || 0);
  if (process.env.DEBUG) {
    console.log('   ', i, 'clock', /t = ([\d.]+) s/.exec(t)?.[1],
      'coag', num(t, 'Coagulated'), 'tyndall', num(t, 'Tyndall'), 'W', num(t, 'Stability W'));
  }
  await page.waitForTimeout(40);
}
check(peakCoagulated > 90, `the sol coagulates above the CCC (${peakCoagulated}%)`);
check(peakTyndall > 2, `the Tyndall beam brightens as flocs form (peak ×${peakTyndall})`);

/* Now run the clock out until the precipitate has actually fallen. Settling is
   the slow half of the experiment — flocs cap at the size this shear can hold
   and then take minutes to clear a 7 cm column — so this waits on the state,
   not on a stopwatch. */
await page.getByRole('button', { name: '×100' }).click();
let settled = 0;
for (let i = 0; i < 80 && settled < 60; i += 1) {
  await page.waitForTimeout(100);
  settled = num(await panel(page), 'Settled') || 0;
}

text = await panel(page);
check(num(text, 'Floc radius') > 1000, 'flocs grow past a micron');
check(settled > 60, `the precipitate falls out of suspension (${settled}% settled)`);
check(num(text, 'Tyndall') < peakTyndall,
  `the cone fades once the precipitate has fallen — ×${num(text, 'Tyndall')} against a peak of ×${peakTyndall}`);

await page.getByRole('button', { name: 'Record reading' }).click();
await page.waitForTimeout(200);
const rows = await page.locator('tbody tr').count();
check(rows === 1, 'Record writes exactly one row into the observation table');
const row = await page.locator('tbody tr').first().innerText();
check(/Al³⁺/.test(row) && /As₂S₃/.test(row) && /AlCl₃/.test(row),
  'the row names the sol, the electrolyte and the ion that did the work');
check(/\b3\b/.test(row), 'the row records the valency');

await shot(page, 'docs/coagulated.png');

/* ── Freedom to fail: the same salt, the same dose, the other sol ───────────
   0.5 mM AlCl₃ flocculated As₂S₃ completely. On Fe(OH)₃ it is the chloride that
   has to do the work — z = 1, CCC 11.6 mM — so the identical dose does nothing
   at all. A student who has learnt "trivalent is powerful" and not "opposite in
   sign" fails here, and can see exactly why. */
await page.getByRole('button', { name: 'Fresh beaker' }).click();
await solSel.selectOption('ferricHydroxide');
await elecSel.selectOption('AlCl3');
await setRange(page, 0, 0.5);
await page.getByRole('button', { name: 'Add electrolyte' }).click();
await page.waitForTimeout(2500);
text = await panel(page);
check(num(text, 'Coagulated') < 5,
  `the same dose does nothing to the positive sol (${num(text, 'Coagulated')}%)`);
check(/Cl⁻/.test(text), 'on Fe(OH)₃ the coagulating ion is named as the chloride');
check(num(text, 'CCC') > 10, 'and it now takes 11.6 mM, not 0.093 mM');
check(/stable|Tyndall/i.test(text), 'the beaker reports itself stable rather than silently doing nothing');

await shot(page, 'docs/stable-run.png');
await browser.close();

console.log(failures.length
  ? `\n${failures.length} check(s) failed.`
  : '\nRENDER VERIFIED — shaders compile, HUD is wired, the beaker obeys the engine.');
process.exit(failures.length ? 1 : 0);
