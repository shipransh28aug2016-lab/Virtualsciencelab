/**
 * Scenario probe for XI-CHE-D01: what a student does with four tubes, five
 * droppers and two baths — through the real interface in a real GL context —
 * including the mistakes (overfilling a tube, reading one that is still
 * warming).
 */
const tube = (kit, id) => kit.eval((s, a) => {
  const t = s.tubes.find((q) => q.id === a[0]);
  return { A: t.obs.A447, T: t.tempC, hex: t.obs.colour.hex, V: t.content.volumeMl, bath: t.bath };
}, id);
const dose = async (kit, id, reagent, drops) => {
  await kit.option('tube', id); await kit.option('reagent', reagent); await kit.slider('drops', drops); await kit.action('add');
};

export default async function scenario(kit) {
  await kit.option('clock', '10');

  /* The reference tube. */
  const A0 = await kit.read('colorimeter');
  kit.check(Math.abs(A0 - 0.37) < 0.02, `the reference mixture reads ${A0} at 447 nm`);
  kit.check((await kit.status()) === 'rest', 'the bench starts at rest');
  await kit.action('record');

  /* Iron in: right. */
  await dose(kit, 'A', 'fecl3', 8);
  const A1 = await kit.read('colorimeter');
  kit.check(A1 > 4 * A0, `8 drops of FeCl₃ take A from ${A0} to ${A1}`);
  kit.check((await kit.status()) === 'dose-right', 'the bench says the system shifts right');
  kit.check((await kit.read('qk')) < 0.2, `Q/K is ${await kit.read('qk')} straight after the dose`);
  kit.check(/right/.test(await kit.text('move')), 'and it says which way it moves');
  kit.check((await kit.read('complexed')) > 30, `${await kit.read('complexed')} % of the thiocyanate is now the complex`);
  await kit.action('record');

  /* Oxalate: left. */
  await dose(kit, 'B', 'oxalate', 4);
  const A2 = await kit.read('colorimeter');
  kit.check(A2 < 0.4 * A0, `4 drops of oxalate take A from ${A0} to ${A2}`);
  kit.check((await kit.status()) === 'dose-left' && (await kit.read('qk')) > 10, 'Q/K is far above 1 and the bench says left');
  kit.check(Math.abs((await kit.read('ox-total')) - 0.02 / 10.2) < 5e-5, `the oxalate in the tube is on the panel (${await kit.read('ox-total')} mol/L)`);
  await kit.action('record');

  /* Both baths at once; while they come to temperature, the rest. */
  await kit.option('tube', 'C'); await kit.option('bath', 'hot');
  await kit.option('tube', 'D'); await kit.option('bath', 'ice');
  kit.check((await kit.status()) === 'changing', 'a tube just put in a bath says it is still changing');
  await kit.option('tube', 'A'); await kit.option('reagent', 'water'); await kit.slider('drops', 20);
  for (let i = 0; i < 7; i += 1) await kit.action('add');
  kit.check((await kit.status()) === 'spilled', 'seven times 20 drops of water overfill the tube, and the bench says so');
  const spill = await tube(kit, 'A');
  kit.check(Math.abs(spill.V - 15) < 1e-6, `it holds 15 mL (${spill.V})`);
  await kit.action('fresh');
  const fresh = await tube(kit, 'A');
  kit.check(Math.abs(fresh.A - A0) < 0.005, 'a fresh tube reads the reference again');

  /* Acid, which "is not in the equation". */
  await dose(kit, 'A', 'hno3', 10);
  const A3 = await kit.read('colorimeter');
  kit.check(A3 > 1.5 * A0, `10 drops of acid deepen the colour (${A0} → ${A3}): the iron comes out of FeOH²⁺`);
  await kit.action('record');
  await dose(kit, 'A', 'water', 20);
  kit.check((await kit.read('colorimeter')) < A3, 'water on top fades it');
  kit.check((await kit.read('qk')) > 1, 'Q/K above 1 for a dilution');

  /* Back to the baths. */
  await kit.waitFor((s) => s.tubes[2].tempC > 55 && s.tubes[3].tempC < 5, { timeout: 150000 });
  await kit.option('tube', 'C');
  const hot = await tube(kit, 'C');
  kit.check(hot.A < 0.35 * A0 && hot.T > 55, `the tube in the hot bath is ${hot.T.toFixed(1)} °C and reads ${hot.A.toFixed(3)}`);
  await kit.waitFor((s) => Math.abs(s.tubes[2].tempC - 60) < 0.5, { timeout: 150000 });
  kit.check((await kit.status()) === 'bath-hot', 'settled at 60 °C, the bench says what K does');
  await kit.action('record');
  await kit.option('tube', 'D');
  const cold = await tube(kit, 'D');
  kit.check(cold.A > 2 * A0 && cold.T < 5, `the tube in the ice bath is ${cold.T.toFixed(1)} °C and reads ${cold.A.toFixed(3)}`);
  await kit.waitFor((s) => s.tubes[3].tempC < 0.6, { timeout: 150000 });
  await kit.action('record');

  /* Taken out of the bath, the tube warms back up and the colour fades back with it. */
  const Acold = (await tube(kit, 'D')).A;
  await kit.option('bath', 'air');
  await kit.waitFor((s) => s.tubes[3].tempC > 12, { timeout: 150000 });
  const back = await tube(kit, 'D');
  kit.check(back.A < Acold && back.A > A0, `taken out of the ice and at ${back.T.toFixed(1)} °C, the tube reads ${back.A.toFixed(3)}: on its way from ${Acold.toFixed(3)} back to ${A0}`);

  /* The notebook sets the prediction against the colour. */
  kit.check((await kit.tableRows()) >= 6, 'the readings are in the notebook');
  const table = (await kit.text('table')) ?? '';
  kit.check(/right/.test(table) && /left/.test(table) && /deeper/.test(table) && /paler/.test(table), 'it has both predictions and both observations');
  kit.check((await kit.read('judged')) >= 4 && (await kit.text('agree')).includes('of'), 'and says how many of the predictions the colour bore out');
  kit.check(Number.isFinite(await kit.read('kc')), 'the worksheet Kc is worked out from the readings');
}
