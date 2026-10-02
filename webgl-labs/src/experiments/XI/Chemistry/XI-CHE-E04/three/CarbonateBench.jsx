/** The XI-CHE-E04 scene: the shared standard-solution bench, on this lab's store. */
import { StandardBench } from '../../../../../shared/standard/StandardBench.jsx';
import { useCarbonate } from '../engine/carbonate.js';

export function CarbonateBench() {
  return <StandardBench useStore={useCarbonate} />;
}

export default CarbonateBench;
