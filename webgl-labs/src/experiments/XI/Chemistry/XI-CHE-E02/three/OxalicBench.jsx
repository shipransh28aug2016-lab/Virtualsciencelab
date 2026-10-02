/** The XI-CHE-E02 scene: the shared standard-solution bench, on this lab's store. */
import { StandardBench } from '../../../../../shared/standard/StandardBench.jsx';
import { useOxalic } from '../engine/oxalic.js';

export function OxalicBench() {
  return <StandardBench useStore={useOxalic} />;
}

export default OxalicBench;
