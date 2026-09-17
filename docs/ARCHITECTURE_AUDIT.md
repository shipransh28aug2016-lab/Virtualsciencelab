# Architecture audit — PHASE 0

Method: static read of the whole repository, plus the app driven in real
Chromium (Playwright) — home screen, deep links, all 100 published labs, and a
fault-injection test. Every claim below is either a file reference or a
measurement reproduced by a script in this repo. Nothing here was changed
during the audit.

Date of audit: 2026-09-17. Commit audited: `5bd43e4`.

---

## 1. Headline: the application does **not** fail to load

The brief assumes a production incident. There is none. Measured on a cold
browser context against `npm start`:

| Probe | Result |
|---|---|
| `/` (home) | HTTP 200, `load` in **89 ms**, 100 cards rendered |
| `/#/exp/XI-PHY-A07` (deep link, cold) | **73 ms**, lab renders, 6 controls, 4 toolbar actions, canvas inked |
| `/#/exp/XII-CHE-K01` (deep link, cold) | **72 ms**, 27 controls, canvas inked |
| `/#/exp/BOGUS-ID-99` | falls back to home (silently — see §6.3) |
| Page errors on boot | **0** |
| Console errors on boot | **0** |
| Failed requests | **0** |
| Non-200 responses | **0** |
| Requests to first paint | **13** |
| Transfer to first paint | **461 KB** |
| `tools/audit-renderers.mjs` | **100/100 render cleanly, 0 failures** |
| `tools/audit-liveness.mjs` | 100 labs, **0 runtime errors** |

The likely cause of any "it won't open" report is **not** the code: opening
`index.html` from the filesystem (`file://`) breaks ES modules and `fetch`,
and `boot()` already catches that and prints the correct instruction
(`src/main.js:245`). It must be served over HTTP.

There is therefore **no PHASE 1 rewrite to perform**. PHASE 1 is re-scoped to
the real failure modes found below, which are failures *after* load.

## 2. Architecture as built

| Layer | Implementation |
|---|---|
| Framework | **None.** Vanilla ES modules, no build step, no bundler |
| Runtime dependencies | **Zero** (`package.json` — Playwright is dev-only) |
| Routing | Hash router, `src/main.js:521` `route()`, regex `^#/exp/([\w-]+)$` |
| State | One module-level `app` object (`src/main.js:206`); no store library |
| Rendering | Single `<canvas id="cv">`, 2D context. No WebGL, no SVG scenes, no DOM-per-frame |
| Animation | One `requestAnimationFrame` loop, app-wide (`src/main.js:1461`) |
| API | **None.** No server, no REST, no GraphQL, no auth, no sessions |
| Database | **None server-side.** IndexedDB (`src/offline/db.js`), 9 stores, `DB_VERSION 1`; settings in `localStorage` |
| Auth | **None.** No accounts, no principals, no student identity |
| SSR / hydration | **N/A** — static HTML, no server rendering, so no hydration class of bug exists |
| Assets | `assets/app.css` (37 KB) is the only asset. Icons are inline SVG/data-URI. No images, no fonts, no CDN |
| PWA | `sw.js`, precache-on-install + cache-first, `VERSION = 'vlab-2026-27-v36'` |
| Code splitting | Already present: 76 models are dynamic `import()` (`MODEL_LOADERS`, `src/main.js:26`); renderers load on first lab open |
| Data | 100 experiment JSONs (2.1 MB total) behind a generated 49 KB `index.json`, fetched per-lab on demand |

**Code size:** 22,082 lines of JS. Renderers 6,847; models ~13,000 across 76
files; `main.js` 2,631; everything else (state machine, IndexedDB, graph,
assessment, utils) 656 lines combined.

## 3. Load path

```
index.html  →  assets/app.css  →  <script type=module src=src/main.js>
                                        │
    boot()  ──►  Promise.all([ curriculum JSON , experiments index JSON ])   ← 2 fetches, ~55 KB
                                        │
            bindChrome → renderMetrics → renderCards → registerSW → route()
                                        │
                   (home paints here — no model, no renderer, no canvas work)
                                        │
        route() on #/exp/ID ──► loadFullExperiment(id)   ← 1 fetch, ~20 KB
                              └► openLab(): import(model) ∥ import(renderers/index)
                                 → init() → buildControls/Toolbar/Tabs → startLoop()
```

The shell-first progression the brief asks for **already exists**. The home
screen runs no simulation, imports no model and touches no canvas.

## 4. What the startup path does *not* do

* No AI call, anywhere in the repository.
* No network call after first load (service worker is cache-first).
* No database read at boot except one `localStorage` read per setting
  (`class`, `subject`, `theme`, panel-collapsed flags) and one IndexedDB write
  (`cachedCurriculum`) which is fire-and-forget and off the paint path.
* No simulation initialisation. `startLoop()` is only reached from `openLab()`.
* No 3D asset, no model file, no texture, no font.
* Exactly **one** rAF loop exists in the codebase, and `stopLoop()` is called
  on every route change (`src/main.js:523`), so loops cannot accumulate.

## 5. Animation determinism — already correct

`startLoop()` (`src/main.js:1413`) is a fixed-timestep accumulator:

```
elapsed = min(MAX_CATCHUP, (now - last)/1000)
accumulator += elapsed
while (accumulator >= FIXED_DT && steps++ < 64) state = model.step(state, inputs, FIXED_DT)
```

Simulation advances on `FIXED_DT`, never on frame count, with a catch-up clamp
and a 64-step bound against the spiral-of-death. The brief's requirement
("use simulationTime, not frameCount; same state → same result regardless of
FPS") is **already satisfied**. No change needed.

## 6. Real defects found

### 6.1 No error containment — one throw kills the lab, silently  ·  **CRITICAL**

`draw()` (`src/main.js:1466`) calls the renderer, and `tick()` calls
`app.model.step()`, both **outside any try/catch**. An exception in either
escapes the rAF callback, so the line that re-arms the loop
(`app.raf = requestAnimationFrame(tick)`) is never reached and **the loop dies
permanently**.

Verified by fault injection (throw raised inside a canvas call mid-run):

```
loop alive after renderer throw? NO - frozen
page errors seen: [ 'synthetic renderer failure' ]
user-visible message: {"toast":"","feedback":""}
```

The student sees a frozen picture, controls that do nothing, and **no message
at all**. There is no per-visualiser error boundary, no retry, no reset. The
whole repository contains 5 `try`/`catch` sites in `main.js`, none of them
around model or renderer execution.

### 6.2 Unhandled rejection on the lab route  ·  **HIGH**

```js
if (meta) return loadFullExperiment(meta.id).then((full) => full && openLab(full));
```
`src/main.js:530` — no `.catch`. A failed or malformed experiment fetch (first
visit while offline, truncated cache, bad JSON) produces an unhandled rejection
and a blank lab with no explanation. `openLab()` is itself `async` with no
internal error handling, so a model that throws in `init()` fails the same way.

### 6.3 Unknown experiment id fails silently  ·  **LOW**

An id that does not resolve falls through to `show('#viewHome')` with no
message. A stale bookmark or a typo looks like the app ignored the click.

### 6.4 `layerThin` is a dead control  ·  **MEDIUM (scientific correctness)**

`XII-PHY-B07` and `XII-PHY-B08` expose a switch labelled *"Only a few drops
used"*. `layerThin` appears **exactly once** in the codebase — in
`defaults` (`src/simulation/models/refractive-index.js:25`). It is read by no
equation and by no renderer. Toggling it changes nothing physically or
visually. Confirmed in-browser: `c_layerThin<btn>=same`.

This matters scientifically: the liquid-lens method's `1/F = 1/f₁ + 1/f₂`
assumes a thin plano-concave liquid layer. A thick layer invalidates it. The
control is asking a real question and discarding the answer — precisely the
"control that isn't wired to the model" the brief forbids.

### 6.5 The verification gate itself is unreliable  ·  **HIGH (blocks all later phases)**

`tools/audit-liveness.mjs` reports `XII-PHY-B07` and `XII-PHY-B08` as
**DEAD (no motion, no response)**. They are not. The tool nudges only
`#controls input[type=range]`; both labs' meaningful controls are *segmented
buttons*, and their only slider is `benchLC` (a scale least-count, which
correctly does not move the apparatus). Driving every widget type shows both
respond:

```
XII-PHY-B07: Glycerine<btn>=MOVED  Kerosene<btn>=MOVED  Turpentine<btn>=MOVED  15 cm<btn>=MOVED
XII-PHY-B08: Glycerine<btn>=MOVED  Kerosene<btn>=MOVED  Turpentine<btn>=MOVED  10 cm<btn>=MOVED
```

`tools/audit-models.mjs` has the mirror-image flaw: it reports `friction`,
`rolling-friction` and `viscosity` as "truly dead". They are not — it sets a
fixed flag list (`running/flowing/heating/started`) and varies only the first
numeric independent variable. `friction.step()` correctly returns an unchanged
state while the pull is below limiting friction (static friction balancing the
load *is* the observation), and `viscosity` waits on a release flag the tool
never sets. In-browser both respond: `XI-PHY-A09: ACTION-MOVED, panG=MOVED,
loadG=MOVED`.

Every later phase in the brief is gated on "run the audit, verify no
regression". With a gate that emits 5 false failures out of 100, that gate
cannot be trusted. It must be fixed before it is relied on.

### 6.6 Service-worker chunk skew  ·  **LOW**

`sw.js` versions its cache correctly (`VERSION`, old caches deleted on
`activate`) — there is no stale-shell bug. But `skipWaiting()` + `clients.claim()`
(`sw.js:269,284`) activate a new cache **under an already-open old document**.
That document's later dynamic `import()` of a model then fetches the *new*
file against *old* `main.js`. The module contract is stable so this is latent,
not active. Recorded, not fixed.

### 6.7 Client-state schema is unvalidated  ·  **LOW**

`DB.getSetting` (`src/offline/db.js:133`) `JSON.parse`s whatever is in
`localStorage` and returns it. A corrupted or hostile `vlab:class` value
propagates into `classRecord()` unchecked. The `try/catch` only guards a parse
throw, not a wrong-shaped value. IndexedDB records are likewise read back
unvalidated. Nothing crashes today because every consumer happens to be
tolerant; there is no migration path if `DB_VERSION` ever moves past 1.

## 7. Database / query findings

**There is no server database.** No SQL, no Firestore, no Mongo, no ORM, no
connection string, no query builder anywhere in the repository. Searching for
`where`/`orderBy`/`filter`+`sort` predicates returns only in-memory
`Array.prototype.filter` over the 100-item experiment index — an O(100) scan
per keystroke in the search box, which is correct and not worth indexing.

The only persistence is **IndexedDB**, 9 object stores, every one accessed by
primary key only:

| Store | Key | Access pattern | Index needed? |
|---|---|---|---|
| `observations` | `expId` | `get`/`put` by key | No — keyPath is the query |
| `experimentProgress` | `expId` | `get` by key; `getAll` for teacher view | No — `getAll` over ≤100 rows |
| `experimentAttempts` | `expId:notebook` | `get`/`put` by key | No |
| `assessmentResults` | `expId` | `get`/`put` by key | No |
| `vivaAttempts`, `studentProfile`, `settings`, `cachedCurriculum` | key | `get`/`put` | No |
| `syncQueue` | auto-increment | append only; never read | Dead store — see below |

Cardinality ceiling is 100 rows per store (one per experiment), on one device.
**No index is justified by any query in this codebase.** Adding one would add
write cost and an IndexedDB version migration for zero read benefit.

`syncQueue` is written by `enqueueSync()` on every progress save and is **never
read by anything** — there is no sync client. It grows without bound.

## 8. Mutation inventory (for the idempotency question)

Every mutation in the application, complete:

| Mutation | Site | Duplicate-execution risk |
|---|---|---|
| `saveObservations(expId, rows)` | `db.js:113` | **None** — whole-array `put` at a fixed key. Idempotent by construction |
| `saveProgress(expId, patch)` | `db.js:116` | **None** — read-merge-`put` at a fixed key |
| `saveAssessment(expId, result)` | `db.js:126` | **None** — `put` at a fixed key |
| `saveNotebook(expId, note)` | `db.js:129` | **None** — `put` at a fixed key |
| `setSetting(key, value)` | `db.js:139` | **None** — `put` at a fixed key |
| `enqueueSync(type, payload)` | `db.js:105` | **Appends duplicates** — but nothing reads the store |

There is no network mutation, no payment, no submission, no server-side
resource creation, and no principal to scope a key to. Every write is a
last-write-wins `put` on a key the client already owns, executed locally with
no retry layer and no possibility of an at-least-once redelivery.

**An `Idempotency-Key` protocol has nothing to attach to here.** Implementing
the `IdempotencyRecord` table from the brief would add a store, a hashing path
and a TTL sweeper to guard writes that are already idempotent, against retries
that cannot occur, for users who do not exist. That is cost with no
correctness gain. The honest finding is recorded rather than the feature
built; see `docs/IDEMPOTENCY_DESIGN.md` for the full reasoning and for the
conditions under which this conclusion flips.

## 9. Performance observations

* **461 KB / 13 requests** to interactive. Of that, `assets/app.css` is 37 KB
  and the two boot JSONs are ~55 KB; the rest is `main.js` plus the shell modules.
* Largest single artefact is `data/` at 2.1 MB total, but it is **never
  fetched whole** — one 20 KB file per lab opened.
* `main.js` at 2,631 lines is the largest single module on the critical path
  and contains per-model special cases inline in the animation loop
  (`titration`, `simple-pendulum` at `src/main.js:1447`, `1435`) — a
  maintenance hotspot, not a speed one.
* Per-keystroke `renderCards()` rebuilds all 100 cards with no debounce
  (`src/main.js:302`). Measurable on a low-end phone; not measured here.
* No virtualization anywhere; the longest list is 100 cards.
* Canvas is fixed `900×560` and re-framed per lab; no offscreen canvas, no
  worker. All 76 models are cheap closed-form or single-ODE steps — none
  profiled above trivial cost.

## 10. Risks explicitly checked and **not** found

Circular imports · infinite render loops · state-update loops · duplicate rAF
loops · retry storms · duplicate requests · N+1 queries · recursive listeners ·
realtime subscriptions · hydration mismatch · SSR-only-API misuse · WebGL
init · browser API use before DOM ready · missing env vars · oversized assets ·
CDN dependencies · blocking AI calls. **None present.**

## 11. Recommended safe execution order

1. **PHASE 1 (re-scoped)** — error containment (§6.1), route rejection
   handling (§6.2), unknown-id feedback (§6.3), and repair the audit gate
   (§6.5) so later phases have a trustworthy verifier.
2. **PHASE 2** — record the measured baseline; debounce card search. Little
   else is justified: the numbers are already good.
3. **PHASE 3 / PHASE 4** — document the findings in §7 and §8. Do not build
   idempotency records or indexes against a schema that has neither a server
   nor a query to justify them.
4. **PHASE 5–7** — the engine the brief describes (model ÷ renderer ÷ controls
   ÷ explanation) is **already the shape of this codebase**: `models/*.js` are
   pure physics with `init/step/measure/derive/validate`, renderers are pure
   draw functions, controls are declared in experiment JSON. The work is to
   formalise that contract in `docs/`, close the gaps it exposes (§6.4), and
   add the missing pedagogy layer (Predict → Run → Compare).
5. **PHASE 8–10** — UX, hardening, validation.
