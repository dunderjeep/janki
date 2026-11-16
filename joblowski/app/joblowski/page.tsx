import type { Metadata } from 'next'
import { LOCAL_USER, ready } from '../../standalone/host'
import { joblowskiPageData } from 'joblowski/server'
import { JoblowskiApp } from 'joblowski/ui'

export const metadata: Metadata = { title: 'Joblowski' }
export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ready()
  const [data, { tab }] = await Promise.all([joblowskiPageData(LOCAL_USER), searchParams])
  return <JoblowskiApp initialTab={tab} {...data} />
}
