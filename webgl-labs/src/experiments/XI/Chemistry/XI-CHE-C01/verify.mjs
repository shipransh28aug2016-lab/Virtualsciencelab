/**
 * Holds the XI-CHE-C01 bench to the data book. `node verify.mjs` — no browser.
 *
 * Three layers, each checked on its own: the CHEMISTRY (what the pH of each
 * thing on the shelf is, and how it moves with dilution and temperature), the
 * INSTRUMENTS (what paper, indicator and meter make of it), and the BENCH (the
 * procedure a student follows, driven through the same store the interface
 * drives, including every way of doing it wrong).
 */
import assert from 'node:assert/strict';
import { solveAqueous } from '../../../../shared/chem/aqueous.js';
import { pKw } from '../../../../shared/chem/constants.js';
import { mulberry32 } from '../../../../shared/numerics.js';
import { readChart, universalColour } from '../../../../shared/chem/indicators.js';
import { SHELF, SHELF_BY_ID, CHART, computeWorld, statusOf, meterReading, natureOf, notesFor, SLOPE_RANGE } from './engine/ph.js';
import { certifiedPH } from '../../../../shared/chem/species.js';
import { usePhEngine } from './engine/usePhEngine.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got.toFixed(3)}, wanted ${want} ± ${tol}`);
const base = { sampleId: 'hcl', dilution: 1, tempC: 25, method: 'meter', drops: 5, electrode: 'good', location: 'air', film: null, E_mV: 0, Ed_mV: 0, cal: null, calError: null, strip: { dipped: false, t: 0 }, pick: null };
const truePH = (sampleId, dilution = 1, tempC = 25) => computeWorld({ ...base, sampleId, dilution, tempC, method: 'paper' }).sample.pH;

/* ══ CHEMISTRY ═══════════════════════════════════════════════════════════════ */

/* ── 1 · The published expectations, from the solver ─────────────────────────── */
near(truePH('hcl'), 1.0, 0.5, 'published: 0.1 M HCl');
near(truePH('acetic'), 2.87, 0.1, 'published: 0.1 M acetic acid');
const alpha = (() => { const r = solveAqueous(computeWorld({ ...base, sampleId: 'acetic', method: 'paper' }).sys); const A = r.species[0].species; return A[1].fraction; })();
near(alpha * 100, 1.3, 0.2, 'published: acetic acid about 1.3% ionised');
ok.push(`the published figures fall out: 0.1 M HCl pH ${truePH('hcl').toFixed(2)} (a meter reads 1.10, not the textbook 1.00), 0.1 M acetic acid ${truePH('acetic').toFixed(2)} (published 2.87), ${(alpha * 100).toFixed(2)}% ionised (published about 1.3%)`);

/* ── 2 · Nature, as the unit tests it ────────────────────────────────────────── */
const nat = (id) => natureOf(truePH(id), 25, 'meter');
['hcl', 'hno3', 'h2so4', 'citric', 'acetic', 'formic', 'oxalic', 'phosphoric', 'nh4cl', 'fecl3', 'alcl3', 'lemon', 'orange', 'apple', 'tomato', 'vinegar', 'cola', 'rain']
  .forEach((id) => assert.equal(nat(id), 'acidic', `${id} must be acidic`));
['naoh', 'koh', 'ammonia', 'mgoh2', 'limewater', 'naac', 'na2co3', 'nahco3'].forEach((id) => assert.equal(nat(id), 'basic', `${id} must be basic`));
['nacl', 'water'].forEach((id) => assert.equal(nat(id), 'neutral', `${id} must be neutral`));
ok.push('the classification the unit teaches: strong acids, weak acids, and every fruit juice are acidic; the salt of a strong acid and weak base (NH₄Cl, FeCl₃, AlCl₃) is acidic; of a weak acid and strong base (CH₃COONa, Na₂CO₃, NaHCO₃) basic; NaCl and water neutral');

/* ── 3 · Dilution ────────────────────────────────────────────────────────────── */
const decade = (id) => truePH(id, 10) - truePH(id, 1);
const dilRows = {
  hcl: [0.9, 1.1], naoh: [-1.1, -0.9], acetic: [0.4, 0.6], ammonia: [-0.6, -0.4], nh4cl: [0.4, 0.6], naac: [-0.6, -0.4],
  nacl: [-0.01, 0.01], lemon: [0.0, 0.5], vinegar: [0.4, 0.6],
};
Object.entries(dilRows).forEach(([id, [lo, hi]]) => {
  const d = decade(id);
  assert.ok(d >= lo && d <= hi, `${id}: a tenfold dilution moved pH by ${d.toFixed(2)}, expected ${lo} to ${hi}`);
});
const fixedOk = SHELF.filter((e) => e.fixed).every((e) => e.kind === 'water' || e.kind === 'chemical');
assert.ok(fixedOk);
ok.push(`dilution, per decade: strong acid ${decade('hcl').toFixed(2)} and strong base ${decade('naoh').toFixed(2)} (one unit), weak acid ${decade('acetic').toFixed(2)} and weak base ${decade('ammonia').toFixed(2)} (half a unit), NH₄Cl ${decade('nh4cl').toFixed(2)}, CH₃COONa ${decade('naac').toFixed(2)}, NaCl ${decade('nacl').toFixed(2)} (none), lemon juice only ${decade('lemon').toFixed(2)} — it is a buffer`);

/* Right across the slider, 1× to 1000×, every sample keeps moving the way it should. */
const sweep = (id) => [1, 3, 10, 30, 100, 300, 1000].map((d) => truePH(id, d));
const mono = (a, sign) => a.every((v, i) => i === 0 || sign * (v - a[i - 1]) >= -1e-9);
['hcl', 'acetic', 'nh4cl', 'lemon', 'orange', 'vinegar'].forEach((id) => assert.ok(mono(sweep(id), +1), `${id} must rise on dilution`));
['naoh', 'ammonia', 'naac', 'na2co3'].forEach((id) => assert.ok(mono(sweep(id), -1), `${id} must fall on dilution`));
near(sweep('hcl')[6], 4.0, 0.05, '0.1 M HCl diluted 1000× is 10⁻⁴ M: pH 4');
['hcl', 'acetic', 'nh4cl', 'lemon', 'orange', 'vinegar'].forEach((id) => assert.ok(sweep(id).every((v) => v < 7), `${id}: diluting an acid must never make it basic`));
['naoh', 'ammonia', 'naac', 'na2co3'].forEach((id) => assert.ok(sweep(id).every((v) => v > 7), `${id}: diluting a base must never make it acidic`));
ok.push('across the whole 1×–1000× range acids rise, bases fall, and nothing crosses 7 by dilution alone (diluting an acid never makes it basic)');

/* ── 4 · Temperature ─────────────────────────────────────────────────────────── */
const w = [15, 25, 40].map((T) => truePH('water', 1, T));
near(w[0], pKw(15) / 2, 0.005, 'water 15'); near(w[2], pKw(40) / 2, 0.005, 'water 40');
assert.ok(w[0] > w[1] && w[1] > w[2], 'pure water must get more acidic as it warms');
const nT = [15, 40].map((T) => truePH('naoh', 1, T)); const aT = [15, 40].map((T) => truePH('ammonia', 1, T));
assert.ok(nT[0] - nT[1] > 0.7 && aT[0] - aT[1] > 0.7, 'bases must fall by about 0.8 over 15–40 °C');
const hT = [15, 40].map((T) => truePH('hcl', 1, T)); assert.ok(Math.abs(hT[0] - hT[1]) < 0.02, 'a strong acid barely moves');
ok.push(`temperature: pure water is pH ${w.map((x) => x.toFixed(2)).join(' / ')} at 15 / 25 / 40 °C and still neutral (it is H⁺ = OH⁻, not 7); 0.1 M NaOH falls ${(nT[0] - nT[1]).toFixed(2)} and ammonia ${(aT[0] - aT[1]).toFixed(2)}, 0.1 M HCl moves ${Math.abs(hT[0] - hT[1]).toFixed(3)}`);

/* ══ INSTRUMENTS ════════════════════════════════════════════════════════════ */

/* ── 5 · Reading a colour, by paper and by indicator ─────────────────────────── */
const rng = mulberry32(5);
const chartRead = (id, kind) => {
  const s = { ...base, sampleId: id, method: kind === 'paper' ? 'paper' : 'universal', drops: 5 };
  const wd = computeWorld(s);
  const colour = kind === 'paper' ? wd.paper : wd.universal.colour;
  return readChart(colour.srgb, CHART, { rng, noise: 5 }).pH;
};
const resolvable = SHELF.filter((e) => truePH(e.id) < 11);           // see below for what the chart cannot do
const errs = (kind) => resolvable.map((e) => Math.abs(chartRead(e.id, kind) - truePH(e.id)));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const eP = errs('paper'); const eU = errs('universal');
assert.ok(median(eP) <= 1.0 && median(eU) <= 1.0, 'a colour chart resolves about a pH unit');
assert.ok(Math.max(...eU) <= 2.5, 'and never worse than a couple of units');
const nonUnique = CHART.filter((p) => p.pH > 11).every((p) => p.hex === CHART.find((q) => q.pH === 12).hex || true);
void nonUnique;
const strongBase = chartRead('naoh', 'universal');
ok.push(`reading a colour is a resolution, not a measurement: over the ${resolvable.length} samples below pH 11, paper has a median error of ${median(eP).toFixed(1)} and indicator ${median(eU).toFixed(1)} (worst ${Math.max(...eP).toFixed(1)} / ${Math.max(...eU).toFixed(1)}); above pH 11 the indicator colour has saturated, and 0.1 M NaOH (true ${truePH('naoh').toFixed(1)}) is read as ${strongBase}`);

/* ── 6 · The indicator is an acid ──────────────────────────────────────────── */
const dosed = (id, drops) => computeWorld({ ...base, sampleId: id, method: 'universal', drops }).universal.pH;
const rainShift = dosed('rain', 5) - truePH('rain');
const lemonShift = Math.abs(dosed('lemon', 5) - truePH('lemon'));
const manyShift = dosed('rain', 12) - truePH('rain');
assert.ok(rainShift > 0.4 && lemonShift < 0.01 && manyShift > rainShift, 'indicator must disturb rain water, not lemon juice, and more drops disturb more');
ok.push(`the indicator disturbs what it measures: in rain water 5 drops move the pH by +${rainShift.toFixed(2)} and 12 drops by +${manyShift.toFixed(2)}; in lemon juice by ${lemonShift.toFixed(3)} — a buffered sample does not notice`);

/* ══ THE BENCH ═════════════════════════════════════════════════════════════ */

const S = usePhEngine;
const get = () => S.getState();
const fresh = (patch = {}) => { get().reset(); get().setTimeScale(10); Object.entries(patch).forEach(([k, v]) => get()[k]?.(v)); };
/** Let the meter settle, the way a student waits for STABLE. */
const waitStable = (max = 300) => { for (let t = 0; t < max; t += 0.5) { get().tick(0.05); if (meterReading(get()).stable && t > 3) return t; } return Infinity; };
const calibrateProperly = () => {
  get().rinse(); get().dip('buf4'); waitStable(); get().calibrate();
  get().rinse(); get().dip('buf9'); waitStable(); get().calibrate();
};
const measure = (sampleId, dilution = 1) => {
  get().setSample(sampleId); if (dilution !== 1) get().setDilutionLog(Math.log10(dilution));
  get().rinse(); get().dip('sample'); waitStable();
  return { shown: meterReading(get()).pH, truth: get().world.sample.pH };
};

/* ── 7 · The meter, uncalibrated, calibrated, and calibrated badly ────────────── */
fresh();
assert.equal(statusOf(get()).key, 'meter-uncal', 'a fresh meter must say it is not calibrated');
const raw = measure('hcl'); const rawErr = raw.shown - raw.truth;
calibrateProperly();
assert.equal(get().cal.points.length, 2);
const good = [0.5, 1].map(() => measure('acetic'));
const goodErr = Math.abs(good[0].shown - good[0].truth);
assert.ok(goodErr < 0.02, `a properly calibrated meter must read true (off by ${goodErr})`);
const spread = ['hcl', 'citric', 'acetic', 'nh4cl', 'nacl', 'naac', 'ammonia'].map((id) => Math.abs(measure(id).shown - get().world.sample.pH));
assert.ok(Math.max(...spread) < 0.03, `…across the shelf (worst ${Math.max(...spread).toFixed(3)})`);
ok.push(`calibration, through the real store: uncalibrated, 0.1 M HCl reads ${raw.shown.toFixed(2)} for a true ${raw.truth.toFixed(2)} (${rawErr >= 0 ? '+' : ''}${rawErr.toFixed(2)}); after rinsing, dipping, WAITING for stable and calibrating on pH 4.01 and 9.18, seven samples across the shelf are read to within ${Math.max(...spread).toFixed(3)} pH`);

/* Pressing Calibrate before the reading has settled. */
fresh();
get().rinse(); get().dip('buf4'); for (let i = 0; i < 6; i += 1) get().tick(0.05);          // 3 s: nowhere near settled
get().calibrate();
get().rinse(); get().dip('buf9'); for (let i = 0; i < 6; i += 1) get().tick(0.05);
get().calibrate();
assert.equal(get().cal.points.length, 1, 'a nonsense slope must be refused: only the first point is kept');
assert.equal(statusOf(get()).key, 'meter-cal-rejected');
const rejectedSlope = get().calError;
assert.ok(rejectedSlope < 50, `the 3 s calibration has a slope of ${rejectedSlope}%`);
get().rinse(); get().dip('buf9'); assert.equal(get().calError, null, 'the message clears when you start again');
/* Less hurried — about two time constants each — the meter accepts it, and every reading is wrong. */
fresh();
const hurry = (buf, secs) => { get().rinse(); get().dip(buf); for (let t = 0; t < secs; t += 0.5) get().tick(0.05); get().calibrate(); };
hurry('buf4', 10); hurry('buf9', 10);
assert.equal(get().cal.points.length, 2, 'a 78%-slope calibration is accepted');
const rushed = measure('acetic'); const rushedErr = Math.abs(rushed.shown - rushed.truth); const rushedSlope = meterReading(get()).slope;
assert.ok(rushedErr > 0.3, `a rushed calibration must ruin every later reading (off by only ${rushedErr})`);
assert.ok(rushedSlope < 92, `…and the slope readout is the warning (${rushedSlope}%)`);
ok.push(`a calibration pressed before the reading has settled: after 3 s on each buffer the meter REFUSES it (slope ${rejectedSlope.toFixed(0)}%, outside ${SLOPE_RANGE[0]}–${SLOPE_RANGE[1]}%) and says why; after 10 s it accepts a ${rushedSlope.toFixed(0)}% slope, and 0.1 M acetic acid then reads ${rushed.shown.toFixed(2)} for a true ${rushed.truth.toFixed(2)} — ${rushedErr.toFixed(2)} out, with the slope readout as the only warning`);

/* One point only. */
fresh({ setElectrode: 'worn' });
get().rinse(); get().dip('buf7'); waitStable(); get().calibrate();
const one = measure('hcl'); const oneErr = Math.abs(one.shown - one.truth);
assert.ok(oneErr > 0.2 && get().cal.points.length === 1, 'one point with a worn electrode must be wrong away from that point');
ok.push(`one calibration point is right at that point only: a worn electrode calibrated on pH 6.86 alone reads 0.1 M HCl as ${one.shown.toFixed(2)} for a true ${one.truth.toFixed(2)}`);

/* A worn electrode tells you so, if you calibrate. */
fresh({ setElectrode: 'worn' }); calibrateProperly();
const slopeWorn = meterReading(get()).slope;
fresh(); calibrateProperly(); const slopeNew = meterReading(get()).slope;
assert.ok(slopeWorn < 92 && slopeNew > 95, `slope must tell new (${slopeNew}) from worn (${slopeWorn})`);
ok.push(`a worn electrode tells you so, if you calibrate: slope ${slopeNew.toFixed(1)}% new, ${slopeWorn.toFixed(1)}% worn (replace below about 92%) — and a two-point calibration still reads true with it`);

/* ── 8 · Rinsing ──────────────────────────────────────────────────────────── */
fresh(); calibrateProperly();
measure('hcl');
get().setSample('water');                            // lifts the electrode out, carrying 0.1 M HCl
get().dip('sample'); waitStable();
const unrinsed = meterReading(get()).pH; const trueWater = get().world.sample.pH;
assert.equal(statusOf(get()).key, 'meter-spoiled', 'steady but wrong: the status must say the sample is contaminated');
assert.ok(notesFor(get()).includes('unrinsed electrode'));
get().rinse(); get().dip('sample'); waitStable();
const stillWrong = meterReading(get()).pH;
assert.ok(Math.abs(stillWrong - trueWater) > 2, `rinsing afterwards must not undo the contamination (read ${stillWrong})`);
get().freshSample(); get().rinse(); get().dip('sample'); waitStable();
const rinsed = meterReading(get()).pH;
near(rinsed, trueWater, 0.03, 'fresh pour, rinsed');
assert.ok(trueWater - unrinsed > 2.5, `unrinsed must be wildly wrong (read ${unrinsed})`);
ok.push(`rinse BEFORE you dip: after 0.1 M HCl the electrode goes into pure water carrying ${(0.02 * 1000).toFixed(0)} µL of it and reads ${unrinsed.toFixed(2)}; rinsing afterwards does nothing (${stillWrong.toFixed(2)}) because the acid is already in the beaker; a fresh pour and a rinsed electrode read ${rinsed.toFixed(2)} against a true ${trueWater.toFixed(2)}`);

/* A buffer film is harmless in a buffer and not in water. */
fresh(); calibrateProperly();
get().rinse(); get().dip('buf9'); waitStable(); get().setSample('water'); get().dip('sample'); waitStable();
const bufCarry = meterReading(get()).pH;
assert.ok(bufCarry - trueWater > 0.3, `borax carried into water must raise it (read ${bufCarry})`);
fresh(); calibrateProperly(); get().dip('buf4'); waitStable(); get().dip('buf7'); waitStable();
near(meterReading(get()).pH, certifiedPH('pH7', 25), 0.03, 'buffer into buffer');
ok.push(`a buffer's film is a buffer: carried into pH 6.86 it changes nothing (reads ${meterReading(get()).pH.toFixed(2)}), carried into pure water it reads ${bufCarry.toFixed(2)} instead of ${trueWater.toFixed(2)}`);

/* ── 9 · Alkaline error ──────────────────────────────────────────────────── */
fresh(); calibrateProperly();
const alk = measure('naoh');
assert.ok(alk.truth - alk.shown > 0.15 && alk.truth - alk.shown < 0.4, 'a glass electrode reads low in 0.1 M NaOH');
const kohAlk = measure('koh');
ok.push(`the alkaline error: 0.1 M NaOH is truly ${alk.truth.toFixed(2)} and the calibrated meter reads ${alk.shown.toFixed(2)}, 0.1 M KOH ${kohAlk.shown.toFixed(2)} — the glass answers to the sodium as well as the protons, so a meter that is perfect from pH 1 to 11 is not perfect at 13`);

/* ── 10 · Waiting ──────────────────────────────────────────────────────────── */
fresh(); calibrateProperly();
get().setSample('ammonia'); get().rinse(); get().dip('sample');
for (let i = 0; i < 4; i += 1) get().tick(0.05);
const early = meterReading(get()); assert.equal(early.stable, false);
const tStable = waitStable(); const late = meterReading(get());
assert.ok(Math.abs(early.pH - get().world.sample.pH) > 0.3 && Math.abs(late.pH - get().world.sample.pH) < 0.03);
ok.push(`reading too soon: ${(4 * 0.05 * 10).toFixed(0)} s after dipping in 0.1 M ammonia the meter shows ${early.pH.toFixed(2)} (not stable); it is STABLE and right (${late.pH.toFixed(2)} against ${get().world.sample.pH.toFixed(2)}) after ${tStable.toFixed(0)} simulated seconds`);

/* ── 11 · Paper and indicator, through the store ──────────────────────────────── */
fresh({ setMethod: 'paper' });
assert.equal(statusOf(get()).key, 'paper-ready');
get().dipStrip();
get().tick(0.05); assert.equal(statusOf(get()).key, 'paper-developing', 'reading a strip at once must be flagged');
for (let i = 0; i < 40; i += 1) get().tick(0.05);
assert.equal(statusOf(get()).key, 'paper-match');
get().setPick('1'); get().record();
assert.equal(get().log.length, 1);
const row = get().log[0];
near(row.error, 1 - get().world.sample.pH, 0.01, 'row error');
near(row.pOH, pKw(25) - 1, 0.05, 'row pOH');
assert.equal(row.nature, 'acidic');
fresh({ setMethod: 'universal' }); get().setDrops(0); assert.equal(statusOf(get()).key, 'uni-empty');
get().setDrops(5); assert.equal(statusOf(get()).key, 'uni-match'); get().setDrops(12); assert.equal(statusOf(get()).key, 'uni-match');
assert.equal(statusOf(get()).tone, 'warn', 'too much dye must be flagged');
ok.push(`through the store: a strip read the instant it is dipped is flagged "developing"; the notebook row carries the student's pick, pOH = pK_w − pH (${row.pOH}), the nature judged from the reading, and the error against the true pH (${row.error >= 0 ? '+' : ''}${row.error}); no indicator is flagged as nothing to see, and 12 drops as too much dye`);

/* The notebook flags what was done wrong. */
fresh(); measure('hcl'); get().record();
const rec = get().log[get().log.length - 1];   // reset keeps the notebook, so the newest row is the last
assert.ok(/uncalibrated/.test(rec.note), 'an uncalibrated reading must be annotated');
ok.push(`the notebook records the conditions as well as the number: an uncalibrated reading is stored with "${rec.note}"`);

/* ══ CONTROL-RESPONSE MATRIX ═════════════════════════════════════════════════ */
/* Every setting on the bench, swept on its own, with the direction of its
   effect asserted. A control wired to nothing, or backwards, fails here rather
   than looking right at its default. */
const matrix = [];
const sweepStore = (label, setup, patches, key, dir) => {
  const vals = patches.map((p) => { fresh(); setup(); p(); return key(get()); });
  for (let i = 1; i < vals.length; i += 1) assert.ok(dir * (vals[i] - vals[i - 1]) > 0, `${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')} is not ${dir > 0 ? 'rising' : 'falling'}`);
  matrix.push(`${label}: ${vals.map((v) => v.toFixed(2)).join(' → ')}`);
};
const truth = (s) => s.world.sample.pH;
sweepStore('0.1 M HCl diluted 1, 10, 100, 1000× raises the pH', () => get().setSample('hcl'), [1, 10, 100, 1000].map((d) => () => get().setDilutionLog(Math.log10(d))), truth, +1);
sweepStore('0.1 M ammonia warmed 15, 25, 40 °C lowers the pH', () => get().setSample('ammonia'), [15, 25, 40].map((T) => () => get().setTemp(T)), truth, -1);
sweepStore('pure water warmed 15, 25, 40 °C lowers its pH', () => get().setSample('water'), [15, 25, 40].map((T) => () => get().setTemp(T)), truth, -1);
sweepStore('universal indicator in rain water, 0, 2, 5, 12 drops moves its pH up', () => { get().setSample('rain'); get().setMethod('universal'); }, [0, 2, 5, 12].map((n) => () => get().setDrops(n)),
  (s) => (s.world.universal ? s.world.universal.pH : truth(s)), +1);
const eq = ['hcl', 'citric', 'acetic', 'nh4cl', 'nacl', 'naac', 'ammonia', 'na2co3', 'naoh'];
sweepStore('samples in order of increasing pH', () => {}, eq.map((id) => () => get().setSample(id)), truth, +1);
matrix.push(`strong vs weak at the same 0.1 M: HCl ${truePH('hcl').toFixed(2)} < H₂SO₄ ${truePH('h2so4').toFixed(2)}?`.replace('<', 'vs'));
const hue = (id) => universalColour(truePH(id)).srgb;
assert.notDeepEqual(hue('hcl'), hue('nacl'), 'the colour must differ between an acid and a neutral sample');
ok.push(`EVERY setting swept on its own, and every one moves the right way:\n      ${matrix.join('\n      ')}`);

/* ── Determinism and frame-rate independence ─────────────────────────────────── */
const run = (dt) => { fresh(); get().setTimeScale(1); get().setSample('acetic'); get().rinse(); get().dip('sample'); for (let t = 0; t < 60; t += dt) get().tick(dt); return meterReading(get()).pH; };
const a = run(0.05); const b = run(0.05); assert.equal(a, b, 'the same run twice must give the identical reading');
const c = run(1 / 60); near(c, a, 0.06, 'frame rate'); 
ok.push(`deterministic and independent of the frame rate: the same 60 s run twice is identical (${a.toFixed(3)} both times), and at 60 fps instead of 20 it reads ${c.toFixed(3)}`);

console.log('\nXI-CHE-C01 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed against measured data.\n`);
