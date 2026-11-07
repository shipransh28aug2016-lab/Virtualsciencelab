import test from 'node:test';
import assert from 'node:assert/strict';
import { createSSEParser, readSSE } from '../src/llm/sse.js';
import { createKeyVault } from '../src/llm/keys.js';
import { createHttp } from '../src/llm/http.js';
import { createLLM, register } from '../src/llm/index.js';
import * as local from '../src/llm/local.js';

const enc = new TextEncoder();
function sseResponse(events, { chunk = 7, status = 200 } = {}) {
  const raw = enc.encode(events.map((e) => (typeof e === 'string' ? e : `${e.event ? `event: ${e.event}\n` : ''}data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`)).join(''));
  const body = new ReadableStream({
    start(c) { for (let i = 0; i < raw.length; i += chunk) c.enqueue(raw.slice(i, i + chunk)); c.close(); },
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } });
}
const jsonRes = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
function mockFetch(handler) {
  const calls = [];
  const f = async (url, init) => { const body = init.body ? JSON.parse(init.body) : undefined; calls.push({ url, init, body, headers: init.headers }); return handler(calls.length, { url, init, body }); };
  f.calls = calls;
  return f;
}
const memStore = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const noSleep = async () => {};
const tools = [{ name: 'cbse_syllabus', description: 'Get syllabus', schema: { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'], additionalProperties: false } }];
const mk = (fetch, extra = {}) => createLLM({ fetch, sleep: noSleep, storage: memStore(), ...extra });

test('sse parser: chunk boundaries, CRLF, multiline data, comments', async () => {
  const out = [];
  const p = createSSEParser((e) => out.push(e));
  const text = ': ping\r\nevent: a\r\ndata: one\r\ndata: two\r\n\r\ndata: x\n\ndata: [DONE]\n\n';
  for (const ch of text) p.push(ch);
  p.end();
  assert.deepEqual(out.map((e) => [e.event, e.data]), [['a', 'one\ntwo'], ['message', 'x'], ['message', '[DONE]']]);
  const evs = [];
  for await (const e of readSSE(sseResponse([{ data: { n: 1 } }, { data: { n: 2 } }], { chunk: 3 }).body)) evs.push(JSON.parse(e.data).n);
  assert.deepEqual(evs, [1, 2]);
});

test('anthropic: streaming text + tool_use, headers, schema and tier models', async () => {
  const f = mockFetch(() => sseResponse([
    { event: 'message_start', data: { type: 'message_start', message: { usage: { input_tokens: 11, output_tokens: 1 } } } },
    { data: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } },
    { data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } } },
    { data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } } },
    { data: { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'cbse_syllabus', input: {} } } },
    { data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"subject":' } } },
    { data: { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '"Physics"}' } } },
    { data: { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 22 } } },
    { data: { type: 'message_stop' } },
  ]));
  const llm = mk(f);
  await llm.setKey('anthropic', 'sk-ant-secret-123');
  llm.setProvider('anthropic');
  const tokens = [];
  const r = await llm.chat({ messages: [{ role: 'user', content: 'hi' }], system: 'be brief', tools, onToken: (t) => tokens.push(t), tier: 'fast' });
  assert.equal(r.text, 'Hello');
  assert.equal(tokens.join(''), 'Hello');
  assert.deepEqual(r.toolCalls, [{ id: 'tu_1', name: 'cbse_syllabus', args: { subject: 'Physics' } }]);
  assert.deepEqual(r.usage, { in: 11, out: 22 });
  assert.equal(r.provider, 'anthropic');
  const c = f.calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(c.headers['x-api-key'], 'sk-ant-secret-123');
  assert.equal(c.body.model, 'claude-haiku-5-5');
  assert.equal(c.body.stream, true);
  assert.equal(c.body.system, 'be brief');
  assert.equal(c.body.tools[0].input_schema.properties.subject.type, 'string');
});

test('anthropic: non-stream + tool result round-trip conversion', async () => {
  const f = mockFetch(() => jsonRes({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 'x', name: 'cbse_syllabus', input: { subject: 'Chem' } }], usage: { input_tokens: 3, output_tokens: 4 } }));
  const llm = mk(f);
  await llm.setKey('anthropic', 'k-anthropic');
  llm.setProvider('anthropic');
  const r = await llm.chat({
    tier: 'smart', tools,
    messages: [
      { role: 'user', content: 'syllabus?' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'a1', name: 'cbse_syllabus', args: { subject: 'Physics' } }] },
      { role: 'tool', toolCallId: 'a1', name: 'cbse_syllabus', content: '{"units":5}' },
    ],
  });
  assert.equal(r.toolCalls[0].args.subject, 'Chem');
  assert.equal(f.calls[0].body.model, 'claude-sonnet-5-5');
  const m = f.calls[0].body.messages;
  assert.equal(m[1].content[0].type, 'tool_use');
  assert.deepEqual(m[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a1', content: '{"units":5}' }] });
});

test('openai-compatible: stream tool_calls accumulate, baseUrl, keyless custom server', async () => {
  const f = mockFetch(() => sseResponse([
    { data: { choices: [{ delta: { content: 'Hi ' } }] } },
    { data: { choices: [{ delta: { content: 'there' } }] } },
    { data: { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_9', function: { name: 'cbse_syllabus', arguments: '{"subj' } }] } }] } },
    { data: { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ect":"Maths"}' } }] } }] } },
    { data: { choices: [{ delta: {}, finish_reason: 'tool_calls' }] } },
    { data: { choices: [], usage: { prompt_tokens: 5, completion_tokens: 6 } } },
    '[DONE]',
  ].map((e) => (e === '[DONE]' ? 'data: [DONE]\n\n' : e))));
  const llm = mk(f);
  llm.setBaseUrl('openai', 'http://localhost:11434/v1/');
  llm.setProvider('openai');
  assert.equal(llm.status().hasKey, true); // custom base url: key optional
  const r = await llm.chat({ messages: [{ role: 'user', content: 'x' }], tools, stream: true });
  assert.equal(r.text, 'Hi there');
  assert.deepEqual(r.toolCalls, [{ id: 'call_9', name: 'cbse_syllabus', args: { subject: 'Maths' } }]);
  assert.deepEqual(r.usage, { in: 5, out: 6 });
  assert.equal(f.calls[0].url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(f.calls[0].body.tools[0].type, 'function');
  assert.equal(f.calls[0].headers.authorization, undefined);
});

test('openai: json mode, tool message conversion, non-stream', async () => {
  const f = mockFetch(() => jsonRes({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
  const llm = mk(f);
  await llm.setKey('openai', 'sk-oai');
  const r = await llm.chat({ provider: 'openai', json: true, system: 'S', messages: [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'calling', toolCalls: [{ id: 'c1', name: 't', args: { z: 1 } }] },
    { role: 'tool', toolCallId: 'c1', content: 'res' },
  ] });
  assert.equal(r.text, '{"a":1}');
  const b = f.calls[0].body;
  assert.equal(f.calls[0].headers.authorization, 'Bearer sk-oai');
  assert.deepEqual(b.response_format, { type: 'json_object' });
  assert.equal(b.messages[2].tool_calls[0].function.arguments, '{"z":1}');
  assert.deepEqual(b.messages[3], { role: 'tool', tool_call_id: 'c1', content: 'res' });
  assert.equal(b.model, 'gpt-4.1');
});

test('gemini: streamGenerateContent + functionDeclarations + functionResponse', async () => {
  const f = mockFetch(() => sseResponse([
    { data: { candidates: [{ content: { parts: [{ text: 'Sure ' }] } }] } },
    { data: { candidates: [{ content: { parts: [{ text: 'thing' }, { functionCall: { name: 'cbse_syllabus', args: { subject: 'Eco' } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 9 } } },
  ]));
  const llm = mk(f);
  await llm.setKey('gemini', 'g-key-123');
  llm.setProvider('gemini');
  const r = await llm.chat({ messages: [
    { role: 'user', content: 'go' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'q', name: 'cbse_syllabus', args: {} }] },
    { role: 'tool', toolCallId: 'q', content: '{"ok":true}' },
  ], tools: [...tools, { name: 'noargs', description: 'd', schema: { type: 'object', properties: {} } }], onToken: () => {}, tier: 'fast' });
  assert.equal(r.text, 'Sure thing');
  assert.equal(r.toolCalls[0].name, 'cbse_syllabus');
  assert.deepEqual(r.toolCalls[0].args, { subject: 'Eco' });
  assert.ok(r.toolCalls[0].id);
  assert.deepEqual(r.usage, { in: 8, out: 9 });
  const c = f.calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
  assert.equal(c.headers['x-goog-api-key'], 'g-key-123');
  const decl = c.body.tools[0].functionDeclarations;
  assert.equal(decl[0].parameters.additionalProperties, undefined);
  assert.equal(decl[1].parameters, undefined);
  assert.deepEqual(c.body.contents[1].parts[0].functionCall, { name: 'cbse_syllabus', args: {} });
  assert.deepEqual(c.body.contents[2].parts[0].functionResponse, { name: 'cbse_syllabus', response: { ok: true } });
});

test('all providers return the same normalised shape', async () => {
  const handlers = {
    anthropic: () => jsonRes({ content: [{ type: 'tool_use', id: 'i', name: 'cbse_syllabus', input: { subject: 'P' } }], usage: {} }),
    openai: () => jsonRes({ choices: [{ message: { content: null, tool_calls: [{ id: 'i', function: { name: 'cbse_syllabus', arguments: '{"subject":"P"}' } }] } }] }),
    gemini: () => jsonRes({ candidates: [{ content: { parts: [{ functionCall: { name: 'cbse_syllabus', args: { subject: 'P' } } }] } }] }),
  };
  for (const [id, h] of Object.entries(handlers)) {
    const llm = mk(mockFetch(h));
    await llm.setKey(id, 'key-' + id);
    const r = await llm.chat({ provider: id, messages: [{ role: 'user', content: 'x' }], tools });
    assert.equal(r.toolCalls.length, 1, id);
    assert.equal(r.toolCalls[0].name, 'cbse_syllabus');
    assert.deepEqual(r.toolCalls[0].args, { subject: 'P' });
    assert.equal(typeof r.toolCalls[0].id, 'string');
    assert.equal(r.text, '');
    assert.equal(typeof r.usage.in, 'number');
    assert.equal(r.provider, id);
  }
});

test('retry: 429/503 retried honoring backoff, 400 not retried, key redacted', async () => {
  const sleeps = [];
  const f = mockFetch((n) => (n === 1 ? jsonRes({ error: { message: 'slow down' } }, 429, { 'retry-after': '2' }) : n === 2 ? new Response('busy', { status: 503 }) : jsonRes({ content: [{ type: 'text', text: 'finally' }], usage: {} })));
  const http = createHttp({ fetch: f, sleep: async (ms) => { sleeps.push(ms); }, retries: 3 });
  const llm = createLLM({ http, storage: memStore() });
  await llm.setKey('anthropic', 'sk-ant-abcdef');
  const r = await llm.chat({ provider: 'anthropic', messages: [{ role: 'user', content: 'x' }] });
  assert.equal(r.text, 'finally');
  assert.equal(f.calls.length, 3);
  assert.equal(sleeps[0], 2000);
  assert.ok(sleeps[1] >= 1000 && sleeps[1] < 1300);

  const bad = mockFetch(() => jsonRes({ error: { message: 'invalid key sk-ant-abcdef' } }, 400));
  const llm2 = createLLM({ http: createHttp({ fetch: bad, sleep: noSleep }), storage: memStore() });
  await llm2.setKey('anthropic', 'sk-ant-abcdef');
  await assert.rejects(llm2.chat({ provider: 'anthropic', fallback: false, messages: [{ role: 'user', content: 'x' }] }), (e) => {
    assert.equal(e.status, 400);
    assert.ok(!e.message.includes('sk-ant-abcdef'));
    return true;
  });
  assert.equal(bad.calls.length, 1);
});

test('retry on network error, then gives up after max retries', async () => {
  const f = mockFetch(() => { throw new TypeError('fetch failed'); });
  const http = createHttp({ fetch: f, sleep: noSleep, retries: 2 });
  await assert.rejects(http.json('http://x', { method: 'POST', headers: {} }, { provider: 't' }), /network error/);
  assert.equal(f.calls.length, 3);
});

test('timeout and abort', async () => {
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted by signal'))));
  const http = createHttp({ fetch: hang, sleep: noSleep, retries: 0, timeoutMs: 25 });
  await assert.rejects(http.json('http://x', { headers: {} }, { provider: 't' }), (e) => e.code === 'timeout');
  const ac = new AbortController();
  const p = createHttp({ fetch: hang, sleep: noSleep, retries: 0, timeoutMs: 0 }).json('http://x', { headers: {} }, { signal: ac.signal });
  setTimeout(() => ac.abort(), 10);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('abort mid-stream raises AbortError (no local fallback)', async () => {
  const ac = new AbortController();
  const body = new ReadableStream({ start(c) { c.enqueue(enc.encode('data: {"type":"content_block_start","index":0,"content_block":{"type":"text"}}\n\n')); /* never closes */ } });
  const llm = mk(mockFetch(() => new Response(body, { status: 200 })));
  await llm.setKey('anthropic', 'k-123456');
  const p = llm.chat({ provider: 'anthropic', signal: ac.signal, onToken: () => {}, messages: [{ role: 'user', content: 'x' }] });
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('key vault: plain, passphrase round-trip, wrong passphrase, lock/unlock, no plaintext at rest', async () => {
  const store = memStore();
  const v = createKeyVault({ storage: store, iterations: 1000 });
  await v.set('openai', 'sk-plain-111');
  assert.equal(await v.get('openai'), 'sk-plain-111');
  await v.set('anthropic', 'sk-ant-TOPSECRET', { passphrase: 'correct horse' });
  const raw = [...store._m.values()].join('');
  assert.ok(!raw.includes('TOPSECRET'));
  assert.equal(v.isEncrypted('anthropic'), true);
  assert.equal(await v.get('anthropic'), 'sk-ant-TOPSECRET'); // cached in session

  const v2 = createKeyVault({ storage: store, iterations: 1000 }); // fresh session
  assert.equal(v2.has('anthropic'), true);
  assert.equal(v2.isLocked('anthropic'), true);
  assert.equal(await v2.get('anthropic'), null);
  await assert.rejects(v2.get('anthropic', { passphrase: 'wrong' }), /Wrong passphrase/);
  assert.deepEqual(await v2.unlock('wrong'), { unlocked: 0, failed: 1 });
  assert.deepEqual(await v2.unlock('correct horse'), { unlocked: 1, failed: 0 });
  assert.equal(await v2.get('anthropic'), 'sk-ant-TOPSECRET');
  v2.lock();
  assert.equal(v2.isLocked('anthropic'), true);
  v2.remove('anthropic');
  assert.equal(v2.has('anthropic'), false);
  assert.deepEqual(v2.list().map((x) => x.provider), ['openai']);
});

test('service: locked encrypted key falls back to local with reason; unlock restores provider', async () => {
  const store = memStore();
  const a = createLLM({ storage: store, fetch: mockFetch(() => jsonRes({ content: [{ type: 'text', text: 'cloud' }], usage: {} })), crypto: globalThis.crypto });
  await a.setKey('anthropic', 'sk-ant-lock-test', { passphrase: 'pw' });
  const b = createLLM({ storage: store, fetch: mockFetch(() => jsonRes({ content: [{ type: 'text', text: 'cloud' }], usage: {} })) });
  assert.equal(b.status().provider, 'anthropic');
  assert.equal(b.status().locked, true);
  const r1 = await b.chat({ messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(r1.provider, 'local');
  assert.equal(r1.reason, 'locked');
  await b.unlock('pw');
  assert.equal((await b.chat({ messages: [{ role: 'user', content: 'hello' }] })).text, 'cloud');
});

test('service: no key => local; provider failure => local fallback; setProvider validates', async () => {
  const f = mockFetch(() => { throw new Error('should not be called'); });
  const llm = mk(f);
  assert.deepEqual(llm.status(), { provider: 'local', online: true, hasKey: false, locked: false, model: null });
  const r = await llm.chat({ messages: [{ role: 'user', content: 'namaste' }] });
  assert.equal(r.provider, 'local');
  assert.equal(f.calls.length, 0);
  assert.throws(() => llm.setProvider('nope'));
  assert.deepEqual(llm.providers().map((p) => p.id), ['anthropic', 'openai', 'gemini', 'local']);

  const failing = mockFetch(() => jsonRes({ error: { message: 'down' } }, 500));
  const llm2 = createLLM({ http: createHttp({ fetch: failing, sleep: noSleep, retries: 1 }), storage: memStore() });
  await llm2.setKey('gemini', 'gem-key-1');
  const r2 = await llm2.chat({ messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(r2.provider, 'local');
  assert.equal(r2.fallback, true);
  assert.equal(failing.calls.length, 2);
});

// ---------- local engine ----------
function fakeKernel() {
  const intents = [
    { id: 'syl', tool: 'cbse_syllabus', patterns: [/syllabus/i, /पाठ्यक्रम|सिलेबस/], extract: (t) => ({ subject: /physics|भौतिकी/i.test(t) ? 'Physics' : 'Commerce' }), examples: ['Class 12 Physics syllabus'] },
    { id: 'qp', tool: 'cbse_question_paper', patterns: [/question paper|प्रश्न\s*पत्र|paper banao/i], extract: () => ({ cls: 12 }), examples: ['make a question paper'] },
  ];
  return { intents: { list: () => intents, register() {} } };
}

test('local: routes en/hi/hinglish text to tool calls, works with fetch throwing', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network disabled'); };
  try {
    const k = fakeKernel();
    const llm = createLLM({ k, storage: memStore() });
    const tl = [{ name: 'cbse_syllabus', description: '', schema: {} }, { name: 'cbse_question_paper', description: '', schema: {} }];
    let r = await llm.chat({ messages: [{ role: 'user', content: 'show Physics syllabus please' }], tools: tl });
    assert.equal(r.provider, 'local');
    assert.equal(r.toolCalls[0].name, 'cbse_syllabus');
    assert.deepEqual(r.toolCalls[0].args, { subject: 'Physics' });
    r = await llm.chat({ messages: [{ role: 'user', content: 'भौतिकी का सिलेबस दिखाओ' }], tools: tl });
    assert.equal(r.toolCalls[0].args.subject, 'Physics');
    assert.match(r.text, /[ऀ-ॿ]/);
    r = await llm.chat({ messages: [{ role: 'user', content: 'mujhe class 12 ka paper banao' }], tools: tl });
    assert.equal(r.toolCalls[0].name, 'cbse_question_paper');
    // tool not offered => suggestion text, no call
    r = await llm.chat({ messages: [{ role: 'user', content: 'syllabus' }], tools: [tl[1]] });
    assert.equal(r.toolCalls.length, 0);
    // tool result => summary, no further tool calls
    r = await llm.chat({ tools: tl, messages: [
      { role: 'user', content: 'syllabus' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'l1', name: 'cbse_syllabus', args: {} }] },
      { role: 'tool', toolCallId: 'l1', name: 'cbse_syllabus', content: JSON.stringify({ artifact: { filename: 'syl.docx' } }) },
    ] });
    assert.equal(r.toolCalls.length, 0);
    assert.match(r.text, /syl\.docx/);
    // canned replies & streaming
    const toks = [];
    r = await llm.chat({ messages: [{ role: 'user', content: 'hello' }], onToken: (t) => toks.push(t) });
    assert.equal(toks.join('').trim(), r.text.trim());
    r = await llm.chat({ messages: [{ role: 'user', content: 'blah blah unknown' }] });
    assert.match(r.text, /offline/i);
    r = await llm.chat({ messages: [{ role: 'user', content: 'शुक्रिया' }] });
    assert.match(r.text, /स्वागत/);
  } finally { globalThis.fetch = realFetch; }
});

test('local: planner and critic JSON prompts return rule-based JSON', async () => {
  const k = fakeKernel();
  const plan = await local.chat(k, { json: true, system: 'You are the PLANNER. Decompose the goal into a DAG of tasks as JSON.', messages: [{ role: 'user', content: 'Goal: make a question paper for class 12' }] });
  const p = JSON.parse(plan.text);
  assert.equal(p.tasks[0].agent, 'cbse-author');
  assert.equal(p.tasks[0].tool, 'cbse_question_paper');
  assert.deepEqual(p.tasks[0].deps, []);
  const none = JSON.parse((await local.chat(k, { json: true, system: 'planner', messages: [{ role: 'user', content: 'Goal: tell me a joke' }] })).text);
  assert.equal(none.tasks[0].agent, 'tutor');

  const good = JSON.parse((await local.chat(k, { json: true, system: 'You are the CRITIC. Score the answer 0-10.', messages: [{ role: 'user', content: 'Goal: make paper\n\nAnswer: The question paper has been created with five sections and a full marking scheme.' }] })).text);
  assert.ok(good.score >= 8);
  assert.equal(good.verdict, 'pass');
  const bad = JSON.parse((await local.chat(k, { json: true, system: 'critic: score 0-10', messages: [{ role: 'user', content: 'Goal: प्रश्न पत्र बनाओ\n\nAnswer: error undefined' }] })).text);
  assert.ok(bad.score < 8);
  assert.equal(bad.verdict, 'revise');
  assert.ok(bad.issues.length >= 2);
});

test('local: honours abort signal', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(local.chat(fakeKernel(), { messages: [{ role: 'user', content: 'hi' }], signal: ac.signal }), (e) => e.name === 'AbortError');
});

test('register(): service llm + tool llm_status + intent', async () => {
  const tools = new Map(), services = new Map(), intents = [];
  const cfg = new Map();
  const k = {
    tools: { register: (t) => tools.set(t.name, t) },
    services: { set: (n, s) => services.set(n, s), get: (n) => services.get(n), has: (n) => services.has(n) },
    intents: { register: (i) => intents.push(i), list: () => intents },
    config: { get: (key, d) => (cfg.has(key) ? cfg.get(key) : d), set: (key, v) => cfg.set(key, v) },
  };
  await register(k);
  assert.ok(services.get('llm').chat);
  const st = await tools.get('llm_status').run({}, {});
  assert.equal(st.provider, 'local');
  assert.equal(st.providers.length, 4);
  assert.equal(tools.get('llm_status').schema.type, 'object');
  const r = await services.get('llm').chat({ messages: [{ role: 'user', content: 'llm status' }], tools: [{ name: 'llm_status', description: '', schema: {} }] });
  assert.equal(r.toolCalls[0].name, 'llm_status');
});
