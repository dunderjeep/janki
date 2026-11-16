/**
 * Talking to the mail server. A sync keeps the local copy of each chosen
 * folder in step with the server, both ways round:
 *
 * - new mail within the window (sync_days) is fetched, without marking it read
 *   (imapflow fetches with BODY.PEEK);
 * - mail gone from the folder on the server (deleted, archived, moved
 *   elsewhere) goes from the copy too, and read/unread follows the server.
 *
 * And the other way: marking read, archiving and deleting here are done on
 * the server at once (see act()), then in the copy.
 */
import { ImapFlow, type ListResponse } from 'imapflow'
import { simpleParser, type AddressObject } from 'mailparser'
import { nanoid } from 'nanoid'
import { and, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import { AppError } from '@janki/app-kit/api'
import { db } from '../host'
import { unseal } from './crypto'
import { accounts, folders, messages, type AccountRow } from '../schema'

export type Login = { host: string; port: number; secure: boolean; username: string; password: string }

/** The most new messages one sync fetches from a folder; the rest come on the next one. */
const BATCH = 200
const MAX_TEXT = 200_000
const MAX_HTML = 600_000
/** How long the local copy of mail archived, deleted or gone from the server is kept. */
export const REMOVED_DAYS = 30

function client(l: Login) {
  return new ImapFlow({
    host: l.host, port: l.port, secure: l.secure,
    auth: { user: l.username, pass: l.password },
    logger: false,
    // Gmail and most others answer quickly; a hung server should not hold a sync forever.
    connectionTimeout: 20_000, greetingTimeout: 15_000, socketTimeout: 120_000,
  })
}

export const loginOf = (a: AccountRow): Login => ({ host: a.host, port: a.port, secure: a.secure, username: a.username, password: unseal(a.secret) })

/** Says, in words, why a connection failed. */
function why(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string }
  if (e.authenticationFailed) return 'The server refused the address or password. For Gmail, use an app password, not your usual one.'
  if (e.code === 'ENOTFOUND') return 'No such mail server: check its address.'
  if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') return 'The mail server did not answer: check the address and port.'
  return e.responseText || e.message || 'The mail server could not be reached'
}

async function session<T>(l: Login, work: (c: ImapFlow) => Promise<T>): Promise<T> {
  const c = client(l)
  try {
    await c.connect()
  } catch (err) {
    throw new AppError(why(err), 400)
  }
  try {
    return await work(c)
  } finally {
    await c.logout().catch(() => c.close())
  }
}

export type FolderInfo = { path: string; name: string; specialUse: string | null }

const folderInfo = (f: ListResponse): FolderInfo => ({ path: f.path, name: f.name, specialUse: f.specialUse ?? null })

/** Logs in and lists the folders: how a new account is checked before it is saved. */
export async function listFolders(l: Login): Promise<FolderInfo[]> {
  return session(l, async (c) => (await c.list()).filter((f) => !f.flags?.has('\\Noselect')).map(folderInfo))
}

const addresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => (v.name ? `${v.name} <${v.address}>` : v.address ?? '')).join(', ')

const stripHtml = (html: string) =>
  html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim()

export type SyncResult = { added: number; removed: number; folders: number }

const syncing = new Set<string>()

/** Brings one account's copy in step with its server. */
export async function syncAccount(a: AccountRow): Promise<SyncResult> {
  if (syncing.has(a.id)) return { added: 0, removed: 0, folders: 0 }
  syncing.add(a.id)
  const result: SyncResult = { added: 0, removed: 0, folders: 0 }
  try {
    await session(loginOf(a), async (c) => {
      const since = new Date(Date.now() - a.syncDays * 86_400_000)
      for (const folder of a.folders) {
        const lock = await c.getMailboxLock(folder).catch(() => null)
        if (!lock) continue
        try {
          result.folders++
          const box = c.mailbox
          if (!box) continue
          const validity = Number(box.uidValidity)
          const [state] = await db.select().from(folders).where(and(eq(folders.accountId, a.id), eq(folders.name, folder)))
          if (state && state.uidvalidity !== validity) {
            // The server renumbered the folder: start its copy again.
            await db.delete(messages).where(and(eq(messages.accountId, a.id), eq(messages.folder, folder)))
          }
          await db.insert(folders).values({ accountId: a.id, name: folder, uidvalidity: validity, lastUid: 0 })
            .onConflictDoUpdate({ target: [folders.accountId, folders.name], set: { uidvalidity: validity } })

          const onServer = new Set(((await c.search({ since }, { uid: true })) || []).map(Number))
          const unseen = new Set(((await c.search({ since, seen: false }, { uid: true })) || []).map(Number))
          const local = await db.select({ id: messages.id, uid: messages.uid, seen: messages.seen, removed: sql<boolean>`${messages.removedAt} is not null` }).from(messages)
            .where(and(eq(messages.accountId, a.id), eq(messages.folder, folder), eq(messages.uidvalidity, validity)))
          const have = new Set(local.map((m) => Number(m.uid)))

          // Gone from the folder on the server, or now older than the window: out of the copy.
          const gone = local.filter((m) => !onServer.has(Number(m.uid)) && !m.removed).map((m) => m.id)
          if (gone.length) {
            // Out of the lists, but kept a while for other apps (see REMOVED_DAYS).
            await db.update(messages).set({ removedAt: new Date(), processedAt: sql`coalesce(${messages.processedAt}, now())` }).where(inArray(messages.id, gone))
            result.removed += gone.length
          }
          await db.delete(messages).where(and(eq(messages.accountId, a.id), eq(messages.folder, folder), lt(messages.sentAt, since)))

          // Read or unread, as the server has it.
          const nowSeen = local.filter((m) => !m.removed && onServer.has(Number(m.uid)) && m.seen === unseen.has(Number(m.uid))).map((m) => m.id)
          if (nowSeen.length) {
            await db.update(messages).set({ seen: sql`not ${messages.seen}` }).where(inArray(messages.id, nowSeen))
          }

          // New mail, newest first, a batch at a time.
          const fresh = [...onServer].filter((u) => !have.has(u)).sort((x, y) => y - x).slice(0, BATCH)
          if (fresh.length) {
            for await (const msg of c.fetch(fresh.join(','), { uid: true, source: true, flags: true, internalDate: true }, { uid: true })) {
              if (!msg.source) continue
              const p = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true })
              const html = typeof p.html === 'string' ? p.html : null
              const text = (p.text?.trim() || (html ? stripHtml(html) : '')).slice(0, MAX_TEXT)
              const from = p.from?.value[0]
              await db.insert(messages).values({
                id: nanoid(), ownerUid: a.ownerUid, accountId: a.id, folder, uidvalidity: validity, uid: Number(msg.uid),
                messageId: p.messageId ?? null,
                sentAt: p.date ?? (msg.internalDate ? new Date(msg.internalDate) : null),
                fromName: from?.name ?? '', fromAddr: from?.address ?? '',
                toAddrs: addresses(p.to).slice(0, 2000),
                subject: (p.subject ?? '').slice(0, 1000),
                // Without the [https://…] that text made from HTML puts after each link.
                snippet: text.replace(/\[(?:https?|mailto):[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 220),
                textBody: text,
                htmlBody: html && html.length <= MAX_HTML ? html : null,
                seen: msg.flags?.has('\\Seen') ?? false,
              }).onConflictDoNothing()
              result.added++
            }
          }
          const top = Math.max(0, ...onServer)
          await db.update(folders).set({ lastUid: top }).where(and(eq(folders.accountId, a.id), eq(folders.name, folder)))
        } finally {
          lock.release()
        }
      }
    })
    await db.delete(messages).where(and(eq(messages.accountId, a.id), lt(messages.removedAt, new Date(Date.now() - REMOVED_DAYS * 86_400_000))))
    await db.update(accounts).set({ lastSyncAt: new Date(), lastError: null }).where(eq(accounts.id, a.id))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.update(accounts).set({ lastError: message.slice(0, 500), lastSyncAt: new Date() }).where(eq(accounts.id, a.id))
    throw err
  } finally {
    syncing.delete(a.id)
  }
}

export type Action = 'seen' | 'unseen' | 'archive' | 'trash'

const findUse = (list: ListResponse[], ...uses: string[]) => uses.map((u) => list.find((f) => f.specialUse === u)).find(Boolean)

/**
 * Does it on the server: marks read or unread, archives (to the Archive
 * folder, or Gmail's All Mail, which takes it out of the inbox), or deletes
 * (to the Trash; from the Trash itself, for good).
 */
export async function act(a: AccountRow, m: { folder: string; uidvalidity: number; uid: number }, action: Action): Promise<void> {
  await session(loginOf(a), async (c) => {
    const list = action === 'archive' || action === 'trash' ? await c.list() : []
    const lock = await c.getMailboxLock(m.folder)
    try {
      if (!c.mailbox || Number(c.mailbox.uidValidity) !== m.uidvalidity) {
        throw new AppError('The server renumbered this folder: sync, then try again', 409)
      }
      const uid = String(m.uid)
      if (action === 'seen') await c.messageFlagsAdd(uid, ['\\Seen'], { uid: true })
      else if (action === 'unseen') await c.messageFlagsRemove(uid, ['\\Seen'], { uid: true })
      else if (action === 'archive') {
        const to = findUse(list, '\\Archive', '\\All')
        if (!to) throw new AppError('This mailbox has no archive folder')
        if (to.path === m.folder) return
        await c.messageMove(uid, to.path, { uid: true })
      } else {
        const trash = findUse(list, '\\Trash')
        if (!trash || trash.path === m.folder) await c.messageDelete(uid, { uid: true })
        else await c.messageMove(uid, trash.path, { uid: true })
      }
    } finally {
      lock.release()
    }
  })
}
