/**
 * MeltingPointHUD — the bench controls and the notebook for XI-CHE-B01.
 *
 * A DOM sibling of the canvas, not a <Html> inside it: text stays crisp, the
 * keyboard and screen readers reach it, and a slider drag never touches the
 * render loop. Every value shown is read from the store; nothing here computes
 * chemistry.
 */
import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useMeltingPointEngine, selectDerived, selectStatus, selectLog,
  selectSinter, selectFirstDrop, selectLastCrystal,
  COMPOUNDS, BATHS, THERMOMETERS, UNKNOWNS,
} from '../engine/useMeltingPointEngine.js';

const GLASS = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/40';

const TONE = {
  melted:         'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  melting:        'text-amber-200  border-amber-300/40  bg-amber-300/10',
  sintering:      'text-amber-200  border-amber-300/40  bg-amber-300/10',
  heating:        'text-sky-200    border-sky-300/40    bg-sky-300/10',
  cooling:        'text-slate-300  border-white/15      bg-white/5',
  'too-fast':     'text-orange-200 border-orange-300/40 bg-orange-300/10',
  'bath-too-cold':'text-rose-200   border-rose-300/40   bg-rose-300/10',
  sublimed:       'text-rose-200   border-rose-300/40   bg-rose-300/10',
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
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.hint}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition ${
            value === o.value ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:bg-white/5'
          }`}
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

/* `probe` puts a stable hook on the value. The render checks in
   verify-render-melting-point.mjs read these rather than scraping innerText:
   a label like "Last crystal" also appears in the status sentence and in the
   table header, and a regex over rendered text quietly picks the wrong one. */
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

/* ── The bench ─────────────────────────────────────────────────────────────── */
function Controls() {
  const d = useMeltingPointEngine(selectDerived);
  const compoundId = useMeltingPointEngine((s) => s.compoundId);
  const purity = useMeltingPointEngine((s) => s.purity);
  const impurityId = useMeltingPointEngine((s) => s.impurityId);
  const mixMolePercent = useMeltingPointEngine((s) => s.mixMolePercent);
  const bath = useMeltingPointEngine((s) => s.bath);
  const thermometer = useMeltingPointEngine((s) => s.thermometer);
  const heatingRate = useMeltingPointEngine((s) => s.heatingRate);
  const burnerOn = useMeltingPointEngine((s) => s.burnerOn);
  const airOpen = useMeltingPointEngine((s) => s.airOpen);
  const timeScale = useMeltingPointEngine((s) => s.timeScale);
  const minutes = useMeltingPointEngine((s) => Math.round(s.elapsed / 6) / 10);
  const runs = useMeltingPointEngine((s) => s.capillaryRuns);

  const {
    setCompound, setPurity, setImpurity, setMix, setBath, setThermometer,
    setHeatingRate, setAir, toggleBurner, freshCapillary, reuseCapillary,
    setTimeScale, record, reset,
  } = useMeltingPointEngine.getState();

  const mixOptions = useMemo(
    () => Object.values(COMPOUNDS).filter((c) => c.id !== 'water'),
    [],
  );

  return (
    <div className={`${GLASS} w-[23rem] shrink-0 p-4`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">Bench</h2>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">XI-CHE-B01</span>
      </div>

      <div className="space-y-3">
        <Field label="Compound in the capillary">
          <Segmented
            value={compoundId}
            onChange={setCompound}
            options={UNKNOWNS.map((id) => ({
              value: id, label: COMPOUNDS[id].formula, hint: `${COMPOUNDS[id].label} — lit. ${COMPOUNDS[id].meltingPointC} °C`,
            }))}
          />
          <div className="mt-1 text-[11px] text-slate-400">{d.host.label} · {d.host.note}</div>
        </Field>

        <Field label="Sample">
          <Segmented
            value={purity}
            onChange={setPurity}
            options={[
              { value: 'pure', label: 'Recrystallised', hint: 'Twice recrystallised and dried' },
              { value: 'slight', label: 'Once washed', hint: 'About 1 mol% of a second substance' },
              { value: 'impure', label: 'Crude', hint: 'About 4 mol% — straight from the reaction' },
            ]}
          />
          <div className="mt-1 text-[11px] text-slate-400">
            Contaminated with {d.guest.label.toLowerCase()} — {(d.moleFractionGuest * 100).toFixed(2)} mol%
          </div>
        </Field>

        <Field label="Mixed melting point — add a known compound">
          <select
            className="w-full appearance-none rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm
                       text-slate-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20"
            value={impurityId}
            onChange={(e) => setImpurity(e.target.value)}
          >
            <option value="none">— nothing added —</option>
            {mixOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.label} ({c.meltingPointC} °C)</option>
            ))}
          </select>
          {impurityId !== 'none' ? (
            <>
              <div className="mt-2 mb-1 font-mono text-[11px] text-slate-400">{mixMolePercent} mol% added</div>
              <Slider min={0} max={60} step={1} value={mixMolePercent} onChange={setMix}
                accent="bg-gradient-to-r from-slate-700 to-fuchsia-600" />
              {impurityId === compoundId ? (
                <div className="mt-1 text-[11px] text-emerald-300/80">
                  Same substance: an equal mixture melts exactly where the pure compound does.
                </div>
              ) : null}
            </>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bath">
            <Segmented
              value={bath}
              onChange={setBath}
              options={Object.values(BATHS).map((b) => ({ value: b.id, label: b.label.split(' ')[0], hint: b.note }))}
            />
          </Field>
          <Field label="Thermometer">
            <Segmented
              value={thermometer}
              onChange={setThermometer}
              options={Object.values(THERMOMETERS).map((t) => ({ value: t.id, label: t.label, hint: `Least count ${t.leastCount} °C` }))}
            />
          </Field>
        </div>

        <Field label={`Rate of heating — ${heatingRate} °C/min`}>
          <Slider min={1} max={12} step={1} value={heatingRate} onChange={setHeatingRate}
            accent="bg-gradient-to-r from-sky-700 via-amber-600 to-rose-600" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
            <span className="text-sky-300">1 — slow and right</span>
            <span className="text-rose-300">12 — ±{d.rateBroadening.toFixed(1)} °C</span>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={toggleBurner}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              burnerOn ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                       : 'bg-sky-500 text-slate-950 hover:bg-sky-400'}`}
          >
            {burnerOn ? 'Turn burner off' : 'Light the burner'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setAir(!airOpen)}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 transition hover:bg-white/10"
            title="A luminous yellow flame is air-starved: sooty, and a couple of hundred degrees cooler"
          >
            Air hole {airOpen ? 'open' : 'shut'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={record}
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Record trial
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={freshCapillary}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            Fresh capillary
          </motion.button>
        </div>

        <button
          onClick={reuseCapillary}
          className="w-full rounded-xl border border-white/10 px-3 py-1.5 text-[11px] text-slate-400 transition hover:bg-white/5"
          title="Melt the same capillary again — free for naphthalene, not free for urea"
        >
          Re-melt this capillary{runs ? ` (run ${runs + 1})` : ''}
        </button>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span>Clock</span>
          {[1, 60, 300].map((t) => (
            <button
              key={t}
              onClick={() => setTimeScale(t)}
              className={`rounded-lg px-2 py-1 font-mono transition ${
                timeScale === t ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 hover:bg-white/10'
              }`}
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

/* ── Instruments ───────────────────────────────────────────────────────────── */
function Instruments() {
  const d = useMeltingPointEngine(selectDerived);
  const status = useMeltingPointEngine(selectStatus);
  const sinterC = useMeltingPointEngine(selectSinter);
  const firstDropC = useMeltingPointEngine(selectFirstDrop);
  const lastCrystalC = useMeltingPointEngine(selectLastCrystal);
  const tone = TONE[status.key] ?? TONE.heating;
  const range = firstDropC !== null && lastCrystalC !== null ? lastCrystalC - firstDropC : null;

  return (
    <div className={`${GLASS} w-[23rem] shrink-0 p-4`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={status.key}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18 }}
          className={`mb-3 rounded-xl border px-3 py-2 ${tone}`}
        >
          <div className="text-sm font-semibold">{status.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug opacity-80">{status.detail}</div>
        </motion.div>
      </AnimatePresence>

      {/* The three temperatures, and why they are not the same number. */}
      <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Thermometer</div>
        <div className="font-mono text-3xl text-slate-50" data-probe="reading">{num(d.readingC, 1)} <span className="text-sm text-slate-400">°C</span></div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 font-mono text-[11px] text-slate-500">
          <span>bath <span data-probe="bath">{num(d.bathC)}</span> °C</span>
          <span>sample <span data-probe="sample">{num(d.sampleC)}</span> °C</span>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {Math.abs(d.thermometerLagC) > 0.4
            ? `The mercury is ${num(Math.abs(d.thermometerLagC))} °C behind the bath — that lag is why you slow down near the end.`
            : 'Bath and mercury are level. This is the condition in which a reading means something.'}
        </div>
      </div>

      {/* The three observations. */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Readout probe="sinter" label="Sinters" value={num(sinterC)} unit="°C" hint="Eutectic melt wets the grains — the true start of melting" />
        <Readout probe="first-drop" label="First drop" value={num(firstDropC)} unit="°C" hint="The column visibly wets — about a quarter liquid" />
        <Readout probe="last-crystal" label="Last crystal" value={num(lastCrystalC)} unit="°C" hint="The melting point. This is the number that goes in the table" />
      </div>
      <div className={`mb-3 rounded-xl border px-3 py-2 text-sm ${
        range === null ? 'border-white/10 bg-white/5 text-slate-400'
          : range <= 1 ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
            : 'border-amber-300/40 bg-amber-300/10 text-amber-200'}`}
      >
        {range === null
          ? 'Melting range — not yet observed'
          : <>Melting range <b data-probe="range">{num(range, 1)}</b> °C · literature {num(d.literatureC, 1)} °C · {range <= 1 ? 'sharp, so this is one substance' : 'wide, so something else is present'}</>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Readout probe="melted" label="Melted" value={(d.meltedFraction * 100).toFixed(0)} unit="%" hint="Lever rule: φ = x/x_liquidus(T)" />
        <Readout probe="eutectic" label="Eutectic" value={num(d.eutecticC)} unit="°C" hint={`With ${d.guest.label} — where melting actually begins`} />
        <Readout probe="clear-point" label="Clear point" value={num(d.clearC, 2)} unit="°C" hint="Schröder–van Laar liquidus for this composition" />
        <Readout probe="depression" label="Depression" value={num(d.depressionC, 2)} unit="°C" hint="How far the impurity has pulled it down" />
        <Readout label="Kf" value={num(d.cryoscopicConstant, 2)} unit="K kg/mol" hint="RT²M/1000ΔH — derived, never stored" />
        <Readout label="Rate smear" value={`±${num(d.rateBroadening, 2)}`} unit="°C" hint="√(2τΛr) — latent heat, not observer error" />
        <Readout label="Second substance" value={(d.moleFractionGuest * 100).toFixed(2)} unit="mol%" />
        <Readout label="Column left" value={((1 - d.columnLoss) * 100).toFixed(0)} unit="%" hint="Sublimation takes the sample out of the capillary" />
      </div>
    </div>
  );
}

/* ── Observation table — the columns the published experiment defines ──────── */
const COLS = [
  ['trial', 'Trial'],
  ['compound', 'Compound'],
  ['purity', 'Sample'],
  ['mixedWith', 'Mixed with'],
  ['bath', 'Bath'],
  ['rate', '°C/min'],
  ['leastCount', 'L.C.'],
  ['sinterC', 'Sinters'],
  ['firstDropC', 'First drop'],
  ['lastCrystalC', 'Last crystal'],
  ['rangeC', 'Range'],
  ['literatureC', 'Lit.'],
  ['verdict', 'Inference'],
];

const ObservationTable = memo(function ObservationTable() {
  const log = useMeltingPointEngine(selectLog);
  const clearLog = useMeltingPointEngine.getState().clearLog;

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
          <a
            href={`data:text/csv;charset=utf-8,${csv}`}
            download="XI-CHE-B01-melting-point.csv"
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
                  Light the burner, watch the capillary, and press <b>Record trial</b> once the last crystal has gone.
                  Two trials on the same sample is what a manual asks for — and the second one is where you find out
                  whether you were heating too fast.
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
                      k === 'verdict' || k === 'compound' ? 'text-slate-200' : 'font-mono text-slate-300'}`}
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

export function MeltingPointHUD() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="pointer-events-auto"><Controls /></div>
        <header className="pointer-events-none hidden select-none text-right lg:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            Determination of the melting point of an organic compound
          </h1>
          <p className="text-[11px] text-slate-400">
            CBSE Class XI · Unit 12 · every temperature solved from Schröder–van Laar, nothing scripted
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

export default MeltingPointHUD;
