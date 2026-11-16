'use client'

import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type LinkedAccount = {
  provider: string
  providerAccountId: string
}

export default function AccountsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [linked, setLinked] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [handle, setHandle] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/auth/linked-accounts')
      .then((r) => r.json())
      .then((data: LinkedAccount[]) => { setLinked(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [status])

  async function linkBluesky(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    const res = await fetch('/api/auth/link-bluesky', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle, appPassword }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (res.ok) {
      setMessage({ type: 'ok', text: `Linked @${data.handle}` })
      setHandle('')
      setAppPassword('')
      setLinked((prev) => [
        ...prev,
        { provider: 'bluesky', providerAccountId: data.did },
      ])
    } else {
      const msgs: Record<string, string> = {
        invalid_credentials: 'Invalid handle or app password.',
        already_linked_self: 'That Bluesky account is already linked to your profile.',
        already_linked_other: 'That Bluesky account is linked to a different user.',
      }
      setMessage({ type: 'err', text: msgs[data.error] ?? 'Something went wrong.' })
    }
  }

  async function unlinkBluesky(did: string) {
    const res = await fetch('/api/auth/link-bluesky', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did }),
    })
    if (res.ok) {
      setLinked((prev) => prev.filter((a) => a.providerAccountId !== did))
      setMessage({ type: 'ok', text: 'Bluesky account unlinked.' })
    }
  }

  const blueskyAccounts = linked.filter((a) => a.provider === 'bluesky')
  const hasGoogle = linked.some((a) => a.provider === 'google')

  if (status === 'loading' || loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto flex flex-col gap-8">
        <h1 className="text-2xl font-bold text-gray-800">Linked accounts</h1>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'ok'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-600'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Current accounts */}
        <section className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-700">Connected</h2>

          {hasGoogle && (
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Google</p>
                <p className="text-xs text-gray-400">{session?.user?.email}</p>
              </div>
            </div>
          )}

          {blueskyAccounts.map((a) => (
            <div key={a.providerAccountId} className="flex items-center gap-3">
              <svg viewBox="0 0 360 320" className="w-5 h-5 shrink-0 fill-[#0085ff]" aria-hidden="true">
                <path d="M180 142C164 110 120 51 78 23c-40-27-86-14-76 45 5 30 27 114 43 141 26 44 78 61 113 74 14 5 26 10 22 18-3-8-15-13-29-18C96 270 45 253 19 209 2 182-19 98-24 68-33 9 13-4 52 23c41 28 86 87 102 119h13c16-32 61-91 102-119 39-27 85-14 76 45-5 30-27 114-43 141-26 44-78 61-113 74-14 5-26 10-22 18 3-8 15-13 29-18 36-13 87-30 113-74 16-27 38-111 43-141 9-59-37-72-76-45z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">Bluesky</p>
                <p className="text-xs text-gray-400 font-mono">{a.providerAccountId}</p>
              </div>
              <button
                onClick={() => unlinkBluesky(a.providerAccountId)}
                className="text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                Unlink
              </button>
            </div>
          ))}

          {!hasGoogle && blueskyAccounts.length === 0 && (
            <p className="text-sm text-gray-400">No accounts connected.</p>
          )}
        </section>

        {/* Link Bluesky */}
        {blueskyAccounts.length === 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-gray-700">Connect Bluesky</h2>
            <form onSubmit={linkBluesky} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">Handle</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourname.bsky.social"
                  required
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">App Password</span>
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  required
                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </label>
              <p className="text-xs text-gray-400">
                Create one at{' '}
                <span className="font-medium">
                  Bluesky → Settings → Privacy &amp; Security → App Passwords
                </span>
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-[#0085ff] hover:bg-[#006ecc] disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {submitting ? 'Connecting…' : 'Connect Bluesky'}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
