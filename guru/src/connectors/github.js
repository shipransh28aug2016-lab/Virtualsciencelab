// GitHub connector: REST contents get/put (sha handling), branches, PRs. PAT from config/keys; repo allowlist.
import {
  ConnectorError, confirmRequired, requestWithRetry, errorFromResponse, bytesToBase64, base64ToBytes, fromUtf8, toBytes,
  safeTool, contentFromArgs,
} from './util.js';

const API = 'https://api.github.com';
const encPath = (p) => String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');

/** Parse "owner/name[/path...]" or a github.com URL. */
export function parseRepoPath(s) {
  let str = String(s || '').trim();
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:blob|tree)\/([^/]+)\/?(.*))?/i.exec(str);
  if (m) return { repo: `${m[1]}/${m[2].replace(/\.git$/, '')}`, path: m[4] || '', ref: m[3] || undefined };
  str = str.replace(/^\/+/, '');
  const parts = str.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) throw new ConnectorError('bad_repo', 'Expected "owner/repo[/path]"');
  return { repo: `${parts[0]}/${parts[1].replace(/\.git$/, '')}`, path: parts.slice(2).join('/') };
}

/** Does `repo` match an allowlist ("owner/name", "owner/*" or "*")? */
export function repoAllowed(repo, allowlist) {
  const list = (Array.isArray(allowlist) ? allowlist : String(allowlist || '').split(/[\s,]+/)).map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  const r = repo.toLowerCase();
  const [owner] = r.split('/');
  return list.some((a) => a === '*' || a === r || a === `${owner}/*`);
}

/**
 * @param {object} k kernel API
 * @param {{fetch?:Function, sleep?:Function, token?:string, allowlist?:string[]}} [opts]
 */
export function createGithub(k, opts = {}) {
  const cfg = (key, def) => (k && k.config ? k.config.get(key, def) : def);
  const doFetch = (...a) => (opts.fetch || globalThis.fetch)(...a);

  function syncToken() {
    if (opts.token) return opts.token;
    const c = cfg('github.token', '');
    if (c) return c;
    const keys = k && k.services && k.services.has && k.services.has('keys') ? k.services.get('keys') : null;
    if (keys && typeof keys.get === 'function') { const v = keys.get('github'); if (typeof v === 'string') return v; }
    return '';
  }
  async function getToken() {
    const t = syncToken();
    if (t) return t;
    const keys = k && k.services && k.services.has && k.services.has('keys') ? k.services.get('keys') : null;
    if (keys && typeof keys.get === 'function') { const v = await keys.get('github'); if (v) return v; }
    throw new ConnectorError('needs_auth', 'Set a GitHub personal access token in settings (github.token)');
  }
  const allowlist = () => opts.allowlist || cfg('github.allowlist', []);
  function assertAllowed(repo) {
    if (!repoAllowed(repo, allowlist())) {
      throw new ConnectorError('repo_not_allowed', `Repository ${repo} is not in the allowlist (config github.allowlist). Add "owner/repo" in settings.`);
    }
  }

  async function gh(path, { method = 'GET', body, query, accept, raw = false, okStatuses = [] } = {}) {
    const u = new URL(path.startsWith('http') ? path : `${API}${path}`);
    for (const [kk, v] of Object.entries(query || {})) if (v !== undefined && v !== null) u.searchParams.set(kk, String(v));
    const res = await requestWithRetry(doFetch, async () => {
      const t = await getToken();
      const headers = { Authorization: `Bearer ${t}`, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      return [u.toString(), { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }];
    }, { sleep: opts.sleep, baseDelay: opts.baseDelay, retries: opts.retries });
    if (raw) return res;
    if (!res.ok && !okStatuses.includes(res.status)) throw await errorFromResponse(res);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const fileItem = (repo, it) => ({ id: it.sha, name: it.name, mime: it.type === 'dir' ? 'inode/directory' : null, size: it.size || 0, modified: null, isDir: it.type === 'dir', path: `${repo}/${it.path}`, url: it.html_url || null });

  const api = {
    id: 'github', name: 'GitHub', icon: 'github',
    parseRepoPath, repoAllowed,
    status() { return syncToken() ? 'ready' : 'needs-auth'; },
    async connect() { await getToken(); const me = await gh('/user'); return { status: 'ready', user: me.login }; },
    async disconnect() { if (k && k.config) k.config.set('github.token', ''); return { status: api.status() }; },

    /** Repositories visible to the token, filtered by the allowlist. */
    async repos({ page = 1 } = {}) {
      const r = await gh('/user/repos', { query: { per_page: 100, sort: 'pushed', page } });
      const al = allowlist();
      return r.filter((x) => repoAllowed(x.full_name, al)).map((x) => ({ id: x.full_name, name: x.full_name, mime: 'inode/directory', size: x.size, modified: x.pushed_at, isDir: true, path: x.full_name, url: x.html_url, defaultBranch: x.default_branch, private: x.private }));
    },

    /** get('owner/repo', 'path', {ref}) -> {type:'file',sha,text,...} | {type:'dir',items} */
    async get(repo, path = '', { ref } = {}) {
      assertAllowed(repo);
      const r = await gh(`/repos/${repo}/contents/${encPath(path)}`, { query: { ref } });
      if (Array.isArray(r)) return { type: 'dir', repo, path, items: r.map((it) => fileItem(repo, it)) };
      let bytes;
      if (r.content && r.encoding === 'base64') bytes = base64ToBytes(r.content);
      else {
        const raw = await gh(`/repos/${repo}/contents/${encPath(path)}`, { query: { ref }, accept: 'application/vnd.github.raw+json', raw: true });
        if (!raw.ok) throw await errorFromResponse(raw);
        bytes = new Uint8Array(await raw.arrayBuffer());
      }
      return { type: 'file', repo, path: r.path, sha: r.sha, size: r.size, url: r.html_url, bytes, text: fromUtf8(bytes) };
    },

    async list(pathOrQuery = '', { ref } = {}) {
      if (!pathOrQuery) return { items: await api.repos() };
      const { repo, path, ref: r2 } = parseRepoPath(pathOrQuery);
      const d = await api.get(repo, path, { ref: ref || r2 });
      if (d.type !== 'dir') return { items: [{ id: d.sha, name: d.path.split('/').pop(), mime: null, size: d.size, modified: null, isDir: false, path: `${repo}/${d.path}`, url: d.url }] };
      return { items: d.items };
    },
    async read(idOrPath, { as = 'text', ref } = {}) {
      const p = parseRepoPath(idOrPath);
      const f = await api.get(p.repo, p.path, { ref: ref || p.ref });
      if (f.type !== 'file') throw new ConnectorError('is_directory', `${idOrPath} is a directory`);
      if (as === 'blob') return new Blob([f.bytes]);
      if (as === 'json') return JSON.parse(f.text);
      return f.text;
    },

    /** Create/update a file. Requires confirmed:true. Handles sha lookup and one retry on sha conflict. */
    async put(repo, path, content, { message, branch, sha, confirmed = false } = {}) {
      assertAllowed(repo);
      if (confirmed !== true) throw confirmRequired(`commit ${path} to ${repo}${branch ? `@${branch}` : ''}`, { repo, path, branch: branch || null });
      const bytes = await toBytes(content);
      const b64 = bytesToBase64(bytes);
      const lookup = async () => {
        const r = await gh(`/repos/${repo}/contents/${encPath(path)}`, { query: { ref: branch }, okStatuses: [404] });
        return r && !Array.isArray(r) ? r.sha : undefined;
      };
      let useSha = sha;
      const auto = !sha;
      if (auto) useSha = await lookup();
      const attempt = (s) => gh(`/repos/${repo}/contents/${encPath(path)}`, {
        method: 'PUT', raw: true,
        body: { message: message || `${s ? 'Update' : 'Add'} ${path} via Guru`, content: b64, ...(branch ? { branch } : {}), ...(s ? { sha: s } : {}) },
      });
      let res = await attempt(useSha);
      if (auto && (res.status === 409 || res.status === 422)) { useSha = await lookup(); res = await attempt(useSha); }
      if (!res.ok) throw await errorFromResponse(res, 'put_failed');
      const j = await res.json();
      return { id: j.content.sha, name: j.content.name, url: j.content.html_url, sha: j.content.sha, commit: j.commit && j.commit.sha, created: !useSha };
    },
    async write(idOrPath, content, o = {}) {
      const p = parseRepoPath(idOrPath);
      return api.put(p.repo, p.path, content, { ...o, branch: o.branch || p.ref });
    },

    async branches(repo) {
      assertAllowed(repo);
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const r = await gh(`/repos/${repo}/branches`, { query: { per_page: 100, page } });
        out.push(...r.map((b) => ({ name: b.name, sha: b.commit.sha, protected: !!b.protected })));
        if (r.length < 100) break;
      }
      return out;
    },
    async createBranch(repo, name, { from } = {}) {
      assertAllowed(repo);
      const base = from || (await gh(`/repos/${repo}`)).default_branch;
      const ref = await gh(`/repos/${repo}/git/ref/heads/${encPath(base)}`);
      const r = await gh(`/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${name}`, sha: ref.object.sha } });
      return { branch: name, from: base, sha: r.object.sha };
    },
    async createPR(repo, { title, head, base, body, draft = false }) {
      assertAllowed(repo);
      const b = base || (await gh(`/repos/${repo}`)).default_branch;
      const r = await gh(`/repos/${repo}/pulls`, { method: 'POST', body: { title, head, base: b, body: body || '', draft } });
      return { number: r.number, url: r.html_url, state: r.state, head, base: b };
    },
    async search(q) {
      const al = [].concat(allowlist()).flatMap((s) => String(s).split(/[\s,]+/)).filter((s) => s && s !== '*');
      if (!al.length) throw new ConnectorError('repo_not_allowed', 'Configure github.allowlist with specific repos before searching code');
      const quals = al.map((a) => (a.endsWith('/*') ? `user:${a.slice(0, -2)}` : `repo:${a}`)).join(' ');
      const r = await gh('/search/code', { query: { q: `${q} ${quals}`, per_page: 30 } });
      return { items: (r.items || []).map((it) => ({ id: it.sha, name: it.name, mime: null, size: 0, modified: null, isDir: false, path: `${it.repository.full_name}/${it.path}`, url: it.html_url })) };
    },
    async remove(idOrPath, { confirmed = false, message, branch } = {}) {
      if (confirmed !== true) throw confirmRequired(`delete ${idOrPath} from GitHub`, { path: idOrPath });
      const p = parseRepoPath(idOrPath);
      assertAllowed(p.repo);
      const f = await api.get(p.repo, p.path, { ref: branch || p.ref });
      if (f.type !== 'file') throw new ConnectorError('is_directory', 'Only files can be deleted');
      await gh(`/repos/${p.repo}/contents/${encPath(p.path)}`, { method: 'DELETE', body: { message: message || `Delete ${p.path} via Guru`, sha: f.sha, ...(branch ? { branch } : {}) } });
      return { id: idOrPath, removed: true };
    },
  };
  return api;
}

export function githubTools(gh) {
  const repo = { type: 'string', description: 'owner/name (must be in github.allowlist)' };
  return [
    { name: 'github_get', tags: ['github'], description: 'Get a file (text + sha) or directory listing from an allow-listed GitHub repo.',
      schema: { type: 'object', properties: { repo, path: { type: 'string' }, ref: { type: 'string', description: 'branch, tag or sha' }, maxChars: { type: 'number' } }, required: ['repo'] },
      run: safeTool(async (a) => {
        const r = await gh.get(a.repo, a.path || '', { ref: a.ref });
        if (r.type === 'dir') return { type: 'dir', items: r.items };
        const max = a.maxChars || 200000;
        return { type: 'file', path: r.path, sha: r.sha, size: r.size, url: r.url, text: r.text.slice(0, max), truncated: r.text.length > max };
      }) },
    { name: 'github_put', tags: ['github', 'destructive'], description: 'Create or update a file in an allow-listed GitHub repo (commit). Requires confirmed:true. sha is looked up automatically when omitted.',
      schema: { type: 'object', properties: { repo, path: { type: 'string' }, content: { type: 'string' }, contentBase64: { type: 'string' }, message: { type: 'string' }, branch: { type: 'string' }, sha: { type: 'string' }, confirmed: { type: 'boolean' } }, required: ['repo', 'path'] },
      run: safeTool(async (a) => gh.put(a.repo, a.path, contentFromArgs(a), { message: a.message, branch: a.branch, sha: a.sha, confirmed: a.confirmed })) },
    { name: 'github_branch', tags: ['github'], description: 'Create a branch (default: from the default branch) or list branches when name is omitted.',
      schema: { type: 'object', properties: { repo, name: { type: 'string' }, from: { type: 'string' } }, required: ['repo'] },
      run: safeTool(async (a) => (a.name ? gh.createBranch(a.repo, a.name, { from: a.from }) : { branches: await gh.branches(a.repo) })) },
    { name: 'github_pr', tags: ['github'], description: 'Open a pull request from head into base (default branch).',
      schema: { type: 'object', properties: { repo, title: { type: 'string' }, head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' }, draft: { type: 'boolean' } }, required: ['repo', 'title', 'head'] },
      run: safeTool(async (a) => gh.createPR(a.repo, a)) },
  ];
}
