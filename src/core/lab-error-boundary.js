/**
 * Per-lab error boundary.
 *
 * A simulation is 76 independent physics models and 8 renderers drawing into
 * one shared canvas from inside one shared requestAnimationFrame loop. Before
 * this module existed, a single throw anywhere in that path escaped the rAF
 * callback, so the line that re-arms the loop was never reached: the loop died
 * permanently, the picture froze, and the student was told nothing at all.
 * One bad model took the whole laboratory down in silence.
 *
 * The contract here is the one the rest of the app relies on: a failure is
 * contained to the experiment that caused it, it is always visible, and it is
 * always recoverable without a page reload. Navigation, the observation table,
 * the notebook and every other lab keep working.
 */

const OVERLAY_ID = 'labError';

/** Anything that reaches a student is a sentence, not a stack trace. */
function describe(error) {
  const raw = (error && (error.message || error.toString())) || 'Unknown error';
  return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Take over the canvas with a recoverable failure panel.
 *
 * @param {object}   o
 * @param {string}   o.where     the stage that failed, in the student's words
 * @param {Error}    o.error     the original throw, kept for the report text
 * @param {string}   [o.expId]   experiment id, shown so a report can identify it
 * @param {Function} [o.onRetry] re-run the failed stage from a clean state
 * @param {Function} [o.onReset] rebuild the experiment from scratch
 */
export function showLabError({ where, error, expId, onRetry, onReset }) {
  const wrap = document.querySelector('.canvas-wrap');
  if (!wrap) return;
  clearLabError();

  const detail = describe(error);
  const el = document.createElement('div');
  el.className = 'lab-error';
  el.id = OVERLAY_ID;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="lab-error-card">
      <h3>Simulation could not be loaded.</h3>
      <p>The apparatus stopped while ${esc(where)}. Nothing you have recorded is lost —
         your observation table, notebook and every other experiment are unaffected.</p>
      <div class="lab-error-actions">
        <button class="btn primary" data-act="retry">Retry</button>
        <button class="btn" data-act="reset">Reset experiment</button>
        <button class="btn ghost" data-act="report">Report problem</button>
      </div>
      <details class="lab-error-detail">
        <summary>Technical detail</summary>
        <code>${esc(expId ? `${expId} · ` : '')}${esc(detail)}</code>
      </details>
    </div>`;

  el.querySelector('[data-act=retry]').onclick = () => { clearLabError(); onRetry?.(); };
  el.querySelector('[data-act=reset]').onclick = () => { clearLabError(); onReset?.(); };
  el.querySelector('[data-act=report]').onclick = () => copyReport(expId, where, detail);
  wrap.appendChild(el);
}

/**
 * "Report problem" with no server to report to.
 *
 * This application has no backend and sends nothing anywhere — so the honest
 * implementation is to hand the student the text a teacher can act on, rather
 * than pretend a ticket was filed.
 */
async function copyReport(expId, where, detail) {
  const text = [
    'CBSE V-Lab — simulation failure report',
    `Experiment : ${expId || 'unknown'}`,
    `Stage      : ${where}`,
    `Error      : ${detail}`,
    `When       : ${new Date().toISOString()}`,
    `Browser    : ${navigator.userAgent}`,
  ].join('\n');
  try {
    await navigator.clipboard.writeText(text);
    announce('Report copied — paste it to your teacher.');
  } catch {
    // Clipboard is blocked without a user gesture in some browsers, and over
    // plain http. Falling back to a selectable block still gets the text out.
    const box = document.querySelector('#labError .lab-error-detail');
    if (box) { box.open = true; announce('Copy the technical detail below.'); }
  }
}

function announce(msg) {
  const t = document.querySelector('#toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show';
  setTimeout(() => { t.className = 'toast'; }, 3200);
}

/** Remove the panel, if one is up. Safe to call unconditionally. */
export function clearLabError() {
  document.getElementById(OVERLAY_ID)?.remove();
}

/** True while a lab is showing a failure, so callers can avoid re-entering it. */
export function isLabFailed() {
  return !!document.getElementById(OVERLAY_ID);
}
