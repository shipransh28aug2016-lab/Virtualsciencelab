// Agent registry.

export function createAgents(bus) {
  const map = new Map();
  return {
    register(a) {
      if (!a || !a.id) throw new Error('agents.register: id required');
      const agent = {
        name: a.id, role: '', description: '', system: '', tools: [], tier: 'smart', ...a,
        tools: Array.isArray(a.tools) ? [...a.tools] : [],
      };
      map.set(agent.id, agent);
      bus?.emit('agent:registered', { id: agent.id });
      return agent;
    },
    get(id) { return map.get(id); },
    has(id) { return map.has(id); },
    list() { return [...map.values()]; },
  };
}
