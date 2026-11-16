'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReviewUpcomingButton({ deckId }: { deckId: string }) {
  const [n, setN] = useState(20)
  const router = useRouter()

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={1}
        max={500}
        value={n}
        onChange={e => setN(Math.max(1, Math.min(500, +e.target.value || 1)))}
        className="w-14 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center
                   focus:outline-none focus:ring-2 focus:ring-indigo-300
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                   [&::-webkit-inner-spin-button]:appearance-none"
        title="Number of upcoming cards to review"
      />
      <button
        onClick={() => router.push(`/srs/${deckId}/study?upcoming=${n}`)}
        className="text-sm font-semibold text-indigo-700 hover:text-indigo-900
                   border border-indigo-200 hover:border-indigo-400 bg-indigo-50
                   hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
      >
        Review upcoming
      </button>
    </div>
  )
}
