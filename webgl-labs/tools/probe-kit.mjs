/**
 * probe-kit.mjs — everything a render check needs, so a lab's check is a
 * description of what a student does rather than a page of Playwright plumbing.
 *
 * Why render checks exist at all: the engine suites hold the science to measured
 * data with no browser in the room, but a number can be perfect and the screen
 * still wrong — a shader that does not compile, a liquid that renders black, a
 * control wired to nothing, a status card showing yesterday's sentence. Those
 * are invisible to a unit test and obvious to a student. This drives the real
 * interface in a real GL context (software-rasterised, so it needs no GPU) and
 * reads what is actually on the screen.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* ── Browser ──────────────────────────────────────────────────────────────── */

/** The Chromium that is actually installed. The container ships build 1194 and
 *  the project's Playwright is pinned to a newer one, so left alone launch dies
 *  with "Executable doesn't exist". */
export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const stable = join(base, 'chromium');
  if (existsSync(stable)) return stable;
  try {
    const dirs = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = join(base, d, sub, 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* fall through */ }
  return undefined;
}

export const BROWSER_ARGS = [
  /* SwiftShader: CI has no GPU, and a shader that only compiles on one driver
     has not been verified. */
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--disable-gpu-vsync', '--disable-frame-rate-limit',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  /* The probe has no business phoning home, and a blocked egress proxy makes
     those attempts slow rather than instant. */
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--disable-component-update', '--disable-default-apps',
  '--disable-features=Translate,OptimizationHints,MediaRouter,ComponentUpdater',
];

/* ── The app under test ───────────────────────────────────────────────────── */

function newestMtime(dir, skip = new Set(['node_modules', 'dist', '.git'])) {
  let newest = 0;
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    newest = Math.max(newest, st.isDirectory() ? newestMtime(p, skip) : st.mtimeMs);
  }
  return newest;
}

/**
 * Build if the build is stale, serve it, and hand back a stop() — so a probe
 * owns its server. A long-lived background server goes stale the moment the
 * source changes, and a probe that quietly tests last hour's bundle is worse
 * than no probe: it reports on code that no longer exists.
 */
export async function startApp({ port = 4173, rebuild = false } = {}) {
  const dist = join(ROOT, 'dist', 'index.html');
  const stale = rebuild || !existsSync(dist)
    || Math.max(newestMtime(join(ROOT, 'src')), statSync(join(ROOT, 'index.html')).mtimeMs) > statSync(dist).mtimeMs;
  if (stale) {
    process.stdout.write('  building… ');
    const b = spawnSync('npx', ['vite', 'build'], { cwd: ROOT, encoding: 'utf8' });
    if (b.status !== 0) throw new Error(`vite build failed\n${(b.stderr || b.stdout).slice(-1500)}`);
    console.log('done');
  }
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', detached: false,
  });
  let exited = false;
  server.on('exit', () => { exited = true; });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i += 1) {
    if (exited) throw new Error(`vite preview exited early — is port ${port} already in use?`);
    try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { url, stop: () => { try { server.kill('SIGKILL'); } catch { /* already gone */ } } };
}

/* ── The kit a lab's probe receives ───────────────────────────────────────── */

export async function openLab({ url, code, browser, width = 420, height = 460 }) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(40000);
  const noise = [];
  page.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
  page.on('pageerror', (e) => noise.push(`pageerror: ${e.message}`));
  await page.goto(`${url}/?probe=1#/${code}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 25000 });
  await page.waitForTimeout(1500);
  return new Kit(page, code, noise);
}

export class Kit {
  constructor(page, code, noise) {
    this.page = page; this.code = code; this.noise = noise;
    this.results = [];
  }

  check(ok, label) {
    this.results.push({ ok: Boolean(ok), label });
    console.log(`  ${ok ? ' ok ' : 'FAIL'}  ${label}`);
    return Boolean(ok);
  }

  get failed() { return this.results.filter((r) => !r.ok); }

  /* ── Reading the screen ─────────────────────────────────────────────────── */

  /** The text of an instrument, by its data-probe hook. */
  text(key) {
    return this.page.evaluate((k) => document.querySelector(`[data-probe="${k}"]`)?.textContent ?? null, key);
  }

  /** The number in an instrument. An unobserved reading shows an em dash and
   *  comes back NaN, which is the right answer to "what did you record". */
  async read(key) {
    const t = await this.text(key);
    if (t === null) return NaN;
    const m = /-?\d[\d,]*\.?\d*(?:e[+-]?\d+)?/i.exec(t.replace(/−/g, '-'));
    return m ? Number(m[0].replace(/,/g, '')) : NaN;
  }

  /** The status the bench is announcing, as its stable key. */
  status() {
    return this.page.evaluate(() => document.querySelector('[data-probe="status"]')?.getAttribute('data-status') ?? null);
  }

  /** Evaluate a function of the store's state, in the page. */
  eval(fn, ...args) {
    return this.page.evaluate(([code, src, a]) => {
      const s = window.__labs?.[code]?.getState();
      // eslint-disable-next-line no-new-func
      return new Function('s', 'a', `return (${src})(s, a)`)(s, a);
    }, [this.code, fn.toString(), args]);
  }

  /** Poll the store until a predicate holds. Waiting on STATE rather than on a
   *  stopwatch is what makes these checks independent of how slow the machine is. */
  async waitFor(fn, { timeout = 120000, every = 250, ...args } = {}) {
    const t0 = Date.now();
    for (;;) {
      if (await this.eval(fn, args)) return true;
      if (Date.now() - t0 > timeout) return false;
      await this.page.waitForTimeout(every);
    }
  }

  /* ── Driving the interface ──────────────────────────────────────────────── */
  /* All by data-* hook and all through the real DOM events, so a control wired
     to nothing stays wired to nothing here too. */

  action(id) {
    return this.page.evaluate((i) => {
      const el = document.querySelector(`[data-action="${i}"]`);
      if (!el) throw new Error(`no action "${i}" is on screen — buttons: ${[...document.querySelectorAll('[data-action]')].map((b) => b.dataset.action).join(', ')}`);
      if (el.disabled) throw new Error(`action "${i}" is disabled`);
      el.click();
    }, id);
  }

  hasAction(id) {
    return this.page.evaluate((i) => Boolean(document.querySelector(`[data-action="${i}"]:not([disabled])`)), id);
  }

  option(controlId, value) {
    return this.page.evaluate(([c, v]) => {
      const el = document.querySelector(`[data-control="${c}"] [data-option="${v}"]`);
      if (!el) throw new Error(`no option "${v}" in control "${c}"`);
      el.click();
    }, [controlId, String(value)]);
  }

  slider(controlId, value) {
    return this.page.evaluate(([c, v]) => {
      const el = document.querySelector(`[data-control="${c}"] input[type=range]`);
      if (!el) throw new Error(`no slider "${c}"`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(Math.min(Math.max(v, Number(el.min)), Number(el.max))));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [controlId, value]);
  }

  select(controlId, value) {
    return this.page.evaluate(([c, v]) => {
      const el = document.querySelector(`[data-control="${c}"] select`);
      if (!el) throw new Error(`no select "${c}"`);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [controlId, String(value)]);
  }

  frames(n = 2) {
    return this.page.evaluate((k) => new Promise((resolve) => {
      let i = 0; const tick = () => { i += 1; if (i >= k) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }), n);
  }

  tableRows() { return this.page.locator('[data-probe="table"] tbody tr').count(); }

  /* ── Looking at the picture ─────────────────────────────────────────────── */

  /**
   * Is anything actually drawn, and what colour is it? Reads the real back
   * buffer from a rAF that runs after the scene's own, so the frame is there.
   * `region` is [x, y, w, h] as fractions of the canvas; the default is the
   * middle. A liquid that renders black and a liquid that does not compile are
   * the same thing to every other check.
   */
  canvasStats(region = [0.42, 0.42, 0.16, 0.16]) {
    return this.page.evaluate((reg) => new Promise((resolve) => {
      requestAnimationFrame(() => {
        const cv = document.querySelector('canvas');
        const gl = cv.getContext('webgl2') || cv.getContext('webgl');
        const W = cv.width; const H = cv.height;
        const all = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, all);
        const lum = (i) => all[i] * 0.299 + all[i + 1] * 0.587 + all[i + 2] * 0.114;
        let min = 255; let max = 0;
        for (let i = 0; i < all.length; i += 4) { const l = lum(i); if (l < min) min = l; if (l > max) max = l; }
        const x0 = Math.floor(reg[0] * W); const y0 = Math.floor(reg[1] * H);
        const w = Math.max(1, Math.floor(reg[2] * W)); const h = Math.max(1, Math.floor(reg[3] * H));
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) {
          const i = (y * W + x) * 4; r += all[i]; g += all[i + 1]; b += all[i + 2]; n += 1;
        }
        // 8 × 8 block fingerprint, for "did the picture change"
        const grid = [];
        for (let gy = 0; gy < 8; gy += 1) for (let gx = 0; gx < 8; gx += 1) {
          let s0 = 0; let s1 = 0; let s2 = 0; let c = 0;
          for (let y = Math.floor((gy * H) / 8); y < Math.floor(((gy + 1) * H) / 8); y += 3) {
            for (let x = Math.floor((gx * W) / 8); x < Math.floor(((gx + 1) * W) / 8); x += 3) {
              const i = (y * W + x) * 4; s0 += all[i]; s1 += all[i + 1]; s2 += all[i + 2]; c += 1;
            }
          }
          grid.push(s0 / c, s1 / c, s2 / c);
        }
        resolve({ min, max, range: max - min, r: r / n, g: g / n, b: b / n, grid });
      });
    }), region);
  }

  /* ── The checks every lab gets for free ─────────────────────────────────── */

  async generic({ region } = {}) {
    const ok = (c, l) => this.check(c, l);

    ok(await this.page.locator('canvas').isVisible(), 'the canvas is up');
    ok(!this.noise.some((n) => /shader|glsl|WebGLProgram|compile|THREE\./i.test(n)), 'every shader compiles on a real driver');
    ok(this.noise.length === 0, `no console errors${this.noise.length ? `: ${this.noise[0].slice(0, 200)}` : ''}`);

    const px = await this.canvasStats(region);
    ok(px.range > 60, `a scene is drawn, not a black canvas (luminance range ${px.range.toFixed(0)})`);

    const status = await this.status();
    ok(status && (await this.text('status'))?.trim().length > 4, `the bench announces a status ("${status}")`);
    ok((await this.page.locator('[data-control]').count()) > 0, 'there are controls to drive');
    ok((await this.page.locator('[data-probe="table"]').count()) === 1, 'there is an observation table');

    await this.sweepControls();
    await this.pressActions();
    return px;
  }

  /**
   * Press every enabled button once, in the order a student meets them, and
   * require that the bench is still standing afterwards. A crash on the
   * pressing of a button (a reading that is null because nothing is dipped yet)
   * is invisible to a control sweep and fatal to a lesson. The page is reloaded
   * after, so the scenario that follows starts from a fresh bench.
   */
  async pressActions() {
    const ids = await this.page.evaluate(() => [...document.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action')));
    const before = this.noise.length;
    let pressed = 0; let broke = false;
    for (const id of ids) {
      const clicked = await this.page.evaluate((i) => {
        const el = document.querySelector(`[data-action="${i}"]`);
        if (!el || el.disabled) return false;
        el.click(); return true;
      }, id);
      if (!clicked) continue;
      pressed += 1;
      await this.frames(3);
      const alive = await this.page.evaluate(() => Boolean(document.querySelector('[data-probe="status"]')) && Boolean(document.querySelector('canvas')));
      if (!alive || this.noise.length > before) {
        this.check(false, `pressing "${id}" broke the bench${this.noise[before] ? `: ${this.noise[before].slice(0, 160)}` : ''}`);
        broke = true; break;
      }
    }
    if (!broke) this.check(true, `${pressed} buttons pressed in turn; the bench stays up`);
    if (pressed) {
      await this.page.reload({ waitUntil: 'networkidle' });
      await this.page.waitForSelector('canvas', { timeout: 25000 });
      await this.page.waitForTimeout(1500);
      this.noise.length = 0;
    }
  }

  /**
   * Turn every control on the bench, one at a time, and require that each
   * visibly does something. Driven through the DOM exactly as a student would,
   * and judged by what is on screen — the instruments (data-probe) and the
   * picture — not by what the store says. A control wired to nothing reads
   * identically to a correct one until something drives it.
   */
  async sweepControls() {
    const results = await this.page.evaluate(async () => {
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      const settle = async () => { await raf(); await raf(); await raf(); };

      const instruments = () => [...document.querySelectorAll('[data-probe]')]
        .filter((e) => e.getAttribute('data-probe') !== 'table')
        .map((e) => `${e.getAttribute('data-probe')}=${e.textContent}${e.getAttribute('data-hex') ?? ''}`).join('|');

      const picture = () => new Promise((resolve) => requestAnimationFrame(() => {
        const cv = document.querySelector('canvas');
        const gl = cv.getContext('webgl2') || cv.getContext('webgl');
        const W = cv.width; const H = cv.height;
        const buf = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const out = [];
        for (let gy = 0; gy < 8; gy += 1) for (let gx = 0; gx < 8; gx += 1) {
          let s = 0; let c = 0;
          for (let y = Math.floor((gy * H) / 8); y < Math.floor(((gy + 1) * H) / 8); y += 3) {
            for (let x = Math.floor((gx * W) / 8); x < Math.floor(((gx + 1) * W) / 8); x += 3) {
              const i = (y * W + x) * 4; s += buf[i] + buf[i + 1] + buf[i + 2]; c += 1;
            }
          }
          out.push(s / c / 3);
        }
        resolve(out);
      }));
      const pdiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

      /* How much does the picture move on its own? Flames flicker and liquids
         shimmer, so a control only counts as moving the picture if it moves it
         by clearly more than the scene moves by itself. */
      const p0 = await picture(); await settle(); const p1 = await picture();
      const ambient = pdiff(p0, p1);

      const set = async (el, kind, value) => {
        if (kind === 'segmented') el.querySelector(`[data-option="${CSS.escape(value)}"]`)?.click();
        else if (kind === 'slider') {
          const input = el.querySelector('input[type=range]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (kind === 'select') {
          const sel = el.querySelector('select');
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
          setter.call(sel, value); sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await settle();
      };

      const out = [];
      /* By id, looked up afresh each time: sweeping one control (the method)
         can unmount and remount others, and a node held from before is detached
         — clicking it does nothing, which looks exactly like a dead control. */
      const ids = [...new Set([...document.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')))];
      for (const wanted of ids) {
        const el = document.querySelector(`[data-control="${CSS.escape(wanted)}"]`);
        if (!el) continue;                                        // hidden by the state the sweep left behind
        const holder = el.querySelector('[data-kind]');
        if (!holder) continue;                                    // an actions row or a group: not a setting
        const kind = holder.getAttribute('data-kind');
        const id = el.getAttribute('data-control');
        const observable = el.getAttribute('data-observable') !== 'false';

        let values; let original;
        if (kind === 'segmented') {
          const opts = [...el.querySelectorAll('[data-option]')];
          if (opts.some((o) => o.disabled)) { out.push({ id, kind, skipped: 'disabled' }); continue; }
          original = opts.find((o) => o.getAttribute('aria-pressed') === 'true')?.getAttribute('data-option');
          values = opts.map((o) => o.getAttribute('data-option')).filter((v) => v !== original);
        } else if (kind === 'slider') {
          const input = el.querySelector('input[type=range]');
          if (input.disabled) { out.push({ id, kind, skipped: 'disabled' }); continue; }
          original = input.value;
          const lo = Number(input.min); const hi = Number(input.max);
          values = [lo + 0.12 * (hi - lo), lo + 0.5 * (hi - lo), lo + 0.9 * (hi - lo)].map(String).filter((v) => v !== original);
        } else if (kind === 'select') {
          const sel = el.querySelector('select');
          if (sel.disabled) { out.push({ id, kind, skipped: 'disabled' }); continue; }
          original = sel.value;
          values = [...sel.options].map((o) => o.value).filter((v) => v !== original);
        } else continue;

        let changedInstrument = false; let changedPicture = false;
        let prevI = instruments(); let prevP = await picture();
        for (const v of values) {
          await set(el, kind, v);
          const i = instruments(); const p = await picture();
          if (i !== prevI) changedInstrument = true;
          if (pdiff(p, prevP) > ambient * 3 + 8) changedPicture = true;
          prevI = i; prevP = p;
        }
        await set(el, kind, original);                            // leave the bench as we found it
        out.push({ id, kind, tried: values.length, changedInstrument, changedPicture, observable });
      }
      return { out, ambient };
    });

    const tested = results.out.filter((r) => !r.skipped);
    const dead = tested.filter((r) => r.observable && !r.changedInstrument && !r.changedPicture);
    this.check(tested.length > 0, `${tested.length} settings swept (${results.out.length - tested.length} disabled, skipped)`);
    for (const r of tested) {
      const how = r.changedInstrument && r.changedPicture ? 'instruments and picture'
        : r.changedInstrument ? 'instruments' : r.changedPicture ? 'picture' : 'NOTHING';
      this.check(!r.observable || r.changedInstrument || r.changedPicture,
        `control "${r.id}" (${r.kind}, ${r.tried} values) moves ${how}`);
    }
    return { tested, dead, ambient: results.ambient };
  }

  async close() { await this.page.close(); }
}

export async function launch() {
  return chromium.launch({ executablePath: findChrome(), args: BROWSER_ARGS });
}
