/**
 * Seeded pseudo-random number generator + measurement-noise helper.
 *
 * Every simulation model uses this instead of Math.random() so that a
 * student's exact run — every "random" scatter in every reading — can be
 * reproduced deterministically from the seed. A teacher can therefore load
 * the same seed and see exactly the numbers the student saw.
 *
 * Algorithm: mulberry32. It is not cryptographic; it does not need to be.
 * It needs to be fast, seedable, and to pass basic statistical smell tests
 * for the small samples (tens of readings) a lab bench ever draws.
 */

/**
 * Build a seeded RNG function. Call it repeatedly; each call returns a new
 * pseudo-random float in [0, 1).
 * @param {number} seed
 * @returns {() => number}
 */
export function makeRng(seed) {
  let s = (Number(seed) | 0) || 1;
  return function rng() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A small, roughly bell-shaped random offset, the way a real instrument
 * reading scatters around the true value. Built from the sum of three
 * uniform draws (an Irwin–Hall approximation to a normal distribution)
 * rather than a single uniform draw, so most readings land close to the
 * true value and only occasionally scatter to the edge — like a real
 * student's hand and eye, not like static.
 *
 * @param {() => number} rng  a generator returned by makeRng()
 * @param {number} scale      the typical (roughly one standard-deviation) size of the scatter
 * @returns {number} an offset, usually within about ±1.5×scale
 */
export function jitter(rng, scale = 1) {
  const u = rng() + rng() + rng() - 1.5; // range -1.5..+1.5, bell-shaped
  return u * (scale / 0.87); // scaled so the RMS offset is close to `scale`
}

/** A single uniform draw in [lo, hi). Handy for choosing among discrete options. */
export function uniform(rng, lo = 0, hi = 1) {
  return lo + rng() * (hi - lo);
}

/** A random integer in [lo, hi], inclusive. */
export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}
