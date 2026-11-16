'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LatexText } from '@/components/srs/LatexText'
import { WikiText } from '@/components/srs/WikiText'
import { MediaUploadZone, type MediaValue } from '@/components/srs/MediaUploadZone'
import { MermaidDiagram } from '@/components/srs/MermaidDiagram'
import { SvgDisplay } from '@/components/srs/SvgDisplay'

type Card = {
  id: string
  front: string
  back: string
  tags: string[]
  accepted: string[]
  strict: boolean
  deckId: string
  deckName: string
  imageUrl:      string | null
  imagePath:     string | null
  audioUrl:      string | null
  audioPath:     string | null
  backImageUrl:  string | null
  backImagePath: string | null
  backAudioUrl:  string | null
  backAudioPath: string | null
  frontDiagram:  string | null
  backDiagram:   string | null
  frontSvg:      string | null
  backSvg:       string | null
}

export default function CardEditPage({
  params,
}: {
  params: Promise<{ deckId: string; cardId: string }>
}) {
  const router = useRouter()
  const [deckId, setDeckId] = useState('')
  const [cardId, setCardId] = useState('')
  const [card,   setCard]   = useState<Card | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  // ── Form state ─────────────────────────────────────────────────────────────
  const [front,    setFront]    = useState('')
  const [back,     setBack]     = useState('')
  const [tags,     setTags]     = useState('')
  const [accepted, setAccepted] = useState('')
  const [strict,   setStrict]   = useState(false)
  const [preview,  setPreview]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  // ── Media state ────────────────────────────────────────────────────────────
  const [frontImage, setFrontImage] = useState<MediaValue | null>(null)
  const [frontAudio, setFrontAudio] = useState<MediaValue | null>(null)
  const [backImage,  setBackImage]  = useState<MediaValue | null>(null)
  const [backAudio,  setBackAudio]  = useState<MediaValue | null>(null)

  // ── Delete state ───────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isDeleting,    setIsDeleting]    = useState(false)

  // ── Duplicate state ────────────────────────────────────────────────────────
  const [isDuplicating, setIsDuplicating] = useState(false)
  const [duplicateMsg,  setDuplicateMsg]  = useState('')

  // ── Refine state ───────────────────────────────────────────────────────────
  const [refineOpen,        setRefineOpen]        = useState(false)
  const [refineInstruction, setRefineInstruction] = useState('')
  const [isRefining,        setIsRefining]        = useState(false)
  const [refineMessage,     setRefineMessage]     = useState('')

  // ── Diagram state ──────────────────────────────────────────────────────────
  const [diagramOpen,           setDiagramOpen]           = useState(false)
  const [diagramTab,            setDiagramTab]            = useState<'claude' | 'manual'>('claude')
  const [diagramSide,           setDiagramSide]           = useState<'front' | 'back'>('back')
  const [diagramInstruction,    setDiagramInstruction]    = useState('')
  const [isGeneratingDiagram,   setIsGeneratingDiagram]   = useState(false)
  const [diagramMessage,        setDiagramMessage]        = useState('')
  const [frontDiagram,          setFrontDiagram]          = useState<string | null>(null)
  const [backDiagram,           setBackDiagram]           = useState<string | null>(null)
  const [manualDiagramFront,    setManualDiagramFront]    = useState('')
  const [manualDiagramBack,     setManualDiagramBack]     = useState('')
  const [isSavingManualDiagram, setIsSavingManualDiagram] = useState(false)
  const [manualDiagramMessage,  setManualDiagramMessage]  = useState('')

  // ── SVG state ──────────────────────────────────────────────────────────────
  const [svgOpen,         setSvgOpen]         = useState(false)
  const [svgTab,          setSvgTab]          = useState<'claude' | 'math' | 'manual'>('claude')
  const [svgSide,         setSvgSide]         = useState<'front' | 'back'>('back')
  const [svgInstruction,  setSvgInstruction]  = useState('')
  const [isGeneratingSvg, setIsGeneratingSvg] = useState(false)
  const [svgMessage,      setSvgMessage]      = useState('')
  const [frontSvg,        setFrontSvg]        = useState<string | null>(null)
  const [backSvg,         setBackSvg]         = useState<string | null>(null)
  const [manualSvgFront,  setManualSvgFront]  = useState('')
  const [manualSvgBack,   setManualSvgBack]   = useState('')

  // ── Add related cards state ────────────────────────────────────────────────
  const [addOpen,              setAddOpen]              = useState(false)
  const [newCards,             setNewCards]             = useState<{ front: string; back: string }[]>([{ front: '', back: '' }])
  const [isAdding,             setIsAdding]             = useState(false)
  const [addMessage,           setAddMessage]           = useState('')
  const [generateInstruction,  setGenerateInstruction]  = useState('')
  const [generateCount,        setGenerateCount]        = useState(5)
  const [isGenerating,         setIsGenerating]         = useState(false)
  const [generateMessage,      setGenerateMessage]      = useState('')

  // ── Load params ────────────────────────────────────────────────────────────
  useEffect(() => {
    params.then(({ deckId: d, cardId: c }) => {
      setDeckId(d)
      setCardId(c)
    })
  }, [params])

  // ── Load card ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cardId) return
    fetch(`/api/srs/cards/${cardId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        const c: Card = data.card
        setCard(c)
        setFront(c.front)
        setBack(c.back)
        setTags(c.tags.join(', '))
        setAccepted(c.accepted.join(', '))
        setStrict(c.strict)
        setFrontImage(c.imageUrl    ? { url: c.imageUrl,    path: c.imagePath    ?? '' } : null)
        setFrontAudio(c.audioUrl    ? { url: c.audioUrl,    path: c.audioPath    ?? '' } : null)
        setBackImage (c.backImageUrl ? { url: c.backImageUrl, path: c.backImagePath ?? '' } : null)
        setBackAudio (c.backAudioUrl ? { url: c.backAudioUrl, path: c.backAudioPath ?? '' } : null)
        setFrontDiagram(c.frontDiagram ?? null)
        setBackDiagram (c.backDiagram  ?? null)
        setManualDiagramFront(c.frontDiagram ?? '')
        setManualDiagramBack (c.backDiagram  ?? '')
        setFrontSvg(c.frontSvg ?? null)
        setBackSvg (c.backSvg  ?? null)
        setManualSvgFront(c.frontSvg ?? '')
        setManualSvgBack (c.backSvg  ?? '')
      })
      .catch(() => setError('Failed to load card'))
      .finally(() => setLoading(false))
  }, [cardId])

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/srs/cards/${cardId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error((await res.json()).error ?? 'Request failed')
    return res.json()
  }

  // ── Save handler ───────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const data = await patch({
        front:         front.trim(),
        back:          back.trim(),
        tags:          tags.split(',').map((t) => t.trim()).filter(Boolean),
        accepted:      accepted.split(',').map((t) => t.trim()).filter(Boolean),
        strict,
        imageUrl:      frontImage?.url  ?? null,
        imagePath:     frontImage?.path ?? null,
        audioUrl:      frontAudio?.url  ?? null,
        audioPath:     frontAudio?.path ?? null,
        backImageUrl:  backImage?.url   ?? null,
        backImagePath: backImage?.path  ?? null,
        backAudioUrl:  backAudio?.url   ?? null,
        backAudioPath: backAudio?.path  ?? null,
      })
      setCard((prev) => prev ? { ...prev, ...data.card } : prev)
      setSaveMsg('Saved.')
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Duplicate handler ──────────────────────────────────────────────────────

  async function handleDuplicate(mode: 'shallow' | 'deep') {
    setIsDuplicating(true)
    setDuplicateMsg('')
    try {
      const res = await fetch(`/api/srs/cards/${cardId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Duplicate failed')
      router.push(`/srs/${data.deckId}/cards/${data.cardId}`)
    } catch (e: any) {
      setDuplicateMsg(`Error: ${e.message}`)
      setIsDuplicating(false)
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────────────

  async function handleDelete() {
    setIsDeleting(true)
    try {
      await fetch(`/api/srs/cards/${cardId}`, { method: 'DELETE' })
      router.push(`/srs/${deckId}`)
    } catch {
      setSaveMsg('Delete failed')
      setIsDeleting(false)
    }
  }

  // ── Refine handler ─────────────────────────────────────────────────────────

  async function handleRefine() {
    setIsRefining(true)
    setRefineMessage('')
    try {
      const res = await fetch('/api/srs/refine-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, instruction: refineInstruction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setFront(data.front)
      setBack(data.back)
      if (data.tags)     setTags(data.tags.join(', '))
      if (data.accepted) setAccepted(data.accepted.join(', '))
      setRefineMessage('Card updated.')
    } catch (e: any) {
      setRefineMessage(`Error: ${e.message}`)
    } finally {
      setIsRefining(false)
    }
  }

  // ── Diagram: Claude generate ───────────────────────────────────────────────

  async function handleGenerateDiagram() {
    setIsGeneratingDiagram(true)
    setDiagramMessage('')
    try {
      const res = await fetch('/api/srs/generate-diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, side: diagramSide, instruction: diagramInstruction.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (diagramSide === 'front') { setFrontDiagram(data.syntax); setManualDiagramFront(data.syntax) }
      else                          { setBackDiagram(data.syntax);  setManualDiagramBack(data.syntax)  }
      setDiagramMessage('Diagram generated.')
    } catch (e: any) {
      setDiagramMessage(`Error: ${e.message}`)
    } finally {
      setIsGeneratingDiagram(false)
    }
  }

  // ── Diagram: manual save ───────────────────────────────────────────────────

  async function handleSaveManualDiagram(side: 'front' | 'back') {
    const syntax = (side === 'front' ? manualDiagramFront : manualDiagramBack).trim()
    setIsSavingManualDiagram(true)
    setManualDiagramMessage('')
    try {
      await patch({ [side === 'front' ? 'frontDiagram' : 'backDiagram']: syntax || null })
      if (side === 'front') setFrontDiagram(syntax || null)
      else                  setBackDiagram(syntax || null)
      setManualDiagramMessage('Saved.')
    } catch {
      setManualDiagramMessage('Save failed')
    } finally {
      setIsSavingManualDiagram(false)
    }
  }

  async function handleRemoveDiagram(side: 'front' | 'back') {
    await patch({ [side === 'front' ? 'frontDiagram' : 'backDiagram']: null })
    if (side === 'front') { setFrontDiagram(null); setManualDiagramFront('') }
    else                  { setBackDiagram(null);  setManualDiagramBack('')  }
  }

  // ── SVG: Claude generate ───────────────────────────────────────────────────

  async function handleGenerateSvg() {
    setIsGeneratingSvg(true)
    setSvgMessage('')
    try {
      const res = await fetch('/api/srs/generate-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, side: svgSide, instruction: svgInstruction.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (svgSide === 'front') { setFrontSvg(data.svg); setManualSvgFront(data.svg) }
      else                     { setBackSvg(data.svg);  setManualSvgBack(data.svg)  }
      setSvgMessage('SVG generated.')
    } catch (e: any) {
      setSvgMessage(`Error: ${e.message}`)
    } finally {
      setIsGeneratingSvg(false)
    }
  }

  // ── SVG: math plot generate ────────────────────────────────────────────────

  async function handleGenerateMathPlot() {
    setIsGeneratingSvg(true)
    setSvgMessage('')
    try {
      const res = await fetch('/api/srs/generate-math-plot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, side: svgSide, instruction: svgInstruction.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      if (svgSide === 'front') { setFrontSvg(data.svg); setManualSvgFront(data.svg) }
      else                     { setBackSvg(data.svg);  setManualSvgBack(data.svg)  }
      setSvgMessage('Math plot generated.')
    } catch (e: any) {
      setSvgMessage(`Error: ${e.message}`)
    } finally {
      setIsGeneratingSvg(false)
    }
  }

  // ── SVG: manual save ───────────────────────────────────────────────────────

  async function handleSaveManualSvg(side: 'front' | 'back') {
    const svg = (side === 'front' ? manualSvgFront : manualSvgBack).trim()
    try {
      await patch({ [side === 'front' ? 'frontSvg' : 'backSvg']: svg || null })
      if (side === 'front') setFrontSvg(svg || null)
      else                  setBackSvg(svg || null)
      setSvgMessage('Saved.')
    } catch {
      setSvgMessage('Save failed')
    }
  }

  async function handleRemoveSvg(side: 'front' | 'back') {
    await patch({ [side === 'front' ? 'frontSvg' : 'backSvg']: null })
    if (side === 'front') { setFrontSvg(null); setManualSvgFront('') }
    else                  { setBackSvg(null);  setManualSvgBack('')  }
  }

  // ── Add related cards ──────────────────────────────────────────────────────

  async function handleGenerateCards() {
    setIsGenerating(true)
    setGenerateMessage('')
    try {
      const res = await fetch('/api/srs/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, instruction: generateInstruction, targetCount: generateCount }),
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

  async function handleAddCards() {
    const validCards = newCards.filter((c) => c.front.trim() && c.back.trim())
    if (!validCards.length) return
    setIsAdding(true)
    setAddMessage('')
    try {
      const res = await fetch('/api/srs/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, cards: validCards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create cards')
      setNewCards([{ front: '', back: '' }])
      setAddMessage(`${data.cards.length} card${data.cards.length !== 1 ? 's' : ''} saved`)
    } catch (e: any) {
      setAddMessage(`Error: ${e.message}`)
    } finally {
      setIsAdding(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="max-w-2xl mx-auto px-4 py-10 text-gray-400 text-sm">Loading…</div>
  if (error)   return <div className="max-w-2xl mx-auto px-4 py-10 text-red-500 text-sm">{error}</div>

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 mb-6">
        <Link href="/srs" className="hover:text-blue-600">Decks</Link>
        <span>›</span>
        <Link href={`/srs/${deckId}`} className="hover:text-blue-600">{card?.deckName ?? deckId}</Link>
        <span>›</span>
        <span className="text-gray-600 truncate max-w-[200px]">{card?.front}</span>
      </div>

      {/* Title + preview toggle */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Edit card</h1>
        <button
          onClick={() => setPreview((v) => !v)}
          className="text-sm text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>

      {preview ? (
        /* ── Preview ────────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-4 mb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <WikiText text={front} deckId={deckId} context={`Front: ${front}\nBack: ${back}`} className="text-lg text-gray-800 leading-relaxed" />
            {frontImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={frontImage.url} alt="" className="mt-4 max-h-48 mx-auto rounded-lg object-contain" />
            )}
            {frontAudio && <audio controls src={frontAudio.url} className="mt-4 mx-auto w-full max-w-xs" />}
            {frontDiagram && <div className="mt-4 text-left"><MermaidDiagram syntax={frontDiagram} /></div>}
            {frontSvg    && <div className="mt-4"><SvgDisplay svg={frontSvg} /></div>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <WikiText text={back} deckId={deckId} context={`Front: ${front}\nBack: ${back}`} className="text-lg text-gray-700 leading-relaxed" />
            {backImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={backImage.url} alt="" className="mt-4 max-h-48 mx-auto rounded-lg object-contain" />
            )}
            {backAudio && <audio controls src={backAudio.url} className="mt-4 mx-auto w-full max-w-xs" />}
            {backDiagram && <div className="mt-4 text-left"><MermaidDiagram syntax={backDiagram} /></div>}
            {backSvg     && <div className="mt-4"><SvgDisplay svg={backSvg} /></div>}
          </div>
        </div>
      ) : (
        /* ── Edit form ──────────────────────────────────────────────────────── */
        <div className="flex flex-col gap-4 mb-6">

          {/* Front */}
          <div className="flex flex-col gap-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Front</label>
            <textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="grid grid-cols-2 gap-3">
              <MediaUploadZone label="Front image" accept="image" value={frontImage} cardId={cardId} onChange={setFrontImage} />
              <MediaUploadZone label="Front audio" accept="audio" value={frontAudio} cardId={cardId} onChange={setFrontAudio} />
            </div>
          </div>

          {/* Back */}
          <div className="flex flex-col gap-4">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Back</label>
            <textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="grid grid-cols-2 gap-3">
              <MediaUploadZone label="Back image" accept="image" value={backImage} cardId={cardId} onChange={setBackImage} />
              <MediaUploadZone label="Back audio" accept="audio" value={backAudio} cardId={cardId} onChange={setBackAudio} />
            </div>
          </div>

          {/* Tags / accepted / strict */}
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tags (comma separated)</label>
          <input
            type="text" value={tags} onChange={(e) => setTags(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Accepted answers (comma separated)</label>
          <input
            type="text" value={accepted} onChange={(e) => setAccepted(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="rounded" />
            Strict (exact match only)
          </label>
        </div>
      )}

      {/* ── Save / delete ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
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
          {(saveMsg || duplicateMsg) && (
            <span className={`text-sm ${(saveMsg || duplicateMsg).startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
              {saveMsg || duplicateMsg}
            </span>
          )}
        </div>
        {!deleteConfirm ? (
          <button onClick={() => setDeleteConfirm(true)} className="text-sm text-red-400 hover:text-red-600 transition-colors">
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
            <button onClick={() => setDeleteConfirm(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
          </div>
        )}
      </div>

      {/* ── Refine with Claude ─────────────────────────────────────────────── */}
      <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-4">
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
                <span className={`text-sm ${refineMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{refineMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Diagram panel (Mermaid — Claude or manual) ─────────────────────── */}
      <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-4">
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
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide shrink-0">Attach to</span>
                  <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
                    {(['front', 'back'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setDiagramSide(s)}
                        className={`px-3 py-1.5 font-medium transition-colors ${
                          diagramSide === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  value={diagramInstruction}
                  onChange={(e) => setDiagramInstruction(e.target.value)}
                  placeholder="Optional instruction, e.g. 'use a flowchart', 'show the sequence'…"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleGenerateDiagram}
                    disabled={isGeneratingDiagram}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    {isGeneratingDiagram ? 'Generating…' : '✦ Generate with Claude'}
                  </button>
                  {diagramMessage && (
                    <span className={`text-sm ${diagramMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{diagramMessage}</span>
                  )}
                </div>
                {frontDiagram && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Front diagram attached</span>
                    <button onClick={() => handleRemoveDiagram('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button>
                  </div>
                )}
                {backDiagram && (
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
                      <button onClick={() => handleRemoveDiagram('front')} className="text-xs text-red-400 hover:text-red-600">Clear</button>
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
                      <button onClick={() => handleRemoveDiagram('back')} className="text-xs text-red-400 hover:text-red-600">Clear</button>
                    )}
                  </div>
                </div>

                {manualDiagramMessage && (
                  <span className={`text-sm ${manualDiagramMessage === 'Save failed' ? 'text-red-500' : 'text-green-600'}`}>{manualDiagramMessage}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── SVG panel ─────────────────────────────────────────────────────────── */}
      <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-4">
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
                <button
                  key={t}
                  onClick={() => setSvgTab(t)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    svgTab === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'claude' ? '✦ Diagram' : t === 'math' ? '∫ Math Plot' : 'Manual'}
                </button>
              ))}
            </div>

            {/* ── Side picker (shared by Claude + Math tabs) ── */}
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
                <textarea
                  value={svgInstruction}
                  onChange={(e) => setSvgInstruction(e.target.value)}
                  placeholder="Optional instruction, e.g. 'show a timeline', 'draw a tree diagram'…"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={handleGenerateSvg} disabled={isGeneratingSvg}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    {isGeneratingSvg ? 'Generating…' : '✦ Generate with Claude'}
                  </button>
                  {svgMessage && <span className={`text-sm ${svgMessage.startsWith('Error') || svgMessage === 'Save failed' ? 'text-red-500' : 'text-green-600'}`}>{svgMessage}</span>}
                </div>
                {frontSvg && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Front SVG attached</span><button onClick={() => handleRemoveSvg('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                {backSvg  && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Back SVG attached</span><button onClick={() => handleRemoveSvg('back')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
              </>
            ) : svgTab === 'math' ? (
              <>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Generates a precise mathematical plot — functions, distributions, integrals, parametric curves.
                  Claude computes sample values explicitly before drawing. Uses Opus for accuracy.
                </p>
                <textarea
                  value={svgInstruction}
                  onChange={(e) => setSvgInstruction(e.target.value)}
                  placeholder="e.g. 'binomial B(10, 0.3)', 'normal PDF μ=0 σ=1', '∫₀² x² dx', 'Riemann zeta ζ(s) for s∈[1.5,6]'…"
                  rows={2}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={handleGenerateMathPlot} disabled={isGeneratingSvg}
                    className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
                    {isGeneratingSvg ? 'Computing…' : '∫ Generate math plot'}
                  </button>
                  {svgMessage && <span className={`text-sm ${svgMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{svgMessage}</span>}
                </div>
                {frontSvg && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Front plot attached</span><button onClick={() => handleRemoveSvg('front')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
                {backSvg  && <div className="flex items-center gap-2"><span className="text-xs text-gray-500">Back plot attached</span><button onClick={() => handleRemoveSvg('back')} className="text-xs text-red-500 hover:text-red-700 underline">Remove</button></div>}
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
                  <span className={`text-sm ${svgMessage.startsWith('Error') || svgMessage === 'Save failed' ? 'text-red-500' : 'text-green-600'}`}>{svgMessage}</span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Add related cards ─────────────────────────────────────────────────── */}
      <div className="w-full border border-gray-200 rounded-xl overflow-hidden mb-4">
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-medium text-gray-600 transition-colors"
        >
          <span>+ Add related cards</span>
          <span className="text-gray-400">{addOpen ? '▲' : '▼'}</span>
        </button>
        {addOpen && (
          <div className="px-4 py-4 bg-white flex flex-col gap-4">

            {/* Claude auto-generate */}
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
                    type="number" value={generateCount}
                    onChange={(e) => setGenerateCount(Math.min(20, Math.max(1, Number(e.target.value))))}
                    min={1} max={20}
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
                  <span className={`text-sm ${generateMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{generateMessage}</span>
                )}
              </div>
            </div>

            {/* Card list */}
            {newCards.map((nc, i) => (
              <div key={i} className="flex flex-col gap-2 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                {newCards.length > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">Card {i + 1}</span>
                    <button onClick={() => setNewCards((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                  </div>
                )}
                <input
                  type="text" value={nc.front}
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

            <div className="flex items-center gap-3">
              <button
                onClick={handleAddCards}
                disabled={isAdding || !newCards.some((c) => c.front.trim() && c.back.trim())}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {isAdding ? 'Saving…' : 'Save cards'}
              </button>
              {addMessage && (
                <span className={`text-sm ${addMessage.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>{addMessage}</span>
              )}
            </div>
          </div>
        )}
      </div>

    </main>
  )
}
