/**
 * The spherometer's pictures: the hand lens on the pillar scale and the disc (the same drawing as a screw gauge's sleeve and
 * thimble), the three impressions the legs left on paper with a ruler laid against one side, and the results.
 */
import { useMemo } from 'react';
import { GLASS } from '../ui/kit.jsx';
import { ScrewSVG } from './ReadingWindow.jsx';
import { viewOfSphero } from './createSpherometer.js';
import { impressions, rulerPositions } from './spherometer.js';

const INK = '#cbd5e1'; const DIM = '#64748b'; const ACCENT = '#fbbf24'; const CYAN = '#38bdf8';

export function makeSpheroWindow(useStore) {
  return function SpheroWindow() {
    const key = useStore((s) => `${s.instrument}|${s.surface}|${s.y}|${s.eye}|${s.side}`);
    const eye = useStore((s) => s.eye);
    const v = useMemo(() => viewOfSphero(useStore.getState()), [key]);
    const parallax = ({ left: -0.5, centre: 0, right: 0.5 })[eye] ?? 0;
    return (
      <div className={`${GLASS} mb-3 p-3`}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Hand lens on the scale and the disc</div>
        <ScrewSVG inst={v.sp} pos={v.disp.pos} parallax={parallax} label="spherometer" rim="disc" />
      </div>
    );
  };
}

/** A ruler laid against one side of the triangle of impressions, drawn flat, 9 px to the millimetre. */
export function RulerSVG({ pair, instrument, a, b, show }) {
  const W = 640; const PX = 9; const t = rulerPositions(instrument, pair);
  const X = (mm) => 6 + mm * PX;
  const ticks = [];
  for (let m = 0; m <= 70; m += 1) {
    const long = m % 10 === 0; const mid = m % 5 === 0;
    ticks.push(<line key={m} data-mm={m} x1={X(m)} x2={X(m)} y1={46} y2={46 + (long ? 26 : mid ? 19 : 12)} stroke={INK} strokeWidth={long ? 1.6 : 1} />);
    if (long) ticks.push(<text key={`t${m}`} x={X(m)} y={92} fill={INK} fontSize={20} textAnchor="middle">{m / 10}</text>);
  }
  return (
    <svg viewBox={`0 0 ${W} 100`} className="w-full rounded-xl border border-white/5 bg-black/30" role="img" aria-label="A ruler laid against two leg impressions" data-probe="ruler" data-pair={pair} data-px={PX}>
      <rect x={0} y={44} width={W} height={52} fill="#273247" />
      <line x1={0} x2={W} y1={44} y2={44} stroke={DIM} />
      {ticks}
      <circle data-dot="A" cx={X(t.a)} cy={36} r={3.2} fill={ACCENT} /><text x={X(t.a)} y={22} fill={ACCENT} fontSize={18} textAnchor="middle">{pair[0].toUpperCase()}</text>
      <circle data-dot="B" cx={X(t.b)} cy={36} r={3.2} fill={ACCENT} /><text x={X(t.b)} y={22} fill={ACCENT} fontSize={18} textAnchor="middle">{pair[1].toUpperCase()}</text>
      {show && a > 0 ? <line x1={X(a)} x2={X(a)} y1={28} y2={96} stroke={CYAN} strokeWidth={0.9} strokeDasharray="3 3" /> : null}
      {show && b > 0 ? <line x1={X(b)} x2={X(b)} y1={28} y2={96} stroke={CYAN} strokeWidth={0.9} strokeDasharray="3 3" /> : null}
    </svg>
  );
}

/** The impressions on the paper, and the side the ruler is against. */
export function makeLegsPanel(useStore) {
  return function LegsPanel() {
    const paper = useStore((s) => s.paper); const pair = useStore((s) => s.pair); const instrument = useStore((s) => s.instrument);
    const a = useStore((s) => s.rulerA); const b = useStore((s) => s.rulerB);
    const pts = useMemo(() => impressions(instrument), [instrument]);
    return (
      <div className={`${GLASS} mb-3 p-3`} data-probe="legs">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">The legs on paper</div>
        {!paper ? <p className="text-[12px] leading-snug text-slate-400">Press the three legs gently on a sheet of paper, then measure the distance between each pair of impressions with the ruler.</p> : (
          <>
            <svg viewBox="10 10 70 50" className="mb-2 w-full rounded-lg bg-[#f4efe1]" role="img" aria-label="The three impressions of the legs" data-probe="impressions">
              <g transform="translate(0 70) scale(1 -1)">
                {[['A', pts.A], ['B', pts.B], ['C', pts.C]].map(([n, p]) => <circle key={n} cx={p[0]} cy={p[1]} r={0.6} fill="#1f2937" />)}
                {[['ab', pts.A, pts.B], ['bc', pts.B, pts.C], ['ca', pts.C, pts.A]].map(([k, p, q]) => <line key={k} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke={k === pair ? '#0284c7' : '#9aa3b2'} strokeWidth={k === pair ? 0.35 : 0.15} />)}
              </g>
              {[['A', pts.A], ['B', pts.B], ['C', pts.C]].map(([n, p]) => <text key={n} x={p[0] + 1.2} y={70 - p[1] - 1} fontSize={3.4} fill="#1f2937">{n}</text>)}
            </svg>
            <RulerSVG pair={pair} instrument={instrument} a={a} b={b} show />
          </>
        )}
      </div>
    );
  };
}

/** The numbers and what they say. */
export function makeSpheroResults(useStore) {
  return function SpheroResults() {
    const analysis = useStore((s) => s.analysis); const revealed = useStore((s) => s.revealed);
    if (!analysis.summary.length) return null;
    const n = analysis.notes;
    const flags = [n.misread ? `${n.misread} misread` : null, n.lcWrong ? `${n.lcWrong} with the wrong least count` : null, n.clear ? `${n.clear} with the tip clear of the surface` : null, n.pushed ? `${n.pushed} pushed past contact` : null].filter(Boolean);
    return (
      <div className={`${GLASS} mb-3 p-3`} data-probe="results">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">What the readings say</div>
        <ul className="mt-1 space-y-0.5 text-[12px] text-slate-200">
          {analysis.summary.map((r) => (
            <li key={r.label}>{r.label}: <span className="font-mono">{r.value.toFixed(r.dp ?? 2)} {r.unit}</span>{r.err ? <span className="text-slate-400"> ± {r.err.toFixed(r.dp ?? 2)}</span> : null}{revealed && r.actual !== undefined ? <span className="text-sky-300"> — actual {r.actual.toFixed(r.dp ?? 2)}</span> : null}</li>
          ))}
        </ul>
        {flags.length ? <div className="mt-2 text-[12px] text-amber-200">Of these readings: {flags.join('; ')}.</div> : null}
      </div>
    );
  };
}
