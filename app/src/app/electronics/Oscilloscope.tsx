'use client'

import { useMemo } from 'react'
import type { WavePoint } from './simulator'

interface Channel {
  label:  string
  color:  string
  points: WavePoint[]
}

interface OscilloscopeProps {
  channels: Channel[]
  title?:   string
}

const W = 400
const H = 180
const PAD = { top: 16, right: 12, bottom: 28, left: 38 }
const IW = W - PAD.left - PAD.right
const IH = H - PAD.top  - PAD.bottom

export function Oscilloscope({ channels, title = 'Oscilloscope' }: OscilloscopeProps) {
  const { minV, maxV, maxT } = useMemo(() => {
    let minV = -1, maxV = 1, maxT = 1
    for (const ch of channels) {
      for (const pt of ch.points) {
        if (pt.v < minV) minV = pt.v
        if (pt.v > maxV) maxV = pt.v
        if (pt.t > maxT) maxT = pt.t
      }
    }
    // Add 10% padding
    const range = maxV - minV || 1
    minV -= range * 0.1
    maxV += range * 0.1
    return { minV, maxV, maxT }
  }, [channels])

  const toX = (t: number) => PAD.left + (t / maxT) * IW
  const toY = (v: number) => PAD.top  + (1 - (v - minV) / (maxV - minV)) * IH

  // Y-axis ticks
  const yTicks = useMemo(() => {
    const range = maxV - minV
    const step  = range < 1 ? 0.2 : range < 5 ? 1 : range < 20 ? 2 : 5
    const ticks: number[] = []
    for (let v = Math.ceil(minV / step) * step; v <= maxV; v = +(v + step).toFixed(6)) {
      ticks.push(+v.toFixed(4))
    }
    return ticks
  }, [minV, maxV])

  // X-axis ticks (time in ms or µs)
  const timeScale = maxT < 0.001 ? 1e6 : maxT < 1 ? 1e3 : 1
  const timeUnit  = maxT < 0.001 ? 'µs' : maxT < 1 ? 'ms' : 's'
  const xTicks    = useMemo(() => {
    const steps = 4
    return Array.from({ length: steps + 1 }, (_, i) => (maxT / steps) * i)
  }, [maxT])

  if (channels.length === 0) {
    return (
      <div className="bg-gray-900 rounded-xl p-4 flex items-center justify-center" style={{ height: H }}>
        <p className="text-gray-600 text-xs">Run simulation to see waveforms</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800">
        <span className="text-[10px] font-mono font-bold text-green-400">{title}</span>
        <div className="flex gap-3">
          {channels.map(ch => (
            <div key={ch.label} className="flex items-center gap-1">
              <div className="w-3 h-0.5" style={{ backgroundColor: ch.color }} />
              <span className="text-[9px] font-mono" style={{ color: ch.color }}>{ch.label}</span>
            </div>
          ))}
        </div>
      </div>

      <svg width={W} height={H} style={{ display: 'block' }}>
        {/* Screen background */}
        <rect x={PAD.left} y={PAD.top} width={IW} height={IH}
          fill="#0a0f1a" stroke="#1e3a2a" strokeWidth={1} />

        {/* Grid lines */}
        {yTicks.map(v => (
          <line key={`gy${v}`}
            x1={PAD.left} y1={toY(v)}
            x2={PAD.left + IW} y2={toY(v)}
            stroke="#1a2a1a" strokeWidth={0.5} />
        ))}
        {xTicks.map(t => (
          <line key={`gx${t}`}
            x1={toX(t)} y1={PAD.top}
            x2={toX(t)} y2={PAD.top + IH}
            stroke="#1a2a1a" strokeWidth={0.5} />
        ))}

        {/* Zero line */}
        {minV < 0 && maxV > 0 && (
          <line x1={PAD.left} y1={toY(0)} x2={PAD.left + IW} y2={toY(0)}
            stroke="#1a3a2a" strokeWidth={1} strokeDasharray="3 2" />
        )}

        {/* Waveforms */}
        {channels.map(ch => {
          if (ch.points.length < 2) return null
          const d = ch.points
            .map((pt, i) => `${i === 0 ? 'M' : 'L'}${toX(pt.t).toFixed(1)},${toY(pt.v).toFixed(1)}`)
            .join(' ')
          return (
            <path key={ch.label} d={d}
              fill="none" stroke={ch.color} strokeWidth={1.5}
              style={{ filter: `drop-shadow(0 0 2px ${ch.color}66)` }} />
          )
        })}

        {/* Y-axis labels */}
        {yTicks.map(v => (
          <text key={`yl${v}`} x={PAD.left - 3} y={toY(v) + 3}
            textAnchor="end" fontSize="7" fill="#4ade80" fontFamily="monospace">
            {v >= 0.01 || v === 0 ? v.toFixed(v < 1 && v !== 0 ? 1 : 0) : v.toExponential(1)}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map(t => (
          <text key={`xl${t}`} x={toX(t)} y={PAD.top + IH + 12}
            textAnchor="middle" fontSize="7" fill="#4ade80" fontFamily="monospace">
            {(t * timeScale).toFixed(t === 0 ? 0 : 1)}
          </text>
        ))}

        {/* Axis labels */}
        <text x={PAD.left - 28} y={PAD.top + IH / 2}
          textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace"
          transform={`rotate(-90,${PAD.left - 28},${PAD.top + IH / 2})`}>V</text>
        <text x={PAD.left + IW / 2} y={H - 4}
          textAnchor="middle" fontSize="7" fill="#6b7280" fontFamily="monospace">
          t ({timeUnit})
        </text>
      </svg>
    </div>
  )
}
