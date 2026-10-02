/**
 * TubeRack — the scene for every tube-and-dropper bench.
 *
 * Reads the store the lab built with createTubeStore and draws it: the tubes in
 * their rack with the liquid, turbidity, suspended and settled precipitate and
 * bubbles the lab's `observe` returned; two baths behind the rack, which a tube
 * is lifted into when it is put in one; a shelf of dropper bottles above, with a
 * dropper that comes down over the active tube and lets its drops fall in.
 * Colour is the transmittance the spectral pipeline computed — nothing here
 * knows what a pH, a complex or a precipitate is.
 *
 * Laid out to be read from the front: tubes on a white card so a colour is
 * judged against white, baths behind and to either side, reagents above.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Studio } from '../three/Studio.jsx';
import { Vessel } from '../three/Vessel.jsx';
import { setLiquid } from '../three/LiquidMaterial.jsx';
import { cylinderProfile, testTubeProfile, heightAtVolume } from '../three/profiles.js';
import { sceneAbsorption } from '../chem/spectra.js';

const TUBE = testTubeProfile({ r: 0.085, h: 1.0 });
const BATH = cylinderProfile({ r: 0.26, h: 0.6 });
const PITCH = 0.28;
const TUBE_Z = 0.16;
const REST_Y = 0.03;
const BATH_AT = { ice: [-0.76, -0.5], hot: [0.76, -0.5] };
const BATH_TINT = { ice: [0.6, 0.83, 1], hot: [0.95, 0.86, 0.72] };
const SHELF_Y = 1.18;
const SHELF_Z = -0.82;
const DROP_S = 0.13;                    // seconds between drops

const hexToLinear = (hex) => new THREE.Color(hex);

/** A letter on a small rounded square — the label on a tube or a bottle. */
function useLabelTexture(text, bg, fg = '#0b1220') {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = bg; g.beginPath(); g.roundRect?.(8, 8, 112, 112, 22); if (!g.roundRect) g.rect(8, 8, 112, 112); g.fill();
      g.fillStyle = fg; g.font = `700 ${Math.min(74, Math.round(104 / Math.max(1.2, text.length * 0.78)))}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 70);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [text, bg, fg]);
}

function TubeLabel({ text, colour }) {
  const map = useLabelTexture(text, colour);
  return <mesh position={[0, 0.5, 0.103]}><planeGeometry args={[0.075, 0.075]} /><meshBasicMaterial map={map} transparent toneMapped={false} /></mesh>;
}

function BottleLabel({ text }) {
  const map = useLabelTexture(text, '#f8fafc');
  return <mesh position={[0, 0.15, 0.0815]}><planeGeometry args={[0.13, 0.13]} /><meshBasicMaterial map={map} transparent toneMapped={false} /></mesh>;
}

export function TubeRack({ store, cfg }) {
  const n = cfg.tubes.length;
  const tubeRefs = useRef(cfg.tubes.map(() => ({ current: null })));
  const groups = useRef(cfg.tubes.map(() => ({ current: null })));
  const rings = useRef(cfg.tubes.map(() => ({ current: null })));
  const bubbles = useRef(cfg.tubes.map(() => ({ current: null })));
  const bottleRings = useRef(cfg.reagents.map(() => ({ current: null })));
  const bathRefs = { ice: useRef(), hot: useRef() };
  const plate = useRef(); const steam = useRef(); const dropper = useRef(); const dropperLiquid = useRef(); const drops = useRef();
  const anim = useMemo(() => ({
    seq: 0, t: -1, x: 0, n: 1, colour: '#dbeafe',
    pos: cfg.tubes.map((_, i) => ({ x: (i - (n - 1) / 2) * PITCH, y: REST_Y, z: TUBE_Z })),
  }), [cfg.tubes, n]);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => ({ ph: i * 0.37 + 0.11, x: ((i * 7919) % 100) / 100 - 0.5 })), []);
  const bubbleGeo = useMemo(() => new THREE.SphereGeometry(0.012, 8, 6), []);
  const bubbleMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 }), []);
  const steamMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }), []);
  const dropMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#dbeafe', roughness: 0.1, transparent: true, opacity: 0.9 }), []);

  useFrame((state, dtRaw) => {
    const s = store.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const t = state.clock.elapsedTime;
    let hotUsed = false;
    s.tubes.forEach((tube, i) => {
      const o = tube.obs;
      const level = Math.min(heightAtVolume(TUBE, (cfg.volume ?? ((c) => c.volumeMl))(tube.content)), 0.96);
      /* A precipitate hangs in the liquid just after it forms, then settles into a bed. */
      const settled = 1 - Math.exp(-Math.max(0, s.elapsed - tube.doseAt) / Math.max(0.5, o.settleTau ?? 45));
      const pc = o.precip ?? [1, 1, 1, 0]; const bd = o.bed ?? [1, 1, 1, 0];
      setLiquid(tubeRefs.current[i].current, {
        time: t, topY: level, absorb: sceneAbsorption(o.colour.linear, cfg.pathCm ?? 1.4),
        scatter: (o.scatter ?? 0) * (1 - settled), scatterColour: o.scatterColour, precip: [pc[0], pc[1], pc[2], pc[3] * (1 - settled)], bed: [bd[0], bd[1], bd[2], bd[3] * settled],
        agitation: o.agitation ?? 0,
      });
      /* A tube in a bath is lifted out of the rack and stood in it. */
      const at = tube.bath !== 'air' ? BATH_AT[tube.bath] : null;
      if (tube.bath === 'hot') hotUsed = true;
      const want = at ? { x: at[0] + (tube.bath === 'hot' ? -0.04 : 0.04), y: 0.2, z: at[1] } : { x: (i - (n - 1) / 2) * PITCH, y: REST_Y, z: TUBE_Z };
      const p = anim.pos[i]; const k = 1 - Math.exp(-dt * 4.5);
      p.x += (want.x - p.x) * k; p.y += (want.y - p.y) * k; p.z += (want.z - p.z) * k;
      const g = groups.current[i].current;
      if (g) g.position.set(p.x, p.y, p.z);
      const ring = rings.current[i].current;
      if (ring) ring.material.emissiveIntensity = tube.id === s.active ? 1.4 : 0.12;
      /* Gas: a few bubbles rising through the liquid, quicker with the rate, dying away as the gas that came out does. */
      const bg = bubbles.current[i].current;
      const gas = (o.gas ?? 0) * Math.exp(-Math.max(0, s.elapsed - (tube.gasAt ?? tube.doseAt)) / (o.gasTau ?? 1e9));
      if (bg) {
        bg.visible = gas > 0.02;
        if (bg.visible) bg.children.forEach((b, j) => {
          const sd = seeds[j]; const ph = (t * (0.4 + 1.6 * gas) + sd.ph) % 1;
          b.position.set(sd.x * 0.1, 0.06 + ph * Math.max(0.05, level - 0.08), 0);
          b.scale.setScalar(0.7 + 0.5 * Math.sin(ph * 3.14));
        });
      }
    });
    for (const k of ['ice', 'hot']) setLiquid(bathRefs[k].current, { time: t, topY: heightAtVolume(BATH, 70), absorb: sceneAbsorption(BATH_TINT[k], 5) });
    if (plate.current) plate.current.material.emissiveIntensity = hotUsed ? 1.1 : 0.25;
    if (steam.current) steam.current.children.forEach((b, j) => {
      const ph = (t * 0.22 + j * 0.17) % 1;
      b.position.set(BATH_AT.hot[0] + Math.sin(j * 2.1 + t * 0.6) * 0.1, 0.66 + ph * 0.35, BATH_AT.hot[1] + Math.cos(j * 1.7) * 0.08);
      b.scale.setScalar(0.5 + ph * 1.4); b.visible = hotUsed;
    });

    /* The picked reagent's bottle is lit; a dropper comes down over the active tube when a dose is made. */
    cfg.reagents.forEach((r, j) => { const m = bottleRings.current[j].current; if (m) m.material.emissiveIntensity = r.id === s.reagent ? 1.3 : 0.05; });
    if (s.doseSeq !== anim.seq) {
      anim.seq = s.doseSeq; anim.t = 0;
      const ai = Math.max(0, s.tubes.findIndex((q) => q.id === s.lastDose?.tube));
      anim.x = anim.pos[ai].x; anim.z = anim.pos[ai].z;
      anim.n = Math.min(s.lastDose?.drops ?? 1, 6);
      anim.colour = cfg.reagents.find((r) => r.id === s.lastDose?.id)?.swatch ?? '#dbeafe';
      dropMat.color.set(hexToLinear(anim.colour));
      if (dropperLiquid.current) dropperLiquid.current.material.color.set(hexToLinear(anim.colour));
    }
    if (anim.t >= 0) {
      anim.t += dt;
      const total = 0.4 + anim.n * DROP_S + 0.35;
      const d = dropper.current;
      if (d) {
        d.visible = anim.t < total;
        const rise = anim.t < 0.3 ? 1 - anim.t / 0.3 : anim.t > total - 0.3 ? (anim.t - (total - 0.3)) / 0.3 : 0;
        d.position.set(anim.x, 1.5 + rise * 0.5, anim.z);
      }
      if (drops.current) drops.current.children.forEach((m, j) => {
        const t0 = 0.3 + j * DROP_S; const u = (anim.t - t0) / 0.28;
        m.visible = j < anim.n && u > 0 && u < 1;
        if (m.visible) m.position.set(anim.x, 1.4 - u * u * 0.42, anim.z);
      });
      if (anim.t >= total) anim.t = -1;
    }
  });

  const rackW = (n - 1) * PITCH + 0.5;
  return (
    <group>
      <Studio benchRadius={5} shadowScale={8} />
      {/* A white card on the bench under the rack, and a white screen behind everything: a colour is judged against white. */}
      <mesh position={[0, 0.004, TUBE_Z]} rotation-x={-Math.PI / 2}><planeGeometry args={[rackW + 0.2, 0.55]} /><meshStandardMaterial color="#f1f4f8" roughness={0.95} /></mesh>
      <mesh position={[0, 0.8, -1.05]}><planeGeometry args={[2.4, 1.7]} /><meshStandardMaterial color="#dfe4ec" roughness={0.97} /></mesh>
      {/* The rack. */}
      <mesh position={[0, 0.018, TUBE_Z]}><boxGeometry args={[rackW, 0.03, 0.3]} /><meshStandardMaterial color="#b98e55" roughness={0.6} /></mesh>
      <mesh position={[0, 0.5, TUBE_Z - 0.13]}><boxGeometry args={[rackW, 0.03, 0.025]} /><meshStandardMaterial color="#b98e55" roughness={0.6} /></mesh>

      {cfg.tubes.map((def, i) => (
        <group key={def.id} ref={groups.current[i]} position={[(i - (n - 1) / 2) * PITCH, REST_Y, TUBE_Z]}>
          <Vessel profile={TUBE} liquidRef={(m) => { tubeRefs.current[i].current = m; }} />
          <mesh ref={rings.current[i]} position={[0, 0.9, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[0.1, 0.012, 8, 28]} /><meshStandardMaterial color={def.tag ?? '#38bdf8'} emissive={def.tag ?? '#38bdf8'} emissiveIntensity={0.12} />
          </mesh>
          <TubeLabel text={def.label} colour={def.tag ?? '#38bdf8'} />
          <group ref={bubbles.current[i]} visible={false}>{seeds.map((sd, j) => <mesh key={j} geometry={bubbleGeo} material={bubbleMat} />)}</group>
        </group>
      ))}

      {/* Baths: ice and water on the left, a hot plate and water on the right. */}
      <Vessel profile={BATH} liquidRef={bathRefs.ice} position={[BATH_AT.ice[0], 0, BATH_AT.ice[1]]} />
      <Vessel profile={BATH} liquidRef={bathRefs.hot} position={[BATH_AT.hot[0], 0, BATH_AT.hot[1]]} />
      {[[-0.08, 0.1, 0.4], [0.07, 0.15, 1.1], [0.0, -0.1, 2.0], [-0.1, -0.06, 2.7], [0.1, -0.04, 0.2]].map(([x, z, r], j) => (
        <mesh key={j} position={[BATH_AT.ice[0] + x, 0.32, BATH_AT.ice[1] + z]} rotation={[r, r * 0.7, r * 0.4]}>
          <boxGeometry args={[0.085, 0.085, 0.085]} /><meshStandardMaterial color="#d9eefb" roughness={0.15} transparent opacity={0.8} />
        </mesh>
      ))}
      <mesh ref={plate} position={[BATH_AT.hot[0], -0.012, BATH_AT.hot[1]]}>
        <cylinderGeometry args={[0.31, 0.31, 0.03, 36]} /><meshStandardMaterial color="#2a2f3a" emissive="#ef4444" emissiveIntensity={0.25} roughness={0.5} />
      </mesh>
      <group ref={steam}>{[0, 1, 2, 3, 4].map((j) => <mesh key={j} material={steamMat}><sphereGeometry args={[0.05, 10, 8]} /></mesh>)}</group>

      {/* The shelf of dropper bottles. */}
      <mesh position={[0, SHELF_Y - 0.015, SHELF_Z]}><boxGeometry args={[(cfg.reagents.length) * (cfg.shelfPitch ?? 0.3) + 0.25, 0.03, 0.26]} /><meshStandardMaterial color="#b98e55" roughness={0.6} /></mesh>
      {cfg.reagents.map((r, j) => {
        const x = (j - (cfg.reagents.length - 1) / 2) * (cfg.shelfPitch ?? 0.3);
        return (
          <group key={r.id} position={[x, SHELF_Y, SHELF_Z]}>
            <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.08, 0.08, 0.3, 22]} /><meshStandardMaterial color={r.swatch ?? '#9fb6d9'} roughness={0.25} transparent opacity={0.78} /></mesh>
            <mesh position={[0, 0.34, 0]}><cylinderGeometry args={[0.028, 0.045, 0.1, 14]} /><meshStandardMaterial color="#1b2536" roughness={0.6} /></mesh>
            <mesh position={[0, 0.42, 0]}><sphereGeometry args={[0.04, 14, 10]} /><meshStandardMaterial color="#1b2536" roughness={0.6} /></mesh>
            <mesh ref={bottleRings.current[j]} position={[0, 0.3, 0]} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.085, 0.008, 8, 24]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.05} />
            </mesh>
            <BottleLabel text={r.short ?? r.label[0]} />
          </group>
        );
      })}

      {/* The dropper that comes down over the tube being dosed, and its drops. */}
      <group ref={dropper} visible={false} position={[0, 1.6, 0]}>
        <mesh position={[0, -0.1, 0]}><cylinderGeometry args={[0.014, 0.006, 0.3, 12]} /><meshStandardMaterial color="#e5eef8" roughness={0.1} transparent opacity={0.5} /></mesh>
        <mesh ref={dropperLiquid} position={[0, -0.14, 0]}><cylinderGeometry args={[0.009, 0.004, 0.2, 10]} /><meshStandardMaterial color="#dbeafe" roughness={0.2} transparent opacity={0.85} /></mesh>
        <mesh position={[0, 0.1, 0]}><sphereGeometry args={[0.045, 14, 10]} /><meshStandardMaterial color="#1b2536" roughness={0.6} /></mesh>
      </group>
      <group ref={drops}>{[0, 1, 2, 3, 4, 5].map((j) => <mesh key={j} material={dropMat} visible={false}><sphereGeometry args={[0.018, 12, 10]} /></mesh>)}</group>
    </group>
  );
}

export default TubeRack;
