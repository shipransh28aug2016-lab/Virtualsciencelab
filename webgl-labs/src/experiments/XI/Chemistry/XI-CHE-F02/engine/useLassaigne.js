/**
 * The store of XI-CHE-F02: the shared tube bench, and on top of it the fusion tube (a burner, a
 * piece of sodium, the compound), the plunge and the filter that make the extract, and the answer.
 * The physics of the tube — heating, sodium lost as vapour, the conversion rate, how the sodium
 * is shared out — is engine/lassaigne.js; this only decides when it advances and what each
 * button does.
 */
import { createTubeStore } from '../../../../../shared/tubes/createTubeStore.js';
import { observe } from '../../../../../shared/qualitative/chemistry.js';
import {
  CFG, PORTION_ML, NA_MOLAR, initialFusion, stepFusion, addCompound, plunge, portion, compoundOfSample, elementsOf, activeOf, analyse,
} from './lassaigne.js';

const extra = () => ({
  acts: 0, message: null, fz: initialFusion(),
  nitrogen: '', sulphur: '', halogen: '', result: null, tries: 0, revealed: false,
});

export const useLassaigne = createTubeStore(CFG);
const S = useLassaigne;
const get = () => S.getState();
const set = (p) => S.setState(p);

const say = (s, m) => ({ acts: s.acts + 1, message: m ? { ...m, at: s.acts + 1 } : null });
const note = (s, row) => {
  const log = [...s.log, { id: `${s.log.length}`, trial: s.log.length + 1, sample: s.ctx.sample, ...row }];
  return { log, analysis: analyse(log) };
};

function install() {
  const base = get();
  const origTick = base.tick; const origReset = base.reset; const origSetCtx = base.setCtx;
  ['dose', 'select', 'setBath'].forEach((name) => {
    const orig = base[name];
    set({ [name]: (...a) => { orig(...a); set((s) => ({ acts: s.acts + 1, message: null })); } });
  });
  set({
    /** The fusion tube advances with the store's clock. */
    tick: (dtRaw) => {
      origTick(dtRaw);
      const s = get(); const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
      if (!s.fz.plunged && (s.fz.flame || s.fz.T > 26 || s.fz.added)) set({ fz: stepFusion(s.fz, dt) });
    },
    reset: () => { origReset(); origSetCtx({ extract: null }); set(extra()); },
    /** Which unknown is on the bench: a new fusion tube, new tubes, the notebook is kept. */
    setSample: (n) => { origSetCtx({ sample: Math.max(1, Math.min(6, Math.round(Number(n)))), extract: null }); set((s) => ({ ...extra(), log: s.log, analysis: s.analysis, acts: s.acts + 1 })); },
    setSource: (source) => { origSetCtx({ source }); set((s) => ({ acts: s.acts + 1, message: null })); },
  });
}

const actions = {
  setSodium: (mg) => set((s) => (s.fz.started ? s : { fz: { ...s.fz, naMg: Math.max(10, Math.min(150, Math.round(mg / 5) * 5)), na: Math.max(10, Math.min(150, Math.round(mg / 5) * 5)) / NA_MOLAR } })),
  setSampleMg: (mg) => set((s) => (s.fz.added ? s : { fz: { ...s.fz, sampleMg: Math.max(20, Math.min(100, Math.round(mg / 5) * 5)) } })),

  toggleFlame: () => set((s) => (s.fz.plunged
    ? { ...say(s, { key: 'plunged-already', tone: 'info', title: 'The tube has gone into the water', detail: 'Start a new fusion tube for another run.' }) }
    : { fz: { ...s.fz, flame: !s.fz.flame, started: true }, ...say(s, null) })),

  addCompound: () => set((s) => {
    const compound = compoundOfSample(s.ctx.sample);
    const r = addCompound(s.fz, compound);
    if (r.why === 'already') return say(s, { key: 'already', tone: 'info', title: 'The compound is already in', detail: 'One fusion, one portion: start a new tube for another.' });
    const m = r.cold
      ? { key: 'added-cold', tone: 'warn', title: 'The compound went on to cold sodium', detail: 'Nothing happens until the tube is hot, and then compound and sodium react together in a poor way: a good deal less comes out. The compound goes on to sodium that is already molten and fuming.' }
      : r.hot
        ? { key: 'added-hot', tone: 'info', title: 'A vigorous reaction on the red-hot sodium', detail: compound.retain < 0.8 ? `${compound.name} is volatile: much of it boils away before it can react.` : 'Some of the compound spits out of a tube this hot, but most reacts.' }
        : { key: 'added', tone: 'ok', title: 'The compound is on the molten sodium', detail: 'Heat strongly now — to a red heat — for a couple of minutes.' };
    return { fz: r.fz, ...say(s, m) };
  }),

  /** The red-hot tube plunged into distilled water, and crushed. */
  plunge: () => set((s) => {
    if (s.fz.plunged) return say(s, { key: 'plunged-already', tone: 'info', title: 'Already plunged', detail: 'Boil and filter, or start a new tube.' });
    const compound = compoundOfSample(s.ctx.sample);
    const r = plunge(s.fz, compound);
    const m = r.violent
      ? { key: 'violent', tone: 'bad', title: 'A violent reaction: the sodium that was left met the water', detail: `${r.fz.naLeftMg.toFixed(0)} mg of sodium was still unreacted. Hydrogen and sodium hydroxide spray from the dish: this is why it is done behind a screen, and why a small piece of sodium is used. Some of the extract was lost.` }
      : !r.hot
        ? { key: 'cold-plunge', tone: 'warn', title: 'The tube was not hot enough to crack', detail: 'It has to be crushed with a rod to get at what is in it, and some stays behind.' }
        : { key: 'plunge', tone: 'ok', title: 'The tube cracked in the water', detail: 'Crush it with a glass rod, boil, and filter.' };
    return { fz: r.fz, ...note(s, { tube: '—', kind: 'fusion', test: `Sodium fusion of sample ${s.ctx.sample}: ${s.fz.naMg} mg Na, ${s.fz.sampleMg} mg compound, plunged at ${s.fz.T.toFixed(0)} °C`, observation: r.violent ? 'a violent reaction on plunging' : r.hot ? 'tube cracked in the water' : 'tube did not crack' }), ...say(s, m) };
  }),

  /** Boil, crush, filter: the clear filtrate is the extract; the tubes are filled from it (2 mL each). */
  filter: () => {
    const s = get();
    if (!s.fz.plunged) { set(say(s, { key: 'filter-early', tone: 'warn', title: 'Nothing to filter yet', detail: 'The fusion tube has not been plunged into water.' })); return; }
    if (s.fz.filtered) { set(say(s, { key: 'filtered-already', tone: 'info', title: 'Already filtered', detail: 'The extract is in the tubes.' })); return; }
    get().setCtx({ extract: s.fz.extract });
    set((q) => ({ fz: { ...q.fz, filtered: true, extractLeft: Math.max(0, q.fz.extract.volumeMl - PORTION_ML * q.tubes.length) }, ...say(q, { key: 'filtered', tone: 'ok', title: 'The Lassaigne extract: clear, strongly alkaline', detail: 'Four tubes of 2 mL are ready. More portions can be had from a fresh tube while the extract lasts.' }) }));
  },

  freshTube: () => set((s) => {
    const id = s.active; const fz = s.fz;
    if (s.ctx.source === 'water') return say(s, null);
    if (!fz.filtered) return say(s, { key: 'no-extract', tone: 'warn', title: 'No extract yet', detail: 'Make the extract first: fuse, plunge, filter.' });
    if (fz.extractLeft < 1) return say(s, { key: 'extract-gone', tone: 'warn', title: 'The extract is used up', detail: 'Another fusion is needed: start a new tube.' });
    const mL = Math.min(PORTION_ML, fz.extractLeft);
    const content = portion(fz.extract, mL);
    return {
      tubes: s.tubes.map((t) => (t.id === id ? { ...t, content, doses: {}, last: null, bath: 'air', tempC: 25, obs: observe(content, 25), obsT: 25, doseAt: -1e6, gasAt: -1e6, drift: {} } : t)),
      fz: { ...fz, extractLeft: fz.extractLeft - mL }, ...say(s, null),
    };
  }),

  newFusion: () => {
    get().setCtx({ extract: null });
    set((s) => ({ fz: initialFusion(), ...say(s, { key: 'new-fusion', tone: 'info', title: 'A new fusion tube', detail: 'Clean, dry, with a fresh piece of sodium; the tubes are emptied.' }) }));
  },

  setNitrogen: (v) => set({ nitrogen: v }),
  setSulphur: (v) => set({ sulphur: v }),
  setHalogen: (v) => set({ halogen: v }),

  check: () => set((s) => {
    if (!s.nitrogen || !s.sulphur || !s.halogen) return say(s, { key: 'answer-incomplete', tone: 'warn', title: 'Say present or absent for all three', detail: 'Nitrogen, sulphur, halogen: each is one or the other.' });
    const want = elementsOf(compoundOfSample(s.ctx.sample));
    const got = { N: s.nitrogen === 'present', S: s.sulphur === 'present', Cl: s.halogen === 'present' };
    const wrong = ['N', 'S', 'Cl'].filter((k) => got[k] !== want[k]);
    const result = { wrong, both: wrong.length === 0, tests: s.analysis.tests };
    return {
      result, tries: s.tries + 1,
      ...note(s, { tube: '—', kind: 'conclusion', test: 'Conclusion', observation: `Nitrogen ${s.nitrogen}, sulphur ${s.sulphur}, halogen ${s.halogen}: ${wrong.length === 0 ? 'all three right' : `${3 - wrong.length} of 3 right`}` }),
      ...say(s, {
        key: wrong.length ? 'wrong' : 'right', tone: wrong.length ? 'warn' : 'ok',
        title: wrong.length ? `${3 - wrong.length} of 3 right` : 'All three right',
        detail: wrong.length ? 'Go back to your notebook: which of the tests did you not run, or not run properly? An unfused sample or an unboiled halogen test both mislead.' : (s.analysis.tests >= 3 ? `Found with ${s.analysis.tests} different tests.` : 'But with fewer than three confirmatory tests: a conclusion needs its evidence.'),
      }),
    };
  }),
  reveal: () => set((s) => (s.tries > 0 ? { revealed: true, ...say(s, null) } : say(s, { key: 'reveal-early', tone: 'warn', title: 'Try an answer first', detail: 'The model tests are shown after an attempt.' }))),
};

install();
set({ ...extra(), ...actions });

export { compoundOfSample, elementsOf, activeOf };
