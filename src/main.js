/**
 * CBSE V-LAB 2026-27 — application controller.
 * Wires curriculum data → simulation engine → components. No framework.
 */
import { ExperimentMachine, STATES, STATE_LABELS } from './core/state-machine.js';
import { renderScene, finishFrame, setCanvasTheme, resetScene } from './simulation/renderers/apparatus.js';
import * as Interact from './simulation/renderers/interact.js';
import { resetFluids } from './simulation/fluids.js';
import { renderGraph } from './components/graph.js';
import * as DB from './offline/db.js';
import {
  gradeMcq, gradeNumeric, gradeDuringLab, overallScore, masteryBand, checkResult, vivaScore,
} from './assessment/engine.js';


/*
 * Simulation models, loaded ON DEMAND.
 *
 * These 66 modules were statically imported, so every visit downloaded and
 * parsed all of them (~1.2 MB with the renderers) before the home screen could
 * paint a single card — even though the home screen runs no simulation at all.
 * A student opens one experiment at a time, so each model is now fetched when
 * its lab is opened and kept for the rest of the session.
 */
const MODEL_LOADERS = {
  'simple-pendulum': () => import('./simulation/models/simple-pendulum.js'),
  'helical-spring': () => import('./simulation/models/helical-spring.js'),
  'resistivity': () => import('./simulation/models/resistivity.js'),
  'convex-lens': () => import('./simulation/models/convex-lens.js'),
  'titration': () => import('./simulation/models/titration.js'),
  'reaction-kinetics': () => import('./simulation/models/reaction-kinetics.js'),
  'vernier-callipers': () => import('./simulation/models/vernier-callipers.js'),
  'surface-tension': () => import('./simulation/models/surface-tension.js'),
  'metre-bridge': () => import('./simulation/models/metre-bridge.js'),
  'pn-diode': () => import('./simulation/models/pn-diode.js'),
  'ph-determination': () => import('./simulation/models/ph-determination.js'),
  'electrochemical-cell': () => import('./simulation/models/electrochemical-cell.js'),
  'screw-gauge': () => import('./simulation/models/screw-gauge.js'),
  'friction': () => import('./simulation/models/friction.js'),
  'irregular-lamina': () => import('./simulation/models/irregular-lamina.js'),
  'spherometer': () => import('./simulation/models/spherometer.js'),
  'beam-balance': () => import('./simulation/models/beam-balance.js'),
  'parallelogram-law': () => import('./simulation/models/parallelogram-law.js'),
  'inclined-plane': () => import('./simulation/models/inclined-plane.js'),
  'viscosity': () => import('./simulation/models/viscosity.js'),
  'specific-heat': () => import('./simulation/models/specific-heat.js'),
  'cooling-curve': () => import('./simulation/models/cooling-curve.js'),
  'resonance-tube': () => import('./simulation/models/resonance-tube.js'),
  'prism-deviation': () => import('./simulation/models/prism-deviation.js'),
  'youngs-modulus': () => import('./simulation/models/youngs-modulus.js'),
  'boyles-law': () => import('./simulation/models/boyles-law.js'),
  'concave-mirror': () => import('./simulation/models/concave-mirror.js'),
  'sonometer': () => import('./simulation/models/sonometer.js'),
  'galvanometer': () => import('./simulation/models/galvanometer.js'),
  'auxiliary-lens': () => import('./simulation/models/auxiliary-lens.js'),
  'refractive-index': () => import('./simulation/models/refractive-index.js'),
  'paper-scale': () => import('./simulation/models/paper-scale.js'),
  'principle-of-moments': () => import('./simulation/models/principle-of-moments.js'),
  'graph-plotting': () => import('./simulation/models/graph-plotting.js'),
  'rolling-friction': () => import('./simulation/models/rolling-friction.js'),
  'projectile-range': () => import('./simulation/models/projectile-range.js'),
  'energy-conservation': () => import('./simulation/models/energy-conservation.js'),
  'pendulum-damping': () => import('./simulation/models/pendulum-damping.js'),
  'wax-cooling': () => import('./simulation/models/wax-cooling.js'),
  'bimetallic-strip': () => import('./simulation/models/bimetallic-strip.js'),
  'liquid-expansion': () => import('./simulation/models/liquid-expansion.js'),
  'detergent-surface-tension': () => import('./simulation/models/detergent-surface-tension.js'),
  'cooling-factors': () => import('./simulation/models/cooling-factors.js'),
  'scale-depression': () => import('./simulation/models/scale-depression.js'),
  'bernoulli-pressure': () => import('./simulation/models/bernoulli-pressure.js'),
  'melting-point': () => import('./simulation/models/melting-point.js'),
  'boiling-point': () => import('./simulation/models/boiling-point.js'),
  'crystallisation': () => import('./simulation/models/crystallisation.js'),
  'inductor-impedance': () => import('./simulation/models/inductor-impedance.js'),
  'multimeter': () => import('./simulation/models/multimeter.js'),
  'potential-drop': () => import('./simulation/models/potential-drop.js'),
  'household-circuit': () => import('./simulation/models/household-circuit.js'),
  'circuit-assembly': () => import('./simulation/models/circuit-assembly.js'),
  'circuit-fault': () => import('./simulation/models/circuit-fault.js'),
  'lateral-deviation': () => import('./simulation/models/lateral-deviation.js'),
  'single-slit-diffraction': () => import('./simulation/models/single-slit-diffraction.js'),
  'image-formation': () => import('./simulation/models/image-formation.js'),
  'lens-combination': () => import('./simulation/models/lens-combination.js'),
  'component-id': () => import('./simulation/models/component-id.js'),
  'diode-tester': () => import('./simulation/models/diode-tester.js'),
  'ldr-intensity': () => import('./simulation/models/ldr-intensity.js'),
  'sol-preparation': () => import('./simulation/models/sol-preparation.js'),
  'dialysis': () => import('./simulation/models/dialysis.js'),
  'emulsion': () => import('./simulation/models/emulsion.js'),
  'calorimetry': () => import('./simulation/models/calorimetry.js'),
  'chromatography': () => import('./simulation/models/chromatography.js'),
  'equilibrium-shift': () => import('./simulation/models/equilibrium-shift.js'),
  'electronic-balance': () => import('./simulation/models/electronic-balance.js'),
  'standard-solution': () => import('./simulation/models/standard-solution.js'),
  'salt-analysis': () => import('./simulation/models/salt-analysis.js'),
  'lassaigne-test': () => import('./simulation/models/lassaigne-test.js'),
  'clock-reaction': () => import('./simulation/models/clock-reaction.js'),
  'salt-preparation': () => import('./simulation/models/salt-preparation.js'),
  'organic-preparation': () => import('./simulation/models/organic-preparation.js'),
  'functional-group-test': () => import('./simulation/models/functional-group-test.js'),
  'biomolecule-test': () => import('./simulation/models/biomolecule-test.js'),
};

/** Model ids, for code that only needs to know what exists. */
const MODEL_IDS = Object.keys(MODEL_LOADERS);

const modelCache = new Map();
async function loadModel(id) {
  if (modelCache.has(id)) return modelCache.get(id);
  const loader = MODEL_LOADERS[id];
  if (!loader) return null;
  const mod = await loader();
  const model = mod.default || mod;
  modelCache.set(id, model);
  return model;
}

const EXPERIMENT_FILES = [
  'data/experiments/class-xi/XI-PHY-A07-simple-pendulum.json',
  'data/experiments/class-xi/XI-PHY-B02-helical-spring.json',
  'data/experiments/class-xi/XI-CHE-E03-titration.json',
  'data/experiments/class-xii/XII-PHY-A01-resistivity.json',
  'data/experiments/class-xii/XII-PHY-B03-convex-lens.json',
  'data/experiments/class-xii/XII-CHE-B01-reaction-kinetics.json',
  'data/experiments/class-xi/XI-PHY-A01-vernier-callipers.json',
  'data/experiments/class-xi/XI-PHY-B04-surface-tension.json',
  'data/experiments/class-xi/XI-CHE-C01-ph-determination.json',
  'data/experiments/class-xii/XII-PHY-A02-metre-bridge.json',
  'data/experiments/class-xii/XII-PHY-B09-pn-diode.json',
  'data/experiments/class-xii/XII-CHE-D01-electrochemical-cell.json',
  'data/experiments/class-xi/XI-PHY-A02-screw-gauge.json',
  'data/experiments/class-xi/XI-PHY-A03-irregular-lamina.json',
  'data/experiments/class-xi/XI-PHY-A04-spherometer.json',
  'data/experiments/class-xi/XI-PHY-A05-beam-balance.json',
  'data/experiments/class-xi/XI-PHY-A06-parallelogram-law.json',
  'data/experiments/class-xi/XI-PHY-A09-friction.json',
  'data/experiments/class-xi/XI-PHY-A10-inclined-plane.json',
  'data/experiments/class-xi/XI-PHY-B05-viscosity.json',
  'data/experiments/class-xi/XI-PHY-B06-cooling-curve.json',
  'data/experiments/class-xi/XI-PHY-B07-specific-heat.json',
  'data/experiments/class-xi/XI-PHY-B10-resonance-tube.json',
  'data/experiments/class-xi/XI-CHE-C02-strong-weak-acid-ph.json',
  'data/experiments/class-xii/XII-PHY-B05-prism-deviation.json',
  'data/experiments/class-xi/XI-PHY-A08-pendulum-mass.json',
  'data/experiments/class-xii/XII-PHY-A03-combination-laws.json',
  'data/experiments/class-xi/XI-CHE-E05-hcl-carbonate.json',
  'data/experiments/class-xi/XI-PHY-B01-youngs-modulus.json',
  'data/experiments/class-xi/XI-PHY-B03-boyles-law.json',
  'data/experiments/class-xii/XII-PHY-B01-concave-mirror.json',
  'data/experiments/class-xi/XI-PHY-B08-sonometer-length.json',
  'data/experiments/class-xi/XI-PHY-B09-sonometer-tension.json',
  'data/experiments/class-xii/XII-PHY-A06-ac-mains-frequency.json',
  'data/experiments/class-xii/XII-PHY-A04-galvanometer-half-deflection.json',
  'data/experiments/class-xii/XII-PHY-A05-galvanometer-conversion.json',
  'data/experiments/class-xii/XII-PHY-B02-convex-mirror.json',
  'data/experiments/class-xii/XII-PHY-B04-concave-lens.json',
  'data/experiments/class-xii/XII-PHY-B06-refractive-index-slab.json',
  'data/experiments/class-xii/XII-PHY-B07-refractive-index-liquid-lens.json',
  'data/experiments/class-xii/XII-PHY-B08-refractive-index-mirror.json',
  // Class XI Physics Section A activities (ACT-* ids keep them distinct from
  // the Section A experiments, which share the same section and serial numbers)
  'data/experiments/class-xi/XI-PHY-ACT-A1-paper-scale.json',
  'data/experiments/class-xi/XI-PHY-ACT-A2-principle-of-moments.json',
  'data/experiments/class-xi/XI-PHY-ACT-A3-graph-plotting.json',
  'data/experiments/class-xi/XI-PHY-ACT-A4-rolling-friction.json',
  'data/experiments/class-xi/XI-PHY-ACT-A5-projectile-range.json',
  'data/experiments/class-xi/XI-PHY-ACT-A6-energy-conservation.json',
  'data/experiments/class-xi/XI-PHY-ACT-A7-pendulum-damping.json',
  // Class XI Physics Section B activities
  'data/experiments/class-xi/XI-PHY-ACT-B1-wax-cooling.json',
  'data/experiments/class-xi/XI-PHY-ACT-B2-bimetallic-strip.json',
  'data/experiments/class-xi/XI-PHY-ACT-B3-liquid-expansion.json',
  'data/experiments/class-xi/XI-PHY-ACT-B4-detergent-surface-tension.json',
  'data/experiments/class-xi/XI-PHY-ACT-B5-cooling-factors.json',
  'data/experiments/class-xi/XI-PHY-ACT-B6-scale-depression.json',
  'data/experiments/class-xi/XI-PHY-ACT-B7-bernoulli-pressure.json',
  // Class XI Chemistry, Category B
  'data/experiments/class-xi/XI-CHE-B01-melting-point.json',
  'data/experiments/class-xi/XI-CHE-B02-boiling-point.json',
  'data/experiments/class-xi/XI-CHE-B03-crystallisation.json',
  'data/experiments/class-xii/XII-PHY-ACT-A1-inductor-impedance.json',
  'data/experiments/class-xii/XII-PHY-ACT-A2-multimeter.json',
  'data/experiments/class-xii/XII-PHY-ACT-A5-potential-drop.json',
  'data/experiments/class-xii/XII-PHY-ACT-A3-household-circuit.json',
  'data/experiments/class-xii/XII-PHY-ACT-A4-circuit-assembly.json',
  'data/experiments/class-xii/XII-PHY-ACT-A6-circuit-fault.json',
  'data/experiments/class-xii/XII-PHY-ACT-B4-lateral-deviation.json',
  'data/experiments/class-xii/XII-PHY-ACT-B5-single-slit-diffraction.json',
  'data/experiments/class-xii/XII-PHY-ACT-B6-image-formation.json',
  'data/experiments/class-xii/XII-PHY-ACT-B7-lens-combination.json',
  'data/experiments/class-xii/XII-PHY-ACT-B1-component-id.json',
  'data/experiments/class-xii/XII-PHY-ACT-B2-diode-tester.json',
  'data/experiments/class-xii/XII-PHY-ACT-B3-ldr-intensity.json',
  'data/experiments/class-xii/XII-CHE-A01-sol-preparation.json',
  'data/experiments/class-xii/XII-CHE-A02-dialysis.json',
  'data/experiments/class-xii/XII-CHE-A03-emulsion.json',
  'data/experiments/class-xii/XII-CHE-C01-enthalpy-dissolution.json',
  'data/experiments/class-xii/XII-CHE-C02-enthalpy-neutralisation.json',
  'data/experiments/class-xii/XII-CHE-C03-enthalpy-mixing.json',
  'data/experiments/class-xii/XII-CHE-E01-paper-chromatography-pigments.json',
  'data/experiments/class-xii/XII-CHE-E02-chromatography-two-cations.json',
];

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const app = {
  curriculum: null,
  experiments: [],
  cls: DB.getSetting('class', 'XI'),
  subject: DB.getSetting('subject', 'Physics'),
  theme: DB.getSetting('theme', 'classroom'),
  teacher: false,
  exp: null,
  model: null,
  inputs: {},
  state: null,
  rows: [],
  machine: null,
  raf: null,
  last: 0,
  running: false,
  tab: 'procedure',
  answers: {},
  vivaAttempts: [],
};

/* ═══════════════ boot ═══════════════ */
/*
 * Full experiment JSONs, fetched on demand and kept for the session.
 *
 * Boot used to fetch all 79 files — 1.54 MB — before it could paint anything,
 * which is why opening the app felt slow on a weak connection. The home screen
 * only needs a few fields per experiment, so those live in a small generated
 * index (49 KB) and the heavy file is loaded when a lab is actually opened.
 */
const fullExperiments = new Map();

async function loadFullExperiment(id) {
  if (fullExperiments.has(id)) return fullExperiments.get(id);
  const meta = app.experiments.find((e) => e.id === id);
  if (!meta) return null;
  const full = await fetch(meta.file).then((r) => r.json());
  fullExperiments.set(id, full);
  return full;
}

async function boot() {
  try {
    const [curriculum, index] = await Promise.all([
      fetch('data/curriculum/cbse-2026-27.json').then((r) => r.json()),
      fetch('data/experiments/index.json').then((r) => r.json()),
    ]);
    app.curriculum = curriculum;
    app.experiments = index.experiments.filter((e) => e.contentStatus === 'published');
    await DB.put('cachedCurriculum', 'cbse-2026-27', { at: Date.now(), version: curriculum.contentVersion });
  } catch (e) {
    console.error(e);
    $('#cards').innerHTML = `<div class="empty">Could not load curriculum data. If you opened this file directly, run it through a local server (see README).</div>`;
    return;
  }
  bindChrome();
  renderMetrics();
  renderUnitFilter();
  renderCards();
  updateBrand();
  registerSW();
  route();
}

/**
 * Apply the visual theme. "classroom" (light) is the default because a
 * projector cannot produce black — it leaves the screen unlit and ambient
 * light turns it grey, collapsing the contrast of a dark UI at the back of
 * the room. The dim-room theme stays available for darkened halls.
 */
function applyTheme(name) {
  app.theme = name;
  document.documentElement.setAttribute('data-theme', name === 'dark' ? 'dark' : 'classroom');
  setCanvasTheme(name === 'dark' ? 'dark' : 'classroom');
  const btn = $('#themeBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', String(name === 'dark'));
    btn.firstElementChild.textContent = name === 'dark' ? '☾' : '☀';
    const txt = $('#themeTxt');
    if (txt) txt.textContent = name === 'dark' ? 'Dim room' : 'Classroom';
  }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.setAttribute('content', name === 'dark' ? '#0c1424' : '#eef2f8');
  DB.setSetting('theme', name);
  if (app.exp) draw();
}

function bindChrome() {
  applyTheme(app.theme);
  $('#themeBtn').onclick = () => applyTheme(app.theme === 'dark' ? 'classroom' : 'dark');
  $('#brandBtn').onclick = () => { location.hash = ''; };
  $('#backBtn').onclick = () => { location.hash = ''; };
  $('#printBtn').onclick = () => window.print();
  $('#q').oninput = renderCards;
  $('#fSection').onchange = renderCards;
  $('#fUnit').onchange = renderCards;
  $$('.seg-class:not(.seg-subject) button').forEach((b) => {
    b.onclick = () => {
      app.cls = b.dataset.class;
      DB.setSetting('class', app.cls);
      $$('.seg-class:not(.seg-subject) button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderUnitFilter();
      renderCards();
    };
  });
  $$('.seg-class:not(.seg-subject) button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.class === app.cls)));
  $$('.seg-subject button').forEach((b) => {
    b.onclick = () => {
      app.subject = b.dataset.subject;
      DB.setSetting('subject', app.subject);
      $$('.seg-subject button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      renderUnitFilter();
      renderCards();
      updateBrand();
    };
    b.setAttribute('aria-pressed', String(b.dataset.subject === app.subject));
  });
  $('#modeBtn').onclick = () => {
    app.teacher = !app.teacher;
    $('#modeBtn').setAttribute('aria-pressed', String(app.teacher));
    $('#modeBtn').textContent = app.teacher ? 'Student mode' : 'Teacher mode';
    location.hash = app.teacher ? '#teacher' : '';
  };
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (app.exp) draw(); });
  window.addEventListener('online', updateNet);
  window.addEventListener('offline', updateNet);
  updateNet();
  initCollapsiblePanels();
}

/**
 * The three auxiliary lab panels (controls / observation table / graph) can
 * each be collapsed to keep the core experimental area — the canvas and its
 * readouts — the visual focus. State persists per panel id in localStorage
 * (via DB.getSetting/setSetting, already synchronous-safe at boot) so a
 * student's layout choice survives navigating between experiments.
 */
function initCollapsiblePanels() {
  $$('.panel-collapsible').forEach((panel) => {
    const head = panel.querySelector('.panel-head');
    if (!head || head.dataset.wired) return;
    head.dataset.wired = '1';
    const key = `collapsed:${panel.id}`;
    const collapsed = !!DB.getSetting(key, false);
    panel.classList.toggle('is-collapsed', collapsed);
    head.setAttribute('aria-expanded', String(!collapsed));
    head.onclick = () => {
      const next = !panel.classList.contains('is-collapsed');
      panel.classList.toggle('is-collapsed', next);
      head.setAttribute('aria-expanded', String(!next));
      DB.setSetting(key, next);
    };
  });
}

/** Header subtitle reflects the subject actually being studied. */
function updateBrand(exp) {
  const subject = exp ? exp.subject : app.subject;
  const code = subjectRecord(subject).subjectCode;
  const el = $('#brandSub');
  if (el) el.textContent = `${subject} ${code} · 2026–27`;
}

function updateNet() {
  const on = navigator.onLine;
  $('#netDot').className = `dot${on ? '' : ' off'}`;
  $('#netTxt').textContent = on ? 'Offline ready' : 'Offline — working';
  $('#netChip').title = on ? 'Cached: works without a network' : 'No network. Everything still works.';
}

/* ═══════════════ home ═══════════════ */
/** The curriculum record for the currently selected subject. */
function subjectRecord(subject = app.subject) {
  return app.curriculum.subjects.find((s) => s.subject === subject) || app.curriculum.subjects[0];
}
function classRecord(subject = app.subject, cls = app.cls) {
  return subjectRecord(subject).classes.find((c) => c.class === cls);
}

function renderMetrics() {
  let mapped = 0;
  for (const subj of app.curriculum.subjects) {
    for (const c of subj.classes) {
      mapped += Object.values(c.practicals)
        .reduce((n, sec) => n + sec.experiments.length + (sec.activities || []).length, 0);
    }
  }
  const items = [
    [app.experiments.length, 'Simulations'],
    [mapped, 'Practicals mapped'],
    ['0', 'Network calls'],
    ['100%', 'CBSE traced'],
  ];
  $('#metrics').innerHTML = items.map(([b, s]) => `<div class="metric"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}

function renderUnitFilter() {
  const cls = classRecord();
  $('#fUnit').innerHTML = '<option value="">All units</option>' +
    cls.units.map((u) => `<option value="${esc(u.unit)}">${esc(u.title)}</option>`).join('');

  // Physics has Section A/B; Chemistry has lettered categories A-K with titles.
  const isCategories = subjectRecord().practicalStructure === 'categories';
  const noun = isCategories ? 'categories' : 'sections';
  const opts = Object.entries(cls.practicals).map(([key, body]) => {
    const text = isCategories ? `${key}. ${body.title}` : `Section ${key}`;
    return `<option value="${esc(key)}">${esc(text)}</option>`;
  });
  $('#fSection').innerHTML = `<option value="">All ${noun}</option>` + opts.join('');
}

/** Official practical list for the current subject+class, merged with simulations. */
function catalogue() {
  const cls = classRecord();
  const out = [];
  for (const [section, body] of Object.entries(cls.practicals)) {
    const findBuilt = (kind, serial) => app.experiments.find(
      (e) => e.class === app.cls
        && e.subject === app.subject
        && e.curriculumMapping.section === section
        && e.curriculumMapping.serial === serial
        && (e.curriculumMapping.kind || 'experiment') === kind,
    ) || null;

    (body.experiments || []).forEach((text, i) => {
      out.push({
        section, sectionTitle: body.title || null, kind: 'experiment',
        serial: i + 1, text, built: findBuilt('experiment', i + 1),
      });
    });
    (body.activities || []).forEach((text, i) => {
      out.push({
        section, sectionTitle: body.title || null, kind: 'activity',
        serial: i + 1, text, built: findBuilt('activity', i + 1),
      });
    });
  }
  return out;
}

function renderCards() {
  const q = $('#q').value.trim().toLowerCase();
  const sec = $('#fSection').value;
  const unit = $('#fUnit').value;
  const list = catalogue().filter((item) => {
    if (sec && item.section !== sec) return false;
    if (unit && (!item.built || item.built.curriculumMapping.unit.split(':')[0].replace('Unit ', '').trim() !== unit)) return false;
    if (!q) return true;
    const hay = `${item.text} ${item.built?.title || ''} ${item.built?.curriculumMapping.chapter || ''} ${item.built?.curriculumMapping.topic || ''}`.toLowerCase();
    return hay.includes(q);
  });

  const ac = app.subject === 'Chemistry'
    ? (app.cls === 'XI' ? 'var(--che-xi)' : 'var(--che-xii)')
    : (app.cls === 'XI' ? 'var(--xi)' : 'var(--xii)');
  const built = list.filter((i) => i.built);
  const pending = list.filter((i) => !i.built);

  let html = '';
  if (built.length) {
    html += `<div class="sect-head">Ready to perform · Class ${app.cls} ${esc(app.subject)}</div><div class="grid">`;
    html += built.map((i) => cardHTML(i, ac)).join('');
    html += '</div>';
  }
  if (pending.length) {
    html += `<div class="sect-head">In the syllabus · simulation not yet built</div><div class="grid">`;
    html += pending.map((i) => cardHTML(i, ac)).join('');
    html += '</div>';
  }
  if (!list.length) html = `<div class="empty">No experiment matches that search in Class ${app.cls} ${esc(app.subject)}.</div>`;
  $('#cards').innerHTML = html;

  $$('#cards button.card[data-id]').forEach((b) => {
    b.onclick = () => { location.hash = `#/exp/${b.dataset.id}`; };
  });
}

function sectionPill(item) {
  const isCat = subjectRecord().practicalStructure === 'categories';
  const tag = item.kind === 'activity' ? 'Act' : (isCat ? '' : 'Sec ');
  const text = isCat && item.kind !== 'activity'
    ? `${item.section}·${item.serial}`
    : `${tag}${isCat ? '' : ' '}${item.section} · ${item.serial}`.replace(/\s+/g, ' ').trim();
  const title = item.sectionTitle ? ` title="${esc(item.sectionTitle)}"` : '';
  return `<span class="pill sec"${title}>${esc(text)}</span>`;
}

function cardHTML(item, ac) {
  const b = item.built;
  if (!b) {
    return `<button class="card glass" style="--ac:${ac}" disabled aria-disabled="true">
      <div class="card-top"><span class="pill cls">Class ${esc(app.cls)}</span>${sectionPill(item)}<span class="pill soon">Planned</span></div>
      <h3>${esc(truncate(item.text, 92))}</h3>
      <p>Verified against the official CBSE list. ${item.kind === 'activity'
        ? 'This is a guided observation activity rather than a measurement, so it is recorded here for completeness.'
        : 'An interactive simulation for this practical is not part of this release.'}</p>
      <div class="card-foot"><span>Curriculum verified</span></div>
    </button>`;
  }
  const cm = b.curriculumMapping;
  return `<button class="card glass" style="--ac:${ac}" data-id="${esc(b.id)}">
    <div class="card-top"><span class="pill cls">Class ${esc(b.class)}</span>${sectionPill(item)}<span class="pill">${esc(b.id)}</span></div>
    <h3>${esc(b.title)}</h3>
    <div class="chap">${esc(cm.chapter)}</div>
    <p>${esc(b.objective0)}</p>
    <div class="card-foot"><span>${b.vivaCount} viva · ${b.procedureCount} steps</span><b>Enter lab →</b></div>
  </button>`;
}

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/* ═══════════════ routing ═══════════════ */
function route() {
  const h = location.hash;
  stopLoop();
  if (h === '#teacher') return showTeacher();
  const m = h.match(/^#\/exp\/([\w-]+)$/);
  if (m) {
    const meta = app.experiments.find((e) => e.id === m[1]);
    /* The index entry is only a summary; the lab needs the full record, which
       is fetched here (and cached) rather than at boot. */
    if (meta) return loadFullExperiment(meta.id).then((full) => full && openLab(full));
  }
  show('#viewHome');
  app.exp = null;
}

function show(id) {
  for (const v of ['#viewHome', '#viewLab', '#viewTeacher']) $(v).hidden = v !== id;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * Starting inputs for an experiment.
 *
 * The model ships sensible defaults, but a model is deliberately reused by
 * several experiments (one titration model serves NaOH-oxalic AND HCl-Na2CO3;
 * one metre bridge serves the single coil AND the combination laws), and each
 * of those experiments declares its own starting point in its JSON. Taking the
 * model defaults alone opened XI-CHE-E05 as an NaOH titration with a pink
 * flask — the wrong chemistry entirely, and with no error anywhere. The
 * experiment's own declared defaults must therefore win.
 */
function initialInputs(exp, model) {
  const inputs = { ...model.defaults };
  for (const v of exp.variables || []) {
    if (v.default === undefined || v.default === null) continue;
    if (v.type === 'dependent') continue;      // outputs are never seeded
    inputs[v.id] = v.default;
  }
  return inputs;
}

/* ═══════════════ lab ═══════════════ */
async function openLab(exp) {
  app.exp = exp;
  /* Model and renderers are fetched here rather than at boot. Both are cached,
     so re-entering a lab is instant. */
  const [model, rendererMod] = await Promise.all([
    loadModel(exp.simulation.model),
    import('./simulation/renderers/index.js'),
  ]);
  app.renderers = rendererMod.RENDERERS;
  app.model = model;
  app.inputs = initialInputs(exp, app.model);
  app.state = app.model.init(app.inputs);
  app.answers = {};
  app.vivaAttempts = [];
  app.tab = 'procedure';
  app.rows = (await DB.loadObservations(exp.id)) || [];
  app.machine = new ExperimentMachine(renderStateTrack);
  app.machine.to(STATES.READY);

  show('#viewLab');
  $('#labTitle').textContent = exp.title;
  const cm = exp.curriculumMapping;
  $('#labSub').textContent = `Class ${exp.class} · ${cm.chapter} · Section ${cm.section}, Experiment ${cm.serial} · CBSE ${cm.curriculumYear}`;
  const token = exp.subject === 'Chemistry'
    ? (exp.class === 'XI' ? '--che-xi' : '--che-xii')
    : (exp.class === 'XI' ? '--xi' : '--xii');
  const root = getComputedStyle(document.documentElement);
  document.documentElement.style.setProperty('--accent', root.getPropertyValue(token).trim());
  updateBrand(exp);

  resetFluids();                 // a new bench starts with a still surface
  resetScene();                  // and is re-framed for its own apparatus
  Interact.attach($('#cv'), onCanvasDrag);
  buildToolbar();
  buildControls();
  renderLiveConfig();
  buildTabs();
  renderTable();
  renderStateTrack();
  startLoop();
  DB.saveProgress(exp.id, { opened: true, title: exp.title, class: exp.class });
}

function buildToolbar() {
  const acts = app.exp.simulation.actions || [];
  const primary = acts.find((a) => a.primary);
  const model = app.exp.simulation.model;
  let html = '';
  if (model === 'simple-pendulum') {
    // The pendulum is a two-step action: release/time, THEN record. It still
    // needs its own record button — without it the reading can never be taken.
    html = `<button class="btn primary" id="aRelease">Release &amp; start clock</button>
            <button class="btn" id="aRecord" disabled>Take reading</button>
            <button class="btn" id="aReset">Reset</button>`;
  } else if (model === 'titration') {
    html = `<button class="btn primary" id="aFlowFast">Run in acid</button>
            <button class="btn" id="aFlowDrop">Add dropwise</button>
            <button class="btn" id="aStop">Close stopcock</button>
            <button class="btn" id="aRecord">Record end point</button>
            <button class="btn" id="aReset">Refill burette</button>`;
  } else if (model === 'reaction-kinetics') {
    html = `<button class="btn primary" id="aStart">Add acid &amp; start clock</button>
            <button class="btn" id="aRecord" disabled>Record time</button>
            <button class="btn" id="aReset">Fresh flask</button>`;
  } else {
    /*
     * Many experiments are a PROCESS, not a reading: a projectile has to be
     * launched, a ball released, a roller started, a bath heated. Their
     * models expose a run flag for exactly that, but nothing in the toolbar
     * ever set it, so the apparatus sat there and the screen looked dead.
     * Any model whose state carries such a flag now gets the action that
     * starts it, named for what it actually does.
     */
    const runFlag = processFlag();
    html = runFlag
      ? `<button class="btn primary" id="aRun">${esc(RUN_LABELS[runFlag] || 'Start')}</button>
         <button class="btn" id="aRecord">${esc(primary?.label || 'Take reading')}</button>
         <button class="btn" id="aReset">Reset</button>`
      : `<button class="btn primary" id="aRecord">${esc(primary?.label || 'Take reading')}</button>
         <button class="btn" id="aReset">Reset</button>`;
  }
  html += `<div class="grow" style="flex:1"></div>
           <button class="btn good" id="aCalc">Calculate result</button>`;
  $('#toolbar').innerHTML = html;

  const rel = $('#aRelease');
  if (rel) rel.onclick = releasePendulum;
  const rec = $('#aRecord');
  if (rec) rec.onclick = () => record();
  const fast = $('#aFlowFast');
  if (fast) fast.onclick = () => setFlow(2.2);
  const drop = $('#aFlowDrop');
  if (drop) drop.onclick = () => setFlow(0.18);
  const stop = $('#aStop');
  if (stop) stop.onclick = () => setFlow(0);
  const start = $('#aStart');
  if (start) start.onclick = startKinetics;
  const runBtn = $('#aRun');
  if (runBtn) runBtn.onclick = startProcess;
  $('#aReset').onclick = resetSim;
  $('#aCalc').onclick = calculate;
  syncToolbar();
}

/** Enable/disable toolbar buttons to match the current stage of the run. */
function syncToolbar() {
  if (!app.exp) return;
  const rec = $('#aRecord');
  const rel = $('#aRelease');
  const calc = $('#aCalc');
  if (rec && app.exp.simulation.model === 'simple-pendulum') {
    const ready = Boolean(app.state?.finishedAt);
    rec.disabled = !ready;
    rec.classList.toggle('primary', ready);
    rec.title = ready ? 'Record this reading in the observation table'
      : 'Release the bob and let the stop clock finish first';
  }
  if (rel) rel.classList.toggle('primary', !app.state?.finishedAt);

  const model = app.exp.simulation.model;
  if (model === 'reaction-kinetics' && rec) {
    const done = Boolean(app.state?.finished);
    rec.disabled = !done;
    rec.classList.toggle('primary', done);
    rec.title = done ? 'Record this run in the table'
      : 'Add the acid and wait until the cross disappears';
  }
  if (model === 'titration') {
    const flowing = Boolean(app.state?.flowing);
    const stop = $('#aStop');
    if (stop) stop.disabled = !flowing;
    if (rec) {
      rec.classList.toggle('primary', Boolean(app.state?.atEndPoint));
      rec.title = app.state?.overshot
        ? 'You have overshot — refill and repeat'
        : 'Record the burette reading at the end point';
    }
  }
  if (calc) calc.disabled = app.rows.length < 2;
}

/** Open or close the burette stopcock at a given flow rate (mL/s). */
function setFlow(rate) {
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  if (!v.ok) { toast(v.errors[0].message, 'bad'); return; }
  app.state = { ...app.state, flowing: rate > 0, flowRate: rate };
  if (rate > 0) app.machine.to(STATES.RUNNING);
  syncToolbar();
}

/**
 * Run flags a model may expose, in the order we prefer to drive them, and
 * what the button should be called for each. The label matters: "Start" on
 * a projectile launcher tells a student nothing about what is about to
 * happen.
 */
const RUN_LABELS = {
  flying: 'Launch',
  released: 'Release',
  rolling: 'Start rolling',
  heating: 'Light the burner',
  running: 'Start',
};

/** Which run flag, if any, this experiment's model understands. */
function processFlag() {
  if (!app.state) return null;
  for (const k of ['flying', 'released', 'rolling', 'heating', 'running']) {
    if (k in app.state) return k;
  }
  return null;
}

/**
 * Start (or restart) the process this experiment is. Re-initialising first
 * means pressing it twice re-runs the experiment cleanly rather than
 * resuming a finished one half-way.
 */
function startProcess() {
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  if (!v.ok) { toast(v.errors[0].message, 'bad'); return; }
  const flag = processFlag();
  if (!flag) return;
  app.state = app.model.init(app.inputs);
  app.state[flag] = true;
  // A launcher needs its initial velocity components as well as the flag.
  if (flag === 'flying') {
    // The projectile-range model exposes its own speed lookup (soft/medium/
    // strong spring settings); reading a plain `speedMs` input here always
    // fell back to 6 m/s, so every shot animated at the medium setting's
    // speed no matter which spring the student actually chose.
    const launcher = app.model.launcherOf ? app.model.launcherOf(app.inputs) : null;
    const u = launcher ? launcher.speed : (app.inputs.speedMs ?? 6);
    const a = ((app.inputs.angleDeg ?? 45) * Math.PI) / 180;
    app.state.vx = u * Math.cos(a);
    app.state.vy = u * Math.sin(a);
  }
  app.machine.to(STATES.RUNNING);
  syncToolbar();
  renderLiveConfig();
}

function startKinetics() {
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  if (!v.ok) { toast(v.errors[0].message, 'bad'); return; }
  app.state = app.model.init(app.inputs);
  app.state.running = true;
  app.machine.to(STATES.RUNNING);
  toast('Clock started — watch the cross');
  syncToolbar();
}

function releasePendulum() {
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  if (!v.ok) return;
  app.state = app.model.init(app.inputs);
  app.state.running = true;
  app.state.timing = true;
  app.machine.to(STATES.RUNNING);
  toast('Stop clock started — counting oscillations');
}

function resetSim() {
  app.state = app.model.init(app.inputs);
  app.machine.reset();
  clearFeedback();
  syncToolbar();
  draw();
}

function record() {
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  if (!v.ok) { toast(v.errors[0].message, 'bad'); return; }

  if (app.exp.simulation.model === 'simple-pendulum' && !app.state.finishedAt) {
    toast('Release the bob and let the clock finish first', 'bad');
    return;
  }
  if (app.exp.simulation.model === 'convex-lens') {
    const s = app.state.sharp ?? 0;
    if (s < 0.85) { toast('Focus the image sharply before recording', 'bad'); return; }
  }
  if (app.exp.simulation.model === 'reaction-kinetics' && !app.state.finished) {
    toast('Wait until the cross has completely disappeared', 'bad');
    return;
  }
  if (app.exp.simulation.model === 'titration' && app.state.overshot) {
    toast('You overshot the end point — refill the burette and repeat', 'bad');
    return;
  }
  app.machine.to(STATES.MEASURING);
  /*
   * Pass the trial number to EVERY model, not just titration.
   * Several models fold `trial` into the RNG seed so that repeating a
   * measurement with unchanged settings still produces slightly different
   * readings, the way a real repeated measurement does. Withholding it made
   * repeat readings byte-identical, which is both scientifically wrong and
   * defeats the whole point of averaging over trials. Models that ignore the
   * fourth argument are unaffected.
   */
  const trial = app.rows.length + 1;
  const reading = app.model.measure(app.state, app.inputs, 7, trial);
  /*
   * A model may legitimately refuse to produce a reading — the concave mirror
   * and the convex lens both return null when the object is at or inside the
   * focus, because no real image exists to catch on a screen. Two things had
   * gone wrong here. A null READING (not merely a null field) threw
   * "Cannot read properties of null", and the null-field branch was gated on
   * a hardcoded model name, so the mirror fell straight through it. Both are
   * now handled for every model: refusing to record is a teaching moment, not
   * a crash.
   */
  const refused = reading == null                       // model returned nothing at all
    || ('v' in reading && reading.v == null);           // model returned a row with no measurement
  if (refused) {
    toast(reading?.imageType || 'Nothing to measure here — no reading recorded', 'bad');
    return;
  }
  app.rows.push({ ...reading, ...extraRowMeta() });
  DB.saveObservations(app.exp.id, app.rows);
  app.machine.to(STATES.OBSERVATION);
  renderTable();
  toast(`Reading ${app.rows.length} recorded`, 'good');
  const m = app.exp.simulation.model;
  if (m === 'simple-pendulum' || m === 'titration' || m === 'reaction-kinetics') {
    app.state = app.model.init(app.inputs);
  }
  syncToolbar();
}

function extraRowMeta() {
  const m = app.exp.simulation.model;
  if (m === 'simple-pendulum') return { massG: app.inputs.massG, amplitudeDeg: app.inputs.amplitudeDeg, lengthM: app.inputs.lengthCm / 100 };
  if (m === 'resistivity') return { lengthCm: app.inputs.lengthCm, diameterMm: app.inputs.diameterMm };
  return {};
}

function calculate() {
  if (app.rows.length < 2) { toast('Record at least two readings first', 'bad'); return; }
  app.machine.to(STATES.CALCULATION);
  /*
   * Always hand `inputs` to derive(). Maintaining a hardcoded list of which
   * models need it is exactly the pattern that produced the earlier
   * checkResult bug: the list silently goes stale the moment a new model is
   * added, and the symptom is a blank result panel rather than an error.
   * Models that do not declare a second parameter simply ignore it.
   */
  const derived = app.model.derive(app.rows, app.inputs);
  if (!derived.ok) {
    /*
     * A refusal is teaching, not an error. The reason says WHICH reading is
     * missing or why the set cannot support a result — "no AC reading yet",
     * "the points are bunched into 15 cm" — so it has to persist where the
     * student can read it. Sending it only to a toast threw that text away
     * after three seconds and left the panel showing its opening placeholder,
     * so the bench looked like it had simply ignored the button.
     */
    const box = $('#resultBox');
    box.className = 'result-box warn';
    box.innerHTML = `<b>Not enough to calculate a result yet</b>
      <div style="margin-top:6px">${esc(derived.reason)}</div>`;
    toast(derived.reason, 'bad');
    return;
  }
  app.machine.to(STATES.RESULT);
  renderResult(derived);
  DB.saveProgress(app.exp.id, { hasResult: true, rows: app.rows.length });
  toast('Result calculated — check the graph and then the assessment', 'good');
}

/* ── controls ── */
function buildControls() {
  const exp = app.exp;
  const byId = Object.fromEntries(exp.variables.map((v) => [v.id, v]));
  const host = $('#controls');
  host.innerHTML = '';

  for (const c of exp.simulation.controls) {
    const v = byId[c.var];
    if (!v) continue;
    const wrap = document.createElement('div');
    wrap.className = 'ctl';

    if (c.widget === 'slider') {
      const id = `c_${v.id}`;
      wrap.innerHTML = `<label for="${id}">${esc(v.label)} ${v.symbol ? `(${esc(v.symbol)})` : ''}
        <b><span id="${id}_v"></span> ${esc(v.unit || '')}</b></label>
        <input type="range" id="${id}" min="${v.min}" max="${v.max}" step="${v.step}" value="${app.inputs[v.id]}"
          aria-label="${esc(v.label)}" />`;
      host.appendChild(wrap);
      const input = wrap.querySelector('input');
      const out = wrap.querySelector(`#${id}_v`);
      const sync = () => {
        const val = Number(input.value);
        app.inputs[v.id] = val;
        if (v.id === 'buretteVolume' && app.state) {
          app.state = { ...app.state, delivered: val, flowing: false, flowRate: 0 };
        }
        out.textContent = Number.isInteger(v.step) ? val : val.toFixed(String(v.step).split('.')[1]?.length || 1);
        input.style.setProperty('--p', `${((val - v.min) / (v.max - v.min)) * 100}%`);
        onInputChange();
      };
      input.oninput = sync;
      sync();
    } else if (c.widget === 'segmented') {
      wrap.innerHTML = `<label>${esc(v.label)}</label><div class="seg" role="group" aria-label="${esc(v.label)}">${
        c.options.map((o) => `<button type="button" data-v="${esc(o)}" aria-pressed="${String(app.inputs[v.id] == o)}">${esc(optLabel(v.id, o))}</button>`).join('')
      }</div>`;
      host.appendChild(wrap);
      wrap.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          const raw = b.dataset.v;
          app.inputs[v.id] = Number.isNaN(Number(raw)) ? raw : Number(raw);
          wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          onInputChange();
        };
      });
    } else if (c.widget === 'wiring') {
      wrap.innerHTML = `<label>${esc(v.label)}</label><div class="wiring" role="group" aria-label="${esc(v.label)}">${
        c.options.map((o) => {
          const bad = (v.id === 'ammeterMode' && o === 'parallel') || (v.id === 'voltmeterMode' && o === 'series');
          /* Use optLabel like every other widget. This one printed the raw
             option id, so the buttons read "series"/"parallel" in lower case
             while every other control in the app showed a proper name. A
             screenshot caught it; the unit tests could not, because they only
             checked the SEGMENTED widget's labels. */
          return `<button type="button" data-v="${esc(o)}" data-bad="${bad}" aria-pressed="${String(app.inputs[v.id] === o)}">${esc(optLabel(v.id, o))}</button>`;
        }).join('')
      }</div>`;
      host.appendChild(wrap);
      wrap.querySelectorAll('button').forEach((b) => {
        b.onclick = () => {
          app.inputs[v.id] = b.dataset.v;
          wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          onInputChange();
        };
      });
    } else if (c.widget === 'switch') {
      /*
       * The switch is the only widget that carried no id, so it was the only
       * control a test, a label, or assistive tech could not address by name.
       * Every other widget uses `c_<varId>`; this one now does too. It also
       * keeps the `ctl` class alongside `switch-row`, because `.ctl` is the
       * hook everything else uses to find a control group.
       */
      const id = `c_${v.id}`;
      wrap.className = 'ctl switch-row';
      wrap.innerHTML = `<label for="${id}">${esc(v.label)}</label>
        <button class="sw" id="${id}" role="switch" aria-checked="${String(!!app.inputs[v.id])}" aria-label="${esc(v.label)}"></button>`;
      host.appendChild(wrap);
      const sw = wrap.querySelector('.sw');
      sw.onclick = () => {
        app.inputs[v.id] = !app.inputs[v.id];
        sw.setAttribute('aria-checked', String(!!app.inputs[v.id]));
        onInputChange();
      };
    }
  }
}

/*
 * Human-readable text for a segmented option.
 *
 * The models already name their own options: every catalogue they export
 * (SPECIMENS, SURFACES, PRISMS, FORKS, ...) maps an option key to a record
 * with a `label`. Look that up first. A hardcoded per-variable map here goes
 * stale the moment a model is added — it had already left more than thirty
 * buttons reading "sg50", "woodWood" and "ch3coona" to students.
 *
 * The short overrides below exist only where the model's own label is too long
 * for a button, and the final fallback merely tidies an unknown key rather
 * than exposing it raw.
 */
const OPT_OVERRIDES = {
  /* ── Class XII Chemistry Category E · chromatography ── */
  sample: {
    spinach: 'Spinach', marigold: 'Marigold', hibiscus: 'Hibiscus',
    copperIron: 'Cu²⁺ + Fe³⁺', nickelCobalt: 'Ni²⁺ + Co²⁺',
  },
  solvent: {
    petAcetone: 'Pet. ether', acetoneHcl: 'Acetone/HCl', butanol: 'Butanol',
  },
  /* ── Class XII Chemistry Category C · thermochemistry ── */
  solute: {
    /* 'CuSO₄·5H₂O' pushed the four-button row 2 px past 360 px, so the button
       uses a shorter form; the canvas and table carry the full name. */
    kno3: 'KNO₃', nh4cl: 'NH₄Cl', cuso4: 'CuSO₄', cuso4_5h2o: 'CuSO₄·5aq',
  },
  acid: { hcl: 'HCl', ch3cooh: 'CH₃COOH' },
  base: { naoh: 'NaOH', nh4oh: 'NH₄OH' },
  mode: { dissolution: 'Dissolution', neutralisation: 'Neutralisation', mixing: 'Mixing' },

  /* ── Class XII Chemistry Category A · surface chemistry ── */
  /* Six sols in one row: the model's full names overflow the buttons, so short
     forms are used here and the canvas carries the full name. */
  sol: {
    ferric: 'Fe(OH)₃', arsenous: 'As₂S₃', aluminium: 'Al(OH)₃',
    starch: 'Starch', gum: 'Gum', albumin: 'Albumin',
  },
  membrane: { parchment: 'Parchment', cellophane: 'Cellophane', torn: 'Damaged' },
  water: { flowing: 'Running', changed: 'Changed', standing: 'Never changed' },
  bag: { small: '25 cm³', medium: '50 cm³', large: '100 cm³' },
  oil: { mustard: 'Mustard', coconut: 'Coconut', olive: 'Olive', castor: 'Castor' },
  agent: { none: 'None', soap: 'Soap', detergent: 'Detergent', gum: 'Gum acacia', limewater: 'Lime water' },

  /* ── Class XII Physics Section B electronics activities ── */
  /* 'specimen' is ALSO used by XI-PHY-A01 and XI-PHY-A02, whose labels come
     from their own model catalogues. Only the ACT-B1 keys are added here, and
     they are kept to a number: eight buttons of "Specimen N" overflow the row,
     and the canvas already draws the body of the one selected. */
  specimen: {
    s1: '1', s2: '2', s3: '3', s4: '4', s5: '5', s6: '6', s7: '7', s8: '8',
  },
  /* MERGED: 'test' is the ohmmeter direction in ACT-B1 and the chemical test
     performed in the Class XII Surface Chemistry experiments. */
  test: { look: 'Look', forward: 'Ohms \u2192', reverse: 'Ohms \u2190', tyndall: 'Shine a beam', coagulate: 'Add electrolyte',
    separation: 'Time separation', dilution: 'Dilution test', },
  identification: { resistor: 'Resistor', diode: 'Diode', led: 'LED', capacitor: 'Capacitor' },
  component: { d1: 'Diode A', d2: 'Diode B', d3: 'Diode C', l1: 'LED A', l2: 'LED B', l3: 'LED C' },
  verdict: { good: 'Working', open: 'Open', short: 'Shorted' },
  room: { dark: 'Blacked out', dim: 'Dim', lit: 'Normal' },

  /* ── Class XII Physics Section B optics activities ── */
  /* MERGED: 'slab' is the travelling-microscope slab in XII-PHY-B06 and the
     ray-tracing slab in ACT-B4. */
  slab: {
    crown: 'Crown glass', flint: 'Flint glass', dense: 'Dense flint', perspex: 'Perspex',
    s6: 'Crown 6 mm', s10: 'Crown 10 mm', s8f: 'Flint 8 mm',
  },
  thickness: { t15: '1.5 cm', t30: '3.0 cm', t45: '4.5 cm' },
  /* MERGED with the prism experiment's sources (XII-PHY-B05). */
  source: {
    red: 'Red 650 nm', green: 'Green 532 nm', blue: 'Blue 450 nm', sodium: 'Sodium 589 nm',
    violet: 'Violet 434 nm', white: 'White light',
  },
  slit: { a005: '0.05 mm', a010: '0.10 mm', a020: '0.20 mm', a040: '0.40 mm' },
  lensA: { c10: '+10 cm', c15: '+15 cm', c20: '+20 cm', c30: '+30 cm', d20: '\u221220 cm', d30: '\u221230 cm' },
  lensB: { c10: '+10 cm', c15: '+15 cm', c20: '+20 cm', c30: '+30 cm', d20: '\u221220 cm', d30: '\u221230 cm' },

  /* ── Class XII Physics Section A assembly & fault-finding ── */
  /* MERGED: household lamps rated in watt (ACT-A3), and the ACT-B3 source lamp
     rated in candela. */
  lamp: { w40: '3 × 40 W', w60: '3 × 60 W', w100: '3 × 100 W', lamp15: '15 cd', lamp40: '40 cd', lamp90: '90 cd', },
  wiring: { parallel: 'Parallel', series: 'Series' },
  switches: { eachLive: 'Each, in live', eachNeutral: 'Each, in neutral', oneCommon: 'One common' },
  fuse: { live: 'In live', neutral: 'In neutral', none: 'No fuse' },
  earthing: { earthed: 'Earthed', unearthed: 'Not earthed' },
  load: { r10: '10 Ω', r22: '22 Ω', r47: '47 Ω', lamp: '6 V lamp' },
  /* MERGED: 'cell' is the galvanometer's supply in XII-PHY-A04 and the cell in
     XII-PHY-ACT-A4. A partial map is worse than none — bug 33. */
  /* MERGED: 'cell' is an electrochemical cell in the circuit experiments and a
     photoconductive cell in ACT-B3. */
  cell: {
    c2: '2 V', c3: '3 V', c4: '4 V',
    c15: '1.5 V', c30: '3.0 V', c60: '6.0 V',
    gl5528: 'GL5528', gl5537: 'GL5537', orp12: 'ORP12',
  },
  ammeterMode: { series: 'In series', parallel: 'In parallel' },
  voltmeterMode: { parallel: 'In parallel', series: 'In series' },
  /* MERGED: meter polarity in the assembly activities, and which way round the
     component sits in ACT-B2. */
  polarity: { correct: 'Correct', reversed: 'Reversed', forward: 'Forward', reverse: 'Reverse', },
  rheostatMode: { variable: 'Variable arm', full: 'Full track' },
  keyState: { open: 'Open', closed: 'Closed' },
  board: { board1: 'Board 1', board2: 'Board 2', board3: 'Board 3', board4: 'Board 4', board5: 'Board 5', board6: 'Board 6' },
  /* Kept SHORT deliberately: seven buttons share one row, and at full length
     "Voltmeter in series" wrapped onto three lines and broke the row. */
  diagnosis: {
    none: 'Not yet', ammeterParallel: 'Ammeter ∥', voltmeterSeries: 'Voltmeter ⌐',
    cellReversed: 'Cell rev.', keyShorted: 'Key shorted', rheostatFull: 'Rheostat full',
    openLead: 'Broken lead',
  },
  keyPosition: { closed: 'Closed', open: 'Open' },

  /* ── Class XII Physics Section A activities ── */
  coil: { small: '400 turns', medium: '800 turns', large: '1600 turns' },
  core: { air: 'No core', rod: 'Iron rod', laminated: 'Laminated' },
  supply: { dc: 'DC supply', ac: 'AC supply' },
  ammeter: { a10: '0.01 A', a5: '0.005 A', a2: '0.002 A' },
  /* MERGED map: 'wire' is used by XI-PHY-B01 (Young's modulus), XI-PHY-B08/B09
     and XII-PHY-A06 (sonometer), XII-PHY-A01 (resistivity) and XII-PHY-ACT-A5
     (potential drop). A partial map is worse than none — bug 33. */
  wire: {
    steel: 'Steel', copper: 'Copper', brass: 'Brass', aluminium: 'Aluminium',
    steelThick: 'Steel 0.6', constantan: 'Constantan 0.30',
    constantanThick: 'Constantan 0.60', nichrome: 'Nichrome 0.30',
  },
  /* MERGED: 'driver' is the sonometer's excitation in XII-PHY-A06 and the
     driver cell in XII-PHY-ACT-A5. */
  driver: {
    cell15: '1.5 V', cell30: '3.0 V', cell60: '6.0 V',
    permanentMagnet: 'Horseshoe', electromagnet: 'Electromagnet',
  },
  voltmeter: { v01: '0.1 V', v005: '0.05 V', v002: '0.02 V' },
  target: {
    resistor: '470 Ω', resistorHigh: '100 kΩ', battery: 'Dry cell', supplyDc: 'DC 12 V',
    supplyAc: 'AC 12 V', lampCircuit: 'Lamp circuit', brokenWire: 'Suspect lead', goodWire: 'Good lead',
    // Class XII ACT-B7 specified focal lengths
    t6: '6 cm', t857: '8.6 cm', t12: '12 cm', t20: '20 cm', t60: '60 cm',
  },
  /* MERGED: the multimeter's function switch (ACT-A2) and the junction test
     range used in ACT-B2. */
  func: { vdc: 'V⎓', vac: 'V∼', aac: 'A∼', ohm: 'Ω', cont: '•)))', diode: 'Diode test', },
  connection: { parallel: 'Across', series: 'In line' },
  voltageRange: { r2: '2 V', r20: '20 V', r250: '250 V' },
  currentRange: { r02: '200 mA', r10: '10 A' },
  resistanceRange: { r2k: '2 kΩ', r200k: '200 kΩ' },
  /* MERGED: 'lens' is the lens choice in the B-series optics experiments and in
     XII-PHY-ACT-B6. A partial map is worse than none — bug 33. */
  lens: {
    L10: '10 cm', L15: '15 cm', L20: '20 cm', L25: '25 cm',
    f10: 'f = 10 cm', f15: 'f = 15 cm', f20: 'f = 20 cm',
  },
  /* MERGED with XII-PHY-ACT-B6's concave mirrors. */
  mirror: { m10: '10 cm', m15: '15 cm', m20: '20 cm', m12: 'f = 12 cm', m18: 'f = 18 cm' },
  /* MERGED: 'element' names a specific mirror/lens in the auxiliary-lens
     experiment, and the KIND of element in XII-PHY-ACT-B6. */
  element: {
    cm25: 'Mirror A', cm15: 'Mirror B', cl15: 'Lens A', cl20: 'Lens B',
    lens: 'Convex lens', mirror: 'Concave mirror',
  },
  calliper: { vc10: '10 div', vc20: '20 div', vc50: '50 div' },
  // Shared by the screw-gauge experiments and ACT-B6 (depression gauges).
  gauge: {
    sg50: '0.5/50', sg100: '1.0/100', sg50f: '0.5/100',
    mm1: '1 mm', mm05: '0.5 mm', vernier: 'Vernier',
  },
  // Shared by XI-PHY-B04 (capillary tubes) and XI-PHY-B05 (vessel bore). A
  // second `tube:` key here would silently overwrite this one — object
  // literals keep only the last — so both experiments live in one map.
  tube: {
    t1: 'r 0.025', t2: 'r 0.038', t3: 'r 0.052', t4: 'r 0.071',
    wide: 'Wide jar', narrow: 'Narrow tube',
    // ACT-B4 capillary tubes, by bore radius
    t02: 'r 0.20 mm', t035: 'r 0.35 mm', t05: 'r 0.50 mm', t08: 'r 0.80 mm',
  },
  combination: { single: 'Single', series: 'Series', parallel: 'Parallel' },
  bias: { forward: 'Forward', reverse: 'Reverse' },
  method: { paper: 'pH paper', universal: 'Universal', meter: 'pH meter' },
  grid: { g1: '1 mm', g2: '2 mm', g5: '5 mm' },
  spherometer: { sp100: '1.0/100', sp50: '0.5/50', spWide: 'Wide legs' },
  balance: { standard: 'Standard', sensitive: 'Sensitive', offset: 'Zero error', unequal: 'Unequal arms' },
  // Shared by A05, A06, A10 and ACT-A2 — every `body` option in one map.
  body: {
    block: 'Block', roller: 'Roller',
    bodyA: 'Body A', bodyB: 'Body B', bodyC: 'Body C',
    s1: 'Lamina 1', s2: 'Lamina 2', s3: 'Lamina 3',
    b1: 'Body P', b2: 'Body Q', b3: 'Body R',
  },
  pulley: { good: 'Oiled', stiff: 'Stiff' },
  // Shared by XI-PHY-A10 (roller as the body on the incline) and XI-PHY-ACT-A4
  // (rollers of different radius). One map, or the second silently wins.
  roller: {
    r250: 'Roller A', r400: 'Roller B', r150: 'Roller C',
    r2: 'r = 2 cm', r3: 'r = 3 cm', r5: 'r = 5 cm',
  },
  // Shared by XI-PHY-B05 (falling spheres) and XI-PHY-ACT-A6 (rolling balls).
  ball: {
    steel2: 'Steel 1.0', steel3: 'Steel 1.5', steel4: 'Steel 2.0', steel6: 'Steel 3.0',
    glass4: 'Glass 2.0', nylon3: 'Nylon 1.5',
    steel: 'Steel 25 g', glass: 'Glass 12 g', brass: 'Brass 60 g',
  },
  transfer: { quick: 'Quick', slow: 'Slow' },
  /* MERGED: the XI calorimeter is a metal vessel; the XII thermochemistry
     experiments choose by how much heat the vessel itself absorbs. */
  calorimeter: { copper: 'Copper', aluminium: 'Aluminium', polystyrene: 'Polystyrene', vacuum: 'Vacuum flask', glass: 'Glass beaker', },
  // ── Class XI Section B activities ──
  wax: { paraffin: 'Paraffin', beeswax: 'Beeswax', stearic: 'Stearic acid' },
  // Shared by ACT-B1 (cooling curve) and XI-CHE-B01 (melting point).
  thermometer: { t1: '1.0 °C', t05: '0.5 °C', t02: '0.2 °C', t01: '0.1 °C' },
  interval: { i30: '30 s', i60: '60 s', i300: '5 min' },
  pair: {
    invarBrass: 'Invar–brass', steelCopper: 'Steel–copper',
    steelBrass: 'Steel–brass', brassAlum: 'Brass–alum.', brassBrass: 'Brass–brass',
  },
  // `liquid` is shared by ACT-B3, ACT-B5 and the viscosity/surface-tension work.
  liquid: {
    water: 'Water', alcohol: 'Ethanol', glycerine: 'Glycerine', mercury: 'Mercury',
    oil: 'Cooking oil', castorOil: 'Castor oil', engineOil: 'Engine oil',
    kerosene: 'Kerosene', turpentine: 'Turpentine', soapy: 'Soap solution',
    // XI-CHE-B02 boiling point
    acetone: 'Acetone', toluene: 'Toluene', aniline: 'Aniline',
  },
  vessel: {
    glass: 'Glass', pyrex: 'Pyrex', steel: 'Steel',
    blackened: 'Blackened', polished: 'Polished',
  },
  stem: { narrow: '1 mm bore', medium: '2 mm bore', wide: '4 mm bore' },
  tubeState: { clean: 'Clean', greasy: 'Greasy' },
  cover: { open: 'Open', lid: 'With a lid' },
  arrangement: { cantileverEnd: 'Load at end', supportedCentre: 'Load at centre' },
  orientation: { flat: 'Laid flat', edge: 'On edge' },
  throat: {
    t100: '1.00 cm²', t060: '0.60 cm²', t035: '0.35 cm²',
    t020: '0.20 cm²', tNone: 'No throat',
  },
  manometer: { water: 'Water', mercury: 'Mercury' },
  // ── Class XI Chemistry, Category B ──
  compound: {
    naphthalene: 'Naphthalene', benzoic: 'Benzoic acid',
    urea: 'Urea', acetanilide: 'Acetanilide',
    alum: 'Potash alum', copperSulphate: 'Copper sulphate',
  },
  purity: { pure: 'Pure', slight: 'Slightly impure', impure: 'Crude' },
  bath: { oil: 'Paraffin bath', water: 'Water bath' },
  chips: { with: 'With chips', without: 'No chips' },
  crude: { light: 'Lightly impure', moderate: 'Moderately impure', heavy: 'Heavily impure' },
  cooling: { slow: 'Slow', bench: 'On the bench', ice: 'Ice bath' },
  filtration: { hot: 'Filtered hot', none: 'Not filtered' },
  // ── Class XI Section A activities ──
  // Only options whose model label is too long for a button are shortened
  // here; the rest resolve from the model's own catalogue. NOTE: `roller` and
  // `ball` above are NOT extended for ACT-A4/A6 — their model labels already
  // fit, and a second key of the same name would silently replace the first.
  dataset: {
    springLoad: 'Load–extension', pendulum: 'L–T²',
    resistance: 'V–I', thermistor: 'Real intercept',
  },
  yScale: { auto: 'Fit data', coarse: '2.5× coarse', veryCoarse: '5× coarse' },
  slopeMethod: { bestFit: 'Best-fit line', twoPoints: 'Two points' },
  // Shared by XI-PHY-A04 (spherometer surfaces), XI-PHY-A09 (friction pairs)
  // and XI-PHY-ACT-A4 (rolling surfaces) — all three in one map.
  surface: {
    watchConvex: 'Watch, convex', lensConvex: 'Lens, convex',
    watchConcave: 'Watch, concave', flatish: 'Nearly plane',
    woodWood: 'Wood–wood', woodGlass: 'Wood–glass',
    woodMetal: 'Wood–metal', lubricated: 'Oiled metal',
    glass: 'Glass', wood: 'Wood', rubber: 'Rubber mat',
    // ACT-B5 calorimeter finishes
    dullBlack: 'Dull black', dullGrey: 'Dull grey', polished: 'Polished',
  },
  track: { polished: 'Polished', plain: 'Plain', rough: 'Rough' },
  bob: { brass: 'Brass 60 g', steel: 'Steel 120 g', wood: 'Wood 15 g', pith: 'Pith 4 g' },
  medium: { air: 'Still air', draught: 'Draught' },
  launcher: { soft: 'Setting 1', medium: 'Setting 2', strong: 'Setting 3' },
  mount: { ground: 'Floor', table: 'Table' },
  weights: { fine: '0.1 g', medium: '0.5 g', coarse: '5 g' },
  known: { m20: '20 g', m50: '50 g', m100: '100 g' },
  // Shared by ACT-A1 (paper scales), ACT-B2 (mm scales) and ACT-B6 (metre
  // scales of different material). One map, or the later keys silently win.
  scale: {
    lc10: '1.0 cm', lc05: '0.5 cm', lc02: '0.2 cm', lc01: '0.1 cm',
    mm1: '1 mm', mm05: '0.5 mm', mm01: '0.1 mm',
    wood: 'Wooden', steel: 'Steel', plastic: 'Plastic',
    // Class XII Section B optics activities
    s1: '1 mm', s05: '0.5 mm', s02: '0.2 mm',
    s01: '0.1 cm', s005: '0.05 cm', s002: '0.02 cm',
    // ACT-B3 ohmmeter least counts
    o1: '1 Ω', o10: '10 Ω', o100: '100 Ω',
    // XII Chemistry A02 titration least counts, and the A03 stopwatch
    c01: '0.1 mM', c005: '0.05 mM', c002: '0.02 mM',
    w1: '1 s', w05: '0.5 s', w01: '0.1 s',
    // XII Chemistry Category C thermometers
    t1: '1 °C', t05: '0.5 °C', t01: '0.1 °C',
    // XII Chemistry Category E rules
    r01: '1 mm', r005: '0.5 mm',
  },
};

/** Every option catalogue a model may export, searched in order. */
/*
 * Find a model's option catalogues by SHAPE, not by name.
 *
 * This was a hardcoded list of twenty-four catalogue names, and adding two new
 * models immediately broke it: `g1`, `c2` and the rest went straight onto the
 * buttons as raw ids. That is the fifth time a hardcoded per-model list in
 * this file has gone stale, always silently. A catalogue is recognisable
 * without being named — it is a plain object whose values are objects carrying
 * a `label` — so recognise it that way and the list can never fall behind
 * again. Cached per model, since the shape never changes at runtime.
 */
const catalogueCache = new WeakMap();

function optionCatalogues(model) {
  if (!model) return [];
  const hit = catalogueCache.get(model);
  if (hit) return hit;
  const found = [];
  for (const value of Object.values(model)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entries = Object.values(value);
    if (!entries.length) continue;
    const looksLikeCatalogue = entries.every(
      (e) => e && typeof e === 'object' && !Array.isArray(e) && typeof e.label === 'string',
    );
    if (looksLikeCatalogue) found.push(value);
  }
  catalogueCache.set(model, found);
  return found;
}

function optLabel(varId, o) {
  const key = String(o);
  const over = OPT_OVERRIDES[varId]?.[key];
  if (over) return over;

  // Ask the model for its own name for this option.
  for (const cat of optionCatalogues(app.model)) {
    const rec = cat[key];
    if (rec && rec.label) return rec.label;
  }

  // Last resort: never show a raw camelCase or snake_case identifier.
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function onInputChange() {
  if (app.exp.simulation.model === 'simple-pendulum') {
    app.state = app.model.init(app.inputs);
  }
  const v = app.model.validate(app.inputs);
  showFeedback(v);
  syncToolbar();
  renderLiveConfig();
  draw();
}

/**
 * "Live setup" strip above the feedback box: a pill per apparatus control
 * showing its current value, in the exact same words (`optLabel`) the
 * control widgets themselves use. It never states anything the model
 * doesn't already hold in `app.inputs` — so substituting a chemical or
 * swapping an apparatus setting is reflected here by construction, without
 * per-experiment authoring, and can never drift out of sync with what is
 * actually being simulated.
 */
function renderLiveConfig() {
  const host = $('#liveConfig');
  if (!host) return;
  const exp = app.exp;
  const controls = exp?.simulation?.controls;
  if (!exp || !controls || !controls.length) { host.innerHTML = ''; return; }
  const byId = Object.fromEntries(exp.variables.map((v) => [v.id, v]));
  let html = '<span class="lc-label">Live setup</span>';
  for (const c of controls) {
    const v = byId[c.var];
    if (!v) continue;
    const raw = app.inputs[v.id];
    let val;
    if (c.widget === 'switch') {
      val = raw ? 'On' : 'Off';
    } else if (c.widget === 'slider') {
      const n = Number(raw);
      const dp = String(v.step).split('.')[1]?.length || 0;
      val = `${Number.isInteger(v.step) ? n : n.toFixed(dp)}${v.unit ? ' ' + esc(v.unit) : ''}`;
    } else {
      val = esc(optLabel(v.id, raw));
    }
    html += `<span class="lc-pill">${esc(v.label)}: <b>${val}</b></span>`;
  }
  host.innerHTML = html;
}

/* ── feedback (error simulation §8) ── */
function showFeedback(v) {
  const box = $('#feedback');
  const item = v.errors[0] || v.warnings[0];
  if (!item) return clearFeedback();
  const kind = v.errors.length ? 'bad' : 'warn';
  box.className = `feedback show ${kind}`;
  box.innerHTML = `<h5>${kind === 'bad' ? '✕' : '!'} ${esc(item.message)}</h5>
    ${item.why ? `<p class="why"><b>Why:</b> ${esc(item.why)}</p>` : ''}
    ${item.fix ? `<div class="fix">→ ${esc(item.fix)}</div>` : ''}
    <p style="font-size:12px;margin-top:7px;color:var(--dim)">Change the setting and try again — experimenting is not penalised.</p>`;
}
function clearFeedback() { $('#feedback').className = 'feedback'; $('#feedback').innerHTML = ''; }

/* ── loop ── */
/**
 * Fixed-timestep accumulator.
 *
 * A naive `dt = min(0.05, now - last)` silently THROWS AWAY time whenever a
 * frame takes longer than the clamp — on a slow school Android (or a headless
 * browser, where frames ran at 54 ms) the simulated stopwatch then drifts slow
 * and every recorded period is wrong. Instead we accumulate real elapsed time
 * and consume it in fixed 1/120 s steps, so the physics advances by exactly the
 * wall-clock time that passed regardless of frame rate. The spiral-of-death
 * guard caps how much we try to catch up in one frame (tab was backgrounded).
 */
const FIXED_DT = 1 / 120;
const MAX_CATCHUP = 0.25; // seconds of simulation per frame, worst case

function startLoop() {
  app.running = true;
  app.last = performance.now();
  app.accumulator = 0;
  const tick = (now) => {
    if (!app.running) return;
    const elapsed = Math.min(MAX_CATCHUP, (now - app.last) / 1000);
    app.last = now;
    app.accumulator += elapsed;
    if (app.state) {
      let steps = 0;
      while (app.accumulator >= FIXED_DT && steps++ < 64) {
        app.state = app.model.step(app.state, app.inputs, FIXED_DT);
        app.accumulator -= FIXED_DT;
        if (app.state.finishedAt) { app.accumulator = 0; break; }
      }
      if (app.exp?.simulation.model === 'simple-pendulum' && app.state.running) {
        app.state.trail = (app.state.trail || []).slice(-16);
      }
      // Titration: the stopcock advances `delivered`, so push it back into the
      // control slider, otherwise the panel keeps showing 0.0 mL while the
      // burette visibly empties.
      if (app.exp?.simulation.model === 'titration') {
        const d = Number((app.state.delivered || 0).toFixed(1));
        if (d !== app.inputs.buretteVolume) {
          app.inputs.buretteVolume = d;
          const sl = document.getElementById('c_buretteVolume');
          if (sl && document.activeElement !== sl) {
            sl.value = String(d);
            const out = document.getElementById('c_buretteVolume_v');
            if (out) out.textContent = d.toFixed(1);
            sl.style.setProperty('--p', `${(d / 50) * 100}%`);
          }
        }
        if (app.state.flowing && (app.state.atEndPoint || app.state.overshot)) {
          app.state = { ...app.state, flowing: false, flowRate: 0 };
          syncToolbar();
          toast(app.state.overshot ? 'Overshot — refill and repeat' : 'End point reached', app.state.overshot ? 'bad' : 'good');
        }
      }
      if (app.state.finishedAt && app.machine.state === STATES.RUNNING) {
        app.machine.to(STATES.MEASURING);
        toast('Timing complete — press Take reading', 'good');
        syncToolbar();
      }
    }
    draw();
    updateReadouts();
    app.raf = requestAnimationFrame(tick);
  };
  app.raf = requestAnimationFrame(tick);
}
function stopLoop() { app.running = false; if (app.raf) cancelAnimationFrame(app.raf); }

function draw() {
  const canvas = $('#cv');
  if (!canvas || !app.exp) return;
  const name = app.exp.simulation.renderer;
  const fn = app.renderers ? app.renderers[name] : null;
  if (!fn) return;
  const { w, h, ctx } = renderScene(canvas, 16 / 10, name, fn, app.state, app.inputs);
  finishFrame(ctx, w, h);
}

/**
 * A piece of apparatus was dragged on the canvas.
 *
 * The handle hands back a value in the variable's OWN units, which is then
 * put through exactly the same gate a slider goes through — clamped to the
 * declared range and snapped to the declared step, which for an instrument
 * is its least count. Manipulating the bench and moving the slider are
 * therefore the same operation reaching the model by two routes, and the
 * theory, the readouts, the graph and the drawing cannot disagree.
 */
function onCanvasDrag(varId, rawValue) {
  if (!app.exp || !app.model) return;
  const v = (app.exp.variables || []).find((x) => x.id === varId);
  if (!v) return;                      // this experiment does not expose it
  const min = Number.isFinite(v.min) ? v.min : -Infinity;
  const max = Number.isFinite(v.max) ? v.max : Infinity;
  const step = Number(v.step) > 0 ? Number(v.step) : 0;
  let val = Math.min(max, Math.max(min, rawValue));
  if (step) val = Math.round((val - min) / step) * step + min;
  val = Number(val.toFixed(6));
  if (app.inputs[varId] === val) return;
  app.inputs[varId] = val;
  // Keep the panel slider in step with the bench.
  const sl = document.getElementById(`c_${varId}`);
  if (sl) {
    sl.value = String(val);
    const out = document.getElementById(`c_${varId}_v`);
    if (out) out.textContent = step && !Number.isInteger(step) ? val.toFixed(String(step).split('.')[1].length) : String(val);
    if (Number.isFinite(v.min) && Number.isFinite(v.max) && v.max > v.min) {
      sl.style.setProperty('--p', `${((val - v.min) / (v.max - v.min)) * 100}%`);
    }
  }
  onInputChange();
}

function updateReadouts() {
  if (!app.exp) return;
  const m = app.exp.simulation.model;
  let items = [];
  if (m === 'simple-pendulum') {
    const t = app.state.stopwatch || 0;
    const n = app.state.completedOscillations || 0;
    items = [
      ['Length L', app.inputs.lengthCm.toFixed(0), 'cm'],
      ['Stop clock', t.toFixed(1), 's'],
      ['Oscillations', `${n}/${app.inputs.oscillations}`, ''],
      ['T so far', n > 0 ? (t / n).toFixed(3) : '—', 's'],
    ];
  } else if (m === 'helical-spring') {
    items = [
      ['Load', app.inputs.loadG.toFixed(0), 'g'],
      ['Force F', ((app.inputs.loadG / 1000) * 9.792).toFixed(3), 'N'],
      ['Extension', ((app.state.x || 0) * 100).toFixed(2), 'cm'],
      ['State', app.state.settled ? 'Steady' : 'Settling', ''],
    ];
  } else if (m === 'resistivity') {
    const I = app.state.current || 0, V = app.state.voltage || 0;
    items = [
      ['Ammeter I', I.toFixed(2), 'A'],
      ['Voltmeter V', V.toFixed(2), 'V'],
      ['V / I', I > 0.001 ? (V / I).toFixed(2) : '—', 'Ω'],
      ['Wire temp', `+${(app.state.tempRise || 0).toFixed(0)}`, '°C'],
    ];
  } else if (m === 'titration') {
    const vEq = app.model.equivalenceVolume(app.inputs);
    items = [
      ['Delivered', (app.state.delivered || 0).toFixed(1), 'mL'],
      ['pH', (app.state.pH ?? 7).toFixed(2), ''],
      ['Colour', app.state.colour || '—', ''],
      ['Equivalence', Number.isFinite(vEq) ? vEq.toFixed(1) : '—', 'mL'],
    ];
  } else if (m === 'reaction-kinetics') {
    items = [
      /* The model names this `thioConc`; calling a function it does not
         export threw on every frame and killed the readouts for this lab. */
      ['[S₂O₃²⁻]', app.model.thioConc(app.inputs).toFixed(4), 'M'],
      ['Temperature', String(app.inputs.tempC), '°C'],
      ['Stop clock', (app.state.elapsed || 0).toFixed(1), 's'],
      ['Cross hidden', `${Math.round(Math.min(1, app.state.turbidity || 0) * 100)}`, '%'],
    ];
  } else if (m === 'convex-lens') {
    const v = app.state.v;
    items = [
      ['Object u', app.inputs.objectDistanceCm.toFixed(0), 'cm'],
      ['Image v', Number.isFinite(v) ? v.toFixed(1) : '—', 'cm'],
      ['Sharpness', `${Math.round((app.state.sharp || 0) * 100)}`, '%'],
      ['Magnification', Number.isFinite(v) ? (-v / app.inputs.objectDistanceCm).toFixed(2) : '—', ''],
    ];
  } else {
    /* Generic fallback for every experiment without bespoke readout wiring
       above: show the live value of its own independent/control variables,
       plus any time-in-progress the model is tracking. Better than a blank
       panel, and correct by construction since it only reads what the
       experiment itself declares. */
    const vars = (app.exp.variables || []).filter((v) => v.type === 'independent' || v.type === 'control').slice(0, 4);
    items = vars.map((v) => {
      const raw = app.inputs[v.id];
      let shown;
      if (typeof raw === 'boolean') shown = raw ? 'On' : 'Off';
      else if (typeof raw === 'number') shown = raw.toFixed(v.step && v.step < 1 ? 2 : 0);
      else shown = String(raw ?? '—');
      return [v.label, shown, v.unit || ''];
    });
    if (Number.isFinite(app.state?.t)) items.push(['Elapsed', app.state.t.toFixed(1), 's']);
  }
  $('#readouts').innerHTML = items.map(([l, v, u]) =>
    `<div class="ro"><span>${esc(l)}</span><b>${esc(v)}${u ? `<i>${esc(u)}</i>` : ''}</b></div>`).join('');
}

/* ── observation table ── */
function renderTable() {
  const cols = app.exp.observationModel.columns;
  $('#thead').innerHTML = `<tr><th>#</th>${cols.map((c) =>
    `<th>${esc(c.label)}${c.unit ? ` (${esc(c.unit)})` : ''}</th>`).join('')}<th></th></tr>`;
  if (!app.rows.length) {
    $('#tbody').innerHTML = `<tr><td colspan="${cols.length + 2}" class="tbl-empty">No readings yet. Set up the apparatus and record your first reading.</td></tr>`;
  } else {
    $('#tbody').innerHTML = app.rows.map((r, i) => `<tr>
      <td>${i + 1}</td>
      ${cols.map((c) => {
        const v = r[c.key];
        return `<td>${v === null || v === undefined ? '—' : (typeof v === 'number' ? v.toFixed(c.decimals) : esc(v))}</td>`;
      }).join('')}
      <td class="del"><button aria-label="Delete reading ${i + 1}" data-i="${i}">×</button></td>
    </tr>`).join('');
    $$('#tbody button[data-i]').forEach((b) => {
      b.onclick = () => {
        app.rows.splice(Number(b.dataset.i), 1);
        DB.saveObservations(app.exp.id, app.rows);
        renderTable();
      };
    });
  }
  renderGraphPanel();
  syncToolbar();
  $('#csvBtn').onclick = exportCSV;
  $('#clearBtn').onclick = () => {
    app.rows = [];
    DB.saveObservations(app.exp.id, []);
    renderTable();
    $('#resultBox').className = 'result-box';
    $('#resultBox').textContent = 'Take readings, then calculate the result.';
  };
}

function renderGraphPanel() {
  const g = app.exp.observationModel.graph;
  /* Not every practical plots anything. Using a multimeter is a sequence of
     independent readings on different functions with different units, so there
     is no pair of variables to put on a pair of axes. Such an experiment
     declares `graph: null` and the whole panel is hidden — previously this
     threw on g.xLabel and took the bench down with it. */
  const panel = $('#graphPanel');
  if (!g) {
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;
  const pts = app.rows.map((r) => ({ x: Number(r[g.x]), y: Number(r[g.y]) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  renderGraph($('#graph'), pts, { xLabel: g.xLabel, yLabel: g.yLabel, throughOrigin: g.throughOrigin });
  const need = app.exp.observationModel.minRows;
  $('#graphHint').textContent = pts.length < need
    ? `${pts.length} of ${need} recommended readings plotted.`
    : `${pts.length} readings plotted. The dashed line is the best fit.`;
}

function renderResult(d) {
  const exp = app.exp;
  const check = checkResult(exp, d);
  const box = $('#resultBox');
  let html = '';
  const m = exp.simulation.model;

  if (m === 'simple-pendulum' && d.mode === 'mass-independence') {
    html = `<b>Period of ${d.n} bobs over ${esc(d.massRange)} at a fixed length of ${d.lengthCm} cm</b>
      <span class="big">T = ${d.meanPeriod} s for every mass</span>
      Spread in T = ${d.spread} s, against a timing uncertainty of ${d.timingUncertainty} s
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.independent
        ? `The spread is no larger than the timing uncertainty, so T does not depend on the mass. The T–m graph is a horizontal line (slope ${d.slope}). Using T = 2π√(L/g) at this one length gives g = ${d.g} m·s⁻².`
        : `The spread of ${d.spread} s exceeds the timing uncertainty — check that changing the bob did not change the effective length.`}</div>`;
  } else if (m === 'simple-pendulum') {
    html = `<b>Slope of L–T² line:</b> ${d.slope} s²·m⁻¹ &nbsp;(r² = ${d.r2})
      <span class="big">g = ${d.g} m·s⁻²</span>
      Second's pendulum length = <b>${d.secondsPendulumCm} cm</b>`;
  } else if (m === 'helical-spring') {
    html = `<b>Slope of load–extension line</b> (r² = ${d.r2})
      <span class="big">k = ${d.k} N·m⁻¹</span>`;
  } else if (m === 'resistivity') {
    html = `<b>Resistance from V–I slope:</b> ${d.resistance} Ω &nbsp;(r² = ${d.r2})
      <span class="big">ρ = ${d.rhoText}</span>
      Standard value for ${esc(app.rows[0].wire)}: ${d.acceptedText || '—'}`;
  } else if (m === 'titration') {
    html = `<b>Mean of ${d.concordantCount} concordant titres:</b> ${d.meanTitre} mL
      ${d.allConcordant ? '' : ' <span style="color:var(--warn)">(discordant readings excluded)</span>'}
      <span class="big">Strength = ${d.strength} g/L</span>
      Normality = ${d.normality} N &nbsp;·&nbsp; Molarity = ${d.molarity} M
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">N₁V₁ = N₂V₂ &nbsp;→&nbsp; strength = N × ${d.eqMass}</div>`;
  } else if (m === 'reaction-kinetics') {
    if (d.mode === 'arrhenius') {
      html = `<b>Arrhenius plot</b> ln(1/t) vs 1/T &nbsp;(r² = ${d.r2})
        <span class="big">Eₐ = ${d.activationEnergy} kJ/mol</span>
        Slope = ${d.slope} K &nbsp;·&nbsp; accepted ≈ ${d.acceptedEa} kJ/mol`;
    } else {
      html = `<b>Rate vs concentration</b> (r² = ${d.r2})
        <span class="big">Order = ${d.orderRounded ?? d.order} in S₂O₃²⁻</span>
        Log-log slope = ${d.order} &nbsp;·&nbsp; a straight line through the origin means first order`;
    }
  } else if (m === 'convex-lens') {
    html = `<b>Mean of f = uv/(u+v):</b> ${d.fMean} cm &nbsp; <b>From 1/u–1/v intercept:</b> ${d.fFromGraph} cm
      <span class="big">f = ${d.fMean} cm &nbsp;·&nbsp; P = ${d.power} D</span>
      Slope of the 1/u–1/v line = ${d.slope} (should be ≈ −1)`;
  } else if (m === 'vernier-callipers') {
    html = `<b>Mean of ${d.n} corrected readings</b> &nbsp;(spread ${d.spread} cm)
      <span class="big">${d.meanValue} cm</span>
      Radius = ${d.radius} cm &nbsp;·&nbsp; ${d.volumeFormula || ''} = <b>${d.volume ?? '—'} cm³</b>`;
  } else if (m === 'surface-tension') {
    html = `<b>From T = rhρg/2 over ${d.n} tubes</b>
      <span class="big">T = ${d.surfaceTension} N·m⁻¹</span>
      From the h vs 1/r graph: ${d.tFromGraph ?? '—'} N·m⁻¹ (r² = ${d.r2})
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">r × h = ${d.productConstant} cm² should be the same for every tube · accepted T = ${d.accepted} N·m⁻¹</div>`;
  } else if (m === 'metre-bridge') {
    html = `<b>Mean of ${d.n} balance points</b> &nbsp;(spread ${d.spread} Ω)
      <span class="big">S = ${d.resistance} Ω</span>
      ${esc(d.combination)} &nbsp;·&nbsp; expected ${d.expected} Ω${d.rhoText ? `
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Resistivity ρ = SπD²/4L = ${d.rhoText}</div>` : ''}`;
  } else if (m === 'pn-diode') {
    html = `<b>Forward characteristic from ${d.n} readings</b>
      <span class="big">Knee voltage = ${d.kneeVoltage ?? '—'} V</span>
      Static resistance ${d.staticResistance ?? '—'} Ω &nbsp;·&nbsp; dynamic resistance ${d.dynamicResistance ?? '—'} Ω
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Found by ${esc(d.kneeMethod || 'extrapolation')} · nominal ${d.acceptedKnee} V${d.reverseCount ? ` · ${d.reverseCount} reverse readings, max ${d.maxReverseCurrent} µA` : ''}</div>`;
  } else if (m === 'ph-determination') {
    html = `<b>${d.n} solutions tested</b> — ${d.acids} acidic, ${d.neutral} neutral, ${d.bases} basic
      <span class="big">${esc(d.mostAcidic)} is the most acidic (pH ${d.mostAcidicPH})</span>
      Most basic: <b>${esc(d.mostBasic)}</b> at pH ${d.mostBasicPH}${d.dilutionCheck ? `
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Dilution check on ${esc(d.dilutionCheck.sample)}: ${d.dilutionCheck.deltaPH} pH units over ${d.dilutionCheck.decades} decades = ${d.dilutionCheck.perDecade} per tenfold dilution (expect 1.00)</div>` : ''}`;
  } else if (m === 'screw-gauge') {
    html = `<b>Mean of ${d.n} corrected readings</b> &nbsp;(spread ${d.spread} mm)
      <span class="big">${d.meanValue} mm</span>
      ${d.area ? `Radius = ${d.radius} mm &nbsp;·&nbsp; ${d.areaFormula} = <b>${d.area} mm²</b>`
        : 'Thickness of the sheet; no area of cross-section applies.'}`;
  } else if (m === 'irregular-lamina') {
    html = `<b>Mean of ${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.lamina)}, ${esc(d.gridLabel)}
      <span class="big">V = ${d.volume} cm³</span>
      Area = ${d.meanArea} cm² &nbsp;·&nbsp; thickness = ${d.meanThickness} mm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Percentage errors add in a product: ${d.areaPct}% in the area + ${d.thicknessPct}% in the thickness = <b>${d.totalPct}%</b> in the volume. The area dominates, so a finer grid helps more than a finer screw gauge.</div>`;
  } else if (m === 'spherometer') {
    html = `<b>Mean sagitta ${d.meanSagitta} mm over ${d.n} readings</b> &nbsp;·&nbsp; l = ${d.legSeparation} mm
      <span class="big">R = ${d.radius} cm</span>
      ${esc(d.surface)}${d.concave ? ' (concave — screw lowered)' : ''} &nbsp;·&nbsp; accepted R ≈ ${d.accepted} cm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">R = l²/6h + h/2 = ${d.mainTerm} + ${d.correctionTerm} cm. The correction term is only ${d.correctionPct}% of the result — small here, but it is part of the exact formula.</div>`;
  } else if (m === 'beam-balance') {
    html = `<b>Mean of ${d.n} weighings</b> &nbsp;·&nbsp; ${esc(d.body)}
      <span class="big">m = ${d.meanMass} g</span>
      Resting point ${d.meanRestingPoint} div &nbsp;·&nbsp; sensitivity ${d.sensitivity} div/mg${d.zeroDiv ? ` &nbsp;·&nbsp; zero ${d.zeroDiv} div corrected` : ''}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.unequalArms
        ? `The arms of this beam are unequal (ratio ${d.armRatio}), so every reading is high by the same proportion. Repetition cannot remove it — only double weighing can.`
        : 'The pointer offset was converted through the sensitivity, which is how the balance resolves finer than its smallest weight.'}${d.secondBody ? ` Two bodies weighed: ${d.secondBody.bodies.map((b) => `${esc(b.body)} = ${b.mass} g`).join(' · ')}.` : ' The practical asks for two different objects — switch the body and weigh again.'}</div>`;
  } else if (m === 'parallelogram-law') {
    html = `<b>Mean resultant of ${d.n} settings</b> &nbsp;·&nbsp; ${esc(d.body)}
      <span class="big">S = ${d.meanResultant} gwt = ${d.weightN} N</span>
      Mean angle ${d.meanAngle}° &nbsp;·&nbsp; accepted ${d.accepted} gwt (${d.acceptedN} N)
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.variedSettings
        ? `R = √(P² + Q² + 2PQ cos θ) gave the same weight across ${d.distinctSettings} different combinations of P and Q — that invariance is what verifies the law.`
        : 'All the readings used one combination of P and Q. Change them and record again: repeating one setting is the same measurement three times, not an independent check.'}</div>`;
  } else if (m === 'inclined-plane') {
    html = `<b>Slope of the F–sin θ line through the origin</b> &nbsp;(r² = ${d.r2})
      <span class="big">W = ${d.weightGwt} gwt = ${d.weightN} N</span>
      ${esc(d.bodyLabel)} &nbsp;·&nbsp; accepted ${d.accepted} gwt &nbsp;·&nbsp; intercept ${d.intercept} gwt
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${esc(d.interceptMeaning)}</div>`;
  } else if (m === 'viscosity') {
    html = `<b>Mean of ${d.n} timed falls</b> &nbsp;·&nbsp; ${esc(d.liquid)} at ${d.tempC} °C
      <span class="big">η = ${d.eta} Pa·s &nbsp;(${d.etaPoise} poise)</span>
      Accepted ${d.accepted} Pa·s &nbsp;·&nbsp; Reynolds number ${d.reynolds} — ${d.streamline ? 'streamline, so Stokes\u2019 law applies' : '<b>turbulent, so Stokes\u2019 law does NOT apply</b>'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.variedRadius && d.etaFromGraph
        ? `Graphical route: the slope of v against r² gives η = ${d.etaFromGraph} Pa·s (r² = ${d.r2}) across ${d.distinctRadii} radii — an independent check on the mean.`
        : 'Use spheres of at least three different radii to also find η from the slope of v against r², which is the graphical method the syllabus asks for.'} Velocities were corrected for the walls by v_free = v(1 + 2.4 r/R); the factor here is ${d.wallFactor}.${d.reachedTerminal ? '' : ' <b>The upper mark is too near the surface — the sphere had not reached terminal velocity.</b>'}</div>`;
  } else if (m === 'specific-heat') {
    html = `<b>Mean of ${d.n} mixings</b> &nbsp;·&nbsp; ${esc(d.solid)} in a ${esc(d.calorimeter).toLowerCase()}
      <span class="big">c = ${d.specificHeat} J·kg⁻¹·K⁻¹</span>
      ${d.specificHeatCal} cal·g⁻¹·°C⁻¹ &nbsp;·&nbsp; accepted ${d.accepted} J·kg⁻¹·K⁻¹ &nbsp;·&nbsp; error ${d.percentError}%
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Mean rise ${d.meanRise} °C to a final ${d.meanFinalTemp} °C. ${d.includedWaterEquivalent
        ? `Water equivalent of the calorimeter, ${d.waterEquivalentG} g, was included.`
        : `<b>The water equivalent (${d.waterEquivalentG} g) was left out</b>, so the heat received has been under-counted and c comes out too LOW.`}${d.slowTransfer ? ' The transfer was slow, so the solid radiated heat on the way and the final temperature — and therefore c — is lower than it should be.' : ''}${d.variedMass ? ` The mass of the solid was varied over ${d.distinctMasses} values and c did not change, as an intensive property must not.` : ' Vary the mass of the solid between trials to show that c does not depend on it.'}</div>`;
  } else if (m === 'friction') {
    html = `<b>Slope of the F–R line through the origin</b> &nbsp;(r² = ${d.r2})
      <span class="big">μ = ${d.mu}</span>
      Angle of friction = ${d.angleOfFriction}° &nbsp;·&nbsp; ${esc(d.surface)}, accepted μ ≈ ${d.accepted}
      ${d.areaCheck ? `<div style="font-size:12px;margin-top:4px;color:var(--muted)">Area check — ${d.areaCheck.faces.map((f) => `${esc(f.face)}: μ = ${f.mu}`).join(' · ')}. ${esc(d.areaCheck.verdict)}</div>` : ''}`;
  } else if (m === 'cooling-curve') {
    html = `<b>ln(θ − θ₀) against t over ${d.n} readings</b> &nbsp;(r² = ${d.r2})
      <span class="big">k = ${d.coolingConstant} s⁻¹</span>
      Half-life of the excess temperature = ${d.halfLifeS} s (${d.halfLifeMin} min)
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${esc(d.vessel)} · room ${d.roomTempC} °C · accepted k ≈ ${d.accepted} s⁻¹</div>`;
  } else if (m === 'resonance-tube') {
    html = `<b>l₁ = ${d.l1} cm, l₂ = ${d.l2} cm</b> &nbsp;→&nbsp; λ = 2(l₂ − l₁) = ${d.wavelengthCm} cm
      <span class="big">v = ${d.speed} m·s⁻¹</span>
      End correction e = (l₂ − 3l₁)/2 = ${d.endCorrection} cm &nbsp;(expected ≈ ${d.acceptedEndCorrection} cm)
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.frequency} Hz at ${d.tempC} °C · accepted v = ${d.accepted} m/s · the end correction cancels in v = 2f(l₂ − l₁)</div>`;
  } else if (m === 'prism-deviation') {
    html = `<b>Vertex of the fitted δ–i curve over ${d.n} readings</b>
      <span class="big">δm = ${d.minimumDeviation}° &nbsp;·&nbsp; μ = ${d.refractiveIndex}</span>
      Minimum occurs at i = ${d.incidenceAtMinimum}° &nbsp;·&nbsp; A = ${d.angleA}°
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">μ = sin((A + δm)/2)/sin(A/2) · accepted μ = ${d.acceptedMu}, δm = ${d.acceptedDeltaM}°</div>`;
  } else if (m === 'electrochemical-cell') {
    html = `<b>E against log([Zn²⁺]/[Cu²⁺]) over ${d.n} ratios</b> &nbsp;(r² = ${d.r2})
      <span class="big">E° = ${d.standardPotential} V</span>
      Slope = ${d.slope} V per decade (expected ${d.expectedSlope})
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Electrons transferred from the slope: n = ${d.nFromSlope ?? '—'} (expected ${d.electrons}) · accepted E° = ${d.acceptedE0} V</div>`;
  } else if (m === 'youngs-modulus') {
    html = `<b>Slope of the load–extension line through the origin over ${d.n} points</b>${d.r2 != null ? ` &nbsp;(r² = ${d.r2})` : ''}
      <span class="big">Y = ${esc(d.youngsModulusText)}</span>
      Slope = ${d.slope} N·m⁻¹ &nbsp;·&nbsp; area of cross-section = ${d.areaM2.toExponential(3)} m²
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${esc(d.material)} · accepted Y = ${esc(d.acceptedText)}${d.discarded ? ` · ${d.discarded} reading(s) past the elastic limit discarded` : ''}</div>`;
  } else if (m === 'boyles-law') {
    html = `<b>P against 1/V over ${d.n} readings</b>${d.r2 != null ? ` &nbsp;(r² = ${d.r2})` : ''}
      <span class="big">PV = ${d.meanProduct} cm Hg · cm³</span>
      Slope of the line through the origin = ${d.slope} &nbsp;·&nbsp; spread in PV = ${d.spreadPercent} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.isothermal ? 'The product is constant to within 4%, so the process was isothermal and Boyle\u2019s law is verified.' : 'The product varies by more than 4% — the gas was probably not held at constant temperature.'}</div>`;
  } else if (m === 'sonometer' && d.mode === 'law-of-length') {
    html = `<b>f against 1/l over ${d.n} forks at ${d.tensionN} N</b>${d.r2 != null ? ` &nbsp;(r² = ${d.r2})` : ''}
      <span class="big">f × l = ${d.meanProduct} Hz·cm</span>
      Spread ${d.spreadPercent} % &nbsp;·&nbsp; wave speed from the slope = ${d.waveSpeed} m·s⁻¹
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.constant
        ? 'The product is constant to within 4%, so the frequency is inversely proportional to the length. The law of length is verified.'
        : 'The product varies by more than 4% — check that the load stayed constant throughout.'}</div>`;
  } else if (m === 'sonometer' && d.mode === 'law-of-tension') {
    html = `<b>l against √T over ${d.n} tensions at ${d.frequencyHz} Hz</b>${d.r2 != null ? ` &nbsp;(r² = ${d.r2})` : ''}
      <span class="big">l/√T = ${d.meanRatio} cm·N⁻½</span>
      Spread ${d.spreadPercent} % &nbsp;·&nbsp; intercept ${d.intercept ?? '—'} cm (should be zero)
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.proportional
        ? `The length is proportional to the square root of the tension, so quadrupling the load doubles the length. Mass per unit length from the slope = ${d.linearDensity} kg·m⁻¹ (accepted ${d.acceptedDensity}).`
        : 'The ratio varies by more than 4% — check the pulley for friction and remember to include the hanger in the tension.'}</div>`;
  } else if (m === 'sonometer') {
    html = `<b>${d.n} readings with the ${esc(d.driver)}</b>
      <span class="big">Mains frequency = ${d.mainsFrequency} Hz</span>
      The wire was driven at ${d.drivenFrequency} Hz &nbsp;·&nbsp; accepted ${d.accepted} Hz
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.halvingRequired
        ? 'An electromagnet attracts the iron wire on BOTH half cycles, so it drives the wire at twice the supply frequency. The measured value must be halved — a student who forgets reports 100 Hz.'
        : 'A permanent magnet gives a Lorentz force that reverses with the current, so the wire is driven once per cycle, at the mains frequency itself.'}</div>`;
  } else if (m === 'galvanometer' && d.mode === 'half-deflection') {
    html = `<b>Half-deflection method over ${d.n} pair(s) of readings</b>
      <span class="big">G = ${d.resistance} Ω</span>
      Figure of merit k = ${d.figureOfMeritMicro} µA/div &nbsp;·&nbsp; full-scale current ${d.fullScaleCurrentMicroA} µA
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Accepted G = ${d.accepted} Ω, k = ${d.acceptedK} µA/div. The crude reading G ≈ S gives ${d.approxResistance} Ω, which is low because S = GR/(R+G) is always a little less than G.</div>`;
  } else if (m === 'galvanometer') {
    html = `<b>Conversion ${esc(d.mode === 'ammeter' ? 'into an ammeter' : 'into a voltmeter')} of range ${d.range} ${d.unit}</b>
      <span class="big">${d.requiredResistance} Ω ${esc(d.connection)}</span>
      ${esc(d.formula)} &nbsp;·&nbsp; Ig = ${d.fullScaleCurrentMicroA} µA &nbsp;·&nbsp; G = ${d.galvanometerResistance} Ω
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The finished instrument has a resistance of ${d.meterResistance} Ω — ${d.mode === 'ammeter'
        ? 'very low, as an ammeter in series must be, so it barely disturbs the current it measures.'
        : 'very high, as a voltmeter in parallel must be, so it draws almost no current from the circuit.'}</div>`;
  } else if (m === 'auxiliary-lens' && d.mode === 'convex-mirror') {
    html = `<b>Null position located at ${d.n} setting(s)</b> &nbsp;(spread ${d.spread} cm)
      <span class="big">f = ${d.focalLength} cm</span>
      Radius of curvature R = ${d.radiusOfCurvature} cm &nbsp;·&nbsp; f = R/2
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${esc(d.element)} · accepted f = ${d.accepted} cm, R = ${d.acceptedR} cm. At the null position the converging beam meets the mirror normally and retraces its own path, so the mirror stands one radius short of I₁.</div>`;
  } else if (m === 'auxiliary-lens') {
    html = `<b>Mean of f = uv/(u − v) over ${d.n} positions</b> &nbsp;(spread ${d.spread} cm)
      <span class="big">f = ${d.focalLength} cm</span>
      Power = ${d.power} D &nbsp;·&nbsp; accepted ${d.accepted} cm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.diverging
        ? 'The focal length is negative, which is the defining property of a diverging lens. I₁ acted as a virtual object throughout.'
        : 'A concave lens must give a NEGATIVE focal length — check which distances were used as u and v.'}</div>`;
  } else if (m === 'refractive-index') {
    html = `<b>${esc(d.methodLabel)} — ${d.n} readings on ${esc(d.sample)}</b> &nbsp;(spread ${d.spread})
      <span class="big">μ = ${d.refractiveIndex}</span>
      Accepted value ${d.accepted} &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.mode === 'liquidLens'
        ? `Lens alone f₁ = ${d.lensFocalCm} cm, with liquid F = ${d.combinationFocalCm} cm, so the liquid lens has f₂ = ${d.liquidLensFocalCm} cm — negative, because a plano-concave liquid lens diverges.`
        : d.mode === 'concaveMirror'
          ? `True radius R = ${d.radiusCm} cm, apparent radius R′ = ${d.apparentRadiusCm} cm. The liquid makes the centre of curvature appear closer.`
          : `Real thickness ${d.realThicknessCm} cm against an apparent ${d.apparentThicknessCm} cm — the mark appears to rise.`} ${d.plausible
        ? 'Refractive index is a pure number with no unit.'
        : 'A value below 1 is impossible here — check which reading was used as the real value.'}</div>`;
  } else if (m === 'concave-mirror') {
    html = `<b>Mean of f = uv/(u + v) over ${d.n} readings</b> &nbsp;(spread ${d.spread} cm)
      <span class="big">f = ${d.fMean} cm</span>
      From the 1/u–1/v graph f = ${d.fFromGraph ?? '—'} cm (slope ${d.slope ?? '—'}, expected −1) &nbsp;·&nbsp; R = 2f = ${d.radiusOfCurvature} cm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Accepted f = ${d.accepted} cm, R = ${d.acceptedR} cm</div>`;

  /* ── Class XI Physics Section A activities ── */
  } else if (m === 'paper-scale') {
    html = `<b>Mean of ${d.n} readings on ${esc(d.object)}</b> &nbsp;·&nbsp; scale of L.C. ${d.leastCount} cm (${d.divisions} divisions)
      <span class="big">l = ${d.meanReading} ± ${d.maxError} cm</span>
      Percentage error ${d.percentError} % &nbsp;·&nbsp; spread ${d.spread} cm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.comparison
        ? `Across ${d.scalesCompared} scales: ${d.comparison.map((c) => `L.C. ${c.leastCount} cm → ${c.mean} ± ${c.maxError} cm`).join(' · ')}. The absolute error is fixed by the instrument at half a division; the PERCENTAGE error falls as the length rises, which is why a fine scale matters most for small objects.`
        : 'Build a second scale of a different least count and measure the same object again — comparing them is what shows how the least count limits the reading.'} ${d.withinLeastCount
        ? 'The reading agrees with the true length to within one least count, which is all this scale can promise.'
        : '<b>The reading is out by more than one least count — check that the strip was laid from the zero mark.</b>'}</div>`;
  } else if (m === 'principle-of-moments') {
    html = `<b>Mean of ${d.n} balancings</b> &nbsp;·&nbsp; ${esc(d.body)} against ${d.knownsUsed} known mass${d.knownsUsed > 1 ? 'es' : ''}
      <span class="big">m = ${d.mass} g</span>
      d₁ = ${d.meanD1} cm, d₂ = ${d.meanD2} cm &nbsp;·&nbsp; accepted ${d.accepted} g &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">m = M·d₂/d₁, so g cancels and the balance compares masses directly. ${d.variedKnown
        ? `Cross-check with different known masses: ${d.crossCheck.map((c) => `${c.knownMassG} g → ${c.mass} g`).join(' · ')} — agreement across different M is what verifies the principle rather than one lucky setting.`
        : 'Repeat with a different known mass: three balancings with the same M is one measurement done three times, not an independent check.'}${d.pivotAtCG
        ? ''
        : ' <b>The knife edge is off the centre of gravity, so the weight of the scale itself contributes a moment.</b>'}</div>`;
  } else if (m === 'graph-plotting') {
    html = `<b>${esc(d.datasetLabel)}</b> &nbsp;·&nbsp; ${d.n} points, ${esc(d.slopeMethod).toLowerCase()}
      <span class="big">Slope = ${d.slope}</span>
      Intercept ${d.intercept} &nbsp;·&nbsp; r² = ${d.r2} &nbsp;·&nbsp; ${d.pointsWithinError} of ${d.n} points within their error bars
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The data occupies ${d.scaleUtilisation} % of the paper${d.goodScale
        ? ' — a good choice of scale.'
        : ' — <b>far too little; the points crowd into a corner, so the triangle used to read the slope is small and imprecise.</b>'} ${d.usedBestFit
        ? 'The slope was taken from the drawn line, which averages the scatter of every point.'
        : '<b>The slope was taken from two data points, so it carries their full uncertainty and ignores all the others.</b>'} ${d.originHandled
        ? (d.shouldPassOrigin ? 'The physics requires zero to give zero, and the line was forced through the origin correctly.' : 'This data has a genuine intercept, and the line was correctly left free.')
        : (d.shouldPassOrigin ? '<b>Zero on one axis must mean zero on the other here — the line should pass through the origin.</b>' : '<b>This data has a real intercept; forcing the line through the origin has tilted it and biased the slope.</b>')}${d.errorBarsShown ? '' : ' <b>No error bars were drawn, so there is no way to judge whether the line fits.</b>'}</div>`;
  } else if (m === 'rolling-friction') {
    html = `<b>Slope of the F–R line through the origin over ${d.n} loads</b> &nbsp;·&nbsp; ${esc(d.surface)}
      <span class="big">μ_r = ${d.muRolling}</span>
      Coefficient of rolling resistance a = μ_r × r = ${d.rollingResistanceCm} cm &nbsp;·&nbsp; accepted ${d.accepted} &nbsp;·&nbsp; r² = ${d.r2 ?? '—'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Sliding friction for the same pair of surfaces is ${d.slidingComparison} — about <b>${d.timesSmaller} times larger</b>. That is the whole reason wheels and ball bearings exist. ${d.radiusCheck
        ? `Across ${d.radiiCompared} radii: ${d.radiusCheck.map((r) => `r = ${r.radiusCm} cm → ${r.mu}`).join(' · ')} — the resistance falls as the radius rises, so a larger roller rolls more easily.`
        : `All readings used the r = ${d.radiusCm} cm roller. Change the roller and record again to expose the inverse dependence on radius.`}</div>`;
  } else if (m === 'projectile-range') {
    html = `<b>${d.n} shots at ${d.anglesTested} different angles</b> &nbsp;·&nbsp; ${d.groundLevel ? 'launched from the floor' : `launched from ${d.launchHeightM} m`}
      <span class="big">Greatest range at ${d.bestAngle}° (${d.bestRange} m)</span>
      Launch speed recovered from the data: ${d.launchSpeed ?? '—'} m/s &nbsp;·&nbsp; theoretical optimum ${d.optimumAngle}°
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.groundLevel
        ? 'From ground level R = u² sin 2θ / g, which is greatest at 45°.'
        : `Launched from a height the symmetry is broken: the projectile gains flight time for free, so it pays to launch flatter and the optimum falls to ${d.optimumAngle}°.`} ${d.complementaryPairs.length
        ? `Complementary pairs: ${d.complementaryPairs.map((p) => `${p.a}°/${p.comp}° → ${p.rangeA} m and ${p.rangeComp} m`).join(' · ')}. ${d.pairsAgree ? 'They agree, because sin 2θ is symmetric about 45°.' : 'They differ by more than the scatter — check the spring setting was not changed between shots.'}`
        : 'Fire at a pair of complementary angles such as 30° and 60° — equal ranges from unequal angles is the striking result of this activity.'}</div>`;
  } else if (m === 'energy-conservation') {
    html = `<b>Mean of ${d.n} runs</b> &nbsp;·&nbsp; ${esc(d.ball)} on a ${esc(d.track).toLowerCase()}
      <span class="big">h₂/h₁ = ${d.ratio} &nbsp;(${d.percentRetained} % retained)</span>
      h₁ = ${d.meanH1} cm → h₂ = ${d.meanH2} cm &nbsp;·&nbsp; energy in ${d.energyIn} mJ, out ${d.energyOut} mJ, dissipated ${d.energyLost} mJ
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The ball never rises above its release height — that would create energy. The missing ${d.percentLost} % has become heat in the track and the air, which is what makes friction non-conservative. Rolling shares the kinetic energy: ${d.rotationalShare} % of it is rotational, so the speed at the join is ${d.speedRolling} m/s against ${d.speedIfSliding} m/s for a sliding body (ratio ${d.speedRatio}). ${d.variedHeight
        ? `Tested from ${d.heightsTested} different release heights — a constant ratio across them is the real evidence that a fixed FRACTION is lost.`
        : 'Release from a different height and record again: a constant ratio across heights is what shows a fixed fraction is dissipated.'}</div>`;
  /* ── Class XII Chemistry Category C · thermochemistry ── */
  } else if (m === 'calorimetry') {
    html = `<b>${d.n} runs</b> &nbsp;·&nbsp; ${esc(d.calorimeter)} (W = ${d.waterEquivalentG} g) &nbsp;·&nbsp; spread ${d.spreadKJ} kJ mol⁻¹
      <span class="big">ΔH = ${d.meanKJ} kJ mol⁻¹</span>
      Accepted ${d.accepted} kJ mol⁻¹ &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; ${d.exothermic ? 'exothermic' : 'endothermic'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.signCorrect
        ? `The sign is right: the thermometer ${d.exothermic ? 'ROSE, so heat left the system and ΔH is negative' : 'FELL, so the system took heat from the water and ΔH is positive'}.`
        : '<b>Check your sign.</b> A rising thermometer means heat was RELEASED, so ΔH is negative; a falling one means heat was absorbed and ΔH is positive.'}
      ${d.uncorrected
        ? ` <b>At least one run ignored the water equivalent of the calorimeter.</b> The vessel, thermometer and stirrer absorb heat too — ${d.waterEquivalentG} g of water equivalent here — so leaving it out means dividing by too little mass and every ΔH comes out too small in magnitude. With a glass beaker that error alone is worth about twenty per cent.`
        : ` The water equivalent of ${d.waterEquivalentG} g was included, which is what keeps the result honest.`}
      ${d.hydrationKJ !== null
        ? ` <b>Hess’s law bonus:</b> subtracting your two copper sulphate results gives an enthalpy of hydration of ${d.hydrationKJ} kJ mol⁻¹ for the anhydrous salt (accepted about −78). That quantity cannot be measured directly at all — you cannot hydrate a solid one formula unit at a time — yet two ordinary dissolution experiments deliver it.`
        : ''}
      ${d.mode === 'neutralisation'
        ? ' Every strong acid with every strong base gives the same value, because in each case the only reaction is H⁺ + OH⁻ → H₂O. A weak acid gives less, and the shortfall is the energy spent ionising it.'
        : ''}
      ${d.peakAtEquimolar === true
        ? ' The largest heat effect came at roughly equal mole fractions, which is what a pairwise interaction requires: each hydrogen bond needs one molecule of each kind.'
        : d.peakAtEquimolar === false
          ? ' <b>Your largest effect was not near equal mole fractions.</b> Since each hydrogen bond pairs one acetone with one chloroform, the maximum should sit close to x = 0.5.'
          : ''}</div>`;

  /* ── Class XII Chemistry Category E · chromatography ── */
  } else if (m === 'chromatography') {
    html = `<b>${d.n} chromatograms</b> &nbsp;·&nbsp; solvent front ${esc(d.frontRange)} &nbsp;·&nbsp; ${d.componentCount} component${d.componentCount === 1 ? '' : 's'}
      <span class="big">${esc(d.highest)} R<sub>f</sub> = ${d.highestRf}</span>
      ${esc(d.componentList)}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${esc(d.highest)} travelled furthest and ${esc(d.lowest)} least (R<sub>f</sub> ${d.lowestRf}), because a component that dissolves readily in the mobile phase spends most of its time moving while one that is strongly held by the water in the paper fibres lags behind. Your worst agreement with the accepted values is ${d.worstErrorPct} % on ${esc(d.worstComponent)}.
      ${d.rfStable === true
        ? ` <b>The important check passed:</b> you ran the paper to ${d.frontsUsed} different front distances and the R<sub>f</sub> values agreed to within ${d.rfSpread}. That is the whole reason R<sub>f</sub> is worth quoting — both distances grow together, so their ratio is a property of the substance and the solvent, not of how long you left the jar alone.`
        : d.rfStable === false
          ? ` <b>Your R<sub>f</sub> values shifted by ${d.rfSpread} between runs of different length.</b> They should not: both distances grow together. Check that you marked the solvent front immediately on removing the paper, before it evaporated, and that you measured to the CENTRE of each spot.`
          : ` Run the paper again for a different length of time. If R<sub>f</sub> really is a ratio of two distances that grow together, it should come out the same — and showing that is worth more than any single measurement.`}
      ${d.allResolved
        ? ''
        : ' <b>Not every run resolved its spots.</b> Two components separate on the paper by their R<sub>f</sub> difference times the front distance, so a pair with similar R<sub>f</sub> stays merged however patiently you wait. Changing the solvent system changes the R<sub>f</sub> values themselves, which is the only real fix.'}
      ${d.kind === 'cation'
        ? ' The spots were colourless until sprayed: the developing reagent forms a coloured complex where each ion landed, so the chemistry that locates the spot is separate from the chromatography that separated it.'
        : ' A leaf looks uniformly green only because chlorophyll is present in the largest amount; the paper shows the carotene and xanthophyll that were there all along.'}</div>`;

  /* ── Class XII Chemistry Category A · surface chemistry ── */
  } else if (m === 'sol-preparation') {
    html = `<b>${d.n} observations</b> &nbsp;·&nbsp; ${d.coagulationCount} coagulation values &nbsp;·&nbsp; ${esc(d.solsSeen)}
      <span class="big">${esc(d.mostEffective)} is the strongest coagulant</span>
      ${d.lowestValue} mM against ${d.highestValue} mM for ${esc(d.leastEffective)} &nbsp;·&nbsp; a factor of ${d.powerRatio}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.bothScatter
        ? 'Both the lyophilic and the lyophobic sol showed a Tyndall cone, which is what establishes that both are colloidal in the first place \u2014 a true solution shows nothing at all from the side.'
        : 'Shine the beam through BOTH classes of sol: the Tyndall cone is what shows that each is a colloid rather than a solution.'}
      ${d.hardySchulzeConfirmed
        ? ` Your coagulation values fall steadily as the charge on the active ion rises (charges ${esc(d.chargesUsed)} were used), which is the Hardy-Schulze rule expressed as a number. Note how steep it is: ${d.powerRatio}-fold for a change of only two units of charge. Coagulating power is the RECIPROCAL of the coagulation value, so the smallest value belongs to the most powerful coagulant. Remember which ion did the work: it is always the one of charge OPPOSITE to the sol, so a positive sol is coagulated by the anion and a negative sol by the cation.`
        : ` <b>Your values do not fall steadily with the charge on the active ion.</b> Check which ion is actually doing the work: it is the one whose charge is OPPOSITE to that of the sol. A positive sol such as ferric hydroxide is coagulated by the anion, so K\u2083[Fe(CN)\u2086] beats KCl even though both contain potassium.`}
      A lyophilic sol resists the same additions entirely, because it carries a sheath of solvent as well as a charge.</div>`;
  } else if (m === 'dialysis') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${d.timesUsed} times over ${d.spanMin} min &nbsp;·&nbsp; ${esc(d.waterLabel)}
      <span class="big">&tau; = ${d.tau} min</span>
      Slope of ln C against t = ${d.slope} &nbsp;·&nbsp; expected &tau; = ${d.accepted} min &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; ${d.removedPct} % removed
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The membrane separates by SIZE: ions pass, colloidal particles cannot. Because the rate of diffusion is proportional to the concentration difference across it, the concentration inside falls exponentially and ln C against t is a straight line of slope &minus;1/&tau;.
      ${d.firstOrderConfirmed
        ? ` Your plot is a good straight line (r&sup2; = ${d.fitR2}), confirming first-order removal.`
        : d.stalled
          ? ` <b>Your graph is not a straight line, and the run stalled at about ${d.plateauPct} % of the original concentration.</b> The outer water was never changed, so electrolyte accumulated outside the bag, the concentration difference driving diffusion collapsed, and the process stopped at equilibrium instead of going to completion. The sol is left permanently impure however long you wait. This is the single most important thing the experiment teaches: dialysis needs a clean outside.`
          : ` <b>The plot is not a good straight line (r&sup2; = ${d.fitR2}).</b> Check the timing and that the outer water was changed.`}
      ${d.membraneIntact ? '' : ' <b>The membrane was damaged</b>, so colloid escaped along with the electrolyte and the run is not valid.'}
      Dialysis can be taken too far: the ions removed include those that stabilise a lyophobic sol, so exhaustive dialysis coagulates it.</div>`;
  } else if (m === 'emulsion') {
    html = `<b>${d.n} observations</b> &nbsp;·&nbsp; ${d.separationCount} timed &nbsp;·&nbsp; ${d.agentCount} agent${d.agentCount === 1 ? '' : 's'} tried
      <span class="big">${d.stabilisationRatio}&times; more stable</span>
      ${d.bareTimeS} s with no emulsifier against ${d.bestTimeS} s with ${esc(d.bestAgent)}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.stabilised
        ? `An emulsifying agent sits at the oil-water boundary with its polar head in the water and its non-polar tail in the oil. It lowers the interfacial tension so the droplets formed are much smaller, and it wraps each droplet in a layer that stops them merging. Most of the ${d.stabilisationRatio}-fold gain is geometric rather than electrostatic: Stokes\u2019 law makes the rise speed proportional to r&sup2;, so droplets half the size take four times as long to separate.`
        : `<b>You have not yet shown a clear stabilising effect.</b> Compare the same oil with and without about one per cent of soap \u2014 the difference should be a factor of ten or more.`}
      ${d.comparable ? '' : ' <b>Your control used a different oil from your emulsified runs,</b> so the comparison is not like with like. A viscous oil separates slowly whatever is at the interface.'}
      ${d.bothTypesFound
        ? ` The dilution test found both types (${esc(d.typesFound)}). Which type forms is decided by the EMULSIFIER, not by which liquid is in excess: a water-loving head gives oil-in-water, while a calcium soap, being oil-loving, gives water-in-oil.`
        : d.typeCount === 1
          ? ` The dilution test identified the emulsion as ${esc(d.typesFound)}: an emulsion mixes freely with whichever liquid is its continuous phase. Try lime water to obtain the opposite type.`
          : ' Use the dilution test to find whether each emulsion is oil-in-water or water-in-oil.'}</div>`;

  /* ── Class XII Physics Section B · electronics activities ── */
  } else if (m === 'component-id') {
    html = `<b>${d.n} specimens named</b> &nbsp;·&nbsp; ${d.specimensExamined} different &nbsp;·&nbsp; ${d.correctCount} correct
      <span class="big">${d.typeCount} of 4 kinds identified</span>
      ${esc(d.typesIdentified)} &nbsp;·&nbsp; ${d.accuracyPct} % accurate
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.allFourFound
        ? 'You have found all four kinds the activity asks for. Every one of them was settled by the SAME test: reading the resistance both ways round. A resistor reads the same in both directions because it has no polarity; a diode or an LED reads one way only, because a p-n junction conducts in one direction; a capacitor reads open both ways once it has charged.'
        : `Still to find: <b>${esc(d.missingTypes)}</b>. Work through more of the tray — the activity asks for a diode, an LED, a resistor and a capacitor.`}
      ${d.junctionConfusion
        ? ' <b>One of your namings confused a diode with an LED.</b> Both conduct one way only, so the asymmetry alone cannot separate them: it is the SIZE of the forward reading that does. A light-emitting junction needs roughly 1.8 V against about 0.7 V for silicon, so its forward reading is several times higher.'
        : ''}
      Appearance was never sufficient here: two of the specimens are cylinders with a band, and one of those is a resistor while the other is a diode.</div>`;
  } else if (m === 'diode-tester') {
    html = `<b>${d.n} components tested</b> &nbsp;·&nbsp; ${d.componentsTested} different &nbsp;·&nbsp; ${d.correctCount} judged correctly
      <span class="big">${d.accuracyPct} % correct</span>
      Faults found: ${esc(d.faultsFound)}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.allGoodUnidirectional
        ? 'Every healthy component you tested conducted in one direction and blocked in the other. That is unidirectional flow, and it is the property that makes a diode a rectifier.'
        : d.sawUnidirectional
          ? 'You saw one-way conduction, which is the first half of the activity.'
          : '<b>You have not yet shown one-way conduction on a healthy component.</b> Test a good diode forward and then reverse before judging the faulty ones — the healthy pattern is what the faults are departures from.'}
      ${d.bothFaults
        ? ' You met both failure modes, and they are exact opposites: an OPEN junction conducts in neither direction, a SHORTED one conducts in both with almost no forward drop. Only the reverse test separates them, which is why a verdict from a single reading is never safe.'
        : ' There are two ways a junction can fail — open and shorted. Try to find an example of each.'}
      ${d.bothKinds ? ' Testing both a diode and an LED also shows that the forward drop identifies the material: about 0.7 V for silicon against 1.8 V or more for a light-emitting junction.' : ''}</div>`;
  } else if (m === 'ldr-intensity') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${d.distancesUsed} distances &nbsp;·&nbsp; ${esc(d.rangeText)} (\u00d7${d.rangeFactor})
      <span class="big">&gamma; = ${d.gamma}</span>
      Slope of log R against log d = ${d.slope} &nbsp;·&nbsp; accepted &gamma; = ${d.accepted} &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The slope is <b>2&gamma;</b>, not &gamma;: one factor of &gamma; comes from the cell's own response R = A&middot;E^(&minus;&gamma;), and the factor of two from the inverse-square law E = I/d&sup2;. So &gamma; is half the slope you measured.
      ${d.powerLawConfirmed
        ? ` The log-log plot is a good straight line (r&sup2; = ${d.fitR2}), which is itself the evidence that the response really is a power law.`
        : ` <b>The log-log plot is not a good straight line (r&sup2; = ${d.fitR2}).</b> That usually means ambient light, or too narrow a range of distance.`}
      ${d.ambientSpoiled
        ? ` <b>At your furthest reading the room was supplying ${d.ambientPctAtFurthest} % of the light falling on the cell.</b> The cell responds to the TOTAL illuminance, so once the room dominates, moving the lamp barely changes the resistance. The far points lift above the true line, the graph flattens, and &gamma; comes out too small. Your procedure was right; the room was wrong. Black it out, or keep to distances where the lamp dominates.`
        : d.inRange
          ? ` A value between 0.7 and 0.9 is what a cadmium-sulphide cell should give, so this is a sound result.`
          : ` The accepted range for cadmium sulphide is 0.7 to 0.9, so this value falls outside it.`}</div>`;

  /* ── Class XII Physics Section B · optics activities ── */
  } else if (m === 'lateral-deviation') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.slab)}, ${d.thickness} cm &nbsp;·&nbsp; ${esc(d.angleSpan)}
      <span class="big">&mu; = ${d.mu}</span>
      Accepted ${d.accepted} &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; largest shift ${d.maxShiftMm} mm
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The ray bends towards the normal on entering and away from it on leaving, by exactly the same amount, so <b>the emergent ray is parallel to the incident ray</b> — the slab shifts the light sideways but cannot change its direction.
      ${d.shiftIncreases
        ? 'Your readings show the shift growing with the angle of incidence, as d = t·sin(i−r)/cos r requires.'
        : '<b>Your shift did not increase steadily with the angle.</b> Check the traced rays: the perpendicular distance must be measured between the emergent ray and the incident ray produced forward, not along the face of the slab.'}
      The largest shift you measured was ${d.fractionOfLimit} % of the slab thickness. That is the ceiling: as the angle approaches 90° the shift tends to ${d.limitingShift} cm and can never exceed it.</div>`;
  } else if (m === 'single-slit-diffraction') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.source)} &nbsp;·&nbsp; ${d.slitsUsed} slit${d.slitsUsed === 1 ? '' : 's'}, ${d.distancesUsed} distance${d.distancesUsed === 1 ? '' : 's'}
      <span class="big">&lambda; = ${d.wavelength} nm</span>
      Accepted ${d.accepted} nm &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.narrowerIsWider
        ? `<b>The ${d.narrowestSlit} mm slit gave a ${d.narrowestWidth} mm pattern while the ${d.widestSlit} mm slit gave only ${d.widestWidth} mm.</b> The narrower slit produces the WIDER pattern — the result that cannot be explained by rays travelling in straight lines, and the reason this activity is evidence that light is a wave.`
        : 'Try at least two different slit widths: the central result of this activity is that a narrower slit gives a wider pattern.'}
      ${d.inverseConfirmed === true
        ? `A plot of w against 1/a is a straight line through the origin (r² = ${d.fitR2}), confirming w = 2λD/a.`
        : d.inverseConfirmed === false
          ? `<b>The plot of w against 1/a is not a good straight line (r² = ${d.fitR2}).</b> Check that the screen distance was the same for those readings, and that you measured to the DARK fringes either side of the central band.`
          : ''}
      Remember that a sin θ = nλ gives the MINIMA here — it is the condition for maxima only in the double-slit experiment.</div>`;
  } else if (m === 'image-formation') {
    html = `<b>${d.n} positions</b> &nbsp;·&nbsp; ${esc(d.element)}
      <span class="big">f = ${d.focalLength} cm</span>
      Accepted ${d.accepted} cm &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; images seen: ${esc(d.naturesSeen)}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.foundSameSize
        ? `At u = ${d.sameSizeU} cm the image was the same size as the object, which puts both at 2F — so f is half that distance, ${d.twoF / 2} cm, with no calculation at all.`
        : `Try placing the candle at exactly ${d.twoF} cm. The image should come out the same size as the object, which is the neatest way to find f.`}
      ${d.magnificationFalls
        ? `The magnification fell from ${d.nearestM} at u = ${d.nearestU} cm to ${d.furthestM} at u = ${d.furthestU} cm: the further the object, the smaller the image.`
        : ''}
      ${d.magConsistent
        ? `The two routes to the magnification — the ratio of heights and the ratio v/u — agree to within ${d.magAgreementPct} %, which is the internal check that the distances were measured from the right place.`
        : `<b>The magnification from the heights disagrees with v/u by ${d.magAgreementPct} %.</b> Distances should be measured from the optical centre of the lens, not from the edge of its holder.`}
      Every real image here is inverted, and inside the focus no screen shows anything at all, because the image is virtual and no light reaches it.</div>`;
  } else if (m === 'lens-combination') {
    html = `<b>${d.n} trials</b> &nbsp;·&nbsp; ${d.pairsTried} different pairs &nbsp;·&nbsp; target ${d.target} cm (${d.targetPowerD} D)
      <span class="big">${d.found ? 'Specification met' : 'Not yet met'} — best ${d.bestFocal} cm</span>
      ${esc(d.bestPair)} &nbsp;·&nbsp; ${d.bestErrorPct} % from the target
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.powersAdd
        ? `The measured power of each combination matched P₁ + P₂ to within ${d.powerAgreementPct} %, confirming that <b>powers simply add for lenses in contact</b>. That is why opticians work in dioptres: the arithmetic is addition rather than reciprocals.`
        : d.powerAgreementPct === null
          ? 'Measure at least one pair in contact, so the addition of powers can be checked.'
          : `<b>The measured powers differ from P₁ + P₂ by ${d.powerAgreementPct} %.</b> Check that the lenses were in contact — a gap of even a centimetre weakens the pair measurably.`}
      ${d.usedSeparation ? ' One or more trials had a gap between the lenses, where 1/F = 1/f₁ + 1/f₂ − d/(f₁f₂) applies instead.' : ''}
      ${d.solutionsExist
        ? `From this set, ${d.solutionsExist} pair${d.solutionsExist === 1 ? '' : 's'} meet${d.solutionsExist === 1 ? 's' : ''} the specification: ${esc(d.solutionList)}.`
        : 'No pair in this set can reach the specified focal length exactly.'}</div>`;

  /* ── Class XII Physics Section A · assembly and fault-finding ── */
  } else if (m === 'household-circuit') {
    html = `<b>${d.n} assemblies recorded</b> &nbsp;·&nbsp; ${d.arrangementsTried} different arrangements &nbsp;·&nbsp; ${esc(d.lamp)}
      <span class="big">${d.totalCurrent} A drawn, ${d.voltagePerLamp} V per lamp</span>
      Each lamp dissipates ${d.powerPerLamp} W of its ${d.ratedPower} W rating &nbsp;·&nbsp; a ${d.recommendedFuseA} A fuse suits this circuit
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">In parallel each lamp has the full 220 V and the three together draw ${d.parallelCurrent} A. In series they would share the supply, taking only ${d.seriesCurrent} A, and since P = V²/R a third of the voltage gives a NINTH of the power — the lamps barely glow, and one failure extinguishes all three.
      ${d.foundUnsafe
        ? `<b>${d.unsafeCount} of your assemblies were unsafe.</b> Note which of them still lit the lamps: a switch in the neutral turns the lamp off but leaves the holder connected to the live conductor, so the circuit passes every casual test and is still dangerous. Faults that hide behind normal behaviour are the ones that hurt people.`
        : 'Now try a deliberately wrong assembly — a switch in the neutral, or the fuse in the neutral — and see that the lamps still light perfectly. That is what makes those mistakes dangerous.'}
      ${d.foundCorrect
        ? ` A correct assembly was recorded: ${esc(d.finalWiring)} lamps, ${esc(d.finalSwitches).toLowerCase()}, fuse ${esc(d.finalFuse).toLowerCase()}, casing ${esc(d.finalEarthing).toLowerCase()}.`
        : ' No fully correct assembly yet: lamps in parallel, a switch per lamp in the live conductor, fuse in the live conductor, casing earthed.'}</div>`;
  } else if (m === 'circuit-assembly') {
    html = `<b>${d.n} readings</b> at ${d.settingsTried} rheostat settings &nbsp;·&nbsp; ${esc(d.cell)}
      <span class="big">R = ${d.resistance} Ω</span>
      Accepted ${d.accepted} Ω &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; current ranged ${esc(d.currentRange)} A
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Recovering the marked value of the load from V/I is the check that the circuit was assembled correctly — a wrongly connected circuit does not give the right resistance.
      ${d.rheostatWorks
        ? 'The current changed as the slider moved, so the rheostat is wired as a variable arm using one end terminal and the sliding contact.'
        : '<b>The current did not change as the slider moved.</b> The rheostat is connected across both of its end terminals, so it is simply a fixed resistor and the slider does nothing. This fault is easy to miss because every reading still looks reasonable.'}
      Your value sits a little above the marked one because the readings include the ammeter, the leads and the internal resistance of the cell as well as the resistor itself.</div>`;
  } else if (m === 'circuit-fault') {
    html = `<b>${d.boardsExamined} boards examined</b> &nbsp;·&nbsp; ${d.n} diagnoses
      <span class="big">${d.correctCount} of ${d.n} correct (${d.accuracyPct} %)</span>
      ${d.faultCount ? `Faults identified: ${esc(d.faultsIdentified)}` : 'No fault correctly identified yet'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.allCorrect
        ? 'Every fault was read correctly from the behaviour of the meters, which is what this activity examines — not repairing the circuit, but reasoning backwards from symptom to cause.'
        : `<b>${d.n - d.correctCount} diagnosis${d.n - d.correctCount === 1 ? '' : 'es'} did not match the symptoms.</b> Each fault behaves differently: a large current with almost no voltage means the ammeter is across the load; no current with nearly the full supply on the voltmeter means the voltmeter is in the path; both needles backwards means the cell is reversed; readings that survive opening the key mean the key is bridged; sensible readings that never change mean the rheostat is across its full track; and zero on both means a broken lead.`}
      ${d.diagramNote ? `<br>For your diagram: ${esc(d.diagramNote)}` : ''}</div>`;

  /* ── Class XII Physics Section A activities ── */
  } else if (m === 'inductor-impedance') {
    html = `<b>${d.nDc} DC and ${d.nAc} AC reading${d.nAc === 1 ? '' : 's'}</b> &nbsp;·&nbsp; ${esc(d.coil)}, ${esc(d.core)}
      <span class="big">L = ${d.inductanceMH} mH</span>
      R = ${d.resistance} Ω &nbsp;·&nbsp; Z = ${d.impedance} Ω &nbsp;·&nbsp; X<sub>L</sub> = ${d.reactance} Ω at ${d.frequencyHz} Hz &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The DC reading gives R alone, because a steady current induces no back-emf; the AC reading gives Z, which is larger. They combine in QUADRATURE, so X<sub>L</sub> = √(Z² − R²) = ${d.reactance} Ω and the current lags the voltage by ${d.phaseAngle}°.
      <b>Subtracting arithmetically instead would have given X<sub>L</sub> = ${d.naiveReactance} Ω and L = ${d.naiveInductanceMH} mH — out by ${d.naiveErrorPct} %.</b>
      ${d.hasCore
        ? `With the ${esc(d.core).toLowerCase()} in place the AC current fell to ${d.acCurrentA} A while the DC current stayed at ${d.dcCurrentA} A: the core raises the inductance by carrying more flux, but it cannot alter the resistance of the copper.`
        : 'Now insert the iron core and repeat both readings — the AC current will fall sharply while the DC current does not move at all, which is the heart of this activity.'}</div>`;
  } else if (m === 'multimeter') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${d.functionsUsed} of the meter's functions used &nbsp;·&nbsp; ${d.targetsTested} test points
      <span class="big">${d.correctReadings} / ${d.n} valid readings</span>
      ${esc(d.functionList)}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.allValid
        ? 'Every reading was taken on the correct function, range and connection.'
        : `<b>${d.n - d.correctReadings} reading${d.n - d.correctReadings === 1 ? ' was' : 's were'} taken on a setting that cannot give a valid answer.</b> A multimeter always displays something; it is the operator who decides whether that something means anything.`}
      ${d.continuityDone
        ? `${d.foundBreak && d.foundGood
          ? 'The continuity test distinguished the sound lead, which buzzed at a fraction of an ohm, from the broken one, which showed an open circuit — a fault no inspection of the insulation would have found.'
          : d.foundBreak
            ? 'The broken lead was found. Test the sound lead too, so you have the contrast.'
            : 'The sound lead buzzed. Now test the suspect one — the point of the test is to find the break.'}`
        : 'Continuity has not been tested yet: it is the one genuinely diagnostic function of the meter.'}
      Readings taken: ${d.resistanceRows} resistance, ${d.voltageRows} voltage, ${d.currentRows} current.</div>`;
  } else if (m === 'potential-drop') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.wire)}, ${esc(d.driver)} &nbsp;·&nbsp; current ${d.currentA} A
      <span class="big">k = ${d.gradient} V/m</span>
      ${d.gradientVPerCm} V/cm &nbsp;·&nbsp; accepted ${d.accepted} V/m &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; r² = ${d.r2}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.linear
        ? 'The points lie on a straight line, so the potential drop is directly proportional to the length tapped off.'
        : `<b>The points do not lie well on a straight line (r² = ${d.r2}).</b> Curvature means the current was not steady while the readings were taken — usually the wire warming up.`}
      ${d.throughOrigin
        ? `The line passes through the origin (intercept ${d.intercept} V, ${d.interceptPct} % of a typical reading), as it must: no length means no resistance and so no drop.`
        : `<b>The line misses the origin by ${d.intercept} V.</b> At zero length there is no wire and there can be no potential drop, so an intercept is not a property of the wire — it points to a contact resistance at the terminal being counted as part of it.`}
      Across the whole 100 cm the drop would be ${d.fullWireV} V. This proportionality is what turns a length of wire into a scale of potential difference, and it is the principle every potentiometer experiment depends on.</div>`;

  /* ── Class XI Chemistry, Category B ── */
  } else if (m === 'melting-point') {
    html = `<b>Mean of ${d.n} determinations</b> &nbsp;·&nbsp; ${esc(d.compound)}
      <span class="big">M.p. = ${d.meltingRangeText}</span>
      Range ${d.rangeC} °C &nbsp;·&nbsp; accepted ${d.accepted} °C &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.sharp
        ? 'A range under a degree is a SHARP melting point, which is the criterion of purity.'
        : `<b>A range of ${d.rangeC} °C is broad.</b> The impurity dissolves in the first liquid formed and depresses the melting point most at that moment; as melting proceeds it is diluted and the remaining solid melts higher, which is what spreads the range.`} ${d.pure
        ? ''
        : `This sample carries about ${d.impurityPct} mole per cent of impurity, depressing the melting point by roughly ${d.depressionC} °C.`} ${d.heatedTooFast
        ? `<b>Heating at ${d.n ? '' : ''}this rate the sample lagged the bath by about ${d.thermometerLagC} °C, so the value is systematically HIGH — repeating the run will not fix it.</b>`
        : ''} ${d.purityCheck
        ? `Samples compared: ${d.purityCheck.map((p) => `${esc(p.name)} → ${p.meltingPoint} °C over ${p.range} °C`).join(' · ')}. Both the lowering and the broadening grow with the impurity, which is why a melting point tests purity.`
        : 'Determine the melting point of the crude sample as well — comparing the two is what makes this a test of purity rather than a lookup.'}</div>`;
  } else if (m === 'boiling-point') {
    html = `<b>Mean of ${d.n} determinations</b> &nbsp;·&nbsp; ${esc(d.liquid)} at ${d.pressureMmHg} mm Hg
      <span class="big">B.p. = ${d.boilingPoint} °C at 760 mm Hg</span>
      Observed ${d.observedBoilingPoint} °C &nbsp;·&nbsp; accepted ${d.accepted} °C &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; spread ${d.spread} °C
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.correctedForPressure
        ? `A liquid boils when its vapour pressure equals the external pressure, so the observed value was corrected by ${d.pressureShiftC} °C to standard pressure. A boiling point quoted without its pressure is incomplete.`
        : 'The determination was made at standard pressure, so no correction was needed.'} ${d.pure
        ? ''
        : `<b>This sample raised the boiling point by about ${d.elevationC} °C.</b> A non-volatile solute lowers the vapour pressure of the liquid, so a higher temperature is needed to reach atmospheric — elevation, the opposite of what an impurity does to a melting point.`} ${d.superheated
        ? `<b>Without a boiling chip the liquid superheated by about ${d.superheatC} °C before boiling.</b>`
        : ''} ${d.pressureCheck
        ? `Pressures compared: ${d.pressureCheck.map((p) => `${p.pressureMmHg} mm Hg → ${p.boilingPoint} °C`).join(' · ')} — lower pressure, lower boiling point, which is the principle of vacuum distillation.`
        : 'Repeat at a different pressure: the fall in boiling point with pressure is the striking result of this experiment.'}</div>`;
  } else if (m === 'crystallisation') {
    html = `<b>Mean of ${d.n} crystallisations</b> &nbsp;·&nbsp; ${esc(d.compound)}, ${esc(d.crystalSize)} ${esc(d.crystalHabit)} crystals
      <span class="big">${d.crystalMass} g recovered (${d.recovery} %)</span>
      Product melts at ${d.meltingPoint} °C &nbsp;·&nbsp; accepted ${d.acceptedMeltingPoint} °C &nbsp;·&nbsp; ${d.impurityRemovedPct} % of the impurity removed
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.purified
        ? 'The product melts close to the accepted value, so the impurity has been left behind in the mother liquor — the recrystallisation succeeded.'
        : `<b>The product melts ${d.meltingPointDeficit} °C low, so about ${d.productImpurityPct} % impurity remains.</b> Crystals grown quickly trap mother liquor between them and carry the impurity down with the product.`} About ${d.lostToMotherLiquorG} g stays dissolved in the cold liquor and is discarded, which is why the minimum volume of solvent is used — here ${d.minimumSolventMl} mL against the ${d.usedSolventMl} mL taken. ${d.coolingCheck
        ? `Cooling compared: ${d.coolingCheck.map((x) => `${esc(x.name)} → ${x.mass} g melting at ${x.meltingPoint} °C`).join(' · ')}. Yield and purity pull against each other.`
        : 'Try a different rate of cooling and compare: crash-cooling raises the yield but lowers the purity, and that trade-off is the real lesson here.'}${d.solventCheck
        ? ` Solvent volumes: ${d.solventCheck.map((x) => `${x.solventMl} mL → ${x.recovery} %`).join(' · ')}.`
        : ''}</div>`;

  /* ── Class XI Physics Section B activities ── */
  } else if (m === 'wax-cooling') {
    html = `<b>${d.n} readings on ${esc(d.wax)}</b> &nbsp;·&nbsp; room at ${d.roomTempC} °C
      <span class="big">${d.hasPlateau ? `Melting point = ${d.meltingPoint} °C` : 'No plateau found'}</span>
      ${d.hasPlateau ? `Plateau lasted ${d.plateauDurationS} s over ${d.plateauPoints} readings &nbsp;·&nbsp; accepted ${d.accepted} °C &nbsp;·&nbsp; error ${d.percentError} %` : 'Keep recording through the change of state.'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.hasPlateau
        ? `The temperature held steady while the wax froze, because the latent heat given out replaced the heat lost to the room. Cooling constants: ${d.kLiquid ?? '—'} s⁻¹ as a liquid and ${d.kSolid ?? '—'} s⁻¹ as a solid. ${d.solidCoolsFaster
          ? 'The solid branch is steeper, as expected: solid wax has the lower specific heat capacity, so the same heat loss produces a larger fall in temperature.'
          : '<b>The solid branch should be the steeper of the two — check the later readings.</b>'}`
        : 'A cooling curve without a plateau means the wax never changed state during the run. Check that it started well above its melting point and that the room is cooler than that.'}${d.stirred ? '' : ' <b>The wax was not stirred, so the plateau is ragged and its ends are hard to locate.</b>'}</div>`;
  } else if (m === 'bimetallic-strip') {
    html = `<b>${d.n} readings on a ${esc(d.pair)} strip</b> &nbsp;·&nbsp; L = ${d.lengthMm} mm, t = ${d.thicknessMm} mm
      <span class="big">Δα = ${d.alphaDifferenceText}</span>
      Slope ${d.slope} mm/°C &nbsp;·&nbsp; accepted ${d.acceptedText} &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; r² = ${d.r2 ?? '—'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The strip bends with the <b>${esc(d.outerMetal || 'more expansive metal')}</b> on the outside, because the outside of a curve is the longer path. Note that this experiment can only ever give the DIFFERENCE of the two expansivities — any pair with the same difference bends identically, so neither metal's own value can be recovered from it. ${d.lengthCheck
        ? `Across ${d.lengthsCompared} lengths: ${d.lengthCheck.map((l) => `${l.lengthMm} mm → ${l.perDegree} mm/°C`).join(' · ')} — the deflection grows as the SQUARE of the length.`
        : 'Change the length and record again: the deflection varies as L², which is a striking check and the reason thermostat strips are made long.'}</div>`;
  } else if (m === 'liquid-expansion') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.liquid)} in a ${esc(d.vessel).toLowerCase()}, ${d.stemBoreMm} mm stem
      <span class="big">γ = ${d.gammaReportedText}</span>
      Apparent ${d.gammaApparentText} &nbsp;·&nbsp; vessel ${d.gammaVesselText} &nbsp;·&nbsp; accepted ${d.acceptedText} &nbsp;·&nbsp; error ${d.percentError} %
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">What the stem shows is the APPARENT expansion, which is the real expansion less that of the flask. ${d.correctedForVessel
        ? `The expansivity of the vessel has been added back, and it accounts for ${d.vesselShare} % of the result — far from negligible.`
        : `<b>The vessel correction has NOT been applied, so this value is too small by about ${d.vesselShare} %. It is a systematic error: repeating the run will not reduce it.</b>`} The level dips at the start because the thin glass reaches temperature in seconds while the bulk liquid behind it takes minutes.</div>`;
  } else if (m === 'detergent-surface-tension') {
    html = `<b>${d.n} solutions measured</b>${d.tubesCompared > 1 ? ` across ${d.tubesCompared} tubes` : ''}
      <span class="big">T = ${d.surfaceTensionPure} mN/m for pure water</span>
      Falls to ${d.surfaceTensionLowest} mN/m at ${d.lowestAtConcentration} g/L &nbsp;·&nbsp; a drop of ${d.drop} mN/m (${d.dropPercent} %) &nbsp;·&nbsp; accepted ${d.accepted} mN/m
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Detergent molecules collect at the surface with their water-hating tails pointing out of it, which makes new surface much cheaper in energy — and that is what a lower surface tension means. ${d.plateauSeen
        ? `Beyond about ${d.cmc} g/L the curve flattens: the surface is saturated and extra detergent forms micelles in the bulk instead. That elbow is the critical micelle concentration.`
        : `Take readings above ${d.cmc} g/L as well — the curve should flatten there, because the surface saturates and further detergent has nowhere to go.`}${d.tubeCheck
        ? ` Tubes compared: ${d.tubeCheck.map((t) => `r = ${t.radiusMm} mm → ${t.meanT} mN/m`).join(' · ')}; different rises but the same tension is the check that the method works.`
        : ''}${d.greasyUsed ? ' <b>A greasy tube was used: it raises the angle of contact and lowers the rise for reasons that have nothing to do with surface tension.</b>' : ''}</div>`;
  } else if (m === 'cooling-factors') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${d.volumeCm3} cm³ of ${esc(d.liquid).toLowerCase()} in a ${esc(d.surface).toLowerCase()} vessel
      <span class="big">k = ${d.coolingConstant} s⁻¹</span>
      Half-life ${d.halfLifeMin} min &nbsp;·&nbsp; accepted ${d.accepted} s⁻¹ &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; r² = ${d.r2}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The straight logarithmic plot verifies Newton's law. The constant is the heat transfer coefficient times the area, divided by the mass and specific heat capacity, so it depends on area, thermal capacity and the emissive quality of the surface — exposed area ${d.surfaceAreaCm2} cm², giving an area-to-volume ratio of ${d.areaPerVolume} per cm.${d.surfaceCheck ? ` Surfaces compared: ${d.surfaceCheck.map((x) => `${esc(x.name)} → ${x.k}`).join(' · ')}.` : ''}${d.volumeCheck ? ` Volumes compared: ${d.volumeCheck.map((x) => `${x.name} cm³ → ${x.k}`).join(' · ')} — a larger vessel has less surface per unit of contents, so it cools more slowly.` : ''}${d.factorsVaried === 0 ? ' Change ONE factor and record again: the whole point of this activity is to find out what k depends on.' : ''}${d.covered ? ' The vessel was covered, which reduces both the exposed area and the evaporation.' : ''}</div>`;
  } else if (m === 'scale-depression') {
    html = `<b>${d.n} loads on a ${esc(d.scale).toLowerCase()}</b> &nbsp;·&nbsp; ${esc(d.arrangement).toLowerCase()}
      <span class="big">Y = ${d.youngsText}</span>
      Slope ${d.slope} mm/N &nbsp;·&nbsp; accepted ${d.acceptedYoungsText} &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; r² = ${d.r2 ?? '—'}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.ratio !== null
        ? `Cantilever against centrally supported: the slopes are ${d.arrangementCheck.map((a) => a.slope).join(' and ')}, a ratio of <b>${d.ratio}</b> against the predicted ${d.expectedRatio}. ${d.ratioAgrees ? 'That factor of sixteen comes from the 3 and the 48 in the two formulae, and it is why shelves are supported at both ends and diving boards are not.' : '<b>That is well away from sixteen — check that the span and the scale were the same in both arrangements.</b>'}`
        : 'Take readings in BOTH arrangements. A beam supported at both ends and loaded centrally is sixteen times stiffer than the same beam cantilevered, and comparing them is the point of the activity.'}${d.spanCheck ? ` Spans compared: ${d.spanCheck.map((sp) => `${sp.spanCm} cm → ${sp.perNewton} mm/N`).join(' · ')}; the depression varies as the CUBE of the span.` : ''}</div>`;
  } else if (m === 'bernoulli-pressure') {
    html = `<b>${d.n} flow rates through the ${esc(d.throat)} throat</b> &nbsp;·&nbsp; wide section ${d.wideAreaCm2} cm²
      <span class="big">ρ = ${d.densityFromSlope} kg/m³ from the slope</span>
      Accepted ${d.acceptedDensity} kg/m³ &nbsp;·&nbsp; error ${d.percentError} % &nbsp;·&nbsp; r² = ${d.r2} against Q²
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">The limb at the throat stands lower than the one in the wide section: where the flow is fast the pressure is low, which is the opposite of what most people expect. Velocities reached ${d.maxThroatVelocity} m/s at the throat against ${d.maxWideVelocity} m/s in the wide bore. ${d.squareLawBetter
        ? `Plotting against the SQUARE of the flow rate fits better (r² = ${d.r2}) than against the flow rate itself (r² = ${d.r2Linear}), confirming the square law.`
        : '<b>The square law does not fit better than a straight line here — take readings over a wider range of flow rates.</b>'} ${d.streamline
        ? `The Reynolds number stayed below ${d.maxReynolds}, so the flow was streamline throughout and Bernoulli's theorem applies.`
        : `<b>The Reynolds number reached ${d.maxReynolds}, so the flow was turbulent. Energy is dissipated in eddies and the simple analysis no longer holds.</b>`}</div>`;
  } else if (m === 'pendulum-damping') {
    html = `<b>${d.n} amplitude readings over ${d.elapsedS} s</b> &nbsp;·&nbsp; ${esc(d.bob)} in ${esc(d.medium).toLowerCase()}
      <span class="big">b = ${d.dampingConstant} s⁻¹</span>
      Half-life of the energy ${d.halfLifeS ?? '—'} s (${d.halfLifeMin ?? '—'} min) &nbsp;·&nbsp; accepted b = ${d.accepted} s⁻¹ &nbsp;·&nbsp; r² = ${d.r2}
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">Amplitude fell from ${d.initialAmplitude} cm to ${d.finalAmplitude} cm, so the energy — proportional to A² — dropped by ${d.energyLostPercent} %. The A² against t curve is an exponential, not a straight line; b comes from the slope of ln(A²) against t, which is −2b. Because the decay is exponential the half-life is the same wherever it is measured. Period T = ${d.period} s, essentially unchanged as the swing dies away, which is why readings can be taken at regular intervals.</div>`;
  } else if (m === 'equilibrium-shift') {
    html = `<b>${d.n} readings</b> &nbsp;·&nbsp; ${esc(d.equationFull || d.systemLabel)}
      <span class="big">${d.bothDirectionsShown ? 'Both directions demonstrated' : 'Only one direction shown so far'}</span>
      Colour-shift index ranged ${d.minShift} – ${d.maxShift} (0 = pure reactant colour, 1 = pure product colour)
      <div style="font-size:12px;margin-top:4px;color:var(--muted)">${d.bothDirectionsShown
        ? 'The readings cover a shift towards products AND a shift towards reactants, so both directions of Le Chatelier\'s principle have been demonstrated on this equilibrium.'
        : '<b>Record at least one reagent/temperature that shifts the equilibrium the OTHER way</b> — so far every reading moved it in the same direction, which only shows half of Le Chatelier\'s principle.'} ${esc(d.enthalpyNote || '')}</div>`;
  }

  /*
   * Safety net. This if/else chain has now gone stale three times as new
   * models landed, and every time the symptom was a SILENTLY BLANK result
   * panel rather than an error. If no branch matched, build a generic panel
   * from the experiment's own declared resultKeys — which every experiment
   * JSON must provide anyway — and log loudly so it is caught in development.
   */
  if (!html) {
    console.warn(`renderResult: no branch for model "${m}" — using the generic resultKeys panel.`);
    const keys = exp.calculations?.resultKeys || [];
    const shown = keys.filter((k) => d[k] !== undefined && d[k] !== null);
    if (shown.length) {
      const primary = shown[0];
      const unit = exp.expectedResult?.unit || '';
      html = `<b>Result</b>
        <span class="big">${esc(exp.expectedResult?.symbol || primary)} = ${d[primary]} ${esc(unit)}</span>
        ${shown.slice(1).map((k) => `${esc(k)} = <b>${d[k]}</b>`).join(' &nbsp;·&nbsp; ')}`;
    } else {
      html = '<b>Result calculated.</b> See the observation table and graph.';
    }
  }

  if (check) {
    const tone = check.within ? 'good' : Math.abs(check.errPct) < 12 ? 'warn' : 'bad';
    box.className = `result-box ${tone === 'bad' ? 'warn' : tone}`;
    html += `<div style="margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.1);font-size:12.5px">
      ${check.within
        ? `✓ Within the accepted range (expected ${check.expected} ${esc(check.unit)}).`
        : `Your value differs from the accepted ${check.expected} ${esc(check.unit)} by ${check.errPct.toFixed(1)}%. ${esc(retryHint(exp.simulation.model))}`}
      </div>`;
  } else box.className = 'result-box';

  box.innerHTML = html;
}

/** Experiment-appropriate advice when a result falls outside tolerance. */
function retryHint(model) {
  return {
    'simple-pendulum': 'Check the amplitude is under 15°, time 20 oscillations, and see whether your points lie on a straight line through the origin.',
    'helical-spring': 'Check that every load stayed within the elastic limit and that you noted the zero-load reading.',
    'resistivity': 'Check the ammeter is in series and the voltmeter in parallel, and take readings quickly so the wire does not heat.',
    'convex-lens': 'Check that the image was sharply focused and that object, lens and screen are aligned on one axis.',
    'titration': 'Check you used the correct indicator, stopped at the FIRST permanent colour change, and averaged only concordant titres.',
    'reaction-kinetics': 'Check the total volume was constant in every run and that the same observer judged the cross each time.',
  }[model] || 'Check your readings and repeat the experiment.';
}

function exportCSV() {
  const exp = app.exp;
  const cols = exp.observationModel.columns;
  const lines = [];
  lines.push(`CBSE V-LAB 2026-27,${exp.id}`);
  lines.push(`Experiment,"${exp.title}"`);
  lines.push(`Class,${exp.class},Section,${exp.curriculumMapping.section},Serial,${exp.curriculumMapping.serial}`);
  lines.push(`Chapter,"${exp.curriculumMapping.chapter}"`);
  lines.push(`Date,${new Date().toLocaleString()}`);
  lines.push('');
  lines.push(['#', ...cols.map((c) => `${c.label} (${c.unit})`)].join(','));
  app.rows.forEach((r, i) => {
    lines.push([i + 1, ...cols.map((c) => (r[c.key] ?? ''))].join(','));
  });
  download(`${exp.id}-observations.csv`, lines.join('\n'));
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ── tabs ── */
function buildTabs() {
  const tabs = [
    ['procedure', 'Procedure'],
    ['theory', 'Theory'],
    ['apparatus', 'Apparatus'],
    ['safety', 'Safety & errors'],
    ['notebook', 'Notebook'],
    ['viva', 'Viva'],
    ['assess', 'Assessment'],
    ['curriculum', 'Curriculum'],
  ];
  $('#tabs').innerHTML = tabs.map(([k, l]) =>
    `<button role="tab" data-tab="${k}" aria-selected="${String(app.tab === k)}">${esc(l)}</button>`).join('');
  $$('#tabs button').forEach((b) => {
    b.onclick = () => { app.tab = b.dataset.tab; buildTabs(); };
  });
  renderTab();
}

function renderTab() {
  const e = app.exp;
  const body = $('#tabbody');
  const t = app.tab;

  if (t === 'procedure') {
    body.innerHTML = `<h5>Aim</h5><ul>${e.objective.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      <h5>Procedure</h5><ol>${e.procedure.map((p) =>
        `<li>${esc(p.text)}${p.checkpoint ? ' <span class="pill" style="font-size:9px">checkpoint</span>' : ''}</li>`).join('')}</ol>`;
  } else if (t === 'theory') {
    body.innerHTML = `<p>${esc(e.theory.statement)}</p>
      ${e.theory.keyEquations.map((q) => `<span class="eq">${esc(q)}</span>`).join('')}
      <p>${esc(e.theory.derivationNote)}</p>
      <div class="note"><b>Model assumptions:</b> ${e.scientificValidation.assumptions.map(esc).join('; ')}.</div>
      <div class="note"><b>Valid range:</b> ${esc(e.scientificValidation.validRange)}</div>`;
  } else if (t === 'apparatus') {
    body.innerHTML = `<div class="appa">${e.apparatus.map((a) =>
      `<div class="appa-item"><b>${esc(a.name)}</b><span>${esc(a.spec)}</span><em>${esc(a.why)}</em></div>`).join('')}</div>`;
  } else if (t === 'safety') {
    body.innerHTML = `<h5>Safety</h5><ul class="safety">${e.safety.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <h5>Sources of error</h5><ul>${e.sourcesOfError.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  } else if (t === 'notebook') {
    renderNotebook(body);
  } else if (t === 'viva') {
    renderViva(body);
  } else if (t === 'assess') {
    renderAssessment(body);
  } else if (t === 'curriculum') {
    const cm = e.curriculumMapping;
    body.innerHTML = `<h5>Curriculum mapping</h5>
      <div class="appa">
        ${row('Board / Year', `${cm.board} ${cm.curriculumYear}`)}
        ${row('Class / Subject', `Class ${cm.class} · ${cm.subject} (${cm.subjectCode})`)}
        ${row('Unit', cm.unit)}${row('Chapter', cm.chapter)}
        ${row('Topic', cm.topic)}
        ${row('Official practical', `Section ${cm.section}, Experiment ${cm.serial} — "${cm.practical}"`)}
        ${row('Verification', cm.verificationStatus === 'verified' ? 'Verified against the official CBSE PDF' : 'Needs review')}
        ${row('Source', cm.sourceReference)}
      </div>
      <h5>Learning objectives</h5><ul>${cm.learningObjectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      <h5>Competencies</h5><ul>${cm.competencies.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      <h5>Scientific validation</h5>
      <span class="eq">${esc(e.scientificValidation.formula)}</span>
      <p style="font-size:12.5px;color:var(--dim)">Edge cases tested: ${e.scientificValidation.edgeCases.map(esc).join('; ')}. Automated tests: <code>${esc(e.scientificValidation.testFile)}</code>.</p>`;
  }
}
const row = (k, v) => `<div class="appa-item"><b>${esc(k)}</b><em>${esc(v)}</em></div>`;

/* ── notebook ── */
async function renderNotebook(body) {
  const saved = (await DB.loadNotebook(app.exp.id)) || {};
  body.innerHTML = `
    <p style="color:var(--dim);font-size:12.5px">Your notebook is stored on this device only. It is saved automatically.</p>
    ${nbField('observation', 'What did you observe?', saved.observation, 'Describe what happened as you changed the variable.')}
    ${nbField('calculation', 'Your calculation', saved.calculation, 'Show the substitution into the formula, with units.')}
    ${nbField('result', 'Result', saved.result, 'State the value you obtained, with its unit.')}
    ${nbField('conclusion', 'Conclusion', saved.conclusion, 'What does the shape of your graph prove?')}
    ${nbField('errors', 'Sources of error in YOUR readings', saved.errors, 'Which of the listed errors affected you most?')}
  `;
  body.querySelectorAll('textarea').forEach((ta) => {
    ta.oninput = debounce(async () => {
      const note = {};
      body.querySelectorAll('textarea').forEach((x) => { note[x.dataset.k] = x.value; });
      await DB.saveNotebook(app.exp.id, note);
    }, 400);
  });
}
const nbField = (k, label, val, hint) => `<div class="nb-field">
  <label for="nb_${k}">${esc(label)}</label>
  <textarea id="nb_${k}" data-k="${k}" rows="3" placeholder="${esc(hint)}">${esc(val || '')}</textarea>
</div>`;

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── viva ── */
function renderViva(body) {
  body.innerHTML = `<p style="color:var(--dim);font-size:12.5px">Answer aloud first, then reveal the expected concept and rate yourself honestly. This runs entirely offline — no AI marking.</p>
    ${app.exp.viva.map((q, i) => `<details class="qa" data-i="${i}">
      <summary>${esc(q.question)}</summary>
      <div class="ans"><b>Expected concept:</b> ${esc(q.expectedConcept)}
        <div class="misc"><b>Common mistake:</b> ${esc(q.commonMisconception)}</div>
        <div class="qmeta">
          <span class="pill">${esc(q.difficulty)}</span><span class="pill">${esc(q.bloom)}</span>
        </div>
        <div class="opts" style="margin-top:9px;grid-template-columns:repeat(3,1fr);display:grid">
          <button class="opt" data-rate="confident" data-i="${i}">I knew it</button>
          <button class="opt" data-rate="partial" data-i="${i}">Partly</button>
          <button class="opt" data-rate="no" data-i="${i}">Not yet</button>
        </div>
      </div>
    </details>`).join('')}
    <div class="score" style="margin-top:12px"><div><div class="big" id="vivaPct">0%</div><span style="font-size:11.5px;color:var(--dim)">viva self-assessment</span></div>
    <div style="flex:1"><div class="bar"><i id="vivaBar" style="width:0%"></i></div></div></div>`;

  body.querySelectorAll('button[data-rate]').forEach((b) => {
    b.onclick = () => {
      const i = Number(b.dataset.i);
      app.vivaAttempts = app.vivaAttempts.filter((a) => a.i !== i);
      app.vivaAttempts.push({ i, selfRating: b.dataset.rate });
      b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const pct = Math.round((vivaScore(app.vivaAttempts) * app.vivaAttempts.length) / app.exp.viva.length);
      $('#vivaPct').textContent = `${pct}%`;
      $('#vivaBar').style.width = `${pct}%`;
      DB.put('vivaAttempts', app.exp.id, app.vivaAttempts);
    };
  });
}

/* ── assessment ── */
function renderAssessment(body) {
  const a = app.exp.assessment;
  const sec = (title, list, kind) => `<h5>${esc(title)}</h5>${list.map((q) => qHTML(q, kind)).join('')}`;
  body.innerHTML = `
    ${sec('Pre-lab', a.preLab, 'pre')}
    <h5>During the lab</h5><div id="duringBox"></div>
    ${sec('Post-lab', a.postLab, 'post')}
    <button class="btn primary" id="submitAssess" style="margin-top:12px">Submit assessment</button>
    <div id="scoreBox" style="margin-top:12px"></div>`;

  renderDuring();
  body.querySelectorAll('.opt[data-q]').forEach((b) => {
    b.onclick = () => {
      const q = b.dataset.q;
      app.answers[q] = Number(b.dataset.i);
      b.parentElement.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    };
  });
  body.querySelectorAll('input[data-q]').forEach((inp) => {
    inp.oninput = () => { app.answers[inp.dataset.q] = inp.value; };
  });
  $('#submitAssess').onclick = submitAssessment;
}

function qHTML(q, kind) {
  if (q.type === 'mcq') {
    return `<div class="q"><p>${esc(q.question)}</p><div class="opts">${
      q.options.map((o, i) => `<button class="opt" data-q="${esc(q.id)}" data-i="${i}" aria-pressed="false">${esc(o)}</button>`).join('')
    }</div><div class="qfb" id="fb_${esc(q.id)}" hidden></div></div>`;
  }
  return `<div class="q"><p>${esc(q.question)}</p>
    <input type="number" step="any" data-q="${esc(q.id)}" placeholder="Enter your value" aria-label="${esc(q.question)}" />
    <div class="qfb" id="fb_${esc(q.id)}" hidden></div></div>`;
}

/** Live session facts the during-lab checks are graded against. */
function labSession() {
  const analyteType = app.inputs.analyte === 'hcl' ? 'strong-acid' : 'strong-base';
  const okInd = (analyteType === 'strong-base' && app.inputs.indicator === 'phenolphthalein')
    || (analyteType === 'strong-acid' && app.inputs.indicator === 'methylOrange');
  return {
    rows: app.rows,
    wiringCorrect: app.inputs.ammeterMode === 'series' && app.inputs.voltmeterMode === 'parallel',
    correctIndicator: okInd,
  };
}

function renderDuring() {
  const results = gradeDuringLab(app.exp.assessment.duringLab, labSession());
  $('#duringBox').innerHTML = results.map((r) =>
    `<div class="q" style="display:flex;gap:10px;align-items:center">
      <span style="color:${r.correct ? 'var(--good)' : 'var(--dim)'};font-size:16px">${r.correct ? '✓' : '○'}</span>
      <p style="margin:0;flex:1">${esc(r.question)}</p>
    </div>`).join('');
}

function submitAssessment() {
  const a = app.exp.assessment;
  const grade = (list) => list.map((q) =>
    q.type === 'mcq' ? gradeMcq(q, app.answers[q.id]) : gradeNumeric(q, app.answers[q.id]));
  const pre = grade(a.preLab);
  const post = grade(a.postLab);
  const during = gradeDuringLab(a.duringLab, labSession());

  for (const r of [...pre, ...post]) {
    const fb = document.getElementById(`fb_${r.id}`);
    if (fb) { fb.hidden = false; fb.textContent = r.feedback; fb.className = `qfb${r.correct ? ' ok' : ''}`; }
    const q = [...a.preLab, ...a.postLab].find((x) => x.id === r.id);
    if (q?.type === 'mcq') {
      document.querySelectorAll(`.opt[data-q="${r.id}"]`).forEach((b, i) => {
        b.classList.toggle('correct', i === q.answer);
        b.classList.toggle('wrong', i === r.chosen && i !== q.answer);
      });
    }
  }

  app.machine.to(STATES.ASSESSMENT);
  const vivaPercent = app.vivaAttempts.length
    ? Math.round((vivaScore(app.vivaAttempts) * app.vivaAttempts.length) / app.exp.viva.length) : 0;
  const score = overallScore(app.exp, { preLab: pre, duringLab: during, postLab: post, vivaPercent });
  const band = masteryBand(score.total);

  $('#scoreBox').innerHTML = `<div class="score">
    <div><div class="big" style="color:var(--${band.tone})">${score.total}</div><span style="font-size:11.5px;color:var(--dim)">out of 100</span></div>
    <div style="flex:1">
      <b>${esc(band.band)}</b>
      <div class="bar"><i style="width:${score.total}%"></i></div>
      <div class="breakdown">
        ${Object.entries(score.parts).map(([k, v]) =>
          `<div class="brk"><span>${esc(k)} (${score.weights[k]}%)</span><b>${Math.round(v)}%</b></div>`).join('')}
      </div>
    </div></div>`;

  DB.saveAssessment(app.exp.id, { score: score.total, parts: score.parts, at: Date.now() });
  DB.saveProgress(app.exp.id, { score: score.total, completed: score.total >= 45, band: band.band });
  if (score.total >= 45) app.machine.to(STATES.COMPLETED);
  toast(`Assessment submitted — ${score.total}/100 (${band.band})`, score.total >= 65 ? 'good' : 'bad');
}

/* ── state track ── */
function renderStateTrack() {
  if (!app.machine) return;
  const order = ['READY', 'RUNNING', 'MEASURING', 'OBSERVATION', 'CALCULATION', 'RESULT', 'ASSESSMENT', 'COMPLETED'];
  const cur = order.indexOf(app.machine.state);
  $('#stateTrack').innerHTML = order.map((s, i) =>
    `<span class="state-dot ${i === cur ? 'now' : i < cur ? 'done' : ''}">${esc(STATE_LABELS[s])}</span>`).join('');
}

/* ── teacher ── */
async function showTeacher() {
  show('#viewTeacher');
  const progress = await DB.allProgress();
  const done = progress.filter((p) => p.completed).length;
  const avg = progress.filter((p) => Number.isFinite(p.score));
  const mean = avg.length ? Math.round(avg.reduce((s, p) => s + p.score, 0) / avg.length) : 0;

  $('#tStats').innerHTML = [
    [app.experiments.length, 'Simulations available'],
    [progress.length, 'Attempted'],
    [done, 'Completed'],
    [`${mean}`, 'Mean score'],
  ].map(([b, s]) => `<div class="metric"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');

  $('#tRows').innerHTML = app.experiments.map((e) => {
    const p = progress.find((x) => x.expId === e.id);
    return `<div class="trow">
      <div><b>${esc(e.title)}</b><span>Class ${esc(e.class)} · Sec ${esc(e.curriculumMapping.section)}·${e.curriculumMapping.serial} · ${esc(e.id)}</span></div>
      <div style="font-size:12.5px;color:var(--muted)">${p ? `${p.rows || 0} readings` : 'not started'}</div>
      <div style="font-size:13px;font-weight:600;color:${p?.score >= 65 ? 'var(--good)' : p?.score ? 'var(--warn)' : 'var(--dim)'}">${p?.score ?? '—'}</div>
    </div>`;
  }).join('');

  $('#tExport').onclick = async () => {
    const lines = ['Experiment,Class,Reading,Data'];
    for (const e of app.experiments) {
      const rows = await DB.loadObservations(e.id);
      rows.forEach((r, i) => lines.push(`"${e.title}",${e.class},${i + 1},"${JSON.stringify(r).replace(/"/g, "'")}"`));
    }
    download('vlab-all-observations.csv', lines.join('\n'));
  };
  $('#tReset').onclick = async () => {
    if (!confirm('Erase all local progress, notebooks and observations on this device?')) return;
    for (const e of app.experiments) {
      await DB.saveObservations(e.id, []);
      await DB.del('experimentProgress', e.id);
      await DB.del('assessmentResults', e.id);
    }
    toast('Local progress cleared');
    showTeacher();
  };
}

/* ── misc ── */
let toastT;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferred;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    const b = $('#installBtn');
    b.hidden = false;
    b.onclick = async () => { b.hidden = true; deferred.prompt(); deferred = null; };
  });
}

boot();
