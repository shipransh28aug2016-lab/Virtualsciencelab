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
