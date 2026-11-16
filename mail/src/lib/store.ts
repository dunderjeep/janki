/** Accounts and messages, for one owner. Everything that touches the server goes through ./imap. */
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { AppError } from '@janki/app-kit/api'
import { db, mailHost } from '../host'
import { accounts, messages, rules, type AccountRow, type MessageRow, type RuleRow } from '../schema'
import { seal } from './crypto'
import { act, listFolders, loginOf, syncAccount, type Action, type FolderInfo, type Login } from './imap'

export type AccountView = {
  id: string; label: string; address: string; host: string; port: number; secure: boolean; username: string
  folders: string[]; syncDays: number; lastSyncAt: string | null; lastError: string | null
}

export type MessageSummary = {
  id: string; accountId: string; folder: string; sentAt: string | null
  fromName: string; fromAddr: string; subject: string; snippet: string; seen: boolean
}

export type MessageView = MessageSummary & { toAddrs: string; textBody: string; htmlBody: string | null }

/** Ready-made settings for the common providers. Any other IMAP server works too. */
export const PROVIDERS = [
  { key: 'gmail', label: 'Gmail', host: 'imap.gmail.com', port: 993, note: 'Use an app password: Google Account → Security → App passwords (2-step verification must be on).' },
  { key: 'fastmail', label: 'Fastmail', host: 'imap.fastmail.com', port: 993, note: 'Use an app password from Settings → Privacy & Security.' },
  { key: 'outlook', label: 'Outlook / Hotmail', host: 'outlook.office365.com', port: 993, note: 'Microsoft may require an app password, or may not allow IMAP passwords at all.' },
  { key: 'proton', label: 'Proton (Bridge)', host: '127.0.0.1', port: 1143, note: 'Through Proton Mail Bridge running on this machine; use the password Bridge shows.' },
] as const

const view = (a: AccountRow): AccountView => ({
  id: a.id, label: a.label, address: a.address, host: a.host, port: a.port, secure: a.secure, username: a.username,
  folders: a.folders, syncDays: a.syncDays, lastSyncAt: a.lastSyncAt?.toISOString() ?? null, lastError: a.lastError,
})

const str = (v: unknown, what: string, max = 300) => {
  const t = typeof v === 'string' ? v.trim() : ''
  if (!t) throw new AppError(`${what} is missing`)
  if (t.length > max) throw new AppError(`${what} is too long`)
  return t
}

const loginFrom = (b: Record<string, unknown>): Login => {
  const port = Number(b.port ?? 993)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError('That port is not a port number')
  return {
    host: str(b.host, 'The mail server'),
    port,
    // 993 is IMAP over TLS; 143 and Bridge's 1143 start plain (imapflow upgrades with STARTTLS when offered).
    secure: typeof b.secure === 'boolean' ? b.secure : port === 993,
    username: str(b.username ?? b.address, 'The user name'),
    password: str(b.password, 'The password', 500),
  }
}

async function owned(uid: string, id: string): Promise<AccountRow> {
  const [a] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerUid, uid)))
  if (!a) throw new AppError('No such account', 404)
  return a
}

export async function listAccounts(uid: string): Promise<AccountView[]> {
  return (await db.select().from(accounts).where(eq(accounts.ownerUid, uid)).orderBy(accounts.createdAt)).map(view)
}

/** Logs in with these settings and lists the folders, without saving anything. */
export async function testLogin(body: Record<string, unknown>): Promise<FolderInfo[]> {
  return listFolders(loginFrom(body))
}

/** Saves an account once it has logged in, then syncs it. */
export async function addAccount(uid: string, body: Record<string, unknown>): Promise<AccountView> {
  const login = loginFrom(body)
  const address = str(body.address, 'The address')
  const found = await listFolders(login)
  const wanted = Array.isArray(body.folders) ? body.folders.filter((f): f is string => typeof f === 'string') : ['INBOX']
  const folderList = wanted.filter((f) => found.some((x) => x.path === f))
  const [row] = await db.insert(accounts).values({
    id: nanoid(), ownerUid: uid, label: typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : address,
    address, host: login.host, port: login.port, secure: login.secure, username: login.username, secret: seal(login.password),
    folders: folderList.length ? folderList : ['INBOX'], syncDays: syncDays(body.syncDays),
  }).returning()
  await syncAccount(row).catch(() => undefined)
  // What is already in the mailbox when it is added counts as dealt with, bar the last two days.
  await db.update(messages).set({ processedAt: new Date() })
    .where(and(eq(messages.accountId, row.id), isNull(messages.processedAt), lt(messages.sentAt, new Date(Date.now() - 2 * 86_400_000))))
  return view(await owned(uid, row.id))
}

const syncDays = (v: unknown) => {
  const n = Math.round(Number(v ?? 60))
  return Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : 60
}

export async function updateAccount(uid: string, id: string, body: Record<string, unknown>): Promise<AccountView> {
  const a = await owned(uid, id)
  const set: Partial<typeof accounts.$inferInsert> = {}
  if (typeof body.label === 'string' && body.label.trim()) set.label = body.label.trim().slice(0, 80)
  if (body.syncDays !== undefined) set.syncDays = syncDays(body.syncDays)
  if (Array.isArray(body.folders)) {
    const list = body.folders.filter((f): f is string => typeof f === 'string' && f.length > 0).slice(0, 20)
    if (!list.length) throw new AppError('Choose at least one folder')
    set.folders = list
  }
  if (typeof body.password === 'string' && body.password.trim()) {
    await listFolders({ ...loginOf(a), password: body.password.trim() })
    set.secret = seal(body.password.trim())
  }
  if (Object.keys(set).length) await db.update(accounts).set(set).where(eq(accounts.id, id))
  return view(await owned(uid, id))
}

/** The folders on the server, for choosing which to keep a copy of. */
export async function accountFolders(uid: string, id: string): Promise<FolderInfo[]> {
  return listFolders(loginOf(await owned(uid, id)))
}

/** Forgets the account and its copy here. Nothing on the server changes. */
export async function removeAccount(uid: string, id: string): Promise<{ ok: true }> {
  await owned(uid, id)
  await db.delete(accounts).where(eq(accounts.id, id))
  return { ok: true }
}

export async function syncNow(uid: string, id: string) {
  const result = await syncAccount(await owned(uid, id))
  const ruled = await applyRules(uid)
  return { ...result, ruled, account: view(await owned(uid, id)) }
}

/** Every account of every owner, one after the other: the host's timer calls this. */
export async function syncAll(): Promise<void> {
  for (const a of await db.select().from(accounts)) {
    await syncAccount(a).catch((err) => console.error('[mail] sync', a.id, err instanceof Error ? err.message : err))
    await applyRules(a.ownerUid).catch((err) => console.error('[mail] rules', a.id, err instanceof Error ? err.message : err))
  }
}

const summaryColumns = {
  id: messages.id, accountId: messages.accountId, folder: messages.folder, sentAt: messages.sentAt,
  fromName: messages.fromName, fromAddr: messages.fromAddr, subject: messages.subject, snippet: messages.snippet, seen: messages.seen,
}

const iso = <T extends { sentAt: Date | null }>(r: T) => ({ ...r, sentAt: r.sentAt?.toISOString() ?? null })

/** Each word as a prefix, all of them required: "ikea bil" finds "IKEA Billy". */
function tsQuery(q: string): string | null {
  const words = q.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 10)
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null
}

export type MessageQuery = { q?: string; accountId?: string; unread?: boolean; todo?: boolean; before?: string; limit?: number }

/** Newest first; `before` (an ISO time) pages back. */
export async function listMessages(uid: string, o: MessageQuery = {}): Promise<MessageSummary[]> {
  const conds = [eq(messages.ownerUid, uid), isNull(messages.removedAt)]
  const tq = o.q ? tsQuery(o.q) : null
  if (o.q && !tq) return []
  if (tq) conds.push(sql`${messages}.search @@ to_tsquery('simple', ${tq})`)
  if (o.accountId) conds.push(eq(messages.accountId, o.accountId))
  if (o.unread) conds.push(eq(messages.seen, false))
  if (o.todo) conds.push(isNull(messages.processedAt))
  if (o.before) conds.push(lt(messages.sentAt, new Date(o.before)))
  const rows = await db.select(summaryColumns).from(messages).where(and(...conds))
    .orderBy(desc(messages.sentAt)).limit(Math.min(200, o.limit ?? 50))
  return rows.map(iso)
}

/**
 * For other apps, through their host: mail matching `q`, with its text.
 * (janki's FINN counter reads the gis bort alerts this way.)
 */
/** `includeRemoved`: mail archived or deleted lately too (kept REMOVED_DAYS), for an app that may not have read it yet. */
export async function searchMail(uid: string, q: string, o: { since?: Date; limit?: number; from?: string; includeRemoved?: boolean } = {}): Promise<MessageView[]> {
  const tq = q.trim() ? tsQuery(q) : null
  if (q.trim() && !tq) return []
  if (!tq && !o.from) return []
  const conds = [eq(messages.ownerUid, uid)]
  if (!o.includeRemoved) conds.push(isNull(messages.removedAt))
  if (tq) conds.push(sql`${messages}.search @@ to_tsquery('simple', ${tq})`)
  if (o.from) conds.push(sql`${messages.fromAddr} ilike ${'%' + o.from.replace(/[\\%_]/g, '\\$&') + '%'}`)
  if (o.since) conds.push(sql`${messages.sentAt} >= ${o.since}`)
  const rows = await db.select().from(messages).where(and(...conds)).orderBy(desc(messages.sentAt)).limit(Math.min(1000, o.limit ?? 200))
  return rows.map(({ ownerUid: _o, uidvalidity: _v, uid: _u, messageId: _m, fetchedAt: _f, processedAt: _p, removedAt: _r, ...r }) => iso(r))
}

/** Off the lists now (it left the mailbox); the copy stays REMOVED_DAYS for other apps, then a sync deletes it. */
async function removeLocal(id: string) {
  await db.update(messages).set({ removedAt: new Date(), processedAt: sql`coalesce(${messages.processedAt}, now())` }).where(eq(messages.id, id))
}

async function ownedMessage(uid: string, id: string) {
  const [m] = await db.select().from(messages).where(and(eq(messages.id, id), eq(messages.ownerUid, uid), isNull(messages.removedAt)))
  if (!m) throw new AppError('That email is no longer here', 404)
  return m
}

/** One email, whole. Opening it marks it read, on the server too. */
export async function getMessage(uid: string, id: string): Promise<MessageView> {
  const m = await ownedMessage(uid, id)
  if (!m.seen) {
    await act(await owned(uid, m.accountId), m, 'seen').catch(() => undefined)
    await db.update(messages).set({ seen: true }).where(eq(messages.id, id))
    m.seen = true
  }
  const { ownerUid: _o, uidvalidity: _v, uid: _u, messageId: _m, fetchedAt: _f, processedAt: _p, removedAt: _r, ...rest } = m
  return iso(rest)
}

/** Marks read or unread, archives or deletes: on the server first, then here. */
export async function messageAction(uid: string, id: string, action: Action): Promise<{ ok: true }> {
  const m = await ownedMessage(uid, id)
  await act(await owned(uid, m.accountId), m, action)
  if (action === 'seen' || action === 'unseen') await db.update(messages).set({ seen: action === 'seen' }).where(eq(messages.id, id))
  else await removeLocal(id)
  return { ok: true }
}

// ── Processing to zero ────────────────────────────────────────────────────────

/** Sending somewhere (a task, the host's inbox), archiving, deleting, or keeping it here as dealt with. */
export type Decision =
  | { kind: 'send'; target: string; title?: string; when?: string; archive?: boolean }
  | { kind: 'archive' }
  | { kind: 'trash' }
  | { kind: 'keep' }

/** "Re: Fwd: Your invoice" → "Your invoice": a task's name from a subject. */
export const taskTitle = (subject: string) => subject.replace(/^\s*((re|fwd?|sv|vs|aw|tr)\s*:\s*)+/i, '').trim() || '(no subject)'

const bodyOf = (m: MessageRow) => {
  const when = m.sentAt ? m.sentAt.toISOString().slice(0, 10) : ''
  return [`From ${m.fromName ? `${m.fromName} <${m.fromAddr}>` : m.fromAddr}${when ? `, ${when}` : ''}`, `Subject: ${m.subject}`, '', m.textBody.slice(0, 3000).trim()].join('\n')
}

async function decide(uid: string, m: MessageRow, d: Decision): Promise<string> {
  const account = await owned(uid, m.accountId)
  if (d.kind === 'send') {
    const send = mailHost().send
    const target = send?.targets.find((t) => t.key === d.target)
    if (!send || !target) throw new AppError('There is nowhere to send it', 404)
    if (d.when && !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(d.when)) throw new AppError('A day is YYYY-MM-DD, with HH:MM if you like')
    await send.put(uid, d.target, { title: (d.title?.trim() || taskTitle(m.subject)).slice(0, 300), body: bodyOf(m), when: d.when || undefined })
    if (d.archive !== false) {
      await act(account, m, 'archive')
      await removeLocal(m.id)
      return `${target.label}, and archived`
    }
    await db.update(messages).set({ processedAt: new Date() }).where(eq(messages.id, m.id))
    return target.label
  }
  if (d.kind === 'keep') {
    await db.update(messages).set({ processedAt: new Date() }).where(eq(messages.id, m.id))
    return 'Kept'
  }
  if (d.kind !== 'archive' && d.kind !== 'trash') throw new AppError('No such decision')
  await act(account, m, d.kind)
  await removeLocal(m.id)
  return d.kind === 'archive' ? 'Archived' : 'Deleted'
}

/**
 * Deals with one email. With `always`, a rule does the same to every later
 * email from that sender (and to any already waiting).
 */
export async function processMessage(uid: string, id: string, d: Decision, always = false): Promise<{ said: string; ruled: number }> {
  const m = await ownedMessage(uid, id)
  const said = await decide(uid, m, d)
  let ruled = 0
  if (always && m.fromAddr) {
    await db.insert(rules).values({
      id: nanoid(), ownerUid: uid, fromMatch: m.fromAddr.toLowerCase(),
      action: d.kind === 'send' ? `send:${d.target}` : d.kind, archive: d.kind === 'send' ? d.archive !== false : true,
    })
    ruled = await applyRules(uid)
  }
  return { said, ruled }
}

export type RuleView = { id: string; fromMatch: string; subjectMatch: string; action: string; archive: boolean; applied: number }

export async function listRules(uid: string): Promise<RuleView[]> {
  return (await db.select().from(rules).where(eq(rules.ownerUid, uid)).orderBy(asc(rules.createdAt)))
    .map(({ ownerUid: _o, createdAt: _c, ...r }) => r)
}

export async function addRule(uid: string, body: Record<string, unknown>): Promise<RuleView[]> {
  const fromMatch = typeof body.fromMatch === 'string' ? body.fromMatch.trim().toLowerCase().slice(0, 200) : ''
  const subjectMatch = typeof body.subjectMatch === 'string' ? body.subjectMatch.trim().toLowerCase().slice(0, 200) : ''
  if (!fromMatch && !subjectMatch) throw new AppError('Say which sender or subject the rule is for')
  const action = typeof body.action === 'string' ? body.action : ''
  const targets = mailHost().send?.targets.map((t) => `send:${t.key}`) ?? []
  if (!['archive', 'trash', 'keep', ...targets].includes(action)) throw new AppError('No such action')
  await db.insert(rules).values({ id: nanoid(), ownerUid: uid, fromMatch, subjectMatch, action, archive: body.archive !== false })
  await applyRules(uid)
  return listRules(uid)
}

export async function removeRule(uid: string, id: string): Promise<RuleView[]> {
  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.ownerUid, uid)))
  return listRules(uid)
}

const matches = (r: RuleRow, m: MessageRow) =>
  (!r.fromMatch || `${m.fromName} ${m.fromAddr}`.toLowerCase().includes(r.fromMatch)) &&
  (!r.subjectMatch || m.subject.toLowerCase().includes(r.subjectMatch))

const decisionOf = (r: RuleRow): Decision =>
  r.action.startsWith('send:') ? { kind: 'send', target: r.action.slice(5), archive: r.archive } : { kind: r.action as 'archive' | 'trash' | 'keep' }

/** Runs the owner's rules over the mail still to process: the pre-processing a sync ends with. */
export async function applyRules(uid: string): Promise<number> {
  const list = await db.select().from(rules).where(eq(rules.ownerUid, uid)).orderBy(asc(rules.createdAt))
  if (!list.length) return 0
  const waiting = await db.select().from(messages).where(and(eq(messages.ownerUid, uid), isNull(messages.processedAt), isNull(messages.removedAt))).orderBy(asc(messages.sentAt))
  let done = 0
  for (const m of waiting) {
    const r = list.find((x) => matches(x, m))
    if (!r) continue
    try {
      await decide(uid, m, decisionOf(r))
      await db.update(rules).set({ applied: sql`${rules.applied} + 1` }).where(eq(rules.id, r.id))
      done++
    } catch (err) {
      console.error('[mail] rule', r.id, err instanceof Error ? err.message : err)
    }
  }
  return done
}

/** How many emails are waiting to be processed. */
export async function toProcess(uid: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(and(eq(messages.ownerUid, uid), isNull(messages.processedAt), isNull(messages.removedAt)))
  return r?.n ?? 0
}
