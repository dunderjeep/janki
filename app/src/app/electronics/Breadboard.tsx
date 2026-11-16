'use client'

import { useState, useCallback } from 'react'
import type { ComponentType } from '@/data/electronic-components'
import { getComponentDef } from '@/data/electronic-components'

// ── Layout constants ────────────────────────────────────────────────────────
const HS   = 15    // hole spacing (px)
const HR   = 3.5   // hole radius (px)
const ROWS = 30
const ROW_Y  = (r: number) => 48 + (r - 1) * HS  // y pixel for row r (1-based)
const RAIL_L_NEG_X = 10
const RAIL_L_POS_X = 24
const COL_A_X      = 52
const COL_F_X      = COL_A_X + 5 * HS + 18   // = 52 + 75 + 18 = 145
const RAIL_R_POS_X = COL_F_X + 5 * HS + 12   // = 145 + 75 + 12 = 232
const RAIL_R_NEG_X = RAIL_R_POS_X + 14        // = 246
const SVG_W  = 272
const SVG_H  = 50 + 29 * HS + 30   // ≈ 515

const COL_X: Record<string, number> = {
  a: COL_A_X, b: COL_A_X + HS, c: COL_A_X + 2 * HS,
  d: COL_A_X + 3 * HS, e: COL_A_X + 4 * HS,
  f: COL_F_X, g: COL_F_X + HS, h: COL_F_X + 2 * HS,
  i: COL_F_X + 3 * HS, j: COL_F_X + 4 * HS,
}

function holeXY(holeId: string): [number, number] | null {
  if (holeId.startsWith('L+')) { const r = parseInt(holeId.slice(2)); return [RAIL_L_POS_X, ROW_Y(r)] }
  if (holeId.startsWith('L-')) { const r = parseInt(holeId.slice(2)); return [RAIL_L_NEG_X, ROW_Y(r)] }
  if (holeId.startsWith('R+')) { const r = parseInt(holeId.slice(2)); return [RAIL_R_POS_X, ROW_Y(r)] }
  if (holeId.startsWith('R-')) { const r = parseInt(holeId.slice(2)); return [RAIL_R_NEG_X, ROW_Y(r)] }
  const col = holeId[0].toLowerCase()
  const row = parseInt(holeId.slice(1))
  const x = COL_X[col]
  if (!x || isNaN(row)) return null
  return [x, ROW_Y(row)]
}

// ── Voltage → colour mapping ─────────────────────────────────────────────────
function voltToFill(v: number | undefined): string {
  if (v === undefined) return '#374151'          // ungnd dark
  if (Math.abs(v) < 0.05) return '#6b7280'       // ~GND gray
  if (v > 0) {
    const alpha = Math.min(1, Math.abs(v) / 12)
    const r = Math.round(59 + alpha * (239 - 59))
    const g = Math.round(130 + alpha * (68  - 130))
    const b = Math.round(246 + alpha * (68  - 246))
    return `rgb(${r},${g},${b})`
  }
  // negative voltage (rare in simple circuits) → red-ish
  const alpha = Math.min(1, Math.abs(v) / 12)
  return `rgba(220,38,38,${0.4 + alpha * 0.6})`
}

// ── Component SVG drawing ─────────────────────────────────────────────────────
interface CompProps {
  type:   ComponentType
  x1: number; y1: number
  x2: number; y2: number
  value:  number
  label?: string
  current?: number
  selected?: boolean
  onClick?: () => void
}

function ComponentSVG({ type, x1, y1, x2, y2, value, label, current, selected, onClick }: CompProps) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI

  const on  = current !== undefined && Math.abs(current) > 1e-6
  const sel = selected ? 'filter:drop-shadow(0 0 3px #6366f1)' : ''

  const wire = (
    <line x1={x1} y1={y1} x2={x2} y2={y2}
      stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="2 2"
      style={{ pointerEvents: 'none' }} />
  )

  const body = (bx: number, by: number, content: React.ReactNode) => (
    <g transform={`translate(${bx},${by}) rotate(${angle})`}
       onClick={onClick}
       style={{ cursor: onClick ? 'pointer' : 'default', ...(sel ? { filter: 'drop-shadow(0 0 3px #6366f1)' } : {}) }}>
      {content}
    </g>
  )

  const labelEl = label ? (
    <text x={mx} y={my - 7}
      textAnchor="middle" fontSize="6" fill="#94a3b8"
      style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {label}
    </text>
  ) : null

  switch (type) {
    case 'wire':
      return (
        <>
          <line x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={selected ? '#818cf8' : '#64748b'}
            strokeWidth={selected ? 2 : 1.5}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            onClick={onClick} />
        </>
      )

    case 'resistor':
      return (
        <>
          {wire}
          {body(mx, my,
            <rect x={-len * 0.3} y={-5} width={len * 0.6} height={10}
              rx={2} fill={selected ? '#fde68a' : '#fef3c7'}
              stroke={on ? '#f59e0b' : '#92400e'} strokeWidth={1.2} />
          )}
          {labelEl}
        </>
      )

    case 'capacitor':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <line x1={-4} y1={-7} x2={-4} y2={7} stroke="#0ea5e9" strokeWidth={2} />
              <line x1={4}  y1={-7} x2={4}  y2={7} stroke="#0ea5e9" strokeWidth={2} />
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'inductor':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              {[-6, -2, 2, 6].map(cx => (
                <path key={cx} d={`M${cx-4},0 a4,4 0 0,1 8,0`}
                  fill="none" stroke="#8b5cf6" strokeWidth={1.5} />
              ))}
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'led-red':
    case 'led-green':
    case 'led-blue':
    case 'led-yellow': {
      const ledCol = type === 'led-red' ? '#ef4444'
        : type === 'led-green' ? '#22c55e'
        : type === 'led-blue'  ? '#3b82f6'
        : '#eab308'
      const glow = on ? `drop-shadow(0 0 4px ${ledCol})` : ''
      return (
        <>
          {wire}
          {body(mx, my, (
            <g style={{ filter: glow }}>
              <polygon points="-6,0 6,-6 6,6" fill={on ? ledCol : ledCol + '55'} stroke={ledCol} strokeWidth={1} />
              <line x1={6} y1={-6} x2={6} y2={6} stroke={ledCol} strokeWidth={1.5} />
              {on && <>
                <line x1={10} y1={-6} x2={13} y2={-9} stroke={ledCol} strokeWidth={1} />
                <line x1={10} y1={0}  x2={14} y2={-2} stroke={ledCol} strokeWidth={1} />
              </>}
            </g>
          ))}
          {labelEl}
        </>
      )
    }

    case 'diode':
    case 'zener':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <polygon points="-6,0 6,-5 6,5" fill="#fb923c55" stroke="#f97316" strokeWidth={1} />
              <line x1={6} y1={-6} x2={6} y2={6} stroke="#f97316" strokeWidth={1.5} />
              {type === 'zener' && <>
                <line x1={6} y1={-6} x2={9} y2={-6} stroke="#f97316" strokeWidth={1.5} />
                <line x1={6} y1={6}  x2={3} y2={6}  stroke="#f97316" strokeWidth={1.5} />
              </>}
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'voltage-dc':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <circle r={9} fill={selected ? '#e0e7ff' : '#eef2ff'} stroke="#6366f1" strokeWidth={1.5} />
              <text textAnchor="middle" y={-2} fontSize="5" fill="#6366f1" fontWeight="bold">+</text>
              <line x1={-5} y1={2} x2={5} y2={2} stroke="#6366f1" strokeWidth={1} />
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'voltage-ac':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <circle r={9} fill={selected ? '#ccfbf1' : '#f0fdfa'} stroke="#14b8a6" strokeWidth={1.5} />
              <path d="M-5,0 Q-2,-5 0,0 Q2,5 5,0" fill="none" stroke="#14b8a6" strokeWidth={1.5} />
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'ground':
      return (
        <>
          {wire}
          <g transform={`translate(${mx},${my})`} onClick={onClick}
             style={{ cursor: onClick ? 'pointer' : 'default' }}>
            <line x1={0} y1={-6} x2={0} y2={0}    stroke="#6b7280" strokeWidth={1.5} />
            <line x1={-7} y1={0}  x2={7}  y2={0}   stroke="#6b7280" strokeWidth={2}   />
            <line x1={-4} y1={3}  x2={4}  y2={3}   stroke="#6b7280" strokeWidth={1.5} />
            <line x1={-1} y1={6}  x2={1}  y2={6}   stroke="#6b7280" strokeWidth={1}   />
          </g>
          {labelEl}
        </>
      )

    case 'switch':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <circle cx={-6} cy={0} r={2} fill="#e5e7eb" stroke="#6b7280" strokeWidth={1} />
              <circle cx={6}  cy={0} r={2} fill="#e5e7eb" stroke="#6b7280" strokeWidth={1} />
              <line x1={-4} y1={0} x2={4} y2={-5}
                stroke={value === 1 ? '#22c55e' : '#6b7280'} strokeWidth={1.5} />
            </g>
          ))}
          {labelEl}
        </>
      )

    case 'current-source':
      return (
        <>
          {wire}
          {body(mx, my, (
            <g>
              <circle r={9} fill={selected ? '#cffafe' : '#ecfeff'} stroke="#06b6d4" strokeWidth={1.5} />
              <line x1={0} y1={-5} x2={0} y2={5} stroke="#06b6d4" strokeWidth={1.5} />
              <polygon points="0,-6 -3,-1 3,-1" fill="#06b6d4" />
            </g>
          ))}
          {labelEl}
        </>
      )

    default:
      return (
        <>
          {wire}
          {body(mx, my,
            <rect x={-8} y={-5} width={16} height={10}
              fill="#f3f4f6" stroke="#9ca3af" strokeWidth={1} rx={2} />
          )}
        </>
      )
  }
}

// ── Placed component type ────────────────────────────────────────────────────
export interface PlacedComp {
  id:    string
  type:  ComponentType
  hole1: string
  hole2: string
  value: number
  label?: string
}

interface BreadboardProps {
  components:   PlacedComp[]
  voltages?:    Record<string, number>      // node→voltage from simulation
  currents?:    Record<string, number>      // compId→current
  selectedTool: ComponentType | 'select' | 'delete'
  selectedComp: string | null
  onPlaceComp:  (hole1: string, hole2: string) => void
  onSelectComp: (id: string | null) => void
  onDeleteComp: (id: string) => void
}

// ── Breadboard component ─────────────────────────────────────────────────────
export function Breadboard({
  components, voltages, currents,
  selectedTool, selectedComp,
  onPlaceComp, onSelectComp, onDeleteComp,
}: BreadboardProps) {
  const [pendingHole, setPendingHole] = useState<string | null>(null)
  const [hoverHole,   setHoverHole]   = useState<string | null>(null)

  // map holeId → node voltage
  const holeVoltage = useCallback((holeId: string): number | undefined => {
    if (!voltages) return undefined
    const node = holeToNode(holeId)
    return voltages[node]
  }, [voltages])

  const handleHoleClick = useCallback((holeId: string) => {
    if (selectedTool === 'select' || selectedTool === 'delete') return

    if (!pendingHole) {
      setPendingHole(holeId)
    } else {
      if (pendingHole !== holeId) {
        onPlaceComp(pendingHole, holeId)
      }
      setPendingHole(null)
    }
  }, [selectedTool, pendingHole, onPlaceComp])

  const COLS = ['a','b','c','d','e','f','g','h','i','j']

  // Import from simulator (local copy to avoid circular dep in SVG)
  function holeToNode(holeId: string): string {
    if (holeId.startsWith('L+')) return 'RAIL_L_POS'
    if (holeId.startsWith('L-')) return 'RAIL_L_NEG'
    if (holeId.startsWith('R+')) return 'RAIL_R_POS'
    if (holeId.startsWith('R-')) return 'RAIL_R_NEG'
    const col = holeId[0].toLowerCase()
    const row = holeId.slice(1)
    if (['a','b','c','d','e'].includes(col)) return `L${row}`
    if (['f','g','h','i','j'].includes(col)) return `R${row}`
    return holeId
  }

  // Build list of all hole IDs for rendering
  const holes: string[] = []
  for (let r = 1; r <= ROWS; r++) {
    for (const col of COLS) holes.push(`${col}${r}`)
    holes.push(`L+${r}`, `L-${r}`, `R+${r}`, `R-${r}`)
  }

  return (
    <div className="overflow-auto">
      <svg
        width={SVG_W} height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ fontFamily: 'monospace', userSelect: 'none' }}
      >
        {/* ── Board background ── */}
        <rect x={0} y={0} width={SVG_W} height={SVG_H} rx={8} fill="#1e293b" />

        {/* ── Center gap label ── */}
        <rect x={COL_F_X - 15} y={1} width={12} height={SVG_H - 2}
          fill="#172032" rx={2} />

        {/* ── Power rail backgrounds ── */}
        <rect x={RAIL_L_NEG_X - 6} y={35} width={20} height={(ROWS) * HS + 10}
          fill="#172032" rx={3} />
        <rect x={RAIL_R_POS_X - 6} y={35} width={20} height={(ROWS) * HS + 10}
          fill="#172032" rx={3} />

        {/* ── Column labels ── */}
        {COLS.map(col => (
          <text key={col} x={COL_X[col]} y={30}
            textAnchor="middle" fontSize="7" fill="#64748b" fontWeight="bold">
            {col.toUpperCase()}
          </text>
        ))}
        {/* Rail headers with course-guide labels */}
        <text x={RAIL_L_POS_X} y={22} textAnchor="middle" fontSize="7" fill="#ef4444">+</text>
        <text x={RAIL_L_NEG_X} y={22} textAnchor="middle" fontSize="7" fill="#3b82f6">−</text>
        <text x={RAIL_R_POS_X} y={22} textAnchor="middle" fontSize="7" fill="#ef4444">+</text>
        <text x={RAIL_R_NEG_X} y={22} textAnchor="middle" fontSize="7" fill="#3b82f6">−</text>
        {/* Hole-ID hints for left rails */}
        <text x={RAIL_L_POS_X} y={31} textAnchor="middle" fontSize="5.5" fill="#ef444499" fontFamily="monospace">L+</text>
        <text x={RAIL_L_NEG_X} y={31} textAnchor="middle" fontSize="5.5" fill="#3b82f699" fontFamily="monospace">L−</text>
        {/* Hole-ID hints for right rails */}
        <text x={RAIL_R_POS_X} y={31} textAnchor="middle" fontSize="5.5" fill="#ef444499" fontFamily="monospace">R+</text>
        <text x={RAIL_R_NEG_X} y={31} textAnchor="middle" fontSize="5.5" fill="#3b82f699" fontFamily="monospace">R−</text>

        {/* ── Row numbers (every 5) ── */}
        {Array.from({ length: ROWS }, (_, i) => i + 1).filter(r => r % 5 === 0).map(r => (
          <text key={r} x={SVG_W - 6} y={ROW_Y(r) + 2.5}
            textAnchor="end" fontSize="6" fill="#475569">{r}</text>
        ))}

        {/* ── Rail lines ── */}
        <line x1={RAIL_L_POS_X} y1={ROW_Y(1)} x2={RAIL_L_POS_X} y2={ROW_Y(ROWS)}
          stroke="#ef444433" strokeWidth={1} />
        <line x1={RAIL_L_NEG_X} y1={ROW_Y(1)} x2={RAIL_L_NEG_X} y2={ROW_Y(ROWS)}
          stroke="#3b82f633" strokeWidth={1} />
        <line x1={RAIL_R_POS_X} y1={ROW_Y(1)} x2={RAIL_R_POS_X} y2={ROW_Y(ROWS)}
          stroke="#ef444433" strokeWidth={1} />
        <line x1={RAIL_R_NEG_X} y1={ROW_Y(1)} x2={RAIL_R_NEG_X} y2={ROW_Y(ROWS)}
          stroke="#3b82f633" strokeWidth={1} />

        {/* ── Holes ── */}
        {holes.map(hId => {
          const xy = holeXY(hId)
          if (!xy) return null
          const [x, y] = xy
          const volt   = holeVoltage(hId)
          const fill   = pendingHole === hId ? '#818cf8'
            : hoverHole === hId && selectedTool !== 'select' ? '#a5b4fc'
            : voltToFill(volt)
          const isRail  = hId.startsWith('L') || hId.startsWith('R')
          const stroke  = isRail
            ? (hId.includes('+') ? '#ef4444' : '#3b82f6')
            : '#334155'

          return (
            <circle key={hId} cx={x} cy={y} r={HR}
              fill={fill} stroke={stroke} strokeWidth={0.5}
              style={{ cursor: selectedTool !== 'select' && selectedTool !== 'delete' ? 'crosshair' : 'default' }}
              onClick={() => handleHoleClick(hId)}
              onMouseEnter={() => setHoverHole(hId)}
              onMouseLeave={() => setHoverHole(null)}
            />
          )
        })}

        {/* ── Preview line while placing ── */}
        {pendingHole && hoverHole && (() => {
          const p1 = holeXY(pendingHole)
          const p2 = holeXY(hoverHole)
          if (!p1 || !p2) return null
          return (
            <line x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
              stroke="#818cf8" strokeWidth={1} strokeDasharray="3 2" />
          )
        })()}

        {/* ── Placed components ── */}
        {components.map(c => {
          const p1 = holeXY(c.hole1)
          const p2 = holeXY(c.hole2)
          if (!p1 || !p2) return null
          const def  = getComponentDef(c.type)
          const cur  = currents?.[c.id]
          const isSel = selectedComp === c.id
          return (
            <ComponentSVG
              key={c.id}
              type={c.type}
              x1={p1[0]} y1={p1[1]}
              x2={p2[0]} y2={p2[1]}
              value={c.value}
              label={`${def.shortLabel}=${c.value}${def.unit}`}
              current={cur}
              selected={isSel}
              onClick={() => {
                if (selectedTool === 'delete') {
                  onDeleteComp(c.id)
                } else {
                  onSelectComp(isSel ? null : c.id)
                }
              }}
            />
          )
        })}

        {/* ── Voltage labels on holes (post-sim) ── */}
        {voltages && [...new Set(components.flatMap(c => [c.hole1, c.hole2]))].map(hId => {
          const xy   = holeXY(hId)
          const volt = holeVoltage(hId)
          if (!xy || volt === undefined) return null
          const [x, y] = xy
          return (
            <text key={`v-${hId}`} x={x} y={y - 6}
              textAnchor="middle" fontSize="5" fill="#a5b4fc"
              style={{ pointerEvents: 'none' }}>
              {volt.toFixed(1)}V
            </text>
          )
        })}
      </svg>
    </div>
  )
}
