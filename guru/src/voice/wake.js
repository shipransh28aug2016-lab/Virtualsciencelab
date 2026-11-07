// Optional hands-free wake word: "Hey Guru" / "गुरु जी". Uses continuous listening supplied by the caller.
import { normalize } from './commands.js';

const PREFIX = '(?:(?:hey|hi|hello|ok|okay|ae|are|arre|sun|suno|हे|हेलो|हैलो|हाय|ओके|अरे|ए|सुनो|सुन)\\s+)?';
const NAME = '(?:guru\\s?ji|gurooji|guruji|guru|gooru|गुरु\\s?जी|गुरुजी|गुरु)';
const WAKE_RE = new RegExp(`^${PREFIX}${NAME}(?=\\s|$)\\s*(.*)$`, 'u');

/**
 * Does an utterance start with the wake phrase?
 * @param {string} text
 * @returns {{matched:boolean, rest:string}} rest = what was said after the wake word
 */
export function matchWake(text) {
  // Normalize drops "guru"/"hey" filler, so match against a lighter cleanup here.
  const s = String(text ?? '').normalize('NFC').toLowerCase().replace(/\u093C/g, '').replace(/[.,!?;:"'।॥]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = WAKE_RE.exec(s);
  if (!m) return { matched: false, rest: '' };
  return { matched: true, rest: normalizeRest(m[1]) };
}

function normalizeRest(r) { return String(r || '').trim(); }

/**
 * Create a wake-word controller.
 * @param {{listen:Function, onWake:(e:{rest:string,text:string,command?:any})=>void, parse?:(t:string)=>any, onState?:(on:boolean)=>void}} o
 */
export function createWake(o) {
  let handle = null;
  let on = false;
  const loop = () => {
    handle = o.listen({
      lang: 'auto', continuous: true,
      onFinal: (text) => {
        const m = matchWake(text);
        if (!m.matched) return;
        o.onWake({ rest: m.rest, text, command: m.rest && o.parse ? o.parse(m.rest) : null });
      },
      onEnd: () => { if (on) setTimeout(() => { if (on) loop(); }, 400); },
      onError: (e) => { if (e && (e.code === 'not-allowed' || e.code === 'service-not-allowed' || e.code === 'unsupported')) { on = false; if (o.onState) o.onState(false); } },
    });
  };
  return {
    start() { if (on) return; on = true; if (o.onState) o.onState(true); loop(); },
    stop() { on = false; if (handle) handle.stop(); handle = null; if (o.onState) o.onState(false); },
    get active() { return on; },
  };
}

export { normalize };
