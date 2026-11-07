// Shared QA helpers: boot kernel defensively (kernel API shape per CONTRACT.md).
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = path.join(ROOT, 'src');

export const REQUIRED_SERVICES = ['llm', 'memory', 'voice', 'i18n', 'files', 'connectors', 'cbse'];
export const REQUIRED_TOOLS = [
  'llm_status', 'memory_remember', 'memory_recall', 'memory_forget', 'memory_profile', 'speak',
  'file_read', 'file_write', 'file_edit',
  'drive_list', 'drive_search', 'drive_read', 'drive_write', 'local_pick', 'local_save',
  'github_get', 'github_put', 'web_fetch', 'web_search',
  'cbse_syllabus', 'cbse_blueprint', 'cbse_question_paper', 'cbse_practice_set', 'cbse_study_material',
  'cbse_marking_scheme', 'cbse_case_study', 'cbse_assertion_reason', 'cbse_mcq_bank', 'cbse_answer_check',
  'delegate', 'plan', 'critique', 'reflect', 'ask_user', 'emit_artifact', 'run_js',
];
export const REQUIRED_AGENTS = ['guru', 'planner', 'researcher', 'cbse-author', 'tutor', 'file-engineer', 'drive-ops', 'coder', 'critic', 'curator'];
export const SERVICE_METHODS = {
  llm: ['chat', 'status', 'setProvider', 'setKey', 'providers'],
  memory: ['remember', 'recall', 'forget', 'feedback', 'profile', 'reflect', 'export', 'import'],
  voice: ['supported', 'listen', 'speak', 'cancel', 'wake', 'parseCommand'],
  i18n: ['t', 'lang', 'setLang', 'detect', 'translit', 'numerals'],
  files: ['read', 'write', 'edit'],
  connectors: ['list', 'get'],
};
export const MODULE_DIRS = ['kernel', 'llm', 'memory', 'voice', 'i18n', 'files', 'connectors', 'cbse', 'ui'];

export function srcModulesPresent() {
  return MODULE_DIRS.filter((d) => existsSync(path.join(SRC, d)));
}

export async function loadCreateKernel() {
  const cands = ['kernel/index.js', 'kernel/kernel.js', 'kernel.js', 'index.js'];
  for (const c of cands) {
    const p = path.join(SRC, c);
    if (!existsSync(p)) continue;
    const m = await import(pathToFileURL(p).href);
    if (typeof m.createKernel === 'function') return m.createKernel;
  }
  return null;
}

/** Boot a kernel; always forces the local provider (no network). */
export async function boot(opts = {}) {
  const createKernel = await loadCreateKernel();
  if (!createKernel) return { skip: 'createKernel not found in src/ (kernel module missing)' };
  const k = await createKernel(opts);
  if (typeof k.boot === 'function') await k.boot();
  if (k.ready && typeof k.ready.then === 'function') await k.ready;
  try { await k.services.get('llm')?.setProvider?.('local'); } catch {}
  return { k };
}

export function collectErrors(k) {
  const errs = [];
  k.bus?.on?.('module:error', (e) => errs.push(e));
  return errs;
}

/** Run a goal and capture artifacts via bus + RunRecord. */
export async function runGoal(k, goal, opts = {}) {
  const events = [];
  const rec = await k.run(goal, { lang: 'auto', maxDepth: 3, onEvent: (e) => events.push(e), ...opts });
  return { rec, events };
}

export async function artifactBytes(art) {
  if (!art) return null;
  const b = art.blob || art.bytes || art.data;
  if (b instanceof Uint8Array) return b;
  if (b && typeof b.arrayBuffer === 'function') return new Uint8Array(await b.arrayBuffer());
  if (b instanceof ArrayBuffer) return new Uint8Array(b);
  return null;
}

export function mockFetch(handler) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls);
  };
  return { calls, restore: () => { globalThis.fetch = orig; } };
}
export const jsonRes = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
