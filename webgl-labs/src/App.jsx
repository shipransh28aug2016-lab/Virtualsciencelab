/**
 * The lab index and its router.
 *
 * Hash routing, deliberately: these pages are opened from a school VLE, a
 * shared drive or a USB stick as often as from a server, and a hash route works
 * from file:// where a history route does not.
 *
 * Nothing here lists the labs. Each one owns a folder,
 *
 *     src/experiments/[Class]/[Subject]/[Code]/{ meta.js, index.jsx, ... }
 *
 * and is discovered by glob, so adding the next experiment touches nothing that
 * already works — and there is no registry to forget to update.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

/* meta.js is tiny and read eagerly for the index; index.jsx drags in three, the
   shaders and the whole engine, so it is only fetched when a bench is opened. */
const METAS = import.meta.glob('./experiments/*/*/*/meta.js', { eager: true, import: 'default' });
const LOADERS = import.meta.glob('./experiments/*/*/*/index.jsx');

const LABS = Object.entries(METAS)
  .map(([path, meta]) => ({ ...meta, load: LOADERS[path.replace('meta.js', 'index.jsx')] }))
  .filter((lab) => typeof lab.load === 'function')
  .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));

const GROUPS = ['XI · Chemistry', 'XI · Physics', 'XII · Chemistry', 'XII · Physics'];
const groupOf = (lab) => `${lab.class} · ${lab.subject}`;

const routeFromHash = () => (window.location.hash || '').replace(/^#\/?/, '').toUpperCase();

function Index() {
  const [group, setGroup] = useState('All');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LABS.filter((lab) => (group === 'All' || groupOf(lab) === group)
      && (!q || `${lab.code} ${lab.title} ${lab.blurb}`.toLowerCase().includes(q)));
  }, [group, query]);

  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g, LABS.filter((l) => groupOf(l) === g).length])), []);

  return (
    <div className="min-h-dvh w-full bg-[#070b14] px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Virtual Science Laboratory</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Physics-driven simulations for the CBSE practical syllabus. Every quantity on screen is solved from
          the governing law each frame; none of them is looked up from a table of expected answers.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {['All', ...GROUPS].map((g) => (
            <button
              key={g} onClick={() => setGroup(g)}
              className={`rounded-full border px-3 py-1 text-[12px] transition ${
                group === g ? 'border-sky-300/50 bg-sky-400/15 text-sky-100'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}
            >
              {g}{g !== 'All' ? <span className="ml-1.5 font-mono text-[10px] text-slate-500">{counts[g]}</span> : null}
            </button>
          ))}
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" aria-label="Search experiments"
            className="ml-auto w-48 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-[12px] text-slate-100
                       outline-none transition focus:border-sky-400/60"
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((lab) => (
            <a
              key={lab.code} href={`#/${lab.code}`}
              className={`group rounded-2xl border border-white/10 bg-gradient-to-br ${lab.accent}
                          p-5 transition hover:border-white/25 hover:shadow-2xl hover:shadow-black/40`}
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{lab.code}</div>
              <div className="mt-1 text-base font-semibold leading-snug text-slate-100">{lab.title}</div>
              <div className="mt-2 text-[12px] leading-snug text-slate-300/80">{lab.blurb}</div>
              <div className="mt-3 text-[11px] text-slate-400">{groupOf(lab)} · {lab.unit}</div>
              <div className="mt-3 text-[12px] text-sky-300 opacity-0 transition group-hover:opacity-100">Open the bench →</div>
            </a>
          ))}
          {shown.length === 0 ? <div className="text-sm text-slate-500">Nothing matches that.</div> : null}
        </div>
      </div>
    </div>
  );
}

const Loading = () => (
  <div className="flex h-dvh w-full items-center justify-center bg-[#070b14] text-sm text-slate-400">
    Setting up the bench…
  </div>
);

export default function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const lab = LABS.find((l) => l.code.toUpperCase() === route);

  /* Memoised on the route. lazy() called during render would hand React a new
     component type on every state change and remount the whole scene — WebGL
     context and all — which is a very expensive way to update a slider. */
  const Lab = useMemo(() => (lab ? lazy(lab.load) : null), [lab]);
  if (!lab) return <Index />;

  return (
    <Suspense fallback={<Loading />}>
      <a
        href="#/"
        className="absolute left-4 top-4 z-50 hidden rounded-lg border border-white/10 bg-black/40 px-2 py-1
                   text-[11px] text-slate-300 backdrop-blur transition hover:bg-white/10 xl:block"
      >
        ← All experiments
      </a>
      <Lab />
    </Suspense>
  );
}
