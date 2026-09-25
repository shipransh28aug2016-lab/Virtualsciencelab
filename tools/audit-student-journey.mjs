#!/usr/bin/env node
/**
 * THE STUDENT JOURNEY AUDIT
 *
 * Every other audit in this repository asks "did anything throw?". None of them
 * asks the only question that matters to the person in front of the screen:
 *
 *     Can a student actually PERFORM this experiment, end to end,
 *     and get a result that agrees with the physics?
 *
 * A lab can pass every existing audit and still be useless: the bench draws,
 * the model steps, nothing throws — and yet the readings never enter the table,
 * or the graph stays empty, or "Calculate result" refuses forever, or the
 * apparatus on screen belongs to a different experiment entirely.
 *
 * This audit walks the real journey in a real browser:
 *
 *   OPEN → SEE the apparatus → CHANGE a control → watch it RESPOND
 *        → RUN the process → RECORD several readings at different settings
 *        → see them PLOT → CALCULATE → compare against the ACCEPTED value
 *
 * A failure at any stage is reported against the stage it broke at, so the fix
 * goes into the layer that is actually wrong (model / renderer / data / UI)
 * rather than wherever the symptom surfaced.
 *
 *   node tools/audit-student-journey.mjs                # all published labs
 *   node tools/audit-student-journey.mjs XI-PHY-A07     # one lab, verbose
 *   node tools/audit-student-journey.mjs --json out.json
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const root = process.env.VLAB_ROOT || process.cwd();
const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args[jsonAt + 1] : null;
const shotDir = args.includes('--shots') ? join(root, '.audit-shots') : null;
const only = args.filter((a) => !a.startsWith('--') && a !== jsonOut);
const PORT = Number(process.env.VLAB_PORT || 8099);
const BASE = `http://localhost:${PORT}`;

const index = JSON.parse(await readFile(join(root, 'data/experiments/index.json'), 'utf8'));
const published = index.experiments.filter((e) => e.contentStatus === 'published');
const targets = only.length ? published.filter((e) => only.includes(e.id)) : published;
if (!targets.length) {
  console.error(`No published experiment matches ${only.join(', ')}`);
  process.exit(1);
}

/* ── a server of our own, so the audit never depends on one being up ── */
const server = spawn(process.execPath, [join(root, 'tools/serve.mjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const stopServer = () => { try { server.kill('SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopServer);
for (let i = 0; i < 60; i += 1) {
  try { await fetch(`${BASE}/index.html`); break; } catch { await new Promise((r) => setTimeout(r, 120)); }
}
if (shotDir) await mkdir(shotDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.VLAB_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  /*
   * Every lane's page must keep animating.
   *
   * Only one page in a browser is "visible"; Chromium throttles the rest,
   * cutting requestAnimationFrame to about one a second and freezing the
   * timers with it. The models are stepped on an animation frame, so a
   * throttled lane runs its bench in slow motion — which is both why readings
   * used to be taken before the apparatus had responded, and why waiting
   * properly for frames made a four-lane sweep five times slower than a
   * single one.
   */
  args: [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
const LANES = Number(process.env.VLAB_LANES || 4);
/* VLAB_TRACE=1 prints where each reading was taken and what the bench said
   back. A refusal names a setting; without this the only way to see whether
   the probe acted on it was to reason about the sweep arithmetic. */
const TRACE = process.env.VLAB_TRACE === '1';
/* No single bench may hold the sweep hostage. A lab that cannot be finished
   inside this is reported as such, which is itself the finding. */
const LAB_BUDGET_MS = Number(process.env.VLAB_LAB_BUDGET_MS || 150000);

/** One browser tab with its own error sink, so lanes never cross-report. */
async function openLane() {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  const lane = { page, errors, current: '' };
  page.on('pageerror', (e) => errors.push(`${lane.current}|pageerror|${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${lane.current}|console|${m.text().slice(0, 200)}`); });
  return lane;
}

/* ── helpers that run inside the page ── */

/** A cheap but discriminating fingerprint of what the bench actually shows. */
const SCENE_PROBE = () => {
  const c = document.querySelector('#cv');
  if (!c) return null;
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  if (!w || !h) return null;
  const d = ctx.getImageData(0, 0, w, h).data;
  // Sample on a grid: full-resolution scans of 100 labs are needlessly slow.
  const step = 4;
  let inked = 0; let total = 0; let sum = 0;
  const hues = new Set();
  let hash = 0;
  // The background is whatever the corner is; anything differing from it is drawn.
  const bg = [d[0], d[1], d[2]];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const r = d[i]; const g = d[i + 1]; const b = d[i + 2];
      total += 1;
      const dev = Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]);
      if (dev > 24) inked += 1;
      sum += r + g + b;
      if (dev > 24) hues.add(`${r >> 4},${g >> 4},${b >> 4}`);
      hash = (hash * 31 + r + (g << 1) + (b << 2)) >>> 0;
    }
  }
  return { ink: inked / total, colours: hues.size, mean: sum / (total * 3), hash, w, h };
};

/** Everything the student can read off the screen right now. */
const READOUT_PROBE = () => {
  const txt = (sel) => [...document.querySelectorAll(sel)].map((n) => n.textContent.trim()).join(' | ');
  return {
    readouts: txt('#readouts .ro, #readouts .readout, #readouts div'),
    rows: document.querySelectorAll('#tbody tr:not(:has(.tbl-empty))').length,
    graphPts: document.querySelectorAll('#graph circle, #graph .pt').length,
    graphHidden: !!document.querySelector('#graphPanel')?.hidden,
    result: document.querySelector('#resultBox')?.textContent.trim().slice(0, 400) || '',
    resultClass: document.querySelector('#resultBox')?.className || '',
    toolbar: [...document.querySelectorAll('#toolbar button')].map((b) => ({
      id: b.id, label: b.textContent.trim(), disabled: b.disabled,
    })),
    controls: [...document.querySelectorAll('#controls .ctl')].length,
    labError: !!document.querySelector('#labError:not([hidden])'),
  };
};

/*
 * Some benches separate the controls you SETTLE from the controls you VARY,
 * and mark the first kind `data-group="setup"`. Circuit assembly is the clear
 * case: where the ammeter goes and whether the key is open are decided once,
 * and only the rheostat moves between readings. A student who re-wires the
 * circuit between readings is told off by the bench, correctly — so the probe
 * does not do it either. Benches that draw no such distinction are unaffected:
 * nothing carries the attribute, so nothing is excluded.
 */
const VARIABLE_WIDGETS = [
  'input[type=range]', '.seg button', '.wiring button', '.sw', 'select', 'input[type=checkbox]',
].map((w) => `#controls .ctl:not([data-group="setup"]) ${w}`).join(', ');

/** Drive one control to a value it does not currently hold. Returns what it did. */
const NUDGE_CONTROL = ({ idx, fraction, slidersOnly }) => {
  const sel = '#controls .ctl:not([data-group="setup"]) input[type=range], #controls .ctl:not([data-group="setup"]) .seg button, #controls .ctl:not([data-group="setup"]) .wiring button, #controls .ctl:not([data-group="setup"]) .sw, #controls .ctl:not([data-group="setup"]) select, #controls .ctl:not([data-group="setup"]) input[type=checkbox]';
  const el = document.querySelectorAll(sel)[idx];
  if (!el) return null;
  /* Once the bench has objected to a mixed set, hunting must not quietly
     swap the specimen again while looking for a recordable setting. */
  if (slidersOnly && el.type !== 'range') return { kind: 'already' };
  if (el.tagName === 'BUTTON') {
    if (el.getAttribute('aria-pressed') === 'true' && !el.classList.contains('sw')) return { kind: 'already', label: el.textContent.trim() };
    el.click();
    return { kind: el.classList.contains('sw') ? 'switch' : 'segmented', label: el.textContent.trim() || el.getAttribute('aria-label') };
  }
  if (el.type === 'range') {
    const min = Number(el.min); const max = Number(el.max); const step = Number(el.step) || 1;
    const want = min + (max - min) * fraction;
    const snapped = Math.round((want - min) / step) * step + min;
    const before = Number(el.value);
    if (Math.abs(snapped - before) < step / 2) return { kind: 'already', label: el.getAttribute('aria-label'), value: before };
    el.value = String(snapped);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { kind: 'slider', label: el.getAttribute('aria-label'), from: before, to: Number(el.value) };
  }
  if (el.tagName === 'SELECT') {
    if (el.options.length < 2) return { kind: 'already' };
    el.selectedIndex = (el.selectedIndex + 1) % el.options.length;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { kind: 'select', label: el.getAttribute('aria-label') };
  }
  if (el.type === 'checkbox') {
    el.checked = !el.checked;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { kind: 'checkbox' };
  }
  return null;
};

/**
 * Walk one lane: every experiment handed to it, start to finish.
 *
 * The probes are built per lane rather than shared, because each lane drives
 * its own tab; a shared `page` would have every lane fighting for one bench.
 */
async function runLane(lane, queue, reports, onDone) {
  const { page } = lane;
  const wait = (ms) => page.waitForTimeout(ms);
  const probeScene = () => page.evaluate(SCENE_PROBE);
  const probeRead = () => page.evaluate(READOUT_PROBE);

  /** Is the bench ready for a reading to be taken right now? */
  const READY_PROBE = () => {
    const b = document.querySelector('#aRecord');
    if (!b) return { exists: false };
    return {
      exists: true,
      enabled: !b.disabled,
      flagged: b.classList.contains('primary'),   // models that signal "now" (end point, clock stopped)
      title: b.title || '',
    };
  };

  /**
   * Start whatever process this experiment needs and WAIT for it, the way a
   * student waits for the bob to finish twenty swings or the flask to turn pink.
   * Returns how long the wait actually took, because a reading that costs the
   * student forty seconds of staring is a pedagogy problem even when it works.
   */
  async function runProcessAndWait(capMs = 34000) {
    const t0 = Date.now();
    /* Put the clock back to its fastest before every run. A student who has
       set a bench to ×10 does not set it back between readings, but the
       toolbar rebuilds itself when the apparatus changes, and a rebuilt
       toolbar opens at ×1 — which turned a 40-second clock reaction into a
       40-second wait, five times over. */
    await page.evaluate(() => {
      const host = document.querySelector('#clock');
      if (!host || host.hidden) return;
      const fast = [...host.querySelectorAll('.clock-seg button')].pop();
      if (fast && fast.getAttribute('aria-pressed') !== 'true') fast.click();
    });
    const started = await page.evaluate(() => {
      const b = document.querySelector('#aRun, #aStart, #aRelease');
      if (!b || b.disabled) return null;
      b.click();
      return b.id;
    });
    if (!started) return { started: null, waitedMs: 0 };
    // Poll rather than guess: the model decides when it is done.
    while (Date.now() - t0 < capMs) {
      const r = await page.evaluate(READY_PROBE);
      if (r.exists && r.enabled && (r.flagged || !/wait|release|until|first/i.test(r.title))) break;
      await wait(250);
    }
    return { started, waitedMs: Date.now() - t0 };
  }

  /**
   * Titrate to the end point through the burette control, which is what the
   * stopcock actually drives: run in coarsely, then approach dropwise, exactly
   * as the practical demands. Running the tap wide open to the end point is a
   * procedural error, and the model is right to call it an overshoot.
   */
  async function titrateToEndPoint(deadline = Infinity) {
    const t0 = Date.now();
    /* A titration must not outlast the lab. Running the burette in from zero
       in millilitre steps, waiting for the tap each time, costs the best part
       of a minute; doing it for every titre of every set, with nothing
       checking the clock until the whole titration was over, is how a
       titration bench came to hold a sweep lane for twenty minutes. */
    const spent = () => Date.now() > deadline;
    /* Every titration starts from a full burette. A student refills before
       each one, and now that titrant cannot be taken back out of the flask
       the probe has to do the same — otherwise a burette left part-way down
       the scale by the previous titre is already past the end point of this
       one, and the flask never changes colour however long it waits. */
    await page.evaluate(() => document.querySelector('#aReset')?.click());
    await settle(600);
    const range = await page.evaluate(() => {
      const sl = document.querySelector('#c_buretteVolume');
      return sl ? { min: Number(sl.min), max: Number(sl.max), step: Number(sl.step) || 0.1 } : null;
    });
    if (!range) return { started: null, waitedMs: 0 };
    const setBurette = (v) => page.evaluate((val) => {
      const sl = document.querySelector('#c_buretteVolume');
      if (!sl) return null;
      sl.value = String(val);
      sl.dispatchEvent(new Event('input', { bubbles: true }));
      return Number(sl.value);
    }, v);
    const flag = () => page.evaluate(READY_PROBE);

    /* Run in coarsely until the colour first holds. The tap is given time to
       actually deliver between steps: a burette that has been TOLD to read
       19.7 mL but has only delivered 19.4 is still short of the end point, and
       sweeping faster than it can pour reads the wrong volume. */
    let hit = null;
    for (let v = range.min; v <= range.max && !spent(); v += 1) {
      await setBurette(Number(v.toFixed(2)));
      await settle(900);            // the tap must finish pouring, whatever the load
      const f = await flag();
      if (f.flagged || /overshot/i.test(f.title)) { hit = v; break; }
    }
    if (hit === null) return { started: 'burette', waitedMs: Date.now() - t0, endpoint: false };

    /* The rough titration is over, and it ran past the end point. A burette
       does not go backwards, so the flask is refilled and the titration done
       again properly: fast to a millilitre short of where the colour turned,
       then drop by drop. That is the procedure the practical prescribes, and
       the bench now requires it. */
    await page.evaluate(() => document.querySelector('#aReset')?.click());
    await settle(900);
    await setBurette(Number(Math.max(range.min, hit - 1.5).toFixed(2)));
    await settle(900);
    for (let v = Math.max(range.min, hit - 1.5); v <= hit + 0.2 && !spent(); v += Math.max(range.step, 0.05)) {
      await setBurette(Number(v.toFixed(2)));
      await settle(900);
      const f = await flag();
      if (f.flagged && !/overshot/i.test(f.title)) break;
    }
    return { started: 'burette', waitedMs: Date.now() - t0, endpoint: true };
  }

  /** Wait until the bench stops changing by itself, or the cap expires. */
  async function settle(capMs = 1600) {
    let last = null;
    const t0 = Date.now();
    while (Date.now() - t0 < capMs) {
      const now = (await probeRead()).readouts;
      if (now === last) return;
      last = now;
      await wait(130);
    }
  }

  /**
   * A student refused a reading does not give up: they move the screen until
   * the image is sharp, run in a little more titrant until the colour holds,
   * wait for the clock. This sweeps the controls, trying to record at each
   * stop. If no setting anywhere on the bench yields a reading, the
   * experiment genuinely cannot be performed.
   */
  async function huntForReading(nControls, stops = 5, phase = 0, stopAt = Infinity, slidersOnly = false) {
    const limit = Math.min(nControls, 6);
    if (Date.now() > stopAt) return { ok: false, why: 'ran out of time before a reading could be found' };
    for (let n = 0; n < limit; n += 1) {
      const i = (n + phase) % nControls;
      for (let j = 0; j <= stops; j += 1) {
        const k = (j + phase * 3) % (stops + 1);
        if (Date.now() > stopAt) return { ok: false, why: 'ran out of time before a reading could be found' };
        const did = await page.evaluate(NUDGE_CONTROL, { idx: i, fraction: k / stops, slidersOnly });
        if (!did || did.kind === 'already') continue;
        await settle(340);
        const t = await takeReading();
        if (t.ok) return { ...t, via: did.label || did.kind };
      }
    }
    return { ok: false, why: 'no setting anywhere on the bench allowed a reading' };
  }

  /** What the bench's null indicator currently says, if it has one. */
  const NULL_PROBE = () => {
    const el = document.querySelector('#nullBox');
    if (!el || el.hidden) return null;
    const cls = el.className || '';
    const m = cls.match(/\bs(\d)\b/);
    const txt = el.querySelector('.nb-reading')?.textContent || '';
    return {
      atNull: /\bat-null\b/.test(cls),
      strength: m ? Number(m[1]) : 9,
      up: txt.includes('\u25b8'),
      down: txt.includes('\u25c2'),
      text: txt.trim(),
    };
  };

  /**
   * Do what a student does with a null indicator: move the control the way it
   * points, and keep halving in until the instrument nulls.
   *
   * This is the honest test of the indicator itself. If following it does not
   * reach the balance point then the guidance does not work — a student with a
   * jockey and a metre of wire has no better information than this probe does.
   */
  /**
   * Read the indicator once it has stopped moving, in one round trip.
   *
   * The indicator is redrawn from the model and the model is stepped on an
   * animation frame, so the probe has to wait for frames rather than for
   * milliseconds: a fixed pause is enough on an idle machine and not enough
   * on a loaded one, and the same labs passed one at a time and failed in a
   * four-lane sweep. Waiting a frame at a time from Node cost a round trip
   * per frame and ran the slowest benches out of their budget, so the loop
   * was moved across.
   */
  async function readIndicator(capMs = 1300) {
    return page.evaluate(async ({ cap, src }) => {
      // eslint-disable-next-line no-new-func
      const read = new Function(`return (${src})`)();
      /* A frame, or a quarter of a second, whichever comes first. A page
         whose animation frames stop — a lab that has thrown, a tab the
         browser has throttled — would otherwise leave this waiting for a
         frame that never comes, with no timeout anywhere above it, and the
         whole lane hangs past its budget. */
      const frame = () => Promise.race([
        new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(() => r())); }),
        /* Two frames at 60 fps is 33 ms. 150 gives a page under load room to
           deliver them — at 80 the read came back before the bench had
           redrawn, and the hunt bisected away from the null again — without
           paying a quarter of a second for every read, of which a null hunt
           makes a dozen for every reading. */
        new Promise((r) => { setTimeout(r, 150); }),
      ]);
      const t0 = Date.now();
      await frame();
      let last = read();
      let same = 0;
      if (last && last.atNull) return last;
      while (Date.now() - t0 < cap) {
        await frame();
        const now = read();
        /* At the null there is nothing left to settle. The beam balance's
           pointer SWINGS, so its reading text kept changing and every read
           ran to the full cap — twelve of them per hunt, once per reading,
           which is what put this bench over its time budget. A student
           watching a swinging pointer come to rest about the zero calls that
           balanced, and so does this. */
        if (now && now.atNull) return now;
        /* Two agreeing reads, each a frame apart, is the model having settled
           rather than the probe having been quick. */
        if (now && last && now.text === last.text) {
          same += 1;
          if (same >= 2) return now;
        } else {
          same = 0;
        }
        last = now;
      }
      return last;
    }, { cap: capMs, src: NULL_PROBE.toString() }).catch(() => null);
  }

  /* Which control the last successful hunt nulled. On a null bench the
     reading is taken AT the null, so that control is not the one to vary
     between readings — the student changes the resistance in the box, or the
     load, or the specimen, and brings the jockey back to balance. Sweeping it
     instead gave one reading and then three refusals. */
  let nulledControl = null;
  /* The same control in the probe's own widget numbering, so the next hunt can
     start with the one that worked last time instead of driving every control
     to both ends of its travel again. On a bench whose null is on the third
     control that is most of the hunt's cost, and these hunts run once per
     reading. */
  let nulledWidget = null;

  async function homeInOnNull(nControls, capMs = 20000, window = null) {
    const t0 = Date.now();
    if (!(await page.evaluate(NULL_PROBE))) return false;
    /* The SAME widget list the rest of the probe counts and drives. This
       selector used to include the setup controls, so its indices ran over a
       longer list than `nControls` described: on a bench with a setup slider
       ahead of the instrument's own, the loop stopped before it ever reached
       the control that moves the null, and the hunt reported that following
       the indicator does not work when it had never followed it. */
    const SEL = VARIABLE_WIDGETS;

    const order = [...Array(nControls).keys()];
    if (nulledWidget !== null && nulledWidget < nControls) {
      order.splice(order.indexOf(nulledWidget), 1);
      order.unshift(nulledWidget);
    }
    for (const i of order) {
      if (Date.now() - t0 >= capMs) break;
      const range = await page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx];
        if (!el || el.type !== 'range') return null;
        return { min: Number(el.min), max: Number(el.max), step: Number(el.step) || 1 };
      }, { sel: SEL, idx: i });
      if (!range) continue;
      if (window && i === 0) {
        range.min = Math.max(range.min, window.lo);
        range.max = Math.min(range.max, window.hi);
        if (!(range.max - range.min > range.step)) continue;
      }

      /* `i` indexes EVERY variable widget; the per-reading sweep indexes the
         sliders alone. Recording one in the other's terms made the sweep skip
         the wrong control — on a bench whose specimen tray comes first, it
         skipped the zero-error slider and went on sweeping the jaw opening
         the hunt had just balanced. */
      const asSliderIndex = () => page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx];
        const sliders = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')];
        const at = sliders.indexOf(el);
        return at < 0 ? null : at;
      }, { sel: SEL, idx: i });

      const setAt = (v) => page.evaluate(({ sel, idx, val }) => {
        const el = document.querySelectorAll(sel)[idx];
        if (!el) return null;
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return Number(el.value);
      }, { sel: SEL, idx: i, val: v });

      /* Does this control move the indicator at all? Probing that means
         driving it to both ends, so whatever it was set to is remembered and
         PUT BACK if this is not the control — otherwise testing a control
         that does nothing destroys the setting a previous one got right. */
      const before = await page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx];
        return el ? Number(el.value) : null;
      }, { sel: SEL, idx: i });
      const restore = async () => { if (before !== null) await setAt(before); };

      if ((await readIndicator())?.atNull) { nulledWidget = i; nulledControl = await asSliderIndex(); return true; }
      await setAt(range.min);
      let low = await readIndicator();
      if (!low) low = await readIndicator();
      await setAt(range.max);
      let high = await readIndicator();
      if (!high) high = await readIndicator();
      /* One missed read is a moment when the indicator was not on the page,
         not an answer about this control: asked again rather than skipped,
         because skipping it is how a hunt comes back "the indicator cannot be
         followed" having never followed it. */
      if (!low || !high) { await restore(); continue; }
      if (low.atNull) { await setAt(range.min); nulledWidget = i; nulledControl = await asSliderIndex(); return true; }
      if (high.atNull) { nulledWidget = i; nulledControl = await asSliderIndex(); return true; }
      if (low.up === high.up) { await restore(); continue; }   // the null is not inside this range

      // Bisect on the direction the indicator points.
      let lo = range.min;
      let hi = range.max;
      for (let k = 0; k < 30 && Date.now() - t0 < capMs; k += 1) {
        const mid = Math.round(((lo + hi) / 2 - range.min) / range.step) * range.step + range.min;
        await setAt(Number(mid.toFixed(6)));
        const now = await readIndicator(1000);
        if (!now) break;
        if (now.atNull) { nulledWidget = i; nulledControl = await asSliderIndex(); return true; }
        if (hi - lo <= range.step * 1.01) break;
        if (now.up) lo = mid; else hi = mid;
      }
      if ((await readIndicator())?.atNull) { nulledWidget = i; nulledControl = await asSliderIndex(); return true; }
      // The bisection leaves the control at its best value, which is an
      // improvement even when it did not reach the null — so it is kept.
    }
    return false;
  }

  /** Try to take one reading; report exactly why it was refused. */
  async function takeReading() {
    const before = (await probeRead()).rows;
    const clicked = await page.evaluate(() => {
      const b = document.querySelector('#aRecord');
      if (!b) return 'no-button';
      if (b.disabled) return `disabled (${b.title || 'no reason given'})`;
      b.click();
      return 'clicked';
    });
    if (clicked !== 'clicked') return { ok: false, why: clicked };
    /* Wait for the TABLE, not for a fixed moment. The row is added and the
       table redrawn in the click handler, but under four lanes that work can
       land after a 150 ms pause — and the probe then read a table that had not
       been redrawn yet, reported a refusal with no reason at all, and pressed
       on. A refusal with nothing said is the one thing this audit exists to
       catch, so it must not be able to invent one. */
    let after = await probeRead();
    for (let i = 0; i < 12 && after.rows <= before; i += 1) {
      await wait(110);
      after = await probeRead();
    }
    if (after.rows > before) return { ok: true, rows: after.rows };
    /*
     * Read the FEEDBACK PANEL, not the toast.
     *
     * The toast is cut at 88 characters so it fits on screen; the panel holds
     * the whole sentence, and the whole sentence is where the numbers are.
     * "Keep the object between 21 cm and under about 33 cm from the lens for
     * this mirror" arrived here as "The radius of curvature is larger than
     * the distance to I1. The mirror must stand betw…", which says the bench
     * is unhappy and not one thing about what to do.
     */
    const said = await page.evaluate(() => {
      const box = document.querySelector('#feedback');
      /* The panel is a heading and a body; joined without a separator they
         run together as "No reading takenRead the meters…". */
      const full = box && !box.hidden
        ? [...box.childNodes].map((n) => n.textContent.trim()).filter(Boolean).join(' \u2014 ').replace(/\s+/g, ' ').trim()
        : '';
      const toast = document.querySelector('#toast')?.textContent.trim() || '';
      return full.length > toast.length ? full : toast;
    });
    return { ok: false, why: `refused: ${said || 'no row appeared'}` };
  }


  for (const entry of queue) {
    lane.current = entry.id;
    const before = lane.errors.length;
    const labDeadline = Date.now() + LAB_BUDGET_MS;
    const outOfTime = () => Date.now() > labDeadline;
      const exp = JSON.parse(await readFile(join(root, entry.file), 'utf8'));
      const rep = {
        id: entry.id,
        title: exp.title,
        subject: exp.subject,
        cls: exp.class,
        model: exp.simulation?.model,
        renderer: exp.simulation?.renderer,
        stages: {},
        problems: [],
      };
      const fail = (stage, msg) => { rep.problems.push({ stage, msg }); rep.stages[stage] = 'FAIL'; };
      const pass = (stage, note) => { rep.stages[stage] = note ? `ok (${note})` : 'ok'; };

      /* A hard wall clock around the whole lab. Individual helpers are already
       bounded, but a sweep that can be stalled by one bench is a sweep nobody
       will run — and the stall is itself the finding, so it is reported. */
    let timedOut = false;
    const wallClock = new Promise((resolve) => setTimeout(() => { timedOut = true; resolve('timeout'); }, LAB_BUDGET_MS + 30000));
    const walk = (async () => {
      try {
        /*
         * Open the lab, and give it a second go if it does not come up.
         *
         * Four lanes navigating at the same instant is enough to lose one:
         * the run that reported "did not reach the lab view" for every lab
         * in a four-lab batch passed all of them one lane at a time. A
         * student whose page does not load presses reload, and a probe that
         * reports the lab broken instead is reporting its own impatience.
         */
        let reached = false;
        for (let attempt = 0; attempt < 2 && !reached; attempt += 1) {
          await page.goto(`${BASE}/index.html#/exp/${entry.id}`, { waitUntil: 'domcontentloaded' });
          await wait(attempt ? 1400 : 420);
          reached = await page.evaluate(() => !document.querySelector('#viewLab')?.hidden);
        }
        // A student facing a fifty-second pendulum reaches for the speed
        // control, so the probe does too — and notes whether one was there.
        const hasClock = await page.evaluate(() => {
          const host = document.querySelector('#clock');
          if (!host || host.hidden) return false;
          const fast = [...host.querySelectorAll('.clock-seg button')].pop();
          if (fast) fast.click();
          return true;
        });
        rep.stages.clock = hasClock ? 'speed control present' : 'n/a — nothing to speed up';

        /* ── STAGE 1 · OPEN ─────────────────────────────────────────── */
        const r0 = await probeRead();
        if (r0.labError) { fail('open', 'lab opened into its error boundary'); return; }
        if (!reached) { fail('open', 'did not reach the lab view, even after a reload'); return; }
        pass('open');

        /* ── STAGE 2 · SEE the apparatus ────────────────────────────── */
        const s0 = await probeScene();
        if (!s0) fail('scene', 'no canvas on the bench');
        else if (s0.ink < 0.01) fail('scene', `bench is effectively blank (ink ${(s0.ink * 100).toFixed(1)}%)`);
        else if (s0.colours < 4) fail('scene', `bench has almost no drawn detail (${s0.colours} distinct tones)`);
        else pass('scene', `ink ${(s0.ink * 100).toFixed(0)}%, ${s0.colours} tones`);

        /* ── STAGE 3 · CONTROLS exist and are wired ─────────────────── */
        /* How every option group was set when the lab opened — the
           configuration the experiment's accepted value belongs to. */
        const openingChoice = await page.evaluate(() =>
          [...document.querySelectorAll('#controls .seg, #controls .wiring')].map((g) =>
            [...g.querySelectorAll('button')].findIndex((b) => b.getAttribute('aria-pressed') === 'true')));
        /* And where every slider stood. "Put the bench back the way it
           opened" has to include these: the standard-solution bench was
           restored to its own solute and flask and left with 8.65 g on the
           balance, so the set taken afterwards was a consistent preparation
           of the wrong concentration. */
        const openingSliders = await page.evaluate(() =>
          [...document.querySelectorAll('#controls input[type=range]')].map((el) => el.value));
        const nControls = await page.evaluate((sel) => document.querySelectorAll(sel).length, VARIABLE_WIDGETS);
        if (!nControls) fail('controls', 'the student can change nothing');
        else pass('controls', `${nControls} widgets`);

        /* ── STAGE 4 · CAUSALITY: a control changes the picture or the numbers ── */
        let responded = null;
        for (let i = 0; i < nControls && !responded; i += 1) {
          const pre = await probeScene();
          const preRead = (await probeRead()).readouts;
          const did = await page.evaluate(NUDGE_CONTROL, { idx: i, fraction: 0.82 });
          if (!did || did.kind === 'already') continue;
          await wait(260);
          const post = await probeScene();
          const postRead = (await probeRead()).readouts;
          const sceneMoved = pre && post && (pre.hash !== post.hash);
          const numbersMoved = preRead !== postRead;
          if (sceneMoved || numbersMoved) {
            responded = { control: did.label || did.kind, sceneMoved, numbersMoved };
          }
        }
        if (!nControls) rep.stages.causality = 'n/a';
        else if (!responded) fail('causality', 'no control changes either the apparatus or any readout');
        else if (!responded.sceneMoved) pass('causality', `${responded.control}: numbers only, apparatus does not redraw`);
        else pass('causality', responded.control);

        /* ── STAGE 5 · RECORD readings, each at a different setting ─── */
        const minRows = exp.observationModel?.minRows || 3;
        const want = Math.min(Math.max(minRows, 3), 6);
        await page.evaluate(() => document.querySelector('#clearBtn')?.click());
        await wait(120);
        const refusals = [];
        let got = 0;
        /*
         * Some practicals want a SET of different things — four salts, four
         * components, three forks — and some want ONE thing measured several
         * times. The bench says which, when it refuses: "these readings are of
         * 3 different objects; a mean is a measurement only when every reading
         * is of the same one". A student told that stops changing the specimen
         * and starts the set again, so this does too.
         */
        let mixingRefused = false;
        /* And the opposite lesson. The law of length needs three different
           tuning forks at ONE tension — so the same bench that refuses a set
           taken across two wires demands a set taken across several forks.
           The tray goes back into use when it is asked for. */
        let traySetNeeded = false;
        /* And the opposite of stopSwitches: some procedures need BOTH
           positions of a two-position setting — the shunt out and then in —
           and say so. That request is about the switch itself. */
        let switchSetNeeded = false;
        /* Set once the bench has had to ask for a particular switch position;
           from then on the switches stay where they are. */
        let switchesSettled = false;
        /* What the bench objected to, verbatim. It names the thing that must
           stay fixed — "3 different wires (Steel wire (thin), Brass wire…)" —
           so the group holding those names is the one NOT to cycle when a set
           is wanted after all. The law of length needs different forks on ONE
           wire; both are option groups and only the refusal distinguishes
           them. */
        let mixedWhat = '';
        /* Set when the bench says the READINGS cannot be averaged because a
           continuously-variable setting was moved between them. */
        let freezeSliders = false;
        /* Whether the second mixing complaint has already been acted on. */
        let blamedTwice = false;
        /* Set when the bench has asked for more values of a slider-driven
           quantity: the specimen then stays as it is. */
        let holdTray = false;
        /* The reading number the current set started at, and whether the set
           has already been started again once. Clearing the table is a thing
           a student does at most a couple of times in one practical; a probe
           that does it on every objection sweeps the same corner of the range
           over and over and records the same reading four times. */
        let sweptFrom = 0;
        let restarts = 0;
        /* A value the bench asked the student to stay under, in the units of
           whichever slider it belongs to. */
        let sliderCeiling = null;
        /* Set when the bench says the set stopped before the turning point
           was passed, and which way to go on looking for it: the i-delta
           curve of a prism has to be walked past its minimum on both sides
           before a minimum-deviation reading exists at all. */
        let sweepOutward = null;
        /* Where the OTHER null is, when the bench has more than one and says
           where to look for the one still missing. */
        let nullWindow = null;

        /**
         * Do what the bench just told you, wherever it said it.
         *
         * "Keep the object between 21 cm and under about 33 cm", "at least
         * 26 mL is needed for 8 g" — these are instructions with numbers in
         * them, and a student acts on them whether they arrive in the
         * still-needed line or in the refusal that comes back from pressing
         * Record. Only the first was read, so a bench that said exactly what
         * to do while refusing a reading was refused three times over.
         */
        /**
         * When a refusal names a control, answer it with that control.
         *
         * "Read the meters, decide what is wrong with this board, and select
         * that DIAGNOSIS before recording it" is an instruction about one
         * picker, and the probe had frozen every picker because an earlier
         * refusal said a SET must not mix specimens. Those are different
         * objections: one says stop changing the specimen, the other says
         * this control has not been set at all.
         */
        /* "The first resonance is recorded at 29.0 cm. Now lower the water
           level further, past the quiet stretch, until the note is loud again
           — the second resonance is near three times the first." A bench with
           two nulls has to be able to say which one is still missing, and the
           hunt has to be told, or it bisects its way back to the one already
           recorded. */
        const windowFrom = (text) => {
          const m = String(text || '').match(/recorded at\s+([\d.]+)\s*(?:cm|mm)\b[\s\S]*?near (three times|a third)/i);
          if (!m) return null;
          const at = Number(m[1]);
          return /three times/i.test(m[2])
            ? { lo: at * 2.1, hi: at * 4 }
            : { lo: at / 4, hi: at / 2.1 };
        };

        const answerNamedControl = async (text) => {
          if (!text) return false;
          /* Never in answer to a complaint ABOUT a control. "These readings
             are of 3 different specimens (Crown glass slab, Flint glass
             slab…)" contains the word "specimens", which matched the specimen
             picker's own label — so the probe answered "stop changing the
             specimen" by changing the specimen. */
          const complainsAboutMixing = /these readings are of \d+ different|were taken (?:on|at|with) \d+ different|are at \d+ different|cannot be averaged|one .* at a time|its own set/i.test(text);
          const asksForASet = /only \d+ different|work through at least|at least (?:two|three|four|\d+) different/i.test(text);
          if (complainsAboutMixing && !asksForASet) return false;
          return page.evaluate((said) => {
            const lower = said.toLowerCase();
            /* Never an ASSEMBLY control. "The meters have not settled" contains
               the word "meter", which matched the circuit-assembly bench's
               "Meter polarity" picker and turned the meters round — the probe
               answering a complaint about settling by miswiring the circuit. */
            /* The BEST-named control, not the first one whose label happens
               to share a word. "There is nothing in the left pan, so the
               weights in the right one carry the beam hard over. A balance
               compares two pans… put the body on the pan" names the body
               switch; it also contains the word "balance", which is the label
               of the balance-type picker, and that picker came first in the
               panel. So the probe answered "put the body back" by swapping
               the balance. Candidates are scored by how much of their name
               the bench actually said, and a switch wins a tie, because a
               state the bench describes is a switch far more often than it is
               a choice of apparatus. */
            const candidates = [];
            for (const ctl of document.querySelectorAll('#controls .ctl:not([data-group="setup"])')) {
              const name = (ctl.querySelector('label')?.textContent || '').trim();
              /* Match on any substantial word of the control's name, not the
                 whole of it: the picker is labelled "Your diagnosis" and the
                 refusal says "select that diagnosis". */
              /* Switch labels are short — "Body on the pan", "Lid on" — so a
                 five-letter floor never matches one. Four is enough for them
                 and still well clear of "the" and "on". */
              const floor = ctl.querySelector('.sw') ? 4 : 5;
              const words = name.toLowerCase().replace(/\(.*\)/, '')
                .split(/[^a-z\u00e9]+/).filter((x) => x.length >= floor);
              const hits = words.filter((x) => lower.includes(x)).length;
              if (!hits) continue;
              candidates.push({ ctl, hits, isSwitch: Boolean(ctl.querySelector('.sw')) });
            }
            candidates.sort((a, b) => (b.hits - a.hits) || (Number(b.isSwitch) - Number(a.isSwitch)));

            for (const { ctl } of candidates) {
              /* A named SWITCH is answered by throwing it. "There is no body
                 on the left pan, so there is nothing for the weights to
                 balance — put the body on the pan first" names the switch
                 that was turned off, and every null hunt after that was
                 looking for a balance point that does not exist. */
              const sw = ctl.querySelector('.sw');
              if (sw) {
                const on = sw.getAttribute('aria-checked') === 'true';
                const wantsOn = !/\b(off|remove|take .* off|without)\b/i.test(lower);
                if (on !== wantsOn) { sw.click(); return 'switch'; }
                continue;
              }
              const btns = [...ctl.querySelectorAll('button')];
              if (btns.length < 2) continue;
              /* "Not yet" is not a choice a student makes; it is the absence
                 of one, and the bench is asking for a choice. */
              const blank = (b) => /^(not yet|none|—|-|no |undecided)/i.test(b.textContent.trim());
              const at = btns.findIndex((b) => b.getAttribute('aria-pressed') === 'true');
              for (let step = 1; step <= btns.length; step += 1) {
                const next = btns[(at + step + btns.length) % btns.length];
                if (!next || next === btns[at] || blank(next)) continue;
                next.click();
                return true;
              }
            }
            return false;
          }, text);
        };

        /**
         * Is the thing the bench is complaining about a SLIDER?
         *
         * A second mixing refusal was read as "the slider is the problem",
         * but the prism bench objects twice about two different PICKERS —
         * three prisms, then three lines of the spectrum — and freezing the
         * sliders there pinned the angle of incidence, so no set ever
         * straddled the minimum and the minimum-deviation reading could not
         * be taken at all. Only a complaint that names a slider's own
         * quantity is about a slider.
         */
        const namesASlider = async (text) => {
          if (!text) return false;
          /* Said in so many words, whatever the bench happens to call the
             slider: "the legs were set to three different separations". */
          if (/\bdifferent (?:settings|separations|positions|distances|lengths|loads|volumes|temperatures|currents|voltages)\b/i
            .test(text)) return true;
          return page.evaluate((said) => {
            const lower = said.toLowerCase();
            for (const ctl of document.querySelectorAll('#controls .ctl:not([data-group="setup"])')) {
              if (!ctl.querySelector('input[type=range]')) continue;
              /* Four letters, not five: sliders are labelled "Load", "Mass",
                 "Span". "Record at least four different loads" names the Load
                 slider, and a five-letter floor missed it — so the request was
                 read as a request for four different SPRINGS, the tray went
                 back into use, and the bench was given four loads on four
                 springs. The plural is allowed for, since the bench says
                 "loads" where the label says "Load". */
              const words = (ctl.querySelector('label')?.textContent || '').toLowerCase()
                .replace(/\(.*\)/, '').split(/[^a-z\u00e9]+/).filter((x) => x.length >= 4);
              if (words.some((x) => lower.includes(x))) return true;
            }
            return false;
          }, text);
        };

        const obeyStatedLimits = async (text) => {
          if (!text) return;
          const floor = text.match(/\bat least\s+(?:about\s+)?([\d.]+)\s*(?:mL|ml|g|cm|mm|V|A|°C)/i);
          if (floor) {
            await page.evaluate((v) => {
              const el = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')]
                .find((x) => v > Number(x.min) && v <= Number(x.max));
              if (!el) return;
              const step = Number(el.step) || 1;
              el.value = String(Math.min(Number(el.max), Math.ceil((Number(v) * 1.15) / step) * step));
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }, Number(floor[1]));
            budget = Math.min(16, budget + 2);
          }
          const cap = text.match(/\b(?:under|below|less than)\s+(?:about\s+)?([\d.]+)/i);
          if (cap) {
            const value = Number(cap[1]);
            const which = await page.evaluate((v) => {
              const sliders = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')];
              const i = sliders.findIndex((x) => v > Number(x.min) && v <= Number(x.max));
              if (i < 0) return null;
              /* Come back inside the stated range at once, rather than waiting
                 for the next reading to sweep there. */
              const el = sliders[i];
              const step = Number(el.step) || 1;
              if (Number(el.value) >= v) {
                el.value = String(Math.max(Number(el.min), Math.floor((v * 0.9) / step) * step));
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
              return i;
            }, value);
            if (which === 0) sliderCeiling = value;
            if (which !== null) budget = Math.min(16, budget + 1);
          }
        };
        /* How long to let a process run between readings, once a bench has
           said its readings must be spread over time. */
        /*
         * A cooling curve, a dialysis run, a clock reaction: the x-axis is
         * TIME, so the readings have to be taken as the process runs, not as
         * fast as the Record button can be pressed. Eight readings hammered
         * out in thirteen seconds of model time span less than the
         * thermometer can resolve, and the bench says so — rightly, and after
         * the fact. A student watching a clock paces themselves from the
         * start, so this does too.
         */
        const timeAxis = /^(timeS|timeMin|time|elapsed|tMin|tS)$/i.test(String(exp.observationModel?.graph?.x || ''));
        let paceBetweenReadings = timeAxis ? 2500 : 0;
        let slowestWait = 0;
        let hunted = 0;
        let nulled = 0;
        nulledControl = null;
        nulledWidget = null;
        let budget = want;
        const isTitration = exp.simulation?.model === 'titration';
        for (let k = 0; k < budget && !outOfTime(); k += 1) {
          // move the first responsive control across its range between readings,
          // exactly as a student varies the independent variable
          if (nControls) {
            /*
             * Work through the apparatus settings, not just the sliders.
             * "Record at least four different salts", "test four components
             * both ways", "three different tuning forks" — for those labs the
             * thing that has to change between readings is WHICH specimen is
             * on the bench, and nudging the first slider four times takes one
             * reading four times over.
             */
            await page.evaluate(({ idx, stop, stopSwitches, objected }) => {
              // The tray, not the first switch on the panel: take the group
              // with the most choices in it, which is the specimen selector.
              let groups = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) .seg, #controls .ctl:not([data-group="setup"]) .wiring')]
                .map((g) => [...g.querySelectorAll('button')])
                .filter((b) => b.length >= 2);
              if (objected) {
                // Leave alone whichever group the bench named.
                const blamed = groups.filter((btns) =>
                  btns.some((b) => objected.includes(b.textContent.trim()) && b.textContent.trim().length > 2));
                if (blamed.length && blamed.length < groups.length) {
                  groups = groups.filter((g) => !blamed.includes(g));
                }
              }
              groups.sort((a, b) => b.length - a.length);
              /* A switch is a two-position setting like any other — the shunt
                 in or out, the balance tared or not — and half-deflection
                 needs a reading in each position. */
              /*
               * A request for a SET is about specimens, not conditions.
               *
               * "Record the rise in at least three different tubes" puts the
               * tray back into use — and had been putting the switches back
               * into use with it, so the capillary bench went on alternating
               * clean and greasy tubes after being told that a set cannot mix
               * them. Once a mixed set has been refused the switches stay
               * where they are, whatever else is asked for.
               */
              if (!stopSwitches) {
                for (const sw of document.querySelectorAll('#controls .ctl:not([data-group="setup"]) .sw')) {
                  const on = sw.getAttribute('aria-checked') === 'true';
                  if (on !== (idx % 2 === 1)) sw.click();
                }
              }
              if (!groups.length || (stop && !groups.length)) return;
              if (!stop) {
              // The tray first, then the second setting at a slower rate, so
              // the pair is actually swept: four components BOTH ways round
              // needs component and direction to advance together.
                /* Skip an "answer not given" option when working through a
                   picker: a diagnosis of "Not yet" is not a diagnosis. */
                const first = groups[0];
                const blankOpt = (b) => /^(not yet|none|\u2014|-|no |undecided)/i.test(b.textContent.trim());
                const usable = first.filter((b) => !blankOpt(b));
                const pool = usable.length ? usable : first;
                pool[idx % pool.length].click();
              }
              /* And alternate the SMALLEST group every reading. The two-phase
                 procedures turn on a two-position setting — DC then AC, shunt
                 out then in — and cycling only the big trays never reaches
                 them. */
              const last = groups[groups.length - 1];
              if (last && last !== groups[0] && !stop) last[idx % last.length].click();
              /* A titration is repeated under the SAME conditions until two
                 titres agree, so the flask and the burette keep their
                 contents: cycling the analyte and titrant pickers between
                 titres gave 20.6 mL and 14.1 mL and a bench that rightly
                 said they do not agree. */
            }, { idx: k, stop: isTitration || holdTray || (mixingRefused && !traySetNeeded), stopSwitches: isTitration || switchesSettled || (mixingRefused && !switchSetNeeded), objected: mixedWhat });
            /* Then move a SLIDER — never another button, because the
               buttons are the specimen tray and pressing one of those would
               put the specimen just chosen straight back. */
            /* A cleared table is a set started again, and the sweep starts
               again with it. Counting on from where the abandoned set left
               off spent the whole remaining budget in one corner of the
               range: the prism recorded five readings at two angles, both of
               them ends of the travel, and the minimum deviation cannot be
               seen from there. */
            const frac = 0.15 + (0.7 * Math.max(0, k - sweptFrom)) / want;
            if (sweepOutward) sweepOutward.n += 1;
            /* A titration is repeated under the SAME conditions until two
               titres agree — that is what concordance means. Varying the
               pipetted volume or the standard's strength between titres does
               not give a better mean, it gives three measurements of three
               different things. */
            const railed = k > 0 && !freezeSliders && !isTitration && await page.evaluate(({ f, cap, out, skip }) => {
              const sliders = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')];
              /* Never the control that holds the null. The reading is taken AT
                 the balance point, so on these benches the student varies
                 something else — the resistance in the box, the load in the
                 pan, the fork — and brings this one back to balance. */
              const pick = sliders.findIndex((_, i) => i !== skip);
              const el = pick < 0 ? sliders[0] : sliders[pick];
              if (!el) return;
              const min = Number(el.min); const step = Number(el.step) || 1;
              /* Walking past the turning point: step away from the edge the
                 bench named, in strides big enough to leave the ground the
                 set already covers. */
              if (out) {
                const span = Number(el.max) - min;
                const base = Number.isFinite(out.from) && out.from !== null ? out.from : Number(el.value);
                const stride = Math.max(step, Math.round((span * 0.09) / step) * step);
                const to = Math.min(Number(el.max), Math.max(min, base + out.dir * stride * out.n));
                const settled = Math.round((to - min) / step) * step + min;
                const stuck = Number(el.value) === settled;
                el.value = String(settled);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                /* The end of the travel: walking further is the same reading
                   again, so say so and let the ordinary sweep take over. */
                return stuck;
              }
              /* A bench that names a ceiling is obeyed. "Keep the load under
                 about 5.6 kg for this wire" is the whole instruction, and a
                 sweep that runs the slider to 10 kg regardless throws seven
                 readings out of ten past the elastic limit and then asks why
                 there are not four good ones. */
              const ceiling = Number.isFinite(cap) && cap > min && cap <= Number(el.max) ? cap : Number(el.max);
              const want2 = min + (ceiling - min) * f;
              el.value = String(Math.round((want2 - min) / step) * step + min);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              return false;
            }, { f: frac, cap: sliderCeiling, out: sweepOutward, skip: nulledControl });
            if (railed) sweepOutward = null;
            /* Wait for the BENCH to show the new setting, not for a fixed
               fifth of a second. The control prints its own live value beside
               its label, and under four lanes that redraw can land after the
               pause — so Record was pressed while the bench still held the
               previous load, two readings came out identical, and the bench
               asked, rightly, for readings that differ. These labs passed one
               at a time and failed in a sweep. */
            await page.evaluate(async () => {
              const frame = () => new Promise((r) => {
                requestAnimationFrame(() => requestAnimationFrame(() => r()));
              });
              const sliders = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')];
              const shown = () => sliders.map((el) => (document.getElementById(`${el.id}_v`)?.textContent || '').trim()).join('|');
              const t0 = Date.now();
              let last = null;
              while (Date.now() - t0 < 900) {
                await frame();
                const now = shown();
                if (now === last) return;
                last = now;
              }
            }).catch(() => {});
            await wait(120);
          }
          if (paceBetweenReadings) await wait(paceBetweenReadings);
          if (TRACE) {
            const at = await page.evaluate(() => [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')]
              .map((x) => x.value).join('/'));
            console.log(`   [${exp.id}] reading ${k + 1}/${budget} sliders=${at}`);
          }
          /*
           * On a timed experiment the clock is started ONCE and the readings
           * are taken as it runs. Pressing Start before every reading puts it
           * back to zero — which the bench now says out loud — and turns a
           * cooling curve into eight readings at the same instant.
           */
          const run = isTitration ? await titrateToEndPoint(labDeadline)
            : (timeAxis && k > 0) ? { started: 'already running', waitedMs: 0 }
              : await runProcessAndWait(Math.max(2000, Math.min(34000, labDeadline - Date.now())));
          slowestWait = Math.max(slowestWait, run.waitedMs || 0);
          // A process that costs the student half a minute per reading is not
          // repeated six times here; the point is already made by three.
          if (k === 0 && run.waitedMs > 8000) budget = Math.min(budget, 3);
          let t = await takeReading();
          if (!t.ok) {
            const firstRefusal = t.why;
            if (TRACE) console.log(`      refused: ${String(t.why || '').slice(0, 150)}`);
            // First do what the instrument itself tells you to do.
            /* A bench with more than one null says where the next one is —
               "the second resonance is near three times the first" — and the
               search has to be told, or it bisects its way back to the null it
               already has. */
            const window = windowFrom(t.why) || nullWindow;
            /* While hunting the OTHER null of the same standing wave, the
               apparatus stays as it is. The tube found its first resonance
               with the 288 Hz fork and its second with the 320 Hz one,
               because the tray went on cycling between readings — two
               different wavelengths, and v = 2f(l2 - l1) means nothing across
               them. */
            if (window) mixingRefused = true;
            const homed = await homeInOnNull(nControls, Math.max(1000, Math.min(20000, labDeadline - Date.now())), window);
            if (TRACE) console.log(`      homeInOnNull -> ${homed}; indicator now "${(await page.evaluate(NULL_PROBE))?.text || 'none'}"`);
            if (homed) { nulled += 1; t = await takeReading(); }
            /*
             * Then act on what the refusal SAYS — a limit with a number in
             * it, or a control it names. This has to come after the null
             * hunt, not before: a null refusal ("the jaws are pressing into
             * the object — open them a little") names the instrument, and
             * answering it by changing the instrument swapped the callipers
             * mid-hunt on seven benches whose whole task is to find a null.
             */
            if (!t.ok && !/[\u25b8\u25c2\u25cf]/.test(String(t.why))) {
              await obeyStatedLimits(t.why);
              const answered = await answerNamedControl(t.why);
              /* A switch the bench had to ask for is not a condition to
                 alternate any more. The balance's body was being lifted off
                 the pan every other reading, and no weight box can balance an
                 empty pan. */
              if (answered === 'switch') switchesSettled = true;
              if (answered) await wait(260);
              await wait(200);
              t = await takeReading();
            }
            if (!t.ok) t = await huntForReading(nControls, 5, k, labDeadline, mixingRefused && !traySetNeeded);
            if (t.ok) hunted += 1; else refusals.push(firstRefusal);
          }
          if (t.ok) got = t.rows;
          await wait(80);

          /*
           * Read the bench's own "still needed" line and carry on while it is
           * asking for more, which is what a student does. Some practicals
           * need a set rather than a count — four components tested both ways
           * round is eight readings — and the number is not in the JSON, it is
           * in what the calculation says it is missing.
           */
          const asking = await page.evaluate(() =>
            (document.querySelector('#stillNeeded:not([hidden])')?.textContent || ''));
          /* A bench that wants readings SPREAD OVER TIME is telling the probe
             to stop hammering Record: let the process run between readings,
             the way a student watches a clock and writes down a temperature
             every half minute. */
          /* "roughly 4 more readings before the plateau begins" is an
             instruction to keep going, and the number says how far. */
          const moreAsked = asking.match(/roughly (\d+) more reading/i);
          if (moreAsked) budget = Math.min(24, budget + Number(moreAsked[1]) + 2);
          if (/keep recording|record more often|until the temperature stops falling/i.test(asking)) {
            budget = Math.min(24, Math.max(budget, got + 4));
          }
          if (/same instant|spread over time|several TIMES|every half minute|span only/i.test(asking)) {
            paceBetweenReadings = Math.max(paceBetweenReadings, 3000);
            budget = Math.min(16, budget + 2);
          }

          /* "Keep the load under about 5.6 kg", "stay below 40 °C": a ceiling
             the bench states is part of the method, so it is read off the
             refusal and applied to the slider it fits. */
          await obeyStatedLimits(asking);
          /* The bench asks for the other resonance in the still-needed line,
             not in the refusal, so that is where to read it from. */
          if (!nullWindow && windowFrom(asking)) {
            nullWindow = windowFrom(asking);
            /* Both positions of one standing wave are found with one fork.
               The tray was advancing between them, so l₁ came from the 288 Hz
               fork and l₂ from the 320 Hz one — two wavelengths, and
               v = 2f(l₂ − l₁) means nothing across them. */
            mixingRefused = true;
          }
          /* "The smallest deviation in this set is at the very first angle of
             incidence (49 deg), so the readings do not straddle the minimum
             ... take more readings at smaller angles until the deviation is
             seen to rise again on both sides." That is a direction, not a
             limit, and the sweep has to leave the range it has been covering
             rather than divide it more finely. */
          const straddle = /do not straddle|straddle the (?:minimum|maximum)|rise again on both sides|still falling when they stop/i.test(asking)
            && asking.match(/\bat (smaller|larger) (?:angles|values|settings)/i);
          if (straddle) {
            const edge = asking.match(/\(([\d.]+)\s*(?:\u00b0|deg)/);
            sweepOutward = {
              dir: straddle[1].toLowerCase() === 'smaller' ? -1 : 1,
              from: edge ? Number(edge[1]) : null,
              n: 0,
            };
            budget = Math.min(16, budget + want);
            /* The readings already taken are on the right side of the turning
               point and are worth keeping; only the sweep changes. */
            continue;
          }

          /* And the bench may ask for a RANGE after the set has been made
             consistent — "vary the supply so the current climbs" — which is
             the opposite instruction to the one that froze the sliders. */
          /* A COMPLAINT that the set mixes things, not a REQUEST for more of
             them. "Only 1 different iodide concentration in the table, time
             the clock at four or more" says to vary the very thing the
             complaint form says to hold still, and reading it as a complaint
             froze the slider at one concentration and cleared the table after
             every reading. */
          const mixedSetAgain = (/\b(?:these readings are of )?\d+ different [a-z]+/i.test(asking)
            || /\bdifferent (objects|wires|liquids|specimens|solutions|separations|settings)\b|its own set|one liquid per|one wire at a time|cannot be averaged/i.test(asking))
            && !/only \d+ different|at least (?:two|three|four|\d+) different|four or more|work through at least/i.test(asking);
          if (freezeSliders
              && ((!mixedSetAgain
                   && /\bvary\b|across the range|spread|climbs|at several points|lower the (?:water )?level|raise the (?:water )?level|until .* again|near three times|near a third|further/i.test(asking))
                  /* "Only 1 different iodide concentration in the table. Time
                     the clock at four or more" asks for a RANGE of a
                     slider-driven quantity, which is the opposite instruction
                     to the one that froze the sliders — and it can arrive in
                     the same breath as a complaint about something else. */
                  || (/only \d+ different|at least (?:two|three|four|\d+) different|four or more/i.test(asking)
                      && await namesASlider(asking)))) {
            freezeSliders = false;
            budget = Math.min(16, budget + 2);
          }
          /*
           * The bench is asking for a SET, and it can ask without ever having
           * objected to a mixed one. "Only 1 different board examined — each
           * board carries a different fault, work through at least three of
           * them" is that request, and it was only listened to after a mixing
           * refusal had first frozen the tray.
           */
          /* A request that names the two positions of a switch un-freezes
             that switch, and only that: "record the deflection with the shunt
             disconnected first" is half of the half-deflection method. */
          if (!switchSetNeeded
              && /with and without|in each position|shunt (dis)?connected|both positions|first without/i.test(asking)) {
            switchSetNeeded = true;
            budget = Math.min(16, budget + 2);
          }
          /* "These readings are of 3 different specimens" is a COMPLAINT
             about the tray, and it was being read as a request for a set from
             it — so the bench that had just said stop changing the slab was
             answered by changing the slab. Only a request puts the tray back
             into use. */
          const asksForASetNow = (/only \d+ different|work through at least|at least (?:two|three|four|\d+) different|both direction|with and without|in each position/i.test(asking)
            || (/different (tuning forks|tubes|salts|boards|components|specimens|solutions|arrangements)/i.test(asking)
                && !/these readings are of \d+ different|were taken (?:on|at|with) \d+ different/i.test(asking)))
            /* …of SPECIMENS, not of readings. "Record at least four different
               loads" asks for four settings of a slider, and reading it as a
               request for four springs put the tray back into use: the probe
               changed the spring between every load, the bench rightly
               refused the mixed set, and the table was cleared down to a
               couple of readings of the same thing. */
            && !(await namesASlider(asking));
          /* And when what it wants more of IS slider-driven — "record at least
             four different loads" — the specimen stays put while the slider
             does the work. The tray cycles by default, so without this the
             probe answered a request for four loads by putting each one on a
             different spring. */
          if (!holdTray
              && /only \d+ different|at least (?:two|three|four|\d+) different|four or more|record at least/i.test(asking)
              && await namesASlider(asking)) {
            holdTray = true;
          }
          if (traySetNeeded && asksForASetNow) {
            /* Still asking. "Only 2 different boards examined, work through at
               least three of them" needs the BOARD picker advanced again, and
               the ordinary cycling advances the largest tray instead — which
               on that bench is the diagnosis list. */
            if (await answerNamedControl(asking) === 'switch') switchesSettled = true;
          }
          if (!traySetNeeded && asksForASetNow) {
            // Now it wants a set after all: put the tray back into use, and
            // advance the picker it actually named — "work through at least
            // three BOARDS" is about the board tray, not whichever tray
            // happens to have the most buttons on it.
            traySetNeeded = true;
            if (await answerNamedControl(asking) === 'switch') switchesSettled = true;
            budget = Math.min(16, budget + want);
            continue;
          }
          /*
           * The bench objects to a SET rather than to a reading. Two shapes of
           * that objection exist and they want different things stopped:
           * "these are three different wires" means stop changing the
           * specimen, and "the legs were set to three different separations"
           * means stop moving the slider. The second was not recognised at
           * all, so the spherometer was swept across its leg separation for
           * every reading and then told, correctly, that a sagitta measured
           * at 30 mm and one measured at 50 mm have no mean.
           */
          /* The benches all phrase it the same way — "these readings are of 3
             different galvanometers (…)" — so match the shape rather than
             keeping a list of nouns that is one experiment out of date. */
          if (mixingRefused && mixedSetAgain && !freezeSliders) {
            // Objected to twice. If the second objection names a PICKER the
            // first one did not, that picker is the problem and the sliders
            // are not: add it to the list of groups left alone and start the
            // set again.
            if (!(await namesASlider(asking))) {
              /* ONCE. Clearing the table is how a student starts the set
                 again, and a bench that goes on saying the same thing was
                 having its table cleared after every single reading — so it
                 never held more than the one reading just taken, and the
                 bench went on asking for more of them for the whole budget.
                 The second blame is recorded either way, so the tray it names
                 stops being cycled. */
              mixedWhat = `${mixedWhat}\n${asking}`;
              if (!blamedTwice) {
                blamedTwice = true;
                budget = Math.min(16, budget + want);
                await page.evaluate(() => document.querySelector('#clearBtn')?.click());
                if (restarts < 2) { restarts += 1; sweptFrom = k + 1; }
                await wait(200);
                continue;
              }
            }
            // The quantity being swept is the problem.
            freezeSliders = true;
            budget = Math.min(16, budget + want);
            await page.evaluate((sliders) => {
              [...document.querySelectorAll('#controls input[type=range]')].forEach((el, i) => {
                if (sliders[i] === undefined) return;
                el.value = sliders[i];
                el.dispatchEvent(new Event('input', { bubbles: true }));
              });
              document.querySelector('#clearBtn')?.click();
            }, openingSliders);
            if (restarts < 2) { restarts += 1; sweptFrom = k + 1; }
            await wait(200);
            continue;
          }
          if (!mixingRefused && mixedSetAgain) {
            mixingRefused = true;
            mixedWhat = asking;
            /*
             * Stop changing the SPECIMEN, and go on varying the quantity.
             *
             * Almost every one of these benches wants a set taken on one
             * specimen at several settings of a slider: three weighings of
             * one body, four loads on one wire, a cooling curve at one
             * volume. Freezing everything at the first objection turned all
             * of those into one reading taken four times, and the bench then
             * asked, rightly, for readings that differ. So the tray stops
             * and the slider carries on; only a SECOND objection — which
             * means the slider was the thing being complained about, as with
             * the spherometer's leg separation or the mass on the balance —
             * freezes that too.
             */
            /* Put the bench back the way it opened before starting again:
               measuring the brass cylinder and comparing it against the steel
               sphere's accepted diameter is a different wrong answer, not a
               right one. */
            await page.evaluate(({ choice, sliders }) => {
              [...document.querySelectorAll('#controls .seg, #controls .wiring')].forEach((g, i) => {
                const btns = [...g.querySelectorAll('button')];
                const want = choice[i];
                if (!(want >= 0) || !btns[want]) return;
                /* Putting the bench back the way it opened must not put an
                   ANSWER back to "not given". The fault-finding bench opens
                   with its diagnosis picker on "Not yet", and restoring that
                   left the probe unable to record anything ever again. */
                if (/^(not yet|none|\u2014|-|no |undecided)/i.test(btns[want].textContent.trim())) return;
                btns[want].click();
              });
              [...document.querySelectorAll('#controls input[type=range]')].forEach((el, i) => {
                if (sliders[i] === undefined) return;
                el.value = sliders[i];
                el.dispatchEvent(new Event('input', { bubbles: true }));
              });
              document.querySelector('#clearBtn')?.click();
            }, { choice: openingChoice, sliders: openingSliders });
            if (restarts < 2) { restarts += 1; sweptFrom = k + 1; }
            await wait(200);
            got = 0;
            budget = Math.min(14, budget + want);
            continue;
          }
          if (k === budget - 1 && budget < 12 && !outOfTime()) {
            if (/at least|work through|both direction|different/i.test(asking)) budget += 2;
          }
        }
        rep.slowestWaitMs = slowestWait;
        if (slowestWait > 15000 && !hasClock) {
          rep.problems.push({ stage: 'pace', msg: `${(slowestWait / 1000).toFixed(0)} s of real waiting per reading, with no way to speed the clock up` });
        }
        if (!got) fail('record', `no reading could be taken in ${want} attempts — ${refusals.slice(0, 2).join('; ')}`);
        else if (got < 2) fail('record', `only ${got} reading of ${want} attempts entered the table — ${refusals.slice(0, 2).join('; ')}`);
        else pass('record', `${got}/${want} readings`);

        /* rows must actually differ — a table of identical rows plots nothing */
        if (got >= 2) {
          const distinct = await page.evaluate(() => {
            const rows = [...document.querySelectorAll('#tbody tr')].map((tr) =>
              [...tr.querySelectorAll('td')].slice(1, -1).map((td) => td.textContent.trim()).join('|'));
            return new Set(rows).size;
          });
          if (distinct < 2) fail('vary', 'every recorded reading is identical — the independent variable is not reaching the model');
          else pass('vary', `${distinct} distinct rows`);
        }

        /* ── STAGE 6 · GRAPH is drawn from those rows ───────────────── */
        const rg = await probeRead();
        if (rg.graphHidden) pass('graph', 'declared graph-less');
        else if (!rg.graphPts && got >= 2) fail('graph', `${got} readings recorded but the graph plots nothing`);
        else pass('graph', `${rg.graphPts} points`);

        /* ── STAGE 7 · CALCULATE a result ───────────────────────────── */
        await page.evaluate(() => document.querySelector('#aCalc')?.click());
        await wait(320);
        const rr = await probeRead();
        const refusedResult = /^Not enough to calculate/.test(rr.result);
        if (refusedResult) fail('result', `refused: ${rr.result.replace(/\s+/g, ' ').slice(0, 170)}`);
        if (refusedResult && TRACE) {
          /* What the bench was actually looking at when it refused. Working
             out which readings a refusal is about by reasoning backwards from
             the sweep arithmetic is guesswork; the table is right there. */
          const table = await page.evaluate(() => [...document.querySelectorAll('#tbody tr')]
            .map((tr) => [...tr.children].map((td) => td.textContent.trim()).join(' ')).join(' ⏎ '));
          console.log(`      table: ${table.slice(0, 600)}`);
        }
        else if (!rr.result || /Take readings, then calculate/.test(rr.result)) fail('result', 'Calculate produced nothing');
        else pass('result', rr.result.replace(/\s+/g, ' ').slice(0, 80));

        /* The result panel is assembled from fields the model returns. When a
           template reads one the model never produces, the student is shown
           the literal word "undefined" — a number that is not a number, in the
           one panel that is supposed to be the answer. */
        /* "null" is also an English word, and the optics panels use it as one:
           "at the null position the converging beam retraces its own path" is
           a sentence, not a leaked field. So it counts only where a VALUE
           belongs — after an equals sign or a bracket, or in front of a unit. */
        const junk = rr.result.match(/\b(undefined|NaN|Infinity|\[object Object\])\b/)
          || rr.result.match(/(?:[=(:·]\s*)(null)\b/)
          || rr.result.match(/\b(null)\s*(?:cm|mm|µm|m|kg|g|mg|s|min|V|mV|A|mA|µA|Ω|K|J|N|Hz|%|°)\b/);
        if (junk) fail('panel', `the result panel prints "${junk[1]}" — a field the model does not return`);
        rep.resultText = rr.result.replace(/\s+/g, ' ').slice(0, 300);

        /* ── STAGE 8 · does the result agree with the accepted value? ──
           The deepest question of all: a lab that computes a confident, precise,
           WRONG number is more damaging than one that refuses to compute. */
        if (!refusedResult && rr.result) {
          const flat = rr.result.replace(/\s+/g, ' ');
          const off = flat.match(/differs from the accepted [^\s]+ ?[^\s]* by (-?[\d.]+)%/);
          if (off) {
            const pct = Math.abs(Number(off[1]));
            /* A shortfall the bench ACCOUNTS FOR is the lesson, not a defect.
               A preparation cooled fast and left unacidified genuinely gives a
               poor yield, and this bench says which step cost what — that is
               the whole point of the practical, and marking it as a wrong
               answer would be marking the experiment for working. */
            const explained = /rapid cooling|not acidified|trap mother liquor|stays dissolved|left in the light|hydrolysed|was not (?:washed|dried)/i.test(flat)
              || /than the calculation asks for|only standard if the mass is right|was not transferred|not made up to the mark/i.test(flat);
            if (pct > 25 && !explained) fail('accuracy', `result is ${pct.toFixed(0)}% away from the accepted value`);
            else if (pct > 25) rep.stages.accuracy = `off by ${pct.toFixed(0)}%, and the bench says which step cost it`;
            else rep.stages.accuracy = `off by ${pct.toFixed(1)}%`;
          } else if (/Within the accepted range/.test(flat)) {
            rep.stages.accuracy = 'within accepted range';
          } else {
            rep.stages.accuracy = 'no accepted value declared';
          }
        }

        if (outOfTime()) {
          rep.problems.push({ stage: 'budget', msg: `could not be completed within ${(LAB_BUDGET_MS / 1000).toFixed(0)} s` });
        }
        if (shotDir) await page.screenshot({ path: join(shotDir, `${entry.id}.png`) });
      } catch (err) {
        fail('crash', String(err?.message || err).slice(0, 200));
      }
    })();
    await Promise.race([walk, wallClock]);
    if (timedOut) {
      rep.problems.push({ stage: 'budget', msg: `did not finish within ${((LAB_BUDGET_MS + 30000) / 1000).toFixed(0)} s` });
    }

      const newErrors = lane.errors.slice(before);
      if (newErrors.length) {
        rep.problems.push({ stage: 'console', msg: newErrors.slice(0, 3).map((e) => e.split('|').slice(1).join(' ')).join(' ⏎ ') });
      }
      reports.push(rep);
      const bad = rep.problems.length;
      onDone(rep);
    }

}

/* ── drive the lanes ──
   Experiments are dealt round-robin rather than in contiguous blocks, so one
   lane does not end up with every slow thermochemistry lab while another
   finishes its callipers in seconds. */
const reports = [];
let finished = 0;
const onDone = (rep) => {
  finished += 1;
  const mark = rep.problems.length ? '✗' : '✓';
  const tail = rep.problems.length ? `  ${rep.problems.map((p) => p.stage).join(',')}` : '';
  process.stdout.write(`[${String(finished).padStart(3)}/${targets.length}] ${mark} ${rep.id}${tail}\n`);
};

const queues = Array.from({ length: LANES }, () => []);
targets.forEach((entry, i) => queues[i % LANES].push(entry));
const lanes = await Promise.all(queues.map(() => openLane()));
await Promise.all(lanes.map((lane, i) => runLane(lane, queues[i], reports, onDone)));
reports.sort((a, b) => a.id.localeCompare(b.id));

await browser.close();
stopServer();

/* ── report ── */
const broken = reports.filter((r) => r.problems.length);
console.log(`\n${'═'.repeat(78)}`);
console.log(`STUDENT JOURNEY: ${reports.length - broken.length}/${reports.length} labs complete end to end`);
console.log('═'.repeat(78));

const byStage = new Map();
for (const r of broken) for (const p of r.problems) {
  if (!byStage.has(p.stage)) byStage.set(p.stage, []);
  byStage.get(p.stage).push(r);
}
for (const [stage, list] of [...byStage].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n── ${stage.toUpperCase()} · ${list.length} lab(s) ──`);
  for (const r of list) {
    const msg = r.problems.filter((p) => p.stage === stage).map((p) => p.msg).join(' / ');
    console.log(`   ${r.id.padEnd(30)} ${r.model || '?'}`);
    console.log(`      ${msg}`);
  }
}

if (jsonOut) {
  await writeFile(jsonOut, JSON.stringify(reports, null, 2));
  console.log(`\nfull report → ${jsonOut}`);
}
process.exitCode = broken.length ? 1 : 0;
