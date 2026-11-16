import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/auth'
import { db } from '@/db'
import { authAccounts } from '@/db/schema/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const rows = await db
    .select({
      provider: authAccounts.provider,
      providerAccountId: authAccounts.providerAccountId,
    })
    .from(authAccounts)
    .where(eq(authAccounts.userId, session.user.id))

  return NextResponse.json(rows)
}
