/**
 * FlameShaderMaterial — the burner.
 *
 * A flame is not decoration here: its height is the gas flow, its colour is the
 * air supply, and both are what the student is actually adjusting when they set
 * a heating rate. A luminous yellow flame is an air-starved one — cooler, sooty,
 * and the reason a lab manual tells you to open the air hole.
 *
 * Drawn as a billboarded quad with an analytic flame field rather than a mesh,
 * because a flame has no surface.
 */
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform float uTime;
  uniform float uPower;      // 0…1, gas flow → flame height
  uniform float uAir;        // 0 = air hole shut (yellow, sooty), 1 = open (blue)
  uniform float uLit;
  uniform vec3 uTint;        // the colour of whatever is vaporised in the flame
  uniform float uTintAmt;    // 0…1: how much of the flame's body it colours

  /* Value noise. Cheap, and a flame is turbulent enough that nothing better
     would be visible at this size. */
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    if (uLit < 0.5) discard;

    vec2 p = vUv - vec2(0.5, 0.0);
    float h = clamp(vUv.y, 0.0, 1.0);

    /* Flame height scales with gas flow; the body narrows as it rises and the
       turbulence grows with height, which is what makes a flame flicker at the
       tip and stand still at the base. */
    float top = 0.28 + 0.66 * uPower;
    float turbulence = fbm(vec2(p.x * 7.0, vUv.y * 4.0 - uTime * 2.6)) - 0.5;
    float x = p.x + turbulence * 0.09 * smoothstep(0.0, top, vUv.y);

    float width = (0.16 + 0.10 * uPower) * (1.0 - smoothstep(0.0, top, vUv.y));
    float body = 1.0 - smoothstep(width * 0.55, width, abs(x));
    body *= 1.0 - smoothstep(top * 0.72, top, vUv.y);
    if (body <= 0.001) discard;

    /* The inner cone: the unburnt gas–air mixture, present only when the air
       hole is open. It is the hottest part of the flame and the part you put
       the side arm of the Thiele tube over. */
    float innerTop = top * (0.18 + 0.30 * uAir);
    float inner = (1.0 - smoothstep(width * 0.20, width * 0.42, abs(x)))
                * (1.0 - smoothstep(innerTop * 0.6, innerTop, vUv.y)) * uAir;

    /* Colour. Air open: the non-luminous blue flame, hot and clean. Air shut:
       incandescent soot, bright yellow and a couple of hundred degrees cooler. */
    vec3 sooty  = mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.36, 0.06), h / max(top, 0.001));
    vec3 clean  = mix(vec3(0.42, 0.62, 1.0), vec3(0.30, 0.45, 0.95), h / max(top, 0.001));
    vec3 colour = mix(sooty, clean, uAir);
    colour = mix(colour, vec3(0.55, 0.85, 1.0), inner * 0.9);
    /* A salt on a wire colours the flame above it. */
    colour = mix(colour, uTint * 1.5, uTintAmt * smoothstep(top * 0.1, top * 0.42, vUv.y) * (1.0 - inner));

    /* Luminous flames are bright because of glowing carbon; blue ones are not.
       The blue flame is the one that gets the job done, and it is the dimmer of
       the two — worth a student noticing. */
    float brightness = mix(1.35, 0.62, uAir);
    gl_FragColor = vec4(colour * brightness, body * (0.55 + 0.45 * uPower));

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const FlameShaderMaterial = shaderMaterial(
  { uTime: 0, uPower: 0.5, uAir: 1, uLit: 0, uTint: new THREE.Color(0, 0, 0), uTintAmt: 0 },
  vertexShader,
  fragmentShader,
  (m) => {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.AdditiveBlending;
    m.side = THREE.DoubleSide;
    m.toneMapped = false;
  },
);

extend({ FlameShaderMaterial });
export default FlameShaderMaterial;
