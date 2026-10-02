/**
 * BathShaderMaterial — the liquid paraffin in the Thiele tube.
 *
 * The Thiele tube's whole reason for existing is that it stirs itself: heat the
 * side arm and the warm oil rises up the arm, crosses the top, and falls back
 * down the stem, so the bath stays at one temperature without anyone stirring
 * it. That circulation is what this shader draws, and it draws it from the
 * physics rather than from a looping texture:
 *
 *   · the convection speed comes from the heating rate, because the buoyant
 *     driving force is the temperature difference the flame is making;
 *   · the shimmer is SCHLIEREN — the refractive index of oil falls about
 *     4 × 10⁻⁴ per kelvin, so a hot bath with a gradient in it visibly wobbles
 *     everything seen through it. The amplitude is tied to dT/dy, which is why
 *     a bath at a steady temperature goes still and a fiercely heated one boils
 *     with distortion;
 *   · above the smoke point the oil darkens and the colour carries it, so a
 *     student who drives the bath at 12 °C/min to 220 °C can see what they have
 *     done to it.
 *
 * Opaque, deliberately: the tube around it is a transmissive material, and
 * three builds the refraction backdrop for those from the opaque pass only. A
 * transparent bath would be missing from it and the tube would render empty.
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
  uniform vec3  uColour;        // the bath liquid's own colour
  uniform float uTempNorm;      // 0 at the bench, 1 at the bath's ceiling
  uniform float uGradient;      // dT/dy in the bath, normalised — drives schlieren
  uniform float uFlow;          // convection speed, from the heating rate
  uniform float uSmoke;         // 0…1 past the smoke point: the oil darkens
  uniform float uDepth;         // optical path through the tube, scene units

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }

  void main() {
    /*
     * SCHLIEREN. dn/dT for a mineral oil is about −4 × 10⁻⁴ K⁻¹, so a bath with
     * a vertical gradient bends light by an angle proportional to that gradient
     * times the path length. We cannot ray-trace a continuously varying index in
     * a fragment shader worth the cost, so the bend is applied as a displacement
     * of the sampling coordinate — the same first-order approximation a schlieren
     * photograph is interpreted with. The important part is that the AMPLITUDE
     * is uGradient × uDepth and not a constant: a bath left to equalise goes
     * still by itself.
     */
    float rise = uTime * uFlow;
    vec2 q = vec2(vLocal.x * 14.0, vLocal.y * 9.0 - rise);
    float cell = noise(q) + 0.5 * noise(q * 2.1 + 3.7);
    float bend = (cell - 0.75) * uGradient * uDepth * 2.2;

    /*
     * Beer–Lambert through the bath. Paraffin is faintly straw-coloured and the
     * tube is only a couple of centimetres across, so this is a gentle tint —
     * until the oil is overheated, when the same law makes a darkened bath
     * genuinely hard to see the capillary through.
     */
    vec3 tint = mix(uColour, uColour * vec3(0.34, 0.26, 0.17), uSmoke);
    vec3 sigma = (1.0 - tint) * (1.4 + 5.0 * uSmoke);
    vec3 through = exp(-sigma * uDepth * (1.0 + bend * 0.35));

    /* Convection streaks: warm oil rising up the side arm and falling in the
       stem. Visible only while there is a gradient to drive them. */
    float streak = smoothstep(0.55, 1.0, cell) * uGradient * 1.6;
    vec3 colour = tint * through + vec3(1.0, 0.94, 0.80) * streak * 0.18;

    /* Hot oil glows a little in the amber end as it approaches its ceiling. Not
       incandescence — just the tint deepening, which is what you actually see. */
    colour *= mix(1.0, 1.18, uTempNorm);

    /* The meniscus rim, which is most of what makes a liquid read as a liquid. */
    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -vViewDir)), 4.0);
    colour += vec3(0.62, 0.66, 0.72) * fres * 0.25;

    gl_FragColor = vec4(colour, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const BathShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uColour: new THREE.Color(0.96, 0.86, 0.55),
    uTempNorm: 0,
    uGradient: 0,
    uFlow: 0,
    uSmoke: 0,
    uDepth: 0.36,
  },
  vertexShader,
  fragmentShader,
  (m) => {
    /* See the header: opaque, so the glass around it has something to refract. */
    m.transparent = false;
    m.depthWrite = true;
    m.side = THREE.FrontSide;
  },
);

extend({ BathShaderMaterial });
export default BathShaderMaterial;
