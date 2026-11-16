'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

// ─── Math helpers ──────────────────────────────────────────────────────────────

function lnGamma(z: number): number {
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  let x = C[0], zz = z - 1
  for (let i = 1; i < 9; i++) x += C[i] / (zz + i)
  const t = zz + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x)
}

function lnBeta(a: number, b: number) { return lnGamma(a) + lnGamma(b) - lnGamma(a + b) }

function betaPDF(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1 || a <= 0 || b <= 0) return 0
  const v = Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnBeta(a, b))
  return isFinite(v) ? v : 0
}

function normalPDF(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return 0
  return Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI))
}

function gammaPDF(x: number, alpha: number, rate: number): number {
  if (x <= 0 || alpha <= 0 || rate <= 0) return 0
  const v = Math.exp(alpha * Math.log(rate) + (alpha - 1) * Math.log(x) - rate * x - lnGamma(alpha))
  return isFinite(v) ? v : 0
}

function uniformPDF(x: number, a: number, b: number): number {
  if (a >= b) return 0
  return x >= a && x <= b ? 1 / (b - a) : 0
}

function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + (b - a) * (i / (n - 1)))
}

/** Trapezoidal integration */
function integrate(ys: number[], dx: number): number {
  let s = 0
  for (let i = 0; i < ys.length - 1; i++) s += (ys[i] + ys[i + 1]) * 0.5 * dx
  return s
}

/** Empirical quantile of a density defined on xs/ys */
function quantile(xs: number[], ys: number[], p: number, dx: number): number {
  const total = integrate(ys, dx)
  if (total <= 0) return xs[0]
  let cum = 0
  for (let i = 0; i < xs.length - 1; i++) {
    cum += (ys[i] + ys[i + 1]) * 0.5 * dx
    if (cum / total >= p) return xs[i]
  }
  return xs[xs.length - 1]
}

// ─── Distribution types ────────────────────────────────────────────────────────

type DistType = 'normal' | 'beta' | 'gamma' | 'uniform'

interface DistParams {
  type: DistType
  // Normal:   p1 = μ,     p2 = σ
  // Beta:     p1 = α,     p2 = β
  // Gamma:    p1 = α,     p2 = rate
  // Uniform:  p1 = a,     p2 = b
  p1: number
  p2: number
}

function evalDist(d: DistParams, x: number): number {
  switch (d.type) {
    case 'normal':  return normalPDF(x, d.p1, d.p2)
    case 'beta':    return betaPDF(x, d.p1, d.p2)
    case 'gamma':   return gammaPDF(x, d.p1, d.p2)
    case 'uniform': return uniformPDF(x, d.p1, d.p2)
  }
}

const DIST_DEFAULTS: Record<DistType, DistParams> = {
  normal:  { type: 'normal',  p1: 0,   p2: 2   },
  beta:    { type: 'beta',    p1: 2,   p2: 5   },
  gamma:   { type: 'gamma',   p1: 3,   p2: 1   },
  uniform: { type: 'uniform', p1: -1,  p2: 1   },
}

const DIST_PARAM_LABELS: Record<DistType, [string, string]> = {
  normal:  ['μ  mean',    'σ  std dev'],
  beta:    ['α  shape',   'β  shape'],
  gamma:   ['α  shape',   'β  rate'],
  uniform: ['a  min',     'b  max'],
}

// [p1_min, p1_max, p1_step, p2_min, p2_max, p2_step]
const DIST_PARAM_CONFIG: Record<DistType, [number, number, number, number, number, number]> = {
  normal:  [-8,  8,  0.1,  0.1, 5,  0.1],
  beta:    [0.5, 15, 0.5,  0.5, 15, 0.5],
  gamma:   [0.5, 10, 0.5,  0.1, 5,  0.1],
  uniform: [-5,  5,  0.1, -5,  5,  0.1],
}

function distLabel(d: DistParams): string {
  switch (d.type) {
    case 'normal':  return `N(${d.p1.toFixed(1)}, ${d.p2.toFixed(1)})`
    case 'beta':    return `Beta(${d.p1.toFixed(1)}, ${d.p2.toFixed(1)})`
    case 'gamma':   return `Gamma(${d.p1.toFixed(1)}, ${d.p2.toFixed(1)})`
    case 'uniform': return `U(${d.p1.toFixed(1)}, ${d.p2.toFixed(1)})`
  }
}

/** Compute a sensible default x-range covering both distributions */
function autoRange(prior: DistParams, lik: DistParams): [number, number] {
  const hasBeta    = prior.type === 'beta'    || lik.type === 'beta'
  const hasGamma   = prior.type === 'gamma'   || lik.type === 'gamma'
  const hasUniform = prior.type === 'uniform' || lik.type === 'uniform'

  if (hasBeta && !hasGamma) return [0, 1]

  if (hasGamma) {
    // Use max of (mean + 4*std) for each gamma component
    const gammaRight = (d: DistParams) =>
      d.type === 'gamma' ? (d.p1 / d.p2) + 4 * Math.sqrt(d.p1) / d.p2 : NaN
    const candidates = [gammaRight(prior), gammaRight(lik)].filter(isFinite)
    const right = candidates.length ? Math.max(...candidates, 4) : 10
    return [0, Math.ceil(right * 1.1)]
  }

  // Normal / uniform: gather all bounds/centres, expand
  const centres: number[] = []
  const spreads: number[] = []

  for (const d of [prior, lik]) {
    if (d.type === 'normal')  { centres.push(d.p1); spreads.push(d.p2 * 4) }
    if (d.type === 'uniform') { centres.push((d.p1 + d.p2) / 2); spreads.push((d.p2 - d.p1) / 2 + 1) }
  }

  if (centres.length === 0) return [-6, 6]
  const mid    = centres.reduce((a, b) => a + b, 0) / centres.length
  const spread = Math.max(...spreads, 2)
  return [mid - spread, mid + spread]
}

// ─── Mini sparkline for the formula display bar ───────────────────────────────

function Sparkline({ ys, color }: { ys: number[]; color: string }) {
  const max = Math.max(...ys, 1e-10)
  const h = 36
  const w = 72
  const pts = ys
    .map((v, i) => `${(i / (ys.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded overflow-hidden">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

// ─── Slider row ───────────────────────────────────────────────────────────────

function SliderRow({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{value.toFixed(2)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full accent-indigo-600"
      />
    </div>
  )
}

// ─── Distribution config card ─────────────────────────────────────────────────

function DistCard({
  title, dot, dist,
  setType, setP1, setP2,
}: {
  title: string
  dot: string
  dist: DistParams
  setType: (t: DistType) => void
  setP1: (v: number) => void
  setP2: (v: number) => void
}) {
  const labels = DIST_PARAM_LABELS[dist.type]
  const cfg    = DIST_PARAM_CONFIG[dist.type]

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <span className="text-base">{dot}</span>
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <span className="ml-auto text-[10px] font-mono text-gray-500">{distLabel(dist)}</span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <select
          value={dist.type}
          onChange={e => setType(e.target.value as DistType)}
          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 bg-white"
        >
          <option value="normal">Normal  —  θ ∈ ℝ</option>
          <option value="beta">Beta  —  θ ∈ (0, 1)</option>
          <option value="gamma">Gamma  —  θ &gt; 0</option>
          <option value="uniform">Uniform  —  θ ∈ [a, b]</option>
        </select>
        <SliderRow
          label={labels[0]} value={dist.p1}
          min={cfg[0]} max={cfg[1]} step={cfg[2]}
          onChange={setP1}
        />
        <SliderRow
          label={labels[1]} value={dist.p2}
          min={cfg[3]} max={cfg[4]} step={cfg[5]}
          onChange={setP2}
        />
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function BayesLab() {
  const [prior, setPrior] = useState<DistParams>({ type: 'normal', p1: 0,   p2: 2   })
  const [lik,   setLik  ] = useState<DistParams>({ type: 'normal', p1: 2,   p2: 1   })
  const [showProduct, setShowProduct] = useState(true)
  const [xMinOverride, setXMinOverride] = useState('')
  const [xMaxOverride, setXMaxOverride] = useState('')

  const N = 500

  // ── numerical computation ──────────────────────────────────────────────────
  const computed = useMemo(() => {
    const [autoLo, autoHi] = autoRange(prior, lik)
    const lo = xMinOverride !== '' ? parseFloat(xMinOverride) : autoLo
    const hi = xMaxOverride !== '' ? parseFloat(xMaxOverride) : autoHi

    if (!isFinite(lo) || !isFinite(hi) || lo >= hi) {
      return null
    }

    const xs  = linspace(lo, hi, N)
    const dx  = (hi - lo) / (N - 1)

    const priorY   = xs.map(x => evalDist(prior, x))
    const likY     = xs.map(x => evalDist(lik,   x))
    const productY = xs.map((_, i) => priorY[i] * likY[i])
    const evidence = integrate(productY, dx)
    const postY    = evidence > 1e-15 ? productY.map(v => v / evidence) : productY.slice()

    // Weighted mean
    const priorNorm  = integrate(priorY, dx)
    const priorMean  = priorNorm  > 0 ? xs.reduce((s, x, i) => s + x * priorY[i]  * dx, 0) / priorNorm  : NaN
    const postNorm   = integrate(postY, dx)
    const postMean   = postNorm   > 0 ? xs.reduce((s, x, i) => s + x * postY[i]   * dx, 0) / postNorm   : NaN

    // Mode
    let modeIdx = 0
    postY.forEach((v, i) => { if (v > postY[modeIdx]) modeIdx = i })
    const postMode = xs[modeIdx]

    // 95% CI
    const ci95Lo = quantile(xs, postY, 0.025, dx)
    const ci95Hi = quantile(xs, postY, 0.975, dx)

    // Scaled likelihood — match peak of prior for visibility
    const priorPeak = Math.max(...priorY, 1e-15)
    const likPeak   = Math.max(...likY,   1e-15)
    const likScale  = priorPeak / likPeak
    const likYScaled = likY.map(v => v * likScale)

    // Scaled product
    const productPeak = Math.max(...productY, 1e-15)
    const productScale = priorPeak / productPeak * 0.85
    const productYScaled = productY.map(v => v * productScale)

    return {
      xs, priorY, likYScaled, productYScaled, postY,
      evidence, priorMean, postMean, postMode, ci95Lo, ci95Hi,
      // raw (unscaled) for sparklines
      likYRaw: likY, productYRaw: productY,
    }
  }, [prior, lik, xMinOverride, xMaxOverride])

  // ── plot traces ────────────────────────────────────────────────────────────
  const traces = useMemo(() => {
    if (!computed) return []
    const { xs, priorY, likYScaled, productYScaled, postY } = computed
    return [
      {
        x: xs, y: priorY,
        name: `Prior P(θ) — ${distLabel(prior)}`,
        type: 'scatter', mode: 'lines',
        line: { color: '#6366f1', width: 2, dash: 'dash' },
      },
      {
        x: xs, y: likYScaled,
        name: `Likelihood P(D|θ) — ${distLabel(lik)} [scaled]`,
        type: 'scatter', mode: 'lines',
        line: { color: '#f59e0b', width: 2, dash: 'dot' },
      },
      ...(showProduct ? [{
        x: xs, y: productYScaled,
        name: 'P(D|θ) × P(θ)  [scaled, unnormalized]',
        type: 'scatter' as const, mode: 'lines' as const,
        line: { color: '#ef4444', width: 1.5, dash: 'dashdot' as const },
      }] : []),
      {
        x: xs, y: postY,
        name: 'Posterior P(θ|D)',
        type: 'scatter', mode: 'lines',
        line: { color: '#10b981', width: 2.5 },
        fill: 'tozeroy',
        fillcolor: 'rgba(16, 185, 129, 0.12)',
      },
    ]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, showProduct])

  // ── helpers ────────────────────────────────────────────────────────────────
  const setPriorType = (t: DistType) => setPrior(DIST_DEFAULTS[t])
  const setLikType   = (t: DistType) => setLik(DIST_DEFAULTS[t])

  const sparkPrior   = computed?.priorY       ?? []
  const sparkLik     = computed?.likYRaw      ?? []
  const sparkProduct = computed?.productYRaw  ?? []
  const sparkPost    = computed?.postY        ?? []

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left control panel ─────────────────────────────────────────────── */}
      <aside className="w-76 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto flex flex-col" style={{ width: '17rem' }}>

        {/* Header */}
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex-shrink-0">
          <p className="text-xs font-bold text-indigo-900 tracking-wide">BAYES FORMULA LAB</p>
          <p className="text-[10px] text-indigo-600 mt-0.5 font-mono">
            P(θ|D) = P(D|θ) × P(θ) / P(D)
          </p>
        </div>

        <div className="p-3 space-y-3 flex-1">

          {/* Prior */}
          <DistCard
            title="Prior  P(θ)"
            dot="🟣"
            dist={prior}
            setType={setPriorType}
            setP1={p1 => setPrior(d => ({ ...d, p1 }))}
            setP2={p2 => setPrior(d => ({ ...d, p2 }))}
          />

          {/* Likelihood */}
          <DistCard
            title="Likelihood  P(D|θ)"
            dot="🟡"
            dist={lik}
            setType={setLikType}
            setP1={p1 => setLik(d => ({ ...d, p1 }))}
            setP2={p2 => setLik(d => ({ ...d, p2 }))}
          />

          {/* Options */}
          <div className="border border-gray-200 rounded-lg px-3 py-2 space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Display</p>
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showProduct}
                onChange={e => setShowProduct(e.target.checked)}
                className="accent-red-500"
              />
              Show unnormalized product
            </label>
          </div>

          {/* θ-axis range override */}
          <div className="border border-gray-200 rounded-lg px-3 py-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">θ axis (auto if blank)</p>
            <div className="flex gap-1.5">
              <input
                type="number"
                placeholder="min"
                value={xMinOverride}
                onChange={e => setXMinOverride(e.target.value)}
                className="w-1/2 px-2 py-1 text-xs border border-gray-200 rounded font-mono"
              />
              <input
                type="number"
                placeholder="max"
                value={xMaxOverride}
                onChange={e => setXMaxOverride(e.target.value)}
                className="w-1/2 px-2 py-1 text-xs border border-gray-200 rounded font-mono"
              />
            </div>
          </div>

          {/* Posterior stats */}
          {computed && (
            <div className="border border-green-200 rounded-lg px-3 py-2 bg-green-50 space-y-1.5">
              <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide">Posterior stats</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-gray-500">Prior mean</span>
                <span className="font-mono text-indigo-700">{computed.priorMean.toFixed(3)}</span>
                <span className="text-gray-500">Post. mean</span>
                <span className="font-mono text-green-700">{computed.postMean.toFixed(3)}</span>
                <span className="text-gray-500">Post. mode</span>
                <span className="font-mono text-green-700">{computed.postMode.toFixed(3)}</span>
                <span className="text-gray-500">Evidence P(D)</span>
                <span className="font-mono text-gray-600">{computed.evidence.toExponential(2)}</span>
                <span className="text-gray-500">95% CI</span>
                <span className="font-mono text-green-700 text-[10px]">
                  [{computed.ci95Lo.toFixed(2)}, {computed.ci95Hi.toFixed(2)}]
                </span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Formula strip with mini sparklines */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-3 text-[11px] overflow-x-auto">

          <div className="flex flex-col items-center gap-0.5">
            <Sparkline ys={sparkLik}     color="#f59e0b" />
            <span className="text-amber-700 font-medium">Likelihood</span>
            <span className="text-gray-400 font-mono text-[9px]">{distLabel(lik)}</span>
          </div>

          <div className="flex flex-col items-center text-lg text-gray-400 self-center pb-4">×</div>

          <div className="flex flex-col items-center gap-0.5">
            <Sparkline ys={sparkPrior}   color="#6366f1" />
            <span className="text-indigo-700 font-medium">Prior</span>
            <span className="text-gray-400 font-mono text-[9px]">{distLabel(prior)}</span>
          </div>

          <div className="text-gray-300 self-center pb-4 text-2xl">─────</div>

          <div className="flex flex-col items-center gap-0.5">
            <Sparkline ys={sparkProduct} color="#ef4444" />
            <span className="text-red-600 font-medium">Product</span>
            <span className="text-gray-400 text-[9px]">(unnormalized)</span>
          </div>

          <div className="flex flex-col items-center text-lg text-gray-400 self-center pb-4">÷ P(D)</div>

          <div className="flex flex-col items-center gap-0.5">
            <Sparkline ys={sparkPost}    color="#10b981" />
            <span className="text-green-700 font-medium">Posterior</span>
            <span className="text-gray-400 font-mono text-[9px]">P(θ|D)</span>
          </div>
        </div>

        {/* Overlay plot */}
        <div className="flex-1 p-3">
          {computed ? (
            <Plot
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data={traces as any}
              layout={{
                paper_bgcolor: '#ffffff',
                plot_bgcolor:  '#f9fafb',
                margin: { l: 55, r: 20, t: 16, b: 45 },
                xaxis: {
                  title: { text: 'θ  (parameter)', font: { size: 11 } },
                  gridcolor: '#e5e7eb',
                  zerolinecolor: '#d1d5db',
                  tickfont: { size: 10 },
                },
                yaxis: {
                  title: { text: 'Density', font: { size: 11 } },
                  gridcolor: '#e5e7eb',
                  zerolinecolor: '#d1d5db',
                  tickfont: { size: 10 },
                },
                legend: {
                  x: 0.98, y: 0.98, xanchor: 'right',
                  bgcolor: 'rgba(255,255,255,0.92)',
                  bordercolor: '#e5e7eb', borderwidth: 1,
                  font: { size: 10 },
                },
                showlegend: true,
                hovermode: 'x unified',
              }}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
              useResizeHandler
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              Invalid axis range — clear the overrides to use auto-range.
            </div>
          )}
        </div>

        {/* Callout row */}
        <div className="flex-shrink-0 grid grid-cols-4 gap-0 border-t border-gray-100 text-[10px] bg-white">
          {[
            {
              title: 'Prior  P(θ)',
              color: 'text-indigo-700 bg-indigo-50',
              body: `Your belief about θ before seeing data. Shape: ${distLabel(prior)}.`,
            },
            {
              title: 'Likelihood  P(D|θ)',
              color: 'text-amber-700 bg-amber-50',
              body: `How probable the data would be at each θ. Shape: ${distLabel(lik)}. Scaled for visibility.`,
            },
            {
              title: 'Evidence  P(D)',
              color: 'text-red-600 bg-red-50',
              body: `∫ P(D|θ) P(θ) dθ ≈ ${computed?.evidence.toExponential(2) ?? '—'}. A constant that normalizes the posterior to area = 1.`,
            },
            {
              title: 'Posterior  P(θ|D)',
              color: 'text-green-700 bg-green-50',
              body: `Updated belief. Mean: ${computed?.postMean.toFixed(3) ?? '—'}. 95% CI: [${computed?.ci95Lo.toFixed(2) ?? '—'}, ${computed?.ci95Hi.toFixed(2) ?? '—'}].`,
            },
          ].map(({ title, color, body }) => (
            <div key={title} className="border-r last:border-r-0 border-gray-100 px-3 py-2">
              <p className={`font-semibold mb-0.5 px-1 rounded text-[9px] w-fit ${color}`}>{title}</p>
              <p className="text-gray-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
