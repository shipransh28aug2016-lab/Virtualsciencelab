/** The interface for XI-CHE-E02, as data — the shared standard-solution interface on this lab's store. */
import { makeStandardSpec } from '../../../../shared/standard/makeStandardSpec.jsx';
import { CFG, useOxalic } from './engine/oxalic.js';
import { OxalicBench } from './three/OxalicBench.jsx';

export const spec = makeStandardSpec(CFG, useOxalic, OxalicBench);
export default spec;
