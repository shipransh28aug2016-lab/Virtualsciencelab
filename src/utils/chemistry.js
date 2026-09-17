/** Chemistry formula and equation integrity helpers. */

export const FORMULAS = Object.freeze({
  oxalicAcidDihydrate: 'H₂C₂O₄·2H₂O',
  oxalicAcid: 'H₂C₂O₄',
  sodiumHydroxide: 'NaOH',
  sodiumOxalate: 'Na₂C₂O₄',
  sodiumThiosulfate: 'Na₂S₂O₃',
  hydrochloricAcid: 'HCl',
  sodiumChloride: 'NaCl',
  sulfurDioxide: 'SO₂',
  water: 'H₂O',
});

const SUBSCRIPT = '₀₁₂₃₄₅₆₇₈₉';
const normaliseFormula = (value) => String(value).replace(/[₀-₉]/g, (d) => String(SUBSCRIPT.indexOf(d)));

/**
 * Conservative equation check for simple educational equations. It validates
 * atom conservation without pretending to balance arbitrary organic chemistry.
 */
export function isBalancedEquation(equation) {
  const [lhs, rhs] = String(equation).split('→').map((side) => side?.trim());
  if (!lhs || !rhs) return false;

  const countSide = (side) => {
    const totals = {};
    for (const term of side.split('+')) {
      const match = term.trim().match(/^(\d+)?\s*([A-Z][A-Za-z₀-₉0-9()]*)/);
      if (!match) return null;
      const coefficient = Number(match[1] || 1);
      const formula = normaliseFormula(match[2]);
      for (const atom of formula.match(/[A-Z][a-z]?\d*/g) || []) {
        const atomMatch = atom.match(/^([A-Z][a-z]?)(\d*)$/);
        totals[atomMatch[1]] = (totals[atomMatch[1]] || 0) + coefficient * Number(atomMatch[2] || 1);
      }
    }
    return totals;
  };

  const left = countSide(lhs);
  const right = countSide(rhs);
  if (!left || !right) return false;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

export default { FORMULAS, isBalancedEquation };
