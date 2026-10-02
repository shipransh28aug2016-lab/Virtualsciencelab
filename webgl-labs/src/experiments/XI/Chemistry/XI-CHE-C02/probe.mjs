/**
 * Scenario probe for XI-CHE-C02: what a student does through the real
 * interface in a real GL context — including the mistakes that are meant to cost.
 */
const settled = (kit) => kit.waitFor((s) => s.world.targetE !== null && Math.abs(s.world.targetE - s.Ed_mV) < 0.15, { timeout: 120000 });

export default async function scenario(kit) {
  await kit.option('clock', '10');
  await kit.option('method', 'meter');

  kit.check((await kit.text('fair'))?.includes('same concentration'), 'both tubes start at the same concentration, and the bench says the comparison is fair');

  /* Properly: rinse, A, record, rinse, B, record. */
  await kit.action('rinse'); await kit.action('dip-a'); await settled(kit);
  const phA = await kit.read('meter-ph');
  kit.check(Math.abs(phA - 1.11) < 0.05, `0.1 M HCl reads ${phA}`);
  await kit.action('record-a');
  await kit.action('rinse'); await kit.action('dip-b'); await settled(kit);
  const phB = await kit.read('meter-ph');
  kit.check(Math.abs(phB - 2.88) < 0.05, `0.1 M acetic acid reads ${phB}`);
  await kit.action('record-b');
  kit.check((await kit.tableRows()) === 2, 'both readings are in the notebook');
  const rows = await kit.page.evaluate(() => [...document.querySelectorAll('[data-probe="table"] tbody tr')].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent)));
  kit.check(rows[0][9] === 'n/a' && /^1\.[5-9]×10⁻⁵|^1\.[6-9]/.test(rows[1][9]) || /×10⁻⁵/.test(rows[1][9]), `the table works Ka out for the weak acid only (${rows[0][9]} / ${rows[1][9]})`);

  /* Unfair: set the tubes apart. */
  await kit.option('link', 'off'); await kit.slider('dilutionB', 2);
  kit.check((await kit.text('fair'))?.includes('not a fair comparison'), 'unlinked and diluted, the bench says the comparison is not fair');

  /* The classic mistake: straight from 0.1 M HCl into 0.001 M acetic acid. */
  await kit.action('rinse'); await kit.action('dip-a'); await settled(kit);
  await kit.action('dip-b'); await settled(kit);
  const dirty = await kit.read('meter-ph'); const clean = await kit.eval((s) => s.world.B.pH);
  kit.check((await kit.status()) === 'meter-spoiled' && clean - dirty > 0.2, `unrinsed, tube B reads ${dirty} for a true ${clean.toFixed(2)}, and the bench says it is contaminated`);
  await kit.action('rinse'); await kit.action('dip-b'); await settled(kit);
  kit.check((await kit.read('meter-ph')) < clean - 0.2, 'rinsing afterwards does not undo it');
  await kit.action('fresh-tubes'); await kit.action('rinse'); await kit.action('dip-b'); await settled(kit);
  kit.check(Math.abs((await kit.read('meter-ph')) - clean) < 0.05, 'fresh tubes and a rinsed electrode read true');

  /* Not calibrated. */
  await kit.option('meterCal', 'none');
  await kit.action('rinse'); await kit.action('dip-b'); await settled(kit);
  kit.check(Math.abs((await kit.read('meter-ph')) - clean) > 0.1 && (await kit.status()) === 'meter-uncal', 'an uncalibrated meter reads off, and says so');
  await kit.option('meterCal', 'calibrated');

  /* Universal indicator: the two tubes are visibly different colours. */
  await kit.option('link', 'on'); await kit.option('method', 'universal');
  const hexA = await kit.page.evaluate(() => document.querySelector('[data-probe="tube-colour-a"]').getAttribute('data-hex'));
  const hexB = await kit.page.evaluate(() => document.querySelector('[data-probe="tube-colour-b"]').getAttribute('data-hex'));
  kit.check(hexA !== hexB, `universal indicator: tube A ${hexA}, tube B ${hexB}`);

  /* Paper. */
  await kit.option('method', 'paper');
  kit.check((await kit.status()) === 'paper-ready', 'paper: ready');
  await kit.action('dip-strip-a'); await kit.action('dip-strip-b');
  await kit.waitFor((s) => s.stripA.t > 25 && s.stripB.t > 25);
  kit.check((await kit.status()) === 'paper-match', 'paper: both strips developed');
}
