/**
 * XI-CHE-B01 · Determination of the melting point of an organic compound.
 * Canvas underneath, DOM on top, one source of truth underneath both.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { exposeForProbe } from '../../../../shared/probe.js';
import { useMeltingPointEngine } from './engine/useMeltingPointEngine.js';
import { ThieleTubeSimulation } from './three/ThieleTubeSimulation.jsx';
import { MeltingPointHUD } from './ui/MeltingPointHUD.jsx';

/* Opt-in only: /?probe=1#/XI-CHE-B01 */
exposeForProbe('XI-CHE-B01', useMeltingPointEngine);

export default function MeltingPointLab() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070b14]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(251,191,36,0.08),transparent_62%)]" />

      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          /* Four transmissive surfaces stand between the camera and the sample.
             Three renders a backdrop pass for them; half resolution is invisible
             through 1.4 mm of borosilicate and costs a quarter of the fragments. */
          if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = 0.5;
        }}
      >
        <color attach="background" args={['#070b14']} />
        <fog attach="fog" args={['#070b14', 5, 16]} />
        <PerspectiveCamera makeDefault position={[0.35, 0.2, 3.3]} fov={36} near={0.05} far={50} />
        <OrbitControls
          makeDefault enablePan
          minDistance={0.5} maxDistance={7}
          minPolarAngle={0.25} maxPolarAngle={Math.PI / 1.95}
          target={[0, -0.18, 0]} enableDamping dampingFactor={0.08}
        />
        <ThieleTubeSimulation />
      </Canvas>

      <MeltingPointHUD />
    </div>
  );
}
