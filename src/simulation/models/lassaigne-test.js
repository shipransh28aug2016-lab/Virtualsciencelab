/**
 * MODEL: Detection of nitrogen, sulphur and chlorine in an organic compound
 * (Lassaigne's test) — XI-CHE-F02.
 * CBSE Class XI Chemistry (043) 2026-27, Practicals Section F, Experiment 2.
 *
 * Fusing the compound with sodium metal converts covalently-bound N, S, Cl
 * into ionic NaCN, Na₂S, NaCl in the "sodium fusion extract" (Lassaigne's
 * extract). Each element is then detected by its own confirmatory test on
 * a portion of that extract.
 */
export const meta = {
  id: 'XI-CHE-F02',
  formula: 'Na + organic compound (fusion) → NaCN, Na₂S, NaX (ionic, water-soluble)',
  unitSystem: 'Descriptive (colour of precipitate/complex)',
  assumptions: ['Fusion is complete (extract is tested only after the sodium has fully reacted, or a fresh piece is added and re-fused)', 'The extract is filtered clear before testing', 'Nitrogen and sulphur, if both present, combine to give a more sensitive test (NaSCN) that must be distinguished from nitrogen alone'],
  validRange: 'Six compounds spanning N-only, S-only, Cl-only, N+S, N+Cl and none',
  edgeCases: ['An incompletely fused extract gives a false negative even when the element is present', 'When both N and S are present, ferric chloride gives a blood-red [FeSCN]²⁺ colour instead of Prussian blue — a DIFFERENT test outcome that itself proves both elements are present together'],
  expectedBehaviour: ['Prussian blue confirms nitrogen (in the absence of sulphur)', 'A black precipitate with sodium nitroprusside confirms sulphur', 'A white precipitate, soluble in NH₄OH, confirms chlorine (after first destroying any CN⁻/S²⁻ that would interfere)'],
};

export const COMPOUNDS = {
  urea: { label: 'Urea (contains N)', hasN: true, hasS: false, hasX: null },
  thiourea: { label: 'Thiourea (contains N and S)', hasN: true, hasS: true, hasX: null },
  chlorobenzene: { label: 'Chlorobenzene (contains Cl)', hasN: false, hasS: false, hasX: 'Cl' },
  benzenesulphonic: { label: 'Benzenesulphonic acid (contains S)', hasN: false, hasS: true, hasX: null },
  glucose: { label: 'Glucose (contains neither N, S nor halogen)', hasN: false, hasS: false, hasX: null },
  chloroaniline: { label: 'p-Chloroaniline (contains N and Cl)', hasN: true, hasS: false, hasX: 'Cl' },
};
export const TESTS = {
  fusion: { label: 'Sodium fusion (prepare the extract)' },
  nitrogen: { label: 'Nitrogen test (FeSO₄, then FeCl₃ and dil. H₂SO₄)' },
  sulphur: { label: 'Sulphur test (sodium nitroprusside)' },
  sulphur2: { label: 'Sulphur test (lead acetate + acetic acid)' },
  halogen: { label: 'Halogen test (dil. HNO₃, then AgNO₃)' },
};

export const defaults = { compound: 'thiourea', test: 'fusion', fused: false };

export function compoundOf(inputs) { return COMPOUNDS[inputs.compound] || COMPOUNDS.thiourea; }

export function observation(inputs) {
  const c = compoundOf(inputs);
  if (!inputs.fused && inputs.test !== 'fusion') {
    return 'No extract has been prepared yet — fuse the compound with sodium first.';
  }
  switch (inputs.test) {
    case 'fusion':
      return 'Sodium fusion complete; extract filtered clear.';
    case 'nitrogen':
      if (c.hasN && c.hasS) return 'Blood-red colouration ([FeSCN]²⁺) — nitrogen AND sulphur are both present.';
      if (c.hasN) return 'Prussian blue precipitate/colouration — nitrogen is present.';
      return 'No blue colouration — nitrogen absent.';
    case 'sulphur':
      return c.hasS ? 'Violet/purple colouration with sodium nitroprusside — sulphur is present.' : 'No colouration — sulphur absent.';
    case 'sulphur2':
      return c.hasS ? 'Black precipitate (PbS) — sulphur is present.' : 'No black precipitate — sulphur absent.';
    case 'halogen':
      if (!c.hasX) return 'No precipitate with AgNO₃ — halogen absent.';
      if (c.hasX === 'Cl') return 'White precipitate, soluble in excess NH₄OH — chlorine confirmed.';
      return 'Precipitate with AgNO₃ — halogen present.';
    default:
      return '—';
  }
}

export function validate(inputs) {
  const warnings = [];
  if (!inputs.fused && inputs.test !== 'fusion') warnings.push({ field: 'test', code: 'NO_EXTRACT', message: 'No sodium fusion extract has been prepared.', why: 'Every confirmatory test in this experiment is run on the fusion extract, not on the compound directly.', fix: 'Run the sodium fusion step first.' });
  if (inputs.test === 'nitrogen' && compoundOf(inputs).hasN && compoundOf(inputs).hasS) {
    warnings.push({ field: 'test', code: 'NS_INTERFERENCE', message: 'A blood-red colour here does not mean the nitrogen test failed.', why: 'When both N and S are present, NaSCN forms instead of NaCN, and FeCl₃ gives blood-red [FeSCN]²⁺ rather than Prussian blue. This is itself the diagnostic sign that BOTH elements are present.' });
  }
  return { ok: true, errors: [], warnings };
}
export function init() { return { t: 0, elapsed: 0, glow: 0, fused: false, extract: 0 }; }
/**
 * Lassaigne's sodium fusion. The tube must actually be heated to red heat
 * with the sodium before any of N, S or halogen has been converted to its
 * ionic sodium salt -- testing the extract before the fusion is complete is
 * the classic way to get a false negative, so the glow is tracked and the
 * extract only becomes available once it is reached.
 */
export function step(state, inputs, dt) {
  const s = { ...state };
  s.t += dt; s.elapsed += dt;
  if (inputs.test === 'fusion' || inputs.fused) {
    s.glow = Math.min(1, s.glow + dt * 0.22);
    s.fused = s.glow > 0.92;
    if (s.fused) s.extract = Math.min(1, s.extract + dt * 0.25);
  }
  return s;
}

export function measure(state, inputs, seed = 1, trial = 1) {
  return { trial, compound: compoundOf(inputs).label, test: (TESTS[inputs.test] || {}).label, observation: observation(inputs), _compound: inputs.compound, _fusedOk: inputs.fused || inputs.test === 'fusion' };
}

export function derive(rows) {
  if (rows.length < 3) return { ok: false, reason: 'Run at least the fusion and two confirmatory tests.' };
  const testsRun = new Set(rows.map((r) => r.test));
  const validRows = rows.filter((r) => r._fusedOk);
  return { ok: true, testsRun: testsRun.size, validReadings: validRows.length, compound: rows[0].compound, n: rows.length, points: [] };
}

export default { meta, defaults, COMPOUNDS, TESTS, init, step, measure, derive, validate, compoundOf, observation };
