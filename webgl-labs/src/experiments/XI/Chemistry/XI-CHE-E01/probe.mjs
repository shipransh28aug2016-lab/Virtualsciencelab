/**
 * Scenario probe for XI-CHE-E01: what a student does at a balance — through the
 * real interface in a real GL context — including the mistakes (an unlevelled
 * balance, a bottle dropped on the pan, a damp sample) and the correction of each.
 */
const steady = (kit, t = 120000) => kit.waitFor((s) => s.display.reading.stable, { timeout: t });
const shown = (kit) => kit.read('display');

export default async function scenario(kit) {
  await kit.option('clock', '30');

  /* The cold top-pan balance: not zero, not steady until it is left alone. */
  const z = await shown(kit);
  kit.check(z >= 0.0 && z < 0.1, `an empty cold top-pan balance reads ${z} g`);

  /* Precision balance: place the bottle, tare, weigh the salt in. */
  await kit.option('balance', 'top3');
  await kit.option('shield', 'closed');
  await kit.select('object', 'bottle');
  await kit.option('lid', 'off');
  await kit.action('place');
  await steady(kit);
  const bottle = await shown(kit);
  kit.check(Math.abs(bottle - 8.24) < 0.06, `the empty weighing bottle reads ${bottle} g`);
  await kit.action('tare');
  await steady(kit);
  kit.check(Math.abs(await shown(kit)) < 0.0015, 'tared: the display is zero');
  kit.check((await kit.text('tare-held')).includes('8.2'), 'and the panel says what the tare is holding');
  await kit.option('shield', 'open');
  await kit.slider('spatula', 0.5);
  await kit.action('add');
  kit.check((await kit.read('display')) > 0.2, 'a spatula-full of salt shows on the display');
  await kit.option('shield', 'closed');
  await steady(kit);
  const net = await shown(kit);
  kit.check(net > 0.35 && net < 0.65, `net ${net} g of salt`);
  await kit.action('record');

  /* The shield refuses an addition while it is shut. */
  await kit.action('add');
  kit.check((await kit.status()).startsWith('msg') && /shut/.test((await kit.text('status')) ?? ''), 'adding through a closed shield is refused, and the bench says why');

  /* The balance is not level: the bench says so, and the feet fix it. */
  await kit.option('balance', 'ana4');
  kit.check(await kit.waitFor((s) => s.message === null && s.display.bal.tilt > 0.2, { timeout: 20000, every: 300 }) && (await kit.status()) === 'level', 'the analytical balance is out of level and the bench says so');
  await kit.slider('feet', 0);
  kit.check((await kit.status()) !== 'level', 'turn the feet and the bubble is on the ring');

  /* A dropped bottle rings. */
  await kit.option('shield', 'closed');
  await kit.select('object', 'salt');
  await kit.action('drop');
  kit.check((await kit.status()) === 'unsteady' || (await kit.status()).startsWith('msg'), 'a dropped bottle sets the display swinging');
  await steady(kit);
  const t1 = await shown(kit);
  kit.check(Math.abs(t1 - 13.36) < 0.03, `it settles to ${t1} g`);
  await kit.action('record');

  /* Weighing by difference. */
  await kit.action('remove');
  await kit.option('lid', 'off');
  await kit.action('transfer');
  await kit.action('place');
  await steady(kit);
  await kit.action('record');
  const diff = await kit.read('by-difference');
  kit.check(Math.abs(diff - 5.11) < 0.03, `the mass tipped out, by difference: ${diff} g (5.126 g was in the bottle)`);

  /* Hygroscopic sample. */
  await kit.action('remove');
  await kit.select('object', 'naoh');
  await kit.option('lid', 'off');
  await kit.action('place');
  await kit.page.waitForTimeout(2500);
  const creep1 = await shown(kit);
  await kit.page.waitForTimeout(4000);
  kit.check((await kit.read('display')) > creep1 + 0.0004, 'sodium hydroxide pellets with the lid off: the display creeps up');
  kit.check(await kit.waitFor((s) => !s.display.reading.stable, { timeout: 20000, every: 300 }) && (await kit.status()) === 'unsteady' && /water/.test((await kit.text('status')) ?? ''), `and the bench says the sample is taking water (status ${await kit.status()})`);
  await kit.option('lid', 'on');

  /* Calibration: refused until the balance is in a fit state. */
  await kit.action('remove');
  await kit.select('object', 'calweight'); await kit.action('place');
  await kit.option('shield', 'open');
  await kit.action('calibrate');
  kit.check((await kit.text('status')).toLowerCase().includes('shield'), 'calibration with the shield open is refused');
  await kit.option('shield', 'closed');
  await kit.page.waitForTimeout(500);
  await kit.action('calibrate');
  await kit.waitFor((s) => s.display.bal.calibrations >= 1, { timeout: 120000, every: 1000 });

  /* The mechanical balance. */
  await kit.option('balance', 'beam');
  await kit.action('remove');
  await kit.select('object', 'check'); await kit.action('place');
  await kit.slider('zero-screw', -0.07);
  await kit.slider('units', 9.99);
  await kit.waitFor((s) => s.display.reading.atRest, { timeout: 120000, every: 500 });
  kit.check(await kit.page.evaluate(() => document.body.innerText.includes('AT REST')), 'the pointer comes to rest at zero and the panel says so');
  kit.check(Math.abs((await shown(kit)) - 10) < 0.06, 'the 10 g check weight reads 10.0 g on the beams');
  await kit.action('record');
  kit.check((await kit.tableRows()) >= 4, 'the readings are in the notebook');
}
