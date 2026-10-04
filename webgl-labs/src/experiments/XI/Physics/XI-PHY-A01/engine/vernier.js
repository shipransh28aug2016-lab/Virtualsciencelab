/**
 * XI-PHY-A01 — vernier callipers: the diameter of a sphere and of a cylinder, the length of the cylinder, the
 * internal diameter and depth of a beaker, and the volume of each. The instrument, the zero error, the
 * parallax and the backlash are the shared measure kit's; this file says what is between the jaws.
 *
 * The specimens are not perfect: each dimension drifts from place to place (a tenth of a division or so) and the round
 * ones are a little out of round (a few hundredths of a millimetre), so that a student who measures in one place and
 * one direction finds a number, and one who measures in four finds how good that number is.
 */
import { createMeasure } from '../../../../../shared/measure/createMeasure.js';
import { VERNIERS } from '../../../../../shared/measure/instruments.js';

const SPECIMENS = {
  sphere: {
    label: 'Steel sphere', look: 'a polished steel ball, about 2 cm across', shape: 'sphere',
    dims: { diameter: { label: 'Diameter', mm: 21.4, type: 'outer', ovality: 0.025, drift: [0.0, 0.015, -0.01, 0.02], theta0: 25, compliance: 0, hint: 'Between the lower jaws' } },
  },
  cylinder: {
    label: 'Brass cylinder', look: 'a brass cylinder, a rod cut off square', shape: 'cylinder',
    dims: {
      diameter: { label: 'Diameter', mm: 18.62, type: 'outer', ovality: 0.03, drift: [0.0, 0.02, -0.015, 0.01], theta0: 70, compliance: 0, hint: 'Between the lower jaws, across the rod' },
      length: { label: 'Length', mm: 36.44, type: 'outer', ovality: 0.0, drift: [0.0, 0.03, -0.02, 0.015], theta0: 0, compliance: 0, hint: 'Between the lower jaws, along the rod' },
    },
  },
  beaker: {
    label: 'Glass beaker', look: 'a 100 mL glass beaker', shape: 'beaker',
    dims: {
      internal: { label: 'Internal diameter', mm: 41.3, type: 'inner', ovality: 0.06, drift: [0.0, 0.03, -0.04, 0.02], theta0: 40, compliance: 0, hint: 'With the upper jaws, against the inside of the glass' },
      depth: { label: 'Depth', mm: 62.28, type: 'inner', ovality: 0.0, drift: [0.0, 0.04, -0.03, 0.02], theta0: 0, compliance: 0, hint: 'With the thin strip at the tail, to the bottom' },
    },
  },
};

const mean = (g) => g?.mean;
const rel = (g) => (g ? g.err / g.mean : 0);

export const CFG = {
  code: 'XI-PHY-A01',
  title: 'Vernier callipers: diameter, internal diameter, depth and volume',
  subtitle: 'CBSE Class XI · Measurement · the zero error is in the instrument; the reading, the specimen and the eye are yours',
  kind: 'vernier',
  instruments: VERNIERS, defaultInstrument: 'vc10', instrumentShort: { vc10: '10 div', vc20: '20 div', vc50: '50 div' }, instrumentLabel: 'Vernier callipers',
  specimens: SPECIMENS,
  maxOpening: 80, majorMax: 100, majorStep: 1,
  camera: { position: [1.7, 1.95, 5.7], fov: 34, target: [0.65, 1.0, 0], min: 1.2, max: 9, polar: [0.5, Math.PI / 2.05] },
  /** Volumes from the mean dimensions, with the error that the spread of the readings allows. */
  result: (groups) => {
    const out = [];
    const d = groups['sphere/diameter']; const dc = groups['cylinder/diameter']; const L = groups['cylinder/length']; const di = groups['beaker/internal']; const dp = groups['beaker/depth'];
    const V = (x) => Math.PI * (x / 10) ** 3 / 6;
    const nom = (id, dim) => SPECIMENS[id].dims[dim].mm;
    if (d) out.push({ label: 'Volume of the sphere, πd³/6', value: V(d.mean), unit: 'cm³', dp: 2, err: V(d.mean) * 3 * rel(d), actual: V(nom('sphere', 'diameter')) });
    if (dc && L) out.push({ label: 'Volume of the cylinder, πd²L/4', value: (Math.PI * (dc.mean / 10) ** 2 * (L.mean / 10)) / 4, unit: 'cm³', dp: 2, err: ((Math.PI * (dc.mean / 10) ** 2 * (L.mean / 10)) / 4) * Math.hypot(2 * rel(dc), rel(L)), actual: (Math.PI * (nom('cylinder', 'diameter') / 10) ** 2 * (nom('cylinder', 'length') / 10)) / 4 });
    if (di && dp) out.push({ label: 'Volume of the beaker, πd²h/4', value: (Math.PI * (di.mean / 10) ** 2 * (dp.mean / 10)) / 4, unit: 'cm³', dp: 1, err: ((Math.PI * (di.mean / 10) ** 2 * (dp.mean / 10)) / 4) * Math.hypot(2 * rel(di), rel(dp)), actual: (Math.PI * (nom('beaker', 'internal') / 10) ** 2 * (nom('beaker', 'depth') / 10)) / 4 });
    void mean;
    return out;
  },
};

export const useVernier = createMeasure(CFG);
