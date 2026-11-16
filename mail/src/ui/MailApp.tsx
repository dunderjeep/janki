'use client'

/**
 * Mail: your mailboxes, read here and kept in step with the server. Archive
 * and delete here are archive and delete there; opening an email marks it
 * read there too. An email's own HTML is shown in a sandbox with no scripts,
 * and its remote images (which tell the sender you opened it) stay off until
 * you ask for them.
 *
 * To process: each email is dealt with once, GTD-style. Make it a task (it
 * goes to the host's lists, and the email is archived), send it to the
 * host's inbox, archive, delete or keep it. "Always" makes a rule that does
 * the same to the sender's later mail as it arrives.
 *
 * Keys, as in Gmail: j / k next and previous, t task, e archive, # delete,
 * u unread, / search.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountView, MessageSummary, MessageView, RuleView } from '../lib/store'
import type { FolderInfo } from '../lib/imap'

type Provider = { key: string; label: string; host: string; port: number; note: string }

export type MailAppProps = {
  accounts: AccountView[]
  messages: MessageSummary[]
  rules: RuleView[]
  /** How many are still to process. */
  waiting: number
  providers: readonly Provider[]
  /** Where the host can take an email ("task": Task in Next, "inbox": Next inbox). */
  targets: { key: string; label: string }[]
}

type Decision =
  | { kind: 'send'; target: string; title?: string; when?: string; archive?: boolean }
  | { kind: 'archive' } | { kind: 'trash' } | { kind: 'keep' }

const taskTitle = (subject: string) => subject.replace(/^\s*((re|fwd?|sv|vs|aw|tr)\s*:\s*)+/i, '').trim() || '(no subject)'
const isoDay = (d: Date) => d.toLocaleDateString('sv-SE')
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d) }
const nextDow = (dow: number) => { const d = new Date(); d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7)); return isoDay(d) }
const HOLDS: [string, () => string][] = [
  ['Now', () => ''],
  ['Tomorrow', () => `${inDays(1)} 08:00`],
  ['Weekend', () => `${nextDow(6)} 08:00`],
  ['Next week', () => `${nextDow(1)} 08:00`],
]

async function api<T = { ok: true }>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/mail/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? `The request failed (${res.status})`)
  return json as T
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
const btn = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 hover:border-sky-500 disabled:opacity-50'
const primary = 'rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50'
const field = 'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500'

/** "14:05" today, "Mon 3" this month, "3 Oct" this year, else "3 Oct 2025". */
function shortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toTimeString().slice(0, 5)
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) })
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString()
}

// ── Adding an account ─────────────────────────────────────────────────────────

function AddAccount({ providers, onAdded, onCancel }: { providers: readonly Provider[]; onAdded: () => void; onCancel?: () => void }) {
  const [pick, setPick] = useState(providers[0]?.key ?? 'other')
  const p = providers.find((x) => x.key === pick)
  const [host, setHost] = useState(p?.host ?? '')
  const [port, setPort] = useState(String(p?.port ?? 993))
  const [address, setAddress] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [folders, setFolders] = useState<FolderInfo[] | null>(null)
  const [chosen, setChosen] = useState<string[]>(['INBOX'])
  const [days, setDays] = useState('60')
  const [busy, setBusy] = useState<'' | 'test' | 'save'>('')
  const [error, setError] = useState('')

  const choose = (key: string) => {
    setPick(key)
    const q = providers.find((x) => x.key === key)
    setHost(q?.host ?? '')
    setPort(String(q?.port ?? 993))
    setFolders(null)
  }
  const login = () => ({ host, port: Number(port), address, username: username || address, password })

  const test = async () => {
    setBusy('test')
    setError('')
    try {
      const r = await api<{ folders: FolderInfo[] }>('accounts/test', 'POST', login())
      setFolders(r.folders)
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy('')
    }
  }
  const save = async () => {
    setBusy('save')
    setError('')
    try {
      await api('accounts', 'POST', { ...login(), folders: chosen, syncDays: Number(days) })
      onAdded()
    } catch (e) {
      setError(msg(e))
      setBusy('')
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">Add a mailbox</h2>
      <p className="mt-0.5 text-xs text-gray-500">Any mailbox that speaks IMAP. What you do here (read, archive, delete) happens in the mailbox itself.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[...providers.map((x) => [x.key, x.label] as const), ['other', 'Other'] as const].map(([k, label]) => (
          <button key={k} onClick={() => choose(k)} className={`${btn} ${pick === k ? 'border-sky-600 bg-sky-50 text-sky-900' : ''}`}>{label}</button>
        ))}
      </div>
      {p && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-950">{p.note}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-600">Address
          <input className={field} type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="you@example.com" />
        </label>
        <label className="text-xs text-gray-600">{pick === 'gmail' ? 'App password' : 'Password'}
          <input className={field} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={pick === 'gmail' ? 'the 16 letters Google gave you' : ''} />
        </label>
        {pick === 'other' || pick === 'proton' ? (
          <>
            <label className="text-xs text-gray-600">IMAP server
              <input className={field} value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.example.com" />
            </label>
            <label className="text-xs text-gray-600">Port
              <input className={field} inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
            <label className="text-xs text-gray-600 sm:col-span-2">User name, if not the address
              <input className={field} value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
          </>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={btn} disabled={!address || !password || !host || busy !== ''} onClick={test}>{busy === 'test' ? 'Logging in…' : 'Log in and list folders'}</button>
        {onCancel && <button className="text-xs text-gray-500 hover:text-gray-800" onClick={onCancel}>Cancel</button>}
      </div>
      {folders && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-700">Logged in. Which folders should janki keep?</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {folders.map((f) => (
              <label key={f.path} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" className="accent-sky-700" checked={chosen.includes(f.path)}
                  onChange={(e) => setChosen((c) => (e.target.checked ? [...c, f.path] : c.filter((x) => x !== f.path)))} />
                {f.path}{f.specialUse ? <span className="text-gray-400">{f.specialUse.replace('\\', ' ')}</span> : null}
              </label>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
            Going back
            <input className="w-16 rounded border border-gray-200 px-1.5 py-0.5" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} /> days
          </label>
          <button className={`${primary} mt-3`} disabled={!chosen.length || busy !== ''} onClick={save}>{busy === 'save' ? 'Saving and fetching mail…' : 'Save and fetch mail'}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <p className="mt-3 text-[11px] text-gray-400">The password is stored encrypted, and is only used to log in to this mailbox.</p>
    </section>
  )
}

// ── An account's settings ─────────────────────────────────────────────────────

function AccountCard({ a, onChanged, onRemoved }: { a: AccountView; onChanged: () => Promise<void>; onRemoved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [folders, setFolders] = useState<FolderInfo[] | null>(null)
  const [password, setPassword] = useState('')
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await work()
      await onChanged()
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-gray-900">{a.label}</span>
        <span className="text-xs text-gray-500">synced {ago(a.lastSyncAt)}</span>
      </div>
      <p className="text-xs text-gray-500">{a.address} · {a.folders.join(', ')} · last {a.syncDays} days</p>
      {a.lastError && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{a.lastError}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className={btn} disabled={busy} onClick={() => run(() => api(`accounts/${a.id}/sync`, 'POST'))}>{busy ? 'Working…' : 'Sync now'}</button>
        <button className={btn} disabled={busy} onClick={() => run(async () => setFolders((await api<{ folders: FolderInfo[] }>(`accounts/${a.id}/folders`)).folders))}>Folders…</button>
        <button className="text-xs text-red-700 hover:underline" disabled={busy} onClick={() => {
          if (window.confirm(`Forget ${a.address} here? Nothing in the mailbox itself changes.`)) void (async () => { await api(`accounts/${a.id}`, 'DELETE'); await onRemoved() })()
        }}>Remove</button>
      </div>
      {folders && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {folders.map((f) => (
            <label key={f.path} className="flex items-center gap-1.5 text-xs text-gray-700">
              <input type="checkbox" className="accent-sky-700" checked={a.folders.includes(f.path)} disabled={busy}
                onChange={(e) => run(() => api(`accounts/${a.id}`, 'PATCH', { folders: e.target.checked ? [...a.folders, f.path] : a.folders.filter((x) => x !== f.path) }))} />
              {f.path}
            </label>
          ))}
        </div>
      )}
      <form className="mt-2 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (password) void run(async () => { await api(`accounts/${a.id}`, 'PATCH', { password }); setPassword('') }) }}>
        <input className="w-48 rounded-lg border border-gray-200 px-2 py-1 text-xs" type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className={btn} disabled={busy || !password}>Change</button>
      </form>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  )
}

// ── Reading one ───────────────────────────────────────────────────────────────

/** The email's HTML in a sandbox: no scripts, no forms, and remote images only when asked. */
function HtmlBody({ html, images }: { html: string; images: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${images ? ' https: http:' : ''}`
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#111;margin:12px;word-wrap:break-word}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`
  const fit = () => {
    const f = ref.current
    if (f?.contentDocument?.body) f.style.height = `${Math.max(200, f.contentDocument.documentElement.scrollHeight + 16)}px`
  }
  // allow-same-origin only so the height can be measured; with no allow-scripts the email can run nothing.
  return <iframe ref={ref} title="Email" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcDoc={doc} onLoad={fit} className="w-full rounded-lg border border-gray-100 bg-white" />
}

/** Dealing with one email: a task, the host's inbox, archive, delete, keep; "always" makes it a rule. */
function ProcessBar({ m, targets, onDecide }: {
  m: MessageView
  targets: { key: string; label: string }[]
  onDecide: (d: Decision, always: boolean) => Promise<void>
}) {
  const task = targets.find((t) => t.key === 'task') ?? targets[0]
  const others = targets.filter((t) => t !== task)
  const [title, setTitle] = useState(taskTitle(m.subject))
  const [hold, setHold] = useState('Now')
  const [day, setDay] = useState('')
  const [archive, setArchive] = useState(true)
  const [always, setAlways] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const titleBox = useRef<HTMLInputElement>(null)
  useEffect(() => { setTitle(taskTitle(m.subject)); setHold('Now'); setDay(''); setAlways(false); setError('') }, [m.id, m.subject])
  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === 't' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); titleBox.current?.focus(); titleBox.current?.select() }
    }
    window.addEventListener('keydown', t)
    return () => window.removeEventListener('keydown', t)
  }, [])
  const when = day || (HOLDS.find(([l]) => l === hold)?.[1]() ?? '')
  const run = async (key: string, d: Decision) => {
    setBusy(key)
    setError('')
    try {
      await onDecide(d, always)
    } catch (e) {
      setError(msg(e))
      setBusy('')
    }
  }
  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50/60 p-3" aria-label="Process this email">
      {task && (
        <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void run('task', { kind: 'send', target: task.key, title, when, archive }) }}>
          <input ref={titleBox} aria-label="Task" className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className={primary} disabled={busy !== '' || !title.trim()}>{busy === 'task' ? '…' : `${task.label} (t)`}</button>
          <div className="flex basis-full flex-wrap items-center gap-1.5 text-xs text-gray-600">
            <span>On the list</span>
            {HOLDS.map(([label]) => (
              <button type="button" key={label} onClick={() => { setHold(label); setDay('') }}
                className={`rounded-full border px-2 py-0.5 ${hold === label && !day ? 'border-sky-600 bg-white text-sky-900' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}>{label}</button>
            ))}
            <input type="date" aria-label="From a day" className="rounded border border-gray-200 px-1.5 py-0.5" value={day} min={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} />
            <label className="ml-2 flex items-center gap-1"><input type="checkbox" className="accent-sky-700" checked={archive} onChange={(e) => setArchive(e.target.checked)} /> and archive the email</label>
          </div>
        </form>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {others.map((t) => (
          <button key={t.key} className={btn} disabled={busy !== ''} onClick={() => run(t.key, { kind: 'send', target: t.key, archive })}>{busy === t.key ? '…' : t.label}</button>
        ))}
        <button className={btn} disabled={busy !== ''} onClick={() => run('archive', { kind: 'archive' })} title="Archive (e)">{busy === 'archive' ? '…' : 'Archive'}</button>
        <button className={btn} disabled={busy !== ''} onClick={() => run('trash', { kind: 'trash' })} title="Delete (#)">{busy === 'trash' ? '…' : 'Delete'}</button>
        <button className={btn} disabled={busy !== ''} onClick={() => run('keep', { kind: 'keep' })} title="Leave it in the mailbox, dealt with">{busy === 'keep' ? '…' : 'Keep'}</button>
        {m.fromAddr && (
          <label className="ml-1 flex items-center gap-1 text-xs text-gray-600" title="A rule: new mail from this sender gets the same, as it arrives">
            <input type="checkbox" className="accent-sky-700" checked={always} onChange={(e) => setAlways(e.target.checked)} /> always for {m.fromAddr}
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  )
}

function Reader({ id, targets, onAction, onDecide, onClose }: {
  id: string
  targets: { key: string; label: string }[]
  onAction: (action: 'unseen') => Promise<void>
  onDecide: (d: Decision, always: boolean) => Promise<void>
  onClose: () => void
}) {
  const [m, setM] = useState<MessageView | null>(null)
  const [error, setError] = useState('')
  const [images, setImages] = useState(false)
  useEffect(() => {
    setM(null)
    setImages(false)
    setError('')
    api<MessageView>(`messages/${id}`).then(setM).catch((e) => setError(msg(e)))
  }, [id])
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
  if (!m) return <p className="text-sm text-gray-400">Opening…</p>
  const hasRemote = Boolean(m.htmlBody && /<img[^>]+src=["']?https?:/i.test(m.htmlBody))
  return (
    <article>
      <ProcessBar m={m} targets={targets} onDecide={onDecide} />
      <div className="mb-2 flex items-center gap-3">
        <button className="text-xs text-gray-500 hover:text-gray-800" onClick={() => void onAction('unseen').catch((e) => setError(msg(e)))} title="Mark unread (u)">Mark unread</button>
        <button className="ml-auto text-xs text-gray-500 hover:text-gray-800 lg:hidden" onClick={onClose}>← Back</button>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 break-words">{m.subject || '(no subject)'}</h2>
      <p className="mt-1 text-sm text-gray-700 break-words">
        <b>{m.fromName || m.fromAddr}</b>{m.fromName && <span className="text-gray-500"> &lt;{m.fromAddr}&gt;</span>}
      </p>
      <p className="text-xs text-gray-500 break-words">to {m.toAddrs || '—'} · {m.sentAt ? new Date(m.sentAt).toLocaleString() : ''}</p>
      {hasRemote && (
        <p className="mt-2 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
          {images ? 'Showing images.' : 'Remote images are off, so the sender does not learn you opened it.'}
          {!images && <button className="text-sky-800 hover:underline" onClick={() => setImages(true)}>Show images</button>}
        </p>
      )}
      <div className="mt-3">
        {m.htmlBody
          ? <HtmlBody key={`${m.id}-${images}`} html={m.htmlBody} images={images} />
          : <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-800">{m.textBody}</pre>}
      </div>
    </article>
  )
}

const actionName = (a: string, targets: { key: string; label: string }[]) =>
  a.startsWith('send:') ? (targets.find((t) => `send:${t.key}` === a)?.label ?? a) : a === 'trash' ? 'Delete' : a[0].toUpperCase() + a.slice(1)

/** The rules that pre-process new mail, and a way to add one by hand. */
function Rules({ rules, targets, onChanged }: { rules: RuleView[]; targets: { key: string; label: string }[]; onChanged: (r: RuleView[]) => void }) {
  const [from, setFrom] = useState('')
  const [subject, setSubject] = useState('')
  const [action, setAction] = useState(targets[0] ? `send:${targets[0].key}` : 'archive')
  const [error, setError] = useState('')
  const actions = [...targets.map((t) => [`send:${t.key}`, t.label] as const), ['archive', 'Archive'] as const, ['trash', 'Delete'] as const, ['keep', 'Keep'] as const]
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3">
      <h3 className="text-sm font-medium text-gray-900">Rules for new mail</h3>
      <p className="text-xs text-gray-500">Each sync ends by running these over mail still to process. The first that fits is done.</p>
      <ul className="mt-2 space-y-1">
        {rules.length === 0 && <li className="text-xs text-gray-400">None yet. Tick “always” when processing an email to make one.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
            <span>{[r.fromMatch && `from “${r.fromMatch}”`, r.subjectMatch && `subject has “${r.subjectMatch}”`].filter(Boolean).join(' and ')}</span>
            <span className="text-gray-400">→</span>
            <b>{actionName(r.action, targets)}{r.action.startsWith('send:') && r.archive ? ', and archive' : ''}</b>
            <span className="text-gray-400">done {r.applied}×</span>
            <button className="text-red-700 hover:underline" onClick={async () => onChanged((await api<{ rules: RuleView[] }>(`rules/${r.id}`, 'DELETE')).rules)}>remove</button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex flex-wrap items-center gap-1.5" onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        try {
          onChanged((await api<{ rules: RuleView[] }>('rules', 'POST', { fromMatch: from, subjectMatch: subject, action })).rules)
          setFrom(''); setSubject('')
        } catch (err) { setError(msg(err)) }
      }}>
        <input className="w-40 rounded border border-gray-200 px-2 py-0.5 text-xs" placeholder="from (part of address)" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="w-40 rounded border border-gray-200 px-2 py-0.5 text-xs" placeholder="subject has" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <select className="rounded border border-gray-200 px-1.5 py-0.5 text-xs" value={action} onChange={(e) => setAction(e.target.value)}>
          {actions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className={btn} disabled={!from.trim() && !subject.trim()}>Add rule</button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </form>
    </section>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────

export function MailApp({ accounts: initialAccounts, messages: initialMessages, rules: initialRules, waiting: initialWaiting, providers, targets }: MailAppProps) {
  const [accounts, setAccounts] = useState(initialAccounts)
  const [list, setList] = useState(initialMessages)
  const [rules, setRules] = useState(initialRules)
  const [waiting, setWaiting] = useState(initialWaiting)
  // To process (the default) or all mail.
  const [todo, setTodo] = useState(true)
  const [q, setQ] = useState('')
  const [unread, setUnread] = useState(false)
  const [account, setAccount] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [settings, setSettings] = useState(initialAccounts.length === 0)
  const [adding, setAdding] = useState(initialAccounts.length === 0)
  const [syncing, setSyncing] = useState(false)
  const [flash, setFlash] = useState('')
  const [more, setMore] = useState(initialMessages.length >= 50)
  const search = useRef<HTMLInputElement>(null)

  const query = useCallback((before?: string) => {
    const p = new URLSearchParams()
    if (q.trim()) p.set('q', q.trim())
    if (unread) p.set('unread', '1')
    if (todo) p.set('todo', '1')
    if (account) p.set('account', account)
    if (before) p.set('before', before)
    return `messages?${p}`
  }, [q, unread, todo, account])

  const reload = useCallback(async () => {
    const r = await api<{ messages: MessageSummary[]; waiting: number }>(query())
    setList(r.messages)
    setWaiting(r.waiting)
    setMore(r.messages.length >= 50)
  }, [query])

  useEffect(() => {
    const t = setTimeout(() => void reload().catch(() => undefined), 200)
    return () => clearTimeout(t)
  }, [reload])

  const reloadAccounts = async () => setAccounts((await api<{ accounts: AccountView[] }>('state')).accounts)

  const syncAll = async () => {
    setSyncing(true)
    setFlash('')
    try {
      let added = 0
      let ruled = 0
      for (const a of accounts) {
        const r = await api<{ added: number; ruled: number }>(`accounts/${a.id}/sync`, 'POST')
        added += r.added
        ruled += r.ruled
      }
      setFlash([added ? `${added} new` : 'Nothing new', ruled ? `${ruled} handled by rules` : ''].filter(Boolean).join(', '))
      await Promise.all([reload(), reloadAccounts()])
    } catch (e) {
      setFlash(msg(e))
    } finally {
      setSyncing(false)
    }
  }

  const index = useMemo(() => list.findIndex((m) => m.id === open), [list, open])

  /** Off the list (dealt with, or gone from the mailbox): open the next one, as Gmail does. */
  const advance = useCallback((id: string) => {
    const i = list.findIndex((m) => m.id === id)
    const next = list[i + 1] ?? list[i - 1] ?? null
    setList((l) => l.filter((m) => m.id !== id))
    setOpen(next?.id ?? null)
  }, [list])

  const decide = useCallback(async (id: string, d: Decision, always = false) => {
    const r = await api<{ said: string; ruled: number }>(`messages/${id}/process`, 'POST', { decision: d, always })
    // Kept mail stays in "All mail"; everything else has left the mailbox's inbox.
    if (todo || d.kind !== 'keep') advance(id)
    setWaiting((n) => Math.max(0, n - 1 - r.ruled))
    // A host showing a count elsewhere (janki's top bar) can listen for this.
    window.dispatchEvent(new Event('janki:counts'))
    setFlash(r.ruled ? `${r.said}. The rule did ${r.ruled} more.` : r.said)
    if (always) { setRules((await api<{ rules: RuleView[] }>('rules')).rules); if (r.ruled) await reload() }
  }, [advance, todo, reload])

  const act = useCallback(async (id: string, action: 'unseen') => {
    await api(`messages/${id}/${action}`, 'POST')
    setList((l) => l.map((m) => (m.id === id ? { ...m, seen: false } : m)))
    setOpen(null)
  }, [])

  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); search.current?.focus() }
      else if (e.key === 'j') setOpen(list[Math.min(list.length - 1, index + 1)]?.id ?? null)
      else if (e.key === 'k') setOpen(list[Math.max(0, index - 1)]?.id ?? null)
      else if (open && e.key === 'e') void decide(open, { kind: 'archive' }).catch((err) => setFlash(msg(err)))
      else if (open && e.key === '#') void decide(open, { kind: 'trash' }).catch((err) => setFlash(msg(err)))
      else if (open && e.key === 'u') void act(open, 'unseen').catch((err) => setFlash(msg(err)))
      else if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [list, index, open, act, decide])

  const loadMore = async () => {
    const last = list[list.length - 1]
    if (!last?.sentAt) return
    const r = await api<{ messages: MessageSummary[] }>(query(last.sentAt))
    setList((l) => [...l, ...r.messages])
    setMore(r.messages.length >= 50)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">Mail</h1>
        {accounts.length > 0 && (
          <>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-sm">
              <button onClick={() => { setTodo(true); setOpen(null) }} className={`rounded-md px-2.5 py-0.5 ${todo ? 'bg-sky-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}>To process{waiting ? ` (${waiting})` : ''}</button>
              <button onClick={() => { setTodo(false); setOpen(null) }} className={`rounded-md px-2.5 py-0.5 ${!todo ? 'bg-sky-700 text-white' : 'text-gray-600 hover:text-gray-900'}`}>All mail</button>
            </div>
            <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail…  ( / )" aria-label="Search mail"
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 sm:max-w-md" />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" className="accent-sky-700" checked={unread} onChange={(e) => setUnread(e.target.checked)} /> Unread
            </label>
            {accounts.length > 1 && (
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Mailbox">
                <option value="">All mailboxes</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            )}
            <button className={btn} disabled={syncing} onClick={syncAll}>{syncing ? 'Syncing…' : 'Sync'}</button>
          </>
        )}
        <button className="text-xs text-sky-800 hover:underline" onClick={() => setSettings((s) => !s)}>{settings ? 'Hide mailboxes' : 'Mailboxes'}</button>
        {flash && <span role="status" className="text-xs text-gray-600">{flash}</span>}
      </div>

      {settings && (
        <div className="mb-5 space-y-3">
          {accounts.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-2">
              {accounts.map((a) => (
                <AccountCard key={a.id} a={a} onChanged={async () => { await reloadAccounts(); await reload() }}
                  onRemoved={async () => { await reloadAccounts(); await reload() }} />
              ))}
            </ul>
          )}
          {accounts.length > 0 && <Rules rules={rules} targets={targets} onChanged={setRules} />}
          {adding
            ? <AddAccount providers={providers} onCancel={accounts.length ? () => setAdding(false) : undefined}
                onAdded={async () => { setAdding(false); setSettings(false); await reloadAccounts(); await reload() }} />
            : <button className="text-sm text-sky-800 hover:underline" onClick={() => setAdding(true)}>+ Add a mailbox</button>}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className={open ? 'hidden lg:block' : ''}>
            {list.length === 0 && <p className="text-sm text-gray-500">{q ? `Nothing matches “${q}”.` : todo ? 'Inbox zero: nothing to process.' : 'No mail here yet. Sync to fetch it.'}</p>}
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
              {list.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setOpen(m.id)}
                    className={`block w-full px-3 py-2 text-left hover:bg-sky-50 ${open === m.id ? 'bg-sky-50' : ''}`}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-sm ${m.seen ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{m.fromName || m.fromAddr}</span>
                      <span className="shrink-0 text-xs text-gray-500">{shortDate(m.sentAt)}</span>
                    </span>
                    <span className={`block truncate text-sm ${m.seen ? 'text-gray-600' : 'font-medium text-gray-900'}`}>{m.subject || '(no subject)'}</span>
                    <span className="block truncate text-xs text-gray-400">{m.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
            {more && <button className="mt-2 text-xs text-sky-800 hover:underline" onClick={loadMore}>Older…</button>}
          </div>
          <div className={open ? '' : 'hidden lg:block'}>
            {open
              ? <Reader id={open} targets={targets} onClose={() => setOpen(null)} onAction={(a) => act(open, a)} onDecide={(d, always) => decide(open, d, always)} />
              : <p className="text-sm text-gray-400">{todo && list.length ? 'Open the first one and deal with it: a task, archive, delete or keep. ' : ''}Keys: j / k to move, t task, e archive, # delete, u unread, / search.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
