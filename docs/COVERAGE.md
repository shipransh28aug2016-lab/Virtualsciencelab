# Curriculum coverage — CBSE 2026-27

Authority: *Physics (042)* and *Chemistry (043)*, Classes XI–XII, CBSE
Curriculum 2026-27 — `data/curriculum/cbse-2026-27.json`, transcribed from the
official PDFs at cbseacademic.nic.in.

## Physics (042) — complete

Every practical in the official list — 35 experiments and 34 activities
across both classes, Sections A and B — is implemented as a live, labelled
simulation. There is nothing left to add.

## Chemistry (043) — complete except four hand-skills

Every Chemistry practical that can be honestly simulated in a browser is
implemented: 39 experiments across Sections A–K of both classes (17 that
shipped with the original release, 21 added in this pass — see the table
below — plus one, C3/pH-curve, that reuses the E3 titration model rather
than needing a distinct one counted separately).

**Not simulated, and not planned to be:** Class XI Chemistry Section A —
cutting a glass tube, bending a glass tube, drawing out a glass jet, boring a
cork. These are manual glass-working skills. A browser cannot watch a
student's hands, judge whether a flame was held at the right angle, or feel
whether a cut edge is safe — simulating them would be theatre, not
assessment, and this project's own principle (stated in the original
README) is not to fabricate that. A teacher demonstrates and supervises
these directly; nothing here substitutes for it.

## The 21 Chemistry labs added in this pass

| ID | Class | Sec | Practical | Model reused / new |
|---|---|---|---|---|
| `XI-CHE-C03` | XI | C·3 | pH change during titration of a strong base, by universal indicator | reuses `titration` |
| `XI-CHE-C04` | XI | C·4 | pH change by the common-ion effect | reuses `ph-determination` |
| `XI-CHE-D01` | XI | D·1 | Fe³⁺/SCN⁻ equilibrium shift | new `equilibrium-shift` |
| `XI-CHE-D02` | XI | D·2 | [Co(H₂O)₆]²⁺/Cl⁻ equilibrium shift | reuses `equilibrium-shift` |
| `XI-CHE-E01` | XI | E·1 | Using a mechanical/electronic balance | new `electronic-balance` |
| `XI-CHE-E02` | XI | E·2 | Standard oxalic acid solution | new `standard-solution` |
| `XI-CHE-E04` | XI | E·4 | Standard sodium carbonate solution | reuses `standard-solution` |
| `XI-CHE-F01` | XI | F·1 | Salt analysis: one cation, one anion | new `salt-analysis` |
| `XI-CHE-F02` | XI | F·2 | Lassaigne's test: N, S, Cl | new `lassaigne-test` |
| `XII-CHE-B02` | XII | B·2 | Iodine clock reaction (I⁻ + H₂O₂) | new `clock-reaction` |
| `XII-CHE-F01` | XII | F·1 | Mohr's salt / potash alum preparation | new `salt-preparation` |
| `XII-CHE-F02` | XII | F·2 | Potassium ferric oxalate preparation | reuses `salt-preparation` |
| `XII-CHE-G01` | XII | G·1 | Acetanilide preparation | new `organic-preparation` |
| `XII-CHE-G02` | XII | G·2 | Dibenzalacetone preparation | reuses `organic-preparation` |
| `XII-CHE-G03` | XII | G·3 | p-Nitroacetanilide preparation | reuses `organic-preparation` |
| `XII-CHE-G04` | XII | G·4 | Aniline yellow dye preparation | reuses `organic-preparation` |
| `XII-CHE-H01` | XII | H·1 | Functional group tests | new `functional-group-test` |
| `XII-CHE-I01` | XII | I·1 | Carbohydrate/fat/protein tests | new `biomolecule-test` |
| `XII-CHE-J01` | XII | J·1 | KMnO₄ vs standard oxalic acid | reuses `titration` |
| `XII-CHE-J02` | XII | J·2 | KMnO₄ vs standard Mohr's salt | reuses `titration` |
| `XII-CHE-K01` | XII | K·1 | Salt analysis (Class XII, oxalate included) | reuses `salt-analysis` |

10 new pure-physics models back these 21 experiments (several are reused
across more than one experiment, matching this project's own stated
principle of one model per underlying measurement, not one model per
experiment JSON).

## What "complete" means here

Every number quoted above is checked mechanically, not asserted: see
`tools/build-index.mjs` (rebuilds the catalogue from what is actually on
disk) and the verification transcript in `README.md` → *Verify it*.
