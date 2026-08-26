/**
 * Service worker — offline-first app shell (§3).
 * Strategy: precache the whole shell on install; cache-first at runtime so the
 * lab NEVER waits on a network. Navigation falls back to the cached index.
 */
const VERSION = 'vlab-2026-27-v35';
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/app.css",
  "src/main.js",
  "src/core/state-machine.js",
  "src/utils/rng.js",
  "src/utils/measure.js",
  "src/components/graph.js",
  "src/assessment/engine.js",
  "src/offline/db.js",
  "src/simulation/renderers/apparatus.js",
  "src/simulation/renderers/index.js",
  "data/curriculum/cbse-2026-27.json",
  "data/experiments/index.json",
  "src/simulation/renderers/chemistry-new.js",
  "src/simulation/renderers/chemistry.js",
  "src/simulation/renderers/electricity.js",
  "src/simulation/renderers/mechanics.js",
  "src/simulation/renderers/optics.js",
  "src/simulation/renderers/thermal-fluids.js",
  "src/simulation/models/auxiliary-lens.js",
  "src/simulation/models/beam-balance.js",
  "src/simulation/models/bernoulli-pressure.js",
  "src/simulation/models/bimetallic-strip.js",
  "src/simulation/models/biomolecule-test.js",
  "src/simulation/models/boiling-point.js",
  "src/simulation/models/boyles-law.js",
  "src/simulation/models/calorimetry.js",
  "src/simulation/models/chromatography.js",
  "src/simulation/models/circuit-assembly.js",
  "src/simulation/models/circuit-fault.js",
  "src/simulation/models/clock-reaction.js",
  "src/simulation/models/component-id.js",
  "src/simulation/models/concave-mirror.js",
  "src/simulation/models/convex-lens.js",
  "src/simulation/models/cooling-curve.js",
  "src/simulation/models/cooling-factors.js",
  "src/simulation/models/crystallisation.js",
  "src/simulation/models/detergent-surface-tension.js",
  "src/simulation/models/dialysis.js",
  "src/simulation/models/diode-tester.js",
  "src/simulation/models/electrochemical-cell.js",
  "src/simulation/models/electronic-balance.js",
  "src/simulation/models/emulsion.js",
  "src/simulation/models/energy-conservation.js",
  "src/simulation/models/equilibrium-shift.js",
  "src/simulation/models/friction.js",
  "src/simulation/models/functional-group-test.js",
  "src/simulation/models/galvanometer.js",
  "src/simulation/models/graph-plotting.js",
  "src/simulation/models/helical-spring.js",
  "src/simulation/models/household-circuit.js",
  "src/simulation/models/image-formation.js",
  "src/simulation/models/inclined-plane.js",
  "src/simulation/models/inductor-impedance.js",
  "src/simulation/models/irregular-lamina.js",
  "src/simulation/models/lassaigne-test.js",
  "src/simulation/models/lateral-deviation.js",
  "src/simulation/models/ldr-intensity.js",
  "src/simulation/models/lens-combination.js",
  "src/simulation/models/liquid-expansion.js",
  "src/simulation/models/melting-point.js",
  "src/simulation/models/metre-bridge.js",
  "src/simulation/models/multimeter.js",
  "src/simulation/models/organic-preparation.js",
  "src/simulation/models/paper-scale.js",
  "src/simulation/models/parallelogram-law.js",
  "src/simulation/models/pendulum-damping.js",
  "src/simulation/models/ph-determination.js",
  "src/simulation/models/pn-diode.js",
  "src/simulation/models/potential-drop.js",
  "src/simulation/models/principle-of-moments.js",
  "src/simulation/models/prism-deviation.js",
  "src/simulation/models/projectile-range.js",
  "src/simulation/models/reaction-kinetics.js",
  "src/simulation/models/refractive-index.js",
  "src/simulation/models/resistivity.js",
  "src/simulation/models/resonance-tube.js",
  "src/simulation/models/rolling-friction.js",
  "src/simulation/models/salt-analysis.js",
  "src/simulation/models/salt-preparation.js",
  "src/simulation/models/scale-depression.js",
  "src/simulation/models/screw-gauge.js",
  "src/simulation/models/simple-pendulum.js",
  "src/simulation/models/single-slit-diffraction.js",
  "src/simulation/models/sol-preparation.js",
  "src/simulation/models/sonometer.js",
  "src/simulation/models/specific-heat.js",
  "src/simulation/models/spherometer.js",
  "src/simulation/models/standard-solution.js",
  "src/simulation/models/surface-tension.js",
  "src/simulation/models/titration.js",
  "src/simulation/models/vernier-callipers.js",
  "src/simulation/models/viscosity.js",
  "src/simulation/models/wax-cooling.js",
  "src/simulation/models/youngs-modulus.js",
  "data/experiments/class-xi/XI-CHE-B01-melting-point.json",
  "data/experiments/class-xi/XI-CHE-B02-boiling-point.json",
  "data/experiments/class-xi/XI-CHE-B03-crystallisation.json",
  "data/experiments/class-xi/XI-CHE-C01-ph-determination.json",
  "data/experiments/class-xi/XI-CHE-C02-strong-weak-acid-ph.json",
  "data/experiments/class-xi/XI-CHE-C03-titration-curve.json",
  "data/experiments/class-xi/XI-CHE-C04-common-ion-effect.json",
  "data/experiments/class-xi/XI-CHE-D01-equilibrium-fescn.json",
  "data/experiments/class-xi/XI-CHE-D02-equilibrium-cocl.json",
  "data/experiments/class-xi/XI-CHE-E01-electronic-balance.json",
  "data/experiments/class-xi/XI-CHE-E02-standard-oxalic-acid.json",
  "data/experiments/class-xi/XI-CHE-E03-titration.json",
  "data/experiments/class-xi/XI-CHE-E04-standard-sodium-carbonate.json",
  "data/experiments/class-xi/XI-CHE-E05-hcl-carbonate.json",
  "data/experiments/class-xi/XI-CHE-F01-salt-analysis.json",
  "data/experiments/class-xi/XI-CHE-F02-lassaigne-test.json",
  "data/experiments/class-xi/XI-PHY-A01-vernier-callipers.json",
  "data/experiments/class-xi/XI-PHY-A02-screw-gauge.json",
  "data/experiments/class-xi/XI-PHY-A03-irregular-lamina.json",
  "data/experiments/class-xi/XI-PHY-A04-spherometer.json",
  "data/experiments/class-xi/XI-PHY-A05-beam-balance.json",
  "data/experiments/class-xi/XI-PHY-A06-parallelogram-law.json",
  "data/experiments/class-xi/XI-PHY-A07-simple-pendulum.json",
  "data/experiments/class-xi/XI-PHY-A08-pendulum-mass.json",
  "data/experiments/class-xi/XI-PHY-A09-friction.json",
  "data/experiments/class-xi/XI-PHY-A10-inclined-plane.json",
  "data/experiments/class-xi/XI-PHY-ACT-A1-paper-scale.json",
  "data/experiments/class-xi/XI-PHY-ACT-A2-principle-of-moments.json",
  "data/experiments/class-xi/XI-PHY-ACT-A3-graph-plotting.json",
  "data/experiments/class-xi/XI-PHY-ACT-A4-rolling-friction.json",
  "data/experiments/class-xi/XI-PHY-ACT-A5-projectile-range.json",
  "data/experiments/class-xi/XI-PHY-ACT-A6-energy-conservation.json",
  "data/experiments/class-xi/XI-PHY-ACT-A7-pendulum-damping.json",
  "data/experiments/class-xi/XI-PHY-ACT-B1-wax-cooling.json",
  "data/experiments/class-xi/XI-PHY-ACT-B2-bimetallic-strip.json",
  "data/experiments/class-xi/XI-PHY-ACT-B3-liquid-expansion.json",
  "data/experiments/class-xi/XI-PHY-ACT-B4-detergent-surface-tension.json",
  "data/experiments/class-xi/XI-PHY-ACT-B5-cooling-factors.json",
  "data/experiments/class-xi/XI-PHY-ACT-B6-scale-depression.json",
  "data/experiments/class-xi/XI-PHY-ACT-B7-bernoulli-pressure.json",
  "data/experiments/class-xi/XI-PHY-B01-youngs-modulus.json",
  "data/experiments/class-xi/XI-PHY-B02-helical-spring.json",
  "data/experiments/class-xi/XI-PHY-B03-boyles-law.json",
  "data/experiments/class-xi/XI-PHY-B04-surface-tension.json",
  "data/experiments/class-xi/XI-PHY-B05-viscosity.json",
  "data/experiments/class-xi/XI-PHY-B06-cooling-curve.json",
  "data/experiments/class-xi/XI-PHY-B07-specific-heat.json",
  "data/experiments/class-xi/XI-PHY-B08-sonometer-length.json",
  "data/experiments/class-xi/XI-PHY-B09-sonometer-tension.json",
  "data/experiments/class-xi/XI-PHY-B10-resonance-tube.json",
  "data/experiments/class-xii/XII-CHE-A01-sol-preparation.json",
  "data/experiments/class-xii/XII-CHE-A02-dialysis.json",
  "data/experiments/class-xii/XII-CHE-A03-emulsion.json",
  "data/experiments/class-xii/XII-CHE-B01-reaction-kinetics.json",
  "data/experiments/class-xii/XII-CHE-B02-clock-reaction.json",
  "data/experiments/class-xii/XII-CHE-C01-enthalpy-dissolution.json",
  "data/experiments/class-xii/XII-CHE-C02-enthalpy-neutralisation.json",
  "data/experiments/class-xii/XII-CHE-C03-enthalpy-mixing.json",
  "data/experiments/class-xii/XII-CHE-D01-electrochemical-cell.json",
  "data/experiments/class-xii/XII-CHE-E01-paper-chromatography-pigments.json",
  "data/experiments/class-xii/XII-CHE-E02-chromatography-two-cations.json",
  "data/experiments/class-xii/XII-CHE-F01-mohrs-salt.json",
  "data/experiments/class-xii/XII-CHE-F02-potassium-ferric-oxalate.json",
  "data/experiments/class-xii/XII-CHE-G01-acetanilide.json",
  "data/experiments/class-xii/XII-CHE-G02-dibenzalacetone.json",
  "data/experiments/class-xii/XII-CHE-G03-p-nitroacetanilide.json",
  "data/experiments/class-xii/XII-CHE-G04-aniline-yellow.json",
  "data/experiments/class-xii/XII-CHE-H01-functional-group-tests.json",
  "data/experiments/class-xii/XII-CHE-I01-biomolecule-tests.json",
  "data/experiments/class-xii/XII-CHE-J01-kmno4-oxalic.json",
  "data/experiments/class-xii/XII-CHE-J02-kmno4-mohr.json",
  "data/experiments/class-xii/XII-CHE-K01-salt-analysis.json",
  "data/experiments/class-xii/XII-PHY-A01-resistivity.json",
  "data/experiments/class-xii/XII-PHY-A02-metre-bridge.json",
  "data/experiments/class-xii/XII-PHY-A03-combination-laws.json",
  "data/experiments/class-xii/XII-PHY-A04-galvanometer-half-deflection.json",
  "data/experiments/class-xii/XII-PHY-A05-galvanometer-conversion.json",
  "data/experiments/class-xii/XII-PHY-A06-ac-mains-frequency.json",
  "data/experiments/class-xii/XII-PHY-ACT-A1-inductor-impedance.json",
  "data/experiments/class-xii/XII-PHY-ACT-A2-multimeter.json",
  "data/experiments/class-xii/XII-PHY-ACT-A3-household-circuit.json",
  "data/experiments/class-xii/XII-PHY-ACT-A4-circuit-assembly.json",
  "data/experiments/class-xii/XII-PHY-ACT-A5-potential-drop.json",
  "data/experiments/class-xii/XII-PHY-ACT-A6-circuit-fault.json",
  "data/experiments/class-xii/XII-PHY-ACT-B1-component-id.json",
  "data/experiments/class-xii/XII-PHY-ACT-B2-diode-tester.json",
  "data/experiments/class-xii/XII-PHY-ACT-B3-ldr-intensity.json",
  "data/experiments/class-xii/XII-PHY-ACT-B4-lateral-deviation.json",
  "data/experiments/class-xii/XII-PHY-ACT-B5-single-slit-diffraction.json",
  "data/experiments/class-xii/XII-PHY-ACT-B6-image-formation.json",
  "data/experiments/class-xii/XII-PHY-ACT-B7-lens-combination.json",
  "data/experiments/class-xii/XII-PHY-B01-concave-mirror.json",
  "data/experiments/class-xii/XII-PHY-B02-convex-mirror.json",
  "data/experiments/class-xii/XII-PHY-B03-convex-lens.json",
  "data/experiments/class-xii/XII-PHY-B04-concave-lens.json",
  "data/experiments/class-xii/XII-PHY-B05-prism-deviation.json",
  "data/experiments/class-xii/XII-PHY-B06-refractive-index-slab.json",
  "data/experiments/class-xii/XII-PHY-B07-refractive-index-liquid-lens.json",
  "data/experiments/class-xii/XII-PHY-B08-refractive-index-mirror.json",
  "data/experiments/class-xii/XII-PHY-B09-pn-diode.json",
];

/*
 * Split the shell into what the app CANNOT run without and what it can fetch
 * later. Previously all 177 entries were cached with Promise.allSettled, which
 * has two faults on a weak connection:
 *
 *   1. `allSettled` never rejects, so an install in which half the requests
 *      failed still reported success and still called skipWaiting(). The app
 *      then claimed to be "Offline ready" while missing the very files it
 *      needed, and only failed later when the student was actually offline.
 *   2. Firing 177 parallel requests at a slow link makes them compete, and the
 *      browser kills the whole install if it takes too long. That is what made
 *      installing succeed only on the second or third attempt.
 *
 * CORE must all succeed or the install fails honestly and is retried.
 * The experiment JSONs are fetched afterwards in small batches; a miss there is
 * harmless because the fetch handler caches each one on first use anyway.
 */
/*
 * CORE is only what the home screen needs to paint and be usable:
 * the page, its stylesheet, the app code, the curriculum and the experiment
 * index. That is about 300 KB and roughly a dozen files.
 *
 * Everything else — the 76 simulation models, the renderers and the 100
 * experiment JSONs — is loaded on demand by the app, so it must NOT be able to
 * fail the install. It is still precached, because the app has to work offline,
 * but as best effort: anything missed is cached the first time it is used.
 *
 * Before this split all 177 files were required, and one failed request on a
 * weak connection meant the whole install failed and had to be retried.
 */
const isCore = (u) => !u.startsWith('data/experiments/')
    && !u.startsWith('src/simulation/models/')
    && !u.startsWith('src/simulation/renderers/')
  || u === 'data/experiments/index.json'
  || u === 'src/simulation/renderers/apparatus.js';

const CORE = SHELL.filter(isCore);
const CONTENT = SHELL.filter((u) => !isCore(u));

/** Fetch in small groups so a slow link is not asked for everything at once. */
async function addInBatches(cache, urls, size) {
  for (let i = 0; i < urls.length; i += size) {
    await Promise.allSettled(urls.slice(i, i + size).map((u) => cache.add(u)));
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);

    // The app shell: a failure here is a real failure, so let it reject.
    await addInBatchesStrict(c, CORE, 6);

    // Content: best effort. Anything missed is cached on first use.
    await addInBatches(c, CONTENT, 6);

    await self.skipWaiting();
  })());
});

/** Same batching, but any rejection fails the install so the browser retries. */
async function addInBatchesStrict(cache, urls, size) {
  for (let i = 0; i < urls.length; i += size) {
    await Promise.all(urls.slice(i, i + size).map((u) => cache.add(u)));
  }
}

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // never proxy third parties

  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then((r) => r || fetch(request).catch(() => caches.match('./'))),
    );
    return;
  }

  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match('index.html'));
    }),
  );
});
