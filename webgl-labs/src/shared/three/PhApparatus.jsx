/**
 * The pieces of a pH bench that more than one experiment uses: the glass
 * electrode on its arm, and an indicator strip. Plain meshes — what a student
 * sees them do is decided by the engine, which moves them.
 */
import { forwardRef } from 'react';
import { GlassMaterial } from './Glass.jsx';

/** A combination glass electrode. The group's origin is the bulb; the shaft
 *  rises from it, so placing the group at the liquid surface dips the bulb. */
export const Electrode = forwardRef(function Electrode(props, ref) {
  return (
    <group ref={ref} {...props}>
      <mesh position={[0, 0.02, 0]}>
        <sphereGeometry args={[0.034, 20, 14]} />
        <GlassMaterial thickness={0.03} transmission={0.85} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.024, 0.024, 1.0, 20, 1, true]} />
        <GlassMaterial thickness={0.03} transmission={0.9} />
      </mesh>
      <mesh position={[0, 1.04, 0]}>
        <cylinderGeometry args={[0.034, 0.034, 0.14, 20]} />
        <meshStandardMaterial color="#1b2230" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 0.6, 8]} />
        <meshStandardMaterial color="#0c1018" roughness={0.7} />
      </mesh>
    </group>
  );
});

/** An indicator strip on a tile. `tipRef` is the mesh whose colour the engine drives. */
export function Strip({ tipRef, ...props }) {
  return (
    <group {...props}>
      <mesh position={[0, 0, -0.07]}>
        <boxGeometry args={[0.035, 0.004, 0.14]} />
        <meshStandardMaterial color="#f3eee0" roughness={0.9} />
      </mesh>
      <mesh ref={tipRef} position={[0, 0.0005, 0.07]}>
        <boxGeometry args={[0.035, 0.0045, 0.14]} />
        <meshStandardMaterial color="#f3eee0" roughness={0.9} />
      </mesh>
    </group>
  );
}
