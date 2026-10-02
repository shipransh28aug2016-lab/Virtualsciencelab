/**
 * CommonIonBench — the bench for XI-CHE-C04.
 *
 * A balance with a weighing boat, a beaker of acid on a magnetic stirrer, a
 * thermometer and the electrode. The scene reads the store and draws it: the
 * boat holds what is on the balance, the pile on the bottom of the beaker is
 * the salt that has NOT yet dissolved and shrinks as it does, the thread of the
 * thermometer drops as the salt takes heat, and the liquid takes the indicator's
 * colour when indicator is in use.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../../../../../shared/three/Studio.jsx';
import { Vessel } from '../../../../../shared/three/Vessel.jsx';
import { Electrode } from '../../../../../shared/three/PhApparatus.jsx';
import { Thermometer } from '../../../../../shared/three/Thermometer.jsx';
import { setLiquid } from '../../../../../shared/three/LiquidMaterial.jsx';
import { cylinderProfile, heightAtVolume } from '../../../../../shared/three/profiles.js';
import { sceneAbsorption } from '../../../../../shared/chem/spectra.js';
import { useCommonIonEngine } from '../engine/useCommonIonEngine.js';
import { BEAKER_ML, beakerT } from '../engine/commonion.js';

const BEAKER = cylinderProfile({ r: 0.24, h: 0.46 });
const H50 = heightAtVolume(BEAKER, BEAKER_ML);
const CLEAR = [1, 1, 1];
const BALANCE_X = -1.05;
const ELECTRODE_IN = { x: 0.06, y: 0.34 };
const ELECTRODE_OUT = { x: 0.85, y: 1.1 };

/** The balance's display, drawn onto a texture so the number is part of the picture. */
function useDisplay() {
  return useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 192; canvas.height = 64;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const draw = (g) => {
      const c = canvas.getContext('2d');
      c.fillStyle = '#0b1a12'; c.fillRect(0, 0, 192, 64);
      c.fillStyle = '#7dffb0'; c.font = 'bold 40px monospace'; c.textAlign = 'right'; c.textBaseline = 'middle';
      c.fillText(`${g.toFixed(2)} g`, 184, 34);
      tex.needsUpdate = true;
    };
    draw(0);
    return { tex, draw };
  }, []);
}

export function CommonIonBench() {
  const liquid = useRef(); const pile = useRef(); const boatPile = useRef(); const electrode = useRef(); const magnet = useRef(); const led = useRef();
  const display = useDisplay();
  const anim = useMemo(() => ({ boat: -1, ex: ELECTRODE_OUT.x, ey: ELECTRODE_OUT.y, spin: 0 }), []);
  useEffect(() => () => display.tex.dispose(), [display]);

  useFrame((state, dtRaw) => {
    const s = useCommonIonEngine.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const t = state.clock.elapsedTime;

    const colour = s.method === 'universal' && s.world.universal ? s.world.universal.colour.linear : CLEAR;
    setLiquid(liquid.current, { time: t, absorb: sceneAbsorption(colour, 3), topY: H50 });

    /* What has not dissolved lies on the bottom; what is on the balance sits in the boat. */
    if (pile.current) {
      pile.current.visible = s.solid > 1e-3;
      const r = 0.04 + 0.16 * Math.min(1, Math.cbrt(s.solid / 3));
      pile.current.scale.set(r, r * 0.4, r);
    }
    if (boatPile.current) {
      boatPile.current.visible = s.boat > 0;
      const r = 0.02 + 0.06 * Math.min(1, Math.cbrt(s.boat / 5));
      boatPile.current.scale.set(r, r * 0.55, r);
    }
    if (anim.boat !== s.boat) { anim.boat = s.boat; display.draw(s.boat); }

    const want = s.meter === 'in' && s.method === 'meter' ? ELECTRODE_IN : ELECTRODE_OUT;
    anim.ex += (want.x - anim.ex) * (1 - Math.exp(-dt * 5));
    anim.ey += (want.y - anim.ey) * (1 - Math.exp(-dt * 5));
    if (electrode.current) { electrode.current.position.x = anim.ex; electrode.current.position.y = anim.ey; }

    anim.spin += s.stirrer === 'on' ? dt * 14 : 0;
    if (magnet.current) magnet.current.rotation.y = anim.spin;
    if (led.current) led.current.material.emissiveIntensity = s.stirrer === 'on' ? 2.2 : 0.05;
  });

  return (
    <group>
      <Studio benchRadius={4} shadowScale={7} />

      {/* Stirrer plate and beaker. */}
      <mesh position={[0, -0.04, 0]}>
        <cylinderGeometry args={[0.46, 0.49, 0.08, 40]} />
        <meshStandardMaterial color="#1c2433" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh ref={magnet} position={[0, 0.004, 0]}>
        <boxGeometry args={[0.3, 0.006, 0.045]} />
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </mesh>
      <mesh ref={led} position={[0.39, -0.04, 0.17]}>
        <sphereGeometry args={[0.016, 12, 12]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.05} />
      </mesh>
      <Vessel profile={BEAKER} liquidRef={liquid} position={[0, 0, 0]} />
      <mesh ref={pile} position={[-0.06, 0.012, 0.04]} visible={false}>
        <sphereGeometry args={[1, 14, 10]} />
        <meshStandardMaterial color="#f4f6fa" roughness={0.85} />
      </mesh>
      <Thermometer getC={() => beakerT(useCommonIonEngine.getState())} min={10} max={45} length={0.95} position={[-0.13, 0.03, -0.06]} />

      {/* The balance. */}
      <group position={[BALANCE_X, 0, 0]}>
        <mesh position={[0, 0.04, 0]}>
          <boxGeometry args={[0.78, 0.08, 0.52]} />
          <meshStandardMaterial color="#cfd5df" roughness={0.45} metalness={0.2} />
        </mesh>
        <mesh position={[0, 0.088, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.012, 32]} />
          <meshStandardMaterial color="#8c96a6" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.113, 0]} scale={[1, 0.28, 0.75]}>
          <sphereGeometry args={[0.13, 20, 12]} />
          <meshStandardMaterial color="#e7eaf0" roughness={0.5} />
        </mesh>
        <mesh ref={boatPile} position={[0, 0.135, 0]} visible={false}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshStandardMaterial color="#f7f8fb" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.062, 0.262]} rotation-x={-0.35}>
          <planeGeometry args={[0.46, 0.15]} />
          <meshBasicMaterial map={display.tex} toneMapped={false} />
        </mesh>
      </group>

      <Electrode ref={electrode} position={[ELECTRODE_OUT.x, ELECTRODE_OUT.y, 0]} />
    </group>
  );
}

export default CommonIonBench;
