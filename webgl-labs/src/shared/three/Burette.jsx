/**
 * A burette on its clamp: graduated glass, the liquid column in it, a stopcock
 * and a tip. The group's origin is the TIP, so putting the origin just above a
 * flask's neck aims the burette into it.
 *
 *   <Burette liquidRef={ref} handleRef={h} position={[0, 1.1, 0]} />
 *   setLiquid(ref.current, { topY: buretteLevel(readingMl), absorb, time })
 *
 * The scale runs 0 at the top to 50 at the bottom, as a burette's does, so the
 * liquid's surface sits at the mark equal to the reading.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Vessel } from './Vessel.jsx';
import { buretteProfile } from './profiles.js';

export const BURETTE_R = 0.05;
export const BURETTE_H = 2.6;
export const BURETTE_BASE = 0.2;          // glass starts this far above the tip
const PROFILE = buretteProfile({ r: BURETTE_R, h: BURETTE_H });

/** Height of the liquid surface inside the profile, for a reading in mL (0 top … 50 bottom). */
export const buretteLevel = (readingMl) => BURETTE_H * (1 - Math.min(50, Math.max(0, readingMl)) / 50);

export function Burette({ liquidRef, handleRef, ...group }) {
  const marks = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    for (let mL = 0; mL <= 50; mL += 1) {
      const major = mL % 10 === 0; const half = mL % 5 === 0;
      dummy.position.set(0, BURETTE_BASE + BURETTE_H * (1 - mL / 50), BURETTE_R * 1.02);
      dummy.scale.set(major ? 1.0 : half ? 0.7 : 0.4, 1, 1);
      dummy.updateMatrix();
      marks.current.setMatrixAt(mL, dummy.matrix);
    }
    marks.current.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  return (
    <group {...group}>
      <group position={[0, BURETTE_BASE, 0]}><Vessel profile={PROFILE} liquidRef={liquidRef} rim={false} /></group>

      {/* Graduations: a dark tick every mL, longer every 5 and 10. */}
      <instancedMesh ref={marks} args={[null, null, 51]}>
        <boxGeometry args={[0.07, 0.004, 0.002]} />
        <meshBasicMaterial color="#1b2536" />
      </instancedMesh>

      {/* Stopcock: a barrel through the tube, and a handle that turns with it. */}
      <mesh position={[0, 0.1, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.03, 0.03, 0.16, 16]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.35} metalness={0.2} />
      </mesh>
      <group ref={handleRef} position={[0.09, 0.1, 0]}>
        <mesh position={[0.05, 0, 0]}>
          <boxGeometry args={[0.12, 0.022, 0.05]} />
          <meshStandardMaterial color="#38bdf8" roughness={0.5} />
        </mesh>
      </group>

      {/* The jet, tapering to the tip. */}
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.012, 0.03, 0.08, 14]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.2} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

export default Burette;
