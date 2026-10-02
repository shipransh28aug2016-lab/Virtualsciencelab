/** The interface for XI-CHE-E04, as data — the shared standard-solution interface on this lab's store. */
import { makeStandardSpec } from '../../../../shared/standard/makeStandardSpec.jsx';
import { CFG, useCarbonate } from './engine/carbonate.js';
import { CarbonateBench } from './three/CarbonateBench.jsx';

export const spec = makeStandardSpec(CFG, useCarbonate, CarbonateBench);
export default spec;
