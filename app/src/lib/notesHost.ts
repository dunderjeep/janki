/**
 * janki as Notes' host: janki's Postgres, and the signed-in person's DID.
 *
 * Notes are owned by an ATProto identity, not by janki's own user id. Until
 * sign-in is ATProto OAuth, the DID comes from the Bluesky account linked to
 * the janki user; someone with no linked Bluesky account has no notes.
 * Imported for its side effect by the Notes API route, and by anything in
 * janki that reads notes (Quilt, Porcupin).
 *
 * NOTES_ORG_DIR, if set, is a folder of .org files mirrored one way into the
 * notes of one person, NOTES_ORG_DID, for the changeover from Emacs: see
 * syncNotes(). Both must be set; the folder is never mirrored into anyone else's notes.
 */
import { and, eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { authAccounts } from '@/db/schema/auth'
import { setNotesHost, type NotesDb } from 'notes/server'
import { syncOrgDir, type SyncResult } from 'notes/mirror'
import { minioBlobs } from './notesBlobs'

const didFor = new Map<string, string | null>()

/** The DID whose notes a janki user sees, or null. */
export async function didForUser(userId: string): Promise<string | null> {
  if (didFor.has(userId)) return didFor.get(userId)!
  const [row] = await db
    .select({ did: authAccounts.providerAccountId })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.provider, 'bluesky')))
    .limit(1)
  const did = row?.did?.startsWith('did:') ? row.did : null
  if (did) didFor.set(userId, did)
  return did
}

setNotesHost({
  db: db as unknown as NotesDb,
  blobs: minioBlobs,
  userId: async () => {
    const id = (await auth())?.user?.id
    return id ? didForUser(id) : null
  },
})

/** The signed-in person's DID, or null. */
export async function currentDid(): Promise<string | null> {
  const id = (await auth())?.user?.id
  return id ? didForUser(id) : null
}

const ORG_MIRROR = process.env.NOTES_ORG_DIR?.replace(/^~(?=$|\/)/, process.env.HOME ?? '~')
/** Whose notes the folder is: the one DID it may ever be mirrored into. */
const ORG_MIRROR_DID = process.env.NOTES_ORG_DID?.trim() || null
/** How stale the mirror may get before a read brings it up to date. */
const SYNC_EVERY_MS = 15_000

type MirrorState = { at: number; running: Promise<SyncResult | null> | null; last: SyncResult | null }
declare global {
  var __notesMirror: Map<string, MirrorState> | undefined
}
const mirrors = (globalThis.__notesMirror ??= new Map())

/**
 * Brings changed .org files in from NOTES_ORG_DIR before a read, at most every
 * 15 seconds and never two at once, but only for NOTES_ORG_DID: on a janki
 * with other people signed in, the folder must not land in their notes. Does
 * nothing when either is unset, which is how janki runs once Emacs is gone,
 * or anywhere it is hosted.
 * A failed sync is logged, and the read goes ahead on what is already there.
 */
export async function syncNotes(did: string): Promise<SyncResult | null> {
  if (!ORG_MIRROR || !ORG_MIRROR_DID || did !== ORG_MIRROR_DID) return null
  const state = mirrors.get(did) ?? { at: 0, running: null, last: null }
  mirrors.set(did, state)
  if (state.running) return state.running
  if (Date.now() - state.at < SYNC_EVERY_MS) return state.last
  state.running = syncOrgDir(did, ORG_MIRROR)
    .then((r) => {
      if (r.imported.length || r.deleted.length) console.log(`[notes] mirror: ${r.imported.length} in, ${r.deleted.length} gone, ${r.ms}ms`)
      if (r.conflicts.length) console.warn(`[notes] mirror: edited in janki, file not imported: ${r.conflicts.join(', ')}`)
      state.last = r
      return r
    })
    .catch((err) => {
      console.error('[notes] mirror failed:', err)
      return null
    })
    .finally(() => {
      state.at = Date.now()
      state.running = null
    })
  return state.running
}

/**
 * Runs a janki route over the signed-in person's notes: 401 when signed out,
 * 403 with no linked identity, the mirror brought up to date first, and an
 * AppError turned into its status and message.
 */
export async function notesRoute(run: (did: string) => Promise<unknown>): Promise<Response> {
  const { NextResponse } = await import('next/server')
  const { AppError } = await import('@janki/app-kit/api')
  const id = (await auth())?.user?.id
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const did = await didForUser(id)
  if (!did) return NextResponse.json({ error: 'Link a Bluesky account to use your notes' }, { status: 403 })
  try {
    await syncNotes(did)
    const out = await run(did)
    return out instanceof Response ? out : NextResponse.json(out)
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('[notes route]', err)
    return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
  }
}
