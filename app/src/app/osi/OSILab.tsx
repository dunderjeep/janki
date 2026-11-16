'use client'

import { useState } from 'react'
import { LayerExplorer }      from './LayerExplorer'
import { EncapsulationViz }   from './EncapsulationViz'
import { DevicesTab }         from './DevicesTab'

type Tab = 'layers' | 'encap' | 'devices'

const TABS: { id: Tab; icon: string; label: string; desc: string }[] = [
  { id: 'layers',  icon: '🗂',  label: 'OSI Layers',     desc: '7-layer model + PDUs' },
  { id: 'encap',   icon: '📦',  label: 'Encapsulation',   desc: 'Header wrapping, click-through' },
  { id: 'devices', icon: '🔌',  label: 'Devices',         desc: 'Hub · Switch · Router' },
]

export function OSILab() {
  const [tab, setTab] = useState<Tab>('layers')

  return (
    <div className="flex flex-col h-[calc(100vh-56px-1px)] overflow-hidden">

      {/* Tab bar */}
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
        <div className="flex items-center px-4 text-[10px] text-gray-400 font-mono">
          CCNA OSI / TCP-IP Reference
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'layers'  && <LayerExplorer />}
        {tab === 'encap'   && <EncapsulationViz />}
        {tab === 'devices' && <DevicesTab />}
      </div>
    </div>
  )
}
