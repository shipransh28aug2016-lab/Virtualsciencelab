/**
 * lint.mjs — the static check for this package.
 *
 * There is no ESLint config in this repository, and adding a style regime
 * nobody asked for would be noise. What this does instead is the two things a
 * static check can do honestly here:
 *
 *   1. PARSE every source file with esbuild — the same parser the build uses,
 *      reached through vite's public API so it is not a transitive-dependency
 *      accident. A syntax error is found in a fraction of a second instead of
 *      after a ten-second build or a failed render probe.
 *
 *   2. ENFORCE the few rules that are not style but have each already cost a
 *      debugging session. Each one carries the reason it exists.
 *
 * Exit status is non-zero on any finding, so `npm test` and a startup hook can
 * rely on it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'tools')),
  ...readdirSync(ROOT).filter((n) => /\.mjs$|^vite\.config\.js$/.test(n)).map((n) => join(ROOT, n)),
];

/** Strip comments before the pattern rules run, so a rule cannot fire on the
 *  prose that explains it. Crude on purpose: it only has to be good enough for
 *  regexes, never for parsing — esbuild does the parsing. */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`])\/\/.*$/gm, (m, lead) => lead);

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/* ── Project rules ──────────────────────────────────────────────────────────── */
const RULES = [
  {
    id: 'fresh-object-selector',
    appliesTo: () => true,
    patterns: [
      /\buse[A-Z]\w*(?:Engine|Store)\(\s*\(?\s*\w+\s*\)?\s*=>\s*\(\s*\{/g,
      /export const select\w+\s*=\s*\(\s*\w+\s*\)\s*=>\s*\(\s*\{/g,
    ],
    why: 'A zustand selector that returns an object literal builds a new reference on every call. '
      + 'zustand reads through useSyncExternalStore, which compares snapshots by identity, so React '
      + 'concludes the store changed during rendering and loops until it aborts with error #185 — '
      + 'and the bench renders nothing at all. Select one primitive per call.',
  },
  {
    id: 'animate-presence-wait',
    appliesTo: () => true,
    patterns: [/<AnimatePresence\b[^>]*\bmode=["']wait["']/g],
    why: 'mode="wait" keeps the OLD element mounted until its exit animation finishes, and framer-motion '
      + 'drives that off requestAnimationFrame — which on a slow machine is already being spent on the '
      + 'scene. The interface then shows a stale statement about the experiment. Key the element and '
      + 'let it be replaced outright.',
  },
  {
    id: 'impure-engine',
    /* Engines are the science. They must run from plain Node so they can be held
       to the data book without a browser, which means no React, no three, no
       store, and no hidden inputs. The store files (use*.js) are the one place
       state may live. */
    appliesTo: (file) => /\/engine\/(?!use)[^/]+\.js$/.test(file),
    patterns: [
      /from\s+['"](?:react|react-dom|three|zustand|framer-motion|@react-three\/[^'"]+)['"]/g,
      /\bMath\.random\s*\(/g,
      /\bDate\.now\s*\(/g,
      /\bperformance\.now\s*\(/g,
    ],
    why: 'An engine that imports a renderer or reads the clock or a random number cannot be verified '
      + 'against measured data from plain Node, and its result then depends on something other than '
      + 'its inputs. Pass randomness and time in; keep the engine pure.',
  },
];

let failures = 0;
const report = (file, line, id, message) => {
  failures += 1;
  console.error(`${relative(ROOT, file)}:${line}  ${id}  ${message}`);
};

for (const file of files) {
  const raw = readFileSync(file, 'utf8');

  /* 1 · does it parse? */
  try {
    await transformWithEsbuild(raw, file, {
      loader: extname(file) === '.jsx' ? 'jsx' : 'js',
      jsx: 'automatic',
    });
  } catch (e) {
    const loc = e.errors?.[0]?.location;
    report(file, loc?.line ?? 1, 'syntax', (e.errors?.[0]?.text ?? e.message).split('\n')[0]);
    continue;                                  // a file that does not parse cannot be pattern-checked
  }

  /* 2 · does it obey the project rules? */
  const text = stripComments(raw);
  for (const rule of RULES) {
    if (!rule.appliesTo(file)) continue;
    for (const re of rule.patterns) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        report(file, lineOf(text, m.index), rule.id, `${m[0].trim().slice(0, 70)}\n      ${rule.why}`);
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} problem${failures === 1 ? '' : 's'} in ${files.length} files.`);
  process.exit(1);
}
console.log(`lint: ${files.length} files parse, ${RULES.length} project rules clean (${basename(ROOT)})`);
