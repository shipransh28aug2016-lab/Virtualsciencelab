/** The XI-PHY-A03 scene: the screw gauge with the lamina's edge between its faces — the shared screw scene. */
import { ScrewScene } from '../../../../../shared/measure/MeasureScenes.jsx';
import { useLamina, CFG } from '../engine/lamina.js';

export function LaminaBench() {
  return <ScrewScene cfg={CFG} useStore={useLamina} />;
}

export default LaminaBench;
