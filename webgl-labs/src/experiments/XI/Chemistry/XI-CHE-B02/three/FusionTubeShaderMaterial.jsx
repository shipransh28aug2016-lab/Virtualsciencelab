/**
 * FusionTubeShaderMaterial — the half millilitre of liquid under test.
 *
 * Small, and it carries four separate observations, every one of them driven by
 * a number out of the engine rather than by a timer:
 *
 *   uLevel        how much is left. A liquid that has been boiled hard has
 *                 measurably less in the tube, which is how a student discovers
 *                 that boiling a mixture changes what is left behind.
 *   uAgitation    the convection and rolling boil, from how far the vapour
 *                 pressure now exceeds the pressure outside. Still liquid below
 *                 the boiling point, lively above it.
 *   uSuperheat    the quiet, glassy, dangerous state: above the boiling point
 *                 and NOT boiling, because there is nothing for a bubble to
 *                 start on. Drawn deliberately calm, because that is exactly
 *                 what makes it dangerous.
 *   uBump         the discharge, when it finally nucleates and the whole
 *                 superheat goes at once.
 *
 * Opaque, like every liquid in this project: the tube around it is a
 * transmissive material and three builds its refraction backdrop from the
 * opaque pass, so a transparent liquid would be missing from it and the tube
 * would render empty.
 */
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;

  uniform float uTime;
  uniform float uAgitation;
  uniform float uLevel;
  uniform float uHeight;

  void main() {
    vec3 p = position;

    /* The surface moves when the liquid is boiling and is flat when it is not.
       Amplitude is the agitation, which is the pressure excess, so a liquid
       held just below its boiling point sits perfectly still. */
    float atSurface = smoothstep(0.75, 1.0, position.y / max(uHeight * uLevel, 1e-4));
    p.y += atSurface * uAgitation * 0.006 * (
        sin(position.x * 40.0 + uTime * 9.0)
      + sin(position.z * 47.0 - uTime * 7.0) * 0.7
    );

    vLocal = p;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(p, 1.0);
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
  uniform vec3  uColour;
  uniform float uLevel;        // 0…1 of the tube still occupied
  uniform float uHeight;
  uniform float uAgitation;    // 0…1 from the vapour-pressure excess
  uniform float uSuperheat;    // 0…1 of the way to bumping
  uniform float uBump;         // a decaying flash when it finally goes
  uniform float uRoom;

  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }

  void main() {
    float top = uHeight * uLevel;
    if (vLocal.y > top) discard;

    /* Beer–Lambert through what is left. Most of these liquids are water-clear,
       so this is a faint tint — except aniline, which is not. */
    float depth = max(0.0, top - vLocal.y);
    vec3 sigma = (1.0 - uColour) * 6.0;
    vec3 body = uColour * exp(-sigma * depth) * uRoom;

    /* Convection, and then a rolling boil. Cells rising and turning over, their
       speed and contrast set by the agitation. */
    float cell = noise(vLocal * vec3(70.0, 45.0, 70.0) + vec3(0.0, -uTime * (0.4 + 3.0 * uAgitation), 0.0));
    body += vec3(0.10, 0.11, 0.12) * (cell - 0.5) * (0.25 + 1.4 * uAgitation);

    /* Superheated: unnaturally still, and it reads as still because the noise
       is suppressed rather than because anything was switched off. */
    body = mix(body, uColour * uRoom * 1.04, uSuperheat * 0.5);

    /* The bump. A white-out that decays, because that is what it looks like
       from outside the tube. */
    body += vec3(1.0, 0.98, 0.94) * uBump * 0.8;

    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -vViewDir)), 4.0);
    body += vec3(0.62, 0.68, 0.76) * fres * 0.30;

    gl_FragColor = vec4(body, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const FusionTubeShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uColour: new THREE.Color(0.94, 0.96, 0.98),
    uLevel: 1,
    uHeight: 0.24,
    uAgitation: 0,
    uSuperheat: 0,
    uBump: 0,
    uRoom: 1.0,
  },
  vertexShader,
  fragmentShader,
  (m) => {
    m.transparent = false;
    m.depthWrite = true;
    m.side = THREE.FrontSide;
  },
);

extend({ FusionTubeShaderMaterial });
export default FusionTubeShaderMaterial;
