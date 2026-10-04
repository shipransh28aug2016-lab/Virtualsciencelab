/**
 * The scenes of the measuring benches: vernier callipers and a screw gauge, drawn from the same physical state
 * the scales are computed from (viewOf): the jaws are where the jaws are, the vernier zero stands where the
 * instrument's zero error puts it, and the thimble has turned through gap / pitch revolutions. The scales are
 * texture-mapped with the real divisions. The specimen is drawn at the width it really has, at the place and
 * in the direction it is turned to — which is why a student who does not look finds it is not round.
 * One unit is 5 cm for the callipers' bench and the same scale is kept so that a millimetre is 0.02 units.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../three/Studio.jsx';
import { viewOf } from './createMeasure.js';

const STEEL = '#aab2c0'; const STEEL_DARK = '#7b8494';

/** A canvas of ruled lines: [position in mm, height as a fraction, label?] along a length of mm. */
function useRuling({ lengthMm, pxPerMm, ticks, height = 96, bg = '#c9d0db', ink = '#18202c', baseline = 'bottom' }) {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = Math.ceil(lengthMm * pxPerMm); c.height = height;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = Math.max(1, pxPerMm * 0.08); g.font = `${Math.round(height * 0.3)}px system-ui, sans-serif`; g.textAlign = 'center';
      for (const t of ticks) {
        const x = t.at * pxPerMm;
        const h = t.h * height;
        g.beginPath();
        if (baseline === 'bottom') { g.moveTo(x, height); g.lineTo(x, height - h); } else { g.moveTo(x, 0); g.lineTo(x, h); }
        g.stroke();
        if (t.label !== undefined) g.fillText(String(t.label), x, baseline === 'bottom' ? height - h - 4 : h + height * 0.3);
      }
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
  }, [lengthMm, pxPerMm, ticks, height, bg, ink, baseline]);
}

const mainTicks = (length) => Array.from({ length: length + 1 }, (_, m) => ({ at: m, h: m % 10 === 0 ? 0.62 : m % 5 === 0 ? 0.46 : 0.3, label: m % 10 === 0 ? m / 10 : undefined }));

/* ── Vernier callipers ─────────────────────────────────────────────────────── */

const UV = 0.02;              // scene units per millimetre
const BEAM = 170;

export function VernierScene({ cfg, useStore }) {
  const pan = useRef(); const slider = useRef(); const strip = useRef(); const vernierPlane = useRef(); const sphere = useRef(); const cylZ = useRef(); const cylX = useRef(); const ring = useRef(); const bore = useRef();
  const instrument = useStore((s) => s.instrument);
  const inst = cfg.instruments[instrument];
  const main = useRuling({ lengthMm: BEAM, pxPerMm: 14, ticks: useMemo(() => mainTicks(BEAM), []), height: 84 });
  const vTicks = useMemo(() => Array.from({ length: inst.n + 1 }, (_, k) => ({ at: 2 + k * (inst.msd - inst.lc), h: k % (inst.n <= 20 ? 5 : 10) === 0 ? 0.7 : 0.45, label: k % (inst.n <= 20 ? 5 : 10) === 0 ? k : undefined })), [inst]);
  const vLen = inst.n * (inst.msd - inst.lc) + 4;
  const vern = useRuling({ lengthMm: vLen, pxPerMm: 22, ticks: vTicks, height: 70, bg: '#cfd5df', baseline: 'top' });

  useFrame((_, dt) => {
    const s = useStore.getState(); const v = viewOf(cfg, s); const g = v.rest.gap; const w = v.w;
    /* The depth probe comes out of the tail of the beam: the bench pans along to it. */
    if (pan.current) { const to = v.dim?.type === 'inner' && s.dim === 'depth' ? -(BEAM - 25) * UV : 0; pan.current.position.x += (to - pan.current.position.x) * (1 - Math.exp(-Math.min(dt, 0.1) * 6)); }
    if (slider.current) slider.current.position.x = g * UV;
    if (vernierPlane.current) vernierPlane.current.position.x = (v.e + v.shift) * UV - 2 * UV;
    if (strip.current) strip.current.position.x = (BEAM / 2 + g) * UV;
    const kind = v.dim ? s.dim : null;
    const sp = v.spec;
    const show = (ref, on) => { if (ref.current) ref.current.visible = on; };
    const isSphere = sp?.shape === 'sphere'; const isCyl = sp?.shape === 'cylinder'; const isBeaker = sp?.shape === 'beaker';
    show(sphere, isSphere && kind === 'diameter');
    show(cylZ, isCyl && kind === 'diameter'); show(cylX, isCyl && kind === 'length');
    show(ring, isBeaker && kind === 'internal'); show(bore, isBeaker && kind === 'depth');
    if (sphere.current?.visible) { sphere.current.scale.setScalar(Math.max(0.01, w) * UV / 2); sphere.current.position.set(g * UV / 2, -22 * UV, 0); }
    if (cylZ.current?.visible) { cylZ.current.scale.set(Math.max(0.01, w) * UV / 2, 1, Math.max(0.01, w) * UV / 2); cylZ.current.position.set(g * UV / 2, -22 * UV, 0); }
    if (cylX.current?.visible) { cylX.current.scale.set(1, Math.max(0.01, w) * UV, 1); cylX.current.position.set(g * UV / 2, -22 * UV, 0); }
    if (ring.current?.visible) { ring.current.scale.set(Math.max(0.01, w) * UV / 2, 1, Math.max(0.01, w) * UV / 2); ring.current.position.set(g * UV / 2, 32 * UV, 0); }
    if (bore.current?.visible) { bore.current.position.set((BEAM + w / 2) * UV, 12 * UV, 0); bore.current.scale.set(Math.max(0.01, w) * UV, 1, 1); }
  });

  return (
    <group position={[-0.3, 0.0, 0]}>
      <Studio benchRadius={7} shadowScale={10} benchColour="#171f2e" />
      <group ref={pan}><group position={[0, 1.05, 0]}>
        {/* The beam, with the main scale ruled on its face; the fixed jaws at x = 0 (the scale's zero). */}
        <mesh position={[(BEAM / 2 - 2.5) * UV, 12 * UV, 0]}><boxGeometry args={[(BEAM + 5) * UV, 24 * UV, 3 * UV]} /><meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.42} /></mesh>
        <mesh position={[BEAM / 2 * UV, 17.5 * UV, 1.6 * UV]}><planeGeometry args={[BEAM * UV, 13 * UV]} /><meshStandardMaterial map={main} roughness={0.5} metalness={0.4} /></mesh>
        <mesh position={[-2.5 * UV, -8 * UV, 0]}><boxGeometry args={[5 * UV, 64 * UV, 3 * UV]} /><meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.42} /></mesh>
        <mesh position={[-2.5 * UV, 33 * UV, 0]}><boxGeometry args={[5 * UV, 18 * UV, 3 * UV]} /><meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.42} /></mesh>
        {/* The slider: jaws, body, the vernier on its bevel, the depth strip behind. */}
        <group ref={slider}>
          <mesh position={[2.5 * UV, -8 * UV, 1 * UV]}><boxGeometry args={[5 * UV, 64 * UV, 5 * UV]} /><meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.42} /></mesh>
          <mesh position={[2.5 * UV, 33 * UV, 1 * UV]}><boxGeometry args={[5 * UV, 18 * UV, 5 * UV]} /><meshStandardMaterial color={STEEL} metalness={0.55} roughness={0.42} /></mesh>
          <mesh position={[27 * UV, 4 * UV, 1.5 * UV]}><boxGeometry args={[54 * UV, 16 * UV, 6 * UV]} /><meshStandardMaterial color={STEEL_DARK} metalness={0.5} roughness={0.45} /></mesh>
          <mesh position={[27 * UV, 14 * UV, 1.5 * UV]}><boxGeometry args={[54 * UV, 4 * UV, 7 * UV]} /><meshStandardMaterial color="#3b4659" metalness={0.5} roughness={0.5} /></mesh>
          <mesh ref={vernierPlane} position={[vLen / 2 * UV, 7 * UV, 4.6 * UV]}><planeGeometry args={[vLen * UV, 9 * UV]} /><meshStandardMaterial map={vern} roughness={0.5} metalness={0.3} /></mesh>
          <mesh position={[27 * UV, 2 * UV, 4.7 * UV]}><planeGeometry args={[40 * UV, 2 * UV]} /><meshBasicMaterial color="#8d96a4" /></mesh>
        </group>
        <mesh ref={strip} position={[(BEAM / 2) * UV, 6 * UV, -2.2 * UV]}><boxGeometry args={[BEAM * UV, 3 * UV, 1.4 * UV]} /><meshStandardMaterial color={STEEL_DARK} metalness={0.55} roughness={0.4} /></mesh>
        {/* Specimens, each at the width it has between the jaws. */}
        <mesh ref={sphere} visible={false}><sphereGeometry args={[1, 40, 28]} /><meshStandardMaterial color="#aab1bd" metalness={0.95} roughness={0.15} /></mesh>
        <mesh ref={cylZ} visible={false} rotation-x={Math.PI / 2}><cylinderGeometry args={[1, 1, 30 * UV, 40]} /><meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.25} /></mesh>
        <mesh ref={cylX} visible={false} rotation-z={Math.PI / 2}><cylinderGeometry args={[9 * UV, 9 * UV, 1, 40]} /><meshStandardMaterial color="#c9a24a" metalness={0.9} roughness={0.25} /></mesh>
        <mesh ref={ring} visible={false}><cylinderGeometry args={[1, 1, 30 * UV, 48, 1, true]} /><meshPhysicalMaterial color="#dff0ff" transparent opacity={0.3} roughness={0.05} side={THREE.DoubleSide} /></mesh>
        <group ref={bore} visible={false}>
          <mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[22 * UV, 22 * UV, 1, 48, 1, true]} /><meshPhysicalMaterial color="#dff0ff" transparent opacity={0.3} roughness={0.05} side={THREE.DoubleSide} /></mesh>
          <mesh position={[0.5, 0, 0]} rotation-y={Math.PI / 2}><circleGeometry args={[22 * UV, 48]} /><meshPhysicalMaterial color="#dff0ff" transparent opacity={0.34} roughness={0.05} side={THREE.DoubleSide} /></mesh>
        </group>
      </group></group>
    </group>
  );
}

/* ── Screw gauge ────────────────────────────────────────────────────────────── */

const US = 0.06;              // scene units per millimetre
const X_B = 34;               // the sleeve's zero, mm from the anvil face

export function ScrewScene({ cfg, useStore }) {
  const thimble = useRef(); const spindle = useRef(); const wire = useRef(); const sheet = useRef(); const stack = useRef(); const scale = useRef();
  const instrument = useStore((s) => s.instrument);
  const inst = cfg.instruments[instrument];
  const sleeveTicks = useMemo(() => Array.from({ length: 52 }, (_, i) => ({ at: i * 0.5 * 1.0, h: i % 2 === 0 ? 0.55 : 0.32, label: i % 10 === 0 ? i / 2 : undefined })), []);
  const sleeve = useRuling({ lengthMm: 26, pxPerMm: 60, ticks: sleeveTicks, height: 60, baseline: 'top' });
  const ringTicks = useMemo(() => Array.from({ length: inst.n }, (_, k) => ({ at: (k / inst.n) * 26, h: k % 5 === 0 ? 0.6 : 0.36, label: k % 5 === 0 ? k : undefined })), [inst]);
  const circ = useRuling({ lengthMm: 26, pxPerMm: 40, ticks: ringTicks, height: 96, bg: '#c7cdd8', baseline: 'top' });
  const frameGeo = useMemo(() => new THREE.TorusGeometry(21 * US, 3.3 * US, 16, 72, Math.PI), []);

  useFrame(() => {
    const s = useStore.getState(); const v = viewOf(cfg, s); const g = v.rest.gap; const w = v.w; const sp = v.spec;
    const edge = X_B + g + v.e + v.shift;
    if (thimble.current) { thimble.current.position.x = edge * US; thimble.current.rotation.x = ((g + v.e + v.shift) / inst.pitch) * Math.PI * 2; }
    if (spindle.current) { spindle.current.position.x = ((g + edge) / 2) * US; spindle.current.scale.x = Math.max(0.001, edge - g) * US; }
    if (scale.current) scale.current.position.x = (X_B + 13) * US;
    const kind = sp?.shape;
    for (const ref of [wire, sheet, stack]) if (sp?.color && ref.current && ref.current.material.userData.c !== sp.color) { ref.current.material.color.set(sp.color); ref.current.material.userData.c = sp.color; }
    if (wire.current) { wire.current.visible = kind === 'wire' && v.dim; wire.current.scale.set(Math.max(0.05, w) * US / 2, 1, Math.max(0.05, w) * US / 2); wire.current.position.set(g * US / 2, 0, 0); }
    if (sheet.current) { sheet.current.visible = kind === 'sheet' && v.dim; sheet.current.scale.set(Math.max(0.05, w) * US, 1, 1); sheet.current.position.set(g * US / 2, 0, 0); }
    if (stack.current) { stack.current.visible = kind === 'stack' && v.dim; stack.current.scale.set(Math.max(0.05, w) * US, 1, 1); stack.current.position.set(g * US / 2, 0, 0); }
  });

  return (
    <group position={[-0.3, 0, 0]}>
      <Studio benchRadius={7} shadowScale={10} benchColour="#171f2e" />
      <group position={[0, 1.2, 0]}>
        {/* The frame, the anvil, the sleeve with its scale, the thimble with its. */}
        <mesh geometry={frameGeo} position={[13 * US, 0, 0]} rotation-z={Math.PI} scale={[1, 1, 1.8]}><meshStandardMaterial color="#2a3342" metalness={0.45} roughness={0.5} /></mesh>
        <mesh position={[-4 * US, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[4.2 * US, 4.2 * US, 8 * US, 32]} /><meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.25} /></mesh>
        <group ref={spindle}><mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[2.2 * US, 2.2 * US, 1, 28]} /><meshStandardMaterial color={STEEL} metalness={0.95} roughness={0.18} /></mesh></group>
        <mesh position={[(X_B + 13) * US, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[5.4 * US, 5.4 * US, 26 * US, 36]} /><meshStandardMaterial color="#d6dbe4" metalness={0.7} roughness={0.3} /></mesh>
        <group ref={scale} position={[(X_B + 13) * US, 0, 0]}>
          <mesh position={[0, 5.5 * US, 0.1 * US]} rotation-x={-0.0}><planeGeometry args={[26 * US, 5 * US]} /><meshStandardMaterial map={sleeve} roughness={0.5} metalness={0.3} /></mesh>
        </group>
        <group ref={thimble} position={[X_B * US, 0, 0]}>
          <mesh position={[11 * US, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[8.4 * US, 8.4 * US, 22 * US, 56]} /><meshStandardMaterial map={circ} roughness={0.5} metalness={0.35} /></mesh>
          <mesh position={[24 * US, 0, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[6 * US, 6.5 * US, 7 * US, 24]} /><meshStandardMaterial color="#39414f" metalness={0.5} roughness={0.55} /></mesh>
        </group>
        {/* The specimen between anvil and spindle. */}
        <mesh ref={wire} visible={false} rotation-x={Math.PI / 2}><cylinderGeometry args={[1, 1, 16 * US, 24]} /><meshStandardMaterial color="#b87333" metalness={0.9} roughness={0.28} /></mesh>
        <mesh ref={sheet} visible={false}><boxGeometry args={[1, 14 * US, 18 * US]} /><meshStandardMaterial color="#b9c2cf" metalness={0.9} roughness={0.3} /></mesh>
        <mesh ref={stack} visible={false}><boxGeometry args={[1, 14 * US, 18 * US]} /><meshStandardMaterial color="#f4f1e8" roughness={0.9} /></mesh>
      </group>
    </group>
  );
}
