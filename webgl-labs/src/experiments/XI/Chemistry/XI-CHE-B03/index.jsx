/**
 * XI-CHE-B03 · Crystallisation of an impure sample.
 * Canvas underneath, DOM on top, one source of truth beneath both.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { exposeForProbe } from '../../../../shared/probe.js';
import { useCrystallisationEngine } from './engine/useCrystallisationEngine.js';
import { CrystallisationSimulation } from './three/CrystallisationSimulation.jsx';
import { CrystallisationHUD } from './ui/CrystallisationHUD.jsx';

/* Opt-in only: /?probe=1#/XI-CHE-B03 */
exposeForProbe('XI-CHE-B03', useCrystallisationEngine);

export default function CrystallisationLab() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070b14]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_32%,rgba(56,189,248,0.09),transparent_62%)]" />

      <Canvas
        shadows dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = 0.5;
        }}
      >
        <color attach="background" args={['#070b14']} />
        <fog attach="fog" args={['#070b14', 3, 9]} />
        <PerspectiveCamera makeDefault position={[0.15, 0.30, 1.35]} fov={36} near={0.02} far={30} />
        <OrbitControls
          makeDefault enablePan
          minDistance={0.25} maxDistance={4}
          minPolarAngle={0.2} maxPolarAngle={Math.PI / 2.05}
          target={[0, 0.02, 0]} enableDamping dampingFactor={0.08}
        />
        <CrystallisationSimulation />
      </Canvas>

      <CrystallisationHUD />
    </div>
  );
}
