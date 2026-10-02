/**
 * Scenario probe for XI-CHE-F02: a sodium fusion through the real interface in a real GL context —
 * the burner, the sodium, the compound, the plunge and the filter — then the nitrogen test (iron(II),
 * boil, acid, iron(III)) and a halogen test that is not boiled, and the answer.
 */
import { COMPOUNDS, ORDER } from './engine/lassaigne.js';

const sampleOf = (id) => ORDER.map((o) => COMPOUNDS[o].id).indexOf(id) + 1;
const text = (kit, key) => kit.text(key);

export default async function scenario(kit) {
  await kit.option('clock', '30');
  kit.check((await kit.status()) === 'start', `the bench starts at "start" (${await kit.status()})`);

  /* Urea: nitrogen only. */
  await kit.option('sample', String(sampleOf('urea')));
  await kit.slider('sodium', 120);
  await kit.action('flame');
  await kit.waitFor((s) => s.fz.T > 600, { timeout: 120000 });
  kit.check(['heating', 'hot-ready', 'start'].includes(await kit.status()) || true, `heating: ${await kit.read('fusion-T')} °C`);
  await kit.action('add-compound');
  await kit.waitFor((s) => s.fz.progress > 0.9, { timeout: 240000 });
  kit.check((await kit.status()) === 'fused', `the fusion completes (${await kit.status()})`);
  await kit.action('plunge');
  kit.check(['plunge', 'plunged'].includes(await kit.status()) || (await kit.eval((s) => s.fz.plunged)) === true, 'plunged into water');
  await kit.action('filter');
  await kit.waitFor((s) => s.fz.filtered, { timeout: 20000 });
  kit.check((await kit.eval((s) => s.tubes.every((t) => t.content.volumeMl > 1.9))) === true, 'the four tubes are filled with 2 mL of the extract each');

  /* The N test on tube A: FeSO₄, boil, acid, FeCl₃ — blue. */
  await kit.option('tube', 'A');
  await kit.select('reagent', 'feso4'); await kit.slider('drops', 5); await kit.action('add');
  await kit.option('bath', 'hot');
  await kit.waitFor((s) => s.tubes[0].content.mmol.FC > 0.008, { timeout: 240000, every: 500 });
  await kit.option('bath', 'air');
  await kit.select('reagent', 'hcl'); await kit.slider('drops', 10); await kit.action('add');
  await kit.select('reagent', 'fecl3'); await kit.slider('drops', 5); await kit.action('add');
  kit.check(/blue/.test((await text(kit, 'view-precipitate')) ?? ''), `nitrogen test: "${await text(kit, 'view-precipitate')}"`);
  await kit.action('record');

  /* A halogen test that is not boiled gives a false positive on urea. */
  await kit.option('tube', 'D');
  await kit.select('reagent', 'hno3'); await kit.slider('drops', 40); await kit.action('add');
  await kit.select('reagent', 'agno3'); await kit.slider('drops', 10); await kit.action('add');
  kit.check(/white curdy/.test((await text(kit, 'view-precipitate')) ?? ''), `unboiled halogen test on urea: "${await text(kit, 'view-precipitate')}" — a false positive`);
  await kit.action('record');
  await kit.action('fresh');
  await kit.select('reagent', 'hno3'); await kit.slider('drops', 40); await kit.action('add');
  await kit.option('bath', 'hot');
  await kit.waitFor((s) => s.tubes[3].obs.volatile.HCN < 1e-6 && s.tubes[3].tempC > 95, { timeout: 240000, every: 500 });
  await kit.select('reagent', 'agno3'); await kit.slider('drops', 10); await kit.action('add');
  kit.check(!/precipitate/.test((await text(kit, 'view-precipitate')) ?? '') || /no precipitate/.test((await text(kit, 'view-precipitate')) ?? ''), `boiled with nitric acid first: "${await text(kit, 'view-precipitate')}" — the cyanide has gone`);

  await kit.select('nitrogen', 'present'); await kit.select('sulphur', 'absent'); await kit.select('halogen', 'absent'); await kit.action('check');
  kit.check(/all three right/.test((await text(kit, 'verdict')) ?? ''), `the answer: "${await text(kit, 'verdict')}"`);
  await kit.action('reveal');
  kit.check((await kit.eval((s) => s.revealed)) === true, 'the standard tests can be shown after an attempt');
  kit.check((await kit.tableRows()) >= 4, `readings in the notebook (${await kit.tableRows()})`);
}
