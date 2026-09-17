# XI-CHE-A02 — Bending a glass tube

## Purpose

Teach why every bench rule for working glass tubing is what it is: use a
wing top, rotate the tube, take it out of the flame before bending it, heat
a broad band rather than a spot. Each of those follows from the viscosity
curve of soda-lime glass and from the strain a bend puts on the outer wall,
so the student can change one and watch the consequence rather than being
told the rule.

## CBSE topic

Chemistry (043), Class XI, Practicals **Section A — Basic Laboratory
Techniques**, item 2. Assessment component: basic laboratory techniques
(02 marks).

## What this lab does not claim

It models the apparatus, not the student's hands. A browser cannot watch
someone roll a tube between finger and thumb or judge whether they held the
flame at the right angle, and nothing here scores manual technique or
substitutes for supervised bench practice. `docs/COVERAGE.md` excluded this
practical on exactly that ground, and that reasoning still holds for
dexterity. It does not hold for the physics, which is what is modelled.

## Scientific model

**Viscosity — Vogel–Fulcher–Tammann**, η in Pa·s, T in °C:

```
log₁₀ η = −2.585 + 4215 / (T − 263)
```

These constants reproduce all three standard fixed points of soda-lime
glass, which is why they were chosen rather than fitted:

| Fixed point | Defined at | Model | Published |
|---|---|---|---|
| Annealing | η = 10¹² Pa·s | **552 °C** | ~550 °C |
| Softening (Littleton) | η = 10⁶·⁶ Pa·s | **722 °C** | ~720 °C |
| Working | η = 10³ Pa·s | **1018 °C** | ~1000 °C |

**Heat balance.** The heated band is split into the side facing the flame
and the side away from it, each with its own temperature. Per unit area:

```
q = e·[h_f(T_f − T) + εσ(T_f⁴ − T⁴)]  +  (1−e)·[−h_air(T − T_air) − εσ(T⁴ − T_air⁴)]
```

`e` is the fraction of time that side faces the flame — 1 for a tube held
still, 0.5 for one rotated steadily. What a surface faces decides what it
radiates *against*: glass sitting inside a flame exchanges radiation with
the combustion gases, not with the room. Conduction round the wall,
`q = kA(T_hot − T_cold)/s` over a path half the circumference long, then
closes the gap between the two sides — slowly, because k ≈ 1 W m⁻¹ K⁻¹.

Constants: ρ = 2500 kg m⁻³, c = 840 J kg⁻¹ K⁻¹, k = 1.0 W m⁻¹ K⁻¹,
ε = 0.90, h_flame = 120 W m⁻² K⁻¹, h_air = 15 W m⁻² K⁻¹, σ = 5.670374419×10⁻⁸.

**Bending.** The band sags under the weight of the arms. For a uniform
cantilever of overhang ℓ, M = ρAgℓ²/2 and σ = Mr₀/I with
I = π(r₀⁴ − rᵢ⁴)/4. Viscous flow gives a strain rate ε̇ = σ/3η (Trouton
ratio 3 for uniaxial flow), so curvature rate is ε̇/r₀ and:

```
dθ/dt = (σ / 3r₀) · ∫ dx / η(T(x))
```

The integral matters. The band is not isothermal along its length — the
flame's profile is parabolic, falling by `droopC` at the ends — and because
η is exponential in T, the cooler ends stiffen the band and slow the whole
bend. Taking the band as uniformly at its peak temperature overstates the
rate about threefold and leaves a workable window too narrow to hit.

**Geometry.** The heated band becomes the arc, so `R = L/θ`. The outer
fibre must stretch by ε = r₀/R to get round the corner, and the glass there
is conserved, so the outer wall thins to `t₀/(1 + r₀/R)` while the inner
wall thickens. Uneven heating round the circumference thins it further,
because the softer side takes more of the strain.

## Equations

| Quantity | Relation |
|---|---|
| Viscosity | log₁₀η = −2.585 + 4215/(T − 263) |
| Bending stress | σ = Mr₀/I, M = ρAgℓ²/2, I = π(r₀⁴−rᵢ⁴)/4 |
| Bend rate | dθ/dt = (σ/3r₀)·∫dx/η(T(x)) |
| Bend radius | R = L/θ |
| Outer wall | t/t₀ = 1/(1 + r₀/R) |

## Variables

| id | Type | Range | Unit |
|---|---|---|---|
| `bandLengthMm` | independent | 10–70, step 5 | mm |
| `targetAngleDeg` | independent | 30–135, step 5 | ° |
| `rotationRpm` | independent | 0–60, step 5 | rpm |
| `flame` | control | wingTop / open / luminous | — |
| `tube` | control | 6 / 8 / 10 mm OD | — |
| `inFlame` | control | switch | — |
| `pyrometerLC` | controlled | 5–25, step 5 | °C |
| `bendRadius` | dependent | — | mm |

`heating` in the simulation state is the burner (the run flag main.js
recognises, so the primary button reads "Light the burner"); `inFlame` is
whether the tube is being held in that flame. Both must be true for the
glass to gain heat — which is the distinction the experiment turns on, since
the burner stays lit while the tube comes out to be bent.

## Reused components

Nothing new was built that already existed.

* `apparatus.js` — `drawBurner` (its `air` option carries the air-hole →
  flame-type coupling this lab depends on), `label`, `noteBounds`,
  `brushedMetal`
* `realism.js` — `theme`, `rgba`, `mixColor`, `clamp`, `clock`, `bloom`
* `utils/measure.js` — `sigFig`, `mean`, `percentError`, `clamp`,
  `fitThroughOrigin`
* `utils/rng.js` — `makeRng`, `jitter`
* `components/graph.js` — `renderGraph`
* the shared fixed-timestep loop, state machine, observation table,
  IndexedDB persistence, error boundary, control widgets, tabs, viva and
  assessment panels — all unchanged

## Implementation files

| File | Role |
|---|---|
| `src/simulation/models/glass-bending.js` | the model |
| `src/simulation/renderers/chemistry-new.js` → `glassBending` | the renderer |
| `data/experiments/class-xi/XI-CHE-A02-bending-glass-tube.json` | the experiment record |
| `tests/glass-bending.test.mjs` | scientific validation, 27 checks |

Registered in `MODEL_LOADERS` (`src/main.js`), `RENDERERS`
(`chemistry-new.js`), and `SHELL` in `sw.js` (VERSION → v37).

## Validation values

`node tests/glass-bending.test.mjs` — 27 checks, all passing.

| Check | Expected | Model |
|---|---|---|
| Annealing point | ~550 °C | 552.0 °C |
| Softening point | ~720 °C | 721.9 °C |
| Working point | ~1000 °C | 1017.7 °C |
| R at L = 45 mm, θ = 90° | 28.65 mm | 28.65 mm |
| Wall ratio, same bend | 1/(1+r₀/R) = 0.8775 | 0.8775 |
| Bend rate at 760 °C | controllable, 1–200 °/s | 16.5 °/s |
| Bend rate at 650 °C | negligible | 0.13 °/s |
| Equilibrium, wing top, rotating | workable range | 940 °C |
| Equilibrium, luminous flame | below softening | 656 °C |
| θ recovered from slope of R vs L | 90° | 89.85°, r² = 0.9999 |

Expected behaviour, confirmed end to end: wing top + rotation → sound bend,
wall 0.877; luminous flame → never softens; no rotation → ΔT of 965 °C
across the wall; 16 mm spot flame at 90° → radius 10 mm, wall 0.705,
"outer wall is thin".

## Known limitations

* The band is lumped in the circumferential direction into two
  temperatures (flame side and far side), not resolved continuously.
* The tube sags under its own weight only; a hand applying force is not
  modelled, so "bending it cold snaps it" appears as "it does not bend"
  rather than as a fracture.
* Wall thinning is computed from conservation of glass in the wall, not
  from flow along the tube, so bore ovality is not modelled.
* Devitrification from prolonged heating is not modelled; soot from a
  luminous flame is.
* Annealing is modelled only as the temperature below which the shape is
  set. Residual strain from fast cooling is described in the theory and the
  viva but not simulated.

## Performance notes

Pure closed-form arithmetic plus a 9-sample trapezium integral per step —
no allocation beyond one state object per step, no particle system, no
offscreen canvas, no new dependency. It runs on the shared
`requestAnimationFrame` loop at the same fixed `FIXED_DT = 1/120` as every
other lab, so it cannot add a loop or leak one; `stopLoop()` on route change
already covers it. The renderer draws about 45 polyline points twice per
frame. Measured on the liveness gate at the same cost as the existing
chemistry benches; mobile at 390 px wide fits with no horizontal overflow.
