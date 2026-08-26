#!/usr/bin/env node
/**
 * Scans data/experiments/class-xi and class-xii for experiment JSON files
 * and writes data/experiments/index.json — a small catalogue the home
 * screen fetches on boot, so it never has to download and parse the full
 * (much larger) experiment JSON for every card just to render the list.
 *
 * Run after adding, removing or renaming an experiment:
 *   npm run build:index
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [
  ['data/experiments/class-xi', 'XI'],
  ['data/experiments/class-xii', 'XII'],
];

const experiments = [];

for (const [rel, cls] of dirs) {
  const abs = join(root, rel);
  const files = (await readdir(abs)).filter((f) => f.endsWith('.json')).sort();
  for (const file of files) {
    const raw = await readFile(join(abs, file), 'utf8');
    let exp;
    try {
      exp = JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON in ${rel}/${file}: ${e.message}`);
    }
    const cm = exp.curriculumMapping || {};
    const kind = exp.id.includes('-ACT-') ? 'activity' : 'experiment';
    experiments.push({
      id: exp.id,
      file: `${rel}/${file}`,
      class: exp.class || cls,
      subject: exp.subject,
      contentStatus: exp.contentStatus || 'published',
      title: exp.title,
      shortTitle: exp.shortTitle,
      objective0: Array.isArray(exp.objective) ? exp.objective[0] : exp.objective,
      curriculumMapping: {
        section: cm.section,
        serial: cm.serial,
        kind,
        unit: cm.unit,
        chapter: cm.chapter,
      },
      vivaCount: Array.isArray(exp.viva) ? exp.viva.length : 0,
      procedureCount: Array.isArray(exp.procedure) ? exp.procedure.length : 0,
    });
  }
}

experiments.sort((a, b) => a.id.localeCompare(b.id));

const index = {
  generatedBy: 'tools/build-index.mjs',
  count: experiments.length,
  experiments,
};

const outPath = join(root, 'data/experiments/index.json');
await writeFile(outPath, `${JSON.stringify(index, null, 1)}\n`);
console.log(`Wrote ${outPath} (${experiments.length} experiments)`);
