/**
 * verify.mjs — the measuring-instrument kit (shared/measure).
 *
 * The scales are checked against their own geometry, not against the function that reads them: where the
 * vernier lines and the main-scale lines stand, which pair is closest to lined up, and whether that is the
 * division the reading reports; the same for the circular scale at the datum line. Then the physics round them:
 * least counts, the zero error and its sign, a hard body that stops the jaws and a soft one that does not,
 * backlash, parallax.
 *
 *   node verify.mjs
 */
import assert from 'node:assert/strict';
import { VERNIERS, SCREWS, SPHEROMETERS, vernierDisplay, screwDisplay, spheroDisplay, vernierObserved, screwObserved, restGap, sagitta, radiusFromSagitta } from './instruments.js';

const ok = [];
const near = (got, want, tol, label) => assert.ok(Math.abs(got - want) <= tol, `${label}: got ${got}, wanted ${want} ± ${tol}`);

/* ── 1 · Vernier: the reading is the line that lines up ────────────────────────────────── */
for (const v of Object.values(VERNIERS)) {
  near(v.lc, v.msd / v.n, 1e-12, `L.C. of ${v.id} = 1 M.S.D. / N`);
  /* n vernier divisions cover n−1 main divisions. */
  near(v.n * (v.msd - v.lc), (v.n - 1) * v.msd, 1e-9, `${v.n} vernier divisions span ${v.n - 1} main divisions`);
  let worst = 0; let wrong = 0; let tested = 0;
  for (let gap = 0.05; gap < 40; gap += 0.0173) {
    const e = v.zeroDiv * v.lc;
    const d = vernierDisplay(v, gap, e);
    /* Geometry: vernier line k at pos + k(msd − lc); main line j at j·msd; find the k with a main line nearest. */
    const pos = gap + e;
    let bestK = 0; let bestDist = Infinity;
    for (let k = 0; k <= v.n; k += 1) {
      const x = pos + k * (v.msd - v.lc); const dist = Math.abs(x - Math.round(x / v.msd) * v.msd);
      if (dist < bestDist - 1e-12) { bestDist = dist; bestK = k; }
    }
    tested += 1;
    /* The reported line must be as near to lining up as any (two lines can tie when the vernier zero stands exactly between divisions). */
    const kk = d.vsr === 0 && d.msr > Math.floor(pos / v.msd) * v.msd ? v.n : d.vsr;
    const x = pos + kk * (v.msd - v.lc); const distReported = Math.abs(x - Math.round(x / v.msd) * v.msd);
    if (pos >= 0 && distReported > bestDist + 1e-9) wrong += 1;
    worst = Math.max(worst, Math.abs(d.observed - pos));
  }
  assert.equal(wrong, 0, `${v.id}: the coinciding vernier line from the picture's geometry is the reported V.S.R. (${wrong} of ${tested} differ)`);
  assert.ok(worst <= v.lc / 2 + 1e-9, `${v.id}: the reading is within half a least count of the true position (worst ${worst.toFixed(4)} mm)`);
}
ok.push('vernier (10, 20, 50 divisions): L.C. = 1 mm / N; N divisions span N−1 main divisions; over 2300 jaw positions the vernier line that is closest to lining up with a main-scale line (found from the lines\' positions) is the V.S.R. reported, and the reading is within half a least count of the truth');

/* ── 2 · Zero error and its sign ──────────────────────────────────────────────────────────── */
{
  for (const v of Object.values(VERNIERS)) {
    const e = v.zeroDiv * v.lc; const d = vernierDisplay(v, 0, e);
    if (e >= 0) { assert.equal(d.msr, 0); assert.equal(d.vsr, v.zeroDiv); near(d.observed, e, 1e-9, 'positive zero error'); }
    else { assert.equal(d.msr, 0); assert.equal(d.vsr, v.n + v.zeroDiv); assert.ok(d.negative); near(d.observed, e, 1e-9, 'negative zero error'); near(vernierObserved(v, d.msr, d.vsr, true), e, 1e-9, 'worked out from the entry'); }
  }
  for (const g of Object.values(SCREWS)) {
    const e = g.zeroDiv * g.lc; const d = screwDisplay(g, 0, e);
    if (e >= 0) { assert.equal(d.csr, g.zeroDiv); near(d.observed, e, 1e-9, 'positive zero error'); }
    else { assert.equal(d.csr, g.n + g.zeroDiv); assert.ok(d.negative); near(d.observed, e, 1e-9, 'negative zero error'); near(screwObserved(g, d.psr, d.csr, true), e, 1e-9, 'worked out'); }
  }
  ok.push(`zero error: the callipers' ${Object.values(VERNIERS).map((v) => `${v.zeroDiv > 0 ? '+' : ''}${v.zeroDiv}`).join(', ')} divisions and the screw gauges' ${Object.values(SCREWS).map((g) => `${g.zeroDiv > 0 ? '+' : ''}${g.zeroDiv}`).join(', ')}: with the jaws closed a positive error reads that many divisions, a negative one reads N − m with the main scale at 0, and −(N − reading) × L.C. recovers it`);
}

/* ── 3 · Screw gauge: the divisions at the datum line ──────────────────────────────────────── */
for (const g of Object.values(SCREWS)) {
  near(g.lc, g.pitch / g.n, 1e-12, `L.C. of ${g.id} = pitch / N`);
  let wrong = 0;
  for (let gap = 0.02; gap < 6; gap += 0.0071) {
    const e = g.zeroDiv * g.lc; const d = screwDisplay(g, gap, e); const pos = gap + e;
    /* The thimble has turned through pos/pitch revolutions: the circular division at the datum is the fractional part, in divisions. */
    const frac = ((((pos / g.pitch) % 1) + 1) % 1) * g.n;
    const want = Math.round(frac) % g.n;
    if (d.csr !== want) wrong += 1;
    assert.ok(Math.abs(d.observed - pos) <= g.lc / 2 + 1e-9, `${g.id} within half a division`);
    if (!d.negative) near(d.psr, Math.floor(pos / g.pitch + (Math.round(frac) >= g.n ? 1 : 0) + 1e-9) * g.pitch, 1e-9, 'pitch scale reading');
  }
  assert.equal(wrong, 0, `${g.id}: the circular division at the datum is the fractional revolution × N`);
}
ok.push('screw gauge (pitch 0.5 mm / 50 divisions, 1 mm / 100, and an old 0.5 mm one): L.C. = pitch / N; the circular division at the datum is the fraction of a revolution the thimble has turned × N, and the sleeve reading is the whole pitches before it');

/* ── 4 · The specimen between the jaws ─────────────────────────────────────────────────────────── */
{
  const hard = restGap(18, 21.4, 0); assert.ok(hard.gap === 21.4 && hard.gripped, 'closing on a hard body: the jaws stop at its width, whatever the screw is asked to do');
  const loose = restGap(23, 21.4, 0); assert.ok(loose.loose && loose.gap === 23, 'a loose body: the reading is of the jaws');
  const soft = restGap(0.1, 0.08 * 10, 0.12); near(soft.gap, 0.8 * 0.88, 1e-9, 'a soft body is squeezed up to its compliance'); assert.ok(soft.squeezed > 0);
  near(radiusFromSagitta(sagitta(225, 40), 40), 225, 1e-9, 'R = l²/6h + h/2 recovers R from the sagitta it makes');
  near(sagitta(225, 40), 40 * 40 / (6 * 225) + (40 * 40 / (6 * 225)) ** 2 / (2 * 225) * 0 , 5e-3, 'h ≈ l²/6R');
  ok.push('a hard body stops the jaws at its width; a loose one is not what the scale reads; a soft one squeezes up to its compliance when the jaws are driven on; the spherometer relation R = l²/6h + h/2 is the exact inverse of the cap\'s sagitta');
}

/* ── 5 · Spherometer scales ───────────────────────────────────────────────────────────────── */
for (const sp of Object.values(SPHEROMETERS)) {
  for (let y = 0.3; y < 5; y += 0.0113) {
    const d = spheroDisplay(sp, y);
    near(d.reading, y, sp.lc / 2 + 1e-9, `${sp.id} reading`);
    assert.ok(d.disc >= 0 && d.disc < sp.n);
  }
}
ok.push('spherometer: the vertical scale and the disc together read the screw tip to within half a least count, for pitches 1 mm and 0.5 mm');

console.log('\nshared/measure VERIFIED\n');
ok.forEach((line, i) => console.log(` ${String(i + 1).padStart(2)}. ${line}`));
console.log(`\n${ok.length} checks passed.\n`);
