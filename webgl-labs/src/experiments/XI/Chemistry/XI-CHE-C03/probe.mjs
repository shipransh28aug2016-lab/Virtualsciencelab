/**
 * Scenario probe for XI-CHE-C03: a titration through the real interface in a
 * real GL context — phenolphthalein to an end point, then a meter and the
 * graph, including the mistakes that are meant to cost.
 */
const mixed = (kit) => kit.waitFor((s) => s.unmixed < 2e-3, { timeout: 120000 });
const stable = (kit) => kit.waitFor((s) => s.world.targetE !== null && Math.abs(s.world.targetE - s.Ed_mV) < 0.2, { timeout: 150000 });
const hexOf = (kit, id) => kit.page.evaluate((i) => document.querySelector(`[data-probe="${i}"]`)?.getAttribute('data-hex'), id);
const pinkness = (hex) => { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255; const g = (n >> 8) & 255; return r - g; };

export default async function scenario(kit) {
  await kit.option('clock', '4');
  kit.check((await kit.status()) === 'ready', 'the bench starts ready to titrate');
  const r0 = await kit.read('burette');
  kit.check(r0 > 0 && r0 < 1, `a new fill starts at ${r0} mL, not 0.00`);

  /* Phenolphthalein, stirrer on to keep the clock short. */
  await kit.select('indicator', 'phenolphthalein');
  await kit.option('stirrer', 'on');
  const start = await hexOf(kit, 'flask-colour');
  kit.check(pinkness(start) > 60, `phenolphthalein in the base is pink (${start})`);

  /* Fifteen mL in lumps, then to the edge. */
  for (let i = 0; i < 3; i += 1) { await kit.action('add-5'); await mixed(kit); }
  kit.check(Math.abs((await kit.read('burette')) - (r0 + 15)) < 0.06, 'fifteen mL in: the burette reads fifteen mL more');
  kit.check(Math.abs(await kit.read('flask-volume') - 35) < 0.01, 'the flask holds 20 + 15 mL');
  await kit.action('add-1'); await kit.action('add-1'); await kit.action('add-1'); await mixed(kit);
  kit.check((await kit.status()) === 'steep' || (await kit.status()) === 'titrating', `at 18 mL the bench says "${await kit.status()}"`);

  /* Single drops until the pink goes. */
  let drops = 0;
  for (; drops < 40; drops += 1) {
    await kit.action('add-drop'); await mixed(kit);
    if (pinkness(await hexOf(kit, 'flask-colour')) < 25) break;
  }
  kit.check(drops > 0 && drops < 40, `the pink went after ${drops + 1} drops past 18 mL`);
  await kit.action('endpoint');
  const C = await kit.read('naoh-end');
  kit.check(Math.abs(C - 0.0978) < 0.0006, `the end point gives NaOH ${C} M against 0.0978`);
  kit.check((await kit.status()) === 'past' || (await kit.status()) === 'steep', `bench status after the end point: ${await kit.status()}`);

  /* A mistake: open the stopcock wide and walk away. */
  await kit.slider('flow', 1.5); await kit.action('stopcock');
  await kit.waitFor((s) => s.delivered > 24, { timeout: 60000 });
  kit.check((await kit.status()) === 'flowing', 'with the tap open the bench says titrant is running');
  await kit.action('stopcock');

  /* A fresh flask, the meter in, and the curve. */
  await kit.action('fresh-flask');
  await kit.option('meter', 'in'); await kit.select('indicator', 'none');
  await stable(kit);
  const ph0 = await kit.read('meter-ph');
  kit.check(ph0 > 12.4 && ph0 < 12.9, `the meter in 0.0978 M NaOH reads ${ph0} (alkaline error: true 12.88)`);
  await kit.action('record');
  for (const a of ['add-5', 'add-5', 'add-5', 'add-1', 'add-1', 'add-1']) { await kit.action(a); await mixed(kit); await stable(kit); await kit.action('record'); }
  kit.check((await kit.tableRows()) >= 6, `readings in the notebook (${await kit.tableRows()})`);
  const points = await kit.page.evaluate(() => document.querySelectorAll('[data-probe="plot"] circle').length);
  kit.check(points >= 6, `the graph is drawn from the student's points (${points})`);
}
