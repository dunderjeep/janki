/**
 * Running servers — what is listening on a TCP port, and a way to stop it.
 *
 * Answers "which of these did I start, and where?" without hunting through
 * terminals. Localhost only: the API route refuses non-loopback callers and
 * will not signal a process owned by another user, pid 1, or the server
 * rendering this page.
 */

import type { Metadata } from 'next'
import ServerList from './ServerList'

export const metadata: Metadata = { title: 'Running servers' }
export const dynamic = 'force-dynamic'

export default function ServersPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-100">Running servers</h1>
      <p className="mt-1 mb-6 max-w-2xl text-sm text-gray-400">
        Every process listening on a TCP port, owned by you. Processes that cannot
        safely be stopped — this server, its parent, and anything belonging to
        another user — are listed but not stoppable.
      </p>
      <ServerList />
    </main>
  )
}
