/**
 * janki as Joblowski's host: Joblowski uses janki's Postgres and its signed-in user.
 * Imported for its side effect by every entry into Joblowski (the API route, the
 * pages, the alert timer and Dough's job actions), so whichever runs first
 * sets the host.
 */
import { auth } from '@/auth'
import { db } from '@/db'
import { setJoblowskiHost } from 'joblowski/server'

setJoblowskiHost({
  db,
  userId: async () => (await auth())?.user?.id ?? null,
})
