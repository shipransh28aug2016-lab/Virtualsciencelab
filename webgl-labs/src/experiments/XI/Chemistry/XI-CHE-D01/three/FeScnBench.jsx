/** The XI-CHE-D01 scene: four tubes, two baths, a shelf of droppers — all of it the shared tube rack. */
import { TubeRack } from '../../../../../shared/tubes/TubeRack.jsx';
import { useFeScn, CFG } from '../engine/fescn.js';

export function FeScnBench() {
  return <TubeRack store={useFeScn} cfg={CFG} />;
}

export default FeScnBench;
