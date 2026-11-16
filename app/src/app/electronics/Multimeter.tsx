'use client'

type Mode = 'V' | 'A' | 'Ω' | 'P'

interface MultimeterProps {
  voltage?:    number
  current?:    number
  resistance?: number
  power?:      number
  label?:      string
  mode:        Mode
  onModeChange: (m: Mode) => void
}

function fmt(val: number | undefined, unit: string): string {
  if (val === undefined) return '---'
  const abs = Math.abs(val)
  if (abs === 0) return `0.000 ${unit}`
  if (abs >= 1000) return `${(val / 1000).toFixed(3)} k${unit}`
  if (abs >= 1)    return `${val.toFixed(3)} ${unit}`
  if (abs >= 1e-3) return `${(val * 1e3).toFixed(2)} m${unit}`
  if (abs >= 1e-6) return `${(val * 1e6).toFixed(2)} µ${unit}`
  return `${(val * 1e9).toFixed(2)} n${unit}`
}

const MODES: { id: Mode; label: string; color: string }[] = [
  { id: 'V', label: 'Volt',    color: 'text-yellow-400' },
  { id: 'A', label: 'Amp',     color: 'text-blue-400'   },
  { id: 'Ω', label: 'Ohm',     color: 'text-orange-400' },
  { id: 'P', label: 'Watt',    color: 'text-red-400'    },
]

export function Multimeter({
  voltage, current, resistance, power,
  label, mode, onModeChange,
}: MultimeterProps) {
  const display = mode === 'V' ? fmt(voltage,    'V')
    : mode === 'A'             ? fmt(current,    'A')
    : mode === 'Ω'             ? fmt(resistance, 'Ω')
    :                            fmt(power,      'W')

  const modeCol = MODES.find(m => m.id === mode)?.color ?? 'text-green-400'

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden select-none">
      {/* Header */}
      <div className="bg-gray-800 px-3 py-1.5 flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-green-400">Multimeter</span>
        {label && <span className="text-[9px] font-mono text-gray-400">{label}</span>}
      </div>

      {/* Mode selector */}
      <div className="flex border-b border-gray-700">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`flex-1 py-1 text-[10px] font-mono font-semibold transition-colors
              ${mode === m.id
                ? `bg-gray-700 ${m.color}`
                : 'text-gray-600 hover:text-gray-400'}`}
          >
            {m.id}
          </button>
        ))}
      </div>

      {/* Display */}
      <div className="px-4 py-4 bg-black/40">
        <div className={`font-mono text-2xl font-bold text-right tracking-widest ${modeCol}`}
             style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.05em' }}>
          {display}
        </div>
        <div className="text-right text-[9px] font-mono text-gray-600 mt-1">
          {MODES.find(m => m.id === mode)?.label}
        </div>
      </div>

      {/* All readings summary */}
      <div className="grid grid-cols-2 gap-px bg-gray-700">
        {[
          { label: 'V', value: fmt(voltage, 'V'),    col: 'text-yellow-400' },
          { label: 'A', value: fmt(current, 'A'),    col: 'text-blue-400'   },
          { label: 'Ω', value: fmt(resistance, 'Ω'), col: 'text-orange-400' },
          { label: 'W', value: fmt(power, 'W'),      col: 'text-red-400'    },
        ].map(({ label: l, value, col }) => (
          <div key={l} className="bg-gray-900 px-2 py-1.5">
            <span className={`text-[8px] font-mono ${col} mr-1`}>{l}</span>
            <span className="text-[9px] font-mono text-gray-300">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
