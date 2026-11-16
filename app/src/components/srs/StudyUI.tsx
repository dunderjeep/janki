'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { previewIntervals } from '@/lib/fsrs'
import { localDate } from '@/lib/streak'
import { notifyPracticed } from '@/components/DailyDot'
import { LatexText } from './LatexText'
import { MediaUploadZone, type MediaValue } from './MediaUploadZone'
import { MermaidDiagram } from './MermaidDiagram'
import { SvgDisplay } from './SvgDisplay'
import { AtomizeModal } from './AtomizeModal'
import { WikiText } from './WikiText'
import type { SrsObject, Grade } from '@/db/schema/janki'

// ── Types ─────────────────────────────────────────────────────────────────────

export type StudyCard = {
  id: string
  deckId: string
  deckName: string
  front: string
  back: string
  // Front-side media
  imageUrl:      string | null
  imagePath?:    string | null
  audioUrl:      string | null
  audioPath?:    string | null
  // Back-side media
  backImageUrl?:  string | null
  backImagePath?: string | null
  backAudioUrl?:  string | null
  backAudioPath?: string | null
  // Claude-generated Mermaid diagrams
  frontDiagram?: string | null
  backDiagram?:  string | null
  // SVG visuals (Claude-generated or manual)
  frontSvg?: string | null
  backSvg?:  string | null
  srs: SrsObject
  tags: string[]
  accepted: string[]
  strict: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeAnswer(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '')
}

function evaluateCorrect(typed: string, card: StudyCard): boolean | null {
  if (!typed.trim()) return null
  const norm = normalizeAnswer(typed)
  const answers = [card.back, ...(card.accepted ?? [])].map(normalizeAnswer).filter(Boolean)
  if (card.strict) return answers.some((a) => a === norm)
  return answers.some((a) => a.includes(norm) || norm.includes(a))
}

const GRADE_CONFIG: { grade: Grade; label: string; key: string; color: string }[] = [
  { grade: 'again', label: 'Again', key: 'j', color: 'bg-red-500 hover:bg-red-600 active:bg-red-700' },
  { grade: 'hard',  label: 'Hard',  key: 'k', color: 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700' },
  { grade: 'good',  label: 'Good',  key: 'l', color: 'bg-green-500 hover:bg-green-600 active:bg-green-700' },
  { grade: 'easy',  label: 'Easy',  key: ';', color: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700' },
]

// ── Confetti celebration ───────────────────────────────────────────────────

function Confetti() {
  const pieces = useState(() =>
    Array.from({ length: 36 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 1.4 + Math.random() * 1.2,
      color: ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'][i % 8],
      size: 7 + Math.random() * 7,
      round: Math.random() > 0.5,
    }))
  )[0]

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-24px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: 0,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.round ? '50%' : '2px',
            animation: `confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  )
}

// ── StudyUI ───────────────────────────────────────────────────────────────────

export function StudyUI({
  initialQueue,
  backHref = '/srs',
  isMasterStudy: _isMasterStudy = false,
  sessionDeckId = null,
  initialStreak = null,
  dueTotal = null,
}: {
  initialQueue: StudyCard[]
  backHref?: string
  isMasterStudy?: boolean
  sessionDeckId?: string | null
  initialStreak?: { count: number; longest: number } | null
  /** How many cards are due in scope, when the queue is only a capped slice of them. */
  dueTotal?: number | null
}) {
  // ── Queue state (persists across cards) ──────────────────────────────────
  const [queue, setQueue] = useState<StudyCard[]>(initialQueue)
  const [cursor, setCursor] = useState(() => {
    // Restore position from a previous interrupted session
    if (!sessionDeckId) return 0
    try {
      const saved = localStorage.getItem(`study-pos-${sessionDeckId}`)
      if (!saved) return 0
      const { ids, pos } = JSON.parse(saved) as { ids: string[]; pos: number }
      const currentIds = initialQueue.map(c => c.id).join(',')
      if (ids.join(',') === currentIds && pos > 0 && pos < initialQueue.length) return pos
    } catch { /* ignore */ }
    return 0
  })
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [done, setDone] = useState(false)
  const [streak, setStreak] = useState<{ count: number; longest: number } | null>(initialStreak)
  const cardUpdatesRef = useRef<Record<string, SrsObject>>({})

  // ── Per-card state (reset via useEffect when cursor changes) ──────────────
  const [revealed, setRevealed] = useState(false)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [refineOpen, setRefineOpen] = useState(false)
  const [refineInstruction, setRefineInstruction] = useState('')
  const [atomizeOpen, setAtomizeOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [refineMessage, setRefineMessage] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  // Custom interval state
  const [customDays, setCustomDays] = useState<number | ''>(1)

  // Add related cards state
  const [addOpen, setAddOpen] = useState(false)
  const [newCards, setNewCards] = useState<{ front: string; back: string }[]>([{ front: '', back: '' }])
  const [addToSession, setAddToSession] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [addMessage, setAddMessage] = useState('')
  const [generateInstruction, setGenerateInstruction] = useState('')
  const [generateCount, setGenerateCount] = useState(5)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateMessage, setGenerateMessage] = useState('')

  // Edit form state
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editAccepted, setEditAccepted] = useState('')
  const [editStrict, setEditStrict] = useState(false)

  // Media state for edit panel
  const [frontImage, setFrontImage] = useState<MediaValue | null>(null)
  const [frontAudio, setFrontAudio] = useState<MediaValue | null>(null)
  const [backImage,  setBackImage]  = useState<MediaValue | null>(null)
  const [backAudio,  setBackAudio]  = useState<MediaValue | null>(null)

  // Connections panel state
  const [connectionsOpen,    setConnectionsOpen]    = useState(false)
  const [connections,        setConnections]        = useState<Array<{
    edgeId: string; direction: string; nodeId: string; kind: string; label: string | null
    srsId?: string; front?: string; back?: string; deckId?: string; name?: string
  }>>([])
  const [connectionsLoading, setConnectionsLoading] = useState(false)

  // Link picker state
  const [linkPickerOpen,    setLinkPickerOpen]    = useState(false)
  const [linkQuery,         setLinkQuery]         = useState('')
  const [linkResults,       setLinkResults]       = useState<Array<{ id: string; front: string; deckId: string; deckName: string }>>([])
  const [linkSearching,     setLinkSearching]     = useState(false)
  const [linkingId,         setLinkingId]         = useState<string | null>(null)

  // Diagram state
  const [diagramOpen,        setDiagramOpen]        = useState(false)
  const [diagramInstruction, setDiagramInstruction] = useState('')
  const [diagramSide,        setDiagramSide]        = useState<'front' | 'back'>('back')
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false)
  const [diagramMessage,     setDiagramMessage]     = useState('')
  const [frontDiagramLocal,  setFrontDiagramLocal]  = useState<string | null>(null)
  const [backDiagramLocal,   setBackDiagramLocal]   = useState<string | null>(null)

  // Manual Mermaid state
  const [diagramTab,            setDiagramTab]            = useState<'claude' | 'manual'>('claude')
  const [manualDiagramFront,    setManualDiagramFront]    = useState('')
  const [manualDiagramBack,     setManualDiagramBack]     = useState('')
  const [isSavingManualDiagram, setIsSavingManualDiagram] = useState(false)
  const [manualDiagramMessage,  setManualDiagramMessage]  = useState('')

  // Duplicate state
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [duplicateMsg,  setDuplicateMsg]  = useState('')

  // SVG state
  const [svgOpen,         setSvgOpen]         = useState(false)
  const [svgTab,          setSvgTab]          = useState<'claude' | 'math' | 'manual'>('claude')
  const [svgSide,         setSvgSide]         = useState<'front' | 'back'>('back')
  const [svgInstruction,  setSvgInstruction]  = useState('')
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false)
  const [svgMessage,      setSvgMessage]      = useState('')
  const [frontSvgLocal,   setFrontSvgLocal]   = useState<string | null>(null)
  const [backSvgLocal,    setBackSvgLocal]    = useState<string | null>(null)
  const [manualSvgFront,  setManualSvgFront]  = useState('')
  const [manualSvgBack,   setManualSvgBack]   = useState('')

  useEffect(() => {
    setRevealed(false)
    setTypedAnswer('')
    setEditOpen(false)
    setRefineOpen(false)
    setRefineInstruction('')
    setAtomizeOpen(false)
    setIsSaving(false)
    setIsRefining(false)
    setSaveMessage('')
    setRefineMessage('')
    setAddOpen(false)
    setNewCards([{ front: '', back: '' }])
    setAddMessage('')
    setGenerateInstruction('')
    setGenerateMessage('')
    setCustomDays(1)
    setConnectionsOpen(false)
    setConnections([])
    setLinkPickerOpen(false)
    setLinkQuery('')
    setLinkResults([])
    setDiagramOpen(false)
    setDiagramInstruction('')
    setDiagramMessage('')
    setDiagramTab('claude')
    setManualDiagramMessage('')
    setSvgOpen(false)
    setSvgInstruction('')
    setSvgMessage('')
    setDeleteConfirm(false)
    setResetConfirm(false)
    setDuplicateMsg('')
  }, [cursor])

  // ── Persist cursor so navigating away and returning restores position ────
  useEffect(() => {
    if (!sessionDeckId) return
    if (done) {
      localStorage.removeItem(`study-pos-${sessionDeckId}`)
      return
    }
    if (cursor === 0) return // don't persist start position — no need
    try {
      localStorage.setItem(
        `study-pos-${sessionDeckId}`,
        JSON.stringify({ ids: queue.map(c => c.id), pos: cursor }),
      )
    } catch { /* ignore quota errors */ }
  }, [cursor, done, queue, sessionDeckId])

  // ── Browser history — each grade becomes a history entry so browser back
  //    restores the previous card instead of leaving the study page.
  useEffect(() => {
    history.replaceState({ cursor: 0 }, '')
    function onPopState(e: PopStateEvent) {
      if (e.state && typeof e.state.cursor === 'number') {
        setCursor(e.state.cursor)
        setDone(false)
      }
      // If no study state, Next.js router handles navigation away naturally
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, []) // mount only

  // Sync edit form when opening or when card changes
  useEffect(() => {
    if (!queue[cursor]) return
    const card = queue[cursor]
    setEditFront(card.front)
    setEditBack(card.back)
    setEditTags(card.tags.join(', '))
    setEditAccepted(card.accepted.join(', '))
    setEditStrict(card.strict)
    // Sync media from card
    setFrontImage(card.imageUrl   ? { url: card.imageUrl,    path: card.imagePath    ?? '' } : null)
    setFrontAudio(card.audioUrl   ? { url: card.audioUrl,    path: card.audioPath    ?? '' } : null)
    setBackImage (card.backImageUrl ? { url: card.backImageUrl, path: card.backImagePath ?? '' } : null)
    setBackAudio (card.backAudioUrl ? { url: card.backAudioUrl, path: card.backAudioPath ?? '' } : null)
    // Sync diagrams from card
    setFrontDiagramLocal(card.frontDiagram ?? null)
    setBackDiagramLocal (card.backDiagram  ?? null)
    setManualDiagramFront(card.frontDiagram ?? '')
    setManualDiagramBack (card.backDiagram  ?? '')
    // Sync SVG from card
    setFrontSvgLocal(card.frontSvg ?? null)
    setBackSvgLocal (card.backSvg  ?? null)
    setManualSvgFront(card.frontSvg ?? '')
    setManualSvgBack (card.backSvg  ?? '')

    setDiagramMessage('')
  }, [cursor, editOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────

  const patchLocalCard = useCallback((id: string, patch: Partial<StudyCard>) => {
    setQueue((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  function goNext() {
    if (cursor < queue.length - 1) setCursor((c) => c + 1)
  }
  function goPrev() {
    if (cursor > 0) setCursor((c) => c - 1)
  }

  // ── Grade handler ─────────────────────────────────────────────────────────

  async function handleGrade(grade: Grade) {
    const card = queue[cursor]
    const isFirstReview = reviewCount === 0
    const nextCursor = cursor + 1

    // Again: requeue card at end of session — no schedule change, no API call
    if (grade === 'again') {
      setQueue(prev => [...prev, card])
      setCursor(nextCursor)
      setReviewCount((n) => n + 1)
      history.pushState({ cursor: nextCursor }, '')
      return
    }

    const willFinish = nextCursor >= queue.length

    // Optimistically advance
    setCursor(nextCursor)
    setReviewCount((n) => n + 1)
    if (willFinish) setDone(true)
    history.pushState({ cursor: nextCursor }, '')

    // POST in background
    const res = await fetch('/api/srs/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.id,
        deckId: card.deckId,
        sessionDeckId,
        grade,
        sessionId,
        queue: queue.map((c) => c.id),
        cursor,
        isFirstReview,
        transcript: typedAnswer,
        correct: evaluateCorrect(typedAnswer, card),
        // The browser knows the user's real timezone; the server does not.
        localDate: localDate(),
      }),
    })
    const data = await res.json()
    if (data.sessionId) setSessionId(data.sessionId)
    if (data.streak) { setStreak(data.streak); notifyPracticed() }
    cardUpdatesRef.current[card.id] = data.nextState
    patchLocalCard(card.id, { srs: data.nextState })

    if (willFinish && data.sessionId) {
      await fetch('/api/srs/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.sessionId }),
      })
    }
  }

  // ── Custom interval handler ────────────────────────────────────────────────

  async function handleCustomGrade(days: number) {
    const card = queue[cursor]
    const isFirstReview = reviewCount === 0
    const nextCursor = cursor + 1
    const willFinish = nextCursor >= queue.length

    setCursor(nextCursor)
    setReviewCount((n) => n + 1)
    if (willFinish) setDone(true)
    history.pushState({ cursor: nextCursor }, '')

    const res = await fetch('/api/srs/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: card.id,
        deckId: card.deckId,
        sessionDeckId,
        grade: 'good',
        customDays: days,
        sessionId,
        queue: queue.map((c) => c.id),
        cursor,
        isFirstReview,
        transcript: typedAnswer,
        correct: evaluateCorrect(typedAnswer, card),
        // The browser knows the user's real timezone; the server does not.
        localDate: localDate(),
      }),
    })
    const data = await res.json()
    if (data.sessionId) setSessionId(data.sessionId)
    if (data.streak) { setStreak(data.streak); notifyPracticed() }
    cardUpdatesRef.current[card.id] = data.nextState
    patchLocalCard(card.id, { srs: data.nextState })

    if (willFinish && data.sessionId) {
      await fetch('/api/srs/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: data.sessionId }),
      })
    }
  }

  // ── Generate diagram handler ───────────────────────────────────────────────

  async function handleGenerateDiagram() {
    const card = queue[cursor]
    setIsGeneratingDiagram(true)
    setDiagramMessage('')
    try {
      const res = await fetch('/api/srs/generate-diagram', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cardId:      card.id,
          side:        diagramSide,
          instruction: diagramInstruction.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      if (diagramSide === 'front') {
        setFrontDiagramLocal(data.syntax)
        patchLocalCard(card.id, { frontDiagram: data.syntax })
      } else {
        setBackDiagramLocal(data.syntax)
        patchLocalCard(card.id, { backDiagram: data.syntax })
      }
      setDiagramMessage('Diagram generated.')
    } catch (e: unknown) {
      setDiagramMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsGeneratingDiagram(false)
    }
  }

  async function handleRemoveDiagram(side: 'front' | 'back') {
    const card = queue[cursor]
    if (side === 'front') {
      setFrontDiagramLocal(null)
      patchLocalCard(card.id, { frontDiagram: null })
    } else {
      setBackDiagramLocal(null)
      patchLocalCard(card.id, { backDiagram: null })
    }
    await fetch(`/api/srs/cards/${card.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [side === 'front' ? 'frontDiagram' : 'backDiagram']: null }),
    })
  }

  // ── Manual Mermaid save handler ────────────────────────────────────────────

  async function handleSaveManualDiagram(side: 'front' | 'back') {
    const card = queue[cursor]
    const syntax = side === 'front' ? manualDiagramFront.trim() : manualDiagramBack.trim()
    setIsSavingManualDiagram(true)
    setManualDiagramMessage('')
    try {
      await fetch(`/api/srs/cards/${card.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [side === 'front' ? 'frontDiagram' : 'backDiagram']: syntax || null }),
      })
      if (side === 'front') {
        setFrontDiagramLocal(syntax || null)
        patchLocalCard(card.id, { frontDiagram: syntax || null })
      } else {
        setBackDiagramLocal(syntax || null)
        patchLocalCard(card.id, { backDiagram: syntax || null })
      }
      setManualDiagramMessage('Saved.')
    } catch {
      setManualDiagramMessage('Save failed')
    } finally {
      setIsSavingManualDiagram(false)
    }
  }

  // ── SVG handlers ───────────────────────────────────────────────────────────

  async function handleGenerateSvg() {
    const card = queue[cursor]
    setIsGeneratingSvg(true)
    setSvgMessage('')
    try {
      const res = await fetch('/api/srs/generate-svg', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cardId:      card.id,
          side:        svgSide,
          instruction: svgInstruction.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (svgSide === 'front') {
        setFrontSvgLocal(data.svg)
        setManualSvgFront(data.svg)
        patchLocalCard(card.id, { frontSvg: data.svg })
      } else {
        setBackSvgLocal(data.svg)
        setManualSvgBack(data.svg)
        patchLocalCard(card.id, { backSvg: data.svg })
      }
      setSvgMessage('SVG generated.')
    } catch (e: unknown) {
      setSvgMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsGeneratingSvg(false)
    }
  }

  async function handleGenerateMathPlot() {
    const card = queue[cursor]
    setIsGeneratingSvg(true)
    setSvgMessage('')
    try {
      const res = await fetch('/api/srs/generate-math-plot', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          cardId:      card.id,
          side:        svgSide,
          instruction: svgInstruction.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (svgSide === 'front') {
        setFrontSvgLocal(data.svg)
        setManualSvgFront(data.svg)
        patchLocalCard(card.id, { frontSvg: data.svg })
      } else {
        setBackSvgLocal(data.svg)
        setManualSvgBack(data.svg)
        patchLocalCard(card.id, { backSvg: data.svg })
      }
      setSvgMessage('Math plot generated.')
    } catch (e: unknown) {
      setSvgMessage(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsGeneratingSvg(false)
    }
  }

  async function handleSaveManualSvg(side: 'front' | 'back') {
    const card = queue[cursor]
    const svg = (side === 'front' ? manualSvgFront : manualSvgBack).trim()
    try {
      await fetch(`/api/srs/cards/${card.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ [side === 'front' ? 'frontSvg' : 'backSvg']: svg || null }),
      })
      if (side === 'front') {
        setFrontSvgLocal(svg || null)
        patchLocalCard(card.id, { frontSvg: svg || null })
      } else {
        setBackSvgLocal(svg || null)
        patchLocalCard(card.id, { backSvg: svg || null })
      }
      setSvgMessage('Saved.')
    } catch {
      setSvgMessage('Save failed')
    }
  }

  async function handleRemoveSvg(side: 'front' | 'back') {
    const card = queue[cursor]
    if (side === 'front') {
      setFrontSvgLocal(null); setManualSvgFront('')
      patchLocalCard(card.id, { frontSvg: null })
    } else {
      setBackSvgLocal(null); setManualSvgBack('')
      patchLocalCard(card.id, { backSvg: null })
    }
    await fetch(`/api/srs/cards/${card.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ [side === 'front' ? 'frontSvg' : 'backSvg']: null }),
    })
  }

  // ── Connections panel handler ──────────────────────────────────────────────

  async function handleOpenConnections() {
    const card = queue[cursor]
    if (connectionsOpen) { setConnectionsOpen(false); return }
    setConnectionsOpen(true)
    if (connections.length) return // already loaded for this card
    setConnectionsLoading(true)
    try {
      const res  = await fetch(`/api/srs/graph/card/${card.id}/connections`)
      const data = await res.json()
      setConnections(data.connections ?? [])
    } finally {
      setConnectionsLoading(false)
    }
  }

  // ── Link picker handlers ───────────────────────────────────────────────────

  async function handleLinkSearch(q: string) {
    setLinkQuery(q)
    if (q.trim().length < 2) { setLinkResults([]); return }
    setLinkSearching(true)
    try {
      const res  = await fetch(`/api/srs/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      // Exclude the current card from results
      const card = queue[cursor]
      setLinkResults((data.results ?? []).filter((r: { id: string }) => r.id !== card.id))
    } finally {
      setLinkSearching(false)
    }
  }

  async function handleLinkCard(targetCardId: string) {
    const card = queue[cursor]
    setLinkingId(targetCardId)
    try {
      const res  = await fetch(`/api/srs/cards/${card.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetCardId }),
      })
      const data = await res.json()
      if (!res.ok) return
      // Add to connections list so it appears immediately
      const linked = linkResults.find(r => r.id === targetCardId)
      if (linked) {
        setConnections(prev => [...prev, {
          edgeId:    data.edgeId,
          direction: 'outgoing',
          nodeId:    '',
          kind:      'Card',
          label:     null,
          srsId:     linked.id,
          front:     linked.front,
          deckId:    linked.deckId,
        }])
      }
      setLinkPickerOpen(false)
      setLinkQuery('')
      setLinkResults([])
    } finally {
      setLinkingId(null)
    }
  }

  async function handleUnlink(edgeId: string) {
    const card = queue[cursor]
    await fetch(`/api/srs/cards/${card.id}/links/${edgeId}`, { method: 'DELETE' })
    setConnections(prev => prev.filter(c => c.edgeId !== edgeId))
  }

  // ── Add related cards handler ──────────────────────────────────────────────

  async function handleAddCards() {
    const card = queue[cursor]
    const validCards = newCards.filter((c) => c.front.trim() && c.back.trim())
    if (!validCards.length) return

    setIsAdding(true)
    setAddMessage('')
    try {
      const res = await fetch('/api/srs/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: card.deckId, cards: validCards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create cards')

      if (addToSession) {
        // Build StudyCard objects for the new cards and splice in after cursor+2
        const insertAt = Math.min(cursor + 2, queue.length)
        const toInsert: StudyCard[] = data.cards.map((c: any) => ({
          id: c.id,
          deckId: c.deckId,
          deckName: card.deckName,
          front: c.front,
          back: c.back,
          imageUrl: null,
          audioUrl: null,
          srs: { state: 'new', stability: 0, difficulty: 0, reps: 0, lapses: 0,
                 dueAt: new Date().toISOString(), lastReviewedAt: null },
          tags: [],
          accepted: [],
          strict: false,
        }))
        setQueue((prev) => {
          const next = [...prev]
          next.splice(insertAt, 0, ...toInsert)
          return next
        })
        setAddMessage(`${data.cards.length} card${data.cards.length !== 1 ? 's' : ''} added to session`)
      } else {
        setAddMessage(`${data.cards.length} card${data.cards.length !== 1 ? 's' : ''} saved`)
      }
      setNewCards([{ front: '', back: '' }])
    } catch (e: any) {
      setAddMessage(`Error: ${e.message}`)
    } finally {
      setIsAdding(false)
    }
  }

  // ── Generate breakdown cards handler ──────────────────────────────────────

  async function handleGenerateCards() {
    const card = queue[cursor]
    setIsGenerating(true)
    setGenerateMessage('')
    try {
      const res = await fetch('/api/srs/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, instruction: generateInstruction, targetCount: generateCount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setNewCards(data.cards)
      setGenerateMessage(`${data.cards.length} card${data.cards.length !== 1 ? 's' : ''} generated — review and save below`)
    } catch (e: any) {
      setGenerateMessage(`Error: ${e.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Edit handler ──────────────────────────────────────────────────────────

  async function handleSave() {
    const card = queue[cursor]
    setIsSaving(true)
    setSaveMessage('')
    try {
      const res = await fetch(`/api/srs/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          front:         editFront.trim(),
          back:          editBack.trim(),
          tags:          editTags.split(',').map((t) => t.trim()).filter(Boolean),
          accepted:      editAccepted.split(',').map((t) => t.trim()).filter(Boolean),
          strict:        editStrict,
          imageUrl:      frontImage?.url  ?? null,
          imagePath:     frontImage?.path ?? null,
          audioUrl:      frontAudio?.url  ?? null,
          audioPath:     frontAudio?.path ?? null,
          backImageUrl:  backImage?.url   ?? null,
          backImagePath: backImage?.path  ?? null,
          backAudioUrl:  backAudio?.url   ?? null,
          backAudioPath: backAudio?.path  ?? null,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const { card: updated } = await res.json()
      patchLocalCard(card.id, updated)
      setSaveMessage('Saved.')
    } catch (e: any) {
      setSaveMessage(`Error: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  async function handleDelete() {
    const card = queue[cursor]
    setIsDeleting(true)
    try {
      await fetch(`/api/srs/cards/${card.id}`, { method: 'DELETE' })
      // Remove from queue; cursor stays in place — next card slides in
      setQueue((prev) => prev.filter((c) => c.id !== card.id))
      setDeleteConfirm(false)
      // If we just removed the last card, done screen will render automatically
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Duplicate handler ─────────────────────────────────────────────────────

  async function handleDuplicate(mode: 'shallow' | 'deep') {
    const card = queue[cursor]
    setIsDuplicating(true)
    setDuplicateMsg('')
    try {
      const res = await fetch(`/api/srs/cards/${card.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Duplicate failed')
      window.open(`/srs/${data.deckId}/cards/${data.cardId}`, '_blank')
      setDuplicateMsg('Duplicated!')
    } catch (e: any) {
      setDuplicateMsg(`Error: ${e.message}`)
    } finally {
      setIsDuplicating(false)
    }
  }

  // ── Dismiss handler ───────────────────────────────────────────────────────

  async function handleDismiss() {
    const card = queue[cursor]
    await fetch(`/api/srs/cards/${card.id}/dismiss`, { method: 'POST' })
    // Remove from session queue — next card slides in, no grade recorded
    setQueue(prev => prev.filter((_, i) => i !== cursor))
  }

  // ── Leech toggle ──────────────────────────────────────────────────────────

  async function handleMarkLeech() {
    const card = queue[cursor]
    const isLeech = card.tags.includes('leech')
    const newTags = isLeech
      ? card.tags.filter(t => t !== 'leech')
      : [...card.tags, 'leech']
    patchLocalCard(card.id, { tags: newTags })
    fetch(`/api/srs/cards/${card.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    }).catch(() => {})
  }

  // ── Reset schedule handler ────────────────────────────────────────────────

  async function handleReset() {
    const card = queue[cursor]
    setIsResetting(true)
    try {
      const res = await fetch(`/api/srs/cards/${card.id}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      const { newState } = await res.json()
      patchLocalCard(card.id, { srs: newState })
      cardUpdatesRef.current[card.id] = newState
      setResetConfirm(false)
    } finally {
      setIsResetting(false)
    }
  }

  // ── Refine handler ────────────────────────────────────────────────────────

  async function handleRefine() {
    const card = queue[cursor]
    setIsRefining(true)
    setRefineMessage('')
    try {
      const res = await fetch('/api/srs/refine-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, instruction: refineInstruction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      patchLocalCard(card.id, {
        front: data.front,
        back: data.back,
        tags: data.tags ?? card.tags,
        accepted: data.accepted ?? card.accepted,
      })
      setRefineMessage('Card updated.')
    } catch (e: any) {
      setRefineMessage(`Error: ${e.message}`)
    } finally {
      setIsRefining(false)
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (!revealed) setRevealed(true)
          break
        case 'j': if (revealed) handleGrade('again'); break
        case 'k': if (revealed) handleGrade('hard'); break
        case 'l': if (revealed) handleGrade('good'); break
        case ';': if (revealed) handleGrade('easy'); break
        case 'ArrowLeft': case ',': goPrev(); break
        case 'ArrowRight': case '.': goNext(); break
        case 'r':
          // First press arms the confirm, second press resets.
          if (!revealed) break
          if (!resetConfirm) setResetConfirm(true)
          else if (!isResetting) handleReset()
          break
        case 'Enter':
          // Only meaningful while the reset confirm is armed.
          if (resetConfirm && !isResetting) {
            e.preventDefault()
            handleReset()
          }
          break
        case 'Escape': if (resetConfirm) setResetConfirm(false); break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }) // intentionally no deps — always uses latest state via closure

  // ── Done screen ───────────────────────────────────────────────────────────

  if (done || queue.length === 0) {
    const celebrated = done && reviewCount > 0
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
        {celebrated && <Confetti />}
        <div className="text-center">
          <div className="text-5xl mb-4">{celebrated ? '🎉' : '✓'}</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {queue.length === 0 ? 'Nothing due!' : 'Session complete'}
          </h2>
          {reviewCount > 0 && (
            <p className="text-gray-500 mb-3">{reviewCount} card{reviewCount !== 1 ? 's' : ''} reviewed</p>
          )}
          {streak && streak.count > 0 && (
            <p className="text-lg font-semibold text-orange-500 mb-6">
              🔥 {streak.count} day streak{streak.count === streak.longest ? ' — best ever!' : ''}
            </p>
          )}
          <a
            href={backHref}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Back to Decks
          </a>
        </div>
      </div>
    )
  }

  const card = queue[cursor]
  const intervals = revealed ? previewIntervals(card.srs) : null
  const correctness = revealed ? evaluateCorrect(typedAnswer, card) : null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <a href={backHref} className="text-sm text-blue-600 hover:underline">← Decks</a>
        </div>
        {streak && streak.count > 0 && (
          <span className="text-sm font-semibold text-orange-500" title={`${streak.longest} day best`}>
            🔥 {streak.count}
          </span>
        )}
        <span className="text-sm text-gray-500 font-medium tabular-nums">
          {cursor + 1} / {queue.length}
          {dueTotal != null && dueTotal > queue.length && (
            <span className="text-gray-400 font-normal"> of {dueTotal} due</span>
          )}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={goPrev}
            disabled={cursor === 0}
            className="px-2 py-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-lg leading-none"
            title="Previous (← or ,)"
          >‹</button>
          <button
            onClick={goNext}
            disabled={cursor >= queue.length - 1}
            className="px-2 py-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 text-lg leading-none"
            title="Next (→ or .)"
          >›</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-1 bg-blue-500 transition-all duration-300"
          style={{ width: `${(cursor / queue.length) * 100}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center px-4 py-6 max-w-2xl mx-auto w-full">

        {/* Deck context — kept just above the card so it stays in view with the Q/A */}
        <div className="w-full flex justify-start mb-2">
          <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-2.5 py-0.5 rounded-full truncate max-w-full">
            {card.deckName}
          </span>
        </div>

        {/* Card front */}
        <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center mb-4">
          <WikiText text={card.front} deckId={card.deckId} context={`Front: ${card.front}\nBack: ${card.back}`} className="text-lg text-gray-800 leading-relaxed" />
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" className="mt-4 max-h-48 mx-auto rounded-lg object-contain" />
          )}
          {card.audioUrl && (
            <audio controls src={card.audioUrl} className="mt-4 mx-auto w-full max-w-xs" />
          )}
          {(frontDiagramLocal ?? card.frontDiagram) && (
            <div className="mt-4 text-left">
              <MermaidDiagram syntax={(frontDiagramLocal ?? card.frontDiagram)!} />
            </div>
          )}
          {(frontSvgLocal ?? card.frontSvg) && (
            <div className="mt-4">
              <SvgDisplay svg={(frontSvgLocal ?? card.frontSvg)!} />
            </div>
          )}
        </div>

        {/* Answer input (before reveal) */}
        {!revealed && (
          <div className="w-full flex flex-col gap-3">
            <textarea
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Type your answer…"
              rows={3}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={() => setRevealed(true)}
              className="w-full bg-gray-900 hover:bg-gray-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Reveal Answer <span className="text-gray-400 text-xs ml-1">[Space]</span>
            </button>
          </div>
        )}

        {/* Revealed state */}
        {revealed && (
          <div className="w-full flex flex-col gap-4">

            {/* Back panel */}
            <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <WikiText text={card.back} deckId={card.deckId} context={`Front: ${card.front}\nBack: ${card.back}`} className="text-lg text-gray-700 leading-relaxed" />
              {card.backImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.backImageUrl} alt="" className="mt-4 max-h-48 mx-auto rounded-lg object-contain" />
              )}
              {card.backAudioUrl && (
                <audio controls src={card.backAudioUrl} className="mt-4 mx-auto w-full max-w-xs" />
              )}
              {(backDiagramLocal ?? card.backDiagram) && (
                <div className="mt-4 text-left">
                  <MermaidDiagram syntax={(backDiagramLocal ?? card.backDiagram)!} />
                </div>
              )}
              {(backSvgLocal ?? card.backSvg) && (
                <div className="mt-4">
                  <SvgDisplay svg={(backSvgLocal ?? card.backSvg)!} />
                </div>
              )}
              {card.accepted.length > 0 && (
                <p className="text-xs text-gray-400 mt-3">
                  Accepted: {card.accepted.join(', ')}
                </p>
              )}
              {typedAnswer.trim() && (
                <div className={`mt-3 text-sm font-medium flex items-center gap-2 ${correctness === true ? 'text-green-600' : correctness === false ? 'text-red-500' : 'text-gray-500'}`}>
                  <span>{correctness === true ? '✓ Correct' : correctness === false ? '✗ Incorrect' : ''}</span>
                  <span className="font-normal text-gray-500">Your answer: {typedAnswer}</span>
                </div>
              )}
            </div>

            {/* Grade buttons */}
            <div className="flex gap-2 w-full">
              {GRADE_CONFIG.map(({ grade, label, key, color }) => (
                <button
                  key={grade}
                  onClick={() => handleGrade(grade)}
                  className={`flex-1 flex flex-col items-center ${color} text-white font-semibold py-3 rounded-xl transition-colors`}
                >
                  <span>{label}</span>
                  <span className="text-xs font-normal opacity-75 mt-0.5">
                    [{key}] {intervals ? intervals[grade] : ''}
                  </span>
                </button>
              ))}
            </div>

            {/* Dismiss + leech row */}
            <div className="flex items-center justify-between">
              <button
                onClick={handleMarkLeech}
                className={`text-xs transition-colors ${
                  queue[cursor]?.tags.includes('leech')
                    ? 'text-orange-500 hover:text-orange-700'
                    : 'text-gray-400 hover:text-orange-500'
                }`}
                title="Tag this card as a leech to review and atomize later"
              >
                {queue[cursor]?.tags.includes('leech') ? '🪸 Leeched' : '🪸 Mark leech'}
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                title="Remove from today's session — no grade or penalty, due tomorrow"
              >
                ⊘ Dismiss till tomorrow
              </button>
            </div>

            {/* Custom interval + reset row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 shrink-0">Schedule in</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={customDays}
                onChange={(e) => {
                  const v = e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1)
                  setCustomDays(v as number | '')
                }}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <span className="text-xs text-gray-400 shrink-0">day{customDays === 1 ? '' : 's'}</span>
              <button
                onClick={() => customDays !== '' && handleCustomGrade(customDays)}
                disabled={customDays === ''}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                Schedule
              </button>

              <span className="text-gray-200 select-none">|</span>

              {/* Reset schedule — inline confirm */}
              {!resetConfirm ? (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="text-xs text-amber-500 hover:text-amber-700 transition-colors"
                  title="Reset this card to new [r]"
                >
                  ↺ Reset schedule <span className="opacity-60">[r]</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-amber-600">Reset to new?</span>
                  <button
                    onClick={handleReset}
                    disabled={isResetting}
                    className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                  >
                    {isResetting ? '…' : 'Yes [↵]'}
                  </button>
                  <button
                    onClick={() => setResetConfirm(false)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="Cancel [esc]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Edit panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setEditOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>Edit card</span>
                <span className="text-gray-400">{editOpen ? '▲' : '▼'}</span>
              </button>
              {editOpen && (
                <div className="px-4 py-4 bg-white flex flex-col gap-3">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Front</label>
                  <textarea
                    value={editFront}
                    onChange={(e) => setEditFront(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <MediaUploadZone
                      label="Front image"
                      accept="image"
                      value={frontImage}
                      cardId={queue[cursor]?.id ?? ''}
                      onChange={setFrontImage}
                      listenPaste={true}
                    />
                    <MediaUploadZone
                      label="Front audio"
                      accept="audio"
                      value={frontAudio}
                      cardId={queue[cursor]?.id ?? ''}
                      onChange={setFrontAudio}
                      listenPaste={false}
                    />
                  </div>

                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Back</label>
                  <textarea
                    value={editBack}
                    onChange={(e) => setEditBack(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <MediaUploadZone
                      label="Back image"
                      accept="image"
                      value={backImage}
                      cardId={queue[cursor]?.id ?? ''}
                      onChange={setBackImage}
                      listenPaste={false}
                    />
                    <MediaUploadZone
                      label="Back audio"
                      accept="audio"
                      value={backAudio}
                      cardId={queue[cursor]?.id ?? ''}
                      onChange={setBackAudio}
                      listenPaste={false}
                    />
                  </div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags (comma separated)</label>
                  <input
                    type="text"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Accepted answers (comma separated)</label>
                  <input
                    type="text"
                    value={editAccepted}
                    onChange={(e) => setEditAccepted(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editStrict}
                      onChange={(e) => setEditStrict(e.target.checked)}
                      className="rounded"
                    />
                    Strict (exact match only)
                  </label>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => handleDuplicate('shallow')}
                        disabled={isDuplicating}
                        title="Duplicate text only (no media)"
                        className="border border-gray-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-50 text-gray-600 hover:text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                      >
                        Copy shallow
                      </button>
                      <button
                        onClick={() => handleDuplicate('deep')}
                        disabled={isDuplicating}
                        title="Duplicate text + all media (images, audio, diagrams, SVGs)"
                        className="border border-gray-200 hover:border-indigo-300 bg-white hover:bg-indigo-50 disabled:opacity-50 text-gray-600 hover:text-indigo-700 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
                      >
                        Copy deep
                      </button>
                      {(saveMessage || duplicateMsg) && (
                        <span className={`text-sm ${(saveMessage || duplicateMsg).startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                          {saveMessage || duplicateMsg}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Delete card */}
                      {!deleteConfirm ? (
                        <button
                          onClick={() => setDeleteConfirm(true)}
                          className="text-sm text-red-400 hover:text-red-600 transition-colors"
                        >
                          Delete card
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500">Delete forever?</span>
                          <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            {isDeleting ? 'Deleting…' : 'Yes, delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(false)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Refine with Claude panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-6">
              <button
                onClick={() => setRefineOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>✦ Refine with Claude</span>
                <span className="text-gray-400">{refineOpen ? '▲' : '▼'}</span>
              </button>
              {refineOpen && (
                <div className="px-4 py-4 bg-white flex flex-col gap-3">
                  <textarea
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder="e.g. add the formal LaTeX definition, simplify wording, add an example…"
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleRefine}
                      disabled={isRefining || !refineInstruction.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {isRefining ? 'Refining…' : 'Refine with Claude'}
                    </button>
                    {refineMessage && (
                      <span className={`text-sm ${refineMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                        {refineMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Atomize panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-6">
              <button
                onClick={() => setAtomizeOpen(true)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>⚡ Atomize with Woźniak rules</span>
                <span className="text-gray-400 text-xs">splits into atomic cards</span>
              </button>
            </div>

            {atomizeOpen && (
              <AtomizeModal
                cardId={card.id}
                deckId={card.deckId}
                onClose={() => setAtomizeOpen(false)}
                onReplaced={() => {
                  setAtomizeOpen(false)
                  // Card was deleted by the modal — remove it from the queue
                  setQueue(prev => prev.filter(c => c.id !== card.id))
                }}
              />
            )}

            {/* Diagram panel (Mermaid — Claude or manual) */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-2">
              <button
                onClick={() => setDiagramOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>✦ Diagram (Mermaid)</span>
                <span className="text-gray-400">{diagramOpen ? '▲' : '▼'}</span>
              </button>
              {diagramOpen && (
                <div className="px-4 py-4 bg-white flex flex-col gap-3">

                  {/* Tab bar */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm self-start">
                    {(['claude', 'manual'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setDiagramTab(t)}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          diagramTab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {t === 'claude' ? '✦ Claude' : 'Manual'}
                      </button>
                    ))}
                  </div>

                  {diagramTab === 'claude' ? (
                    <>
                      {/* Side selector */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0">Attach to</span>
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                          {(['front', 'back'] as const).map((s) => (
                            <button
                              key={s}
                              onClick={() => setDiagramSide(s)}
                              className={`px-3 py-1.5 font-medium transition-colors ${
                                diagramSide === s
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Optional instruction */}
                      <textarea
                        value={diagramInstruction}
                        onChange={(e) => setDiagramInstruction(e.target.value)}
                        placeholder="Optional instruction, e.g. 'use a flowchart', 'show the sequence', 'focus on relationships'…"
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />

                      {/* Generate button + status */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={handleGenerateDiagram}
                          disabled={isGeneratingDiagram}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                          {isGeneratingDiagram ? 'Generating…' : '✦ Generate with Claude'}
                        </button>
                        {diagramMessage && (
                          <span className={`text-sm ${diagramMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                            {diagramMessage}
                          </span>
                        )}
                      </div>

                      {/* Remove buttons for existing diagrams */}
                      {(frontDiagramLocal ?? queue[cursor]?.frontDiagram) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Front diagram attached</span>
                          <button onClick={() => handleRemoveDiagram('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                        </div>
                      )}
                      {(backDiagramLocal ?? queue[cursor]?.backDiagram) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Back diagram attached</span>
                          <button onClick={() => handleRemoveDiagram('back')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Manual — Front */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Front diagram</label>
                        <textarea
                          value={manualDiagramFront}
                          onChange={(e) => setManualDiagramFront(e.target.value)}
                          placeholder={'graph LR\n  A[Concept] --> B[Detail]'}
                          rows={5}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {manualDiagramFront.trim() && (
                          <div className="border border-gray-100 rounded-lg p-2">
                            <MermaidDiagram syntax={manualDiagramFront} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveManualDiagram('front')}
                            disabled={isSavingManualDiagram}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Save front
                          </button>
                          {manualDiagramFront.trim() && (
                            <button onClick={() => { setManualDiagramFront(''); handleRemoveDiagram('front') }} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                          )}
                        </div>
                      </div>

                      {/* Manual — Back */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Back diagram</label>
                        <textarea
                          value={manualDiagramBack}
                          onChange={(e) => setManualDiagramBack(e.target.value)}
                          placeholder={'graph LR\n  A[Concept] --> B[Detail]'}
                          rows={5}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {manualDiagramBack.trim() && (
                          <div className="border border-gray-100 rounded-lg p-2">
                            <MermaidDiagram syntax={manualDiagramBack} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveManualDiagram('back')}
                            disabled={isSavingManualDiagram}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Save back
                          </button>
                          {manualDiagramBack.trim() && (
                            <button onClick={() => { setManualDiagramBack(''); handleRemoveDiagram('back') }} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                          )}
                        </div>
                      </div>

                      {manualDiagramMessage && (
                        <span className={`text-sm ${manualDiagramMessage.startsWith('Save failed') ? 'text-red-500' : 'text-green-600'}`}>
                          {manualDiagramMessage}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* SVG panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-2">
              <button
                onClick={() => setSvgOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>✦ SVG visual</span>
                <span className="text-gray-400">{svgOpen ? '▲' : '▼'}</span>
              </button>
              {svgOpen && (
                <div className="px-4 py-4 bg-white flex flex-col gap-3">

                  {/* Tab bar */}
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm self-start">
                    {(['claude', 'math', 'manual'] as const).map((t) => (
                      <button key={t} onClick={() => setSvgTab(t)}
                        className={`px-3 py-1.5 font-medium transition-colors ${svgTab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {t === 'claude' ? '✦ Diagram' : t === 'math' ? '∫ Math Plot' : 'Manual'}
                      </button>
                    ))}
                  </div>

                  {/* Side selector — shared by Claude + Math */}
                  {(svgTab === 'claude' || svgTab === 'math') && (
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0">Attach to</span>
                      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                        {(['front', 'back'] as const).map((s) => (
                          <button key={s} onClick={() => setSvgSide(s)}
                            className={`px-3 py-1.5 font-medium transition-colors ${svgSide === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {svgTab === 'claude' ? (
                    <>
                      <textarea value={svgInstruction} onChange={(e) => setSvgInstruction(e.target.value)}
                        placeholder="Optional instruction, e.g. 'show a timeline', 'draw a tree diagram'…"
                        rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <div className="flex items-center gap-3 flex-wrap">
                        <button onClick={handleGenerateSvg} disabled={isGeneratingSvg}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                          {isGeneratingSvg ? 'Generating…' : '✦ Generate with Claude'}
                        </button>
                        {svgMessage && <span className={`text-sm ${svgMessage.startsWith('Error') || svgMessage === 'Save failed' ? 'text-red-500' : 'text-green-600'}`}>{svgMessage}</span>}
                      </div>
                      {(frontSvgLocal ?? queue[cursor]?.frontSvg) && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Front SVG attached</span><button onClick={() => handleRemoveSvg('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                      {(backSvgLocal ?? queue[cursor]?.backSvg)   && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Back SVG attached</span><button onClick={() => handleRemoveSvg('back')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                    </>
                  ) : svgTab === 'math' ? (
                    <>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Precise mathematical plots — functions, distributions, integrals, parametric curves.
                        Claude computes sample values before drawing. Uses Opus for accuracy.
                      </p>
                      <textarea value={svgInstruction} onChange={(e) => setSvgInstruction(e.target.value)}
                        placeholder="e.g. 'binomial B(10, 0.3)', 'normal PDF μ=0 σ=1', '∫₀² x² dx', 'Riemann zeta ζ(s) for s∈[1.5,6]'…"
                        rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                      <div className="flex items-center gap-3 flex-wrap">
                        <button onClick={handleGenerateMathPlot} disabled={isGeneratingSvg}
                          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                          {isGeneratingSvg ? 'Computing…' : '∫ Generate math plot'}
                        </button>
                        {svgMessage && <span className={`text-sm ${svgMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{svgMessage}</span>}
                      </div>
                      {(frontSvgLocal ?? queue[cursor]?.frontSvg) && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Front plot attached</span><button onClick={() => handleRemoveSvg('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                      {(backSvgLocal ?? queue[cursor]?.backSvg)   && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Back plot attached</span><button onClick={() => handleRemoveSvg('back')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                    </>
                  ) : (
                    <>
                      {/* Manual SVG — Front */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Front SVG</label>
                        <textarea
                          value={manualSvgFront}
                          onChange={(e) => setManualSvgFront(e.target.value)}
                          placeholder='<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">…</svg>'
                          rows={6}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {manualSvgFront.trim() && (
                          <div className="border border-gray-100 rounded-lg p-2">
                            <SvgDisplay svg={manualSvgFront} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveManualSvg('front')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Save front
                          </button>
                          {manualSvgFront.trim() && (
                            <button onClick={() => handleRemoveSvg('front')} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                          )}
                        </div>
                      </div>

                      {/* Manual SVG — Back */}
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Back SVG</label>
                        <textarea
                          value={manualSvgBack}
                          onChange={(e) => setManualSvgBack(e.target.value)}
                          placeholder='<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">…</svg>'
                          rows={6}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {manualSvgBack.trim() && (
                          <div className="border border-gray-100 rounded-lg p-2">
                            <SvgDisplay svg={manualSvgBack} />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveManualSvg('back')}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Save back
                          </button>
                          {manualSvgBack.trim() && (
                            <button onClick={() => handleRemoveSvg('back')} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                          )}
                        </div>
                      </div>

                      {svgMessage && (
                        <span className={`text-sm ${svgMessage.startsWith('Error') || svgMessage === 'Save failed' ? 'text-red-500' : 'text-green-600'}`}>
                          {svgMessage}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Add related cards panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-6">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>+ Add related cards</span>
                <span className="text-gray-400">{addOpen ? '▲' : '▼'}</span>
              </button>
              {addOpen && (
                <div className="px-4 py-4 bg-white flex flex-col gap-4">

                  {/* Claude auto-generate section */}
                  <div className="flex flex-col gap-2 pb-4 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">✦ Auto-generate breakdown</p>
                    <textarea
                      value={generateInstruction}
                      onChange={(e) => setGenerateInstruction(e.target.value)}
                      placeholder="Optional instruction (leave blank to auto-break down the answer into sub-cards)…"
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-gray-500">Cards:</label>
                        <input
                          type="number"
                          value={generateCount}
                          onChange={(e) => setGenerateCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                          min={1}
                          max={20}
                          className="w-14 rounded border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>
                      <button
                        onClick={handleGenerateCards}
                        disabled={isGenerating}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        {isGenerating ? 'Generating…' : '✦ Generate with Claude'}
                      </button>
                      {generateMessage && (
                        <span className={`text-sm ${generateMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                          {generateMessage}
                        </span>
                      )}
                    </div>
                  </div>

                  {newCards.map((nc, i) => (
                    <div key={i} className="flex flex-col gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                      {newCards.length > 1 && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400 font-medium">Card {i + 1}</span>
                          <button
                            onClick={() => setNewCards((prev) => prev.filter((_, j) => j !== i))}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <input
                        type="text"
                        value={nc.front}
                        onChange={(e) => setNewCards((prev) => prev.map((c, j) => j === i ? { ...c, front: e.target.value } : c))}
                        placeholder="Front (question)"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <textarea
                        value={nc.back}
                        onChange={(e) => setNewCards((prev) => prev.map((c, j) => j === i ? { ...c, back: e.target.value } : c))}
                        placeholder="Back (answer)"
                        rows={2}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                    </div>
                  ))}

                  <button
                    onClick={() => setNewCards((prev) => [...prev, { front: '', back: '' }])}
                    className="text-sm text-blue-600 hover:text-blue-800 self-start"
                  >
                    + Add another card
                  </button>

                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addToSession}
                      onChange={(e) => setAddToSession(e.target.checked)}
                      className="rounded"
                    />
                    Add to this session (study right away)
                  </label>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAddCards}
                      disabled={isAdding || !newCards.some((c) => c.front.trim() && c.back.trim())}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                      {isAdding ? 'Saving…' : 'Save cards'}
                    </button>
                    {addMessage && (
                      <span className={`text-sm ${addMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                        {addMessage}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Connections panel */}
            <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-6">
              <button
                onClick={handleOpenConnections}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
              >
                <span>⟳ Linked cards {connections.length > 0 && <span className="ml-1 text-xs text-gray-400">({connections.length})</span>}</span>
                <span className="text-gray-400">{connectionsOpen ? '▲' : '▼'}</span>
              </button>
              {connectionsOpen && (
                <div className="px-4 py-3 bg-white flex flex-col gap-2">

                  {connectionsLoading ? (
                    <p className="text-xs text-gray-400 animate-pulse">Loading…</p>
                  ) : (
                    <>
                      {connections.length === 0 && !linkPickerOpen && (
                        <p className="text-xs text-gray-400">No links yet.</p>
                      )}

                      {connections.map((c) => (
                        <div key={c.edgeId} className="flex items-center gap-2 py-1 border-b border-gray-50 last:border-0">
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                            c.kind === 'Deck' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {c.kind}
                          </span>
                          <div className="flex-1 min-w-0">
                            {c.kind === 'Card' && c.srsId ? (
                              <a
                                href={`/srs/${c.deckId}/cards/${c.srsId}`}
                                className="text-xs font-medium text-gray-800 hover:text-indigo-600 truncate block"
                                title={c.front}
                              >
                                {c.front && c.front.length > 60 ? c.front.slice(0, 57) + '…' : c.front}
                              </a>
                            ) : c.kind === 'Deck' && c.srsId ? (
                              <a
                                href={`/srs/${c.srsId}`}
                                className="text-xs font-medium text-gray-800 hover:text-indigo-600 truncate block"
                              >
                                {c.name}
                              </a>
                            ) : (
                              <span className="text-xs text-gray-500 truncate block">{c.nodeId}</span>
                            )}
                            {c.label && (
                              <span className="text-[10px] text-gray-400 italic">{c.label}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleUnlink(c.edgeId)}
                            title="Remove link"
                            className="text-gray-300 hover:text-red-400 text-xs shrink-0 transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Link picker */}
                  {linkPickerOpen ? (
                    <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
                      <input
                        autoFocus
                        type="text"
                        value={linkQuery}
                        onChange={(e) => handleLinkSearch(e.target.value)}
                        placeholder="Search cards to link…"
                        className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      {linkSearching && <p className="text-[10px] text-gray-400 animate-pulse">Searching…</p>}
                      {linkResults.length > 0 && (
                        <ul className="flex flex-col gap-1">
                          {linkResults.map((r) => (
                            <li key={r.id}>
                              <button
                                onClick={() => handleLinkCard(r.id)}
                                disabled={linkingId === r.id}
                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                              >
                                <span className="text-xs font-medium text-gray-800 block truncate">{r.front}</span>
                                <span className="text-[10px] text-gray-400">{r.deckName}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!linkSearching && linkQuery.length >= 2 && linkResults.length === 0 && (
                        <p className="text-[10px] text-gray-400">No cards found.</p>
                      )}
                      <button
                        onClick={() => { setLinkPickerOpen(false); setLinkQuery(''); setLinkResults([]) }}
                        className="text-xs text-gray-400 hover:text-gray-600 self-start"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setLinkPickerOpen(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 self-start mt-1"
                    >
                      + Link a card
                    </button>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
