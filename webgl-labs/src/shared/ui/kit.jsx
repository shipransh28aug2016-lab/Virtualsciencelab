/**
 * The HUD kit — the parts every bench's interface is made of.
 *
 * Four benches had each re-implemented these; with ninety more to come that is
 * ninety places for one of them to differ in how a slider behaves. They live
 * here once, and a bench's interface is a declarative spec (see SpecHUD.jsx)
 * rather than a file of JSX.
 *
 * Every interactive part carries a data-* hook (data-control, data-option,
 * data-action, data-probe). The render checks drive and read the interface by
 * those, never by scraping text: a label like "Recovery" also appears in a
 * status sentence and a table header, and a regex takes whichever comes first.
 */
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';

export const GLASS = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/40';

/* Numbers: NaN and null show an em dash, because "NaN" on a student's screen is
   the interface announcing that it does not know what it is doing. */
export const num = (x, dp = 1) => (x === null || x === undefined || Number.isNaN(x) || !Number.isFinite(x) ? '—' : x.toFixed(dp));
export const sig = (x, n = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : Number(x.toPrecision(n)).toLocaleString());

export const TONES = {
  ok: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  info: 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  warn: 'text-amber-200 border-amber-300/40 bg-amber-300/10',
  bad: 'text-rose-200 border-rose-300/40 bg-rose-300/10',
  note: 'text-violet-200 border-violet-300/40 bg-violet-300/10',
  muted: 'text-slate-300 border-white/15 bg-white/5',
};

export function Field({ label, children, id, observable = true }) {
  return (
    <label className="block" data-control={id} data-observable={observable ? 'true' : 'false'}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export function Segmented({ options, value, onChange, disabled }) {
  return (
    <div
      role="group" data-kind="segmented"
      className={`flex flex-wrap gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1 ${disabled ? 'opacity-40' : ''}`}
    >
      {options.map((o) => (
        <button
          key={o.value} type="button" data-option={o.value} title={o.hint} disabled={disabled}
          aria-pressed={value === o.value}
          onClick={() => !disabled && onChange(o.value)}
          style={o.swatch ? { backgroundColor: o.swatch, color: o.swatchText ?? '#0b1220' } : undefined}
          className={`min-w-[2.5rem] flex-1 rounded-lg px-2 py-1.5 text-xs transition ${
            o.swatch
              ? `font-semibold ${value === o.value ? 'ring-2 ring-white' : 'opacity-90 hover:opacity-100'}`
              : value === o.value ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:bg-white/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Consecutive options sharing a `group` become one <optgroup>. */
function groupOptions(options) {
  const out = [];
  for (const o of options) {
    const last = out[out.length - 1];
    if (last && last[0] === (o.group ?? '')) last[1].push(o); else out.push([o.group ?? '', [o]]);
  }
  return out;
}

export function Select({ options, value, onChange, disabled }) {
  return (
    <select
      data-kind="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className={`w-full appearance-none rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100
                  outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 ${disabled ? 'opacity-40' : ''}`}
    >
      {groupOptions(options).map(([group, items]) => (group ? (
        <optgroup key={group} label={group}>{items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      ) : items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)))}
    </select>
  );
}

export function Slider({ min, max, step, value, onChange, accent = 'bg-slate-700', disabled, label }) {
  return (
    <input
      type="range" data-kind="slider" min={min} max={max} step={step} value={value} disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-2 w-full cursor-grab appearance-none rounded-full ${accent} ${disabled ? 'opacity-40' : ''}
        [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg`}
    />
  );
}

export function Readout({ label, value, unit, hint, probe }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-100" data-probe={probe}>
        {value}{unit ? <span className="ml-1 text-[10px] text-slate-400">{unit}</span> : null}
      </div>
    </div>
  );
}

const ACTION_TONES = {
  primary: 'bg-sky-500 text-slate-950 hover:bg-sky-400',
  warn: 'border border-amber-300/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20',
  good: 'border border-emerald-300/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20',
  ghost: 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10',
};

export function Action({ onClick, children, tone = 'primary', title, disabled, id }) {
  return (
    <motion.button
      type="button" data-action={id} whileTap={{ scale: 0.97 }} onClick={onClick} title={title} disabled={disabled}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition disabled:opacity-40 ${ACTION_TONES[tone] ?? ACTION_TONES.primary}`}
    >
      {children}
    </motion.button>
  );
}

/**
 * The status card. Keyed by the status and REPLACED when it changes — never
 * wrapped in AnimatePresence mode="wait", whose exit animation keeps the old
 * card mounted until it finishes. framer-motion drives that off
 * requestAnimationFrame, which on a slow machine is already being spent on the
 * scene, so the bench would be displaying a stale statement about the
 * experiment: the interface contradicting the simulation. (tools/lint.mjs
 * rejects it.)
 */
export function StatusCard({ statusKey, title, detail, tone = 'info' }) {
  return (
    <motion.div
      key={statusKey}
      data-probe="status" data-status={statusKey}
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className={`mb-3 rounded-xl border px-3 py-2 ${TONES[tone] ?? TONES.info}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-[11px] leading-snug opacity-80">{detail}</div>
    </motion.div>
  );
}

/* ── Plot ─────────────────────────────────────────────────────────────────── */

/** "Nice" axis ticks: 1, 2, 5 × 10ⁿ, so the labels read like a graph a student
 *  would draw rather than like floating-point output. */
function niceTicks(lo, hi, target = 5) {
  if (!(hi > lo)) return [lo];
  const span = hi - lo;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const first = Math.ceil(lo / step) * step;
  const out = [];
  for (let v = first; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/**
 * A measured-data plot. Points only, because that is what a student plots: the
 * theoretical curve is the thing they are being asked to discover, and drawing
 * it for them would be the answer printed on the question paper. A lab may pass
 * `line` for a fit it computed FROM the student's own points.
 *
 * series: [{ name, points: [[x, y], …], colour?, line?: [[x, y], …] }]
 */
export const Plot = memo(function Plot({ series, xLabel, yLabel, xDomain, yDomain, height = 170, xTicks = 5, yTicks = 4 }) {
  const W = 340; const H = height; const m = { l: 40, r: 10, t: 8, b: 28 };
  const all = series.flatMap((s) => [...s.points, ...(s.line ?? [])]);

  const dom = useMemo(() => {
    const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]);
    const pad = (a, b) => (a === b ? [a - 1, b + 1] : [a, b]);
    const [x0, x1] = xDomain ?? pad(Math.min(...xs, Infinity), Math.max(...xs, -Infinity));
    const [y0, y1] = yDomain ?? pad(Math.min(...ys, Infinity), Math.max(...ys, -Infinity));
    return { x0, x1, y0, y1 };
  }, [all, xDomain, yDomain]);

  if (!all.length || !Number.isFinite(dom.x0) || !Number.isFinite(dom.y0)) {
    return (
      <div className="flex h-[120px] items-center justify-center rounded-xl border border-white/5 bg-black/20 text-[11px] text-slate-500">
        The graph fills in as you take readings.
      </div>
    );
  }

  const sx = (x) => m.l + ((x - dom.x0) / (dom.x1 - dom.x0 || 1)) * (W - m.l - m.r);
  const sy = (y) => H - m.b - ((y - dom.y0) / (dom.y1 - dom.y0 || 1)) * (H - m.t - m.b);
  const tx = niceTicks(dom.x0, dom.x1, xTicks); const ty = niceTicks(dom.y0, dom.y1, yTicks);
  const fmt = (v) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : Number(v.toPrecision(3)).toString());
  const colours = ['#38bdf8', '#fbbf24', '#a78bfa', '#34d399'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-xl border border-white/5 bg-black/20" role="img" aria-label={`${yLabel} against ${xLabel}`} data-probe="plot">
      {ty.map((v) => (
        <g key={`y${v}`}>
          <line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} stroke="rgba(148,163,184,0.13)" />
          <text x={m.l - 5} y={sy(v) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmt(v)}</text>
        </g>
      ))}
      {tx.map((v) => (
        <g key={`x${v}`}>
          <line y1={m.t} y2={H - m.b} x1={sx(v)} x2={sx(v)} stroke="rgba(148,163,184,0.10)" />
          <text x={sx(v)} y={H - m.b + 12} textAnchor="middle" fontSize="9" fill="#94a3b8">{fmt(v)}</text>
        </g>
      ))}
      <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} stroke="#64748b" />
      <line x1={m.l} x2={W - m.r} y1={H - m.b} y2={H - m.b} stroke="#64748b" />
      <text x={(m.l + W - m.r) / 2} y={H - 3} textAnchor="middle" fontSize="9.5" fill="#cbd5e1">{xLabel}</text>
      <text transform={`translate(10 ${(m.t + H - m.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize="9.5" fill="#cbd5e1">{yLabel}</text>
      {series.map((s, i) => {
        const c = s.colour ?? colours[i % colours.length];
        return (
          <g key={s.name ?? i}>
            {s.line?.length > 1 ? (
              <polyline fill="none" stroke={c} strokeOpacity="0.55" strokeDasharray="4 3" strokeWidth="1.2"
                points={s.line.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} />
            ) : null}
            {s.connect ? (
              <polyline fill="none" stroke={c} strokeWidth="1.4" points={s.points.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} />
            ) : null}
            {s.points.map((p, j) => <circle key={j} cx={sx(p[0])} cy={sy(p[1])} r={s.connect ? 1.6 : 3} fill={c} />)}
          </g>
        );
      })}
    </svg>
  );
});

/* ── Observation table ────────────────────────────────────────────────────── */

export const ObservationTable = memo(function ObservationTable({ columns, rows, onClear, csvName = 'observations.csv', empty }) {
  const csv = useMemo(() => {
    const head = columns.map(([, h]) => h).join(',');
    const body = rows.map((r) => columns.map(([k]) => `"${r[k] ?? ''}"`).join(','));
    return encodeURIComponent([head, ...body].join('\n'));
  }, [columns, rows]);

  return (
    <div className={`${GLASS} pointer-events-auto max-h-[36vh] w-full overflow-hidden p-4`} data-probe="table">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">
          Observation table
          <span className="ml-2 text-[11px] font-normal text-slate-500">{rows.length} reading{rows.length === 1 ? '' : 's'}</span>
        </h2>
        <div className="flex gap-2">
          <a
            href={`data:text/csv;charset=utf-8,${csv}`} download={csvName}
            className={`rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 ${rows.length ? '' : 'pointer-events-none opacity-30'}`}
          >
            Export CSV
          </a>
          <button type="button" onClick={onClear} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/10">
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-[28vh] overflow-auto rounded-xl border border-white/5">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr>{columns.map(([k, h]) => <th key={k} className="whitespace-nowrap px-2.5 py-2 font-semibold text-slate-400">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">{empty}</td></tr>
            ) : rows.map((r, i) => (
              <motion.tr
                key={r.id ?? i}
                initial={{ opacity: 0, backgroundColor: 'rgba(56,189,248,0.16)' }}
                animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
                transition={{ duration: 0.9 }}
                className={i % 2 ? 'bg-white/[0.02]' : ''}
              >
                {columns.map(([k]) => (
                  <td key={k} className={`whitespace-nowrap px-2.5 py-1.5 ${typeof r[k] === 'string' && r[k].length > 14 ? 'text-slate-200' : 'font-mono text-slate-300'}`}>
                    {r[k] === null || r[k] === undefined ? '—' : r[k]}
                  </td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
