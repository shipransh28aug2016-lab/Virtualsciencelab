// Event bus: on/once/off/emit. Handler errors never propagate to emitters.
// Subscribe to '*' to receive (evt, payload) for every event.

/** @returns {{on:Function,once:Function,off:Function,emit:Function,listenerCount:Function}} */
export function createBus() {
  const map = new Map();
  const off = (evt, fn) => { map.get(evt)?.delete(fn); };
  const on = (evt, fn) => {
    if (typeof fn !== 'function') throw new TypeError('bus.on: handler must be a function');
    let s = map.get(evt);
    if (!s) map.set(evt, (s = new Set()));
    s.add(fn);
    return () => off(evt, fn);
  };
  const once = (evt, fn) => {
    const un = on(evt, (p) => { un(); return fn(p); });
    return un;
  };
  const listenerCount = (evt) => map.get(evt)?.size || 0;
  const emit = (evt, payload) => {
    for (const key of [evt, '*']) {
      const s = map.get(key);
      if (!s) continue;
      for (const fn of [...s]) {
        try {
          const r = key === '*' ? fn(evt, payload) : fn(payload);
          if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (err) {
          if (evt !== 'bus:error') emit('bus:error', { evt, error: String(err && err.message || err) });
        }
      }
    }
  };
  return { on, once, off, emit, listenerCount };
}
