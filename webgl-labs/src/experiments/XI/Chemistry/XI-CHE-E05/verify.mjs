/**
 * verify.mjs — XI-CHE-E05, HCl against standard sodium carbonate.
 *
 * Carbonate is two titrations in one flask and a gas that is not a spectator. What is checked: the
 * two equivalence points where stoichiometry puts them (a half and a whole of the acid), the pH at each from
 * the amphoteric and the weak-acid formulae, which indicator follows which end point, what the carbon
 * dioxide does to the pH short of the second — leaving faster with the stirrer on, and all at once
 * when the flask is boiled — and the arithmetic of an unknown acid.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { WEAK } from '../../../../shared/chem/species.js';
import { CO2_AIR } from '../../../../shared/titration/createTitration.js';
import { CFG, HCL_M, useHclCarbonate, ENGINE } from './engine/hclCarbonate.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);
const S = useHclCarbonate; const get = () => S.getState();
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const fresh = (patch = {}) => { get().reset(); get().setTimeScale(4); get().clearLog(); Object.entries(patch).forEach(([k, v]) => get()[k](v)); };
const settle = (sec = 2.4) => { for (let i = 0; i < Math.round(sec / 0.2); i += 1) get().tick(0.05); };
const add = (mL, wait = 2.4) => { get().addMl(mL); get().swirl(); settle(wait); };
const V = () => ENGINE.totalAdded(get());
const veq = () => ENGINE.trueEquivalenceMl(get());
const pHnow = () => get().world.bulkPH;

/* ── 1 · Where the two end points are ───────────────────────────────────────────────── */
fresh();
near(veq(), 2 * 0.05 * 20 / HCL_M, 1e-9, 'V(2nd eq) = 2 × 0.05 × 20 / 0.1046');
const v1 = veq() / 2;
ok.push(`20 mL of 0.05 M Na₂CO₃ takes ${v1.toFixed(2)} mL of the acid to NaHCO₃ and ${veq().toFixed(2)} mL to H₂CO₃ (two HCl per carbonate); the bottle's 0.1046 M is what is to be found`);

/* ── 2 · The pH at each, from formulae that do not touch the solver ─────────────────────── */
const phAt = (mL, hold = true) => { fresh({ setIndicator: 'none' }); get().setStirrer('on'); get().addMl(mL); settle(hold ? 20 : 0.5); return get(); };
let s = phAt(v1);
const pH1 = 0.5 * (WEAK.carbonic.pKas[0] + WEAK.carbonic.pKas[1]);
near(ENGINE.equilibriumPH(s), pH1, 0.15, 'the first end point: NaHCO₃ is amphoteric, pH = ½(pKa₁ + pKa₂)');
s = phAt(veq() - 0.0);
const c2 = (0.05 * 20) / (20 + veq());                                    // mol/L of carbonate in the flask
const pH2closed = 0.5 * (WEAK.carbonic.pKas[0] - Math.log10(c2));
near(ENGINE.equilibriumPH({ ...s, lostC: 0 }), pH2closed, 0.2, 'the second end point, closed flask: ½(pKa₁ − log c)');
ok.push(`pH at ${v1.toFixed(2)} mL ${ENGINE.equilibriumPH(phAt(v1)).toFixed(2)} (½(pKa₁+pKa₂) = ${pH1.toFixed(2)}); at ${veq().toFixed(2)} mL in a closed flask ${pH2closed.toFixed(2)} by ½(pKa₁ − log c)`);

/* ── 3 · Which indicator follows which end point ─────────────────────────────────────────── */
const scan = (indicator, to = 24) => {
  fresh({ setIndicator: indicator }); get().setStirrer('on'); settle(20);
  const rows = [];
  while (V() < to) { const step = V() < 8 || (V() > 11 && V() < 17.5) ? 1 : 0.1; add(step, 4); rows.push({ V: V(), hex: get().world.colour.hex, g: Number.parseInt(get().world.colour.hex.slice(3, 5), 16), lum: lum(get().world.colour.srgb), pH: ENGINE.equilibriumPH(get()) }); }
  return rows;
};
const pp = scan('phenolphthalein', 12);
const ppTurn = pp.find((r) => r.V > 5 && r.lum > 0.93);
assert.ok(ppTurn, 'phenolphthalein loses its pink'); near(ppTurn.V, v1, 0.4, 'phenolphthalein turns at the FIRST end point — half the acid');
const mo = scan('methylOrange', 24);
const g0 = mo[0].g; const moTurn = mo.find((r) => r.V > v1 + 0.5 && r.g < g0 - 12);
assert.ok(moTurn, 'methyl orange changes'); assert.ok(moTurn.V > v1 + 4, 'and not until well past the first');
near(moTurn.V, veq(), 0.9, 'methyl orange changes near the SECOND end point, within a millilitre');
const claimed = (2 * 0.05 * 20) / moTurn.V;
assert.ok(Math.abs(claimed / HCL_M - 1) < 0.045, `HCl from the methyl-orange change: ${claimed.toFixed(4)} M (${(100 * (claimed / HCL_M - 1)).toFixed(1)} %)`);
ok.push(`phenolphthalein loses its pink at ${ppTurn.V.toFixed(2)} mL (the first end point, ${v1.toFixed(2)}); methyl orange changes at ${moTurn.V.toFixed(2)} mL (the second, ${veq().toFixed(2)}), giving ${claimed.toFixed(4)} M HCl, ${(100 * (claimed / HCL_M - 1)).toFixed(1)} % from the truth`);

/* ── 4 · Carbon dioxide ───────────────────────────────────────────────────────────────────────── */
const nearSecond = (stir) => { fresh({ setIndicator: 'none' }); get().setStirrer(stir); get().setMeter('out'); get().addMl(veq() - 0.6); get().swirl(); settle(4); return get(); };
let g1 = nearSecond('off'); const co2Fresh = g1.world.co2; const pHFresh = pHnow();
assert.ok(co2Fresh > 20 * CO2_AIR, `just after the acid goes in the flask holds ${(co2Fresh * 1000).toFixed(1)} mmol/L of dissolved CO₂ (air-equilibrated: ${(CO2_AIR * 1000).toFixed(3)})`);
assert.equal(ENGINE.statusOf(get()).key === 'co2' || ENGINE.statusOf(get()).key === 'swirl', true, 'and the bench says so');
settle(120); const co2Still = get().world.co2;
nearSecond('on'); settle(120); const co2Stirred = get().world.co2;
assert.ok(co2Stirred < co2Still, `stirred, more has gone in two minutes (${(co2Stirred * 1000).toFixed(2)} against ${(co2Still * 1000).toFixed(2)} mmol/L standing)`);
nearSecond('off'); const pHbefore = pHnow(); get().boil(); const pHafter = pHnow();
assert.ok(get().world.co2 < 2 * CO2_AIR, `boiled, the flask holds ${(get().world.co2 * 1000).toFixed(3)} mmol/L`);
assert.ok(pHafter > pHbefore + 0.5, `and its pH, which was ${pHbefore.toFixed(2)}, is ${pHafter.toFixed(2)}: the acid that was making carbonic acid is now simply in excess or neutralised`);
ok.push(`0.6 mL short of the second end point the flask has ${(co2Fresh * 1000).toFixed(1)} mmol/L of dissolved CO₂ (air: 0.013); in two minutes standing it falls to ${(co2Still * 1000).toFixed(1)}, stirred to ${(co2Stirred * 1000).toFixed(1)}; boiled it is ${(get().world.co2 * 1000).toFixed(3)}, and the pH rises from ${pHbefore.toFixed(2)} to ${pHafter.toFixed(2)}`);

/* ── 5 · The arithmetic ─────────────────────────────────────────────────────────────────────────── */
fresh(); get().addMl(veq());
near(ENGINE.unknownFromTitre(get(), veq()), HCL_M, 1e-12, 'at the true end point the arithmetic gives the true concentration');
near(ENGINE.unknownFromTitre(get(), v1) / HCL_M, 2, 1e-9, 'the first end point taken for the second gives HCl twice as strong');
ok.push('2 × (c·V of carbonate) / titre reproduces 0.1046 M at the second end point; taking the first end point for it gives an acid twice as strong');

/* ── 6 · Standard in the flask, unknown in the burette ──────────────────────────────────────────────── */
fresh(); get().setStandardN(0.2); get().setAnalyteMl(10);
near(veq(), 2 * 0.1 * 10 / HCL_M, 1e-9, '0.2 N carbonate is 0.1 M: 10 mL needs 19.1 mL of the acid');
get().addMl(1); get().setStandardN(0.05); near(get().standardN, 0.2, 1e-12, 'fixed once the first drop is out');
ok.push('the standard is the carbonate in the flask (set in N, 0.05–0.2); the unknown is the acid in the burette; the standard is fixed once the first drop is out');

/* ── 7 · Determinism ──────────────────────────────────────────────────────────────────────────────────── */
const sessionLog = () => { fresh({ setIndicator: 'methylOrange' }); get().setStirrer('on'); get().setMeter('in'); settle(30); while (V() < 12) { add(2, 14); get().record(); } return JSON.stringify(get().log.slice(-8).map(({ flask, id, ...r }) => r)); };
assert.equal(sessionLog(), sessionLog(), 'the same actions give the same notebook');
ok.push('the same sequence of actions gives the same notebook, to the last digit');

console.log('\nXI-CHE-E05 VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
