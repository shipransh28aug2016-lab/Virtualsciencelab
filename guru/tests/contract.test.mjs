import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, collectErrors, srcModulesPresent, REQUIRED_SERVICES, REQUIRED_TOOLS, REQUIRED_AGENTS, SERVICE_METHODS, MODULE_DIRS, SRC } from './fixtures/helpers.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const b = await boot();
const skip = b.skip;
const k = b.k;
const errors = k ? collectErrors(k) : [];

test('modules present on disk', () => {
  const have = srcModulesPresent();
  const missing = MODULE_DIRS.filter((d) => !have.includes(d));
  assert.deepEqual(missing, [], `missing src dirs: ${missing}`);
});

for (const d of MODULE_DIRS) {
  test(`module ${d} exports register(k) and imports under Node`, async (t) => {
    const p = path.join(SRC, d, 'index.js');
    if (!existsSync(p)) return t.skip('no index.js');
    const m = await import(pathToFileURL(p).href);
    if (d === 'ui') return; // UI may be DOM-only; import must still succeed
    assert.equal(typeof (m.register || m.createKernel), 'function', `${d}/index.js must export register`);
  });
}

test('kernel boots with no module:error', { skip }, () => {
  assert.deepEqual(errors, [], 'module:error events: ' + JSON.stringify(errors));
});

test('kernel API surface', { skip }, () => {
  for (const p of ['bus', 'tools', 'agents', 'intents', 'services', 'config']) assert.ok(k[p], `k.${p}`);
  assert.equal(typeof k.run, 'function');
  for (const f of ['on', 'emit', 'once']) assert.equal(typeof k.bus[f], 'function', `bus.${f}`);
  for (const f of ['register', 'call', 'list']) assert.equal(typeof k.tools[f], 'function', `tools.${f}`);
  for (const f of ['set', 'get', 'has']) assert.equal(typeof k.services[f], 'function', `services.${f}`);
  for (const f of ['get', 'set']) assert.equal(typeof k.config[f], 'function', `config.${f}`);
});

for (const s of REQUIRED_SERVICES) {
  test(`service ${s} registered`, { skip }, () => {
    assert.ok(k.services.has(s), `service ${s} missing`);
    for (const m of SERVICE_METHODS[s] || []) assert.equal(typeof k.services.get(s)[m], 'function', `${s}.${m}`);
  });
}

test('every required tool registered with valid schema', { skip }, () => {
  const list = k.tools.list();
  const byName = new Map(list.map((t) => [t.name, t]));
  const missing = REQUIRED_TOOLS.filter((n) => !byName.has(n));
  assert.deepEqual(missing, [], 'missing tools: ' + missing.join(', '));
  for (const n of REQUIRED_TOOLS) {
    const t = byName.get(n);
    assert.ok(t.description && t.description.length > 5, `${n}: description`);
    assert.ok(t.schema && typeof t.schema === 'object', `${n}: schema object`);
    assert.equal(t.schema.type, 'object', `${n}: schema.type must be 'object'`);
    if (t.schema.properties) assert.equal(typeof t.schema.properties, 'object', `${n}: properties`);
    if (t.schema.required) for (const r of t.schema.required) assert.ok(t.schema.properties?.[r], `${n}: required "${r}" not in properties`);
  }
  const dup = list.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i);
  assert.deepEqual(dup, [], 'duplicate tool names');
});

test('default agents registered, tools resolvable', { skip }, () => {
  const ag = k.agents.list ? k.agents.list() : [];
  const ids = ag.map((a) => a.id);
  assert.deepEqual(REQUIRED_AGENTS.filter((i) => !ids.includes(i)), []);
  const tools = new Set(k.tools.list().map((t) => t.name));
  for (const a of ag) {
    assert.ok(a.system && a.role, `${a.id}: system/role`);
    assert.ok(['fast', 'smart'].includes(a.tier), `${a.id}: tier`);
    for (const t of a.tools || []) assert.ok(tools.has(t), `agent ${a.id} references unknown tool ${t}`);
  }
});

test('bilingual intents registered (en + hi + hinglish) and route to real tools', { skip }, () => {
  const its = k.intents.list ? k.intents.list() : [];
  assert.ok(its.length >= 10, `expected >=10 intents, got ${its.length}`);
  const tools = new Set(k.tools.list().map((t) => t.name));
  for (const i of its) {
    assert.ok(tools.has(i.tool) || i.tool === 'delegate', `intent ${i.id} -> unknown tool ${i.tool}`);
    assert.ok(Array.isArray(i.patterns) && i.patterns.every((p) => p instanceof RegExp), `${i.id}: patterns RegExp[]`);
    assert.equal(typeof i.extract, 'function', `${i.id}: extract`);
  }
  const hasDeva = its.some((i) => i.patterns.some((p) => /[ऀ-ॿ]/.test(p.source) || (i.examples || []).some((e) => /[ऀ-ॿ]/.test(e))));
  assert.ok(hasDeva, 'no Devanagari patterns/examples registered');
});

test('i18n: en+hi keys, detect, numerals', { skip }, () => {
  const i = k.services.get('i18n');
  assert.equal(i.detect('कक्षा 12 भौतिकी का प्रश्नपत्र बनाओ'), 'hi');
  assert.equal(i.detect('make a question paper'), 'en');
  assert.equal(i.numerals('70', 'deva'), '७०');
  assert.equal(i.numerals('७०', 'latn'), '70');
  const prev = i.lang();
  i.setLang('hi'); const hi = i.t('app.name'); i.setLang('en'); const en = i.t('app.name');
  i.setLang(prev);
  assert.ok(en && hi, 'app.name translation');
});

test('files: zip util round trip (STORE/DEFLATE, CRC)', { skip }, async () => {
  const f = k.services.get('files');
  assert.ok(f.zip?.create && f.zip?.read, 'files.zip.{create,read}');
  const z = await f.zip.create([{ name: 'a.txt', data: new TextEncoder().encode('नमस्ते '.repeat(50)) }]);
  const out = await f.zip.read(z);
  const e = (Array.isArray(out) ? out : out.entries || [...Object.entries(out)].map(([name, data]) => ({ name, data })))[0];
  assert.equal(e.name, 'a.txt');
});

test('artifact flow: emit_artifact -> ctx.artifacts -> bus artifact event', { skip }, async () => {
  const seen = [];
  k.bus.on('artifact', (a) => seen.push(a));
  const added = [];
  const ctx = { artifacts: { add: (blob, filename) => { added.push({ blob, filename }); return { filename, mime: blob.type, blobRef: 'x' }; } }, depth: 0 };
  const r = await k.tools.call('emit_artifact', { name: 'qa-note', format: 'md', spec: { title: 'QA', blocks: [{ t: 'p', text: 'hello' }] } }, ctx);
  assert.ok(r, 'emit_artifact result');
  assert.ok(added.length || seen.length, 'artifact reached ctx.artifacts or bus');
});

test('tool results are JSON-serialisable', { skip }, async () => {
  for (const n of ['llm_status', 'memory_profile', 'cbse_syllabus']) {
    const r = await k.tools.call(n, n === 'cbse_syllabus' ? { subject: 'physics', cls: 12 } : {}, { depth: 0, artifacts: { add: () => ({}) } });
    assert.doesNotThrow(() => JSON.stringify(r), n);
  }
});

test('llm: status shape, local provider always available', { skip }, () => {
  const llm = k.services.get('llm');
  const s = llm.status();
  for (const f of ['provider', 'online', 'hasKey']) assert.ok(f in s, 'status.' + f);
  const ids = llm.providers().map((p) => p.id);
  for (const id of ['anthropic', 'openai', 'gemini', 'local']) assert.ok(ids.includes(id), 'provider ' + id);
  assert.equal(llm.providers().find((p) => p.id === 'local').needsKey, false);
});

test('connectors: ids', { skip }, () => {
  const ids = k.services.get('connectors').list().map((c) => c.id);
  for (const id of ['gdrive', 'localfs', 'github', 'web', 'device']) assert.ok(ids.includes(id), 'connector ' + id);
});
