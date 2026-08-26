# CBSE V-LAB 2026–27

An offline-first virtual **science laboratory** for CBSE Classes XI & XII —
Physics (042) and Chemistry (043).
Students set up apparatus, change variables, take readings to the instrument's least count,
plot the graph, calculate a result, make mistakes, and face a viva — with the network off.

> **Not** a video library. **Not** an animation gallery. The physics is computed live from
> the actual equations; every reading is quantised to a real least count.

---

## Run it

```bash
npm start          # → http://localhost:8080
```

The app and the dev server are **pure vanilla JavaScript with zero third-party
code** — no build step, no bundler, nothing to install. `npm start` works on a
freshly cloned copy with an empty `node_modules`.

### Keeping the folder small

The project is about **5 MB across ~300 files**. Development tooling is not, and
it is easy to let it swamp the project:

| directory | size | needed for |
|---|---|---|
| `.cache/` | ~862 MB | Chromium builds for screenshot tests |
| `.npm/` | ~66 MB | npm's own download cache |
| `node_modules/` | ~24 MB | `jsdom`, `fake-indexeddb`, `playwright-core` |
| `docs/screens/` | ~28 MB | PNGs generated to review canvas layout |

Left alone these grow to **~950 MB and 3000+ files**, which anything that
uploads, zips or syncs the project has to walk — slow, and prone to failing
part-way and needing several attempts. None of it belongs to the project and
all of it is gitignored.

```bash
npm run clean          # report what can go
npm run clean -- -f    # delete it — npm start still works afterwards
npm run setup          # restore the test tooling when you want to run tests
```

Only the tests need those directories. Clean before handing the project on.

Once the site is opened, it works offline forever: the service worker precaches
the shell, and every experiment runs from local files with **no network calls at
runtime**. On Android/desktop Chrome you can "Install" it as a PWA.


## Built to be read from the back of the room

The default theme is **light on purpose**. A projector cannot produce black — it
leaves the screen unlit, and ambient classroom light turns that into grey, so a
dark UI loses its contrast exactly where you need it. The background is a warm
off-white rather than pure white (which glares), the ink is deep navy rather than
black (which shimmers), and instrument readouts are set at 23 px so they carry to
roughly 40 feet. A **dim-room theme** is one tap away in the header and persists.

Every colour pair in both themes is machine-checked at AAA (7:1) for body text:

```
npm run contrast
CLASSROOM   body 16.10:1 · muted 7.11:1 · accents 5.3–8.1:1   PASS
DARK        body 14.24:1 · muted 9.28:1 · accents 6.8–10.1:1  PASS
```

## Verify it

```bash
npm run check              # layers + curriculum audit + all tests
npm run curriculum:audit   # CBSE traceability report
npm test                   # unit + integration: physics, workflow, accessibility
```

All three gates currently pass:

```
Layer & offline lint ......... PASS   (pure layers DOM-free, no remote assets)
CBSE 2026-27 audit ........... PASS   (79 implemented, 79 verified, 0 duplicates)
Contrast audit ............... PASS   (both themes, AAA for body text)
Tests ........................ 740 passed, 0 failed
```

And the end-to-end run in a real browser (`npm run e2e`, ~3 min — it times the
pendulum in real time, exactly as a student would):

```
npm run e2e              (Physics)
PASS  g recovered from the UI = 9.731 m/s²   (true 9.792 → 0.6 % error)
PASS  assessment scored: 70/100
PASS  observations survived a reload
PASS  app boots OFFLINE, observations readable offline

npm run e2e:chem         (Chemistry)
PASS  three titrations concordant, spread 0.00 mL  [19.5, 19.5, 19.5]
PASS  strength from the UI = 3.9 g/L          (true 3.92)
PASS  normality = 0.0975 N                    (true 0.098)
PASS  times rise on dilution  [39.9, 50.3, 67.2, 99.9 s]
PASS  order of reaction from the UI = 1       (r² = 0.9998)
PASS  chemistry lab boots OFFLINE

npm run e2e:b2           (the six newest experiments, 17 assertions)
PASS  vernier mean diameter from the UI = 2.14 cm     (true 2.14)
PASS  surface tension = 0.0727 N/m                    (accepted 0.0727)
PASS  metre bridge resistance = 4.694 Ω               (true 4.7)
PASS  diode knee voltage = 0.639 V                    (nominal 0.7, extrapolated)
PASS  HCl pH 1, NaOH pH 13, most acidic identified
PASS  Nernst E° = 1.098 V, slope −0.0292 V per decade (expect 1.10, −0.0295)

npm run e2e:b3           (the six newest experiments, 18 assertions)
PASS  screw gauge mean diameter = 0.4125 mm            (true 0.412)
PASS  coefficient of friction = 0.42                   (true 0.42)
PASS  cooling constant = 0.001637 s⁻¹                  (true 0.00165)
PASS  speed of sound = 348.2 m/s                       (accepted 347.7)
PASS  minimum deviation = 38.94°, μ = 1.52             (true 38.93, 1.52)
PASS  strong acid pH 1.00 well below weak acid pH 2.88 at equal concentration

npm run e2e:b4           (the six newest experiments, 28 assertions)
PASS  T = 2.015 s for 30 g AND 200 g — spread 0.0000 s, so T is mass-independent
PASS  metre bridge: single 4.703 Ω, series 12.9 Ω, parallel 2.984 Ω
PASS  HCl against standard Na₂CO₃ = 3.796 g/L, 0.104 N, methyl orange preselected
PASS  Young's modulus of steel = 2.00 × 10¹¹ N·m⁻²    (accepted 2.00 × 10¹¹)
PASS  P × V constant to 0.7 % from 46 to 116 cm Hg     (PV = 1140)
PASS  concave mirror f = 15.01 cm, R = 30 cm; refuses to record inside the focus

npm run e2e:b4-responsive  (dark theme + 360 px, 22 assertions)
PASS  all six canvases repaint dark (luma 26) — no white slab in the dim-room theme
PASS  no horizontal overflow at 360 px on any experiment (0 px)
PASS  every control target ≥ 32 px tall

npm run e2e:b5           (24 assertions)
PASS  f × l = 4999 Hz·cm constant across 256–512 Hz  (law of length)
PASS  quadrupling the load doubles the resonant length, 19.5 → 39.0 cm
PASS  horseshoe magnet → mains 50 Hz; electromagnet → driven 100 Hz, mains 50 Hz
PASS  galvanometer G = 59.98 Ω, figure of merit 26.1 µA/div  (true 60, 26)
PASS  ammeter shunt 0.047 Ω in parallel; voltmeter 3786 Ω in series

npm run e2e:b6           (the five newest experiments, 19 assertions)
PASS  convex mirror R = 50 cm from the retrace null, f = 24.97 cm  (true 25)
PASS  refuses to record away from the null position — no number without a retrace
PASS  concave lens f = −14.99 cm across four virtual-object distances  (true −15)
PASS  glass slab μ = 1.50 crown, 1.62 flint, from the apparent-depth shift
PASS  water μ = 1.333 by the liquid lens and 1.331 by the concave mirror
      — two independent methods agreeing to 0.002

npm run e2e:b6-responsive  (dark theme + 360 px, 19 assertions)

npm run e2e:b7           (the five newest experiments, 23 assertions)
PASS  brass lamina V = 4.598 cm³; the area and thickness errors add to give the volume's
PASS  watch glass R = 22.47 cm, and R is the sum of its l²/6h and h/2 terms
PASS  body A m = 24.386 g, resolved finer than the smallest weight in the box
PASS  refuses to record with the pointer off the scale — a null instrument gives no reading
PASS  parallelogram gives S = 152.2 gwt = 1.491 N; refuses when S > P + Q
PASS  roller weight from the slope = 254.2 gwt, r² = 0.9999; a sliding block is diagnosed

npm run e2e:b7-responsive  (dark theme + 360 px, 19 assertions)

npm run e2e:b8           (the two newest experiments, 19 assertions)
PASS  castor oil η = 0.9871 Pa·s (9.871 poise); flow confirmed streamline
PASS  graphical route gives η = 0.9957 Pa·s from the slope of v against r²
PASS  a large sphere in thin oil is diagnosed as turbulent — Stokes' law fails
PASS  refuses a nylon sphere in glycerine — it floats, so there is no terminal velocity
PASS  copper c = 382.8 J/kg/K; aluminium c = 893.4 J/kg/K
PASS  omitting the water equivalent LOWERS c: 364.9 < 382.8, and says so

npm run e2e:b8-responsive  (dark theme + 360 px, 10 assertions)

npm run e2e:xiib         (the four Section B optics activities, 35 assertions)
PASS  B4 recovers the refractive index of crown glass: "μ = 1.511"
PASS  B4 the shift grows with the angle (3.8 then 20)
PASS  B5 the NARROWER slit gives the WIDER pattern (19.4 > 9.8 > 5)
PASS  B5 recovers the wavelength of red light: "λ = 646.7 nm"
PASS  B6 recovers the focal length of the lens: "f = 15 cm"
PASS  B6 refuses a screen reading for a virtual image
PASS  B7 refuses to measure a pair of zero total power
PASS  B7 reports whether the specification was met: "Specification met — best 8.6 cm"

npm run e2e:xiib-responsive  (dark theme + 360 px, 16 assertions)

npm run e2e:xiib2        (the three Section B electronics activities, 32 assertions)
PASS  B1 a wrong naming does not reveal the identity
PASS  B1 reports how many kinds were found: "4 of 4 kinds identified"
PASS  B2 flags one-way flow for a healthy diode
PASS  B2 a wrong verdict does not reveal the fault
PASS  B3 resistance rises as the lamp moves away (239 → 3156)
PASS  B3 recovers γ in a dark room: "γ = 0.72"
PASS  B3 room light depresses γ (0.596 against 0.72 in the dark)

npm run e2e:xiib2-responsive  (dark theme + 360 px, 13 assertions)

npm run e2e:chemxiia     (Class XII Chemistry Surface Chemistry, 30 assertions)
PASS  A01 coagulation value falls as active-ion charge rises (104 > 0.215 > 0.096)
PASS  A01 refuses to coagulate a lyophilic sol
PASS  A02 recovers the time constant: "τ = 30 min"
PASS  A02 a stalled run never gets clean (37.7 % removed at 90 min)
PASS  A03 an emulsifier multiplies the separation time (67 s → 1635 s)
PASS  A03 refuses a dilution test with no emulsifier

npm run e2e:chemxiia-responsive  (dark theme + 360 px, 13 assertions)

npm run e2e:chemxiic     (Class XII thermochemistry, 27 assertions)
PASS  C01 KNO₃ COOLS the water and gives a POSITIVE ΔH
PASS  C01 the hydration enthalpy is near −78 kJ mol⁻¹
PASS  C02 strong acid + strong base gives about −57 kJ mol⁻¹
PASS  C02 ignoring the water equivalent makes ΔH too small (-44.86 against -56.85)
PASS  C03 the heat evolved PEAKS at equimolar

npm run e2e:chemxiic-responsive  (dark theme + 360 px, 13 assertions)

npm run e2e:chemxiie     (Class XII chromatography, 33 assertions)
PASS  E01 Calculate stays disabled after one chromatogram
PASS  E01 solvent front grew from 7.1 to 13 cm
PASS  E01 Rf held at 0.958 then 0.946 despite the longer run
PASS  E01 explains why it refused: "The solvent level is at or above the spotting line."
PASS  E02 reports that the close Rf pair failed to resolve

npm run e2e:chemxiie-responsive  (dark theme + 360 px, 10 assertions)
```

**Boot budget** — the home screen must stay cheap to open. `npm run perf:boot`
fails the build above 20 requests or 400 KB, which stops a stray static import
pulling the whole simulation tree back into the boot path.

```
npm run perf:boot
fast 4G   first cards visible:   1466 ms    11 requests   264 KB
slow 3G   first cards visible:   8478 ms    11 requests   269 KB

npm run e2e:offline-install   (real service-worker install, then network off)
PASS  service worker installed and active
PASS  home screen renders offline (34 cards, same as online)
PASS  previously-opened lab works offline
PASS  NEVER-VISITED lab still works offline (lazy chunk was precached)
```

Models and renderers are loaded on demand, and the catalogue is built from a
generated 49 KB index rather than 1.5 MB of experiment JSON. After adding an
experiment, run `npm run build:index`; `npm run check` fails if you forget.

---

## What is in this release

**Physics (042)**

| ID | Class | Sec | Official CBSE practical | Result computed |
|---|---|---|---|---|
| `XI-PHY-A01` | XI | A·1 | Vernier callipers: diameter, internal diameter, depth | mean dimension + volume, with signed zero-error correction |
| `XI-PHY-A02` | XI | A·2 | Screw gauge: wire diameter and sheet thickness | mean diameter + area of cross-section |
| `XI-PHY-A03` | XI | A·3 | Volume of an irregular lamina using a screw gauge | `V = A × t`; the two percentage errors add |
| `XI-PHY-A04` | XI | A·4 | Radius of curvature by spherometer | `R = l²/6h + h/2`, both terms shown |
| `XI-PHY-A05` | XI | A·5 | Mass of two objects using a beam balance | resting point + sensitivity, finer than the smallest weight |
| `XI-PHY-A06` | XI | A·6 | Weight of a body by the parallelogram law | `S = √(P² + Q² + 2PQ cos θ)` |
| `XI-PHY-A10` | XI | A·10 | Downward force along an inclined plane | `W` from the slope of `F` against `sin θ` |
| `XI-PHY-A07` | XI | A·7 | Simple pendulum, L–T² graph, second's pendulum | `g` from slope, second's-pendulum length |
| `XI-PHY-A08` | XI | A·8 | Does the time period depend on the mass of the bob? | spread in `T` against the timing uncertainty; reuses the A·7 model |
| `XI-PHY-A09` | XI | A·9 | Limiting friction and normal reaction | `μ` from the F–R slope, plus the area-independence check |
| `XI-PHY-B01` | XI | B·1 | Young's modulus by Searle's apparatus | `Y` from the load–extension slope, readings past the elastic limit discarded |
| `XI-PHY-B02` | XI | B·2 | Force constant of a helical spring | `k` from load–extension slope |
| `XI-PHY-B03` | XI | B·3 | Boyle's law: volume against pressure | `PV` constant; P against 1/V straightens the hyperbola |
| `XI-PHY-B07` | XI | B·7 | Specific heat capacity by the method of mixtures | `c` from the heat balance, including the water equivalent |
| `XI-PHY-B08` | XI | B·8 | Law of length: frequency against resonant length | `f × l` constant; wave speed from the slope |
| `XI-PHY-B09` | XI | B·9 | Law of tension: length against tension | `l ∝ √T`; μ recovered from the slope |
| `XI-PHY-B04` | XI | B·4 | Surface tension of water by capillary rise | `T = rhρg/2`, plus Jurin's law from the h–1/r graph |
| `XI-PHY-B05` | XI | B·5 | Coefficient of viscosity by terminal velocity | `η = 2r²(ρ − σ)g / 9v`, with Reynolds and wall checks |
| `XI-PHY-B06` | XI | B·6 | Cooling curve, Newton's law of cooling | `k` from the ln(excess)–time slope |
| `XI-PHY-B10` | XI | B·10 | Speed of sound by resonance tube | `v = 2f(l₂−l₁)`, end correction cancels |
| `XII-PHY-A01` | XII | A·1 | Resistivity of wires from a V–I graph | `R` from slope, then `ρ = RπD²/4L` |
| `XII-PHY-A02` | XII | A·2 | Resistance of a wire using a metre bridge | `S = R(100−l)/l`, resistivity, series/parallel laws |
| `XII-PHY-A03` | XII | A·3 | Laws of combination of resistances | `Rs = R₁+R₂`, `Rp = R₁R₂/(R₁+R₂)`; reuses the A·2 model |
| `XII-PHY-A04` | XII | A·4 | Galvanometer resistance by half deflection | `G = SR/(R−S)` and the figure of merit `k` |
| `XII-PHY-A05` | XII | A·5 | Converting a galvanometer to an ammeter/voltmeter | shunt `IgG/(I−Ig)` or series `V/Ig − G`; reuses A·4 |
| `XII-PHY-A06` | XII | A·6 | Frequency of the AC mains with a sonometer | 50 Hz; an electromagnet drives at 100 Hz and must be halved |
| `XII-PHY-B02` | XII | B·2 | Focal length of a convex mirror using a convex lens | `R = v₁ − d` at the retrace null, `f = R/2` |
| `XII-PHY-B04` | XII | B·4 | Focal length of a concave lens using a convex lens | `f = uv/(u−v)`, negative, from a virtual object |
| `XII-PHY-B06` | XII | B·6 | Refractive index of glass by travelling microscope | `μ = t/(t − shift)` from the apparent depth |
| `XII-PHY-B07` | XII | B·7 | Refractive index of a liquid, convex lens + plane mirror | `1/f₂ = 1/F − 1/f₁` then `μ = 1 + R/|f₂|` |
| `XII-PHY-B08` | XII | B·8 | Refractive index of a liquid using a concave mirror | `μ = R/R′` |
| `XII-PHY-B01` | XII | B·1 | Focal length of a concave mirror (u–v method) | `f` from `uv/(u+v)` and the 1/u–1/v intercept, `R = 2f` |
| `XII-PHY-B03` | XII | B·3 | Focal length of a convex lens (u–v method) | `f` two ways + power in dioptre |
| `XII-PHY-B05` | XII | B·5 | Angle of minimum deviation for a prism | `δm` from the fitted curve vertex, then `μ` |
| `XII-PHY-B09` | XII | B·9 | I–V characteristic of a p-n junction diode | knee voltage by extrapolation, static and dynamic resistance |

**Chemistry (043)**

| ID | Class | Cat | Official CBSE practical | Result computed |
|---|---|---|---|---|
| `XI-CHE-B01` | XI | B·1 | Melting point of an organic compound | melting point and melting *range*; range is the criterion of purity |
| `XI-CHE-B02` | XI | B·2 | Boiling point of an organic compound | boiling point, corrected from the observed pressure to 760 mm Hg |
| `XI-CHE-B03` | XI | B·3 | Crystallisation of an impure sample | mass recovered, percentage recovery, purity from the product's melting point |
| `XI-CHE-C01` | XI | C·1 | pH of acids, bases, salts and fruit juices | pH, pOH, [H⁺], nature; dilution law check |
| `XI-CHE-C02` | XI | C·2 | Strong vs weak acid at equal concentration | degree of dissociation; reuses the C·1 model |
| `XI-CHE-E03` | XI | E·3 | Strength of NaOH against standard oxalic acid | `N₁V₁ = N₂V₂` → normality and g/L |
| `XI-CHE-E05` | XI | E·5 | Strength of HCl against standard Na₂CO₃ | normality × 36.5 → g/L; methyl orange; reuses the E·3 model |
| `XII-CHE-B01` | XII | B·1 | Rate of reaction of thiosulphate with HCl | order of reaction; `Eₐ` from the Arrhenius plot |
| `XII-CHE-D01` | XII | D·1 | Cell potential vs concentration (Nernst) | `E°` from the intercept, slope −0.0591/n |
| `XII-CHE-A01` | XII | A·1 | Preparation of a lyophilic and a lyophobic sol | coagulation values; Hardy-Schulze as a measured ratio |
| `XII-CHE-A02` | XII | A·2 | Dialysis of the sol | time constant τ from the slope of ln C against t |
| `XII-CHE-A03` | XII | A·3 | Role of emulsifying agents | stabilisation ratio against a same-oil control |
| `XII-CHE-C01` | XII | C·1 | Enthalpy of dissolution of CuSO₄ or KNO₃ | ΔH, plus hydration enthalpy by Hess’s law |
| `XII-CHE-C02` | XII | C·2 | Enthalpy of neutralisation of HCl and NaOH | ΔH per mole of water formed |
| `XII-CHE-C03` | XII | C·3 | Enthalpy change on mixing acetone and chloroform | ΔH against composition, peaking at equimolar |
| `XII-CHE-E01` | XII | E·1 | Separation of leaf and flower pigments by paper chromatography | Rf of each pigment, constant across run lengths |
| `XII-CHE-E02` | XII | E·2 | Separation of two cations from an inorganic mixture | Rf of each cation, and whether they resolve |

**PHYSICS IS COMPLETE.** Every experiment in the official CBSE Physics
practical syllabus — Classes XI and XII, Sections A and B, 35 in total
(20 + 15) — is implemented, verified and tested.

The syllabus also lists *activities* alongside the experiments, and they carry
marks. **Class XI Physics is now complete — all 34 items, both sections,
experiments and activities alike.** The seven Section A activities
(`XI-PHY-ACT-A1` … `A7`): the paper scale of a given least count, the principle
of moments, graph plotting with error bars, rolling friction, range against
angle of projection, energy conservation on a double inclined plane, and the
dissipation of a pendulum's energy. Each yields a checkable number, and three
of them also score the student's JUDGEMENT — the choice of axis scale, whether
error bars were drawn, whether the slope was taken from the line or from two
points. The seven Section B activities follow: the cooling curve for molten
wax, the bi-metallic strip, the expansion of a liquid in its container,
detergent and surface tension, the factors governing the rate of loss of heat,
the depression of a loaded beam, and the Venturi effect.

**Class XII Section A is complete** — all six activities: the impedance of an
LR circuit, the charging of a capacitor, the household lighting circuit, the
assembly of a given circuit, potential drop along a wire, and finding the fault
in a given circuit. **Class XII Section B now adds the four optics activities**
(`XII-PHY-ACT-B4` … `B7`): lateral deviation through a glass slab, diffraction
at a thin slit, the nature and size of the image formed by a convex lens or
concave mirror, and obtaining a lens combination of a specified focal length.
Two of these turn on a *refusal* that carries the physics — a slab at normal
incidence shifts nothing, and a virtual image cannot be caught on any screen.

**Section B is now complete**, and with it every activity in the Class XII
Physics syllabus. The last three are electronics (`XII-PHY-ACT-B1` … `B3`):
identifying a diode, an LED, a resistor and a capacitor from a mixed tray;
using a multimeter to show unidirectional flow and to judge working order; and
the effect of light intensity on an LDR. The LDR activity chains the
inverse-square law to the photoconductive power law, so the slope of the
log-log plot is **2γ rather than γ** — and leaving the room lights on depresses
the answer by about 18 %, which the app diagnoses rather than hides.

The other **39 verified practicals** from the official list appear in the catalogue marked
*Planned* and are **not clickable** — no empty stubs pretending to be experiments.
`docs/COVERAGE.md` explains what remains, which items are quantitative
simulations, which can only honestly be delivered as guided observation, and
which five are manual glass-working and weighing skills that **will not** be
simulated because a browser cannot assess a student's hands.

## Every experiment ships with

- curriculum mapping traced to the official PDF (unit, chapter, section, serial number)
- apparatus list with *why each item is used*
- numbered procedure with checkpoints
- live simulation driven by the real equation
- observation table with least-count quantisation → CSV export
- auto-plotted graph with least-squares best-fit line
- calculated result compared against the accepted value
- safety notes and sources of error
- **error simulation** — wrong wiring, over-amplitude, past the elastic limit — each answered with *why*, never a bare "wrong"
- 8–9 question viva bank with expected concept + common misconception
- pre-lab / during-lab / post-lab competency assessment with weighted scoring
- notebook saved to IndexedDB

---

## Architecture in one picture

```
data/*.json           academic content, zero logic
   └─ src/curriculum   registry + validation      ─┐
   └─ src/simulation/models   PURE physics         │ no DOM access,
   └─ src/assessment   scoring, viva               │ enforced by lint
                              ↓                   ─┘
      src/core         state machine, routing
      src/components   the only DOM writers
      src/offline      IndexedDB + service worker
```

`npm run lint:layers` fails the build if a physics model ever touches `document`,
or if any file references a remote URL.

The science is separated from the drawing: each model exports
`validate / init / step / measure / derive`, and a *separate* renderer draws it.
`step()` is pure and deterministic; realistic human scatter comes from a **seeded PRNG**,
so a teacher can reproduce a student's exact run.

## Docs

| File | Contents |
|---|---|
| `docs/ARCHITECTURE.md` | layering, stack trade-offs, performance budget |
| `docs/CURRICULUM.md` | the authority rule, verified scope, versioning policy |
| `docs/EXPERIMENT_AUTHORING.md` | how to add experiment #5 |
| `docs/OFFLINE_ARCHITECTURE.md` | caching, IndexedDB, sync queue |
| `docs/TESTING.md` | what is tested and how to run it |
| `docs/CHANGELOG.md` | version history |

## Curriculum authority

> CBSE, *Physics, Subject Code 042, Class XI–XII (2026-27)*
> https://cbseacademic.nic.in/web_material/CurriculumMain27/SecPart2/Physics_SecP2_2026-27.pdf

Coaching sites and blogs were used only to *locate* this document. Every practical string
in `data/curriculum/cbse-2026-27.json` is copied from it, and the audit script fails the
build if an experiment cannot be traced back to a line in that list.

## Deliberate limits

- **Physics and Chemistry only.** Biology is not shipped because its official 2026-27
  PDF has not been read with the same rigour. Fabricating it would violate the first
  rule of this project.
- **Viva is self-assessed.** Grading free-text answers offline would need an LLM; instead
  the student answers aloud, reveals the expected concept, and rates themselves. Honest
  rather than fake-intelligent.
- **Simulations are models.** Assumptions and valid ranges are printed in the Theory tab
  of every experiment.
