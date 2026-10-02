/**
 * verify.mjs — XI-CHE-F01, salt analysis.
 *
 * What is checked is what a student can find out from the bench and what a practical manual says
 * they should: that the eight bottles hold eight different salts, that every cation and anion has a
 * test that shows it on its own (and the textbook phrase for it), that the bench's tests tell all eight
 * salts apart, and that the mistakes behave — a dirty wire, a shaken ring, a tube that is not hot,
 * too little excess. None of the observations is written down: they are what the solver and the
 * emission spectra give for the tube.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { useSalt as S } from './engine/useSalt.js';
import { describe as describeObs } from '../../../../shared/qualitative/chemistry.js';
import { SALTS, ORDER, BOTTLES, saltOfBottle, activeOf, tubeOf, runTests, modelEvidence, CATION_TESTS, ANION_TESTS, limeWaterTest, CATIONS, ANIONS, statusOf, flameNow } from './engine/salt.js';

const ok = [];
const get = () => S.getState();
const bottleOf = (id) => ORDER.map((o) => SALTS[o].id).indexOf(id) + 1;
const settle = (sec) => { for (let i = 0; i < Math.round(sec / 0.2); i += 1) get().tick(0.05); };
const fresh = (id, tube = 'A') => { get().reset(); get().setTimeScale(4); get().setBottle(bottleOf(id)); get().select(tube); };
const add = (reagent, n) => { get().setReagent(reagent); get().setDrops(n); get().addPicked(); };
const seen = () => activeOf(get()).obs;
const text = (txt) => txt.toLowerCase();
const describe = () => describeObs(activeOf(get()).obs);
const statusKey = () => statusOf(get()).key;


/* ── 1 · Eight bottles, eight salts ──────────────────────────────────────────────────────── */
{
  assert.equal(new Set(ORDER).size, BOTTLES, 'every salt is in exactly one bottle');
  const ids = Array.from({ length: BOTTLES }, (_, i) => saltOfBottle(i + 1).id);
  assert.equal(new Set(ids).size, 8);
  assert.notEqual(ids.join(), SALTS.map((s) => s.id).join(), 'the bottles are not in the catalogue order');
  const cations = new Set(SALTS.map((s) => s.cation)); const anions = new Set(SALTS.map((s) => s.anion));
  assert.equal(cations.size, 8, 'all eight cations of the list'); for (const a of ['so4', 'cl', 'co3', 'no3']) assert.ok(anions.has(a), `anion ${a} is on the bench`);
  ok.push(`the 8 bottles hold 8 different salts (${SALTS.map((s) => s.formula).join(', ')}) in a fixed shuffled order; all 8 cations and 4 anions (sulfate, chloride, carbonate, nitrate) are among them`);
}

/* ── 2 · The textbook phrase for each ion, from the bench's own tests ────────────────────────── */
{
  const phrase = (id, which, group, step) => text(modelEvidence(SALTS.find((s) => s.id === id))[which][group][step].text);
  assert.match(phrase('cuso4', 'cation', 0, 0), /pale blue gelatinous precipitate/); assert.match(phrase('cuso4', 'cation', 0, 1), /pale blue gelatinous precipitate/, 'Cu(OH)₂ not soluble in excess NaOH');
  assert.match(phrase('cuso4', 'cation', 1, 1), /deep blue solution/); assert.match(phrase('cuso4', 'cation', 2, 0), /chocolate-brown/);
  assert.match(phrase('fecl3', 'cation', 0, 0), /reddish-brown gelatinous precipitate/); assert.match(phrase('fecl3', 'cation', 1, 0), /dark red|red solution/); assert.match(phrase('fecl3', 'cation', 2, 0), /intense blue/);
  assert.match(phrase('znso4', 'cation', 0, 0), /white gelatinous precipitate/); assert.match(phrase('znso4', 'cation', 0, 1), /colourless solution$/, 'zincate: dissolves in excess NaOH'); assert.match(phrase('znso4', 'cation', 1, 1), /colourless solution/);
  assert.match(phrase('cano32', 'cation', 0, 0), /white/); assert.match(phrase('cano32', 'cation', 1, 0), /^40 drops 2 m nh₃: colourless solution/, 'Ca²⁺ gives nothing with NH₃'); assert.match(phrase('cano32', 'cation', 2, 0), /white/);
  assert.match(phrase('pbno32', 'cation', 0, 0), /white crystalline precipitate/); assert.match(phrase('pbno32', 'cation', 1, 1), /colourless solution$/, 'plumbite: dissolves in excess NaOH'); assert.match(phrase('pbno32', 'cation', 2, 0), /yellow precipitate/);
  assert.match(phrase('nh42co3', 'cation', 0, 0), /ammonia.*litmus turns blue/);
  assert.match(phrase('bacl2', 'cation', 0, 0), /yellow/); assert.match(phrase('bacl2', 'cation', 1, 0), /white/);
  assert.match(phrase('al2so43', 'cation', 0, 0), /white gelatinous precipitate/); assert.match(phrase('al2so43', 'cation', 0, 1), /colourless solution$/, 'aluminate: dissolves in excess NaOH'); assert.match(phrase('al2so43', 'cation', 1, 1), /white gelatinous precipitate/, 'Al(OH)₃ stays in excess NH₃');
  assert.match(phrase('cuso4', 'anion', 0, 1), /white.*milky precipitate/, 'sulfate: BaSO₄ not dissolved by HCl');
  assert.match(phrase('fecl3', 'anion', 0, 0), /white curdy precipitate/); assert.match(phrase('bacl2', 'anion', 0, 2), /faint turbidity|colourless solution/, 'chloride: AgCl dissolves in NH₃');
  assert.match(phrase('nh42co3', 'anion', 0, 1), /effervescence/); assert.match(phrase('nh42co3', 'anion', 1, 0), /white fine precipitate/); assert.match(phrase('nh42co3', 'anion', 1, 1), /colourless solution$/, 'BaCO₃ dissolves in acid');
  assert.match(phrase('cano32', 'anion', 0, 1), /brown ring/);
  ok.push('each ion has its textbook outcome from the bench: Cu pale blue → deep blue in NH₃ and chocolate-brown with ferrocyanide; Fe red-brown, blood-red with SCN⁻, Prussian blue; Zn and Al and Pb white and soluble in excess NaOH (Al not in NH₃); Ca nothing with NH₃, white oxalate; NH₄⁺ gives ammonia that turns litmus; Ba yellow chromate; SO₄²⁻ white and acid-proof; Cl⁻ curdy and soluble in NH₃; CO₃²⁻ effervesces on the solid and its BaCO₃ dissolves in acid; NO₃⁻ the brown ring');
}

/* ── 3 · The tests tell all eight salts apart ────────────────────────────────────────────── */
{
  const sig = (salt) => {
    const ev = modelEvidence(salt);
    return [...ev.cation.flat(), ...ev.anion.flat()].map((st) => st.text.replace(/^\d+ (drops?|pinch(es)?) /, '')).join(' | ');
  };
  const sigs = SALTS.map(sig);
  assert.equal(new Set(sigs).size, 8, 'all eight signatures differ');
  /* Any two salts differ in at least two of the individual tests. */
  const parts = SALTS.map((s) => { const ev = modelEvidence(s); return [...ev.cation.flat(), ...ev.anion.flat()].map((st) => st.text); });
  let weakest = Infinity;
  for (let i = 0; i < 8; i += 1) for (let j = i + 1; j < 8; j += 1) {
    const a = new Set(parts[i]); const b = new Set(parts[j]);
    const differ = [...a].filter((x) => !b.has(x)).length;
    weakest = Math.min(weakest, differ);
  }
  assert.ok(weakest >= 3, `every pair differs in at least 3 of the standard observations (least: ${weakest})`);
  ok.push(`the standard tests separate all eight salts: every pair differs in at least ${weakest} observations`);
}

/* ── 4 · The bench ─────────────────────────────────────────────────────────────────────── */
{
  fresh('cuso4');
  assert.equal(get().tubes.length, 7); assert.ok(get().tubes.slice(0, 6).every((t) => t.content.volumeMl === 3), 'six tubes of 3 mL');
  assert.ok(/blue solution/.test(describeObs(tubeOf(get(), 'A').obs)) && tubeOf(get(), 'L').content.mmol.Ca > 0, 'the original solution of copper sulfate is blue; tube L is lime water');
  add('naoh', 20); assert.ok(/pale blue gelatinous/.test(describe()), `NaOH: ${describe()}`);
  get().select('B'); assert.ok(/blue solution/.test(describe()), 'tube B is untouched');
  get().select('A'); get().fresh(); assert.ok(/blue solution/.test(describe()) && !/precipitate/.test(describe()), 'a fresh tube is the original solution again');
  /* Overfilling. */
  get().setReagent('nh4oh'); get().setDrops(100); get().addPicked(); get().addPicked(); get().addPicked();
  assert.ok(activeOf(get()).content.spilledMl > 0 && get().tubes.find((t) => t.id === 'A').content.volumeMl <= 15 + 1e-9, 'a tube holds 15 mL; the rest runs over the rim');
  assert.equal(statusKey(), 'spilled');
  ok.push('seven tubes (six of 3 mL original solution, one of lime water); a dose goes only into the active tube; "fresh" makes it the original solution again; a tube overfilled runs over its rim and the bench says so');
}

/* ── 5 · Carbon dioxide and lime water ───────────────────────────────────────────────────── */
{
  fresh('nh42co3');
  get().tip(); assert.equal(activeOf(get()).content.volumeMl, 0);
  add('sample', 1); assert.ok(activeOf(get()).obs.dry.look === 'white lumps' && activeOf(get()).obs.bed[3] > 0.3, 'a pinch in a dry tube: crystals at the bottom');
  get().toggleDelivery();
  add('hcl', 20);
  assert.ok(activeOf(get()).content.event?.kind === 'CO2', 'effervescence with dilute HCl on the carbonate');
  const L = tubeOf(get(), 'L');
  assert.ok(L.obs.mgPerMl > 0.5, `the gas led through lime water makes it milky (${L.obs.mgPerMl.toFixed(2)} mg/mL of CaCO₃)`);
  assert.ok(L.obs.solids[0].id === 'CaCO3s'); const milk = L.obs.mgPerMl;
  /* No delivery tube: the gas is lost. */
  fresh('nh42co3'); get().tip(); add('sample', 1); add('hcl', 20);
  assert.ok(tubeOf(get(), 'L').obs.mgPerMl < 0.01, 'without the delivery tube the lime water stays clear');
  /* The same pinch of a chloride does nothing. */
  fresh('bacl2'); get().tip(); get().toggleDelivery(); add('sample', 1); add('hcl', 20);
  assert.ok(!activeOf(get()).content.event && tubeOf(get(), 'L').obs.mgPerMl < 0.01, 'a chloride + acid: no gas');
  const standard = limeWaterTest(0.04);
  assert.ok(/precipitate/.test(standard.text) && standard.obs.mgPerMl > 1.5);
  ok.push(`dry tube + a pinch of (NH₄)₂CO₃ (0.1 g = 1.04 mmol) + 20 drops of 2 M HCl: effervescence; with the delivery tube connected the lime water goes milky (${milk.toFixed(2)} mg/mL of CaCO₃); disconnected, or on a chloride, it stays clear`);
}

/* ── 6 · Ammonia: warm, litmus, smell, rod ───────────────────────────────────────────────── */
{
  fresh('nh42co3', 'B');
  get().holdLitmus('red');                                               // the carbonate itself smells of ammonia, and turns litmus: it is volatile
  const alone = get().log.at(-1).observation;
  add('naoh', 10);
  get().holdLitmus('red'); get().smell(); get().hclRod();
  const rows = get().log.slice(-3).map((r) => r.observation);
  assert.match(rows[0], /turns blue/); assert.match(rows[1], /ammonia/); assert.match(rows[2], /white fumes/);
  const ppm0 = get().nose.ppm;
  get().setBath('hot'); settle(25);
  get().smell(); const ppmHot = get().nose.ppm;
  assert.ok(ppmHot > ppm0, `warming: more ammonia at the mouth (${ppmHot.toFixed(0)} at ${activeOf(get()).tempC.toFixed(0)} °C against ${ppm0.toFixed(0)} ppm at 25 °C)`);
  assert.ok(get().nose.hazard || ppmHot > 300, 'the bench warns about sniffing it');
  settle(400);
  assert.ok(activeOf(get()).tempC > 90, `the tube comes to the hot bath (${activeOf(get()).tempC.toFixed(0)} °C)`);
  const lost = tubeOf(get(), 'B').content.mmol.NH3;
  assert.ok(lost < 0.25, `the ammonia is driven off a hot alkaline tube (${lost.toFixed(3)} of 0.30 mmol NH₃ left)`);
  /* Fe³⁺ does not give it. */
  fresh('fecl3', 'B'); add('naoh', 20); get().holdLitmus('red');
  assert.match(get().log.at(-1).observation, /stays red/, 'no ammonia from an iron salt');
  ok.push(`NH₄⁺ + NaOH: red litmus turns blue, a pungent smell (${ppm0.toFixed(0)} ppm at the mouth), white fumes at an HCl rod; in the hot bath ${ppmHot.toFixed(0)} ppm and the ammonia is driven off (${lost.toFixed(2)} of 0.30 mmol left); nothing of it from an iron salt (red litmus stays red); alone, the carbonate: ${alone}`);
}

/* ── 7 · The flame test and the mistakes in it ─────────────────────────────────────────────── */
{
  const to = (id, tube) => { get().setBottle(bottleOf(id)); get().select(tube); };
  const wire = () => get().log.at(-1).observation;
  const clean = (n = 4) => { for (let i = 0; i < n; i += 1) get().cleanWire(); };
  fresh('cano32', 'C'); get().flameTest();
  assert.match(wire(), /brick-red/, 'Ca: brick-red'); clean();
  to('bacl2', 'D'); get().flameTest(); settle(3);
  assert.match(wire(), /apple-green|yellowish-green/, 'Ba: apple-green'); const cleanBa = flameNow(get()).lambdaD; clean();
  to('cuso4', 'A'); get().flameTest();
  assert.match(wire(), /no characteristic colour/, 'copper sulfate on a clean wire without conc. HCl: little to see'); clean();
  get().setLoopHcl('yes'); get().flameTest();
  assert.match(wire(), /bluish-green/, 'with conc. HCl: the chloride is volatile: bluish-green');
  /* Not cleaned: the copper is still on the wire when the barium goes in. */
  to('bacl2', 'B'); get().flameTest(); settle(3);
  const dirty = wire(); const messageDirty = get().message.title; const dirtyBa = flameNow(get()).lambdaD;
  assert.ok(get().loop.dirty, 'the bench says the wire still carries something');
  assert.ok(get().loop.loaded.Cu > 0 && get().loop.loaded.Ba > 0, 'both on the wire');
  assert.ok(Math.abs(dirtyBa - cleanBa) > 1.5, `the copper left on the wire changes the barium colour (${cleanBa} nm → ${dirtyBa} nm)`);
  clean(8);
  assert.equal(get().loop.dirty, false);
  to('bacl2', 'B'); get().flameTest(); assert.match(wire(), /apple-green|yellowish-green/, 'cleaned: barium on its own again');
  /* Zn and Al: nothing. */
  clean(8); to('znso4', 'A'); get().flameTest(); assert.match(wire(), /no characteristic/, 'Zn: nothing characteristic');
  /* Cobalt glass takes the yellow out of sodium. */
  get().setFilter('cobalt'); get().flameTest(); assert.match(get().log.at(-1).test, /through cobalt glass/);
  ok.push(`flame: calcium brick-red, barium apple-green, copper sulfate nothing until the wire has been in conc. HCl and then bluish-green; a wire not cleaned carries the last sample into the next (barium alone ${cleanBa} nm, with the copper still on the wire ${dirtyBa} nm; the bench says "${messageDirty.slice(0, 44)}…"); cleaned it is clean again; zinc shows nothing`);
}

/* ── 8 · The brown ring, and shaking it ──────────────────────────────────────────────────── */
{
  fresh('cano32', 'D'); add('feso4', 20);
  assert.ok(!activeOf(get()).obs.ring);
  add('h2so4c', 10);
  assert.ok(activeOf(get()).obs.ring && activeOf(get()).content.layer, 'conc. acid down the side: a brown ring at the junction');
  const T0 = activeOf(get()).tempC;
  get().shake();
  const t = activeOf(get());
  assert.ok(!t.obs.ring && !t.content.layer && t.tempC > T0 + 30, `shaken: no ring, and ${t.tempC.toFixed(0)} °C from the heat of mixing`);
  fresh('cuso4', 'D'); add('feso4', 20); add('h2so4c', 10);
  assert.ok(!activeOf(get()).obs.ring, 'a sulfate: no nitrate, no ring');
  ok.push(`NO₃⁻ + FeSO₄ + conc. H₂SO₄ down the side: the ring at the junction; shaken it is gone and the tube is ${t.tempC.toFixed(0)} °C (75 kJ/mol of acid into 4 mL); a sulfate gives no ring`);
}

/* ── 9 · Heat does what it does ──────────────────────────────────────────────────────────── */
{
  fresh('pbno32', 'E'); add('hcl', 10);
  assert.ok(activeOf(get()).obs.solids.some((s) => s.id === 'PbCl2s'), 'PbCl₂ at room temperature');
  get().setBath('hot'); settle(150);
  assert.ok(!activeOf(get()).obs.solids.length, 'and gone in the hot bath: PbCl₂ is soluble hot');
  get().setBath('air'); settle(400);
  assert.ok(activeOf(get()).obs.solids.some((s) => s.id === 'PbCl2s'), 'and back as crystals on cooling');
  fresh('cuso4', 'E'); add('naoh', 20); assert.equal(activeOf(get()).obs.solids[0].id, 'CuOH2');
  get().setBath('hot'); settle(150);
  assert.equal(activeOf(get()).obs.solids[0].id, 'CuO', 'Cu(OH)₂ on heating: black CuO'); assert.match(activeOf(get()).obs.solids[0].info.look, /black/);
  ok.push('PbCl₂ is a white precipitate that dissolves in the boiling-water bath and comes back as crystals on cooling; blue Cu(OH)₂ turns to black CuO when the tube is heated');
}

/* ── 10 · The conclusion ───────────────────────────────────────────────────────────────── */
{
  fresh('znso4', 'A'); get().clearLog();
  get().check(); assert.equal(get().result, null); assert.equal(get().message.key, 'answer-incomplete', 'both ions must be named');
  get().setCation('cu2'); get().setAnion('so4'); get().check();
  assert.equal(get().result.okC, false); assert.equal(get().result.okA, true); assert.equal(get().tries, 1);
  assert.ok(!JSON.stringify(get().message).includes('zinc') && !JSON.stringify(get().message).includes('Zn'), 'a wrong answer does not say what is right');
  get().reveal(); assert.equal(get().revealed, true);
  get().setCation('zn2'); get().check(); assert.equal(get().result.both, true);
  assert.equal(get().analysis.tests, 0); assert.match(get().message.detail, /fewer than four/, 'right, but on no evidence: the bench says so');
  fresh('znso4', 'A'); get().reveal(); assert.equal(get().revealed, false, 'no peeking before an attempt');
  ok.push('the conclusion: both ions must be named; a wrong one is not corrected, only marked; the standard tests are shown only after an attempt; a right answer on fewer than four tests is told it is not proof');
}

/* ── 11 · Determinism ───────────────────────────────────────────────────────────────────── */
{
  const run = () => { fresh('al2so43', 'A'); get().clearLog(); add('naoh', 10); get().record(); add('naoh', 60); get().record(); get().flameTest(); get().setBath('hot'); settle(60); get().record(); return JSON.stringify(get().log.map(({ id, ...r }) => r)); };
  assert.equal(run(), run(), 'the same actions give the same notebook');
  ok.push('the same sequence of actions gives the same notebook, to the last word');
}

void CATION_TESTS; void ANION_TESTS; void runTests; void CATIONS; void ANIONS;
console.log('\nXI-CHE-F01 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
