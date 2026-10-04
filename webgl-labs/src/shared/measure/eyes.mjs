/**
 * eyes.mjs — for the probes: read the reading window the way a student does, from the picture alone.
 *
 * The scales are drawn from the instrument's physical state and the numbers on the bench are computed from the
 * same state; a probe that read the numbers back would prove nothing about the picture. These helpers take
 * the geometry of the lines actually on the screen and do what the procedure says: find the vernier line that sits
 * on a main-scale line (moving the lens along a long vernier), find the main-scale division the vernier zero has
 * passed, find the circular division at the datum line.
 */

const snap = (kit) => kit.page.evaluate(() => {
  const svg = document.querySelector('[data-probe="reading-window"]');
  if (!svg) return null;
  const n = (e, a) => Number(e.getAttribute(a));
  return {
    kind: svg.dataset.kind, px: Number(svg.dataset.px) || 0, edge: Number(svg.dataset.edge),
    ticks: [...svg.querySelectorAll('line[data-mm]')].map((l) => ({ mm: n(l, 'data-mm'), x: n(l, 'x1') })),
    vern: [...svg.querySelectorAll('line[data-k]')].map((l) => ({ k: n(l, 'data-k'), x: n(l, 'x1') })),
    circ: [...svg.querySelectorAll('line[data-div]')].map((l) => ({ k: n(l, 'data-div'), y: n(l, 'y1') })),
  };
});

/**
 * Where the vernier zero stands against the main scale, in mm, from one look (the lens at the zero end): the cheap way to see whether the
 * slide is still moving while the jaws are being closed on a specimen.
 */
export async function seeZero(kit) {
  const probe = await kit.page.evaluate(() => document.querySelector('[data-control="lens"] input[type=range]') !== null);
  if (probe) await kit.slider('lens', 0);
  await kit.frames(2);
  const s = await snap(kit);
  const px = s.px || 29;
  const zero = s.vern.find((v) => v.k === 0);
  const ticks = s.ticks.slice().sort((a, b) => a.x - b.x);
  const left = ticks.filter((t) => t.x <= zero.x + 0.05);
  if (left.length) return left.at(-1).mm + (zero.x - left.at(-1).x) / px;
  return ticks[0].mm - (ticks[0].x - zero.x) / px;
}

/**
 * Vernier: { msr, vsr, negative, observed } as the picture shows it. `inst` is the instrument's { n, lc, msd };
 * a long vernier (more than 20 divisions) is scanned with the lens, which the bench offers as the `lens` slider.
 */
export async function seeVernier(kit, inst, { W = 640 } = {}) {
  const long = inst.n > 20;
  if (long) await kit.slider('lens', 0);
  await kit.frames(3);
  let s = await snap(kit);
  const px = s.px || 29;
  const zero = s.vern.find((v) => v.k === 0);
  const ticksAt0 = s.ticks.slice().sort((a, b) => a.x - b.x);
  const best = new Map();
  const consider = (shot) => {
    for (const v of shot.vern) {
      if (v.x < px / 2 || v.x > W - px / 2) continue;
      const d = Math.min(...shot.ticks.map((t) => Math.abs(t.x - v.x)));
      if (!best.has(v.k) || d < best.get(v.k)) best.set(v.k, d);
    }
  };
  consider(s);
  if (long) {
    const span = W / px; const length = inst.n * (inst.msd - inst.lc);
    for (let at = span - 4; at < length + 1; at += span - 4) { await kit.slider('lens', Math.min(at, length)); await kit.frames(3); s = await snap(kit); consider(s); }
    await kit.slider('lens', 0); await kit.frames(3);
  }
  let k = -1; let dmin = Infinity;
  for (const [kk, d] of best) if (d < dmin - 1e-9) { dmin = d; k = kk; }
  if (k < 0 || !zero) throw new Error('the picture shows no coinciding vernier line');
  const left = ticksAt0.filter((t) => t.x <= zero.x + 0.05);
  const nearest = ticksAt0.reduce((a, b) => (Math.abs(b.x - zero.x) < Math.abs(a.x - zero.x) ? b : a));
  let msr; let negative = false;
  if (k === 0) msr = nearest.mm;
  else if (!left.length) { msr = 0; negative = true; } else msr = left.at(-1).mm;
  const observed = negative ? -((inst.n - k) % inst.n) * inst.lc : msr + k * inst.lc;
  return { msr, vsr: k, negative, observed, gap: dmin };
}

/**
 * Screw gauge / spherometer: the last sleeve division uncovered by the thimble, and the circular division at the datum line.
 * No sleeve division showing at all means the thimble has gone past the zero: a negative reading.
 */
export async function seeScrew(kit, inst) {
  await kit.frames(3);
  const s = await snap(kit);
  const datum = 96;
  const c = s.circ.reduce((a, b) => (Math.abs(b.y - datum) < Math.abs(a.y - datum) ? b : a));
  const ticks = s.ticks.slice().sort((a, b) => a.x - b.x);
  const negative = !ticks.length;
  let major = ticks.length ? ticks.at(-1).mm : 0;
  /* A division within a pixel or two of the thimble's edge is a tease: it may be just uncovered or just covered. The circular scale settles it, as it does at the bench: a high division says the sleeve line is not really clear yet. */
  if (ticks.length > 1 && Math.abs(ticks.at(-1).x - s.edge) < 2 && c.k > inst.n / 2) major = ticks.at(-2).mm;
  const observed = negative ? -((inst.n - c.k) % inst.n) * inst.lc : major + c.k * inst.lc;
  return { psr: major, csr: c.k, negative, observed };
}
