# Missing-lab inventory

Derived, not assumed. Sources: `data/curriculum/cbse-2026-27.json` (the
official practical lists), `data/experiments/index.json`, every experiment
JSON's `curriculumMapping`, `MODEL_LOADERS` in `src/main.js`, the renderer
registry, and the model directory. Script: cross-reference of every
curriculum practical against the section + serial each experiment claims.

## Headline

**There are no partially-built, placeholder or orphaned labs.** The gaps are
narrower and more specific than "missing labs":

| Category | Count | Detail |
|---|---|---|
| 1. Fully implemented | **101** | all `contentStatus: published`, all schema-complete |
| 2. Partially implemented | **0** | every experiment has all 14 required top-level sections |
| 3. Placeholder | **0** | no stub models, no stub renderers, no TODO markers |
| 4. In navigation but missing | **0** | the index is generated from the directory; it cannot drift |
| 5. Referenced in code but not implemented | **18 files** | see below — the real gap |
| 6. Completely absent from the syllabus coverage | **3** | see below |

Cross-check counts: 104 curriculum practicals · **101 covered** · **3
uncovered** (was 4; `XI-CHE-A02` has since been built). 76 models on disk, 76 loader entries, 76 used by an experiment —
**no orphan in either direction**. 6 renderer modules, every renderer name
used by an experiment resolves.

## Category 6 — curriculum practicals with no lab

| Lab | Subject | Class | Existing Route | Status | Existing Related Lab | Build Complexity |
|---|---|---|---|---|---|---|
| Cutting a glass tube and glass rod | Chemistry | XI | none (`§A·1`) | Absent | none | Medium |
| **Bending a glass tube** | Chemistry | XI | `#/exp/XI-CHE-A02` | **BUILT** | `XI-CHE-B01` melting point (burner + heat field) | Medium |
| Drawing out a glass jet | Chemistry | XI | none (`§A·3`) | Absent | `XI-CHE-B01` melting point | Medium |
| Boring a cork | Chemistry | XI | none (`§A·4`) | Absent | none | Low |

All four are CBSE Class XI Chemistry **Section A — Basic Laboratory
Techniques**, and all four are in the official list.

### The standing decision, and why this reverses part of it

`docs/COVERAGE.md` excludes all four as manual glass-working skills:
*"A browser cannot watch a student's hands … simulating them would be
theatre, not assessment."*

That reasoning is sound **for assessing dexterity** and is not being
overturned. It does not hold for the underlying physics. Bending a glass
tube is governed by quantities a simulation can model honestly — the
temperature of the heated band against time, the softening range of
soda-lime glass, how evenly the heat is distributed around and along the
tube, and the wall strain the resulting bend radius imposes. Every rule the
student is told to obey at the bench (broad flame, rotate continuously,
take it out of the flame before bending, do not bend it cold) follows from
those quantities, and a student who changes one and watches the tube kink,
thin or crack has learned the reason rather than the rule.

So one of the four is built, on that basis and no wider claim. The lab
models the apparatus, not the hands; the limitation is stated in the lab's
own documentation and in its on-screen safety notes.

`XI-CHE-A04` (boring a cork) has no comparable physics — it is a procedure
with a tool-size choice — and remains out of scope on the original
reasoning.

## Category 5 — referenced in code but not implemented

Every one of the 101 experiments declares
`scientificValidation.testFile`, naming a test that is supposed to check its
model against the analytical solution. **17 of the 18 distinct paths are still missing.** (`tests/glass-bending.test.mjs`,
declared by `XI-CHE-A02`, was written with that lab and does exist.)

```
tests/models.test.js  tests/chemistry.test.js  tests/simple-pendulum.test.js
tests/batch2 … batch16.test.js   (15 more)
```

This is the largest real gap in the repository: 100 of the 101 labs assert a
validation layer that does not exist. It is not a lab, so it is out of scope for this
command, and it is recorded here as the highest-value follow-up.

## What was checked and found clean

* No experiment JSON is missing a required section (14/14 present in all 100).
* No experiment has an empty `procedure`, `viva`, `variables`, `simulation`
  or `scientificValidation`.
* Assessment totals: 249 pre-lab, 188 during-lab, 249 post-lab items.
* No model file lacks a loader; no loader lacks a consumer.
* No renderer name used by an experiment fails to resolve.
* `contentStatus` is `published` for all 100 — nothing is in draft.
