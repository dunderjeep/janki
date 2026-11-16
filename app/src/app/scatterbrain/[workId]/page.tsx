import type { Metadata } from 'next'
import { auth } from '@/auth'
import { notFound } from 'next/navigation'
import { PorcupinError } from '@/lib/porcupin/store'
import { loadWork } from '@/lib/scatterbrain/store'
import Workspace from '../Workspace'

export const metadata: Metadata = { title: 'Scatterbrain' }
export const dynamic = 'force-dynamic'

export default async function WorkPage({ params }: { params: Promise<{ workId: string }> }) {
  const session = await auth()
  const { workId } = await params
  try {
    return <Workspace key={workId} initial={await loadWork(session!.user.id, workId)} />
  } catch (err) {
    if (err instanceof PorcupinError && err.status === 404) notFound()
    throw err
  }
}
