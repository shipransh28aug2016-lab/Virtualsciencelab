/** The interface for XI-PHY-A02, as data — the shared measuring interface on this lab's store. */
import { makeMeasureSpec } from '../../../../shared/measure/makeMeasureSpec.jsx';
import { CFG, useScrew } from './engine/screw.js';
import { ScrewBench } from './three/ScrewBench.jsx';

export const spec = makeMeasureSpec(CFG, useScrew, ScrewBench);
export default spec;
