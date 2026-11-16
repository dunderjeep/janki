'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Turns this chapter's enriched problems into SRS cards. Problems that already
 * produced cards are skipped, so it is safe to press again after enriching more.
 */
export function GenerateCardsButton({
  bookId,
  chapterId,
  sectionId,
  pendingCount,
}: {
  bookId: string
  chapterId: string
  sectionId?: string
  /** Enriched problems with no cards yet. */
  pendingCount: number
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<string | null>(null)

  if (pendingCount === 0) return null

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/courses/${bookId}/cards`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chapterId, sectionId }),
      })
      const data = await res.json()
      if (!res.ok) { setResult(`Error: ${data.error}`); return }
      setResult(`Made ${data.created} card${data.created === 1 ? '' : 's'}`)
      router.refresh()
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'failed'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className="text-sm border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        title="Create SRS cards from the enriched problems in this chapter"
      >
        {loading ? 'Making cards…' : `Make cards (${pendingCount})`}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
          {result}
        </span>
      )}
    </span>
  )
}
