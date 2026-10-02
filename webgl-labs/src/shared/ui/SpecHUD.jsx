/**
 * SpecHUD — renders a bench's interface from a declarative spec.
 *
 * A bench describes WHAT its controls and instruments are; this decides how
 * they look and behave. That split is what lets ninety benches share one
 * interface, and what lets tools/probe-lab.mjs sweep every control of every
 * bench from the DOM without knowing anything about the experiment.
 *
 * ── Spec ──────────────────────────────────────────────────────────────────────
 *   store         the zustand hook
 *   title, subtitle
 *   status        (s) => ({ key, title, detail, tone })   tone: ok|info|warn|bad|note|muted
 *   controls      [ Control ]       left panel
 *   instruments   [ Instrument ]    right panel, in order
 *   table         { columns: [[key, label]], select?: (s) => rows, clear?: 'clearLog',
 *                   csv?: 'name.csv', empty: 'text shown before the first reading' }
 *
 * ── Control ───────────────────────────────────────────────────────────────────
 *   every control: id (unique), when?: (s) => bool, disabled?: (s) => bool,
 *                  observable?: false   (a control with no visible consequence,
 *                                        such as the clock rate, so the sweep
 *                                        does not flag it as wired to nothing)
 *   segmented     { label, get, set: 'action', options: [{ value, label, hint }] }
 *   select        { label, get, set: 'action', options: [{ value, label }] }
 *   slider        { label: str | (s) => str, min, max, step, get, set, accent?, note? }
 *                 min / max / step may be (s) => number, because the useful range
 *                 of a dose slider depends on what is being dosed
 *   actions       { items: [{ id, label: str | (s) => str, run: 'action', args?,
 *                             tone?: primary|warn|good|ghost, title?, when?, disabled? }] }
 *   note          { text: (s) => str }
 *   group         { label, children: [ Control ] }
 *
 * ── Instrument ────────────────────────────────────────────────────────────────
 *   hero          { id, label, value: (s) => str, unit?, sub?: (s) => str }
 *   readouts      { items: [{ id, label, value: (s) => str | number, unit?, hint? }] }
 *   callout       { id, text: (s) => str, tone?: (s) => tone }
 *   plot          { id, title?, series: (s) => stable array, xLabel, yLabel, xDomain?, yDomain? }
 *   custom        { id, Component }
 *
 * Every getter must return a PRIMITIVE (or, for plot series, a reference the
 * store only replaces when the data changes). zustand reads through
 * useSyncExternalStore, which compares snapshots by identity: a getter that
 * builds a fresh object each call re-renders until React aborts with error 185.
 * tools/lint.mjs rejects the obvious forms of it.
 */
import { memo, useMemo } from 'react';
import {
  GLASS, Field, Segmented, Select, Slider, Readout, Action, StatusCard, Plot, ObservationTable, num,
} from './kit.jsx';

const resolve = (x, s) => (typeof x === 'function' ? x(s) : x);

/** Subscribe to a value that is either literal or derived from state. */
const useValue = (useStore, x) => useStore((s) => resolve(x, s));
const useVisible = (useStore, c) => useStore((s) => (c.when ? Boolean(c.when(s)) : true));
const useDisabled = (useStore, c) => useStore((s) => (c.disabled ? Boolean(c.disabled(s)) : false));
const call = (useStore, name, ...args) => useStore.getState()[name](...args);

/* ── Controls ────────────────────────────────────────────────────────────────── */

function SegmentedControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  const disabled = useDisabled(useStore, c);
  const value = useStore(c.get);
  const label = useValue(useStore, c.label);
  const key = useStore((s) => (typeof c.options === 'function' ? c.optionsKey(s) : ''));
  const options = useMemo(
    () => (typeof c.options === 'function' ? c.options(useStore.getState()) : c.options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, c],
  );
  if (!visible) return null;
  return (
    <Field label={label} id={c.id} observable={c.observable !== false}>
      <Segmented options={options} value={value} disabled={disabled} onChange={(v) => call(useStore, c.set, v)} />
      {c.note ? <NoteLine useStore={useStore} text={c.note} /> : null}
    </Field>
  );
}

function SelectControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  const disabled = useDisabled(useStore, c);
  const value = useStore(c.get);
  const label = useValue(useStore, c.label);
  if (!visible) return null;
  return (
    <Field label={label} id={c.id} observable={c.observable !== false}>
      <Select options={c.options} value={value} disabled={disabled} onChange={(v) => call(useStore, c.set, v)} />
      {c.note ? <NoteLine useStore={useStore} text={c.note} /> : null}
    </Field>
  );
}

function SliderControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  const disabled = useDisabled(useStore, c);
  const value = useStore(c.get);
  const label = useValue(useStore, c.label);
  const min = useValue(useStore, c.min);
  const max = useValue(useStore, c.max);
  const step = useValue(useStore, c.step);
  if (!visible) return null;
  return (
    <Field label={label} id={c.id} observable={c.observable !== false}>
      <Slider
        min={min} max={max} step={step} value={Math.min(Math.max(value, min), max)} accent={c.accent}
        disabled={disabled} label={typeof label === 'string' ? label : c.id}
        onChange={(v) => call(useStore, c.set, v)}
      />
      {c.note ? <NoteLine useStore={useStore} text={c.note} /> : null}
    </Field>
  );
}

function NoteLine({ useStore, text }) {
  const t = useValue(useStore, text);
  return t ? <div className="mt-1 text-[11px] leading-snug text-slate-400">{t}</div> : null;
}

function ActionItem({ item, useStore }) {
  const visible = useVisible(useStore, item);
  const disabled = useDisabled(useStore, item);
  const label = useValue(useStore, item.label);
  if (!visible) return null;
  return (
    <Action
      id={item.id} tone={item.tone} title={item.title} disabled={disabled}
      onClick={() => call(useStore, item.run, ...(item.args ?? []))}
    >
      {label}
    </Action>
  );
}

function ActionsControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  if (!visible) return null;
  return (
    <div className="grid grid-cols-2 gap-2" data-control={c.id} data-observable="true">
      {c.items.map((item) => <ActionItem key={item.id} item={item} useStore={useStore} />)}
    </div>
  );
}

function GroupControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  if (!visible) return null;
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3" data-control={c.id} data-observable="true">
      {c.label ? <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div> : null}
      {c.children.map((child) => <Control key={child.id} c={child} useStore={useStore} />)}
    </div>
  );
}

function NoteControl({ c, useStore }) {
  const visible = useVisible(useStore, c);
  if (!visible) return null;
  return <NoteLine useStore={useStore} text={c.text} />;
}

const CONTROLS = {
  segmented: SegmentedControl, select: SelectControl, slider: SliderControl,
  actions: ActionsControl, group: GroupControl, note: NoteControl,
};

function Control({ c, useStore }) {
  const Impl = CONTROLS[c.type];
  if (!Impl) throw new Error(`SpecHUD: unknown control type "${c.type}" (${c.id})`);
  return <Impl c={c} useStore={useStore} />;
}

/* ── Instruments ─────────────────────────────────────────────────────────────── */

function Hero({ c, useStore }) {
  const value = useValue(useStore, c.value);
  const sub = useValue(useStore, c.sub);
  return (
    <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{c.label}</div>
      <div className="font-mono text-3xl text-slate-50" data-probe={c.id}>
        {value}{c.unit ? <span className="ml-1 text-sm text-slate-400">{c.unit}</span> : null}
      </div>
      {sub ? <div className="mt-1 font-mono text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function ReadoutItem({ item, useStore }) {
  const raw = useStore((s) => resolve(item.value, s));
  const value = typeof raw === 'number' ? num(raw, item.dp ?? 2) : raw;
  return <Readout probe={item.id} label={item.label} value={value} unit={item.unit} hint={item.hint} />;
}

function Readouts({ c, useStore }) {
  return (
    <div className={`mb-3 grid gap-2 ${c.columns === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
      {c.items.map((item) => <ReadoutItem key={item.id} item={item} useStore={useStore} />)}
    </div>
  );
}

const CALLOUT = {
  ok: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  warn: 'border-amber-300/40 bg-amber-300/10 text-amber-200',
  info: 'border-sky-300/40 bg-sky-300/10 text-sky-200',
  muted: 'border-white/10 bg-white/5 text-slate-400',
};

function Callout({ c, useStore }) {
  const text = useValue(useStore, c.text);
  const tone = useValue(useStore, c.tone) ?? 'muted';
  return (
    <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${CALLOUT[tone] ?? CALLOUT.muted}`} data-probe={c.id}>
      {text}
    </div>
  );
}

function PlotInstrument({ c, useStore }) {
  const series = useStore(c.series);
  return (
    <div className="mb-3">
      {c.title ? <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{c.title}</div> : null}
      <Plot series={series} xLabel={c.xLabel} yLabel={c.yLabel} xDomain={c.xDomain} yDomain={c.yDomain} height={c.height} />
    </div>
  );
}

const INSTRUMENTS = { hero: Hero, readouts: Readouts, callout: Callout, plot: PlotInstrument };

function Instrument({ c, useStore }) {
  if (c.type === 'custom') return <c.Component useStore={useStore} />;
  const Impl = INSTRUMENTS[c.type];
  if (!Impl) throw new Error(`SpecHUD: unknown instrument type "${c.type}" (${c.id})`);
  return <Impl c={c} useStore={useStore} />;
}

/* ── Panels ──────────────────────────────────────────────────────────────────── */

const Status = memo(function Status({ spec }) {
  const useStore = spec.store;
  /* Three primitives rather than one object — see the header. */
  const key = useStore((s) => spec.status(s).key);
  const title = useStore((s) => spec.status(s).title);
  const detail = useStore((s) => spec.status(s).detail);
  const tone = useStore((s) => spec.status(s).tone);
  return <StatusCard statusKey={key} title={title} detail={detail} tone={tone} />;
});

function TablePanel({ spec }) {
  const useStore = spec.store;
  const t = spec.table;
  const rows = useStore(t.select ?? ((s) => s.log));
  return (
    <ObservationTable
      columns={t.columns} rows={rows} csvName={t.csv} empty={t.empty}
      onClear={() => call(useStore, t.clear ?? 'clearLog')}
    />
  );
}

export function SpecHUD({ spec }) {
  const useStore = spec.store;
  return (
    /* Stacked below xl: two 23rem panels side by side need 46rem of width, and
       on anything narrower they used to overlap and COVER each other's controls.
       A control you cannot reach is a control that does not exist. Below the
       breakpoint the column scrolls instead. */
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:justify-between">
        <div className="pointer-events-auto w-full max-w-[23rem]">
          <div className={`${GLASS} p-4`}>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-tight text-slate-100">Bench</h2>
              <span className="text-[10px] uppercase tracking-widest text-slate-500">{spec.code}</span>
            </div>
            <div className="space-y-3">
              {spec.controls.map((c) => <Control key={c.id} c={c} useStore={useStore} />)}
            </div>
          </div>
        </div>

        <header className="pointer-events-none hidden select-none text-right lg:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">{spec.title}</h1>
          <p className="text-[11px] text-slate-400">{spec.subtitle}</p>
        </header>

        <div className="pointer-events-auto w-full max-w-[23rem]">
          <div className={`${GLASS} p-4`}>
            <Status spec={spec} />
            {spec.instruments.map((c) => <Instrument key={c.id} c={c} useStore={useStore} />)}
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[72rem]"><TablePanel spec={spec} /></div>
      </div>
    </div>
  );
}

export default SpecHUD;
