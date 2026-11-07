import test from 'node:test';
import assert from 'node:assert/strict';
import { createGdrive, buildMultipart, convertTarget, NATIVE, FOLDER } from '../src/connectors/gdrive.js';
import { createGithub, parseRepoPath, repoAllowed } from '../src/connectors/github.js';
import { createWeb, isBlockedHost, assertSafeUrl, extractReadable } from '../src/connectors/web.js';
import { createLocalFs, splitPath } from '../src/connectors/localfs.js';
import { createDevice, SHARE_CACHE } from '../src/connectors/device.js';
import { register, createConnectors } from '../src/connectors/index.js';

const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...headers } });
const noSleep = async () => {};
function cfgStore(init = {}) { const m = new Map(Object.entries(init)); return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v) }; }
function mockFetch(handler) {
  const calls = [];
  const f = async (url, init = {}) => {
    const c = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(c);
    return handler(c, calls.length);
  };
  f.calls = calls;
  return f;
}
const drive = (fetch, extra = {}) => {
  const d = createGdrive({ config: cfgStore() }, { fetch, sleep: noSleep, ...extra });
  d.setToken('tok1');
  return d;
};

/* ---------------- gdrive ---------------- */
test('gdrive: bearer auth header + folder listing + pagination', async () => {
  const f = mockFetch((c) => {
    const u = new URL(c.url);
    if (u.searchParams.get('pageToken') === 'P2') return json({ files: [{ id: 'b', name: 'B', mimeType: 'text/plain', size: '5' }] });
    return json({ nextPageToken: 'P2', files: [{ id: 'a', name: 'A', mimeType: FOLDER }] });
  });
  const d = drive(f);
  const p1 = await d.list('');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer tok1');
  assert.match(new URL(f.calls[0].url).searchParams.get('q'), /'root' in parents and trashed=false/);
  assert.equal(p1.items[0].isDir, true);
  assert.equal(p1.next, 'P2');
  const all = await d.listAll('');
  assert.deepEqual(all.items.map((i) => i.id), ['a', 'b']);
  assert.equal(all.items[1].size, 5);
  assert.equal(all.next, undefined);
});

test('gdrive: search query escapes quotes', async () => {
  const f = mockFetch(() => json({ files: [] }));
  await drive(f).search("it's");
  assert.match(new URL(f.calls[0].url).searchParams.get('q'), /name contains 'it\\'s'/);
});

test('gdrive: 401 triggers token refresh and one retry', async () => {
  let n = 0;
  const f = mockFetch((c) => (++n === 1 ? json({ error: { message: 'expired' } }, 401) : json({ files: [] })));
  let issued = 0;
  const loadGis = async () => ({
    initTokenClient: ({ callback }) => ({ requestAccessToken: () => { issued++; callback({ access_token: `fresh${issued}`, expires_in: 3600 }); } }),
  });
  const d = createGdrive({ config: cfgStore({ 'google.clientId': 'cid' }) }, { fetch: f, sleep: noSleep, loadGis });
  d.setToken('stale');
  await d.list('');
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].headers.Authorization, 'Bearer stale');
  assert.equal(f.calls[1].headers.Authorization, 'Bearer fresh1');
});

test('gdrive: persistent 401 surfaces error after single refresh', async () => {
  const f = mockFetch(() => json({ error: { message: 'no' } }, 401));
  const loadGis = async () => ({ initTokenClient: ({ callback }) => ({ requestAccessToken: () => callback({ access_token: 'x', expires_in: 3600 }) }) });
  const d = createGdrive({ config: cfgStore({ 'google.clientId': 'cid' }) }, { fetch: f, sleep: noSleep, loadGis });
  d.setToken('t');
  await assert.rejects(() => d.list(''), (e) => e.code === 'unauthorized');
  assert.equal(f.calls.length, 2);
});

test('gdrive: missing client id -> needs_auth', async () => {
  const d = createGdrive({ config: cfgStore() }, { fetch: mockFetch(() => json({})), loadGis: async () => ({}) });
  await assert.rejects(() => d.list(''), (e) => e.code === 'needs_auth');
  assert.equal(d.status(), 'needs-auth');
});

test('gdrive: 429 backoff honors Retry-After then succeeds', async () => {
  let n = 0; const waits = [];
  const f = mockFetch(() => (++n <= 2 ? new Response('slow', { status: 429, headers: { 'retry-after': '2' } }) : json({ files: [] })));
  const d = drive(f, { sleep: async (ms) => { waits.push(ms); } });
  await d.list('');
  assert.equal(f.calls.length, 3);
  assert.deepEqual(waits, [2000, 2000]);
});

test('gdrive: 403 rateLimitExceeded is retried, plain 403 is not', async () => {
  let n = 0;
  const f = mockFetch(() => (++n === 1 ? json({ error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 403) : json({ files: [] })));
  await drive(f).list('');
  assert.equal(f.calls.length, 2);
  const f2 = mockFetch(() => json({ error: { message: 'nope', errors: [{ reason: 'forbidden' }] } }, 403));
  await assert.rejects(() => drive(f2).list(''), (e) => e.code === 'forbidden');
  assert.equal(f2.calls.length, 1);
});

test('gdrive: multipart upload body, metadata and convert-on-upload', async () => {
  const f = mockFetch(() => json({ id: 'n1', name: 'Doc', mimeType: NATIVE.doc, webViewLink: 'https://x' }));
  const d = drive(f);
  const out = await d.upload('# Hello नमस्ते', { name: 'Doc', mime: 'text/markdown', parent: 'PARENT', convert: true });
  const c = f.calls[0];
  assert.equal(c.method, 'POST');
  assert.match(c.url, /upload\/drive\/v3\/files\?/);
  assert.equal(new URL(c.url).searchParams.get('uploadType'), 'multipart');
  const m = /boundary=(.+)$/.exec(c.headers['Content-Type']);
  assert.ok(m);
  const text = await c.body.text();
  assert.ok(text.startsWith(`--${m[1]}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`));
  const meta = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n--')[0]);
  assert.deepEqual(meta, { name: 'Doc', mimeType: NATIVE.doc, parents: ['PARENT'] });
  assert.ok(text.includes('Content-Type: text/markdown\r\n\r\n# Hello नमस्ते\r\n--' + m[1] + '--'));
  assert.equal(out.id, 'n1');
});

test('gdrive: convertTarget mapping', () => {
  assert.equal(convertTarget(true, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), NATIVE.sheet);
  assert.equal(convertTarget(true, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), NATIVE.slides);
  assert.equal(convertTarget('doc', 'application/pdf'), NATIVE.doc);
  assert.equal(convertTarget(false, 'text/plain'), null);
  assert.throws(() => convertTarget(true, 'image/png'), (e) => e.code === 'cannot_convert');
});

test('gdrive: buildMultipart shape', async () => {
  const b = buildMultipart({ a: 1 }, new Blob(['xyz']), 'text/plain', 'BND');
  assert.equal(await b.text(), '--BND\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"a":1}\r\n--BND\r\nContent-Type: text/plain\r\n\r\nxyz\r\n--BND--');
});

test('gdrive: resumable upload for large files uses chunks with Content-Range', async () => {
  const total = 262144 * 2 + 100;
  const f = mockFetch((c) => {
    if (c.method === 'POST') return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
    const cr = c.headers['Content-Range'];
    if (cr.endsWith(`-${total - 1}/${total}`)) return json({ id: 'big', name: 'big.bin', mimeType: 'application/octet-stream' });
    return new Response('', { status: 308, headers: { range: `bytes=0-${Number(/-(\d+)\//.exec(cr)[1])}` } });
  });
  const d = drive(f, { resumableThreshold: 1000, chunkSize: 262144 });
  const out = await d.upload(new Uint8Array(total), { name: 'big.bin' });
  assert.equal(out.id, 'big');
  assert.equal(new URL(f.calls[0].url).searchParams.get('uploadType'), 'resumable');
  assert.equal(f.calls[0].headers['X-Upload-Content-Length'], String(total));
  assert.deepEqual(f.calls.slice(1).map((c) => c.headers['Content-Range']), [
    `bytes 0-262143/${total}`, `bytes 262144-524287/${total}`, `bytes 524288-${total - 1}/${total}`]);
  assert.equal(f.calls[1].headers.Authorization, 'Bearer tok1');
});

test('gdrive: overwrite and trash are gated by confirmed:true', async () => {
  const f = mockFetch(() => json({ id: 'x', name: 'x', mimeType: 'text/plain' }));
  const d = drive(f);
  await assert.rejects(() => d.upload('a', { id: 'x' }), (e) => e.code === 'confirmation_required');
  await assert.rejects(() => d.remove('x'), (e) => e.code === 'confirmation_required');
  await assert.rejects(() => d.updateSheet('s', 'A1', [[1]]), (e) => e.code === 'confirmation_required');
  assert.equal(f.calls.length, 0);
  const r = await d.remove('x', { confirmed: true });
  assert.equal(r.trashed, true);
  assert.equal(f.calls[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(f.calls[0].body), { trashed: true });
  await d.upload('a', { id: 'x', confirmed: true });
  assert.equal(f.calls[1].method, 'PATCH');
  assert.match(f.calls[1].url, /upload\/drive\/v3\/files\/x/);
});

test('gdrive: sheet read (batchGet) and update via values API', async () => {
  const f = mockFetch((c) => {
    if (c.url.includes('/drive/v3/files/S1')) return json({ id: 'S1', name: 'Marks', mimeType: NATIVE.sheet });
    if (c.url.includes('values:batchGet')) return json({ valueRanges: [{ range: 'Sheet1!A1:B2', values: [['a', 'b'], [1, 2]] }, { range: 'T2!A1', values: [['z']] }] });
    if (c.method === 'PUT') return json({ updatedRange: 'Sheet1!A1:B1', updatedCells: 2, updatedRows: 1 });
    return json({ sheets: [{ properties: { title: 'Sheet1' } }, { properties: { title: 'T2' } }] });
  });
  const d = drive(f);
  const { content } = await d.readFile('S1', { as: 'json' });
  assert.deepEqual(content.map((s) => s.name), ['Sheet1', 'T2']);
  const batch = f.calls.find((c) => c.url.includes('batchGet'));
  assert.deepEqual(new URL(batch.url).searchParams.getAll('ranges'), ['Sheet1', 'T2']);
  const u = await d.updateSheet('S1', 'Sheet1!A1:B1', [['x', 'y']], { confirmed: true });
  assert.equal(u.updatedCells, 2);
  const put = f.calls.find((c) => c.method === 'PUT');
  assert.equal(new URL(put.url).searchParams.get('valueInputOption'), 'USER_ENTERED');
  assert.deepEqual(JSON.parse(put.body).values, [['x', 'y']]);
});

test('gdrive: Docs read extracts text; export native to docx', async () => {
  const f = mockFetch((c) => {
    if (c.url.includes('docs.googleapis.com')) return json({ body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Hello\n' } }] } }, { paragraph: { elements: [{ textRun: { content: 'नमस्ते\n' } }] } }] } });
    if (c.url.includes('/export')) return new Response('DOCXBYTES', { headers: { 'content-type': 'application/octet-stream' } });
    return json({ id: 'D1', name: 'Notes', mimeType: NATIVE.doc });
  });
  const d = drive(f);
  assert.equal(await d.read('D1'), 'Hello\nनमस्ते');
  const e = await d.exportFile('D1', 'docx');
  assert.equal(e.filename, 'Notes.docx');
  assert.match(e.mime, /wordprocessingml/);
  assert.equal(await e.blob.text(), 'DOCXBYTES');
  assert.equal(new URL(f.calls.at(-1).url).searchParams.get('mimeType'), e.mime);
  await assert.rejects(() => d.exportFile('D1', 'exe'), (er) => er.code === 'bad_format');
});

test('gdrive: mkdir posts folder mime and parent', async () => {
  const f = mockFetch(() => json({ id: 'F', name: 'Papers', mimeType: FOLDER }));
  const r = await drive(f).mkdir('Papers', { parent: 'P' });
  assert.deepEqual(JSON.parse(f.calls[0].body), { name: 'Papers', mimeType: FOLDER, parents: ['P'] });
  assert.equal(r.isDir, true);
});

/* ---------------- github ---------------- */
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
test('github: allowlist, auth header, get file decodes utf8', async () => {
  const f = mockFetch(() => json({ type: 'file', path: 'a.md', sha: 'S1', size: 3, encoding: 'base64', content: b64('नमस्ते\n'), html_url: 'u' }));
  const g = createGithub({ config: cfgStore({ 'github.token': 'pat', 'github.allowlist': ['me/*'] }) }, { fetch: f, sleep: noSleep });
  const r = await g.get('me/repo', 'a.md');
  assert.equal(r.text, 'नमस्ते\n');
  assert.equal(f.calls[0].headers.Authorization, 'Bearer pat');
  await assert.rejects(() => g.get('other/repo', 'a.md'), (e) => e.code === 'repo_not_allowed');
  assert.equal(f.calls.length, 1);
});

test('github: put requires confirmed, looks up sha, sends base64', async () => {
  const f = mockFetch((c) => {
    if (c.method === 'GET') return json({ sha: 'OLD', type: 'file', path: 'x.txt' });
    return json({ content: { sha: 'NEW', name: 'x.txt', html_url: 'h' }, commit: { sha: 'C1' } }, 200);
  });
  const g = createGithub({ config: cfgStore({ 'github.token': 'pat', 'github.allowlist': 'me/repo' }) }, { fetch: f, sleep: noSleep });
  await assert.rejects(() => g.put('me/repo', 'x.txt', 'hi'), (e) => e.code === 'confirmation_required');
  assert.equal(f.calls.length, 0);
  const r = await g.put('me/repo', 'x.txt', 'hi', { confirmed: true, branch: 'dev' });
  assert.equal(r.commit, 'C1');
  assert.equal(r.created, false);
  const put = f.calls.find((c) => c.method === 'PUT');
  assert.deepEqual(JSON.parse(put.body), { message: 'Update x.txt via Guru', content: b64('hi'), branch: 'dev', sha: 'OLD' });
});

test('github: put creates new file when 404, retries once on sha conflict', async () => {
  let puts = 0; let gets = 0;
  const f = mockFetch((c) => {
    if (c.method === 'GET') return ++gets === 1 ? json({ message: 'Not Found' }, 404) : json({ sha: 'RACED' });
    return ++puts === 1 ? json({ message: 'sha wasnt supplied' }, 422) : json({ content: { sha: 'N', name: 'n', html_url: '' }, commit: { sha: 'C' } });
  });
  const g = createGithub({ config: cfgStore({ 'github.token': 'pat', 'github.allowlist': ['me/repo'] }) }, { fetch: f, sleep: noSleep });
  const r = await g.put('me/repo', 'n.md', 'x', { confirmed: true });
  assert.equal(puts, 2);
  assert.equal(JSON.parse(f.calls.filter((c) => c.method === 'PUT')[1].body).sha, 'RACED');
  assert.equal(r.sha, 'N');
});

test('github: createBranch + createPR + parse helpers', async () => {
  const f = mockFetch((c) => {
    if (c.url.endsWith('/repos/me/repo')) return json({ default_branch: 'main' });
    if (c.url.includes('/git/ref/heads/main')) return json({ object: { sha: 'BASE' } });
    if (c.url.endsWith('/git/refs')) return json({ object: { sha: 'BASE' } }, 201);
    if (c.url.endsWith('/pulls')) return json({ number: 7, html_url: 'pr', state: 'open' }, 201);
    return json({});
  });
  const g = createGithub({ config: cfgStore({ 'github.token': 'pat', 'github.allowlist': ['me/repo'] }) }, { fetch: f, sleep: noSleep });
  const b = await g.createBranch('me/repo', 'feat');
  assert.deepEqual(JSON.parse(f.calls.find((c) => c.url.endsWith('/git/refs')).body), { ref: 'refs/heads/feat', sha: 'BASE' });
  assert.equal(b.from, 'main');
  const pr = await g.createPR('me/repo', { title: 'T', head: 'feat' });
  assert.equal(pr.number, 7);
  assert.equal(JSON.parse(f.calls.at(-1).body).base, 'main');
  assert.deepEqual(parseRepoPath('me/repo/a/b.md'), { repo: 'me/repo', path: 'a/b.md' });
  assert.deepEqual(parseRepoPath('https://github.com/me/repo/blob/dev/x/y.js'), { repo: 'me/repo', path: 'x/y.js', ref: 'dev' });
  assert.equal(repoAllowed('Me/Repo', ['me/*']), true);
  assert.equal(repoAllowed('x/y', []), false);
});

test('github: no token -> needs_auth', async () => {
  const g = createGithub({ config: cfgStore({ 'github.allowlist': ['*'] }) }, { fetch: mockFetch(() => json({})) });
  assert.equal(g.status(), 'needs-auth');
  await assert.rejects(() => g.get('a/b', 'c'), (e) => e.code === 'needs_auth');
});

/* ---------------- web: SSRF ---------------- */
test('web: SSRF blocklist hosts', () => {
  const blocked = ['localhost', 'foo.localhost', '127.0.0.1', '127.1.2.3', '0.0.0.0', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '224.0.0.1', '[::1]', '::1', '[::]', '[fe80::1]', '[fc00::1]', '[fd12:3456::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]',
    '[::ffff:a00:1]', '[64:ff9b::7f00:1]', '[2002:7f00:1::]', 'metadata.google.internal', 'printer.local', 'intranet', 'router.lan', '2130706433', '0x7f.0.0.1', ''];
  for (const h of blocked) assert.equal(isBlockedHost(h), true, `should block ${h}`);
  const ok = ['example.com', 'www.cbse.gov.in', '8.8.8.8', '172.32.0.1', '172.15.0.1', '[2606:4700::1111]', '1.1.1.1', '100.63.0.1'];
  for (const h of ok) assert.equal(isBlockedHost(h), false, `should allow ${h}`);
});

test('web: assertSafeUrl enforces https, no creds, blocks normalized IPs', () => {
  assert.throws(() => assertSafeUrl('http://example.com'), (e) => e.code === 'https_only');
  assert.throws(() => assertSafeUrl('ftp://example.com'), (e) => e.code === 'https_only');
  assert.throws(() => assertSafeUrl('https://user:pw@example.com'), (e) => e.code === 'bad_url');
  assert.throws(() => assertSafeUrl('not a url'), (e) => e.code === 'bad_url');
  for (const u of ['https://localhost/', 'https://127.0.0.1:8443/x', 'https://[::1]/', 'https://2130706433/', 'https://0x7f000001/', 'https://017700000001/', 'https://169.254.169.254/latest/meta-data', 'https://[::ffff:192.168.0.1]/']) {
    assert.throws(() => assertSafeUrl(u), (e) => e.code === 'ssrf_blocked', u);
  }
  assert.equal(assertSafeUrl('https://example.com/a?b=1').hostname, 'example.com');
});

test('web: fetchText refuses blocked URL without fetching; revalidates redirect target', async () => {
  const f = mockFetch(() => new Response('x', { headers: { 'content-type': 'text/plain' } }));
  const w = createWeb({ config: cfgStore() }, { fetch: f });
  await assert.rejects(() => w.fetchText('https://192.168.1.1/'), (e) => e.code === 'ssrf_blocked');
  assert.equal(f.calls.length, 0);
  const evil = async () => { const r = new Response('secret', { headers: { 'content-type': 'text/plain' } }); Object.defineProperty(r, 'url', { value: 'https://127.0.0.1/admin' }); return r; };
  await assert.rejects(() => createWeb({ config: cfgStore() }, { fetch: evil }).fetchText('https://example.com/'), (e) => e.code === 'ssrf_blocked');
});

test('web: proxy template wraps encoded target; size cap truncates; non-text rejected', async () => {
  const f = mockFetch(() => new Response('a'.repeat(5000), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  const w = createWeb({ config: cfgStore({ 'web.proxy': 'https://proxy.example/get?u={url}' }) }, { fetch: f });
  const r = await w.fetchText('https://example.com/p?q=1&r=2', { maxBytes: 1000 });
  assert.equal(f.calls[0].url, `https://proxy.example/get?u=${encodeURIComponent('https://example.com/p?q=1&r=2')}`);
  assert.equal(r.text.length, 1000);
  assert.equal(r.truncated, true);
  const w2 = createWeb({ config: cfgStore() }, { fetch: mockFetch(() => new Response('PK', { headers: { 'content-type': 'application/zip' } })) });
  await assert.rejects(() => w2.fetchText('https://example.com/a.zip'), (e) => e.code === 'unsupported_content');
  const w3 = createWeb({ config: cfgStore({ 'web.proxy': 'http://insecure/' }) }, { fetch: f });
  await assert.rejects(() => w3.fetchText('https://example.com/'), (e) => e.code === 'bad_proxy');
});

test('web: timeout aborts hung request', async () => {
  const hang = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const w = createWeb({ config: cfgStore() }, { fetch: hang });
  await assert.rejects(() => w.fetchText('https://example.com/', { timeout: 30 }), (e) => e.code === 'timeout');
});

/* ---------------- web: readability ---------------- */
const PAGE = `<!doctype html><html><head><title>Ohm &amp; Law — Physics</title><meta name="author" content="A. Teacher">
<style>.x{color:red}</style><script>var secret="SCRIPTTEXT";</script></head>
<body><nav><a href="/">Home</a><ul><li>NAVITEM</li></ul></nav>
<div class="cookie-banner">We use COOKIEJUNK</div>
<header><div>SITEHEADER</div></header>
<article><h1>Ohm&#39;s Law</h1>
<p>Current through a conductor is proportional to the voltage across it, provided temperature stays constant. This relationship <b>V = IR</b> is central to class 12 physics.</p>
<p>नमस्ते — ओम का नियम बताता है कि विभवांतर और धारा का अनुपात स्थिर रहता है।</p>
<ul><li>Voltage</li><li>Current</li></ul>
<div class="share-buttons">SHAREJUNK</div>
<p>Resistance depends on length, area and material of the wire; a longer wire has more resistance and a thicker wire has less resistance overall.</p>
</article>
<aside>ASIDEJUNK</aside><div id="comments">COMMENTJUNK</div>
<footer>FOOTERJUNK &copy; 2026</footer></body></html>`;
test('web: extractReadable keeps article, drops boilerplate, decodes entities', () => {
  const r = extractReadable(PAGE);
  assert.equal(r.title, 'Ohm & Law — Physics');
  assert.equal(r.byline, 'A. Teacher');
  assert.match(r.text, /^# Ohm's Law/);
  assert.match(r.text, /V = IR/);
  assert.match(r.text, /नमस्ते — ओम का नियम/);
  assert.match(r.text, /- Voltage\n- Current/);
  for (const junk of ['SCRIPTTEXT', 'NAVITEM', 'COOKIEJUNK', 'SITEHEADER', 'SHAREJUNK', 'ASIDEJUNK', 'COMMENTJUNK', 'FOOTERJUNK', 'color:red']) {
    assert.ok(!r.text.includes(junk), `leaked ${junk}`);
  }
  assert.ok(!/<[a-z]/.test(r.text));
});

test('web: extractReadable without <article> falls back to body text; tolerates unclosed tags', () => {
  const r = extractReadable('<html><body><h2>Title</h2><p>One<p>Two <i>three</i><br>four<div>five</div><script>x</script></body></html>');
  assert.equal(r.text, '## Title\n\nOne\nTwo three\nfour\nfive');
});

test('web: fetchText returns readable text from HTML', async () => {
  const w = createWeb({ config: cfgStore() }, { fetch: mockFetch(() => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })) });
  const r = await w.fetchText('https://school.example/ohm');
  assert.equal(r.title, 'Ohm & Law — Physics');
  assert.ok(r.text.includes('Resistance depends'));
  const raw = await w.fetchText('https://school.example/ohm', { raw: true });
  assert.ok(raw.text.includes('<nav>'));
});

test('web: search providers (searxng, brave, tavily) build correct requests', async () => {
  const f = mockFetch((c) => {
    if (c.url.includes('searx.example')) return json({ results: [{ title: 'T', url: 'https://a.example', content: 'S' }, { title: 'no url' }] });
    if (c.url.includes('brave.com')) return json({ web: { results: [{ title: 'B', url: 'https://b.example', description: 'x &amp; <b>y</b>' }] } });
    return json({ results: [{ title: 'V', url: 'https://t.example', content: 'c' }] });
  });
  const mk = (cfg) => createWeb({ config: cfgStore(cfg) }, { fetch: f });
  const s = await mk({ 'web.searchProvider': 'searxng', 'web.searchUrl': 'https://searx.example/' }).search('cbse paper');
  assert.equal(s.results.length, 1);
  const u = new URL(f.calls[0].url);
  assert.equal(u.pathname, '/search'); assert.equal(u.searchParams.get('format'), 'json'); assert.equal(u.searchParams.get('q'), 'cbse paper');
  const b = await mk({ 'web.searchProvider': 'brave', 'web.searchKey': 'K' }).search('x');
  assert.equal(f.calls[1].headers['X-Subscription-Token'], 'K');
  assert.equal(b.results[0].snippet, 'x & y');
  const t = await mk({ 'web.searchProvider': 'tavily', 'web.searchKey': 'TK' }).search('y', { n: 3 });
  assert.equal(f.calls[2].method, 'POST');
  assert.deepEqual(JSON.parse(f.calls[2].body), { query: 'y', max_results: 3 });
  assert.equal(t.results[0].url, 'https://t.example');
  await assert.rejects(() => mk({}).search('z'), (e) => e.code === 'needs_config');
});

/* ---------------- localfs (fake FS Access handles) ---------------- */
function fakeDir(name, tree = {}) {
  const d = {
    kind: 'directory', name, tree,
    async *values() { for (const [n, v] of Object.entries(tree)) yield v.kind ? v : fakeFile(n, v, tree); },
    async getDirectoryHandle(n, { create } = {}) {
      if (tree[n] && tree[n].kind === 'directory') return tree[n];
      if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      return (tree[n] = fakeDir(n, {}));
    },
    async getFileHandle(n, { create } = {}) {
      if (typeof tree[n] === 'string') return fakeFile(n, tree[n], tree);
      if (!create) throw Object.assign(new Error('nf'), { name: 'NotFoundError' });
      tree[n] = ''; return fakeFile(n, '', tree);
    },
    async removeEntry(n) { delete tree[n]; },
  };
  return d;
}
function fakeFile(name, content, tree) {
  return {
    kind: 'file', name,
    async getFile() { return new File([content], name, { lastModified: 1700000000000 }); },
    async createWritable() { let buf = ''; return { async write(x) { buf = typeof x === 'string' ? x : await x.text(); }, async close() { tree[name] = buf; } }; },
  };
}
test('localfs: list (ignore list), read, write/overwrite gate, recursive search, traversal blocked', async () => {
  const root = fakeDir('proj', {
    'a.md': 'alpha beta', '.git': fakeDir('.git', { cfg: 'x' }), node_modules: fakeDir('node_modules', { 'z.js': 'beta' }),
    sub: fakeDir('sub', { 'notes.txt': 'find the NEEDLE here', deep: fakeDir('deep', { 'beta.md': 'x' }) }),
  });
  const fs = createLocalFs({ config: cfgStore() }, { root, win: null, kv: { get: async () => null, set: async () => {}, del: async () => {} } });
  assert.equal(fs.status(), 'ready');
  const l = await fs.list('');
  assert.deepEqual(l.items.map((i) => i.name), ['sub', 'a.md']);
  assert.equal(l.items[1].size, 10);
  assert.equal(await fs.read('a.md'), 'alpha beta');
  assert.equal(await fs.read('sub/notes.txt', { as: 'text' }), 'find the NEEDLE here');
  const w = await fs.write('out/new/file.txt', 'hello');
  assert.equal(w.overwritten, false);
  assert.equal(root.tree.out.tree.new.tree['file.txt'], 'hello');
  await assert.rejects(() => fs.write('a.md', 'x'), (e) => e.code === 'confirmation_required');
  assert.equal(root.tree['a.md'], 'alpha beta');
  await fs.write('a.md', 'replaced', { confirmed: true });
  assert.equal(root.tree['a.md'], 'replaced');
  const byName = await fs.search('beta*');
  assert.deepEqual(byName.items.map((i) => i.path), ['sub/deep/beta.md']); // node_modules ignored
  const byContent = await fs.search('needle', { content: true });
  assert.equal(byContent.items[0].path, 'sub/notes.txt');
  assert.match(byContent.items[0].snippet, /NEEDLE/);
  await assert.rejects(() => fs.read('../etc/passwd'), (e) => e.code === 'bad_path');
  assert.deepEqual(splitPath('/a//b/./c'), ['a', 'b', 'c']);
  await assert.rejects(() => fs.remove('a.md'), (e) => e.code === 'confirmation_required');
  await fs.remove('a.md', { confirmed: true });
  assert.equal(root.tree['a.md'], undefined);
});

test('localfs: unsupported under Node without handle', () => {
  const fs = createLocalFs({ config: cfgStore() }, { win: null, kv: { get: async () => null, set: async () => {}, del: async () => {} } });
  assert.equal(fs.status(), 'unsupported');
});

/* ---------------- device (fake Cache API) ---------------- */
function fakeCaches() {
  const store = new Map();
  const cache = {
    async keys() { return [...store.keys()].map((u) => new Request(u)); },
    async match(r) { const u = typeof r === 'string' ? r : r.url; const v = store.get(u); return v ? v.clone() : undefined; },
    async put(u, res) { store.set(u, res); },
    async delete(r) { return store.delete(typeof r === 'string' ? r : r.url); },
  };
  return { open: async () => cache, store };
}
test('device: share inbox lists, reads files, discards (gated)', async () => {
  const c = fakeCaches();
  const base = 'https://guru.test';
  const cache = await c.open(SHARE_CACHE);
  await cache.put(`${base}/__share__/s1/meta.json`, new Response(JSON.stringify({ id: 's1', ts: 5, title: 'Paper', text: 'hi', url: '', files: [{ name: 'q.txt', type: 'text/plain', size: 3 }] })));
  await cache.put(`${base}/__share__/s1/file/0`, new Response('abc', { headers: { 'Content-Type': 'text/plain', 'X-Filename': encodeURIComponent('q.txt') } }));
  await cache.put(`${base}/__share__/s2/meta.json`, new Response(JSON.stringify({ id: 's2', ts: 9, text: 'newer' })));
  const events = [];
  const dev = createDevice({ bus: { emit: (e, p) => events.push([e, p]) } }, { caches: c, loc: { origin: base }, nav: {} });
  const list = await dev.inbox.list();
  assert.deepEqual(list.map((s) => s.id), ['s2', 's1']);
  const f = await dev.inbox.file('s1', 0);
  assert.equal(f.name, 'q.txt'); assert.equal(await f.blob.text(), 'abc');
  assert.equal((await dev.list()).items[1].name, 'Paper');
  assert.equal((await dev.search('paper')).items.length, 1);
  await assert.rejects(() => dev.remove('s1'), (e) => e.code === 'confirmation_required');
  await dev.remove('s1', { confirmed: true });
  assert.equal((await dev.inbox.list()).length, 1);
  assert.ok(![...c.store.keys()].some((u) => u.includes('/s1/')));
});

/* ---------------- index / tools ---------------- */
function fakeKernel(config = {}) {
  const tools = new Map(); const services = new Map(); const intents = [];
  return {
    tools: { register: (t) => tools.set(t.name, t), call: (n, a, c) => tools.get(n).run(a, c), list: () => [...tools.values()] },
    services: { set: (n, v) => services.set(n, v), get: (n) => services.get(n), has: (n) => services.has(n) },
    intents: { register: (i) => intents.push(i) },
    config: cfgStore(config), bus: { on() {}, emit() {}, once() {} }, _t: tools, _i: intents,
  };
}
const CONTRACT_TOOLS = ['drive_list', 'drive_search', 'drive_read', 'drive_write', 'local_pick', 'local_save', 'github_get', 'github_put', 'web_fetch', 'web_search'];

test('index: registers service + all contract tools with valid schemas; list() shape', async () => {
  const k = fakeKernel();
  await register(k, { localfs: { win: null, kv: { get: async () => null, set: async () => {}, del: async () => {} } }, device: { caches: null, nav: null, doc: null, loc: null } });
  for (const n of CONTRACT_TOOLS) {
    const t = k._t.get(n);
    assert.ok(t, `missing tool ${n}`);
    assert.equal(t.schema.type, 'object');
    assert.equal(typeof t.run, 'function');
    assert.ok(t.description.length > 10);
  }
  const svc = k.services.get('connectors');
  const ids = svc.list().map((c) => c.id);
  assert.deepEqual(ids, ['gdrive', 'localfs', 'github', 'web', 'device']);
  for (const c of svc.list()) assert.ok(['ready', 'needs-auth', 'unsupported'].includes(c.status));
  assert.equal(svc.get('web').id, 'web');
  assert.throws(() => svc.get('nope'));
  assert.ok(k._i.length >= 1);
  const m = k._i.find((i) => i.id === 'web_search');
  assert.ok(m.patterns.some((p) => p.test('search the web for ohm law')));
  assert.equal(m.extract('search the web for ohm law').q, 'ohm law');
});

test('index tools: structured results; destructive ops need confirmed', async () => {
  const f = mockFetch((c) => {
    if (c.url.includes('/drive/v3/files/') && c.method === 'PATCH') return json({ id: 'x', name: 'x', mimeType: 'text/plain' });
    if (c.url.includes('api.github.com')) return json({ message: 'Not Found' }, 404);
    return json({ files: [] });
  });
  const k = fakeKernel({ 'github.token': 'p', 'github.allowlist': ['me/r'] });
  await register(k, { gdrive: { fetch: f, sleep: noSleep }, github: { fetch: f, sleep: noSleep }, web: { fetch: f }, localfs: { win: null, kv: { get: async () => null, set: async () => {}, del: async () => {} } }, device: { caches: null, nav: null, doc: null, loc: null } });
  k.services.get('connectors').gdrive.setToken('t');
  const call = (n, a) => k.tools.call(n, a, {});
  const trash = await call('drive_trash', { id: 'x' });
  assert.equal(trash.ok, false); assert.equal(trash.needsConfirmation, true);
  assert.equal((await call('drive_trash', { id: 'x', confirmed: true })).ok, true);
  const list = await call('drive_list', {});
  assert.deepEqual([list.ok, list.items], [true, []]);
  const put = await call('github_put', { repo: 'me/r', path: 'a', content: 'x' });
  assert.equal(put.needsConfirmation, true);
  const bad = await call('github_get', { repo: 'evil/r', path: 'a' });
  assert.equal(bad.ok, false); assert.equal(bad.error.code, 'repo_not_allowed');
  const ssrf = await call('web_fetch', { url: 'https://localhost/x' });
  assert.equal(ssrf.error.code, 'ssrf_blocked');
  const sheet = await call('sheet_update', { id: 's', range: 'A1', values: [[1]] });
  assert.equal(sheet.needsConfirmation, true);
  const lp = await call('local_save', { path: 'x.txt', content: 'a' });
  assert.equal(lp.ok, false);
});
