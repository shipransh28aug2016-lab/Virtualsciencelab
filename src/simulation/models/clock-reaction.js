/**
 * MODEL: The iodine clock reaction — XII-CHE-B02
 * CBSE Class XII Chemistry (043) 2026-27, Practicals Section B, Experiment 2:
 * "reaction rates of iodide ion with hydrogen peroxide" (the classic
 * Landolt/iodine-clock variant used here).
 *
 *   H2O2 + 2I⁻ + 2H⁺ → I2 + 2H2O                 (slow, rate-determining)
 *   I2 + 2S2O3²⁻ → 2I⁻ + S4O6²⁻                   (fast, instantaneous)
 *
 * A fixed small amount of thiosulphate (and starch indicator) is included
 * with the iodide. Iodine is produced steadily but is mopped up instantly
 * by the thiosulphate — UNTIL the thiosulphate is used up, at which point
 * free iodine appears all at once and the starch turns blue-black. The
 * "clock time" is inversely proportional to the initial rate, so 1/t is
 * used as the rate exactly as in the thiosulphate-HCl kinetics model.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { linearFit, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XII-CHE-B02',
  formula: 'Rate = k[I⁻]^m[H2O2]^n; clock time t ∝ 1/rate (fixed thiosulphate "clock")',
  unitSystem: 'mol/L, seconds',
  assumptions: ['The thiosulphate present is small enough to be consumed well before the main reaction is complete', 'Temperature is held constant during a comparison of concentrations', 'The colour change (colourless → blue-black) is sudden and easily timed'],
  validRange: 'KI 0.005-0.05 M; H2O2 0.1-0.5 M (as mixed)',
  edgeCases: ['Doubling [I⁻] halves the clock time if the reaction is first order in I⁻', 'A 10 °C rise in temperature roughly halves the clock time, typical of Ea around 40-50 kJ/mol'],
  expectedBehaviour: ['1/t is proportional to [I⁻] at fixed [H2O2] (order 1 in iodide)', 'The colour appears abruptly, not gradually — the signature of a clock reaction'],
};

export const STOCK_KI_M = 0.1;
export const STOCK_H2O2_M = 1.0;
export const THIO_MM = 2.0; // fixed millimolar thiosulphate "clock" amount
export const R_GAS = 8.314;
export const EA_JMOL = 42000;
export const A_FACTOR = 4.2e5;

export const defaults = { kiVolume: 10, waterVolume: 10, h2o2Volume: 10, tempC: 25 };

export function iodideConc(inputs) { const total = inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume; return (STOCK_KI_M * inputs.kiVolume) / total; }
export function peroxideConc(inputs) { const total = inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume; return (STOCK_H2O2_M * inputs.h2o2Volume) / total; }
export function rateConstant(inputs) { return A_FACTOR * Math.exp(-EA_JMOL / (R_GAS * (inputs.tempC + 273.15))); }
export function clockTimeS(inputs) {
  const k = rateConstant(inputs);
  const rate = k * iodideConc(inputs) * peroxideConc(inputs); // rate of I2 production, mol/L/s
  const thioMolL = THIO_MM / 1000;
  // Time for enough I2 to form to exhaust the thiosulphate (1 mol I2 per 2 mol thiosulphate).
  return thioMolL / 2 / rate;
}

export function validate(inputs) {
  const warnings = [];
  if (inputs.kiVolume + inputs.waterVolume + inputs.h2o2Volume !== 30) {
    warnings.push({ field: 'waterVolume', code: 'VOLUME_NOT_CONSTANT', message: 'Keep KI + water + H₂O₂ at a constant total volume (usually 30 mL).', why: 'A fixed total volume means only the concentration you are testing changes between runs.' });
  }
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, running: false, elapsed: 0, progress: 0, blue: 0, finishedAt: null }; }
/**
 * The iodine clock. Thiosulphate holds the iodine as fast as it is made,
 * so nothing at all appears -- and then, the instant the thiosulphate is
 * exhausted, free iodine hits the starch and the whole flask goes blue-black
 * at once. That sudden switch after a quiet induction period is the point
 * of the experiment, so the colour must stay flat and then jump.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.running || s.finishedAt) return s;
  s.elapsed += dt;
  const tClock = Math.max(0.2, clockTimeS(inputs));
  s.progress = Math.min(1, s.elapsed / tClock);
  // Flat, then a sharp rise over the last few per cent.
  s.blue = s.progress < 0.94 ? 0 : Math.min(1, (s.progress - 0.94) / 0.06);
  if (s.progress >= 1) { s.blue = 1; s.finishedAt = s.elapsed; }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 313);
  const trueTime = clockTimeS(inputs);
  const time = Number((trueTime * (1 + jitter(rng, 0.03))).toFixed(1));
  return { trial, iodideConc: sigFig(iodideConc(inputs), 4), peroxideConc: sigFig(peroxideConc(inputs), 4), tempC: inputs.tempC, time, rate: sigFig(1 / time, 6) };
}

/**
 * ONE VARIABLE PER SET.
 *
 * Two quantities can be found from this bench — the order in iodide and the
 * activation energy — and each is found by holding everything else still. The
 * model used to take whatever rows it was given: a set in which both the
 * temperature and the KI volume had moved was fitted as an Arrhenius plot,
 * `order` was asserted to be 1 without anything having measured it, and where
 * the rate plot was too scattered to give an order at all the field came back
 * null while the panel went on reporting an activation energy in its place.
 * So the design of the set decides which quantity is reported, and a set that
 * changes two things at once is refused with the reason.
 */
export function derive(rows) {
  const temps = [...new Set(rows.map((r) => Number(r.tempC)).filter(Number.isFinite))];
  const iodides = [...new Set(rows.map((r) => Number(r.iodideConc)).filter(Number.isFinite))];
  const peroxides = [...new Set(rows.map((r) => Number(r.peroxideConc)).filter(Number.isFinite))];

  if (temps.length > 1 && iodides.length > 1) {
    return {
      ok: false,
      reason: `These readings are at ${temps.length} different temperatures (${temps.join(', ')} °C) AND ${iodides.length} different iodide concentrations (${iodides.join(', ')} M). A rate is measured by moving one of them and holding the other still. Clear the table and either hold the temperature and vary the KI volume, which gives the order in iodide, or hold every volume and vary the temperature, which gives the activation energy.`,
    };
  }

  if (temps.length >= 3) {
    const pts = rows.map((r) => ({ x: 1 / (Number(r.tempC) + 273.15), y: Math.log(Number(r.rate)) }));
    const fit = linearFit(pts);
    if (!fit) return { ok: false, reason: 'Vary the temperature between readings.' };
    const Ea = -fit.slope * R_GAS / 1000;
    return {
      ok: true, mode: 'arrhenius', activationEnergy: sigFig(Ea, 4), acceptedEa: sigFig(EA_JMOL / 1000, 4),
      slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)), n: rows.length,
      points: pts.map((p) => ({ x: Number(p.x.toFixed(6)), y: Number(p.y.toFixed(4)) })),
    };
  }
  if (temps.length > 1) {
    return { ok: false, reason: `Only ${temps.length} temperatures were used. An Arrhenius plot of ln(1/t) against 1/T needs at least three, well spread apart — 10 °C between them is about right.` };
  }

  /* The order in iodide, which is only the order in iodide if the peroxide
     concentration held still. Adding KI without taking water out changes the
     total volume, so it dilutes the peroxide at the same time. */
  if (peroxides.length > 1) {
    return {
      ok: false,
      reason: `The peroxide concentration changed between runs (${peroxides.join(', ')} M), so 1/t was not responding to the iodide alone. Top up with water so that KI + water + H₂O₂ comes to the same total volume every time; then [H₂O₂] is fixed and the rate depends only on [I⁻].`,
    };
  }
  if (iodides.length < 4) {
    return { ok: false, reason: `Only ${iodides.length} different iodide concentration${iodides.length === 1 ? '' : 's'} in the table. Time the clock at four or more, keeping the total volume and the temperature the same, or vary the temperature instead for the activation energy.` };
  }

  /* The ORDER is measured, from the slope of ln(rate) against ln[I⁻], and the
     rate-against-concentration line is fitted as well because that is the
     graph the practical asks for. */
  const logFit = linearFit(rows.map((r) => ({ x: Math.log(Number(r.iodideConc)), y: Math.log(Number(r.rate)) })));
  const pts = rows.map((r) => ({ x: Number(r.iodideConc), y: Number(r.rate) }));
  const fit = linearFit(pts);
  if (!logFit || !fit) return { ok: false, reason: 'Vary the KI volume between readings.' };
  if (logFit.r2 < 0.9) {
    return { ok: false, reason: `The rates do not lie on a line on a log–log plot (r² = ${logFit.r2.toFixed(3)}), so no order can be read from them. Check that every run was timed to the same first appearance of the blue-black colour, at the same temperature and the same total volume.` };
  }
  return {
    ok: true, mode: 'concentration', order: sigFig(logFit.slope, 3), orderRounded: Math.round(logFit.slope),
    accepted: 1, logSlope: sigFig(logFit.slope, 4), logR2: Number(logFit.r2.toFixed(4)),
    activationEnergy: sigFig(EA_JMOL / 1000, 4), slope: sigFig(fit.slope, 4), r2: Number(fit.r2.toFixed(4)),
    n: pts.length, points: pts,
  };
}

export default { meta, defaults, STOCK_KI_M, STOCK_H2O2_M, THIO_MM, R_GAS, EA_JMOL, init, step, measure, derive, validate, iodideConc, peroxideConc, rateConstant, clockTimeS };
