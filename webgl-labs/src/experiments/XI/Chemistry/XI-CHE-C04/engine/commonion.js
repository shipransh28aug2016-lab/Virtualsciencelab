/**
 * XI-CHE-C04 — the common-ion effect. Pure: no React, no three, no store.
 *
 * A 50 mL beaker of a weak acid (or weak base, or — for contrast — a strong
 * acid), and a balance with a salt on it. The salt is weighed, tipped in, and has
 * to DISSOLVE: slowly if nobody stirs, quickly if somebody does, taking heat
 * from the beaker as it goes (sodium acetate trihydrate and ammonium chloride
 * both dissolve endothermically, so the beaker cools while the pH is being
 * read). What is in solution at any moment goes into the shared aqueous solver,
 * which finds the pH from the electroneutrality condition in activities — so the
 * common-ion shift, its saturation, the failure of a strong acid to show it, the
 * small opposite "salt effect" of an ion that is NOT common, and the pKa that
 * comes out 0.1 low because a meter reads activity are all consequences, none
 * of them programmed.
 */
import { solveAqueous, systemFrom, withAdditive, dilute } from '../../../../../shared/chem/aqueous.js';
import { WEAK, SOLIDS, SUBSTANCES } from '../../../../../shared/chem/species.js';
import { vesselColour, indicatorAdditive, universalConcentrations, UNIVERSAL_STRENGTH, buildChart } from '../../../../../shared/chem/indicators.js';
import { makeElectrode, electrodePotential, calibratedMeter, factoryMeter, displayPH, electrodeSettled, slopePercent } from '../../../../../shared/chem/phMeter.js';
import { pKw } from '../../../../../shared/chem/constants.js';
import { linearFit } from '../../../../../shared/numerics.js';

export const BEAKER_ML = 50;
export const DROP_ML = 0.05;
export const CHART = buildChart({ strength: UNIVERSAL_STRENGTH });
export const THERMAL_J_PER_K = BEAKER_ML * 4.18 + 70;        // the water, plus the glass and electrode it shares heat with
export const TAU_COOL = 90;                                   // s, for the beaker to come back to the room
/** How long (s) a salt takes to dissolve: crystals sitting in still water take minutes. */
export const TAU_DISSOLVE = { off: 100, on: 8 };

const ion = (z, c) => ({ z, c });
const NITRATE = { strong: [ion(+1, 1), ion(-1, 1)] };          // a 1:1 salt sharing no ion with any of the three systems

export const SYSTEMS = [
  {
    id: 'acetic', label: 'Acetic acid', formula: 'CH₃COOH', kind: 'acid', recipe: SUBSTANCES.acetic,
    common: { label: 'Sodium acetate trihydrate', formula: 'CH₃COONa·3H₂O', M: 136.08, recipe: SUBSTANCES.naac, dHsol: +19.7 },
  },
  {
    id: 'ammonia', label: 'Ammonia solution', formula: 'NH₃', kind: 'base', recipe: SUBSTANCES.ammonia,
    common: { label: 'Ammonium chloride', formula: 'NH₄Cl', M: 53.49, recipe: SUBSTANCES.nh4cl, dHsol: +14.8 },
  },
  {
    id: 'hcl', label: 'Hydrochloric acid', formula: 'HCl', kind: 'strong', recipe: SUBSTANCES.hcl,
    common: { label: 'Sodium chloride', formula: 'NaCl', M: 58.44, recipe: SUBSTANCES.nacl, dHsol: +3.9 },
  },
];
export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((x) => [x.id, x]));
export const NEUTRAL = { label: 'Sodium nitrate', formula: 'NaNO₃', M: 84.99, recipe: NITRATE, dHsol: +20.5 };

export const systemOf = (s) => SYSTEM_BY_ID[s.system];
export const saltOf = (s) => (s.saltId === 'neutral' ? NEUTRAL : systemOf(s).common);

/* ── The beaker ───────────────────────────────────────────────────────────── */

export const cSalt = (s) => (s.dissolved / saltOf(s).M) / (BEAKER_ML / 1000);
export const beakerT = (s) => s.tempC + s.dT;

export function beakerSystem(s) {
  return systemFrom([
    { recipe: systemOf(s).recipe, scale: s.conc },
    { recipe: saltOf(s).recipe, scale: cSalt(s) },
  ], { T: beakerT(s), WEAK, SOLIDS });
}

export const electrodeFor = () => makeElectrode({ seed: 31 });

export function computeWorld(s) {
  const sys = beakerSystem(s);
  const sol = solveAqueous(sys);
  const world = { sys, sol, pH: sol.pH, universal: null, targetE: null };
  if (s.method === 'universal' && s.drops > 0) {
    const strength = (UNIVERSAL_STRENGTH * s.drops) / 5;
    const dosed = solveAqueous(withAdditive(dilute(sys, BEAKER_ML / (BEAKER_ML + DROP_ML * s.drops)), indicatorAdditive(universalConcentrations(strength * (10 / BEAKER_ML)))));
    world.universal = { pH: dosed.pH, colour: vesselColour({ indicator: 'universal', drops: s.drops, pH: dosed.pH, I: dosed.ionicStrength, tC: beakerT(s), volumeMl: BEAKER_ML + DROP_ML * s.drops, pathCm: 3 }) };
  }
  if (s.method === 'meter' && s.meter === 'in') world.targetE = electrodePotential(electrodeFor(), { pH: sol.pH, tC: beakerT(s) });
  return world;
}

/** The pH the beaker would settle at once everything is dissolved and warmed back to the room. */
export function restingPH(s) {
  return computeWorld({ ...s, dissolved: s.dissolved + s.solid, solid: 0, dT: 0, method: 'paper', meter: 'out' }).pH;
}

/* ── The meter ────────────────────────────────────────────────────────────── */

export const meterFor = (s) => (s.meterCal === 'calibrated' ? calibratedMeter(electrodeFor(), s.tempC) : factoryMeter());

export function meterReading(s) {
  const m = meterFor(s);
  const slope = m.calibrated ? slopePercent(m) : null;
  if (s.method !== 'meter' || s.meter !== 'in' || s.world.targetE === null) return { sensing: false, pH: null, mV: s.E_mV, stable: false, slope };
  return { sensing: true, pH: displayPH(m, s.E_mV, beakerT(s)), mV: s.E_mV, stable: electrodeSettled(electrodeFor(), s.Ed_mV, s.world.targetE), slope };
}

/* ── What the student writes down, and works out ──────────────────────────── */

/** The arithmetic of the worksheet on one reading: [H⁺] or [OH⁻], α and the constant. */
export function workings(s, pH) {
  const sys = systemOf(s);
  const H = 10 ** -pH;
  if (sys.kind === 'strong') return { H, alpha: null, K: null, pK: null };
  const x = sys.kind === 'acid' ? H : 10 ** -(pKw(beakerT(s)) - pH);
  const cs = cSalt(s);
  const K = (x * (cs + x)) / (s.conc - x);
  return { H, alpha: x / s.conc, K, pK: -Math.log10(K) };
}

export function readingFor(s) {
  if (s.method === 'meter') { const r = meterReading(s); return r.sensing ? r.pH : null; }
  return s.pick;
}

export function notesFor(s) {
  const n = [];
  if (s.solid > 0.005) n.push(`${s.solid.toFixed(2)} g not yet dissolved`);
  if (s.dT < -0.15 || s.dT > 0.15) n.push(`beaker ${s.dT < 0 ? 'cooled' : 'warmed'} ${Math.abs(s.dT).toFixed(1)} K`);
  if (s.method === 'meter') {
    if (s.meterCal !== 'calibrated') n.push('uncalibrated');
    const r = meterReading(s);
    if (r.sensing && !r.stable) n.push('not settled');
  }
  if (s.method === 'universal' && s.drops > 8) n.push('too much indicator');
  if (s.saltId === 'neutral') n.push('no common ion');
  return n.join('; ');
}

/** The graphs and the constants, from the student's own rows. */
export function analyse(log) {
  const rows = log.filter((r) => r.pH !== null);
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.systemId}|${r.saltId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const vsSalt = []; const vsRatio = []; const fits = {};
  for (const [key, g] of groups) {
    const [systemId, saltId] = key.split('|');
    const sys = SYSTEM_BY_ID[systemId];
    const name = `${sys.formula}${saltId === 'neutral' ? ' + NaNO₃' : ''}`;
    vsSalt.push({ name, points: g.map((r) => [r.cs, r.pH]).sort((a, b) => a[0] - b[0]), connect: true });
    const withSalt = g.filter((r) => r.cs > 1e-9);
    const pts = withSalt.map((r) => [Math.log10(r.cs / r.C), r.pH]);
    if (pts.length) vsRatio.push({ name, points: pts.slice().sort((a, b) => a[0] - b[0]), line: undefined });
    const distinct = new Set(pts.map((p) => p[0].toFixed(2))).size;
    const fit = distinct >= 3 ? linearFit(pts) : null;
    const pKs = withSalt.map((r) => r.pK).filter((v) => v !== null);
    fits[key] = {
      n: g.length, slope: fit ? fit.slope : null, intercept: fit ? fit.intercept : null,
      pK: pKs.length ? pKs.reduce((a, b) => a + b, 0) / pKs.length : null,
      shift: g.length > 1 ? Math.max(...g.map((r) => r.pH)) - g[0].pH : null,
    };
    if (fit) vsRatio[vsRatio.length - 1].line = [[Math.min(...pts.map((p) => p[0])), fit.intercept + fit.slope * Math.min(...pts.map((p) => p[0]))], [Math.max(...pts.map((p) => p[0])), fit.intercept + fit.slope * Math.max(...pts.map((p) => p[0]))]];
  }
  return { vsSalt, vsRatio, fits };
}

/* ── Status ───────────────────────────────────────────────────────────────── */

export function statusOf(s) {
  const sys = systemOf(s);
  if (s.boat > 0 && s.solid + s.dissolved === 0) {
    return { key: 'weighed', tone: 'info', title: `${s.boat.toFixed(2)} g of ${saltOf(s).label.toLowerCase()} on the balance`, detail: 'Tip it into the beaker, give it time to dissolve (the stirrer helps), then read the pH.' };
  }
  if (s.solid > 0.005) {
    return { key: 'dissolving', tone: 'warn', title: 'Still dissolving', detail: `${s.solid.toFixed(2)} g of salt is on the bottom. The pH is still moving: ${s.stirrer === 'on' ? 'a few more seconds' : 'a stirrer would shorten this a great deal'}.` };
  }
  if (s.method === 'meter') {
    const r = meterReading(s);
    if (!r.sensing) return { key: 'meter-out', tone: 'info', title: 'The electrode is out of the beaker', detail: 'Put it in to read the pH. A glass electrode must be wet to read.' };
    if (!r.stable) return { key: 'meter-settling', tone: 'info', title: 'Settling…', detail: 'The glass takes several seconds to respond — and the beaker is still warming back to the room.' };
    if (s.meterCal !== 'calibrated') return { key: 'meter-uncal', tone: 'warn', title: `Stable, but uncalibrated: pH ${r.pH.toFixed(2)}`, detail: 'The meter is on its factory settings: the shift between readings is right, the numbers are not.' };
    return { key: 'meter-stable', tone: 'ok', title: `Stable: pH ${r.pH.toFixed(2)}`, detail: sys.kind === 'strong' ? 'Add more salt: a strong acid has no equilibrium to shift.' : 'Record it, then add more salt.' };
  }
  if (s.method === 'universal') {
    return s.drops === 0
      ? { key: 'uni-empty', tone: 'info', title: 'Add indicator', detail: 'A few drops of universal indicator in the beaker.' }
      : { key: 'uni-match', tone: 'ok', title: 'Match the colour to the chart', detail: 'Pick the patch nearest the beaker. Compare it with the beaker before the salt went in.' };
  }
  return { key: 'paper', tone: 'info', title: 'Choose a method', detail: 'Use the meter or universal indicator.' };
}
