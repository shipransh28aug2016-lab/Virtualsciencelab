/**
 * SolutionShaderMaterial — the liquid in the beaker.
 *
 * Everything it shows is a number from the engine, and the most important one
 * is the concentration. Copper sulphate solution is blue because of the
 * hexaaquacopper(II) ion, and it is blue in proportion to how much of it there
 * is — so as crystals come down, the solution above them visibly pales. That
 * fading is the experiment: it is the mother liquor giving up its solute, and a
 * student who watches it can see when crystallisation has finished without
 * being told.
 *
 *   uConcentration   g of solute per gram of free solvent, normalised against
 *                    the hot saturated value. Drives Beer–Lambert absorption,
 *                    so the colour is an optical depth rather than a tint.
 *   uCloud           the flash of fine crystals at nucleation — the moment the
 *                    whole flask goes opaque and then clears as they settle.
 *   uUndissolved     solid still sitting on the bottom because there was not
 *                    enough solvent.
 *   uAgitation       convection while it is being heated.
 *
 * Opaque, like every liquid in this project: the beaker around it is a
 * transmissive material and three builds its refraction backdrop from the
 * opaque pass, so a transparent liquid would be missing from it and the beaker
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
    float atSurface = smoothstep(0.80, 1.0, position.y / max(uHeight * uLevel, 1e-4));
    p.y += atSurface * uAgitation * 0.004 * (
        sin(position.x * 26.0 + uTime * 5.0)
      + sin(position.z * 31.0 - uTime * 4.0) * 0.7
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
  uniform vec3  uSoluteColour;   // the colour of the dissolved ion
  uniform float uConcentration;  // 0 … ~1, relative to hot saturation
  uniform float uCloud;          // 0…1, the nucleation flash
  uniform float uUndissolved;    // 0…1 of the floor covered in undissolved solid
  uniform float uBedTop;         // height of the crystal bed, object space
  uniform float uLevel;
  uniform float uHeight;
  uniform float uAgitation;
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

    /*
     * BEER–LAMBERT. The absorption coefficient is proportional to the
     * concentration, and what the eye receives is what survives the path
     * through the liquid. So the solution is not "tinted blue": it is a
     * coloured medium of a definite optical depth, it darkens as it is
     * concentrated and pales as the solute leaves it, and the pale rim at the
     * top of a nearly-empty beaker comes out on its own.
     */
    float depth = max(0.0, top - vLocal.y) + 0.02;
    vec3 sigma = (1.0 - uSoluteColour) * (0.9 + 16.0 * uConcentration);
    vec3 body = uRoom * exp(-sigma * depth);

    /* Convection while it is on the flame. */
    float cell = noise(vLocal * vec3(26.0, 18.0, 26.0) + vec3(0.0, -uTime * (0.2 + 1.8 * uAgitation), 0.0));
    body += vec3(0.06, 0.07, 0.09) * (cell - 0.5) * (0.2 + 1.2 * uAgitation);

    /*
     * The nucleation flash. When the metastable zone finally gives way the
     * whole flask clouds at once with crystals too small to see individually —
     * and then clears from the top down as they grow and settle. Scattering,
     * so it whitens rather than tints.
     */
    float settle = smoothstep(uBedTop, top, vLocal.y);
    body = mix(body, vec3(0.92, 0.94, 0.97), uCloud * (0.25 + 0.55 * (1.0 - settle)));

    /* Undissolved solid on the floor: not crystals, just what never went in. */
    float floorBand = 1.0 - smoothstep(0.0, 0.028, vLocal.y);
    body = mix(body, mix(uSoluteColour, vec3(1.0), 0.35), floorBand * uUndissolved);

    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -vViewDir)), 4.0);
    body += vec3(0.60, 0.66, 0.74) * fres * 0.28;

    gl_FragColor = vec4(body, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const SolutionShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uSoluteColour: new THREE.Color(0.16, 0.42, 0.78),
    uConcentration: 0,
    uCloud: 0,
    uUndissolved: 0,
    uBedTop: 0,
    uLevel: 1,
    uHeight: 0.42,
    uAgitation: 0,
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

extend({ SolutionShaderMaterial });
export default SolutionShaderMaterial;
