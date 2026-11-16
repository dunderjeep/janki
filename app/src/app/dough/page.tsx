import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { doughView, type DoughView } from '@/lib/dough/view'
import DoughApp from './DoughApp'

export const metadata: Metadata = { title: 'Dough' }
export const dynamic = 'force-dynamic'

export default async function DoughPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  let view: DoughView | null = null
  let error: string | null = null
  try {
    view = await doughView(session!.user.id)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }
  return <DoughApp initial={view} initialError={error} />
}
