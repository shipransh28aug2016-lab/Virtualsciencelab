/**
 * The lab index and its router.
 *
 * Hash routing, deliberately: these pages are opened from a school VLE, a
 * shared drive or a USB stick as often as from a server, and a hash route works
 * from file:// where a history route does not.
 *
 * Each experiment owns its whole stack — engine, shaders, scene, HUD — under
 * src/experiments/[Class]/[Subject]/[Code]/, so adding the next one touches
 * nothing that already works.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';

const LABS = [
  {
    code: 'XI-CHE-B01',
    title: 'Determination of the melting point of an organic compound',
    blurb: 'Schröder–van Laar liquidus, binary eutectics and the lever rule. Purity is something you measure here, not something the app tells you.',
    meta: 'Class XI · Chemistry · Unit 12',
    accent: 'from-amber-400/20 to-rose-500/10',
    load: () => import('./experiments/XI/Chemistry/XI-CHE-B01/index.jsx'),
  },
  {
    code: 'XII-CHE-A01',
    title: 'Coagulation of colloids and the Tyndall effect',
    blurb: 'Hardy–Schulze by counter-ion sign and charge, Smoluchowski aggregation, Rayleigh–Mie scattering and Stokes settling on fractal flocs.',
    meta: 'Class XII · Chemistry · Surface chemistry',
    accent: 'from-sky-400/20 to-indigo-500/10',
    load: () => import('./labs/SurfaceChemistryLab.jsx'),
  },
];

const routeFromHash = () => (window.location.hash || '').replace(/^#\/?/, '').toUpperCase();

function Index() {
  return (
    <div className="min-h-dvh w-full bg-[#070b14] px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Virtual Science Laboratory</h1>
        <p className="mt-1 text-sm text-slate-400">
          Physics-driven simulations for the CBSE practical syllabus. Every quantity on screen is solved from
          the governing law each frame; none of them is looked up from a table of expected answers.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {LABS.map((lab) => (
            <a
              key={lab.code}
              href={`#/${lab.code}`}
              className={`group rounded-2xl border border-white/10 bg-gradient-to-br ${lab.accent}
                          p-5 transition hover:border-white/25 hover:shadow-2xl hover:shadow-black/40`}
            >
              <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{lab.code}</div>
              <div className="mt-1 text-base font-semibold text-slate-100">{lab.title}</div>
              <div className="mt-2 text-[12px] leading-snug text-slate-300/80">{lab.blurb}</div>
              <div className="mt-3 text-[11px] text-slate-400">{lab.meta}</div>
              <div className="mt-3 text-[12px] text-sky-300 opacity-0 transition group-hover:opacity-100">Open the bench →</div>
            </a>
          ))}
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

  const lab = LABS.find((l) => l.code === route);

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
