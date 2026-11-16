import { db } from '@/db'
import { quiltPositions } from '@/db/schema/janki'
import { eq, and } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

export type Position = {
  orgId: string
  x: number
  y: number
  pinned: boolean
  /** Radians around the centre. Null on rows written before polar placement. */
  angle: number | null
  /** Fraction across the placed ring's band: 0 inner edge, 1 outer. */
  bandT: number | null
  placedRing: number | null
}

export async function getPositions(ownerUid: string): Promise<Position[]> {
  const rows = await db
    .select({
      orgId: quiltPositions.orgId,
      x: quiltPositions.x,
      y: quiltPositions.y,
      pinned: quiltPositions.pinned,
      angle: quiltPositions.angle,
      bandT: quiltPositions.bandT,
      placedRing: quiltPositions.placedRing,
    })
    .from(quiltPositions)
    .where(eq(quiltPositions.ownerUid, ownerUid))
  return rows
}

/**
 * Upsert a batch of positions.
 *
 * Batched because the canvas flushes a drag queue rather than writing per
 * pointer event — dragging a cluster moves every node in it at once.
 */
export async function savePositions(ownerUid: string, positions: Position[]): Promise<void> {
  if (positions.length === 0) return
  await db
    .insert(quiltPositions)
    .values(positions.map(p => ({
      ownerUid,
      orgId: p.orgId,
      x: p.x,
      y: p.y,
      pinned: p.pinned,
      angle: p.angle,
      bandT: p.bandT,
      placedRing: p.placedRing,
    })))
    .onConflictDoUpdate({
      target: [quiltPositions.ownerUid, quiltPositions.orgId],
      set: {
        x: sql`excluded.x`,
        y: sql`excluded.y`,
        pinned: sql`excluded.pinned`,
        angle: sql`excluded.angle`,
        bandT: sql`excluded.band_t`,
        placedRing: sql`excluded.placed_ring`,
        updatedAt: new Date(),
      },
    })
}

export async function clearPosition(ownerUid: string, orgId: string): Promise<void> {
  await db.delete(quiltPositions)
    .where(and(eq(quiltPositions.ownerUid, ownerUid), eq(quiltPositions.orgId, orgId)))
}
