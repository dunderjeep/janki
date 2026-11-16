/**
 * Drizzle ORM client — singleton pattern to survive Next.js hot-reload.
 *
 * One `pg` Pool for the whole app; Drizzle wraps it in its query builder,
 * and `db.execute(sql…)` covers the raw queries.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as jankiSchema from './schema/janki'
import * as authSchema from './schema/auth'
import * as bankiSchema from './schema/banki'
import * as bokkiSchema from './schema/bokki'
import * as porcupinSchema from './schema/porcupin'
import * as scatterbrainSchema from './schema/scatterbrain'
import * as joblowskiSchema from 'joblowski/schema'
import * as nutrilabelSchema from 'nutrilabel/schema'

declare global {
  // eslint-disable-next-line no-var
  var __drizzle: ReturnType<typeof buildDb> | undefined
}

function buildDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  pool.on('error', (err) => {
    console.error('[drizzle] Unexpected pool error:', err.message)
  })

  return drizzle(pool, {
    schema: { ...jankiSchema, ...authSchema, ...bankiSchema, ...bokkiSchema, ...porcupinSchema, ...scatterbrainSchema, ...joblowskiSchema, ...nutrilabelSchema },
    logger: process.env.NODE_ENV === 'development',
  })
}

function getDb() {
  if (!globalThis.__drizzle) {
    globalThis.__drizzle = buildDb()
  }
  return globalThis.__drizzle
}

export const db = getDb()
export type Db = typeof db

// Re-export everything so API routes can import types from one place
export * from './schema/janki'
export * from './schema/auth'
export * from './schema/banki'
export * from './schema/bokki'
export * from './schema/porcupin'
export * from './schema/scatterbrain'
export * from 'joblowski/schema'
export * from 'nutrilabel/schema'
