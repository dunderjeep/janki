/**
 * The host: what Notes needs from the app it runs inside.
 *
 * Notes are owned by an ATProto identity, so the host's userId() must return
 * the signed-in person's DID (did:plc:…), not a local account id. That is what
 * keeps a person's notes theirs across hosts, and lets records be published to
 * their PDS later under the same at:// addresses.
 */
import { defineHost, type BaseHost, type HostDb } from '@janki/app-kit/host'

export type NotesDb = HostDb

/**
 * Where a host keeps blobs (attached files), by owner and content ID. The
 * notes hold only the reference. Optional: without it, attaching is refused.
 */
export type BlobStore = {
  put: (did: string, cid: string, bytes: Uint8Array, mimeType: string) => Promise<void>
  get: (did: string, cid: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>
  delete?: (did: string, cid: string) => Promise<void>
}

export type NotesHost = BaseHost & { blobs?: BlobStore }

const slot = defineHost<NotesHost>('Notes')

export const setNotesHost = slot.setHost
export const notesHost = slot.host
/** The host's database, looked up on each use, so modules can import it before the host is set. */
export const db: NotesDb = slot.db
