'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'manual' | 'generate' | 'import'
type ParsedCard = { front: string; back: string }

function parseCsv(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/)
  const cards: ParsedCard[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    let front: string
    let back: string

    if (line.startsWith('"')) {
      const closeQuote = line.indexOf('"', 1)
      if (closeQuote === -1) continue
      front = line.slice(1, closeQuote)
      const rest = line.slice(closeQuote + 1).replace(/^,/, '')
      back = rest.startsWith('"') ? rest.slice(1, rest.lastIndexOf('"')) : rest
    } else {
      const commaIdx = line.indexOf(',')
      if (commaIdx === -1) continue
      front = line.slice(0, commaIdx)
      back = line.slice(commaIdx + 1).replace(/^"(.*)"$/, '$1')
    }

    front = front.trim()
    back = back.trim()
    if (!front || !back) continue

    if (
      (front.toLowerCase() === 'front' && back.toLowerCase() === 'back') ||
      (front.toLowerCase() === 'question' && back.toLowerCase() === 'answer')
    ) continue

    cards.push({ front, back })
  }

  return cards
}

export function AddCardsButton({ deckId }: { deckId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('manual')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Manual tab
  const [manualFront, setManualFront] = useState('')
  const [manualBack, setManualBack] = useState('')
  const [manualCards, setManualCards] = useState<ParsedCard[]>([])

  // Generate tab
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(20)

  // Import tab
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [draggingOver, setDraggingOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTab('manual')
    setError('')
    setBusy(false)
    setManualFront('')
    setManualBack('')
    setManualCards([])
    setTopic('')
    setCount(20)
    setParsedCards([])
    setCsvFileName('')
    setDraggingOver(false)
  }

  function addManualCard() {
    if (!manualFront.trim() || !manualBack.trim()) return
    setManualCards(prev => [...prev, { front: manualFront.trim(), back: manualBack.trim() }])
    setManualFront('')
    setManualBack('')
  }

  function removeManualCard(i: number) {
    setManualCards(prev => prev.filter((_, idx) => idx !== i))
  }

  async function submitCards(cards: ParsedCard[]) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/srs/decks/${deckId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to add cards')
      setOpen(false)
      reset()
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }

  async function handleManualSubmit() {
    const all = manualFront.trim() && manualBack.trim()
      ? [...manualCards, { front: manualFront.trim(), back: manualBack.trim() }]
      : manualCards
    if (!all.length) return
    await submitCards(all)
  }

  async function handleGenerate() {
    if (!topic.trim()) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/srs/decks/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), targetCount: count }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setOpen(false)
      reset()
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setBusy(false)
    }
  }

  const loadFile = useCallback((file: File) => {
    setCsvFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setParsedCards(parseCsv(ev.target?.result as string))
      setError('')
    }
    reader.readAsText(file)
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) loadFile(file)
  }

  const TAB_LABELS: Record<Tab, string> = {
    manual: '+ Manual',
    generate: '✦ Generate',
    import: '↑ Import CSV',
  }

  const manualTotal = manualCards.length + (manualFront.trim() && manualBack.trim() ? 1 : 0)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 hover:border-indigo-400 px-4 py-2 rounded-lg transition-colors"
      >
        + Add cards
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Add cards</h2>
              <button
                onClick={() => { setOpen(false); reset() }}
                disabled={busy}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-40"
              >×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6 shrink-0">
              {(['manual', 'generate', 'import'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError('') }}
                  disabled={busy}
                  className={`pb-2 mr-5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">

              {/* Manual tab */}
              {tab === 'manual' && (
                <>
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={manualFront}
                      onChange={(e) => setManualFront(e.target.value)}
                      placeholder="Front (question / prompt)"
                      rows={2}
                      autoFocus
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <textarea
                      value={manualBack}
                      onChange={(e) => setManualBack(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addManualCard()
                      }}
                      placeholder="Back (answer)"
                      rows={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                    <button
                      onClick={addManualCard}
                      disabled={!manualFront.trim() || !manualBack.trim()}
                      className="self-start text-sm border border-gray-200 hover:border-indigo-400 text-gray-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      Queue card ↵
                    </button>
                    <p className="text-[11px] text-gray-400">Tip: Cmd/Ctrl+Enter to queue from Back field</p>
                  </div>

                  {manualCards.length > 0 && (
                    <div className="rounded-lg border border-gray-100 bg-gray-50 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                      {manualCards.map((c, i) => (
                        <div key={i} className="px-3 py-1.5 flex gap-2 items-center text-xs">
                          <span className="text-gray-400 shrink-0 w-4">{i + 1}</span>
                          <span className="text-gray-700 truncate flex-1">{c.front}</span>
                          <span className="text-gray-300 shrink-0">→</span>
                          <span className="text-gray-500 truncate flex-1">{c.back}</span>
                          <button onClick={() => removeManualCard(i)} className="text-gray-300 hover:text-red-400 shrink-0 ml-1">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Generate tab */}
              {tab === 'generate' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Topic / focus</label>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. Nucleophilic substitution reactions, Aldol condensation…"
                      rows={3}
                      autoFocus
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Number of cards (max 50)</label>
                    <input
                      type="number"
                      value={count}
                      onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value))))}
                      min={1}
                      max={50}
                      className="w-32 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                </>
              )}

              {/* Import tab */}
              {tab === 'import' && (
                <>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">CSV file</label>
                    <p className="text-xs text-gray-400">Two columns: <code className="bg-gray-100 px-1 rounded">front,back</code> — one card per row, header optional</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDraggingOver(true) }}
                      onDragLeave={() => setDraggingOver(false)}
                      onDrop={handleDrop}
                      className={`flex flex-col items-center justify-center gap-2 cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors select-none
                        ${draggingOver
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
                          : csvFileName
                            ? 'border-green-300 bg-green-50 text-green-700'
                            : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-gray-400 hover:text-indigo-500'
                        }`}
                    >
                      {csvFileName ? (
                        <>
                          <span className="text-2xl">📄</span>
                          <span className="text-sm font-medium">{csvFileName}</span>
                          <span className="text-xs">{parsedCards.length} card{parsedCards.length !== 1 ? 's' : ''} detected — click to replace</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl">📂</span>
                          <span className="text-sm font-medium">Drop CSV here or click to choose</span>
                          <span className="text-xs">front,back — one card per row</span>
                        </>
                      )}
                    </div>
                  </div>

                  {parsedCards.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-xs divide-y divide-gray-100">
                      {parsedCards.slice(0, 5).map((c, i) => (
                        <div key={i} className="px-3 py-1.5 flex gap-2">
                          <span className="text-gray-400 shrink-0 w-4">{i + 1}</span>
                          <span className="text-gray-700 truncate">{c.front}</span>
                          <span className="text-gray-300 shrink-0">→</span>
                          <span className="text-gray-500 truncate">{c.back}</span>
                        </div>
                      ))}
                      {parsedCards.length > 5 && (
                        <div className="px-3 py-1.5 text-gray-400">…and {parsedCards.length - 5} more</div>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-1">
                {tab === 'manual' && (
                  <button
                    onClick={handleManualSubmit}
                    disabled={busy || manualTotal === 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {busy ? 'Saving…' : `Add ${manualTotal > 0 ? manualTotal + ' card' + (manualTotal !== 1 ? 's' : '') : 'cards'}`}
                  </button>
                )}
                {tab === 'generate' && (
                  <button
                    onClick={handleGenerate}
                    disabled={busy || !topic.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {busy ? 'Generating…' : 'Generate'}
                  </button>
                )}
                {tab === 'import' && (
                  <button
                    onClick={() => submitCards(parsedCards)}
                    disabled={busy || !parsedCards.length}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {busy ? 'Importing…' : `Import ${parsedCards.length > 0 ? parsedCards.length + ' cards' : ''}`}
                  </button>
                )}
                <button
                  onClick={() => { setOpen(false); reset() }}
                  disabled={busy}
                  className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                {busy && <span className="text-sm text-gray-400">This may take a moment…</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
