/**
 * Scenario probe for XI-CHE-D02: pink to blue and back, through the real
 * interface in a real GL context — chloride in, water on top, silver, salt past
 * its solubility, the baths, the spectrometer running off its scale — and the
 * notebook that draws the fourth power from the student's own readings.
 */
const tube = (kit, id) => kit.eval((s, a) => {
  const t = s.tubes.find((q) => q.id === a[0]);
  return { x: t.obs.x, T: t.tempC, hex: t.obs.colour.hex, V: t.content.volumeMl, A600: t.obs.A(600, 0.1) };
}, id);
const dose = async (kit, id, reagent, n) => {
  await kit.option('tube', id); await kit.option('reagent', reagent); await kit.slider('drops', n); await kit.action('add');
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export default async function scenario(kit) {
  await kit.option('clock', '10');

  /* The pink tube. */
  const A0 = await kit.read('spectrometer');
  kit.check(Math.abs(A0 - 0.44) < 0.04, `0.10 M pink cobalt(II) reads ${A0} at 510 nm in 1 cm`);
  kit.check((await kit.status()) === 'rest', 'the bench starts at rest');
  const pink = rgb((await tube(kit, 'A')).hex);
  kit.check(pink[0] > pink[1] && pink[2] > pink[1], 'and it is pink');
  await kit.action('record');

  /* Concentrated HCl: blue. */
  await dose(kit, 'A', 'hcl', 30);
  const blue = await tube(kit, 'A'); const [r, , b] = rgb(blue.hex);
  kit.check(b > r + 60, `30 drops of concentrated HCl turn it blue (${blue.hex})`);
  kit.check((await kit.status()) === 'dose-right' && (await kit.read('qk')) < 0.01, `Q/K is ${await kit.text('qk')} straight after the dose: far below 1`);
  kit.check(/right/.test(await kit.text('move')), 'and the bench says it moves right');
  const pc = await kit.read('blue-from-a');
  kit.check(pc > 40 && pc < 65, `the worksheet puts ${pc} % of the cobalt as CoCl₄²⁻ (the truth is ${(100 * blue.x).toFixed(0)} %)`);
  await kit.action('record');

  /* The spectrometer runs off its scale, and comes back on. */
  await kit.option('wavelength', '692');
  kit.check((await kit.text('spectrometer')).includes('OVER'), 'at 692 nm in a 1 cm cell the blue tube is off the scale');
  await kit.option('wavelength', '600'); await kit.option('cell', '0.1');
  const A600 = await kit.read('spectrometer');
  kit.check(A600 > 0.3 && A600 < 1.5, `at 600 nm in the 1 mm cell it reads ${A600}`);
  kit.check((await kit.read('eps-blue')) > 100 && (await kit.read('eps-pink')) < 0.1, 'the data sheet gives ε for both ions at that wavelength');
  await kit.action('record');

  /* Water on top: pink again. */
  await dose(kit, 'B', 'hcl', 30);
  const before = await tube(kit, 'B');
  await dose(kit, 'B', 'water', 40);
  const diluted = await tube(kit, 'B');
  kit.check(diluted.x < before.x - 0.2, `40 drops of water take a tube from ${(100 * before.x).toFixed(0)} % blue to ${(100 * diluted.x).toFixed(0)} %`);
  kit.check((await kit.status()) === 'dose-left' && (await kit.read('qk')) > 1, 'Q/K above 1: it moves left');
  await kit.action('record');

  /* Silver nitrate takes chloride out. */
  await dose(kit, 'C', 'hcl', 30);
  const beforeC = await tube(kit, 'C');
  await dose(kit, 'C', 'agno3', 30);
  const silver = await tube(kit, 'C');
  kit.check(silver.x < beforeC.x - 0.1, `silver nitrate: ${(100 * beforeC.x).toFixed(0)} % blue → ${(100 * silver.x).toFixed(0)} %`);
  kit.check((await kit.text('solid')).includes('AgCl'), 'and there is a white solid in the tube');
  await kit.action('record');

  /* Salt past its solubility. */
  await kit.option('tube', 'D'); await kit.option('reagent', 'nacl'); await kit.slider('drops', 10);
  await kit.action('add'); await kit.action('add');
  kit.check((await kit.status()) === 'saturated', 'twenty pinches of salt in 3 mL are more than will dissolve — the bench says the brine is saturated');
  kit.check((await kit.text('solid')).includes('NaCl'), 'the rest is crystals on the bottom');
  await kit.action('record');

  /* Both baths on blue/pink tubes. */
  await kit.option('tube', 'A'); await kit.option('bath', 'hot');
  await kit.option('tube', 'B'); await kit.option('bath', 'ice');
  kit.check((await kit.status()) === 'changing', 'a tube just put in a bath says it is still changing');
  await kit.waitFor((s) => s.tubes[0].tempC > 70 && s.tubes[1].tempC < 5, { timeout: 150000 });
  const hot = await tube(kit, 'A'); const cold = await tube(kit, 'B');
  kit.check(hot.x > blue.x + 0.2, `in the hot bath tube A is ${hot.T.toFixed(0)} °C and ${(100 * hot.x).toFixed(0)} % blue (it was ${(100 * blue.x).toFixed(0)} %)`);
  kit.check(cold.x < diluted.x + 0.001 && cold.T < 5, `in ice tube B is ${cold.T.toFixed(1)} °C and ${(100 * cold.x).toFixed(1)} % blue`);
  await kit.option('tube', 'A'); await kit.action('record');

  /* The mistake: a tube overfilled with water. */
  await kit.option('tube', 'D'); await kit.action('fresh');
  await kit.option('reagent', 'water'); await kit.slider('drops', 50);
  for (let i = 0; i < 5; i += 1) await kit.action('add');
  kit.check((await kit.status()) === 'spilled', 'five times 50 drops of water overfill the tube, and the bench says so');
  await kit.action('fresh');

  /* The fourth power, from four tubes read at 600 nm in the 1 mm cell. */
  await kit.action('reset');
  await kit.option('wavelength', '600'); await kit.option('cell', '0.1');
  for (const [tb, n] of [['A', 14], ['B', 18], ['C', 24], ['D', 32]]) { await dose(kit, tb, 'hcl', n); await kit.action('record'); }
  const slope = await kit.read('slope');
  kit.check(Math.abs(slope - 4) < 0.35, `the graph of log (blue/pink) against log [Cl⁻] has slope ${slope}: four chlorides per cobalt`);
  const Kc = await kit.read('kc');
  kit.check(Kc > 3.5e-3 && Kc < 5.5e-3, `Kc from the readings is ${Kc}`);
  kit.check((await kit.tableRows()) >= 4, 'the readings are in the notebook');
}
