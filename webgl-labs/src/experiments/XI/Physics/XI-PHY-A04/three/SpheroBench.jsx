/** The XI-PHY-A04 scene: the spherometer on its glass — the shared spherometer scene. */
import { SpherometerScene } from '../../../../../shared/measure/SpherometerScene.jsx';
import { useSpherometer } from '../engine/spherometer.js';

export function SpheroBench() {
  return <SpherometerScene useStore={useSpherometer} />;
}

export default SpheroBench;
