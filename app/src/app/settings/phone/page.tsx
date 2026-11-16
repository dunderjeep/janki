'use client'

import { useCallback, useEffect, useState } from 'react'

type Result = {
  ok: boolean
  url: string | null
  summary: string
  checks: { name: string; ok: boolean; detail: string }[]
  devices: { name: string; answered: boolean }[]
  repaired: string[]
}

export default function PhoneAccessPage() {
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState<'check' | 'repair' | null>('check')
  const [error, setError] = useState<string | null>(null)

  const go = useCallback(async (mode: 'check' | 'repair') => {
    setBusy(mode)
    setError(null)
    try {
      const res = await fetch('/api/settings/phone-access', { method: mode === 'repair' ? 'POST' : 'GET' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`)
      setResult(json)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => { void go('check') }, [go])

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Phone access</h1>
      <p className="mt-1 text-sm text-gray-500">
        Tests each step between your phone and janki. If this page will not load at all, use
        Fix phone access on the janki icon in the laptop&apos;s taskbar.
      </p>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => void go('repair')}
          disabled={busy !== null}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === 'repair' ? 'Repairing…' : 'Repair'}
        </button>
        <button
          onClick={() => void go('check')}
          disabled={busy !== null}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'check' ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

      {result && (
        <div className="mt-5 space-y-4">
          <p className={`rounded-lg px-4 py-3 text-sm ${result.ok ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>
            {result.summary}
          </p>
          <ul className="divide-y divide-gray-100 text-sm">
            {result.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-3 py-2">
                <span className={c.ok ? 'text-green-700' : 'text-red-700'} aria-label={c.ok ? 'Working' : 'Failed'}>{c.ok ? '✓' : '✕'}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-gray-800">{c.name}</span>
                  <span className="block text-gray-500">{c.detail}</span>
                </span>
              </li>
            ))}
            {result.devices.map((d) => (
              <li key={d.name} className="flex items-start gap-3 py-2">
                <span className={d.answered ? 'text-green-700' : 'text-gray-400'} aria-label={d.answered ? 'Answered' : 'No answer'}>{d.answered ? '✓' : '–'}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-gray-800">{d.name}</span>
                  <span className="block text-gray-500">{d.answered ? 'Answered over Tailscale' : 'Did not answer (a locked phone often will not)'}</span>
                </span>
              </li>
            ))}
          </ul>
          {result.repaired.length > 0 && <p className="text-sm text-gray-500">Done: {result.repaired.join('; ')}</p>}
          {result.url && (
            <p className="text-sm text-gray-500">
              Open on your phone: <span className="break-all font-mono text-gray-800">{result.url}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
