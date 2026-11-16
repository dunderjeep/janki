/**
 * janki as Mail's host: janki's Postgres, its signed-in user, the key that
 * keeps mailbox passwords encrypted (MAIL_SECRET_KEY, 32 bytes in base64),
 * and Next as the place an email can be sent to: as a task (a TODO in Life,
 * with the email's text under it, held until a day if asked), or into Next's
 * inbox to be decided there.
 * Imported for its side effect by the Mail page and API, and the sync timer.
 */
import { auth } from '@/auth'
import { db } from '@/db'
import { getProperty, updateNoteAt } from 'notes/server'
import { capture, pathOf, snooze } from '@/lib/chains/gtd'
import { addHeading } from '@/lib/chains/notesChains'
import { didForUser } from '@/lib/notesHost'
import { setMailHost, type MailDb } from 'mail/server'

function secretKey(): Uint8Array {
  const raw = process.env.MAIL_SECRET_KEY
  const key = raw ? Buffer.from(raw, 'base64') : null
  if (!key || key.length !== 32) throw new Error('Set MAIL_SECRET_KEY to 32 random bytes in base64 (openssl rand -base64 32)')
  return key
}

setMailHost({
  db: db as unknown as MailDb,
  userId: async () => (await auth())?.user?.id ?? null,
  secretKey,
  send: {
    targets: [{ key: 'task', label: 'Task in Next' }, { key: 'inbox', label: 'Next inbox' }],
    put: async (uid, target, item) => {
      const did = await didForUser(uid)
      if (!did) throw new Error('Link a Bluesky account to use Next')
      if (target === 'inbox') {
        await capture(did, item.title, item.body)
        return
      }
      const path = pathOf('life')
      const id = await addHeading(did, path, null, 'last', item.title, 'TODO')
      await updateNoteAt(did, path, (note) => {
        const h = note.headings.find((x) => getProperty(x, 'CHAIN_ID') === id)
        // Indented, so a line of the email that starts "* " stays text, not a new heading.
        if (h) h.body = item.body.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')
      })
      if (item.when) await snooze(did, 'life', id, item.when)
    },
  },
})
