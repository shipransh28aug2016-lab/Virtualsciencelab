/**
 * Scenario probe for XI-PHY-A04: a student at a spherometer, through the real interface in a real GL context. The scale and the
 * disc are read from the PICTURE; the legs' separation from the ruler in the picture; contact is found as at the bench — lower a
 * division at a time, press, see whether it rocks.
 */
import { seeScrew, seeRuler } from '../../../../shared/measure/eyes.mjs';
import { SPHEROMETERS } from '../../../../shared/measure/instruments.js';

const inst = SPHEROMETERS.sp100;
const truth = (kit) => kit.eval((s) => { const v = s.peek(); return { major: v.disp.turns * v.sp.pitch, minor: v.disp.disc, state: v.state, c: v.c, y: s.y }; });
const last = (kit) => kit.eval((s) => s.log.at(-1));

async function enter(kit, seen, lc) {
  await kit.slider('major', seen.psr); await kit.slider('minor', seen.csr); await kit.select('lc', String(lc));
}
/** Raise the screw clear; lower it ten divisions at a time, pressing, until it rocks; back off; a division at a time until it rocks. */
async function toContact(kit) {
  await kit.action('retract');
  const rocks = async () => { await kit.action('press'); return (await kit.status()) === 'rocks'; };
  for (let i = 0; i < 80 && !(await rocks()); i += 1) await kit.action('step-10+');
  await kit.action('step-10-');
  for (let i = 0; i < 40 && !(await rocks()); i += 1) await kit.action('step-1+');
}

export default async function scenario(kit) {
  /* ── The picture is the instrument ──────────────────────────────────────────────────────── */
  let agree = 0; let total = 0; const bad = [];
  for (const id of ['sp100', 'sp50', 'spWide']) {
    await kit.option('instrument', id); await kit.frames(3);
    const sp = SPHEROMETERS[id];
    for (const y of [0, 0.372, 1.23, 3.17, 5.04, 9.51, 13.9]) {
      await kit.eval((s, a) => s.setScrew(a[0]), y);
      const seen = await seeScrew(kit, sp); const t = await truth(kit);
      total += 1;
      if (Math.abs(seen.psr - t.major) < 1e-6 && seen.csr === t.minor) agree += 1; else bad.push(`${id} @${y}: saw ${seen.psr}+${seen.csr}, instrument ${t.major}+${t.minor}`);
    }
  }
  kit.check(agree === total, `reading the last mark and the disc on the screen gives the instrument's own reading in ${agree} of ${total} positions across the three spherometers${bad.length ? ` — ${bad.slice(0, 3).join('; ')}` : ''}`);

  /* ── The pitch, from ten turns ─────────────────────────────────────────────────────────────── */
  await kit.action('reset'); await kit.frames(2);
  await kit.action('retract');
  const a = await seeScrew(kit, inst); await kit.action('turn-10+'); const b = await seeScrew(kit, inst);
  const pitch = Math.round(((b.observed - a.observed) / 10) * 100) / 100;
  kit.check(Math.abs(pitch - 1) < 1e-9, `ten turns move the disc from ${a.observed.toFixed(2)} to ${b.observed.toFixed(2)} mm on the scale: pitch ${pitch} mm`);
  await kit.select('pitch', String(pitch)); await kit.select('divisions', '100');
  kit.check((await kit.text('derived-lc')).includes('0.0100'), 'pitch ÷ divisions = 0.0100 mm, shown on the bench');
  await kit.action('retract');

  /* ── The legs on paper, and the ruler ─────────────────────────────────────────────────────── */
  kit.check((await seeRuler(kit)) === null, 'before the legs are pressed on the paper there is no ruler to read');
  await kit.action('impress');
  const sides = [];
  for (const p of ['ab', 'bc', 'ca']) {
    await kit.option('pair', p); await kit.frames(2);
    const r = await seeRuler(kit);
    await kit.slider('ruler-a', r.a); await kit.slider('ruler-b', r.b); await kit.action('record-leg');
    sides.push(r.b - r.a);
  }
  const lmean = sides.reduce((x, y) => x + y, 0) / 3;
  kit.check(Math.abs(lmean - 40) < 0.6 && sides.every((s) => Math.abs(s - 40) < 0.9), `the three sides read from the ruler: ${sides.join(', ')} mm, mean ${lmean.toFixed(2)} mm (the legs are 40 mm apart, give or take what the instrument is)`);
  await kit.option('pair', 'ab'); await kit.slider('ruler-a', 10); await kit.slider('ruler-b', 52); await kit.action('record-leg');
  kit.check((await last(kit)).misread && (await kit.status()) === 'leg-misread', 'a ruler reading that is not where the impressions are is recorded, flagged, and the bench says where they are');

  /* ── The reference on plane glass ─────────────────────────────────────────────────────────── */
  await kit.option('surface', 'plane');
  const refs = [];
  for (let k = 0; k < 3; k += 1) {
    await toContact(kit);
    const t = await truth(kit);
    kit.check(t.state === 'rocks' && t.y - t.c < 0.0101, `reference ${k + 1}: it just rocks, within a division of contact (${((t.y - t.c) * 1000).toFixed(1)} µm past)`);
    const seen = await seeScrew(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record-ref');
    refs.push((await last(kit)).observed);
  }
  kit.check(refs.every((r) => Math.abs(r - 3.37) < 0.02), `the reading on plane glass, three times: ${refs.join(', ')} mm (it is 3.37 mm for this spherometer)`);
  kit.check((await kit.text('reference')).includes('mm on plane glass'), 'and the bench keeps the mean');

  /* ── The convex watch glass ────────────────────────────────────────────────────────────────── */
  await kit.option('surface', 'watchConvex');
  await kit.action('retract'); await kit.action('press');
  kit.check((await kit.status()) === 'firm', 'with the screw raised clear the spherometer stands firm on its legs');
  for (let k = 0; k < 3; k += 1) {
    await toContact(kit);
    const seen = await seeScrew(kit, inst); await enter(kit, seen, inst.lc); await kit.action('record');
  }
  const rows = await kit.eval((s) => s.log.filter((r) => r.kind === 'contact').map((r) => r.h));
  kit.check(rows.length === 3 && rows.every((h) => Math.abs(h - 1.19) < 0.03), `the sagitta from the three readings: ${rows.join(', ')} mm (the sheet: about 1.19 mm)`);
  const res = await kit.text('results');
  const R = /Radius of curvature R of the convex watch glass[^:]*:\s*([\d.]+)/.exec(res ?? '');
  kit.check(R && Math.abs(Number(R[1]) - 22.5) < 1.5 && /±/.test(res), `the results panel gives R = ${R ? R[1] : 'nothing'} cm for the convex watch glass (the sheet: 22.5 ± 1.5)`);
  kit.check(/Main term/.test(res) && /Correction term/.test(res), 'and the two terms of l²/6h + h/2 separately, so the smallness of h/2 can be seen');
  kit.check(!/actual/.test(res), 'keeping the true values to itself until asked');
  await kit.action('reveal');
  kit.check(/actual 22\.5/.test((await kit.text('results')) ?? ''), 'asked, it shows the true radius beside the result');

  /* ── The concave glass sends the screw the other way ─────────────────────────────────────── */
  await kit.option('surface', 'watchConcave');
  await toContact(kit);
  const seenC = await seeScrew(kit, inst);
  kit.check(seenC.observed > refs[0] + 0.5, `on the concave glass the screw has to go further down than on plane glass: ${seenC.observed.toFixed(2)} against ${refs[0].toFixed(2)} mm`);
  await enter(kit, seenC, inst.lc); await kit.action('record');
  kit.check(/concave/.test((await kit.text('results')) ?? ''), 'and the results call the surface concave');

  /* ── Mistakes through the interface ────────────────────────────────────────────────────────── */
  await kit.option('surface', 'watchConvex'); await kit.action('retract');
  await kit.eval((s) => s.setScrew(s.peek().c + 0.15));
  await enter(kit, await seeScrew(kit, inst), inst.lc); await kit.action('record');
  let row = await last(kit);
  kit.check(/pushed past contact/.test(row.note), 'a reading taken with the screw pushed on past contact is flagged');
  await kit.eval((s) => s.setScrew(s.peek().c - 0.15));
  await enter(kit, await seeScrew(kit, inst), inst.lc); await kit.action('record');
  row = await last(kit);
  kit.check(/clear of the surface/.test(row.note), 'a reading taken with the tip in the air is flagged');
  await kit.option('surface', 'plane');
  kit.check(!(await kit.hasAction('record')) && (await kit.hasAction('record-ref')), 'on the plane glass the only way to record is as the reference');
  kit.check((await kit.tableRows()) >= 12, `the notebook has ${await kit.tableRows()} lines`);
}
