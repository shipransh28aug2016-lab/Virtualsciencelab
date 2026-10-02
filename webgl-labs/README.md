# Virtual Science Laboratory — WebGL benches

Physics-driven simulations for the CBSE practical syllabus. Each bench solves
its governing law every frame; none of them looks an answer up from a table.

Open `index.html` and pick a bench, or go straight to one:

| Route | Experiment | The law doing the work |
| --- | --- | --- |
| `#/XI-CHE-B01` | Determination of the melting point of an organic compound | Schröder–van Laar liquidus, binary eutectics, the lever rule |
| `#/XI-CHE-B02` | Determination of the boiling point of an organic compound | Antoine vapour pressure, Raoult's law, Trouton's rule |
| `#/XI-CHE-B03` | Crystallisation of an impure sample | Measured solubility, an exact hydrate mass balance, classical nucleation |
| `#/XII-CHE-A01` | Coagulation of colloids and the Tyndall effect | Hardy–Schulze, DLVO, Smoluchowski, Rayleigh–Mie, Stokes |

---

# XI-CHE-B03 · Crystallisation of an impure sample

Measured solubility, interpolated in (1/T, ln s) so the curve between the data
points is van 't Hoff's shape rather than a spline; and a mass balance that is
exact because it counts the water of crystallisation:

```
A − x = (s/100)(W − x(r−1))     ⟹     x = (A − sW/100) / (1 − (s/100)(r−1))
```

Eight grams of CuSO₄·5H₂O is **5.11 g of salt and 2.89 g of its own water** —
a third of the solvent in a typical determination arrives with the sample.

**This bench found a defect in the published experiment.** `XI-CHE-B03` gave
copper sulphate's solubility at the boil as 32 g/100 mL and its default solvent
volume as 26 mL "the minimum". The handbook figure is 75.4 g of anhydrous salt
per 100 g of water at 100 °C; the true minimum for 8 g is **3.5 mL**, and the
published 26 mL yields **nothing at all** at 20 °C. The JSON has been corrected.

* **Recovery is arithmetic.** 4 mL → 79% · 6 mL → 69% · 10 mL → 48% · 16 mL → 0%.
* **Cooling rate is a purity control, not a patience control.** Nucleation is
  integrated, not triggered — J = J₀e^(−B/ln²S) accumulates from the moment the
  solution passes saturation — so a slow cool nucleates early at low
  supersaturation and makes a few large crystals, and a quench nucleates late at
  high supersaturation and makes a shower of small ones. Nývlt's metastable zone
  emerges rather than being written down. 1.0 mm at 99.8% pure against 0.24 mm
  at 99.0%, with the yield barely moving.
* **Purity is measured, not claimed.** The product is handed to the
  XI-CHE-B01 liquidus: the carefully handled benzoic acid melts at 122.3 °C over
  0.2 °C, the badly handled one at 113.7 °C over 27.8 °C.
* **A pentahydrate does not melt.** It is reported as losing its water of
  crystallisation at 110 °C, and alum as melting in its own at 92.5 °C.

## What a student can do, including get it wrong

| Action | What the bench does |
| --- | --- |
| Use 26 mL "because the book said so" | No crystals at all, and the bench says the minimum is 3.5 mL. |
| Squeeze into 3 mL and quench | 86% recovery — and 0.85 g of iron(II) sulphate comes down with the product. |
| Skip the hot filtration | The balance reads *higher* and the purity falls to 86.7%: the extra weight is sand. |
| Wash with ice-cold solvent | Purity 98.1 → 99.6%, mass 3.83 → 3.67 g. The bench charges for it. |
| Try ethanol on copper sulphate | 7.0 g never dissolves. It is not a poor recrystallisation, it is a suspension. |
| Try ethanol on benzoic acid | It dissolves — and 47% is recovered against 94% from water, because ethanol's curve is 2.0× where water's is 19×. |
| Filter after it has cooled | Too late. The action is not offered, because it is not possible. |

```bash
npm run verify:cr     # 18 checks, including a control-response matrix
CHROME_PATH=/path/to/chrome node verify-render-crystallisation.mjs   # 20 checks in a real GL context
```

---

# XI-CHE-B02 · Boiling point of an organic compound

Siwoloboff's method, and two statements carry it:

```
ANTOINE   log₁₀ P°(t) = A − B / (C + t)
RAOULT    the liquid boils where  Σ xᵢ P°ᵢ(T) = P_atm
```

* **The pressure in the room is half the measurement.** Ethanol boils at
  78.3 °C at 760 mm Hg and 72.5 °C at 600. A boiling point quoted without a
  pressure is not a measurement.
* **ΔH_vap is in the same curve.** From the Antoine derivative:
  water 41.5 (lit. 40.65), benzene 32.0 (lit. 30.8) kJ/mol. Divide by T_b and
  you have **Trouton's constant** — benzene 90, obeying the rule; water 111 and
  ethanol 116, breaking it because they are hydrogen bonded. That verdict then
  chooses the constant in the Sidgwick pressure correction. The chain closes
  with nothing looked up.
* **K_b comes back out** though the engine never uses it: water 0.50
  (lit. 0.512), benzene 2.54 (lit. 2.53).
* **An involatile impurity RAISES a boiling point** — the opposite of what it
  does to a melting point, and the thing this experiment is most often got
  wrong. It falls out of Raoult's law without a second formula.
* **The reading is the last bubble on cooling**, where the vapour pressure
  falls back through atmospheric. The rapid stream on the way up is the signal
  to stop heating, not the reading.

## What a student can do, including get it wrong

| Action | What the bench does |
| --- | --- |
| Heat ethanol at 2 °C/min, flame away at the rapid stream | Reads 78.5 °C. Stream-start and stream-stop agree, which is why you slow down. |
| Heat at 12 °C/min | The stream appears at 79.8 °C and ceases at 78.6 °C. The manual reads it on the way down for this reason. |
| Drop the pressure to 640 mm Hg | Boils at 74.5 °C. Sidgwick corrects it back to 79.5 °C. |
| Use the crude sample | Boils **higher**, 81 °C. Involatile material raises a boiling point. |
| Aniline in a water bath | Never boils. The bath stops at 100 °C and says so. |
| Take the capillary away | No bubbles at all — then the tube superheats past its boiling point in silence and bumps. The notebook records "bumped — discard". |
| Add benzene to toluene | Boils at 92.1 °C, between the two, and the vapour is 71 mol% benzene. Keep boiling and the temperature climbs as the benzene leaves — the boiling **range**. |

```bash
npm run verify:bp     # 16 thermodynamics checks, no browser
CHROME_PATH=/path/to/chrome node verify-render-boiling-point.mjs   # 23 checks in a real GL context
```

---

# XI-CHE-B01 · Melting point of an organic compound

One equation carries the whole experiment:

```
ln x_A = −(ΔH_fus,A / R) · (1/T − 1/T_A)
```

Everything a Class XI student is asked to observe is a consequence of it, and
none of it is stored anywhere as a fact:

* **Depression.** Differentiating at x → 1 gives back the textbook cryoscopic
  constant, K_f = RT²M/1000ΔH. The engine never uses it; it reproduces it —
  naphthalene 6.98 against a measured 6.94 K kg mol⁻¹.
* **Range.** Melting *begins* at the eutectic, found by intersecting the two
  liquidus branches. Naphthalene (80.3 °C) and biphenyl (69.2 °C) come out
  liquid together at 40.9 °C and 56 mol%, against a measured 39.4 °C at 55 mol%
  — from the pure-component data alone.
* **Sharpness.** A pure sample has no second branch to meet, so its range
  collapses. Sharpness is an output, not a flag.
* **Mixed melting point.** The same equation with the second component named by
  the student: benzoic acid + benzoic acid melts unchanged, benzoic acid +
  salicylic acid is depressed 26 °C.

## What a student can do, including get it wrong

| Action | What the bench does |
| --- | --- |
| Recrystallised naphthalene at 2 °C/min | Melts 80–81 °C within a degree. Sharp. |
| The crude sample | Sinters from 41 °C — its eutectic — wets at 71 °C, clears at 78 °C. Lower *and* wider, from one equation. |
| Heat at 12 °C/min | The range smears by √(2τΛr) ≈ 4 °C and the clear point rides 2 °C high. Latent heat, not carelessness. |
| Benzoic acid in a water bath | Never melts. The bath stops at 100 °C and says so. |
| Read it on a 1 °C thermometer | A tenth-degree sharpness is invisible. The instrument decides what can be seen. |
| Re-melt a urea capillary | Clears 7 °C lower: some of it is biuret now. |
| Leave naphthalene hot | It sublimes out of the capillary. The reading is unaffected — what is left is still pure. |
| Shut the air hole | A luminous, sooty, cooler flame. |

## Files

| File | What it owns |
| --- | --- |
| `src/experiments/XI/Chemistry/XI-CHE-B01/engine/compounds.js` | Measured data: melting points, enthalpies of fusion, molar masses, specific heats. |
| `.../engine/thermochemistry.js` | The liquidus, the eutectic, the lever rule, the heat balance. No React, no three. |
| `.../engine/useMeltingPointEngine.js` | Zustand. Setup and bench memory kept apart. |
| `.../three/BathShaderMaterial.jsx` | Paraffin: Beer–Lambert tint, schlieren tied to dT/dy, convection, smoke point. |
| `.../three/CapillaryShaderMaterial.jsx` | The 3 mm that matter: packed powder → sintering → rising meniscus → clear. |
| `.../three/FlameShaderMaterial.jsx` | The burner: height from gas flow, colour from the air hole. |
| `.../three/ThieleTubeSimulation.jsx` | The apparatus. Owns the only render loop. |
| `.../ui/MeltingPointHUD.jsx` | Controls, instruments, observation table. |

```bash
npm run verify        # 71 engine checks across all four benches, no browser
npm run verify:mp     # 15 thermochemistry checks
CHROME_PATH=/path/to/chrome node verify-render-melting-point.mjs   # 23 checks in a real GL context
CHROME_PATH=/path/to/chrome node verify-render.mjs                 # 24 checks for XII-CHE-A01
```

Three defects the verification caught in this bench, none of them visible by eye:

* the melted fraction was read out of a selector that built a fresh object each
  call, so `useSyncExternalStore` saw the store change during rendering and
  React gave up with "maximum update depth exceeded". The bench rendered
  nothing at all;
* the render probe scraped rendered text for "Last crystal", which also appears
  in the status sentence and as a column heading, and silently read the wrong
  one. The HUD now carries stable hooks for it;
* `integrate()` was stepped explicitly, so the ×300 clock handed it fifteen
  simulated seconds against a one-and-a-half second time constant. It now
  sub-steps internally, and a bench cannot be made to boil by changing the
  clock.

---

# Coagulation of Colloids & the Tyndall Effect

A WebGL bench for the CBSE Class XII Surface Chemistry practical. Choose a sol,
choose an electrolyte, dose it, and watch what the chemistry actually does.

Nothing in it is scripted. There is no table of outcomes, no keyframed animation
and no "if AlCl₃ then precipitate" anywhere in the source. Every number the
student sees — and every pixel of the beaker — is solved each frame from the
Hardy–Schulze rule, DLVO stability, Smoluchowski aggregation, Mie/Rayleigh
scattering and Stokes settling.

## What a student can do, including get it wrong

| Action | What the bench does |
| --- | --- |
| AlCl₃ on As₂S₃ at 0.5 mM | Flocculates in under a second. Al³⁺ is the counter-ion; CCC 0.093 mM. |
| The same AlCl₃ at the same 0.5 mM on Fe(OH)₃ | Nothing at all. The sol is positive, so the coagulating ion is Cl⁻, and that needs 11.6 mM. |
| K₃[Fe(CN)₆] on Fe(OH)₃ | The most powerful salt in the set — [Fe(CN)₆]³⁻ at z = 3, CCC 0.096 mM. On As₂S₃ the same salt is the feeblest. The field inverts, which is the entire content of the rule. |
| 80 mM AlCl₃ on As₂S₃ | Charge reversal. The sol re-stabilises and the beaker runs backwards. Adding more undoes it. |
| Coagulate, then leave it standing | The flocs stall around a micron and nothing settles. Brownian collisions alone cannot build a floc heavy enough for Stokes. |
| Stir it | Orthokinetic collisions take over, flocs reach the size the shear can hold (R_max = C/√G), and the beaker clears. Stirring *harder* gives smaller flocs, not bigger ones. |
| NaCl on starch sol | Needs ~3 mol/L, and then it is salting out, not coagulation. |

## The three pieces

| File | What it owns |
| --- | --- |
| `src/engine/physics.js` | All the chemistry. No React, no three, no store — which is what lets it be tested from plain Node against Freundlich's measured CCC data. |
| `src/engine/useChemistryEngine.js` | Zustand. Holds what the student chose and what the beaker remembers; calls `integrate()` once per frame. |
| `src/three/LiquidShaderMaterial.jsx` | GLSL. Three integrals along the view ray: Beer–Lambert transmission, the single-scattering Tyndall integral against a real beam cylinder, and a Kubelka–Munk diffuse reflectance. |
| `src/three/BeakerSimulation.jsx` | R3F. Refracting glass, the liquid, and 1200 instanced colloidal particles under Brownian motion, clumping and Stokes settling. Owns the only render loop. |
| `src/ui/LabHUD.jsx` | Tailwind + Framer Motion. Controls, live instruments, and the observation table. A DOM sibling of the canvas, not a `<Html>` inside it. |

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run verify     # 22 physics checks, no browser needed
npm run build && npm run preview
CHROME_PATH=/path/to/chrome node verify-render.mjs   # 22 checks in a real GL context
```

## Verification

`npm run verify` holds the engine to the data book: measured critical
coagulation concentrations (As₂S₃ 51 / 0.69 / 0.093 mM for Na⁺ / Ba²⁺ / Al³⁺),
the Smoluchowski half-time, the λ⁻⁴ Tyndall ratio, Stokes settling on fractal
aggregates, shear breakup, charge reversal, and frame-rate independence of the
integrator.

`verify-render.mjs` drives the built app in a real GL context and checks the
other half: that both shaders compile, that the beaker is actually drawn and
renders brown rather than grey, that the HUD is wired to the engine, and that a
student following the procedure — including the procedure that should fail —
sees what the engine says. It runs against SwiftShader, so it needs no GPU.

Two failures worth recording, because both were invisible to the eye and obvious
to a test:

* the aggregation ODE was stepped with explicit Euler, so a ×100 clock overshot
  `n` through zero in one step, pinned it to its floor and reported a 7 mm
  "floc" that was nothing but the floor. It is now integrated analytically.
* the liquid was a transparent material inside a transmissive glass wall, and
  three builds a transmission backdrop from the opaque pass only — so the glass
  sampled the empty room and the sol was invisible inside its own beaker.
