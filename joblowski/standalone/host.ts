/**
 * Joblowski on its own: one person, one computer, PGlite on disk, no sign-in.
 * The server listens on 127.0.0.1 only (see package.json). The database and
 * its migrations are opened by @janki/app-kit, the same way for every app.
 *
 * Imported for its side effect by every server entry of the standalone app.
 */
import os from 'node:os'
import path from 'node:path'
import { openLocal } from '@janki/app-kit/standalone'
import { setJoblowskiHost, type JoblowskiDb } from '../src/host'

export { LOCAL_USER } from '@janki/app-kit/standalone'

/** Where the database lives: JOBLOWSKI_DATA_DIR, or ~/.joblowski. The desktop app passes its own. */
export const DATA_DIR = process.env.JOBLOWSKI_DATA_DIR ?? path.join(os.homedir(), '.joblowski')

const local = openLocal({
  app: 'joblowski',
  dataDir: DATA_DIR,
  migrationsDir: process.env.JOBLOWSKI_MIGRATIONS_DIR ?? path.join(process.cwd(), 'migrations'),
})

/** Resolves once the database is open and up to date. Pages await it before reading. */
export const ready = local.ready

setJoblowskiHost({ db: local.db as JoblowskiDb, userId: local.userId })
