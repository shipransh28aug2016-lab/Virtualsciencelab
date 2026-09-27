/**
 * XII-CHE-A01 · Coagulation of colloids and the Tyndall effect.
 * Canvas underneath, DOM on top. Two layers, one source of truth.
 */
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { BeakerSimulation } from '../three/BeakerSimulation.jsx';
import { LabHUD } from '../ui/LabHUD.jsx';

export default function SurfaceChemistryLab() {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#070b14]">
      {/* A dark room, because you cannot see a Tyndall cone in a bright one. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(56,189,248,0.10),transparent_60%)]" />

      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          /* Filmic, so the beam can be genuinely brighter than white without
             clipping to a flat disc — the scattering integral returns real
             radiance and the tone mapper is what makes that displayable. */
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          /* The beaker wall is transmissive, so three renders the scene a second
             time into a backdrop for it — and that second pass runs the liquid's
             raymarch all over again. Half resolution for the backdrop is
             invisible through 1 mm of refracting glass and costs a quarter of
             the fragments. */
          if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = 0.5;
        }}
      >
        <color attach="background" args={['#070b14']} />
        <fog attach="fog" args={['#070b14', 4, 12]} />
        <PerspectiveCamera makeDefault position={[0, 0.55, 3.1]} fov={38} near={0.05} far={40} />
        <OrbitControls
          makeDefault enablePan={false}
          minDistance={1.4} maxDistance={6}
          minPolarAngle={0.35} maxPolarAngle={Math.PI / 2.05}
          target={[0, 0.05, 0]} enableDamping dampingFactor={0.08}
        />
        <BeakerSimulation />
      </Canvas>

      <LabHUD />
    </div>
  );
}
