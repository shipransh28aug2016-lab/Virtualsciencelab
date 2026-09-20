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
});
const LANES = Number(process.env.VLAB_LANES || 4);
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
  async function titrateToEndPoint() {
    const t0 = Date.now();
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
    for (let v = range.min; v <= range.max; v += 1) {
      await setBurette(Number(v.toFixed(2)));
      await settle(900);            // the tap must finish pouring, whatever the load
      const f = await flag();
      if (f.flagged || /overshot/i.test(f.title)) { hit = v; break; }
    }
    if (hit === null) return { started: 'burette', waitedMs: Date.now() - t0, endpoint: false };

    // Then approach dropwise from well before it, so the titre recorded is the
    // first drop that holds the colour rather than a millilitre past it.
    for (let v = Math.max(range.min, hit - 1.5); v <= hit + 0.2; v += Math.max(range.step, 0.1)) {
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
   * Read the indicator once it has stopped moving.
   *
   * A fixed pause after setting a control is enough on an idle machine and
   * not enough on a loaded one: with four lanes sharing the CPU the model had
   * often not been stepped yet, so the probe read the PREVIOUS indicator and
   * searched in the wrong direction. These labs passed one at a time and
   * failed in a sweep, which is the signature of a timing assumption rather
   * than a defect.
   */
  async function readIndicator(capMs = 900) {
    // Give the change a frame to be applied before reading anything: two
    // identical reads taken before the input event was even processed are
    // "settled" only in the sense that nothing has happened yet.
    await wait(110);
    const t0 = Date.now();
    let last = await page.evaluate(NULL_PROBE);
    while (Date.now() - t0 < capMs) {
      await wait(70);
      const now = await page.evaluate(NULL_PROBE);
      if (now && last && now.text === last.text) return now;
      last = now;
    }
    return last;
  }

  async function homeInOnNull(nControls, capMs = 20000) {
    const t0 = Date.now();
    if (!(await page.evaluate(NULL_PROBE))) return false;
    const SEL = '#controls input[type=range], #controls .seg button, #controls .wiring button, #controls .sw, #controls select, #controls input[type=checkbox]';

    for (let i = 0; i < nControls && Date.now() - t0 < capMs; i += 1) {
      const range = await page.evaluate(({ sel, idx }) => {
        const el = document.querySelectorAll(sel)[idx];
        if (!el || el.type !== 'range') return null;
        return { min: Number(el.min), max: Number(el.max), step: Number(el.step) || 1 };
      }, { sel: SEL, idx: i });
      if (!range) continue;

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

      if ((await readIndicator())?.atNull) return true;
      await setAt(range.min);
      const low = await readIndicator();
      await setAt(range.max);
      const high = await readIndicator();
      if (!low || !high) { await restore(); continue; }
      if (low.atNull) { await setAt(range.min); return true; }
      if (high.atNull) return true;
      if (low.up === high.up) { await restore(); continue; }   // the null is not inside this range

      // Bisect on the direction the indicator points.
      let lo = range.min;
      let hi = range.max;
      for (let k = 0; k < 30 && Date.now() - t0 < capMs; k += 1) {
        const mid = Math.round(((lo + hi) / 2 - range.min) / range.step) * range.step + range.min;
        await setAt(Number(mid.toFixed(6)));
        const now = await readIndicator(600);
        if (!now) break;
        if (now.atNull) return true;
        if (hi - lo <= range.step * 1.01) break;
        if (now.up) lo = mid; else hi = mid;
      }
      if ((await readIndicator())?.atNull) return true;
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
    await wait(150);
    const after = await probeRead();
    if (after.rows > before) return { ok: true, rows: after.rows };
    const toast = await page.evaluate(() => document.querySelector('#toast')?.textContent.trim() || '');
    return { ok: false, why: `refused: ${toast || 'no row appeared'}` };
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
        await page.goto(`${BASE}/index.html#/exp/${entry.id}`, { waitUntil: 'domcontentloaded' });
        await wait(420);
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
        const onLab = await page.evaluate(() => !document.querySelector('#viewLab')?.hidden);
        if (!onLab) { fail('open', 'did not reach the lab view'); return; }
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
        let slowestWait = 0;
        let hunted = 0;
    let nulled = 0;
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
            await page.evaluate(({ idx, stop, objected }) => {
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
              for (const sw of document.querySelectorAll('#controls .ctl:not([data-group="setup"]) .sw')) {
                const on = sw.getAttribute('aria-checked') === 'true';
                if (on !== (idx % 2 === 1)) sw.click();
              }
              if (!groups.length || (stop && !groups.length)) return;
              if (!stop) {
              // The tray first, then the second setting at a slower rate, so
              // the pair is actually swept: four components BOTH ways round
              // needs component and direction to advance together.
                groups[0][idx % groups[0].length].click();
              }
              /* And alternate the SMALLEST group every reading. The two-phase
                 procedures turn on a two-position setting — DC then AC, shunt
                 out then in — and cycling only the big trays never reaches
                 them. */
              const last = groups[groups.length - 1];
              if (last && last !== groups[0] && !stop) last[idx % last.length].click();
            }, { idx: k, stop: mixingRefused && !traySetNeeded, objected: mixedWhat });
            /* Then move a SLIDER — never another button, because the
               buttons are the specimen tray and pressing one of those would
               put the specimen just chosen straight back. */
            const frac = 0.15 + (0.7 * k) / want;
            if (k > 0 && !freezeSliders) await page.evaluate((f) => {
              const sliders = [...document.querySelectorAll('#controls .ctl:not([data-group="setup"]) input[type=range]')];
              const el = sliders[0];
              if (!el) return;
              const min = Number(el.min); const max = Number(el.max); const step = Number(el.step) || 1;
              const want2 = min + (max - min) * f;
              el.value = String(Math.round((want2 - min) / step) * step + min);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }, frac);
            await wait(220);
          }
          const run = isTitration ? await titrateToEndPoint() : await runProcessAndWait(Math.max(2000, Math.min(34000, labDeadline - Date.now())));
          slowestWait = Math.max(slowestWait, run.waitedMs || 0);
          // A process that costs the student half a minute per reading is not
          // repeated six times here; the point is already made by three.
          if (k === 0 && run.waitedMs > 8000) budget = Math.min(budget, 3);
          let t = await takeReading();
          if (!t.ok) {
            const firstRefusal = t.why;
            // First do what the instrument itself tells you to do.
            if (await homeInOnNull(nControls, Math.max(1000, Math.min(20000, labDeadline - Date.now())))) { nulled += 1; t = await takeReading(); }
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
          if (mixingRefused && !traySetNeeded
              && /different (tuning forks|tubes|salts|boards|components|specimens|solutions|arrangements)|work through at least|both direction/i.test(asking)) {
            // Now it wants a set after all: put the tray back into use.
            traySetNeeded = true;
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
          const mixedSet = /\b\d+ different [a-z]+/i.test(asking)
            || /\bdifferent (objects|wires|liquids|specimens|solutions|separations|settings)\b|its own set|one liquid per|one wire at a time|cannot be averaged/i.test(asking);
          if (!mixingRefused && mixedSet) {
            mixingRefused = true;
            mixedWhat = asking;
            if (/separations|settings|cannot be averaged|at one (separation|setting)/i.test(asking)) freezeSliders = true;
            /* Put the bench back the way it opened before starting again:
               measuring the brass cylinder and comparing it against the steel
               sphere's accepted diameter is a different wrong answer, not a
               right one. */
            await page.evaluate((choice) => {
              [...document.querySelectorAll('#controls .seg, #controls .wiring')].forEach((g, i) => {
                const btns = [...g.querySelectorAll('button')];
                const want = choice[i];
                if (want >= 0 && btns[want]) btns[want].click();
              });
              document.querySelector('#clearBtn')?.click();
            }, openingChoice);
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
        else if (!rr.result || /Take readings, then calculate/.test(rr.result)) fail('result', 'Calculate produced nothing');
        else pass('result', rr.result.replace(/\s+/g, ' ').slice(0, 80));

        /* The result panel is assembled from fields the model returns. When a
           template reads one the model never produces, the student is shown
           the literal word "undefined" — a number that is not a number, in the
           one panel that is supposed to be the answer. */
        const junk = rr.result.match(/\b(undefined|NaN|null|Infinity|\[object Object\])\b/);
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
            if (pct > 25) fail('accuracy', `result is ${pct.toFixed(0)}% away from the accepted value`);
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
