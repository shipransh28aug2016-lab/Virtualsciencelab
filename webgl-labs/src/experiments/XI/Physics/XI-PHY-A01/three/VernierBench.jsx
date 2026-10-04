/** The XI-PHY-A01 scene: the callipers and what is between their jaws — the shared measure scene. */
import { VernierScene } from '../../../../../shared/measure/MeasureScenes.jsx';
import { useVernier, CFG } from '../engine/vernier.js';

export function VernierBench() {
  return <VernierScene cfg={CFG} useStore={useVernier} />;
}

export default VernierBench;
