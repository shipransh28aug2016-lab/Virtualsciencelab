/** The interface for XI-CHE-E03, as data — the shared titration interface on this lab's store. */
import { makeTitrationSpec } from '../../../../shared/titration/makeTitrationSpec.jsx';
import { CFG, useNaohOxalic, ENGINE } from './engine/naohOxalic.js';
import { TitrationBench } from './three/TitrationBench.jsx';

export const spec = makeTitrationSpec(CFG, useNaohOxalic, ENGINE, TitrationBench);
export default spec;
