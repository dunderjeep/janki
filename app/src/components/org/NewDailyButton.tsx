'use client'

import Link from 'next/link'

/** Opens today's daily to write in; the daily page makes it from the template if it is not there yet. */
export default function NewDailyButton({ className }: { className?: string; onDone?: () => void }) {
  return (
    <Link href="/daily" title="Today's daily, to write in"
      className={className ?? 'rounded-md border border-gray-300 px-2.5 py-1 text-sm text-gray-700 hover:bg-gray-50'}>
      Today&apos;s daily
    </Link>
  )
}
