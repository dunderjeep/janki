'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CaptureBox, useInbox } from '@/components/chains/gtd'

/**
 * Phone capture: a big box that is focused when the page opens, and what is
 * already waiting in the inbox below it. Add it to your home screen; it opens
 * straight to the box.
 */
export default function CaptureApp() {
  const inbox = useInbox()
  const [last, setLast] = useState<string[]>([])
  const items = inbox.view?.items ?? []
  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-4 py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Capture</h1>
        <Link href="/next" className="text-sm text-sky-800 hover:underline">Next →</Link>
      </div>
      <CaptureBox big autoFocus onCaptured={(t) => { setLast((l) => [t, ...l].slice(0, 5)); void inbox.reload() }} />
      {last.length > 0 && (
        <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900" role="status">Captured: {last[0]}</p>
      )}
      <section className="mt-6">
        <h2 className="mb-1 text-sm font-medium text-gray-700">
          In the inbox <span className="text-gray-400">({items.length})</span>
        </h2>
        {inbox.error && <p className="text-sm text-red-700">{inbox.error}</p>}
        <ul className="space-y-1">
          {items.slice().reverse().slice(0, 30).map((i) => (
            <li key={i.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 break-words">{i.title}</li>
          ))}
        </ul>
        {items.length > 0 && <Link href="/next" className="mt-3 inline-block text-sm text-sky-800 hover:underline">Process them in Next →</Link>}
      </section>
    </main>
  )
}
