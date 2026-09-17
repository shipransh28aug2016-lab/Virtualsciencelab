# Lab implementation map

What each missing lab reuses, and what genuinely has to be new. Written
before implementation.

## XI-CHE-A02 — Bending a glass tube  *(selected first)*

### Why this one first

Against the selection rule: it has the **strongest similarity to a working
lab** (the melting-point bench is a burner heating glass while a temperature
is watched), it **validates the reusable architecture** end to end (heat
field → model → renderer → graph → measurement), its **equations are clear**
(a lumped-capacitance heat balance and a bend-strain relation), its
**complexity is manageable**, and it **introduces no new rendering
technology** — 2D canvas, exactly as every other lab.

### Closest existing implementation

`XI-CHE-B01` melting point — `src/simulation/models/melting-point.js`,
renderer `meltingPoint`. Same shape: a burner heats something, temperature
rises over time, the student judges a threshold and records it.

### Reused unchanged

| Reused | From | For |
|---|---|---|
| `drawBurner(ctx, cx, baseY, lit, {air, flameHeight, intensity})` | `apparatus.js` | the flame, and the air-hole → flame-type coupling this experiment depends on |
| `addHeatSource` / `heatAt` | `apparatus.js` | the real radiant field; the tube samples it rather than being told it is hot |
| `bench`, `label`, `arrow`, `dashedLine`, `title`, `drawSwatch` | `apparatus.js` | scene, annotation, legend — the existing visual language |
| `renderScene` / `finishFrame` / `resetScene` | `apparatus.js` | canvas sizing, theme, DPI, shared clock |
| `theme()`, `rgba()`, `shade()` | `realism.js` | colours, so the lab matches every other bench |
| `I.apparatus()` | `interact.js` | hover identification of the tube and burner |
| `makeRng`, `jitter` | `utils/rng.js` | reproducible instrument scatter |
| `toLeastCount`, `sigFig`, `mean`, `percentError`, `clamp` | `utils/measure.js` | readings, rounding, error |
| `renderGraph` | `components/graph.js` | temperature-against-time, from the same state |
| fixed-timestep loop, state machine, IndexedDB, error boundary, toolbar, control widgets, observation table, viva and assessment panels | `main.js` and friends | the entire lifecycle — **no new lifecycle code** |

### Genuinely new

| New | Why nothing existing covers it |
|---|---|
| `src/simulation/models/glass-bending.js` | no model describes glass viscosity, softening, circumferential heat distribution or bend-wall strain |
| `glassBending()` in `renderers/chemistry-new.js` | no renderer draws a tube that softens, bends and thins |
| `data/experiments/class-xi/XI-CHE-A02-bending-glass-tube.json` | the experiment record |

Three files, matching the blueprint exactly. No new component, no new
utility, no new dependency, no parallel architecture.

### What is replaced rather than reused

Only the scientific model and the apparatus drawn. Coordinate system,
animation loop, control widgets, measurement path, graph, table, reset,
persistence and error containment are all the shared ones.

---

## The other three, if they are built later

| Lab | Closest existing | Reuse | New |
|---|---|---|---|
| `XI-CHE-A01` cutting a glass tube | `XI-CHE-A02` once it exists | the tube drawing, the bench | score-depth → fracture model |
| `XI-CHE-A03` drawing out a glass jet | `XI-CHE-A02` | the whole heat model, unchanged | taper from volume continuity under pull rate |
| `XI-CHE-A04` boring a cork | — | bench, label | out of scope: no physics to model, only tool choice |

`A01` and `A03` would reuse `glass-bending`'s heat model directly, which is
the second reason to build `A02` first: it is the one that makes the other
two cheap.
