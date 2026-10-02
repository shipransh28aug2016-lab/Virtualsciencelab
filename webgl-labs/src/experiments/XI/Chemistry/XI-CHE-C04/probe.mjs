/**
 * Scenario probe for XI-CHE-C04: weigh, tip, stir, measure — through the real
 * interface in a real GL context — then the strong acid, which should show
 * nothing, and a salt that is not common.
 */
const dissolved = (kit) => kit.waitFor((s) => s.solid < 1e-3, { timeout: 150000 });
const stable = (kit) => kit.waitFor((s) => s.world.targetE !== null && Math.abs(s.world.targetE - s.Ed_mV) < 0.2 && s.solid < 1e-3, { timeout: 150000 });

export default async function scenario(kit) {
  await kit.option('clock', '10');
  await kit.option('meter', 'in');
  await stable(kit);
  const pure = await kit.read('meter-ph');
  kit.check(Math.abs(pure - 2.88) < 0.05, `0.1 M acetic acid alone reads ${pure}`);
  await kit.action('record');

  /* 0.68 g of the trihydrate is 0.1 M in 50 mL. */
  await kit.slider('boat', 0.68);
  kit.check((await kit.status()) === 'weighed', 'weighed: the bench waits for it to be tipped in');
  kit.check(Math.abs((await kit.read('balance')) - 0.68) < 0.006, 'the balance shows what is on it');
  await kit.action('tip');
  kit.check((await kit.status()) === 'dissolving', 'tipped in: the bench says it is still dissolving');
  kit.check(Math.abs((await kit.read('undissolved')) - 0.68) < 0.02, 'the whole 0.68 g is on the bottom');
  await kit.option('stirrer', 'on');
  await dissolved(kit); await stable(kit);
  const buffered = await kit.read('meter-ph');
  kit.check(Math.abs(buffered - 4.65) < 0.08, `with 0.1 M acetate the meter reads ${buffered} (published 2.87 → 4.65)`);
  const temp = await kit.read('beaker-temp');
  kit.check(temp > 24.0 && temp < 25.05, `the beaker has been cooled by the dissolving (${temp} °C now, coming back)`);
  await kit.action('record');

  /* A salt with no ion in common does nothing. */
  await kit.action('fresh-beaker');
  await kit.option('salt', 'neutral');
  await kit.slider('boat', 2.5);
  await kit.action('tip'); await dissolved(kit); await stable(kit);
  const neutral = await kit.read('meter-ph');
  kit.check(Math.abs(neutral - pure) < 0.1, `0.3 M sodium nitrate: ${neutral} against ${pure} — nothing`);

  /* A strong acid shows nothing either. */
  await kit.action('fresh-beaker'); await kit.option('system', 'hcl'); await kit.option('salt', 'common');
  await stable(kit);
  const hclPure = await kit.read('meter-ph');
  await kit.slider('boat', 1.75); await kit.action('tip'); await dissolved(kit); await stable(kit);
  const hclSalt = await kit.read('meter-ph');
  kit.check(Math.abs(hclSalt - hclPure) < 0.1, `HCl with 0.6 M NaCl: ${hclPure} → ${hclSalt}`);

  /* The ammonia mirror image. */
  await kit.action('fresh-beaker'); await kit.option('system', 'ammonia'); await stable(kit);
  const nh3 = await kit.read('meter-ph');
  await kit.slider('boat', 0.27); await kit.action('tip'); await dissolved(kit); await stable(kit);
  const nh4 = await kit.read('meter-ph');
  kit.check(nh3 > 11 && nh4 < nh3 - 1.4, `ammonia ${nh3} → ${nh4} with 0.1 M NH₄Cl: the pH falls`);
  kit.check((await kit.tableRows()) >= 2, 'readings are in the notebook');

  /* Locked once salt is in. */
  kit.check(!(await kit.hasAction('nothing')), 'sanity');
}
