/**
 * Last practice date per daily activity, for the "not done today" nav dots.
 *
 * Returns the stored LOCAL dates and leaves the "is that today?" comparison to
 * the browser, which is the authority on the user's timezone (see lib/streak).
 * Signed out answers 200 with signedIn: false — the dots simply stay hidden.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { activityStreaks } from '@/db/schema/janki'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ signedIn: false, lastDates: {} })

  const rows = await db
    .select({ activity: activityStreaks.activity, lastDate: activityStreaks.lastStudyDate })
    .from(activityStreaks)
    .where(eq(activityStreaks.ownerUid, session.user.id))

  const lastDates: Record<string, string> = {}
  for (const r of rows) lastDates[r.activity] = r.lastDate
  return NextResponse.json({ signedIn: true, lastDates })
}
