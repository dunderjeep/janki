'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { evaluate } from 'mathjs'
import { FORMULAS, Formula, FormulaResult } from '@/data/formulas'
import PlotView from './PlotView'
import { BayesExplorer } from './BayesExplorer'
import { BayesLab } from './BayesLab'
import { RiemannExplorer } from './RiemannExplorer'
import { FourierExplorer } from './FourierExplorer'

type Tab = 'probability' | 'calculus' | 'trig' | 'physics' | 'number' | 'bayes' | 'bayeslab' | 'riemann' | 'fourier' | 'custom'

const TAB_META: { id: Tab; icon: string; label: string }[] = [
  { id: 'probability', icon: '📊', label: 'Prob'   },
  { id: 'calculus',    icon: '∫',  label: 'Calc'   },
  { id: 'trig',        icon: '〜', label: 'Trig'   },
  { id: 'physics',     icon: '⚛', label: 'Phys'   },
  { id: 'number',      icon: 'ζ',  label: 'Number' },
  { id: 'bayes',       icon: '⊆',  label: 'Bayes'  },
  { id: 'bayeslab',    icon: '∝',  label: 'Lab'    },
  { id: 'riemann',     icon: '🎵', label: 'Primes' },
  { id: 'fourier',     icon: '〰', label: 'Fourier' },
]

const FORMULA_TAB_IDS = new Set<Tab>(['probability', 'calculus', 'trig', 'physics', 'number'])
const FULL_PANEL_TABS = new Set<Tab>(['bayes', 'bayeslab', 'riemann', 'fourier'])

// ── linspace (local copy for custom evaluation) ───────────────────────────────

function linspace(a: number, b: number, n: number): number[] {
  const step = (b - a) / (n - 1)
  return Array.from({ length: n }, (_, i) => a + i * step)
}

// ── Custom formula evaluation ─────────────────────────────────────────────────

function evaluateCustom2D(
  expr: string,
  xMin: number,
  xMax: number,
): FormulaResult | { error: string } {
  try {
    const xs = linspace(xMin, xMax, 500)
    const ys = xs.map(xi => {
      try {
        const v = evaluate(expr, { x: xi })
        return typeof v === 'number' && isFinite(v) ? v : null
      } catch {
        return null
      }
    })
    return {
      traces: [{ x: xs, y: ys, type: 'scatter', mode: 'lines', name: expr, line: { color: '#6366f1', width: 2 } }],
      xLabel: 'x',
      yLabel: 'y',
    }
  } catch (e: unknown) {
    return { error: String(e) }
  }
}

function evaluateCustom3D(
  expr: string,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): FormulaResult | { error: string } {
  try {
    const xs = linspace(xMin, xMax, 50)
    const ys = linspace(yMin, yMax, 50)
    const z = ys.map(yi =>
      xs.map(xi => {
        try {
          const v = evaluate(expr, { x: xi, y: yi })
          return typeof v === 'number' && isFinite(v) ? v : 0
        } catch {
          return 0
        }
      })
    )
    return {
      traces: [{ x: xs, y: ys, z, type: 'surface', colorscale: 'Viridis', showscale: false }],
      xLabel: 'x',
      yLabel: 'y',
      zLabel: 'z',
    }
  } catch (e: unknown) {
    return { error: String(e) }
  }
}

// ── Grapher ───────────────────────────────────────────────────────────────────

export default function Grapher() {
  const [tab, setTab] = useState<Tab>('probability')
  const [selectedId, setSelectedId] = useState<string | null>('normal-dist')
  const [params, setParams] = useState<Record<string, number>>({})

  // custom state
  const [customExpr, setCustomExpr] = useState('sin(x) * exp(-x^2 / 4)')
  const [customMode, setCustomMode] = useState<'2d' | '3d'>('2d')
  const [customXMin, setCustomXMin] = useState(-6)
  const [customXMax, setCustomXMax] = useState(6)
  const [customYMin, setCustomYMin] = useState(-6)
  const [customYMax, setCustomYMax] = useState(6)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customResult, setCustomResult] = useState<FormulaResult | null>(null)

  // ── helpers ───────────────────────────────────────────────────────────────

  const handleSelectFormula = useCallback((f: Formula) => {
    setSelectedId(f.id)
    const initialParams: Record<string, number> = {}
    f.params.forEach(p => { initialParams[p.key] = p.default })
    setParams(initialParams)
  }, [])

  const handleTabChange = useCallback((t: Tab) => {
    setTab(t)
    if (FORMULA_TAB_IDS.has(t)) {
      const first = FORMULAS.find(f => f.category === t)
      if (first) {
        const initialParams: Record<string, number> = {}
        first.params.forEach(p => { initialParams[p.key] = p.default })
        setSelectedId(first.id)
        setParams(initialParams)
      }
    }
  }, [])

  const handlePlotCustom = useCallback(() => {
    setCustomError(null)
    const result =
      customMode === '2d'
        ? evaluateCustom2D(customExpr, customXMin, customXMax)
        : evaluateCustom3D(customExpr, customXMin, customXMax, customYMin, customYMax)
    if ('error' in result) {
      setCustomError(result.error)
      setCustomResult(null)
    } else {
      setCustomResult(result)
    }
  }, [customExpr, customMode, customXMin, customXMax, customYMin, customYMax])

  // Initialise default formula on mount
  useEffect(() => {
    const defaultFormula = FORMULAS.find(f => f.id === 'normal-dist')
    if (defaultFormula) handleSelectFormula(defaultFormula)
  }, [handleSelectFormula])

  // Auto-plot custom when switching to custom tab
  useEffect(() => {
    if (!FORMULA_TAB_IDS.has(tab) && !FULL_PANEL_TABS.has(tab) && customResult === null) handlePlotCustom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── derived state ─────────────────────────────────────────────────────────

  const currentFormula = FORMULAS.find(f => f.id === selectedId) ?? null

  const plotResult: FormulaResult | null = useMemo(() => {
    if (tab === 'custom') return customResult
    if (!currentFormula) return null
    try {
      return currentFormula.generate(params)
    } catch {
      return null
    }
  }, [tab, currentFormula, params, customResult])

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden bg-white">

        {/* Tab bar — formula tabs row */}
        <div className="flex border-b border-gray-100 text-xs font-medium">
          {TAB_META.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex-1 py-2 flex flex-col items-center gap-0.5 transition-colors ${
                tab === id
                  ? 'bg-indigo-50 text-indigo-600 border-b-2 border-indigo-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="text-[10px]">{label}</span>
            </button>
          ))}
        </div>
        {/* Custom tab — full-width below */}
        <button
          onClick={() => setTab('custom')}
          className={`w-full py-1.5 text-xs font-medium border-b transition-colors ${
            tab === 'custom'
              ? 'bg-indigo-50 text-indigo-600 border-indigo-300'
              : 'text-gray-400 hover:text-gray-600 border-gray-100'
          }`}
        >
          ✏️ Custom Formula
        </button>

        {/* Scrollable formula list or custom panel */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'bayes' ? (
            <div className="p-3 text-xs text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700">Interactive Bayesian Explorer</p>
              <p>Three conjugate models with live parameter sliders, simulation, and 3D posterior surface:</p>
              <ul className="space-y-1 list-disc list-inside text-gray-500">
                <li><span className="font-medium text-gray-700">Beta-Binomial</span> — coin flips, A/B tests</li>
                <li><span className="font-medium text-gray-700">Normal-Normal</span> — estimating a mean</li>
                <li><span className="font-medium text-gray-700">Gamma-Poisson</span> — count/rate data</li>
              </ul>
              <p className="text-[10px] text-indigo-600 mt-2">All controls are in the explorer panel →</p>
            </div>
          ) : tab === 'bayeslab' ? (
            <div className="p-3 text-xs text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700">Bayes Formula Lab</p>
              <p>Pick any prior and likelihood distribution and watch them multiply into the posterior numerically.</p>
              <ul className="space-y-1 list-disc list-inside text-gray-500">
                <li>Normal, Beta, Gamma, Uniform</li>
                <li>Live sparklines for each term</li>
                <li>Posterior mean, mode, 95% CI</li>
              </ul>
              <p className="text-[10px] text-indigo-600 mt-2">All controls are in the lab panel →</p>
            </div>
          ) : tab === 'fourier' ? (
            <div className="p-3 text-xs text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700">Fourier Winding Machine</p>
              <p>A composite signal gets <em>wound</em> around the origin at a chosen frequency:</p>
              <p className="font-mono bg-gray-50 rounded px-2 py-1 text-[10px]">F(f) = ∫ g(t) · e^(−i2πft) dt</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>When f misses all components, mass cancels → center near origin</li>
                <li>When f hits a component, mass piles up → center of mass shoots out</li>
                <li>Sweep across all f → the spectrum emerges</li>
              </ul>
              <p className="text-[10px] text-indigo-600 mt-2">Drag the winding frequency or hit Sweep →</p>
            </div>
          ) : tab === 'riemann' ? (
            <div className="p-3 text-xs text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700">Music of the Primes</p>
              <p>Riemann&apos;s explicit formula encodes the primes inside the zeros of ζ(s):</p>
              <p className="font-mono bg-gray-50 rounded px-2 py-1 text-[10px]">ψ(x) = x − Σ x^ρ/ρ − log(2π)</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Each zero ρ = ½ + iγ contributes one oscillating wave</li>
                <li>The waves destructively cancel everywhere <em>except</em> near primes</li>
                <li>Add more zeros → the staircase sharpens</li>
                <li>The blue dashed line is the true ψ(x) for reference</li>
              </ul>
              <p className="text-[10px] text-indigo-600 mt-2">Use the slider or Animate button in the panel →</p>
            </div>
          ) : FORMULA_TAB_IDS.has(tab) ? (
            <div className="p-2 space-y-1">
              {FORMULAS.filter(f => f.category === tab).map(f => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFormula(f)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedId === f.id
                      ? 'bg-indigo-50 border border-indigo-200 text-indigo-700'
                      : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="font-medium text-xs">{f.name}</div>
                  <div className="text-[11px] opacity-60 mt-0.5">
                    {f.mode === '3d' ? '3D · ' : '2D · '}{f.formulaText.slice(0, 45)}…
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* Custom formula panel */
            <div className="p-4 space-y-4">

              {/* 2D / 3D toggle */}
              <div className="flex gap-2">
                {(['2d', '3d'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setCustomMode(m)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      customMode === m
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {m.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Expression input */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {customMode === '2d' ? 'f(x) =' : 'f(x,y) ='}
                </label>
                <input
                  value={customExpr}
                  onChange={e => setCustomExpr(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handlePlotCustom() }}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-indigo-400"
                  placeholder={customMode === '2d' ? 'sin(x) * exp(-x^2/4)' : 'sin(x) * cos(y)'}
                />
                {customError && <p className="text-xs text-red-500 mt-1">{customError}</p>}
              </div>

              {/* Range inputs */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-gray-500">x min</label>
                  <input
                    type="number"
                    value={customXMin}
                    onChange={e => setCustomXMin(+e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-500">x max</label>
                  <input
                    type="number"
                    value={customXMax}
                    onChange={e => setCustomXMax(+e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm"
                  />
                </div>
                {customMode === '3d' && (
                  <>
                    <div>
                      <label className="text-gray-500">y min</label>
                      <input
                        type="number"
                        value={customYMin}
                        onChange={e => setCustomYMin(+e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-gray-500">y max</label>
                      <input
                        type="number"
                        value={customYMax}
                        onChange={e => setCustomYMax(+e.target.value)}
                        className="w-full mt-0.5 px-2 py-1 border border-gray-200 rounded text-sm"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Plot button */}
              <button
                onClick={handlePlotCustom}
                className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Plot
              </button>

              {/* Syntax hint */}
              <div className="text-xs text-gray-400 space-y-0.5">
                <p className="font-medium text-gray-500">mathjs syntax:</p>
                <p>sin, cos, tan, exp, log, sqrt</p>
                <p>pi, e, abs, floor, ceil</p>
                <p>^ for powers, * required</p>
              </div>
            </div>
          )}
        </div>

        {/* Parameter sliders */}
        {FORMULA_TAB_IDS.has(tab) && currentFormula && currentFormula.params.length > 0 && (
          <div className="border-t border-gray-200 p-3 space-y-3 bg-gray-50 overflow-y-auto max-h-64">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parameters</p>
            {currentFormula.params.map(p => (
              <div key={p.key}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{p.label}</span>
                  <span className="font-mono font-medium">
                    {(params[p.key] ?? p.default).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={params[p.key] ?? p.default}
                  onChange={e => setParams(prev => ({ ...prev, [p.key]: +e.target.value }))}
                  className="w-full accent-indigo-600"
                />
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* ── Main chart area ───────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden">

        {/* Full-panel tabs take over the entire main area */}
        {tab === 'bayes' ? (
          <BayesExplorer />
        ) : tab === 'bayeslab' ? (
          <BayesLab />
        ) : tab === 'riemann' ? (
          <RiemannExplorer />
        ) : tab === 'fourier' ? (
          <FourierExplorer />
        ) : (
          <>
        {/* Formula info header */}
        {FORMULA_TAB_IDS.has(tab) && currentFormula ? (
          <div className="px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-gray-900 text-sm">{currentFormula.name}</h2>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  currentFormula.mode === '3d'
                    ? 'bg-violet-100 text-violet-600'
                    : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                {currentFormula.mode.toUpperCase()}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
                {currentFormula.category}
              </span>
            </div>
            <p className="text-xs font-mono text-gray-500 mt-1">{currentFormula.formulaText}</p>
          </div>
        ) : tab === 'custom' ? (
          <div className="px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
            <h2 className="font-semibold text-gray-900 text-sm">Custom Formula</h2>
            <p className="text-xs font-mono text-gray-500 mt-1">{customExpr}</p>
          </div>
        ) : null}

        {/* Plot area */}
        <div className="flex-1 p-2">
          {plotResult ? (
            <PlotView
              result={plotResult}
              mode={!FORMULA_TAB_IDS.has(tab) ? customMode : (currentFormula?.mode ?? '2d')}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <div className="text-4xl mb-3">📈</div>
                <p className="text-sm">Select a formula to get started</p>
              </div>
            </div>
          )}
        </div>
          </>
        )}
      </main>
    </div>
  )
}
