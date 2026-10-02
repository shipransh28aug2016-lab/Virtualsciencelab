/**
 * Titration, as the physics of a flask and a burette — shared by every bench
 * that titrates something against something.
 *
 * What the chemistry does is the aqueous solver's job: the flask's content is a
 * mixture of the analyte and however much titrant has actually MIXED in, and
 * the solver finds its pH. What this module adds is what the solver does not
 * know and a bench cannot do without:
 *
 *   · titrant falls as DROPS of a fixed size, and a burette is read to a
 *     fraction of one;
 *   · a drop does not reach the whole flask at once. Until it is swirled in, it
 *     sits in a small plume under the tip whose composition is NOT the flask's,
 *     which is why the indicator flashes at the drop and fades, why a flask
 *     that is not swirled lags the burette, and why an endpoint can be
 *     overshot by a reading that was true when it was taken;
 *   · the student's data is a handful of (volume, pH) points, and the
 *     equivalence point is where those points say the curve is steepest.
 *
 * Pure: no React, no three, no store, no clock.
 */
import { mix } from '../chem/aqueous.js';

export const DROP_ML = 0.05;          // 20 drops to the mL, the standard burette tip
export const BURETTE_ML = 50;
export const PLUME_ML = 4;            // the flask's contents the fresh titrant meets first

/** Time constants (s) for fresh titrant to be blended into the whole flask. */
export const MIX_TAU = { none: 60, swirl: 1.4, stir: 0.6 };

/** Unmixed titrant after `dt` seconds of agitation: first order, as diffusion
 *  and eddy mixing both are, with a rate that swirling or a stirrer raises. */
export const relaxUnmixed = (unmixedMl, dt, agitation = 'none') => unmixedMl * Math.exp(-dt / MIX_TAU[agitation]);

/** The flask as a whole, with the titrant that has mixed into it. */
export function flaskBulk({ analyte, analyteMl, waterMl = 0, titrant, mixedMl }) {
  const parts = [{ system: analyte, volume: analyteMl }];
  if (waterMl > 0) parts.push({ system: { T: analyte.T ?? 25, strong: [], weak: [], solids: [] }, volume: waterMl });
  if (mixedMl > 0) parts.push({ system: titrant, volume: mixedMl });
  return mix(parts);
}

/** The plume: a few mL of the flask meeting the titrant that has not yet spread. */
export const flaskPlume = ({ bulk, titrant, unmixedMl }) => mix([
  { system: bulk, volume: PLUME_ML }, { system: titrant, volume: Math.max(unmixedMl, 1e-9) },
]);

/** A burette is read to a fraction of its smallest graduation. */
export const readBurette = (mL, resolution = 0.05) => Math.round(mL / resolution) * resolution;

/* ── The curve the student has drawn ─────────────────────────────────────────── */

/**
 * The finite-difference slope of a set of (V, pH) points: [[V midpoint, |ΔpH/ΔV|]].
 * Points are sorted and de-duplicated first; a student's notebook is in the
 * order they were taken, which is not always the order they were titrated.
 */
export function slopes(points) {
  const pts = [...points].filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 1; i < pts.length; i += 1) {
    const dv = pts[i][0] - pts[i - 1][0];
    if (dv > 1e-9) out.push({ V: 0.5 * (pts[i][0] + pts[i - 1][0]), lo: pts[i - 1][0], hi: pts[i][0], slope: Math.abs(pts[i][1] - pts[i - 1][1]) / dv });
  }
  return out;
}

/**
 * Where the data says the equivalence point is: the middle of the steepest
 * interval, with that interval as the honest statement of how well it is
 * known — a notebook with points 1 mL apart cannot locate it to 0.01 mL.
 */
export function steepest(points) {
  const s = slopes(points);
  if (s.length < 2) return null;
  const best = s.reduce((a, b) => (b.slope > a.slope ? b : a));
  return { V: best.V, lo: best.lo, hi: best.hi, width: best.hi - best.lo, slope: best.slope };
}

/** Stoichiometric equivalence for a 1:ratio reaction (ratio = mol titrant per mol analyte). */
export const equivalenceMl = ({ analyteMl, analyteC, titrantC, ratio = 1 }) => (ratio * analyteC * analyteMl) / titrantC;

/** Concentration of the analyte, from a titre: the arithmetic the worksheet asks for. */
export const analyteFromTitre = ({ titreMl, analyteMl, titrantC, ratio = 1 }) => (titrantC * titreMl) / (ratio * analyteMl);
