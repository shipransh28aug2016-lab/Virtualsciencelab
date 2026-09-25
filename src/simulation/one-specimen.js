/**
 * ONE SPECIMEN PER SET
 *
 * A mean is a measurement only when every reading is of the same thing.
 *
 * This is the single largest defect the student-journey sweep found, and it
 * wore a different disguise on every bench. Two mirrors whose focal lengths
 * differ by ten centimetres, three galvanometers with different resistances,
 * three diodes with different knees, four laminae with different areas, five
 * liquids with different boiling points: a set taken across them was averaged
 * into one number belonging to none of them, and the accepted value printed
 * beside it was whichever specimen happened to be selected when Calculate was
 * pressed. The arithmetic was right and the answer was meaningless.
 *
 * A student does this all the time — it is the obvious thing to do with a
 * tray of specimens and a table with four rows — and the bench has to be the
 * thing that says so, in the same breath as it says what to do instead. The
 * benches that already knew (the sonometer, the metre bridge, the resistivity
 * wire) said it well; the rest said nothing at all.
 *
 * What counts as "the same thing" is not every setting: a finer thermometer
 * or a slower stirrer does not change what is being measured. The test is
 * whether the ACCEPTED VALUE moves with the setting, and the golden audit
 * applies exactly that test to every option group on every bench, so a model
 * that forgets this guard is reported rather than quietly believed.
 */

/**
 * Refuse a set that mixes specimens, or return null if it does not.
 *
 * @param {object[]} rows   the recorded observations
 * @param {string} key      the row field naming the specimen ('body', 'wire')
 * @param {string} plural   what several of them are called ('laminae', 'wires')
 * @param {string} [advice] what to do instead, if the default does not fit
 * @returns {{ok:false, reason:string}|null}
 */
export function mixedSetRefusal(rows, key, plural, advice) {
  const names = [...new Set((rows || []).map((r) => r && r[key]).filter(Boolean))];
  if (names.length < 2) return null;
  return {
    ok: false,
    reason: `These readings are of ${names.length} different ${plural} (${names.join(', ')}). `
      + `A mean is a measurement only when every reading is of the same one — `
      + (advice || `clear the table and take a set on one of them.`),
  };
}

/**
 * The entry in a table of specimens whose label matches the one the readings
 * were taken on — because the accepted value belongs to that specimen, not to
 * whatever is on the bench when the student presses Calculate.
 *
 * @param {object} table    e.g. MIRRORS, LIQUIDS, DIODES
 * @param {object[]} rows   the recorded observations
 * @param {string} key      the row field naming the specimen
 * @param {object} fallback what to use when the rows do not name one
 */
export function specimenOfRows(table, rows, key, fallback) {
  const name = (rows || []).map((r) => r && r[key]).find(Boolean);
  if (!name) return fallback;
  return Object.values(table).find((x) => x && x.label === name) || fallback;
}

export default { mixedSetRefusal, specimenOfRows };
