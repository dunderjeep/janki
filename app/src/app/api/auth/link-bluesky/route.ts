import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { authAccounts } from '@/db/schema/auth'
import { authenticateBluesky } from '@/lib/bluesky'

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { handle, appPassword } = (await req.json()) as {
    handle?: string
    appPassword?: string
  }
  if (!handle?.trim() || !appPassword) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
  }

  const atSession = await authenticateBluesky(handle.trim().toLowerCase(), appPassword)
  if (!atSession) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
  }

  const { did } = atSession

  // Check if this DID is already linked to any account.
  const existing = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(and(eq(authAccounts.provider, 'bluesky'), eq(authAccounts.providerAccountId, did)))
    .limit(1)

  if (existing.length > 0) {
    if (existing[0].userId === session.user.id) {
      return NextResponse.json({ error: 'already_linked_self' }, { status: 409 })
    }
    return NextResponse.json({ error: 'already_linked_other' }, { status: 409 })
  }

  await db.insert(authAccounts).values({
    userId: session.user.id,
    type: 'credentials',
    provider: 'bluesky',
    providerAccountId: did,
  })

  return NextResponse.json({ ok: true, handle: atSession.handle, did })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { did } = (await req.json()) as { did?: string }
  if (!did) return NextResponse.json({ error: 'missing_did' }, { status: 400 })

  await db
    .delete(authAccounts)
    .where(
      and(
        eq(authAccounts.provider, 'bluesky'),
        eq(authAccounts.providerAccountId, did),
        eq(authAccounts.userId, session.user.id)
      )
    )

  return NextResponse.json({ ok: true })
}
