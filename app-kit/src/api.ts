/**
 * An app's HTTP API as one dispatcher. A host mounts it with one catch-all
 * route, e.g. app/api/notes/[...path]/route.ts:
 *
 *   export { GET, POST, PUT, PATCH, DELETE } from 'notes/api'
 *
 * Every call runs as the host's current user. An AppError becomes its HTTP
 * status with its message; anything else is logged and becomes a plain 500.
 */
import { NextResponse, type NextRequest } from 'next/server'
import type { BaseHost } from './host'

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** A refusal meant for the person using the app: its message is shown to them. */
export class AppError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export type RouteContext = {
  uid: string
  req: NextRequest
  /** Values for the :name parts of the pattern. */
  p: Record<string, string>
  /** The request's search parameters. */
  q: URLSearchParams
  body: () => Promise<Record<string, unknown>>
}

export type Route = [Method, string, (c: RouteContext) => Promise<Response | object>]

/** Matches 'notes/:rkey/org' against ['notes', 'abc', 'org']. */
function match(pattern: string, parts: string[]): Record<string, string> | null {
  const want = pattern.split('/')
  if (want.length !== parts.length) return null
  const p: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) p[want[i].slice(1)] = parts[i]
    else if (want[i] !== parts[i]) return null
  }
  return p
}

type RouteParams = { params: Promise<{ path?: string[] }> }

/** The five method handlers for a route table. `name` prefixes server logs. */
export function createApi(name: string, host: () => BaseHost, routes: Route[]) {
  const handler = (method: Method) => async (req: NextRequest, { params }: RouteParams): Promise<Response> => {
    const parts = ((await params).path ?? []).map(decodeURIComponent)
    let found: { run: Route[2]; p: Record<string, string> } | null = null
    let pathKnown = false
    for (const [m, pattern, run] of routes) {
      const p = match(pattern, parts)
      if (!p) continue
      pathKnown = true
      if (m === method) {
        found = { run, p }
        break
      }
    }
    if (!found) return NextResponse.json({ error: pathKnown ? 'Method not allowed' : 'Not found' }, { status: pathKnown ? 405 : 404 })

    const uid = await host().userId()
    if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    try {
      const body = async () => {
        const json = await req.json().catch(() => ({}))
        return json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
      }
      const result = await found.run({ uid, req, p: found.p, q: req.nextUrl.searchParams, body })
      return result instanceof Response ? result : NextResponse.json(result)
    } catch (err) {
      if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status })
      console.error(`[${name}]`, err)
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 })
    }
  }
  return {
    GET: handler('GET'), POST: handler('POST'), PUT: handler('PUT'), PATCH: handler('PATCH'), DELETE: handler('DELETE'),
  }
}
