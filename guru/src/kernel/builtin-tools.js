// Kernel tools: delegate, plan, critique, reflect, ask_user, emit_artifact, run_js.
import { mimeFor } from './artifacts.js';

const TEXT_EXT = { markdown: 'md', md: 'md', txt: 'txt', text: 'txt', html: 'html', js: 'js', javascript: 'js', css: 'css', json: 'json', csv: 'csv', svg: 'svg' };

function mkBlob(content, filename) {
  const type = mimeFor(filename);
  return new Blob([content], { type: type.startsWith('text/') ? `${type};charset=utf-8` : type });
}

async function runJsNode(code, input, timeoutMs) {
  const vm = await import('node:vm');
  const logs = [];
  const sandbox = vm.createContext({
    input, console: { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push(a.map(String).join(' ')) },
  }, { codeGeneration: { strings: false, wasm: false } });
  const script = new vm.Script(`(async () => {\n${code}\n})()`);
  let timer;
  const result = await Promise.race([
    Promise.resolve(script.runInContext(sandbox, { timeout: timeoutMs })),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('run_js timeout')), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
  return { result, logs };
}

function runJsWorker(code, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const src = `const logs=[];const c={log:(...a)=>logs.push(a.map(String).join(' '))};
self.onmessage=async(e)=>{try{const fn=new Function('input','console','return (async()=>{'+${JSON.stringify(code)}+'\\n})()');
const result=await fn(e.data,c);postMessage({ok:true,result,logs});}catch(err){postMessage({ok:false,error:String(err&&err.message||err),logs});}};`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    const done = (fn, v) => { clearTimeout(t); w.terminate(); URL.revokeObjectURL(url); fn(v); };
    const t = setTimeout(() => done(reject, new Error('run_js timeout')), timeoutMs);
    w.onmessage = (e) => (e.data.ok ? done(resolve, { result: e.data.result, logs: e.data.logs }) : done(reject, new Error(e.data.error)));
    w.onerror = (e) => done(reject, new Error(e.message || 'worker error'));
    w.postMessage(input);
  });
}

const jsonSafe = (v) => { try { return v === undefined ? null : JSON.parse(JSON.stringify(v)); } catch { return String(v); } };

export function registerBuiltinTools(k) {
  const ctxOf = (ctx) => (ctx && ctx.delegate ? ctx : { ...(ctx || {}), ...k.orchestrator.adhoc({ signal: ctx?.signal, lang: ctx?.lang }) });

  k.tools.register({
    name: 'delegate', tags: ['kernel', 'recursion'],
    description: 'Hand a self-contained sub-task to a specialist agent (recursion). Returns that agent\'s output. Use for work that needs different tools or deep focus.',
    schema: { type: 'object', properties: {
      agent: { type: 'string', description: 'Agent id: researcher, cbse-author, tutor, file-engineer, drive-ops, coder, critic, curator' },
      task: { type: 'string', description: 'Complete instruction; the agent sees nothing else' },
      context: { type: 'string', description: 'Facts/data the agent needs' },
    }, required: ['agent', 'task'] },
    run: async (a, ctx) => ctxOf(ctx).delegate({ agent: a.agent, task: a.task, context: a.context }),
  });

  k.tools.register({
    name: 'plan', tags: ['kernel'],
    description: 'Decompose a goal into a dependency graph of tasks [{id,agent,task,deps}] without executing it.',
    schema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
    run: async (a, ctx) => ({ tasks: (await ctxOf(ctx).plan(a.goal)).map(({ id, agent, task, deps }) => ({ id, agent, task, deps })) }),
  });

  k.tools.register({
    name: 'critique', tags: ['kernel'],
    description: 'Score an answer 0-10 against a goal (correctness, CBSE fidelity, language, completeness) and list issues.',
    schema: { type: 'object', properties: { goal: { type: 'string' }, answer: { type: 'string' } }, required: ['goal', 'answer'] },
    run: async (a, ctx) => ctxOf(ctx).critique(a.goal, a.answer),
  });

  k.tools.register({
    name: 'reflect', tags: ['kernel', 'memory'],
    description: 'Store a lesson, preference, fact or skill learned during this work so future runs improve.',
    schema: { type: 'object', properties: {
      insight: { type: 'string' }, kind: { type: 'string', enum: ['lesson', 'pref', 'fact', 'skill'] }, tags: { type: 'array', items: { type: 'string' } },
    }, required: ['insight'] },
    run: async (a) => {
      const mem = k.services.get('memory');
      if (!mem) return { saved: false, reason: 'memory unavailable' };
      const id = await mem.remember({ kind: a.kind || 'lesson', text: a.insight, tags: a.tags || [] });
      return { saved: true, id };
    },
  });

  k.tools.register({
    name: 'ask_user', tags: ['kernel', 'interactive'],
    description: 'Ask the user one short clarifying question and wait. Use only when the answer cannot be inferred.',
    schema: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] },
    run: async (a, ctx) => ctxOf(ctx).ask(a.question, a.options),
  });

  k.tools.register({
    name: 'emit_artifact', tags: ['kernel', 'files'],
    description: 'Create a downloadable file. format: docx|xlsx|pptx|pdf|md|csv|html|json|zip|js|txt. spec: for text formats a string (or {content}); for office/pdf formats the files.write spec.',
    schema: { type: 'object', properties: {
      name: { type: 'string' }, format: { type: 'string' }, spec: {},
    }, required: ['name', 'format', 'spec'] },
    run: async (a, ctx) => {
      const fmt = String(a.format).toLowerCase().replace(/^\./, '');
      const ext = TEXT_EXT[fmt];
      const base = String(a.name).replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'artifact';
      const sp = a.spec;
      const store = ctx.artifacts || k.artifacts;
      let text = null;
      if (ext) {
        if (typeof sp === 'string') text = sp;
        else if (sp && typeof sp.content === 'string') text = sp.content;
        else if (sp && typeof sp.text === 'string') text = sp.text;
        else if (ext === 'json') text = JSON.stringify(sp, null, 2);
      }
      let info;
      if (text !== null) info = store.add(mkBlob(text, `${base}.${ext}`), `${base}.${ext}`, { format: fmt });
      else {
        const files = k.services.get('files');
        if (!files || !files.write) throw new Error(`Cannot build ${fmt}: files service unavailable`);
        const out = await files.write(fmt, typeof sp === 'string' ? { title: base, blocks: [{ t: 'p', text: sp }] } : sp);
        info = store.add(out.blob, out.filename || `${base}.${fmt}`, { format: fmt });
      }
      return { artifact: { id: info.id, filename: info.filename, mime: info.mime, size: info.size, blobRef: info.blobRef } };
    },
  });

  k.tools.register({
    name: 'run_js', tags: ['kernel', 'compute'],
    description: 'Run JavaScript in an isolated sandbox for calculations/transforms. Code is an async function body: use `input`, `return` a JSON-serialisable value.',
    schema: { type: 'object', properties: {
      code: { type: 'string' }, input: {}, timeoutMs: { type: 'number' },
    }, required: ['code'] },
    run: async (a) => {
      const ms = Math.min(Math.max(Number(a.timeoutMs) || 3000, 100), 15000);
      const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
      let out;
      if (isNode) out = await runJsNode(a.code, a.input ?? null, ms);
      else if (typeof Worker !== 'undefined') out = await runJsWorker(a.code, a.input ?? null, ms);
      else throw new Error('run_js: no sandbox available in this environment');
      return { result: jsonSafe(out.result), logs: out.logs };
    },
  });
}
