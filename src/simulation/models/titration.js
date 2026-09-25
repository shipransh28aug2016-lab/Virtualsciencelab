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
/*
 * A NOTE ON NORMALITY, because this registry got it wrong and the error made
 * two board practicals impossible to perform.
 *
 * `trueUnknownN` is a NORMALITY, and every downstream formula treats it as
 * one: equivalenceVolume() equates N1V1 = N2V2, and `strength = N x
 * eqMassUnknown` only balances if both sides are per-equivalent. The two
 * permanganate systems stored 0.02 there — the MOLARITY of the usual KMnO4
 * solution, not its normality. In acidic medium MnO4- + 8H+ + 5e- -> Mn2+ +
 * 4H2O, so n = 5 and 0.02 M KMnO4 is 0.1 N. (That eqMassUnknown was already
 * 158.03/5 = 31.61 g/eq, an equivalent mass, is the proof that normality was
 * always the intended basis.)
 *
 * The consequence was not a small numerical slip. Equating 20 mL of 0.1 N
 * oxalic acid against a titrant believed to be 0.02 N demanded 100 mL of it
 * from a 50 mL burette: the student ran the burette dry, twice, and never
 * reached an end point. Both KMnO4 titrations were unperformable, and the
 * reported strength was out by a factor of five.
 */
export const SYSTEMS = {
  naoh_oxalic: { label: 'NaOH (unknown) vs standard oxalic acid', analyte: 'Sodium hydroxide', titrant: 'Standard oxalic acid', unknownSide: 'analyte', trueUnknownN: 0.0975, equivalencePH: 8.2, correctIndicator: 'phenolphthalein', selfIndicating: false, eqMassUnknown: 40, titrantIsAcid: true },
  hcl_na2co3: { label: 'HCl (unknown) vs standard sodium carbonate', analyte: 'Hydrochloric acid', titrant: 'Standard sodium carbonate', unknownSide: 'analyte', trueUnknownN: 0.104, equivalencePH: 3.9, correctIndicator: 'methylOrange', selfIndicating: false, eqMassUnknown: 36.5, titrantIsAcid: false },
  naoh_hcl: { label: 'NaOH in the flask vs standard HCl in the burette (pH curve)', analyte: 'Sodium hydroxide', titrant: 'Standard hydrochloric acid', unknownSide: 'none', trueUnknownN: 0.1, equivalencePH: 7.0, correctIndicator: 'universal', selfIndicating: false, eqMassUnknown: 40, titrantIsAcid: true },
  kmno4_oxalic: { label: 'KMnO₄ (unknown) vs standard oxalic acid', analyte: 'Standard oxalic acid', titrant: 'Potassium permanganate', unknownSide: 'titrant', trueUnknownN: 0.1, nFactor: 5, molarMass: 158.03, equivalencePH: 7.0, correctIndicator: 'self', selfIndicating: true, eqMassUnknown: 31.61, titrantIsAcid: false },
  kmno4_mohr: { label: "KMnO₄ (unknown) vs standard Mohr's salt", analyte: "Standard Mohr's salt (Fe²⁺)", titrant: 'Potassium permanganate', unknownSide: 'titrant', trueUnknownN: 0.1, nFactor: 5, molarMass: 158.03, equivalencePH: 7.0, correctIndicator: 'self', selfIndicating: true, eqMassUnknown: 31.61, titrantIsAcid: false },
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
const PICKED = {
  hcl_na2co3: SYSTEMS.hcl_na2co3,
  hcl_oxalic: SYSTEMS.hcl_oxalic,
  naoh_oxalic: SYSTEMS.naoh_oxalic,
  naoh_na2co3: SYSTEMS.naoh_na2co3,
};

export function systemOf(inputs) {
  /*
   * WHAT THE STUDENT CHOSE WINS.
   *
   * XI-CHE-E05 asks the student to pick the flask contents and the burette
   * contents themselves, so it declares `analyte` and `titrant` and no
   * `system` at all. `system` was still checked first — and since the lab is
   * opened with the MODEL's defaults underneath the experiment's own, the
   * model's `system: 'naoh_oxalic'` leaked through and won every time. A
   * student who selected hydrochloric acid and sodium carbonate got a bench
   * labelled "Sodium hydroxide" and "Standard oxalic acid", a titration of
   * something else entirely, and a strength calculated for a solution that
   * was never in the flask. Nothing anywhere reported a problem.
   *
   * An experiment that exposes the pickers is, by exposing them, saying that
   * the pickers are the choice. They are therefore resolved first, and
   * `system` serves the experiments that declare it instead.
   */
  const picked = PICKED[`${inputs.analyte}_${inputs.titrant}`];
  if (picked) return picked;
  if (inputs.system && SYSTEMS[inputs.system]) return SYSTEMS[inputs.system];
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

/**
 * The volume at which the INDICATOR changes colour — the end point the
 * student can actually see, which is not the same thing as the equivalence
 * point the arithmetic assumes.
 *
 * This is the whole reason a titration has an indicator, and why choosing the
 * wrong one is an error worth teaching. The end point used to be a fixed
 * +/-0.15 mL window around the equivalence volume, identical whichever
 * indicator was selected: the model WARNED that methyl orange was wrong for a
 * strong-base/weak-acid titration and then delivered exactly the same titre as
 * phenolphthalein, so the warning contradicted the numbers. A student could
 * not discover the error, only be told about it.
 *
 * Here the end point is found by inverting the titration curve at the pH where
 * that indicator turns, so an indicator whose range sits away from the
 * equivalence pH produces a genuinely early or late titre, a wrong strength,
 * and a visible reason for the rule "match the indicator to the equivalence
 * pH". Returns null when the indicator cannot change at all in this titration
 * (its transition pH lies outside the whole pH swing) — which is itself a real
 * and reportable outcome.
 */
export function endPointVolume(inputs) {
  const s = systemOf(inputs);
  const vEq = equivalenceVolume(inputs);
  if (!Number.isFinite(vEq) || vEq <= 0) return null;
  // A redox titration is its own indicator: the first drop of excess
  // permanganate that is not decolourised marks the end point, at equivalence.
  if (s.selfIndicating) return vEq;

  const ind = INDICATORS[inputs.indicator] || INDICATORS.phenolphthalein;
  const turnPH = ind.range[0];
  const direction = s.titrantIsAcid ? -1 : 1;
  const k = Math.max(0.6, vEq * 0.06);
  // pH(V) = eqPH + direction * 6 * tanh((V - vEq)/k)  ->  invert at turnPH
  const arg = (turnPH - s.equivalencePH) / (direction * 6);
  if (Math.abs(arg) >= 0.999) return null;      // this indicator never turns here
  const v = vEq + k * Math.atanh(arg);
  return v > 0 && v < 50 ? v : null;
}

/** One drop from a burette, mL — the finest step a titration can resolve. */
export const DROP_ML = 0.05;
/**
 * Past this much excess the colour is unmistakably too deep: an overshoot.
 *
 * Half a millilitre is ten drops, and a window ten drops wide makes
 * concordance impossible by construction: three titres taken correctly could
 * land 0.5 mL apart and the bench would then refuse them for not agreeing
 * within 0.2 mL. A student is taught to stop at the FIRST permanent colour,
 * which is one drop past the equivalence — so two drops past it is where the
 * pink has gone too deep.
 */
export const OVERSHOOT_ML = 0.1;

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

export function init(inputs = defaults) {
  const sys = systemOf(inputs);
  return {
    t: 0, delivered: 0, flowRate: 0, pH: 7, colour: 'colourless', flowing: false, atEndPoint: false, overshot: false, noEndPoint: false, finishedAt: null,
    analyteName: sys.analyte, titrantName: sys.titrant, titrantIsPermanganate: sys.titrant === 'Potassium permanganate',
  };
}

export function step(state, inputs, dt) {
  const s = { ...state };
  const sys = systemOf(inputs);
  const vEq = equivalenceVolume(inputs);
  /*
   * Renderers draw from state+inputs only (they never import a model), so
   * the actual chemical names have to be resolved here and handed over --
   * the burette/flask used to read inputs.titrant/inputs.analyte directly,
   * which are real fields ONLY for XI-CHE-E05's own pickers (and even
   * there hold bare codes like 'na2co3', not a readable name). Every
   * other titration experiment (E03, C03, J01, J02) selects its system via
   * `system` instead, so inputs.titrant/inputs.analyte were simply
   * undefined and the apparatus was permanently labelled the generic
   * placeholder text "Burette (titrant)" / "Conical flask (analyte)" no
   * matter which acid or base was actually in play.
   */
  s.analyteName = sys.analyte;
  s.titrantName = sys.titrant;
  s.titrantIsPermanganate = sys.titrant === 'Potassium permanganate';

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
    /*
     * Setting the level directly still runs the titrant in over a short time
     * rather than teleporting it, but it must ARRIVE. At the old rate the
     * burette lagged the control by about 0.3 mL for as long as the student
     * kept moving it, so the volume they had set and the volume recorded in
     * the table were different numbers — and the end point was decided on the
     * lagging one. The reading a student takes must be the volume the burette
     * has actually delivered, so the last fraction of a drop is snapped home.
     */
    const target = Math.max(0, Math.min(50, inputs.buretteVolume));
    const gap = target - s.delivered;
    s.delivered = Math.abs(gap) <= DROP_ML ? target : s.delivered + gap * Math.min(1, dt * 18);
    s.flowing = false;
  }
  s.pH = pHAt(inputs, s.delivered);
  s.colour = colourAt(inputs, s.delivered);

  /*
   * What the student sees is a COLOUR, and the end point is the first drop
   * whose colour persists. Both flags are therefore read off the indicator's
   * own turning volume rather than off the equivalence volume.
   *
   * They are also exact complements above that volume. The previous pair
   * (a +/-0.15 mL window, and overshoot only beyond +0.5 mL) left a 0.35 mL
   * band in which the titration was neither at its end point nor overshot:
   * measure() returned null there and the student was told "Nothing to
   * measure here" with no way to understand what had gone wrong, on the
   * single most important practical in the syllabus. A titration is past its
   * end point or it is not; there is no third state.
   */
  const vEnd = endPointVolume(inputs);
  s.endPointVolume = vEnd;
  s.equivalenceVolume = vEq;
  if (vEnd == null) {
    // This indicator cannot change colour anywhere in this titration.
    s.atEndPoint = false;
    s.overshot = false;
    s.noEndPoint = true;
  } else {
    s.noEndPoint = false;
    const past = s.delivered - vEnd;
    s.atEndPoint = past >= -DROP_ML && past <= OVERSHOOT_ML;
    s.overshot = past > OVERSHOOT_ML;
  }
  s.t += dt;
  if ((s.atEndPoint || s.overshot) && !state.finishedAt) s.finishedAt = s.t;
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  /*
   * Refusing to record is a teaching moment, so it has to SAY something.
   * Returning a bare null left the student with the generic "Nothing to
   * measure here", which on a titration is actively misleading: there is
   * plenty to measure, the colour simply has not changed yet.
   */
  if (!state) return null;
  if (state.noEndPoint) {
    return { v: null, reason: `${(INDICATORS[inputs.indicator] || {}).label || 'This indicator'} does not change colour anywhere in this titration — its transition pH lies outside the whole pH range of the curve. Choose an indicator that turns near pH ${systemOf(inputs).equivalencePH}.` };
  }
  if (!(state.atEndPoint || state.overshot)) {
    return { v: null, reason: `No permanent colour change yet — the flask is still ${state.colour}. Keep running the titrant in until the colour just holds, and read the burette there.` };
  }
  const rng = makeRng(seed + trial * 181);
  const initial = 0;
  /*
   * A burette is graduated in 0.1 mL and read to that graduation. The scatter
   * is the real uncertainty of the operation — judging the first permanent
   * colour, the size of the last drop, the parallax of the meniscus — about
   * one graduation in practice.
   *
   * It was previously one drop (0.05 mL), which rounded to the SAME 0.1 mL
   * graduation every time: three titres came back 19.5, 19.5, 19.5. That
   * silently destroys the point of running a titration in triplicate. A
   * student is taught to repeat until readings are concordant, and readings
   * that cannot disagree teach nothing about concordance.
   */
  /* Half a graduation of reading scatter — the meniscus, the light, the eye.
     Any more and titres taken by one careful worker cannot agree to the two
     graduations that "concordant" means. */
  const finalReading = toLeastCount(state.delivered + jitter(rng, 0.05), 0.1);
  return {
    trial,
    /* Which indicator the end point was judged by. Phenolphthalein turns at
       pH 8.2 and methyl orange at 4.4, so the same flask has two different
       end points — twelve millilitres apart on a weak acid — and a set that
       mixes them is two titrations averaged together. */
    indicator: (INDICATORS[inputs.indicator] || {}).label || String(inputs.indicator || ''),
    initialReading: initial, finalReading, volumeUsed: Number((finalReading - initial).toFixed(1)),
    pHAtStop: Number(state.pH.toFixed(2)), _overshot: state.overshot,
  };
}

/**
 * How close two titres must be to count as concordant. A burette is read to
 * its 0.1 mL graduation, so two readings that agree to within two graduations
 * are the same measurement made twice; anything wider is a different one.
 */
export const CONCORDANCE_ML = 0.2;

/**
 * The concordant titres, out of everything recorded.
 *
 * "Mean of 2 concordant titres: 21.3 mL (readings are not concordant)" is not
 * a sentence a laboratory can produce. The mean was being taken over every
 * titre that had not overshot, concordant or not, and then LABELLED as a mean
 * of concordant ones with a warning beside it saying the opposite — and the
 * strength carried to the result panel was the mean of readings the panel
 * itself had just rejected. The three numbers that were meant to agree, and
 * did not, were averaged anyway.
 *
 * A titration is finished when readings agree. So this finds the widest run of
 * titres that lie within one concordance window of each other, which is what a
 * student does when they look down the column and take the three that agree.
 */
export function concordantSet(vols) {
  const sorted = [...vols].sort((a, b) => a - b);
  let best = { from: 0, to: 0 };
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[i] <= CONCORDANCE_ML + 1e-9) j += 1;
    const span = j - i;
    const bestSpan = best.to - best.from;
    if (span > bestSpan
      || (span === bestSpan && sorted[j] - sorted[i] < sorted[best.to] - sorted[best.from])) {
      best = { from: i, to: j };
    }
  }
  return sorted.slice(best.from, best.to + 1);
}

export function derive(rows, inputs = defaults) {
  const indicators = [...new Set(rows.map((r) => r.indicator).filter(Boolean))];
  if (indicators.length > 1) {
    return {
      ok: false,
      reason: `These titres were judged by ${indicators.length} different indicators (${indicators.join(', ')}). Each changes colour at its own pH, so they mark different end points in the same flask — choose the one that suits this titration and use it for the whole set.`,
    };
  }

  const usable = rows.filter((r) => !r._overshot);
  if (usable.length < 2) return { ok: false, reason: `Record at least two concordant titres (within ${CONCORDANCE_ML} mL of each other).` };
  const allVols = usable.map((r) => Number(r.volumeUsed));
  const vols = concordantSet(allVols);
  if (vols.length < 2) {
    return {
      ok: false,
      reason: `No two titres agree to within ${CONCORDANCE_ML} mL — the readings are ${allVols.map((v) => v.toFixed(1)).join(', ')} mL. Run the titration again until two agree, and average only those.`,
    };
  }
  const meanTitre = mean(vols);
  const s = systemOf(inputs);
  let normality;
  if (s.unknownSide === 'titrant') {
    normality = (inputs.titrantConc * inputs.analyteVolume) / meanTitre;
  } else {
    normality = (inputs.titrantConc * meanTitre) / inputs.analyteVolume;
  }
  /*
   * Report the molarity as well wherever the redox system declares its
   * n-factor. Both permanganate practicals are titled "Molarity of KMnO4",
   * and a result panel that answers only in normality does not answer the
   * question the experiment asks. M = N / n.
   */
  const molarity = s.nFactor ? normality / s.nFactor : null;
  return {
    ok: true, meanTitre: sigFig(meanTitre, 4), normality: sigFig(normality, 3),
    strength: sigFig(normality * s.eqMassUnknown, 3),
    /* Three concordant titres is what the practical asks for; two is enough
       to calculate with, and the panel says which of the two it had. */
    concordant: vols.length >= 3,
    concordantCount: vols.length,
    discarded: allVols.length - vols.length,
    titreSpread: sigFig(Math.max(...vols) - Math.min(...vols), 2),
    molarity: molarity == null ? null : sigFig(molarity, 3),
    nFactor: s.nFactor || null,
    n: vols.length, points: rows.map((r, i) => ({ x: i + 1, y: Number(r.volumeUsed) })),
  };
}

export default { meta, defaults, SYSTEMS, INDICATORS, DROP_ML, OVERSHOOT_ML, init, step, measure, derive, validate, systemOf, equivalenceVolume, endPointVolume, pHAt, colourAt, correctIndicator };
