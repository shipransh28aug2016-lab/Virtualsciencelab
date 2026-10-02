/** The XI-CHE-D02 scene: four tubes, two baths, a shelf of droppers — all of it the shared tube rack. */
import { TubeRack } from '../../../../../shared/tubes/TubeRack.jsx';
import { useCoCl, CFG } from '../engine/cocl.js';

export function CoClBench() {
  return <TubeRack store={useCoCl} cfg={CFG} />;
}

export default CoClBench;
