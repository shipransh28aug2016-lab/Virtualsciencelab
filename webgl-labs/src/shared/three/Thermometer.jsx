/**
 * Thermometer — a mercury-in-glass thermometer whose thread follows a number.
 *
 * `getC` is called every frame and should read the TRUE temperature of the
 * thing the bulb is in (the store's, not the display's): the thread sits
 * wherever it sits, and rounding to the instrument's least count is something
 * the student's eye does, not the glass.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { GlassMaterial } from './Glass.jsx';

export function Thermometer({ getC, min = 0, max = 110, length = 0.9, bulbRadius = 0.022, ...group }) {
  const thread = useRef();
  const stemR = bulbRadius * 0.62;

  useFrame(() => {
    if (!thread.current) return;
    const f = Math.min(1, Math.max(0, (getC() - min) / (max - min)));
    const h = Math.max(1e-3, f * length);
    thread.current.scale.y = h;
    thread.current.position.y = bulbRadius + h / 2;
  });

  return (
    <group {...group}>
      <mesh position={[0, bulbRadius, 0]}>
        <sphereGeometry args={[bulbRadius, 24, 16]} />
        <meshStandardMaterial color="#c9ccd4" metalness={0.95} roughness={0.18} />
      </mesh>
      <mesh ref={thread} position={[0, bulbRadius, 0]}>
        <cylinderGeometry args={[stemR * 0.42, stemR * 0.42, 1, 12]} />
        <meshStandardMaterial color="#d2d6de" metalness={0.95} roughness={0.15} />
      </mesh>
      <mesh position={[0, bulbRadius + length / 2 + 0.05, 0]}>
        <cylinderGeometry args={[stemR, stemR, length + 0.1, 20, 1, true]} />
        <GlassMaterial thickness={0.02} transmission={0.92} />
      </mesh>
    </group>
  );
}

export default Thermometer;
