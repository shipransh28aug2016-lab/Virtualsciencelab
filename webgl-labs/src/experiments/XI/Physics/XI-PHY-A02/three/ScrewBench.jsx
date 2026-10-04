/** The XI-PHY-A02 scene: the screw gauge and what is between its faces — the shared measure scene. */
import { ScrewScene } from '../../../../../shared/measure/MeasureScenes.jsx';
import { useScrew, CFG } from '../engine/screw.js';

export function ScrewBench() {
  return <ScrewScene cfg={CFG} useStore={useScrew} />;
}

export default ScrewBench;
