/**
 * What is in a test tube, and what can be seen of it. Pure: no React, no three, no store.
 *
 * A tube's content is the analytical amount of each component (mmol) and a volume. The solver
 * (shared/equilibria/speciate.js, with the constants of ions.js) turns that into a pH, a set of
 * dissolved species and the solids that are over their solubility product — and from those
 * come the colour (Beer–Lambert through the species' absorption bands), the precipitate (which
 * solid, how much, what it looks like, how fast it settles) and the gas (carbon dioxide when the
 * dissolved H₂CO₃* is past what a litre holds at one atmosphere; ammonia from its Henry's-law
 * pressure). Nothing about a salt or a reagent is a branch in this file: add an ion's constants
 * to ions.js and the tests it takes part in follow.
 */
import { speciate, kAt } from '../equilibria/speciate.js';
import { absorbancePerCm, colourThrough } from '../chem/spectra.js';
import { R, KELVIN } from '../chem/constants.js';
import { COMPONENTS, SPECIES, SOLIDS, SOLID_INFO, BANDS, HENRY_NH3 } from './ions.js';

export const TUBE_MAX_ML = 15;
export const PATH_CM = 1.4;

export const emptyContent = () => ({ volumeMl: 0, mmol: {}, spilledMl: 0, layer: null, event: null });

/** Pour `mL` of a solution (mmol/mL of each component) in; what does not fit runs over the rim, with its share of everything. */
export function pour(content, conc, mL) {
  const mmol = { ...content.mmol };
  for (const [k, v] of Object.entries(conc)) mmol[k] = (mmol[k] ?? 0) + v * mL;
  let V = content.volumeMl + mL; let spilledMl = content.spilledMl ?? 0;
  if (V > TUBE_MAX_ML) {
    const keep = TUBE_MAX_ML / V;
    for (const k of Object.keys(mmol)) mmol[k] *= keep;
    spilledMl += V - TUBE_MAX_ML; V = TUBE_MAX_ML;
  }
  return { ...content, volumeMl: V, mmol, spilledMl };
}

const cache = new WeakMap();

/** Solve a tube. Memoised on the content object: observe() and degas() ask the same question. */
export function solveContent(content, tempC = 25, guess = null) {
  const hit = cache.get(content);
  if (hit && hit.T === tempC) return hit.sp;
  const V = content.volumeMl;
  const m = content.mmol;
  if (V <= 0) return { free: {}, species: {}, solids: {}, ionicStrength: 0, pH: 7, converged: true, gamma: () => 1 };
  const tot = (k) => (m[k] ?? 0) / V;
  const totals = {};
  for (const c of COMPONENTS) if (c.id !== 'H') totals[c.id] = tot(c.id);
  const spectators = [{ z: 1, c: tot('Na') + tot('K') }, { z: -1, c: tot('NO3') }];
  const solids = SOLIDS.filter((s) => (s.minT === undefined || tempC >= s.minT) && (s.maxT === undefined || tempC < s.maxT) && !(s.unless ?? []).some((k) => (m[k] ?? 0) > 1e-9));
  const args = { components: COMPONENTS, species: SPECIES, solids, totals, spectators, charge: 'H', T: tempC, guess: guess?.free ?? null, guessSolids: guess?.solids ?? null };
  let sp = speciate(args);
  if (sp.ionicStrength > 1.2) sp = speciate({ ...args, activity: false, guess: null, guessSolids: null });
  cache.set(content, { T: tempC, sp });
  return sp;
}

/** Henry's law for ammonia at a temperature: the pressure (atm) over a solution with `nh3` mol/L of dissolved NH₃. */
export const pNH3 = (nh3, tempC = 25) => nh3 / (HENRY_NH3.K25 * Math.exp((-HENRY_NH3.dH * 1000 / R) * (1 / (tempC + KELVIN) - 1 / (25 + KELVIN))));

const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (r) => `#${r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** The brown ring: only where a conc. acid layer lies under a solution holding nitrate and iron(II), and only until it is shaken. */
function ringOf(content) {
  const layer = content.layer;
  if (!layer || layer.acidMmol < 3) return null;
  const V = content.volumeMl; const m = content.mmol;
  const nitrate = (m.NO3 ?? 0) / V; const fe2 = (m.Fe2 ?? 0) / V;
  if (nitrate < 0.002 || fe2 < 0.01) return null;
  /* NO₃⁻ + 3Fe²⁺ + 4H⁺ → NO + 3Fe³⁺ + 2H₂O at the interface, where the acid is 18 M; the NO is caught by Fe²⁺ as [Fe(NO)]²⁺. */
  const strength = Math.min(1, nitrate / 0.02) * Math.min(1, fe2 / 0.1);
  return { strength, hex: '#6b3a1e' };
}

/**
 * What can be SEEN of a tube at `tempC`. `previous` is the last observation: a warm start for the solver.
 */
export function observe(content, tempC = 25, previous = null) {
  const V = content.volumeMl;
  if (V <= 0.01) return dryObs(content, tempC);
  const sp = solveContent(content, tempC, previous ? { free: previous.free, solids: previous.solidsMol } : null);
  const parts = Object.entries(BANDS).map(([id, bands]) => ({ bands, conc: sp.species[id] ?? sp.free[id] ?? 0 })).filter((p) => p.conc > 1e-9 && p.bands.length);
  const colour = colourThrough(absorbancePerCm(parts), PATH_CM);

  const solids = Object.entries(sp.solids ?? {}).filter(([id, c]) => c > 1e-9 && !SOLID_INFO[id]?.gas)
    .map(([id, c]) => { const info = SOLID_INFO[id]; const mmol = c * V; return { id, mmol, mg: mmol * info.M, info }; })
    .filter((s) => s.mg > 0.002)
    .sort((a, b) => b.mg - a.mg);
  const mg = solids.reduce((a, s) => a + s.mg, 0);
  const mgPerMl = V > 0 ? mg / V : 0;
  let rgb = [255, 255, 255]; let tau = 45;
  if (mg > 0) {
    rgb = [0, 0, 0]; tau = 0;
    for (const s of solids) { const c = hexToRgb(s.info.hex); const w = s.mg / mg; rgb = rgb.map((v, i) => v + w * c[i]); tau += w * s.info.tau; }
  }
  const alpha = 1 - Math.exp(-mgPerMl / 1.5);
  const prec = rgb.map((v) => v / 255);
  const gelatinous = solids.some((s) => /gelatinous|colloidal/.test(s.info.texture));

  const nh3 = sp.species.NH4 !== undefined ? (sp.free.NH3 ?? 0) : 0;
  const ring = ringOf(content);
  const event = content.event;
  const gasRate = event ? Math.min(1, 0.15 + 0.85 * Math.min(1, event.mmol / 0.6)) : 0;

  return {
    colour, name: colourWord(colour.srgb), colourless: Math.min(...colour.linear) > 0.975,
    pH: sp.pH, I: sp.ionicStrength, free: sp.free, species: sp.species, gamma: sp.gamma, converged: sp.converged, solidsMol: sp.solids,
    solids, mg, mgPerMl, precip: [prec[0], prec[1], prec[2], alpha], bed: [prec[0], prec[1], prec[2], Math.min(1, alpha * (gelatinous ? 1.3 : 1.15))],
    scatter: Math.min(1, mgPerMl / 6), scatterColour: prec, settleTau: tau || 45,
    gas: gasRate, gasKind: event?.kind ?? null, gasTau: event ? 2.5 + 7 * Math.min(1, event.mmol / 0.6) : 1,
    volatile: { CO2: (sp.species.H2CO3 ?? 0) * V, NH3: nh3 * V, HCN: (sp.species.HCN ?? 0) * V, H2S: (sp.species.H2S ?? 0) * V }, pNH3: pNH3(nh3, tempC),
    ring, layer: content.layer ? { mL: content.layer.mL, hex: '#ece3c4' } : null, tempC, volumeMl: V, totalMl: V + (content.layer?.mL ?? 0),
  };
}

/** A dry tube: nothing to dissolve anything in. If it holds a solid sample, that is what is seen, as crystals at the bottom. */
function dryObs(content, tempC) {
  const sol = content.solid;
  const white = { linear: [1, 1, 1], srgb: [1, 1, 1], hex: '#ffffff' };
  const rgb = sol ? hexToRgb(sol.hex).map((v) => v / 255) : [1, 1, 1];
  const alpha = sol ? Math.min(1, 0.35 + sol.mg / 150) : 0;
  return {
    colour: white, name: 'colourless', colourless: true, pH: 7, I: 0, free: {}, species: {}, gamma: () => 1, converged: true, solidsMol: {},
    solids: [], mg: 0, mgPerMl: 0, precip: [1, 1, 1, 0], bed: [rgb[0], rgb[1], rgb[2], alpha], scatter: 0, scatterColour: [1, 1, 1], settleTau: 0.4,
    gas: 0, gasKind: null, gasTau: 1, volatile: { CO2: 0, NH3: 0, HCN: 0, H2S: 0 }, pNH3: 0, ring: null, layer: null, tempC, volumeMl: 0, totalMl: 0,
    dry: sol ? { look: sol.look, mg: sol.mg } : { look: null, mg: 0 },
  };
}

/** Put a solid sample (a pinch of a salt, as component amounts) into a tube: it dissolves at once in whatever liquid is there, and lies there as crystals if there is none. */
export function addSolid(content, sample, tempC = 25) {
  if (content.volumeMl > 0.01) {
    const mmol = { ...content.mmol };
    for (const [k, v] of Object.entries(sample.mmol)) mmol[k] = (mmol[k] ?? 0) + v;
    return degas({ ...content, mmol, event: null }, tempC);
  }
  const prev = content.solid;
  const merged = prev ? { ...prev, mg: prev.mg + sample.mg, mmol: Object.fromEntries([...new Set([...Object.keys(prev.mmol), ...Object.keys(sample.mmol)])].map((k) => [k, (prev.mmol[k] ?? 0) + (sample.mmol[k] ?? 0)])) } : { ...sample };
  return { ...content, solid: merged, event: null };
}

/**
 * What a dose of a reagent does. A concentrated acid is run down the side of the tube and lies under the
 * solution as a layer until the tube is shaken; anything else is mixed in, and whatever comes out as a gas leaves.
 */
export function addReagent(content, reagent, mL, tempC = 25) {
  if (reagent.kind === 'concAcid') {
    const layer = content.layer ?? { acidMmol: 0, mL: 0 };
    return { ...content, event: null, layer: { acidMmol: layer.acidMmol + reagent.conc.SO4 * mL, mL: layer.mL + mL } };
  }
  const wet = pour(content, reagent.conc, mL);
  if (content.solid) {
    const mmol = { ...wet.mmol };
    for (const [k, v] of Object.entries(content.solid.mmol)) mmol[k] = (mmol[k] ?? 0) + v;
    return degas({ ...wet, mmol, solid: null, event: null }, tempC);
  }
  return degas({ ...wet, event: null }, tempC);
}

/** Shaking a tube that has a conc. acid layer under it: the acid mixes in (and a good deal of heat goes with it). */
export function mixLayer(content, tempC = 25) {
  const l = content.layer; if (!l) return content;
  return addReagent({ ...content, layer: null }, { conc: { SO4: l.acidMmol / l.mL } }, l.mL, tempC);
}

/** Anything that has come out of solution as a gas has left an open tube: take it out of the content and note the event. */
export function degas(content, tempC = 25) {
  const V = content.volumeMl;
  if (V <= 0) return content;
  const sp = solveContent(content, tempC);
  const gas = (sp.solids?.CO2g ?? 0) * V;
  if (gas < 1e-7) return content;
  const mmol = { ...content.mmol, CO3: Math.max(0, (content.mmol.CO3 ?? 0) - gas) };
  return { ...content, mmol, event: { kind: 'CO2', mmol: gas } };
}

/**
 * The slow loss of dissolved gases from an open tube, per second at 25 °C: the molecular gas (H₂CO₃*, NH₃, HCN, H₂S) leaves, and
 * what it leaves is taken out of the component it came from. The rate doubles every 12 K (a boiling tube loses it in seconds).
 */
const VOLATILE = [
  { key: 'CO2', comp: 'CO3', k25: 0.004, eps: 1e-3 }, { key: 'NH3', comp: 'NH3', k25: 0.0015, eps: 1e-3 },
  { key: 'HCN', comp: 'CN', k25: 0.004, eps: 1e-7 }, { key: 'H2S', comp: 'S', k25: 0.006, eps: 1e-7 },     // the poisonous ones go to nothing
];
const kRise = (T) => 2 ** ((T - 25) / 12);
const K_FC = 6e-4;          // Fe²⁺ + 6CN⁻ → [Fe(CN)₆]⁴⁻ in alkaline solution: minutes cold, seconds boiling
const K_SCN_OX = 0.004;     // hot dilute nitric acid oxidises thiocyanate to sulfate and HCN, over some minutes

/**
 * Time passing over a tube. Dissolved gases leave an open tube; iron(II) takes up cyanide (only while it is cyanide ion, not HCN);
 * hot dilute nitric acid destroys thiocyanate. Returns the SAME object when nothing worth re-solving has happened, so the store
 * does not re-observe every frame; what has accumulated since is in `drift`, which belongs to this function.
 */
export function settle(content, tempC, dt, prevObs, drift = {}) {
  const v = prevObs?.volatile; if (!v) return content;
  const m = content.mmol; const k = kRise(tempC);
  let work = false;
  for (const g of VOLATILE) { if ((v[g.key] ?? 0) > g.eps) { drift[g.key] = (drift[g.key] ?? 0) + v[g.key] * (1 - Math.exp(-g.k25 * k * dt)); work = true; } }
  if ((m.Fe2 ?? 0) > 1e-6 && (m.CN ?? 0) > 1e-6 && prevObs) {
    const fCN = 1 / (1 + 10 ** (9.21 - prevObs.pH));
    drift.FC = (drift.FC ?? 0) + K_FC * k * fCN * dt * Math.min(m.Fe2, m.CN / 6); work = true;
  }
  const acid = prevObs && prevObs.pH < 1.5 && tempC > 85;
  if ((m.SCN ?? 0) > 1e-6 && acid) { drift.SCN = (drift.SCN ?? 0) + (m.SCN) * (1 - Math.exp(-K_SCN_OX * dt)); work = true; }
  if (!work) return content;
  const big = VOLATILE.some((g) => (drift[g.key] ?? 0) > 0.02 * Math.max(v[g.key] ?? 0, 20 * g.eps) + g.eps)
    || (drift.FC ?? 0) > 0.01 * Math.min(m.Fe2 ?? 0, (m.CN ?? 0) / 6) + 1e-5 || (drift.SCN ?? 0) > 0.02 * (m.SCN ?? 0) + 1e-5;
  if (!big) return content;
  const mmol = { ...m };
  let ev = null;
  for (const g of VOLATILE) {
    const d = drift[g.key] ?? 0; if (d <= 0) continue;
    mmol[g.comp] = Math.max(0, (mmol[g.comp] ?? 0) - d);
    if (!ev || d > ev.mmol) ev = { kind: g.key, mmol: d };
    drift[g.key] = 0;
  }
  if (drift.FC > 0) { const f = Math.min(drift.FC, mmol.Fe2 ?? 0, (mmol.CN ?? 0) / 6); mmol.Fe2 -= f; mmol.CN -= 6 * f; mmol.FC = (mmol.FC ?? 0) + f; drift.FC = 0; }
  if (drift.SCN > 0) { const o = Math.min(drift.SCN, mmol.SCN ?? 0); mmol.SCN -= o; mmol.SO4 = (mmol.SO4 ?? 0) + o; mmol.CN = (mmol.CN ?? 0) + o; drift.SCN = 0; }
  return { ...content, mmol, event: ev ?? content.event };
}

/* ── Words for what is seen ─────────────────────────────────────────────── */

const amountWord = (mgPerMl) => (mgPerMl < 0.3 ? 'a faint turbidity' : mgPerMl < 1 ? 'a slight' : mgPerMl < 4 ? 'a' : 'a copious');

/** The solution's colour and the precipitate, in the words a notebook would use. */
export function describeSolids(obs) {
  if (!obs.solids.length) return 'no precipitate';
  if (obs.mgPerMl < 0.3) return 'a faint turbidity';
  const looks = [...new Set(obs.solids.slice(0, 2).map((s) => s.info.look))];
  const tex = obs.solids[0].info.texture;
  const body = `${looks.join(' and ')} ${/gelatinous|colloidal|curdy|crystalline|fine/.test(tex) ? `${tex} ` : ''}precipitate`.replace(/\s+/g, ' ');
  return `${amountWord(obs.mgPerMl)} ${body}`.replace(/^a (?=[aeiou])/, 'an ').replace(/ {2,}/g, ' ');
}

/** A solution's colour in the notebook's words, from hue, saturation and lightness of what it transmits. */
export function colourWord(srgb) {
  const [r, g, b] = srgb; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; const l = (mx + mn) / 2;
  if (d < 0.025) return l > 0.95 ? 'colourless' : l > 0.7 ? 'pale grey' : 'grey';
  let h;
  if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  h *= 60;
  const s = d / (1 - Math.abs(2 * l - 1));
  const pale = l > 0.82 || s < 0.22; const deep = l < 0.38;
  const base = h < 12 || h >= 345 ? 'red' : h < 38 ? (l < 0.42 ? 'brown' : 'orange') : h < 52 ? (l < 0.38 ? 'yellow-brown' : 'orange-yellow') : h < 70 ? 'yellow' : h < 95 ? 'yellow-green' : h < 160 ? 'green'
    : h < 190 ? 'blue-green' : h < 255 ? 'blue' : h < 290 ? 'violet' : h < 330 ? 'purple' : 'pink';
  if (base === 'red' && l < 0.3) return 'dark red';
  if (base === 'brown') return deep ? 'dark brown' : 'brown';
  return pale ? `pale ${base}` : deep ? `deep ${base}` : base;
}

export const describeSolution = (obs) => (obs.colourless ? 'colourless' : colourWord(obs.colour.srgb));

/** The tube as a whole, one line. */
export function describe(obs) {
  if (obs.volumeMl <= 0.01) return obs.dry?.look ? `a dry tube with ${obs.dry.look} at the bottom` : 'an empty, dry tube';
  const sol = obs.solids.length && obs.mgPerMl >= 0.05 ? `${describeSolids(obs)} in a ${describeSolution(obs)} solution` : `${describeSolution(obs)} solution${obs.solids.length ? `, with ${describeSolids(obs)}` : ''}`;
  return obs.ring ? `${sol}; a brown ring at the junction of the two liquids` : sol;
}

export { SOLID_INFO, kAt };
