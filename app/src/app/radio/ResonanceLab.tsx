'use client'

import { useState, useMemo } from 'react'

// ── Physics ───────────────────────────────────────────────────────────────────

/** LC resonant frequency in MHz */
function lcFreq(L_uH: number, C_pF: number): number {
  const L = L_uH * 1e-6
  const C = C_pF * 1e-12
  return 1 / (2 * Math.PI * Math.sqrt(L * C)) / 1e6
}

/** Half-wave dipole length in metres */
function dipoleHalf(f_MHz: number): number { return 142.5 / f_MHz }

/** Quarter-wave vertical */
function verticalQuarter(f_MHz: number): number { return 71.25 / f_MHz }

/** Wavelength in metres */
function wavelength(f_MHz: number): number { return 300 / f_MHz }

/** Reactance of inductor at freq */
function XL(L_uH: number, f_MHz: number): number {
  return 2 * Math.PI * f_MHz * 1e6 * L_uH * 1e-6
}

/** Reactance of capacitor at freq */
function XC(C_pF: number, f_MHz: number): number {
  return 1 / (2 * Math.PI * f_MHz * 1e6 * C_pF * 1e-12)
}

/** Impedance magnitude of series RLC */
function Z(R: number, L_uH: number, C_pF: number, f_MHz: number): number {
  const xl = XL(L_uH, f_MHz)
  const xc = XC(C_pF, f_MHz)
  return Math.sqrt(R * R + (xl - xc) ** 2)
}

// ── Waveform SVG helper ───────────────────────────────────────────────────────

function sinePoints(
  amplitude: number,
  frequency: number,    // relative cycles visible
  phase: number,
  samples = 300,
  viewW = 560, viewH = 80,
): string {
  return Array.from({ length: samples }, (_, i) => {
    const t = i / (samples - 1)
    const x = 4 + t * (viewW - 8)
    const y = viewH / 2 - amplitude * (viewH / 2 - 4) *
              Math.sin(2 * Math.PI * frequency * t + phase)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

// ── Standing wave visualisation ───────────────────────────────────────────────

function StandingWave({ freq, antLen }: { freq: number; antLen: number }) {
  const lambda   = wavelength(freq)
  const ratio    = antLen / lambda   // e.g. 0.5 for half-wave
  const W = 400; const H = 100
  const N = 200

  // Voltage standing wave pattern along antenna
  const vPts = Array.from({ length: N }, (_, i) => {
    const x = 8 + (i / (N - 1)) * (W - 16)
    const pos = (i / (N - 1))  // 0 = feed point, 1 = tip
    const v = Math.cos(2 * Math.PI * ratio * pos)
    const y = H / 2 - v * (H / 2 - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  // Current standing wave (90° offset)
  const iPts = Array.from({ length: N }, (_, i) => {
    const x = 8 + (i / (N - 1)) * (W - 16)
    const pos = (i / (N - 1))
    const c = Math.sin(2 * Math.PI * ratio * pos)
    const y = H / 2 - c * (H / 2 - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const swr = (() => {
    // Simplified SWR for resistive mismatch
    const Zo = 50
    const Ra = ratio > 0.4 && ratio < 0.6 ? 73 : ratio > 0.9 && ratio < 1.1 ? 4800 : 300
    const gamma = Math.abs((Ra - Zo) / (Ra + Zo))
    return gamma < 1 ? ((1 + gamma) / (1 - gamma)).toFixed(1) : '∞'
  })()

  return (
    <div className="space-y-1">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect width={W} height={H} fill="#030712" rx={6} />
        {/* Antenna wire */}
        <line x1={8} y1={H / 2} x2={W - 8} y2={H / 2}
          stroke="#374151" strokeWidth={2} />
        <text x={10} y={H - 4} fontSize={8} fill="#4b5563" fontFamily="monospace">Feed</text>
        <text x={W - 28} y={H - 4} fontSize={8} fill="#4b5563" fontFamily="monospace">Tip</text>
        {/* Voltage */}
        <polyline points={vPts.join(' ')} fill="none" stroke="#60a5fa" strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 0 3px #60a5fa66)' }} />
        {/* Current */}
        <polyline points={iPts.join(' ')} fill="none" stroke="#f87171" strokeWidth={1.5}
          style={{ filter: 'drop-shadow(0 0 3px #f8717166)' }} />
        <text x={W / 2} y={14} textAnchor="middle" fontSize={8} fill="#6b7280"
          fontFamily="monospace">Voltage (blue) · Current (red)</text>
      </svg>
      <div className="flex gap-4 text-[10px] font-mono text-gray-500">
        <span>Antenna: <strong className="text-white">{antLen.toFixed(2)} m</strong></span>
        <span>λ: <strong className="text-white">{lambda.toFixed(2)} m</strong></span>
        <span>Ratio: <strong className="text-white">{(ratio).toFixed(3)}λ</strong></span>
        <span>SWR ≈ <strong className="text-yellow-400">{swr}:1</strong></span>
      </div>
    </div>
  )
}

// ── Resonance curve ───────────────────────────────────────────────────────────

function ResonanceCurve({ L, C, R }: { L: number; C: number; R: number }) {
  const f0    = lcFreq(L, C)
  const fMin  = f0 * 0.5
  const fMax  = f0 * 1.5
  const N     = 300
  const W = 400; const H = 100

  const freqs = Array.from({ length: N }, (_, i) => fMin + (fMax - fMin) * (i / (N - 1)))
  const zVals = freqs.map(f => Z(R, L, C, f))
  const zMax  = Math.max(...zVals)
  const zMin  = Math.min(...zVals)  // at resonance

  // Normalise: high Z = low signal for series resonance (current is max at resonance)
  // We plot 1/Z (current response)
  const iVals = zVals.map(z => 1 / z)
  const iMax  = Math.max(...iVals)

  const pts = freqs.map((f, i) => {
    const x = 8 + ((f - fMin) / (fMax - fMin)) * (W - 16)
    const y = (H - 12) - (iVals[i] / iMax) * (H - 20)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  // Bandwidth (−3 dB points) = f0/Q, Q = (1/R)*sqrt(L/C)
  const Q  = (1 / R) * Math.sqrt((L * 1e-6) / (C * 1e-12))
  const BW = f0 / Q

  return (
    <div className="space-y-1">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full">
        <rect width={W} height={H} fill="#030712" rx={6} />
        {/* Resonance line */}
        <line x1={8 + (W - 16) / 2} y1={4}
              x2={8 + (W - 16) / 2} y2={H - 12}
          stroke="#4b5563" strokeWidth={0.5} strokeDasharray="3 2" />
        {/* Curve */}
        <polyline points={pts.join(' ')} fill="none" stroke="#4ade80" strokeWidth={2}
          style={{ filter: 'drop-shadow(0 0 4px #4ade8066)' }} />
        {/* Labels */}
        <text x={8 + (W - 16) / 2} y={H - 2}
          textAnchor="middle" fontSize={8} fill="#6b7280" fontFamily="monospace">
          f₀ = {f0 < 1 ? `${(f0 * 1000).toFixed(1)} kHz` : `${f0.toFixed(3)} MHz`}
        </text>
        <text x={W - 10} y={14} textAnchor="end" fontSize={7} fill="#6b7280" fontFamily="monospace">
          Current ↑
        </text>
      </svg>
      <div className="flex gap-4 text-[10px] font-mono text-gray-500">
        <span>f₀: <strong className="text-green-400">{f0 < 1 ? `${(f0 * 1000).toFixed(1)} kHz` : `${f0.toFixed(4)} MHz`}</strong></span>
        <span>Q: <strong className="text-white">{Q.toFixed(1)}</strong></span>
        <span>BW: <strong className="text-white">{BW < 1 ? `${(BW * 1000).toFixed(1)} kHz` : `${BW.toFixed(3)} MHz`}</strong></span>
        <span>Z_min: <strong className="text-white">{zMin.toFixed(1)} Ω</strong></span>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ResonanceLab() {
  const [L, setL] = useState(10)       // µH
  const [C, setC] = useState(100)      // pF
  const [R, setR] = useState(10)       // Ω (losses)
  const [antFreq, setAntFreq] = useState(14.2)  // MHz
  const [antLen,  setAntLen]  = useState(dipoleHalf(14.2))
  const [antMode, setAntMode] = useState<'half' | 'quarter' | 'custom'>('half')

  const f0      = lcFreq(L, C)
  const lambda  = wavelength(antFreq)
  const half    = dipoleHalf(antFreq)
  const quarter = verticalQuarter(antFreq)

  // Keep antenna length in sync unless custom
  const displayLen = antMode === 'half' ? half
    : antMode === 'quarter' ? quarter : antLen

  return (
    <div className="flex h-full overflow-hidden bg-gray-950 text-gray-200">

      {/* ── Left: LC tank ──────────────────────────────────────────────── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4 space-y-6">

        <div>
          <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-3">
            LC Tank Circuit
          </h3>
          <p className="text-[10px] text-gray-500 mb-4">
            Resonance occurs when X<sub>L</sub> = X<sub>C</sub> — energy sloshes between the inductor
            (magnetic field) and capacitor (electric field) at f₀ = 1/(2π√LC).
          </p>

          {[
            { label: 'Inductance L', val: L, set: setL, min: 0.1, max: 100, step: 0.1, unit: 'µH', color: 'accent-blue-400' },
            { label: 'Capacitance C', val: C, set: setC, min: 1,   max: 2000, step: 1,   unit: 'pF', color: 'accent-yellow-400' },
            { label: 'Resistance R (loss)', val: R, set: setR, min: 1,   max: 200,  step: 1,   unit: 'Ω',  color: 'accent-red-400' },
          ].map(s => (
            <div key={s.label} className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{s.label}</span>
                <span className="font-mono font-semibold text-white">{s.val} {s.unit}</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.val}
                onChange={e => s.set(+e.target.value)}
                className={`w-full ${s.color}`} />
            </div>
          ))}
        </div>

        {/* Reactance at resonance */}
        <div className="bg-gray-900 rounded-xl p-3 space-y-1.5 text-xs font-mono">
          <p className="text-green-400 font-bold">At resonance (f₀)</p>
          <div className="flex justify-between">
            <span className="text-gray-500">f₀</span>
            <span className="text-green-300 font-semibold">
              {f0 < 1 ? `${(f0 * 1000).toFixed(2)} kHz` : `${f0.toFixed(4)} MHz`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">X<sub>L</sub> = X<sub>C</sub></span>
            <span className="text-white">{XL(L, f0).toFixed(1)} Ω</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">λ</span>
            <span className="text-white">{wavelength(f0).toFixed(1)} m</span>
          </div>
          <div className="text-[9px] text-gray-600 pt-1">
            X<sub>L</sub> = 2πfL · X<sub>C</sub> = 1/(2πfC) · Cancel at f₀
          </div>
        </div>
      </div>

      {/* ── Right: plots ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Resonance curve */}
        <div>
          <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">
            Resonance Curve — Current Response
          </h3>
          <ResonanceCurve L={L} C={C} R={R} />
          <p className="text-[10px] text-gray-600 mt-2">
            Narrower peak = higher Q = more selective. Q = (1/R)·√(L/C). Bandwidth BW = f₀/Q.
          </p>
        </div>

        <hr className="border-gray-800" />

        {/* Antenna calculator */}
        <div>
          <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-3">
            Antenna Length Calculator
          </h3>
          <p className="text-[10px] text-gray-500 mb-4">
            An antenna resonates when its physical length matches the wave — half-wave dipoles
            have voltage nodes at each end, current max at the feed. Length = 142.5/f_MHz (half wave).
          </p>

          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">Operating Frequency</span>
              <span className="font-mono font-semibold text-white">{antFreq.toFixed(3)} MHz</span>
            </div>
            <input type="range" min={1.8} max={450} step={0.001} value={antFreq}
              onChange={e => { setAntFreq(+e.target.value); setAntLen(dipoleHalf(+e.target.value)) }}
              className="w-full accent-green-400" />
          </div>

          {/* Antenna mode tabs */}
          <div className="flex gap-2 mb-4">
            {[
              { id: 'half' as const,    label: 'Half-wave Dipole' },
              { id: 'quarter' as const, label: 'Quarter-wave Vertical' },
              { id: 'custom' as const,  label: 'Custom length' },
            ].map(m => (
              <button key={m.id} onClick={() => setAntMode(m.id)}
                className={`px-2 py-1 text-[10px] rounded font-semibold transition-colors ${
                  antMode === m.id
                    ? 'bg-green-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
                {m.label}
              </button>
            ))}
          </div>

          {antMode === 'custom' && (
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Antenna length</span>
                <span className="font-mono text-white">{antLen.toFixed(2)} m</span>
              </div>
              <input type="range" min={0.1} max={80} step={0.01} value={antLen}
                onChange={e => setAntLen(+e.target.value)}
                className="w-full accent-yellow-400" />
            </div>
          )}

          {/* Quick facts grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[
              { label: 'Wavelength λ',        val: `${lambda.toFixed(2)} m`,         col: 'text-blue-400' },
              { label: 'Half-wave dipole',     val: `${half.toFixed(2)} m`,           col: 'text-green-400' },
              { label: 'Quarter-wave vertical',val: `${quarter.toFixed(2)} m`,        col: 'text-yellow-400' },
              { label: 'Full-wave loop',       val: `${(lambda * 1.02).toFixed(2)} m`,col: 'text-orange-400' },
            ].map(({ label, val, col }) => (
              <div key={label} className="bg-gray-900 rounded-lg px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`font-mono font-bold ${col}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Standing wave */}
          <h4 className="text-xs font-semibold text-gray-400 mb-2">
            Standing Wave Pattern (Voltage & Current)
          </h4>
          <StandingWave freq={antFreq} antLen={displayLen} />
        </div>

        {/* L/C waveform */}
        <div>
          <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest mb-2">
            LC Oscillation — Voltage waveforms
          </h3>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <svg viewBox="0 0 560 80" className="w-full">
              <rect width={560} height={80} fill="#030712" />
              {/* Capacitor voltage (cosine) */}
              <polyline
                points={sinePoints(0.8, 3, 0)}
                fill="none" stroke="#60a5fa" strokeWidth={1.5}
                style={{ filter: 'drop-shadow(0 0 3px #60a5fa66)' }} />
              {/* Inductor voltage (−sine) */}
              <polyline
                points={sinePoints(0.8, 3, Math.PI / 2)}
                fill="none" stroke="#f87171" strokeWidth={1.5}
                style={{ filter: 'drop-shadow(0 0 3px #f8717166)' }} />
              <text x={10} y={14} fontSize={8} fill="#60a5fa" fontFamily="monospace">V_C (capacitor)</text>
              <text x={140} y={14} fontSize={8} fill="#f87171" fontFamily="monospace">V_L (inductor, 90° lead)</text>
            </svg>
          </div>
          <p className="text-[10px] text-gray-600 mt-1">
            Capacitor and inductor voltages are always 90° out of phase. At resonance they cancel — only R limits current.
          </p>
        </div>
      </div>
    </div>
  )
}
