/**
 * The host: what Joblowski needs from the app it runs inside.
 *
 * Joblowski runs embedded in a larger app (janki) and on its own on a desktop.
 * Each host calls setJoblowskiHost() once at start-up with its database and a way
 * to know who is asking; nothing else in Joblowski knows which host it is in.
 * The mechanics are shared with every janki app, in @janki/app-kit.
 */
import { defineHost, type BaseHost, type HostDb } from '@janki/app-kit/host'

/** A Drizzle database holding the `joblowski` schema: node-postgres, PGlite, … */
export type JoblowskiDb = HostDb

export type JoblowskiHost = BaseHost

const slot = defineHost<JoblowskiHost>('Joblowski')

export const setJoblowskiHost = slot.setHost
export const joblowskiHost = slot.host
/** The host's database, looked up on each use, so modules can import it before the host is set. */
export const db: JoblowskiDb = slot.db
