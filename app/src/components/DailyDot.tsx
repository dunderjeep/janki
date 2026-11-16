'use client'

/**
 * A small dot on a nav icon while a daily activity hasn't been done today.
 *
 * Every dot shares one fetch of /api/streaks. It refetches when the route
 * changes, when the window regains focus (so the dots notice midnight), and
 * when a trainer announces a practice via `notifyPracticed()`.
 */
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { localDate } from '@/lib/streak'

export type DailyActivity = 'srs' | 'morse'

const EVENT = 'janki:practiced'

/** Call after a practice is recorded so the nav dots clear without a reload. */
export function notifyPracticed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

type Answer = { signedIn: boolean; lastDates: Record<string, string> }

let inflight: Promise<Answer | null> | null = null
function load(): Promise<Answer | null> {
  // Collapse the simultaneous calls from several dots into one request.
  inflight ??= fetch('/api/streaks')
    .then((r) => (r.ok ? (r.json() as Promise<Answer>) : null))
    .catch(() => null)
    .finally(() => { setTimeout(() => { inflight = null }, 0) })
  return inflight
}

export default function DailyDot({ activity, label }: { activity: DailyActivity; label: string }) {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void load().then((a) => {
        if (!alive) return
        // Unknown (signed out, API down) shows nothing rather than a false alarm.
        setPending(!!a?.signedIn && a.lastDates[activity] !== localDate())
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener(EVENT, refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener(EVENT, refresh)
    }
  }, [activity, pathname])

  if (!pending) return null
  return (
    <span
      title={`${label} not done today`}
      className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white pointer-events-none"
    />
  )
}
