/**
 * CrystallisationSimulation — the bench for XI-CHE-B03.
 *
 * Owns the only render loop. Each frame it advances the engine by the real
 * frame time, then pushes the derived state into the solution shader, the
 * flame, the thermometer and the crystal field. Nothing here decides anything
 * about the chemistry.
 *
 * The crystals are the point, and they are instanced with the NUMBER and the
 * SIZE the engine computed — not a fixed count scaled up and down. A flask
 * cooled slowly really does contain a few hundred large crystals and a quenched
 * one a hundred thousand small ones, and what is on screen is a sample of that
 * population drawn to the size the population balance gives.
 *
 * Scale: one scene unit is 10 cm, so the beaker is a 100 mL squat form.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { useCrystallisationEngine } from '../engine/useCrystallisationEngine.js';
import { SOLUTES, COOLING } from '../engine/crystallisation.js';
import { FlameShaderMaterial } from '../../../../../shared/three/FlameShaderMaterial.jsx';
import { SolutionShaderMaterial } from './SolutionShaderMaterial.jsx';

void FlameShaderMaterial; void SolutionShaderMaterial;

/* ── Apparatus, in scene units of 10 cm ───────────────────────────────────── */
const BEAKER_R = 0.24;
const BEAKER_H = 0.62;
const WALL = 0.012;
const LIQUID_H = 0.44;            // the beaker filled to about 100 mL

/* How many instances we draw. The engine's crystal count runs to millions; a
   screen cannot and need not show them all, so the field is a SAMPLE and the
   drawn size is the real mean size. The HUD quotes the true count. */
const MAX_DRAWN = 900;

const HABIT_GEOMETRY = {
  /* Copper sulphate is triclinic: a squashed, skewed block. */
  triclinic: () => {
    const g = new THREE.BoxGeometry(1, 0.62, 0.42);
    g.applyMatrix4(new THREE.Matrix4().makeShear(0.22, 0, 0.14, 0, 0, 0.1));
    return g;
  },
  /* Alum grows as beautiful octahedra, which is half of why it is the school
     favourite. */
  octahedral: () => new THREE.OctahedronGeometry(0.62, 0),
  /* Benzoic acid comes down as needles. */
  needle: () => new THREE.BoxGeometry(0.26, 1.7, 0.26),
};

export function CrystallisationSimulation() {
  const solutionMat = useRef();
  const flameMat = useRef();
  const mercury = useRef();
  const crystals = useRef();
  const undissolvedRef = useRef();

  const geometries = useMemo(() => ({
    triclinic: HABIT_GEOMETRY.triclinic(),
    octahedral: HABIT_GEOMETRY.octahedral(),
    needle: HABIT_GEOMETRY.needle(),
  }), []);

  const liquidGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(BEAKER_R * 0.985, BEAKER_R * 0.985, LIQUID_H, 48, 1, false);
    g.translate(0, LIQUID_H / 2, 0);
    return g;
  }, []);

  /* Persistent per-instance placement. Crystals grow where they nucleated —
     on the floor and up the walls — and they do not wander once they are there. */
  const field = useMemo(() => {
    const seat = new Array(MAX_DRAWN);
    const spin = new Array(MAX_DRAWN);
    for (let i = 0; i < MAX_DRAWN; i += 1) {
      const a = Math.random() * Math.PI * 2;
      /* √U, or every crystal piles up on the axis. Most sit on the floor; a
         few cling to the wall, which is where they really do grow. */
      const rad = BEAKER_R * 0.93 * Math.sqrt(Math.random());
      const onWall = Math.random() < 0.22;
      seat[i] = new THREE.Vector3(
        Math.cos(a) * (onWall ? BEAKER_R * 0.9 : rad),
        onWall ? Math.random() * LIQUID_H * 0.7 : 0,
        Math.sin(a) * (onWall ? BEAKER_R * 0.9 : rad),
      );
      spin[i] = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      );
    }
    return {
      seat, spin, cloud: 0, lastNuclei: 0,
      m: new THREE.Matrix4(), p: new THREE.Vector3(), s: new THREE.Vector3(),
    };
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const store = useCrystallisationEngine.getState();
    store.tick(dt);

    const s = useCrystallisationEngine.getState();
    const d = s.derived;
    const t = state.clock.elapsedTime;
    const solute = SOLUTES[s.soluteId];

    const onFlame = s.stage === 'hot';
    const hotFraction = THREE.MathUtils.clamp((s.tempC - 20) / 80, 0, 1);

    /* ── The solution ──────────────────────────────────────────────────────
       Concentration relative to the hot saturated value. As crystals come down
       this falls, and the blue visibly pales — which is the observation that
       tells a student the crystallisation has finished. */
    const freeWater = s.solventMass + s.waterOfCrystallisation
      - s.crystalAnhydrous * (solute.molarMassCrystal / solute.molarMassAnhydrous - 1);
    const concentration = freeWater > 0
      ? THREE.MathUtils.clamp(s.dissolved / freeWater / (d.hotSolubility / 100), 0, 1.2)
      : 0;

    /* The nucleation flash: a burst when the crystal count jumps, decaying as
       the crystals grow and settle out of suspension. */
    const born = Math.max(0, s.nuclei - field.lastNuclei);
    field.lastNuclei = s.nuclei;
    field.cloud = Math.max(0, field.cloud - dt * 0.35) + Math.min(0.9, born / 4000);
    field.cloud = Math.min(1, field.cloud);

    const level = THREE.MathUtils.clamp(s.solventMl / 60, 0.25, 1);
    const bedTop = Math.min(LIQUID_H * 0.5, (d.meanSizeMm / 10) * Math.cbrt(Math.min(s.nuclei, 4e5)) * 0.02);

    if (solutionMat.current) {
      const u = solutionMat.current.uniforms;
      u.uTime.value = t;
      u.uSoluteColour.value.setRGB(...solute.colour);
      u.uConcentration.value = concentration;
      u.uCloud.value = field.cloud;
      u.uUndissolved.value = THREE.MathUtils.clamp(d.undissolved / 4, 0, 1);
      u.uBedTop.value = bedTop;
      u.uLevel.value = level;
      u.uHeight.value = LIQUID_H;
      u.uAgitation.value = onFlame ? 1 : hotFraction * 0.25;
    }

    if (flameMat.current) {
      const u = flameMat.current.uniforms;
      u.uTime.value = t;
      u.uLit.value = onFlame ? 1 : 0;
      u.uPower.value = 0.7;
      u.uAir.value = 1;
    }

    if (mercury.current) {
      const frac = THREE.MathUtils.clamp(s.tempC / 120, 0, 1);
      const h = Math.max(1e-3, frac * 0.55);
      mercury.current.scale.y = h;
      mercury.current.position.y = 0.30 + h / 2;
    }

    /* Undissolved solid: a heap on the floor, sized by how much never went in. */
    if (undissolvedRef.current) {
      const heap = THREE.MathUtils.clamp(d.undissolved / 8, 0, 1);
      undissolvedRef.current.visible = heap > 0.002;
      undissolvedRef.current.scale.set(0.6 + 0.6 * heap, 0.18 + 0.7 * heap, 0.6 + 0.6 * heap);
    }

    /* ── The crystals ──────────────────────────────────────────────────────
       Drawn at the engine's MEAN SIZE, and as many as the engine says up to
       what a screen can carry. Slow cooling therefore shows a scatter of large
       well-formed crystals and a quench shows a dense bed of small ones — the
       same difference a student sees in the beaker, because it is the same
       number. */
    const mesh = crystals.current;
    if (!mesh) return;

    const shown = Math.min(MAX_DRAWN, Math.floor(s.nuclei));
    const sizeUnits = (d.meanSizeMm / 10) / 10;   // mm → cm → scene units
    /* When the true count exceeds what we draw, the drawn ones stand in for
       many; scale them up by the cube root of the ratio so the VOLUME on
       screen still reads as the mass that came down. */
    const crowding = s.nuclei > MAX_DRAWN ? Math.cbrt(s.nuclei / MAX_DRAWN) : 1;
    const drawSize = Math.max(1e-4, sizeUnits * crowding);

    for (let i = 0; i < MAX_DRAWN; i += 1) {
      if (i >= shown) {
        field.m.compose(field.p.set(0, -99, 0), field.spin[i], field.s.setScalar(1e-5));
        mesh.setMatrixAt(i, field.m);
        continue;
      }
      const seat = field.seat[i];
      field.p.set(seat.x, seat.y + drawSize * 0.5, seat.z);
      field.m.compose(field.p, field.spin[i], field.s.setScalar(drawSize));
      mesh.setMatrixAt(i, field.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry = geometries[solute.habit] ?? geometries.triclinic;
  });

  return (
    <group position={[0, -0.32, 0]}>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.0} position={[0, 3.5, 2.5]} scale={[7, 7, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-3, 1.6, 1]} scale={[4, 5, 1]} rotation-y={Math.PI / 2.3} />
        <Lightformer form="rect" intensity={0.9} position={[3, 1.4, -1]} scale={[4, 5, 1]} rotation-y={-Math.PI / 2.3} />
      </Environment>

      <ambientLight intensity={0.45} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.15} castShadow shadow-mapSize={1024} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.42} scale={4} blur={2.4} far={1.2} resolution={512} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[2.6, 64]} />
        <meshStandardMaterial color="#0c1322" roughness={0.88} metalness={0.04} />
      </mesh>

      {/* Tripod and gauze. */}
      <mesh position={[0, 0.30, 0]}>
        <torusGeometry args={[0.30, 0.012, 8, 36]} />
        <meshStandardMaterial color="#39414f" roughness={0.35} metalness={0.85} />
      </mesh>
      <mesh position={[0, 0.305, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[0.30, 32]} />
        <meshStandardMaterial color="#2b3240" roughness={0.9} metalness={0.3} side={THREE.DoubleSide} />
      </mesh>
      {[0, 2.094, 4.188].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.28, 0.15, Math.sin(a) * 0.28]}>
          <cylinderGeometry args={[0.012, 0.012, 0.30, 10]} />
          <meshStandardMaterial color="#39414f" roughness={0.35} metalness={0.85} />
        </mesh>
      ))}

      {/* ── The beaker ────────────────────────────────────────────────────── */}
      <group position={[0, 0.315, 0]}>
        {/* Solution first, so the glass has something to refract. */}
        <mesh geometry={liquidGeo} position={[0, WALL, 0]}>
          <solutionShaderMaterial ref={solutionMat} key={SolutionShaderMaterial.key} />
        </mesh>

        {/* Undissolved solid that never went in. */}
        <mesh ref={undissolvedRef} position={[0, 0.02, 0]}>
          <sphereGeometry args={[0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#8fb7e8" roughness={0.85} metalness={0.02} />
        </mesh>

        {/* The crop. */}
        <instancedMesh ref={crystals} args={[undefined, undefined, MAX_DRAWN]} frustumCulled={false} castShadow>
          <boxGeometry args={[1, 0.62, 0.42]} />
          <meshPhysicalMaterial
            color="#bcd8f5" roughness={0.10} metalness={0}
            transmission={0.45} thickness={0.02} ior={1.54} clearcoat={0.8}
            envMapIntensity={1.5}
          />
        </instancedMesh>

        <mesh position={[0, BEAKER_H / 2, 0]} castShadow>
          <cylinderGeometry args={[BEAKER_R, BEAKER_R, BEAKER_H, 56, 1, true]} />
          <meshPhysicalMaterial
            transparent transmission={1} thickness={WALL * 10} ior={1.474}
            roughness={0.04} metalness={0} clearcoat={1} clearcoatRoughness={0.05}
            attenuationColor="#e8f4ff" attenuationDistance={2.5} side={THREE.DoubleSide}
            envMapIntensity={1.4}
          />
        </mesh>
        <mesh position={[0, WALL / 2, 0]}>
          <cylinderGeometry args={[BEAKER_R, BEAKER_R, WALL, 56]} />
          <meshPhysicalMaterial transparent transmission={1} thickness={WALL * 8} ior={1.474} roughness={0.06} />
        </mesh>
        <mesh position={[0, BEAKER_H, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[BEAKER_R, WALL * 0.5, 10, 48]} />
          <meshPhysicalMaterial transparent transmission={1} thickness={WALL * 5} ior={1.474} roughness={0.05} />
        </mesh>

        {/* Thermometer, standing in the solution. */}
        <group position={[BEAKER_R * 0.55, 0, 0]}>
          <mesh position={[0, 0.58, 0]}>
            <cylinderGeometry args={[0.014, 0.014, 0.90, 20, 1, true]} />
            <meshPhysicalMaterial transparent transmission={0.92} thickness={0.02} ior={1.474} roughness={0.06} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.16, 0]}>
            <sphereGeometry args={[0.022, 20, 14]} />
            <meshStandardMaterial color="#c9ccd4" metalness={0.95} roughness={0.18} />
          </mesh>
          <mesh ref={mercury} position={[0, 0.30, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 1, 12]} />
            <meshStandardMaterial color="#d2d6de" metalness={0.95} roughness={0.15} />
          </mesh>
        </group>

        {/* The glass rod, for scratching the flask. */}
        <mesh position={[-BEAKER_R * 0.6, 0.42, BEAKER_R * 0.3]} rotation-z={0.22}>
          <cylinderGeometry args={[0.011, 0.011, 0.78, 14]} />
          <meshPhysicalMaterial transparent transmission={0.95} thickness={0.02} ior={1.474} roughness={0.05} />
        </mesh>
      </group>

      {/* Burner. */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.13, 0.16, 0.04, 24]} />
          <meshStandardMaterial color="#2a3040" roughness={0.45} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.10, 0]}>
          <cylinderGeometry args={[0.026, 0.030, 0.16, 18]} />
          <meshStandardMaterial color="#39414f" roughness={0.35} metalness={0.85} />
        </mesh>
        <mesh position={[0, 0.34, 0]}>
          <planeGeometry args={[0.30, 0.40]} />
          <flameShaderMaterial ref={flameMat} key={FlameShaderMaterial.key} />
        </mesh>
      </group>
    </group>
  );
}

export default CrystallisationSimulation;
