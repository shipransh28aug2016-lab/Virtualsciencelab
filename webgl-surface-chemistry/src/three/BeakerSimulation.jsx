/**
 * BeakerSimulation — the bench.
 *
 * This component owns the only render loop in the app. Each frame it:
 *
 *   1. advances the engine by the real frame time  (store.tick)
 *   2. pushes the derived optical coefficients into the liquid shader
 *   3. moves the colloidal particles by the laws the engine just solved
 *
 * The ordering matters: the shader and the particles are consumers, never
 * authors. Nothing in this file decides anything about the chemistry — if you
 * deleted every line of it the physics would be unchanged, and if the engine
 * says the sol is stable there is no code path here that can cloud it.
 *
 * The one deliberate untruth is the magnification, and it is labelled where it
 * happens: real Brownian displacement over 1/60 s is ~0.4 µm, which at beaker
 * scale is a thousandth of a pixel. The particle field is therefore a micrograph
 * of a sample of the sol, magnified by a constant. Because it is a *constant*,
 * everything the student is meant to read off it survives: the jitter still
 * falls as 1/√r as flocs grow, still rises as √T, and still stops when the
 * particles reach the bed.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows } from '@react-three/drei';
import { useChemistryEngine } from '../engine/useChemistryEngine.js';
import { diffusionCoefficient, absorptionCoefficientRGB } from '../engine/physics.js';
import { LiquidShaderMaterial } from './LiquidShaderMaterial.jsx';

void LiquidShaderMaterial;   // keep the extend() side effect after tree-shaking

/* ── Scale ─────────────────────────────────────────────────────────────────────
   One scene unit is 5.65 cm, which makes this a 250 mL beaker: 7 cm across,
   filled to 7 cm. COLUMN_M is the same 0.07 m the settling integral in
   physics.js divides by, so a floc that the engine says clears the column in
   ten seconds is a floc that visibly reaches the bed in ten seconds.          */
const UNIT_M = 0.0565;
const R = 0.62;                        // liquid radius, units
const H = 0.07 / UNIT_M;               // liquid height, units (= COLUMN_M)
const WALL = 0.018;                    // glass thickness, units (≈ 1 mm)
const BEAM_Y = 0.55 * H;
const BEAM_R = 0.085;

/* ── Particle field ───────────────────────────────────────────────────────────
   1200 instances. Each one is a *cluster*, not a molecule: as aggregation
   proceeds the number of distinct clusters the engine reports falls, and the
   instances collapse onto that many seeds. That is why they clump rather than
   simply shrinking in number — mass is conserved on screen as it is in the
   beaker.                                                                     */
const N = 1200;
const MICROSCOPE = 1500;               // objective magnification, see header
const DUST = 0.0085;                   // primary particle radius on screen, units

/** Logarithmic size mapping. A floc grown from 50 nm to 700 µm is 14 000× its
 *  parent; drawn linearly it would be larger than the beaker. A micrograph
 *  handles this by changing objective, i.e. by working in decades — so do we,
 *  and the scale bar in the HUD reports the true radius in nm. */
const visualScale = (radius, primary) => 1 + 0.6 * Math.log10(Math.max(1, radius / primary));

function randomInCylinder(target) {
  /* √U for the radius, or every particle piles up on the axis. */
  const a = Math.random() * Math.PI * 2;
  const r = R * 0.94 * Math.sqrt(Math.random());
  target.set(Math.cos(a) * r, 0.04 + Math.random() * (H - 0.08), Math.sin(a) * r);
  return target;
}

export function BeakerSimulation() {
  const { camera } = useThree();
  const liquidMat = useRef();
  const liquidMesh = useRef();
  const swarm = useRef();

  /* Built once. The shaders are written with the column's base at y = 0, so the
     geometry is translated up by half its height rather than the mesh being
     offset — that keeps object space and shader space the same space. */
  const liquidGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(R, R, H, 96, 1, false);
    g.translate(0, H / 2, 0);
    return g;
  }, []);

  /* Persistent, mutable, never in React state: touching state per frame would
     re-render the HUD sixty times a second for nothing. */
  const field = useMemo(() => {
    const free = new Array(N);
    const seed = new Array(N);
    const offset = new Array(N);
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i += 1) {
      free[i] = randomInCylinder(new THREE.Vector3());
      seed[i] = randomInCylinder(new THREE.Vector3());
      /* Where inside its floc this particle sits. Unit ball, so flocs look like
         flocs and not like shells. */
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      offset[i] = v.clone().normalize().multiplyScalar(Math.cbrt(Math.random()));
    }
    return {
      free, seed, offset,
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      lit: new THREE.Color(),
      cameraLocal: new THREE.Vector3(),
      scatter: new THREE.Vector3(),
      absorb: new THREE.Vector3(),
    };
  }, []);

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 20);
    const store = useChemistryEngine.getState();
    store.tick(dt);

    const d = useChemistryEngine.getState().derived;
    const { sol } = d;

    /* ── 1. Optics into the shader ──────────────────────────────────────────
       β and the absorption come out of the engine in per-metre units; the
       shader marches in scene units, so they are converted once, here. This is
       the whole of the coupling: the Tyndall beam's brightness is β, and β came
       from σ(d⁶/λ⁴) joined to the geometric limit over the surviving number
       density. Nobody tuned it.                                              */
    const mat = liquidMat.current;
    if (mat) {
      const [br, bg, bb] = d.scatteringRGB;
      const [ar, ag, ab] = absorptionCoefficientRGB(sol);
      mat.uniforms.uTime.value = state.clock.elapsedTime;
      mat.uniforms.uScatter.value.set(br * UNIT_M, bg * UNIT_M, bb * UNIT_M);
      mat.uniforms.uAbsorb.value.set(ar * UNIT_M, ag * UNIT_M, ab * UNIT_M);
      mat.uniforms.uSolColour.value.setRGB(...sol.colour);
      mat.uniforms.uCoagulation.value = d.coagulationPercentage / 100;
      mat.uniforms.uSediment.value = d.sedimentFraction;
      mat.uniforms.uForwardness.value = d.asymmetry;
      mat.uniforms.uRadius.value = R;
      mat.uniforms.uHeight.value = H;
      mat.uniforms.uBeamY.value = BEAM_Y;
      mat.uniforms.uBeamRadius.value = BEAM_R;
      /* The ray march is done in the cylinder's own space, so the camera has to
         be too. worldToLocal is the mesh's own inverse world matrix: one
         conversion, one reused vector, no garbage per frame. */
      if (liquidMesh.current) {
        mat.uniforms.uCameraLocal.value.copy(
          liquidMesh.current.worldToLocal(field.cameraLocal.copy(camera.position)),
        );
      }
    }

    /* ── 2. The colloid ────────────────────────────────────────────────────── */
    const mesh = swarm.current;
    if (!mesh) return;

    const fraction = d.coagulationPercentage / 100;
    /* How many distinct flocs are left on screen. n/N₀ straight from the engine,
       floored at one, so "all of it is one lump" is representable. */
    const live = useChemistryEngine.getState().clusterCount;
    const clumps = Math.min(N, Math.max(1, Math.round(N * live)));
    const bedTop = d.sedimentFraction * H * 0.9;

    /* Brownian step. σ = √(2DΔt) per axis, D = k_BT/6πηr — Stokes–Einstein, with
       r the CURRENT cluster radius, which is why the field visibly goes quiet as
       the flocs grow even before they fall. */
    const D = diffusionCoefficient(d.clusterRadius, store.temperatureK);
    const sigma = (Math.sqrt(2 * D * dt) / UNIT_M) * MICROSCOPE;

    /* Stirring shows up twice: as a swirl you can see, and (in the engine) as the
       orthokinetic kernel that actually makes the flocs. Same number. */
    const swirl = d.shearRate_s * 0.012 * dt;
    const settleStep = (d.settlingVelocity / 0.07) * H * dt;   // column fractions → units

    const grow = visualScale(d.clusterRadius, sol.particleRadius);
    const litColour = field.lit;

    for (let i = 0; i < N; i += 1) {
      const free = field.free[i];
      const seed = field.seed[i];

      /* Free flight: jitter, swirl, and the slow fall a single particle earns. */
      free.x += (Math.random() * 2 - 1) * sigma;
      free.y += (Math.random() * 2 - 1) * sigma;
      free.z += (Math.random() * 2 - 1) * sigma;
      if (swirl > 0) {
        const cs = Math.cos(swirl); const sn = Math.sin(swirl);
        const x = free.x; free.x = x * cs - free.z * sn; free.z = x * sn + free.z * cs;
      }
      /* Confinement: reflect off the wall rather than clamp, so particles do not
         accumulate in a film at the glass. */
      const rad = Math.hypot(free.x, free.z);
      if (rad > R * 0.95) { free.x *= (R * 0.95) / rad; free.z *= (R * 0.95) / rad; }
      free.y = THREE.MathUtils.clamp(free.y, bedTop + 0.01, H - 0.02);

      /* Cluster seeds fall at the speed their current size earns, and stop when
         they reach the top of the bed — which is where the sediment comes from. */
      if (i < clumps) {
        seed.y = Math.max(bedTop + 0.012, seed.y - settleStep);
        if (swirl > 0) {
          const cs = Math.cos(swirl * 1.4); const sn = Math.sin(swirl * 1.4);
          const x = seed.x; seed.x = x * cs - seed.z * sn; seed.z = x * sn + seed.z * cs;
        }
      }

      /* Where this particle actually is: interpolated from free to bound by the
         coagulated fraction, which is the engine's n/N₀ and nothing else. */
      const home = field.seed[i % clumps];
      const spread = DUST * grow * 1.6;
      const p = field.p.set(
        THREE.MathUtils.lerp(free.x, home.x + field.offset[i].x * spread, fraction),
        THREE.MathUtils.lerp(free.y, home.y + field.offset[i].y * spread, fraction),
        THREE.MathUtils.lerp(free.z, home.z + field.offset[i].z * spread, fraction),
      );

      const scale = DUST * (1 + (grow - 1) * fraction);
      field.m.compose(p, field.q, field.s.setScalar(scale));
      mesh.setMatrixAt(i, field.m);

      /* Only the particles standing in the beam are bright — that is the whole
         point of the Tyndall demonstration, and it is a distance test, not a
         lighting trick. */
      const inBeam = Math.exp(-2 * ((p.y - BEAM_Y) ** 2 + p.z ** 2) / (BEAM_R * BEAM_R));
      litColour.setRGB(
        sol.colour[0] + inBeam * 1.5,
        sol.colour[1] + inBeam * 1.45,
        sol.colour[2] + inBeam * 1.35,
      );
      mesh.setColorAt(i, litColour);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[0, -H / 2, 0]}>
      {/* A studio built in-scene rather than fetched: the glass needs something
          to refract, and an HDR from a CDN is a dependency a school laptop on a
          filtered network does not need. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.2} position={[0, 3.5, 2]} scale={[7, 7, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-3, 1.5, 1]} scale={[4, 5, 1]} rotation-y={Math.PI / 2.4} />
        <Lightformer form="rect" intensity={0.7} position={[3, 1.2, -1]} scale={[4, 5, 1]} rotation-y={-Math.PI / 2.4} />
        <Lightformer form="circle" intensity={2} position={[0, -2, 0]} scale={5} rotation-x={Math.PI / 2} />
      </Environment>

      <ambientLight intensity={0.35} />
      <directionalLight position={[2.5, 4, 3]} intensity={1.1} castShadow shadow-mapSize={1024} />
      <ContactShadows position={[0, 0.001, 0]} opacity={0.42} scale={5} blur={2.4} far={1.2} resolution={512} />

      {/* Bench */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[3.2, 64]} />
        <meshStandardMaterial color="#0b1220" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* ── Glass ──────────────────────────────────────────────────────────────
          MeshPhysicalMaterial with transmission = 1: real IOR (1.52 for lab
          borosilicate), real thickness, so the liquid behind it is refracted and
          the rim catches the light the way glass does. The wall is a separate,
          slightly larger cylinder from the liquid — glass and sol are two media,
          and drawing them as one is what makes cheap 3D chemistry look like
          cheap 3D chemistry. */}
      <mesh position={[0, H * 0.53, 0]} castShadow>
        <cylinderGeometry args={[R + WALL, R + WALL, H * 1.06, 96, 1, true]} />
        <meshPhysicalMaterial
          transparent transmission={1} thickness={WALL * 12} ior={1.52}
          roughness={0.045} metalness={0} clearcoat={1} clearcoatRoughness={0.06}
          attenuationColor="#dff0ff" attenuationDistance={2.4}
          color="#ffffff" side={THREE.DoubleSide} envMapIntensity={1.3}
        />
      </mesh>
      {/* Base, and the rolled lip a beaker pours from */}
      <mesh position={[0, WALL / 2, 0]}>
        <cylinderGeometry args={[R + WALL, R + WALL, WALL, 96]} />
        <meshPhysicalMaterial transparent transmission={1} thickness={WALL * 10} ior={1.52} roughness={0.08} />
      </mesh>
      <mesh position={[0, H * 1.06, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[R + WALL, WALL * 0.55, 12, 96]} />
        <meshPhysicalMaterial transparent transmission={1} thickness={WALL * 6} ior={1.52} roughness={0.05} />
      </mesh>

      {/* ── The sol ─────────────────────────────────────────────────────────── */}
      <mesh ref={liquidMesh} geometry={liquidGeometry}>
        <liquidShaderMaterial ref={liquidMat} key={LiquidShaderMaterial.key} uRadius={R} uHeight={H} />
      </mesh>

      {/* ── Colloidal particles ─────────────────────────────────────────────── */}
      <instancedMesh ref={swarm} args={[undefined, undefined, N]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        {/* Unlit, additive-free, vertex-coloured: these are scattering centres, so
            their brightness must come from the beam test above and not from a
            lamp somewhere in the room. */}
        <meshBasicMaterial toneMapped={false} transparent opacity={0.92} />
      </instancedMesh>

      {/* ── The torch ───────────────────────────────────────────────────────── */}
      <group position={[-(R + WALL) - 0.55, BEAM_Y, 0]} rotation-z={-Math.PI / 2}>
        <mesh>
          <cylinderGeometry args={[0.055, 0.07, 0.42, 24]} />
          <meshStandardMaterial color="#1b2430" roughness={0.35} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.215, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.01, 24]} />
          <meshBasicMaterial color="#fffaf0" toneMapped={false} />
        </mesh>
      </group>
      {/* The beam in air: faint, because clean air scatters almost nothing. The
          bright part inside the liquid is not drawn here — it is the scattering
          integral in the liquid shader, which is the entire experiment. */}
      <mesh position={[-(R + WALL) - 0.17, BEAM_Y, 0]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[BEAM_R * 0.5, BEAM_R * 0.32, 0.34, 20, 1, true]} />
        <meshBasicMaterial
          color="#fff6e0" transparent opacity={0.07} depthWrite={false}
          blending={THREE.AdditiveBlending} side={THREE.DoubleSide} toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default BeakerSimulation;
