/**
 * Borosilicate glass, as one material, so every vessel on every bench refracts
 * and catches the light the same way.
 *
 * transmission = 1 with a real index of refraction (1.474 for laboratory
 * borosilicate) and a real thickness: the liquid behind the wall is refracted
 * and the rim picks up the room. The wall is always a separate surface from the
 * liquid it holds — glass and solution are two media, and drawing them as one
 * is what makes cheap 3D chemistry look like cheap 3D chemistry.
 */
import * as THREE from 'three';

export const GLASS_IOR = 1.474;

export function GlassMaterial(props) {
  return (
    <meshPhysicalMaterial
      transparent transmission={1} thickness={0.14} ior={GLASS_IOR}
      roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.05}
      attenuationColor="#e8f4ff" attenuationDistance={2.5}
      side={THREE.DoubleSide} envMapIntensity={1.4}
      {...props}
    />
  );
}

export default GlassMaterial;
