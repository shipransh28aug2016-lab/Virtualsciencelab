/**
 * XI-CHE-B02 · Determination of the boiling point of an organic compound.
 * Siwoloboff's method. Canvas underneath, DOM on top.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { exposeForProbe } from '../../../../shared/probe.js';
import { useBoilingPointEngine } from './engine/useBoilingPointEngine.js';
import { SiwoloboffSimulation } from './three/SiwoloboffSimulation.jsx';
import { BoilingPointHUD } from './ui/BoilingPointHUD.jsx';

/* Opt-in only: /?probe=1#/XI-CHE-B02 */
exposeForProbe('XI-CHE-B02', useBoilingPointEngine);

export default function BoilingPointLab() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070b14]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(56,189,248,0.08),transparent_62%)]" />

      <Canvas
        shadows dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          /* Five transmissive surfaces stand between the camera and the
             capillary. Three renders a backdrop pass for them; half resolution
             is invisible through 1.4 mm of borosilicate and costs a quarter of
             the fragments. */
          if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = 0.5;
        }}
      >
        <color attach="background" args={['#070b14']} />
        <fog attach="fog" args={['#070b14', 5, 16]} />
        <PerspectiveCamera makeDefault position={[0.30, 0.18, 2.6]} fov={34} near={0.05} far={50} />
        <OrbitControls
          makeDefault enablePan
          minDistance={0.4} maxDistance={7}
          minPolarAngle={0.25} maxPolarAngle={Math.PI / 1.95}
          target={[0, -0.22, 0]} enableDamping dampingFactor={0.08}
        />
        <SiwoloboffSimulation />
      </Canvas>

      <BoilingPointHUD />
    </div>
  );
}
