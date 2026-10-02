/**
 * LabHUD — the bench controls and the notebook.
 *
 * Completely decoupled from the canvas: it is a sibling DOM layer, not a Drei
 * <Html> inside the scene graph, so text stays crisp, screen readers can reach
 * it, and a slider drag never touches the render loop. It talks to the engine
 * through selectors only, which is why dragging the concentration slider
 * re-renders three numbers and not the observation table.
 *
 * Nothing here computes chemistry. Every value shown is read from the store.
 */
import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { SOLS, ELECTROLYTES } from '../engine/chemistry-data.js';
import {
  useChemistryEngine, selectDerived, selectLog, selectStatus, selectRunning,
} from '../engine/useChemistryEngine.js';

/* Status → colour. The palette is the judgement: green only for a genuine
   precipitate, amber for "something is happening", red for a failed run, slate
   for a beaker that is simply stable. A student should be able to read the
   outcome from across the room. */
const TONE = {
  precipitated:        'text-emerald-300 border-emerald-400/40 bg-emerald-400/10',
  coagulating:         'text-amber-200  border-amber-300/40  bg-amber-300/10',
  onset:               'text-amber-200  border-amber-300/40  bg-amber-300/10',
  slow:                'text-sky-200    border-sky-300/40    bg-sky-300/10',
  'needs-stirring':    'text-sky-200    border-sky-300/40    bg-sky-300/10',
  stable:              'text-slate-300  border-white/15      bg-white/5',
  'no-counter-ion':    'text-rose-200   border-rose-300/40   bg-rose-300/10',
  'not-coagulable':    'text-rose-200   border-rose-300/40   bg-rose-300/10',
  restabilised:        'text-fuchsia-200 border-fuchsia-300/40 bg-fuchsia-300/10',
  'salting-out':       'text-violet-200 border-violet-300/40 bg-violet-300/10',
  'lyophilic-resisting': 'text-violet-200 border-violet-300/40 bg-violet-300/10',
};

const GLASS = 'rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl shadow-2xl shadow-black/40';

const sig = (x, n = 3) => (Number.isFinite(x) ? Number(x.toPrecision(n)).toLocaleString() : '—');

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const SELECT = 'w-full appearance-none rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 '
  + 'text-sm text-slate-100 outline-none transition focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20';

function Readout({ label, value, unit, hint }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2" title={hint}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm text-slate-100">
        {value}
        {unit ? <span className="ml-1 text-[10px] text-slate-400">{unit}</span> : null}
      </div>
    </div>
  );
}

/* ── Controls ──────────────────────────────────────────────────────────────── */
function Controls() {
  const d = useChemistryEngine(selectDerived);
  const running = useChemistryEngine(selectRunning);
  const concentration = useChemistryEngine((s) => s.concentration_mM);
  const shear = useChemistryEngine((s) => s.shearRate_s);
  const timeScale = useChemistryEngine((s) => s.timeScale);
  /* Quantised to a tenth of a second: the clock must be live, but subscribing to
     the raw float would re-render this panel on every animation frame. */
  const t = useChemistryEngine((s) => Math.round(s.elapsedTime * 10) / 10);
  const {
    setSol, setElectrolyte, setConcentration, setShear, addElectrolyte,
    setTimeScale, pause, resume, reset, record,
  } = useChemistryEngine.getState();

  /* The slider runs to a few times the CCC for THIS pair, so the interesting
     region is always reachable by hand — a fixed 0–100 mM scale would make
     AlCl₃ on As₂S₃ (CCC 0.093 mM) a single pixel wide. Decade steps keep the
     resolution honest at both ends. */
  const max = useMemo(() => {
    const c = d.ccc_mM;
    if (!Number.isFinite(c)) return 5000;
    const target = c * 8;
    return 10 ** Math.ceil(Math.log10(target));
  }, [d.ccc_mM]);
  const step = max / 500;

  return (
    <div className={`${GLASS} w-full max-w-[22rem] shrink-0 p-4`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">Bench</h2>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">Surface chemistry</span>
      </div>

      <div className="space-y-3">
        <Field label="Colloidal sol">
          <select className={SELECT} value={d.sol.id} onChange={(e) => setSol(e.target.value)}>
            {Object.values(SOLS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {s.formula} ({s.charge > 0 ? '+ve' : '−ve'}
                {s.lyophilic ? ', lyophilic' : ''})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Electrolyte">
          <select
            className={SELECT}
            value={d.electrolyte.id}
            onChange={(e) => setElectrolyte(e.target.value)}
          >
            {Object.values(ELECTROLYTES).map((e) => (
              <option key={e.id} value={e.id}>{e.label} — {e.formula}</option>
            ))}
          </select>
        </Field>

        <Field label={`Concentration — ${sig(concentration, 3)} mM`}>
          <input
            type="range" min={0} max={max} step={step} value={Math.min(concentration, max)}
            onChange={(e) => setConcentration(Number(e.target.value))}
            className="h-2 w-full cursor-grab appearance-none rounded-full bg-gradient-to-r
                       from-slate-700 via-sky-700 to-rose-600 accent-sky-400
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
            <span>0</span>
            <span className="text-sky-300">CCC {sig(d.ccc_mM)} mM</span>
            <span>{sig(max)} mM</span>
          </div>
        </Field>

        <Field label={`Stirring — ${shear === 0 ? 'left standing' : `G = ${shear.toFixed(0)} s⁻¹`}`}>
          <input
            type="range" min={0} max={120} step={1} value={shear}
            onChange={(e) => setShear(Number(e.target.value))}
            className="h-2 w-full cursor-grab appearance-none rounded-full bg-slate-700
                       [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-300"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={addElectrolyte}
            className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-slate-950
                       transition hover:bg-sky-400 disabled:opacity-40"
            disabled={concentration <= 0}
          >
            Add electrolyte
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={running ? pause : resume}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100
                       transition hover:bg-white/10"
          >
            {running ? 'Pause' : 'Resume'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={record}
            className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-sm
                       text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Record reading
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={reset}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-300
                       transition hover:bg-white/10"
          >
            Fresh beaker
          </motion.button>
        </div>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <span>Clock</span>
          {[1, 10, 100].map((t) => (
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
          <span className="ml-auto font-mono text-slate-300">
            t = {t.toFixed(1)} s
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Live instrument panel ─────────────────────────────────────────────────── */
function Instruments() {
  const d = useChemistryEngine(selectDerived);
  const status = useChemistryEngine(selectStatus);
  const tone = TONE[status.key] ?? TONE.stable;

  return (
    <div className={`${GLASS} w-full max-w-[22rem] shrink-0 p-4`}>
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
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className={`mb-3 rounded-xl border px-3 py-2 ${tone}`}
      >
        <div className="text-sm font-semibold">{status.title}</div>
        <div className="mt-0.5 text-[11px] leading-snug opacity-80">{status.detail}</div>
      </motion.div>

      {/* Hardy–Schulze, made visible. The counter-ion is chosen by sign and then
          ranked by charge, and the CCC beside it is what that charge buys. */}
      <div className="mb-3 rounded-xl border border-white/5 bg-black/20 p-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">Hardy–Schulze</div>
        <div className="mt-1 text-sm text-slate-200">
          {d.sol.formula} is <b>{d.sol.charge > 0 ? 'positive' : 'negative'}</b>, so the
          coagulating ion is the{' '}
          <b className="text-sky-300">{d.ion ? d.ion.symbol : 'none available'}</b>
          {d.ion ? <> at z = {Math.abs(d.ion.z)}</> : null}.
        </div>
        {d.spectator ? (
          <div className="mt-1 text-[11px] text-slate-500">
            {d.spectator.symbol} is a spectator here — same sign as the sol, repelled.
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Readout label="Coagulated" value={d.coagulationPercentage.toFixed(1)} unit="%" />
        <Readout label="Settled" value={(d.sedimentFraction * 100).toFixed(1)} unit="%" />
        <Readout label="CCC" value={sig(d.ccc_mM)} unit="mM"
          hint="Critical coagulation concentration for this sol–electrolyte pair" />
        <Readout label="Counter-ion" value={sig(d.ionConcentration_mM)} unit="mM"
          hint="The counter-ion's own concentration, not the salt's" />
        <Readout label="Stability W" value={Number.isFinite(d.W) ? sig(d.W) : '∞'}
          hint="Fuchs ratio: how many collisions fail for each one that sticks" />
        <Readout label="Half-time t½" value={Number.isFinite(d.halfTime) ? sig(d.halfTime) : '∞'} unit="s" />
        <Readout label="Floc radius" value={sig(d.clusterRadius * 1e9)} unit="nm"
          hint="Fractal aggregate: R = R₀ i^(1/d_f)" />
        <Readout label="d_f" value={d.fractalDimension.toFixed(2)}
          hint="Fractal dimension — 2.1 rapid, 2.4 slow, higher when stirred" />
        <Readout label="Tyndall" value={`×${sig(d.tyndallGain)}`}
          hint="Scattering relative to the pristine sol, at 550 nm" />
        <Readout label="Turbidity τ" value={sig(d.turbidity)}
          hint="βL over a 7 cm path — Beer–Lambert" />
        <Readout label="Settling v" value={sig(d.settlingVelocity * 1e6)} unit="µm/s" />
        <Readout label="Asymmetry g" value={d.asymmetry.toFixed(3)}
          hint="0 = Rayleigh, blue and all-round; → 0.9 = forward-thrown Mie shaft" />
      </div>
    </div>
  );
}

/* ── Observation table ─────────────────────────────────────────────────────── */
const COLS = [
  ['sol', 'Sol'],
  ['solCharge', 'Charge'],
  ['electrolyte', 'Electrolyte'],
  ['counterIon', 'Coagulating ion'],
  ['valency', 'z'],
  ['added_mM', 'Added / mM'],
  ['counterIon_mM', 'Ion / mM'],
  ['ccc_mM', 'CCC / mM'],
  ['stirring_s', 'G / s⁻¹'],
  ['time_s', 't / s'],
  ['coagulated_pct', 'Coagulated / %'],
  ['clusterRadius_nm', 'Floc r / nm'],
  ['tyndallGain', 'Tyndall ×'],
  ['observation', 'Observation'],
];

const ObservationTable = memo(function ObservationTable() {
  const log = useChemistryEngine(selectLog);
  const clearLog = useChemistryEngine.getState().clearLog;

  const csv = useMemo(() => {
    const head = COLS.map(([, h]) => h).join(',');
    const rows = log.map((r) => COLS.map(([k]) => `"${r[k] ?? ''}"`).join(','));
    return encodeURIComponent([head, ...rows].join('\n'));
  }, [log]);

  return (
    <div className={`${GLASS} pointer-events-auto max-h-[38vh] w-full overflow-hidden p-4`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-100">
          Observation table
          <span className="ml-2 text-[11px] font-normal text-slate-500">
            {log.length} reading{log.length === 1 ? '' : 's'}
          </span>
        </h2>
        <div className="flex gap-2">
          <a
            href={`data:text/csv;charset=utf-8,${csv}`}
            download="surface-chemistry-observations.csv"
            className={`rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-300
                        transition hover:bg-white/10 ${log.length ? '' : 'pointer-events-none opacity-30'}`}
          >
            Export CSV
          </a>
          <button
            onClick={clearLog}
            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-slate-400
                       transition hover:bg-white/10"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="max-h-[30vh] overflow-auto rounded-xl border border-white/5">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
            <tr>
              {COLS.map(([k, h]) => (
                <th key={k} className="whitespace-nowrap px-2.5 py-2 font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {log.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="px-3 py-6 text-center text-slate-500">
                  Choose a sol and an electrolyte, add it, then press <b>Record reading</b> at the
                  moment you want to write down — the table records what you did, not what you
                  should have done.
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
                    <td
                      key={k}
                      className={`whitespace-nowrap px-2.5 py-1.5 ${
                        k === 'observation' ? 'text-slate-200' : 'font-mono text-slate-300'
                      }`}
                    >
                      {r[k] ?? '—'}
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

export function LabHUD() {
  return (
    /* pointer-events-none on the frame, re-enabled on each panel, so the space
       between the panels is still the beaker and can be orbited. */
    /* Stacked below xl: two 23rem panels side by side need 46rem of width, and
       on anything narrower they used to overlap and COVER each other's controls.
       A control you cannot reach is a control that does not exist. Below the
       breakpoint the column scrolls instead. */
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex flex-col items-start gap-4 xl:flex-row xl:justify-between">
        <div className="pointer-events-auto"><Controls /></div>
        <header className="pointer-events-none hidden select-none text-right lg:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">
            Coagulation of colloids &amp; the Tyndall effect
          </h1>
          <p className="text-[11px] text-slate-400">
            CBSE Class XII · Surface Chemistry · every number solved live, nothing scripted
          </p>
        </header>
        <div className="pointer-events-auto"><Instruments /></div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="pointer-events-auto w-full max-w-[64rem]"><ObservationTable /></div>
      </div>
    </div>
  );
}

export default LabHUD;
