/**
 * NULL-POINT INDICATORS
 *
 * A large family of senior-secondary practicals are not "set a value and read
 * a number". They are hunts for a null:
 *
 *   metre bridge        slide the jockey until the galvanometer shows no deflection
 *   beam balance        add weights until the pointer swings equally either side
 *   spherometer         turn the screw until the tip just touches
 *   screw gauge         close the thimble until the faces just grip the sheet
 *   resonance tube      raise the column until the note is loudest
 *   inclined plane      load the pan until the roller is on the point of moving
 *   metre rule          slide the known mass until the rule is horizontal
 *
 * Finding the null IS the experiment. All of these models correctly refused to
 * record a reading until the condition was met — and then said nothing useful,
 * so the student was left sliding a control across its whole range with no way
 * to tell whether they were getting warmer. In practice most of these labs
 * could only be completed by luck: the metre bridge's balance point is 0.6 cm
 * wide in a metre, and the beam balance's is four milligrams wide in a hundred
 * grams.
 *
 * What is missing is the thing the real instrument gives you for free. A
 * galvanometer does not tell you the unknown resistance; it tells you WHICH
 * WAY the needle kicked, and how hard. A balance pointer does the same. So
 * does your ear at the mouth of a resonance tube.
 *
 * That is exactly what this builds, and exactly what it withholds:
 *
 *   IT REPORTS   direction — which way to move the control
 *                closeness — far / closer / very close / at the null
 *   IT NEVER     names the target value
 *
 * Printing the target would hand over the answer the experiment exists to
 * find, in the same way that printing the equivalence volume beside a burette
 * makes the titration unnecessary.
 */

/**
 * How the deviation is described, from nulled outwards.
 *
 * `phrase` is what the instrument LOOKS like at that distance, which is not
 * the same thing at every distance: a balance pointer a milligram out is
 * "only just off the zero", and the same pointer thirty grams out is "hard
 * over". Bolting one description onto a closeness word produced readings like
 * "hard over — very close", which is not something an instrument can be.
 */
const BANDS = [
  { within: 1, closeness: 'at the null', strength: 0, phrase: null },
  { within: 3, closeness: 'very close', strength: 1, phrase: 'only just off' },
  { within: 10, closeness: 'close', strength: 2, phrase: 'slightly off' },
  { within: 40, closeness: 'off', strength: 3, phrase: null },
  { within: Infinity, closeness: 'far off', strength: 4, phrase: null },
];

/**
 * Describe how far a control is from the setting that nulls the instrument.
 *
 * @param {object} spec
 * @param {string} spec.label        what the student is watching ('Galvanometer')
 * @param {number} spec.current      the control's present value
 * @param {number} spec.target       the value that nulls it — reported only as a direction
 * @param {number} spec.tolerance    half-width of the null, in the control's own units
 * @param {string} spec.increase     what to do when the control must go UP ('Slide the jockey towards B')
 * @param {string} spec.decrease     what to do when it must come DOWN
 * @param {string} [spec.atNullText] what the instrument shows at the null ('no deflection')
 * @param {string} [spec.awayFrom]   how the off-null state reads ('needle kicks')
 * @returns {{label:string, atNull:boolean, direction:('up'|'down'|null), closeness:string,
 *            strength:number, reading:string, hint:string}}
 */
export function nullPoint(spec) {
  const {
    label, current, target, tolerance,
    increase, decrease,
    atNullText = 'no deflection',
    awayFrom = 'deflecting',
  } = spec;

  const tol = Math.max(Math.abs(tolerance) || 0, 1e-9);
  const off = Number(current) - Number(target);
  const ratio = Math.abs(off) / tol;
  const band = BANDS.find((b) => ratio <= b.within) || BANDS[BANDS.length - 1];
  const atNull = ratio <= 1;
  const direction = atNull ? null : (off < 0 ? 'up' : 'down');

  /*
   * The arrows carry the same information as the words, for the same reason
   * the apparatus is labelled as well as drawn: a reading that can only be
   * taken from a colour or a symbol is a reading some students cannot take.
   */
  const arrow = atNull ? '●' : (direction === 'up' ? '▸' : '◂');
  let reading;
  if (atNull) reading = `${arrow} ${atNullText}`;
  else if (band.phrase) reading = `${arrow} ${band.phrase}`;
  else if (band.strength >= 4) reading = `${arrow} ${awayFrom}, well away`;
  else reading = `${arrow} ${awayFrom}`;

  return {
    label,
    atNull,
    direction,
    closeness: band.closeness,
    strength: band.strength,
    reading,
    hint: atNull ? `The instrument reads ${atNullText}. Take the reading now.` : (direction === 'up' ? increase : decrease),
  };
}

/**
 * The sentence a model hands back when it refuses to record because the
 * instrument is not nulled. It says what is wrong and what to do about it,
 * and never what the answer is.
 */
export function nullRefusal(indicator) {
  if (!indicator) return null;
  return `${indicator.label}: ${indicator.reading}. ${indicator.hint}`;
}

export default { nullPoint, nullRefusal };
