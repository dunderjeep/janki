import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { didForUser, syncNotes } from '@/lib/notesHost'
import { readOrgGraph, assignRings } from '@/lib/orgRoam'
import { getPositions } from '@/lib/orgStore'

export const dynamic = 'force-dynamic'

/**
 * The whole note graph plus whatever layout has been saved for it.
 *
 * One request rather than three: the canvas cannot draw anything until it has
 * all of nodes, links and positions, and the payload is ~1200 nodes of title
 * and id, small enough that splitting it would only add round trips.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const did = await didForUser(session.user.id)
  if (!did) return NextResponse.json({ error: 'Link a Bluesky account to see your notes' }, { status: 403 })

  await syncNotes(did)
  const [{ nodes, links }, positions] = await Promise.all([readOrgGraph(did), getPositions(session.user.id)])
  const { rings, ages, routine, horizons } = await assignRings(did, nodes)

  return NextResponse.json({
    nodes: nodes.map(n => ({
      ...n,
      ring: rings.get(n.id) ?? 5,
      age: ages.get(n.id) ?? null,
      routine: routine.has(n.id),
    })),
    links,
    positions,
    horizons,
  })
}
