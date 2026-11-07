// Guru kernel: createKernel({modules?}) → k. Modules are loaded in isolation; failures go to bus 'module:error'.
import { createBus } from './bus.js';
import { createTools } from './tools.js';
import { createAgents } from './agents.js';
import { createIntents } from './intents.js';
import { createServices } from './services.js';
import { createConfig } from './config.js';
import { createArtifacts } from './artifacts.js';
import { createOrchestrator } from './orchestrator.js';
import { registerBuiltinTools } from './builtin-tools.js';
import { registerDefaultAgents } from './agents-default.js';

export { createBus, createTools, createAgents, createIntents, createServices, createConfig, createArtifacts, createOrchestrator };

// Literal specifiers keep static analysers/bundlers happy; each import is awaited inside try/catch.
const LOADERS = {
  i18n: () => import('../i18n/index.js'),
  llm: () => import('../llm/index.js'),
  memory: () => import('../memory/index.js'),
  voice: () => import('../voice/index.js'),
  files: () => import('../files/index.js'),
  connectors: () => import('../connectors/index.js'),
  cbse: () => import('../cbse/index.js'),
};
export const DEFAULT_MODULES = Object.keys(LOADERS);

/**
 * @param {{modules?: Array<string|Function|{name?:string,register:Function}>, config?:object}} [opts]
 *   modules: replaces the default list. Entries: short name ('llm'), import specifier, register fn, or {name, register}.
 * @returns {Promise<object>} kernel API `k` (+ run, modules:{loaded,failed})
 */
export async function createKernel({ modules, config: cfgOpts } = {}) {
  const bus = createBus();
  const artifacts = createArtifacts(bus);
  const k = {
    version: '1.0.0',
    bus,
    artifacts,
    tools: createTools(bus, { artifacts }),
    agents: createAgents(bus),
    intents: createIntents(bus),
    services: createServices(bus),
    config: createConfig({ bus, ...(cfgOpts || {}) }),
    modules: { loaded: [], failed: [] },
  };
  k.orchestrator = createOrchestrator(k);
  k.run = (goal, opts) => k.orchestrator.run(goal, opts);

  registerBuiltinTools(k);
  registerDefaultAgents(k);

  const list = modules || DEFAULT_MODULES;
  for (const entry of list) {
    let name = typeof entry === 'string' ? entry : (entry && entry.name) || (typeof entry === 'function' ? entry.name : '') || 'module';
    try {
      let register;
      if (typeof entry === 'function') register = entry;
      else if (entry && typeof entry.register === 'function') register = entry.register;
      else if (typeof entry === 'string') {
        const mod = await (LOADERS[entry] ? LOADERS[entry]() : import(entry));
        register = mod.register || (mod.default && mod.default.register) || mod.default;
      }
      if (typeof register !== 'function') throw new Error(`module "${name}" does not export register(k)`);
      await register(k);
      k.modules.loaded.push(name);
    } catch (err) {
      const error = (err && err.message) || String(err);
      k.modules.failed.push({ module: name, error });
      bus.emit('module:error', { module: name, error, code: err && err.code });
    }
  }
  bus.emit('kernel:ready', { loaded: k.modules.loaded, failed: k.modules.failed.map((f) => f.module) });
  return k;
}

export default createKernel;
