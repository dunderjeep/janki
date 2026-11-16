'use client'

import { useEffect, useState } from 'react'

const REFRESH_MS = 15 * 60_000

/** The Joblowski briefcase, with a dot when an alert has found something new. */
export default function JoblowskiNavIcon() {
  const [unseen, setUnseen] = useState(0)

  useEffect(() => {
    const load = () =>
      fetch('/api/joblowski/alerts/count')
        .then((res) => (res.ok ? res.json() : { unseen: 0 }))
        .then((body) => setUnseen(body.unseen ?? 0))
        .catch(() => {})
    // The Joblowski page announces the count whenever it marks or dismisses something.
    const changed = (e: Event) => setUnseen((e as CustomEvent<number>).detail)
    load()
    const timer = setInterval(load, REFRESH_MS)
    window.addEventListener('joblowski:unseen', changed)
    return () => {
      clearInterval(timer)
      window.removeEventListener('joblowski:unseen', changed)
    }
  }, [])

  return (
    <span className="relative block">
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M9 8V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V8M3 13h18" />
      </svg>
      {unseen > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />}
      {unseen > 0 && <span className="sr-only">{unseen} new job matches</span>}
    </span>
  )
}
