import test from 'node:test';
import assert from 'node:assert/strict';
import { createKernel } from '../src/kernel/index.js';

const sleep = (ms, signal) => new Promise((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
});
const agentOf = (req) => (/\[agent:([\w-]+)\]/.exec(req.system || '') || [])[1];
const isSynth = (req) => /FINAL answer/.test(req.system || '');
const lastUser = (req) => String(req.messages[req.messages.length - 1].content);

/** Scripted fake LLM: handler(req, ctx) → {text?, toolCalls?, usage?}. Tracks concurrency. */
function fakeLlm(handler, provider = 'fake') {
  const state = { calls: [], inflight: 0, maxInflight: 0 };
  return {
    state,
    status: () => ({ provider, online: true, hasKey: true }),
    async chat(req) {
      state.calls.push(req);
      state.inflight++; state.maxInflight = Math.max(state.maxInflight, state.inflight);
      try {
        const r = await handler(req, state);
        return { text: '', toolCalls: [], usage: { in: 10, out: 10 }, provider, ...r };
      } finally { state.inflight--; }
    },
  };
}
const withLlm = (llm, extra = []) => [{ name: 'llm', register: (k) => k.services.set('llm', llm) }, ...extra];
const critic9 = (req) => ({ text: JSON.stringify({ score: 9, issues: [], summary: 'ok' }) });

test('bus, tools, config, services basics', async () => {
  const k = await createKernel({ modules: [] });
  const seen = [];
  const off = k.bus.on('x', (p) => seen.push(p));
  k.bus.on('x', () => { throw new Error('handler boom'); });
  k.bus.emit('x', 1); off(); k.bus.emit('x', 2);
  assert.deepEqual(seen, [1]);
  k.tools.register({ name: 'add', description: 'add', schema: { type: 'object', required: ['a', 'b'] }, run: async ({ a, b }) => a + b });
  assert.equal(await k.tools.call('add', { a: 1, b: 2 }), 3);
  await assert.rejects(() => k.tools.call('add', { a: 1 }), /missing required/);
  await assert.rejects(() => k.tools.call('nope', {}), /Unknown tool/);
  k.config.set('lang', 'hi');
  assert.equal(k.config.get('lang'), 'hi');
  assert.equal(k.config.get('zzz', 7), 7);
  assert.equal(k.agents.list().length, 10);
  for (const t of ['delegate', 'plan', 'critique', 'reflect', 'ask_user', 'emit_artifact', 'run_js']) assert.ok(k.tools.has(t), t);
});

test('run_js and emit_artifact', async () => {
  const k = await createKernel({ modules: [] });
  const r = await k.tools.call('run_js', { code: 'console.log("hi"); return input.a * 2;', input: { a: 21 } });
  assert.equal(r.result, 42); assert.deepEqual(r.logs, ['hi']);
  await assert.rejects(() => k.tools.call('run_js', { code: 'while(true){}', timeoutMs: 150 }));
  const a = await k.tools.call('emit_artifact', { name: 'lab', format: 'html', spec: '<h1>नमस्ते</h1>' });
  assert.equal(a.artifact.filename, 'lab.html');
  assert.equal(await k.artifacts.get(a.artifact.id).blob.text(), '<h1>नमस्ते</h1>');
});

test('recursion: worker delegates to specialist, which uses a tool (depth tracked)', async () => {
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify({ tasks: [{ id: 't1', agent: 'researcher', task: 'find fee' }] }) };
    if (a === 'critic') return critic9();
    if (a === 'researcher') {
      if (!req.messages.some((m) => m.role === 'tool')) return { toolCalls: [{ id: 'c1', name: 'delegate', args: { agent: 'cbse-author', task: 'compute 6*7' } }] };
      return { text: 'final: ' + req.messages.at(-1).content };
    }
    if (a === 'cbse-author') {
      if (!req.messages.some((m) => m.role === 'tool')) return { toolCalls: [{ id: 'c2', name: 'run_js', args: { code: 'return 6*7' } }] };
      return { text: 'computed 42' };
    }
    return { text: 'x' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const events = [];
  const rec = await k.run('what is the answer', { onEvent: (e, p) => events.push([e, p]) });
  assert.equal(rec.status, 'done');
  assert.equal(rec.delegations.length, 1);
  assert.equal(rec.delegations[0].depth, 1);
  assert.equal(rec.delegations[0].output, 'computed 42');
  assert.match(rec.tasks[0].output, /computed 42/);
  assert.equal(rec.answer, rec.tasks[0].output);
  for (const e of ['run:start', 'plan', 'task:start', 'tool:call', 'tool:result', 'task:done', 'critique', 'answer', 'run:done']) {
    assert.ok(events.some(([n]) => n === e), 'missing event ' + e);
  }
  assert.ok(rec.usage.in > 0);
});

test('delegation depth limit stops recursion', async () => {
  // every agent keeps delegating; maxDepth=2 must cut it off with an error result
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify([{ id: 't1', agent: 'guru', task: 'recurse' }]) };
    if (a === 'critic') return critic9();
    const tool = [...req.messages].reverse().find((m) => m.role === 'tool');
    if (tool) return { text: 'bottom: ' + tool.content.slice(0, 60) };
    const n = (req.system.match(/depth (\d+)/) || [])[1];
    return { toolCalls: [{ id: 'd' + n, name: 'delegate', args: { agent: 'tutor', task: 'level ' + (Number(n) + 1) } }] };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  // tutor's tools do not include delegate; use guru->researcher chain via agent with delegate
  k.agents.register({ id: 'tutor', name: 't', description: 't', system: 'recurser', tools: ['delegate'], tier: 'fast' });
  const rec = await k.run('go', { maxDepth: 2 });
  const depths = rec.delegations.map((d) => d.depth);
  assert.deepEqual(depths, [1, 2]);
  assert.match(rec.delegations[1].output, /Max delegation depth/);
});

test('parallel DAG: independent tasks overlap, dependent task waits and sees outputs', async () => {
  const llm = fakeLlm(async (req, st) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: '```json\n' + JSON.stringify({ tasks: [
      { id: 'a', agent: 'researcher', task: 'task A', deps: [] },
      { id: 'b', agent: 'tutor', task: 'task B', deps: [] },
      { id: 'c', agent: 'cbse-author', task: 'task C', deps: ['a', 'b'] },
    ] }) + '\n```' };
    if (a === 'critic') return critic9();
    if (isSynth(req)) return { text: 'SYNTH' };
    await sleep(60);
    if (/task C/.test(lastUser(req))) { st.cSawA = /OUT-A/.test(lastUser(req)) && /OUT-B/.test(lastUser(req)); return { text: 'OUT-C' }; }
    return { text: /task A/.test(lastUser(req)) ? 'OUT-A' : 'OUT-B' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const order = [];
  k.bus.on('task:start', (p) => order.push('s' + p.taskId));
  k.bus.on('task:done', (p) => order.push('d' + p.taskId));
  const rec = await k.run('multi');
  assert.equal(llm.state.cSawA, true);
  assert.ok(llm.state.maxInflight >= 2, 'a and b should overlap');
  assert.ok(order.indexOf('sc') > order.indexOf('da') && order.indexOf('sc') > order.indexOf('db'));
  assert.equal(rec.answer, 'SYNTH');
  assert.deepEqual(rec.tasks.map((t) => t.status), ['done', 'done', 'done']);
});

test('refinement: low critique triggers re-run of the failing task with feedback', async () => {
  let criticCalls = 0;
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify({ tasks: [{ id: 't1', agent: 'cbse-author', task: 'make paper' }] }) };
    if (a === 'critic') {
      criticCalls++;
      return criticCalls === 1
        ? { text: JSON.stringify({ score: 5, issues: [{ task: 't1', problem: 'marks total 68', fix: 'make it 70' }], summary: 'bad total' }) }
        : critic9();
    }
    return { text: /REVIEWER FEEDBACK/.test(lastUser(req)) ? 'paper v2 (70 marks)' : 'paper v1' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const refines = [];
  k.bus.on('refine', (p) => refines.push(p));
  const rec = await k.run('qp');
  assert.equal(refines.length, 1);
  assert.equal(rec.refinements, 1);
  assert.equal(rec.tasks[0].attempts, 2);
  assert.equal(rec.answer, 'paper v2 (70 marks)');
  assert.equal(rec.critique.score, 9);
  const worker = llm.state.calls.filter((c) => agentOf(c) === 'cbse-author');
  assert.match(lastUser(worker[1]), /make it 70/);
});

test('refinement is bounded to 2 rounds', async () => {
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify([{ id: 't1', agent: 'tutor', task: 'x' }]) };
    if (a === 'critic') return { text: JSON.stringify({ score: 2, issues: [{ task: 't1', problem: 'bad' }] }) };
    return { text: 'meh' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('x');
  assert.equal(rec.refinements, 2);
  assert.equal(rec.tasks[0].attempts, 3);
  assert.equal(rec.status, 'done');
});

test('budget stop: token budget halts the run and still returns a partial answer', async () => {
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ id: 't' + i, agent: 'tutor', task: 'step ' + i, deps: i ? ['t' + (i - 1)] : [] }))), usage: { in: 100, out: 100 } };
    return { text: 'did ' + lastUser(req).slice(6, 12), usage: { in: 300, out: 300 } };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('long chain', { budgetTokens: 1000 });
  assert.equal(rec.status, 'stopped');
  assert.equal(rec.stopped, 'BUDGET');
  assert.ok(rec.tasks.filter((t) => t.status === 'done').length < 6);
  assert.ok(rec.answer.length > 0);
  assert.ok(rec.usage.in + rec.usage.out >= 1000);
});

test('step budget stops the run', async () => {
  const llm = fakeLlm(async (req) => {
    if (agentOf(req) === 'planner') return { text: JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ id: 't' + i, agent: 'tutor', task: 's' + i, deps: i ? ['t' + (i - 1)] : [] }))) };
    return { text: 'ok' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('x', { maxSteps: 3 });
  assert.equal(rec.stopped, 'STEPS');
  assert.ok(rec.steps <= 3);
});

test('loop detection: identical repeated tool call ends the worker', async () => {
  let n = 0;
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify([{ id: 't1', agent: 'tutor', task: 'loop' }]) };
    if (a === 'critic') return critic9();
    n++;
    return { toolCalls: [{ id: 'l' + n, name: 'run_js', args: { code: 'return 1' } }] };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('loop');
  assert.ok(rec.loops >= 1);
  assert.ok(n <= 6, 'should stop early, got ' + n);
  assert.match(rec.tasks[0].output, /repeated identical/);
});

test('AbortSignal aborts an in-flight run', async () => {
  const llm = fakeLlm(async (req) => {
    if (agentOf(req) === 'planner') return { text: JSON.stringify([{ id: 't1', agent: 'tutor', task: 'slow' }]) };
    await sleep(2000, req.signal);
    return { text: 'late' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const ac = new AbortController();
  const errs = [];
  k.bus.on('run:error', (p) => errs.push(p));
  setTimeout(() => ac.abort(), 80);
  const t0 = Date.now();
  const rec = await k.run('slow', { signal: ac.signal });
  assert.equal(rec.status, 'aborted');
  assert.ok(Date.now() - t0 < 1500);
  assert.equal(errs.length, 1);
});

test('failed task is isolated: dependents skipped, answer still produced', async () => {
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify([
      { id: 'a', agent: 'tutor', task: 'bad', deps: [] }, { id: 'b', agent: 'researcher', task: 'good', deps: [] }, { id: 'c', agent: 'tutor', task: 'after a', deps: ['a'] }]) };
    if (a === 'critic') return critic9();
    if (isSynth(req)) return { text: 'partial answer' };
    if (/bad/.test(lastUser(req))) throw new Error('provider exploded');
    return { text: 'fine' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('x');
  assert.deepEqual(rec.tasks.map((t) => t.status), ['failed', 'done', 'skipped']);
  assert.equal(rec.answer, 'partial answer');
});

test('cyclic / malformed plans are repaired', async () => {
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: 'Sure! {"tasks":[{"id":"x","agent":"nobody","task":"one","deps":["y"]},{"id":"y","agent":"tutor","task":"two","deps":["x"]}]} done' };
    if (a === 'critic') return critic9();
    if (isSynth(req)) return { text: 'ok' };
    return { text: 'r' };
  });
  const k = await createKernel({ modules: withLlm(llm) });
  const rec = await k.run('x');
  assert.equal(rec.status, 'done');
  assert.equal(rec.tasks.length, 2);
  assert.equal(rec.tasks[0].agent, 'guru');
  assert.ok(rec.tasks.every((t) => t.status === 'done'));
});

test('module failure isolation: bad register, bad import, non-module do not break boot', async () => {
  const k0 = await createKernel({ modules: [] });
  const errors = [];
  const k = await createKernel({
    modules: [
      { name: 'boom', register() { throw new Error('kaput'); } },
      './does-not-exist.js',
      { name: 'async-boom', async register() { throw new Error('later'); } },
      { name: 'ok', register(kk) { kk.tools.register({ name: 'hello', run: async () => 'hi' }); } },
      () => {},
    ],
  }).then(async (kk) => kk);
  assert.ok(k0);
  assert.ok(k.modules.loaded.includes('ok'));
  assert.deepEqual(k.modules.failed.map((f) => f.module), ['boom', './does-not-exist.js', 'async-boom']);
  assert.equal(await k.tools.call('hello', {}), 'hi');
  // bus event is emitted for failures
  const k2 = await createKernel({ modules: [] });
  k2.bus.on('module:error', (p) => errors.push(p.module));
  assert.equal(k2.modules.failed.length, 0);
});

test('module:error reaches bus listeners registered before module load', async () => {
  const errors = [];
  let kernelRef;
  const k = await createKernel({ modules: [
    { name: 'spy', register(kk) { kernelRef = kk; kk.bus.on('module:error', (p) => errors.push(p.module)); } },
    { name: 'bad', register() { throw new Error('x'); } },
  ] });
  assert.equal(kernelRef, k);
  assert.deepEqual(errors, ['bad']);
});

test('default module list is isolated: missing modules do not throw', async () => {
  const k = await createKernel();
  assert.equal(k.modules.loaded.length + k.modules.failed.length, 7);
  assert.equal(k.agents.list().length, 10);
});

test('offline path: provider local plans from intents, runs tools directly, recursion-capable', async () => {
  const llm = fakeLlm(async () => ({ text: 'TEMPLATE REPLY' }), 'local');
  const called = [];
  const k = await createKernel({ modules: withLlm(llm, [{
    name: 'cbse-mock',
    register(kk) {
      kk.tools.register({ name: 'cbse_syllabus', schema: { type: 'object' }, run: async (a) => { called.push(['syl', a]); return { text: `Syllabus ${a.subject} ${a.cls}` }; } });
      kk.tools.register({ name: 'cbse_practice_set', schema: { type: 'object' }, run: async (a, ctx) => {
        called.push(['set', a]);
        const art = ctx.artifacts.add(new Blob(['qs']), 'set.md');
        return { artifact: art, text: 'set ready' };
      } });
      kk.agents.register({ id: 'cbse-author', name: 'x', description: 'x', system: 'x', tools: ['cbse_syllabus', 'cbse_practice_set'] });
      kk.intents.register({ id: 'syl', tool: 'cbse_syllabus', patterns: [/syllabus/i, /पाठ्यक्रम/u], extract: (t) => ({ subject: /physics|भौतिकी/iu.test(t) ? 'Physics' : 'Any', cls: (t.match(/\b(1[012])\b/) || [])[1] || '12' }) });
      kk.intents.register({ id: 'set', tool: 'cbse_practice_set', patterns: [/practice set/i, /अभ्यास सेट/u], extract: () => ({ cls: '12' }) });
    },
  }]) });
  const rec = await k.run('show physics syllabus class 12 then make a practice set');
  assert.equal(rec.planSource, 'intents');
  assert.equal(rec.plan.length, 2);
  assert.deepEqual(called.map((c) => c[0]), ['syl', 'set']);
  assert.match(rec.answer, /Syllabus Physics 12/);
  assert.match(rec.answer, /set\.md/);
  assert.equal(rec.artifacts.length, 1);
  assert.equal(llm.state.calls.length, 0, 'no LLM needed for intent-routed plan');
  assert.equal(rec.status, 'done');

  // Hindi single intent
  const rec2 = await k.run('भौतिकी का पाठ्यक्रम दिखाओ');
  assert.equal(rec2.lang, 'hi');
  assert.match(rec2.answer, /Syllabus Physics/);

  // no match → local template chat from tutor, no crash
  const rec3 = await k.run('tell me a story');
  assert.equal(rec3.planSource, 'fallback');
  assert.equal(rec3.answer, 'TEMPLATE REPLY');

  // delegate inside offline mode routes via intents
  const d = await k.tools.call('delegate', { agent: 'cbse-author', task: 'syllabus for chemistry' });
  assert.match(d.output, /Syllabus Any|Syllabus/);
});

test('offline with no llm service at all: graceful localised message', async () => {
  const k = await createKernel({ modules: [] });
  const rec = await k.run('something unmatched');
  assert.equal(rec.status, 'done');
  assert.match(rec.answer, /offline skill/);
  const hi = await k.run('कुछ अनजाना');
  assert.match(hi.answer, /ऑफ़लाइन/);
});

test('offline critique uses cbse_answer_check and triggers refinement', async () => {
  let calls = 0;
  const k = await createKernel({ modules: [{ name: 'm', register(kk) {
    kk.tools.register({ name: 'cbse_question_paper', run: async () => { calls++; return { sections: [{ name: 'A' }], text: 'paper' }; } });
    kk.tools.register({ name: 'cbse_answer_check', run: async () => ({ ok: false, issues: ['marks total is 68, expected 70'] }) });
    kk.intents.register({ id: 'qp', tool: 'cbse_question_paper', patterns: [/question paper/i] });
  } }] });
  const rec = await k.run('make a question paper');
  assert.equal(rec.refinements, 2);
  assert.equal(calls, 3);
  assert.ok(rec.critique.score < 8);
  assert.match(rec.critique.issues[0].problem, /68/);
});

test('memory: recall feeds plan/workers, reflect gets the record and lessons are stored', async () => {
  const mem = {
    recall: async () => [{ id: 1, kind: 'pref', text: 'prefers Hindi bilingual papers', score: 1 }],
    profile: async () => ({ name: 'T' }),
    reflect: async (r) => { mem.reflected = r; return ['use bilingual by default']; },
  };
  const llm = fakeLlm(async (req) => {
    const a = agentOf(req);
    if (a === 'planner') return { text: JSON.stringify([{ id: 't1', agent: 'tutor', task: 'x' }]) };
    if (a === 'critic') return critic9();
    return { text: 'ok' };
  });
  const k = await createKernel({ modules: withLlm(llm, [{ name: 'mem', register: (kk) => kk.services.set('memory', mem) }]) });
  const rec = await k.run('hello');
  assert.match(lastUser(llm.state.calls[0]), /prefers Hindi/);
  assert.equal(mem.reflected.id, rec.id);
  assert.deepEqual(rec.lessons, ['use bilingual by default']);
});

test('ask_user waits for a reply when a UI listens, and degrades without one', async () => {
  const k = await createKernel({ modules: [] });
  const none = await k.tools.call('ask_user', { question: 'Which class?' });
  assert.equal(none.answered, false);
  k.bus.on('ask', (p) => setTimeout(() => p.reply('Class 12'), 10));
  const r = await k.tools.call('ask_user', { question: 'Which class?', options: ['11', '12'] });
  assert.deepEqual([r.answered, r.answer], [true, 'Class 12']);
});
