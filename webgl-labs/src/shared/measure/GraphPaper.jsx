/**
 * The graph paper under a lamina: a sheet 10 cm square ruled in the grid the student chose, the lamina lying on it, the line
 * the pencil drew round it, the squares wholly inside (counted by the bench: nobody counts 2,700 squares by eye — a real sheet has
 * heavy lines every centimetre for counting blocks) and the squares the line cuts, which the student judges, one at a time or by
 * dragging the brush along them. The picture is drawn from the geometry (lamina.js) and nothing else: what is counted is
 * what is there.
 */
import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GLASS } from '../ui/kit.jsx';
import { PAPER, paperFor, place, tally } from './lamina.js';

const MARK = { whole: { fill: '#f59e0b', opacity: 0.62 }, ignore: { fill: '#475569', opacity: 0.55 } };

const polyPoints = (p) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

/** The paper itself, y up (the group flips the SVG). */
export function PaperSVG({ shape, grid, traced, marks, lay, interactive = false, onCells, probe = 'paper' }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const g = Number(String(grid).slice(1));
  const paper = useMemo(() => (traced ? paperFor(shape, traced) : null), [shape, traced]);
  const lying = useMemo(() => place(shape.poly, { x: PAPER / 2 + lay.x, y: PAPER / 2 + lay.y, rot: lay.rot }), [shape, lay.x, lay.y, lay.rot]);
  const cls = paper?.cls;
  /* The grid of the paper (the one the line was traced on, or the one chosen if nothing has been traced yet). */
  const gg = cls ? cls.g : g;
  const minor = []; const major = [];
  for (let k = 0; k <= PAPER + 1e-9; k += gg) { const d = Math.round(k * 1000) / 1000; (Math.abs(d / 10 - Math.round(d / 10)) < 1e-9 ? major : minor).push(d); }
  const lines = (ks) => ks.map((k) => `M${k} 0V${PAPER}M0 ${k}H${PAPER}`).join('');
  const runs = cls ? cls.runs.map(([j, i0, i1]) => `M${i0 * gg} ${j * gg}h${(i1 - i0 + 1) * gg}v${gg}h${-(i1 - i0 + 1) * gg}z`).join('') : '';

  const toCell = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PAPER, PAPER - ((e.clientY - r.top) / r.height) * PAPER];
  };
  const cellsAlong = (a, b) => {
    const n = Math.round(PAPER / gg); const out = new Set();
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]); const steps = Math.max(1, Math.ceil(len / (gg / 2)));
    for (let k = 0; k <= steps; k += 1) {
      const x = a[0] + ((b[0] - a[0]) * k) / steps; const y = a[1] + ((b[1] - a[1]) * k) / steps;
      const i = Math.floor(x / gg); const j = Math.floor(y / gg);
      if (i >= 0 && j >= 0 && i < n && j < n) out.add(`${i},${j}`);
    }
    return [...out];
  };
  const down = (e) => { if (!interactive || !cls) return; e.currentTarget.setPointerCapture?.(e.pointerId); const p = toCell(e); drag.current = p; onCells(cellsAlong(p, p)); };
  const move = (e) => { if (!drag.current) return; const p = toCell(e); onCells(cellsAlong(drag.current, p)); drag.current = p; };
  const up = () => { drag.current = null; };

  return (
    <svg ref={ref} viewBox={`0 0 ${PAPER} ${PAPER}`} className="aspect-square w-full rounded-lg" role="img" aria-label="Graph paper with the lamina's outline" data-probe={probe} data-grid={gg} data-size={PAPER}>
      <g transform={`translate(0 ${PAPER}) scale(1 -1)`}>
        <rect x={0} y={0} width={PAPER} height={PAPER} fill="#f4efe1" />
        {runs ? <path d={runs} fill="#38bdf8" fillOpacity={0.3} data-probe={`${probe}-complete`} /> : null}
        <path d={lines(minor)} stroke="#d9a79f" strokeWidth={gg <= 1 ? 0.08 : 0.13} strokeOpacity={0.8} fill="none" />
        <path d={lines(major)} stroke="#c4736a" strokeWidth={0.22} fill="none" />
        {!cls ? <polygon points={polyPoints(lying)} fill={shape.colour} fillOpacity={0.88} stroke="#475569" strokeWidth={0.2} data-probe={`${probe}-lamina`} /> : <polygon points={polyPoints(lying)} fill={shape.colour} fillOpacity={0.18} stroke="none" />}
        {Object.entries(marks).map(([k, v]) => {
          const [i, j] = k.split(',').map(Number); const m = MARK[v];
          return <rect key={k} x={i * gg} y={j * gg} width={gg} height={gg} fill={m.fill} fillOpacity={m.opacity} />;
        })}
        {paper ? <polygon points={polyPoints(paper.traced)} fill="none" stroke="#1f2937" strokeWidth={0.3} strokeLinejoin="round" data-probe={`${probe}-outline`} /> : null}
        {interactive ? <rect x={0} y={0} width={PAPER} height={PAPER} fill="transparent" style={{ touchAction: 'none', cursor: 'crosshair' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} data-probe={`${probe}-surface`} /> : null}
      </g>
    </svg>
  );
}

/** The counts, as a bench reads them off the paper. */
export function Tally({ t, g }) {
  const cell = (label, v, tone = '') => (<div className="rounded-lg bg-white/[0.04] px-2 py-1"><div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div><div className={`font-mono text-[13px] ${tone}`}>{v}</div></div>);
  return (
    <div className="grid grid-cols-3 gap-1.5" data-probe="paper-tally">
      {cell('complete (counted for you)', t.complete)}
      {cell('boundary: whole', t.whole, 'text-amber-300')}
      {cell('boundary: left out', t.ignored)}
      {cell('boundary: not judged', t.unjudged, t.unjudged ? 'text-rose-300' : '')}
      {cell('squares counted', t.complete - t.dropped + t.whole)}
      {cell(`area, × ${g * g} mm²`, `${(t.areaMm2 / 100).toFixed(2)} cm²`, 'text-sky-300')}
    </div>
  );
}

/**
 * The instrument panel's view of the paper, and — when it is opened — the big one to paint on. `shapes` maps a specimen id
 * to { id, poly, colour, label }.
 */
export function makePaperPanel(shapes) {
  return function PaperPanel({ useStore }) {
    const id = useStore((s) => s.lastSpecimen);
    const grid = useStore((s) => s.grid);
    const traced = useStore((s) => s.traced);
    const marks = useStore((s) => s.marks);
    const open = useStore((s) => s.paperOpen);
    const brush = useStore((s) => s.brush);
    const layX = useStore((s) => s.layX); const layY = useStore((s) => s.layY); const layRot = useStore((s) => s.layRot);
    const shape = shapes[traced?.id ?? id];
    const lay = useMemo(() => ({ x: layX, y: layY, rot: layRot }), [layX, layY, layRot]);
    const t = useMemo(() => (traced ? tally(paperFor(shapes[traced.id], traced).cls, marks) : null), [traced, marks]);
    const paint = (keys) => useStore.getState().paint(keys);
    useEffect(() => {
      if (!open) return undefined;
      const onKey = (e) => { if (e.key === 'Escape') useStore.getState().closePaper(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, useStore]);

    return (
      <div className={`${GLASS} mb-3 p-3`}>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">The graph paper · {shape.label}</div>
        <PaperSVG shape={shape} grid={grid} traced={traced} marks={marks} lay={lay} probe="paper-mini" />
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400">
          {traced ? `Traced on ${traced.grid.slice(1)} mm paper. ` : 'Lay the lamina down and trace round it with the pencil. '}
          {t ? `${t.complete} complete squares are counted for you; ${t.unjudged ? `${t.unjudged} boundary squares still to judge` : 'every boundary square judged'}.` : ''}
        </p>
        {open ? createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm md:p-8" data-probe="paper-overlay">
            <div className={`${GLASS} grid max-h-full w-full max-w-[72rem] gap-x-4 gap-y-2 overflow-auto p-3 md:grid-cols-[minmax(0,58%)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:p-4`}>
              {/* The brush and the way out first, so that on a narrow screen they are never scrolled away from the paper. */}
              <div className="flex flex-col gap-2 md:col-start-2 md:row-start-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-100">Count the squares</div>
                  <button type="button" data-action="close-paper" onClick={() => useStore.getState().closePaper()} className="shrink-0 rounded-lg border border-white/15 px-3 py-1 text-[12px] text-slate-200 hover:bg-white/10">Close</button>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Brush">
                  {[['whole', 'Count it whole'], ['ignore', 'Leave it out'], ['erase', 'Erase my mark']].map(([v, label]) => (
                    <button key={v} type="button" data-paper-brush={v} aria-pressed={brush === v} onClick={() => useStore.getState().setBrush(v)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] transition ${brush === v ? 'border-sky-400/60 bg-sky-500/15 text-sky-100' : 'border-white/10 text-slate-300 hover:bg-white/10'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="mx-auto w-full max-w-[min(calc(100vh-11rem),44rem)] md:col-start-1 md:row-span-2 md:row-start-1 md:max-w-none">
                <PaperSVG shape={shape} grid={grid} traced={traced} marks={marks} lay={lay} interactive onCells={paint} probe="paper" />
              </div>
              <div className="flex min-w-0 flex-col gap-2 text-[12px] text-slate-300 md:col-start-2 md:row-start-2">
                {t ? <Tally t={t} g={traced.grid.slice(1) * 1} /> : <div className="rounded-lg border border-amber-300/20 bg-amber-300/5 p-2 text-amber-200">Nothing is traced yet: close this, choose the pencil and press “Trace the outline”.</div>}
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                  <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: '#38bdf8', opacity: 0.5 }} /> counted for you</span>
                  <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: MARK.whole.fill, opacity: 0.8 }} /> counted whole</span>
                  <span className="inline-flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: MARK.ignore.fill, opacity: 0.8 }} /> left out</span>
                </div>
                <p className="leading-snug text-slate-400">The squares wholly inside the line are shaded and counted for you. Judge the ones the line cuts: more than half inside, count it whole; less than half, leave it out. Click, or drag along them.</p>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    );
  };
}
