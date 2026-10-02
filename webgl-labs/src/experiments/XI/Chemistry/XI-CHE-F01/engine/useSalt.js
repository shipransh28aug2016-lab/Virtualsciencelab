/**
 * The store of XI-CHE-F01: the shared tube bench, and on top of it the things a salt analysis does
 * that a plain reagent-and-tube bench does not — a wire in a flame, litmus and a nose at the mouth
 * of a tube, a delivery tube to lime water, the shake that mixes a layer of conc. acid in, and the
 * answer. Each of them reads the tube's solved state (the pH, the ammonia pressure, the gas that
 * came out) and writes a line in the notebook, as a student would.
 */
import { createTubeStore } from '../../../../../shared/tubes/createTubeStore.js';
import { observe, mixLayer, emptyContent } from '../../../../../shared/qualitative/chemistry.js';
import { loadFrom, flame } from '../../../../../shared/qualitative/flame.js';
import { litmusAtMouth, smellOf, hclRod } from '../../../../../shared/qualitative/devices.js';
import { CFG, CATIONS, ANIONS, activeOf, saltOfBottle, analyse, modelEvidence, identity, limeWaterTest, doneTo, observationText } from './salt.js';

export const NA_ON_A_CLEAN_WIRE = 2e-8;       // mol/L-equivalent: the wire is never quite clean

const extra = () => ({
  acts: 0, message: null,
  loop: { residue: { Na: NA_ON_A_CLEAN_WIRE }, loaded: {}, t0: -1, filter: 'none', hcl: 'no', dirty: false },
  paper: null, nose: null, rod: null, delivery: null, lastEvents: {},
  cation: '', anion: '', result: null, tries: 0, revealed: false,
});

export const useSalt = createTubeStore(CFG);
const S = useSalt;
const get = () => S.getState();
const set = (p) => S.setState(p);

/** Everything that happens is one act; a message belongs to the act that raised it and goes when the next one does. */
const say = (patch, m = null) => set((s) => ({ ...patch, acts: s.acts + 1, message: m ? { ...m, at: s.acts + 1 } : null }));

const note = (s, row) => {
  const log = [...s.log, { id: `${s.log.length}`, trial: s.log.length + 1, bottle: s.ctx.bottle, ...row }];
  return { log, analysis: analyse(log) };
};

function installBase() {
  const base = get();
  const wrap = (name) => {
    const orig = base[name];
    set({ [name]: (...a) => { orig(...a); set((s) => ({ acts: s.acts + 1, message: null })); } });
  };
  ['dose', 'select', 'setBath', 'fresh'].forEach(wrap);
  const reset = base.reset;
  const setCtx = base.setCtx;
  set({
    reset: () => { reset(); set(extra()); },
    setBottle: (n) => { setCtx({ bottle: Math.max(1, Math.min(8, Math.round(Number(n)))) }); set((s) => ({ ...extra(), loop: s.loop, log: s.log, analysis: s.analysis, acts: s.acts + 1 })); },
  });
}

/* ── Tests that are not a reagent ─────────────────────────────────────── */

const actions = {
  /** Pour the tube away and leave it dry. */
  tip: () => set((s) => {
    const id = s.active; if (id === 'L') return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'tip-lime', tone: 'warn', title: 'Keep the lime water', detail: 'Tube L is the lime-water test: use a fresh one by resetting the bench.' } };
    const c = emptyContent();
    return { tubes: s.tubes.map((x) => (x.id === id ? { ...x, content: c, doses: {}, last: null, dry: true, obs: observe(c, x.tempC, x.obs), obsT: x.tempC, doseAt: s.elapsed, gasAt: -1e6 } : x)), acts: s.acts + 1, message: { at: s.acts + 1, key: 'tipped', tone: 'info', title: `Tube ${id} emptied and dried`, detail: 'A dry tube is where a solid is tried with an acid: a pinch of the salt, then the acid on it.' } };
  }),

  /** Look at the salt in the bottle. */
  look: () => set((s) => ({ ...note(s, { tube: '—', kind: 'appearance', test: 'Appearance of the salt', observation: saltOfBottle(s.ctx.bottle).form }), acts: s.acts + 1, message: null })),

  setLoopHcl: (v) => set((s) => ({ loop: { ...s.loop, hcl: v } })),
  setFilter: (v) => set((s) => ({ loop: { ...s.loop, filter: v } })),

  /** A wire dipped in the tube, held in the flame. */
  flameTest: () => set((s) => {
    const t = activeOf(s);
    if (t.id === 'L') return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'flame-lime', tone: 'warn', title: 'Not in lime water', detail: 'The wire goes into a tube that holds the sample.' } };
    const hcl = s.loop.hcl === 'yes';
    const loaded = {};
    for (const [el, c] of Object.entries(loadFrom(t.content, { hclDip: hcl }))) loaded[el] = (loaded[el] ?? 0) + c;
    for (const [el, c] of Object.entries(s.loop.residue)) loaded[el] = (loaded[el] ?? 0) + c;
    const residue = Object.fromEntries(Object.entries(loaded).map(([el, c]) => [el, Math.max(el === 'Na' ? NA_ON_A_CLEAN_WIRE : 0, c * 0.3)]));
    const seen = flame({ loaded, t: 3, filter: s.loop.filter });
    const dirty = Object.entries(s.loop.residue).some(([el, c]) => el !== 'Na' && c > 1e-5) || s.loop.residue.Na > 1e-6;
    const row = note(s, { tube: t.id, kind: 'flame', test: `Flame test: wire dipped in tube ${t.id} (${doneTo(t)})${hcl ? ', after conc. HCl' : ''}${s.loop.filter === 'cobalt' ? ', through cobalt glass' : ''}`, observation: seen.name });
    return {
      ...row, loop: { ...s.loop, loaded, residue, t0: s.elapsed, dirty }, acts: s.acts + 1,
      message: { at: s.acts + 1, key: 'flame', tone: 'info', title: `Flame: ${seen.name}`, detail: dirty ? 'The wire still carried something from the last test: what you see may be both. Clean it (conc. HCl, then the flame) between samples.' : 'Watch it for a few seconds: a sodium flash from the glass is brief, and a sample colour lasts.' },
    };
  }),

  /** Dip in conc. HCl and burn off what was on the wire. */
  cleanWire: () => set((s) => ({
    loop: { ...s.loop, loaded: {}, t0: -1, dirty: false, residue: Object.fromEntries(Object.entries(s.loop.residue).map(([el, c]) => [el, Math.max(el === 'Na' ? NA_ON_A_CLEAN_WIRE : 0, c * 0.04)])) },
    acts: s.acts + 1, message: { at: s.acts + 1, key: 'cleaned', tone: 'ok', title: 'The wire is cleaned', detail: 'Dipped in conc. HCl and heated in the flame: the volatile chlorides have gone. Some traces take two or three goes.' },
  })),

  holdLitmus: (kind) => set((s) => {
    const t = activeOf(s); const r = litmusAtMouth(t.obs, kind);
    return {
      ...note(s, { tube: t.id, kind: 'litmus', test: `Moist ${kind} litmus at the mouth of tube ${t.id} (${doneTo(t)})`, observation: r.text }),
      paper: { kind, tube: t.id, at: s.elapsed, hex: r.now.hex, text: r.text, turned: r.turned, ppm: r.ppm }, acts: s.acts + 1,
      message: { at: s.acts + 1, key: 'litmus', tone: r.turned ? 'ok' : 'info', title: r.text, detail: r.turned ? 'A film of water on the paper has dissolved ammonia and become basic: the gas is a base.' : 'Nothing basic reaches the paper. Is there a base in the tube to release it?' },
    };
  }),

  smell: () => set((s) => {
    const t = activeOf(s); const r = smellOf(t.obs);
    return {
      ...note(s, { tube: t.id, kind: 'smell', test: `Smell, by wafting, over tube ${t.id} (${doneTo(t)})`, observation: r.text }),
      nose: { tube: t.id, text: r.text, ppm: r.ppm, hazard: r.hazard, at: s.elapsed }, acts: s.acts + 1,
      message: { at: s.acts + 1, key: r.hazard ? 'smell-hazard' : 'smell', tone: r.hazard ? 'bad' : 'info', title: r.text[0].toUpperCase() + r.text.slice(1), detail: r.hazard ? 'Never sniff a reagent or a gas directly: waft it towards you with a hand, and keep your face back.' : 'Wafted, not sniffed: the safe way to smell anything.' },
    };
  }),

  hclRod: () => set((s) => {
    const t = activeOf(s); const r = hclRod(t.obs);
    return {
      ...note(s, { tube: t.id, kind: 'rod', test: `Glass rod wet with conc. HCl at the mouth of tube ${t.id} (${doneTo(t)})`, observation: r.text }),
      rod: { tube: t.id, fumes: r.fumes, text: r.text, at: s.elapsed }, acts: s.acts + 1,
      message: { at: s.acts + 1, key: 'rod', tone: r.fumes ? 'ok' : 'info', title: r.text[0].toUpperCase() + r.text.slice(1), detail: 'Ammonia and hydrogen chloride meet in the air and make solid ammonium chloride: a smoke.' },
    };
  }),

  /** Connect (or disconnect) a delivery tube from the active tube to the lime water. */
  toggleDelivery: () => set((s) => {
    if (s.delivery) return { delivery: null, acts: s.acts + 1, message: { at: s.acts + 1, key: 'delivery-off', tone: 'info', title: 'Delivery tube disconnected', detail: 'Gas now escapes into the room.' } };
    const t = activeOf(s);
    if (t.id === 'L') return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'delivery-self', tone: 'warn', title: 'Not to itself', detail: 'Pick one of the sample tubes A–F, then connect.' } };
    return {
      delivery: t.id, lastEvents: { ...s.lastEvents, [t.id]: t.content.event }, acts: s.acts + 1,
      message: { at: s.acts + 1, key: 'delivery-on', tone: 'ok', title: `Tube ${t.id} is stoppered, and its gas goes to the lime water`, detail: 'Whatever comes off the tube now bubbles through the lime water in tube L.' },
    };
  }),

  /** Shake the tube: a layer of conc. acid mixes in, with heat. */
  shake: () => set((s) => {
    const t = activeOf(s);
    if (!t.content.layer) return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'shake-none', tone: 'info', title: `Tube ${t.id} shaken`, detail: 'Nothing was layered under it: it is just mixed.' } };
    const l = t.content.layer; const c = mixLayer(t.content, t.tempC);
    const dT = (75 * l.acidMmol) / (4.18 * Math.max(1, c.volumeMl));       // 75 kJ/mol H₂SO₄ into about 4 J/(g·K) of water
    const tempC = Math.min(110, t.tempC + dT);
    const obsT = observe(c, tempC, t.obs);
    return {
      tubes: s.tubes.map((x) => (x.id === t.id ? { ...x, content: c, tempC, obs: obsT, obsT: tempC, doseAt: s.elapsed, gasAt: s.elapsed } : x)),
      acts: s.acts + 1,
      message: { at: s.acts + 1, key: 'shaken', tone: 'warn', title: `Concentrated acid mixed in: tube ${t.id} is at ${tempC.toFixed(0)} °C`, detail: 'The mixing of conc. sulfuric acid with water gives out about 75 kJ per mole. The ring at the junction is gone, and the tube is hot — which is why the acid is run down the side and not shaken in.' },
    };
  }),

  setCation: (v) => set({ cation: v }),
  setAnion: (v) => set({ anion: v }),

  /** The conclusion. */
  check: () => set((s) => {
    const salt = saltOfBottle(s.ctx.bottle);
    if (!s.cation || !s.anion) return { acts: s.acts + 1, message: { at: s.acts + 1, key: 'answer-incomplete', tone: 'warn', title: 'Name a cation and an anion', detail: 'Both are in the salt: choose one of each.' } };
    const okC = s.cation === salt.cation; const okA = s.anion === salt.anion;
    const result = { okC, okA, both: okC && okA, tests: s.analysis.tests };
    return {
      result, tries: s.tries + 1, ...note(s, { tube: '—', kind: 'conclusion', test: 'Conclusion', observation: `Cation ${CATIONS[s.cation]}, anion ${ANIONS[s.anion]}: ${okC && okA ? 'both correct' : okC ? 'the cation is right; the anion is not' : okA ? 'the anion is right; the cation is not' : 'neither is right'}` }),
      acts: s.acts + 1,
      message: {
        at: s.acts + 1, key: result.both ? 'right' : 'wrong', tone: result.both ? 'ok' : 'warn',
        title: result.both ? 'Both ions are right' : okC ? 'The cation is right; the anion is not' : okA ? 'The anion is right; the cation is not' : 'Neither is right yet',
        detail: result.both ? (s.analysis.tests >= 4 ? `Found with ${s.analysis.tests} different tests. A conclusion rests on more than one line of evidence.` : 'But you have run fewer than four different tests: a single observation is not a proof.') : 'Go back to your notebook: which observation have you not yet explained?',
      },
    };
  }),

  /** After an attempt: what the standard tests would have shown, from the same solver. */
  reveal: () => set((s) => (s.tries > 0 ? { revealed: true, acts: s.acts + 1 } : { acts: s.acts + 1, message: { at: s.acts + 1, key: 'reveal-early', tone: 'warn', title: 'Try an answer first', detail: 'The model tests are shown after an attempt.' } })),
};

installBase();
set({ ...extra(), ...actions });

/** Gas led from a tube into the lime water: carbon dioxide that comes off the connected tube goes through it. */
S.subscribe((s) => {
  const from = s.delivery; if (!from) return;
  const t = s.tubes.find((x) => x.id === from);
  const ev = t?.content.event;
  if (!ev || s.lastEvents[from] === ev) return;
  const target = s.tubes.find((x) => x.id === 'L');
  if (ev.kind !== 'CO2' || !target) { set({ lastEvents: { ...s.lastEvents, [from]: ev } }); return; }
  const c = { ...target.content, mmol: { ...target.content.mmol, CO3: (target.content.mmol.CO3 ?? 0) + ev.mmol }, event: ev };
  set({
    lastEvents: { ...s.lastEvents, [from]: ev },
    tubes: s.tubes.map((x) => (x.id === 'L' ? { ...x, content: c, obs: observe(c, x.tempC, x.obs), obsT: x.tempC, doseAt: s.elapsed, gasAt: s.elapsed } : x)),
  });
});

export { limeWaterTest, modelEvidence, identity, observationText };
