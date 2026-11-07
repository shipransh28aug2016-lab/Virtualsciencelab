// Shared helpers for the CBSE engine: seedable RNG, number formatting, bilingual helpers, mark allocation.

/** @param {string|number} s @returns {number} 32-bit hash */
export function hashSeed(s) {
  let h = 2166136261 >>> 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Seedable PRNG (mulberry32) with helpers.
 * @param {string|number} seed
 */
export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  const base = a;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    seed: base,
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    float: (lo, hi, dp = 1) => +(lo + next() * (hi - lo)).toFixed(dp),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const x = arr.slice();
      for (let i = x.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [x[i], x[j]] = [x[j], x[i]];
      }
      return x;
    },
    pickN: (arr, n) => r.shuffle(arr).slice(0, n),
    fork: (label) => makeRng(hashSeed(base + ':' + label)),
  };
  return r;
}

const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
export const sup = (n) => String(n).split('').map((c) => SUP[c] || c).join('');

/** Format a number to `sig` significant figures, scientific for very large/small. */
export function fmt(v, sig = 3) {
  if (!isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    let e = Math.floor(Math.log10(a));
    let m = +(v / 10 ** e).toPrecision(sig);
    if (Math.abs(m) >= 10) { m = +(m / 10).toPrecision(sig); e++; }
    return `${m} × 10${sup(e)}`;
  }
  return String(+v.toPrecision(sig));
}

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
/** Format a/b as reduced fraction string. */
export function fracStr(n, d) {
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d); n /= g; d /= g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** Indian digit grouping for rupee amounts. */
export function rs(n) {
  const neg = n < 0; n = Math.round(Math.abs(n));
  let s = String(n);
  if (s.length > 3) { const last = s.slice(-3); let rest = s.slice(0, -3); rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ','); s = rest + ',' + last; }
  return (neg ? '-' : '') + '₹' + s;
}

/** bilingual pair */
export const bi = (en, hi) => ({ en, hi });
export const pick2 = (o, lang) => (lang === 'hi' ? o.hi : o.en);

/**
 * Allocate `total` marks (in 0.5 steps) across answer points.
 * @param {{en:string,hi:string}[]} points
 * @param {number} total
 * @returns {{point:{en:string,hi:string}, marks:number}[]}
 */
export function allocMarks(points, total) {
  const units = Math.round(total * 2);
  let pts = points.slice();
  if (pts.length > units) {
    // merge trailing points so each carries at least 0.5 mark
    const head = pts.slice(0, units - 1);
    const tail = pts.slice(units - 1);
    head.push({ en: tail.map((p) => p.en).join('; '), hi: tail.map((p) => p.hi).join('; ') });
    pts = head;
  }
  if (!pts.length) pts = [{ en: 'Correct answer', hi: 'सही उत्तर' }];
  const n = pts.length;
  const base = Math.floor(units / n);
  let rem = units - base * n;
  return pts.map((p, i) => {
    const u = base + (i >= n - rem ? 1 : 0); // give leftovers to the last (final answer) steps
    return { point: p, marks: u / 2 };
  });
}

export const sumMarks = (scheme) => Math.round(scheme.reduce((s, x) => s + x.marks, 0) * 100) / 100;

/** Normalise stem for duplicate detection. */
export const stemKey = (t) => String(t || '').toLowerCase().replace(/[\s​]+/g, ' ').replace(/[0-9.,]+/g, '#').replace(/[^\p{L}\p{N}# ]/gu, '').trim();

export const DEV = /[ऀ-ॿ]/;
export const hasDevanagari = (s) => DEV.test(String(s || ''));
