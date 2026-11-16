'use client'

import { useState } from 'react'
import { BandExplorer }   from './BandExplorer'
import { ResonanceLab }   from './ResonanceLab'
import { ModulationLab }  from './ModulationLab'
import { MorseLab }       from './MorseLab'
import { MorseTrainer }   from './MorseTrainer'

type Tab = 'spectrum' | 'resonance' | 'modulation' | 'morse' | 'trainer'

const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: 'spectrum',   icon: '📡', label: 'Spectrum',    desc: 'Canadian amateur bands' },
  { id: 'resonance',  icon: '⚡', label: 'Resonance',   desc: 'LC circuits & antennas' },
  { id: 'modulation', icon: '〜', label: 'Modulation',  desc: 'AM / FM / SSB / CW' },
  { id: 'morse',      icon: '·−', label: 'Morse / CW',  desc: 'Keyer + audio + Q-codes' },
  { id: 'trainer',    icon: '🎓', label: 'Koch Trainer', desc: 'Streak · Active · Flow' },
]

export function RadioLab() {
  const [tab, setTab] = useState<Tab>('trainer')

  return (
    <div className="flex flex-col h-[calc(100vh-56px-1px)] overflow-hidden">

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors
              border-b-2 flex-shrink-0 ${
              tab === t.id
                ? 'border-indigo-500 text-indigo-700 bg-indigo-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'}`}>
            <span className="text-base">{t.icon}</span>
            <div className="text-left">
              <div className="text-xs font-semibold leading-none">{t.label}</div>
              <div className="text-[9px] text-gray-400 mt-0.5 hidden sm:block">{t.desc}</div>
            </div>
          </button>
        ))}

        <div className="flex-1" />

        {/* Callsign hint */}
        <div className="flex items-center px-4 text-[10px] text-gray-400 font-mono">
          73 de VE · Amateur Radio Lab
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {tab === 'spectrum'   && <BandExplorer />}
        {tab === 'resonance'  && <ResonanceLab />}
        {tab === 'modulation' && <ModulationLab />}
        {tab === 'morse'      && <MorseLab />}
        {tab === 'trainer'    && <MorseTrainer />}
      </div>
    </div>
  )
}
