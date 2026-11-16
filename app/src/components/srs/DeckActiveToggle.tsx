'use client'

import { useState, useTransition } from 'react'

export function DeckActiveToggle({
  deckId,
  initialActive,
}: {
  deckId: string
  initialActive: boolean
}) {
  const [active, setActive] = useState(initialActive)
  const [pending, startTransition] = useTransition()

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const next = !active
    setActive(next)
    startTransition(async () => {
      const res = await fetch(`/api/srs/decks/${deckId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      if (!res.ok) setActive(!next) // revert on error
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      title={active ? 'Deck is active — click to pause' : 'Deck is paused — click to activate'}
      className={`shrink-0 ml-2 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
        active ? 'bg-blue-500' : 'bg-gray-300'
      } ${pending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
    >
      <span
        className={`block w-4 h-4 mx-1 rounded-full bg-white shadow transition-transform ${
          active ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
