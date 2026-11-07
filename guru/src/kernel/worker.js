// Worker agent tool-use loop with identical-call dedupe and loop detection.
import { KernelStop, stable, trunc, langName, fmtResult } from './util.js';

const MAX_ITERS = 8;
const RESULT_CHARS = 6000;

export function buildSystem(agent, rc, depth) {
  return [
    `[agent:${agent.id}]`,
    agent.system,
    `\nRespond in ${langName(rc.lang)} unless the task says otherwise.`,
    `Delegation depth ${depth} of max ${rc.maxDepth}; delegate only when a sub-task truly needs a specialist.`,
  ].join('\n');
}

function compose(rc, task, { context, feedback }) {
  const parts = [`TASK:\n${task}`];
  if (rc.memoryText) parts.push(`RELEVANT MEMORY (user profile, lessons):\n${rc.memoryText}`);
  if (context) parts.push(`RESULTS OF PREREQUISITE TASKS:\n${context}`);
  if (feedback) parts.push(`REVIEWER FEEDBACK — fix these problems in this attempt:\n${feedback}`);
  return parts.join('\n\n');
}

/** Call a tool on behalf of a task, emitting tool:call / tool:result. */
export async function callTaskTool(rc, name, args, tctx) {
  rc.check();
  rc.record.steps++;
  rc.emit('tool:call', { taskId: tctx.taskId, agent: tctx.agent, tool: name, args });
  try {
    const out = await rc.k.tools.call(name, args, tctx);
    rc.emit('tool:result', { taskId: tctx.taskId, tool: name, ok: true, result: trunc(fmtResult(out), 400) });
    return out;
  } catch (e) {
    if (e instanceof KernelStop) throw e;
    if (rc.signal?.aborted) throw new KernelStop('ABORT');
    rc.emit('tool:result', { taskId: tctx.taskId, tool: name, ok: false, error: e.message });
    throw e;
  }
}

/**
 * Run one agent on a task until it stops calling tools.
 * @returns {Promise<{text:string, via?:string, result?:any}>}
 */
export async function runAgent(rc, agent, task, opts = {}) {
  const { k } = rc;
  const depth = opts.depth || 0;
  const taskId = opts.taskId;
  const lineage = opts.lineage || [];
  const tctx = () => rc.toolCtx({ depth, taskId, agent: agent.id, lineage });
  const system = buildSystem(agent, rc, depth);
  const userMsg = compose(rc, task, opts);

  if (rc.local) { // offline: route by intents, else one template chat — still recursion-capable via delegate
    const m = k.intents.match(task, rc.lang);
    if (m && k.tools.has(m.tool)) {
      const out = await callTaskTool(rc, m.tool, m.args, tctx());
      return { text: fmtResult(out, k, rc.lang), via: 'intent', result: out };
    }
    if (rc.llm) {
      const r = await rc.chat({ system, messages: [{ role: 'user', content: userMsg }], tier: agent.tier });
      if (r.text) return { text: r.text };
    }
    return { text: '', via: 'none' };
  }

  const allowed = new Set([...agent.tools]);
  const defs = k.tools.defs([...allowed]);
  const messages = [{ role: 'user', content: userMsg }];
  const seen = new Map();
  let dupes = 0;
  let last = '';

  for (let i = 0; i < MAX_ITERS; i++) {
    const resp = await rc.chat({
      system, messages, tools: defs, stream: true, tier: agent.tier,
      onToken: (t) => rc.emit('task:token', { taskId, token: t }),
    });
    const calls = Array.isArray(resp.toolCalls) ? resp.toolCalls : [];
    if (resp.text) last = resp.text;
    if (!calls.length) return { text: resp.text || last };

    messages.push({ role: 'assistant', content: resp.text || '', toolCalls: calls });
    let looped = false;
    const results = await Promise.all(calls.map(async (c, n) => {
      const id = c.id || `call_${i}_${n}`;
      const key = c.name + '|' + stable(c.args || {});
      if (seen.has(key)) {
        dupes++;
        if (dupes >= 3) looped = true;
        return { id, name: c.name, content: stable({ duplicate: true, note: 'Identical call already made; reuse the earlier result.', result: seen.get(key) }) };
      }
      let out;
      if (!allowed.has(c.name)) out = { error: `Tool ${c.name} is not available to agent ${agent.id}` };
      else {
        try { out = await callTaskTool(rc, c.name, c.args || {}, tctx()); }
        catch (e) { if (e instanceof KernelStop) throw e; out = { error: e.message }; }
      }
      const content = trunc(typeof out === 'string' ? out : stable(out), RESULT_CHARS);
      seen.set(key, content);
      return { id, name: c.name, content };
    }));
    for (const r of results) messages.push({ role: 'tool', toolCallId: r.id, name: r.name, content: r.content });
    if (looped) {
      rc.record.loops++;
      rc.emit('loop', { taskId, agent: agent.id });
      return { text: (last || '') + (last ? '\n' : '') + '[stopped: repeated identical tool calls]', looped: true };
    }
  }
  return { text: last || '[stopped: iteration limit reached]' };
}
