/**
 * Joblowski's server side, for a host app: set the host, load a page's data,
 * start the alert timer. The HTTP API is in 'joblowski/api'.
 */
export { setJoblowskiHost, joblowskiHost, type JoblowskiHost, type JoblowskiDb } from './host'
export { startAlertTimer } from './lib/scheduler'
export { getDocument, JoblowskiError, listApplications, listBoards, listDocuments, wakeParked } from './lib/store'
export { listSaved, newHits, unseenCount } from './lib/search'

import { listSaved, newHits } from './lib/search'
import { listApplications, listBoards, listDocuments } from './lib/store'

/** Everything the main Joblowski page starts with, for one user. */
export async function joblowskiPageData(uid: string) {
  const [initialApplications, initialDocuments, initialSaved, initialHits, initialBoards] = await Promise.all([
    listApplications(uid),
    listDocuments(uid),
    listSaved(uid),
    newHits(uid),
    listBoards(uid),
  ])
  return { initialApplications, initialDocuments, initialSaved, initialHits, initialBoards }
}
