#!/usr/bin/env node
/** Scientific integrity smoke checks for the offline models and curriculum data. */
import assert from 'node:assert/strict';
import { isBalancedEquation } from '../src/utils/chemistry.js';
import * as kinetics from '../src/simulation/models/reaction-kinetics.js';
import * as titration from '../src/simulation/models/titration.js';

assert.equal(isBalancedEquation('H₂C₂O₄ + 2NaOH → Na₂C₂O₄ + 2H₂O'), true);
assert.equal(isBalancedEquation('Na₂S₂O₃ + 2HCl → 2NaCl + SO₂ + S + H₂O'), true);

const acidInputs = { system: 'naoh_hcl', titrantConc: 0.1, analyteVolume: 20 };
assert.ok(titration.pHAt(acidInputs, 0) > titration.pHAt(acidInputs, 50), 'acid added to base must lower pH');
assert.equal(titration.validate({ analyte: 'hcl', titrant: 'oxalic' }).ok, false);
assert.ok(kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 25 }) > 0);
assert.ok(kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 35 }) < kinetics.reactionTimeS({ thioVolume: 25, waterVolume: 25, hclVolume: 5, tempC: 25 }), 'higher temperature must accelerate the reaction');
console.log('Scientific integrity checks passed.');
