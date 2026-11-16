import type { Metadata } from 'next'
import { auth } from '@/auth'
import '@/lib/joblowskiHost'
import { joblowskiPageData } from 'joblowski/server'
import JankiJoblowski from './JankiJoblowski'

export const metadata: Metadata = { title: 'Joblowski' }
export const dynamic = 'force-dynamic'

export default async function JoblowskiPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth()
  const [data, { tab }] = await Promise.all([joblowskiPageData(session!.user.id), searchParams])
  return <JankiJoblowski initialTab={tab} {...data} />
}
