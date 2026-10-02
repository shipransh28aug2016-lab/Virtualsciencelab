/**
 * The XI-CHE-F01 scene: the shared tube rack — seven tubes (the sixth of which is the lime water),
 * the shelf of reagent bottles, the two baths — with a Bunsen burner and a wire to the left, strips
 * of litmus to the right, the jar of the unknown salt in front, and a delivery tube that runs from
 * the active tube to the lime water when it is connected. What the flame looks like is the emission
 * spectrum's colour (engine/salt.js flameNow), not a choice.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TubeRack } from '../../../../../shared/tubes/TubeRack.jsx';
import { GlassMaterial } from '../../../../../shared/three/Glass.jsx';
import { FlameShaderMaterial } from '../../../../../shared/three/FlameShaderMaterial.jsx';
import { useSalt } from '../engine/useSalt.js';
import { CFG, flameNow, saltOfBottle } from '../engine/salt.js';

void FlameShaderMaterial;
const N = CFG.tubes.length;
const PITCH = 0.28;
const tubeX = (i) => (i - (N - 1) / 2) * PITCH;
const TUBE_Z = 0.16;
const BURNER = [-2.05, 0, 0.35];
const STRIPS = [1.95, 0, 0.35];

/** A label with a number on it, as a texture. */
function useNumberTexture(text, bg = '#f8fafc', fg = '#0b1220') {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    if (g) { g.fillStyle = bg; g.fillRect(0, 0, 128, 128); g.fillStyle = fg; g.font = '700 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [text, bg, fg]);
}

function SaltJar() {
  const bottle = useSalt((s) => s.ctx.bottle);
  const salt = saltOfBottle(bottle);
  const map = useNumberTexture(String(bottle));
  return (
    <group position={[1.55, 0, 0.78]}>
      <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.17, 0.17, 0.34, 28]} /><GlassMaterial thickness={0.08} /></mesh>
      <mesh position={[0, 0.11, 0]}><cylinderGeometry args={[0.155, 0.155, 0.21, 24]} /><meshStandardMaterial color={salt.hex} roughness={0.55} /></mesh>
      <mesh position={[0, 0.36, 0]}><cylinderGeometry args={[0.18, 0.18, 0.05, 24]} /><meshStandardMaterial color="#27324a" roughness={0.45} /></mesh>
      <mesh position={[0, 0.17, 0.172]}><planeGeometry args={[0.15, 0.15]} /><meshBasicMaterial map={map} toneMapped={false} /></mesh>
    </group>
  );
}

function FlameStation() {
  const flameMat = useRef(); const loop = useRef(); const glass = useRef(); const bead = useRef();
  const tint = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const s = useSalt.getState();
    const f = flameNow(s);
    const m = flameMat.current;
    if (m) {
      m.uTime = state.clock.elapsedTime;
      tint.setRGB(f.srgb[0], f.srgb[1], f.srgb[2], THREE.SRGBColorSpace);
      m.uTint = tint;
      m.uTintAmt = f.inFlame ? Math.min(1, 0.25 + 2.4 * f.brightness) : 0;
      m.uLit = 1; m.uPower = 0.55; m.uAir = 1;
    }
    if (loop.current) {
      const want = f.inFlame ? 0.0 : 0.62;
      loop.current.position.y += ((want) - loop.current.position.y) * Math.min(1, 0.15);
    }
    if (bead.current) {
      bead.current.material.emissive.set(f.inFlame ? tint : '#000000');
      bead.current.material.emissiveIntensity = f.inFlame ? 0.6 + 2 * f.brightness : 0;
    }
    if (glass.current) glass.current.visible = s.loop.filter === 'cobalt';
  });
  return (
    <group position={BURNER}>
      <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.16, 0.2, 0.04, 28]} /><meshStandardMaterial color="#2a3040" metalness={0.7} roughness={0.45} /></mesh>
      <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.03, 0.034, 0.26, 20]} /><meshStandardMaterial color="#39414f" metalness={0.85} roughness={0.35} /></mesh>
      <mesh position={[0, 0.3 + 0.28, 0]}>
        <planeGeometry args={[0.36, 0.56]} />
        <flameShaderMaterial ref={flameMat} key={FlameShaderMaterial.key} />
      </mesh>
      {/* The wire on its holder: it comes down into the flame when a test is running. */}
      <group ref={loop} position={[0.0, 0.62, 0]}>
        <mesh position={[0.55, 0.78, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.012, 0.012, 1.1, 8]} /><meshStandardMaterial color="#c8ced8" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[0.0, 0.63, 0]} rotation-z={0.0}><cylinderGeometry args={[0.004, 0.004, 0.3, 6]} /><meshStandardMaterial color="#9aa3b2" metalness={0.9} roughness={0.25} /></mesh>
        <mesh ref={bead} position={[0, 0.48, 0]}><torusGeometry args={[0.022, 0.0045, 6, 14]} /><meshStandardMaterial color="#9aa3b2" metalness={0.9} roughness={0.25} emissive="#000000" /></mesh>
      </group>
      {/* A square of cobalt-blue glass, held in front of the flame when it is asked for. */}
      <mesh ref={glass} position={[0, 0.55, 0.42]} visible={false}><planeGeometry args={[0.55, 0.5]} /><meshStandardMaterial color="#1536a8" transparent opacity={0.55} roughness={0.15} side={THREE.DoubleSide} /></mesh>
    </group>
  );
}

function Strips() {
  const red = useRef(); const blue = useRef(); const fumes = useRef();
  const puff = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ ph: i * 0.13, dx: ((i * 37) % 10) / 10 - 0.5 })), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame((state) => {
    const s = useSalt.getState();
    const idx = Math.max(0, s.tubes.findIndex((t) => t.id === s.active));
    const age = (at) => s.elapsed - at;
    for (const [ref, kind, home] of [[red, 'red', -0.09], [blue, 'blue', 0.09]]) {
      const g = ref.current; if (!g) continue;
      const held = s.paper && s.paper.kind === kind && age(s.paper.at) >= 0 && age(s.paper.at) < 8;
      const tx = held ? tubeX(Math.max(0, s.tubes.findIndex((t) => t.id === s.paper.tube))) : STRIPS[0] + home;
      const ty = held ? 1.04 : 0.3; const tz = held ? TUBE_Z : STRIPS[2];
      g.position.x += (tx - g.position.x) * 0.15; g.position.y += (ty - g.position.y) * 0.15; g.position.z += (tz - g.position.z) * 0.15;
      const mat = g.children[0].material;
      const base = kind === 'red' ? '#d83850' : '#3a52c8';
      if (held) col.set(s.paper.hex); else col.set(base);
      mat.color.lerp(col, 0.2);
    }
    /* White smoke at the mouth of the tube where the HCl rod was held. */
    if (fumes.current) {
      const on = s.rod && s.rod.fumes && age(s.rod.at) >= 0 && age(s.rod.at) < 6;
      fumes.current.visible = Boolean(on);
      if (on) {
        const x = tubeX(Math.max(0, s.tubes.findIndex((t) => t.id === s.rod.tube)));
        fumes.current.children.forEach((m, j) => {
          const p = puff[j]; const ph = ((state.clock.elapsedTime * 0.5 + p.ph) % 1);
          m.position.set(x + p.dx * 0.12 * (1 + ph), 1.04 + ph * 0.3, TUBE_Z);
          m.scale.setScalar(0.4 + ph * 1.2); m.material.opacity = 0.5 * (1 - ph);
        });
      }
    }
    void idx;
  });
  return (
    <group>
      <group ref={red} position={[STRIPS[0] - 0.09, 0.3, STRIPS[2]]}><mesh><boxGeometry args={[0.035, 0.38, 0.006]} /><meshStandardMaterial color="#d83850" roughness={0.9} /></mesh></group>
      <group ref={blue} position={[STRIPS[0] + 0.09, 0.3, STRIPS[2]]}><mesh><boxGeometry args={[0.035, 0.38, 0.006]} /><meshStandardMaterial color="#3a52c8" roughness={0.9} /></mesh></group>
      <mesh position={[STRIPS[0], 0.08, STRIPS[2]]}><cylinderGeometry args={[0.11, 0.1, 0.16, 20, 1, true]} /><GlassMaterial thickness={0.04} /></mesh>
      <group ref={fumes} visible={false}>{puff.map((p, j) => <mesh key={j}><sphereGeometry args={[0.05, 10, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} /></mesh>)}</group>
    </group>
  );
}

/** The delivery tube, from the stopper in the active tube over to the lime water. */
function Delivery() {
  const delivery = useSalt((s) => s.delivery);
  const active = useSalt((s) => s.tubes.findIndex((t) => t.id === s.delivery));
  const geo = useMemo(() => {
    if (!delivery || active < 0) return null;
    const x0 = tubeX(active); const x1 = tubeX(N - 1);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x0, 1.0, TUBE_Z), new THREE.Vector3(x0, 1.16, TUBE_Z), new THREE.Vector3((x0 + x1) / 2, 1.22, TUBE_Z),
      new THREE.Vector3(x1, 1.16, TUBE_Z), new THREE.Vector3(x1, 0.9, TUBE_Z), new THREE.Vector3(x1, 0.22, TUBE_Z),
    ]);
    return { tube: new THREE.TubeGeometry(curve, 48, 0.012, 8, false), x0 };
  }, [delivery, active]);
  if (!geo) return null;
  return (
    <group>
      <mesh geometry={geo.tube}><meshStandardMaterial color="#cfe0f2" transparent opacity={0.65} roughness={0.1} /></mesh>
      <mesh position={[geo.x0, 0.97, TUBE_Z]}><cylinderGeometry args={[0.1, 0.082, 0.07, 18]} /><meshStandardMaterial color="#b9503a" roughness={0.7} /></mesh>
    </group>
  );
}

export function SaltBench() {
  return (
    <group>
      <TubeRack store={useSalt} cfg={CFG} />
      <FlameStation />
      <Strips />
      <SaltJar />
      <Delivery />
    </group>
  );
}

export default SaltBench;
