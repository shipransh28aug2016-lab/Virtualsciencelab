// Tool registry. run(args, ctx) → JSON-serialisable data.

export function createTools(bus, { artifacts } = {}) {
  const map = new Map();
  const api = {
    register(t) {
      if (!t || !t.name || typeof t.run !== 'function') throw new Error('tools.register: {name, run} required');
      const tool = {
        description: '', schema: { type: 'object', properties: {} }, tags: [], ...t,
      };
      map.set(tool.name, tool);
      bus?.emit('tool:registered', { name: tool.name });
      return tool;
    },
    has(name) { return map.has(name); },
    get(name) { return map.get(name); },
    list() { return [...map.values()].map(({ name, description, schema, tags }) => ({ name, description, schema, tags })); },
    /** Tool definitions in the shape the llm service expects. */
    defs(names) {
      return names.filter((n) => map.has(n)).map((n) => {
        const t = map.get(n);
        return { name: t.name, description: t.description, schema: t.schema };
      });
    },
    async call(name, args = {}, ctx = {}) {
      const t = map.get(name);
      if (!t) throw new Error(`Unknown tool: ${name}`);
      const req = (t.schema && t.schema.required) || [];
      const missing = req.filter((k) => args == null || args[k] === undefined || args[k] === null);
      if (missing.length) throw new Error(`Tool ${name}: missing required argument(s): ${missing.join(', ')}`);
      const c = { artifacts, ...ctx };
      return t.run(args || {}, c);
    },
  };
  return api;
}
