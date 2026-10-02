/**
 * XI-CHE-F01 — one cation and one anion in a given salt, found by tests. Pure: no React, no
 * three, no store (the store is useSalt.js).
 *
 * Eight bottles, each holding a salt whose name is not on the label. A bottle's contents go into
 * the tubes as a 0.1 M (in the cation) "original solution", and from there it is the student's
 * to do with what they like: acids, bases, ammonia, the confirmatory reagents, a wire in the
 * flame, a strip of litmus at the mouth of a tube, a delivery tube to lime water, the bath. What
 * a tube then looks like is solved, not looked up: the speciation solver puts the ions, the
 * complexes and the solids that are over their solubility products together
 * (shared/qualitative), and the flame is an emission spectrum put through the colour-matching
 * functions. The identity of the salt is used in exactly one place — the contents of the tube.
 */
import { emptyContent, pour, observe, describe, describeSolids, describeSolution, addReagent, addSolid, mixLayer, settle, degas, TUBE_MAX_ML } from '../../../../../shared/qualitative/chemistry.js';
import { REAGENTS, LIME_WATER } from '../../../../../shared/qualitative/ions.js';
import { flame } from '../../../../../shared/qualitative/flame.js';
import { smellOf, litmusAtMouth } from '../../../../../shared/qualitative/devices.js';
import { mulberry32 } from '../../../../../shared/numerics.js';

export const CATIONS = { cu2: 'Cu²⁺', fe3: 'Fe³⁺', zn2: 'Zn²⁺', ca2: 'Ca²⁺', pb2: 'Pb²⁺', nh4: 'NH₄⁺', ba2: 'Ba²⁺', al3: 'Al³⁺' };
export const ANIONS = { so4: 'SO₄²⁻', cl: 'Cl⁻', co3: 'CO₃²⁻', no3: 'NO₃⁻', ox: 'C₂O₄²⁻' };

/** `per`: amount of each component per formula unit; `catKey`: the component that counts the cations. */
export const SALTS = [
  { id: 'cuso4', M: 249.68, formula: 'CuSO₄·5H₂O', name: 'copper(II) sulfate', cation: 'cu2', anion: 'so4', per: { Cu: 1, SO4: 1 }, catKey: 'Cu', look: 'blue crystals', hex: '#3d85d8', form: 'transparent blue crystals' },
  { id: 'fecl3', M: 270.3, formula: 'FeCl₃·6H₂O', name: 'iron(III) chloride', cation: 'fe3', anion: 'cl', per: { Fe: 1, Cl: 3 }, catKey: 'Fe', look: 'yellow-brown lumps', hex: '#b9863a', form: 'damp yellow-brown lumps that fume faintly in moist air', acid: { Cl: 0.1 } },
  { id: 'znso4', M: 287.56, formula: 'ZnSO₄·7H₂O', name: 'zinc sulfate', cation: 'zn2', anion: 'so4', per: { Zn: 1, SO4: 1 }, catKey: 'Zn', look: 'colourless crystals', hex: '#eef2f4', form: 'small colourless crystals' },
  { id: 'cano32', M: 236.15, formula: 'Ca(NO₃)₂·4H₂O', name: 'calcium nitrate', cation: 'ca2', anion: 'no3', per: { Ca: 1, NO3: 2 }, catKey: 'Ca', look: 'white crystals', hex: '#f4f4f1', form: 'white crystals that go damp in the air' },
  { id: 'pbno32', M: 331.2, formula: 'Pb(NO₃)₂', name: 'lead(II) nitrate', cation: 'pb2', anion: 'no3', per: { Pb: 1, NO3: 2 }, catKey: 'Pb', look: 'white crystals', hex: '#f6f6f3', form: 'dense white crystals' },
  { id: 'nh42co3', M: 96.09, formula: '(NH₄)₂CO₃', name: 'ammonium carbonate', cation: 'nh4', anion: 'co3', per: { NH3: 2, CO3: 1 }, catKey: 'NH3', look: 'white lumps', hex: '#f5f5f2', form: 'white lumps with a faint smell of ammonia' },
  { id: 'bacl2', M: 244.26, formula: 'BaCl₂·2H₂O', name: 'barium chloride', cation: 'ba2', anion: 'cl', per: { Ba: 1, Cl: 2 }, catKey: 'Ba', look: 'white crystals', hex: '#f7f7f5', form: 'white crystalline plates' },
  { id: 'al2so43', M: 666.43, formula: 'Al₂(SO₄)₃·18H₂O', name: 'aluminium sulfate', cation: 'al3', anion: 'so4', per: { Al: 2, SO4: 3 }, catKey: 'Al', look: 'white crystalline lumps', hex: '#f3f4f4', form: 'white crystalline lumps' },
];
export const BOTTLES = 8;

/** Which salt is in which bottle: a fixed shuffle, so bottle 1 is not always the same kind of salt as the list's first. */
export const ORDER = (() => {
  const rng = mulberry32(20260);
  const a = SALTS.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
})();
export const saltOfBottle = (n) => SALTS[ORDER[Math.max(1, Math.min(BOTTLES, n)) - 1]];

export const OS_ML = 3;
export const OS_M = 0.1;
/** The original solution: 0.1 M in the cation (about 0.25 g to 10 mL), in a 3 mL portion. A salt that hydrolyses (iron) is made up in a little acid, as it is on the bench. */
export function osContent(salt, mL = OS_ML) {
  const n = salt.per[salt.catKey];
  const conc = {};
  for (const [k, v] of Object.entries(salt.per)) conc[k] = (OS_M * v) / n;
  for (const [k, v] of Object.entries(salt.acid ?? {})) conc[k] = (conc[k] ?? 0) + v;
  return pour(emptyContent(), conc, mL);
}
export const limeContent = () => pour(emptyContent(), LIME_WATER, 2);

/** A pinch of the solid: about 0.1 g, which is what a spatula tip is. It goes in dry, or dissolves in whatever liquid is in the tube. */
export const SAMPLE = { id: 'sample', label: 'A pinch of the given salt', short: 'Salt', formula: 'a pinch (0.1 g) of the salt', conc: {}, kind: 'sample', mlPer: 0, unit: 'pinch', maxUnits: 5, swatch: '#f1f1ee' };
export const PINCH_MG = 100;
export const sampleOf = (salt, units = 1) => {
  const mg = PINCH_MG * units; const mmolSalt = mg / salt.M;
  return { mg, look: salt.look, hex: salt.hex, mmol: Object.fromEntries(Object.entries(salt.per).map(([k, v]) => [k, v * mmolSalt])) };
};

export const REAGENT = { sample: SAMPLE, ...Object.fromEntries(REAGENTS.map((r) => [r.id, r])) };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const DROP_ML = 0.05;

/* ── The bench ─────────────────────────────────────────────────────────── */

export const TUBE_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const CFG = {
  tubes: [
    { id: 'A', label: 'A', tag: '#38bdf8' }, { id: 'B', label: 'B', tag: '#fbbf24' }, { id: 'C', label: 'C', tag: '#34d399' },
    { id: 'D', label: 'D', tag: '#f472b6' }, { id: 'E', label: 'E', tag: '#a78bfa' }, { id: 'F', label: 'F', tag: '#fb923c' },
    { id: 'L', label: 'L', tag: '#a3e635' },
  ],
  roomC: 25,
  baths: { air: { T: 'room', tau: 150 }, ice: { T: 2, tau: 40 }, hot: { T: 96, tau: 55 } },
  pathCm: 1.4,
  shelfPitch: 0.2,
  reagents: [SAMPLE, ...REAGENTS],
  ctx: { bottle: 1 },
  volume: (c) => c.volumeMl + (c.layer?.mL ?? 0),
  initial: (def, ctx) => (def.id === 'L' ? limeContent() : osContent(saltOfBottle(ctx.bottle))),
  add: (content, reagent, mL, c) => (reagent.kind === 'sample' ? addSolid(content, sampleOf(saltOfBottle(c.lab.bottle), c.units), c.tempC) : addReagent(content, reagent, mL, c.tempC)),
  observe,
  settle,
  row: (a) => rowFor(a),
  analyse: (log) => analyse(log),
};

const bathName = { air: '', ice: 'in the ice bath', hot: 'in the boiling-water bath' };

/** What was done to a tube, in the words of a notebook. */
export function doneTo(tube) {
  const doses = Object.entries(tube.doses).filter(([, n]) => n > 0).map(([id, n]) => (id === 'sample' ? `${plural(n, 'pinch')} of the salt` : `${plural(n, 'drop')} ${REAGENT[id].formula}${id === 'h2so4c' ? ' (down the side)' : ''}`));
  const bits = [tube.dry ? 'dry tube' : 'O.S.', ...doses];
  if (tube.bath !== 'air' && tube.tempC > 40) bits.push(`heated (${tube.tempC.toFixed(0)} °C)`);
  return bits.length === 1 ? (tube.dry ? 'dry tube' : 'O.S. alone') : bits.join(' + ');
}

export function observationText(tube) {
  const o = tube.obs;
  const parts = [describe(o)];
  if (o.gas > 0.05 && tube.gasAt > -1e5) parts.push(o.gasKind === 'CO2' ? 'a colourless, odourless gas bubbles off' : 'a gas comes off');
  return parts.join('; ');
}

function rowFor({ tube, ctx }) {
  return { bottle: ctx.lab?.bottle ?? '—', tube: tube.id, kind: Object.keys(tube.doses).filter((k) => tube.doses[k] > 0).at(-1) ?? 'O.S.', test: doneTo(tube), observation: observationText(tube) };
}

/** Which distinct tests the student has run. */
export function analyse(log) {
  const kinds = new Set(log.map((r) => r.kind).filter((k) => k && k !== 'O.S.' && k !== 'conclusion'));
  return { rows: log.length, kinds: [...kinds], tests: kinds.size };
}

/* ── The wire, the paper, the nose ─────────────────────────────────────── */

export const FLAME_SECONDS = 14;
/** The flame the student sees now: the wire in it (if it is) or the flame alone. */
export function flameNow(s) {
  const l = s.loop;
  const t = s.elapsed - l.t0;
  const inFlame = l.t0 >= 0 && t >= 0 && t < FLAME_SECONDS;
  return { inFlame, ...flame({ loaded: inFlame ? l.loaded : {}, t: inFlame ? t : 0, filter: l.filter }) };
}

export const activeOf = (s) => s.tubes.find((t) => t.id === s.active);
export const tubeOf = (s, id) => s.tubes.find((t) => t.id === id);

/* ── What the bench says ───────────────────────────────────────────────── */

export function statusOf(s) {
  const t = activeOf(s);
  const o = t.obs;
  if (t.content.spilledMl > 0) return { key: 'spilled', tone: 'warn', title: `Tube ${t.id} was overfilled`, detail: `${t.content.spilledMl.toFixed(1)} mL ran over the rim, taking its share of every ion with it. Take a fresh tube.` };
  if (s.message && s.message.at === s.acts) return { key: s.message.key, tone: s.message.tone ?? 'warn', title: s.message.title, detail: s.message.detail };
  if (t.content.layer) {
    return o.ring
      ? { key: 'ring', tone: 'ok', title: `Tube ${t.id}: a brown ring at the junction`, detail: 'Concentrated acid lies under the solution. Where the two meet, nitrate is reduced by iron(II) and the NO that is made is caught by Fe²⁺ as a brown complex. Do not shake the tube: the ring is a thing of the interface.' }
      : { key: 'layer', tone: 'info', title: `Tube ${t.id}: a layer of concentrated acid lies under the solution`, detail: 'Nothing at the junction yet. The ring appears only if there is nitrate and iron(II) above the acid.' };
  }
  if (Math.abs(t.tempC - (t.bath === 'hot' ? 96 : t.bath === 'ice' ? 2 : 25)) > 1.5) return { key: 'changing', tone: 'info', title: `Tube ${t.id}: ${t.tempC.toFixed(0)} °C and still changing`, detail: 'A tube takes about a minute to come to the bath. Wait before you look: some tests need the heat, and some precipitates dissolve only when hot.' };
  const text = describe(o);
  if (!Object.values(t.doses).some((n) => n > 0)) return { key: 'rest', tone: 'info', title: `Tube ${t.id}: the original solution`, detail: `${text}. Choose a reagent, a number of drops, and add it — one test at a time, and write down what you see.` };
  return { key: 'seen', tone: 'ok', title: `Tube ${t.id}: ${text}`, detail: `${doneTo(t)}. ${o.gas > 0.05 ? 'Gas is coming off. ' : ''}Add more of the same to see whether it is soluble in excess; record what you see.` };
}

/* ── The answer ───────────────────────────────────────────────────────── */

/**
 * The tests a student would use for an ion, as groups: each group is done on a FRESH portion of the solution, reagent
 * after reagent — [reagent, drops, { gas }]. What each shows is not written here: modelEvidence() runs them through
 * the same solver the bench uses.
 */
export const CATION_TESTS = {
  cu2: [[['naoh', 8], ['naoh', 60]], [['nh4oh', 10], ['nh4ohc', 20]], [['k4fec', 5]]],
  fe3: [[['naoh', 12], ['naoh', 60]], [['kscn', 3]], [['k4fec', 3]]],
  zn2: [[['naoh', 8], ['naohc', 30]], [['nh4oh', 10], ['nh4ohc', 20]], [['k4fec', 5]]],
  ca2: [[['naoh', 8]], [['nh4oh', 40]], [['nh4ox', 10]], [['h2so4', 10]]],
  pb2: [[['hcl', 10]], [['naoh', 8], ['naohc', 20]], [['k2cro4', 5]], [['h2so4', 10]]],
  nh4: [[['naoh', 10, { gas: true }]]],
  ba2: [[['k2cro4', 5]], [['h2so4', 10]], [['nh4ox', 10]]],
  al3: [[['naoh', 8], ['naoh', 60]], [['nh4oh', 10], ['nh4ohc', 20]]],
};
export const ANION_TESTS = {
  so4: [[['bacl2', 10], ['hcl', 20]]],
  cl: [[['agno3', 10], ['hno3', 10], ['nh4oh', 40]]],
  co3: [[['sample', 1], ['hcl', 20, { gas: true }]], [['bacl2', 10], ['hcl', 20]]],
  no3: [[['feso4', 20], ['h2so4c', 10]]],
  ox: [[['cacl2', 10], ['hcl', 20]]],
};

/** Run one group of tests on a fresh portion of the salt, each on the result of the last, and say what is seen after each. */
export function runTests(salt, group, { hot = false } = {}) {
  let c = group[0]?.[0] === 'sample' ? emptyContent() : osContent(salt);
  const steps = [];
  const T = hot ? 96 : 25;
  for (const [id, n, opt = {}] of group) {
    c = id === 'sample' ? addSolid(c, sampleOf(salt, n), T) : addReagent(c, REAGENT[id], n * (REAGENT[id].mlPer ?? DROP_ML), T);
    const o = observe(c, T);
    const smell = smellOf(o); const litmus = litmusAtMouth(o, 'red');
    const extras = [
      c.event?.kind === 'CO2' ? 'effervescence: a colourless, odourless gas' : null,
      opt.gas && smell.ppm > 3 ? `${smell.text}; ${litmus.text}` : null,
    ].filter(Boolean);
    steps.push({ reagent: id, drops: n, obs: o, event: c.event, text: `${id === 'sample' ? plural(n, 'pinch') + ' of the salt' : plural(n, 'drop') + ' ' + REAGENT[id].formula}: ${describe(o)}${extras.length ? `; ${extras.join('; ')}` : ''}` });
  }
  return steps;
}

/** The carbon dioxide from a tube, led through lime water: milky, then — if there is enough of it — clear again. */
export function limeWaterTest(mmolCO2) {
  const c = limeContent();
  const o = observe({ ...c, mmol: { ...c.mmol, CO3: (c.mmol.CO3 ?? 0) + mmolCO2 } }, 25);
  return { obs: o, text: describe(o).replace('solution', 'lime water') };
}

export const identity = (salt) => ({ cation: CATIONS[salt.cation], anion: ANIONS[salt.anion], name: salt.name, formula: salt.formula });

export function modelEvidence(salt) {
  return { cation: CATION_TESTS[salt.cation].map((g) => runTests(salt, g)), anion: ANION_TESTS[salt.anion].map((g) => runTests(salt, g)) };
}

export { observe, describe, describeSolids, describeSolution, mixLayer, degas, TUBE_MAX_ML };
