/**
 * TitrationBench — the bench for XI-CHE-C03.
 *
 * A stand and clamp, a burette over a conical flask on a stirrer, and an
 * electrode that can be put in the flask. The scene reads the store and draws
 * it: the liquid in the burette is at the mark the engine says, the stream is
 * there while the stopcock is open, a drop falls when a drop is added, and the
 * cloud under the tip is the titrant that has fallen but not been swirled in —
 * its colour is the indicator's colour at ITS pH, which is not the flask's.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../../../../../shared/three/Studio.jsx';
import { Vessel } from '../../../../../shared/three/Vessel.jsx';
import { Electrode } from '../../../../../shared/three/PhApparatus.jsx';
import { Burette, buretteLevel } from '../../../../../shared/three/Burette.jsx';
import { setLiquid } from '../../../../../shared/three/LiquidMaterial.jsx';
import { conicalFlaskProfile, heightAtVolume } from '../../../../../shared/three/profiles.js';
import { sceneAbsorption } from '../../../../../shared/chem/spectra.js';
import { useTitrationEngine } from '../engine/useTitrationEngine.js';
import { buretteReading, flaskVolume, FLASK_PATH_CM } from '../engine/titrate.js';

const FLASK = conicalFlaskProfile();
const TIP_Y = 1.12;                      // the burette's tip, just above the flask's neck
const FLASK_X = 0;
const ELECTRODE_IN = { x: 0.058, y: 0.5 };
const ELECTRODE_PARKED = { x: 0.62, y: 1.25 };
const HCL = [1, 1, 1];

export function TitrationBench() {
  const burette = useRef(); const flask = useRef(); const handle = useRef();
  const stream = useRef(); const drop = useRef(); const plume = useRef(); const electrode = useRef(); const bar = useRef(); const led = useRef();
  const clear = useMemo(() => sceneAbsorption(HCL), []);
  const anim = useMemo(() => ({ last: 0, dropT: -1, streamT: 0, ex: ELECTRODE_PARKED.x, ey: ELECTRODE_PARKED.y, handle: 0, bar: 0 }), []);

  useFrame((state, dtRaw) => {
    const s = useTitrationEngine.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const t = state.clock.elapsedTime;

    /* The burette column, at the mark the reading says. */
    setLiquid(burette.current, { time: t, absorb: clear, topY: buretteLevel(buretteReading(s)) });

    /* The flask. */
    const V = Math.min(flaskVolume(s), 240);
    const topY = heightAtVolume(FLASK, V);
    setLiquid(flask.current, { time: t, absorb: sceneAbsorption(s.world.colour.linear, FLASK_PATH_CM), topY });

    /* Titrant leaving the burette: a stream while the tap is open, a drop for a drop. */
    const gained = s.delivered - anim.last; anim.last = s.delivered;
    if (gained > 0 && s.stopcock !== 'open') { if (gained < 0.3) anim.dropT = 0; else anim.streamT = 0.7; }
    if (anim.dropT >= 0) { anim.dropT += dt; if (anim.dropT > 0.4) anim.dropT = -1; }
    anim.streamT = Math.max(0, anim.streamT - dt);
    const flowing = s.stopcock === 'open' || anim.streamT > 0;
    anim.handle += ((s.stopcock === 'open' ? Math.PI / 2 : 0) - anim.handle) * (1 - Math.exp(-dt * 12));
    if (handle.current) handle.current.rotation.z = anim.handle;
    const surface = heightAtVolume(FLASK, V);
    if (stream.current) {
      stream.current.visible = flowing;
      const len = Math.max(0.05, TIP_Y - surface);
      stream.current.scale.set(1, len, 1);
      stream.current.position.y = surface + len / 2;
      stream.current.material.opacity = 0.35 + 0.4 * Math.min(1, s.flow / 1.5);
    }
    if (drop.current) {
      const f = anim.dropT >= 0 ? anim.dropT / 0.4 : -1;
      drop.current.visible = f >= 0;
      if (f >= 0) drop.current.position.y = TIP_Y - 0.03 - f * f * (TIP_Y - 0.03 - surface);
    }

    /* The cloud of titrant that has not been swirled in. */
    if (plume.current) {
      const u = s.unmixed;
      plume.current.visible = u > 1e-3;
      if (u > 1e-3) {
        const r = 0.05 + 0.22 * Math.min(1, Math.cbrt(u / 0.6));
        plume.current.scale.setScalar(r);
        plume.current.position.y = Math.max(0.12, surface - r * 0.8);
        const c = s.world.plumeColour ? s.world.plumeColour.srgb : [1, 1, 1];
        plume.current.material.color.setRGB(c[0], c[1], c[2]);
        plume.current.material.opacity = 0.18 + 0.4 * Math.min(1, u / 0.3);
      }
    }

    /* The electrode: in the flask when the engine says so, parked when not. */
    const want = s.meter === 'in' ? ELECTRODE_IN : ELECTRODE_PARKED;
    anim.ex += (want.x - anim.ex) * (1 - Math.exp(-dt * 5));
    anim.ey += (want.y - anim.ey) * (1 - Math.exp(-dt * 5));
    if (electrode.current) { electrode.current.position.x = anim.ex; electrode.current.position.y = anim.ey; }

    /* The stirrer plate's magnet turns, and its light is on, while it is on. */
    anim.bar += s.stirrer === 'on' ? dt * 14 : 0;
    if (bar.current) bar.current.rotation.y = anim.bar;
    if (led.current) led.current.material.emissiveIntensity = s.stirrer === 'on' ? 2.2 : 0.05;
  });

  return (
    <group>
      <Studio benchRadius={5} shadowScale={8} />

      {/* Stirrer plate. */}
      <group position={[FLASK_X, 0, 0]}>
        <mesh position={[0, -0.04, 0]}>
          <cylinderGeometry args={[0.55, 0.58, 0.08, 40]} />
          <meshStandardMaterial color="#1c2433" roughness={0.5} metalness={0.4} />
        </mesh>
        <mesh ref={bar} position={[0, 0.004, 0]}>
          <boxGeometry args={[0.34, 0.006, 0.05]} />
          <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
        </mesh>
        <mesh ref={led} position={[0.46, -0.04, 0.2]}>
          <sphereGeometry args={[0.018, 12, 12]} />
          <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.05} />
        </mesh>
      </group>

      <Vessel profile={FLASK} liquidRef={flask} position={[FLASK_X, 0, 0]} />

      {/* The cloud under the tip. */}
      <mesh ref={plume} position={[FLASK_X, 0.5, 0]} visible={false}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial transparent opacity={0.4} depthWrite={false} />
      </mesh>

      {/* Stand, clamp and burette. */}
      <mesh position={[-0.5, 0.01, -0.1]}>
        <boxGeometry args={[0.6, 0.02, 0.4]} />
        <meshStandardMaterial color="#202a3b" roughness={0.45} metalness={0.5} />
      </mesh>
      <mesh position={[-0.7, 1.95, -0.1]}>
        <cylinderGeometry args={[0.014, 0.014, 3.9, 12]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[-0.35, 2.4, -0.05]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.011, 0.011, 0.7, 10]} />
        <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.7} />
      </mesh>
      <Burette liquidRef={burette} handleRef={handle} position={[FLASK_X, TIP_Y, 0]} />

      {/* What falls from the tip. */}
      <mesh ref={stream} position={[FLASK_X, 0.6, 0]} visible={false}>
        <cylinderGeometry args={[0.009, 0.009, 1, 8]} />
        <meshStandardMaterial color="#dbeafe" transparent opacity={0.5} roughness={0.1} />
      </mesh>
      <mesh ref={drop} position={[FLASK_X, TIP_Y - 0.05, 0]} visible={false}>
        <sphereGeometry args={[0.024, 12, 10]} />
        <meshStandardMaterial color="#dbeafe" transparent opacity={0.8} roughness={0.1} />
      </mesh>

      <Electrode ref={electrode} position={[ELECTRODE_PARKED.x, ELECTRODE_PARKED.y, 0]} />
    </group>
  );
}

export default TitrationBench;
