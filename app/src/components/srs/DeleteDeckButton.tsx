'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Deletes a deck and everything in it — cards, SRS state, review history.
 * One confirm, then it's gone.
 */
export function DeleteDeckButton({
  deckId,
  deckName,
  cardCount,
  onDeleted,
  redirectTo,
}: {
  deckId: string
  deckName: string
  cardCount?: number
  /** Lets the caller drop the deck from its own state. */
  onDeleted?: () => void
  /** Navigate here after deleting — for pages that are about this deck. */
  redirectTo?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const cards = typeof cardCount === 'number' ? ` and its ${cardCount} card${cardCount === 1 ? '' : 's'}` : ''
    if (!confirm(`Delete “${deckName}”${cards}? This cannot be undone.`)) return

    setBusy(true)
    const res = await fetch(`/api/srs/decks/${deckId}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error ?? 'Delete failed')
      return
    }

    onDeleted?.()
    if (redirectTo) router.push(redirectTo)
    else router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className={`shrink-0 text-gray-300 hover:text-red-500 transition-colors text-sm px-0.5 ${busy ? 'opacity-50 cursor-wait' : ''}`}
      title={`Delete the deck “${deckName}” and all its cards`}
    >
      🗑
    </button>
  )
}
