/** The interface for XI-CHE-E05, as data — the shared titration interface on this lab's store. */
import { makeTitrationSpec } from '../../../../shared/titration/makeTitrationSpec.jsx';
import { CFG, useHclCarbonate, ENGINE } from './engine/hclCarbonate.js';
import { TitrationBench } from './three/TitrationBench.jsx';

export const spec = makeTitrationSpec(CFG, useHclCarbonate, ENGINE, TitrationBench);
export default spec;
