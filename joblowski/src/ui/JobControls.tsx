'use client'

import { useState } from 'react'

const inDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE')
}

/** Park, snooze (park until a day) or dismiss a tracked job without opening it. */
export default function JobControls({ onPark, onDismiss }: { onPark: (until: string | null) => void; onDismiss?: () => void }) {
  const [snoozing, setSnoozing] = useState(false)
  return (
    <>
      <button className="text-gray-500 hover:text-gray-900" title="Keep it, with no to-do, until you unpark it" onClick={() => onPark(null)}>Park</button>
      <button className="text-gray-500 hover:text-gray-900" title="Park it until a day, when it comes back by itself" onClick={() => setSnoozing((s) => !s)}>Snooze</button>
      {snoozing && (
        <span className="flex flex-wrap items-center gap-2">
          <button className="text-sky-800 hover:underline" onClick={() => onPark(inDays(7))}>1 week</button>
          <button className="text-sky-800 hover:underline" onClick={() => onPark(inDays(14))}>2 weeks</button>
          <button className="text-sky-800 hover:underline" onClick={() => onPark(inDays(30))}>1 month</button>
          <input type="date" className="rounded border border-gray-200 px-1 py-0.5 text-xs text-gray-700" min={inDays(1)} aria-label="Snooze until" onChange={(e) => e.target.value && onPark(e.target.value)} />
        </span>
      )}
      {onDismiss && <button className="text-gray-500 hover:text-red-700" title="Marked withdrawn in the tracker" onClick={onDismiss}>Dismiss</button>}
    </>
  )
}

