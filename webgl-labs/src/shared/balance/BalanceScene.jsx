/**
 * BalanceScene — the balance and the things that go on it, for every bench that weighs.
 *
 * Reads a store of the shape useWeighEngine has — `display`, `balanceId`, `bals`,
 * `beam`, `feet`, `objects`, `pan`, `picked` — and draws it: an electronic
 * balance whose LCD is a texture redrawn when the number changes, a draft shield
 * with a sliding door, a bubble level that moves with the tilt; a triple-beam
 * whose beam tips and whose riders slide; and objects that stand on a tray until
 * they are placed on the pan. Clicking an object picks it; clicking the TARE
 * button tares; clicking the shield opens and closes it. Nothing here knows what
 * a gram is — the numbers are the engine's.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { GlassMaterial } from '../three/Glass.jsx';
import { BALANCES } from './balance.js';
import { BEAM } from './beam.js';

export const BALANCE_X = -0.8;
const PAN_Y = 0.3;                                  // top of the electronic pan
const BEAM_X = -0.3;
const BEAM_PAN = { x: -0.78, rest: 0.34 };
const lerp = (a, b, t) => a + (b - a) * t;

/** Where the objects wait: a tray to the right of the balance, two rows. */
export const TRAY = {
  bottle: [0.22, 0.6], salt: [0.5, 0.6], glass: [0.95, 0.6], cuso4: [1.45, 0.6],
  naoh: [0.22, -0.15], coin: [0.52, -0.15], crucible: [0.87, -0.15], check: [1.17, -0.15], block: [1.52, -0.15],
  calweight: [0.3, -0.8], received: [0.95, -0.8],
};

/* ── The LCD ─────────────────────────────────────────────────────────────────── */

function useLcd() {
  return useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 112;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    let last = '';
    const draw = (text, { stable, tare, over, mech }) => {
      const key = `${text}|${stable}|${tare}|${over}`;
      if (key === last) return; last = key;
      const c = canvas.getContext('2d'); if (!c) return;
      c.fillStyle = '#0a1a10'; c.fillRect(0, 0, 320, 112);
      c.fillStyle = '#86ffb4'; c.textBaseline = 'middle';
      c.font = 'bold 62px monospace'; c.textAlign = 'right'; c.fillText(text, 262, 54);
      c.font = 'bold 28px monospace'; c.textAlign = 'left'; c.fillText(mech ? '' : 'g', 272, 70);
      c.font = 'bold 26px monospace'; c.fillText(stable ? '*' : '', 14, 24);
      c.fillStyle = tare ? '#86ffb4' : '#1c3a28'; c.font = 'bold 20px monospace'; c.fillText('NET', 14, 92);
      if (over) { c.fillStyle = '#ff8a8a'; c.fillText('OL', 262, 92); }
      tex.needsUpdate = true;
    };
    draw('0.00', { stable: false, tare: false, over: false });
    return { tex, draw };
  }, []);
}

/* ── The electronic balance ──────────────────────────────────────────────────── */

export function ElectronicBalance({ useStore }) {
  const root = useRef(); const door = useRef(); const bubble = useRef(); const shieldGroup = useRef(); const led = useRef();
  const lcd = useLcd();
  const anim = useMemo(() => ({ door: 0 }), []);
  useEffect(() => () => lcd.tex.dispose(), [lcd]);

  useFrame((_, dtRaw) => {
    const s = useStore.getState();
    const dt = Math.min(dtRaw, 1 / 20);
    const show = s.balanceId !== 'beam';
    if (root.current) root.current.visible = show;
    if (!show) return;
    const sp = BALANCES[s.balanceId];
    const r = s.display.reading;
    lcd.draw(r.text, { stable: r.stable, tare: Math.abs(s.display.bal.tareG) > 0.5 * sp.d, over: r.over });
    if (shieldGroup.current) shieldGroup.current.visible = sp.shield;
    anim.door += ((s.bals[s.balanceId].shield === 'closed' ? 1 : 0) - anim.door) * (1 - Math.exp(-dt * 6));
    if (door.current) door.current.position.x = lerp(0.62, 0, anim.door);
    if (bubble.current) bubble.current.position.x = Math.max(-0.032, Math.min(0.032, Math.sign(s.feet?.[s.balanceId] ?? 1) * s.display.bal.tilt * 0.03));
    if (led.current) led.current.material.emissiveIntensity = r.stable ? 2.2 : 0.1;
  });

  const tare = () => useStore.getState().tare();
  const toggleShield = (e) => { e.stopPropagation(); const s = useStore.getState(); s.setShield(s.bals[s.balanceId].shield === 'closed' ? 'open' : 'closed'); };

  return (
    <group ref={root} position={[BALANCE_X, 0, 0]}>
      {/* The body, its feet, the pan on its post. */}
      <mesh position={[0, 0.1, 0]}><boxGeometry args={[1.3, 0.2, 1.1]} /><meshStandardMaterial color="#d3d8e1" roughness={0.45} metalness={0.2} /></mesh>
      {[[-0.55, 0.45], [0.55, 0.45], [-0.55, -0.45], [0.55, -0.45]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.01, z]}><cylinderGeometry args={[0.05, 0.06, 0.02, 14]} /><meshStandardMaterial color="#222a38" roughness={0.7} /></mesh>
      ))}
      <mesh position={[0, 0.235, 0]}><cylinderGeometry args={[0.05, 0.07, 0.07, 18]} /><meshStandardMaterial color="#7f8898" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, PAN_Y - 0.01, 0]}><cylinderGeometry args={[0.42, 0.42, 0.02, 48]} /><meshStandardMaterial color="#a3acba" metalness={0.75} roughness={0.28} /></mesh>
      {/* Front panel: the display and its buttons. */}
      <mesh position={[0, 0.112, 0.552]}><planeGeometry args={[0.78, 0.16]} /><meshBasicMaterial map={lcd.tex} toneMapped={false} /></mesh>
      <mesh position={[0.5, 0.1, 0.553]} onClick={(e) => { e.stopPropagation(); tare(); }}>
        <boxGeometry args={[0.13, 0.07, 0.02]} /><meshStandardMaterial color="#2f8f5b" roughness={0.5} />
      </mesh>
      <mesh position={[-0.5, 0.1, 0.553]}><boxGeometry args={[0.13, 0.07, 0.02]} /><meshStandardMaterial color="#556070" roughness={0.5} /></mesh>
      <mesh ref={led} position={[0.38, 0.17, 0.552]}><sphereGeometry args={[0.014, 10, 10]} /><meshStandardMaterial color="#86ffb4" emissive="#86ffb4" emissiveIntensity={0.1} /></mesh>
      {/* The bubble level. */}
      <group position={[-0.5, 0.202, 0.42]}>
        <mesh rotation-x={-Math.PI / 2}><circleGeometry args={[0.05, 24]} /><meshStandardMaterial color="#cfe9ff" transparent opacity={0.55} roughness={0.1} /></mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}><ringGeometry args={[0.022, 0.026, 28]} /><meshBasicMaterial color="#334155" /></mesh>
        <mesh ref={bubble} position={[0, 0.004, 0]}><sphereGeometry args={[0.012, 12, 10]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} /></mesh>
      </group>
      {/* The draft shield: glass on three sides and the top, and a door in front that slides. */}
      <group ref={shieldGroup}>
        {[[0, 0.72, -0.5, 1.2, 0.86, 0], [-0.6, 0.72, 0, 1.0, 0.86, Math.PI / 2], [0.6, 0.72, 0, 1.0, 0.86, Math.PI / 2]].map(([x, y, z, w, h, ry], i) => (
          <mesh key={i} position={[x, y, z]} rotation-y={ry}><planeGeometry args={[w, h]} /><meshStandardMaterial color="#cfe6ff" transparent opacity={0.1} side={THREE.DoubleSide} roughness={0.1} depthWrite={false} /></mesh>
        ))}
        <mesh position={[0, 1.15, 0]} rotation-x={Math.PI / 2}><planeGeometry args={[1.2, 1.0]} /><meshStandardMaterial color="#cfe6ff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} /></mesh>
        <mesh ref={door} position={[0, 0.72, 0.5]} onClick={toggleShield}>
          <planeGeometry args={[1.2, 0.86]} /><meshStandardMaterial color="#cfe6ff" transparent opacity={0.14} side={THREE.DoubleSide} roughness={0.1} depthWrite={false} />
        </mesh>
        {[[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.5], [0.6, 0.5]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.72, z]}><boxGeometry args={[0.025, 0.86, 0.025]} /><meshStandardMaterial color="#3a4458" roughness={0.5} /></mesh>
        ))}
        <mesh position={[0, 1.15, 0]}><boxGeometry args={[1.25, 0.02, 1.05]} /><meshStandardMaterial color="#3a4458" transparent opacity={0.0} /></mesh>
      </group>
    </group>
  );
}

/* ── The triple-beam balance ─────────────────────────────────────────────────── */

const beamX = {
  h: (v) => 0.18 + (v / 100) * 0.2,
  t: (v) => 0.18 + (v / 10) * 0.1,
  u: (v) => 0.18 + (v / 10) * 1.0,
};

export function BeamBalance({ useStore }) {
  const root = useRef(); const beam = useRef(); const pan = useRef(); const rh = useRef(); const rt = useRef(); const ru = useRef();
  const screw = useRef();
  useFrame(() => {
    const s = useStore.getState();
    const show = s.balanceId === 'beam';
    if (root.current) root.current.visible = show;
    if (!show) return;
    const th = (Math.max(-9, Math.min(9, s.beam.theta)) * 0.5 * Math.PI) / 180;
    if (beam.current) beam.current.rotation.z = th;
    if (pan.current) pan.current.position.y = BEAM_PAN.rest - 0.75 * Math.sin(th);
    if (rh.current) rh.current.position.x = beamX.h(s.beam.r.h);
    if (rt.current) rt.current.position.x = beamX.t(s.beam.r.t);
    if (ru.current) ru.current.position.x = beamX.u(s.beam.r.u);
    if (screw.current) screw.current.rotation.x = s.beam.adjust * 20;
  });
  return (
    <group ref={root} position={[BEAM_X, 0, 0]}>
      <mesh position={[0, 0.04, 0]}><boxGeometry args={[1.9, 0.08, 0.7]} /><meshStandardMaterial color="#2a3446" roughness={0.55} metalness={0.3} /></mesh>
      <mesh position={[-0.05, 0.34, 0]}><boxGeometry args={[0.08, 0.5, 0.12]} /><meshStandardMaterial color="#3a4458" roughness={0.5} metalness={0.4} /></mesh>
      {/* The fixed scale at the pointer end, with its zero mark. */}
      <mesh position={[1.42, 0.62, 0]}><boxGeometry args={[0.03, 0.46, 0.06]} /><meshStandardMaterial color="#e5e9f0" roughness={0.6} /></mesh>
      {[-2, -1, 0, 1, 2].map((k) => <mesh key={k} position={[1.405, 0.62 + k * 0.045, 0.033]}><boxGeometry args={[k === 0 ? 0.04 : 0.025, 0.006, 0.004]} /><meshBasicMaterial color={k === 0 ? '#ef4444' : '#1e293b'} /></mesh>)}
      <group ref={beam} position={[-0.05, 0.62, 0]}>
        {/* Three beams, one above the other along z. */}
        {[[0.14, 'h'], [0, 't'], [-0.14, 'u']].map(([z, id]) => (
          <mesh key={id} position={[0.75, 0, z]}><boxGeometry args={[1.5, 0.022, 0.05]} /><meshStandardMaterial color="#cbd2dd" metalness={0.65} roughness={0.3} /></mesh>
        ))}
        <mesh position={[-0.35, 0, 0]}><boxGeometry args={[0.8, 0.03, 0.12]} /><meshStandardMaterial color="#cbd2dd" metalness={0.65} roughness={0.3} /></mesh>
        {[0, 1, 2, 3, 4, 5].map((k) => <mesh key={`h${k}`} position={[beamX.h(k * 100), 0.016, 0.14]}><boxGeometry args={[0.008, 0.016, 0.052]} /><meshStandardMaterial color="#556070" /></mesh>)}
        {Array.from({ length: 11 }, (_, k) => <mesh key={`t${k}`} position={[beamX.t(k * 10), 0.016, 0]}><boxGeometry args={[0.008, 0.016, 0.052]} /><meshStandardMaterial color="#556070" /></mesh>)}
        {Array.from({ length: 11 }, (_, k) => <mesh key={`u${k}`} position={[beamX.u(k), 0.016, -0.14]}><boxGeometry args={[0.006, 0.016, 0.052]} /><meshStandardMaterial color="#556070" /></mesh>)}
        <mesh ref={rh} position={[0.18, 0.03, 0.14]}><boxGeometry args={[0.09, 0.07, 0.07]} /><meshStandardMaterial color="#c9a227" metalness={0.7} roughness={0.3} /></mesh>
        <mesh ref={rt} position={[0.18, 0.03, 0]}><boxGeometry args={[0.07, 0.06, 0.07]} /><meshStandardMaterial color="#b8892a" metalness={0.7} roughness={0.3} /></mesh>
        <mesh ref={ru} position={[0.18, 0.03, -0.14]}><boxGeometry args={[0.04, 0.055, 0.07]} /><meshStandardMaterial color="#d6b04a" metalness={0.7} roughness={0.3} /></mesh>
        <mesh position={[1.5, 0, 0]}><boxGeometry args={[0.02, 0.2, 0.03]} /><meshStandardMaterial color="#f43f5e" roughness={0.5} /></mesh>
        <mesh ref={screw} position={[-0.74, 0.0, 0.0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.025, 0.025, 0.06, 12]} /><meshStandardMaterial color="#8f98a8" metalness={0.8} roughness={0.3} /></mesh>
        <mesh position={[-0.78, -0.16, 0]}><cylinderGeometry args={[0.005, 0.005, 0.32, 6]} /><meshStandardMaterial color="#cbd2dd" metalness={0.7} /></mesh>
      </group>
      <group ref={pan} position={[BEAM_PAN.x, BEAM_PAN.rest, 0]}>
        <mesh><cylinderGeometry args={[0.34, 0.34, 0.02, 40]} /><meshStandardMaterial color="#a3acba" metalness={0.75} roughness={0.28} /></mesh>
        <mesh position={[0, -0.12, 0]}><cylinderGeometry args={[0.012, 0.012, 0.22, 8]} /><meshStandardMaterial color="#cbd2dd" metalness={0.7} /></mesh>
      </group>
    </group>
  );
}

/* ── Things that go on the pan ───────────────────────────────────────────────── */

const SAMPLE_COLOUR = { sample: '#f6f7f9' };
const mound = (g, rho) => 0.025 + 0.06 * Math.cbrt(Math.max(g, 0) / (rho * 0.9));

/** A cup of glass, open at the top. */
function GlassCup({ r, h, wall = 0.008 }) {
  return (
    <group>
      <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[r, r * 0.96, h, 36, 1, true]} /><GlassMaterial thickness={wall * 10} /></mesh>
      <mesh position={[0, 0.006, 0]}><cylinderGeometry args={[r * 0.96, r * 0.96, 0.012, 36]} /><GlassMaterial thickness={wall * 8} /></mesh>
    </group>
  );
}

function Shape({ shape, objRef }) {
  switch (shape) {
    case 'bottle': return (
      <group>
        <GlassCup r={0.11} h={0.38} />
        <mesh ref={(m) => { if (objRef) objRef.lid = m; }} position={[0, 0.4, 0]}><cylinderGeometry args={[0.1, 0.1, 0.06, 28]} /><meshStandardMaterial color="#cfe0f0" roughness={0.15} transparent opacity={0.85} /></mesh>
      </group>
    );
    case 'beaker': return <GlassCup r={0.17} h={0.34} />;
    case 'watchglass': return (
      <mesh position={[0, 0.095, 0]} rotation-x={0}>
        <sphereGeometry args={[0.55, 40, 12, 0, Math.PI * 2, Math.PI - 0.62, 0.62]} /><GlassMaterial thickness={0.05} />
      </mesh>
    );
    case 'coin': return <mesh position={[0, 0.008, 0]}><cylinderGeometry args={[0.12, 0.12, 0.016, 36]} /><meshStandardMaterial color="#c8c2b4" metalness={0.85} roughness={0.3} /></mesh>;
    case 'crucible': return (
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.15, 0.1, 0.2, 32]} /><meshStandardMaterial ref={(m) => { if (objRef) objRef.hot = m; }} color="#efe9df" roughness={0.7} emissive="#ff3b00" emissiveIntensity={0} /></mesh>
    );
    case 'weight': return (
      <group>
        <mesh position={[0, 0.04, 0]}><cylinderGeometry args={[0.09, 0.09, 0.08, 28]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0, 0.095, 0]}><cylinderGeometry args={[0.03, 0.05, 0.03, 20]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0, 0.125, 0]}><sphereGeometry args={[0.03, 14, 10]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
      </group>
    );
    case 'calweight': return (
      <group>
        <mesh position={[0, 0.07, 0]}><cylinderGeometry args={[0.15, 0.15, 0.14, 32]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.05, 0.08, 0.05, 24]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
        <mesh position={[0, 0.2, 0]}><sphereGeometry args={[0.045, 16, 12]} /><meshStandardMaterial color="#d7dbe2" metalness={0.9} roughness={0.2} /></mesh>
      </group>
    );
    case 'block': return <mesh position={[0, 0.09, 0]}><boxGeometry args={[0.36, 0.18, 0.24]} /><meshStandardMaterial color="#9ca3af" metalness={0.85} roughness={0.35} /></mesh>;
    default: return null;
  }
}

/** One object: on the tray until it is on the pan; a heap of sample inside if it holds any. */
function LabObject({ id, useStore, panAnchor, slots }) {
  const group = useRef(); const heap = useRef(); const ring = useRef();
  const extras = useMemo(() => ({ lid: null, hot: null }), []);
  const pos = useMemo(() => ({ x: slots[id]?.[0] ?? 0, y: 0, z: slots[id]?.[1] ?? 0 }), [id, slots]);
  const shape = useStore.getState().objects[id].shape;
  const containerShape = shape === 'watchglass' ? 0.02 : 0.02;
  useFrame((_, dtRaw) => {
    const s = useStore.getState(); const dt = Math.min(dtRaw, 1 / 20);
    const o = s.objects[id];
    const g = group.current; if (!g) return;
    g.visible = !o.hidden;
    const onPan = s.pan.includes(id);
    const want = onPan ? panAnchor(s) : { x: slots[id][0], y: 0, z: slots[id][1] };
    const k = 1 - Math.exp(-dt * 7);
    pos.x += (want.x - pos.x) * k; pos.y += (want.y - pos.y) * k; pos.z += (want.z - pos.z) * k;
    g.position.set(pos.x, pos.y + (onPan ? 0.02 : 0), pos.z);
    const sample = o.parts.find((p) => p.id === 'sample');
    if (heap.current) {
      heap.current.visible = Boolean(sample) && sample.m > 0.002;
      if (sample) { const r = mound(sample.m, sample.rho); heap.current.scale.set(r, r * 0.45, r); }
    }
    if (extras.lid) extras.lid.visible = Boolean(o.lid && o.lidOn);
    if (extras.hot) extras.hot.emissiveIntensity = Math.min(1.4, o.dT / 30);
    if (ring.current) ring.current.visible = s.picked === id && !onPan;
  });
  const sampleColour = id === 'cuso4' ? '#f4f6f4' : id === 'naoh' ? '#e8eef2' : SAMPLE_COLOUR.sample;
  const heapY = shape === 'bottle' ? 0.03 : shape === 'beaker' ? 0.03 : 0.03;
  return (
    <group ref={group} position={[slots[id][0], 0, slots[id][1]]} onClick={(e) => { e.stopPropagation(); useStore.getState().pick(id); }}>
      <Shape shape={shape} objRef={extras} />
      <mesh ref={heap} position={[0, heapY + containerShape * 0, 0]} visible={false}><sphereGeometry args={[1, 16, 10]} /><meshStandardMaterial color={sampleColour} roughness={0.9} /></mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} visible={false}><ringGeometry args={[0.26, 0.29, 40]} /><meshBasicMaterial color="#38bdf8" transparent opacity={0.85} /></mesh>
    </group>
  );
}

/** Everything: both balances and every object the store knows about. */
export function BalanceBench({ useStore, ids, slots = TRAY, beam = true }) {
  const panAnchor = (s) => (s.balanceId === 'beam'
    ? { x: BEAM_X + BEAM_PAN.x, y: BEAM_PAN.rest - 0.75 * Math.sin((Math.max(-9, Math.min(9, s.beam.theta)) * 0.5 * Math.PI) / 180) + 0.01, z: 0 }
    : { x: BALANCE_X, y: PAN_Y, z: 0 });
  const list = ids ?? Object.keys(slots);
  return (
    <group>
      <ElectronicBalance useStore={useStore} />
      {beam ? <BeamBalance useStore={useStore} /> : null}
      {list.map((id) => <LabObject key={id} id={id} useStore={useStore} panAnchor={panAnchor} slots={slots} />)}
    </group>
  );
}

export { BEAM };
export default BalanceBench;
