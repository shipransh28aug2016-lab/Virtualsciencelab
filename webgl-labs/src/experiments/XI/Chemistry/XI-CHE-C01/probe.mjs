/**
 * Scenario probe for XI-CHE-C01: what a student does, in a real GL context,
 * through the real interface — including the mistakes that are supposed to
 * cost them.
 */
const settleOn = (kit) => kit.waitFor((s) => s.world.targetE !== null && Math.abs(s.world.targetE - s.Ed_mV) / 6 < 0.04, { timeout: 90000 });

export default async function scenario(kit) {
  await kit.page.waitForTimeout(500);
  await kit.option('clock', '10');                              // the ×10 clock is a real control
  await kit.option('method', 'meter');

  /* An uncalibrated meter says so, and is wrong. */
  kit.check((await kit.status()) === 'meter-uncal', 'a fresh meter announces that it is not calibrated');
  await kit.action('rinse'); await kit.action('dip-sample'); await settleOn(kit);
  const raw = await kit.read('meter-ph');
  const truth = await kit.eval((s) => s.world.sample.pH);
  kit.check(Math.abs(raw - truth) > 0.15, `uncalibrated, 0.1 M HCl reads ${raw} against a true ${truth.toFixed(2)}`);

  /* Calibrate through the buttons, waiting for the meter to say STABLE each time. */
  await kit.action('rinse'); await kit.action('dip-4'); await settleOn(kit);
  kit.check((await kit.status()) === 'meter-in-buffer', 'in the buffer, the status offers to calibrate');
  await kit.action('calibrate');
  await kit.action('rinse'); await kit.action('dip-9'); await settleOn(kit); await kit.action('calibrate');
  const slope = await kit.read('slope');
  kit.check(slope > 95 && slope <= 102, `two-point calibration on a new electrode: slope ${slope}%`);
  kit.check((await kit.text('calibration')) === '2-point', 'the meter says it is two-point calibrated');

  /* Measure acetic acid properly. */
  await kit.select('sample', 'acetic');
  await kit.action('rinse'); await kit.action('dip-sample'); await settleOn(kit);
  const ph = await kit.read('meter-ph');
  const tru = await kit.eval((s) => s.world.sample.pH);
  kit.check(Math.abs(ph - tru) < 0.03, `calibrated, 0.1 M acetic acid reads ${ph} against ${tru.toFixed(2)}`);
  await kit.action('record');
  kit.check((await kit.tableRows()) === 1, 'Record puts the reading in the notebook');

  /* The classic mistake: not rinsing between a strong acid and water. */
  await kit.select('sample', 'hcl');
  await kit.action('rinse'); await kit.action('dip-sample'); await settleOn(kit);
  await kit.select('sample', 'water');                       // electrode lifted out, carrying acid
  await kit.action('dip-sample'); await settleOn(kit);
  const dirty = await kit.read('meter-ph');
  kit.check(dirty < 5 && (await kit.status()) === 'meter-spoiled', `water read without rinsing shows ${dirty} and the bench says the sample is contaminated`);
  await kit.action('rinse'); await kit.action('dip-sample'); await settleOn(kit);
  const still = await kit.read('meter-ph');
  kit.check(still < 5, `rinsing afterwards does not undo it (${still})`);
  await kit.action('fresh-sample'); await kit.action('rinse'); await kit.action('dip-sample'); await settleOn(kit);
  const clean = await kit.read('meter-ph');
  kit.check(Math.abs(clean - 7) < 0.1, `a fresh pour and a rinsed electrode read ${clean}`);

  /* A worn electrode is told apart by its slope. */
  await kit.option('electrode', 'worn');
  kit.check((await kit.text('calibration')) === 'none', 'a different electrode is a different instrument: calibration cleared');
  await kit.action('rinse'); await kit.action('dip-4'); await settleOn(kit); await kit.action('calibrate');
  await kit.action('rinse'); await kit.action('dip-9'); await settleOn(kit); await kit.action('calibrate');
  const worn = await kit.read('slope');
  kit.check(worn < 93, `worn electrode: slope ${worn}% is below the replace line`);

  /* Paper, then the chart. */
  await kit.option('method', 'paper');
  await kit.select('sample', 'lemon');
  kit.check((await kit.status()) === 'paper-ready', 'paper: ready to test');
  await kit.action('dip-strip');
  await kit.waitFor((s) => s.strip.t > 25);
  kit.check((await kit.status()) === 'paper-match', 'paper: developed, ready to match');

  /* The solver's chemistry shows through the whole stack. */
  const lemon = await kit.eval((s) => s.world.sample.pH);
  kit.check(lemon > 1.8 && lemon < 2.8, `lemon juice computes to pH ${lemon.toFixed(2)}`);
}
