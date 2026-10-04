/** The interface for XI-PHY-A01, as data — the shared measuring interface on this lab's store. */
import { makeMeasureSpec } from '../../../../shared/measure/makeMeasureSpec.jsx';
import { CFG, useVernier } from './engine/vernier.js';
import { VernierBench } from './three/VernierBench.jsx';

export const spec = makeMeasureSpec(CFG, useVernier, VernierBench);
export default spec;
