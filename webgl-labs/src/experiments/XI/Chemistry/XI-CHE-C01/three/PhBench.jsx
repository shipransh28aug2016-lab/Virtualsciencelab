/**
 * PhBench — the bench for XI-CHE-C01.
 *
 * Three buffer beakers, a rinse beaker and the sample, a test tube for the
 * universal indicator, a strip on a tile, and the electrode on its arm. The
 * scene reads the store and draws it: the electrode really is in the buffer when
 * the engine says it is, the strip really does develop as the engine's clock
 * runs, and the colour of every liquid is the transmittance the spectral
 * pipeline computed — nothing here knows what a pH is.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../../../../../shared/three/Studio.jsx';
import { Vessel } from '../../../../../shared/three/Vessel.jsx';
import { Electrode, Strip } from '../../../../../shared/three/PhApparatus.jsx';
import { setLiquid } from '../../../../../shared/three/LiquidMaterial.jsx';
import { cylinderProfile, testTubeProfile, heightAtVolume } from '../../../../../shared/three/profiles.js';
import { sceneAbsorption } from '../../../../../shared/chem/spectra.js';
import { usePhEngine } from '../engine/usePhEngine.js';
import { SAMPLE_ML, TUBE_ML } from '../engine/ph.js';

/* Where things stand along the bench, in scene units of 10 cm. */
const X = { buf4: -1.3, buf7: -0.85, buf9: -0.4, rinse: 0.05, sample: 0.55, tube: 1.05, strip: 1.5 };
const BEAKER = cylinderProfile({ r: 0.19, h: 0.34 });
const TUBE = testTubeProfile({ r: 0.07, h: 0.62 });
const H25 = heightAtVolume(BEAKER, SAMPLE_ML);
const H10 = heightAtVolume(TUBE, TUBE_ML);

/* The standards are colour-coded, as real ones are, so a student does not
   have to read a label to know which is which. Linear transmittance at 1 cm. */
const BUFFER_DYE = { buf4: [0.96, 0.34, 0.38], buf7: [0.78, 0.95, 0.36], buf9: [0.34, 0.55, 0.96] };
const CLEAR = [1, 1, 1];

const HOVER_Y = 0.78;
const DIP_Y = 0.13;

export function PhBench() {
  const refs = {
    buf4: useRef(), buf7: useRef(), buf9: useRef(), rinse: useRef(), sample: useRef(), tube: useRef(),
  };
  const electrode = useRef();
  const stripTip = useRef();
  const pos = useMemo(() => ({ x: X.rinse, y: HOVER_Y }), []);
  const absorbs = useMemo(() => ({
    buf4: sceneAbsorption(BUFFER_DYE.buf4), buf7: sceneAbsorption(BUFFER_DYE.buf7),
    buf9: sceneAbsorption(BUFFER_DYE.buf9), clear: sceneAbsorption(CLEAR),
  }), []);

  useFrame((state, dtRaw) => {
    const s = usePhEngine.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const t = state.clock.elapsedTime;

    /* Liquids. */
    for (const k of ['buf4', 'buf7', 'buf9']) setLiquid(refs[k].current, { time: t, absorb: absorbs[k], topY: H25 });
    setLiquid(refs.rinse.current, { time: t, absorb: absorbs.clear, topY: H25 });
    setLiquid(refs.sample.current, { time: t, absorb: sceneAbsorption(s.world.tint), topY: H25 });
    /* The tube holds the sample with the indicator in it — the colour is the
       spectral pipeline's, tinted by the sample's own colour. */
    const tubeColour = s.world.universal ? s.world.universal.colour.linear : s.world.tint;
    setLiquid(refs.tube.current, { time: t, absorb: sceneAbsorption(tubeColour), topY: s.method === 'universal' ? H10 : 0 });

    /* The electrode goes where the engine says it is, and stays where it was
       when lifted — it does not teleport home. */
    const target = X[s.location];
    if (target !== undefined) pos.x += (target - pos.x) * (1 - Math.exp(-dt * 5));
    const wantY = s.location === 'air' ? HOVER_Y : DIP_Y;
    pos.y += (wantY - pos.y) * (1 - Math.exp(-dt * 6));
    if (electrode.current) { electrode.current.position.x = pos.x; electrode.current.position.y = pos.y; }

    /* The strip: cream where it is dry, the engine's colour where it is wet. */
    if (stripTip.current) {
      const dev = s.strip.dipped ? 1 - Math.exp(-s.strip.t / 6) : 0;
      const wet = s.world.paper ? s.world.paper.srgb : [0.95, 0.93, 0.86];
      stripTip.current.material.color.setRGB(
        0.95 + (wet[0] - 0.95) * dev, 0.93 + (wet[1] - 0.93) * dev, 0.86 + (wet[2] - 0.86) * dev,
      );
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <Studio benchRadius={4} shadowScale={7} />

      {['buf4', 'buf7', 'buf9', 'rinse', 'sample'].map((k) => (
        <Vessel key={k} profile={BEAKER} liquidRef={refs[k]} position={[X[k], 0, 0]} />
      ))}

      {/* The test tube, only when the indicator is in use. */}
      <Vessel profile={TUBE} liquidRef={refs.tube} position={[X.tube, 0, 0]} />

      {/* A tile with the strip on it. */}
      <mesh position={[X.strip, 0.006, 0]}>
        <boxGeometry args={[0.5, 0.012, 0.3]} />
        <meshStandardMaterial color="#e8eaee" roughness={0.6} />
      </mesh>
      <Strip tipRef={stripTip} position={[X.strip, 0.016, 0]} rotation-y={0.35} />

      {/* The electrode, on its arm. */}
      <Electrode ref={electrode} position={[X.rinse, HOVER_Y, 0]} />
    </group>
  );
}

export default PhBench;
