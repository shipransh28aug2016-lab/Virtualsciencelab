/**
 * MODEL: Volumetric titration — XI-CHE-E03 (NaOH vs standard oxalic acid),
 * XI-CHE-E05 (HCl vs standard sodium carbonate), and reused for XI-CHE-C03
 * (pH curve of a strong/strong titration) and XII-CHE-J01/J02 (KMnO4 redox
 * titrations against oxalic acid / Mohr's salt).
 *
 * One titrant is run from a burette into a fixed volume of analyte. The
 * burette tap is opened by moving `buretteVolume` (the delivered-so-far
 * target); the model settles `delivered` towards it, tracks pH (or, for a
 * self-indicating redox titrant, whether the colour has appeared) and stops
 * the tap automatically once the end point is reached or passed.
 */
import { makeRng, jitter } from '../../utils/rng.js';
import { toLeastCount, mean, sigFig } from '../../utils/measure.js';

export const meta = {
  id: 'XI-CHE-E03',
  formula: 'N1V1 = N2V2 at the equivalence point; strength (g/L) = normality × equivalent mass',
  unitSystem: 'Normality in mol(eq)/L; volumes in mL',
  assumptions: ['The standard solution\'s concentration is known exactly', 'The indicator changes colour at (or acceptably close to) the equivalence pH', 'The burette and pipette are correctly rinsed and read without parallax'],
  validRange: 'Titrant 0.02-0.2 N; analyte 5-25 mL',
  edgeCases: ['Phenolphthalein used for a carbonate titration ends far too early, at the bicarbonate stage', 'Overshooting the end point gives a titre that is too large'],
  expectedBehaviour: ['Concordant titres (within 0.1-0.2 mL) validate the mean titre used in the calculation', 'The normality recovered matches the accepted value for the unknown supplied'],
};

/**
 * Each system names which side is unknown, the true normality of that
 * unknown (what the lab is designed to reveal), the correct indicator (or
 * 'self' for a self-indicating redox titrant), and the pH (or, for redox,
 * a nominal 7) at which the colour genuinely changes. `titrantIsAcid`
 * fixes the DIRECTION of the pH curve: pH must FALL as delivered volume
 * rises when an acid is being run in from the burette, and RISE when a
 * base (or carbonate) is -- pHAt() got this backwards for every acid-
 * titrant system until the fix below (it always made pH climb with
 * delivered volume, which is only correct when the titrant is a base).
 * `valid: false` marks a selectable analyte/titrant pairing that is not a
 * real titration at all (acid run into acid, or base into base -- neither
 * reacts with the other, so there is no equivalence point to find).
 */
export const SYSTEMS = {
  naoh_oxalic: { label: 'NaOH (unknown) vs standard oxalic acid', analyte: 'Sodium hydroxide', titrant: 'Standard oxalic acid', unknownSide: 'analyte', trueUnknownN: 0.0975, equivalencePH: 8.2, correctIndicator: 'phenolphthalein', selfIndicating: false, eqMassUnknown: 40, titrantIsAcid: true },
  hcl_na2co3: { label: 'HCl (unknown) vs standard sodium carbonate', analyte: 'Hydrochloric acid', titrant: 'Standard sodium carbonate', unknownSide: 'analyte', trueUnknownN: 0.104, equivalencePH: 3.9, correctIndicator: 'methylOrange', selfIndicating: false, eqMassUnknown: 36.5, titrantIsAcid: false },
  naoh_hcl: { label: 'Strong base vs strong acid (pH curve)', analyte: 'Sodium hydroxide', titrant: 'Standard hydrochloric acid', unknownSide: 'none', trueUnknownN: 0.1, equivalencePH: 7.0, correctIndicator: 'universal', selfIndicating: false, eqMassUnknown: 40, titrantIsAcid: true },
  kmno4_oxalic: { label: 'KMnO₄ (unknown) vs standard oxalic acid', analyte: 'Standard oxalic acid', titrant: 'Potassium permanganate', unknownSide: 'titrant', trueUnknownN: 0.02, equivalencePH: 7.0, correctIndicator: 'self', selfIndicating: true, eqMassUnknown: 31.6, titrantIsAcid: false },
  kmno4_mohr: { label: "KMnO₄ (unknown) vs standard Mohr's salt", analyte: "Standard Mohr's salt (Fe²⁺)", titrant: 'Potassium permanganate', unknownSide: 'titrant', trueUnknownN: 0.02, equivalencePH: 7.0, correctIndicator: 'self', selfIndicating: true, eqMassUnknown: 31.6, titrantIsAcid: false },
  /*
   * XI-CHE-E05 lets a student pick the flask contents ("analyte": hcl or
   * naoh) and the burette contents ("titrant": na2co3 or oxalic)
   * independently, so two of the four combinations a student can actually
   * select are not real titrations at all: an acid run into an acid, or a
   * base run into a base, neither of which reacts with the other. Both
   * are kept here (rather than letting systemOf() silently fall back to
   * an unrelated system, which is what happened before) so validate() can
   * reject them by name instead of quietly simulating the wrong chemistry.
   */
  hcl_oxalic: { label: 'Hydrochloric acid vs oxalic acid — not a real titration', analyte: 'Hydrochloric acid', titrant: 'Standard oxalic acid', unknownSide: 'analyte', trueUnknownN: 0.104, equivalencePH: 7.0, correctIndicator: 'methylOrange', selfIndicating: false, eqMassUnknown: 36.5, titrantIsAcid: true, valid: false, invalidReason: 'Hydrochloric acid and oxalic acid are both acids. Neither neutralises the other, so no colour change marks a genuine equivalence point.' },
  naoh_na2co3: { label: 'Sodium hydroxide vs sodium carbonate — not a real titration', analyte: 'Sodium hydroxide', titrant: 'Standard sodium carbonate', unknownSide: 'analyte', trueUnknownN: 0.1, equivalencePH: 7.0, correctIndicator: 'phenolphthalein', selfIndicating: false, eqMassUnknown: 40, titrantIsAcid: false, valid: false, invalidReason: 'Sodium hydroxide and sodium carbonate are both alkaline. Neither neutralises the other, so no colour change marks a genuine equivalence point.' },
};

export const INDICATORS = {
  phenolphthalein: { label: 'Phenolphthalein', below: 'colourless', above: 'pink', range: [8.2, 10] },
  methylOrange: { label: 'Methyl orange', below: 'pink', above: 'yellow', range: [3.1, 4.4] },
  universal: { label: 'Universal indicator', below: 'red-orange', above: 'violet', range: [7, 7] },
};

export const defaults = { system: 'naoh_oxalic', titrantConc: 0.1, analyteVolume: 20, indicator: 'phenolphthalein', buretteVolume: 0 };

/**
 * Resolve which system is in play. Most experiment JSONs supply `system`
 * directly; XI-CHE-E05 instead exposes separate `analyte`/`titrant` pickers,
 * so their combination is mapped onto the same registry here.
 */
export function systemOf(inputs) {
  if (inputs.system && SYSTEMS[inputs.system]) return SYSTEMS[inputs.system];
  if (inputs.analyte === 'hcl' && inputs.titrant === 'na2co3') return SYSTEMS.hcl_na2co3;
  if (inputs.analyte === 'hcl' && inputs.titrant === 'oxalic') return SYSTEMS.hcl_oxalic;
  if (inputs.analyte === 'naoh' && inputs.titrant === 'oxalic') return SYSTEMS.naoh_oxalic;
  // This combination (both alkaline) used to fall through to the
  // naoh_oxalic default below -- silently telling a student who had
  // selected "sodium carbonate" in the burette that they were titrating
  // against oxalic acid instead, a completely different reaction.
  if (inputs.analyte === 'naoh' && inputs.titrant === 'na2co3') return SYSTEMS.naoh_na2co3;
  return SYSTEMS.naoh_oxalic;
}

/** Volume of titrant needed to reach equivalence, mL. */
export function equivalenceVolume(inputs) {
  const s = systemOf(inputs);
  if (s.unknownSide === 'titrant') {
    // N(titrant, unknown) is what we want; here we treat titrantConc slider as irrelevant,
    // and instead invert: V(titrant) chosen so that N(analyte,known)*V(analyte) = N(titrant,true)*V(titrant).
    return (inputs.titrantConc * inputs.analyteVolume) / s.trueUnknownN;
  }
  // Standard titrant of known normality (titrantConc) vs an unknown analyte of trueUnknownN.
  return (s.trueUnknownN * inputs.analyteVolume) / inputs.titrantConc;
}

/**
 * pH during the titration, modelled as a sigmoid jump at the equivalence
 * point (acid-base only).
 *
 * The direction of that jump depends on what is actually being run in
 * from the burette: adding a BASE to the flask raises pH as delivered
 * volume rises (correct as x goes from negative to positive below), but
 * adding an ACID must LOWER pH as delivered volume rises. This used to
 * always rise regardless, which was correct for hcl_na2co3 (a base run
 * into acid) but backwards for naoh_oxalic and naoh_hcl -- e.g. the
 * XI-CHE-C03 pH curve for NaOH titrated with HCl should start near pH 13
 * and fall to near pH 1, and instead started low and climbed, an
 * inverted, chemically wrong curve for exactly the titration this
 * activity exists to plot.
 */
export function pHAt(inputs, delivered) {
  const s = systemOf(inputs);
  if (s.selfIndicating) return 7; // redox: pH is not the observable, colour is
  const vEq = equivalenceVolume(inputs);
  if (vEq <= 0) return 7;
  const x = (delivered - vEq) / Math.max(0.6, vEq * 0.06); // steepness of the jump
  const direction = s.titrantIsAcid ? -1 : 1;
  const ph = s.equivalencePH + direction * 6 * Math.tanh(x);
  // The pH scale itself runs 0-14 (it is -log[H+] for water at 25 degC,
  // and [H+] cannot exceed about 1 M in these dilute, sub-1 N solutions);
  // clamping here matters because main.js's live readout prints this pH
  // straight to the student (e.g. hcl_na2co3's own equivalencePH of 3.9
  // minus the model's full 6-unit swing would otherwise show "pH -2.10"
  // well before the equivalence point, a value the scale cannot have).
  return Math.max(0, Math.min(14, ph));
}

export function colourAt(inputs, delivered) {
  const s = systemOf(inputs);
  if (s.selfIndicating) return delivered >= equivalenceVolume(inputs) ? 'pale pink (persists)' : 'colourless';
  const ind = INDICATORS[inputs.indicator] || INDICATORS.phenolphthalein;
  const ph = pHAt(inputs, delivered);
  if (ind === INDICATORS.universal) {
    if (ph < 4) return 'red';
    if (ph < 6.5) return 'orange';
    if (ph < 7.5) return 'green';
    if (ph < 10) return 'blue';
    return 'violet';
  }
  return ph >= ind.range[0] ? ind.above : ind.below;
}

export function correctIndicator(inputs) { return inputs.indicator === systemOf(inputs).correctIndicator || systemOf(inputs).selfIndicating; }

export function validate(inputs) {
  const errors = [], warnings = [];
  const s = systemOf(inputs);
  if (s.valid === false) {
    errors.push({
      field: 'titrant', code: 'NO_REACTION',
      message: `${s.analyte} and ${s.titrant} do not react with each other.`,
      why: s.invalidReason,
      fix: 'Put an acid in one vessel and a base (or a carbonate) in the other.',
    });
  }
  if (!correctIndicator(inputs)) {
    warnings.push({
      field: 'indicator', code: 'WRONG_INDICATOR',
      message: `${(INDICATORS[inputs.indicator] || {}).label || inputs.indicator} is not the right indicator for this titration.`,
      why: `The equivalence point here lies near pH ${s.equivalencePH}. An indicator that changes far from that pH gives an end point that does not match the true equivalence volume.`,
      fix: `Use ${(INDICATORS[s.correctIndicator] || {}).label || s.correctIndicator}.`,
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

export function init() { return { t: 0, delivered: 0, pH: 7, colour: 'colourless', flowing: false, atEndPoint: false, overshot: false, finishedAt: null }; }

export function step(state, inputs, dt) {
  const s = { ...state };
  const vEq = equivalenceVolume(inputs);

  /*
   * An open stopcock delivers titrant at a rate, and the volume delivered
   * is the time integral of that rate. This is the whole experiment, and
   * it was missing: `flowRate` was set by the stopcock buttons but never
   * read here, and `flowing` was then overwritten from the slider — so
   * opening the tap did nothing at all and the burette never emptied.
   *
   * Two ways to reach a volume, both ending in the same state: run the
   * tap (integrated below), or set the level directly on the slider.
   */
  if (s.flowing && s.flowRate > 0) {
    s.delivered = Math.min(50, s.delivered + s.flowRate * dt);
    // Overshooting past the end point is the student's mistake to make,
    // but the tap shuts once the burette is empty.
    if (s.delivered >= 50) { s.delivered = 50; s.flowing = false; s.flowRate = 0; }
  } else {
    const target = Math.max(0, Math.min(50, inputs.buretteVolume));
    s.delivered += (target - s.delivered) * Math.min(1, dt * 6);
    s.flowing = false;
  }
  s.pH = pHAt(inputs, s.delivered);
  s.colour = colourAt(inputs, s.delivered);
  s.atEndPoint = Math.abs(s.delivered - vEq) <= 0.15;
  s.overshot = s.delivered - vEq > 0.5;
  s.t += dt;
  if ((s.atEndPoint || s.overshot) && !state.finishedAt) s.finishedAt = s.t;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  if (!state || !(state.atEndPoint || state.overshot)) return null;
  const rng = makeRng(seed + trial * 181);
  const initial = 0;
  const finalReading = toLeastCount(state.delivered + jitter(rng, 0.05), 0.1);
  return {
    trial, initialReading: initial, finalReading, volumeUsed: Number((finalReading - initial).toFixed(1)),
    pHAtStop: Number(state.pH.toFixed(2)), _overshot: state.overshot,
  };
}

export function derive(rows, inputs = defaults) {
  const usable = rows.filter((r) => !r._overshot);
  if (usable.length < 2) return { ok: false, reason: 'Record at least two concordant titres (within 0.2 mL of each other).' };
  const vols = usable.map((r) => Number(r.volumeUsed));
  const meanTitre = mean(vols);
  const s = systemOf(inputs);
  let normality;
  if (s.unknownSide === 'titrant') {
    normality = (inputs.titrantConc * inputs.analyteVolume) / meanTitre;
  } else {
    normality = (inputs.titrantConc * meanTitre) / inputs.analyteVolume;
  }
  return {
    ok: true, meanTitre: sigFig(meanTitre, 4), normality: sigFig(normality, 4),
    strength: sigFig(normality * s.eqMassUnknown, 4), concordant: Math.max(...vols) - Math.min(...vols) <= 0.3,
    n: usable.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.volumeUsed) })),
  };
}

export default { meta, defaults, SYSTEMS, INDICATORS, init, step, measure, derive, validate, systemOf, equivalenceVolume, pHAt, colourAt, correctIndicator };
