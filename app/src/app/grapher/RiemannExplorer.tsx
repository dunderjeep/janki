'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Loading chart…
    </div>
  ),
})

// ── Non-trivial zeros of ζ(s) — imaginary parts γₙ ───────────────────────────
// These are the "notes" that together play the primes into existence.
const ZEROS = [
   14.135,  21.022,  25.011,  30.424,  32.935,  37.586,  40.919,  43.327,
   48.005,  49.774,  52.970,  56.446,  59.347,  60.832,  65.113,  67.080,
   69.547,  72.067,  75.705,  77.145,  79.337,  82.910,  84.735,  87.425,
   88.810,  92.491,  94.651,  95.870,  98.831, 101.318,
  103.726, 105.447, 107.169, 111.030, 111.875, 114.320, 116.227, 118.791,
  121.370, 122.947, 124.257, 127.517, 129.579, 131.088, 133.498, 134.757,
  138.116, 139.736, 141.124, 143.112,
]

// ── Prime powers up to 110 with their Λ(n) = log(p) values ───────────────────
// ψ(x) = Σ_{p^k ≤ x} log(p)   (Chebyshev psi function)
const PRIME_POWERS: { val: number; logP: number }[] = (() => {
  const primes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,
                  101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199]
  const list: { val: number; logP: number }[] = []
  for (const p of primes) {
    let pk = p
    while (pk <= 210) {
      list.push({ val: pk, logP: Math.log(p) })
      pk *= p
    }
  }
  list.sort((a, b) => a.val - b.val)
  return list
})()

// ── True ψ(x) step function ───────────────────────────────────────────────────
function truePsi(x: number): number {
  let sum = 0
  for (const { val, logP } of PRIME_POWERS) {
    if (val > x) break
    sum += logP
  }
  return sum
}

// ── Contribution of one zero pair (±γ) to ψ(x) ───────────────────────────────
// 2 Re(x^ρ / ρ) where ρ = ½ + iγ
// = 2√x · [½·cos(γ·ln x) + γ·sin(γ·ln x)] / (¼ + γ²)
function zeroPairTerm(gamma: number, x: number): number {
  if (x <= 1) return 0
  const lx    = Math.log(x)
  const sqrtX = Math.sqrt(x)
  const denom = 0.25 + gamma * gamma
  return 2 * sqrtX * (0.5 * Math.cos(gamma * lx) + gamma * Math.sin(gamma * lx)) / denom
}

// ── Explicit formula approximation ────────────────────────────────────────────
// ψ_N(x) ≈ x − Σ_{n=1}^{N} 2Re(x^ρₙ/ρₙ) − log(2π)
function approxPsi(x: number, numZeros: number): number {
  if (x <= 1) return 0
  let val = x - Math.log(2 * Math.PI)
  for (let i = 0; i < numZeros && i < ZEROS.length; i++) {
    val -= zeroPairTerm(ZEROS[i], x)
  }
  return val
}

// ── Linspace ──────────────────────────────────────────────────────────────────
function linspace(a: number, b: number, n: number): number[] {
  const step = (b - a) / (n - 1)
  return Array.from({ length: n }, (_, i) => a + i * step)
}

// ── Colour palette (indigo/rose/emerald/amber) ────────────────────────────────
const ZERO_COLORS = [
  '#6366f1','#f43f5e','#10b981','#f59e0b','#8b5cf6','#06b6d4',
  '#ec4899','#84cc16','#f97316','#14b8a6','#a855f7','#0ea5e9',
]

// ─────────────────────────────────────────────────────────────────────────────

export function RiemannExplorer() {
  const [numZeros, setNumZeros] = useState(0)
  const [xMax,     setXMax]     = useState(50)
  const [showWaves, setShowWaves] = useState(false)
  const [showTrue,  setShowTrue]  = useState(true)
  const [animating, setAnimating] = useState(false)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Animation ──────────────────────────────────────────────────────────────
  function startAnimate() {
    if (numZeros >= ZEROS.length) setNumZeros(0)
    setAnimating(true)
  }
  useEffect(() => {
    if (!animating) { if (animRef.current) clearInterval(animRef.current); return }
    animRef.current = setInterval(() => {
      setNumZeros(n => {
        if (n >= ZEROS.length) { setAnimating(false); return n }
        return n + 1
      })
    }, 600)
    return () => { if (animRef.current) clearInterval(animRef.current) }
  }, [animating])

  // ── Plot data ──────────────────────────────────────────────────────────────
  const { traces, annotation } = useMemo(() => {
    const xs = linspace(1.5, xMax, 800)

    // True ψ(x) step function — sampled densely so steps render sharply
    const trueY = xs.map(x => truePsi(x))

    // Approximation
    const approxY = xs.map(x => approxPsi(x, numZeros))

    // Individual zero wave contributions (−2Re(x^ρ/ρ)) — one per zero added
    const waveTraces = showWaves
      ? ZEROS.slice(0, numZeros).map((gamma, i) => ({
          x: xs,
          y: xs.map(x => -zeroPairTerm(gamma, x)),
          type: 'scatter' as const,
          mode: 'lines' as const,
          name: `γ${i + 1} = ${gamma.toFixed(3)}`,
          line: { color: ZERO_COLORS[i % ZERO_COLORS.length], width: 1, dash: 'dot' as const },
          opacity: 0.5,
        }))
      : []

    const traces = [
      ...(showTrue ? [{
        x: xs, y: trueY,
        type: 'scatter' as const, mode: 'lines' as const,
        name: 'True ψ(x)',
        line: { color: '#3b82f6', width: 1.5, dash: 'dash' as const },
      }] : []),
      ...waveTraces,
      {
        x: xs, y: approxY,
        type: 'scatter' as const, mode: 'lines' as const,
        name: numZeros === 0 ? 'ψ₀(x) = x − log(2π)' : `ψ(x) ≈ x − Σ${numZeros} zeros`,
        line: { color: '#ef4444', width: 2.5 },
      },
    ]

    // Annotation: how far off is the approximation at x = xMax?
    const trueAtMax  = truePsi(xMax)
    const approxAtMax = approxPsi(xMax, numZeros)
    const err = Math.abs(trueAtMax - approxAtMax).toFixed(2)

    return { traces, annotation: { err, trueAtMax: trueAtMax.toFixed(2), approxAtMax: approxAtMax.toFixed(2) } }
  }, [numZeros, xMax, showWaves, showTrue])

  // ── Prime markers (vertical lines via shapes) ──────────────────────────────
  const primeShapes = useMemo(() => {
    const primes = PRIME_POWERS.filter(pp => {
      // only true primes (not prime powers), up to xMax
      if (pp.val > xMax) return false
      return Number.isInteger(Math.log(pp.val) / pp.logP) && Math.abs(Math.round(Math.log(pp.val) / pp.logP) - 1) < 0.001
    })
    return primes.map(pp => ({
      type: 'line' as const,
      x0: pp.val, x1: pp.val, y0: 0, y1: 1,
      xref: 'x' as const, yref: 'paper' as const,
      line: { color: 'rgba(99,102,241,0.15)', width: 1 },
    }))
  }, [xMax])

  const layout = {
    autosize: true,
    margin: { l: 55, r: 20, t: 30, b: 50 },
    paper_bgcolor: 'white',
    plot_bgcolor: '#f9fafb',
    font: { size: 12, color: '#374151' },
    legend: { x: 0, y: 1, xanchor: 'left', yanchor: 'top', bgcolor: 'rgba(255,255,255,0.85)', bordercolor: '#e5e7eb', borderwidth: 1 },
    xaxis: { title: 'x', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af', range: [1.5, xMax] },
    yaxis: { title: 'ψ(x)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
    shapes: primeShapes,
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Controls panel ─────────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto p-4 gap-4">

        {/* Zeros slider */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span className="font-semibold">Zeros added (N)</span>
            <span className="font-mono font-bold text-indigo-600">{numZeros}</span>
          </div>
          <input
            type="range" min={0} max={ZEROS.length} step={1}
            value={numZeros}
            onChange={e => { setAnimating(false); setNumZeros(+e.target.value) }}
            className="w-full accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0 (just x)</span><span>50 zeros</span>
          </div>
        </div>

        {/* Current zero info */}
        {numZeros > 0 && numZeros <= ZEROS.length && (
          <div className="bg-indigo-50 rounded-lg p-2.5 text-xs">
            <p className="font-semibold text-indigo-700 mb-1">
              Latest zero added
            </p>
            <p className="font-mono text-indigo-600">
              ρ = ½ + i · {ZEROS[numZeros - 1].toFixed(3)}
            </p>
            <p className="text-gray-500 mt-1">
              Zero #{numZeros} of ζ(s)
            </p>
          </div>
        )}

        {/* x range */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span className="font-semibold">x range (0 → {xMax})</span>
          </div>
          <input
            type="range" min={20} max={100} step={5}
            value={xMax}
            onChange={e => setXMax(+e.target.value)}
            className="w-full accent-indigo-600"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>20</span><span>100</span>
          </div>
        </div>

        {/* Animate button */}
        <button
          onClick={() => animating ? setAnimating(false) : startAnimate()}
          className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${
            animating
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {animating ? '⏹ Stop' : '▶ Animate zeros'}
        </button>

        {/* Toggles */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox" checked={showTrue}
              onChange={e => setShowTrue(e.target.checked)}
              className="accent-blue-500"
            />
            Show true ψ(x)
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox" checked={showWaves}
              onChange={e => setShowWaves(e.target.checked)}
              className="accent-indigo-500"
            />
            Show individual wave contributions
          </label>
        </div>

        {/* Error readout */}
        <div className="bg-gray-50 rounded-lg p-2.5 text-xs space-y-1 border border-gray-200">
          <p className="font-semibold text-gray-600">At x = {xMax}</p>
          <p className="text-gray-500">True ψ(x):  <span className="font-mono text-blue-600">{annotation.trueAtMax}</span></p>
          <p className="text-gray-500">Approx:     <span className="font-mono text-red-500">{annotation.approxAtMax}</span></p>
          <p className="text-gray-500">|Error|:    <span className={`font-mono font-bold ${+annotation.err < 5 ? 'text-emerald-600' : 'text-orange-500'}`}>{annotation.err}</span></p>
        </div>

        {/* Legend note */}
        <div className="text-[10px] text-gray-400 leading-relaxed border-t pt-3">
          <p className="font-medium text-gray-500 mb-1">What to watch for:</p>
          <p>With 0 zeros, the red line is just <em>x</em>. As you add zeros, oscillations appear. Around N=15–20, the curve starts to "staircase" — rising sharply near primes 2, 3, 5, 7, 11… The pale vertical lines mark prime positions.</p>
        </div>
      </div>

      {/* ── Chart area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">
            Riemann Explicit Formula — Primes from Zeros
          </h2>
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            ψ(x) = x − Σ<sub>ρ</sub> x<sup>ρ</sup>/ρ − log(2π)
          </p>
        </div>
        <div className="flex-1 p-2">
          <Plot
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data={traces as any[]}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            layout={layout as any}
            config={{ responsive: true, displayModeBar: true, displaylogo: false }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        </div>
      </div>
    </div>
  )
}
