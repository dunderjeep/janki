'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  bookId: string
  chapterId: string
  sectionId?: string
  label?: string
  unenrichedCount: number
}

export function EnrichButton({ bookId, chapterId, sectionId, label, unenrichedCount }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  if (unenrichedCount === 0) return null

  async function handleEnrich() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/courses/${bookId}/enrich`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chapterId:  sectionId ? undefined : chapterId,
          sectionId,
          limit: unenrichedCount,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult(`Enriched ${data.enriched}/${data.total}${data.errors.length > 0 ? ` (${data.errors.length} errors)` : ''}`)
        router.refresh()
      }
    } catch (e: any) {
      setResult(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleEnrich}
        disabled={loading}
        className="text-xs border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading
          ? 'Enriching…'
          : label ?? `Enrich ${unenrichedCount} problem${unenrichedCount !== 1 ? 's' : ''}`}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
          {result}
        </span>
      )}
    </span>
  )
}
