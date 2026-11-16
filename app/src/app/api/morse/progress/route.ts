/**
 * Koch trainer progress — level, per-letter accuracy, and the daily streak.
 *
 * /radio is deliberately NOT behind the auth middleware, so the trainer has to
 * keep working signed out. Both verbs answer 200 with `signedIn: false` rather
 * than 401 in that case: a signed-out visitor is a normal state, not an error,
 * and the client falls back to localStorage without a console full of failures.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { activityStreaks, morseProgress } from '@/db/schema/janki'
import type { LetterAccuracy } from '@/db/schema/janki'
import { and, eq } from 'drizzle-orm'
import { advanceStreak, resolveLocalDate, isDateString } from '@/lib/streak'

const SIGNED_OUT = { signedIn: false as const, progress: null, streak: null }

/** Coerce untrusted JSON into the accuracy map, dropping anything malformed. */
function cleanAccuracy(raw: unknown): Record<string, LetterAccuracy> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, LetterAccuracy> = {}
  for (const [ch, v] of Object.entries(raw as Record<string, unknown>)) {
    // Koch alphabet only — one character, and never an unbounded key space.
    if (!/^[A-Z0-9.,?/]$/.test(ch)) continue
    if (!v || typeof v !== 'object') continue
    const { hits, total } = v as { hits?: unknown; total?: unknown }
    if (typeof hits !== 'number' || typeof total !== 'number') continue
    if (!Number.isFinite(hits) || !Number.isFinite(total) || hits < 0 || total < 0) continue
    out[ch] = { hits: Math.floor(hits), total: Math.floor(total) }
  }
  return out
}

function clampLevel(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0
  return Math.min(Math.max(n, 0), 40)
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(SIGNED_OUT)
  const uid = session.user.id

  const [progress, streak] = await Promise.all([
    db.select().from(morseProgress).where(eq(morseProgress.ownerUid, uid)).limit(1),
    db
      .select()
      .from(activityStreaks)
      .where(and(eq(activityStreaks.ownerUid, uid), eq(activityStreaks.activity, 'morse')))
      .limit(1),
  ])

  const row = progress[0]
  const s = streak[0]

  return NextResponse.json({
    signedIn: true,
    // null (not a zeroed row) means "never synced" — the client reads that as
    // permission to seed from whatever localStorage still holds.
    progress: row ? { kochLevel: row.kochLevel, letterAccuracy: row.letterAccuracy } : null,
    streak: s
      ? { count: s.streakCount, longest: s.longestStreak, lastDate: s.lastStudyDate }
      : null,
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(SIGNED_OUT)
  const uid = session.user.id

  const body = (await req.json()) as {
    kochLevel?: unknown
    letterAccuracy?: unknown
    localDate?: unknown
    /** true after a finished session — the only thing that moves a streak. */
    practiced?: boolean
    /** Seeding from localStorage: never overwrite what the DB already holds. */
    seed?: boolean
    /** Seed only: the streak localStorage was carrying. */
    seedStreak?: { lastDate?: unknown; count?: unknown }
  }

  const kochLevel = clampLevel(body.kochLevel)
  const letterAccuracy = cleanAccuracy(body.letterAccuracy)
  const today = resolveLocalDate(body.localDate)

  const result = await db.transaction(async (tx) => {
    // ── Progress ──────────────────────────────────────────────────────────
    if (body.seed) {
      await tx
        .insert(morseProgress)
        .values({ ownerUid: uid, kochLevel, letterAccuracy })
        .onConflictDoNothing({ target: morseProgress.ownerUid })
    } else {
      await tx
        .insert(morseProgress)
        .values({ ownerUid: uid, kochLevel, letterAccuracy })
        .onConflictDoUpdate({
          target: morseProgress.ownerUid,
          set: { kochLevel, letterAccuracy, updatedAt: new Date() },
        })
    }

    // ── Streak ────────────────────────────────────────────────────────────
    const [existing] = await tx
      .select()
      .from(activityStreaks)
      .where(and(eq(activityStreaks.ownerUid, uid), eq(activityStreaks.activity, 'morse')))
      .limit(1)

    if (body.seed) {
      // Import the localStorage streak, but only if the DB has none. A stored
      // date that isn't a real date is dropped rather than trusted.
      const count = typeof body.seedStreak?.count === 'number' ? Math.max(0, Math.floor(body.seedStreak.count)) : 0
      const lastDate = isDateString(body.seedStreak?.lastDate) ? body.seedStreak.lastDate : ''
      if (!existing && count > 0 && lastDate) {
        await tx.insert(activityStreaks).values({
          ownerUid: uid,
          activity: 'morse',
          streakCount: count,
          longestStreak: count,
          lastStudyDate: lastDate,
        })
        return { count, longest: count, lastDate }
      }
    } else if (body.practiced) {
      const next = advanceStreak(existing ?? null, today)
      await tx
        .insert(activityStreaks)
        .values({
          ownerUid: uid,
          activity: 'morse',
          streakCount: next.streakCount,
          longestStreak: next.longestStreak,
          lastStudyDate: next.lastStudyDate,
        })
        .onConflictDoUpdate({
          target: [activityStreaks.ownerUid, activityStreaks.activity],
          set: {
            streakCount: next.streakCount,
            longestStreak: next.longestStreak,
            lastStudyDate: next.lastStudyDate,
            updatedAt: new Date(),
          },
        })
      return { count: next.streakCount, longest: next.longestStreak, lastDate: next.lastStudyDate }
    }

    return existing
      ? { count: existing.streakCount, longest: existing.longestStreak, lastDate: existing.lastStudyDate }
      : null
  })

  return NextResponse.json({
    signedIn: true,
    progress: { kochLevel, letterAccuracy },
    streak: result,
  })
}
