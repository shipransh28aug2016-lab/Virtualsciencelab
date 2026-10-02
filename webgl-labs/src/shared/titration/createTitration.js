/**
 * createTitration — the bench every acid–base titration practical stands on.
 *
 * A burette over a conical flask on a stirrer, an electrode that can be put in the
 * flask, a few drops of indicator. The lab says WHAT is titrated against what — which
 * substance is in the flask, which in the burette, which of the two is the standard and
 * which is the unknown (and what the unknown really is), the stoichiometry, which dyes
 * are on the shelf; everything the student sees is the aqueous solver's pH of the flask
 * as it actually is, in activities, and what they chose to watch it with:
 *
 *   UNIVERSAL     a four-dye indicator, matched to a chart to about a unit;
 *   SINGLE DYE    a sharp change somewhere, the end point called by eye;
 *   PH METER      a glass electrode with its response time and its alkaline error.
 *
 * The flask is not uniform: titrant that has fallen and not been swirled in is a plume under
 * the tip (shared/titration), and the indicator and the electrode see the bulk — which is
 * where overshoot lives. Carbonate adds one more thing a bench cannot leave out: carbon
 * dioxide leaves a flask that is acid enough to make it, at a rate that swirling raises, and
 * the pH that is left near the second equivalence point depends on how much has gone.
 */
import { create } from 'zustand';
import { solveAqueous, systemFrom, activityCoefficient } from '../chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../chem/species.js';
import { vesselColour, buildChart, UNIVERSAL_STRENGTH } from '../chem/indicators.js';
import { colourName } from '../chem/spectra.js';
import { makeElectrode, electrodePotential, calibratedMeter, displayPH, electrodeSettled, slopePercent, stepElectrode } from '../chem/phMeter.js';
import { mulberry32 } from '../numerics.js';
import {
  flaskBulk, flaskPlume, relaxUnmixed, DROP_ML, BURETTE_ML, readBurette, steepest, slopes, analyteFromTitre,
} from './titration.js';

export { DROP_ML, BURETTE_ML };
export const CHART = buildChart({ strength: UNIVERSAL_STRENGTH });
export const FLASK_PATH_CM = 3;                   // the depth of liquid a colour is judged through
export const CO2_AIR = 1.3e-5;                    // mol/L of dissolved CO₂ in water in equilibrium with air
export const K_DEGAS = { none: 0.004, swirl: 0.02, stir: 0.03 };   // 1/s: how fast the excess CO₂ leaves

export const INDICATOR_LABELS = {
  universal: 'Universal indicator', phenolphthalein: 'Phenolphthalein', methylOrange: 'Methyl orange', bromothymolBlue: 'Bromothymol blue', none: 'No indicator',
};
export const RECOMMENDED_DROPS = { universal: 5, phenolphthalein: 2, methylOrange: 2, bromothymolBlue: 3, none: 0 };

export function createTitration(cfg) {
  const flaskDef = cfg.flask; const buretteDef = cfg.burette;
  const unknownIsFlask = flaskDef.unknown === true;
  const trueUnknownC = unknownIsFlask ? flaskDef.trueC : buretteDef.trueC;

  const sysOf = (def, c, T) => systemFrom([{ recipe: SUBSTANCES[def.recipe], scale: c }], { T, WEAK, SOLIDS });
  /** Concentrations in mol/L: the unknown is what the bottle really holds; the standard is what the student chose (in N). */
  const flaskC = (s) => (unknownIsFlask ? flaskDef.trueC : s.standardN / flaskDef.nEq);
  const buretteC = (s) => (unknownIsFlask ? s.standardN / buretteDef.nEq : buretteDef.trueC);
  const analyteSystem = (s) => sysOf(flaskDef, flaskC(s), s.tempC);
  const titrantSystem = (s) => sysOf(buretteDef, buretteC(s), s.tempC);

  /* ── The burette ────────────────────────────────────────────────────────── */
  const totalAdded = (s) => s.deliveredBefore + s.delivered;
  const remaining = (s) => Math.max(0, BURETTE_ML - s.r0 - s.delivered);
  const buretteReading = (s) => s.r0 + s.delivered;
  const started = (s) => totalAdded(s) > 0;
  const shownReading = (s) => readBurette(buretteReading(s));
  const initialReading = (fills) => 0.05 * (1 + Math.floor(mulberry32(fills + 17)() * 16));
  const agitationOf = (s) => (s.stirrer === 'on' ? 'stir' : s.elapsed < s.swirlUntil ? 'swirl' : 'none');
  const flaskVolume = (s) => s.analyteMl + totalAdded(s);

  const electrodeFor = () => makeElectrode({ seed: 21 });
  const sodiumActivity = (sys0, I, tC) => activityCoefficient(1, I, tC) * (sys0.strong ?? []).filter((x) => x.z === +1).reduce((a, x) => a + x.c, 0);
  const flaskColour = (s, pH, V, I) => vesselColour({
    indicator: s.indicator, drops: s.drops, pH, I, tC: s.tempC, volumeMl: V, pathCm: FLASK_PATH_CM, dropMl: DROP_ML,
  });

  /** Carbon dioxide that has left the flask is carbonate that is no longer in it. */
  const degassed = (bulk, lostMmol, V) => (lostMmol > 0 && cfg.degas
    ? { ...bulk, weak: bulk.weak.map((w) => (w.id === 'carbonic' ? { ...w, C: Math.max(0, w.C - lostMmol / V) } : w)) }
    : bulk);

  /** The bulk of the flask, as a system, with what has mixed in and what has gone off as gas. */
  const bulkOf = (s) => {
    const V = s.analyteMl + Math.max(0, totalAdded(s) - s.unmixed);
    const raw = flaskBulk({ analyte: analyteSystem(s), analyteMl: s.analyteMl, titrant: titrantSystem(s), mixedMl: Math.max(0, totalAdded(s) - s.unmixed) });
    return { bulk: degassed(raw, s.lostC, V), V };
  };

  /** Everything that needs the solver. Run when the volumes change, not every frame. */
  function computeWorld(s) {
    const titrant = titrantSystem(s);
    const V = totalAdded(s);
    const mixed = Math.max(0, V - s.unmixed);
    const { bulk, V: Vb } = bulkOf(s);
    const bulkSol = solveAqueous(bulk);
    const Vtot = s.analyteMl + V;
    const world = {
      bulk, bulkPH: bulkSol.pH, plumePH: null, ionic: bulkSol.ionicStrength,
      colour: flaskColour(s, bulkSol.pH, Vtot, bulkSol.ionicStrength), plumeColour: null, targetE: null, mixedMl: mixed,
      co2: cfg.degas ? (bulkSol.species.find((x) => x.id === 'carbonic')?.species[0]?.conc ?? 0) : 0, bulkMl: Vb, lostC: s.lostC,
    };
    if (s.unmixed > 1e-4) {
      const plume = solveAqueous(flaskPlume({ bulk, titrant, unmixedMl: s.unmixed }));
      world.plumePH = plume.pH;
      world.plumeColour = flaskColour(s, plume.pH, Vtot, plume.ionicStrength);
    }
    if (s.meter === 'in') world.targetE = electrodePotential(electrodeFor(), { pH: bulkSol.pH, aNa: sodiumActivity(bulk, bulkSol.ionicStrength, s.tempC), tC: s.tempC });
    /* How fast the pH is moving: what one more tenth of a mL would do. */
    const next = solveAqueous(degassed(flaskBulk({ analyte: analyteSystem(s), analyteMl: s.analyteMl, titrant, mixedMl: mixed + 0.1 }), s.lostC, Vb + 0.1));
    world.slope = Math.abs(next.pH - bulkSol.pH) / 0.1;
    return world;
  }

  /** The pH the bulk would have if it were NOT being fooled by the unmixed part, and not by gas still to leave. */
  const equilibriumPH = (s) => solveAqueous(degassed(flaskBulk({ analyte: analyteSystem(s), analyteMl: s.analyteMl, titrant: titrantSystem(s), mixedMl: totalAdded(s) }), s.lostC, flaskVolume(s))).pH;

  /** Where the equivalence points truly are, mL of titrant, for what is in the flask: one for each proton the flask species can take (or give). */
  const trueEquivalenceMl = (s) => (cfg.ratio * flaskC(s) * s.analyteMl) / buretteC(s);

  /* ── The meter ───────────────────────────────────────────────────────────── */
  function meterReading(s) {
    if (s.meter !== 'in' || s.world.targetE === null) return { sensing: false, pH: null, mV: s.E_mV, stable: false, slope: null };
    const m = calibratedMeter(electrodeFor(), s.tempC);
    return { sensing: true, pH: displayPH(m, s.E_mV, s.tempC), mV: s.E_mV, stable: electrodeSettled(electrodeFor(), s.Ed_mV, s.world.targetE), slope: slopePercent(m) };
  }

  /* ── The notebook ────────────────────────────────────────────────────────── */
  const pHToRecord = (s) => {
    if (s.meter === 'in') { const r = meterReading(s); return r.sensing ? r.pH : null; }
    return s.indicator === 'universal' ? s.pick : null;
  };
  function notesFor(s) {
    const n = [];
    if (s.unmixed > 0.02) n.push('not swirled in');
    if (s.meter === 'in' && !meterReading(s).stable) n.push('meter not settled');
    if (s.stopcock === 'open') n.push('stopcock open');
    if (s.meter !== 'in' && s.indicator === 'universal' && s.drops > 6) n.push('too much indicator');
    if (cfg.degas && s.world.co2 > 4 * CO2_AIR) n.push('flask holds dissolved CO₂');
    return n.join('; ');
  }

  /** The unknown's concentration from a titre: the arithmetic the worksheet asks for. */
  const unknownFromTitre = (s, V) => (unknownIsFlask
    ? analyteFromTitre({ titreMl: V, analyteMl: s.analyteMl, titrantC: buretteC(s), ratio: cfg.ratio })
    : (cfg.ratio * flaskC(s) * s.analyteMl) / V);

  function analyse(log, s) {
    const pts = log.filter((r) => r.kind === 'reading' && r.pH !== null).map((r) => [r.added, r.pH]);
    const endpoints = log.filter((r) => r.kind === 'endpoint');
    const sl = slopes(pts).map((d) => [d.V, d.slope]);
    const result = {};
    const mk = (V, how) => { const C = unknownFromTitre(s, V); return { V, how, C, errPct: 100 * (C / trueUnknownC - 1) }; };
    if (endpoints.length) result.endpoint = mk(endpoints[endpoints.length - 1].added, 'end point called by eye');
    const st = steepest(pts);
    if (st) result.curve = { ...mk(st.V, 'steepest part of your curve'), lo: st.lo, hi: st.hi };
    return { series: [{ name: 'pH', points: pts.slice().sort((a, b) => a[0] - b[0]), connect: true }], slope: [{ name: 'ΔpH/ΔV', points: sl, connect: true }], result };
  }

  /* ── Status ──────────────────────────────────────────────────────────────── */
  function statusOf(s) {
    const V = totalAdded(s);
    if (s.stopcock === 'open') return { key: 'flowing', tone: 'warn', title: 'Titrant is running', detail: `${s.flow.toFixed(2)} mL/s from the open stopcock. Close it before the colour changes — a stream cannot be stopped in the middle of a drop.` };
    if (remaining(s) <= 0) return { key: 'empty', tone: 'bad', title: 'The burette is empty', detail: 'It is at the 50 mL mark. Refill it and read the new initial reading: the titre is the sum of the volumes delivered from each fill.' };
    if (s.unmixed > 0.02 && agitationOf(s) === 'none') return { key: 'swirl', tone: 'info', title: 'Swirl the flask', detail: 'The titrant that has fallen has not mixed in: near the tip the flask is a different solution from the one the rest of it is. Whatever the indicator shows now is the drop, not the flask.' };
    if (V === 0) return { key: 'ready', tone: 'info', title: 'Ready to titrate', detail: cfg.readyText };
    if (cfg.degas && s.world.co2 > 4 * CO2_AIR && V > 0.5 * trueEquivalenceMl(s)) return { key: 'co2', tone: 'warn', title: 'The flask is holding carbon dioxide', detail: 'Acid has turned the carbonate into carbonic acid, and the gas has not all left. The indicator may turn before the flask is really there: swirl, or boil the flask gently and cool it, then carry on.' };
    if (s.world.slope > 1.5) return { key: 'steep', tone: 'warn', title: 'The pH is changing fast', detail: 'This is a steep part. Add single drops now: a whole mL here can jump the entire jump.' };
    if (V > 1.15 * trueEquivalenceMl(s)) return { key: 'past', tone: 'note', title: 'Well past the end point', detail: 'Carry on a few mL to see the curve level off, then plot pH against volume and find the steepest part.' };
    return { key: 'titrating', tone: 'ok', title: `Titrating: ${V.toFixed(2)} mL added`, detail: 'Swirl after each addition, note the colour or pH, and record.' };
  }

  /* ── The store ───────────────────────────────────────────────────────────── */
  const SETUP = () => ({ standardN: cfg.standard.default, analyteMl: cfg.analyteMl.default, indicator: cfg.defaultIndicator, drops: RECOMMENDED_DROPS[cfg.defaultIndicator], meter: 'out', stirrer: 'off', tempC: 25, flow: 0.2, timeScale: 1 });
  const BENCH = () => ({
    r0: initialReading(0), fills: 0, delivered: 0, deliveredBefore: 0, stopcock: 'closed', unmixed: 0, swirlUntil: 0, elapsed: 0,
    E_mV: 0, Ed_mV: 0, noiseSeed: 1, pick: null, flaskNo: 1, lostC: 0,
  });
  const INITIAL = { ...SETUP(), ...BENCH(), log: [] };
  INITIAL.world = computeWorld(INITIAL);
  INITIAL.analysis = analyse([], INITIAL);

  const refresh = (s, patch) => { const next = { ...s, ...patch }; return { ...next, world: computeWorld(next) }; };
  function deliver(s, dv) {
    const got = Math.min(dv, remaining(s));
    if (got <= 0) return s.stopcock === 'open' ? refresh(s, { stopcock: 'closed' }) : s;
    const empty = got >= remaining(s) - 1e-12;
    return refresh(s, { delivered: s.delivered + got, unmixed: s.unmixed + got, pick: null, stopcock: empty ? 'closed' : s.stopcock });
  }
  const freshAnalysis = (log, s) => analyse(log.filter((r) => r.flask === s.flaskNo), s);

  const useStore = create((set, get) => ({
    ...INITIAL,

    tick: (dtRaw) => {
      const s0 = get();
      const raw = Math.min(dtRaw, 1 / 20);
      const dt = raw * s0.timeScale;
      const s = s0.stopcock === 'open' ? deliver(s0, s0.flow * raw) : s0;
      const relaxed = relaxUnmixed(s.unmixed, dt, agitationOf(s));
      const unmixed = relaxed < 1e-5 ? 0 : relaxed;
      let next = { ...s, elapsed: s.elapsed + dt, unmixed };
      /* The carbon dioxide above the air's share leaves, faster when the flask is moving. */
      let gas = false;
      if (cfg.degas && s.world.co2 > CO2_AIR) {
        const lost = (s.world.co2 - CO2_AIR) * s.world.bulkMl * (1 - Math.exp(-K_DEGAS[agitationOf(s)] * dt));
        next = { ...next, lostC: s.lostC + lost };
        /* A standing flask loses a little each frame: the world is re-solved once what has gone since the last solve is worth 0.2 % of what it holds. */
        gas = next.lostC - s.world.lostC > 0.002 * Math.max(1e-6, s.world.co2 * s.world.bulkMl);
      }
      /* The solver is only re-run when the unmixed part has changed by a percent of itself (or the gas has moved enough to matter). */
      const moved = Math.abs(unmixed - s.unmixed) > 0.01 * Math.max(s.unmixed, 1e-3) || (s.unmixed > 0 && unmixed === 0) || gas;
      if (moved) next = { ...next, world: computeWorld(next) };
      if (next.meter === 'in' && next.world.targetE !== null) next = { ...next, ...stepElectrode(electrodeFor(), next, next.world.targetE, dt) };
      set(next);
    },

    setStandardN: (v) => set((s) => (started(s) ? s : refresh(s, { standardN: Math.max(cfg.standard.min, Math.min(cfg.standard.max, Math.round(v * 100) / 100)) }))),
    setAnalyteMl: (v) => set((s) => (started(s) ? s : refresh(s, { analyteMl: Math.max(cfg.analyteMl.min, Math.min(cfg.analyteMl.max, Math.round(v))) }))),
    setIndicator: (indicator) => set((s) => refresh(s, { indicator, drops: RECOMMENDED_DROPS[indicator], pick: null })),
    setDrops: (drops) => set((s) => refresh(s, { drops: Math.max(0, Math.min(10, Math.round(drops))), pick: null })),
    setTemp: (tempC) => set((s) => refresh(s, { tempC: Math.max(15, Math.min(40, tempC)) })),
    setMeter: (meter) => set((s) => {
      const Ed = electrodePotential(electrodeFor(), { pH: 7, tC: s.tempC });
      return refresh(s, meter === 'in' ? { meter, Ed_mV: Ed, E_mV: Ed } : { meter });
    }),
    setStirrer: (stirrer) => set({ stirrer }),
    setFlow: (flow) => set({ flow: Math.max(0.05, Math.min(1.5, flow)) }),
    setTimeScaleStr: (v) => set({ timeScale: Number(v) }),
    setTimeScale: (timeScale) => set({ timeScale }),

    toggleStopcock: () => set((s) => (s.stopcock === 'open' ? { stopcock: 'closed' } : remaining(s) > 0 ? { stopcock: 'open' } : s)),
    addDrop: () => set((s) => deliver(s, DROP_ML)),
    addMl: (v) => set((s) => deliver(s, v)),
    swirl: () => set((s) => ({ swirlUntil: s.elapsed + 3 })),
    refill: () => set((s) => refresh(s, { deliveredBefore: s.deliveredBefore + s.delivered, delivered: 0, fills: s.fills + 1, r0: initialReading(s.fills + 1), stopcock: 'closed' })),
    freshFlask: () => set((s) => {
      const next = refresh(s, { r0: s.r0 + s.delivered, delivered: 0, deliveredBefore: 0, unmixed: 0, swirlUntil: 0, stopcock: 'closed', pick: null, flaskNo: s.flaskNo + 1, lostC: 0 });
      return { ...next, analysis: freshAnalysis(s.log, next) };
    }),
    /** Boil the flask gently and cool it: the dissolved CO₂ goes, and the pH that is left is the flask's own. */
    boil: () => set((s) => {
      if (!cfg.degas) return s;
      let lost = s.lostC; let cur = refresh(s, {});
      for (let i = 0; i < 12; i += 1) {
        const ex = Math.max(0, cur.world.co2 - CO2_AIR) * cur.world.bulkMl;
        if (ex < 1e-9) break;
        lost += ex; cur = refresh(s, { lostC: lost });
      }
      return cur;
    }),

    setPick: (v) => set({ pick: v === '' || v === null ? null : Number(v) }),

    record: () => set((s) => {
      const pH = pHToRecord(s);
      const row = {
        id: `${s.log.length}-r`, kind: 'reading', flask: s.flaskNo, trial: s.log.filter((r) => r.kind === 'reading').length + 1,
        reading: Number(shownReading(s).toFixed(2)), added: Number((Math.round(totalAdded(s) / 0.05) * 0.05).toFixed(2)),
        colour: s.indicator === 'none' || s.drops === 0 ? '—' : colourName(s.world.colour.srgb),
        pH: pH === null || pH === undefined ? null : Number(pH.toFixed(s.meter === 'in' ? 2 : 0)), note: notesFor(s),
      };
      const log = [...s.log, row];
      return { log, analysis: freshAnalysis(log, s) };
    }),
    markEndpoint: () => set((s) => {
      const row = {
        id: `${s.log.length}-e`, kind: 'endpoint', flask: s.flaskNo, trial: '★',
        reading: Number(shownReading(s).toFixed(2)), added: Number((Math.round(totalAdded(s) / 0.05) * 0.05).toFixed(2)),
        colour: s.indicator === 'none' || s.drops === 0 ? '—' : colourName(s.world.colour.srgb), pH: null, note: `end point${notesFor(s) ? `; ${notesFor(s)}` : ''}`,
      };
      const log = [...s.log, row];
      return { log, analysis: freshAnalysis(log, s) };
    }),
    clearLog: () => set((s) => ({ log: [], analysis: analyse([], s) })),
    reset: () => set((s) => {
      const base = { ...SETUP(), ...BENCH(), log: s.log, timeScale: s.timeScale, flaskNo: s.flaskNo + 1 };
      const next = refresh(base, {});
      return { ...next, analysis: freshAnalysis(s.log, next) };
    }),
  }));

  return {
    useStore,
    engine: {
      cfg, flaskC, buretteC, analyteSystem, titrantSystem, totalAdded, remaining, buretteReading, started, shownReading, flaskVolume, agitationOf,
      computeWorld, equilibriumPH, trueEquivalenceMl, meterReading, pHToRecord, notesFor, analyse, statusOf, unknownFromTitre, trueUnknownC, unknownIsFlask,
    },
  };
}
