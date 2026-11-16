'use client'

import { useState, useEffect, useMemo } from 'react'
import { ALGO_DEFAULTS } from '@/lib/fsrs'
import type { FsrsParams } from '@/db/schema/janki'

const STORAGE_KEY = 'srs-algo-params'
const N = 12  // reviews to simulate

// ── Simulation ─────────────────────────────────────────────────────────────

type SimRow = { review: number; interval: number; cumDay: number }

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x))
}

function simulate(grade: 'good' | 'hard' | 'easy', p: FsrsParams): SimRow[] {
  const cap        = p.maxIntervalDays ?? ALGO_DEFAULTS.maxIntervalDays
  const efDecay    = p.efDecay         ?? ALGO_DEFAULTS.efDecay
  const efHardLoss = p.efHardLoss      ?? ALGO_DEFAULTS.efHardLoss
  const efEasyGain = p.efEasyGain      ?? ALGO_DEFAULTS.efEasyGain
  const efMin      = p.efMin           ?? ALGO_DEFAULTS.efMin
  const efMax      = p.efMax           ?? ALGO_DEFAULTS.efMax
  const initEF     = p.initEF          ?? ALGO_DEFAULTS.initEF

  // First review
  let interval = grade === 'hard' ? 1 : grade === 'good' ? 3 : 7
  let ef = grade === 'easy' ? clamp(initEF + efEasyGain, efMin, efMax) : initEF

  const rows: SimRow[] = [{ review: 1, interval, cumDay: interval }]
  let cumDay = interval

  for (let i = 1; i < N; i++) {
    if (grade === 'hard') {
      interval = Math.min(Math.max(1, Math.round(interval * 0.6)), cap)
      ef = clamp(ef - efHardLoss, efMin, efMax)
    } else if (grade === 'good') {
      interval = Math.min(Math.max(1, Math.round(interval * ef)), cap)
      ef = clamp(ef - efDecay, efMin, efMax)
    } else {
      interval = Math.min(Math.max(1, Math.round(interval * ef * 1.5)), cap)
      ef = clamp(ef + efEasyGain, efMin, efMax)
    }
    cumDay += interval
    rows.push({ review: i + 1, interval, cumDay })
  }
  return rows
}

// ── SVG Chart ─────────────────────────────────────────────────────────────

const VW = 480, VH = 200
const PAD = { top: 18, right: 14, bottom: 56, left: 46 }
const PW = VW - PAD.left - PAD.right
const PH = VH - PAD.top - PAD.bottom
const Y_TICKS = [1, 3, 7, 14, 30, 90, 180, 365]

function logY(v: number, yMax: number): number {
  const s = Math.log2(Math.max(v, 0.5) + 1) / Math.log2(yMax + 1)
  return PAD.top + PH - s * PH
}

function IntervalChart({ params }: { params: FsrsParams }) {
  const good = useMemo(() => simulate('good', params), [params])
  const hard = useMemo(() => simulate('hard', params), [params])
  const easy = useMemo(() => simulate('easy', params), [params])

  const allIntervals = [...good, ...hard, ...easy].map(r => r.interval)
  const rawMax = Math.max(...allIntervals, 7)
  const yMax = Y_TICKS.find(t => t >= rawMax) ?? rawMax

  function x(i: number) { return PAD.left + (i / (N - 1)) * PW }
  function y(v: number) { return logY(v, yMax) }

  function polyline(rows: SimRow[], color: string) {
    const pts = rows.map((r, i) => `${x(i)},${y(r.interval)}`).join(' ')
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
  }

  function dots(rows: SimRow[], color: string) {
    return rows.map((r, i) => (
      <g key={i}>
        <circle cx={x(i)} cy={y(r.interval)} r={3} fill={color} />
        <text x={x(i)} y={y(r.interval) - 6} textAnchor="middle"
          fontSize="7.5" fill={color} fontFamily="monospace">
          {r.interval >= 365 ? `${(r.interval / 365).toFixed(1)}y`
            : r.interval >= 30 ? `${Math.round(r.interval / 7)}w`
            : `${r.interval}d`}
        </text>
      </g>
    ))
  }

  const goodArea = [
    `${x(0)},${VH - PAD.bottom}`,
    ...good.map((r, i) => `${x(i)},${y(r.interval)}`),
    `${x(good.length - 1)},${VH - PAD.bottom}`,
  ].join(' ')

  const cap = params.maxIntervalDays ?? ALGO_DEFAULTS.maxIntervalDays
  const visYTicks = Y_TICKS.filter(t => t <= yMax * 1.1)

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH }}>
      <rect width={VW} height={VH} fill="#0f172a" rx={10} />

      {visYTicks.map(t => {
        const yp = y(t)
        if (yp < PAD.top || yp > VH - PAD.bottom) return null
        return (
          <g key={t}>
            <line x1={PAD.left} y1={yp} x2={VW - PAD.right} y2={yp}
              stroke="#1e293b" strokeWidth={1} />
            <text x={PAD.left - 4} y={yp + 3} textAnchor="end"
              fontSize="8" fill="#475569" fontFamily="monospace">
              {t >= 365 ? '1yr' : t >= 30 ? `${Math.round(t / 30)}mo` : `${t}d`}
            </text>
          </g>
        )
      })}

      {good.map((_, i) => (
        <line key={i} x1={x(i)} y1={PAD.top} x2={x(i)} y2={VH - PAD.bottom}
          stroke="#1e293b" strokeWidth={0.5} />
      ))}

      {cap <= yMax && (
        <>
          <line x1={PAD.left} y1={y(cap)} x2={VW - PAD.right} y2={y(cap)}
            stroke="#ef4444" strokeWidth={1} strokeDasharray="6,3" opacity={0.6} />
          <text x={VW - PAD.right - 2} y={y(cap) - 4} textAnchor="end"
            fontSize="7.5" fill="#f87171" fontFamily="monospace">cap {cap}d</text>
        </>
      )}

      <polygon points={goodArea} fill="#10b981" opacity={0.06} />
      {polyline(hard, '#f59e0b')}
      {polyline(good, '#10b981')}
      {polyline(easy, '#818cf8')}
      {dots(hard, '#f59e0b')}
      {dots(good, '#10b981')}
      {dots(easy, '#818cf8')}

      {good.map((r, i) => (
        <g key={i}>
          <text x={x(i)} y={VH - PAD.bottom + 10} textAnchor="middle"
            fontSize="8" fill="#64748b" fontFamily="monospace">R{r.review}</text>
          <text x={x(i)} y={VH - PAD.bottom + 22} textAnchor="middle"
            fontSize="7" fill="#334155" fontFamily="monospace">
            {r.cumDay >= 365 ? `yr${(r.cumDay / 365).toFixed(1)}` : `d${r.cumDay}`}
          </text>
        </g>
      ))}

      {[
        { label: 'Good', color: '#10b981' },
        { label: 'Hard', color: '#f59e0b' },
        { label: 'Easy', color: '#818cf8' },
      ].map((l, i) => (
        <g key={l.label} transform={`translate(${PAD.left + i * 72}, ${PAD.top - 6})`}>
          <line x1={0} y1={0} x2={14} y2={0} stroke={l.color} strokeWidth={2} />
          <circle cx={7} cy={0} r={2.5} fill={l.color} />
          <text x={17} y={3} fontSize="8" fill={l.color} fontFamily="sans-serif">{l.label}</text>
        </g>
      ))}
    </svg>
  )
}

// ── Slider ─────────────────────────────────────────────────────────────────

function Slider({
  label, hint, value, min, max, step, format, onChange, accent,
}: {
  label: string; hint: string; value: number; min: number; max: number
  step: number; format: (v: number) => string; onChange: (v: number) => void; accent: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">{label}</span>
        <span className={`text-xs font-mono font-bold ${accent}`}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-700 cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5
          [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
      />
      <p className="text-[10px] text-slate-500">{hint}</p>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

const PRESETS: { name: string; p: FsrsParams }[] = [
  {
    name: 'Default',
    p: { ...ALGO_DEFAULTS },
  },
  {
    name: 'Cautious (slower)',
    p: { ...ALGO_DEFAULTS, initEF: 1.60, efDecay: 0.06, maxIntervalDays: 180 },
  },
  {
    name: 'Confident (faster)',
    p: { ...ALGO_DEFAULTS, initEF: 1.90, efDecay: 0.02, efEasyGain: 0.15 },
  },
]

export function FsrsSettingsPanel({ deckIds }: { deckIds: string[] }) {
  const [open,   setOpen]   = useState(false)
  const [params, setParams] = useState<FsrsParams>({ ...ALGO_DEFAULTS })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setParams({ ...ALGO_DEFAULTS, ...JSON.parse(raw) })
    } catch { /* */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)) } catch { /* */ }
  }, [params])

  function set<K extends keyof FsrsParams>(k: K, v: FsrsParams[K]) {
    setParams(prev => ({ ...prev, [k]: v }))
  }

  const goodSim = useMemo(() => simulate('good', params), [params])
  const reviewsToCap = goodSim.filter(r => r.interval < (params.maxIntervalDays ?? ALGO_DEFAULTS.maxIntervalDays)).length + 1

  async function applyToAllDecks() {
    setSaving(true)
    await Promise.all(deckIds.map(id =>
      fetch(`/api/srs/decks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fsrsParams: params }),
      })
    ))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const p = params
  const initEF     = p.initEF         ?? ALGO_DEFAULTS.initEF
  const efDecay    = p.efDecay        ?? ALGO_DEFAULTS.efDecay
  const efHardLoss = p.efHardLoss     ?? ALGO_DEFAULTS.efHardLoss
  const efEasyGain = p.efEasyGain     ?? ALGO_DEFAULTS.efEasyGain
  const efMin      = p.efMin          ?? ALGO_DEFAULTS.efMin
  const efMax      = p.efMax          ?? ALGO_DEFAULTS.efMax
  const maxDays    = p.maxIntervalDays ?? ALGO_DEFAULTS.maxIntervalDays

  return (
    <div className="mt-8">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-500
          hover:text-gray-700 transition-colors"
      >
        <span className="text-base">{open ? '▾' : '▸'}</span>
        <span>⚙ Algorithm Settings</span>
        {!open && (
          <span className="text-xs font-normal text-gray-400 ml-1">
            EF {initEF.toFixed(2)} · decay {efDecay.toFixed(2)} · cap {maxDays}d
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl bg-slate-900 text-white overflow-hidden shadow-xl">

          {/* Stats strip */}
          <div className="flex divide-x divide-slate-700 border-b border-slate-700">
            {[
              { label: 'First Good interval',  value: '3d',                       sub: 'fixed for new cards' },
              { label: 'Reviews to cap',        value: `~${reviewsToCap}`,        sub: `all Good → ${maxDays}d` },
              { label: 'Starting EF',           value: initEF.toFixed(2),         sub: 'growth multiplier' },
              { label: 'EF at review 12',       value: Math.max(efMin, initEF - efDecay * 11).toFixed(2), sub: 'after 11 decays' },
            ].map(s => (
              <div key={s.label} className="flex-1 px-4 py-3 text-center">
                <div className="text-lg font-bold text-emerald-400 leading-none">{s.value}</div>
                <div className="text-[10px] text-slate-400 mt-1 leading-tight">{s.label}</div>
                <div className="text-[9px] text-slate-600">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="px-4 pt-3 pb-1">
            <p className="text-[10px] text-slate-500 mb-2 font-mono">
              SIMULATED INTERVAL GROWTH · all-correct reviews, starting from a new card
            </p>
            <IntervalChart params={params} />
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-6 py-5">

            <Slider
              label="Starting Ease Factor"
              hint="Interval multiplier on the first review. Higher = intervals grow faster early."
              value={initEF} min={1.30} max={2.50} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => set('initEF', v)}
              accent="text-emerald-400"
            />

            <Slider
              label="EF Decay (per Good)"
              hint="How much the multiplier shrinks after each Good review. Higher = growth slows faster."
              value={efDecay} min={0.01} max={0.10} step={0.01}
              format={v => v.toFixed(2)}
              onChange={v => set('efDecay', v)}
              accent="text-sky-400"
            />

            <Slider
              label="Hard Penalty"
              hint="EF reduction when you press Hard. Higher = Hard reviews slow future growth more."
              value={efHardLoss} min={0.05} max={0.35} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => set('efHardLoss', v)}
              accent="text-amber-400"
            />

            <Slider
              label="Easy Bonus"
              hint="EF increase when you press Easy. Higher = Easy reviews accelerate future growth more."
              value={efEasyGain} min={0.05} max={0.30} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => set('efEasyGain', v)}
              accent="text-violet-400"
            />

            <Slider
              label="EF Floor"
              hint="Minimum ease factor. Prevents intervals from stalling even on difficult cards."
              value={efMin} min={1.10} max={1.60} step={0.05}
              format={v => v.toFixed(2)}
              onChange={v => set('efMin', Math.min(v, efMax - 0.10))}
              accent="text-rose-400"
            />

            <Slider
              label="Max Interval (days)"
              hint="Hard ceiling on any card interval. The year cap (365) keeps cards from being forgotten."
              value={maxDays} min={30} max={730} step={5}
              format={v => `${v}d`}
              onChange={v => set('maxIntervalDays', v)}
              accent="text-orange-400"
            />

          </div>

          {/* Presets */}
          <div className="px-6 pb-4">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide font-semibold">Presets</p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map(pr => (
                <button key={pr.name}
                  onClick={() => setParams({ ...ALGO_DEFAULTS, ...pr.p })}
                  className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-700
                    hover:bg-slate-600 text-slate-200 transition-colors">
                  {pr.name}
                </button>
              ))}
              <button
                onClick={() => setParams({ ...ALGO_DEFAULTS })}
                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-slate-700
                  hover:bg-slate-600 text-slate-400 transition-colors">
                Reset to defaults
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 px-6 pb-5">
            <button
              onClick={applyToAllDecks}
              disabled={saving || deckIds.length === 0}
              className="flex-1 py-2 text-sm font-bold rounded-xl bg-indigo-600
                hover:bg-indigo-700 disabled:opacity-50 transition-colors text-white"
            >
              {saving ? 'Saving…' : saved ? '✓ Applied!' : `Apply to all decks (${deckIds.length})`}
            </button>
          </div>

          <div className="px-6 pb-4 text-[10px] text-slate-600 leading-relaxed">
            Saved to your browser automatically. "Apply to all decks" writes to the database so scheduling
            uses these values. New decks use defaults until applied.
          </div>
        </div>
      )}
    </div>
  )
}
