// Named service registry (llm, memory, voice, i18n, files, connectors, cbse).

export function createServices(bus) {
  const map = new Map();
  return {
    set(name, obj) { map.set(name, obj); bus?.emit('service:set', { name }); return obj; },
    get(name) { return map.get(name); },
    has(name) { return map.has(name); },
    list() { return [...map.keys()]; },
  };
}
