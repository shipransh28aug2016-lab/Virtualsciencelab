/**
 * BoilingPointHUD — the bench controls and the notebook for XI-CHE-B02.
 *
 * A DOM sibling of the canvas, not an <Html> inside it. Every value shown is
 * read from the store; nothing here computes chemistry.
 */
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  useBoilingPointEngine, selectDerived, selectStatus, selectLog,
  selectOnset, selectObserved, selectBurner,
  LIQUIDS, BATHS, THERMOMETERS, UNKNOWNS,
} from '../engine/useBoilingPointEngine.js';

const GLASS = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/40';

const TONE = {
  read: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  'rapid-stream': 'text-amber-200 border-amber-300/40 bg-amber-300/10',
  'cooling-stream': 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  'slow-bubbles': 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  heating: 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  cooling: 'text-slate-300 border-white/15 bg-white/5',
  superheating: 'text-orange-200 border-orange-300/40 bg-orange-300/10',
  bumped: 'text-rose-200 border-rose-300/40 bg-rose-300/10',
  'bath-too-cold': 'text-rose-200 border-rose-300/40 bg-rose-300/10',
};

const num = (x, dp = 1) => (x === null || x === undefined || Number.isNaN(x) ? '—' : x.toFixed(dp));

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="flex gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1">
      {options.map((o) => (
        <button
          key={o.value} onClick={() => onChange(o.value)} title={o.hint}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition ${
            value === o.value ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:bg-white/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, step, value, onChange, accent = 'bg-slate-700' }) {
  return (
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-2 w-full cursor-grab appearance-none rounded-full ${accent}
        [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg`}
    />
  );
}

/* `probe` puts a stable hook on the value. The render checks read these rather
   than scraping innerText: a label like "Boiling point" appears in the status
   sentence and in the table too, and a regex takes whichever comes first. */
function Readout({ label, value, unit, hint, probe }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-100" data-probe={probe}>
        {value}{unit ? <span className="ml-1 text-[10px] text-slate-400">{unit}</span> : null}
      </div>
    </div>
  );
}

function Controls() {
  const d = useBoilingPointEngine(selectDerived);
  const liquidId = useBoilingPointEngine((s) => s.liquidId);
  const purity = useBoilingPointEngine((s) => s.purity);
  const bath = useBoilingPointEngine((s) => s.bath);
  const chips = useBoilingPointEngine((s) => s.chips);
  const thermometer = useBoilingPointEngine((s) => s.thermometer);
  const heatingRate = useBoilingPointEngine((s) => s.heatingRate);
  const pressureMmHg = useBoilingPointEngine((s) => s.pressureMmHg);
  const secondLiquidId = useBoilingPointEngine((s) => s.secondLiquidId);
  const secondMolePercent = useBoilingPointEngine((s) => s.secondMolePercent);
  const burnerOn = useBoilingPointEngine(selectBurner);
  const airOpen = useBoilingPointEngine((s) => s.airOpen);
  const timeScale = useBoilingPointEngine((s) => s.timeScale);
  const minutes = useBoilingPointEngine((s) => Math.round(s.elapsed / 6) / 10);

  const {
    setLiquid, setPurity, setBath, setChips, setThermometer, setHeatingRate,
    setPressure, setSecondLiquid, setSecondPercent, setAir, toggleBurner,
    freshCharge, setTimeScale, record, reset,
  } = useBoilingPointEngine.getState();

  const partners = useMemo(
    () => Object.values(LIQUIDS).filter((l) => l.id !== liquidId),
    [liquidId],
  );

  return (
    <div className={`${GLASS} w-full max-w-[23rem] shrink-0 p-4`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">Bench</h2>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">XI-CHE-B02</span>
      </div>

      <div className="space-y-3">
        <Field label="Liquid in the fusion tube">
          <Segmented
            value={liquidId} onChange={setLiquid}
            options={UNKNOWNS.map((id) => ({
              value: id, label: LIQUIDS[id].formula,
              hint: `${LIQUIDS[id].label} — lit. ${LIQUIDS[id].antoine ? '' : ''}`,
            }))}
          />
          <div className="mt-1 text-[11px] text-slate-400">{d.liquid.label} · {d.liquid.note}</div>
        </Field>

        <Field label="Sample">
          <Segmented
            value={purity} onChange={setPurity}
            options={[
              { value: 'pure', label: 'Distilled', hint: 'Freshly distilled' },
              { value: 'slight', label: 'Once used', hint: 'About 2 mol% of involatile material' },
              { value: 'impure', label: 'Crude', hint: 'About 8 mol% — straight from the reaction' },
            ]}
          />
          <div className="mt-1 text-[11px] text-slate-400">
            Carrying {(d.soluteMoleFraction * 100).toFixed(1)} mol% of involatile material — which
            <b className="text-amber-200"> raises</b> a boiling point.
          </div>
        </Field>

        <Field label={`Atmospheric pressure — ${pressureMmHg} mm Hg`}>
          <Slider min={600} max={800} step={10} value={pressureMmHg} onChange={setPressure}
            accent="bg-gradient-to-r from-indigo-700 via-slate-600 to-emerald-600" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
            <span>600 — a hill station</span>
            <span className={Math.abs(d.pressureShiftC) > 0.5 ? 'text-amber-300' : ''}>
              {d.pressureShiftC >= 0 ? '+' : ''}{d.pressureShiftC.toFixed(1)} °C
            </span>
            <span>800</span>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bath">
            <Segmented value={bath} onChange={setBath}
              options={Object.values(BATHS).map((b) => ({ value: b.id, label: b.label.split(' ')[0], hint: b.note }))} />
          </Field>
          <Field label="Nucleation">
            <Segmented value={chips} onChange={setChips}
              options={[
                { value: 'with', label: 'Capillary', hint: 'Siwoloboff’s inverted capillary: the readout and the boiling stone in one' },
                { value: 'without', label: 'None', hint: 'Nothing for a bubble to start on. The liquid will superheat and bump' },
              ]} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Thermometer">
            <Segmented value={thermometer} onChange={setThermometer}
              options={Object.values(THERMOMETERS).map((t) => ({ value: t.id, label: t.label, hint: `Least count ${t.leastCount} °C` }))} />
          </Field>
          <Field label={`Heating — ${heatingRate} °C/min`}>
            <Slider min={1} max={12} step={1} value={heatingRate} onChange={setHeatingRate}
              accent="bg-gradient-to-r from-sky-700 via-amber-600 to-rose-600" />
          </Field>
        </div>

        <Field label="Add a second liquid (ideal mixture)">
          <select
            className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm
                       text-slate-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
            value={secondLiquidId} onChange={(e) => setSecondLiquid(e.target.value)}
          >
            <option value="none">— nothing added —</option>
            {partners.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          {secondLiquidId !== 'none' ? (
            <>
              <div className="mt-2 mb-1 font-mono text-[11px] text-slate-400">{secondMolePercent} mol% added</div>
              <Slider min={0} max={80} step={5} value={secondMolePercent} onChange={setSecondPercent}
                accent="bg-gradient-to-r from-slate-700 to-fuchsia-600" />
              <div className="mt-1 text-[11px] text-slate-500">
                Raoult's law is assumed. Benzene and toluene really do obey it; ethanol and water do
                not, and a bench that pretended otherwise would be teaching a false azeotrope.
              </div>
            </>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <motion.button
            whileTap={{ scale: 0.97 }} onClick={toggleBurner}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              burnerOn ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-sky-500 text-slate-950 hover:bg-sky-400'}`}
          >
            {burnerOn ? 'Take the flame away' : 'Light the burner'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }} onClick={() => setAir(!airOpen)}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10"
          >
            Air hole {airOpen ? 'open' : 'shut'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }} onClick={record}
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Record trial
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }} onClick={freshCharge}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Fresh charge
          </motion.button>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span>Clock</span>
          {[1, 30, 120].map((t) => (
            <button key={t} onClick={() => setTimeScale(t)}
              className={`rounded-lg px-2 py-1 font-mono transition ${
                timeScale === t ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 hover:bg-white/10'}`}
            >
              ×{t}
            </button>
          ))}
          <span className="ml-auto font-mono text-slate-300">{minutes.toFixed(1)} min</span>
          <button onClick={reset} className="rounded-lg px-2 py-1 transition hover:bg-white/10">Reset</button>
        </div>
      </div>
    </div>
  );
}

function Instruments() {
  const d = useBoilingPointEngine(selectDerived);
  const status = useBoilingPointEngine(selectStatus);
  const onset = useBoilingPointEngine(selectOnset);
  const observed = useBoilingPointEngine(selectObserved);
  const tone = TONE[status.key] ?? TONE.heating;

  const outside = d.pressureMmHg + d.headMmHg;
  const ratio = Math.min(1.3, d.vapourPressureMmHg / outside);

  return (
    <div className={`${GLASS} w-full max-w-[23rem] shrink-0 p-4`}>
      {/* Replaced outright rather than wrapped in <AnimatePresence mode="wait">.
          An exit animation keeps the OLD card mounted until it finishes, and
          framer-motion drives that off requestAnimationFrame — which on a slow
          machine is already being spent on the scene. The bench would then be
          displaying a stale statement about the experiment for as long as the
          frames took to arrive, which is precisely the kind of disagreement
          between the interface and the simulation this project exists to
          prevent. Changing the key replaces the element, so the text on screen
          is always the text the engine just produced. */}
      <motion.div
        key={status.key}
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`mb-3 rounded-xl border px-3 py-2 ${tone}`}
      >
        <div className="text-sm font-semibold">{status.title}</div>
        <div className="mt-0.5 text-[11px] leading-snug opacity-80">{status.detail}</div>
      </motion.div>

      <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Thermometer</div>
        <div className="font-mono text-3xl text-slate-50" data-probe="reading">
          {num(d.readingC, 1)} <span className="text-sm text-slate-400">°C</span>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[11px] text-slate-500">
          <span>bath <span data-probe="bath">{num(d.bathC)}</span> °C</span>
          <span>liquid <span data-probe="liquid">{num(d.liquidC)}</span> °C</span>
        </div>

        {/* Vapour pressure against the pressure outside. The boiling point is
            where this bar reaches the line, and nothing else. */}
        <div className="mt-3">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-slate-500">
            <span>vapour pressure</span>
            <span data-probe="vapour-pressure">{num(d.vapourPressureMmHg, 0)} / {num(outside, 0)} mm Hg</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className={`h-full ${ratio >= 1 ? 'bg-amber-400' : 'bg-sky-500'}`}
              animate={{ width: `${(ratio / 1.3) * 100}%` }}
              transition={{ duration: 0.12 }}
            />
            <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${(1 / 1.3) * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Readout probe="onset" label="Stream starts" value={num(onset)} unit="°C"
          hint="A rapid continuous stream. The signal to stop heating — not the reading" />
        <Readout probe="observed" label="Stream ceases" value={num(observed)} unit="°C"
          hint="The boiling point: vapour pressure has just fallen through atmospheric" />
        <Readout probe="corrected" label="At 760" value={num(d.correctedC)} unit="°C"
          hint="Sidgwick's correction, with the constant chosen by Trouton's rule" />
      </div>

      <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${
        observed === null ? 'border-white/10 bg-white/5 text-slate-400'
          : Math.abs(d.correctedC - d.standardPointC) <= 1.5
            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-300/40 bg-amber-300/10 text-amber-200'}`}
      >
        {observed === null
          ? 'Boiling point — not yet observed'
          : <>Corrected <b>{num(d.correctedC, 1)} °C</b> · handbook {num(d.standardPointC, 1)} °C at 760 mm Hg</>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Readout probe="boiling-point" label="Boils at" value={num(d.bubblePointC, 1)} unit="°C"
          hint="Where Σ xᵢP°ᵢ(T) reaches the pressure outside" />
        <Readout probe="elevation" label="Elevation" value={num(d.elevationC, 2)} unit="°C"
          hint="How far the involatile material has raised it" />
        <Readout probe="bubble-rate" label="Bubbles" value={num(d.bubbleRate, 1)} unit="s⁻¹" />
        <Readout label="Boiled away" value={num(d.boiledAwayPercent, 0)} unit="%"
          hint="The vapour is richer in the volatile component, so what is left is not what you started with" />
        <Readout label="ΔH vap" value={num(d.enthalpyVaporisation / 1000, 1)} unit="kJ/mol"
          hint="From the slope of the same Antoine curve — 2.303RBT²/(C+t)²" />
        <Readout probe="trouton" label="Trouton" value={num(d.troutonConstant, 0)} unit="J/mol·K"
          hint="About 88 for a normal liquid. Higher means the liquid was hydrogen bonded" />
        <Readout label="Kb" value={num(d.ebullioscopicConstant, 2)} unit="K kg/mol"
          hint="RT²M/1000ΔH — derived, never used" />
        <Readout label="Association" value={d.associated ? 'associated' : 'normal'}
          hint="Decided by Trouton's constant, and it chooses the pressure-correction constant" />
      </div>
    </div>
  );
}

const COLS = [
  ['trial', 'Trial'],
  ['liquid', 'Liquid'],
  ['purity', 'Sample'],
  ['mixedWith', 'Mixed with'],
  ['chips', 'Nucleation'],
  ['pressureMmHg', 'P / mm Hg'],
  ['onsetC', 'Stream starts'],
  ['observedC', 'Stream ceases'],
  ['correctedC', 'At 760'],
  ['literatureC', 'Lit.'],
  ['verdict', 'Inference'],
];

const ObservationTable = memo(function ObservationTable() {
  const log = useBoilingPointEngine(selectLog);
  const clearLog = useBoilingPointEngine.getState().clearLog;

  const csv = useMemo(() => {
    const head = COLS.map(([, h]) => h).join(',');
    const rows = log.map((r) => COLS.map(([k]) => `"${r[k] ?? ''}"`).join(','));
    return encodeURIComponent([head, ...rows].join('\n'));
  }, [log]);

  return (
    <div className={`${GLASS} pointer-events-auto max-h-[36vh] w-full overflow-hidden p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">
          Observation table
          <span className="ml-2 text-[11px] font-normal text-slate-500">{log.length} trial{log.length === 1 ? '' : 's'}</span>
        </h2>
        <div className="flex gap-2">
          <a href={`data:text/csv;charset=utf-8,${csv}`} download="XI-CHE-B02-boiling-point.csv"
            className={`rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300 transition hover:bg-white/10 ${log.length ? '' : 'pointer-events-none opacity-30'}`}
          >
            Export CSV
          </a>
          <button onClick={clearLog} className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-400 transition hover:bg-white/10">
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-[28vh] overflow-auto rounded-xl border border-white/5">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr>{COLS.map(([k, h]) => <th key={k} className="whitespace-nowrap px-2.5 py-2 font-semibold text-slate-400">{h}</th>)}</tr>
          </thead>
          <tbody>
            {log.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-6 text-center text-slate-500">
                  Heat until a rapid continuous stream leaves the capillary, then <b>take the flame away</b> and
                  watch for the moment the stream stops. That moment is the boiling point — and it is the only
                  one of the two temperatures worth writing down.
                </td>
              </tr>
            ) : (
              log.map((r, i) => (
                <motion.tr
                  key={r.id}
                  initial={{ opacity: 0, backgroundColor: 'rgba(56,189,248,0.16)' }}
                  animate={{ opacity: 1, backgroundColor: 'rgba(0,0,0,0)' }}
                  transition={{ duration: 0.9 }}
                  className={i % 2 ? 'bg-white/[0.02]' : ''}
                >
                  {COLS.map(([k]) => (
                    <td key={k} className={`whitespace-nowrap px-2.5 py-1.5 ${
                      k === 'verdict' || k === 'liquid' ? 'text-slate-200' : 'font-mono text-slate-300'}`}
                    >
                      {r[k] === null || r[k] === undefined ? '—' : r[k]}
                    </td>
                  ))}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export function BoilingPointHUD() {
  return (
    /* Stacked below xl: two 23rem panels side by side need 46rem of width, and
       on anything narrower they used to overlap and COVER each other's controls.
       A control you cannot reach is a control that does not exist. Below the
       breakpoint the column scrolls instead. */
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:justify-between">
        <div className="pointer-events-auto"><Controls /></div>
        <header className="pointer-events-none hidden select-none text-right lg:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            Determination of the boiling point of an organic compound
          </h1>
          <p className="text-[11px] text-slate-400">
            CBSE Class XI · Unit 12 · Siwoloboff's method · Antoine and Raoult, nothing scripted
          </p>
        </header>
        <div className="pointer-events-auto"><Instruments /></div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[70rem]"><ObservationTable /></div>
      </div>
    </div>
  );
}

export default BoilingPointHUD;
