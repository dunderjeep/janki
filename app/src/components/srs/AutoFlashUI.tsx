'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { LatexText } from './LatexText'
import type { StudyCard } from './StudyUI'
import type { Grade } from '@/db/schema/janki'

// ── Timing helpers ────────────────────────────────────────────────────────────

/** Time to show the front before auto-flipping: ~250ms/word, 1.2s–4s */
function readTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).length
  return Math.max(1200, Math.min(4000, words * 260))
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ── Constants ─────────────────────────────────────────────────────────────────

const GRADE_CONFIG: {
  grade: Grade; label: string; key: string
  ring: string; dim: string; glow: string
}[] = [
  { grade: 'again', label: 'Again', key: 'J', ring: 'ring-red-500',    dim: 'bg-red-950/60    border-red-800',    glow: '#ef4444' },
  { grade: 'hard',  label: 'Hard',  key: 'K', ring: 'ring-orange-500', dim: 'bg-orange-950/60 border-orange-800', glow: '#f97316' },
  { grade: 'good',  label: 'Good',  key: 'L', ring: 'ring-green-500',  dim: 'bg-green-950/60  border-green-800',  glow: '#22c55e' },
  { grade: 'easy',  label: 'Easy',  key: ';', ring: 'ring-blue-500',   dim: 'bg-blue-950/60   border-blue-800',   glow: '#3b82f6' },
]
const KEY_TO_GRADE: Record<string, Grade> = { j: 'again', k: 'hard', l: 'good', ';': 'easy' }
const GRADE_GLOW:   Record<Grade, string> = { again: '#ef4444', hard: '#f97316', good: '#22c55e', easy: '#3b82f6' }

type FlashPhase  = 'idle' | 'running' | 'done'
type CardDisplay = 'front' | 'back' | 'feedback'

interface Result {
  reviewed: number
  autoHard: number
  byGrade:  Record<Grade, number>
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AutoFlashUI({
  cards: initialCards,
  backHref       = '/srs',
  sessionDeckId  = null,
  deckName       = '',
}: {
  cards:          StudyCard[]
  backHref?:      string
  sessionDeckId?: string | null
  deckName?:      string
}) {
  // Config
  const [gradeTimeout, setGradeTimeout] = useState(8)   // seconds to respond

  // Phase + display
  const [phase,        setPhase]        = useState<FlashPhase>('idle')
  const [cardDisplay,  setCardDisplay]  = useState<CardDisplay>('front')
  const [displayCard,  setDisplayCard]  = useState<StudyCard | null>(null)
  const [lastGrade,    setLastGrade]    = useState<Grade | null>(null)
  const [wasAuto,      setWasAuto]      = useState(false)
  const [cardIdx,      setCardIdx]      = useState(0)
  const [gradeBar,     setGradeBar]     = useState(1)   // 1 → 0 during grade window
  const [result,       setResult]       = useState<Result | null>(null)
  const [leechedIds,   setLeechedIds]   = useState<Set<string>>(new Set())

  // Refs
  const cancelRef       = useRef(false)
  const gradeResolveRef = useRef<((g: Grade) => void) | null>(null)
  const sessionIdRef    = useRef<string | null>(null)
  const byGradeRef      = useRef<Record<Grade, number>>({ again: 0, hard: 0, good: 0, easy: 0 })
  const autoHardRef     = useRef(0)
  const reviewedRef     = useRef(0)
  const barTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const barStartRef     = useRef(0)

  // ── Keydown listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = KEY_TO_GRADE[e.key]
      if (g && gradeResolveRef.current) {
        const fn = gradeResolveRef.current
        gradeResolveRef.current = null
        fn(g)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const waitForGrade = (): Promise<Grade> =>
    new Promise(res => { gradeResolveRef.current = res })

  // ── Grade countdown bar ───────────────────────────────────────────────────

  function startBar(ms: number) {
    barStartRef.current = Date.now()
    setGradeBar(1)
    barTimerRef.current = setInterval(() => {
      const pct = 1 - (Date.now() - barStartRef.current) / ms
      setGradeBar(Math.max(0, pct))
    }, 50)
  }

  function stopBar() {
    if (barTimerRef.current) { clearInterval(barTimerRef.current); barTimerRef.current = null }
  }

  // ── Session loop ──────────────────────────────────────────────────────────

  const runSession = useCallback(async () => {
    cancelRef.current    = false
    byGradeRef.current   = { again: 0, hard: 0, good: 0, easy: 0 }
    autoHardRef.current  = 0
    reviewedRef.current  = 0
    sessionIdRef.current = null
    setResult(null)
    setCardIdx(0)
    setPhase('running')

    for (let i = 0; i < initialCards.length && !cancelRef.current; i++) {
      const card = initialCards[i]
      setCardIdx(i)
      setLastGrade(null)
      setWasAuto(false)

      // 1. Show front
      setCardDisplay('front')
      setDisplayCard(card)
      await sleep(readTimeMs(card.front))
      if (cancelRef.current) break

      // 2. Reveal back + start grade countdown
      setCardDisplay('back')
      const timeoutMs = gradeTimeout * 1000
      startBar(timeoutMs)

      const grade = await Promise.race([
        waitForGrade(),
        sleep(timeoutMs).then((): Grade => 'hard'),
      ])
      const auto = gradeResolveRef.current !== null  // still set → timeout fired
      gradeResolveRef.current = null
      stopBar()
      setGradeBar(0)

      setLastGrade(grade)
      setWasAuto(auto)
      setCardDisplay('feedback')

      // Update stats
      byGradeRef.current[grade]++
      if (auto) autoHardRef.current++
      reviewedRef.current++

      // POST grade (awaited during feedback flash so API gets the call)
      try {
        const reviewRes = await fetch('/api/srs/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cardId:        card.id,
            deckId:        card.deckId,
            sessionDeckId,
            grade,
            sessionId:     sessionIdRef.current,
            isFirstReview: i === 0,
          }),
        })
        const reviewData = await reviewRes.json() as { sessionId?: string }
        if (reviewData.sessionId) sessionIdRef.current = reviewData.sessionId
      } catch { /* non-fatal */ }

      await sleep(550)   // feedback flash
    }

    // Close session
    if (sessionIdRef.current) {
      await fetch('/api/srs/review', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId: sessionIdRef.current }),
      })
    }

    setResult({
      reviewed: reviewedRef.current,
      autoHard: autoHardRef.current,
      byGrade:  { ...byGradeRef.current },
    })
    setPhase('done')
  }, [initialCards, gradeTimeout, sessionDeckId])

  const stopSession = () => {
    cancelRef.current    = true
    gradeResolveRef.current = null
    stopBar()
    // Still show result for what was reviewed
    setResult({
      reviewed: reviewedRef.current,
      autoHard: autoHardRef.current,
      byGrade:  { ...byGradeRef.current },
    })
    setPhase('done')
  }

  const handleGradeBtn = (grade: Grade) => {
    if (gradeResolveRef.current) {
      const fn = gradeResolveRef.current
      gradeResolveRef.current = null
      fn(grade)
    }
  }

  const handleLeech = (card: StudyCard) => {
    const isLeech = leechedIds.has(card.id)
    setLeechedIds(prev => {
      const next = new Set(prev)
      isLeech ? next.delete(card.id) : next.add(card.id)
      return next
    })
    const newTags = isLeech
      ? card.tags.filter(t => t !== 'leech')
      : [...card.tags, 'leech']
    fetch(`/api/srs/cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    }).catch(() => {})
  }

  // ── Idle screen ───────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-200 px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="text-4xl mb-2">⚡</div>
            <h1 className="text-2xl font-bold text-white">Auto-Flash</h1>
            <p className="text-sm text-gray-500 mt-1">
              {deckName ? `${deckName} · ` : ''}{initialCards.length} cards
            </p>
          </div>

          {/* How it works */}
          <div className="bg-gray-900 rounded-2xl p-4 text-xs text-gray-500 space-y-1.5">
            <p className="font-semibold text-gray-400 text-[11px] uppercase tracking-widest">How it works</p>
            <p>Front shown briefly (scales with word count), then back flips automatically.</p>
            <p>You grade with <span className="font-mono text-gray-300">J</span> Again · <span className="font-mono text-gray-300">K</span> Hard · <span className="font-mono text-gray-300">L</span> Good · <span className="font-mono text-gray-300">;</span> Easy</p>
            <p>No response within the grade window → auto-graded <span className="text-orange-400 font-semibold">Hard</span>.</p>
          </div>

          {/* Config */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400 font-semibold">Grade window: {gradeTimeout}s</span>
              <span className="text-gray-600">Time to respond after flip</span>
            </div>
            <input type="range" min={4} max={20} step={1} value={gradeTimeout}
              onChange={e => setGradeTimeout(+e.target.value)}
              className="w-full accent-indigo-500" />
          </div>

          <button onClick={runSession}
            className="w-full py-4 rounded-2xl bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-lg transition-all active:scale-95">
            ⚡ Start Auto-Flash
          </button>

          <a href={backHref}
            className="block text-center text-sm text-gray-600 hover:text-gray-400">
            ← Back
          </a>
        </div>
      </div>
    )
  }

  // ── Done screen ───────────────────────────────────────────────────────────

  if (phase === 'done' && result) {
    const pctAuto = result.reviewed > 0
      ? Math.round((result.autoHard / result.reviewed) * 100) : 0

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-200 px-4">
        <div className="w-full max-w-md space-y-5">
          <div className="text-center">
            <div className="text-5xl mb-2">✓</div>
            <h2 className="text-2xl font-bold text-white">Done</h2>
            <p className="text-gray-500 text-sm mt-1">{result.reviewed} cards reviewed</p>
          </div>

          {/* Grade breakdown */}
          <div className="grid grid-cols-4 gap-2">
            {GRADE_CONFIG.map(({ grade, label, glow }) => (
              <div key={grade} className="flex flex-col items-center rounded-xl py-3 bg-gray-900">
                <span className="text-2xl font-black" style={{ color: glow }}>
                  {result.byGrade[grade]}
                </span>
                <span className="text-[10px] text-gray-500 mt-0.5">{label}</span>
              </div>
            ))}
          </div>

          {pctAuto > 0 && (
            <p className="text-center text-xs text-orange-400">
              {pctAuto}% auto-graded Hard (no response)
            </p>
          )}

          <div className="flex gap-3">
            <a href={backHref}
              className="flex-1 text-center py-3 rounded-xl bg-gray-800 text-gray-300 hover:text-white text-sm font-semibold">
              Back
            </a>
            <button onClick={runSession}
              className="flex-1 py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-semibold">
              Again →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Running ───────────────────────────────────────────────────────────────

  const progress = initialCards.length > 0 ? cardIdx / initialCards.length : 0
  const feedbackGlow = lastGrade ? GRADE_GLOW[lastGrade] : null

  return (
    <div className="min-h-screen flex flex-col bg-gray-950 text-gray-200 select-none">

      {/* Session progress bar */}
      <div className="h-1 bg-gray-800 flex-shrink-0">
        <div className="h-full bg-indigo-500 transition-all duration-300"
          style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-600 font-mono">
          {cardIdx + 1} / {initialCards.length}
        </span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
          cardDisplay === 'front' ? 'bg-gray-800 text-gray-400'
          : cardDisplay === 'back' ? 'bg-indigo-900 text-indigo-300'
          : 'bg-gray-800 text-gray-400'
        }`}>
          {cardDisplay === 'front' ? 'Read' : cardDisplay === 'back' ? 'Grade' : '✓'}
        </span>
        <button onClick={stopSession} className="text-xs text-gray-600 hover:text-gray-400">Stop</button>
      </div>

      {/* Grade timeout bar (shown during 'back' phase) */}
      <div className="h-0.5 bg-gray-900 flex-shrink-0">
        {cardDisplay === 'back' && (
          <div className="h-full bg-indigo-400 transition-none"
            style={{ width: `${gradeBar * 100}%` }} />
        )}
      </div>

      {/* Main card area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">

        {displayCard && (
          <div className="w-full max-w-xl space-y-5">

            {/* Front */}
            <div
              className="w-full rounded-2xl border p-6 text-center transition-all duration-200"
              style={{
                borderColor: cardDisplay === 'feedback' && feedbackGlow ? feedbackGlow + '66' : '#374151',
                backgroundColor: cardDisplay === 'feedback' && feedbackGlow ? feedbackGlow + '11' : '#111827',
                boxShadow: cardDisplay === 'feedback' && feedbackGlow ? `0 0 32px ${feedbackGlow}33` : 'none',
              }}>
              <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-3">Front</p>
              <LatexText text={displayCard.front} className="text-xl text-gray-100 leading-relaxed" />
            </div>

            {/* Back — only shown after flip */}
            {(cardDisplay === 'back' || cardDisplay === 'feedback') && (
              <div className="w-full rounded-2xl border border-gray-700 bg-gray-900 p-6 text-center">
                <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mb-3">Back</p>
                <LatexText text={displayCard.back} className="text-xl text-gray-200 leading-relaxed" />
                {displayCard.backImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={displayCard.backImageUrl} alt=""
                    className="mt-4 max-h-40 mx-auto rounded-lg object-contain" />
                )}
                {displayCard.backAudioUrl && (
                  <audio controls src={displayCard.backAudioUrl} className="mt-4 mx-auto w-full max-w-xs" />
                )}
              </div>
            )}

            {/* Grade buttons (shown during 'back' phase) */}
            {cardDisplay === 'back' && (
              <>
                <div className="flex gap-2">
                  {GRADE_CONFIG.map(({ grade, label, key, dim }) => (
                    <button key={grade} onClick={() => handleGradeBtn(grade)}
                      className={`flex-1 flex flex-col items-center py-3 rounded-xl border text-sm font-semibold
                                  transition-all hover:brightness-125 active:scale-95 ${dim}`}>
                      <span>{label}</span>
                      <span className="text-[9px] font-mono opacity-50 mt-0.5">[{key}]</span>
                    </button>
                  ))}
                </div>
                <div className="flex justify-start">
                  <button
                    onClick={() => displayCard && handleLeech(displayCard)}
                    className={`text-xs transition-colors ${
                      displayCard && leechedIds.has(displayCard.id)
                        ? 'text-orange-400 hover:text-orange-300'
                        : 'text-gray-600 hover:text-orange-400'
                    }`}
                    title="Tag as leech to atomize later"
                  >
                    {displayCard && leechedIds.has(displayCard.id) ? '🪸 Leeched' : '🪸 Mark leech'}
                  </button>
                </div>
              </>
            )}

            {/* Feedback label */}
            {cardDisplay === 'feedback' && lastGrade && (
              <div className="text-center">
                <span className="text-sm font-bold" style={{ color: GRADE_GLOW[lastGrade] }}>
                  {wasAuto ? '⏱ Auto-' : ''}{lastGrade.charAt(0).toUpperCase() + lastGrade.slice(1)}
                </span>
              </div>
            )}

            {/* Front-phase hint */}
            {cardDisplay === 'front' && (
              <p className="text-center text-xs text-gray-700">Reading…</p>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
