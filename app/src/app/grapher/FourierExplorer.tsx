'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import type { ComponentProps } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
  ),
})

// ── Types ─────────────────────────────────────────────────────────────────────

type Component = { freq: number; amp: number }

// ── Signal presets ─────────────────────────────────────────────────────────────

const PRESETS: { name: string; components: Component[] }[] = [
  { name: 'Single tone (3 Hz)',         components: [{ freq: 3, amp: 1 }] },
  { name: 'Two tones (2 + 5 Hz)',       components: [{ freq: 2, amp: 1 }, { freq: 5, amp: 0.8 }] },
  { name: 'Three tones (1 + 3 + 7 Hz)', components: [{ freq: 1, amp: 1 }, { freq: 3, amp: 0.6 }, { freq: 7, amp: 0.4 }] },
  { name: 'Close pair (4 + 4.5 Hz)',    components: [{ freq: 4, amp: 1 }, { freq: 4.5, amp: 0.9 }] },
  { name: 'Harmonic series (1–4 Hz)',   components: [{ freq: 1, amp: 1 }, { freq: 2, amp: 0.5 }, { freq: 3, amp: 0.33 }, { freq: 4, amp: 0.25 }] },
]

// ── Math helpers ───────────────────────────────────────────────────────────────

function linspace(a: number, b: number, n: number): number[] {
  const step = (b - a) / (n - 1)
  return Array.from({ length: n }, (_, i) => a + i * step)
}

// Evaluate composite signal at time t
function evalSignal(t: number, comps: Component[]): number {
  return comps.reduce((s, c) => s + c.amp * Math.cos(2 * Math.PI * c.freq * t), 0)
}

// Wind signal at winding frequency fWind — returns complex plane points
function windSignal(ts: number[], comps: Component[], fWind: number): { wx: number[]; wy: number[] } {
  const wx: number[] = []
  const wy: number[] = []
  for (const t of ts) {
    const g = evalSignal(t, comps)
    wx.push(g * Math.cos(2 * Math.PI * fWind * t))
    wy.push(-g * Math.sin(2 * Math.PI * fWind * t))
  }
  return { wx, wy }
}

// Center of mass of wound signal
function centerOfMass(wx: number[], wy: number[]): { cx: number; cy: number; mag: number } {
  const n = wx.length
  const cx = wx.reduce((a, v) => a + v, 0) / n
  const cy = wy.reduce((a, v) => a + v, 0) / n
  return { cx, cy, mag: Math.sqrt(cx * cx + cy * cy) }
}

// Full spectrum: |F(f)| for many frequencies
function computeSpectrum(
  ts: number[],
  comps: Component[],
  freqs: number[],
): number[] {
  const signals = ts.map(t => evalSignal(t, comps))
  return freqs.map(f => {
    let re = 0, im = 0
    for (let i = 0; i < ts.length; i++) {
      const angle = 2 * Math.PI * f * ts[i]
      re += signals[i] * Math.cos(angle)
      im -= signals[i] * Math.sin(angle)
    }
    return Math.sqrt(re * re + im * im) / ts.length
  })
}

// ── Component editor ───────────────────────────────────────────────────────────

const COMP_COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b']

function ComponentRow({
  comp, index, onChange, onRemove,
}: {
  comp: Component; index: number; onChange: (c: Component) => void; onRemove: () => void
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5 space-y-2 border border-gray-200">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: COMP_COLORS[index % COMP_COLORS.length] }}>
          Component {index + 1}
        </span>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
          <span>Frequency</span>
          <span className="font-mono font-bold text-indigo-600">{comp.freq.toFixed(1)} Hz</span>
        </div>
        <input
          type="range" min={0.5} max={12} step={0.5}
          value={comp.freq}
          onChange={e => onChange({ ...comp, freq: +e.target.value })}
          className="w-full accent-indigo-600"
          style={{ accentColor: COMP_COLORS[index % COMP_COLORS.length] }}
        />
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
          <span>Amplitude</span>
          <span className="font-mono font-bold" style={{ color: COMP_COLORS[index % COMP_COLORS.length] }}>
            {comp.amp.toFixed(2)}
          </span>
        </div>
        <input
          type="range" min={0.05} max={1.5} step={0.05}
          value={comp.amp}
          onChange={e => onChange({ ...comp, amp: +e.target.value })}
          className="w-full"
          style={{ accentColor: COMP_COLORS[index % COMP_COLORS.length] }}
        />
      </div>
    </div>
  )
}

// ── FourierExplorer ────────────────────────────────────────────────────────────

export function FourierExplorer() {
  const [components, setComponents] = useState<Component[]>(PRESETS[1].components)
  const [windFreq,   setWindFreq]   = useState(2.0)
  const [timeWindow, setTimeWindow] = useState(2)   // seconds
  const [animating,  setAnimating]  = useState(false)
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Animation: sweep winding frequency ──────────────────────────────────────
  const startSweep = useCallback(() => {
    setWindFreq(0.1)
    setAnimating(true)
  }, [])

  useEffect(() => {
    if (!animating) { if (animRef.current) clearInterval(animRef.current); return }
    animRef.current = setInterval(() => {
      setWindFreq(f => {
        const next = +(f + 0.1).toFixed(1)
        if (next > 12) { setAnimating(false); return 12 }
        return next
      })
    }, 60)
    return () => { if (animRef.current) clearInterval(animRef.current) }
  }, [animating])

  // ── Computed data ──────────────────────────────────────────────────────────
  const { timePlot, windPlot, specPlot, com, isNearComponent } = useMemo(() => {
    const T = timeWindow
    const N_TIME = 600
    const ts = linspace(0, T, N_TIME)
    const gs = ts.map(t => evalSignal(t, components))

    // ── Time domain ──
    const timePlot = {
      traces: [
        {
          x: ts, y: gs,
          type: 'scatter' as const, mode: 'lines' as const,
          name: 'g(t)',
          line: { color: '#6366f1', width: 2 },
        },
        // Highlight component sinusoids
        ...components.map((c, i) => ({
          x: ts,
          y: ts.map(t => c.amp * Math.cos(2 * Math.PI * c.freq * t)),
          type: 'scatter' as const, mode: 'lines' as const,
          name: `${c.freq} Hz`,
          line: { color: COMP_COLORS[i % COMP_COLORS.length], width: 1.5, dash: 'dot' as const },
          opacity: 0.6,
        })),
      ],
    }

    // ── Winding ──
    const { wx, wy } = windSignal(ts, components, windFreq)
    const { cx, cy, mag } = centerOfMass(wx, wy)

    // Faint unit circle for reference
    const circleT = linspace(0, 2 * Math.PI, 200)
    const maxAmp = components.reduce((s, c) => s + c.amp, 0)

    const windPlot = {
      cx, cy, mag,
      traces: [
        // Reference circle (radius = max possible amplitude)
        {
          x: circleT.map(a => maxAmp * Math.cos(a)),
          y: circleT.map(a => maxAmp * Math.sin(a)),
          type: 'scatter' as const, mode: 'lines' as const,
          name: '', showlegend: false,
          line: { color: 'rgba(229,231,235,0.6)', width: 1 },
        },
        // Wound signal
        {
          x: wx, y: wy,
          type: 'scatter' as const, mode: 'lines' as const,
          name: `wound @ ${windFreq.toFixed(1)} Hz`,
          line: { color: '#6366f1', width: 1.5 },
          opacity: 0.75,
        },
        // Line from origin to center of mass
        {
          x: [0, cx], y: [0, cy],
          type: 'scatter' as const, mode: 'lines' as const,
          name: '', showlegend: false,
          line: { color: '#ef4444', width: 2.5 },
        },
        // Center of mass dot
        {
          x: [cx], y: [cy],
          type: 'scatter' as const, mode: 'markers+text' as const,
          name: `CoM (|F| = ${mag.toFixed(3)})`,
          marker: { color: '#ef4444', size: 12, symbol: 'circle' },
          text: ['⬤'],
          textposition: 'top right' as const,
        },
        // Origin dot
        {
          x: [0], y: [0],
          type: 'scatter' as const, mode: 'markers' as const,
          name: '', showlegend: false,
          marker: { color: '#9ca3af', size: 6 },
        },
      ],
    }

    // ── Spectrum ──
    const freqs = linspace(0.1, 13, 400)
    const mags  = computeSpectrum(ts, components, freqs)

    // Find expected spike frequencies from components
    const isNearComponent = components.some(c => Math.abs(c.freq - windFreq) < 0.3)

    const specPlot = {
      traces: [
        {
          x: freqs, y: mags,
          type: 'scatter' as const, mode: 'lines' as const,
          name: '|F(f)|',
          line: { color: '#6366f1', width: 2 },
          fill: 'tozeroy' as const,
          fillcolor: 'rgba(99,102,241,0.12)',
        },
        // Winding frequency marker
        {
          x: [windFreq, windFreq],
          y: [0, Math.max(...mags) * 1.1],
          type: 'scatter' as const, mode: 'lines' as const,
          name: `f = ${windFreq.toFixed(1)} Hz`,
          line: { color: '#ef4444', width: 2, dash: 'dash' as const },
        },
      ],
    }

    return { timePlot, windPlot, specPlot, com: { cx, cy, mag }, isNearComponent }
  }, [components, windFreq, timeWindow])

  // ── Layout helpers ─────────────────────────────────────────────────────────
  const baseLayout = {
    autosize: true,
    paper_bgcolor: 'white',
    plot_bgcolor: '#f9fafb',
    font: { size: 11, color: '#374151' },
    legend: { x: 1, xanchor: 'right', y: 1, bgcolor: 'rgba(255,255,255,0.8)', borderwidth: 0, font: { size: 10 } },
    margin: { l: 45, r: 10, t: 20, b: 40 },
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Controls sidebar ──────────────────────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto p-3 gap-3">

        {/* Preset picker */}
        <div>
          <p className="text-xs font-semibold text-gray-600 mb-1.5">Signal preset</p>
          <select
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-400"
            onChange={e => setComponents(PRESETS[+e.target.value].components)}
          >
            {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select>
        </div>

        {/* Component editors */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-600">Components</p>
          {components.map((c, i) => (
            <ComponentRow
              key={i} comp={c} index={i}
              onChange={nc => setComponents(prev => prev.map((x, j) => j === i ? nc : x))}
              onRemove={() => setComponents(prev => prev.filter((_, j) => j !== i))}
            />
          ))}
          {components.length < 4 && (
            <button
              onClick={() => setComponents(prev => [...prev, { freq: 6, amp: 0.5 }])}
              className="w-full py-1.5 text-xs border border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
            >
              + Add component
            </button>
          )}
        </div>

        {/* Winding frequency */}
        <div className="border-t pt-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span className="font-semibold">Winding frequency</span>
            <span className={`font-mono font-bold ${isNearComponent ? 'text-red-500' : 'text-indigo-600'}`}>
              {windFreq.toFixed(1)} Hz {isNearComponent ? '🎯' : ''}
            </span>
          </div>
          <input
            type="range" min={0.1} max={12} step={0.1}
            value={windFreq}
            onChange={e => { setAnimating(false); setWindFreq(+e.target.value) }}
            className="w-full accent-red-500"
          />
          <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
            <span>0 Hz</span><span>12 Hz</span>
          </div>
          {isNearComponent && (
            <p className="text-[10px] text-red-500 mt-1 font-medium animate-pulse">
              ← center of mass pulled outward!
            </p>
          )}
        </div>

        {/* Center of mass readout */}
        <div className="bg-gray-50 rounded-lg p-2.5 text-xs space-y-1 border border-gray-200">
          <p className="font-semibold text-gray-600">Center of mass</p>
          <p className="text-gray-500">x: <span className="font-mono">{com.cx.toFixed(4)}</span></p>
          <p className="text-gray-500">y: <span className="font-mono">{com.cy.toFixed(4)}</span></p>
          <p className="text-gray-500">|F|: <span className={`font-mono font-bold ${com.mag > 0.15 ? 'text-red-500' : 'text-gray-500'}`}>{com.mag.toFixed(4)}</span></p>
        </div>

        {/* Time window */}
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span className="font-semibold">Time window</span>
            <span className="font-mono text-gray-500">{timeWindow}s</span>
          </div>
          <input
            type="range" min={1} max={5} step={0.5}
            value={timeWindow}
            onChange={e => setTimeWindow(+e.target.value)}
            className="w-full accent-indigo-600"
          />
        </div>

        {/* Sweep button */}
        <button
          onClick={() => animating ? setAnimating(false) : startSweep()}
          className={`w-full py-2 text-sm font-medium rounded-lg transition-colors ${
            animating
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {animating ? '⏹ Stop sweep' : '▶ Sweep 0 → 12 Hz'}
        </button>

        {/* Hint */}
        <p className="text-[10px] text-gray-400 leading-relaxed border-t pt-2">
          Drag the winding frequency to a component and watch the center of mass (red dot) shoot out — that distance IS the Fourier coefficient. Sweep the frequency to paint the whole spectrum.
        </p>
      </div>

      {/* ── Three-panel chart area ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">Fourier Transform — The Winding Machine</h2>
          <p className="text-xs font-mono text-gray-500 mt-0.5">
            F(f) = ∫ g(t) · e<sup>−i2πft</sup> dt &nbsp;·&nbsp; |F(f)| = distance of center of mass from origin
          </p>
        </div>

        {/* Top row: time signal + spectrum */}
        <div className="flex border-b border-gray-100" style={{ height: '38%' }}>
          {/* Time domain */}
          <div className="flex-1 border-r border-gray-100 relative">
            <span className="absolute top-1.5 left-3 text-[10px] text-gray-400 font-medium z-10">
              Time domain g(t)
            </span>
            <Plot
              data={timePlot.traces as ComponentProps<typeof Plot>['data']}
              layout={{
                ...baseLayout,
                xaxis: { title: 't (s)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
                yaxis: { title: 'amplitude', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
              } as ComponentProps<typeof Plot>['layout']}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler
            />
          </div>

          {/* Spectrum */}
          <div className="flex-1 relative">
            <span className="absolute top-1.5 left-3 text-[10px] text-gray-400 font-medium z-10">
              Frequency spectrum |F(f)|
            </span>
            <Plot
              data={specPlot.traces as ComponentProps<typeof Plot>['data']}
              layout={{
                ...baseLayout,
                xaxis: { title: 'f (Hz)', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
                yaxis: { title: '|F(f)|', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
              } as ComponentProps<typeof Plot>['layout']}
              config={{ responsive: true, displayModeBar: false }}
              style={{ width: '100%', height: '100%' }}
              useResizeHandler
            />
          </div>
        </div>

        {/* Bottom: winding visualization */}
        <div className="flex-1 relative min-h-0">
          <span className="absolute top-1.5 left-3 text-[10px] text-gray-400 font-medium z-10">
            Wound signal @ {windFreq.toFixed(1)} Hz — red arrow = center of mass = F({windFreq.toFixed(1)})
          </span>
          <Plot
            data={windPlot.traces as ComponentProps<typeof Plot>['data']}
            layout={{
              ...baseLayout,
              margin: { l: 45, r: 10, t: 25, b: 45 },
              xaxis: { title: 'Re', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af', scaleanchor: 'y' as const },
              yaxis: { title: 'Im', gridcolor: '#e5e7eb', zerolinecolor: '#9ca3af' },
            } as ComponentProps<typeof Plot>['layout']}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        </div>
      </div>
    </div>
  )
}
