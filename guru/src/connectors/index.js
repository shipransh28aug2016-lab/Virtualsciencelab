// Connectors module: registers service 'connectors' and all connector tools.
import { createGdrive, driveTools } from './gdrive.js';
import { createLocalFs, localTools } from './localfs.js';
import { createGithub, githubTools } from './github.js';
import { createWeb, webTools } from './web.js';
import { createDevice, deviceTools } from './device.js';

/** Build all connectors (injectable options per id for tests). */
export function createConnectors(k, opts = {}) {
  const map = {
    gdrive: createGdrive(k, opts.gdrive),
    localfs: createLocalFs(k, opts.localfs),
    github: createGithub(k, opts.github),
    web: createWeb(k, opts.web),
    device: createDevice(k, opts.device),
  };
  return {
    map,
    /** @returns {{id:string,name:string,icon:string,status:'ready'|'needs-auth'|'unsupported'}[]} */
    list() { return Object.values(map).map((c) => ({ id: c.id, name: c.name, icon: c.icon, status: c.status() })); },
    get(id) { const c = map[id]; if (!c) throw new Error(`Unknown connector: ${id}`); return c; },
    has(id) { return !!map[id]; },
    ...map,
  };
}

const TOOLS = (c) => [
  ...driveTools(c.gdrive), ...localTools(c.localfs), ...githubTools(c.github), ...webTools(c.web), ...deviceTools(c.device),
];

/** @param {object} k kernel API */
export async function register(k, opts = {}) {
  const c = createConnectors(k, opts);
  k.services.set('connectors', c);
  for (const t of TOOLS(c)) k.tools.register(t);

  try { await c.localfs.restore(); } catch { /* permission prompt happens on connect() */ }
  try { c.device.watchShares(); } catch { /* optional */ }

  if (k.intents && typeof k.intents.register === 'function') {
    const rest = (text, res) => { for (const r of res) { const m = r.exec(text); if (m && m[1]) return m[1].trim(); } return text.trim(); };
    k.intents.register({
      id: 'web_search', tool: 'web_search', examples: ['search the web for CBSE class 12 sample paper', 'वेब पर सीबीएसई सिलेबस खोजो'],
      patterns: [/\b(?:search|google|look\s*up)\b.*\b(?:web|internet|online)\b/i, /\b(?:web|internet|online)\s+(?:search|par|pe)\b/i, /(?:वेब|इंटरनेट|ऑनलाइन).*(?:खोज|सर्च)/, /(?:खोज|सर्च)\w*.*(?:वेब|इंटरनेट|ऑनलाइन)/],
      extract: (text) => ({ q: rest(text, [/(?:search|look\s*up|google)(?:\s+the)?(?:\s+web)?(?:\s+for)?\s+(.+)$/i, /(?:वेब|इंटरनेट|ऑनलाइन)\s+(?:पर|में)\s+(.+?)\s*(?:खोजो|खोजें|सर्च\s*करो)?$/]) }),
    });
    k.intents.register({
      id: 'drive_list', tool: 'drive_list', examples: ['list my drive files', 'ड्राइव की फाइलें दिखाओ'],
      patterns: [/\b(?:list|show|open)\b.*\b(?:google\s+)?drive\b/i, /\bdrive\b.*\b(?:files?|folders?)\b/i, /(?:ड्राइव|ड्राईव).*(?:फाइल|फ़ाइल|फोल्डर)/],
      extract: () => ({}),
    });
    k.intents.register({
      id: 'local_pick', tool: 'local_pick', examples: ['pick a folder on my device', 'फ़ोल्डर चुनो'],
      patterns: [/\b(?:pick|choose|select|open)\b.*\b(?:local\s+)?(?:folder|directory)\b/i, /(?:फोल्डर|फ़ोल्डर|डायरेक्टरी).*(?:चुन|खोल)/],
      extract: () => ({}),
    });
  }
  return c;
}
