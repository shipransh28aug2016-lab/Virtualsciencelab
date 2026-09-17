# The existing lab blueprint

Extracted by reading the working labs, not by design. Every name below is a
real identifier in this repository. Nothing was modified to produce this
document.

Labs studied: **Physics** — `XI-PHY-A07` simple pendulum (simplest complete
lab), `XII-PHY-A01` resistivity, `XII-PHY-B07` refractive index by liquid
lens (three methods behind one model). **Chemistry** — `XI-CHE-B01` melting
point, `XI-CHE-E03` titration (most visually sophisticated — live burette,
flowing liquid, indicator colour), `XII-CHE-K01` salt analysis (27 controls,
most scientifically branched).

---

## A. Common architecture

There is no framework, no build step and no runtime dependency. A lab is
**three files and nothing else**:

| Part | Where | What it is |
|---|---|---|
| Scientific model | `src/simulation/models/<model>.js` | Pure ES module. No DOM, no canvas, no globals |
| Renderer | a function in `src/simulation/renderers/<area>.js`, registered in `renderers/index.js` | Pure draw function `(ctx, w, h, state, inputs)` |
| Experiment record | `data/experiments/class-x{i,ii}/<ID>-<slug>.json` | Curriculum mapping, theory, procedure, controls, viva, assessment |

`src/main.js` is the only wiring. It owns one `app` object, one hash route,
one `requestAnimationFrame` loop and one canvas, and every lab shares them.
**Adding a lab adds no lifecycle code**: declare the model, declare the
renderer, declare the JSON, register in three places.

### The separation that is already enforced

```
experiment JSON  →  which model, which renderer, which controls, what units
model (pure)     →  physics only: init / step / measure / derive / validate
renderer (pure)  →  draws state + inputs; computes no physics
main.js          →  input → validate → step → draw → measure → table → graph
```

A model never draws. A renderer never decides physics. This is not
aspirational — it holds across all 76 models and 8 renderer modules.

## B. Lab lifecycle, as actually implemented

```
route()                     hash #/exp/<ID>, regex ^#/exp/([\w-]+)$
  └ loadFullExperiment(id)  fetch the JSON once, cache for the session
      └ openLab(exp)
          ├ loadModel(id)              dynamic import(), cached in modelCache
          ├ import(renderers/index.js) once, cached on app.renderers
          ├ initialInputs(exp, model)  model.defaults, overridden by JSON defaults
          ├ app.state = model.init(inputs)
          ├ DB.loadObservations(id)    rows survive a refresh
          ├ new ExperimentMachine()    INITIALISED → READY
          ├ buildToolbar / buildControls / buildTabs / renderTable
          └ startLoop()
                 ↓  every frame
        accumulator += min(MAX_CATCHUP, dt)
        while (accumulator >= FIXED_DT)  state = model.step(state, inputs, FIXED_DT)
        draw()          → renderScene(canvas, 16/10, name, fn, state, inputs)
        updateReadouts()
                 ↓  on "Take reading"
        model.validate(inputs) → showFeedback
        model.measure(state, inputs, seed, trial) → row → app.rows
        DB.saveObservations(id, rows)   → renderTable → renderGraph
                 ↓  on "Calculate result"
        model.derive(rows, inputs) → resultBox + checkResult()
```

`STATES` (`src/core/state-machine.js`): INITIALISED → READY → RUNNING →
MEASURING → OBSERVATION → CALCULATION → RESULT → ASSESSMENT → COMPLETED.
RESET and RETRY are legal from anywhere.

**Reset** is `startProcess()` re-calling `model.init(inputs)` — state is a
plain object rebuilt from scratch, never mutated back.

**Timing** is a fixed-timestep accumulator on `FIXED_DT = 1/120` with
`MAX_CATCHUP = 0.25 s` and a 64-step bound. Simulation time never depends on
frame rate, so a throttled tab and a 144 Hz monitor produce the same physics.

**Cleanup**: `stopLoop()` runs on every route change, cancelling the single
rAF. There is one loop in the whole application and it cannot accumulate.

## C. Reusable components — the real names

There are no React-style components. The equivalents are **exported drawing
primitives** in `src/simulation/renderers/apparatus.js`, already used by
every lab:

*Glassware* `drawBeaker` `drawConicalFlask` `drawBurette` `drawTestTube`
*Heat* `drawBurner` (takes `air`, `flameHeight`, `intensity`), `drawTripod`,
`drawGauze`, `heatingAssembly`, `addHeatSource` / `heatAt` (a real radiant
heat field other apparatus can sample)
*Support* `drawRetortStand` `drawClamp` `drawUpright` `bench`
*Instruments* `drawThermometer` `drawDial` `drawDigitalReadout` `drawRuler`
*Optics* `drawOpticalBench` `drawConvexLens` `drawConcaveLens`
`drawConcaveMirror` `drawConvexMirror` `drawPrism` `drawSlab` `drawScreen`
`drawRayDiagram` `drawImageOnScreen` `drawCandle`
*Mechanics* `drawPendulumBob` `drawSpring` `drawWeight`
*Electrical* `drawCell` `drawResistor` `drawKey` `drawResistanceBox`
`drawWireRect`
*Annotation* `label` (with `anchor`, `bold`), `arrow`, `dashedLine`, `tick`,
`title`, `drawSwatch`, `noteBounds`
*Scene* `renderScene`, `finishFrame`, `resetScene`, `fitCanvas`,
`setCanvasTheme`

Panels are static markup in `index.html`, filled by `main.js`:
`#toolbar` `#controls` `#readouts` `#liveConfig` `#feedback` `#tabs`
`#tabbody` `#thead`/`#tbody` `#graph` `#resultBox` `#stateTrack`.

Other shared modules: `src/components/graph.js` → `renderGraph`;
`src/simulation/renderers/interact.js` → `apparatus()`, `handle()`,
`attach()` (drag a piece of apparatus, routed through the same clamp/step
gate as a slider); `src/simulation/fluids.js` → shared liquid surface;
`src/core/lab-error-boundary.js` → `showLabError` / `clearLabError`.

## D. Reusable scientific utilities — do not duplicate these

`src/utils/measure.js`
`toLeastCount(v, lc)` · `mean` · `stdDev` · `sigFig(v, n)` ·
`percentError(measured, accepted)` · `linearFit(points)` ·
`fitThroughOrigin(points)` → `{slope, r2}` · `clamp` · `lerp` · `sciText`

`src/utils/rng.js`
`makeRng(seed)` — deterministic, so a reading is reproducible from
`(seed, trial)` · `jitter(rng, amount)` — instrument scatter · `uniform` ·
`randInt`

`src/assessment/engine.js`
`gradeMcq` · `gradeNumeric` · `gradeDuringLab` · `vivaScore` ·
`overallScore` · `masteryBand` · `checkResult(derived, expectedResult)`

`src/offline/db.js`
`saveObservations` / `loadObservations` · `saveProgress` · `saveAssessment` ·
`saveNotebook` · `getSetting` / `setSetting`

Constants live **in the model that owns them** (`export const G = 9.792` in
mechanics models, `COMPOUNDS`, `LIQUIDS`, `SURFACES` tables). There is no
central constants file and adding one would fight the existing pattern.

## E. The model contract every lab implements

```js
export const meta = { id, formula, unitSystem, assumptions[], validRange,
                      edgeCases[], expectedBehaviour[] };
export const defaults = { … };            // every input the model reads
export function validate(inputs)          // {ok, errors[], warnings[]}
                                          // each: {field, code, message, why, fix}
export function init(inputs)              // fresh state; carries a run flag
export function step(state, inputs, dt)   // returns a NEW state, fixed dt
export function measure(state, inputs, seed, trial)  // one table row, or null
export function derive(rows, inputs)      // {ok, …results, points[]}
export default { meta, defaults, init, step, measure, derive, validate, … };
```

Run flags recognised by `main.js` `processFlag()`, in priority order:
`flying` · `released` · `rolling` · `heating` · `running`. Whichever the
state carries gets the primary button, labelled from `RUN_LABELS`
(`heating` → "Light the burner"). `state.finishedAt` moves the machine to
MEASURING and prompts the student to take the reading.

## F. Experiment JSON schema

```
id · class · subject · contentStatus · curriculumMapping{curriculumYear,
board, section, categoryTitle, assessmentComponent, serial, unit, chapter,
topic, subtopic, practical, learningObjectives[], competencies[],
sourceReference, verificationStatus}
title · shortTitle · objective[] · theory{statement, derivationNote, …}
apparatus[{name, spec, why}] · materials[] · variables[] · procedure[{step,
text, checkpoint, expects}] · simulation{model, renderer, fps, controls[],
actions[]} · observationModel{columns[{key,label,unit,decimals}], graph{x, y,
xLabel, yLabel, throughOrigin}, minRows} · calculations{steps[], resultKeys[]}
expectedResult{quantity, value, tolerance, unit, secondary, statement}
safety[] · sourcesOfError[] · viva[] · assessment{preLab[], duringLab[],
postLab[], weights} · scientificValidation{formula, assumptions[], validRange,
unitSystem, edgeCases[], expectedBehaviour[], testFile}
```

`variables[]` types: `independent` (the student varies it and it is graphed),
`control` (choice of apparatus or material), `controlled` (held fixed —
least counts, ambient conditions), `dependent` (the result; never seeded).

`simulation.controls[].widget`: `slider` · `segmented` · `switch`. A slider
renders **value + unit** from the variable's own `unit` field, so units are
structural, not a per-lab decision.

## G. Registration — the three places a new lab must appear

1. `src/main.js` → `MODEL_LOADERS['<model>'] = () => import('./simulation/models/<model>.js')`
2. `src/simulation/renderers/index.js` → export the draw function under the
   `renderer` name the JSON uses
3. `sw.js` → add the model file to `SHELL`, and bump `VERSION`

Then `npm run build:index` regenerates `data/experiments/index.json`.

**Note:** `EXPERIMENT_FILES` in `src/main.js:119` looks like a registry but is
dead code — it is declared and never read. The index is generated by
`tools/build-index.mjs` from the directory listing. Do not add to it.

## H. Verification gates

`npm run audit` runs four, in order:

| Gate | Asks |
|---|---|
| `audit-renderers.mjs` | does every renderer draw without throwing? |
| `audit-models.mjs` | does every model evolve in time, or respond to a control? |
| `audit-liveness.mjs` | in a real browser, does every lab's picture move? |
| `audit-recovery.mjs` | does a failing lab stay contained and recoverable? |

A new lab is not done until all four pass.
