/**
 * StandardBench — the scene for every "make up a standard solution" bench: a balance with a
 * weighing bottle on the left (the shared balance scene), and on the right a volumetric
 * flask with a funnel, a ring scratched round its neck, undissolved crystals on its bottom, a
 * wash bottle whose jet runs when water goes in, and the stopper. The level in the neck is the
 * state's, to the tenth of a millimetre; the ring is where the mark is.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../three/Studio.jsx';
import { Vessel } from '../three/Vessel.jsx';
import { GlassMaterial } from '../three/Glass.jsx';
import { setLiquid } from '../three/LiquidMaterial.jsx';
import { volumetricFlaskProfile, heightAtVolume } from '../three/profiles.js';
import { BalanceBench } from '../balance/BalanceScene.jsx';
import { FLASKS, mmPerMl } from './standard.js';

/** A 250 mL flask: a bulb holding 245 mL and a neck 12.5 mm across; the others are this, scaled. */
const FLASK = volumetricFlaskProfile({ rBulb: 0.3894, rNeck: 0.0625, hNeck: 0.95 });
const NECK_TOP = FLASK[FLASK.length - 1][1];
const MARK_Y = heightAtVolume(FLASK, 250);
const FLASK_X = 1.05;
const SLOTS = { bottle: [0.12, 0.62] };

export function StandardBench({ useStore }) {
  const liquid = useRef(); const root = useRef(); const funnel = useRef(); const stopper = useRef(); const jet = useRef(); const ring = useRef();
  const anim = useMemo(() => ({ water: 0, t: -1 }), []);

  useFrame((state, dtRaw) => {
    const s = useStore.getState(); const dt = Math.min(dtRaw, 1 / 20);
    const b = s.batch;
    const k = (b.flaskMl / 250) ** (1 / 3);
    if (root.current) root.current.scale.setScalar(k);
    /* The liquid in the unscaled flask: its volume is the real volume over k³. The level then
       follows the true meniscus, so a millimetre of neck is a millimetre. */
    const level = heightAtVolume(FLASK, (b.water * (b.flaskMl === 250 ? 1 : 1)) / k ** 3);
    const markY = heightAtVolume(FLASK, b.V20 / k ** 3);
    setLiquid(liquid.current, {
      time: state.clock.elapsedTime, topY: level, absorb: [0.93, 0.97, 1], meniscus: 0.012,
      bed: b.solid > 0 ? [0.97, 0.97, 0.95, Math.min(0.12, 0.012 + b.solid * 3.2)] : [1, 1, 1, 0],
      precip: [1, 1, 1, 0],
    });
    if (ring.current) ring.current.position.y = markY;
    if (funnel.current) funnel.current.visible = b.funnelIn && !b.stoppered;
    if (stopper.current) stopper.current.visible = b.stoppered;
    /* A jet from the wash bottle whenever the water goes up. */
    if (b.water > anim.water + 1e-6) { anim.t = 0; }
    anim.water = b.water;
    if (anim.t >= 0) {
      anim.t += dt;
      if (jet.current) { jet.current.visible = anim.t < 0.7; jet.current.scale.y = Math.max(0.01, Math.min(1, anim.t / 0.15)); }
      if (anim.t > 0.7) anim.t = -1;
    }
  });

  const neckR = 0.0625;
  return (
    <group>
      <Studio benchRadius={5} shadowScale={8} benchColour="#1a2333" />
      <group scale={0.78}>
        <BalanceBench useStore={useStore} slots={SLOTS} beam={false} />

        {/* The jar of solid on the bench, and the spatula. */}
        <group position={[0.12, 0, -0.1]}>
          <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.2, 0.2, 0.34, 32]} /><GlassMaterial thickness={0.1} /></mesh>
          <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.185, 0.185, 0.24, 28]} /><meshStandardMaterial color="#f4f5f8" roughness={0.9} /></mesh>
          <mesh position={[0, 0.37, 0]}><cylinderGeometry args={[0.21, 0.21, 0.06, 28]} /><meshStandardMaterial color="#2a3446" roughness={0.5} /></mesh>
        </group>
        <mesh position={[0.5, 0.01, 0.1]} rotation-y={0.5}><boxGeometry args={[0.38, 0.012, 0.04]} /><meshStandardMaterial color="#c4cad4" metalness={0.8} roughness={0.3} /></mesh>

        {/* The flask. */}
        <group position={[FLASK_X, 0, 0]}>
          <group ref={root}>
            <Vessel profile={FLASK} liquidRef={liquid} />
            <mesh ref={ring} position={[0, MARK_Y, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[neckR + 0.014, 0.0035, 8, 40]} /><meshBasicMaterial color="#ef4444" />
            </mesh>
            <group ref={funnel} position={[0, NECK_TOP + 0.04, 0]}>
              <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.3, 0.06, 0.28, 36, 1, true]} /><GlassMaterial thickness={0.06} /></mesh>
              <mesh position={[0, -0.02, 0]}><cylinderGeometry args={[0.04, 0.04, 0.2, 14, 1, true]} /><GlassMaterial thickness={0.04} /></mesh>
            </group>
            <mesh ref={stopper} position={[0, NECK_TOP + 0.04, 0]} visible={false}>
              <cylinderGeometry args={[neckR + 0.03, neckR - 0.005, 0.1, 20]} /><meshStandardMaterial color="#c9ced8" roughness={0.3} transparent opacity={0.9} />
            </mesh>
            <mesh ref={jet} position={[0.42, NECK_TOP + 0.4, 0]} visible={false} rotation-z={0.9}>
              <cylinderGeometry args={[0.012, 0.012, 0.55, 8]} /><meshStandardMaterial color="#bfdcff" transparent opacity={0.7} />
            </mesh>
          </group>
        </group>

        {/* The wash bottle. */}
        <group position={[FLASK_X + 0.82, 0, 0.1]}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.12, 0.12, 0.4, 28]} /><meshStandardMaterial color="#f1f5fa" roughness={0.4} transparent opacity={0.88} /></mesh>
          <mesh position={[-0.05, 0.5, 0]} rotation-z={0.6}><cylinderGeometry args={[0.012, 0.012, 0.28, 8]} /><meshStandardMaterial color="#f1f5fa" /></mesh>
          <mesh position={[0, 0.42, 0]}><cylinderGeometry args={[0.04, 0.07, 0.06, 14]} /><meshStandardMaterial color="#38bdf8" roughness={0.5} /></mesh>
        </group>
      </group>
    </group>
  );
}

export { FLASKS, mmPerMl };
export default StandardBench;
