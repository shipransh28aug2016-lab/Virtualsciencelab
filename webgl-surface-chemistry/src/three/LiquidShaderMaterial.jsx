/**
 * LiquidShaderMaterial — the sol itself.
 *
 * Three things happen inside this fragment shader, and all three are integrals
 * along the view ray rather than tricks layered on top of a flat colour:
 *
 *   TRANSMISSION   Beer–Lambert. The body colour you see is what survives
 *                  exp(−βL) over the path the ray takes through the liquid, so
 *                  the sol darkens and greys as it clouds without anyone
 *                  animating an opacity.
 *
 *   TYNDALL        A single-scattering integral. The beam is a real cylinder of
 *                  light crossing the beaker; at each step along the view ray we
 *                  ask how much of that beam is there, how much of it has already
 *                  been absorbed getting there, and how much of it scatters
 *                  towards the eye. That is why the cone has soft edges, why it
 *                  is brighter where it enters than where it leaves, and why it
 *                  vanishes the moment the particles are gone.
 *
 *   SEDIMENT       The precipitate is an opaque layer whose height is the settled
 *                  fraction, with a diffusion-blurred boundary, because a real
 *                  one is never a sharp line.
 *
 * Every coefficient comes from the engine. The shader decides nothing about the
 * chemistry — it is a renderer of β, τ and the settled fraction, and if the
 * engine says the sol is clear the shader cannot make it cloudy.
 */
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

const vertexShader = /* glsl */ `
  varying vec3 vLocal;          // position in the liquid cylinder's own space
  varying vec3 vWorldNormal;
  varying vec3 vViewDirLocal;   // eye → fragment, in that same space

  uniform vec3  uCameraLocal;   // camera position in object space
  uniform float uTime;
  uniform float uCoagulation;   // 0…1
  uniform float uHeight;        // column height, base at y = 0

  void main() {
    vec3 p = position;

    /*
     * The meniscus, and the stillness of a coagulated liquid.
     *
     * A sol under Brownian agitation has a faintly live surface; once it has
     * flocculated it goes quiet, because the thing that was moving has fallen to
     * the bottom. Two decaying ripples give that without a fluid solver, and they
     * are damped by the coagulated fraction so the surface visibly settles.
     */
    float atSurface = smoothstep(0.85, 1.0, position.y / uHeight);
    float calm = 1.0 - 0.85 * uCoagulation;
    p.y += atSurface * calm * 0.004 * (
        sin(position.x * 9.0 + uTime * 1.3)
      + sin(position.z * 11.0 - uTime * 0.9) * 0.6
    );

    vLocal = p;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDirLocal = normalize(p - uCameraLocal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vLocal;
  varying vec3 vWorldNormal;
  varying vec3 vViewDirLocal;

  uniform float uTime;

  /* ── from the engine, every frame ─────────────────────────────────────── */
  uniform vec3  uSolColour;      // display colour, for the sediment bed
  uniform vec3  uRoom;           // radiance of the room the beaker stands in
  uniform vec3  uScatter;        // β per channel, per beaker-unit of path
  uniform vec3  uAbsorb;         // absorption per channel, per unit
  uniform float uCoagulation;    // 0…1, the coagulated fraction
  uniform float uSediment;       // 0…1, settled fraction of the column
  uniform float uForwardness;    // Henyey–Greenstein g: 0 Rayleigh, →0.8 large Mie

  /* ── the light beam ───────────────────────────────────────────────────── */
  uniform float uBeamOn;
  uniform float uBeamY;          // height of the beam axis, object space
  uniform float uBeamRadius;
  uniform vec3  uBeamColour;
  uniform float uBeamPower;

  /* ── geometry of the liquid volume ────────────────────────────────────── */
  uniform float uRadius;         // cylinder radius
  uniform float uHeight;         // cylinder height, base at y = 0
  uniform vec3  uCameraLocal;

  /*
   * Where does this view ray leave the liquid?
   *
   * Analytic, not marched: solve the quadratic for the infinite cylinder, then
   * clip against the base and the free surface. Getting the exit point exactly
   * right is what makes the path length — and therefore Beer–Lambert — correct
   * for every pixel instead of only for the ones facing the camera.
   */
  float exitDistance(vec3 o, vec3 d) {
    float a = dot(d.xz, d.xz);
    float b = 2.0 * dot(o.xz, d.xz);
    float c = dot(o.xz, o.xz) - uRadius * uRadius;
    float disc = b * b - 4.0 * a * c;
    if (disc <= 0.0 || a < 1e-6) return 0.0;
    float tSide = (-b + sqrt(disc)) / (2.0 * a);     // the far root

    /* Clip on the two horizontal planes. */
    float tPlane = 1e9;
    if (abs(d.y) > 1e-6) {
      float tBase = (0.0 - o.y) / d.y;
      float tTop  = (uHeight - o.y) / d.y;
      if (tBase > 1e-4) tPlane = min(tPlane, tBase);
      if (tTop  > 1e-4) tPlane = min(tPlane, tTop);
    }
    return max(0.0, min(tSide, tPlane));
  }

  /*
   * Henyey–Greenstein phase function, normalised over the sphere.
   *
   * g = 0 is isotropic, which is very nearly what Rayleigh scattering off a tiny
   * particle looks like; g rising towards 0.8 is the forward-peaked lobe of a
   * particle comparable with the wavelength. Coagulation walks g upwards, so the
   * Tyndall cone does not merely brighten — it narrows and leans away from the
   * lamp, which is exactly how a real flocculating sol behaves.
   */
  float phaseHG(float cosTheta, float g) {
    float g2 = g * g;
    float denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(denom, 1e-4), 1.5));
  }

  void main() {
    vec3 o = vLocal;
    vec3 d = normalize(vViewDirLocal);
    float far = exitDistance(o, d);

    /*
     * The sediment bed. Its top is at uSediment × uHeight, blurred over a band
     * that widens as the bed deepens, because the flocs arriving last are the
     * smallest and take longest to consolidate.
     */
    float bedTop = uSediment * uHeight * 0.9;
    float bedBlur = 0.01 + 0.05 * uSediment;

    /* ── the two integrals, marched together ─────────────────────────────── */
    const int STEPS = 28;
    float dt = far / float(STEPS);
    vec3 transmittance = vec3(1.0);       // what survives to the eye
    vec3 inscatter = vec3(0.0);           // what the beam adds along the way
    float bedHit = 0.0;

    /* Extinction per unit path: absorption plus scattering out of the ray. */
    vec3 sigmaT = uAbsorb + uScatter;

    float cosTheta = dot(d, vec3(1.0, 0.0, 0.0));   // beam travels along +x
    float phase = phaseHG(-cosTheta, uForwardness);

    for (int i = 0; i < STEPS; i++) {
      float t = (float(i) + 0.5) * dt;
      vec3 p = o + d * t;

      /* Inside the settled bed nothing more reaches the eye. */
      float inBed = smoothstep(bedTop + bedBlur, bedTop - bedBlur, p.y);
      bedHit = max(bedHit, inBed * transmittance.g);

      /*
       * How much beam is at this point? Radial Gaussian about the beam axis,
       * attenuated by everything it has had to pass through to get here — which
       * is why a turbid sol shows a bright cone only near the entry window and a
       * clear one shows an even line all the way across.
       */
      float r = length(vec2(p.y - uBeamY, p.z));
      float profile = exp(-2.0 * pow(r / uBeamRadius, 2.0));
      float beamPath = p.x + uRadius;                 // distance travelled in liquid
      vec3 beamHere = uBeamColour * uBeamPower * profile * exp(-sigmaT * beamPath);

      /* Single scattering: β · phase · beam, carried back along the view ray. */
      inscatter += transmittance * uScatter * phase * beamHere * dt * (1.0 - inBed);

      /* And the view ray itself is attenuated as it goes. */
      transmittance *= exp(-sigmaT * dt);
    }

    /*
     * The body colour. What the eye receives is the sol's own colour multiplied
     * by the transmittance over the path — Beer–Lambert, with no artistic
     * opacity anywhere. As β rises the liquid loses its colour and turns towards
     * the grey-white of a suspension, which is what coagulation looks like.
     */
    /*
     * KUBELKA–MUNK. What a turbid medium does with ordinary room light is not
     * Beer–Lambert — that only describes the light which gets through untouched.
     * Most of what the eye receives has been scattered many times inside the
     * liquid and come back out, and the closed form for that diffuse reflectance
     * of a deep layer is
     *
     *      a = K / S            R∞ = 1 + a − √(a² + 2a)
     *
     * with K the absorption and S the scattering coefficient, per channel.
     * Everything that makes a colloid look like a colloid falls out of this one
     * expression and none of it is tuned:
     *
     *   · a pristine sol has K ≫ S, so R∞ is small and takes the colour of the
     *     chromophore — Fe(OH)₃ brown, As₂S₃ yellow;
     *   · coagulation multiplies S by hundreds while K, which belongs to the
     *     chemistry and not to the particle size, does not move. a → 0, R∞ → 1,
     *     and the liquid turns milky white. That is what coagulation looks like
     *     in a real beaker, and here it is a consequence rather than a keyframe.
     */
    vec3 a = uAbsorb / max(uScatter, vec3(1e-4));
    vec3 diffuse = 1.0 + a - sqrt(a * a + 2.0 * a);

    /* Deep-layer reflectance applies to the part of the ray that did not get
       through; whatever did get through carries the room behind it. */
    vec3 colour = uRoom * (diffuse * (1.0 - transmittance) + transmittance * 0.35);

    colour += inscatter * uBeamOn;

    /* The precipitate: opaque, and darker than the sol it came from. */
    vec3 bedColour = mix(uSolColour * 0.45, vec3(0.32, 0.30, 0.28), 0.35);
    colour = mix(colour, bedColour, clamp(bedHit * 1.4, 0.0, 1.0));

    /*
     * Fresnel. A glancing view through a water surface is mostly reflection, and
     * the rim it puts on the meniscus is most of what makes a liquid read as a
     * liquid rather than as a coloured solid.
     */
    vec3 n = normalize(vWorldNormal);
    float fres = pow(1.0 - abs(dot(n, -normalize(vViewDirLocal))), 4.0);
    colour += vec3(0.55, 0.62, 0.70) * fres * 0.22;

    gl_FragColor = vec4(colour, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * Defaults describe a pristine ferric hydroxide sol: faintly scattering, almost
 * transparent, no sediment. Everything is overwritten from the store each frame.
 */
export const LiquidShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uSolColour: new THREE.Color(0.62, 0.28, 0.10),
    uRoom: new THREE.Color(0.92, 0.94, 1.0),
    uScatter: new THREE.Vector3(0.05, 0.07, 0.12),
    uAbsorb: new THREE.Vector3(0.9, 1.6, 2.4),
    uCoagulation: 0,
    uSediment: 0,
    uForwardness: 0.0,
    uBeamOn: 1,
    uBeamY: 0.55,
    uBeamRadius: 0.09,
    uBeamColour: new THREE.Color(1.0, 0.98, 0.92),
    uBeamPower: 3.0,
    uRadius: 0.62,
    uHeight: 1.15,
    uCameraLocal: new THREE.Vector3(0, 1, 4),
  },
  vertexShader,
  fragmentShader,
  (material) => {
    /*
     * Opaque, deliberately, and this is the one piece of renderer knowledge in
     * the file. The beaker wall is a transmissive MeshPhysicalMaterial, and
     * three builds its refraction backdrop from the OPAQUE pass only. A
     * transparent liquid is therefore missing from that backdrop: the glass in
     * front of it samples the empty room instead, and the beaker renders as a
     * dark shell with the sol invisible inside it — which is exactly what it did
     * before this line.
     *
     * Opaque costs nothing here, because the shader already computes its own
     * transmittance along the ray and the sol is a turbid medium, not a window.
     * It buys the thing that matters: the glass genuinely refracts the liquid.
     */
    material.transparent = false;
    material.depthWrite = true;
    material.side = THREE.FrontSide;
  },
);

extend({ LiquidShaderMaterial });

export default LiquidShaderMaterial;
