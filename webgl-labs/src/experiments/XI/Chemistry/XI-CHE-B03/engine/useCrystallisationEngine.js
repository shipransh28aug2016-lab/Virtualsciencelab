/**
 * useCrystallisationEngine — the React-facing store for XI-CHE-B03.
 *
 * Thin. All the chemistry is in crystallisation.js, which knows nothing about
 * React; this holds the bench setup, walks the procedure through its stages,
 * and advances the flask one frame at a time while it is cooling.
 *
 * The procedure is staged because a real one is: you cannot filter a solution
 * hot after you have let it cool, and you cannot weigh crystals that have not
 * formed. Each stage only offers what is possible at that point, and the order
 * is the student's to get right.
 */
import { create } from 'zustand';
import {
  derive, integrate, chargeFromCrude, solubility, hydrateRatio, minimumSolventMl,
  crystallisationComplete,
  SOLUTES, SOLVENTS, CRUDE_GRADES, IMPURITIES, COOLING,
} from './crystallisation.js';
import { liquidusK } from '../../XI-CHE-B01/engine/thermochemistry.js';
import { COMPOUNDS } from '../../XI-CHE-B01/engine/compounds.js';

export {
  SOLUTES, SOLVENTS, CRUDE_GRADES, IMPURITIES, COOLING,
} from './crystallisation.js';

/**
 * The melting-point bench, borrowed. For benzoic acid the product's purity is
 * read off the same Schröder–van Laar liquidus that XI-CHE-B01 is verified on,
 * so "how pure is it" is answered by a measurement rather than an assertion.
 */
const benzoicLiquidus = (xA) => liquidusK(COMPOUNDS.benzoic, xA) - 273.15;

const SETUP = {
  soluteId: 'copperSulphate',
  solventId: 'water',
  crude: 'moderate',
  massG: 8,
  solventMl: 5,
  crystallisationTempC: 20,
  cooling: 'bench',
  /* Nothing has been filtered or washed until the student does it. Starting
     with filtration already "done" would hand them a step they never took —
     and it is the step that decides whether the sand is weighed as product. */
  filtration: 'none',
  washed: false,
};

/** The flask before anything has been done to it. */
const benchFor = (setup) => {
  const solute = SOLUTES[setup.soluteId];
  const solvent = SOLVENTS[setup.solventId];
  const charge = chargeFromCrude(setup);
  return {
    stage: 'setup',
    filtration: 'none',
    washed: false,
    crudeMass: setup.massG,
    solventMass: setup.solventMl * solvent.density,
    waterOfCrystallisation: charge.waterOfCrystallisation,
    insoluble: charge.insoluble,
    tempC: 27,
    dissolved: 0,
    undissolved: charge.anhydrous * hydrateRatio(solute),
    crystalAnhydrous: 0,
    nuclei: 0,
    seeded: false,
    elapsed: 0,
    dissolvedImpurity: 0,
    impurityCrystallised: 0,
  };
};

const INITIAL = { ...SETUP, ...benchFor(SETUP), timeScale: 120, log: [] };
INITIAL.derived = derive(INITIAL, benzoicLiquidus);

/** Any change to what goes into the flask empties it and starts again. There is
 *  no way to add solvent to a flask that has already crystallised, because
 *  there is no way to do that at a bench either without redissolving the lot. */
const restage = (s, patch = {}) => {
  const setup = { ...s, ...patch };
  const next = { ...setup, ...benchFor(setup) };
  return { ...next, derived: derive(next, benzoicLiquidus) };
};

export const useCrystallisationEngine = create((set, get) => ({
  ...INITIAL,

  /** One frame. Only the cooling flask has anything to integrate. */
  tick: (dtRaw) => {
    const s = get();
    if (s.stage !== 'cooling') return;
    const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
    const stepped = integrate(s, dt);
    const next = { ...s, ...stepped };
    /* One definition of "finished", shared with the status line and the tests:
       the flask is at its bath and the solution has stopped giving anything up. */
    if (crystallisationComplete(next)) next.stage = 'crystallised';
    set({ ...stepped, stage: next.stage, derived: derive(next, benzoicLiquidus) });
  },

  /* ── Setting up ────────────────────────────────────────────────────────── */
  setSolute: (soluteId) => set((s) => restage(s, { soluteId })),
  setSolvent: (solventId) => set((s) => restage(s, { solventId })),
  setCrude: (crude) => set((s) => restage(s, { crude })),
  setMass: (massG) => set((s) => restage(s, { massG: Math.max(3, Math.min(15, massG)) })),
  setSolventMl: (solventMl) => set((s) => restage(s, { solventMl: Math.max(1, Math.min(150, solventMl)) })),
  setCooling: (cooling) => set((s) => {
    const next = { ...s, cooling };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),
  setCrystallisationTemp: (crystallisationTempC) => set((s) => {
    const next = { ...s, crystallisationTempC: Math.max(0, Math.min(30, crystallisationTempC)) };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Suggest the minimum volume, which is what the student is asked to find.
   *  Offered as a hint rather than applied silently — finding it is the skill. */
  minimumMl: () => {
    const s = get();
    return minimumSolventMl({ charge: chargeFromCrude(s), solvent: SOLVENTS[s.solventId] });
  },

  /* ── The procedure ─────────────────────────────────────────────────────── */

  /** Heat to boiling and dissolve as much as the solvent will take. Whatever
   *  will not dissolve stays as a solid in the flask, in plain view. */
  dissolve: () => set((s) => {
    const solute = SOLUTES[s.soluteId];
    const solvent = SOLVENTS[s.solventId];
    const table = s.solventId === 'ethanol' ? solute.solubilityEthanol : solute.solubilityWater;
    const charge = chargeFromCrude(s);
    const freeWater = s.solventMass + charge.waterOfCrystallisation;
    const canHold = (solubility(table, solvent.boilingPointC) / 100) * freeWater;
    const dissolved = Math.min(charge.anhydrous, canHold);
    const next = {
      ...s,
      stage: 'hot',
      /* Re-dissolving undoes the filtration: the insoluble material is back in
         the flask, because it never left the flask. */
      filtration: 'none',
      washed: false,
      tempC: solvent.boilingPointC,
      dissolved,
      undissolved: (charge.anhydrous - dissolved) * hydrateRatio(solute),
      dissolvedImpurity: charge.solubleImpurity,
      crystalAnhydrous: 0,
      nuclei: 0,
      seeded: false,
      elapsed: 0,
      impurityCrystallised: 0,
    };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Filter the hot solution. Only possible while it IS hot — and this is the
   *  only thing that removes insoluble material, which is why the order of the
   *  procedure is not decoration. */
  filterHot: () => set((s) => {
    if (s.stage !== 'hot') return {};
    const next = { ...s, filtration: 'hot' };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Skip it, and the sand ends up on the balance with the product. */
  skipFiltration: () => set((s) => {
    const next = { ...s, filtration: 'none' };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Set it aside to cool. From here the engine is integrating. */
  cool: () => set((s) => {
    if (s.stage !== 'hot') return {};
    const next = { ...s, stage: 'cooling' };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Scratch the flask with a glass rod, or drop in a seed crystal. Ends the
   *  wait at once — which is the point of doing it. */
  scratch: () => set((s) => {
    const next = { ...s, seeded: true };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  /** Wash the crystals with a little ice-cold solvent: most of the adhering
   *  mother liquor goes, and a little of the product with it. */
  wash: () => set((s) => {
    const next = { ...s, washed: true };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),

  setTimeScale: (timeScale) => set({ timeScale }),

  /* ── The notebook ──────────────────────────────────────────────────────── */

  /** Weigh the crystals, in the columns the published experiment defines. */
  record: () => set((s) => {
    const d = s.derived;
    return {
      log: [...s.log, {
        id: `${Date.now()}-${s.log.length}`,
        trial: s.log.length + 1,
        compound: d.solute.label,
        solvent: d.solvent.label,
        crudeMassG: Number(s.massG.toFixed(2)),
        solventMl: s.solventMl,
        coolTempC: s.crystallisationTempC,
        cooling: COOLING[s.cooling].label,
        crystalMassG: Number(d.productMass.toFixed(2)),
        recoveryPct: Number(d.recoveryPercent.toFixed(1)),
        sizeMm: Number(d.meanSizeMm.toFixed(2)),
        purityPct: Number((d.purity * 100).toFixed(1)),
        meltingPointC: Number(d.transition.clearC.toFixed(1)),
        rangeC: Number(d.transition.rangeC.toFixed(1)),
        verdict: d.productMass < 0.01 ? 'no product'
          : d.transition.rangeC <= 1.5 ? 'sharp — pure'
            : d.transition.rangeC <= 5 ? 'slightly wide'
              : 'wide — still impure',
      }],
    };
  }),

  clearLog: () => set({ log: [] }),

  reset: () => set((s) => {
    const next = { ...INITIAL, log: s.log, timeScale: s.timeScale };
    return { ...next, derived: derive(next, benzoicLiquidus) };
  }),
}));

/* Selectors return primitives or stable references, never a fresh object:
   zustand reads through useSyncExternalStore and compares the snapshot by
   identity, so a selector that builds `{ a, b }` re-renders until React gives
   up with "maximum update depth exceeded". */
export const selectDerived = (s) => s.derived;
export const selectStatus = (s) => s.derived.status;
export const selectLog = (s) => s.log;
export const selectStage = (s) => s.stage;
