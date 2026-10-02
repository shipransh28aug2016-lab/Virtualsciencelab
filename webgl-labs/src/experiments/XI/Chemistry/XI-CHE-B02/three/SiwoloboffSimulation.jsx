/**
 * SiwoloboffSimulation — the bench for XI-CHE-B02.
 *
 * Owns the only render loop. Each frame it advances the engine by the real
 * frame time, then pushes the derived state into the shaders and the bubble
 * field. Nothing here decides anything about the chemistry.
 *
 * The apparatus is Siwoloboff's, and the geometry carries the reasoning:
 *
 *   · the CAPILLARY is inverted, sealed end UP, its mouth about a centimetre
 *     under the surface. The air shut in it is what makes the slow string of
 *     bubbles on the way up, and the space it leaves is what the liquid runs
 *     back into on the way down. It is the readout of the method and its
 *     boiling stone at the same time, which is why taking it away does not
 *     merely blind the experiment — it makes the tube bump;
 *   · the FUSION TUBE is tied against the thermometer BULB, because a bath with
 *     a gradient in it puts two things at different heights at two different
 *     temperatures;
 *   · the BURNER is under the side arm, so the bath stirs itself.
 *
 * Scale: one scene unit is 10 cm.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { useBoilingPointEngine } from '../engine/useBoilingPointEngine.js';
import { BATHS } from '../engine/vapour.js';
import { BathShaderMaterial } from '../../../../../shared/three/BathShaderMaterial.jsx';
import { FlameShaderMaterial } from '../../../../../shared/three/FlameShaderMaterial.jsx';
import { FusionTubeShaderMaterial } from './FusionTubeShaderMaterial.jsx';

void BathShaderMaterial; void FlameShaderMaterial; void FusionTubeShaderMaterial;

/* ── Apparatus, in scene units of 10 cm ───────────────────────────────────── */
const STEM_R = 0.17;
const STEM_BOTTOM = 0.10;
const STEM_TOP = 2.05;
const WALL = 0.014;
const OIL_TOP = 1.80;
const ARM_R = 0.075;

const BULB_Y = 0.92;
const BULB_R = 0.048;

/* The fusion tube: a small test tube, about 6 mm across. */
const TUBE_R = 0.033;
const TUBE_BOTTOM = BULB_Y - 0.09;
const TUBE_H = 0.46;
const LIQUID_H = 0.19;            // ≈ 0.5 mL at this bore

/* The capillary, sealed end up, mouth near the bottom of the charge. */
const CAP_R = 0.009;
const CAP_H = 0.30;
const CAP_BOTTOM = TUBE_BOTTOM + 0.018;

const SCALE_BOTTOM = BULB_Y + BULB_R;
const SCALE_TOP = 2.62;
const SCALE_MAX_C = 250;

/* Bubbles. Instanced, and recycled: a bubble is born at the capillary mouth,
   rises through the charge and is gone at the surface. */
const BUBBLES = 160;

function armCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.00, 0.42, 0),
    new THREE.Vector3(-0.32, 0.34, 0),
    new THREE.Vector3(-0.56, 0.46, 0),
    new THREE.Vector3(-0.60, 1.05, 0),
    new THREE.Vector3(-0.56, 1.52, 0),
    new THREE.Vector3(-0.30, 1.66, 0),
    new THREE.Vector3(0.00, 1.60, 0),
  ], false, 'catmullrom', 0.25);
}

export function SiwoloboffSimulation() {
  const { camera } = useThree();
  const bathMat = useRef();
  const flameMat = useRef();
  const liquidMat = useRef();
  const mercury = useRef();
  const bubbles = useRef();
  const intrusion = useRef();

  const curve = useMemo(() => armCurve(), []);
  const armGlass = useMemo(() => new THREE.TubeGeometry(curve, 96, ARM_R + WALL, 24, false), [curve]);
  const armOil = useMemo(() => new THREE.TubeGeometry(curve, 96, ARM_R, 20, false), [curve]);

  const stemOil = useMemo(() => {
    const h = OIL_TOP - STEM_BOTTOM;
    const g = new THREE.CylinderGeometry(STEM_R, STEM_R, h, 64, 1, false);
    g.translate(0, h / 2, 0);
    return g;
  }, []);

  const chargeGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(TUBE_R * 0.92, TUBE_R * 0.92, LIQUID_H * 1.25, 28, 1, false);
    g.translate(0, (LIQUID_H * 1.25) / 2, 0);
    return g;
  }, []);

  /* Per-bubble state, persistent and mutable: touching React state per frame
     would re-render the HUD sixty times a second for nothing. */
  const swarm = useMemo(() => ({
    y: new Float32Array(BUBBLES),
    r: new Float32Array(BUBBLES),
    theta: new Float32Array(BUBBLES),
    alive: new Uint8Array(BUBBLES),
    next: 0,
    carry: 0,
    gradient: 0,
    bump: 0,
    m: new THREE.Matrix4(),
    p: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    s: new THREE.Vector3(),
  }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const store = useBoilingPointEngine.getState();
    store.tick(dt);

    const s = useBoilingPointEngine.getState();
    const d = s.derived;
    const bath = BATHS[s.bath];
    const t = state.clock.elapsedTime;

    /* ── The bath ───────────────────────────────────────────────────────────
       Schlieren amplitude is the temperature GRADIENT, not the temperature: a
       bath sitting at 150 °C with the flame away is perfectly still. */
    const driving = s.burnerOn ? s.heatingRate / 12 : 0;
    swarm.gradient += (driving - swarm.gradient) * Math.min(1, dt * 0.6);

    if (bathMat.current) {
      const u = bathMat.current.uniforms;
      u.uTime.value = t;
      u.uColour.value.setRGB(...bath.colour);
      u.uTempNorm.value = THREE.MathUtils.clamp((s.bathC - 27) / (bath.maxC - 27), 0, 1);
      u.uGradient.value = swarm.gradient;
      u.uFlow.value = 0.08 + swarm.gradient * 0.55;
      u.uSmoke.value = THREE.MathUtils.clamp((s.bathC - bath.smokesAboveC) / 40, 0, 1);
      u.uDepth.value = STEM_R * 2;
    }

    if (flameMat.current) {
      const u = flameMat.current.uniforms;
      u.uTime.value = t;
      u.uLit.value = s.burnerOn ? 1 : 0;
      u.uPower.value = s.heatingRate / 12;
      u.uAir.value = s.airOpen ? 1 : 0;
    }

    /* ── The charge ─────────────────────────────────────────────────────────
       Agitation is the pressure excess, normalised over a couple of degrees'
       worth of vapour pressure — so the liquid is glassy right up to its
       boiling point and then rolls. */
    const excess = d.vapourPressureMmHg - (d.pressureMmHg + d.headMmHg);
    const agitation = THREE.MathUtils.clamp(excess / 45, 0, 1);
    swarm.bump = Math.max(0, swarm.bump - dt * 1.6);
    if (d.bumped && swarm.bump === 0 && !swarm.bumpedOnce) { swarm.bump = 1; swarm.bumpedOnce = true; }

    const level = THREE.MathUtils.clamp(1 - d.boiledAwayPercent / 100, 0.08, 1);

    if (liquidMat.current) {
      const u = liquidMat.current.uniforms;
      u.uTime.value = t;
      u.uColour.value.setRGB(...d.liquid.colour);
      u.uLevel.value = level;
      u.uHeight.value = LIQUID_H;
      u.uAgitation.value = agitation;
      u.uSuperheat.value = THREE.MathUtils.clamp(d.superheatC / 9, 0, 1);
      u.uBump.value = swarm.bump;
    }

    /* ── The mercury ───────────────────────────────────────────────────────
        Driven by the true reading; rounding to the least count is something
        the student's eye does, not the instrument. */
    if (mercury.current) {
      const frac = THREE.MathUtils.clamp(s.readingC / SCALE_MAX_C, 0, 1);
      const h = Math.max(1e-3, frac * (SCALE_TOP - SCALE_BOTTOM));
      mercury.current.scale.y = h;
      mercury.current.position.y = SCALE_BOTTOM + h / 2;
    }

    /* ── Liquid running back up the capillary ───────────────────────────────
        The reading itself, made visible: once the vapour pressure falls below
        the pressure outside, the gas in the capillary is compressed and liquid
        takes its place. */
    if (intrusion.current) {
      const h = Math.max(1e-4, d.intrusion * CAP_H * 0.8);
      intrusion.current.scale.y = h;
      intrusion.current.position.y = CAP_BOTTOM + h / 2;
      intrusion.current.visible = d.intrusion > 0.004;
    }

    /* ── Bubbles ────────────────────────────────────────────────────────────
        Spawned at the rate the engine reports — slow and occasional while it is
        only the trapped air expanding, a continuous stream once it is vapour —
        and they rise faster and bigger the harder the liquid is boiling. */
    const mesh = bubbles.current;
    if (!mesh) return;

    swarm.carry += d.bubbleRate * dt;
    while (swarm.carry >= 1) {
      swarm.carry -= 1;
      const i = swarm.next;
      swarm.next = (swarm.next + 1) % BUBBLES;
      swarm.alive[i] = 1;
      swarm.y[i] = CAP_BOTTOM + 0.004;
      swarm.r[i] = (0.2 + 0.8 * agitation) * TUBE_R * (0.16 + 0.22 * Math.random());
      swarm.theta[i] = Math.random() * Math.PI * 2;
    }

    const rise = (0.10 + 0.55 * agitation);
    const surface = TUBE_BOTTOM + LIQUID_H * level;

    for (let i = 0; i < BUBBLES; i += 1) {
      if (!swarm.alive[i]) {
        swarm.m.compose(swarm.p.set(0, -99, 0), swarm.q, swarm.s.setScalar(1e-5));
        mesh.setMatrixAt(i, swarm.m);
        continue;
      }
      swarm.y[i] += rise * dt;
      if (swarm.y[i] >= surface) { swarm.alive[i] = 0; continue; }
      /* A bubble wanders as it rises — it is not on rails. */
      swarm.theta[i] += dt * 2.2;
      const wobble = Math.sin(swarm.theta[i]) * TUBE_R * 0.28;
      swarm.p.set(wobble, swarm.y[i], Math.cos(swarm.theta[i] * 0.7) * TUBE_R * 0.22);
      swarm.m.compose(swarm.p, swarm.q, swarm.s.setScalar(swarm.r[i]));
      mesh.setMatrixAt(i, swarm.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={[0, -1.15, 0]}>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.0} position={[0, 4.5, 3]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-4, 2.4, 1]} scale={[4, 6, 1]} rotation-y={Math.PI / 2.3} />
        <Lightformer form="rect" intensity={0.9} position={[4, 2.0, -1]} scale={[4, 6, 1]} rotation-y={-Math.PI / 2.3} />
      </Environment>

      <ambientLight intensity={0.42} />
      <directionalLight position={[3, 5, 4]} intensity={1.15} castShadow shadow-mapSize={1024} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.4} scale={7} blur={2.6} far={2} resolution={512} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[4, 64]} />
        <meshStandardMaterial color="#0c1322" roughness={0.88} metalness={0.04} />
      </mesh>

      {/* The bath, drawn before the glass so the glass has it to refract. */}
      <mesh geometry={stemOil} position={[0, STEM_BOTTOM, 0]}>
        <bathShaderMaterial ref={bathMat} key={BathShaderMaterial.key} />
      </mesh>
      <mesh geometry={armOil}>
        <bathShaderMaterial key={`${BathShaderMaterial.key}-arm2`} uDepth={ARM_R * 2} />
      </mesh>

      {/* The Thiele tube. */}
      <mesh position={[0, (STEM_TOP + STEM_BOTTOM) / 2, 0]} castShadow>
        <cylinderGeometry args={[STEM_R + WALL, STEM_R + WALL, STEM_TOP - STEM_BOTTOM, 72, 1, true]} />
        <meshPhysicalMaterial
          transparent transmission={1} thickness={WALL * 10} ior={1.474}
          roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.05}
          attenuationColor="#e8f4ff" attenuationDistance={3} side={THREE.DoubleSide}
          envMapIntensity={1.4}
        />
      </mesh>
      <mesh position={[0, STEM_BOTTOM, 0]}>
        <sphereGeometry args={[STEM_R + WALL, 48, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshPhysicalMaterial transparent transmission={1} thickness={WALL * 8} ior={1.474} roughness={0.06} />
      </mesh>
      <mesh geometry={armGlass}>
        <meshPhysicalMaterial
          transparent transmission={1} thickness={WALL * 8} ior={1.474}
          roughness={0.05} metalness={0} side={THREE.DoubleSide} envMapIntensity={1.3}
        />
      </mesh>

      {/* Thermometer, bulb level with the charge. */}
      <group position={[-0.055, 0, 0]}>
        <mesh position={[0, BULB_Y, 0]}>
          <sphereGeometry args={[BULB_R, 32, 24]} />
          <meshPhysicalMaterial transparent transmission={0.92} thickness={0.05} ior={1.474} roughness={0.07} />
        </mesh>
        <mesh position={[0, (SCALE_BOTTOM + SCALE_TOP + 0.2) / 2, 0]}>
          <cylinderGeometry args={[0.024, 0.024, SCALE_TOP + 0.2 - SCALE_BOTTOM, 28, 1, true]} />
          <meshPhysicalMaterial transparent transmission={0.9} thickness={0.03} ior={1.474} roughness={0.06} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, BULB_Y, 0]}>
          <sphereGeometry args={[BULB_R * 0.82, 24, 18]} />
          <meshStandardMaterial color="#c9ccd4" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh ref={mercury} position={[0, SCALE_BOTTOM, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 1, 16]} />
          <meshStandardMaterial color="#d2d6de" metalness={0.95} roughness={0.15} />
        </mesh>
      </group>

      {/* ── The fusion tube, its charge, and the capillary ────────────────── */}
      <group position={[0.055, 0, 0]}>
        <mesh position={[0, TUBE_BOTTOM + TUBE_H / 2, 0]}>
          <cylinderGeometry args={[TUBE_R, TUBE_R, TUBE_H, 32, 1, true]} />
          <meshPhysicalMaterial
            transparent transmission={0.96} thickness={0.02} ior={1.474}
            roughness={0.05} side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, TUBE_BOTTOM, 0]}>
          <sphereGeometry args={[TUBE_R, 28, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshPhysicalMaterial transparent transmission={0.96} thickness={0.02} ior={1.474} roughness={0.05} />
        </mesh>

        <mesh geometry={chargeGeo} position={[0, TUBE_BOTTOM, 0]}>
          <fusionTubeShaderMaterial ref={liquidMat} key={FusionTubeShaderMaterial.key} />
        </mesh>

        {/* The capillary: sealed end up, mouth down near the bottom. */}
        <mesh position={[0, CAP_BOTTOM + CAP_H / 2, 0]}>
          <cylinderGeometry args={[CAP_R, CAP_R, CAP_H, 18, 1, true]} />
          <meshPhysicalMaterial transparent transmission={0.95} thickness={0.008} ior={1.474} roughness={0.05} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, CAP_BOTTOM + CAP_H, 0]}>
          <sphereGeometry args={[CAP_R, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshPhysicalMaterial transparent transmission={0.95} thickness={0.008} ior={1.474} roughness={0.05} />
        </mesh>
        {/* Liquid that has run back up inside it — the reading, made visible. */}
        <mesh ref={intrusion} position={[0, CAP_BOTTOM, 0]}>
          <cylinderGeometry args={[CAP_R * 0.82, CAP_R * 0.82, 1, 14]} />
          <meshStandardMaterial color="#cfe4f2" roughness={0.25} metalness={0.05} />
        </mesh>

        <instancedMesh ref={bubbles} args={[undefined, undefined, BUBBLES]} frustumCulled={false}>
          <sphereGeometry args={[1, 10, 8]} />
          <meshStandardMaterial color="#eaf4ff" roughness={0.12} metalness={0.0} transparent opacity={0.72} />
        </instancedMesh>
      </group>

      {/* Rubber band, above the oil line where it belongs. */}
      <mesh position={[0, OIL_TOP + 0.14, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.062, 0.010, 10, 28]} />
        <meshStandardMaterial color="#2c2f36" roughness={0.9} />
      </mesh>

      {/* Burner, under the middle of the side arm. */}
      <group position={[-0.60, 0, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.15, 0.19, 0.04, 28]} />
          <meshStandardMaterial color="#2a3040" roughness={0.45} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.030, 0.034, 0.22, 20]} />
          <meshStandardMaterial color="#39414f" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.48, 0]}>
          <planeGeometry args={[0.34, 0.48]} />
          <flameShaderMaterial ref={flameMat} key={FlameShaderMaterial.key} />
        </mesh>
      </group>

      {/* Clamp and stand. */}
      <mesh position={[0.98, 0.03, 0]}>
        <boxGeometry args={[0.55, 0.06, 0.40]} />
        <meshStandardMaterial color="#1b2230" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0.98, 1.2, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 2.3, 16]} />
        <meshStandardMaterial color="#39414f" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0.55, 1.55, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.020, 0.020, 0.86, 12]} />
        <meshStandardMaterial color="#39414f" roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
}

export default SiwoloboffSimulation;
