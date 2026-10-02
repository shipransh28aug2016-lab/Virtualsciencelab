/**
 * ThieleTubeSimulation — the bench for XI-CHE-B01.
 *
 * Owns the only render loop. Each frame it advances the engine by the real
 * frame time, then pushes the derived state into the three shaders and the
 * mercury column. Nothing here decides anything about the chemistry: delete
 * this file and the melting points are unchanged.
 *
 * The apparatus is built the way the published experiment describes it, and the
 * geometry carries the reasoning:
 *
 *   · the SIDE ARM is heated, not the stem. Warm oil rises up the arm, crosses
 *     the top and falls down the stem, so the bath stirs itself — which is the
 *     entire reason a Thiele tube is shaped like this and why the flame goes
 *     where it goes;
 *   · the CAPILLARY is tied level with the thermometer BULB, because two things
 *     at different heights in a bath with a gradient are at different
 *     temperatures, and the reading would then belong to neither;
 *   · the rubber band sits ABOVE the oil line. Below it, hot paraffin would
 *     perish it and the capillary would drop into the tube.
 *
 * Scale: one scene unit is 10 cm, so the tube is 20 cm of glass and the packed
 * column is the 3 mm a manual asks for. The capillary bore is drawn at twice
 * life size — at 1 mm it is a hairline on any screen, and the melt inside it is
 * the thing the student is supposed to be looking at.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { useMeltingPointEngine } from '../engine/useMeltingPointEngine.js';
import { BATHS, THERMOMETERS } from '../engine/thermochemistry.js';
import { BathShaderMaterial } from '../../../../../shared/three/BathShaderMaterial.jsx';
import { CapillaryShaderMaterial } from './CapillaryShaderMaterial.jsx';
import { FlameShaderMaterial } from '../../../../../shared/three/FlameShaderMaterial.jsx';

void BathShaderMaterial; void CapillaryShaderMaterial; void FlameShaderMaterial;

/* ── Apparatus dimensions, in scene units of 10 cm ────────────────────────── */
const STEM_R = 0.125;            // 2.5 cm bore
const STEM_BOTTOM = 0.10;
const STEM_TOP = 2.05;
const WALL = 0.014;              // 1.4 mm borosilicate
const OIL_TOP = 1.80;
const ARM_R = 0.070;

/* Where the thermometer bulb — and therefore the sample — sits. */
const BULB_Y = 0.95;
const BULB_R = 0.048;
const CAP_R = 0.020;             // drawn at 2× life size; see the header
const COLUMN_H = 0.030;          // 3 mm of packed sample

/* The mercury scale: 0 °C at the bulb, 250 °C at the top of the stem. */
const SCALE_BOTTOM = BULB_Y + BULB_R;
const SCALE_TOP = 2.62;
const SCALE_MAX_C = 250;

const HABIT = { flake: 0, prism: 0.5, needle: 1 };

/** The side arm, as a curve the glass and the oil are both swept along. Out of
 *  the stem low down, up the outside, back in near the top: the loop the
 *  convection current runs round. */
function armCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.00, 0.42, 0),
    new THREE.Vector3(-0.30, 0.34, 0),
    new THREE.Vector3(-0.52, 0.46, 0),
    new THREE.Vector3(-0.56, 1.05, 0),
    new THREE.Vector3(-0.52, 1.52, 0),
    new THREE.Vector3(-0.28, 1.66, 0),
    new THREE.Vector3(0.00, 1.60, 0),
  ], false, 'catmullrom', 0.25);
}

export function ThieleTubeSimulation() {
  const { camera } = useThree();
  const bathMat = useRef();
  const capMat = useRef();
  const flameMat = useRef();
  const mercury = useRef();

  const curve = useMemo(() => armCurve(), []);
  const armGlass = useMemo(() => new THREE.TubeGeometry(curve, 96, ARM_R + WALL, 24, false), [curve]);
  const armOil = useMemo(() => new THREE.TubeGeometry(curve, 96, ARM_R, 20, false), [curve]);

  /* The oil column in the stem, base at y = 0 in its own space so the shader's
     coordinates and the geometry's agree. */
  const stemOil = useMemo(() => {
    const h = OIL_TOP - STEM_BOTTOM;
    const g = new THREE.CylinderGeometry(STEM_R, STEM_R, h, 64, 1, false);
    g.translate(0, h / 2, 0);
    return g;
  }, []);

  const columnGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(CAP_R * 0.78, CAP_R * 0.78, COLUMN_H * 1.4, 24, 1, false);
    g.translate(0, (COLUMN_H * 1.4) / 2, 0);
    return g;
  }, []);

  const scratch = useMemo(() => ({
    gradient: 0,
    colour: new THREE.Color(),
    focus: new THREE.Vector3(),
  }), []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const store = useMeltingPointEngine.getState();
    store.tick(dt);

    const s = useMeltingPointEngine.getState();
    const d = s.derived;
    const bath = BATHS[s.bath];
    const t = state.clock.elapsedTime;

    /* ── The bath ────────────────────────────────────────────────────────────
       The schlieren amplitude is the temperature GRADIENT, not the temperature:
       a bath sitting at 150 °C with the burner off is perfectly still, and one
       being driven hard at 60 °C boils with distortion. The gradient relaxes
       rather than switching, because the oil does not stop circulating the
       instant the flame is removed. */
    const driving = s.burnerOn ? s.heatingRate / 12 : 0;
    scratch.gradient += (driving - scratch.gradient) * Math.min(1, dt * 0.6);

    if (bathMat.current) {
      const u = bathMat.current.uniforms;
      u.uTime.value = t;
      u.uColour.value.setRGB(...bath.colour);
      u.uTempNorm.value = THREE.MathUtils.clamp((s.bathC - 27) / (bath.maxC - 27), 0, 1);
      u.uGradient.value = scratch.gradient;
      u.uFlow.value = 0.08 + scratch.gradient * 0.55;
      u.uSmoke.value = THREE.MathUtils.clamp((s.bathC - bath.smokesAboveC) / 40, 0, 1);
      u.uDepth.value = STEM_R * 2;
    }

    /* ── The capillary ───────────────────────────────────────────────────────
       One number in, and every appearance out: sintering, the rising meniscus,
       the clear column and the height lost to sublimation. */
    if (capMat.current) {
      const u = capMat.current.uniforms;
      u.uTime.value = t;
      u.uMelted.value = s.meltedFraction;
      u.uLoss.value = s.columnLoss;
      u.uHeight.value = COLUMN_H;
      u.uHabit.value = HABIT[d.host.habit] ?? 0;
      u.uSolidColour.value.setRGB(...d.host.colour);
    }

    /* ── The burner ──────────────────────────────────────────────────────── */
    if (flameMat.current) {
      const u = flameMat.current.uniforms;
      u.uTime.value = t;
      u.uLit.value = s.burnerOn ? 1 : 0;
      u.uPower.value = s.heatingRate / 12;
      u.uAir.value = s.airOpen ? 1 : 0;
    }

    /* ── The mercury ─────────────────────────────────────────────────────────
       Driven by the true reading, not the rounded one: the thread sits wherever
       it sits, and rounding to the least count is something the student does
       with their eye. */
    if (mercury.current) {
      const frac = THREE.MathUtils.clamp(s.readingC / SCALE_MAX_C, 0, 1);
      const h = Math.max(1e-3, frac * (SCALE_TOP - SCALE_BOTTOM));
      mercury.current.scale.y = h;
      mercury.current.position.y = SCALE_BOTTOM + h / 2;
    }
  });

  return (
    <group position={[0, -1.15, 0]}>
      {/* A studio built in the scene. Nothing is fetched: the glass needs
          something to refract and a school laptop on a filtered network should
          not have to download an HDR to see it. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.0} position={[0, 4.5, 3]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-4, 2.4, 1]} scale={[4, 6, 1]} rotation-y={Math.PI / 2.3} />
        <Lightformer form="rect" intensity={0.9} position={[4, 2.0, -1]} scale={[4, 6, 1]} rotation-y={-Math.PI / 2.3} />
      </Environment>

      <ambientLight intensity={0.42} />
      <directionalLight position={[3, 5, 4]} intensity={1.15} castShadow shadow-mapSize={1024} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.4} scale={7} blur={2.6} far={2} resolution={512} />

      {/* Bench */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[4, 64]} />
        <meshStandardMaterial color="#0c1322" roughness={0.88} metalness={0.04} />
      </mesh>

      {/* ── The bath, drawn before the glass so the glass has it to refract ── */}
      <mesh geometry={stemOil} position={[0, STEM_BOTTOM, 0]}>
        <bathShaderMaterial ref={bathMat} key={BathShaderMaterial.key} />
      </mesh>
      <mesh geometry={armOil}>
        <bathShaderMaterial key={`${BathShaderMaterial.key}-arm`} uDepth={ARM_R * 2} />
      </mesh>

      {/* ── The Thiele tube ─────────────────────────────────────────────────
          Borosilicate: ior 1.474, and thin-walled, so the rim is bright and the
          body barely tints. */}
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

      {/* ── Thermometer ─────────────────────────────────────────────────────
          Bulb at BULB_Y, level with the sample. The stem is glass; the thread
          inside it is the only part that moves. */}
      <group>
        <mesh position={[0, BULB_Y, 0]}>
          <sphereGeometry args={[BULB_R, 32, 24]} />
          <meshPhysicalMaterial transparent transmission={0.92} thickness={0.05} ior={1.474} roughness={0.07} />
        </mesh>
        <mesh position={[0, (SCALE_BOTTOM + SCALE_TOP + 0.2) / 2, 0]}>
          <cylinderGeometry args={[0.024, 0.024, SCALE_TOP + 0.2 - SCALE_BOTTOM, 28, 1, true]} />
          <meshPhysicalMaterial
            transparent transmission={0.9} thickness={0.03} ior={1.474}
            roughness={0.06} side={THREE.DoubleSide}
          />
        </mesh>
        {/* The thread. Bulb first, so mercury is visibly continuous with it. */}
        <mesh position={[0, BULB_Y, 0]}>
          <sphereGeometry args={[BULB_R * 0.82, 24, 18]} />
          <meshStandardMaterial color="#c9ccd4" metalness={0.95} roughness={0.18} />
        </mesh>
        <mesh ref={mercury} position={[0, SCALE_BOTTOM, 0]}>
          <cylinderGeometry args={[0.010, 0.010, 1, 16]} />
          <meshStandardMaterial color="#d2d6de" metalness={0.95} roughness={0.15} />
        </mesh>
      </group>

      {/* ── Capillary, tied alongside the bulb ──────────────────────────────
          Sealed end down, sample resting on the seal, level with the bulb. */}
      <group position={[BULB_R + CAP_R + 0.012, 0, 0]}>
        <mesh position={[0, BULB_Y + 0.42, 0]}>
          <cylinderGeometry args={[CAP_R, CAP_R, 0.95, 24, 1, true]} />
          <meshPhysicalMaterial
            transparent transmission={0.95} thickness={0.012} ior={1.474}
            roughness={0.05} side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, BULB_Y - 0.055, 0]}>
          <sphereGeometry args={[CAP_R, 20, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshPhysicalMaterial transparent transmission={0.95} thickness={0.012} ior={1.474} roughness={0.05} />
        </mesh>
        {/* The sample itself. */}
        <mesh geometry={columnGeo} position={[0, BULB_Y - 0.055, 0]}>
          <capillaryShaderMaterial ref={capMat} key={CapillaryShaderMaterial.key} />
        </mesh>
      </group>

      {/* The rubber band, above the oil line where it belongs. */}
      <mesh position={[BULB_R * 0.5, OIL_TOP + 0.12, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.055, 0.010, 10, 28]} />
        <meshStandardMaterial color="#2c2f36" roughness={0.9} />
      </mesh>

      {/* ── Burner, under the middle of the side arm ────────────────────────
          Where the manual says to put it, and where the convection loop needs
          it: heat the stem instead and the oil stratifies rather than circulates. */}
      <group position={[-0.56, 0, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.15, 0.19, 0.04, 28]} />
          <meshStandardMaterial color="#2a3040" roughness={0.45} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.13, 0]}>
          <cylinderGeometry args={[0.030, 0.034, 0.22, 20]} />
          <meshStandardMaterial color="#39414f" roughness={0.35} metalness={0.85} />
        </mesh>
        {/* Billboarded flame quad, its base at the barrel mouth. */}
        <mesh position={[0, 0.24 + 0.24, 0]}>
          <planeGeometry args={[0.34, 0.48]} />
          <flameShaderMaterial ref={flameMat} key={FlameShaderMaterial.key} />
        </mesh>
      </group>

      {/* Clamp and stand: a tube this hot is not held in the hand. */}
      <mesh position={[0.95, 0.03, 0]}>
        <boxGeometry args={[0.55, 0.06, 0.40]} />
        <meshStandardMaterial color="#1b2230" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0.95, 1.2, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 2.3, 16]} />
        <meshStandardMaterial color="#39414f" roughness={0.3} metalness={0.9} />
      </mesh>
      <mesh position={[0.52, 1.55, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.020, 0.020, 0.86, 12]} />
        <meshStandardMaterial color="#39414f" roughness={0.3} metalness={0.9} />
      </mesh>
    </group>
  );
}

export default ThieleTubeSimulation;
