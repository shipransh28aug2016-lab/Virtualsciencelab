/**
 * Studio — the room the bench stands in. Lights, a reflective environment for
 * the glass to catch, a soft contact shadow, and the bench itself.
 *
 * Nothing is fetched: an HDR from a CDN is a dependency a school laptop on a
 * filtered network does not need, so the environment is built from light panels
 * in the scene. Under ?probe=1 the shadows are dropped — they cost a great deal
 * on a software rasteriser and no check depends on them.
 */
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { isProbe } from '../probe.js';

export function Studio({ benchRadius = 3, shadowScale = 4, benchColour = '#0c1322', key = 3.0 }) {
  const probing = isProbe();
  return (
    <>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={key} position={[0, 4.5, 3]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-4, 2.4, 1]} scale={[4, 6, 1]} rotation-y={Math.PI / 2.3} />
        <Lightformer form="rect" intensity={0.9} position={[4, 2.0, -1]} scale={[4, 6, 1]} rotation-y={-Math.PI / 2.3} />
      </Environment>
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 5, 4]} intensity={1.15} castShadow={!probing} shadow-mapSize={1024} />
      {probing ? null : (
        <ContactShadows position={[0, 0.002, 0]} opacity={0.42} scale={shadowScale} blur={2.4} far={1.6} resolution={512} />
      )}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[benchRadius, 64]} />
        <meshStandardMaterial color={benchColour} roughness={0.88} metalness={0.04} />
      </mesh>
    </>
  );
}

export default Studio;
