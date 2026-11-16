'use client'

import type { BodyRegion } from '@/data/anatomy'

interface Props {
  activeRegion:  BodyRegion | null
  onRegionClick: (r: BodyRegion) => void
}

// Colour each body region by its dominant system
const REGION_COLOR: Record<BodyRegion, string> = {
  head:    '#8b5cf6', // purple — nervous
  neck:    '#f59e0b', // amber — endocrine
  chest:   '#ef4444', // red — cardiovascular
  abdomen: '#16a34a', // green — digestive
  pelvis:  '#ec4899', // pink — reproductive
  arm:     '#d97706', // amber — musculoskeletal
  leg:     '#d97706',
  back:    '#6366f1', // indigo — spinal
}

const REGION_LABEL: Record<BodyRegion, string> = {
  head:    'Head', neck: 'Neck', chest: 'Thorax',
  abdomen: 'Abdomen', pelvis: 'Pelvis',
  arm:     'Upper\nLimb', leg: 'Lower\nLimb', back: 'Back',
}

interface ZoneProps {
  id: BodyRegion; active: boolean
  onClick: () => void; onHover: (r: BodyRegion | null) => void
  children: React.ReactNode
}

function Zone({ id, active, onClick, onHover, children }: ZoneProps) {
  const col = REGION_COLOR[id]
  return (
    <g
      onClick={onClick}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'pointer' }}>
      <g style={{
        opacity:   active ? 1 : 0.65,
        filter:    active ? `drop-shadow(0 0 8px ${col}aa)` : undefined,
        transition: 'opacity 0.15s, filter 0.15s',
      }}>
        {children}
      </g>
    </g>
  )
}

export function BodySVG({ activeRegion, onRegionClick }: Props) {
  const [hover, setHover] = React.useState<BodyRegion | null>(null)
  const highlight = hover ?? activeRegion

  // Helper to fill a zone
  const fill = (r: BodyRegion) =>
    highlight === r ? REGION_COLOR[r] : REGION_COLOR[r] + '88'
  const stroke = (r: BodyRegion) => REGION_COLOR[r]

  return (
    <svg viewBox="0 0 160 430" className="w-full max-w-[180px] mx-auto block select-none"
         role="img" aria-label="Interactive body diagram">

      {/* ── Body silhouette background ──────────────────────────────────── */}
      <ellipse cx="80" cy="32"  rx="30" ry="30"  fill="#1f2937" />
      <rect   x="68" y="60"   width="24" height="18" rx="4"       fill="#1f2937" />
      {/* Shoulders */}
      <path d="M68,78 L34,96 L26,108 L42,108 L62,98 Z"            fill="#1f2937" />
      <path d="M92,78 L126,96 L134,108 L118,108 L98,98 Z"          fill="#1f2937" />
      {/* Torso */}
      <rect x="42" y="78"  width="76" height="72" rx="6"            fill="#1f2937" />
      <rect x="44" y="150" width="72" height="52" rx="6"            fill="#1f2937" />
      <rect x="40" y="198" width="80" height="42" rx="8"            fill="#1f2937" />
      {/* Arms */}
      <rect x="22" y="96"  width="20" height="68" rx="8"            fill="#1f2937" />
      <rect x="118"y="96"  width="20" height="68" rx="8"            fill="#1f2937" />
      <rect x="16" y="166" width="18" height="58" rx="7"            fill="#1f2937" />
      <rect x="126"y="166" width="18" height="58" rx="7"            fill="#1f2937" />
      <ellipse cx="24"  cy="234" rx="13" ry="12"                    fill="#1f2937" />
      <ellipse cx="136" cy="234" rx="13" ry="12"                    fill="#1f2937" />
      {/* Legs */}
      <rect x="40" y="238" width="34" height="82" rx="10"           fill="#1f2937" />
      <rect x="86" y="238" width="34" height="82" rx="10"           fill="#1f2937" />
      <rect x="42" y="318" width="28" height="72" rx="8"            fill="#1f2937" />
      <rect x="90" y="318" width="28" height="72" rx="8"            fill="#1f2937" />
      <ellipse cx="54"  cy="399" rx="20" ry="14"                    fill="#1f2937" />
      <ellipse cx="106" cy="399" rx="20" ry="14"                    fill="#1f2937" />

      {/* ── Clickable colour zones ──────────────────────────────────────── */}

      {/* Head */}
      <Zone id="head" active={highlight === 'head'} onClick={() => onRegionClick('head')} onHover={setHover}>
        <ellipse cx="80" cy="32" rx="29" ry="29" fill={fill('head')} stroke={stroke('head')} strokeWidth="1.5" />
        <text x="80" y="37" textAnchor="middle" fontSize="7" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Head</text>
      </Zone>

      {/* Neck */}
      <Zone id="neck" active={highlight === 'neck'} onClick={() => onRegionClick('neck')} onHover={setHover}>
        <rect x="69" y="61" width="22" height="17" rx="3" fill={fill('neck')} stroke={stroke('neck')} strokeWidth="1.5" />
        <text x="80" y="73" textAnchor="middle" fontSize="5.5" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Neck</text>
      </Zone>

      {/* Chest */}
      <Zone id="chest" active={highlight === 'chest'} onClick={() => onRegionClick('chest')} onHover={setHover}>
        <rect x="43" y="79" width="74" height="70" rx="5" fill={fill('chest')} stroke={stroke('chest')} strokeWidth="1.5" />
        <text x="80" y="118" textAnchor="middle" fontSize="7" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Thorax</text>
      </Zone>

      {/* Abdomen */}
      <Zone id="abdomen" active={highlight === 'abdomen'} onClick={() => onRegionClick('abdomen')} onHover={setHover}>
        <rect x="45" y="151" width="70" height="50" rx="5" fill={fill('abdomen')} stroke={stroke('abdomen')} strokeWidth="1.5" />
        <text x="80" y="180" textAnchor="middle" fontSize="7" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Abdomen</text>
      </Zone>

      {/* Pelvis */}
      <Zone id="pelvis" active={highlight === 'pelvis'} onClick={() => onRegionClick('pelvis')} onHover={setHover}>
        <rect x="41" y="199" width="78" height="40" rx="8" fill={fill('pelvis')} stroke={stroke('pelvis')} strokeWidth="1.5" />
        <text x="80" y="223" textAnchor="middle" fontSize="7" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Pelvis</text>
      </Zone>

      {/* Left arm (viewer's right) */}
      <Zone id="arm" active={highlight === 'arm'} onClick={() => onRegionClick('arm')} onHover={setHover}>
        <rect x="23" y="97"  width="18" height="66" rx="7" fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        <rect x="17" y="167" width="16" height="55" rx="6" fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        <ellipse cx="24" cy="234" rx="12" ry="11"          fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        {/* Right arm (viewer's left) */}
        <rect x="119" y="97"  width="18" height="66" rx="7" fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        <rect x="127" y="167" width="16" height="55" rx="6" fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        <ellipse cx="136" cy="234" rx="12" ry="11"          fill={fill('arm')} stroke={stroke('arm')} strokeWidth="1.5" />
        <text x="14" y="140" textAnchor="middle" fontSize="5.5" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none', writingMode:'vertical-rl'}}>Arm</text>
      </Zone>

      {/* Legs */}
      <Zone id="leg" active={highlight === 'leg'} onClick={() => onRegionClick('leg')} onHover={setHover}>
        <rect x="41" y="239" width="32" height="80" rx="9"  fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <rect x="87" y="239" width="32" height="80" rx="9"  fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <rect x="43" y="319" width="26" height="70" rx="7"  fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <rect x="91" y="319" width="26" height="70" rx="7"  fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <ellipse cx="54"  cy="399" rx="18" ry="13"           fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <ellipse cx="106" cy="399" rx="18" ry="13"           fill={fill('leg')} stroke={stroke('leg')} strokeWidth="1.5" />
        <text x="57" y="282" textAnchor="middle" fontSize="5.5" fill="white" fontFamily="monospace" fontWeight="bold" style={{pointerEvents:'none'}}>Leg</text>
      </Zone>

      {/* Hover label */}
      {highlight && (
        <text x="80" y="424" textAnchor="middle" fontSize="7"
          fill={REGION_COLOR[highlight]} fontFamily="monospace" fontWeight="bold">
          {REGION_LABEL[highlight].replace('\n', ' ')}
        </text>
      )}
    </svg>
  )
}

// Need React import for useState
import React from 'react'
