/**
 * CapillaryShaderMaterial — the two or three millimetres that the whole
 * experiment is about.
 *
 * Everything a student is asked to look for happens inside this cylinder, and
 * all of it is driven by one number from the engine — the melted fraction φ —
 * plus the sintering threshold the engine also supplies. Nothing is keyframed
 * and nothing is timed:
 *
 *   φ = 0            a packed column of opaque crystalline powder. Light
 *                    scatters off a hundred grain boundaries, so it is white
 *                    whatever colour the substance is in bulk.
 *   φ ≈ 0.03         SINTERING. Eutectic melt appears at the grain boundaries
 *                    and the column slumps: the grains round off, the packing
 *                    tightens and the powder turns waxy and translucent. This
 *                    is the true onset of melting and most students miss it.
 *   0.25 < φ < 1     a clear meniscus rising from the bottom while the solid
 *                    plug above it shrinks. This is the melting RANGE, and
 *                    seeing it occupy a visible height is the point.
 *   φ = 1            a clear column with a meniscus. The last crystal is gone
 *                    and this is the reading that goes in the table.
 *
 * Opaque for the same reason as the bath: it lives inside a glass capillary
 * inside a glass tube, and three's transmission backdrop is built from the
 * opaque pass.
 */
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  void main() {
    vLocal = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vViewDir = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform vec3  uSolidColour;   // the powder: white, whatever the bulk colour
  uniform float uMelted;        // φ, 0…1, straight from the lever rule
  uniform float uSinter;        // the fraction at which sintering becomes visible
  uniform float uHeight;        // packed column height, scene units
  uniform float uLoss;          // 0…1 sublimed away
  uniform float uHabit;         // 0 flake, 0.5 prism, 1 needle — grain shape

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
    return n;
  }

  void main() {
    /* Column height: sublimation takes it from the top, which is where the
       vapour escapes to. */
    float top = uHeight * (1.0 - uLoss);
    if (vLocal.y > top) discard;

    /*
     * Where the melt is. Liquid is denser than the powder it came from and it
     * runs to the bottom, so the solid plug sits on top of a clear column and
     * shrinks upwards. The boundary is a meniscus, not a line.
     */
    float meltTop = top * uMelted;
    float boundary = 0.004 + 0.010 * uMelted;
    float liquid = smoothstep(meltTop - boundary, meltTop + boundary, vLocal.y);
    liquid = 1.0 - liquid;                       // 1 below the meniscus

    /*
     * The solid. Grain structure, anisotropic according to the crystal habit —
     * flakes are flat, needles are long. The grains are what scatter, so the
     * powder is white and opaque even for a substance that is colourless in
     * bulk: the whiteness of a crystalline powder is geometry, not pigment.
     */
    vec3 grainAxis = mix(vec3(90.0, 250.0, 90.0), vec3(240.0, 40.0, 240.0), uHabit);
    float grain = noise(vLocal * grainAxis + vec3(0.0, 0.0, 3.0));
    float facet = smoothstep(0.35, 0.72, grain);

    /*
     * SINTERING. As the eutectic film wets the boundaries the grains round off
     * and the packing consolidates: contrast falls, the surface goes waxy and
     * what was chalk-white powder becomes translucent. Driven by how far past
     * the sintering threshold φ has come, so it begins exactly when the engine
     * says the eutectic has been passed.
     */
    float sinter = smoothstep(uSinter * 0.5, uSinter * 8.0, uMelted);
    float texture = mix(0.55 + 0.45 * facet, 0.82 + 0.10 * facet, sinter);

    vec3 solid = uSolidColour * texture;
    solid = mix(solid, solid * vec3(0.94, 0.93, 0.90), sinter * 0.6);

    /*
     * The melt. Clear, faintly refracting, with the bath's amber showing
     * through it — which is exactly how a student knows it has gone clear:
     * suddenly you can see the oil behind the capillary.
     */
    vec3 melt = vec3(0.86, 0.79, 0.58);
    float shimmer = noise(vLocal * vec3(60.0, 30.0, 60.0) + vec3(0.0, uTime * 0.6, 0.0));
    melt *= 0.9 + 0.2 * shimmer;

    vec3 colour = mix(solid, melt, liquid);

    /* A bright rim on the meniscus itself: the one feature a student is told to
       watch for, so it must be legible at a glance. */
    float rim = exp(-pow((vLocal.y - meltTop) / max(boundary, 1e-4), 2.0)) * uMelted * (1.0 - uMelted) * 4.0;
    colour += vec3(1.0, 0.97, 0.88) * rim * 0.5;

    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -vViewDir)), 3.0);
    colour += vec3(0.70, 0.72, 0.78) * fres * 0.30;

    gl_FragColor = vec4(colour, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const CapillaryShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uSolidColour: new THREE.Color(0.94, 0.94, 0.90),
    uMelted: 0,
    uSinter: 0.03,
    uHeight: 0.14,
    uLoss: 0,
    uHabit: 0,
  },
  vertexShader,
  fragmentShader,
  (m) => {
    m.transparent = false;
    m.depthWrite = true;
    m.side = THREE.FrontSide;
  },
);

extend({ CapillaryShaderMaterial });
export default CapillaryShaderMaterial;
