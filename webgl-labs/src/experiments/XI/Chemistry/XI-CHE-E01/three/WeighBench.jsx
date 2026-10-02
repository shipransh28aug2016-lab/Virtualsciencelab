/** The XI-CHE-E01 scene: the balances and the things to weigh, all of it the shared balance scene. */
import { Studio } from '../../../../../shared/three/Studio.jsx';
import { BalanceBench } from '../../../../../shared/balance/BalanceScene.jsx';
import { useWeighEngine } from '../engine/useWeighEngine.js';

export function WeighBench() {
  return (
    <group>
      <Studio benchRadius={5} shadowScale={8} benchColour="#1a2333" />
      {/* The bench is drawn a fifth smaller than life-size units so that the balance and the tray fit between the panels. */}
      <group scale={0.8}><BalanceBench useStore={useWeighEngine} /></group>
    </group>
  );
}

export default WeighBench;
