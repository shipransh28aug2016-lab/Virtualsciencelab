/**
 * XI-PHY-A02 — the screw gauge: the diameter of a wire and the thickness of a sheet. The instrument, its pitch and
 * least count, the zero error, the backlash and the ratchet are the shared measure kit's; this file says what is
 * between the faces.
 *
 * A wire is not a perfect cylinder — it is a few thousandths of a millimetre out of round, and it drifts along its
 * length — and paper is soft: turn the thimble on against it and the faces squeeze it, which is why there is a
 * ratchet.
 */
import { createMeasure } from '../../../../../shared/measure/createMeasure.js';
import { SCREWS } from '../../../../../shared/measure/instruments.js';

const SPECIMENS = {
  wire: {
    label: 'Copper wire', look: 'enamelled copper wire, about 0.4 mm across', shape: 'wire', color: '#b87333',
    dims: { diameter: { label: 'Diameter', mm: 0.412, type: 'outer', ovality: 0.006, drift: [0.0, 0.004, -0.003, 0.005], theta0: 30, compliance: 0, hint: 'Across the wire, between the faces' } },
  },
  thickWire: {
    label: 'Iron wire', look: 'a stiff iron wire, about 1.6 mm across', shape: 'wire', color: '#8f98a6',
    dims: { diameter: { label: 'Diameter', mm: 1.623, type: 'outer', ovality: 0.009, drift: [0.0, 0.006, -0.005, 0.004], theta0: 80, compliance: 0, hint: 'Across the wire, between the faces' } },
  },
  sheet: {
    label: 'Metal sheet', look: 'a thin aluminium sheet, about 0.25 mm', shape: 'sheet', color: '#b9c2cf',
    dims: { thickness: { label: 'Thickness', mm: 0.253, type: 'outer', ovality: 0, drift: [0.0, 0.004, -0.005, 0.003], theta0: 0, compliance: 0.012, hint: 'Through the sheet, between the faces' } },
  },
  paper: {
    label: 'Sheet of paper', look: 'a sheet of ordinary paper, soft and thin', shape: 'stack', color: '#f4f1e8',
    dims: { thickness: { label: 'Thickness', mm: 0.092, type: 'outer', ovality: 0, drift: [0.0, 0.003, -0.004, 0.002], theta0: 0, compliance: 0.18, hint: 'Paper squeezes: use the ratchet' } },
  },
};

const area = (d) => (Math.PI * d * d) / 4;
const nom = (id, dim) => SPECIMENS[id].dims[dim].mm;

export const CFG = {
  code: 'XI-PHY-A02',
  title: 'Screw gauge: diameter of a wire and thickness of a sheet',
  subtitle: 'CBSE Class XI · Measurement · pitch, least count, zero error and the ratchet — the instrument is ten times finer than callipers and ten times easier to misuse',
  kind: 'screw',
  instruments: SCREWS, defaultInstrument: 'sg50', instrumentShort: { sg50: '0.5 mm / 50', sg100: '1 mm / 100', sg50f: 'old 0.5 / 50' }, instrumentLabel: 'Screw gauge',
  specimens: SPECIMENS,
  maxOpening: 25, openingStep: 0.05, majorMax: 25, majorStep: 0.5,
  camera: { position: [1.5, 2.0, 7.0], fov: 34, target: [0.75, 1.1, 0], min: 1.5, max: 11, polar: [0.5, Math.PI / 2.05] },
  windowLabel: 'screw gauge', rim: 'thimble',
  /** The area of cross-section from the mean diameter, with the error the least count and the scatter allow; the thickness of the sheets. */
  result: (groups) => {
    const out = [];
    const w = groups['wire/diameter']; const t = groups['thickWire/diameter']; const s = groups['sheet/thickness']; const p = groups['paper/thickness'];
    if (w) out.push({ label: 'Area of cross-section of the copper wire, πd²/4', value: area(w.mean), unit: 'mm²', dp: 4, err: area(w.mean) * 2 * (w.err / w.mean), actual: area(nom('wire', 'diameter')) });
    if (t) out.push({ label: 'Area of cross-section of the iron wire, πd²/4', value: area(t.mean), unit: 'mm²', dp: 3, err: area(t.mean) * 2 * (t.err / t.mean), actual: area(nom('thickWire', 'diameter')) });
    if (s) out.push({ label: 'Thickness of the metal sheet', value: s.mean, unit: 'mm', dp: 3, err: s.err, actual: nom('sheet', 'thickness') });
    if (p) out.push({ label: 'Thickness of the paper', value: p.mean, unit: 'mm', dp: 3, err: p.err, actual: nom('paper', 'thickness') });
    return out;
  },
};

export const useScrew = createMeasure(CFG);
