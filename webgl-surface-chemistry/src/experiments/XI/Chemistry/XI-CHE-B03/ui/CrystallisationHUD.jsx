/**
 * CrystallisationHUD — the bench controls and the notebook for XI-CHE-B03.
 *
 * The controls are STAGED, because the procedure is. You cannot filter a
 * solution hot after you have let it cool, and you cannot weigh crystals that
 * have not formed. Each stage offers what is possible at that point and no
 * more — the order is the student's to get right, and getting it wrong has a
 * consequence rather than a warning dialog.
 */
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  useCrystallisationEngine, selectDerived, selectStatus, selectLog, selectStage,
  SOLUTES, SOLVENTS, CRUDE_GRADES, COOLING,
} from '../engine/useCrystallisationEngine.js';

const GLASS = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/40';

const TONE = {
  done: 'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  crystallising: 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  settling: 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  cooling: 'text-sky-200 border-sky-300/40 bg-sky-300/10',
  hot: 'text-amber-200 border-amber-300/40 bg-amber-300/10',
  supersaturated: 'text-fuchsia-200 border-fuchsia-300/40 bg-fuchsia-300/10',
  undissolved: 'text-orange-200 border-orange-300/40 bg-orange-300/10',
  'no-crystals': 'text-rose-200 border-rose-300/40 bg-rose-300/10',
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

function Segmented({ options, value, onChange, disabled }) {
  return (
    <div className={`flex gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((o) => (
        <button
          key={o.value} onClick={() => !disabled && onChange(o.value)} title={o.hint} disabled={disabled}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition ${
            value === o.value ? 'bg-sky-400/20 text-sky-100' : 'text-slate-400 hover:bg-white/5'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, step, value, onChange, accent = 'bg-slate-700', disabled }) {
  return (
    <input
      type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`h-2 w-full cursor-grab appearance-none rounded-full ${accent} ${disabled ? 'opacity-40' : ''}
        [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
        [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg`}
    />
  );
}

/* `probe` puts a stable hook on the value, so the render checks read the
   element a student is looking at rather than scraping innerText for a label
   that also appears in the status sentence and the table. */
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

const Action = ({ onClick, children, tone = 'primary', title }) => (
  <motion.button
    whileTap={{ scale: 0.97 }} onClick={onClick} title={title}
    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
      tone === 'primary' ? 'bg-sky-500 text-slate-950 hover:bg-sky-400'
        : tone === 'warn' ? 'border border-amber-300/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
          : tone === 'good' ? 'border border-emerald-300/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20'
            : 'border border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'}`}
  >
    {children}
  </motion.button>
);

function Controls() {
  const d = useCrystallisationEngine(selectDerived);
  const stage = useCrystallisationEngine(selectStage);
  const soluteId = useCrystallisationEngine((s) => s.soluteId);
  const solventId = useCrystallisationEngine((s) => s.solventId);
  const crude = useCrystallisationEngine((s) => s.crude);
  const massG = useCrystallisationEngine((s) => s.massG);
  const solventMl = useCrystallisationEngine((s) => s.solventMl);
  const coolTemp = useCrystallisationEngine((s) => s.crystallisationTempC);
  const cooling = useCrystallisationEngine((s) => s.cooling);
  const filtration = useCrystallisationEngine((s) => s.filtration);
  const washed = useCrystallisationEngine((s) => s.washed);
  const timeScale = useCrystallisationEngine((s) => s.timeScale);
  const minutes = useCrystallisationEngine((s) => Math.round(s.elapsed / 6) / 10);

  const {
    setSolute, setSolvent, setCrude, setMass, setSolventMl, setCooling,
    setCrystallisationTemp, dissolve, filterHot, skipFiltration, cool, scratch,
    wash, record, reset, setTimeScale,
  } = useCrystallisationEngine.getState();

  const locked = stage !== 'setup';

  return (
    <div className={`${GLASS} w-full max-w-[23rem] shrink-0 p-4`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">Bench</h2>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">XI-CHE-B03</span>
      </div>

      <div className="space-y-3">
        <Field label="Crude sample">
          <Segmented
            value={soluteId} onChange={setSolute} disabled={locked}
            options={Object.values(SOLUTES).map((c) => ({ value: c.id, label: c.formula, hint: c.note }))}
          />
          <div className="mt-1 text-[11px] text-slate-400">{d.solute.label} · {d.solute.note}</div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Solvent">
            <Segmented
              value={solventId} onChange={setSolvent} disabled={locked}
              options={Object.values(SOLVENTS).map((s) => ({ value: s.id, label: s.label, hint: s.note }))}
            />
          </Field>
          <Field label="Contamination">
            <Segmented
              value={crude} onChange={setCrude} disabled={locked}
              options={Object.values(CRUDE_GRADES).map((g) => ({
                value: g.id, label: g.id, hint: `${(g.soluble * 100).toFixed(0)}% soluble, ${(g.insoluble * 100).toFixed(0)}% insoluble`,
              }))}
            />
          </Field>
        </div>

        <Field label={`Crude taken — ${massG} g`}>
          <Slider min={3} max={15} step={1} value={massG} onChange={setMass} disabled={locked} />
        </Field>

        <Field label={`Solvent — ${solventMl} mL`}>
          <Slider
            min={1} max={150} step={1} value={solventMl} onChange={setSolventMl} disabled={locked}
            accent="bg-gradient-to-r from-emerald-700 via-sky-700 to-rose-600"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
            <span>1 mL</span>
            <span className={solventMl > d.minimumMl * 1.6 ? 'text-rose-300' : 'text-emerald-300'} data-probe="minimum">
              minimum ≈ {num(d.minimumMl, 1)} mL
            </span>
            <span>150</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Every millilitre past the minimum keeps some of your product dissolved for good.
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Crystallise at ${coolTemp} °C`}>
            <Slider min={0} max={30} step={5} value={coolTemp} onChange={setCrystallisationTemp}
              accent="bg-gradient-to-r from-sky-600 to-slate-600" />
          </Field>
          <Field label="Cooling">
            <Segmented
              value={cooling} onChange={setCooling}
              options={Object.values(COOLING).map((c) => ({ value: c.id, label: c.id, hint: c.note }))}
            />
          </Field>
        </div>

        {/* ── The procedure, one stage at a time ─────────────────────────── */}
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">Procedure</div>
          <div className="grid grid-cols-2 gap-2">
            {stage === 'setup' ? (
              <>
                <Action onClick={dissolve} title="Heat to boiling and dissolve">Heat &amp; dissolve</Action>
                <Action onClick={reset} tone="ghost">Reset</Action>
              </>
            ) : null}

            {stage === 'hot' ? (
              <>
                <Action
                  onClick={filterHot}
                  tone={filtration === 'hot' ? 'good' : 'warn'}
                  title="Removes insoluble material. Only possible while the solution is hot"
                >
                  {filtration === 'hot' ? 'Filtered hot ✓' : 'Filter hot'}
                </Action>
                <Action onClick={skipFiltration} tone="ghost" title="Skip it, and the sand is weighed as product">
                  Skip filtration
                </Action>
                <Action onClick={cool} title="Set aside to cool and crystallise">Set aside to cool</Action>
                <Action onClick={dissolve} tone="ghost">Re-dissolve</Action>
                {/* A student who has dissolved their sample in the wrong solvent
                    must be able to abandon it. There was no way out of this
                    stage at all until a render check tried to leave one. */}
                <Action onClick={reset} tone="ghost">Start again</Action>
              </>
            ) : null}

            {stage === 'cooling' ? (
              <>
                <Action onClick={scratch} tone="warn" title="Scratch the flask with a glass rod, or add a seed crystal">
                  Scratch the flask
                </Action>
                <Action onClick={reset} tone="ghost">Start again</Action>
              </>
            ) : null}

            {stage === 'crystallised' ? (
              <>
                <Action onClick={wash} tone={washed ? 'good' : 'warn'} title="Removes adhering mother liquor — and dissolves a little product">
                  {washed ? 'Washed ✓' : 'Wash with ice-cold solvent'}
                </Action>
                <Action onClick={record} tone="good">Weigh the crystals</Action>
                <Action onClick={reset} tone="ghost">Start again</Action>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span>Clock</span>
          {/* A beaker of near-boiling water takes forty minutes to reach the
              bench and a slow crystallisation is left overnight, so the clock
              has to be able to skip hours. The engine sub-steps internally, so
              a fast clock changes how long you wait and nothing else — which
              check 17 of verify-crystallisation.mjs exists to prove. */}
          {[1, 120, 600, 3000].map((t) => (
            <button key={t} onClick={() => setTimeScale(t)}
              className={`rounded-lg px-2 py-1 font-mono transition ${
                timeScale === t ? 'bg-sky-400/20 text-sky-200' : 'bg-white/5 hover:bg-white/10'}`}
            >
              ×{t}
            </button>
          ))}
          <span className="ml-auto font-mono text-slate-300">{minutes.toFixed(1)} min</span>
        </div>
      </div>
    </div>
  );
}

function Instruments() {
  const d = useCrystallisationEngine(selectDerived);
  const status = useCrystallisationEngine(selectStatus);
  const nuclei = useCrystallisationEngine((s) => s.nuclei);
  const tone = TONE[status.key] ?? TONE.cooling;

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
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Recovery</div>
            <div className="font-mono text-3xl text-slate-50" data-probe="recovery">
              {num(d.recoveryPercent, 0)} <span className="text-sm text-slate-400">%</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Crystals</div>
            <div className="font-mono text-xl text-slate-100" data-probe="mass">{num(d.productMass, 2)} <span className="text-[11px] text-slate-400">g</span></div>
          </div>
        </div>
        <div className="mt-1 font-mono text-[11px] text-slate-500">
          of a possible <span data-probe="max">{num(d.theoreticalMax, 2)}</span> g · <span data-probe="temp">{num(d.tempC, 0)}</span> °C
        </div>
      </div>

      {/* The solubility curve, which is the argument of the whole experiment. */}
      <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Why this solvent</div>
        <div className="mt-1 text-sm text-slate-200">
          {d.solute.formula} dissolves <b className="text-sky-300" data-probe="ratio">{num(d.solubilityRatio, 1)}×</b> better
          at {d.solvent.boilingPointC} °C than at {d.crystallisationTempC} °C.
        </div>
        <div className="mt-1 font-mono text-[11px] text-slate-500">
          {num(d.hotSolubility, 1)} g/100 g hot · {num(d.coldSolubility, 2)} g/100 g cold · ΔH<sub>soln</sub> {num(d.enthalpyOfSolution / 1000, 1)} kJ/mol
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {d.solubilityRatio > 6
            ? 'A steep curve, so most of what dissolves must come back out. A good solvent.'
            : 'A flat curve. Most of it will stay dissolved however carefully you cool it — this is the wrong solvent.'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Readout probe="size" label="Crystal size" value={num(d.meanSizeMm, 2)} unit="mm"
          hint="Mass shared between however many nuclei formed" />
        <Readout probe="count" label="Crystals" value={nuclei >= 1 ? Math.round(nuclei).toLocaleString() : '—'}
          hint="Nucleation rate integrated from the moment the solution passed saturation" />
        <Readout probe="purity" label="Purity" value={num(d.purity * 100, 1)} unit="%" />
        <Readout probe="supersaturation" label="Supersaturation" value={num(d.supersaturationRatio, 2)} unit="×"
          hint="Above 1 the solution holds more than it should. Nucleation has a barrier and takes time" />
        <Readout probe="transition" label={d.transition.kind === 'melting point' ? 'Melts at' : 'Transition'}
          value={num(d.transition.clearC, 1)} unit="°C"
          hint={`${d.solute.label} ${d.transition.kind} — literature ${d.transition.literatureC} °C`} />
        <Readout probe="range" label="over" value={num(d.transition.rangeC, 1)} unit="°C"
          hint="Sharp means pure. For benzoic acid this comes from the XI-CHE-B01 liquidus" />
        <Readout label="Occluded liquor" value={num(d.fromOcclusion * 1000, 1)} unit="mg"
          hint="Mother liquor trapped in the crystals — goes as surface area, so worse for small ones" />
        <Readout label="Sand carried over" value={num(d.fromInsoluble, 2)} unit="g"
          hint="Insoluble material that the hot filtration would have removed" />
      </div>
    </div>
  );
}

const COLS = [
  ['trial', 'Trial'],
  ['compound', 'Compound'],
  ['solvent', 'Solvent'],
  ['crudeMassG', 'Crude / g'],
  ['solventMl', 'Solvent / mL'],
  ['coolTempC', 'Cooled to / °C'],
  ['cooling', 'Cooling'],
  ['crystalMassG', 'Crystals / g'],
  ['recoveryPct', 'Recovery / %'],
  ['sizeMm', 'Size / mm'],
  ['purityPct', 'Purity / %'],
  ['meltingPointC', 'Transition / °C'],
  ['rangeC', 'Range / °C'],
  ['verdict', 'Inference'],
];

const ObservationTable = memo(function ObservationTable() {
  const log = useCrystallisationEngine(selectLog);
  const clearLog = useCrystallisationEngine.getState().clearLog;

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
          <a href={`data:text/csv;charset=utf-8,${csv}`} download="XI-CHE-B03-crystallisation.csv"
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
                  Dissolve the crude sample in the <b>minimum</b> volume of boiling solvent, filter it hot, let it
                  cool, then weigh what comes out. Do it twice with different volumes and the reason for the word
                  "minimum" becomes an entry in this table rather than a rule you were told.
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

export function CrystallisationHUD() {
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
            Crystallisation of an impure sample
          </h1>
          <p className="text-[11px] text-slate-400">
            CBSE Class XI · Unit 12 · measured solubility, an exact mass balance, nothing scripted
          </p>
        </header>
        <div className="pointer-events-auto"><Instruments /></div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[72rem]"><ObservationTable /></div>
      </div>
    </div>
  );
}

export default CrystallisationHUD;
