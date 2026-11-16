'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const DEFAULT_EPUB = process.env.NEXT_PUBLIC_DEFAULT_EPUB_PATH ?? ''

export function ImportForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [epubPath, setEpubPath] = useState(DEFAULT_EPUB)
  const [edition, setEdition] = useState('3rd Edition')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleImport() {
    if (!epubPath.trim()) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/courses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epubPath: epubPath.trim(), edition: edition.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        const { imported } = data
        setResult(
          `Imported: ${imported.chapters} chapters, ${imported.sections} sections, ${imported.problems} problems.`
        )
        router.refresh()
        setTimeout(() => { setOpen(false); setResult(null) }, 2000)
      }
    } catch (e: any) {
      setResult(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-gray-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
      >
        + Import book
      </button>
    )
  }

  return (
    <div className="border border-indigo-200 bg-indigo-50/40 rounded-xl p-5 mt-4 space-y-3">
      <h3 className="font-semibold text-gray-800">Import textbook</h3>
      <p className="text-xs text-gray-500">
        Absolute path or relative to the project root (e.g. <code className="font-mono">books/velleman.epub</code>).
      </p>
      <div className="space-y-2">
        <label className="block text-sm text-gray-700">
          Epub path
          <input
            className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-400"
            value={epubPath}
            onChange={e => setEpubPath(e.target.value)}
            placeholder="books/velleman.epub or /absolute/path/to/book.epub"
          />
        </label>
        <label className="block text-sm text-gray-700">
          Edition (optional)
          <input
            className="mt-1 block w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
            value={edition}
            onChange={e => setEdition(e.target.value)}
            placeholder="3rd Edition"
          />
        </label>
      </div>
      {result && (
        <p className={`text-sm ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
          {result}
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleImport}
          disabled={loading || !epubPath.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          {loading ? 'Importing…' : 'Import'}
        </button>
        <button
          onClick={() => { setOpen(false); setResult(null) }}
          className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
