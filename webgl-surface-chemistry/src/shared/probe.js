/**
 * A deliberate, opt-in window onto a bench's store, for the render checks.
 *
 * The render probes drive the real interface and read the real readouts, which
 * is the point of them — but when a readout and the engine disagree there is no
 * way to tell from outside which of the two is wrong, and a probe that can only
 * see the DOM can only report that something is off. With the store reachable,
 * a check can assert that the number on screen IS the number the engine
 * computed, which is a different and stronger statement.
 *
 * Off unless the page is opened with ?probe=1, so nothing is exposed to a
 * student's browser. The query goes before the hash: /?probe=1#/XI-CHE-B03
 */
export function exposeForProbe(code, store) {
  if (typeof window === 'undefined') return;
  try {
    if (!new URLSearchParams(window.location.search).has('probe')) return;
    window.__labs = window.__labs || {};
    window.__labs[code] = store;
  } catch {
    /* A browser that will not give us the location is a browser we do not
       need to expose anything to. */
  }
}
