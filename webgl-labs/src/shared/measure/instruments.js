/**
 * Measuring instruments: vernier callipers, screw gauge and spherometer — the scales, the reading a
 * student takes from each, and what the instrument itself does to the number. Pure: no React, no three.
 *
 * What the scene and the interface show is a PHYSICAL state — how far apart the jaws are — and what the
 * scales then say follows from it: the vernier line that lines up with a main-scale line, the circular
 * division at the datum line. The zero error is a property of the instrument (it is what the scale says
 * with the jaws closed) and is not given away; backlash and parallax are what they are in a worn
 * instrument and a careless eye. The unit of length here is the millimetre.
 */

/* ── Vernier callipers ───────────────────────────────────────────────────── */

/** n vernier divisions span n−1 main divisions of 1 mm: least count 1/n mm. */
export const VERNIERS = {
  vc10: { id: 'vc10', n: 10, msd: 1, lc: 0.1, label: '10 divisions (L.C. 0.01 cm)', zeroDiv: 2, backlash: 0.02 },
  vc20: { id: 'vc20', n: 20, msd: 1, lc: 0.05, label: '20 divisions (L.C. 0.005 cm)', zeroDiv: -3, backlash: 0.02 },
  vc50: { id: 'vc50', n: 50, msd: 1, lc: 0.02, label: '50 divisions (L.C. 0.002 cm)', zeroDiv: 4, backlash: 0.03 },
};

/**
 * What the two scales show when the jaws are `gap` mm apart and the instrument has zero error `e` mm
 * (its reading with the jaws closed). `pos` is where the vernier zero stands against the main scale; the
 * student reads the main-scale division to its left (MSR) and the vernier line that coincides (VSR).
 * With a negative zero error and the jaws closed the vernier zero is left of the main zero: the main scale
 * reads 0 and the coinciding line is the (n − m)th, m divisions being the error.
 */
export function vernierDisplay(v, gap, e, { parallax = 0 } = {}) {
  const pos = gap + e;
  const negative = pos < -v.lc / 2;
  const idx = Math.floor(pos / v.msd + 1e-9);
  const frac = pos - idx * v.msd;
  /* The eye, off the line of sight, sees a vernier line displaced against the main scale: parallax is in vernier divisions. */
  const k0 = Math.round(frac / v.lc + parallax);
  let msr = Math.max(0, idx) * v.msd; const k = ((k0 % v.n) + v.n) % v.n;
  if (!negative && k0 >= v.n) msr = (idx + 1) * v.msd;
  if (negative) msr = 0;
  const observed = negative ? -((v.n - k) % v.n) * v.lc : msr + k * v.lc;
  return { msr, vsr: k, observed, pos, negative };
}

/** The number a student gets from what they read: MSR + VSR × L.C. (or, with the vernier zero left of the main zero, −(n − VSR) × L.C.). */
export const vernierObserved = (v, msr, vsr, negative = false) => (negative ? -((v.n - vsr) % v.n) * v.lc : msr + vsr * v.lc);

/* ── Screw gauge ────────────────────────────────────────────────────────── */

export const SCREWS = {
  sg50: { id: 'sg50', pitch: 0.5, n: 50, lc: 0.01, label: 'pitch 0.5 mm, 50 divisions (L.C. 0.01 mm)', zeroDiv: -3, backlash: 0.012 },
  sg100: { id: 'sg100', pitch: 1, n: 100, lc: 0.01, label: 'pitch 1 mm, 100 divisions (L.C. 0.01 mm)', zeroDiv: 2, backlash: 0.012 },
  sg50f: { id: 'sg50f', pitch: 0.5, n: 50, lc: 0.01, label: 'pitch 0.5 mm, 50 divisions — an old one', zeroDiv: 5, backlash: 0.05 },
};

/** The sleeve (pitch) scale reading and the circular (head) division at the datum line. */
export function screwDisplay(g, gap, e, { parallax = 0, lost = 0 } = {}) {
  const pos = gap + e + lost;
  const negative = pos < -g.lc / 2;
  const idx = Math.floor(pos / g.pitch + 1e-9);
  const frac = pos - idx * g.pitch;
  const k0 = Math.round(frac / g.lc + parallax);
  let psr = Math.max(0, idx) * g.pitch; const k = ((k0 % g.n) + g.n) % g.n;
  if (!negative && k0 >= g.n) psr = (idx + 1) * g.pitch;
  if (negative) psr = 0;
  const observed = negative ? -((g.n - k) % g.n) * g.lc : psr + k * g.lc;
  return { psr, csr: k, observed, pos, negative };
}
export const screwObserved = (g, psr, csr, negative = false) => (negative ? -((g.n - csr) % g.n) * g.lc : psr + csr * g.lc);

/* ── Spherometer ────────────────────────────────────────────────────────── */

export const SPHEROMETERS = {
  sp100: { id: 'sp100', pitch: 1, n: 100, lc: 0.01, legMm: 40, label: 'pitch 1 mm, 100 divisions (L.C. 0.01 mm)', backlash: 0.01 },
  sp50: { id: 'sp50', pitch: 0.5, n: 50, lc: 0.01, legMm: 40, label: 'pitch 0.5 mm, 50 divisions (L.C. 0.01 mm)', backlash: 0.01 },
  spWide: { id: 'spWide', pitch: 1, n: 100, lc: 0.01, legMm: 50, label: 'a wide spherometer: pitch 1 mm, 100 divisions, legs about 50 mm apart', backlash: 0.015 },
};

/** The vertical scale (whole pitches) and the disc division when the screw tip is at `y` mm. */
export function spheroDisplay(sp, y, { parallax = 0, lost = 0 } = {}) {
  const pos = Math.max(0, y + lost);
  const turns = Math.floor(pos / sp.pitch + 1e-9);
  const frac = pos - turns * sp.pitch;
  let k = Math.round(frac / sp.lc + parallax);
  let t = turns;
  if (k >= sp.n) { k -= sp.n; t += 1; } else if (k < 0) { k += sp.n; t -= 1; }
  return { turns: t, disc: k, reading: t * sp.pitch + k * sp.lc, pos };
}

/** The sagitta of a spherical cap over an equilateral triangle of legs l: h = R − √(R² − l²/3), and R = l²/(6h) + h/2 back again. */
export const sagitta = (R, l) => R - Math.sqrt(R * R - (l * l) / 3);
export const radiusFromSagitta = (h, l) => (l * l) / (6 * h) + h / 2;

/* ── Backlash and the direction of travel ──────────────────────────────── */

/**
 * A screw that was last turned one way and is now turned the other loses `backlash` mm of travel before it bites: the
 * scale moves and the jaws do not. `dir` is −1, 0 or +1 for the direction of the last move.
 */
export const lostMotion = (instrument, lastDir, dir) => (dir !== 0 && lastDir !== 0 && dir !== lastDir ? instrument.backlash : 0);

/* ── The specimen between the jaws ──────────────────────────────────── */

/**
 * Where the jaws come to rest on a specimen of width w. Hard bodies stop the jaws at w; a soft one (rubber, paper)
 * can be squeezed up to `compliance` of its width if the jaws are driven on. `opening` is where the screw or slide has been
 * put, so a gap larger than w means the specimen is loose.
 */
export function restGap(opening, w, compliance = 0) {
  if (opening >= w) return { gap: opening, gripped: opening - w < 0.02 * Math.max(0.5, w) && opening - w < 0.15, loose: opening - w >= 0.02 * Math.max(0.5, w) };
  return { gap: Math.max(opening, w * (1 - compliance)), gripped: true, loose: false, squeezed: Math.max(0, w - Math.max(opening, w * (1 - compliance))) };
}
