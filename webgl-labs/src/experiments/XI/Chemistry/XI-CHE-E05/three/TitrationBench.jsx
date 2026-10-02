/** The XI-CHE-E05 scene: the shared titration bench, on this lab's store. */
import { TitrationScene } from '../../../../../shared/titration/TitrationScene.jsx';
import { useHclCarbonate } from '../engine/hclCarbonate.js';

export function TitrationBench() {
  return <TitrationScene useStore={useHclCarbonate} />;
}

export default TitrationBench;
