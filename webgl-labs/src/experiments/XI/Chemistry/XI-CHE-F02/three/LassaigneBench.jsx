/**
 * The XI-CHE-F02 scene: the shared tube rack (four tubes, the shelf of reagents, two baths), and to
 * its left a fusion tube clamped over a Bunsen burner. The tube glows with the colour of its
 * temperature (nothing below about 500 °C, a dull red, cherry red, orange); the sodium is a silver
 * globule that melts and then fumes; a flash goes up when the compound is dropped on; the tube goes
 * into a dish of water when it is plunged, and the filtered extract collects in a flask.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { TubeRack } from '../../../../../shared/tubes/TubeRack.jsx';
import { GlassMaterial } from '../../../../../shared/three/Glass.jsx';
import { FlameShaderMaterial } from '../../../../../shared/three/FlameShaderMaterial.jsx';
import { useLassaigne } from '../engine/useLassaigne.js';
import { CFG, sodiumState, NA_FUME } from '../engine/lassaigne.js';

void FlameShaderMaterial;
const BURNER = [-2.5, 0, 0.55];
const PIVOT = [-2.754, 1.02, 0.55];
const TILT = 0.6;
const DISH = [-1.55, 0, 0.95];
const FLASK = [-0.95, 0, 1.0];

/** The colour of a hot glass tube: nothing visible below about 500 °C, then dull red to orange. */
const glow = (T) => {
  const k = Math.max(0, Math.min(1, (T - 480) / 450));
  return { rgb: [0.35 + 0.65 * k, 0.04 + 0.5 * k * k, 0.02 + 0.18 * k * k * k], k };
};

function FusionStation() {
  const flameMat = useRef(); const tube = useRef(); const glowMesh = useRef(); const sodium = useRef(); const powder = useRef(); const puffs = useRef(); const flash = useRef();
  const dishWater = useRef(); const steam = useRef(); const flaskLiquid = useRef(); const funnel = useRef();
  const anim = useMemo(() => ({ plungeT: -1, addedSeen: false, flashT: -1, col: new THREE.Color() }), []);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ ph: i * 0.1, dx: ((i * 53) % 10) / 10 - 0.5 })), []);

  useFrame((state, dtRaw) => {
    const s = useLassaigne.getState(); const fz = s.fz; const t = state.clock.elapsedTime; const dt = Math.min(dtRaw, 1 / 20);
    const m = flameMat.current;
    if (m) { m.uTime = t; m.uLit = fz.flame ? 1 : 0; m.uPower = 0.6; m.uAir = 1; }
    /* The tube: glowing with its temperature; in the dish after the plunge. */
    if (fz.plunged && anim.plungeT < 0) anim.plungeT = 0;
    if (!fz.plunged) anim.plungeT = -1;
    if (anim.plungeT >= 0) anim.plungeT += dt;
    const u = anim.plungeT < 0 ? 0 : Math.min(1, anim.plungeT / 0.7);
    if (tube.current) {
      tube.current.visible = !(fz.plunged && anim.plungeT > 0.9);
      tube.current.position.set(PIVOT[0] + u * (DISH[0] - PIVOT[0] + 0.1), PIVOT[1] + (u < 0.6 ? 0.08 * Math.sin(u / 0.6 * Math.PI) : 0) - u * 0.62, PIVOT[2] + u * (DISH[2] - PIVOT[2]));
      tube.current.rotation.z = TILT * (1 - 0.6 * u);
    }
    const g = glow(fz.T);
    if (glowMesh.current) { glowMesh.current.material.emissive.setRGB(g.rgb[0], g.rgb[1], g.rgb[2]); glowMesh.current.material.emissiveIntensity = fz.plunged ? 0 : 0.2 + 2.0 * g.k; glowMesh.current.material.opacity = 0.18 + 0.55 * g.k; }
    const st = sodiumState(fz);
    if (sodium.current) {
      sodium.current.visible = fz.na > 0.01 && !fz.plunged;
      const molten = st !== 'solid';
      sodium.current.scale.set(1, molten ? 0.75 : 1, 1); sodium.current.scale.multiplyScalar(0.6 + 0.4 * Math.min(1, fz.na / (fz.naMg / 22.99)));
      sodium.current.material.color.set(st === 'vapour' ? '#d9a05a' : '#cfd5de'); sodium.current.material.emissiveIntensity = st === 'vapour' ? 0.9 : 0.05;
    }
    if (powder.current) powder.current.visible = fz.added && fz.progress < 0.95 && !fz.plunged;
    /* Fumes of sodium vapour rising from the mouth of the tube; a flash when the compound goes on. */
    if (fz.added && !anim.addedSeen) { anim.addedSeen = true; anim.flashT = 0; }
    if (!fz.added) anim.addedSeen = false;
    if (anim.flashT >= 0) anim.flashT += dt;
    if (flash.current) { flash.current.visible = anim.flashT >= 0 && anim.flashT < 0.8 && fz.T > 250; flash.current.scale.setScalar(0.5 + 2 * (anim.flashT < 0 ? 0 : anim.flashT)); flash.current.material.opacity = Math.max(0, 0.9 - anim.flashT * 1.2); }
    if (puffs.current) {
      const on = !fz.plunged && (st === 'vapour') && fz.na > 0.05;
      puffs.current.visible = on;
      if (on) puffs.current.children.forEach((p, j) => { const sd = seeds[j]; const ph = ((t * 0.35 + sd.ph) % 1); p.position.set(-0.05 - ph * 0.3 + sd.dx * 0.06, 0.45 + ph * 0.45, 0); p.scale.setScalar(0.4 + ph * 1.4); p.material.opacity = 0.35 * (1 - ph); });
    }
    /* The dish: water, clouded after the plunge, with a puff of steam as the tube goes in. */
    if (dishWater.current) { dishWater.current.material.opacity = 0.55; anim.col.set(fz.plunged ? '#c9d0d8' : '#a9cdee'); dishWater.current.material.color.lerp(anim.col, 0.1); }
    if (steam.current) {
      const on = fz.plunged && anim.plungeT > 0.5 && anim.plungeT < 4;
      steam.current.visible = on;
      if (on) steam.current.children.forEach((p, j) => { const sd = seeds[j]; const ph = ((anim.plungeT * 0.5 + sd.ph) % 1); p.position.set(DISH[0] + sd.dx * 0.2, 0.2 + ph * 0.6, DISH[2] + sd.dx * 0.1); p.scale.setScalar(0.5 + ph * 1.6); p.material.opacity = 0.35 * (1 - ph); });
    }
    if (funnel.current) funnel.current.visible = fz.filtered;
    if (flaskLiquid.current) { flaskLiquid.current.visible = fz.filtered; const h = 0.02 + 0.2 * Math.min(1, (fz.extractLeft + 8) / 15); flaskLiquid.current.scale.y = h / 0.2; flaskLiquid.current.position.y = 0.03 + h / 2; }
  });

  return (
    <group>
      {/* The burner and its flame. */}
      <group position={BURNER}>
        <mesh position={[0, 0.02, 0]}><cylinderGeometry args={[0.16, 0.2, 0.04, 28]} /><meshStandardMaterial color="#2a3040" metalness={0.7} roughness={0.45} /></mesh>
        <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.03, 0.034, 0.26, 20]} /><meshStandardMaterial color="#39414f" metalness={0.85} roughness={0.35} /></mesh>
        <mesh position={[0, 0.3 + 0.26, 0]}><planeGeometry args={[0.34, 0.52]} /><flameShaderMaterial ref={flameMat} key={FlameShaderMaterial.key} /></mesh>
      </group>
      {/* The stand and the clamp. */}
      <mesh position={[-3.15, 0.02, 0.55]}><boxGeometry args={[0.5, 0.04, 0.35]} /><meshStandardMaterial color="#2a3040" metalness={0.6} roughness={0.5} /></mesh>
      <mesh position={[-3.15, 0.65, 0.55]}><cylinderGeometry args={[0.015, 0.015, 1.3, 10]} /><meshStandardMaterial color="#aeb6c4" metalness={0.8} roughness={0.3} /></mesh>
      <mesh position={[-2.95, 1.12, 0.55]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.01, 0.01, 0.4, 8]} /><meshStandardMaterial color="#aeb6c4" metalness={0.8} roughness={0.3} /></mesh>
      {/* The fusion tube: closed end low and towards the flame, mouth up and away. */}
      <group ref={tube} position={PIVOT} rotation-z={TILT}>
        <mesh><cylinderGeometry args={[0.05, 0.05, 0.9, 20, 1, true]} /><GlassMaterial thickness={0.03} /></mesh>
        <mesh position={[0, -0.45, 0]}><sphereGeometry args={[0.05, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} /><GlassMaterial thickness={0.03} /></mesh>
        <mesh ref={glowMesh} position={[0, -0.25, 0]}><cylinderGeometry args={[0.046, 0.046, 0.4, 16]} /><meshStandardMaterial color="#220704" emissive="#ff3000" emissiveIntensity={0} transparent opacity={0.2} depthWrite={false} /></mesh>
        <mesh ref={sodium} position={[0, -0.4, 0]}><sphereGeometry args={[0.032, 14, 10]} /><meshStandardMaterial color="#cfd5de" metalness={0.9} roughness={0.25} emissive="#ffb347" emissiveIntensity={0.05} /></mesh>
        <mesh ref={powder} position={[0, -0.36, 0.0]} visible={false}><cylinderGeometry args={[0.03, 0.03, 0.025, 12]} /><meshStandardMaterial color="#f4f1ea" roughness={0.9} /></mesh>
        <mesh ref={flash} position={[0, -0.3, 0]} visible={false}><sphereGeometry args={[0.09, 12, 10]} /><meshBasicMaterial color="#ffd27a" transparent opacity={0.8} depthWrite={false} /></mesh>
        <group ref={puffs} visible={false}>{seeds.map((_, j) => <mesh key={j}><sphereGeometry args={[0.03, 8, 6]} /><meshBasicMaterial color="#e9d6ff" transparent opacity={0.3} depthWrite={false} /></mesh>)}</group>
      </group>
      {/* The dish of water, and steam. */}
      <group position={DISH}>
        <mesh position={[0, 0.05, 0]}><cylinderGeometry args={[0.34, 0.26, 0.1, 32, 1, true]} /><GlassMaterial thickness={0.05} /></mesh>
        <mesh ref={dishWater} position={[0, 0.05, 0]}><cylinderGeometry args={[0.3, 0.26, 0.07, 28]} /><meshStandardMaterial color="#a9cdee" transparent opacity={0.55} roughness={0.15} /></mesh>
      </group>
      <group ref={steam} visible={false}>{seeds.map((_, j) => <mesh key={j}><sphereGeometry args={[0.05, 8, 6]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} /></mesh>)}</group>
      {/* The funnel, and the flask the clear extract runs into. */}
      <group position={FLASK}>
        <mesh position={[0, 0.14, 0]}><cylinderGeometry args={[0.1, 0.13, 0.28, 24, 1, true]} /><GlassMaterial thickness={0.04} /></mesh>
        <mesh ref={flaskLiquid} position={[0, 0.1, 0]} visible={false}><cylinderGeometry args={[0.115, 0.115, 0.2, 20]} /><meshStandardMaterial color="#efe6b0" transparent opacity={0.6} roughness={0.2} /></mesh>
        <group ref={funnel} visible={false} position={[0, 0.36, 0]}>
          <mesh><cylinderGeometry args={[0.16, 0.025, 0.2, 24, 1, true]} /><GlassMaterial thickness={0.03} /></mesh>
        </group>
      </group>
    </group>
  );
}

export function LassaigneBench() {
  return (
    <group>
      <TubeRack store={useLassaigne} cfg={CFG} />
      <FusionStation />
    </group>
  );
}

void NA_FUME;
export default LassaigneBench;
