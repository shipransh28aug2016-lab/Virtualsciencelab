/**
 * Scenario probe for XI-CHE-E05: hydrochloric acid against standard sodium carbonate, through the
 * real interface in a real GL context — two end points, the indicator that follows each, the
 * carbon dioxide held in the flask short of the second, boiling it off, and the curve.
 */
const mixed = (kit) => kit.waitFor((s) => s.unmixed < 2e-3, { timeout: 150000 });
const stable = (kit) => kit.waitFor((s) => s.world.targetE !== null && Math.abs(s.world.targetE - s.Ed_mV) < 0.2, { timeout: 150000 });
const hexOf = (kit, id) => kit.page.evaluate((i) => document.querySelector(`[data-probe="${i}"]`)?.getAttribute('data-hex'), id);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const pinkness = (hex) => { const [r, g] = rgb(hex); return r - g; };

export default async function scenario(kit) {
  await kit.option('clock', '4');
  kit.check((await kit.status()) === 'ready', 'the bench starts ready to titrate');
  const r0 = await kit.read('burette');
  kit.check(r0 > 0 && r0 < 1, `a new fill starts at ${r0} mL, not 0.00`);
  await kit.option('stirrer', 'on');

  /* Methyl orange, in carbonate, is yellow. Run in 15 mL; the second end point is at 19.12 mL. */
  const yellow = rgb(await hexOf(kit, 'flask-colour'));
  kit.check(yellow[0] > 200 && yellow[1] > 150 && yellow[2] < 120, `methyl orange in the carbonate is yellow (${yellow})`);
  for (let i = 0; i < 3; i += 1) { await kit.action('add-5'); await mixed(kit); }
  kit.check(Math.abs(await kit.read('flask-volume') - 35) < 0.01, 'the flask holds 20 + 15 mL');
  const atFifteen = rgb(await hexOf(kit, 'flask-colour'));
  kit.check(Math.abs(atFifteen[1] - yellow[1]) < 30, 'past the first end point methyl orange has not moved: that is not where it turns');
  kit.check(/\d/.test((await kit.text('co2')) ?? '') && (await kit.read('co2')) > 1, `the flask is holding carbon dioxide: ${await kit.read('co2')} mmol/L`);

  /* Drops until it goes orange-red. */
  for (let i = 0; i < 3; i += 1) await kit.action('add-1');
  await mixed(kit);
  let drops = 0;
  const g0 = yellow[1];
  for (; drops < 80; drops += 1) {
    await kit.action('add-drop'); await mixed(kit);
    if (rgb(await hexOf(kit, 'flask-colour'))[1] < g0 - 25) break;
  }
  kit.check(drops > 0 && drops < 80, `methyl orange turned after ${drops + 1} drops past 18 mL`);
  await kit.action('endpoint');
  const C = await kit.read('unknown-end');
  kit.check(Math.abs(C - 0.1046) < 0.0035, `the second end point gives HCl ${C} M against 0.1046`);

  /* Boil off the CO₂: the flask's dissolved gas goes. */
  await kit.action('boil');
  kit.check((await kit.read('co2')) < 0.2, `boiled, the flask holds ${await kit.read('co2')} mmol/L of CO₂`);

  /* Phenolphthalein follows the FIRST end point: pink goes at 9.56 mL, half the acid. */
  await kit.action('fresh-flask'); await kit.select('indicator', 'phenolphthalein');
  kit.check(pinkness(await hexOf(kit, 'flask-colour')) > 60, 'phenolphthalein in the carbonate is pink');
  await kit.action('add-5'); await mixed(kit);
  for (let i = 0; i < 4; i += 1) await kit.action('add-1');
  await mixed(kit);
  for (let i = 0; i < 40; i += 1) { await kit.action('add-drop'); await mixed(kit); if (pinkness(await hexOf(kit, 'flask-colour')) < 25) break; }
  const added = await kit.read('flask-volume') - 20;
  kit.check(Math.abs(added - 9.56) < 0.6, `phenolphthalein goes at ${added.toFixed(2)} mL: the first end point (9.56), half of the acid`);

  /* A fresh flask, the meter in, and the curve. */
  await kit.action('fresh-flask');
  await kit.option('meter', 'in'); await kit.select('indicator', 'none');
  await stable(kit);
  const ph0 = await kit.read('meter-ph');
  kit.check(ph0 > 10.8 && ph0 < 11.6, `the meter in 0.1 M carbonate reads ${ph0}`);
  await kit.action('record');
  for (const a of ['add-5', 'add-5', 'add-5', 'add-1', 'add-1', 'add-1']) { await kit.action(a); await mixed(kit); await stable(kit); await kit.action('record'); }
  kit.check((await kit.tableRows()) >= 6, `readings in the notebook (${await kit.tableRows()})`);
  const points = await kit.page.evaluate(() => document.querySelector('[data-probe="plot"]')?.querySelectorAll('circle').length ?? 0);
  kit.check(points >= 6, `the graph is drawn from the student's points (${points})`);
}
