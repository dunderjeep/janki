import type { Metadata } from 'next'
import { auth } from '@/auth'
import { listWorks } from '@/lib/scatterbrain/store'
import WorksHome from './WorksHome'

export const metadata: Metadata = { title: 'Scatterbrain' }
export const dynamic = 'force-dynamic'

export default async function ScatterbrainPage() {
  const session = await auth()
  return <WorksHome works={await listWorks(session!.user.id)} />
}
