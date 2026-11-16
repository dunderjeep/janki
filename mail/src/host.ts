/**
 * The host: what Mail needs from the app it runs inside.
 *
 * Besides the database and who is asking, Mail needs a key to keep mailbox
 * passwords encrypted at rest. `send` is optional: a host with lists of its
 * own (janki: Next) turns an email into an item there; without it, those
 * buttons are not shown.
 */
import { defineHost, type BaseHost, type HostDb } from '@janki/app-kit/host'

export type MailDb = HostDb

/**
 * Where an email can be sent: the host's own lists. janki offers "task" (a
 * task in Next) and "inbox" (Next's inbox, to decide later).
 */
export type SendTarget = { key: string; label: string }

export type Send = {
  targets: SendTarget[]
  /** `when`: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM", to hold it until then, if the target can. */
  put: (uid: string, target: string, item: { title: string; body: string; when?: string }) => Promise<void>
}

export type MailHost = BaseHost & {
  /** 32 bytes for AES-256-GCM. Change it and every saved password must be entered again. */
  secretKey: () => Uint8Array
  send?: Send
}

const slot = defineHost<MailHost>('Mail')

export const setMailHost = slot.setHost
export const mailHost = slot.host
export const db: MailDb = slot.db
