/**
 * Assessment + viva engine (§10, §11). Fully offline, no LLM.
 * Scoring is competency-weighted: pre-lab, during-lab, post-lab, viva.
 */

export function gradeMcq(question, choiceIndex) {
  const correct = choiceIndex === question.answer;
  return {
    id: question.id,
    correct,
    chosen: choiceIndex,
    feedback: question.feedback || (correct ? 'Correct.' : 'Not quite.'),
  };
}

export function gradeNumeric(question, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) {
    return { id: question.id, correct: false, chosen: value, feedback: 'Enter a number.' };
  }
  const tol = question.tolerance ?? Math.abs(question.answer * 0.05);
  const correct = Math.abs(v - question.answer) <= tol;
  const off = ((v - question.answer) / question.answer) * 100;
  return {
    id: question.id,
    correct,
    chosen: v,
    feedback: correct
      ? `Accepted. ${question.feedback || ''}`.trim()
      : `Your value is ${off > 0 ? 'higher' : 'lower'} than expected by ${Math.abs(off).toFixed(1)}%. ${question.feedback || ''}`.trim(),
  };
}

/** During-lab checks are evaluated against the live session, not typed answers. */
export function gradeDuringLab(tasks, session) {
  return tasks.map((t) => {
    let done = false;
    const check = t.check || '';
    if (check.startsWith('rows>=')) done = (session.rows?.length || 0) >= Number(check.split('>=')[1]);
    else if (check === 'amplitude<=15') done = (session.rows || []).length > 0 && (session.rows || []).every((r) => (r.amplitudeDeg ?? 0) <= 15);
    else if (check === 'massVaried') done = new Set((session.rows || []).map((r) => r.massG)).size > 1;
    else if (check === 'wiringCorrect') done = session.wiringCorrect === true;
    else if (check === 'ratioStable') done = ratioStable(session.rows);
    else if (check === 'zeroTaken') done = (session.rows || []).some((r) => Number(r.loadG) === 0);
    else if (check === 'hasTwoF') done = (session.rows || []).some((r) => r.imageType && /same size/i.test(r.imageType));
    // ── Chemistry ──
    else if (check === 'concordant') {
      const t = (session.rows || []).map((r) => Number(r.volumeUsed)).filter(Number.isFinite);
      done = t.some((v, i) => t.some((w, j) => i !== j && Math.abs(v - w) <= 0.2));
    } else if (check === 'correctIndicator') done = session.correctIndicator === true;
    else if (check === 'volumeConstant') {
      const totals = (session.rows || [])
        .map((r) => Number(r.thioVolume) + Number(r.waterVolume) + Number(r.hclVolume))
        .filter(Number.isFinite);
      done = totals.length >= 2 && totals.every((v) => Math.abs(v - totals[0]) < 0.5);
    } else if (check === 'tempVaried') done = new Set((session.rows || []).map((r) => r.tempC)).size > 1;
    else done = Boolean(session[check]);
    return { id: t.id, correct: done, question: t.question, feedback: done ? 'Done.' : 'Not yet completed.' };
  });
}

function ratioStable(rows = []) {
  const rs = rows.map((r) => Number(r.ratio)).filter((v) => Number.isFinite(v) && v > 0);
  if (rs.length < 3) return false;
  const m = rs.reduce((a, b) => a + b, 0) / rs.length;
  return rs.every((v) => Math.abs(v - m) / m < 0.15);
}

/**
 * Viva is self-assessed against a model answer (offline, no NLP): the student
 * answers, then reveals the expected concept and marks their own understanding.
 * Honest and pedagogically sound without pretending to grade free text.
 */
export function vivaScore(attempts = []) {
  if (!attempts.length) return 0;
  const got = attempts.filter((a) => a.selfRating === 'confident').length;
  const partial = attempts.filter((a) => a.selfRating === 'partial').length;
  return Math.round(((got + partial * 0.5) / attempts.length) * 100);
}

/** Overall competency score out of 100 using the experiment's weights. */
export function overallScore(experiment, results) {
  const w = experiment.assessment.weights || { preLab: 25, duringLab: 25, postLab: 25, viva: 25 };
  const pct = (list) => (list && list.length ? (list.filter((r) => r.correct).length / list.length) * 100 : 0);
  const parts = {
    preLab: pct(results.preLab),
    duringLab: pct(results.duringLab),
    postLab: pct(results.postLab),
    viva: results.vivaPercent ?? 0,
  };
  const total = Object.entries(w).reduce((s, [k, weight]) => s + (parts[k] * weight) / 100, 0);
  return { total: Math.round(total), parts, weights: w };
}

export function masteryBand(score) {
  if (score >= 85) return { band: 'Mastered', tone: 'good' };
  if (score >= 65) return { band: 'Proficient', tone: 'good' };
  if (score >= 45) return { band: 'Developing', tone: 'warn' };
  return { band: 'Needs practice', tone: 'bad' };
}

/** Compare the student's derived result against the expected value. */
/**
 * Compare the student's derived value with the accepted one.
 *
 * The key is taken from the experiment's own `expectedResult.symbol` first and
 * then `calculations.resultKeys`. An earlier version used a hardcoded map of
 * physics keys (g, k, rho, fMean...), so chemistry silently fell through to
 * `slope` and reported "differs by −97.5%" for a perfectly correct titration.
 * Never hardcode per-subject keys here — the data files declare them.
 */
export function checkResult(experiment, derived) {
  const exp = experiment.expectedResult;
  if (!exp || !derived?.ok) return null;

  const candidates = [exp.symbol, ...(experiment.calculations?.resultKeys || [])];
  const key = candidates.find((k) => k && Number.isFinite(derived[k]));
  if (!key) return null;

  const value = derived[key];
  const within = Math.abs(value - exp.value) <= exp.tolerance;
  const errPct = exp.value === 0 ? 0 : ((value - exp.value) / exp.value) * 100;
  return { value, expected: exp.value, unit: exp.unit, within, errPct, symbol: exp.symbol, key };
}
