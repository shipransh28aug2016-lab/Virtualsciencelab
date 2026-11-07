// Recursive orchestrator: recall → plan → DAG execute → critique → refine → synthesize → reflect.
import {
  KernelStop, uid, clamp, trunc, estimateTokens, extractJSON, normalizePlan, detectLang,
  langName, fmtResult, msg,
} from './util.js';
import { runAgent, callTaskTool, buildSystem } from './worker.js';

const CONCURRENCY = 4;
const MAX_TASKS = 8;
const PASS_SCORE = 8;
const MAX_REFINE = 2;

const PLAN_FORMAT = `Decompose the goal (planner). Return ONLY JSON: {"tasks":[{"id":"t1","agent":"<agent id>","task":"<self-contained instruction>","deps":[]}]}.
Rules: at most ${MAX_TASKS} tasks; tasks with no dependency between them MUST have disjoint deps so they run in parallel; deps list ids of tasks whose output is needed; use a single task for simple requests; every task must be understandable alone.`;

function createRc(k, goal, opts = {}) {
  let lang = opts.lang && opts.lang !== 'auto' ? opts.lang : null;
  if (!lang) { try { lang = k.services.get('i18n')?.detect?.(goal); } catch { lang = null; } }
  if (!['hi', 'en', 'hinglish'].includes(lang)) lang = detectLang(goal);
  const llm = k.services.get('llm');
  let provider = 'local';
  try { provider = llm?.status?.().provider || (llm ? 'unknown' : 'local'); } catch { /* keep local */ }
  const record = {
    id: uid('run'), goal, lang, plan: [], planSource: null, tasks: [], delegations: [], artifacts: [],
    critique: null, critiques: [], refinements: 0, answer: '', usage: { in: 0, out: 0 }, lessons: [],
    status: 'running', stopped: null, steps: 0, loops: 0, startedAt: Date.now(), endedAt: null,
  };
  const rc = {
    k, llm, record, goal, lang, signal: opts.signal, local: !llm || provider === 'local',
    maxDepth: opts.maxDepth ?? 3, maxSteps: opts.maxSteps ?? 40, budgetTokens: opts.budgetTokens ?? 60000,
    memoryText: '', profile: null,
    notify(evt, payload) { try { opts.onEvent?.(evt, payload); } catch { /* UI errors must not break a run */ } },
    emit(evt, p = {}) {
      const payload = { runId: record.id, ...p };
      k.bus.emit(evt, payload);
      rc.notify(evt, payload);
    },
    check() {
      if (rc.signal?.aborted) throw new KernelStop('ABORT', 'aborted');
      if (record.steps >= rc.maxSteps) throw new KernelStop('STEPS', 'step budget reached');
      if (record.usage.in + record.usage.out >= rc.budgetTokens) throw new KernelStop('BUDGET', 'token budget reached');
    },
    addUsage(resp, params) {
      const u = resp && resp.usage;
      if (u && (u.in || u.out)) { record.usage.in += u.in || 0; record.usage.out += u.out || 0; return; }
      const inp = (params.messages || []).map((m) => m.content).join(' ') + (params.system || '');
      record.usage.in += estimateTokens(inp);
      record.usage.out += estimateTokens(resp && resp.text);
    },
    async chat(params) {
      rc.check();
      if (!rc.llm) throw new Error('llm service unavailable');
      record.steps++;
      let resp;
      try { resp = await rc.llm.chat({ ...params, signal: rc.signal }); }
      catch (e) { if (rc.signal?.aborted) throw new KernelStop('ABORT', 'aborted'); throw e; }
      resp = resp || { text: '', toolCalls: [] };
      rc.addUsage(resp, params);
      return resp;
    },
    ask(question, options) {
      if (!k.bus.listenerCount('ask')) {
        return Promise.resolve({ answered: false, answer: null, note: 'No interactive UI; proceed with the most reasonable assumption and state it.' });
      }
      return new Promise((resolve) => {
        const onAbort = () => resolve({ answered: false, answer: null, aborted: true });
        rc.signal?.addEventListener?.('abort', onAbort, { once: true });
        rc.emit('ask', { question, options, reply: (answer) => resolve({ answered: true, answer }) });
      });
    },
    toolCtx(o = {}) {
      const depth = o.depth || 0;
      const lineage = o.lineage || [];
      return {
        runId: record.id, depth, taskId: o.taskId, agent: o.agent, lineage, signal: rc.signal, lang, goal,
        kernel: k, artifacts: rc.artifacts, emit: rc.emit,
        delegate: (spec) => rc.delegate(spec, depth, lineage, o.taskId),
        plan: (g) => makePlan(rc, g),
        critique: (g, text) => critiqueText(rc, g, text),
        ask: (q, opt) => rc.ask(q, opt),
      };
    },
    async delegate(spec, depth, lineage, parent) {
      const nd = depth + 1;
      if (nd > rc.maxDepth) return { error: `Max delegation depth ${rc.maxDepth} reached; do this part yourself.`, depth };
      const agent = k.agents.get(spec.agent) || k.agents.get('guru');
      if (!agent) return { error: `Unknown agent ${spec.agent}` };
      const key = agent.id + '|' + spec.task;
      if (lineage.includes(key)) { record.loops++; rc.emit('loop', { agent: agent.id, parent }); return { error: 'Delegation loop detected (same agent+task already in progress).' }; }
      const id = uid('sub');
      const d = { id, parent, agent: agent.id, task: spec.task, depth: nd, output: null };
      record.delegations.push(d);
      rc.emit('task:start', { taskId: id, parent, agent: agent.id, task: spec.task, depth: nd });
      try {
        const r = await runAgent(rc, agent, spec.task, { depth: nd, taskId: id, context: spec.context, lineage: [...lineage, key] });
        d.output = r.text;
        rc.emit('task:done', { taskId: id, status: 'done', depth: nd, output: trunc(r.text, 400) });
        return { agent: agent.id, depth: nd, output: r.text };
      } catch (e) {
        if (e instanceof KernelStop) throw e;
        rc.emit('task:done', { taskId: id, status: 'failed', depth: nd, error: e.message });
        return { error: e.message };
      }
    },
  };
  rc.artifacts = {
    add(blob, filename, meta = {}) {
      const info = k.artifacts.add(blob, filename, { runId: record.id, ...meta });
      record.artifacts.push(info);
      rc.notify('artifact', info);
      return info;
    },
    get: (id) => k.artifacts.get(id),
    list: () => record.artifacts,
  };
  return rc;
}

const agentFor = (k, tool) => k.agents.list().find((a) => a.tools.includes(tool))?.id || 'guru';

async function makePlan(rc, goal) {
  const { k } = rc;
  if (rc.local) {
    const ms = k.intents.matchAll(goal, rc.lang).filter((m) => k.tools.has(m.tool));
    if (ms.length) {
      rc.record.planSource = 'intents';
      return ms.map((m, i) => ({
        id: `t${i + 1}`, agent: agentFor(k, m.tool), task: m.segment, deps: i ? [`t${i}`] : [], tool: m.tool, args: m.args,
      }));
    }
    rc.record.planSource = 'fallback';
    return [{ id: 't1', agent: 'tutor', task: goal, deps: [] }];
  }
  const planner = k.agents.get('planner');
  const agents = k.agents.list().filter((a) => a.id !== 'critic' && a.id !== 'planner')
    .map((a) => ({ id: a.id, description: a.description, tools: a.tools }));
  const resp = await rc.chat({
    system: `${buildSystem(planner || { id: 'planner', system: '' }, rc, 0)}\n\n${PLAN_FORMAT}`,
    messages: [{ role: 'user', content: `Goal: ${String(goal).replace(/\n/g, ' ')}\nLanguage: ${rc.lang}\nMemory: ${rc.memoryText ? rc.memoryText.replace(/\n/g, ' | ') : 'none'}\nAgents: ${JSON.stringify(agents)}` }],
    json: true, tier: 'smart',
  });
  const tasks = normalizePlan(extractJSON(resp.text), k.agents, MAX_TASKS, k.tools);
  if (tasks.length) { rc.record.planSource = rc.record.planSource || 'llm'; return tasks; }
  rc.record.planSource = 'fallback';
  return [{ id: 't1', agent: 'guru', task: goal, deps: [] }];
}

async function recall(rc) {
  const mem = rc.k.services.get('memory');
  if (!mem) return;
  try {
    const hits = (await mem.recall(rc.goal, { k: 6 })) || [];
    let prof = null;
    try { prof = await mem.profile?.(); } catch { /* optional */ }
    rc.profile = prof;
    rc.memoryText = trunc([
      prof ? `Profile: ${JSON.stringify(prof)}` : '',
      ...hits.map((h) => `- [${h.kind}] ${h.text}`),
    ].filter(Boolean).join('\n'), 1500);
    rc.emit('recall', { hits });
  } catch (e) {
    rc.k.bus.emit('module:error', { module: 'memory', phase: 'recall', error: e.message });
  }
}

/** Run tasks `ids` respecting deps, up to CONCURRENCY in parallel. */
async function executeDag(rc, ids) {
  const byId = new Map(rc.record.tasks.map((t) => [t.id, t]));
  const todo = new Set(ids);
  const running = new Map();
  let stop = null;
  const runOne = async (t) => {
    const deps = t.deps.map((d) => byId.get(d)).filter(Boolean);
    if (deps.some((d) => d.status === 'failed' || d.status === 'skipped')) {
      t.status = 'skipped'; t.error = 'dependency failed';
      rc.emit('task:done', { taskId: t.id, status: 'skipped' });
      return;
    }
    const agent = rc.k.agents.get(t.agent) || rc.k.agents.get('guru');
    t.status = 'running'; t.attempts++; t.error = null;
    rc.emit('task:start', { taskId: t.id, agent: t.agent, task: t.task, depth: 0, attempt: t.attempts });
    const context = deps.map((d) => `[${d.id} / ${d.agent}] ${trunc(d.output, 3000)}`).join('\n\n');
    try {
      if (!agent) throw new Error(`No agent for task ${t.id}`);
      if (t.tool) {
        const out = await callTaskTool(rc, t.tool, t.args || {}, rc.toolCtx({ depth: 0, taskId: t.id, agent: t.agent }));
        t.result = out; t.output = fmtResult(out, rc.k, rc.lang);
      } else {
        const r = await runAgent(rc, agent, t.task, {
          depth: 0, taskId: t.id, context, feedback: t.feedback, lineage: [agent.id + '|' + t.task],
        });
        t.output = r.text;
      }
      t.status = 'done';
    } catch (e) {
      if (e instanceof KernelStop) { t.status = 'pending'; throw e; }
      t.status = 'failed'; t.error = e.message;
    }
    rc.emit('task:done', { taskId: t.id, status: t.status, error: t.error || undefined, output: trunc(t.output, 400) });
  };
  while (todo.size || running.size) {
    try { rc.check(); } catch (e) { stop = e; }
    if (stop) { await Promise.allSettled(running.values()); throw stop; }
    for (const id of [...todo]) {
      if (running.size >= CONCURRENCY) break;
      const t = byId.get(id);
      if (t.deps.some((d) => todo.has(d) || running.has(d))) continue;
      todo.delete(id);
      running.set(id, runOne(t).then(() => { running.delete(id); }, (e) => { running.delete(id); stop = stop || e; }));
    }
    if (!running.size) break; // nothing runnable (cannot happen after normalisation)
    await Promise.race(running.values());
    if (stop) { await Promise.allSettled(running.values()); throw stop; }
  }
}

function ruleCritique(rc) {
  const { record } = rc;
  const issues = [];
  let score = 10;
  for (const t of record.tasks) {
    if (t.status !== 'done') { issues.push({ task: t.id, problem: `Task ${t.status}: ${t.error || 'no output'}` }); score -= 4; continue; }
    if (!String(t.output || '').trim()) { issues.push({ task: t.id, problem: 'Empty output' }); score -= 2; }
  }
  return { score: clamp(score, 0, 10), issues, summary: issues.length ? 'rule-based: problems found' : 'rule-based: ok', source: 'rules' };
}

async function ruleCritiqueAsync(rc) {
  const c = ruleCritique(rc);
  const { k } = rc;
  if (k.tools.has('cbse_answer_check')) {
    for (const t of rc.record.tasks) {
      const r = t.result;
      if (t.status !== 'done' || !r || typeof r !== 'object' || !(r.sections || r.paper?.sections)) continue;
      try {
        const chk = await k.tools.call('cbse_answer_check', { paper: r.paper || r }, rc.toolCtx({ taskId: t.id, agent: 'critic' }));
        const probs = [...(chk?.issues || []), ...(chk?.errors || [])];
        if (chk && (chk.ok === false || probs.length)) {
          for (const p of probs.length ? probs : ['validator reported failure']) c.issues.push({ task: t.id, problem: typeof p === 'string' ? p : JSON.stringify(p) });
          c.score = clamp(c.score - 3, 0, 10);
        }
      } catch (e) { if (e instanceof KernelStop) throw e; }
    }
  }
  return c;
}

function parseCritique(text, validIds) {
  const j = extractJSON(text);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  const score = Number(j.score);
  if (!Number.isFinite(score)) return null;
  const issues = (Array.isArray(j.issues) ? j.issues : []).map((i) => (typeof i === 'string' ? { problem: i } : i))
    .filter((i) => i && (i.problem || i.fix))
    .map((i) => ({ task: validIds.includes(String(i.task)) ? String(i.task) : null, problem: String(i.problem || ''), fix: i.fix ? String(i.fix) : undefined }));
  return { score: clamp(score, 0, 10), issues, summary: String(j.summary || j.feedback || j.verdict || ''), source: 'llm' };
}

const RUBRIC = ['correctness (facts and any arithmetic)', 'CBSE pattern fidelity (marks, sections, scheme)', 'language match with the user', 'completeness against the goal'];

async function critique(rc) {
  if (rc.local) return ruleCritiqueAsync(rc);
  const { record } = rc;
  const critic = rc.k.agents.get('critic');
  const tasks = record.tasks.map((t) => ({ id: t.id, agent: t.agent, task: t.task, status: t.status, error: t.error, output: trunc(t.output, 4000) }));
  try {
    const resp = await rc.chat({
      system: `${buildSystem(critic || { id: 'critic', system: '' }, rc, 0)}\n\nReturn ONLY JSON: {"score":0-10,"issues":[{"task":"<task id>","problem":"...","fix":"..."}],"summary":"..."}. Score 0-10; 8+ means ship it.`,
      messages: [{ role: 'user', content: `Goal: ${record.goal.replace(/\n/g, ' ')}\nLanguage: ${rc.lang}\nRubric: ${RUBRIC.join('; ')}\nAnswer: ${tasks.map((t) => `[${t.id}] ${String(t.output || t.error || '').replace(/\n/g, ' ')}`).join(' || ')}\nTasks: ${JSON.stringify(tasks)}` }],
      json: true, tier: 'smart',
    });
    const c = parseCritique(resp.text, record.tasks.map((t) => t.id));
    if (c) return c;
    return { score: PASS_SCORE, issues: [], summary: 'critic output unparseable; accepted', source: 'fallback' };
  } catch (e) {
    if (e instanceof KernelStop) throw e;
    return { score: PASS_SCORE, issues: [], summary: `critic failed: ${e.message}`, source: 'fallback' };
  }
}

/** Critique arbitrary text against a goal (backs the `critique` tool). */
async function critiqueText(rc, goal, text) {
  if (rc.local) {
    const ok = String(text || '').trim().length > 20;
    return { score: ok ? PASS_SCORE : 4, issues: ok ? [] : [{ task: null, problem: 'Answer is empty or too short' }], summary: 'rule-based', source: 'rules' };
  }
  const resp = await rc.chat({
    system: `${buildSystem(rc.k.agents.get('critic') || { id: 'critic', system: '' }, rc, 0)}\n\nScore 0-10. Return ONLY JSON: {"score":0-10,"issues":[{"problem":"...","fix":"..."}],"summary":"..."}.`,
    messages: [{ role: 'user', content: `Goal: ${String(goal).replace(/\n/g, ' ')}\nRubric: ${RUBRIC.join('; ')}\nAnswer: ${trunc(text, 8000).replace(/\n/g, ' ')}` }],
    json: true, tier: 'smart',
  });
  return parseCritique(resp.text, []) || { score: PASS_SCORE, issues: [], summary: 'unparseable', source: 'fallback' };
}

async function reviewLoop(rc) {
  const { record } = rc;
  let c = await critique(rc);
  record.critique = c; record.critiques.push(c);
  rc.emit('critique', c);
  while (c.score < PASS_SCORE && record.refinements < MAX_REFINE) {
    const bad = new Set(c.issues.map((i) => i.task).filter(Boolean));
    for (const t of record.tasks) if (t.status !== 'done') bad.add(t.id);
    if (!bad.size) { // issue not attributable: re-run the leaf tasks (those nobody depends on)
      for (const t of record.tasks) if (!record.tasks.some((o) => o.deps.includes(t.id))) bad.add(t.id);
    }
    // dependents of re-run tasks must be re-run too
    for (let grew = true; grew;) {
      grew = false;
      for (const t of record.tasks) if (!bad.has(t.id) && t.deps.some((d) => bad.has(d))) { bad.add(t.id); grew = true; }
    }
    record.refinements++;
    const ids = record.tasks.filter((t) => bad.has(t.id)).map((t) => t.id);
    for (const t of record.tasks) {
      if (!bad.has(t.id)) continue;
      const mine = c.issues.filter((i) => i.task === t.id || !i.task).map((i) => i.problem + (i.fix ? ` Fix: ${i.fix}` : ''));
      t.feedback = [c.summary, ...mine].filter(Boolean).join('\n') || 'Previous attempt was insufficient; improve it.';
      t.status = 'pending';
    }
    rc.emit('refine', { round: record.refinements, tasks: ids, score: c.score });
    await executeDag(rc, ids);
    c = await critique(rc);
    record.critique = c; record.critiques.push(c);
    rc.emit('critique', c);
  }
}

function offlineAnswer(rc, note) {
  const { record, k, lang } = rc;
  const done = record.tasks.filter((t) => t.status === 'done' && String(t.output || '').trim());
  const lines = [];
  if (note) lines.push(note);
  if (done.length === 1 && record.tasks.length === 1) lines.push(done[0].output);
  else for (const t of done) lines.push(`### ${t.task}\n${t.output}`);
  const failed = record.tasks.filter((t) => t.status === 'failed');
  if (failed.length) lines.push(`${msg(k, 'failed', lang)}\n${failed.map((t) => `- ${t.task}: ${t.error}`).join('\n')}`);
  if (record.artifacts.length && !done.some((t) => /\.[a-z0-9]{2,5}\b/i.test(t.output))) {
    lines.push(`${msg(k, 'files', lang)}: ${record.artifacts.map((a) => a.filename).join(', ')}`);
  }
  if (!done.length && !failed.length) lines.push(note ? '' : (rc.record.planSource === 'fallback' ? msg(k, 'nomatch', lang) : msg(k, 'empty', lang)));
  return lines.filter(Boolean).join('\n\n');
}

async function synthesize(rc) {
  const { record, k } = rc;
  const done = record.tasks.filter((t) => t.status === 'done');
  if (rc.local || (record.tasks.length === 1 && done.length === 1)) return offlineAnswer(rc);
  const resp = await rc.chat({
    system: `${buildSystem(k.agents.get('guru') || { id: 'guru', system: '' }, rc, 0)}\n\nYou are writing the FINAL answer. Write it in ${langName(rc.lang)}.`,
    messages: [{
      role: 'user',
      content: `GOAL:\n${record.goal}\n\nTASK RESULTS:\n${record.tasks.map((t) => `[${t.id}/${t.agent}] (${t.status}) ${t.task}\n${trunc(t.output || t.error, 5000)}`).join('\n\n')}\n\nFILES CREATED: ${record.artifacts.map((a) => a.filename).join(', ') || 'none'}\n\nCombine into one clear answer for the user. Mention created files by name. Do not mention internal agents or tasks.`,
    }],
    stream: true, tier: 'smart', onToken: (t) => rc.emit('task:token', { taskId: 'synth', token: t }),
  });
  return resp.text || offlineAnswer(rc);
}

async function reflect(rc) {
  const mem = rc.k.services.get('memory');
  if (!mem || typeof mem.reflect !== 'function') return;
  try {
    const l = await mem.reflect(rc.record);
    rc.record.lessons = Array.isArray(l) ? l : [];
  } catch (e) { rc.k.bus.emit('module:error', { module: 'memory', phase: 'reflect', error: e.message }); }
}

export function createOrchestrator(k) {
  /**
   * @param {string} goal
   * @param {{lang?:string,signal?:AbortSignal,maxDepth?:number,maxSteps?:number,budgetTokens?:number,onEvent?:Function}} [opts]
   * @returns {Promise<object>} RunRecord
   */
  async function run(goal, opts = {}) {
    const rc = createRc(k, String(goal ?? ''), opts);
    const { record } = rc;
    let note = '';
    rc.emit('run:start', { goal: record.goal, lang: rc.lang, local: rc.local, limits: { maxDepth: rc.maxDepth, maxSteps: rc.maxSteps, budgetTokens: rc.budgetTokens } });
    try {
      rc.check();
      await recall(rc);
      record.plan = await makePlan(rc, record.goal);
      record.tasks = record.plan.map((t) => ({ ...t, status: 'pending', output: null, error: null, attempts: 0 }));
      rc.emit('plan', { plan: record.plan, source: record.planSource });
      await executeDag(rc, record.tasks.map((t) => t.id));
      await reviewLoop(rc);
      record.answer = await synthesize(rc);
      record.status = 'done';
    } catch (e) {
      if (e instanceof KernelStop && e.code === 'ABORT') record.status = 'aborted';
      else if (e instanceof KernelStop) { record.status = 'stopped'; record.stopped = e.code; note = msg(k, 'budget', rc.lang); }
      else { record.status = 'error'; record.error = e && e.message || String(e); }
    }
    if (!record.answer) record.answer = offlineAnswer(rc, note);
    record.endedAt = Date.now();
    rc.emit('answer', { text: record.answer, lang: rc.lang });
    if (record.status === 'aborted' || record.status === 'error') {
      rc.emit('run:error', { error: record.status === 'aborted' ? 'aborted' : record.error, status: record.status });
      return record;
    }
    await reflect(rc);
    rc.emit('run:done', { status: record.status, usage: record.usage, steps: record.steps, record });
    return record;
  }

  /** A tool context not bound to a run (for direct UI/tool use of delegate/plan/critique). */
  function adhoc(opts = {}) {
    const rc = createRc(k, opts.goal || '(ad hoc)', opts);
    return rc.toolCtx({ depth: 0, agent: 'guru' });
  }

  return { run, adhoc };
}
