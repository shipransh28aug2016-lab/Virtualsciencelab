#!/usr/bin/env node
/**
 * Run the model contract against every published experiment, not once per model.
 *
 * A model can be reused by several labs whose JSON defaults differ. Auditing only
 * the first experiment using a model can therefore hide broken lab-specific
 * inputs. This audit deliberately exercises each published JSON independently.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.VLAB_ROOT || process.cwd();
const index = JSON.parse(await readFile(join(root, 'data/experiments/index.json'), 'utf8'));
const published = index.experiments.filter((entry) => entry.contentStatus === 'published');
const runFlags = {
  flying: true,
  released: true,
  rolling: true,
  heating: true,
  running: true,
  flowing: true,
  flowRate: 1,
  started: true,
};

const failures = [];
let checked = 0;

for (const entry of published) {
  checked += 1;
  const label = `${entry.id} (${entry.file})`;
  try {
    const experiment = JSON.parse(await readFile(join(root, entry.file), 'utf8'));
    const modelName = experiment.simulation?.model;
    assert.ok(modelName, 'missing simulation.model');

    const model = await import(pathToFileURL(join(root, 'src/simulation/models', `${modelName}.js`)));
    const inputs = { ...(model.defaults || {}) };
    for (const variable of experiment.variables || []) {
      if (variable.type !== 'dependent' && variable.default !== undefined && variable.default !== null) {
        inputs[variable.id] = variable.default;
      }
    }

    assert.equal(typeof model.init, 'function', 'model.init is not a function');
    assert.equal(typeof model.step, 'function', 'model.step is not a function');
    assert.equal(typeof model.measure, 'function', 'model.measure is not a function');
    assert.equal(typeof model.derive, 'function', 'model.derive is not a function');

    let state = { ...model.init(inputs), ...runFlags };
    assert.ok(state && typeof state === 'object', 'init did not return a state object');
    for (let frame = 0; frame < 180; frame += 1) {
      state = model.step(state, inputs, 1 / 60);
      assert.ok(state && typeof state === 'object', `step returned an invalid state at frame ${frame}`);
    }

    if (typeof model.validate === 'function') {
      const validation = model.validate(inputs);
      assert.ok(validation && typeof validation.ok === 'boolean', 'validate returned an invalid result');
    }

    // Measurement and derivation are allowed to return null/unsuccessful results
    // before a student reaches an endpoint; they must still be callable.
    model.measure(state, inputs, 1, 1);
    model.derive([], inputs);
  } catch (error) {
    failures.push(`${label}: ${error?.stack || error}`);
  }
}

console.log(`published experiments checked: ${checked}`);
console.log(`pipeline failures: ${failures.length}`);
for (const failure of failures) console.error(`\n${failure}`);
if (failures.length) process.exitCode = 1;
