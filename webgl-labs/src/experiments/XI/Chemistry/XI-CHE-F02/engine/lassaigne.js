/**
 * XI-CHE-F02 — nitrogen, sulfur and a halogen in an organic compound, by Lassaigne's sodium fusion.
 * Pure: no React, no three, no store (the store is useLassaigne.js).
 *
 * The first half is a fusion tube: a Bunsen flame heats it (900 °C flame, a time constant of half
 * a minute), the sodium melts at 98 °C and fumes above about 450 °C, the compound that is dropped
 * on to it is converted at a rate that climbs steeply with temperature, and the tube is plunged into
 * water. What comes out is not looked up: the sodium is shared out in the order the chemistry
 * takes it — halide first, then cyanide (which also needs a carbon), then sulfide (two sodium each) —
 * and whatever sulfur is left without sodium to reduce it takes up the cyanide as thiocyanate. That is
 * the "N + S gives a red colour, not a blue one" of the textbook; here it is a consequence of how
 * much sodium was used.
 *
 * The second half is the tubes, on the shared qualitative-analysis solver (shared/qualitative): iron(II)
 * takes the cyanide (when it is cyanide ion and not HCN), acid dissolves what is left, iron(III) makes
 * Prussian blue or the red thiocyanate, nitroprusside turns violet with sulfide, lead acetate goes black,
 * and boiling with nitric acid drives off the HCN and H₂S that would otherwise give silver cyanide
 * and silver sulfide in the halogen test.
 */
import { emptyContent, pour, observe, describe, addReagent, settle } from '../../../../../shared/qualitative/chemistry.js';
import { REAGENTS, LASSAIGNE_REAGENTS } from '../../../../../shared/qualitative/ions.js';
import { mulberry32 } from '../../../../../shared/numerics.js';

export const NA_MOLAR = 22.99;
export const NA_MELT = 97.8;
export const NA_FUME = 450;

/** What each compound is made of (atoms per molecule), what it looks like, and how much of it survives being dropped on hot sodium. */
export const COMPOUNDS = [
  { id: 'urea', name: 'urea', formula: 'CO(NH₂)₂', M: 60.06, C: 1, N: 2, S: 0, X: 0, form: 'white crystals', hex: '#f3f3ef', retain: 0.95 },
  { id: 'thiourea', name: 'thiourea', formula: 'CS(NH₂)₂', M: 76.12, C: 1, N: 2, S: 1, X: 0, form: 'white crystals', hex: '#f1f1ec', retain: 0.95 },
  { id: 'chlorobenzene', name: 'chlorobenzene', formula: 'C₆H₅Cl', M: 112.56, C: 6, N: 0, S: 0, X: 1, form: 'a colourless liquid smelling of almonds', hex: '#e7e9ee', retain: 0.6 },
  { id: 'benzenesulphonic', name: 'benzenesulphonic acid', formula: 'C₆H₅SO₃H', M: 158.17, C: 6, N: 0, S: 1, X: 0, form: 'a white solid that goes damp in the air', hex: '#f4f1ea', retain: 0.9 },
  { id: 'glucose', name: 'glucose', formula: 'C₆H₁₂O₆', M: 180.16, C: 6, N: 0, S: 0, X: 0, form: 'white crystals', hex: '#f5f5f2', retain: 0.95 },
  { id: 'chloroaniline', name: '4-chloroaniline', formula: 'ClC₆H₄NH₂', M: 127.57, C: 6, N: 1, S: 0, X: 1, form: 'pale brown flakes', hex: '#c9ad8a', retain: 0.9 },
];
export const SAMPLES = COMPOUNDS.length;
export const ORDER = (() => {
  const rng = mulberry32(20262);
  const a = COMPOUNDS.map((_, i) => i);
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
})();
export const compoundOfSample = (n) => COMPOUNDS[ORDER[Math.max(1, Math.min(SAMPLES, n)) - 1]];

/* ── The fusion tube ───────────────────────────────────────────────────── */

export const T_FLAME = 900; export const TAU_HEAT = 35; export const TAU_COOL = 90;
/** Conversion rate of the compound on hot sodium, per second: ×e every 120 K, 0.05 s⁻¹ at 700 °C (95 % in about a minute). */
export const kFusion = (T) => (T > 300 ? 0.05 * Math.exp((T - 700) / 120) : 0);
/** Sodium lost as vapour from an open tube, per second. */
export const kNaLoss = (T) => (T > NA_FUME ? 0.0006 * Math.exp((T - 700) / 150) : 0);
/** Sodium that each molecule converted uses on the carbon, hydrogen and oxygen of the compound before it gets to the heteroatoms. */
export const NA_PER_MOLECULE = 2;

export const initialFusion = () => ({
  naMg: 70, sampleMg: 50, flame: false, T: 25, na: 70 / NA_MOLAR, started: false,
  added: false, addedCold: false, efficiency: 1, progress: 0,
  plunged: false, filtered: false, extract: null, extractLeft: 0, outcome: null, violent: false, naLeftMg: 0,
});

export const sodiumState = (fz) => (fz.plunged ? 'spent' : fz.na < 1e-4 ? 'gone' : fz.T < NA_MELT ? 'solid' : fz.T < NA_FUME ? 'molten' : 'vapour');

/** Advance the fusion tube by dt seconds. */
export function stepFusion(fz, dt) {
  if (fz.plunged) return fz;
  const target = fz.flame ? T_FLAME : 25; const tau = fz.flame ? TAU_HEAT : TAU_COOL;
  const T = fz.T + (target - fz.T) * (1 - Math.exp(-dt / tau));
  const na = fz.na * Math.exp(-kNaLoss(T) * dt);
  const progress = fz.added ? fz.progress + (1 - fz.progress) * (1 - Math.exp(-kFusion(T) * dt)) : fz.progress;
  return { ...fz, T, na, progress };
}

/**
 * What the sodium and the converted part of the compound make. Sodium is shared out in the order the chemistry takes
 * it; every number is mmol.
 */
export function fuse(compound, { sampleMg, na, progress, efficiency }) {
  const mol = (sampleMg / compound.M) * progress * efficiency;          // mmol of compound converted
  const nN = mol * compound.N; const nS = mol * compound.S; const nX = mol * compound.X; const nC = mol * compound.C;
  const matrix = NA_PER_MOLECULE * mol;
  const na1 = Math.max(0, na - matrix);
  const X = Math.min(nX, na1); const na2 = na1 - X;
  const CNmade = Math.min(nN, nC, na2); const na3 = na2 - CNmade;
  const S2 = Math.min(nS, na3 / 2); const na4 = na3 - 2 * S2;
  const SCN = Math.min(nS - S2, CNmade);                                // sulfur with no sodium left to reduce it takes up the cyanide
  const CN = CNmade - SCN;
  const base = na4 + Math.min(na, matrix);                              // unreacted sodium, and what the carbon and hydrogen took: all of it NaOH in the water
  return { CN, S2, SCN, X, base, converted: mol, naUsed: na - na4, naLeft: na4 };
}

/** Start the compound on the sodium: how much of it is going to react depends on whether the tube is hot and how volatile the compound is. */
export function addCompound(fz, compound) {
  if (fz.added || fz.plunged) return { fz, why: 'already' };
  const cold = fz.T < 250;
  const hot = fz.T > 650;
  const efficiency = (cold ? 0.7 : 1) * (hot ? compound.retain : Math.min(1, compound.retain + 0.15));
  return { fz: { ...fz, started: true, added: true, addedCold: cold, efficiency }, cold, hot, efficiency };
}

/** The hot tube plunged into water: the extract, and whether the tube was fit to plunge. */
export function plunge(fz, compound) {
  const hot = fz.T >= 400;
  const out = fz.added ? fuse(compound, { sampleMg: fz.sampleMg, na: fz.na, progress: fz.progress, efficiency: fz.efficiency }) : { CN: 0, S2: 0, SCN: 0, X: 0, base: fz.na, converted: 0, naUsed: 0, naLeft: fz.na };
  const naLeftMg = out.naLeft * NA_MOLAR;
  const violent = naLeftMg > 60 && hot;
  /* A violent plunge throws some of the extract out of the dish. */
  const keep = violent ? 0.7 : hot ? 1 : 0.8;
  const mmol = {
    CN: out.CN * keep, S: out.S2 * keep, SCN: out.SCN * keep, Cl: out.X * keep,
    Na: (out.CN + 2 * out.S2 + out.SCN + out.X + out.base) * keep,
  };
  return { fz: { ...fz, plunged: true, flame: false, T: 60, extract: { mmol, volumeMl: 15 }, extractLeft: 15, outcome: out, violent, naLeftMg, hot }, out, hot, violent };
}

/* ── The tubes ─────────────────────────────────────────────────────────── */

export const TUBE_IDS = ['A', 'B', 'C', 'D'];
export const PORTION_ML = 2;

/** The reagents of the bench: iron(II) sulfate and the acids from the shared shelf, plus the Lassaigne ones. */
const pick = (id) => REAGENTS.find((r) => r.id === id);
export const SHELF = [
  pick('feso4'), pick('h2so4'), pick('hcl'), LASSAIGNE_REAGENTS[0], LASSAIGNE_REAGENTS[1], LASSAIGNE_REAGENTS[2], LASSAIGNE_REAGENTS[3],
  pick('hno3'), pick('agno3'), pick('nh4oh'), LASSAIGNE_REAGENTS[4],
];
export const REAGENT = Object.fromEntries(SHELF.map((r) => [r.id, r]));
export const DROP_ML = 0.05;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A portion of the extract: what the tubes hold. */
export const portion = (extract, mL = PORTION_ML) => {
  const f = mL / extract.volumeMl;
  return { ...emptyContent(), volumeMl: mL, mmol: Object.fromEntries(Object.entries(extract.mmol).map(([k, v]) => [k, v * f])) };
};

export const CFG = {
  tubes: [{ id: 'A', label: 'A', tag: '#38bdf8' }, { id: 'B', label: 'B', tag: '#fbbf24' }, { id: 'C', label: 'C', tag: '#34d399' }, { id: 'D', label: 'D', tag: '#f472b6' }],
  roomC: 25,
  baths: { air: { T: 'room', tau: 150 }, ice: { T: 2, tau: 40 }, hot: { T: 100, tau: 45 } },
  pathCm: 1.4,
  shelfPitch: 0.27,
  reagents: SHELF,
  ctx: { sample: 1, source: 'extract', extract: null },
  volume: (c) => c.volumeMl,
  /** Tubes start empty; filtering the extract (or choosing to test the unfused compound) fills them. */
  initial: (def, ctx) => (ctx.source === 'water' ? pour(emptyContent(), {}, PORTION_ML) : ctx.extract ? portion(ctx.extract) : emptyContent()),
  add: (content, reagent, mL, c) => addReagent(content, reagent, mL, c.tempC),
  observe,
  settle,
  row: (a) => rowFor(a),
  analyse: (log) => analyse(log),
};

export function doneTo(tube) {
  const doses = Object.entries(tube.doses).filter(([, n]) => n > 0).map(([id, n]) => `${plural(n, 'drop')} ${REAGENT[id].formula}`);
  const bits = ['2 mL extract', ...doses];
  if (tube.bath === 'hot' && tube.tempC > 60) bits.push(`boiled (${tube.tempC.toFixed(0)} °C)`);
  return bits.join(' + ');
}

export function observationText(tube) {
  const o = tube.obs;
  const parts = [describe(o)];
  if (o.gas > 0.05 && tube.gasAt > -1e5) parts.push(o.gasKind === 'HCN' ? 'a gas comes off (hydrogen cyanide: do not breathe it)' : o.gasKind === 'H2S' ? 'a gas comes off (rotten eggs: hydrogen sulfide)' : 'a gas comes off');
  return parts.join('; ');
}

function rowFor({ tube, ctx }) {
  return { sample: ctx.lab?.sample ?? '—', tube: tube.id, kind: Object.keys(tube.doses).filter((k) => tube.doses[k] > 0).at(-1) ?? 'extract', test: doneTo(tube), observation: observationText(tube) };
}

export function analyse(log) {
  const kinds = new Set(log.map((r) => r.kind).filter((k) => k && k !== 'extract' && k !== 'conclusion' && k !== 'fusion'));
  return { rows: log.length, kinds: [...kinds], tests: kinds.size };
}

export const activeOf = (s) => s.tubes.find((t) => t.id === s.active);
export const elementsOf = (compound) => ({ N: compound.N > 0, S: compound.S > 0, Cl: compound.X > 0 });

/* ── What the bench says ───────────────────────────────────────────────── */

export function statusOf(s) {
  const fz = s.fz;
  if (fz.added && !fz.plunged && fz.progress >= 0.9) return { key: 'fused', tone: 'ok', title: 'The fusion is complete', detail: 'Now plunge the red-hot tube into distilled water in a dish (behind a screen), crush it, boil and filter.' };
  if (s.message && s.message.at === s.acts) return { key: s.message.key, tone: s.message.tone ?? 'warn', title: s.message.title, detail: s.message.detail };
  if (!fz.plunged) {
    const st = sodiumState(fz);
    if (!fz.started && !fz.flame) return { key: 'start', tone: 'info', title: 'Dry fusion tube with a piece of sodium', detail: 'Set the size of the sodium and the sample, light the burner and heat until the sodium melts and fumes. Then drop the compound on to the red-hot sodium.' };
    if (!fz.added) return { key: st === 'vapour' ? 'hot-ready' : 'heating', tone: st === 'vapour' ? 'ok' : 'info', title: st === 'vapour' ? `Sodium is fuming at ${fz.T.toFixed(0)} °C` : st === 'molten' ? `Sodium has melted: ${fz.T.toFixed(0)} °C` : `Heating: ${fz.T.toFixed(0)} °C`, detail: st === 'vapour' ? 'Now is the time to add the compound. Wait too long and the sodium goes as vapour.' : 'Keep heating until the tube is nearly red hot.' };
    if (fz.progress < 0.9) return { key: 'fusing', tone: 'info', title: `Fusion ${(100 * fz.progress).toFixed(0)} % done`, detail: `At ${fz.T.toFixed(0)} °C. The compound is converted faster the hotter the tube; at a dull red heat it takes minutes, at bright red a minute.` };
    return { key: 'fused', tone: 'ok', title: 'The fusion is complete', detail: 'Now plunge the red-hot tube into distilled water in a dish (behind a screen), crush it, boil and filter.' };
  }
  if (!fz.filtered) return { key: 'plunged', tone: 'info', title: 'Tube plunged into water', detail: 'Boil the mixture and filter it: the clear filtrate is the Lassaigne (sodium fusion) extract.' };
  const t = activeOf(s);
  if (!t.content.volumeMl) return { key: 'tube-empty', tone: 'info', title: `Tube ${t.id} is empty`, detail: 'Fill it with a fresh portion of the extract.' };
  const text = describe(t.obs);
  if (!Object.values(t.doses).some((n) => n > 0)) return { key: 'extract', tone: 'info', title: `Tube ${t.id}: 2 mL of the extract — ${text}`, detail: 'The extract is strongly alkaline. Choose a reagent and add it: nitrogen with iron(II) sulfate, boiled, acidified, then iron(III); sulfur with nitroprusside or lead acetate; the halogen after boiling with nitric acid.' };
  return { key: 'seen', tone: 'ok', title: `Tube ${t.id}: ${text}`, detail: `${doneTo(t)}.` };
}

/* ── Model tests: what the standard procedures show for this compound ───────────────────────────────── */

const steps = (extract, group) => {
  let c = portion(extract); const out = []; let T = 25; let obs = observe(c, T); const drift = {};
  for (const [id, n, opt = {}] of group) {
    if (opt.boil) {
      T = 100;
      for (let t = 0; t < opt.boil; t += 0.5) { const next = settle(c, T, 0.5, obs, drift); if (next !== c) { c = next; obs = observe(c, T, obs); } }
      obs = observe(c, T, obs); out.push({ boil: opt.boil, text: `boiled ${opt.boil} s: ${describe(obs)}`, obs });
      continue;
    }
    c = addReagent(c, REAGENT[id], n * DROP_ML, T);
    obs = observe(c, T, obs);
    out.push({ reagent: id, text: `${plural(n, 'drop')} ${REAGENT[id].formula}: ${describe(obs)}`, obs });
  }
  return out;
};

/** A standard run with an excess of sodium (120 mg), so that nitrogen and sulfur come out separately as CN⁻ and S²⁻. */
export const standardExtract = (compound, naMg = 120, sampleMg = 50) => plunge({ ...initialFusion(), added: true, na: naMg / NA_MOLAR, sampleMg, progress: 1, efficiency: compound.retain, T: 700 }, compound).fz.extract;

export function modelEvidence(compound) {
  const ex = standardExtract(compound);
  const out = {};
  if (compound.N) out.N = [steps(ex, [['feso4', 5], ['', 0, { boil: 90 }], ['hcl', 10], ['fecl3', 5]])];
  if (compound.S) out.S = [steps(ex, [['nitroprusside', 3]]), steps(ex, [['acoh', 10], ['pbac2', 5]])];
  out.X = [steps(ex, [['hno3', 40], ['', 0, { boil: 240 }], ['agno3', 10]])];
  if (compound.N || compound.S) out.X0 = [steps(ex, [['hno3', 40], ['agno3', 10]])];
  return out;
}

export { observe, describe };
