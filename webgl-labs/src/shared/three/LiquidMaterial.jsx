/**
 * LiquidMaterial — the liquid in any vessel, for every bench that has one.
 *
 * Opaque, deliberately, and this is the one piece of renderer knowledge in the
 * file. Glass here is a transmissive MeshPhysicalMaterial, and three builds the
 * refraction backdrop for transmissive surfaces from the OPAQUE pass only. A
 * transparent liquid would be missing from that backdrop: the glass in front of
 * it would sample the empty room instead and the vessel would render as a dark
 * shell with nothing in it. Opaque costs nothing, because this shader computes
 * its own transmission along the ray.
 *
 * What it draws is a medium with an optical depth, not a coloured fluid:
 *
 *   BEER–LAMBERT   I = I₀ exp(−α L). The lab hands it α per RGB channel — from
 *                  the molar absorptivities and the concentrations of whatever
 *                  is in the flask — and the shader supplies L, the chord the
 *                  view ray actually travels through the liquid. So a solution
 *                  is paler at the edge of a beaker and darker through the
 *                  middle, a drop of dye blooms as it mixes, and diluting a
 *                  solution pales it for a reason.
 *   TURBIDITY      scattering that whitens rather than tints: a suspension, a
 *                  precipitate forming, an emulsion.
 *   PRECIPITATE    a coloured suspended phase and, separately, a settled bed.
 *   MENISCUS       the dark crescent where the surface climbs the glass. In a
 *                  burette it is the thing you read.
 *
 * It knows nothing about chemistry. The lab computes α from ε and c.
 */
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewLocal;       // eye → fragment, in the vessel's own space

  void main() {
    vLocal = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 camLocal = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vViewLocal = normalize(position - camLocal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewLocal;

  uniform float uTime;
  uniform vec3  uAbsorb;         // α per RGB channel, per scene unit of path
  uniform float uScatter;        // turbidity: scattering coefficient
  uniform vec3  uScatterColour;
  uniform float uBaseY;
  uniform float uTopY;           // surface height, object space
  uniform float uMeniscus;       // height the surface climbs the wall
  uniform float uAgitation;      // 0…1 stirring / boiling
  uniform float uSchlieren;      // 0…1 refractive-index streaks while mixing
  uniform vec4  uPrecip;         // rgb colour of a suspended phase, a = amount
  uniform vec4  uBed;            // rgb colour of a settled bed, a = its height
  uniform float uSparkle;        // 0…1 dissolved gas coming out of solution
  uniform vec3  uRoom;           // radiance of the room behind the vessel

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
    if (vLocal.y > uTopY + uMeniscus) discard;

    /*
     * The chord: how far the view ray travels through the liquid before it
     * leaves. The fragment sits on the vessel wall at radius R, so the ray, going
     * inward, crosses the circle of radius R again at t = −2 (p·d)/(d·d) in the
     * horizontal plane. Clipped by the floor and by the surface, whichever it
     * meets first. For a flask with a sloping shoulder this takes R at the
     * fragment, which is the right order of magnitude and looks right.
     */
    vec3 d = normalize(vViewLocal);
    float dh = dot(d.xz, d.xz);
    float tSide = dh > 1e-5 ? max(0.0, -2.0 * dot(vLocal.xz, d.xz) / dh) : 1e3;
    float tVert = d.y > 1e-4 ? (uTopY - vLocal.y) / d.y
                : d.y < -1e-4 ? (uBaseY - vLocal.y) / d.y : 1e3;
    float path = max(0.0, min(tSide, max(tVert, 0.0)));

    /* Stirring and mixing stir the optical path itself. */
    float cell = noise(vLocal * vec3(34.0, 22.0, 34.0) + vec3(0.0, -uTime * (0.3 + 2.0 * uAgitation), 0.0));
    float wob = (cell - 0.5) * (0.30 * uSchlieren + 0.08 * uAgitation);
    path *= 1.0 + wob;

    /* Beer–Lambert, against the room behind. */
    vec3 T = exp(-uAbsorb * path);
    vec3 colour = uRoom * T;

    /* Turbidity: scattering whitens rather than tints. */
    float scat = 1.0 - exp(-uScatter * path);
    colour = mix(colour, uScatterColour * uRoom, scat);

    /* A suspended phase, coloured, thickening with the amount. */
    float susp = 1.0 - exp(-uPrecip.a * 6.0 * path);
    colour = mix(colour, uPrecip.rgb * uRoom, susp * 0.9);

    /* The settled bed, with a soft top edge and a grainy surface. */
    float bedTop = uBed.a * (1.0 + 0.10 * (noise(vLocal * 40.0) - 0.5));
    float inBed = 1.0 - smoothstep(bedTop - 0.012, bedTop + 0.012, vLocal.y);
    colour = mix(colour, uBed.rgb * uRoom * (0.82 + 0.28 * noise(vLocal * 60.0)), inBed * step(0.0005, uBed.a));

    /* Dissolved gas leaving solution: bright points through the liquid. */
    float fizz = smoothstep(0.93, 1.0, noise(vLocal * 70.0 + vec3(0.0, -uTime * 3.0, 0.0)));
    colour += vec3(0.85, 0.92, 1.0) * fizz * uSparkle * 0.55;

    /* The meniscus: where the surface climbs the glass it refracts and darkens.
       It is the dark ring a burette is read against. */
    float inMeniscus = smoothstep(uTopY - 0.002, uTopY + 0.002, vLocal.y);
    colour *= 1.0 - 0.45 * inMeniscus * step(0.0001, uMeniscus);

    /* Convection streaks: warm or concentrated liquid moving. */
    colour += vec3(0.05, 0.06, 0.08) * (cell - 0.5) * (0.3 + 1.2 * uAgitation + 1.5 * uSchlieren);

    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -normalize(vViewLocal))), 4.0);
    colour += vec3(0.58, 0.64, 0.72) * fres * 0.22;

    gl_FragColor = vec4(colour, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const LiquidMaterial = shaderMaterial(
  {
    uTime: 0,
    uAbsorb: new THREE.Vector3(0.05, 0.05, 0.05),
    uScatter: 0,
    uScatterColour: new THREE.Color(0.92, 0.94, 0.97),
    uBaseY: 0,
    uTopY: 0.4,
    uMeniscus: 0,
    uAgitation: 0,
    uSchlieren: 0,
    uPrecip: new THREE.Vector4(0.9, 0.9, 0.9, 0),
    uBed: new THREE.Vector4(0.9, 0.9, 0.9, 0),
    uSparkle: 0,
    uRoom: new THREE.Color(0.96, 0.97, 1.0),
  },
  vertexShader,
  fragmentShader,
  (m) => {
    m.transparent = false;
    m.depthWrite = true;
    m.side = THREE.FrontSide;
  },
);

extend({ LiquidMaterial });

/**
 * Set the liquid's state from a plain object. Only the fields given are
 * touched, and nothing is allocated, so it is safe to call every frame.
 *
 *   absorb [r,g,b]   α per scene unit          scatter n         turbidity
 *   topY n           surface height            meniscus n        climb height
 *   agitation n      schlieren n               sparkle n
 *   precip [r,g,b,a] bed [r,g,b,height]        time n
 */
export function setLiquid(mat, p) {
  if (!mat) return;
  const u = mat.uniforms;
  if (p.time !== undefined) u.uTime.value = p.time;
  if (p.absorb) u.uAbsorb.value.set(p.absorb[0], p.absorb[1], p.absorb[2]);
  if (p.scatter !== undefined) u.uScatter.value = p.scatter;
  if (p.scatterColour) u.uScatterColour.value.setRGB(p.scatterColour[0], p.scatterColour[1], p.scatterColour[2]);
  if (p.baseY !== undefined) u.uBaseY.value = p.baseY;
  if (p.topY !== undefined) u.uTopY.value = p.topY;
  if (p.meniscus !== undefined) u.uMeniscus.value = p.meniscus;
  if (p.agitation !== undefined) u.uAgitation.value = p.agitation;
  if (p.schlieren !== undefined) u.uSchlieren.value = p.schlieren;
  if (p.sparkle !== undefined) u.uSparkle.value = p.sparkle;
  if (p.precip) u.uPrecip.value.set(p.precip[0], p.precip[1], p.precip[2], p.precip[3]);
  if (p.bed) u.uBed.value.set(p.bed[0], p.bed[1], p.bed[2], p.bed[3]);
}

export default LiquidMaterial;
