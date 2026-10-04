/**
 * The spherometer scene, drawn from the physical state the scales are computed from (viewOfSphero): the three legs on the
 * surface the instrument stands on, the screw tip where the screw has put it, the disc turned through y/pitch revolutions, and —
 * when the tip is down on the surface and holding the legs up — the whole instrument ready to rock. The surfaces are spherical
 * caps of their real radii: a sagitta of a millimetre or so is what the legs 40 mm apart can tell apart.
 * One scene unit is 25 mm.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../three/Studio.jsx';
import { viewOfSphero } from './createSpherometer.js';
import { BODIES, SURFACES, legMean, sagitta } from './spherometer.js';

const SC = 0.04;               // units per mm
const STEEL = '#aab2c0';

/** A canvas texture, drawn once. */
function useCanvas(w, h, draw, deps) {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (g) draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function SpherometerScene({ useStore }) {
  const body = useRef(); const screw = useRef(); const disc = useRef(); const tilt = useRef(); const screwTop = useRef();
  const instrument = useStore((s) => s.instrument);
  const surface = useStore((s) => s.surface);
  const sp = viewOfSphero(useStore.getState()).sp;
  const R_LEG = legMean(instrument) / Math.sqrt(3);
  const Z0 = BODIES[instrument].Z0;
  const surf = SURFACES[surface];
  const rimMm = 52;

  /* The disc: n divisions round its edge, numbered. */
  const discTex = useCanvas(1024, 96, (g, w, h) => {
    g.fillStyle = '#d3d9e3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#18202c'; g.fillStyle = '#18202c'; g.font = '22px system-ui, sans-serif'; g.textAlign = 'center';
    const lab = sp.n <= 50 ? 5 : 10;
    for (let k = 0; k < sp.n; k += 1) { const x = (k / sp.n) * w; const long = k % lab === 0; g.lineWidth = long ? 3 : 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, long ? 58 : 36); g.stroke(); if (long) g.fillText(String(k), x, 84); }
  }, [sp.n]);
  /* The pillar scale: a mark every pitch, numbered every five; mark m at the height the disc's edge has at reading m. */
  const scaleTex = useCanvas(96, 512, (g, w, h) => {
    g.fillStyle = '#d3d9e3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#18202c'; g.fillStyle = '#18202c'; g.font = '20px system-ui, sans-serif'; g.textAlign = 'left';
    const per = h / 15.5;
    for (let m = 0; m <= 15; m += 1) { const y = 12 + m * per; const major = m % 5 === 0; g.lineWidth = major ? 3 : 1.6; g.beginPath(); g.moveTo(0, y); g.lineTo(major ? 56 : 36, y); g.stroke(); if (major) g.fillText(String(m), 58, y + 7); }
  }, []);

  /* The surface: a plate, or a spherical cap of its real radius whose middle stands (convex) or sinks (concave) by the sagitta at the legs. */
  const surfaceGeo = useMemo(() => {
    if (!surf.sign) return new THREE.CylinderGeometry(rimMm * SC, rimMm * SC, 8 * SC, 64);
    const R = surf.R * SC; const th = Math.asin(Math.min(0.9, rimMm / surf.R));
    return surf.sign > 0 ? new THREE.SphereGeometry(R, 160, 28, 0, Math.PI * 2, 0, th) : new THREE.SphereGeometry(R, 160, 28, 0, Math.PI * 2, Math.PI - th, th);
  }, [surf]);
  const surfaceY = useMemo(() => {
    if (!surf.sign) return -4 * SC;
    const h = sagitta(surf, R_LEG);
    return surf.sign > 0 ? (h - surf.R) * SC : (surf.R - h) * SC;
  }, [surf, R_LEG]);

  const legAngles = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];
  const press = useRef({ seq: 0, t: 0, amp: 0 });

  useFrame((_, dt) => {
    const s = useStore.getState(); const v = viewOfSphero(s);
    const lift = Math.min(v.lift * 6, 0.8);                       // millimetres: what a hundredth of a millimetre would not show
    if (body.current) body.current.position.y = lift * SC;
    /* The tip is where the screw has put it: level with the legs at reading Z0, higher for a smaller reading; the disc rides 44 mm above it. */
    const tipY = (Z0 - s.y) * SC;
    if (screw.current) { screw.current.position.y = tipY + 22 * SC; screw.current.scale.y = 44 * SC; }
    if (disc.current) { disc.current.position.y = tipY + 49 * SC; disc.current.rotation.y = (s.y / sp.pitch) * Math.PI * 2; }
    if (screwTop.current) screwTop.current.position.y = tipY + 58 * SC;
    /* A press on the instrument: it rocks if the tip is holding the legs up, and only settles if not. */
    const p = press.current;
    if (s.pressSeq !== p.seq) { p.seq = s.pressSeq; p.t = 0.0001; p.amp = v.state === 'rocks' ? Math.min(0.05, 0.02 + v.lift * 0.4) : 0.004; }
    if (p.t > 0) {
      p.t += dt; const e = Math.exp(-p.t / 0.45);
      if (tilt.current) { tilt.current.rotation.z = p.amp * e * Math.sin(p.t * 16); tilt.current.rotation.x = p.amp * 0.5 * e * Math.sin(p.t * 13 + 1); }
      if (p.t > 2.2) { p.t = 0; if (tilt.current) tilt.current.rotation.set(0, 0, 0); }
    }
  });

  return (
    <group>
      <Studio benchRadius={7} shadowScale={10} benchColour="#171f2e" />
      <group position={[0, 12 * SC, 0]}>
        {/* The pedestal and the glass */}
        <mesh position={[0, -10 * SC, 0]}><cylinderGeometry args={[60 * SC, 60 * SC, 4 * SC, 64]} /><meshStandardMaterial color="#222b3a" roughness={0.8} metalness={0.2} /></mesh>
        <mesh geometry={surfaceGeo} position={[0, surfaceY, 0]}>
          <meshPhysicalMaterial color="#cfe8f2" transparent opacity={0.34} roughness={0.04} metalness={0} clearcoat={1} side={THREE.DoubleSide} />
        </mesh>
        {/* The instrument, rocking about the plane of its legs */}
        <group ref={tilt}>
          <group ref={body}>
            {legAngles.map((a, i) => (
              <mesh key={i} position={[R_LEG * SC * Math.cos(a), 7 * SC, R_LEG * SC * Math.sin(a)]} rotation-x={Math.PI}>
                <coneGeometry args={[1.4 * SC, 14 * SC, 20]} /><meshStandardMaterial color={STEEL} metalness={0.85} roughness={0.22} />
              </mesh>
            ))}
            <mesh position={[0, 16 * SC, 0]} rotation-y={Math.PI / 2 + Math.PI / 3}><cylinderGeometry args={[(R_LEG + 7) * SC, (R_LEG + 7) * SC, 4 * SC, 3]} /><meshStandardMaterial color="#8d96a4" metalness={0.75} roughness={0.3} /></mesh>
            <mesh position={[0, 24 * SC, 0]}><cylinderGeometry args={[5.5 * SC, 6.5 * SC, 14 * SC, 40]} /><meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.28} /></mesh>
            {/* The vertical scale on its pillar beside the disc: the mark for reading m stands where the disc's edge is when it reads m. */}
            <mesh position={[16.5 * SC, 46 * SC, 0]}><boxGeometry args={[7 * SC, 32 * SC, 2 * SC]} /><meshStandardMaterial color="#5b6577" metalness={0.6} roughness={0.4} /></mesh>
            <mesh position={[16.5 * SC, (Z0 + 44 + 0.36 - 7.75) * SC, 1.05 * SC]}><planeGeometry args={[7 * SC, 15.5 * SC]} /><meshStandardMaterial map={scaleTex} roughness={0.5} metalness={0.3} /></mesh>
            <group ref={screw}><mesh><cylinderGeometry args={[1.5 * SC, 1.5 * SC, 1, 20]} /><meshStandardMaterial color={STEEL} metalness={0.95} roughness={0.18} /></mesh></group>
            <mesh ref={disc}><cylinderGeometry args={[14 * SC, 14 * SC, 10 * SC, 72]} /><meshStandardMaterial map={discTex} roughness={0.5} metalness={0.4} /></mesh>
            <mesh ref={screwTop}><cylinderGeometry args={[11 * SC, 12 * SC, 8 * SC, 48]} /><meshStandardMaterial color="#39414f" metalness={0.5} roughness={0.55} /></mesh>
          </group>
        </group>
      </group>
    </group>
  );
}
