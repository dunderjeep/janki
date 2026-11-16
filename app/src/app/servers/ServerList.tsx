'use client'

import { useCallback, useEffect, useState } from 'react'

interface ServerProcess {
  pid: number
  name: string
  ports: number[]
  addresses: string[]
  command: string
  uptime: string
  self: boolean
  protected: boolean
}

/** Ports this project uses, so the familiar ones are recognisable at a glance. */
const KNOWN: Record<number, string> = {
  3000: 'Next.js (predict)',
  3001: 'Next.js (janki)',
  3307: 'MariaDB — migration kit',
  5432: 'PostgreSQL',
  5433: 'PostgreSQL — janki',
  5051: 'pgAdmin',
  8055: 'Directus',
  8056: 'Directus — janki',
  8777: 'Migration workbench',
  9002: 'MinIO S3',
  9003: 'MinIO console',
}

export default function ServerList() {
  const [servers, setServers] = useState<ServerProcess[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<number | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/servers', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'could not read the process list')
      setServers(data.servers)
      setError('')
    } catch (err) {
      setError((err as Error).message)
      setServers([])
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)   // keep it current while open
    return () => clearInterval(timer)
  }, [load])

  async function stop(server: ServerProcess) {
    const label = `${server.name} on port ${server.ports.join(', ')}`
    if (!confirm(`Stop ${label}?\n\npid ${server.pid}\n${server.command.slice(0, 160)}`)) return

    setBusy(server.pid)
    setNote('')
    try {
      const res = await fetch(`/api/servers?pid=${server.pid}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'could not stop it')
      setNote(data.escalated
        ? `Stopped ${label} — it ignored SIGTERM, so SIGKILL was sent.`
        : `Stopped ${label}.`)
      await load()
    } catch (err) {
      setNote(`Could not stop ${label}: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (servers === null) {
    return <p className="text-sm text-gray-400">Reading the process list…</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={load}
          className="rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium
                     text-gray-300 transition hover:border-emerald-500 hover:text-emerald-400">
          Refresh
        </button>
        <span className="text-xs text-gray-500">
          {servers.length} listening {servers.length === 1 ? 'process' : 'processes'} · updates every 5s
        </span>
      </div>

      {error && (
        <p className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2
                      text-sm text-amber-300">{error}</p>
      )}
      {note && (
        <p className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2
                      text-sm text-emerald-300">{note}</p>
      )}

      {servers.length === 0 && !error && (
        <p className="text-sm text-gray-400">Nothing is listening on a TCP port.</p>
      )}

      <ul className="space-y-2">
        {servers.map((s) => (
          <li key={s.pid}
              className="flex items-start gap-4 rounded-lg border border-gray-800
                         bg-gray-900/60 px-4 py-3">
            <div className="w-24 flex-none">
              {s.ports.map((p) => (
                <div key={p} className="font-mono text-sm font-bold text-emerald-400">:{p}</div>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold text-gray-100">{s.name}</span>
                {s.ports.map((p) => KNOWN[p] && (
                  <span key={p} className="text-xs text-gray-400">{KNOWN[p]}</span>
                ))}
                {s.self && (
                  <span className="rounded border border-sky-700 px-1.5 py-0.5 text-[10px]
                                   font-mono uppercase tracking-wider text-sky-400">
                    this page
                  </span>
                )}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                pid {s.pid}
                {s.uptime && ` · up ${s.uptime}`}
                {s.addresses.length > 0 && ` · ${s.addresses.join(' ')}`}
              </div>
              {s.command && (
                <div className="mt-1 truncate font-mono text-[11px] text-gray-600"
                     title={s.command}>{s.command}</div>
              )}
            </div>

            <div className="flex-none">
              {s.protected ? (
                <span className="text-[11px] text-gray-600">
                  {s.self ? 'serving this page' : 'protected'}
                </span>
              ) : (
                <button
                  onClick={() => stop(s)}
                  disabled={busy === s.pid}
                  className="rounded-md border border-red-800 px-3 py-1.5 text-xs font-medium
                             text-red-400 transition hover:border-red-500 hover:bg-red-950/40
                             disabled:opacity-40">
                  {busy === s.pid ? 'Stopping…' : 'Stop'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
