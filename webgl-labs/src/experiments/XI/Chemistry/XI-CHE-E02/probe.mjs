/**
 * Scenario probe for XI-CHE-E02: a standard solution, made through the real
 * interface in a real GL context — the plan checked, the solid weighed by
 * difference, tipped and rinsed, dissolved (the flask cools), made up to the
 * mark at eye level once it is back at the room, mixed — and the reference
 * titration that says what was made. And an overshoot, which cannot be undone.
 */
const state = (kit, fn) => kit.eval(fn);
const swirlUntilClear = async (kit) => {
  for (let i = 0; i < 40; i += 1) {
    if (await state(kit, (s) => s.batch.solid === 0)) return true;
    await kit.action('swirl'); await kit.page.waitForTimeout(600);
  }
  return state(kit, (s) => s.batch.solid === 0);
};

export default async function scenario(kit) {
  await kit.option('clock', '30');
  kit.check((await kit.status()) === 'start', 'the bench begins by asking for the plan');

  /* The calculation, checked: a molar answer is caught. */
  await kit.slider('planned', 3.152); await kit.action('check-plan');
  kit.check(/molarity|normality/i.test((await kit.text('status')) ?? ''), 'twice the mass is a molar, not a normal, calculation — and the bench says so');
  await kit.slider('planned', 1.576); await kit.action('check-plan');
  kit.check(/right/i.test((await kit.text('plan-feedback')) ?? ''), '1.576 g is right');

  /* Weigh in: bottle, tare, solid; then by difference. */
  await kit.option('balance', 'top3'); await kit.option('shield', 'closed'); await kit.option('lid', 'off');
  await kit.action('place');
  await kit.waitFor((s) => s.display.reading.stable, { timeout: 120000 });
  await kit.action('tare');
  await kit.waitFor((s) => s.display.reading.stable && Math.abs(s.display.reading.value) < 0.002, { timeout: 120000 });
  for (let i = 0; i < 40; i += 1) {
    const v = await kit.read('display');
    if (v >= 1.575) break;
    await kit.slider('spatula', v < 1.3 ? 0.3 : 0.02);
    await kit.option('shield', 'open'); await kit.action('add-solid'); await kit.option('shield', 'closed');
    await kit.waitFor((s) => s.display.reading.stable, { timeout: 120000, every: 400 });
  }
  const net = await kit.read('display');
  kit.check(net >= 1.575 && net < 1.62, `the solid is weighed in: ${net} g net`);
  await kit.action('record');
  await kit.action('remove');
  await kit.action('tip');
  await kit.action('place');
  await kit.waitFor((s) => s.display.reading.stable, { timeout: 120000 });
  await kit.action('record');
  kit.check(Math.abs((await kit.read('mass-used')) - net) < 0.015, `the mass used, by difference: ${await kit.read('mass-used')} g`);
  kit.check(Math.abs((await kit.read('claimed-n')) - 0.1) < 0.003, `the normality worked out from it: ${await kit.read('claimed-n')}`);
  await kit.action('remove');

  /* Rinse, dissolve: the flask cools. */
  await kit.action('rinse-bottle'); await kit.action('rinse-funnel'); await kit.action('rinse-funnel'); await kit.action('rinse-funnel');
  await kit.option('water-step', '50'); await kit.action('add-water'); await kit.action('add-water');
  kit.check(await swirlUntilClear(kit), 'swirled until the crystals are gone');
  const cool = await kit.read('flask-temp');
  kit.check(cool < 24.6, `dissolving oxalic acid takes heat: the flask is ${cool} °C`);

  /* Make up: by tens, then by ones, then drops — at eye level, once the flask is back at the room. */
  await kit.option('water-step', '10');
  for (let i = 0; i < 12 && (await state(kit, (s) => s.display.level < -45)); i += 1) await kit.action('add-water');
  await kit.option('water-step', '1'); await kit.slider('eye', 0);
  for (let i = 0; i < 30 && (await state(kit, (s) => s.display.seen < -3)); i += 1) await kit.action('add-water');
  await kit.waitFor((s) => Math.abs(s.batch.T - s.room) < 0.1, { timeout: 150000, every: 500 });
  kit.check((await kit.text('ring')) === 'one straight line' || /straight/.test((await kit.text('ring')) ?? ''), 'with the eye level the ring is a straight line');
  await kit.option('water-step', '0.05');
  for (let i = 0; i < 160 && (await state(kit, (s) => s.display.seen < -0.15)); i += 1) await kit.action('add-water');
  kit.check((await kit.status()) === 'at-mark', 'at the mark, the bench says so');

  /* Mix, and check. */
  await kit.option('stopper', 'in');
  kit.check(Math.abs(await kit.read('meniscus')) < 0.5, `the meniscus is on the line (${await kit.read('meniscus')} mm)`);
  await kit.action('invert-many'); await kit.action('invert-many');
  kit.check((await kit.status()) === 'ready', 'turned over ten times, the flask is made up and mixed');
  await kit.action('reveal');
  const N = await kit.read('true-n');
  kit.check(Math.abs(N - 0.1) < 0.0015, `the reference titration finds ${N} N`);
  kit.check(Math.abs(await kit.read('error')) < 0.5, `against the notebook’s figure: ${await kit.read('error')} %`);
  kit.check(Number.isFinite(await kit.read('budget-purity')) && Number.isFinite(await kit.read('budget-glass')), 'and the error budget is shown');

  /* Past the mark, and then past the brim. */
  await kit.action('reset');
  await kit.option('flask', '100'); await kit.option('water-step', '50');
  await kit.action('add-water'); await kit.action('add-water');
  await kit.option('water-step', '1'); await kit.action('add-water');
  kit.check((await kit.status()) === 'overshoot', 'a millilitre past the mark of a 100 mL flask is 15 mm up the neck, and the bench says so');
  for (let i = 0; i < 4; i += 1) await kit.action('add-water');
  kit.check((await kit.status()) === 'spilled', 'and a few more run over the rim');
  kit.check((await kit.tableRows()) >= 3, 'the readings are in the notebook');
}
