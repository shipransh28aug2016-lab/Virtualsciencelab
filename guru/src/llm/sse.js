// Server-Sent Events parser (spec-compliant subset) usable on Node >=18 and browsers.

/**
 * Incremental SSE parser. Feed decoded text chunks with push(); call end() when the stream closes.
 * @param {(ev:{event:string,data:string,id?:string})=>void} onEvent
 * @returns {{push:(s:string)=>void,end:()=>void}}
 */
export function createSSEParser(onEvent) {
  let buf = '';
  let ev = { event: 'message', data: [], id: undefined };
  const dispatch = () => {
    if (ev.data.length) onEvent({ event: ev.event, data: ev.data.join('\n'), id: ev.id });
    ev = { event: 'message', data: [], id: undefined };
  };
  const line = (l) => {
    if (l === '') return dispatch();
    if (l[0] === ':') return;
    const i = l.indexOf(':');
    let f = l, v = '';
    if (i >= 0) { f = l.slice(0, i); v = l.slice(i + 1); if (v[0] === ' ') v = v.slice(1); }
    if (f === 'event') ev.event = v;
    else if (f === 'data') ev.data.push(v);
    else if (f === 'id') ev.id = v;
  };
  return {
    push(s) {
      buf += s;
      for (;;) {
        const m = /\r\n|\n|\r/.exec(buf);
        if (!m) break;
        if (m[0] === '\r' && m.index === buf.length - 1) break; // could be half of CRLF
        line(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
      }
    },
    end() {
      if (buf) { line(buf.replace(/\r$/, '')); buf = ''; }
      dispatch();
    },
  };
}

function abortErr() { const e = new Error('Aborted'); e.name = 'AbortError'; return e; }

function readIdle(reader, idleMs, signal) {
  if (signal?.aborted) return Promise.reject(abortErr());
  if (!idleMs) return reader.read();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { const e = new Error('Stream idle timeout'); e.name = 'TimeoutError'; reject(e); }, idleMs);
    reader.read().then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Async-iterate SSE events from a fetch body (ReadableStream), an async iterable of bytes/strings, or a string.
 * @param {ReadableStream|AsyncIterable<Uint8Array|string>|string|null} body
 * @param {{signal?:AbortSignal, idleMs?:number}} [opts]
 * @returns {AsyncGenerator<{event:string,data:string,id?:string}>}
 */
export async function* readSSE(body, { signal, idleMs = 0 } = {}) {
  if (body == null) return;
  const events = [];
  const parser = createSSEParser((e) => events.push(e));
  const dec = new TextDecoder();
  if (typeof body === 'string') {
    parser.push(body); parser.end();
    while (events.length) yield events.shift();
    return;
  }
  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    const onAbort = () => { reader.cancel().catch(() => {}); };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        const { done, value } = await readIdle(reader, idleMs, signal);
        if (signal?.aborted) throw abortErr();
        if (done) break;
        parser.push(typeof value === 'string' ? value : dec.decode(value, { stream: true }));
        while (events.length) yield events.shift();
      }
      parser.push(dec.decode());
      parser.end();
      while (events.length) yield events.shift();
    } finally {
      signal?.removeEventListener('abort', onAbort);
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    return;
  }
  if (typeof body[Symbol.asyncIterator] === 'function') {
    for await (const value of body) {
      if (signal?.aborted) throw abortErr();
      parser.push(typeof value === 'string' ? value : dec.decode(value, { stream: true }));
      while (events.length) yield events.shift();
    }
    parser.push(dec.decode()); parser.end();
    while (events.length) yield events.shift();
  }
}
