/**
 * Aggregates every apparatus renderer into one lookup, keyed by the
 * `simulation.renderer` name each experiment JSON declares (which always
 * matches its `simulation.model` name — verified by the curriculum audit).
 * Loaded on demand by src/main.js, alongside the model for whichever
 * experiment the student opens.
 */
import { RENDERERS as mechanics } from './mechanics.js';
import { RENDERERS as thermalFluids } from './thermal-fluids.js';
import { RENDERERS as electricity } from './electricity.js';
import { RENDERERS as optics } from './optics.js';
import { RENDERERS as chemistry } from './chemistry.js';
import { RENDERERS as chemistryNew } from './chemistry-new.js';

export const RENDERERS = {
  ...mechanics,
  ...thermalFluids,
  ...electricity,
  ...optics,
  ...chemistry,
  ...chemistryNew,
};

export default RENDERERS;
