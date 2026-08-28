/**
 * MODEL: Change in level of a liquid in a container on heating — XI-PHY-ACT-B3
 * CBSE Class XI Physics (042) 2026-27, Practicals Section B, Activity 3.
 * Apparent expansivity (what the level shows) = real expansivity of the
 * liquid minus the expansivity of the vessel; the level first DIPS because
 * the vessel warms (and so expands) before the liquid inside it does.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { fitThroughOrigin, sigFig, sciText } from '../../utils/measure.js';

export const meta = {
  id: 'XI-PHY-ACT-B3',
  formula: 'ΔV = V0·γ_apparent·ΔT; γ_real = γ_apparent + γ_vessel',
  unitSystem: 'Per kelvin; volumes in cm³, level in mm',
  assumptions: ['The flask and liquid are heated uniformly', 'The stem has a uniform, known bore', 'The initial dip (vessel expanding first) is a real, not spurious, effect'],
  validRange: 'Temperature rise 0-80 °C',
  edgeCases: ['A liquid with a small real expansivity can show an apparent CONTRACTION if the vessel expansivity is not subtracted'],
  expectedBehaviour: ['The level dips briefly, then rises steadily with ΔT', 'Correcting for the vessel raises the apparent value to the true one'],
};

export const LIQUIDS = { water: { label: 'Water', gammaReal: 0.000207 }, alcohol: { label: 'Ethanol', gammaReal: 0.00110 }, glycerine: { label: 'Glycerine', gammaReal: 0.00050 }, mercury: { label: 'Mercury', gammaReal: 0.000182 } };
export const VESSELS = { glass: { label: 'Soda glass flask', gamma: 0.000025 }, pyrex: { label: 'Pyrex flask', gamma: 0.00001 }, steel: { label: 'Steel vessel', gamma: 0.000035 } };
export const STEMS = { narrow: { label: 'Narrow stem (1 mm bore)', boreMm: 1 }, medium: { label: 'Medium stem (2 mm bore)', boreMm: 2 }, wide: { label: 'Wide stem (4 mm bore)', boreMm: 4 } };

export const defaults = { liquid: 'water', vessel: 'glass', stem: 'wide', volumeCm3: 150, deltaTempC: 40, correctForVessel: true };

export function liquidOf(inputs) { return LIQUIDS[inputs.liquid] || LIQUIDS.water; }
export function vesselOf(inputs) { return VESSELS[inputs.vessel] || VESSELS.glass; }
export function gammaApparent(inputs) { return liquidOf(inputs).gammaReal - vesselOf(inputs).gamma; }

export function boreAreaCm2(inputs) {
  const bore = (STEMS[inputs.stem] || STEMS.wide).boreMm / 10; // cm
  return Math.PI * (bore / 2) ** 2;
}
export function levelRiseMm(inputs) {
  const dV = inputs.volumeCm3 * gammaApparent(inputs) * inputs.deltaTempC; // cm3
  return (dV / boreAreaCm2(inputs)) * 10; // mm
}

export function validate(inputs) {
  const warnings = [];
  if (gammaApparent(inputs) <= 0) warnings.push({ field: 'liquid', code: 'VESSEL_DOMINATES', message: 'The vessel expands as much as, or more than, the liquid.', why: 'The apparent expansivity would be zero or negative, so the level would not rise at all.', fix: 'Choose a liquid with a larger real expansivity, such as alcohol.' });
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, elapsed: 0, heating: true, tempVesselC: 0, tempLiquidC: 0, levelMm: 0 }; }
/**
 * The dip-then-rise is not decoration: the glass vessel, having far less
 * thermal mass than the litre or so of liquid it holds, heats up (and so
 * expands) noticeably faster than the bulk liquid does. For a few seconds
 * the container is getting bigger while the liquid inside is still cold,
 * so the level FALLS -- only once the liquid's own (much larger) real
 * expansivity catches up does the level turn round and climb past its
 * start point. Was a bare `return state` no-op: the flask, its narrow
 * stem, and the level in it never changed at all, however long the burner
 * had apparently been lit.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt;
  if (!s.heating) return s;
  s.elapsed += dt * 6; // a slow classroom heating, compressed for the screen
  const dT = inputs.deltaTempC ?? defaults.deltaTempC;
  /* The vessel is thin glass (or steel) with little thermal mass, so it
     reaches the flame's temperature in seconds; the litre or so of bulk
     liquid it holds takes minutes. A 30:1 ratio of time constants is what
     actually produces the dip for ordinary liquid/vessel pairs (needs
     tau_liquid/tau_vessel > gammaReal/gammaVessel, about 8 for water in
     glass) while correctly all but erasing it for pyrex, whose expansivity
     is so small that no plausible head start makes its contribution
     compete with the liquid's. */
  s.tempVesselC = dT * (1 - Math.exp(-s.elapsed / 3));
  s.tempLiquidC = dT * (1 - Math.exp(-s.elapsed / 90));
  const area = boreAreaCm2(inputs);
  const dV = inputs.volumeCm3 * (liquidOf(inputs).gammaReal * s.tempLiquidC - vesselOf(inputs).gamma * s.tempVesselC);
  s.levelMm = (dV / area) * 10;
  if (s.elapsed > 400) s.heating = false;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  const rng = makeRng(seed + trial * 149);
  const rise = levelRiseMm(inputs) + jitter(rng, 0.3);
  const dV = inputs.volumeCm3 * gammaApparent(inputs) * inputs.deltaTempC;
  return { trial, deltaTempC: inputs.deltaTempC, volumeCm3: inputs.volumeCm3, levelRiseMm: Number(rise.toFixed(2)), volumeChangeCm3: sigFig(dV, 4) };
}

export function derive(rows, inputs = defaults) {
  const pts = rows.map((r) => ({ x: Number(r.deltaTempC), y: Number(r.levelRiseMm) }));
  if (pts.length < 4) return { ok: false, reason: 'Record the rise for at least four different temperature rises.' };
  const fit = fitThroughOrigin(pts);
  const area = boreAreaCm2(inputs);
  // slope = mm rise per °C; convert to gamma_apparent = (slope(mm->cm)/10 * area) / (V * 1)
  const gammaApp = ((fit.slope / 10) * area) / inputs.volumeCm3;
  const correctedForVessel = !!inputs.correctForVessel;
  const gammaReported = correctedForVessel ? gammaApp + vesselOf(inputs).gamma : gammaApp;
  const accepted = liquidOf(inputs).gammaReal;
  const vesselShare = sigFig((vesselOf(inputs).gamma / accepted) * 100, 3);
  return {
    ok: true, gammaApparent: sigFig(gammaApp, 4), gammaReported: sigFig(gammaReported, 4), accepted: sigFig(accepted, 4),
    gammaApparentText: sciText(gammaApp, 'K⁻¹', 3), gammaReportedText: sciText(gammaReported, 'K⁻¹', 3),
    gammaVesselText: sciText(vesselOf(inputs).gamma, 'K⁻¹', 3), acceptedText: sciText(accepted, 'K⁻¹', 3),
    percentError: sigFig(((gammaReported - accepted) / accepted) * 100, 3),
    vesselSharePercent: vesselShare, vesselShare, correctedForVessel,
    liquid: liquidOf(inputs).label, vessel: vesselOf(inputs).label, stemBoreMm: (STEMS[inputs.stem] || STEMS.wide).boreMm,
    r2: Number(fit.r2.toFixed(4)), n: pts.length, points: pts,
  };
}

export default { meta, defaults, LIQUIDS, VESSELS, STEMS, init, step, measure, derive, validate, liquidOf, vesselOf, gammaApparent, levelRiseMm, boreAreaCm2 };
