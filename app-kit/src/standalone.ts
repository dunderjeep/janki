/**
 * An app on its own: one person, one computer.
 *
 * The database is PGlite, real Postgres compiled to WebAssembly, kept in a
 * folder on disk, so there is nothing to install or run beside the app. There
 * is no sign-in: a standalone app listens on 127.0.0.1 only, and everything
 * belongs to the single local user.
 *
 * An app's standalone/host.ts calls openLocal() and passes the result to its
 * setHost(). The host app should list '@electric-sql/pglite' in
 * serverExternalPackages, because PGlite loads its WebAssembly at run time.
 */
import { readdir, readFile } from 'node:fs/promises'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { BaseHost, HostDb } from './host'

/** Every row is owned by this id; app schemas keep owner columns so a shell can share them. */
export const LOCAL_USER = 'local'

export type LocalOptions = {
  /** The app's id, also the prefix of its bookkeeping schema: `<app>_meta.migrations`. */
  app: string
  /** The folder the database lives in. Made if missing. */
  dataDir: string
  /** The folder of `*.sql` migrations, applied in name order. */
  migrationsDir: string
}

export type LocalHost = BaseHost & {
  /** Resolves once the database is open and up to date. Pages await it before reading. */
  ready: () => Promise<void>
}

type Local = { client: PGlite; ready: Promise<void> }

/** Applies each migration not applied yet, each in its own transaction. */
async function migrate(client: PGlite, { app, migrationsDir }: LocalOptions): Promise<void> {
  const meta = `${app}_meta`
  await client.exec(`
    CREATE SCHEMA IF NOT EXISTS ${meta};
    CREATE TABLE IF NOT EXISTS ${meta}.migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );`)
  const done = new Set((await client.query<{ name: string }>(`SELECT name FROM ${meta}.migrations`)).rows.map((r) => r.name))
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()
  for (const name of files) {
    if (done.has(name)) continue
    const sql = await readFile(path.join(migrationsDir, name), 'utf8')
    await client.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query(`INSERT INTO ${meta}.migrations (name) VALUES ($1)`, [name])
    })
    console.log(`[${app}] applied ${name}`)
  }
}

/**
 * Opens (once per process) the app's local database and brings it up to date.
 * PGlite must never open the same folder twice, so a second call returns the first.
 */
export function openLocal(options: LocalOptions): LocalHost {
  if (!/^[a-z][a-z0-9_]*$/.test(options.app)) throw new Error(`Not an app id: ${options.app}`)
  const key = Symbol.for(`janki.local.${options.app}`)
  const store = globalThis as unknown as Record<symbol, Local | undefined>

  const local = (store[key] ??= (() => {
    mkdirSync(options.dataDir, { recursive: true })
    const client = new PGlite(path.join(options.dataDir, 'db'))
    const ready = client.waitReady.then(() => migrate(client, options))
    ready.catch((err) => console.error(`[${options.app}] could not open the database:`, err))
    return { client, ready }
  })())

  return {
    // PGlite results come back as { rows }, like node-postgres, which is what app queries read.
    db: drizzle(local.client) as unknown as HostDb,
    // Every API call asks who the user is first, so waiting here means no query runs before the migrations.
    userId: async () => {
      await local.ready
      return LOCAL_USER
    },
    ready: () => local.ready,
  }
}
