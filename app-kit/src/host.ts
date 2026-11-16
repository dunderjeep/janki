/**
 * The host: what a janki app needs from whatever it runs inside.
 *
 * An app runs embedded in a shell (janki, with its Postgres and sign-in) or on
 * its own (one person, PGlite, no sign-in). Each host calls the app's setHost()
 * once at start-up, and nothing else in the app knows which host it is in.
 *
 * Every host gives an app at least a database and a way to know who is asking.
 * An app can ask for more by widening BaseHost with optional slots, as
 * NutriLabel does with `recipes`. A host that can't fill a slot leaves it out,
 * and the app drops the feature. The code that fills a slot from another app's
 * data lives in the shell's adapter, never inside either app.
 */
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'

/**
 * Typed as node-postgres so raw queries come back as `{ rows }`. PGlite's
 * results have the same shape, so a standalone host passes its database as this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HostDb = PgDatabase<NodePgQueryResultHKT, any>

export type BaseHost = {
  /** A Drizzle database holding the app's own schema: node-postgres, PGlite, … */
  db: HostDb
  /** The signed-in user's id, or null when nobody is. A single-user host returns a constant. */
  userId: () => Promise<string | null>
}

export type HostSlot<H extends BaseHost> = {
  /** Called once by each host at start-up. */
  setHost: (host: H) => void
  /** The host, or a thrown error naming the app when none was set. */
  host: () => H
  /**
   * The host's database, usable like any Drizzle instance. It is looked up on
   * each use, so modules can import it before the host has been set.
   */
  db: HostDb
}

/**
 * Makes an app's host slot. `name` is how errors refer to the app ("Joblowski").
 *
 * The host is kept on globalThis because a Next server can load a module more
 * than once (instrumentation, each route bundle), and every copy must see the
 * same host.
 */
export function defineHost<H extends BaseHost>(name: string): HostSlot<H> {
  const key = Symbol.for(`janki.host.${name}`)
  const store = globalThis as unknown as Record<symbol, H | undefined>

  const host = (): H => {
    const h = store[key]
    if (!h) throw new Error(`${name} has no host: call its setHost before using it`)
    return h
  }

  const db = new Proxy({} as HostDb, {
    get(_target, prop) {
      const real = host().db as unknown as Record<PropertyKey, unknown>
      const value = real[prop]
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value
    },
  })

  return { setHost: (h) => { store[key] = h }, host, db }
}
