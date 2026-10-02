/**
 * AcidBench — the bench for XI-CHE-C02.
 *
 * A rack with two test tubes, a rinse beaker, a tile with two strips, and the
 * electrode on its arm. The scene reads the store and draws it: the electrode
 * really is in tube B when the engine says it is, a strip develops as the
 * engine's clock runs, and each tube's colour is what the indicator
 * chemistry computed for that tube — nothing here knows what a pH is.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Studio } from '../../../../../shared/three/Studio.jsx';
import { Vessel } from '../../../../../shared/three/Vessel.jsx';
import { Electrode, Strip } from '../../../../../shared/three/PhApparatus.jsx';
import { setLiquid } from '../../../../../shared/three/LiquidMaterial.jsx';
import { cylinderProfile, testTubeProfile, heightAtVolume } from '../../../../../shared/three/profiles.js';
import { sceneAbsorption } from '../../../../../shared/chem/spectra.js';
import { useAcidEngine } from '../engine/useAcidEngine.js';
import { TUBE_ML, stripDevelopment } from '../engine/acids.js';

/* Where things stand along the bench, in scene units of 10 cm. */
const X = { A: -0.45, B: 0.05, rinse: 0.75, strips: 1.45 };
const TUBE = testTubeProfile({ r: 0.085, h: 1.0 });
const BEAKER = cylinderProfile({ r: 0.2, h: 0.36 });
const H10 = heightAtVolume(TUBE, TUBE_ML);
const H_RINSE = heightAtVolume(BEAKER, 120);
const CLEAR = [1, 1, 1];
const HOVER_Y = 0.95;
const DIP_Y = 0.2;
const TAGS = { A: '#38bdf8', B: '#fbbf24' };

export function AcidBench() {
  const tubeA = useRef(); const tubeB = useRef(); const rinse = useRef();
  const electrode = useRef(); const tipA = useRef(); const tipB = useRef();
  const pos = useMemo(() => ({ x: X.rinse, y: HOVER_Y }), []);
  const clear = useMemo(() => sceneAbsorption(CLEAR), []);

  useFrame((state, dtRaw) => {
    const s = useAcidEngine.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const t = state.clock.elapsedTime;

    /* With indicator in the tubes they take its colour; otherwise an acid is as clear as water. */
    const col = (k) => (s.method === 'universal' && s.world[k].universal ? s.world[k].universal.colour.linear : CLEAR);
    setLiquid(tubeA.current, { time: t, absorb: sceneAbsorption(col('A')), topY: H10 });
    setLiquid(tubeB.current, { time: t, absorb: sceneAbsorption(col('B')), topY: H10 });
    setLiquid(rinse.current, { time: t, absorb: clear, topY: H_RINSE });

    /* The electrode goes where the engine says it is, and stays there when lifted. */
    const target = X[s.where];
    if (target !== undefined) pos.x += (target - pos.x) * (1 - Math.exp(-dt * 5));
    const wantY = s.where === 'air' ? HOVER_Y : DIP_Y;
    pos.y += (wantY - pos.y) * (1 - Math.exp(-dt * 6));
    if (electrode.current) { electrode.current.position.x = pos.x; electrode.current.position.y = pos.y; }

    /* Strips: cream where dry, the engine's colour where wet. */
    for (const [ref, strip, k] of [[tipA, s.stripA, 'A'], [tipB, s.stripB, 'B']]) {
      if (!ref.current) continue;
      const dev = stripDevelopment(strip);
      const wet = s.world[k].paper ? s.world[k].paper.srgb : [0.95, 0.93, 0.86];
      ref.current.material.color.setRGB(0.95 + (wet[0] - 0.95) * dev, 0.93 + (wet[1] - 0.93) * dev, 0.86 + (wet[2] - 0.86) * dev);
    }
  });

  return (
    <group>
      <Studio benchRadius={4} shadowScale={7} />

      <Vessel profile={TUBE} liquidRef={tubeA} position={[X.A, 0, 0]} />
      <Vessel profile={TUBE} liquidRef={tubeB} position={[X.B, 0, 0]} />
      <Vessel profile={BEAKER} liquidRef={rinse} position={[X.rinse, 0, 0]} />

      {/* A coloured collar on each tube, so A and B are never a matter of memory. */}
      {['A', 'B'].map((k) => (
        <mesh key={k} position={[X[k], 0.78, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.093, 0.011, 10, 32]} />
          <meshStandardMaterial color={TAGS[k]} roughness={0.5} />
        </mesh>
      ))}

      {/* A tile with a strip for each tube. */}
      <mesh position={[X.strips, 0.006, 0]}>
        <boxGeometry args={[0.5, 0.012, 0.42]} />
        <meshStandardMaterial color="#e8eaee" roughness={0.6} />
      </mesh>
      <Strip tipRef={tipA} position={[X.strips - 0.08, 0.016, 0]} rotation-y={0.2} />
      <Strip tipRef={tipB} position={[X.strips + 0.1, 0.016, 0]} rotation-y={-0.15} />
      {['A', 'B'].map((k, i) => (
        <mesh key={k} position={[X.strips + (i ? 0.1 : -0.08), 0.014, 0.19]}>
          <boxGeometry args={[0.06, 0.006, 0.03]} />
          <meshStandardMaterial color={TAGS[k]} roughness={0.5} />
        </mesh>
      ))}

      <Electrode ref={electrode} position={[X.rinse, HOVER_Y, 0]} />
    </group>
  );
}

export default AcidBench;
