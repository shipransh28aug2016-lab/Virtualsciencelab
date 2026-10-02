/**
 * Scenario probe for XI-CHE-F01: a salt analysis through the real interface in a real GL context —
 * a carbonate (solid in a dry tube, acid, the delivery tube, lime water), an ammonium salt (NaOH,
 * litmus, smell, the rod), a flame test, a wrong answer and a right one.
 */
const state = (kit, fn) => kit.eval(fn);
const pickBottle = (kit, id) => kit.eval((s, a) => s.setBottle(a[0]), id);

export default async function scenario(kit) {
  await kit.option('clock', '30');
  kit.check((await kit.status()) === 'rest', `the bench starts at "rest" (${await kit.status()})`);

  /* Bottle 1 holds the carbonate (the bench's own shuffle). A pinch in a dry tube, acid, lime water. */
  await kit.option('bottle', '1');
  await kit.action('look-salt');
  kit.check((await kit.tableRows()) === 1, 'looking at the salt writes the first line of the notebook');
  await kit.action('tip');
  kit.check(/dry tube/.test((await kit.text('view-solution')) ?? '') === false && /no liquid/.test((await kit.text('view-solution')) ?? ''), 'an emptied tube has no liquid');
  await kit.select('reagent', 'sample'); await kit.slider('drops', 1); await kit.action('add');
  await kit.action('delivery');
  await kit.select('reagent', 'hcl'); await kit.slider('drops', 20); await kit.action('add');
  kit.check(/bubbles/.test((await kit.text('view-gas')) ?? ''), `acid on the carbonate: gas — "${await kit.text('view-gas')}"`);
  await kit.waitFor((s) => s.tubes.find((t) => t.id === 'L').obs.mgPerMl > 0.5, { timeout: 20000 });
  kit.check(/precipitate|turbid/.test((await kit.text('lime-water')) ?? ''), `the lime water: "${await kit.text('lime-water')}"`);
  await kit.action('record');

  /* An ammonium salt reacts with NaOH. */
  await kit.action('delivery');
  await kit.option('tube', 'B'); await kit.select('reagent', 'naoh'); await kit.slider('drops', 10); await kit.action('add');
  await kit.action('litmus-red'); await kit.action('smell'); await kit.action('rod');
  const rows = await kit.eval((s) => s.log.slice(-3).map((r) => r.observation));
  kit.check(/turns blue/.test(rows[0]) && /ammonia/.test(rows[1]) && /white fumes/.test(rows[2]), `litmus, smell and rod on NH₄⁺ + NaOH: ${rows.join(' / ')}`);
  kit.check((await kit.status()) !== null, 'the bench keeps a status');

  /* The flame test, on the calcium nitrate (bottle 8) — and the wire cleaned afterwards. */
  await pickBottle(kit, 8);
  await kit.option('tube', 'C');
  await kit.action('flame');
  await kit.waitFor((s) => s.elapsed - s.loop.t0 > 3, { timeout: 60000 });
  const hex = await kit.page.evaluate(() => document.querySelector('[data-probe="flame-colour"]')?.getAttribute('data-hex'));
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  kit.check(r > g && r > b * 1.4, `calcium's flame is red-orange on the screen (${hex})`);
  kit.check(/brick-red/.test(await kit.eval((s) => s.log.at(-1).observation)), 'and the notebook says brick-red');
  await kit.action('clean');

  /* A reagent and a hot bath, then a wrong answer and a right one. */
  await pickBottle(kit, 5);                          // lead nitrate: HCl → PbCl₂, dissolves hot
  await kit.option('tube', 'E'); await kit.select('reagent', 'hcl'); await kit.slider('drops', 10); await kit.action('add');
  kit.check(/white/.test((await kit.text('view-precipitate')) ?? ''), `lead + HCl: "${await kit.text('view-precipitate')}"`);
  await kit.option('bath', 'hot');
  await kit.waitFor((s) => !s.tubes.find((t) => t.id === 'E').obs.solids.length, { timeout: 240000, every: 500 });
  kit.check(/no precipitate/.test((await kit.text('view-precipitate')) ?? ''), 'PbCl₂ dissolves in the hot bath');

  await kit.select('cation', 'cu2'); await kit.select('anion', 'so4'); await kit.action('check');
  kit.check(/wrong|neither/.test((await kit.text('verdict')) ?? ''), `a wrong answer is marked: "${await kit.text('verdict')}"`);
  await kit.select('cation', 'pb2'); await kit.select('anion', 'no3'); await kit.action('check');
  kit.check(/both correct/.test((await kit.text('verdict')) ?? ''), `the right one: "${await kit.text('verdict')}"`);
  await kit.action('reveal');
  kit.check((await state(kit, (s) => s.revealed)) === true, 'after an attempt the standard tests can be shown');
  kit.check((await kit.tableRows()) >= 6, `readings in the notebook (${await kit.tableRows()})`);
}
