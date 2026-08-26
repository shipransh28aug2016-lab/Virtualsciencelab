# CBSE V-LAB 2026–27

An offline-first virtual **science laboratory** for CBSE Classes XI & XII —
Physics (042) and Chemistry (043).
Students set up apparatus, change variables, take readings to the instrument's least count,
plot the graph, calculate a result, make mistakes, and face a viva — with the network off.

> **Not** a video library. **Not** an animation gallery. The physics and chemistry are computed
> live from the actual equations; every reading is quantised to a real least count; every
> piece of apparatus on screen is drawn and labelled with its correct scientific name.

---

## Run it

```bash
npm start          # → http://localhost:8080
```

The app is **pure vanilla JavaScript with zero runtime dependencies** — no build step, no
bundler, nothing to install to run it. `npm start` launches `tools/serve.mjs`, a zero-dependency
static file server, and works on a freshly cloned copy.

Once the site is opened, it works offline: the service worker precaches the app shell, and
every experiment runs from local files with **no network calls at runtime**. On Android/desktop
Chrome you can "Install" it as a PWA.

## Built to be read from the back of the room

The default theme is **light on purpose**. A projector cannot produce black — it
leaves the screen unlit, and ambient classroom light turns that into grey, so a
dark UI loses its contrast exactly where you need it. The background is a warm
off-white rather than pure white (which glares), the ink is deep navy rather than
black (which shimmers), and instrument readouts are set at 23 px so they carry to
roughly 40 feet. A **dim-room theme** is one tap away in the header and persists.

## What is in this release

**100 experiments**, every one with a live simulation, a labelled apparatus scene, an
observation table with least-count quantisation and CSV export, an auto-plotted graph, a
calculated result checked against the accepted value, error simulation, an 8–10 question viva
bank, and a weighted pre-lab/during-lab/post-lab/viva assessment.

- **Physics (042): complete.** Every experiment and activity in the official CBSE Physics
  practical syllabus, Classes XI and XII, Sections A and B — 35 experiments + 34 activities.
- **Chemistry (043): complete except four hand-skills.** Every Chemistry practical that can be
  honestly simulated in a browser — 39 experiments across Sections A–K of both classes. The
  four items **not** simulated are Class XI's manual glass-working skills (cutting/bending a
  glass tube, drawing a jet, boring a cork) — a browser cannot assess a student's hands, and
  this project does not fake that it can. See `docs/COVERAGE.md` for the full table, including
  the 21 Chemistry labs added in the most recent pass and which physics model each reuses.

## Every experiment ships with

- curriculum mapping traced to the official PDF (unit, chapter, section, serial number)
- apparatus list with *why each item is used*, drawn and **labelled on the canvas with its
  correct scientific name** — beaker, burette, galvanometer, convex lens, retort stand, and so on
- numbered procedure with checkpoints
- live simulation driven by the real equation, quantised to the instrument's least count
- observation table → CSV export, auto-plotted graph with least-squares best-fit line
- calculated result compared against the accepted value
- safety notes and sources of error
- **error simulation** — wrong wiring, over-amplitude, past the elastic limit, wrong indicator —
  each answered with *why*, never a bare "wrong"
- viva bank with expected concept + common misconception, and a weighted competency assessment
- notebook saved to IndexedDB

---

## Architecture in one picture

```
data/curriculum/       the authoritative CBSE syllabus text, zero logic
data/experiments/      one JSON per practical: theory, apparatus, procedure,
                        viva, assessment — content only, no code
   └─ src/simulation/models    PURE physics/chemistry: validate/init/step/measure/derive
   └─ src/simulation/renderers labelled canvas apparatus drawing — no physics
   └─ src/assessment    scoring, viva
                              ↓
      src/core         state machine, routing
      src/components   graph plotting
      src/offline      IndexedDB
      src/main.js      wires curriculum → model → renderer → DOM (the only DOM writer)
```

The science is separated from the drawing: each model exports
`validate / init / step / measure / derive` and touches nothing but numbers; a *separate*
renderer draws the apparatus for that same model. `step()` is pure and deterministic; realistic
human scatter comes from a **seeded PRNG** (`src/utils/rng.js`), so a teacher can reproduce a
student's exact run. `tools/build-index.mjs` rebuilds `data/experiments/index.json` — the ~50 KB
catalogue the home screen actually fetches — from whatever experiment JSON files are really on
disk, so the count on the home screen can never drift from what is actually shipped.

## Curriculum authority

> CBSE, *Physics, Subject Code 042* and *Chemistry, Subject Code 043*, Class XI–XII (2026-27)
> https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/

`data/curriculum/cbse-2026-27.json` is transcribed from the official syllabus PDFs. Every
practical string in every experiment JSON's `curriculumMapping.practical` field is the syllabus's
own wording, not a paraphrase.

## Verify it

There is no build step to fail, so "verifying it" means confirming the app actually boots and
every experiment actually runs — not compiling. What is checked here, mechanically, rather than
asserted:

```bash
node -e "…"   # every model: init → step → validate → measure → derive, with the
              # experiment's OWN declared default inputs (not just the model's fallback)
              # against all 100 experiment JSON files — no exceptions, no skips
```

```
ALL 100 EXPERIMENTS PASS FULL PIPELINE WITH THEIR OWN JSON-DECLARED DEFAULT INPUTS
ALL 100 EXPERIMENTS RESOLVE TO A REAL RENDERER FUNCTION
ALL 76 RENDERERS EXECUTE CLEANLY AGAINST A MOCK CANVAS
```

And a real boot, of the real `index.html` running the real `src/main.js` (jsdom +
fake-indexeddb, no hand-rolled harness):

```
home screen cards total: 34   built(clickable): 34      (Class XI Physics, the default filter)
metrics text: "100 Simulations · 104 Practicals mapped · 0 Network calls · 100% CBSE traced"
[XI-PHY-A07]  title correct · canvas renders · 6 controls · apparatus tab: 7 labelled items
[XI-CHE-E03]  title correct · canvas renders · 5 controls · apparatus tab: 9 labelled items
[XI-CHE-D01]  title correct · canvas renders · 5 controls · apparatus tab: 5 labelled items
[XI-CHE-F02]  title correct · canvas renders · 11 controls · apparatus tab: 5 labelled items
[XII-CHE-B02] title correct · canvas renders · 4 controls · apparatus tab: 5 labelled items
[XII-CHE-G01] title correct · canvas renders · 3 controls · apparatus tab: 4 labelled items
[XII-CHE-K01] title correct · canvas renders · 27 controls · apparatus tab: 5 labelled items
```

### About the historical test suite

An earlier version of this project (per its own commit history and the elaborate `npm run
check`/`npm run e2e*` scripts once referenced in `package.json`) apparently had a much larger
automated test suite — `tools/curriculum-audit.mjs`, `tools/lint-layers.mjs`,
`tools/contrast.mjs`, `tools/e2e/*.mjs`, and a `tests/` directory. **None of those files were
present in the repository this project now builds from** — only the application code and content
that depends on them survived. Rather than claim scripts exist that don't, `package.json` now
lists only the scripts that are actually in the repo (`start`, `dev`, `build:index`). Rebuilding
that historical test infrastructure — a real, standalone project on its own — is future work, not
claimed here.

## Deliberate limits

- **Physics and Chemistry only.** Biology is not shipped because its official 2026-27 PDF has
  not been read with the same rigour. Fabricating it would violate the first rule of this
  project.
- **Four Chemistry practicals are manual glass-working skills** and are listed as *Planned*,
  never as clickable stubs pretending to be experiments. See `docs/COVERAGE.md`.
- **Viva is self-assessed.** Grading free-text answers offline would need an LLM; instead the
  student answers aloud, reveals the expected concept, and rates themselves. Honest rather than
  fake-intelligent.
- **Simulations are models.** Assumptions and valid ranges are printed in the Theory tab of
  every experiment.
