/**
 * createStandardStore — the bench every "make up a standard solution" practical stands on.
 *
 * A balance, a weighing bottle with a lid, a jar of the solid, a funnel, a wash bottle,
 * a volumetric flask, a pipette, a stopper; a notebook and a plan to check. The lab says
 * WHAT is being made (the forms of the solid that are on the shelf, their molar mass,
 * n-factor, purity and thermochemistry, the target normality and flask); everything about
 * how a student can go wrong with it — the film on the glass, the solid that has not
 * dissolved, the flask that has cooled, the water that went past the line, the top that was
 * never mixed in — is the physics in standard.js and the balance in shared/balance.
 */
import { create } from 'zustand';
import { BALANCES, newBalance, stepBalance, readout, tare as tareBalance, zeroTare, shock, setShield as shieldBalance } from '../balance/balance.js';
import { freshObjects, panItems, stepObjects, addSample, spatulaPortion, sampleOf, massOf } from '../balance/objects.js';
import {
  newBatch, stepBatch, tipIn, rinseFunnel, addWater, removeWater, swirl, invert, levelMm, seenMm, truth, mixedFraction, aliquot, budget, claimed,
  planFeedback, FLASKS, RINSE_ML,
} from './standard.js';

const CATALOGUE = {
  bottle: { id: 'bottle', label: 'Weighing bottle', shape: 'bottle', lid: true, container: true, parts: [{ id: 'glass', label: 'glass', m: 8.24, rho: 2.23 }] },
};

export const WATER_STEPS = [0.05, 1, 5, 10, 25, 50];

/** What the notebook says: the mass the student has to quote, and the figures that follow from it. */
export function analyse(log, { form, flaskMl, requiredG = null, reported = null }) {
  const weighings = log.filter((r) => r.kind === 'weighing');
  const c = reported ? claimed(form, reported.g, flaskMl) : null;
  return { weighings: weighings.length, reported, claimed: c, requiredG };
}

/** The solute's part in the bottle, as the balance sees it. */
const soluteDef = (form) => ({ label: form.label, rho: form.rho, hygro: form.hygro });

export function createStandardStore(cfg) {
  const SEED = cfg.seed ?? 5;
  const forms = cfg.forms;
  const formOf = (s) => forms.find((f) => f.id === s.formId);

  /* The balances are as the technician left them: warm, calibrated this morning, level to a hair. */
  const makeBals = () => {
    const mk = (id, seed) => ({ ...newBalance(id, { seed, onFor: 4000 }), calErr: 1.5e-5, tilt: 0.04, shield: BALANCES[id].shield ? 'closed' : 'none' });
    return { top2: mk('top2', SEED), top3: mk('top3', SEED + 1), ana4: mk('ana4', SEED + 2) };
  };
  const requiredG = (s) => { const f = formOf(s); return s.targetN * (s.flaskMl / 1000) * (f.M / f.n); };

  const BENCH = (formId = cfg.defaultForm, flaskMl = cfg.target.flaskMl) => {
    const form = forms.find((f) => f.id === formId);
    return {
      formId, flaskMl, targetN: cfg.target.N, balanceId: 'top3', bals: makeBals(), objects: freshObjects(CATALOGUE), pan: [], spatula: 0.3, adds: 0, tips: 0,
      batch: newBatch({ flaskMl, form, seed: SEED, roomC: 25 }), room: 25, eye: 14, waterStep: 10, planned: 1.0, plan: null, revealed: null,
      elapsed: 0, timeScale: 1, acts: 0, message: null, messageUntil: 0, jarOpen: true, flaskLookups: 0,
    };
  };

  const view = (s) => ({
    reading: readout(s.bals[s.balanceId]), bal: s.bals[s.balanceId],
    level: levelMm(s.batch), seen: seenMm(s.batch, s.eye), mixed: mixedFraction(s.batch),
    truth: truth(s.batch, s.room),
  });
  const withView = (s) => ({ ...s, display: view(s) });
  const say = (s, text, tone = 'warn') => ({ message: { text, tone }, messageUntil: s.elapsed + 8 * s.timeScale });
  const counting = (fn) => (s) => {
    const r = fn(s);
    if (r === s) return r;
    const fresh = r.message && r.message !== s.message;
    return { ...r, acts: s.acts + 1, ...(fresh ? { message: { ...r.message, at: s.acts + 1 } } : { message: null }) };
  };
  const INITIAL = withView({ ...BENCH(), log: [], analysis: analyse([], { form: forms.find((f) => f.id === cfg.defaultForm), flaskMl: cfg.target.flaskMl }) });

  /** The mass a student has to quote, from the notebook: by difference if there are two weighings, or a tared net reading. */
  const reported = (s, log) => {
    const rows = log.filter((r) => r.kind === 'weighing');
    const before = [...rows].reverse().find((r) => r.afterTip === false && r.hasSample);
    const after = [...rows].reverse().find((r) => r.afterTip === true);
    if (before && after) return { g: before.reading - after.reading, how: 'by difference' };
    if (before && before.tare !== 0) return { g: before.reading, how: 'net reading, bottle tared' };
    return null;
  };

  return create((set0, get) => {
    const set = (fn) => set0(typeof fn === 'function' ? counting(fn) : fn);
    return {
      ...INITIAL,

      tick: (dtRaw) => {
        const s = get();
        const dt = Math.min(dtRaw, 1 / 20) * s.timeScale;
        const objects = stepObjects(s.objects, dt);
        const items = panItems(objects, s.pan);
        const bals = {};
        for (const id of Object.keys(s.bals)) bals[id] = stepBalance(s.bals[id], id === s.balanceId ? items : [], dt);
        const batch = stepBatch(s.batch, dt);
        const elapsed = s.elapsed + dt;
        const next = { ...s, objects, bals, batch, elapsed };
        set0({ objects, bals, batch, elapsed, display: view(next), ...(s.message && elapsed > s.messageUntil ? { message: null } : null) });
      },

      /* ── What is being made ───────────────────────────────────────────────── */
      setForm: (formId) => set((s) => {
        if (!forms.some((f) => f.id === formId)) return s;
        if (sampleOf(s.objects.bottle) > 0 || s.batch.solid + s.batch.dissolved > 0) return withView({ ...s, ...say(s, 'The solid is already out of the jar: take a fresh bench to change it.') });
        return withView({ ...s, formId, batch: newBatch({ flaskMl: s.flaskMl, form: forms.find((f) => f.id === formId), seed: SEED, roomC: s.room }) });
      }),
      setFlask: (ml) => set((s) => {
        const m = Number(ml);
        if (!FLASKS[m]) return s;
        if (s.batch.water > 0 || s.batch.solid + s.batch.dissolved > 0) return withView({ ...s, ...say(s, 'There is already something in this flask: take a fresh bench to change it.') });
        return withView({ ...s, flaskMl: m, batch: newBatch({ flaskMl: m, form: formOf(s), seed: SEED, roomC: s.room }) });
      }),
      setRoom: (c) => set((s) => withView({ ...s, room: Math.max(15, Math.min(35, Math.round(c))), batch: { ...s.batch, roomC: Math.max(15, Math.min(35, Math.round(c))) } })),
      setTimeScaleStr: (v) => set0({ timeScale: Number(v) }),
      setTimeScale: (timeScale) => set0({ timeScale }),

      /* ── The balance ──────────────────────────────────────────────────────── */
      setBalance: (balanceId) => set((s) => (BALANCES[balanceId] ? withView({ ...s, balanceId }) : s)),
      place: (how = 'gentle') => set((s) => {
        const base = { ...s, pan: ['bottle'] };
        if (how === 'drop') return withView({ ...base, bals: { ...s.bals, [s.balanceId]: shock(s.bals[s.balanceId], massOf(s.objects.bottle), 0.3) }, ...say(s, 'Dropped on the pan: it will ring for several seconds.') });
        return withView(base);
      }),
      drop: () => get().place('drop'),
      remove: () => set((s) => withView({ ...s, pan: [] })),
      tare: () => set((s) => withView({ ...s, bals: { ...s.bals, [s.balanceId]: tareBalance(s.bals[s.balanceId]) } })),
      zero: () => set((s) => withView({ ...s, bals: { ...s.bals, [s.balanceId]: zeroTare(s.bals[s.balanceId]) } })),
      setShield: (state) => set((s) => withView({ ...s, bals: { ...s.bals, [s.balanceId]: shieldBalance(s.bals[s.balanceId], state) } })),
      setLid: (on) => set((s) => withView({ ...s, objects: { ...s.objects, bottle: { ...s.objects.bottle, lidOn: on === 'on' || on === true } } })),
      setSpatula: (g) => set0({ spatula: Math.max(0.01, Math.min(1, Math.round(g * 100) / 100)) }),
      /** A spatula-full of the solid from the jar into the bottle on the pan. */
      addSolid: () => set((s) => {
        const o = s.objects.bottle;
        if (!s.pan.includes('bottle')) return withView({ ...s, ...say(s, 'Put the weighing bottle on the pan to weigh the solid into it.') });
        if (o.lidOn) return withView({ ...s, ...say(s, 'The lid is on the bottle.') });
        if (BALANCES[s.balanceId].shield && s.bals[s.balanceId].shield === 'closed') return withView({ ...s, ...say(s, 'The draft shield is shut: open it to add the solid.') });
        const g = spatulaPortion(s.spatula, SEED, s.adds);
        return withView({ ...s, adds: s.adds + 1, objects: { ...s.objects, bottle: addSample(o, g, soluteDef(formOf(s))) } });
      }),

      /* ── The glassware ────────────────────────────────────────────────────── */
      setFunnel: (on) => set((s) => withView({ ...s, batch: { ...s.batch, funnelIn: on === 'in' || on === true } })),
      /** Tip the bottle's solid through the funnel into the flask; the film that stays in the bottle stays there. */
      tip: () => set((s) => {
        const o = s.objects.bottle; const g = sampleOf(o);
        if (g <= 0) return withView({ ...s, ...say(s, 'There is no solid in the bottle.') });
        if (s.pan.includes('bottle')) return withView({ ...s, ...say(s, 'Take the bottle off the pan first: you tip it over the funnel, not over the balance.') });
        if (o.lidOn) return withView({ ...s, ...say(s, 'Take the lid off first.') });
        const film = 0.0015 + 0.0035 * ((s.tips * 0.37 + 0.21) % 1);
        const moved = g * (1 - film);
        const f = formOf(s);
        const batch = tipIn(s.batch, (moved * f.purity) / f.M);
        return withView({ ...s, tips: s.tips + 1, batch, objects: { ...s.objects, bottle: { ...o, transferred: true, parts: o.parts.map((p) => (p.id === 'sample' ? { ...p, m: g - moved } : p)) } } });
      }),
      /** A squirt from the wash bottle: over the funnel, or into the bottle and then through the funnel. */
      rinse: (target = 'funnel') => set((s) => {
        if (target === 'funnel') return withView({ ...s, batch: rinseFunnel(s.batch) });
        const o = s.objects.bottle; const left = sampleOf(o);
        if (left <= 0) return withView({ ...s, ...say(s, 'The bottle is already clean.') });
        if (s.pan.includes('bottle')) return withView({ ...s, ...say(s, 'Take the bottle off the pan to rinse it.') });
        const f = formOf(s); const back = left * 0.9;
        const batch = addWater({ ...s.batch, dissolved: s.batch.dissolved + (back * f.purity) / f.M }, RINSE_ML, s.room);
        return withView({ ...s, batch, objects: { ...s.objects, bottle: { ...o, parts: o.parts.map((p) => (p.id === 'sample' ? { ...p, m: left - back } : p)) } } });
      }),
      rinseBottle: () => get().rinse('bottle'),
      setWaterStep: (v) => set0({ waterStep: Number(v) }),
      addWater: () => set((s) => withView({ ...s, batch: addWater(s.batch, s.waterStep, s.room) })),
      pipette: () => set((s) => withView({ ...s, batch: removeWater(s.batch, 1) })),
      swirl: () => set((s) => withView({ ...s, batch: swirl(s.batch) })),
      stopper: (on) => set((s) => withView({ ...s, batch: { ...s.batch, stoppered: on === 'in' || on === true, funnelIn: on === 'in' || on === true ? false : s.batch.funnelIn } })),
      invert: () => set((s) => {
        if (!s.batch.stoppered) return withView({ ...s, ...say(s, 'Put the stopper in before you turn the flask over.') });
        return withView({ ...s, batch: invert(s.batch) });
      }),
      invertMany: () => { for (let i = 0; i < 5; i += 1) get().invert(); },
      setEye: (mm) => set((s) => withView({ ...s, eye: Math.max(-30, Math.min(30, Math.round(mm))) })),

      /* ── The plan ─────────────────────────────────────────────────────────── */
      setPlanned: (g) => set0({ planned: Math.max(0.1, Math.min(10, Math.round(g * 1000) / 1000)) }),
      checkPlan: () => set((s) => {
        const fb = planFeedback({ planned: s.planned, required: requiredG(s), form: formOf(s), forms });
        return withView({ ...s, plan: fb, ...say(s, fb.text, fb.ok ? 'ok' : 'warn') });
      }),

      /* ── The notebook ─────────────────────────────────────────────────────── */
      recordWeight: () => set((s) => {
        const o = s.objects.bottle; const r = s.display.reading; const bal = s.bals[s.balanceId];
        const sp = BALANCES[s.balanceId];
        const row = {
          id: `${s.log.length}`, kind: 'weighing', trial: s.log.filter((q) => q.kind === 'weighing').length + 1, balance: sp.label,
          what: s.pan.includes('bottle') ? (sampleOf(o) > 0 ? (o.transferred ? 'bottle after tipping out' : 'bottle + solid') : 'bottle, empty') : 'empty pan',
          afterTip: Boolean(o.transferred), hasSample: sampleOf(o) > 0.05, reading: r.value, text: r.text, tare: Number(bal.tareG.toFixed(sp.decimals)),
          steady: r.stable ? 'yes' : 'no', note: [!r.stable ? 'not steady' : '', o.lidOn ? '' : (o.parts.some((p) => p.hygro) ? 'lid off' : '')].filter(Boolean).join('; '),
        };
        const log = [...s.log, row];
        return { log, analysis: analyse(log, { form: formOf(s), flaskMl: s.flaskMl, requiredG: requiredG(s), reported: reported(s, log) }) };
      }),
      record: () => get().recordWeight(),
      clearLog: () => set0((s) => ({ log: [], analysis: analyse([], { form: formOf(s), flaskMl: s.flaskMl, requiredG: requiredG(s), reported: null }) })),

      /** The reference titration: only once there is a made-up, stoppered, mixed flask to titrate. */
      reveal: () => set((s) => {
        const b = s.batch;
        if (b.solid + b.dissolved <= 0) return withView({ ...s, ...say(s, 'There is nothing in the flask yet.') });
        if (b.solid > 0) return withView({ ...s, ...say(s, 'There is still solid in the flask: dissolve it before the solution can be checked.') });
        if (levelMm(b) < -10) return withView({ ...s, ...say(s, 'The flask is not made up to the mark.') });
        if (mixedFraction(b) < 0.97) return withView({ ...s, ...say(s, 'The flask has not been mixed: turn it over, stoppered, ten times.') });
        const rep = reported(s, s.log);
        const o = s.objects.bottle;
        const f = formOf(s);
        const trueG = ((b.poured + (sampleOf(o) > 0 ? 0 : 0)) * f.M) / f.purity;
        const bud = budget(b, { reportedG: rep ? rep.g : trueG, trueG, useC: s.room });
        const t = truth(b, s.room);
        const result = { ...bud, M: t.M, N: t.N, vsTargetPct: (t.N / s.targetN - 1) * 100, claimed: rep ? claimed(f, rep.g, s.flaskMl) : null, reported: rep, aliquotTop: aliquot(b, 0.1, s.room), aliquotBottom: aliquot(b, 0.9, s.room) };
        const log = [...s.log, { id: `${s.log.length}`, kind: 'result', trial: '★', what: 'reference titration of the flask', reading: Number(t.N.toFixed(5)), text: `${t.N.toFixed(4)} N`, tare: '—', steady: '—', note: `error against your figure ${bud.totalPct >= 0 ? '+' : ''}${bud.totalPct.toFixed(2)} %` }];
        return withView({ ...s, revealed: result, log, analysis: analyse(log, { form: f, flaskMl: s.flaskMl, requiredG: requiredG(s), reported: rep }) });
      }),

      reset: () => set0((s) => withView({ ...s, ...BENCH(s.formId, s.flaskMl), room: s.room, timeScale: s.timeScale, log: s.log, analysis: s.analysis })),
    };
  });
}

export { CATALOGUE as STANDARD_CATALOGUE };
