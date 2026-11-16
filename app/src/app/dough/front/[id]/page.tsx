import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { doughView } from '@/lib/dough/view'
import FrontWorkspace from './FrontWorkspace'

export const metadata: Metadata = { title: 'Dough' }
export const dynamic = 'force-dynamic'

export default async function FrontPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { id } = await params
  let view
  try {
    view = await doughView(session.user.id)
  } catch (err) {
    return (
      <p className="mx-auto max-w-2xl px-4 py-10 text-sm text-amber-900">
        The fronts live in the note dough.org. {err instanceof Error ? err.message : ''}
      </p>
    )
  }
  return <FrontWorkspace initial={view} frontId={id} />
}
