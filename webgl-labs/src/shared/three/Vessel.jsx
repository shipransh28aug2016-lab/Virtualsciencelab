/**
 * Vessel — a piece of laboratory glassware and the liquid in it.
 *
 * Built from a profile (see profiles.js), so the glass, the liquid and the
 * volume graduations all come from the same numbers. The liquid is a separate
 * mesh inside the glass and is driven through `liquidRef`: the scene computes
 * the surface height from a volume with heightAtVolume(), and the absorption
 * from the concentration, and hands them to setLiquid() each frame.
 *
 *   <Vessel profile={conicalFlaskProfile()} liquidRef={flask} />
 *   …
 *   setLiquid(flask.current, { topY: heightAtVolume(profile, mL), absorb: [...] })
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import { GlassMaterial } from './Glass.jsx';
import { outerProfile } from './profiles.js';
import './LiquidMaterial.jsx';

const lathe = (points, segments) => new THREE.LatheGeometry(
  points.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), segments,
);

export function Vessel({ profile, wall = 0.012, liquidRef, segments = 60, rim = true, children, ...group }) {
  const inner = useMemo(() => lathe(profile.map(([r, y]) => [r * 0.985, y]), segments), [profile, segments]);
  const outer = useMemo(() => lathe(outerProfile(profile, wall), segments), [profile, wall, segments]);
  const top = profile[profile.length - 1];

  return (
    <group {...group}>
      {/* Liquid first, so the glass has something to refract. DoubleSide because
          the lathe's winding decides which face is "front", and an invisible
          liquid is a far worse failure than a redundant back face. */}
      <mesh geometry={inner}>
        <liquidMaterial ref={liquidRef} side={THREE.DoubleSide} />
      </mesh>
      {children}
      <mesh geometry={outer} castShadow><GlassMaterial thickness={wall * 10} /></mesh>
      {rim ? (
        <mesh position={[0, top[1], 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[top[0] + wall * 0.5, wall * 0.55, 10, segments]} />
          <GlassMaterial thickness={wall * 5} />
        </mesh>
      ) : null}
    </group>
  );
}

export default Vessel;
