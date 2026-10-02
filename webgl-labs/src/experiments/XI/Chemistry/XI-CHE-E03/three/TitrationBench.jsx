/** The XI-CHE-E03 scene: the shared titration bench, on this lab's store. */
import { TitrationScene } from '../../../../../shared/titration/TitrationScene.jsx';
import { useNaohOxalic } from '../engine/naohOxalic.js';

export function TitrationBench() {
  return <TitrationScene useStore={useNaohOxalic} />;
}

export default TitrationBench;
