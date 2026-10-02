/**
 * LabShell — canvas underneath, DOM on top, one source of truth beneath both.
 *
 * Takes a bench's spec (see ui/SpecHUD.jsx) and mounts the scene and the
 * interface. It also owns the one thing every bench would otherwise repeat: the
 * render loop's call into the store. The scene reads state; it never advances it.
 *
 *   camera   { position, fov, target, min, max, polar: [min, max] }
 *   fog      [near, far]
 *   glow     the colour of the radial wash behind the canvas
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three';
import { SpecHUD } from './ui/SpecHUD.jsx';
import { exposeForProbe, isProbe } from './probe.js';

/** Advance the engine by the real frame time. The store clamps dt itself —
 *  a backgrounded tab hands back a half-second frame, and an integrator must
 *  not mistake that for half a second of chemistry. */
function Ticker({ store }) {
  useFrame((_, dt) => { store.getState().tick?.(dt); });
  return null;
}

export default function LabShell({ spec }) {
  const { code, store, Scene, camera = {}, fog, background = '#070b14', glow = 'rgba(56,189,248,0.09)' } = spec;
  const probing = isProbe();
  exposeForProbe(code, store);

  const cam = {
    position: [0, 0.4, 3], fov: 36, target: [0, 0, 0], min: 0.4, max: 6, polar: [0.2, Math.PI / 2.05], ...camera,
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden" style={{ background }}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 50% 32%, ${glow}, transparent 62%)` }}
      />
      <Canvas
        shadows={!probing}
        /* A software rasteriser cannot afford a full-resolution frame, and no
           check depends on one. */
        dpr={probing ? 0.6 : [1, 2]}
        gl={{ antialias: !probing, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.outputColorSpace = SRGBColorSpace;
          /* Transmissive glass makes three render a backdrop pass for it.
             Half resolution is invisible through a millimetre of borosilicate
             and costs a quarter of the fragments. */
          if ('transmissionResolutionScale' in gl) gl.transmissionResolutionScale = probing ? 0.25 : 0.5;
        }}
      >
        <color attach="background" args={[background]} />
        {fog ? <fog attach="fog" args={[background, fog[0], fog[1]]} /> : null}
        <PerspectiveCamera makeDefault position={cam.position} fov={cam.fov} near={0.02} far={60} />
        <OrbitControls
          makeDefault enablePan minDistance={cam.min} maxDistance={cam.max}
          minPolarAngle={cam.polar[0]} maxPolarAngle={cam.polar[1]}
          target={cam.target} enableDamping dampingFactor={0.08}
        />
        <Ticker store={store} />
        <Scene />
      </Canvas>
      <SpecHUD spec={spec} />
    </div>
  );
}
