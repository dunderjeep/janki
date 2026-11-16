'use client'

import { useState } from 'react'
import { PianoTrainer } from './PianoTrainer'
import { DrumTrainer }  from './DrumTrainer'

type Tab = 'piano' | 'drums'

export function MusicLab() {
  const [tab, setTab] = useState<Tab>('piano')

  return (
    <div className="flex flex-col bg-gray-950 min-h-screen">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-4 border-b border-gray-800">
        <button
          onClick={() => setTab('piano')}
          className={`px-5 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            tab === 'piano'
              ? 'bg-gray-800 text-white border border-b-gray-800 border-gray-700'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Piano &amp; Voice
        </button>
        <button
          onClick={() => setTab('drums')}
          className={`px-5 py-2 rounded-t-lg text-sm font-medium transition-colors ${
            tab === 'drums'
              ? 'bg-gray-800 text-white border border-b-gray-800 border-gray-700'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Drum Trainer
        </button>
      </div>

      {/* Content */}
      <div className={tab === 'piano' ? 'block' : 'hidden'}>
        <PianoTrainer />
      </div>
      <div className={tab === 'drums' ? 'block' : 'hidden'}>
        <DrumTrainer />
      </div>
    </div>
  )
}
