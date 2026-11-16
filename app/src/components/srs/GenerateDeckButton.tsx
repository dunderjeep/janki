'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'generate' | 'import' | 'json'
type ParsedCard = { front: string; back: string }

/** Parse a CSV string into front/back card pairs. */
function parseCsv(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/)
  const cards: ParsedCard[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    // Simple CSV: split on first comma, handle quoted fields
    let front: string
    let back: string

    if (line.startsWith('"')) {
      // Quoted first field
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

    // Skip obvious header rows
    if (
      (front.toLowerCase() === 'front' && back.toLowerCase() === 'back') ||
      (front.toLowerCase() === 'question' && back.toLowerCase() === 'answer')
    ) continue

    cards.push({ front, back })
  }

  return cards
}

function closeModal(
  setOpen: (v: boolean) => void,
  reset: () => void,
) {
  setOpen(false)
  reset()
}

export function GenerateDeckButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('generate')
  const [error, setError] = useState('')

  // Generate tab state
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(20)
  const [isGenerating, setIsGenerating] = useState(false)

  // Import CSV tab state
  const [deckName, setDeckName] = useState('')
  const [parsedCards, setParsedCards] = useState<ParsedCard[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Import JSON tab state
  const [jsonFileName, setJsonFileName] = useState('')
  const [jsonDeckName, setJsonDeckName] = useState('')
  const [jsonDescription, setJsonDescription] = useState('')
  const [jsonCards, setJsonCards] = useState<ParsedCard[]>([])
  const [jsonError, setJsonError] = useState('')
  const [isImportingJson, setIsImportingJson] = useState(false)
  const jsonFileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setTab('generate')
    setError('')
    setTopic('')
    setCount(20)
    setIsGenerating(false)
    setDeckName('')
    setParsedCards([])
    setCsvFileName('')
    setIsImporting(false)
    setJsonFileName('')
    setJsonDeckName('')
    setJsonDescription('')
    setJsonCards([])
    setJsonError('')
    setIsImportingJson(false)
  }

  async function handleGenerate() {
    if (!topic.trim()) return
    setIsGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/srs/generate-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), targetCount: count }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      router.push(`/srs/${data.deckId}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setIsGenerating(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    // Pre-fill deck name from filename (strip extension)
    if (!deckName) setDeckName(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setParsedCards(parseCsv(text))
      setError('')
    }
    reader.readAsText(file)
  }

  function handleJsonFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setJsonFileName(file.name)
    setJsonError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as {
          deckName?: string
          description?: string
          cards?: { front?: string; back?: string }[]
        }
        if (!data.deckName || !Array.isArray(data.cards)) {
          setJsonError('Invalid deck file: must have "deckName" and "cards" fields.')
          setJsonCards([])
          return
        }
        const valid = data.cards.filter(c => c.front?.trim() && c.back?.trim()) as ParsedCard[]
        if (!valid.length) {
          setJsonError('No valid cards found in file.')
          setJsonCards([])
          return
        }
        setJsonDeckName(data.deckName.trim())
        setJsonDescription(data.description?.trim() ?? '')
        setJsonCards(valid)
      } catch {
        setJsonError('Could not parse JSON file.')
        setJsonCards([])
      }
    }
    reader.readAsText(file)
  }

  async function handleImportJson() {
    if (!jsonDeckName.trim() || !jsonCards.length) return
    setIsImportingJson(true)
    setJsonError('')
    try {
      const res = await fetch('/api/srs/import-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckName: jsonDeckName.trim(), description: jsonDescription, cards: jsonCards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      router.push(`/srs/${data.deckId}`)
      router.refresh()
    } catch (e: any) {
      setJsonError(e.message)
      setIsImportingJson(false)
    }
  }

  async function handleImport() {
    if (!deckName.trim() || !parsedCards.length) return
    setIsImporting(true)
    setError('')
    try {
      const res = await fetch('/api/srs/import-deck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckName: deckName.trim(), cards: parsedCards }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      router.push(`/srs/${data.deckId}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setIsImporting(false)
    }
  }

  const busy = isGenerating || isImporting || isImportingJson

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-200 hover:border-indigo-400 px-4 py-2 rounded-lg transition-colors"
      >
        ✦ New deck
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-lg font-bold text-gray-900">New deck</h2>
              <button
                onClick={() => closeModal(setOpen, reset)}
                disabled={busy}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none disabled:opacity-40"
              >×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-6">
              {([
                ['generate', '✦ Generate with Claude'],
                ['import',   '↑ Import CSV'],
                ['json',     '↑ Import JSON'],
              ] as [Tab, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError('') }}
                  disabled={busy}
                  className={`pb-2 mr-6 text-sm font-medium border-b-2 transition-colors ${
                    tab === t
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="px-6 py-5 flex flex-col gap-4">

              {tab === 'generate' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Topic</label>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="e.g. Basic probability theory, Photosynthesis, SQL window functions…"
                      rows={3}
                      autoFocus
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Number of cards (max 50)
                    </label>
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

              {tab === 'import' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">CSV file</label>
                    <p className="text-xs text-gray-400">Two columns: <code className="bg-gray-100 px-1 rounded">front,back</code> — one card per row, header row optional</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="self-start text-sm border border-gray-200 hover:border-gray-400 px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {csvFileName ? `📄 ${csvFileName}` : 'Choose file…'}
                    </button>
                    {parsedCards.length > 0 && (
                      <p className="text-xs text-green-600 font-medium">{parsedCards.length} card{parsedCards.length !== 1 ? 's' : ''} detected</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Deck name</label>
                    <input
                      type="text"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                      placeholder="My imported deck"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
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

              {tab === 'json' && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">JSON deck file</label>
                    <p className="text-xs text-gray-400">
                      Format: <code className="bg-gray-100 px-1 rounded">{'{"deckName","description","cards":[{"front","back"}]}'}</code>
                    </p>
                    <input
                      ref={jsonFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleJsonFileChange}
                      className="hidden"
                    />
                    <button
                      onClick={() => jsonFileInputRef.current?.click()}
                      className="self-start text-sm border border-gray-200 hover:border-gray-400 px-4 py-2 rounded-lg text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      {jsonFileName ? `📄 ${jsonFileName}` : 'Choose file…'}
                    </button>
                    {jsonCards.length > 0 && (
                      <p className="text-xs text-green-600 font-medium">{jsonCards.length} card{jsonCards.length !== 1 ? 's' : ''} detected</p>
                    )}
                    {jsonError && <p className="text-xs text-red-500">{jsonError}</p>}
                  </div>

                  {jsonCards.length > 0 && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Deck name</label>
                        <input
                          type="text"
                          value={jsonDeckName}
                          onChange={(e) => setJsonDeckName(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>

                      <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 text-xs divide-y divide-gray-100">
                        {jsonCards.slice(0, 5).map((c, i) => (
                          <div key={i} className="px-3 py-1.5 flex gap-2">
                            <span className="text-gray-400 shrink-0 w-4">{i + 1}</span>
                            <span className="text-gray-700 truncate">{c.front}</span>
                            <span className="text-gray-300 shrink-0">→</span>
                            <span className="text-gray-500 truncate">{c.back}</span>
                          </div>
                        ))}
                        {jsonCards.length > 5 && (
                          <div className="px-3 py-1.5 text-gray-400">…and {jsonCards.length - 5} more</div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex items-center gap-3 pt-1">
                {tab === 'generate' ? (
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !topic.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {isGenerating ? 'Generating…' : 'Generate'}
                  </button>
                ) : tab === 'import' ? (
                  <button
                    onClick={handleImport}
                    disabled={isImporting || !deckName.trim() || !parsedCards.length}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {isImporting ? 'Importing…' : `Import ${parsedCards.length > 0 ? parsedCards.length + ' cards' : ''}`}
                  </button>
                ) : (
                  <button
                    onClick={handleImportJson}
                    disabled={isImportingJson || !jsonDeckName.trim() || !jsonCards.length}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    {isImportingJson ? 'Importing…' : `Import ${jsonCards.length > 0 ? jsonCards.length + ' cards' : ''}`}
                  </button>
                )}
                <button
                  onClick={() => closeModal(setOpen, reset)}
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
