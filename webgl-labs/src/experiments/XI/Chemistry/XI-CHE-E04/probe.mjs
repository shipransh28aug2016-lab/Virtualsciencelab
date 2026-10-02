/**
 * Scenario probe for XI-CHE-E04: sodium carbonate, which takes water from the air and
 * heats the flask as it dissolves — through the real interface in a real GL context —
 * and the jar of washing soda on the same shelf.
 */
const state = (kit, fn) => kit.eval(fn);

export default async function scenario(kit) {
  await kit.option('clock', '30');

  /* The wrong jar, caught by the plan check. */
  await kit.slider('planned', 3.577); await kit.action('check-plan');
  kit.check(/decahydrate/i.test((await kit.text('status')) ?? ''), 'the plan check recognises the decahydrate’s mass');
  await kit.slider('planned', 1.325); await kit.action('check-plan');
  kit.check(/right/i.test((await kit.text('plan-feedback')) ?? ''), '1.325 g is right for the anhydrous salt');

  /* Hygroscopic: a damp sample creeps. */
  await kit.option('balance', 'ana4'); await kit.option('shield', 'closed'); await kit.option('lid', 'off'); await kit.action('place');
  await kit.waitFor((s) => s.display.reading.stable, { timeout: 150000 });
  await kit.action('tare');
  await kit.slider('spatula', 0.5); await kit.option('shield', 'open'); await kit.action('add-solid'); await kit.option('shield', 'closed');
  await kit.waitFor((s) => s.display.reading.stable, { timeout: 150000, every: 400 });
  const w0 = await kit.read('display');
  await kit.page.waitForTimeout(6000);
  const w1 = await kit.read('display');
  kit.check(w1 > w0 + 0.0003, `with the lid off the display creeps: ${w0} → ${w1} g`);
  await kit.option('lid', 'on');
  kit.check((await kit.text('bench-state')).includes('lid on'), 'and the panel shows the lid is on');

  /* The rest of the preparation, briefly: weigh, tip, rinse, dissolve — the flask WARMS. */
  await kit.option('lid', 'off');
  for (let i = 0; i < 40; i += 1) {
    const v = await kit.read('display');
    if (v >= 1.325) break;
    await kit.slider('spatula', v < 1.0 ? 0.3 : 0.02);
    await kit.option('shield', 'open'); await kit.action('add-solid'); await kit.option('shield', 'closed');
    await kit.option('lid', 'on'); await kit.waitFor((s) => s.display.reading.stable, { timeout: 150000, every: 400 }); await kit.option('lid', 'off');
  }
  await kit.action('record');
  await kit.action('remove'); await kit.action('tip'); await kit.option('lid', 'on'); await kit.action('place');
  await kit.waitFor((s) => s.display.reading.stable, { timeout: 150000 }); await kit.action('record'); await kit.action('remove');
  await kit.option('lid', 'off'); await kit.action('rinse-bottle'); await kit.action('rinse-funnel'); await kit.action('rinse-funnel');
  await kit.option('water-step', '50'); await kit.action('add-water');
  let peak = 0;
  for (let i = 0; i < 30; i += 1) {
    await kit.action('swirl'); await kit.page.waitForTimeout(500);
    peak = Math.max(peak, await kit.read('flask-temp'));
    if (await state(kit, (s) => s.batch.solid === 0)) break;
  }
  kit.check(peak > 25.2, `dissolving sodium carbonate gives out heat: the flask reached ${peak} °C`);
  kit.check((await kit.read('claimed-n')) > 0.095 && (await kit.read('claimed-n')) < 0.105, `the normality worked out from the notebook: ${await kit.read('claimed-n')}`);
  kit.check((await kit.tableRows()) >= 2, 'the weighings are in the notebook');
}
