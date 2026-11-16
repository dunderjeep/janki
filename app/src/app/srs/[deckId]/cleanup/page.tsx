'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface KeptCard    { id: string }
interface ModifiedCard { id: string; front: string; back: string; reason: string }
interface AddedCard   { front: string; back: string; reason: string }
interface RemovedCard { id: string; front: string; back: string; reason: string }

interface Proposal {
  summary:    string
  kept:       KeptCard[]
  modified:   ModifiedCard[]
  added:      AddedCard[]
  removed:    RemovedCard[]
  truncated:  boolean
  totalCards: number
}

// ── Section helpers ────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${color}`}>
      {label}
    </span>
  )
}

function CardRow({
  children,
  checked,
  onToggle,
  badge,
}: {
  children: React.ReactNode
  checked: boolean
  onToggle: () => void
  badge: React.ReactNode
}) {
  return (
    <label className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50 opacity-50'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-1 shrink-0 accent-indigo-600"
      />
      <div className="flex-1 min-w-0">
        <div className="mb-1">{badge}</div>
        {children}
      </div>
    </label>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CleanupPage() {
  const { deckId } = useParams<{ deckId: string }>()
  const router = useRouter()

  const [phase, setPhase] = useState<'loading' | 'review' | 'applying' | 'done' | 'error'>('loading')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [errMsg, setErrMsg] = useState('')

  // Per-item selection — all start checked (approved)
  const [removeSel,  setRemoveSel]  = useState<Set<string>>(new Set())
  const [modifySel,  setModifySel]  = useState<Set<string>>(new Set())
  const [addSel,     setAddSel]     = useState<Set<number>>(new Set()) // index-keyed

  const [applyResult, setApplyResult] = useState<{ removedCount: number; modifiedCount: number; addedCount: number } | null>(null)

  // ── Fetch proposal on mount ────────────────────────────────────────────────
  const fetchProposal = useCallback(async () => {
    setPhase('loading')
    setErrMsg('')
    try {
      const res = await fetch(`/api/srs/decks/${deckId}/cleanup`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setProposal(data)
      // Pre-select all changes
      setRemoveSel(new Set(data.removed.map((r: RemovedCard) => r.id)))
      setModifySel(new Set(data.modified.map((m: ModifiedCard) => m.id)))
      setAddSel(new Set(data.added.map((_: AddedCard, i: number) => i)))
      setPhase('review')
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }, [deckId])

  useEffect(() => { fetchProposal() }, [fetchProposal])

  // ── Apply ──────────────────────────────────────────────────────────────────
  async function handleApply() {
    if (!proposal) return
    setPhase('applying')
    try {
      const res = await fetch(`/api/srs/decks/${deckId}/cleanup/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toRemove: proposal.removed.filter(r => removeSel.has(r.id)).map(r => r.id),
          toModify: proposal.modified
            .filter(m => modifySel.has(m.id))
            .map(m => ({ id: m.id, front: m.front, back: m.back })),
          toAdd: proposal.added.filter((_, i) => addSel.has(i)),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setApplyResult(data)
      setPhase('done')
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setPhase('error')
    }
  }

  function toggle<T>(set: Set<T>, key: T): Set<T> {
    const next = new Set(set)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Analysing deck with Claude…</p>
        <p className="text-gray-400 text-xs">This may take 20–40 seconds for large decks</p>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <p className="text-red-600 font-semibold">Something went wrong</p>
        <p className="text-sm text-gray-500">{errMsg}</p>
        <button onClick={fetchProposal} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">
          Try again
        </button>
        <Link href={`/srs/${deckId}`} className="text-sm text-gray-400 hover:text-gray-600">← Back to deck</Link>
      </main>
    )
  }

  if (phase === 'done' && applyResult) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="text-4xl">✓</div>
        <p className="text-xl font-bold text-gray-900">Deck cleaned up</p>
        <div className="flex gap-4 text-sm text-gray-600">
          {applyResult.removedCount  > 0 && <span>−{applyResult.removedCount} removed</span>}
          {applyResult.modifiedCount > 0 && <span>✎ {applyResult.modifiedCount} updated</span>}
          {applyResult.addedCount    > 0 && <span>+{applyResult.addedCount} added</span>}
        </div>
        <button
          onClick={() => router.push(`/srs/${deckId}`)}
          className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          Back to deck
        </button>
      </main>
    )
  }

  if (phase === 'applying') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Applying changes…</p>
      </main>
    )
  }

  if (!proposal) return null

  const noChanges =
    proposal.modified.length === 0 &&
    proposal.added.length === 0 &&
    proposal.removed.length === 0

  const selectedCount =
    removeSel.size + modifySel.size + addSel.size

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-2">
        <Link href={`/srs/${deckId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to deck
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Deck Clean-up</h1>
      <p className="text-sm text-gray-500 mb-6">{proposal.summary}</p>

      {proposal.truncated && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⚠ Deck has {proposal.totalCards} cards — only the first 200 were analysed.
        </div>
      )}

      {noChanges ? (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center">
          <p className="text-green-700 font-semibold">Deck already looks great!</p>
          <p className="text-green-600 text-sm mt-1">No changes recommended.</p>
        </div>
      ) : (
        <>
          {/* ── Removed ────────────────────────────────────────────────── */}
          {proposal.removed.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700">
                  Remove <span className="text-red-500">({proposal.removed.length})</span>
                </h2>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setRemoveSel(new Set(proposal.removed.map(r => r.id)))} className="text-gray-400 hover:text-gray-600">all</button>
                  <button onClick={() => setRemoveSel(new Set())} className="text-gray-400 hover:text-gray-600">none</button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {proposal.removed.map(r => (
                  <CardRow
                    key={r.id}
                    checked={removeSel.has(r.id)}
                    onToggle={() => setRemoveSel(s => toggle(s, r.id))}
                    badge={<Badge label="Remove" color="bg-red-100 text-red-700" />}
                  >
                    <p className="text-sm text-gray-800 line-through opacity-60">{r.front}</p>
                    <p className="text-xs text-gray-400 mt-0.5 italic">{r.reason}</p>
                  </CardRow>
                ))}
              </div>
            </section>
          )}

          {/* ── Modified ───────────────────────────────────────────────── */}
          {proposal.modified.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700">
                  Update <span className="text-amber-500">({proposal.modified.length})</span>
                </h2>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setModifySel(new Set(proposal.modified.map(m => m.id)))} className="text-gray-400 hover:text-gray-600">all</button>
                  <button onClick={() => setModifySel(new Set())} className="text-gray-400 hover:text-gray-600">none</button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {proposal.modified.map(m => (
                  <CardRow
                    key={m.id}
                    checked={modifySel.has(m.id)}
                    onToggle={() => setModifySel(s => toggle(s, m.id))}
                    badge={<Badge label="Update" color="bg-amber-100 text-amber-700" />}
                  >
                    <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">Before</p>
                        <p className="text-gray-500 line-through">{m.front}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase font-medium mb-0.5">After</p>
                        <p className="text-gray-800 font-medium">{m.front}</p>
                        <p className="text-gray-500 mt-0.5">{m.back}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 italic">{m.reason}</p>
                  </CardRow>
                ))}
              </div>
            </section>
          )}

          {/* ── Added ──────────────────────────────────────────────────── */}
          {proposal.added.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700">
                  Add <span className="text-green-600">({proposal.added.length})</span>
                </h2>
                <div className="flex gap-3 text-xs">
                  <button onClick={() => setAddSel(new Set(proposal.added.map((_, i) => i)))} className="text-gray-400 hover:text-gray-600">all</button>
                  <button onClick={() => setAddSel(new Set())} className="text-gray-400 hover:text-gray-600">none</button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {proposal.added.map((a, i) => (
                  <CardRow
                    key={i}
                    checked={addSel.has(i)}
                    onToggle={() => setAddSel(s => toggle(s, i))}
                    badge={<Badge label="New" color="bg-green-100 text-green-700" />}
                  >
                    <p className="text-sm font-medium text-gray-800">{a.front}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{a.back}</p>
                    <p className="text-xs text-gray-400 mt-1 italic">{a.reason}</p>
                  </CardRow>
                ))}
              </div>
            </section>
          )}

          {/* ── Kept summary ───────────────────────────────────────────── */}
          {proposal.kept.length > 0 && (
            <p className="text-xs text-gray-400 mb-8 text-center">
              {proposal.kept.length} card{proposal.kept.length !== 1 ? 's' : ''} unchanged
            </p>
          )}

          {/* ── Apply bar ──────────────────────────────────────────────── */}
          <div className="sticky bottom-6 flex items-center justify-between bg-white border border-gray-200 rounded-2xl shadow-lg px-5 py-3">
            <p className="text-sm text-gray-600">
              {selectedCount} change{selectedCount !== 1 ? 's' : ''} selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={fetchProposal}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Re-analyse
              </button>
              <button
                onClick={handleApply}
                disabled={selectedCount === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors"
              >
                Apply changes
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
