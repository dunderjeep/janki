'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { courseProblems } from '@/db/schema/janki'

type Problem = typeof courseProblems.$inferSelect
type SubPart = { label: string; text: string }

type Props = {
  problem: Problem
  sectionTitle: string
  chapterTitle: string
  bookId: string
  chapterId: string
  uid: string
}

export function ProblemView({ problem, sectionTitle, chapterTitle, bookId, chapterId, uid }: Props) {
  const router = useRouter()
  const subParts = (problem.subParts as SubPart[]) ?? []

  const [trickRevealed, setTrickRevealed] = useState(false)
  const [solutionRevealed, setSolutionRevealed] = useState(false)
  const [outcome, setOutcome] = useState<'in_progress' | 'solved' | 'gave_up' | null>(null)
  const [saving, setSaving] = useState(false)

  // Struggle timer
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startedRef = useRef(Date.now())

  const revealAfter = (problem.revealAfterMinutes ?? 5) * 60  // seconds

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedRef.current) / 1000))
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const canReveal = elapsed >= revealAfter || trickRevealed
  const timeLeft = Math.max(0, revealAfter - elapsed)
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60

  async function recordOutcome(o: 'solved' | 'gave_up') {
    setSaving(true)
    try {
      await fetch(`/api/courses/${bookId}/attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          outcome: o,
          revealedAt: trickRevealed ? new Date().toISOString() : null,
        }),
      })
      setOutcome(o)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const enriched = !!problem.trick

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
          <span>{chapterTitle}</span>
          <span>·</span>
          <span>{sectionTitle}</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          {problem.isStarred && <span className="text-amber-400">★</span>}
          Problem {problem.number}
        </h1>
      </div>

      {/* Problem statement */}
      <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
        <p className="text-gray-800 leading-relaxed">{problem.statement}</p>
        {subParts.length > 0 && (
          <ol className="mt-4 space-y-2 list-none">
            {subParts.map((sp, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-gray-400 font-medium shrink-0">
                  ({sp.label || String.fromCharCode(97 + i)})
                </span>
                <span className="text-gray-700">{sp.text || <em className="text-gray-300">[image — see book]</em>}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Technique tags */}
      {problem.techniqueTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {problem.techniqueTags.map(tag => (
            <span key={tag} className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
              {tag.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Struggle timer + reveal controls */}
      {enriched && !trickRevealed && (
        <div className="flex items-center gap-4 p-4 border border-amber-100 bg-amber-50/60 rounded-xl">
          {canReveal ? (
            <button
              onClick={() => setTrickRevealed(true)}
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Reveal the trick
            </button>
          ) : (
            <>
              <div className="text-amber-600 text-sm">
                Struggle for <span className="font-mono font-semibold">{mins}:{secs.toString().padStart(2, '0')}</span> before the hint unlocks
              </div>
              <button
                onClick={() => setTrickRevealed(true)}
                className="ml-auto text-xs text-amber-400 hover:text-amber-600 underline transition-colors"
              >
                Skip wait
              </button>
            </>
          )}
        </div>
      )}

      {!enriched && (
        <div className="text-sm text-gray-400 italic border border-dashed border-gray-200 rounded-xl p-4">
          This problem hasn't been enriched yet. Use the "Enrich" button on the chapter page to add the situation and trick.
        </div>
      )}

      {/* Trick reveal */}
      {trickRevealed && enriched && (
        <div className="space-y-3">
          {problem.situation && (
            <div className="border-l-4 border-indigo-300 bg-indigo-50 pl-4 pr-3 py-3 rounded-r-xl">
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-1">Situation</p>
              <p className="text-gray-800 text-sm leading-relaxed">{problem.situation}</p>
            </div>
          )}
          <div className="border-l-4 border-green-400 bg-green-50 pl-4 pr-3 py-3 rounded-r-xl">
            <p className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-1">The trick</p>
            <p className="text-gray-800 leading-relaxed">{problem.trick}</p>
          </div>

          {problem.solutionSketch && !solutionRevealed && (
            <button
              onClick={() => setSolutionRevealed(true)}
              className="text-sm text-gray-400 hover:text-gray-600 underline transition-colors"
            >
              Show solution sketch
            </button>
          )}
          {solutionRevealed && problem.solutionSketch && (
            <div className="border border-gray-200 bg-white rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Solution sketch</p>
              <p className="text-gray-700 text-sm leading-relaxed">{problem.solutionSketch}</p>
            </div>
          )}
        </div>
      )}

      {/* Outcome buttons */}
      {outcome ? (
        <div className={`text-center py-3 rounded-xl text-sm font-medium ${
          outcome === 'solved'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {outcome === 'solved' ? 'Marked as solved' : 'Moved on — trick noted'}
        </div>
      ) : (
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => recordOutcome('solved')}
            disabled={saving}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors"
          >
            Got it
          </button>
          <button
            onClick={() => { setTrickRevealed(true); recordOutcome('gave_up') }}
            disabled={saving}
            className="flex-1 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 font-medium py-2.5 rounded-xl transition-colors"
          >
            Show trick &amp; move on
          </button>
        </div>
      )}
    </div>
  )
}
