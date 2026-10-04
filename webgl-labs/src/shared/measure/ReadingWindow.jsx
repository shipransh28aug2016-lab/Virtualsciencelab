/**
 * The reading window — a hand lens on the scales. What it draws is the physical state of the instrument at
 * a magnification no screen could give the real thing: the main-scale lines and the vernier lines (or the
 * sleeve scale and the circular scale at the datum line), their positions from the jaws' actual gap, the
 * zero error of the instrument, the backlash it has been left with and where the eye is. Which line
 * coincides is not marked: that is the student's to find.
 */
import { useMemo } from 'react';
import { GLASS } from '../ui/kit.jsx';
import { viewOf } from './createMeasure.js';

const INK = '#cbd5e1'; const DIM = '#64748b'; const ACCENT = '#fbbf24'; const DATUM = '#f87171';

/** Pixels to the millimetre in the lens: a 50-division vernier is read through a stronger glass, since its lines differ from the main scale's by 0.02 mm. */
export const vernierPX = (inst) => (inst.n > 20 ? 87 : 29);
/** How long the vernier is: n divisions of (msd − lc). */
export const vernierLength = (inst) => inst.n * (inst.msd - inst.lc);

/**
 * Vernier callipers: the main scale above, the vernier below. The lens rides on the slide, so the vernier zero stays where
 * it is in the picture and the main scale slides past it; a strong lens sees only a few millimetres of a long vernier
 * at a time, and the student moves it along (`lens`, mm from the vernier zero) to find which line coincides.
 */
export function VernierSVG({ inst, pos, parallax, lens = 0 }) {
  const W = 640; const PX = vernierPX(inst);
  const at = inst.n > 20 ? lens : 0;
  const x0 = pos + at - 2.5;
  const X = (mm) => (mm - x0) * PX;
  const ticks = [];
  for (let m = Math.max(0, Math.ceil(x0)); m <= x0 + W / PX; m += 1) {
    const long = m % 10 === 0; const mid = m % 5 === 0;
    ticks.push(<line key={`m${m}`} data-mm={m} x1={X(m)} x2={X(m)} y1={70} y2={70 - (long ? 28 : mid ? 20 : 13)} stroke={INK} strokeWidth={long ? 1.6 : 1.1} />);
    if (long) ticks.push(<text key={`t${m}`} x={X(m)} y={36} fill={INK} fontSize={25} textAnchor="middle">{m / 10}</text>);
  }
  /* The k-th vernier line stands (msd − lc) mm beyond the (k−1)th; the eye off the line of sight sees them all shifted by parallax × lc. */
  const vern = [];
  for (let k = 0; k <= inst.n; k += 1) {
    const x = X(pos + k * (inst.msd - inst.lc) + parallax * inst.lc);
    if (x < -12 || x > W + 12) continue;
    const label = k % 5 === 0;
    vern.push(<line key={`v${k}`} data-k={k} x1={x} x2={x} y1={80} y2={80 + (label ? 22 : 13)} stroke={ACCENT} strokeWidth={label ? 1.6 : 1.1} />);
    if (label) vern.push(<text key={`vt${k}`} x={x} y={121} fill={ACCENT} fontSize={23} textAnchor="middle">{k}</text>);
  }
  return (
    <svg viewBox={`0 0 ${W} 130`} className="w-full rounded-xl border border-white/5 bg-black/30" role="img" aria-label="Magnified vernier and main scale" data-probe="reading-window" data-kind="vernier" data-px={PX}>
      <rect x={0} y={14} width={W} height={58} fill="#1c2535" />
      <rect x={0} y={76} width={W} height={52} fill="#273247" />
      <line x1={0} x2={W} y1={73} y2={73} stroke={DIM} strokeWidth={1} />
      {ticks}
      {vern}
      <text x={6} y={11} fill={DIM} fontSize={15}>cm · {inst.n} div{inst.n > 20 ? ` · ×3 lens, ${at.toFixed(1)} mm along` : ''}</text>
    </svg>
  );
}

/** A linear scale with a circular scale at its datum line: a screw gauge's sleeve and thimble, or a spherometer's pillar and disc. */
export function ScrewSVG({ inst, pos, parallax, label, rim = 'thimble' }) {
  const W = 640; const PXMM = 64; const D = 8;
  const x0 = Math.floor(pos) - 3;                                    // the datum is kept a few millimetres in from the left; there is no sleeve scale left of its zero
  const X = (mm) => (mm - x0) * PXMM;
  const edge = X(pos);
  const half = inst.pitch;                                   // the sleeve is divided in pitches: whole millimetres above the datum line, the half millimetres of a 0.5 mm screw below
  const ticks = [];
  for (let m = Math.max(0, Math.ceil(x0 / half - 1e-9) * half); X(m) < edge + 1 && m < x0 + W / PXMM + 1; m += half) {
    const full = Math.abs(m - Math.round(m)) < 1e-9;
    ticks.push(<line key={`s${m}`} data-mm={Number(m.toFixed(3))} x1={X(m)} x2={X(m)} y1={96} y2={full ? 62 : 112} stroke={INK} strokeWidth={1.4} />);
    if (full && Math.round(m) % 5 === 0) ticks.push(<text key={`st${m}`} x={X(m)} y={50} fill={INK} fontSize={24} textAnchor="middle">{Math.round(m)}</text>);
  }
  const f = (((pos % inst.pitch) + inst.pitch) % inst.pitch) / inst.lc;           // the fractional division standing at the datum
  const k0 = Math.round(f);
  const circ = [];
  for (let d = -11; d <= 11; d += 1) {
    const k = (((k0 + d) % inst.n) + inst.n) % inst.n;
    const y = 96 + (k0 + d - f - parallax) * D;
    const five = k % 5 === 0;
    circ.push(<line key={`c${d}`} data-div={k} x1={edge + 4} x2={edge + (five ? 40 : 26)} y1={y} y2={y} stroke={ACCENT} strokeWidth={five ? 1.6 : 1.1} />);
    if (k % 10 === 0 || (inst.n <= 50 && five)) circ.push(<text key={`ct${d}`} x={edge + 48} y={y + 8} fill={ACCENT} fontSize={22}>{k}</text>);
  }
  return (
    <svg viewBox={`0 0 ${W} 192`} className="w-full rounded-xl border border-white/5 bg-black/30" role="img" aria-label={`Magnified ${label}`} data-probe="reading-window" data-kind="screw" data-edge={edge}>
      <rect x={Math.max(0, X(0))} y={58} width={Math.max(0, edge - Math.max(0, X(0)))} height={76} fill="#1c2535" />
      <rect x={edge} y={8} width={Math.max(0, W - edge)} height={176} fill="#273247" rx={4} />
      <line x1={0} x2={W} y1={96} y2={96} stroke={DATUM} strokeWidth={1.4} />
      {ticks}
      {circ}
      <text x={6} y={14} fill={DIM} fontSize={15}>mm · {inst.n} div round the {rim}</text>
    </svg>
  );
}

export function makeReadingWindow(cfg, { label = 'screw gauge', rim = 'thimble' } = {}) {
  return function ReadingWindow({ useStore }) {
    const key = useStore((s) => `${s.instrument}|${s.specimen}|${s.dim}|${s.opening}|${s.place}|${s.angle}|${s.eye}|${s.ratchet}|${s.side}|${s.lens}`);
    const lens = useStore((s) => s.lens);
    const eye = useStore((s) => s.eye);
    const v = useMemo(() => viewOf(cfg, useStore.getState()), [key, useStore]);
    const parallax = ({ left: -0.5, centre: 0, right: 0.5 })[eye] ?? 0;
    return (
      <div className={`${GLASS} mb-3 p-3`}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Hand lens on the scales</div>
        {cfg.kind === 'vernier' ? <VernierSVG inst={v.inst} pos={v.disp.pos} parallax={parallax} lens={lens} /> : <ScrewSVG inst={v.inst} pos={v.disp.pos} parallax={parallax} label={label} rim={rim} />}
      </div>
    );
  };
}
